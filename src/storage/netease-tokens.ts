import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface AnonToken {
  accessToken: string;
}

export interface UserToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface TokenBundle {
  anon?: AnonToken;
  user?: UserToken;
}

export class NeteaseTokenStore {
  private path: string;
  private cache: TokenBundle;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'netease-tokens.json');
    this.cache = this.read();
  }

  private read(): TokenBundle {
    if (!existsSync(this.path)) return {};
    try {
      return JSON.parse(readFileSync(this.path, 'utf8'));
    } catch {
      return {};
    }
  }

  private write(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.cache, null, 2), 'utf8');
  }

  getAnon(): AnonToken | undefined { return this.cache.anon; }
  getUser(): UserToken | undefined { return this.cache.user; }

  setAnon(t: AnonToken): void { this.cache.anon = t; this.write(); }
  setUser(t: UserToken): void { this.cache.user = t; this.write(); }
  clearUser(): void { delete this.cache.user; this.write(); }
}
