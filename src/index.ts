import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { config } from './config.js';
import { UserProfileStore } from './storage/user-profile.js';
import { DJMemoryStore } from './storage/dj-memory.js';
import { SessionLogStore } from './storage/session-log.js';
import { NeteaseTokenStore } from './storage/netease-tokens.js';
import { PlayQueue } from './play-queue.js';
import { WeatherClient } from './adapters/weather.js';
import { NeteaseSigner } from './adapters/netease-sign.js';
import { NeteaseAuth } from './adapters/netease-auth.js';
import { NeteaseClient } from './adapters/netease.js';
import { NeteaseCliClient } from './adapters/netease-cli.js';
import { NeteaseUnofficialClient } from './adapters/netease-unofficial.js';
import type { MusicSource } from './adapters/netease.js';
import { FishAudioClient } from './adapters/fish-audio.js';
import { createDJBrain } from './adapters/dj-brain.js';
import { ContextBuilder } from './context-builder.js';
import { EventBus } from './event-bus.js';
import { Orchestrator } from './orchestrator.js';
import { trackRoutes } from './routes/track.js';
import { chatRoutes } from './routes/chat.js';
import { likeRoutes } from './routes/like.js';
import { eventsRoute } from './routes/events.js';
import { neteaseAuthRoutes } from './routes/netease-auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  mkdirSync(config.audioCacheDir, { recursive: true });
  mkdirSync(config.dataDir, { recursive: true });

  const profile = new UserProfileStore(config.dataDir);
  const djMemory = new DJMemoryStore(config.dataDir);
  const sessionLog = new SessionLogStore(join(config.dataDir, 'sessions'));
  const queue = new PlayQueue();
  const weather = new WeatherClient(config.openWeatherKey, config.city);

  let music: MusicSource;
  let auth: NeteaseAuth | null = null;
  if (config.netease.backend === 'unofficial') {
    music = new NeteaseUnofficialClient({
      cookie: config.netease.cookie,
      favoritePlaylistId: config.netease.favoritePlaylistId
    });
    console.log('[netease] 使用 NeteaseCloudMusicApi 个人本地 Web 播放后端');
  } else if (config.netease.backend === 'cli') {
    music = new NeteaseCliClient({ command: config.netease.cliCommand, args: config.netease.cliArgs });
    console.log(`[netease] 使用官方 CLI 后端: ${[config.netease.cliCommand, ...config.netease.cliArgs].join(' ')}`);
    console.log('[netease] 首次使用请先运行: ncm-cli configure && ncm-cli login');
  } else {
    const tokens = new NeteaseTokenStore(config.dataDir);
    const signer = new NeteaseSigner({
      appId: config.netease.appId,
      appSecret: config.netease.appSecret,
      privateKeyPath: config.netease.privateKeyPath,
      device: config.netease.device
    });
    auth = new NeteaseAuth(signer, tokens, config.netease.appId, config.netease.appSecret, {
      redirectUrl: config.netease.redirectUrl,
      clientType: config.netease.clientType
    });

    if (!tokens.getUser()) {
      console.log('[netease] 未登录用户账号，使用匿名 token（拿不到个人化推荐 / 收藏）。');
      console.log(`[netease] Web 授权登录入口: http://localhost:${config.port}/auth/netease/login`);
    } else {
      await auth.ensureUserToken().catch((e) => {
        console.warn('[netease] 用户 token 刷新失败，播放时将尝试匿名 token:', (e as Error).message);
      });
    }

    music = new NeteaseClient(signer, auth);
  }
  const tts = new FishAudioClient(config.fishAudio.apiKey, config.fishAudio.voiceId, config.audioCacheDir, config.fishAudio.model);
  const brain = await createDJBrain(config.llm);
  const context = new ContextBuilder(profile, weather, djMemory);
  const bus = new EventBus();
  await sessionLog.record({
    type: 'session-started',
    payload: {
      llmProvider: config.llm.provider,
      neteaseBackend: config.netease.backend,
      city: config.city
    }
  });
  const orch = new Orchestrator(queue, context, brain, music, tts, profile, djMemory, bus, sessionLog);

  const app = Fastify({ logger: true });

  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'public'),
    prefix: '/'
  });
  await app.register(fastifyStatic, {
    root: join(process.cwd(), config.audioCacheDir),
    prefix: '/audio-cache/',
    decorateReply: false
  });

  trackRoutes(app, orch);
  chatRoutes(app, orch);
  likeRoutes(app, profile);
  eventsRoute(app, bus);
  if (auth) neteaseAuthRoutes(app, auth);

  await app.listen({ host: '127.0.0.1', port: config.port });
  console.log(`Claudio on http://localhost:${config.port}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
