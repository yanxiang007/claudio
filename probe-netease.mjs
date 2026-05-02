import 'dotenv/config';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import axios from 'axios';

const appId = process.env.NETEASE_APP_ID;
const appSecret = process.env.NETEASE_APP_SECRET;
const keyPath = process.env.NETEASE_PRIVATE_KEY_PATH;

const raw = readFileSync(keyPath, 'utf8').trim();
const privateKey = raw.includes('BEGIN')
  ? raw
  : `-----BEGIN PRIVATE KEY-----\n${raw.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;

function sign(canonical) {
  const s = createSign('RSA-SHA256');
  s.update(canonical, 'utf8');
  s.end();
  return s.sign(privateKey, 'base64');
}

async function probe(label, channel, os, brand) {
  const device = JSON.stringify({
    channel, os, brand,
    deviceId: 'claudio-probe', deviceType: os, appVer: '0.1.0', osVer: '1.0',
    model: 'claudio', clientIp: '127.0.0.1', netStatus: 'wifi'
  });
  const params = {
    appId, appSecret, signType: 'RSA_SHA256',
    timestamp: String(Date.now()),
    bizContent: JSON.stringify({ clientId: appId }),
    device
  };
  const keys = Object.keys(params).filter(k => params[k]).sort();
  const canonical = keys.map(k => `${k}=${params[k]}`).join('&');
  const { appSecret: _, ...wire } = params;
  wire.sign = sign(canonical);
  try {
    const { data } = await axios.get(
      'https://openapi.music.163.com/openapi/music/basic/oauth2/login/anonymous',
      { params: wire, timeout: 8000 }
    );
    const codeStr = data.code === 200 ? '\x1b[32m200 OK\x1b[0m' : `${data.code}`;
    console.log(`[${label.padEnd(40)}] ${codeStr} ${data.message ?? data.msg ?? ''}`);
    return data.code === 200;
  } catch (e) {
    console.log(`[${label.padEnd(40)}] ERR ${e.response?.status ?? e.message}`);
    return false;
  }
}

const channels = ['netease', 'official', 'cli', 'ncm-cli', 'web', 'pc', 'desktop', 'cloudmusic', 'iot'];
const oses = ['windows', 'darwin', 'linux', 'web', 'pc', 'cli', 'node', 'h5', 'desktop', 'cloudmusic'];
const brands = ['netease', 'official', 'cloudmusic', 'pc'];

let found = false;
outer: for (const c of channels) {
  for (const o of oses) {
    for (const b of brands) {
      const ok = await probe(`c=${c} o=${o} b=${b}`, c, o, b);
      if (ok) { found = true; break outer; }
    }
  }
}
if (!found) console.log('\n没有匹配的组合');
