import type { Track } from './types.js';
import type { PlayQueue } from './play-queue.js';
import type { ContextBuilder } from './context-builder.js';
import type { DJBrain } from './adapters/dj-brain.js';
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
