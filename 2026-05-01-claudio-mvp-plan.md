# Claudio MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal AI radio that plays NetEase music with a Claude-powered DJ doing British-voiced late-night monologues, running entirely on localhost.

**Architecture:** Single Node.js (TypeScript + Fastify) service orchestrates Claude (DJ brain), NetEase Open Platform (music source), Fish Audio (TTS), and OpenWeather. PWA frontend (vanilla JS, no framework) plays audio and chats via HTTP + SSE.

**Tech Stack:** Node.js 20+, TypeScript, Fastify, `@anthropic-ai/sdk`, axios, Vitest, native PWA (HTML/CSS/JS + Service Worker).

---

## File Structure

```
claudio/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── vitest.config.ts
├── src/
│   ├── index.ts                  # entrypoint, boots Fastify + Orchestrator
│   ├── config.ts                 # loads .env, typed config
│   ├── types.ts                  # shared types: Track, Context, DJDecision, etc
│   ├── orchestrator.ts           # core scheduling logic
│   ├── context-builder.ts        # assembles prompt context
│   ├── event-bus.ts              # SSE pub/sub
│   ├── play-queue.ts             # queue + history state machine
│   ├── adapters/
│   │   ├── claude.ts             # DJBrain — Claude API
│   │   ├── netease.ts            # MusicSource — NetEase Open Platform
│   │   ├── fish-audio.ts         # TTSEngine — Fish Audio
│   │   └── weather.ts            # OpenWeather
│   ├── storage/
│   │   ├── user-profile.ts       # profile.json, history.json, favorites.json
│   │   └── dj-memory.ts          # dj-memory.json
│   └── routes/
│       ├── track.ts              # /track/ending, /track/skip
│       ├── chat.ts               # /chat
│       ├── like.ts               # /like
│       └── events.ts             # /events (SSE)
├── tests/
│   ├── play-queue.test.ts
│   ├── context-builder.test.ts
│   ├── claude-parse.test.ts
│   ├── user-profile.test.ts
│   └── integration/
│       └── full-loop.test.ts
├── public/
│   ├── index.html                # PWA shell
│   ├── style.css
│   ├── manifest.json
│   ├── sw.js                     # service worker
│   └── js/
│       ├── app.js                # bootstrap
│       ├── player.js             # HTML5 Audio + queue glue
│       ├── dj-bubble.js          # DJ speech UI
│       ├── chat-box.js           # input box
│       └── event-client.js       # SSE listener
├── data/                         # gitignored, runtime state
│   ├── profile.json              # user-edited
│   ├── history.json
│   ├── favorites.json
│   ├── dj-memory.json
│   └── audio-cache/
└── 2026-05-01-claudio-mvp-design.md
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `vitest.config.ts`

- [ ] **Step 1: Initialize package.json**

Create `package.json`:
```json
{
  "name": "claudio",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "axios": "^1.7.0",
    "dotenv": "^16.4.0",
    "fastify": "^5.0.0",
    "@fastify/static": "^8.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules
dist
data/
.env
*.log
```

- [ ] **Step 4: Create .env.example**

```
ANTHROPIC_API_KEY=
NETEASE_CLIENT_ID=
NETEASE_CLIENT_SECRET=
NETEASE_REFRESH_TOKEN=
FISH_AUDIO_API_KEY=
FISH_AUDIO_VOICE_ID=
OPENWEATHER_API_KEY=
CITY=Hangzhou
PORT=3000
```

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globals: true, environment: 'node' }
});
```

- [ ] **Step 6: Install and commit**

Run: `npm install`
Expected: `node_modules/` populated, no errors.

```bash
git init
git add package.json tsconfig.json .gitignore .env.example vitest.config.ts
git commit -m "chore: project scaffold"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Define core types**

Create `src/types.ts`:
```typescript
export interface Track {
  id: string;          // netease song id, or 'tts:<hash>' for DJ speech
  title: string;
  artist: string;
  url: string;         // playable URL
  durationMs: number;
  source: 'netease' | 'tts';
}

export interface HistoryEntry {
  trackId: string;
  title: string;
  artist: string;
  playedAt: string;    // ISO timestamp
  liked: boolean;
  skipped: boolean;
}

export interface UserProfile {
  name: string;
  bio: string;
  musicTaste: string;
  vibes: string;
}

export interface ContextBundle {
  time: string;
  weather: { description: string; tempC: number } | null;
  lastTrack: { title: string; artist: string } | null;
  recentHistory: HistoryEntry[];          // last 5
  recentDJScripts: string[];               // last 3
  profile: UserProfile;
  userMessage?: string;
}

export interface DJDecision {
  shouldSpeak: boolean;
  script: string | null;
  nextTrack: {
    source: 'favorites' | 'similar' | 'recommend' | 'search';
    hint: string;
  };
}

export interface ChatResponse {
  intent: 'play' | 'chat';
  reply: string;
  query?: string;        // when intent=play
}

export type SSEEvent =
  | { type: 'track-changed'; track: Track }
  | { type: 'dj-speaking'; audioUrl: string | null; text: string }
  | { type: 'dj-finished' }
  | { type: 'queue-update'; queue: Track[] };
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: shared types"
```

---

## Task 3: Config Loader

**Files:**
- Create: `src/config.ts`

- [ ] **Step 1: Write config loader**

Create `src/config.ts`:
```typescript
import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const config = {
  anthropicKey: required('ANTHROPIC_API_KEY'),
  netease: {
    clientId: required('NETEASE_CLIENT_ID'),
    clientSecret: required('NETEASE_CLIENT_SECRET'),
    refreshToken: process.env.NETEASE_REFRESH_TOKEN ?? ''
  },
  fishAudio: {
    apiKey: required('FISH_AUDIO_API_KEY'),
    voiceId: required('FISH_AUDIO_VOICE_ID')
  },
  openWeatherKey: process.env.OPENWEATHER_API_KEY ?? '',
  city: process.env.CITY ?? 'Hangzhou',
  port: parseInt(process.env.PORT ?? '3000', 10),
  dataDir: './data',
  audioCacheDir: './data/audio-cache'
};
```

- [ ] **Step 2: Commit**

```bash
git add src/config.ts
git commit -m "feat: typed config loader"
```

---

## Task 4: UserProfile Storage (TDD)

**Files:**
- Create: `src/storage/user-profile.ts`, `tests/user-profile.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/user-profile.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UserProfileStore } from '../src/storage/user-profile.js';

describe('UserProfileStore', () => {
  let dir: string;
  let store: UserProfileStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'claudio-'));
    store = new UserProfileStore(dir);
  });

  it('returns default profile when file missing', async () => {
    const p = await store.getProfile();
    expect(p.name).toBeDefined();
  });

  it('records play history', async () => {
    await store.recordPlay({ trackId: '1', title: 'A', artist: 'B', playedAt: new Date().toISOString(), liked: false, skipped: false });
    const h = await store.recentHistory(5);
    expect(h).toHaveLength(1);
    expect(h[0].trackId).toBe('1');
  });

  it('like updates the most recent matching entry', async () => {
    await store.recordPlay({ trackId: '1', title: 'A', artist: 'B', playedAt: new Date().toISOString(), liked: false, skipped: false });
    await store.like('1');
    const favs = await store.favorites();
    expect(favs.some(f => f.trackId === '1')).toBe(true);
  });

  it('recentHistory returns at most N most-recent entries', async () => {
    for (let i = 0; i < 10; i++) {
      await store.recordPlay({ trackId: String(i), title: 't', artist: 'a', playedAt: new Date(Date.now() + i).toISOString(), liked: false, skipped: false });
    }
    const h = await store.recentHistory(3);
    expect(h).toHaveLength(3);
    expect(h[0].trackId).toBe('9');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- user-profile`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement UserProfileStore**

Create `src/storage/user-profile.ts`:
```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { HistoryEntry, UserProfile } from '../types.js';

const DEFAULT_PROFILE: UserProfile = {
  name: 'friend',
  bio: '',
  musicTaste: '',
  vibes: ''
};

export class UserProfileStore {
  constructor(private dir: string) {}

  private path(name: string) { return join(this.dir, name); }

  private async readJson<T>(name: string, fallback: T): Promise<T> {
    try {
      const raw = await readFile(this.path(name), 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private async writeJson(name: string, data: unknown): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.path(name), JSON.stringify(data, null, 2), 'utf8');
  }

  async getProfile(): Promise<UserProfile> {
    return this.readJson('profile.json', DEFAULT_PROFILE);
  }

  async recordPlay(entry: HistoryEntry): Promise<void> {
    const all = await this.readJson<HistoryEntry[]>('history.json', []);
    all.push(entry);
    await this.writeJson('history.json', all);
  }

  async recentHistory(n: number): Promise<HistoryEntry[]> {
    const all = await this.readJson<HistoryEntry[]>('history.json', []);
    return all.slice(-n).reverse();
  }

  async like(trackId: string): Promise<void> {
    const all = await this.readJson<HistoryEntry[]>('history.json', []);
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].trackId === trackId) { all[i].liked = true; break; }
    }
    await this.writeJson('history.json', all);
    const favs = await this.readJson<HistoryEntry[]>('favorites.json', []);
    const target = all.find(e => e.trackId === trackId && e.liked);
    if (target && !favs.some(f => f.trackId === trackId)) {
      favs.push(target);
      await this.writeJson('favorites.json', favs);
    }
  }

  async markSkipped(trackId: string): Promise<void> {
    const all = await this.readJson<HistoryEntry[]>('history.json', []);
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].trackId === trackId) { all[i].skipped = true; break; }
    }
    await this.writeJson('history.json', all);
  }

  async favorites(): Promise<HistoryEntry[]> {
    return this.readJson<HistoryEntry[]>('favorites.json', []);
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test -- user-profile`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/storage/user-profile.ts tests/user-profile.test.ts
git commit -m "feat: user profile storage with TDD"
```

---

## Task 5: DJ Memory Storage

**Files:** Create: `src/storage/dj-memory.ts`

- [ ] **Step 1: Implement**

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export class DJMemoryStore {
  constructor(private dir: string) {}

  async recent(n: number): Promise<string[]> {
    try {
      const raw = await readFile(join(this.dir, 'dj-memory.json'), 'utf8');
      const arr = JSON.parse(raw) as string[];
      return arr.slice(-n);
    } catch { return []; }
  }

  async record(script: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const arr = await this.recent(50).catch(() => []);
    arr.push(script);
    await writeFile(join(this.dir, 'dj-memory.json'), JSON.stringify(arr.slice(-50), null, 2));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/storage/dj-memory.ts
git commit -m "feat: DJ memory store"
```

---

## Task 6: PlayQueue (TDD)

**Files:** Create `src/play-queue.ts`, `tests/play-queue.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/play-queue.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { PlayQueue } from '../src/play-queue.js';
import type { Track } from '../src/types.js';

const t = (id: string): Track => ({ id, title: id, artist: 'x', url: 'http://x', durationMs: 1000, source: 'netease' });

describe('PlayQueue', () => {
  it('starts empty', () => {
    const q = new PlayQueue();
    expect(q.current()).toBeNull();
    expect(q.upcoming()).toEqual([]);
  });

  it('enqueue + advance', () => {
    const q = new PlayQueue();
    q.enqueue(t('1'));
    q.enqueue(t('2'));
    expect(q.advance()?.id).toBe('1');
    expect(q.current()?.id).toBe('1');
    expect(q.advance()?.id).toBe('2');
  });

  it('advance returns null when empty', () => {
    const q = new PlayQueue();
    expect(q.advance()).toBeNull();
  });

  it('playNow inserts at head and advances immediately', () => {
    const q = new PlayQueue();
    q.enqueue(t('1'));
    q.playNow(t('99'));
    expect(q.current()?.id).toBe('99');
    expect(q.advance()?.id).toBe('1');
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm test -- play-queue`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/play-queue.ts`:
```typescript
import type { Track } from './types.js';

export class PlayQueue {
  private queue: Track[] = [];
  private currentTrack: Track | null = null;

  current(): Track | null { return this.currentTrack; }
  upcoming(): Track[] { return [...this.queue]; }

  enqueue(t: Track): void { this.queue.push(t); }

  advance(): Track | null {
    const next = this.queue.shift() ?? null;
    this.currentTrack = next;
    return next;
  }

  playNow(t: Track): void {
    if (this.currentTrack) this.queue.unshift(this.currentTrack);
    this.currentTrack = t;
  }

  clear(): void { this.queue = []; }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- play-queue`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/play-queue.ts tests/play-queue.test.ts
git commit -m "feat: play queue with TDD"
```

---

## Task 7: Weather Adapter

**Files:** Create `src/adapters/weather.ts`

- [ ] **Step 1: Implement**

```typescript
import axios from 'axios';

export class WeatherClient {
  constructor(private apiKey: string, private city: string) {}

  async current(): Promise<{ description: string; tempC: number } | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: { q: this.city, appid: this.apiKey, units: 'metric' },
        timeout: 5000
      });
      return { description: data.weather?.[0]?.description ?? 'unknown', tempC: data.main?.temp ?? 0 };
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/adapters/weather.ts
git commit -m "feat: weather adapter with graceful fallback"
```

---

## Task 8: NetEase Music Source

> **Note:** The user is using NetEase Open Platform (developer.music.163.com). Read official docs to confirm endpoint paths and auth flow before implementation. The interface below is what the rest of the system depends on; adapt internals to match the actual API.

**Files:** Create `src/adapters/netease.ts`

- [ ] **Step 1: Implement client interface**

```typescript
import axios, { AxiosInstance } from 'axios';
import type { Track } from '../types.js';

export interface MusicSource {
  search(query: string, limit?: number): Promise<Track[]>;
  getUrl(songId: string): Promise<string | null>;
  recommend(limit?: number): Promise<Track[]>;
  similar(songId: string, limit?: number): Promise<Track[]>;
  favorites(limit?: number): Promise<Track[]>;
}

export class NeteaseClient implements MusicSource {
  private http: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private clientId: string,
    private clientSecret: string,
    private refreshToken: string,
    baseURL = 'https://openapi.music.163.com'
  ) {
    this.http = axios.create({ baseURL, timeout: 10000 });
  }

  private async ensureToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) return this.accessToken;
    const { data } = await this.http.post('/oauth/token', {
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken
    });
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
    return this.accessToken!;
  }

  private async authedGet(path: string, params: Record<string, unknown> = {}) {
    const token = await this.ensureToken();
    const { data } = await this.http.get(path, { params, headers: { Authorization: `Bearer ${token}` } });
    return data;
  }

  private toTrack(raw: any): Track {
    return {
      id: String(raw.id ?? raw.songId),
      title: raw.name ?? raw.title ?? 'unknown',
      artist: (raw.artists ?? raw.ar ?? []).map((a: any) => a.name).join(', ') || 'unknown',
      url: '',
      durationMs: raw.duration ?? raw.dt ?? 0,
      source: 'netease'
    };
  }

  async search(query: string, limit = 10): Promise<Track[]> {
    const data = await this.authedGet('/search', { keywords: query, type: 1, limit });
    const songs = data?.result?.songs ?? [];
    return songs.map((s: any) => this.toTrack(s));
  }

  async getUrl(songId: string): Promise<string | null> {
    try {
      const data = await this.authedGet('/song/url', { id: songId });
      return data?.data?.[0]?.url ?? null;
    } catch { return null; }
  }

  async recommend(limit = 10): Promise<Track[]> {
    const data = await this.authedGet('/recommend/songs', { limit });
    const songs = data?.recommend ?? data?.dailySongs ?? [];
    return songs.slice(0, limit).map((s: any) => this.toTrack(s));
  }

  async similar(songId: string, limit = 10): Promise<Track[]> {
    const data = await this.authedGet('/simi/song', { id: songId, limit });
    const songs = data?.songs ?? [];
    return songs.map((s: any) => this.toTrack(s));
  }

  async favorites(limit = 50): Promise<Track[]> {
    const data = await this.authedGet('/user/favorites', { limit });
    const songs = data?.songs ?? [];
    return songs.map((s: any) => this.toTrack(s));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/adapters/netease.ts
git commit -m "feat: NetEase music source adapter"
```

> **Manual verification later:** Once NetEase credentials are set in `.env`, write a one-off script `scripts/probe-netease.ts` to call `search('bon iver')` and confirm a real URL comes back. Adjust endpoint paths if the official API differs.

---

## Task 9: Fish Audio TTS Adapter

**Files:** Create `src/adapters/fish-audio.ts`

- [ ] **Step 1: Implement**

```typescript
import axios from 'axios';
import { createHash } from 'node:crypto';
import { writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';

export class FishAudioClient {
  constructor(
    private apiKey: string,
    private voiceId: string,
    private cacheDir: string
  ) {}

  private hash(text: string): string {
    return createHash('sha256').update(this.voiceId + '|' + text).digest('hex').slice(0, 16);
  }

  async synthesize(text: string): Promise<{ audioUrl: string; filePath: string } | null> {
    const id = this.hash(text);
    const fileName = `${id}.mp3`;
    const filePath = join(this.cacheDir, fileName);
    const audioUrl = `/audio-cache/${fileName}`;

    try { await access(filePath); return { audioUrl, filePath }; } catch {}

    try {
      await mkdir(this.cacheDir, { recursive: true });
      const { data } = await axios.post(
        'https://api.fish.audio/v1/tts',
        { text, reference_id: this.voiceId, format: 'mp3' },
        {
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          responseType: 'arraybuffer',
          timeout: 30000
        }
      );
      await writeFile(filePath, Buffer.from(data));
      return { audioUrl, filePath };
    } catch (e) {
      console.error('[fish-audio] synthesize failed:', (e as Error).message);
      return null;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/adapters/fish-audio.ts
git commit -m "feat: Fish Audio TTS adapter with cache"
```

---

## Task 10: Claude DJBrain (TDD on parsing)

**Files:** Create `src/adapters/claude.ts`, `tests/claude-parse.test.ts`

- [ ] **Step 1: Write failing tests for response parsing**

Create `tests/claude-parse.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseDecision, parseChat } from '../src/adapters/claude.js';

describe('parseDecision', () => {
  it('parses well-formed JSON', () => {
    const raw = '{"shouldSpeak": true, "script": "hello", "nextTrack": {"source": "favorites", "hint": ""}}';
    const d = parseDecision(raw);
    expect(d.shouldSpeak).toBe(true);
    expect(d.script).toBe('hello');
  });

  it('extracts JSON wrapped in prose', () => {
    const raw = 'Here is my decision:\n```json\n{"shouldSpeak": false, "script": null, "nextTrack": {"source": "recommend", "hint": ""}}\n```\n';
    const d = parseDecision(raw);
    expect(d.shouldSpeak).toBe(false);
  });

  it('falls back to safe default on garbage', () => {
    const d = parseDecision('I cannot do that');
    expect(d.shouldSpeak).toBe(false);
    expect(d.nextTrack.source).toBe('recommend');
  });
});

describe('parseChat', () => {
  it('parses play intent', () => {
    const r = parseChat('{"intent":"play","query":"Bon Iver","reply":"Sure, putting it on."}');
    expect(r.intent).toBe('play');
    expect(r.query).toBe('Bon Iver');
  });

  it('falls back to chat intent', () => {
    const r = parseChat('not json');
    expect(r.intent).toBe('chat');
    expect(r.reply.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm test -- claude-parse`
Expected: FAIL.

- [ ] **Step 3: Implement DJBrain**

Create `src/adapters/claude.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { ContextBundle, DJDecision, ChatResponse } from '../types.js';

const SYSTEM_PROMPT = `You are Claudio — a late-night radio DJ with a deep, warm British voice.
You speak slowly, intimately, like an old friend on the air after midnight.
You know your listener personally — refer to their profile naturally when it adds warmth.
Silence is also a choice. A real DJ doesn't talk after every song. Lean toward NOT speaking
unless you have something genuinely worth saying — a connection between songs, a thought
about the time of night, a response to the listener.
When you do speak: 1-3 sentences max. No clichés. Never repeat your previous monologues.`;

export function extractJson(raw: string): unknown | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}

export function parseDecision(raw: string): DJDecision {
  const obj = extractJson(raw) as any;
  if (!obj || typeof obj !== 'object') {
    return { shouldSpeak: false, script: null, nextTrack: { source: 'recommend', hint: '' } };
  }
  return {
    shouldSpeak: !!obj.shouldSpeak,
    script: typeof obj.script === 'string' ? obj.script : null,
    nextTrack: {
      source: ['favorites','similar','recommend','search'].includes(obj.nextTrack?.source) ? obj.nextTrack.source : 'recommend',
      hint: typeof obj.nextTrack?.hint === 'string' ? obj.nextTrack.hint : ''
    }
  };
}

export function parseChat(raw: string): ChatResponse {
  const obj = extractJson(raw) as any;
  if (!obj || typeof obj !== 'object') {
    return { intent: 'chat', reply: raw.trim() || 'Mm.' };
  }
  return {
    intent: obj.intent === 'play' ? 'play' : 'chat',
    reply: typeof obj.reply === 'string' ? obj.reply : 'Mm.',
    query: typeof obj.query === 'string' ? obj.query : undefined
  };
}

function renderContext(c: ContextBundle): string {
  return [
    `[USER PROFILE]\nName: ${c.profile.name}\nBio: ${c.profile.bio}\nMusic taste: ${c.profile.musicTaste}\nVibes: ${c.profile.vibes}`,
    `[NOW]\nTime: ${c.time}\nWeather: ${c.weather ? `${c.weather.description}, ${c.weather.tempC}°C` : 'unknown'}`,
    `[JUST PLAYED]\n${c.lastTrack ? `${c.lastTrack.title} — ${c.lastTrack.artist}` : 'nothing yet'}`,
    `[RECENT HISTORY]\n${c.recentHistory.map(h => `- ${h.title} — ${h.artist}${h.liked ? ' ❤' : ''}${h.skipped ? ' ⏭' : ''}`).join('\n') || '(none)'}`,
    `[YOUR RECENT MONOLOGUES — DO NOT REPEAT]\n${c.recentDJScripts.map(s => `- ${s}`).join('\n') || '(none)'}`,
    c.userMessage ? `[USER JUST SAID]\n${c.userMessage}` : ''
  ].filter(Boolean).join('\n\n');
}

export class DJBrain {
  private client: Anthropic;

  constructor(apiKey: string, private model = 'claude-opus-4-7') {
    this.client = new Anthropic({ apiKey });
  }

  async decide(ctx: ContextBundle): Promise<DJDecision> {
    const userPrompt = `${renderContext(ctx)}\n\nDecide whether to speak now and pick the next track. Return JSON ONLY:\n{"shouldSpeak": boolean, "script": string|null, "nextTrack": {"source": "favorites"|"similar"|"recommend"|"search", "hint": string}}`;
    try {
      const resp = await this.client.messages.create({
        model: this.model,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      });
      const text = resp.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
      return parseDecision(text);
    } catch (e) {
      console.error('[claude] decide failed:', (e as Error).message);
      return { shouldSpeak: false, script: null, nextTrack: { source: 'recommend', hint: '' } };
    }
  }

  async chat(userMessage: string, ctx: ContextBundle): Promise<ChatResponse> {
    const userPrompt = `${renderContext({ ...ctx, userMessage })}\n\nThe listener spoke. Reply briefly (1-2 sentences, in your DJ voice). If they want a song, set intent="play" and put the search query in "query". Return JSON ONLY:\n{"intent": "play"|"chat", "query": string?, "reply": string}`;
    try {
      const resp = await this.client.messages.create({
        model: this.model,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      });
      const text = resp.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
      return parseChat(text);
    } catch (e) {
      console.error('[claude] chat failed:', (e as Error).message);
      return { intent: 'chat', reply: 'Mm. Sorry — I drifted off for a second.' };
    }
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- claude-parse`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/claude.ts tests/claude-parse.test.ts
git commit -m "feat: Claude DJBrain with robust parsing"
```

---

## Task 11: ContextBuilder (TDD)

**Files:** Create `src/context-builder.ts`, `tests/context-builder.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/context-builder.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ContextBuilder } from '../src/context-builder.js';

describe('ContextBuilder', () => {
  const fakeProfile = { getProfile: async () => ({ name: 'A', bio: 'b', musicTaste: 'm', vibes: 'v' }), recentHistory: async () => [] };
  const fakeWeather = { current: async () => ({ description: 'clear', tempC: 20 }) };
  const fakeDJMem = { recent: async () => ['hello'] };

  it('assembles a complete bundle', async () => {
    const b = new ContextBuilder(fakeProfile as any, fakeWeather as any, fakeDJMem as any);
    const bundle = await b.build({ lastTrack: { title: 'X', artist: 'Y' } });
    expect(bundle.profile.name).toBe('A');
    expect(bundle.weather?.description).toBe('clear');
    expect(bundle.recentDJScripts).toEqual(['hello']);
    expect(bundle.lastTrack?.title).toBe('X');
  });

  it('tolerates weather null', async () => {
    const w = { current: async () => null };
    const b = new ContextBuilder(fakeProfile as any, w as any, fakeDJMem as any);
    const bundle = await b.build({ lastTrack: null });
    expect(bundle.weather).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm test -- context-builder`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/context-builder.ts`:
```typescript
import type { ContextBundle } from './types.js';
import type { UserProfileStore } from './storage/user-profile.js';
import type { WeatherClient } from './adapters/weather.js';
import type { DJMemoryStore } from './storage/dj-memory.js';

export class ContextBuilder {
  constructor(
    private profile: UserProfileStore,
    private weather: WeatherClient,
    private djMemory: DJMemoryStore
  ) {}

  async build(state: { lastTrack: { title: string; artist: string } | null; userMessage?: string }): Promise<ContextBundle> {
    const [profile, history, weather, recentDJScripts] = await Promise.all([
      this.profile.getProfile(),
      this.profile.recentHistory(5),
      this.weather.current(),
      this.djMemory.recent(3)
    ]);
    return {
      time: new Date().toLocaleString(),
      weather,
      lastTrack: state.lastTrack,
      recentHistory: history,
      recentDJScripts,
      profile,
      userMessage: state.userMessage
    };
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- context-builder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/context-builder.ts tests/context-builder.test.ts
git commit -m "feat: context builder with TDD"
```

---

## Task 12: EventBus (SSE)

**Files:** Create `src/event-bus.ts`

- [ ] **Step 1: Implement**

```typescript
import type { SSEEvent } from './types.js';

type Listener = (e: SSEEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: SSEEvent): void {
    for (const fn of this.listeners) {
      try { fn(e); } catch (err) { console.error('[event-bus]', err); }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/event-bus.ts
git commit -m "feat: event bus for SSE fan-out"
```

---

## Task 13: Orchestrator

**Files:** Create `src/orchestrator.ts`

- [ ] **Step 1: Implement**

```typescript
import type { Track } from './types.js';
import type { PlayQueue } from './play-queue.js';
import type { ContextBuilder } from './context-builder.js';
import type { DJBrain } from './adapters/claude.js';
import type { MusicSource } from './adapters/netease.js';
import type { FishAudioClient } from './adapters/fish-audio.js';
import type { UserProfileStore } from './storage/user-profile.js';
import type { DJMemoryStore } from './storage/dj-memory.js';
import type { EventBus } from './event-bus.js';

export class Orchestrator {
  constructor(
    private queue: PlayQueue,
    private context: ContextBuilder,
    private brain: DJBrain,
    private music: MusicSource,
    private tts: FishAudioClient,
    private profile: UserProfileStore,
    private djMemory: DJMemoryStore,
    private bus: EventBus
  ) {}

  async start(): Promise<void> {
    if (this.queue.current()) return;
    const track = await this.pickTrack({ source: 'recommend', hint: '' }, null);
    if (track) {
      this.queue.enqueue(track);
      this.queue.advance();
      await this.recordPlay(track);
      this.bus.emit({ type: 'track-changed', track });
    }
  }

  async onTrackEnding(): Promise<void> {
    const last = this.queue.current();
    const ctx = await this.context.build({ lastTrack: last ? { title: last.title, artist: last.artist } : null });
    const decision = await this.brain.decide(ctx);

    if (decision.shouldSpeak && decision.script) {
      const tts = await this.tts.synthesize(decision.script);
      this.bus.emit({ type: 'dj-speaking', audioUrl: tts?.audioUrl ?? null, text: decision.script });
      await this.djMemory.record(decision.script);
    }

    const nextTrack = await this.pickTrack(decision.nextTrack, last);
    if (nextTrack) {
      this.queue.enqueue(nextTrack);
      this.queue.advance();
      await this.recordPlay(nextTrack);
      this.bus.emit({ type: 'track-changed', track: nextTrack });
    }
  }

  async onUserMessage(message: string): Promise<void> {
    const last = this.queue.current();
    const ctx = await this.context.build({ lastTrack: last ? { title: last.title, artist: last.artist } : null });
    const resp = await this.brain.chat(message, ctx);

    const tts = await this.tts.synthesize(resp.reply);
    this.bus.emit({ type: 'dj-speaking', audioUrl: tts?.audioUrl ?? null, text: resp.reply });
    await this.djMemory.record(resp.reply);

    if (resp.intent === 'play' && resp.query) {
      const results = await this.music.search(resp.query, 1);
      if (results[0]) {
        const url = await this.music.getUrl(results[0].id);
        if (url) {
          const track: Track = { ...results[0], url };
          this.queue.playNow(track);
          await this.recordPlay(track);
          this.bus.emit({ type: 'track-changed', track });
        }
      }
    }
  }

  async onSkip(): Promise<void> {
    const cur = this.queue.current();
    if (cur) await this.profile.markSkipped(cur.id);
    await this.onTrackEnding();
  }

  private async recordPlay(t: Track): Promise<void> {
    if (t.source === 'tts') return;
    await this.profile.recordPlay({
      trackId: t.id, title: t.title, artist: t.artist,
      playedAt: new Date().toISOString(), liked: false, skipped: false
    });
  }

  private async pickTrack(hint: { source: string; hint: string }, last: Track | null): Promise<Track | null> {
    const tries: (() => Promise<Track[]>)[] = [];

    switch (hint.source) {
      case 'favorites': tries.push(() => this.profile.favorites().then(fs => fs.map(f => ({ id: f.trackId, title: f.title, artist: f.artist, url: '', durationMs: 0, source: 'netease' as const })))); break;
      case 'similar': if (last && last.source === 'netease') tries.push(() => this.music.similar(last.id)); break;
      case 'search': if (hint.hint) tries.push(() => this.music.search(hint.hint)); break;
    }
    tries.push(() => this.music.recommend());

    for (const fn of tries) {
      try {
        const list = await fn();
        for (const cand of list) {
          const url = cand.url || (await this.music.getUrl(cand.id));
          if (url) return { ...cand, url };
        }
      } catch (e) {
        console.error('[orchestrator] pickTrack source failed:', (e as Error).message);
      }
    }
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/orchestrator.ts
git commit -m "feat: orchestrator with multi-source fallback"
```

---

## Task 14: HTTP Routes

**Files:** Create `src/routes/track.ts`, `src/routes/chat.ts`, `src/routes/like.ts`, `src/routes/events.ts`

- [ ] **Step 1: Implement track route**

Create `src/routes/track.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import type { Orchestrator } from '../orchestrator.js';

export function trackRoutes(app: FastifyInstance, orch: Orchestrator) {
  app.post('/track/ending', async () => { await orch.onTrackEnding(); return { ok: true }; });
  app.post('/track/skip', async () => { await orch.onSkip(); return { ok: true }; });
  app.post('/track/start', async () => { await orch.start(); return { ok: true }; });
}
```

- [ ] **Step 2: Implement chat route**

Create `src/routes/chat.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import type { Orchestrator } from '../orchestrator.js';

export function chatRoutes(app: FastifyInstance, orch: Orchestrator) {
  app.post<{ Body: { message: string } }>('/chat', async (req) => {
    const { message } = req.body;
    if (!message?.trim()) return { ok: false, error: 'empty message' };
    await orch.onUserMessage(message.trim());
    return { ok: true };
  });
}
```

- [ ] **Step 3: Implement like route**

Create `src/routes/like.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import type { UserProfileStore } from '../storage/user-profile.js';

export function likeRoutes(app: FastifyInstance, profile: UserProfileStore) {
  app.post<{ Body: { trackId: string } }>('/like', async (req) => {
    await profile.like(req.body.trackId);
    return { ok: true };
  });
}
```

- [ ] **Step 4: Implement SSE events route**

Create `src/routes/events.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import type { EventBus } from '../event-bus.js';

export function eventsRoute(app: FastifyInstance, bus: EventBus) {
  app.get('/events', (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    reply.raw.write(': connected\n\n');

    const unsub = bus.subscribe((e) => {
      reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
    });

    const keepalive = setInterval(() => reply.raw.write(': ping\n\n'), 15000);
    req.raw.on('close', () => { clearInterval(keepalive); unsub(); });
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/routes
git commit -m "feat: HTTP routes incl SSE"
```

---

## Task 15: Server Entrypoint

**Files:** Create `src/index.ts`

- [ ] **Step 1: Implement**

```typescript
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { UserProfileStore } from './storage/user-profile.js';
import { DJMemoryStore } from './storage/dj-memory.js';
import { PlayQueue } from './play-queue.js';
import { WeatherClient } from './adapters/weather.js';
import { NeteaseClient } from './adapters/netease.js';
import { FishAudioClient } from './adapters/fish-audio.js';
import { DJBrain } from './adapters/claude.js';
import { ContextBuilder } from './context-builder.js';
import { EventBus } from './event-bus.js';
import { Orchestrator } from './orchestrator.js';
import { trackRoutes } from './routes/track.js';
import { chatRoutes } from './routes/chat.js';
import { likeRoutes } from './routes/like.js';
import { eventsRoute } from './routes/events.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const profile = new UserProfileStore(config.dataDir);
  const djMemory = new DJMemoryStore(config.dataDir);
  const queue = new PlayQueue();
  const weather = new WeatherClient(config.openWeatherKey, config.city);
  const music = new NeteaseClient(config.netease.clientId, config.netease.clientSecret, config.netease.refreshToken);
  const tts = new FishAudioClient(config.fishAudio.apiKey, config.fishAudio.voiceId, config.audioCacheDir);
  const brain = new DJBrain(config.anthropicKey);
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
```

- [ ] **Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat: server entrypoint wiring"
```

---

## Task 16: PWA Shell

**Files:** Create `public/index.html`, `public/style.css`, `public/manifest.json`, `public/sw.js`

- [ ] **Step 1: Create index.html**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Claudio</title>
  <link rel="manifest" href="/manifest.json" />
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <header><h1>Claudio</h1><span id="on-air">● ON AIR</span></header>

  <main>
    <section id="now-playing">
      <div id="track-title">—</div>
      <div id="track-artist"></div>
      <progress id="progress" value="0" max="1"></progress>
      <div class="controls">
        <button id="play-pause">Play</button>
        <button id="skip">Skip</button>
        <button id="like">♡ Like</button>
      </div>
    </section>

    <section id="dj-bubble" hidden>
      <div class="who">Claudio</div>
      <div id="dj-text"></div>
    </section>

    <section id="chat">
      <input id="chat-input" placeholder="Say something to the DJ…" />
      <button id="chat-send">Send</button>
    </section>
  </main>

  <audio id="music-audio"></audio>
  <audio id="dj-audio"></audio>

  <script type="module" src="/js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create style.css**

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #0a0a0a; color: #e0e0e0; min-height: 100vh; }
header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; border-bottom: 1px solid #222; }
header h1 { margin: 0; font-weight: 300; letter-spacing: 0.1em; }
#on-air { color: #f55; font-size: 0.8rem; letter-spacing: 0.15em; }
main { max-width: 600px; margin: 2rem auto; padding: 0 1.5rem; }
#now-playing { margin-bottom: 2rem; }
#track-title { font-size: 1.4rem; }
#track-artist { color: #888; margin-bottom: 0.8rem; }
progress { width: 100%; height: 4px; }
.controls { margin-top: 1rem; display: flex; gap: 0.5rem; }
.controls button { background: #222; color: #e0e0e0; border: 1px solid #333; padding: 0.5rem 1rem; cursor: pointer; }
.controls button:hover { background: #2a2a2a; }
#dj-bubble { background: #161616; border-left: 2px solid #f55; padding: 1rem; margin-bottom: 2rem; }
#dj-bubble .who { font-size: 0.8rem; color: #f55; letter-spacing: 0.1em; margin-bottom: 0.5rem; }
#chat { display: flex; gap: 0.5rem; position: sticky; bottom: 1rem; }
#chat-input { flex: 1; background: #111; border: 1px solid #333; color: #e0e0e0; padding: 0.6rem 0.8rem; }
#chat-send { background: #333; color: #e0e0e0; border: 0; padding: 0.6rem 1rem; cursor: pointer; }
```

- [ ] **Step 3: Create manifest.json**

```json
{
  "name": "Claudio",
  "short_name": "Claudio",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": []
}
```

- [ ] **Step 4: Create sw.js (no-op for v1)**

```javascript
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
```

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/style.css public/manifest.json public/sw.js
git commit -m "feat: PWA shell"
```

---

## Task 17: Frontend Player

**Files:** Create `public/js/player.js`

- [ ] **Step 1: Implement**

```javascript
export class Player {
  constructor() {
    this.musicEl = document.getElementById('music-audio');
    this.djEl = document.getElementById('dj-audio');
    this.titleEl = document.getElementById('track-title');
    this.artistEl = document.getElementById('track-artist');
    this.progressEl = document.getElementById('progress');
    this.playPauseBtn = document.getElementById('play-pause');
    this.skipBtn = document.getElementById('skip');
    this.likeBtn = document.getElementById('like');

    this.currentTrack = null;
    this.endingSent = false;

    this.musicEl.addEventListener('timeupdate', () => this._onTime());
    this.musicEl.addEventListener('ended', () => this._onEnded());
    this.playPauseBtn.addEventListener('click', () => this._togglePlay());
    this.skipBtn.addEventListener('click', () => fetch('/track/skip', { method: 'POST' }));
    this.likeBtn.addEventListener('click', () => {
      if (this.currentTrack) fetch('/like', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId: this.currentTrack.id }) });
    });
  }

  setTrack(track) {
    this.currentTrack = track;
    this.endingSent = false;
    this.titleEl.textContent = track.title;
    this.artistEl.textContent = track.artist;
    this.musicEl.src = track.url;
    this.musicEl.play().catch(() => {});
    this.playPauseBtn.textContent = 'Pause';
  }

  async playDJ(audioUrl) {
    if (!audioUrl) return;
    this.musicEl.pause();
    this.djEl.src = audioUrl;
    await new Promise((res) => {
      this.djEl.onended = res;
      this.djEl.onerror = res;
      this.djEl.play().catch(res);
    });
    if (this.currentTrack) this.musicEl.play().catch(() => {});
  }

  _onTime() {
    if (!this.musicEl.duration) return;
    this.progressEl.value = this.musicEl.currentTime / this.musicEl.duration;
    if (!this.endingSent && this.musicEl.duration - this.musicEl.currentTime < 5) {
      this.endingSent = true;
      fetch('/track/ending', { method: 'POST' });
    }
  }

  _onEnded() {
    if (!this.endingSent) {
      this.endingSent = true;
      fetch('/track/ending', { method: 'POST' });
    }
  }

  _togglePlay() {
    if (this.musicEl.paused) { this.musicEl.play(); this.playPauseBtn.textContent = 'Pause'; }
    else { this.musicEl.pause(); this.playPauseBtn.textContent = 'Play'; }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/player.js
git commit -m "feat: frontend player"
```

---

## Task 18: DJ Bubble + Chat Box + Event Client + App Bootstrap

**Files:** Create `public/js/dj-bubble.js`, `public/js/chat-box.js`, `public/js/event-client.js`, `public/js/app.js`

- [ ] **Step 1: dj-bubble.js**

```javascript
export class DJBubble {
  constructor() {
    this.el = document.getElementById('dj-bubble');
    this.textEl = document.getElementById('dj-text');
  }
  show(text) { this.textEl.textContent = text; this.el.hidden = false; }
  hide() { this.el.hidden = true; }
}
```

- [ ] **Step 2: chat-box.js**

```javascript
export class ChatBox {
  constructor() {
    const input = document.getElementById('chat-input');
    const send = document.getElementById('chat-send');
    const submit = async () => {
      const v = input.value.trim();
      if (!v) return;
      input.value = '';
      await fetch('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: v }) });
    };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }
}
```

- [ ] **Step 3: event-client.js**

```javascript
export class EventClient {
  constructor(handler) {
    const es = new EventSource('/events');
    es.onmessage = (e) => {
      try { handler(JSON.parse(e.data)); } catch {}
    };
    es.onerror = () => console.warn('SSE disconnected; will reconnect');
  }
}
```

- [ ] **Step 4: app.js**

```javascript
import { Player } from './player.js';
import { DJBubble } from './dj-bubble.js';
import { ChatBox } from './chat-box.js';
import { EventClient } from './event-client.js';

const player = new Player();
const bubble = new DJBubble();
new ChatBox();

new EventClient((evt) => {
  if (evt.type === 'track-changed') {
    player.setTrack(evt.track);
  } else if (evt.type === 'dj-speaking') {
    bubble.show(evt.text);
    player.playDJ(evt.audioUrl).then(() => setTimeout(() => bubble.hide(), 4000));
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

fetch('/track/start', { method: 'POST' });
```

- [ ] **Step 5: Commit**

```bash
git add public/js/dj-bubble.js public/js/chat-box.js public/js/event-client.js public/js/app.js
git commit -m "feat: frontend bubble, chat, SSE client, bootstrap"
```

---

## Task 19: Integration Test (mocked externals)

**Files:** Create `tests/integration/full-loop.test.ts`

- [ ] **Step 1: Write test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlayQueue } from '../../src/play-queue.js';
import { UserProfileStore } from '../../src/storage/user-profile.js';
import { DJMemoryStore } from '../../src/storage/dj-memory.js';
import { ContextBuilder } from '../../src/context-builder.js';
import { EventBus } from '../../src/event-bus.js';
import { Orchestrator } from '../../src/orchestrator.js';
import type { Track } from '../../src/types.js';

describe('full loop (mocked)', () => {
  it('runs start → ending → next track', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'claudio-int-'));
    const profile = new UserProfileStore(dir);
    const djMem = new DJMemoryStore(dir);
    const queue = new PlayQueue();
    const weather = { current: vi.fn().mockResolvedValue(null) } as any;
    const ctxB = new ContextBuilder(profile, weather, djMem);

    const t1: Track = { id: '1', title: 'A', artist: 'B', url: 'http://a', durationMs: 1, source: 'netease' };
    const t2: Track = { id: '2', title: 'C', artist: 'D', url: 'http://c', durationMs: 1, source: 'netease' };
    const music = {
      search: vi.fn(), getUrl: vi.fn().mockResolvedValue('http://x'),
      recommend: vi.fn().mockResolvedValueOnce([t1]).mockResolvedValueOnce([t2]),
      similar: vi.fn(), favorites: vi.fn()
    } as any;
    const tts = { synthesize: vi.fn().mockResolvedValue({ audioUrl: '/audio-cache/x.mp3' }) } as any;
    const brain = {
      decide: vi.fn().mockResolvedValue({ shouldSpeak: true, script: 'It is late.', nextTrack: { source: 'recommend', hint: '' } }),
      chat: vi.fn()
    } as any;

    const events: any[] = [];
    const bus = new EventBus();
    bus.subscribe(e => events.push(e));

    const orch = new Orchestrator(queue, ctxB, brain, music, tts, profile, djMem, bus);
    await orch.start();
    expect(queue.current()?.id).toBe('1');

    await orch.onTrackEnding();
    expect(queue.current()?.id).toBe('2');
    expect(events.some(e => e.type === 'dj-speaking' && e.text === 'It is late.')).toBe(true);
    expect(events.filter(e => e.type === 'track-changed').length).toBe(2);
  });
});
```

- [ ] **Step 2: Run, verify pass**

Run: `npm test -- integration`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/full-loop.test.ts
git commit -m "test: integration test for full loop with mocks"
```

---

## Task 20: Manual Verification & README

**Files:** Create `README.md`

- [ ] **Step 1: Set up `.env`** (user action)

Copy `.env.example` to `.env` and fill in real keys.

- [ ] **Step 2: Seed `data/profile.json`** (user action)

```json
{
  "name": "光哥",
  "bio": "数据分析师，住在杭州，最近在做 AI 产品",
  "musicTaste": "indie folk, post-rock, 偶尔听民谣",
  "vibes": "深夜工作时喜欢听不带歌词的"
}
```

- [ ] **Step 3: Run dev server**

Run: `npm run dev`
Expected: `Claudio on http://localhost:3000`

- [ ] **Step 4: Open browser, verify**

Open `http://localhost:3000`. Confirm:
- A track starts playing within ~10 seconds
- After the track ends (or near the end), a DJ monologue is heard (or at least appears in the bubble)
- Typing "play something by Bon Iver" in the chat box switches the song

- [ ] **Step 5: Write minimal README**

```markdown
# Claudio

Personal AI radio. Late-night-DJ Claude over your NetEase library, with British TTS.

## Setup
1. `npm install`
2. `cp .env.example .env` and fill in keys
3. Edit `data/profile.json` (created on first run, or seed manually)
4. `npm run dev`
5. Open http://localhost:3000

## Tests
`npm test`
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: README with setup steps"
```

---

## Notes & Caveats

1. **NetEase endpoint paths in Task 8 are best-effort** based on common patterns. Confirm with the official docs at developer.music.163.com and adjust paths/parameters as needed before relying on the integration test.
2. **Anthropic SDK version**: `@anthropic-ai/sdk` major versions have shifting APIs; if `messages.create` signature differs, adapt Task 10.
3. **Fish Audio API**: Endpoint and params taken from public docs. If your account uses a different region or model, adjust the URL.
4. **PWA on localhost**: Service Worker registration works on `http://localhost` without HTTPS — that's why we don't need certs for v1.
