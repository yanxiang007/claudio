import axios, { AxiosInstance } from 'axios';
import type { Track } from '../types.js';

export interface MusicSource {
  search(query: string, limit?: number): Promise<Track[]>;
  getUrl(songId: string): Promise<string | null>;
  recommend(limit?: number): Promise<Track[]>;
  similar(songId: string, limit?: number): Promise<Track[]>;
  favorites(limit?: number): Promise<Track[]>;
}

export class NeteaseClient implements MusicSource {
  private http: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private clientId: string,
    private clientSecret: string,
    private refreshToken: string,
    baseURL = 'https://openapi.music.163.com'
  ) {
    this.http = axios.create({ baseURL, timeout: 10000 });
  }

  private async ensureToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) return this.accessToken;
    const { data } = await this.http.post('/oauth/token', {
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken
    });
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
    return this.accessToken!;
  }

  private async authedGet(path: string, params: Record<string, unknown> = {}) {
    const token = await this.ensureToken();
    const { data } = await this.http.get(path, { params, headers: { Authorization: `Bearer ${token}` } });
    return data;
  }

  private toTrack(raw: any): Track {
    return {
      id: String(raw.id ?? raw.songId),
      title: raw.name ?? raw.title ?? 'unknown',
      artist: (raw.artists ?? raw.ar ?? []).map((a: any) => a.name).join(', ') || 'unknown',
      url: '',
      durationMs: raw.duration ?? raw.dt ?? 0,
      source: 'netease'
    };
  }

  async search(query: string, limit = 10): Promise<Track[]> {
    const data = await this.authedGet('/search', { keywords: query, type: 1, limit });
    const songs = data?.result?.songs ?? [];
    return songs.map((s: any) => this.toTrack(s));
  }

  async getUrl(songId: string): Promise<string | null> {
    try {
      const data = await this.authedGet('/song/url', { id: songId });
      return data?.data?.[0]?.url ?? null;
    } catch { return null; }
  }

  async recommend(limit = 10): Promise<Track[]> {
    const data = await this.authedGet('/recommend/songs', { limit });
    const songs = data?.recommend ?? data?.dailySongs ?? [];
    return songs.slice(0, limit).map((s: any) => this.toTrack(s));
  }

  async similar(songId: string, limit = 10): Promise<Track[]> {
    const data = await this.authedGet('/simi/song', { id: songId, limit });
    const songs = data?.songs ?? [];
    return songs.map((s: any) => this.toTrack(s));
  }

  async favorites(limit = 50): Promise<Track[]> {
    const data = await this.authedGet('/user/favorites', { limit });
    const songs = data?.songs ?? [];
    return songs.map((s: any) => this.toTrack(s));
  }
}
