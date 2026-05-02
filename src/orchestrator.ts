import type { Track } from './types.js';
import type { PlayQueue } from './play-queue.js';
import type { ContextBuilder } from './context-builder.js';
import type { DJBrain } from './adapters/dj-brain.js';
import { sanitizeSpokenText } from './adapters/dj-brain.js';
import type { MusicSource } from './adapters/netease.js';
import type { FishAudioClient } from './adapters/fish-audio.js';
import type { UserProfileStore } from './storage/user-profile.js';
import type { DJMemoryStore } from './storage/dj-memory.js';
import type { SessionLogStore } from './storage/session-log.js';
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
    private bus: EventBus,
    private sessionLog?: SessionLogStore
  ) {}

  async start(): Promise<void> {
    if (this.queue.current()) return;
    const ctx = await this.context.build({ lastTrack: null });
    const decision = await this.brain.decide(ctx);
    const track = await this.pickTrack(decision.nextTrack, null);

    if (decision.shouldSpeak && track) {
      const script = await this.brain.introduce(ctx, track);
      await this.speak(script || decision.script);
    }

    if (track) {
      this.queue.enqueue(track);
      this.queue.advance();
      await this.recordPlay(track);
      await this.emitTrackChanged(track);
      this.emitQueue();
    }
  }

  async onTrackEnding(): Promise<void> {
    const last = this.queue.current();
    const ctx = await this.context.build({ lastTrack: last ? { title: last.title, artist: last.artist } : null });

    const queued = this.queue.upcoming()[0];
    if (queued) {
      const script = await this.brain.introduce(ctx, queued);
      await this.speak(script);
      this.queue.advance();
      await this.recordPlay(queued);
      await this.emitTrackChanged(queued);
      this.emitQueue();
      return;
    }

    const decision = await this.brain.decide(ctx);
    const nextTrack = await this.pickTrack(decision.nextTrack, last);

    if (decision.shouldSpeak && nextTrack) {
      const script = await this.brain.introduce(ctx, nextTrack);
      await this.speak(script || decision.script);
    }

    if (nextTrack) {
      this.queue.enqueue(nextTrack);
      this.queue.advance();
      await this.recordPlay(nextTrack);
      await this.emitTrackChanged(nextTrack);
      this.emitQueue();
    }
  }

  async onUserMessage(message: string): Promise<void> {
    await this.sessionLog?.record({ type: 'user-message', payload: { text: message } });
    const last = this.queue.current();
    const ctx = await this.context.build({ lastTrack: last ? { title: last.title, artist: last.artist } : null });
    const resp = await this.brain.chat(message, ctx);

    await this.speak(resp.reply);

    if (resp.intent === 'play' && resp.query) {
      const requestedCount = resp.count ?? this.inferRequestedTrackCount(message);
      const tracks = await this.searchPlayableTracks(resp.query, requestedCount, last);

      if (tracks[0]) {
        if (requestedCount > 1) this.queue.clear();
        this.queue.playNow(tracks[0]);
        for (const track of tracks.slice(1)) this.queue.enqueue(track);
        await this.recordPlay(tracks[0]);
        await this.emitTrackChanged(tracks[0]);
        this.emitQueue();
      }
    }
  }

  async onSkip(): Promise<void> {
    const cur = this.queue.current();
    await this.sessionLog?.record({ type: 'skip', payload: { track: cur } });
    if (cur) await this.profile.markSkipped(cur.id);

    const queued = this.queue.advance();
    if (queued) {
      await this.recordPlay(queued);
      await this.emitTrackChanged(queued);
      this.emitQueue();
      return;
    }

    const ctx = await this.context.build({ lastTrack: cur ? { title: cur.title, artist: cur.artist } : null });
    const decision = await this.brain.decide(ctx);
    const nextTrack = await this.pickTrack(decision.nextTrack, cur, { allowRepeats: false });

    if (decision.shouldSpeak && nextTrack) {
      const script = await this.brain.introduce(ctx, nextTrack);
      await this.speak(script || decision.script);
    }

    if (nextTrack) {
      this.queue.enqueue(nextTrack);
      this.queue.advance();
      await this.recordPlay(nextTrack);
      await this.emitTrackChanged(nextTrack);
      this.emitQueue();
    } else {
      this.emitQueue();
    }
  }

  private async recordPlay(t: Track): Promise<void> {
    if (t.source === 'tts') return;
    await this.profile.recordPlay({
      trackId: t.id, title: t.title, artist: t.artist,
      playedAt: new Date().toISOString(), liked: false, skipped: false
    });
  }

  private async speak(script: string | null | undefined): Promise<void> {
    const spoken = sanitizeSpokenText(script);
    if (!spoken) return;
    const tts = await this.tts.synthesize(spoken);
    this.bus.emit({ type: 'dj-speaking', audioUrl: tts?.audioUrl ?? null, text: spoken });
    await this.sessionLog?.record({
      type: 'dj-speaking',
      payload: { text: spoken, audioUrl: tts?.audioUrl ?? null }
    });
    await this.djMemory.record(spoken);
  }

  private emitQueue(): void {
    const queue = this.queue.upcoming();
    this.bus.emit({ type: 'queue-update', queue });
    this.sessionLog?.record({ type: 'queue-update', payload: { queue } }).catch((e) => {
      console.error('[session-log] queue-update failed:', (e as Error).message);
    });
  }

  private async emitTrackChanged(track: Track): Promise<void> {
    this.bus.emit({ type: 'track-changed', track });
    await this.sessionLog?.record({ type: 'track-changed', payload: { track } });
  }

  private inferRequestedTrackCount(message: string): number {
    const lower = message.toLowerCase();
    const digit = lower.match(/(\d+)\s*(songs?|tracks?|首|支|曲)/);
    if (digit) return Math.max(1, Math.min(10, Number(digit[1])));

    const zhDigits: Record<string, number> = {
      一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5,
      六: 6, 七: 7, 八: 8, 九: 9, 十: 10
    };
    const zh = message.match(/([一两二三四五六七八九十])\s*(首|支|曲)/);
    if (zh) return zhDigits[zh[1]] ?? 5;

    const words: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10
    };
    const word = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(songs?|tracks?)\b/);
    if (word) return words[word[1]] ?? 5;

    if (/几首|几支|几曲|一些|几首歌/.test(message)) return 5;
    if (/\b(some|several|a few)\s+(songs?|tracks?)\b/.test(lower)) return 5;
    return 1;
  }

  private async searchPlayableTracks(query: string, count: number, last: Track | null): Promise<Track[]> {
    const limit = Math.max(count * 3, 5);
    const results = await this.music.search(query, limit);
    const recent = await this.profile.recentHistory(20);
    const avoidIds = new Set<string>([
      ...recent.map((h) => h.trackId),
      ...this.queue.upcoming().map((t) => t.id)
    ]);
    if (last) avoidIds.add(last.id);

    const fresh = results.filter((cand) => !avoidIds.has(cand.id));
    const candidates = fresh.length >= count ? fresh : results;
    const tracks: Track[] = [];
    const seen = new Set<string>();

    for (const cand of candidates) {
      if (seen.has(cand.id)) continue;
      seen.add(cand.id);
      const url = cand.url || (await this.music.getUrl(cand.id));
      if (url) tracks.push({ ...cand, url });
      if (tracks.length >= count) break;
    }
    return tracks;
  }

  private async pickTrack(
    hint: { source: string; hint: string },
    last: Track | null,
    options: { allowRepeats?: boolean } = {}
  ): Promise<Track | null> {
    const tries: (() => Promise<Track[]>)[] = [];
    const recent = await this.profile.recentHistory(20);
    const avoidIds = new Set<string>([
      ...recent.map((h) => h.trackId),
      ...this.queue.upcoming().map((t) => t.id)
    ]);
    if (last) avoidIds.add(last.id);

    switch (hint.source) {
      case 'favorites': tries.push(() => this.profile.favorites().then(fs => fs.map(f => ({ id: f.trackId, title: f.title, artist: f.artist, url: '', durationMs: 0, source: 'netease' as const })))); break;
      case 'similar': if (last && last.source === 'netease') tries.push(() => this.music.similar(last.id)); break;
      case 'search': if (hint.hint) tries.push(() => this.music.search(hint.hint)); break;
    }
    if (hint.source !== 'search' && hint.hint) {
      tries.push(() => this.music.search(hint.hint));
    }
    tries.push(() => this.music.recommend());

    for (const fn of tries) {
      try {
        const list = await fn();
        const fresh = list.filter((cand) => !avoidIds.has(cand.id));
        if (options.allowRepeats === false && !fresh.length) continue;
        const candidates = fresh.length ? fresh : list;
        for (const cand of candidates) {
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
