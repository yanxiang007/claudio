import type { Track } from '../types.js';
import type { NeteaseSigner } from './netease-sign.js';
import type { NeteaseAuth } from './netease-auth.js';

export interface MusicSource {
  search(query: string, limit?: number): Promise<Track[]>;
  getUrl(songId: string): Promise<string | null>;
  recommend(limit?: number): Promise<Track[]>;
  similar(songId: string, limit?: number): Promise<Track[]>;
  favorites(limit?: number): Promise<Track[]>;
}

const DAILY_RECOMMEND = '/openapi/music/basic/recommend/songlist/get/v2';
const STYLE_RECOMMEND = '/openapi/music/basic/recommend/style/songlist/get';
const SEARCH_SONG = '/openapi/music/basic/search/song/get/v3';
const SIMILAR_SONG = '/openapi/music/song/simulation/get';
const PLAY_URL = '/openapi/music/basic/song/playurl/get/v2';

function isPlayable(raw: any): boolean {
  if (raw.visible === false) return false;
  if (raw.playFlag === false) return false;
  if (raw.vipFlag || raw.vipPlayFlag) return false;
  if (raw.payPlayFlag) return false;
  return true;
}

function toTrack(raw: any): Track {
  const artists = raw.artists?.length ? raw.artists : raw.fullArtists;
  return {
    id: String(raw.id),
    title: raw.name ?? 'unknown',
    artist: (artists ?? []).map((a: any) => a?.name).filter(Boolean).join(', ') || 'unknown',
    url: '',
    durationMs: raw.duration ?? 0,
    source: 'netease'
  };
}

export class NeteaseClient implements MusicSource {
  constructor(private signer: NeteaseSigner, private auth: NeteaseAuth) {}

  private async call<T = any>(path: string, biz: Record<string, unknown>): Promise<T> {
    const token = await this.auth.getToken();
    return this.signer.request<T>(path, biz, token);
  }

  async search(query: string, limit = 10): Promise<Track[]> {
    const data = await this.call<any>(SEARCH_SONG, { keyword: query, limit, offset: 0 });
    const records: any[] = data?.data?.records ?? [];
    return records.filter(isPlayable).map(toTrack);
  }

  async getUrl(songId: string): Promise<string | null> {
    try {
      const data = await this.call<any>(PLAY_URL, { songId, bitrate: 320 });
      if (data?.subCode && data.subCode !== '200') {
        console.warn(`[netease] playurl ${songId} subCode=${data.subCode} ${data.message ?? ''}`);
        return null;
      }
      return data?.data?.url ?? null;
    } catch (e) {
      console.error('[netease] getUrl failed:', (e as Error).message);
      return null;
    }
  }

  async recommend(limit = 30): Promise<Track[]> {
    const data = await this.call<any>(DAILY_RECOMMEND, { limit: Math.min(limit, 40) });
    const list: any[] = Array.isArray(data?.data) ? data.data : [];
    if (list.length) return list.filter(isPlayable).map(toTrack);
    const styled = await this.call<any>(STYLE_RECOMMEND, { limit: Math.min(limit, 12) });
    const styledList: any[] = styled?.data?.songListVos ?? [];
    return styledList.filter(isPlayable).map(toTrack);
  }

  async similar(songId: string, limit = 10): Promise<Track[]> {
    const data = await this.call<any>(SIMILAR_SONG, { songId, limit: Math.min(limit, 30) });
    const list: any[] = Array.isArray(data?.data) ? data.data : [];
    return list.filter(isPlayable).map(toTrack);
  }

  async favorites(_limit = 50): Promise<Track[]> {
    void _limit;
    return [];
  }
}
