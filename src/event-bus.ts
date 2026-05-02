import type { SSEEvent } from './types.js';

type Listener = (e: SSEEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();
  private latestTrackEvent: SSEEvent | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    if (this.latestTrackEvent) {
      try { fn(this.latestTrackEvent); } catch (err) { console.error('[event-bus]', err); }
    }
    return () => this.listeners.delete(fn);
  }

  emit(e: SSEEvent): void {
    if (e.type === 'track-changed') this.latestTrackEvent = e;
    for (const fn of this.listeners) {
      try { fn(e); } catch (err) { console.error('[event-bus]', err); }
    }
  }
}
