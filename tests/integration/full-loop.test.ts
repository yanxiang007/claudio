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
