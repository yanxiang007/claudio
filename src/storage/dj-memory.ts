import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export class DJMemoryStore {
  constructor(private dir: string) {}

  async recent(n: number): Promise<string[]> {
    try {
      const raw = await readFile(join(this.dir, 'dj-memory.json'), 'utf8');
      const arr = JSON.parse(raw) as string[];
      return arr.slice(-n);
    } catch { return []; }
  }

  async record(script: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const arr: string[] = await this.recent(50).catch(() => []);
    arr.push(script);
    await writeFile(join(this.dir, 'dj-memory.json'), JSON.stringify(arr.slice(-50), null, 2));
  }
}
