import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Track } from '../types.js';
import type { MusicSource } from './netease.js';

const execFileAsync = promisify(execFile);

export interface NeteaseCliConfig {
  command: string;
  args?: string[];
  timeoutMs?: number;
}

interface CliTrackIds {
  encryptedId: string;
  originalId?: string;
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function cleanCell(text: string): string {
  return stripAnsi(text)
    .replace(/[│┃║]/g, ' ')
    .replace(/[┌┐└┘├┤┬┴┼─━═]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function encodeTrackId(ids: CliTrackIds): string {
  return [ids.encryptedId, ids.originalId ?? ''].map(encodeURIComponent).join('|');
}

function decodeTrackId(id: string): CliTrackIds {
  const [encryptedId, originalId] = id.split('|').map((part) => decodeURIComponent(part ?? ''));
  return { encryptedId, originalId: originalId || undefined };
}

function findString(obj: any, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

function findArtists(obj: any): string {
  const direct = findString(obj, ['artist', 'artists', 'artistName', 'author', 'singer']);
  if (direct) return direct;
  const list = obj?.artists ?? obj?.ar ?? obj?.singers;
  if (Array.isArray(list)) {
    return list.map((a) => a?.name ?? a?.artistName ?? a).filter(Boolean).join(', ');
  }
  return 'unknown';
}

function tracksFromJson(value: any): Track[] {
  const out: Track[] = [];
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const looksLikeSong = (
      (typeof node.jumpUrl === 'string' && node.jumpUrl.startsWith('orpheus://song/')) ||
      (node.originalId !== undefined && node.duration !== undefined && Array.isArray(node.artists))
    );
    const encryptedId = findString(node, ['encryptedId', 'encrypted_id', 'id']);
    const originalId = findString(node, ['originalId', 'original_id', 'songId', 'originalSongId']);
    const title = findString(node, ['title', 'name', 'songName']);
    if (looksLikeSong && encryptedId && originalId && title) {
      out.push({
        id: encodeTrackId({ encryptedId, originalId }),
        title,
        artist: findArtists(node),
        url: '',
        durationMs: Number(node.duration ?? node.durationMs ?? 0),
        source: 'netease'
      });
    }
    if (Array.isArray(node)) node.forEach(visit);
    else Object.values(node).forEach(visit);
  };
  visit(value);
  return out;
}

function parseJsonBlocks(text: string): Track[] {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(trimmed.slice(objectStart, objectEnd + 1));

  for (const candidate of candidates) {
    try {
      const tracks = tracksFromJson(JSON.parse(candidate));
      if (tracks.length) return tracks;
    } catch {
      // Fall through to text parsing.
    }
  }
  return [];
}

function parseTextTracks(text: string): Track[] {
  const lines = stripAnsi(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const tracks: Track[] = [];
  let pending: Partial<Track> & Partial<CliTrackIds> = {};

  const flush = () => {
    if (!pending.title || !pending.encryptedId) return;
    tracks.push({
      id: encodeTrackId({ encryptedId: pending.encryptedId, originalId: pending.originalId }),
      title: pending.title,
      artist: pending.artist || 'unknown',
      url: '',
      durationMs: pending.durationMs || 0,
      source: 'netease'
    });
    pending = {};
  };

  for (const rawLine of lines) {
    const line = cleanCell(rawLine);
    const encrypted = line.match(/(?:encryptedId|encrypted id|加密\s*id|加密ID)[:：\s]+(\S+)/i);
    const original = line.match(/(?:originalId|original id|原始\s*id|原始ID|songId)[:：\s]+(\S+)/i);
    if (encrypted) pending.encryptedId = encrypted[1];
    if (original) pending.originalId = original[1];

    const listed = line.match(/^\s*(?:\d+[\).、]\s*)?(.+?)\s+(?:-|—|--)\s+(.+?)\s{2,}(\S+)(?:\s+(\S+))?\s*$/);
    if (listed) {
      flush();
      pending.title = listed[1].trim();
      pending.artist = listed[2].trim();
      pending.encryptedId = listed[3];
      pending.originalId = listed[4];
      flush();
      continue;
    }

    const simple = line.match(/^\s*(?:\d+[\).、]\s*)?(.+?)\s+(?:-|—|--)\s+(.+)$/);
    if (simple && !/id|命令|搜索|推荐|播放/i.test(simple[1])) {
      flush();
      pending.title = simple[1].trim();
      pending.artist = simple[2].trim();
    }

    if (pending.title && pending.encryptedId) flush();
  }
  flush();
  return tracks;
}

function parseTracks(stdout: string): Track[] {
  const jsonTracks = parseJsonBlocks(stdout);
  if (jsonTracks.length) return jsonTracks;
  return parseTextTracks(stdout);
}

function quoteCmdArg(arg: string): string {
  if (!/[()\s^&|<>"]/g.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

export class NeteaseCliClient implements MusicSource {
  private timeoutMs: number;
  private baseArgs: string[];

  constructor(private cfg: NeteaseCliConfig) {
    this.timeoutMs = cfg.timeoutMs ?? 30000;
    this.baseArgs = cfg.args ?? [];
  }

  private async run(args: string[]): Promise<string> {
    const env = { ...process.env };
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'Path';
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === 'path' && key !== pathKey) delete env[key];
    }
    env[pathKey] = [
      env[pathKey] ?? '',
      'C:\\Program Files\\MPV Player',
      'C:\\Users\\sweet\\AppData\\Roaming\\npm'
    ].filter(Boolean).join(';');
    const fullArgs = [...this.baseArgs, ...args];
    const needsCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(this.cfg.command);
    const command = needsCmdShim
      ? (process.env.ComSpec ?? 'cmd.exe')
      : this.cfg.command;
    const commandArgs = needsCmdShim
      ? ['/d', '/c', [this.cfg.command, ...fullArgs].map(quoteCmdArg).join(' ')]
      : fullArgs;

    const { stdout, stderr } = await execFileAsync(command, commandArgs, {
      timeout: this.timeoutMs,
      windowsHide: true,
      env,
      maxBuffer: 1024 * 1024 * 4
    });
    const text = `${stdout ?? ''}\n${stderr ?? ''}`.trim();
    return stripAnsi(text);
  }

  async search(query: string, limit = 10): Promise<Track[]> {
    const out = await this.run(['search', 'song', `--keyword=${query}`, '--limit', String(limit)]);
    return parseTracks(out).slice(0, limit);
  }

  async getUrl(songId: string): Promise<string | null> {
    const ids = decodeTrackId(songId);
    if (!ids.encryptedId) return null;
    const args = ['play', '--song', '--encrypted-id', ids.encryptedId];
    if (ids.originalId) args.push('--original-id', ids.originalId);
    await this.run(args);
    return `ncm-cli://${encodeURIComponent(songId)}`;
  }

  async recommend(limit = 30): Promise<Track[]> {
    const out = await this.run(['recommend', 'daily', '--limit', String(limit)]);
    return parseTracks(out).slice(0, limit);
  }

  async similar(_songId: string, limit = 10): Promise<Track[]> {
    return this.recommend(limit);
  }

  async favorites(limit = 50): Promise<Track[]> {
    return this.recommend(limit);
  }
}
