import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import axios, { AxiosInstance } from 'axios';

export interface DeviceInfo {
  channel: string;
  deviceId: string;
  deviceType: string;
  appVer: string;
  os: string;
  osVer: string;
  brand: string;
  model: string;
  clientIp: string;
  netStatus: string;
  flowFlag?: string;
}

export interface SignerConfig {
  appId: string;
  appSecret: string;
  privateKeyPath: string;
  device: DeviceInfo;
  baseURL?: string;
}

const PKCS8_HEADER = '-----BEGIN PRIVATE KEY-----';
const PKCS8_FOOTER = '-----END PRIVATE KEY-----';

function loadPrivateKey(path: string): string {
  const raw = readFileSync(path, 'utf8').trim();
  if (raw.includes('BEGIN')) return raw;
  const lines = raw.match(/.{1,64}/g)?.join('\n') ?? raw;
  return `${PKCS8_HEADER}\n${lines}\n${PKCS8_FOOTER}\n`;
}

function buildCanonical(params: Record<string, string>): string {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort();
  return keys.map((k) => `${k}=${params[k]}`).join('&');
}

function rsaSha256Base64(canonical: string, pkcs8Pem: string): string {
  const signer = createSign('RSA-SHA256');
  signer.update(canonical, 'utf8');
  signer.end();
  return signer.sign(pkcs8Pem, 'base64');
}

export class NeteaseSigner {
  private privateKey: string;
  private deviceJson: string;
  private http: AxiosInstance;

  constructor(private cfg: SignerConfig) {
    this.privateKey = loadPrivateKey(cfg.privateKeyPath);
    this.deviceJson = JSON.stringify({ flowFlag: 'init', ...cfg.device });
    this.http = axios.create({
      baseURL: cfg.baseURL ?? 'https://openapi.music.163.com',
      timeout: 15000
    });
  }

  async request<T = any>(
    path: string,
    biz: Record<string, unknown>,
    accessToken?: string
  ): Promise<T> {
    const params: Record<string, string> = {
      appId: this.cfg.appId,
      appSecret: this.cfg.appSecret,
      signType: 'RSA_SHA256',
      timestamp: String(Date.now()),
      bizContent: JSON.stringify(biz),
      device: this.deviceJson
    };
    if (accessToken) params.accessToken = accessToken;

    const canonical = buildCanonical(params);
    const sign = rsaSha256Base64(canonical, this.privateKey);

    const { appSecret, ...wire } = params;
    void appSecret;
    (wire as Record<string, string>).sign = sign;

    const { data } = await this.http.get(path, { params: wire });
    return data as T;
  }
}
