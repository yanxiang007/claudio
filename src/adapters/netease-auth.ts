import type { NeteaseSigner } from './netease-sign.js';
import type { NeteaseTokenStore } from '../storage/netease-tokens.js';
import { randomBytes } from 'node:crypto';

const ANON_LOGIN = '/openapi/music/basic/oauth2/login/anonymous';
const AUTH_CODE_TOKEN = '/openapi/music/basic/user/oauth2/token/get/v2';
const TOKEN_REFRESH = '/openapi/music/basic/user/oauth2/token/refresh/v2';
const WEB_AUTHORIZE_URL = 'https://music.163.com/st/platform/oauth/authorize';

const REFRESH_GRACE_MS = 24 * 60 * 60 * 1000;

export class NeteaseAuth {
  private pendingState: string | null = null;

  constructor(
    private signer: NeteaseSigner,
    private store: NeteaseTokenStore,
    private appId: string,
    private appSecret: string,
    private web: { redirectUrl: string; clientType: string }
  ) {}

  async ensureAnonToken(): Promise<string> {
    const cached = this.store.getAnon();
    if (cached?.accessToken) return cached.accessToken;
    const data = await this.signer.request<any>(ANON_LOGIN, { clientId: this.appId });
    const accessToken = data?.data?.accessToken;
    if (!accessToken) throw new Error(`anonymous login failed: ${JSON.stringify(data)}`);
    this.store.setAnon({ accessToken });
    return accessToken;
  }

  async ensureUserToken(): Promise<string | null> {
    const u = this.store.getUser();
    if (!u) return null;
    if (Date.now() < u.expiresAt - REFRESH_GRACE_MS) return u.accessToken;
    try {
      const data = await this.signer.request<any>(TOKEN_REFRESH, {
        clientId: this.appId,
        clientSecret: this.appSecret,
        refreshToken: u.refreshToken
      });
      const d = data?.data;
      if (!d?.accessToken) throw new Error(`refresh failed: ${JSON.stringify(data)}`);
      const expiresAt = Date.now() + (d.expiresTime ?? 7 * 86400) * 1000;
      this.store.setUser({ accessToken: d.accessToken, refreshToken: d.refreshToken, expiresAt });
      return d.accessToken;
    } catch (e) {
      console.error('[netease-auth] token refresh failed:', (e as Error).message);
      this.store.clearUser();
      return null;
    }
  }

  async getToken(): Promise<string> {
    const user = await this.ensureUserToken();
    if (user) return user;
    return this.ensureAnonToken();
  }

  createWebLoginUrl(): string {
    this.pendingState = randomBytes(12).toString('hex');
    const url = new URL(WEB_AUTHORIZE_URL);
    url.searchParams.set('clientId', this.appId);
    url.searchParams.set('state', this.pendingState);
    url.searchParams.set('clientType', this.web.clientType);
    url.searchParams.set('redirectUrl', this.web.redirectUrl);
    return url.toString();
  }

  async loginWithGrantCode(code: string, state?: string): Promise<void> {
    if (this.pendingState && state && state !== this.pendingState) {
      throw new Error('网易云 OAuth state 校验失败');
    }

    const data = await this.signer.request<any>(AUTH_CODE_TOKEN, {
      clientId: this.appId,
      clientSecret: this.appSecret,
      grantCode: code
    });
    const d = data?.data;
    if (!d?.accessToken) throw new Error(`authorization code exchange failed: ${JSON.stringify(data)}`);

    const seconds = d.expiresTime ?? d.expireTime ?? 7 * 86400;
    this.store.setUser({
      accessToken: d.accessToken,
      refreshToken: d.refreshToken,
      expiresAt: Date.now() + seconds * 1000
    });
    this.pendingState = null;
  }
}
