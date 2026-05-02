import { createRequire } from 'node:module';
import type { Track } from '../types.js';
import type { MusicSource } from './netease.js';

const require = createRequire(import.meta.url);
const ncm = require('NeteaseCloudMusicApi');

export interface NeteaseUnofficialConfig {
  cookie?: string;
  favoritePlaylistId?: string;
}

function artists(raw: any): string {
  const list = raw.artists ?? raw.ar ?? raw.song?.artists ?? raw.song?.ar ?? [];
  if (Array.isArray(list) && list.length) {
    return list.map((a) => a?.name).filter(Boolean).join(', ');
  }
  return raw.artist ?? 'unknown';
}

function duration(raw: any): number {
  return Number(raw.duration ?? raw.dt ?? raw.song?.duration ?? raw.song?.dt ?? 0);
}

function toTrack(raw: any): Track {
  return {
    id: String(raw.id),
    title: raw.name ?? raw.song?.name ?? 'unknown',
    artist: artists(raw),
    url: '',
    durationMs: duration(raw),
    source: 'netease'
  };
}

function playlistTracks(res: any): any[] {
  return res?.body?.songs ?? res?.body?.playlist?.tracks ?? [];
}

function uniqTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

export class NeteaseUnofficialClient implements MusicSource {
  private userId: string | null = null;

  constructor(private cfg: NeteaseUnofficialConfig = {}) {}

  private options(): Record<string, unknown> {
    return this.cfg.cookie ? { cookie: this.cfg.cookie } : {};
  }

  async search(query: string, limit = 10): Promise<Track[]> {
    const res = await ncm.search({
      ...this.options(),
      keywords: query,
      type: 1,
      limit,
      offset: 0
    });
    const songs = res?.body?.result?.songs ?? [];
    return uniqTracks(songs.map(toTrack)).slice(0, limit);
  }

  async getUrl(songId: string): Promise<string | null> {
    const res = await ncm.song_url({
      ...this.options(),
      id: songId,
      br: 320000
    });
    const item = res?.body?.data?.[0];
    return item?.url ?? null;
  }

  async recommend(limit = 30): Promise<Track[]> {
    try {
      const res = await ncm.recommend_songs(this.options());
      const songs = res?.body?.data?.dailySongs ?? res?.body?.recommend ?? [];
      const tracks = uniqTracks(songs.map(toTrack)).slice(0, limit);
      if (tracks.length) return tracks;
    } catch (e) {
      console.warn('[netease-unofficial] recommend_songs failed:', (e as Error).message);
    }
    return this.search('轻音乐 钢琴 工作', Math.min(limit, 10));
  }

  async similar(songId: string, limit = 10): Promise<Track[]> {
    try {
      const res = await ncm.simi_song({ ...this.options(), id: songId });
      const songs = res?.body?.songs ?? [];
      const tracks = uniqTracks(songs.map(toTrack)).slice(0, limit);
      if (tracks.length) return tracks;
    } catch (e) {
      console.warn('[netease-unofficial] simi_song failed:', (e as Error).message);
    }
    return this.recommend(limit);
  }

  async favorites(limit = 50): Promise<Track[]> {
    if (!this.cfg.cookie) return this.recommend(limit);

    try {
      const playlistId = this.cfg.favoritePlaylistId || await this.findLikedPlaylistId();
      if (!playlistId) return this.recommend(limit);

      const res = await ncm.playlist_track_all({
        ...this.options(),
        id: playlistId,
        limit,
        offset: 0
      });
      const tracks = uniqTracks(playlistTracks(res).map(toTrack)).slice(0, limit);
      if (tracks.length) return tracks;
    } catch (e) {
      console.warn('[netease-unofficial] favorites failed:', (e as Error).message);
    }
    return this.recommend(limit);
  }

  private async ensureUserId(): Promise<string | null> {
    if (this.userId) return this.userId;
    const res = await ncm.user_account(this.options());
    const id = res?.body?.profile?.userId ?? res?.body?.account?.id;
    this.userId = id ? String(id) : null;
    return this.userId;
  }

  private async findLikedPlaylistId(): Promise<string | null> {
    const uid = await this.ensureUserId();
    if (!uid) return null;

    const res = await ncm.user_playlist({
      ...this.options(),
      uid,
      limit: 50,
      offset: 0
    });
    const playlists: any[] = res?.body?.playlist ?? [];
    const liked = playlists.find((p) => p?.specialType === 5) ?? playlists[0];
    return liked?.id ? String(liked.id) : null;
  }
}
