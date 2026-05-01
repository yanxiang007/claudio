import axios from 'axios';
import { createHash } from 'node:crypto';
import { writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';

export class FishAudioClient {
  constructor(
    private apiKey: string,
    private voiceId: string,
    private cacheDir: string
  ) {}

  private hash(text: string): string {
    return createHash('sha256').update(this.voiceId + '|' + text).digest('hex').slice(0, 16);
  }

  async synthesize(text: string): Promise<{ audioUrl: string; filePath: string } | null> {
    const id = this.hash(text);
    const fileName = `${id}.mp3`;
    const filePath = join(this.cacheDir, fileName);
    const audioUrl = `/audio-cache/${fileName}`;

    try { await access(filePath); return { audioUrl, filePath }; } catch {}

    try {
      await mkdir(this.cacheDir, { recursive: true });
      const { data } = await axios.post(
        'https://api.fish.audio/v1/tts',
        { text, reference_id: this.voiceId, format: 'mp3' },
        {
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          responseType: 'arraybuffer',
          timeout: 30000
        }
      );
      await writeFile(filePath, Buffer.from(data));
      return { audioUrl, filePath };
    } catch (e) {
      const err = e as any;
      const status = err?.response?.status;
      const body = err?.response?.data;
      let bodyStr = '';
      if (body) {
        try {
          bodyStr = Buffer.isBuffer(body) ? body.toString('utf8') : JSON.stringify(body);
        } catch { bodyStr = String(body); }
      }
      console.error(`[fish-audio] synthesize failed: status=${status ?? 'n/a'} message="${err?.message ?? ''}" body=${bodyStr}`);
      return null;
    }
  }
}
