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
      model: required('OPENAI_MODEL')
    };

export const config = {
  llm,
  netease: {
    clientId: required('NETEASE_CLIENT_ID'),
    clientSecret: required('NETEASE_CLIENT_SECRET'),
    refreshToken: process.env.NETEASE_REFRESH_TOKEN ?? ''
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
  | { provider: 'openai'; apiKey: string; baseURL: string; model: string };
