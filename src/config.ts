import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const llmProvider = (process.env.LLM_PROVIDER ?? 'anthropic') as 'anthropic' | 'openai';
if (llmProvider !== 'anthropic' && llmProvider !== 'openai') {
  throw new Error(`Invalid LLM_PROVIDER: ${llmProvider} (must be "anthropic" or "openai")`);
}

const llm = llmProvider === 'anthropic'
  ? {
      provider: 'anthropic' as const,
      apiKey: required('ANTHROPIC_API_KEY'),
      model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-7'
    }
  : {
      provider: 'openai' as const,
      apiKey: required('OPENAI_API_KEY'),
      baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      model: required('OPENAI_MODEL'),
      webSearch: (process.env.OPENAI_WEB_SEARCH ?? 'false').toLowerCase() === 'true'
    };

const neteaseBackend = (process.env.NETEASE_BACKEND ?? 'unofficial') as 'cli' | 'openapi' | 'unofficial';
if (!['cli', 'openapi', 'unofficial'].includes(neteaseBackend)) {
  throw new Error(`Invalid NETEASE_BACKEND: ${neteaseBackend} (must be "unofficial", "cli", or "openapi")`);
}

export const config = {
  llm,
  netease: {
    backend: neteaseBackend,
    cliCommand: process.env.NETEASE_CLI_COMMAND ?? 'node',
    cliArgs: (process.env.NETEASE_CLI_ARGS ?? './node_modules/@music163/ncm-cli/dist/index.js').split(/\s+/).filter(Boolean),
    cookie: process.env.NETEASE_COOKIE ?? '',
    favoritePlaylistId: process.env.NETEASE_FAVORITE_PLAYLIST_ID ?? '',
    appId: neteaseBackend === 'openapi' ? required('NETEASE_APP_ID') : (process.env.NETEASE_APP_ID ?? ''),
    appSecret: neteaseBackend === 'openapi' ? required('NETEASE_APP_SECRET') : (process.env.NETEASE_APP_SECRET ?? ''),
    privateKeyPath: neteaseBackend === 'openapi' ? required('NETEASE_PRIVATE_KEY_PATH') : (process.env.NETEASE_PRIVATE_KEY_PATH ?? ''),
    redirectUrl: process.env.NETEASE_REDIRECT_URL ?? `http://localhost:${process.env.PORT ?? '3000'}/auth/netease/callback`,
    clientType: process.env.NETEASE_CLIENT_TYPE ?? 'web',
    device: {
      channel: process.env.NETEASE_CHANNEL ?? 'netease',
      deviceId: process.env.NETEASE_DEVICE_ID ?? 'claudio-default-device',
      deviceType: process.env.NETEASE_DEVICE_TYPE ?? 'andrcar',
      appVer: process.env.NETEASE_APP_VER ?? '6.0.0',
      os: process.env.NETEASE_OS ?? 'andrcar',
      osVer: process.env.NETEASE_OS_VER ?? '14',
      brand: process.env.NETEASE_BRAND ?? 'netease',
      model: process.env.NETEASE_MODEL ?? 'claudio',
      clientIp: process.env.NETEASE_CLIENT_IP ?? '127.0.0.1',
      netStatus: process.env.NETEASE_NET_STATUS ?? 'wifi'
    }
  },
  fishAudio: {
    apiKey: required('FISH_AUDIO_API_KEY'),
    voiceId: required('FISH_AUDIO_VOICE_ID'),
    model: process.env.FISH_AUDIO_MODEL ?? 's2-pro'
  },
  openWeatherKey: process.env.OPENWEATHER_API_KEY ?? '',
  city: process.env.CITY ?? 'Hangzhou',
  port: parseInt(process.env.PORT ?? '3000', 10),
  dataDir: './data',
  audioCacheDir: './data/audio-cache'
};

export type LLMConfig =
  | { provider: 'anthropic'; apiKey: string; model: string }
  | { provider: 'openai'; apiKey: string; baseURL: string; model: string; webSearch: boolean };
