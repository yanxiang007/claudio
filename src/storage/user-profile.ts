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
