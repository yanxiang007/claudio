import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { config } from './config.js';
import { UserProfileStore } from './storage/user-profile.js';
import { DJMemoryStore } from './storage/dj-memory.js';
import { PlayQueue } from './play-queue.js';
import { WeatherClient } from './adapters/weather.js';
import { NeteaseClient } from './adapters/netease.js';
import { FishAudioClient } from './adapters/fish-audio.js';
import { createDJBrain } from './adapters/dj-brain.js';
import { ContextBuilder } from './context-builder.js';
import { EventBus } from './event-bus.js';
import { Orchestrator } from './orchestrator.js';
import { trackRoutes } from './routes/track.js';
import { chatRoutes } from './routes/chat.js';
import { likeRoutes } from './routes/like.js';
import { eventsRoute } from './routes/events.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  mkdirSync(config.audioCacheDir, { recursive: true });

  const profile = new UserProfileStore(config.dataDir);
  const djMemory = new DJMemoryStore(config.dataDir);
  const queue = new PlayQueue();
  const weather = new WeatherClient(config.openWeatherKey, config.city);
  const music = new NeteaseClient(config.netease.clientId, config.netease.clientSecret, config.netease.refreshToken);
  const tts = new FishAudioClient(config.fishAudio.apiKey, config.fishAudio.voiceId, config.audioCacheDir, config.fishAudio.model);
  const brain = await createDJBrain(config.llm);
  const context = new ContextBuilder(profile, weather, djMemory);
  const bus = new EventBus();
  const orch = new Orchestrator(queue, context, brain, music, tts, profile, djMemory, bus);

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

  await app.listen({ host: '127.0.0.1', port: config.port });
  console.log(`Claudio on http://localhost:${config.port}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
