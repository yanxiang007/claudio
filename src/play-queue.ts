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
