import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
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
