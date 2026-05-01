import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const config = {
  anthropicKey: required('ANTHROPIC_API_KEY'),
  netease: {
    clientId: required('NETEASE_CLIENT_ID'),
    clientSecret: required('NETEASE_CLIENT_SECRET'),
    refreshToken: process.env.NETEASE_REFRESH_TOKEN ?? ''
  },
  fishAudio: {
    apiKey: required('FISH_AUDIO_API_KEY'),
    voiceId: required('FISH_AUDIO_VOICE_ID')
  },
  openWeatherKey: process.env.OPENWEATHER_API_KEY ?? '',
  city: process.env.CITY ?? 'Hangzhou',
  port: parseInt(process.env.PORT ?? '3000', 10),
  dataDir: './data',
  audioCacheDir: './data/audio-cache'
};
