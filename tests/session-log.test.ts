import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionLogStore } from '../src/storage/session-log.js';

describe('SessionLogStore', () => {
  it('appends session events to the daily jsonl file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'claudio-session-'));
    const store = new SessionLogStore(dir);

    await store.record({ type: 'session-started', payload: { test: true } });
    await store.record({ type: 'dj-speaking', payload: { text: 'On air.' } });

    const today = new Date().toISOString().slice(0, 10);
    const raw = await readFile(join(dir, `${today}.sessions.jsonl`), 'utf8');
    const rows = raw.trim().split('\n').map((line) => JSON.parse(line));

    expect(rows).toHaveLength(2);
    expect(rows[0].sessionId).toBe(store.sessionId);
    expect(rows[1].sessionId).toBe(store.sessionId);
    expect(rows[1].payload.text).toBe('On air.');
  });
});
