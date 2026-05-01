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
