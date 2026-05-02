import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type SessionLogEventType =
  | 'session-started'
  | 'user-message'
  | 'dj-speaking'
  | 'track-changed'
  | 'queue-update'
  | 'skip';

export interface SessionLogEvent {
  type: SessionLogEventType;
  payload?: unknown;
}

export class SessionLogStore {
  readonly sessionId = randomUUID();

  constructor(private dir: string) {}

  async record(event: SessionLogEvent): Promise<void> {
    const ts = new Date();
    const entry = {
      ts: ts.toISOString(),
      sessionId: this.sessionId,
      ...event
    };

    await mkdir(this.dir, { recursive: true });
    await appendFile(this.pathFor(ts), `${JSON.stringify(entry)}\n`, 'utf8');
  }

  private pathFor(date: Date): string {
    return join(this.dir, `${date.toISOString().slice(0, 10)}.sessions.jsonl`);
  }
}
