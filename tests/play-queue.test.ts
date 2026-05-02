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

  it('playNow replaces the current track without replaying it next', () => {
    const q = new PlayQueue();
    q.enqueue(t('1'));
    q.advance();
    q.playNow(t('99'));
    expect(q.current()?.id).toBe('99');
    expect(q.advance()).toBeNull();
  });
});
