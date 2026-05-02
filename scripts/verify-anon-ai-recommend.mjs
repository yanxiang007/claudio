import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { config } from '../dist/config.js';
import { NeteaseTokenStore } from '../dist/storage/netease-tokens.js';
import { NeteaseSigner } from '../dist/adapters/netease-sign.js';
import { NeteaseAuth } from '../dist/adapters/netease-auth.js';
import { NeteaseClient } from '../dist/adapters/netease.js';
import { NeteaseCliClient } from '../dist/adapters/netease-cli.js';
import { createDJBrain } from '../dist/adapters/dj-brain.js';
import { ContextBuilder } from '../dist/context-builder.js';
import { UserProfileStore } from '../dist/storage/user-profile.js';
import { DJMemoryStore } from '../dist/storage/dj-memory.js';
import { WeatherClient } from '../dist/adapters/weather.js';

function printTrack(prefix, track) {
  console.log(`${prefix} ${track.title} - ${track.artist} (${track.id})`);
  console.log(`   url: ${track.url ? 'ok' : 'missing'}`);
}

async function pickTrack(music, decision, lastTrack) {
  const tries = [];
  const next = decision.nextTrack ?? { source: 'recommend', hint: '' };
  if (next.source === 'search' && next.hint) tries.push(['search', () => music.search(next.hint, 5)]);
  if (next.source === 'similar' && lastTrack?.id) tries.push(['similar', () => music.similar(lastTrack.id, 5)]);
  tries.push(['recommend', () => music.recommend(10)]);

  for (const [label, fn] of tries) {
    try {
      const list = await fn();
      console.log(`[music] ${label} returned ${list.length} candidates`);
      for (const cand of list) {
        const url = cand.url || await music.getUrl(cand.id);
        if (url) return { ...cand, url, sourceLabel: label };
      }
    } catch (e) {
      console.error(`[music] ${label} failed:`, e.message);
    }
  }
  return null;
}

mkdirSync(config.dataDir, { recursive: true });

let musicReady = false;
let music;

if (config.netease.backend === 'cli') {
  music = new NeteaseCliClient({ command: config.netease.cliCommand, args: config.netease.cliArgs });
  musicReady = true;
  console.log(`[auth] using ncm-cli backend: ${[config.netease.cliCommand, ...config.netease.cliArgs].join(' ')}`);
} else {
  const tokens = new NeteaseTokenStore(config.dataDir);
  tokens.clearUser();

  const signer = new NeteaseSigner({
    appId: config.netease.appId,
    appSecret: config.netease.appSecret,
    privateKeyPath: config.netease.privateKeyPath,
    device: config.netease.device
  });
  const auth = new NeteaseAuth(signer, tokens, config.netease.appId, config.netease.appSecret, {
    redirectUrl: config.netease.redirectUrl,
    clientType: config.netease.clientType
  });
  music = new NeteaseClient(signer, auth);

  console.log('[auth] requesting anonymous token...');
  try {
    const anon = await auth.ensureAnonToken();
    musicReady = true;
    console.log(`[auth] anonymous token ok (${anon.length} chars)`);
  } catch (e) {
    console.error('[auth] anonymous token failed:', e.message);
    console.error('[auth] continuing with LLM-only recommendation decision');
  }
}

const profile = new UserProfileStore(config.dataDir);
const djMemory = new DJMemoryStore(config.dataDir);
const weather = new WeatherClient(config.openWeatherKey, config.city);
const context = new ContextBuilder(profile, weather, djMemory);
const brain = await createDJBrain(config.llm);

const ctx = await context.build({ lastTrack: null });
console.log(`[ctx] listener=${ctx.profile.name}; taste=${ctx.profile.musicTaste || '(empty)'}`);

console.log('[llm] asking DJ brain to decide the next track...');
const decision = await brain.decide(ctx);
console.log('[llm] decision:', JSON.stringify(decision, null, 2));

if (!musicReady) {
  console.error('[result] skipped NetEase recommendation because music backend is not ready');
  process.exitCode = 1;
} else {
  const track = await pickTrack(music, decision, null);
  if (!track) {
  console.error('[result] no playable track found');
  process.exitCode = 1;
  } else {
  console.log(`[result] picked via ${track.sourceLabel}`);
  printTrack('[track]', track);
  }
}
