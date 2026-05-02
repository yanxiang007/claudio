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
      introduce: vi.fn().mockImplementation((_ctx, track: Track) => `Coming up: ${track.title}.`),
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
    expect(events.some(e => e.type === 'dj-speaking' && e.text === 'Coming up: A.')).toBe(true);
    expect(brain.introduce).toHaveBeenCalledWith(expect.anything(), t1);
    expect(brain.introduce).toHaveBeenCalledWith(expect.anything(), t2);
    expect(events.filter(e => e.type === 'track-changed').length).toBe(2);
  });

  it('skips recently played candidates before falling back to repeats', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'claudio-int-'));
    const profile = new UserProfileStore(dir);
    const djMem = new DJMemoryStore(dir);
    const queue = new PlayQueue();
    const weather = { current: vi.fn().mockResolvedValue(null) } as any;
    const ctxB = new ContextBuilder(profile, weather, djMem);

    const t1: Track = { id: '1', title: 'A', artist: 'B', url: 'http://a', durationMs: 1, source: 'netease' };
    const t2: Track = { id: '2', title: 'C', artist: 'D', url: 'http://c', durationMs: 1, source: 'netease' };
    const music = {
      search: vi.fn(),
      getUrl: vi.fn().mockResolvedValue('http://x'),
      recommend: vi.fn().mockResolvedValueOnce([t1]).mockResolvedValueOnce([t1, t2]),
      similar: vi.fn()
    } as any;
    const tts = { synthesize: vi.fn().mockResolvedValue(null) } as any;
    const brain = {
      decide: vi.fn().mockResolvedValue({ shouldSpeak: false, script: null, nextTrack: { source: 'recommend', hint: '' } }),
      introduce: vi.fn(),
      chat: vi.fn()
    } as any;

    const orch = new Orchestrator(queue, ctxB, brain, music, tts, profile, djMem, new EventBus());
    await orch.start();
    await orch.onTrackEnding();

    expect(queue.current()?.id).toBe('2');
  });

  it('queues several requested songs and advances through the queue before asking for fresh recommendations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'claudio-int-'));
    const profile = new UserProfileStore(dir);
    const djMem = new DJMemoryStore(dir);
    const queue = new PlayQueue();
    const weather = { current: vi.fn().mockResolvedValue(null) } as any;
    const ctxB = new ContextBuilder(profile, weather, djMem);

    const t1: Track = { id: '1', title: 'J1', artist: 'Jolin Tsai', url: '', durationMs: 1, source: 'netease' };
    const t2: Track = { id: '2', title: 'J2', artist: 'Jolin Tsai', url: '', durationMs: 1, source: 'netease' };
    const t3: Track = { id: '3', title: 'J3', artist: 'Jolin Tsai', url: '', durationMs: 1, source: 'netease' };
    const music = {
      search: vi.fn().mockResolvedValue([t1, t2, t3]),
      getUrl: vi.fn().mockImplementation((id: string) => Promise.resolve(`http://${id}`)),
      recommend: vi.fn(),
      similar: vi.fn()
    } as any;
    const tts = { synthesize: vi.fn().mockResolvedValue(null) } as any;
    const brain = {
      decide: vi.fn(),
      introduce: vi.fn().mockImplementation((_ctx, track: Track) => `Next queued: ${track.title}.`),
      chat: vi.fn().mockResolvedValue({ intent: 'play', query: '蔡依林', count: 3, reply: 'I will line up three.' })
    } as any;

    const events: any[] = [];
    const bus = new EventBus();
    bus.subscribe(e => events.push(e));

    const orch = new Orchestrator(queue, ctxB, brain, music, tts, profile, djMem, bus);
    await orch.onUserMessage('给我推荐几首蔡依林的歌曲');

    expect(queue.current()?.id).toBe('1');
    expect(queue.upcoming().map(t => t.id)).toEqual(['2', '3']);

    await orch.onTrackEnding();

    expect(queue.current()?.id).toBe('2');
    expect(queue.upcoming().map(t => t.id)).toEqual(['3']);
    expect(brain.decide).not.toHaveBeenCalled();
    expect(music.recommend).not.toHaveBeenCalled();
    expect(events.some(e => e.type === 'queue-update' && e.queue.length === 2)).toBe(true);
  });

  it('skip advances to the queued next track without asking the DJ for a recommendation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'claudio-int-'));
    const profile = new UserProfileStore(dir);
    const djMem = new DJMemoryStore(dir);
    const queue = new PlayQueue();
    const weather = { current: vi.fn().mockResolvedValue(null) } as any;
    const ctxB = new ContextBuilder(profile, weather, djMem);

    const t1: Track = { id: '1', title: 'J1', artist: 'Jolin Tsai', url: 'http://1', durationMs: 1, source: 'netease' };
    const t2: Track = { id: '2', title: 'J2', artist: 'Jolin Tsai', url: 'http://2', durationMs: 1, source: 'netease' };
    queue.playNow(t1);
    queue.enqueue(t2);
    await profile.recordPlay({ trackId: t1.id, title: t1.title, artist: t1.artist, playedAt: new Date().toISOString(), liked: false, skipped: false });

    const music = { search: vi.fn(), getUrl: vi.fn(), recommend: vi.fn(), similar: vi.fn() } as any;
    const tts = { synthesize: vi.fn().mockResolvedValue(null) } as any;
    const brain = { decide: vi.fn(), introduce: vi.fn(), chat: vi.fn() } as any;

    const orch = new Orchestrator(queue, ctxB, brain, music, tts, profile, djMem, new EventBus());
    await orch.onSkip();

    expect(queue.current()?.id).toBe('2');
    expect(brain.decide).not.toHaveBeenCalled();
    expect(music.recommend).not.toHaveBeenCalled();
    expect(music.search).not.toHaveBeenCalled();
  });

  it('skip at the end of a queue does not fall back to recently played songs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'claudio-int-'));
    const profile = new UserProfileStore(dir);
    const djMem = new DJMemoryStore(dir);
    const queue = new PlayQueue();
    const weather = { current: vi.fn().mockResolvedValue(null) } as any;
    const ctxB = new ContextBuilder(profile, weather, djMem);

    const t1: Track = { id: '1', title: 'J1', artist: 'Jolin Tsai', url: 'http://1', durationMs: 1, source: 'netease' };
    queue.playNow(t1);
    await profile.recordPlay({ trackId: t1.id, title: t1.title, artist: t1.artist, playedAt: new Date().toISOString(), liked: false, skipped: false });

    const music = {
      search: vi.fn(),
      getUrl: vi.fn().mockResolvedValue('http://1'),
      recommend: vi.fn().mockResolvedValue([t1]),
      similar: vi.fn()
    } as any;
    const tts = { synthesize: vi.fn().mockResolvedValue(null) } as any;
    const brain = {
      decide: vi.fn().mockResolvedValue({ shouldSpeak: false, script: null, nextTrack: { source: 'recommend', hint: '' } }),
      introduce: vi.fn(),
      chat: vi.fn()
    } as any;

    const orch = new Orchestrator(queue, ctxB, brain, music, tts, profile, djMem, new EventBus());
    await orch.onSkip();

    expect(queue.current()).toBeNull();
    expect(music.getUrl).not.toHaveBeenCalled();
  });
});
