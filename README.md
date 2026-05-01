# Claudio

Personal AI radio. Late-night-DJ Claude over your NetEase library, with British TTS via Fish Audio.

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in keys:
   - `ANTHROPIC_API_KEY` — your Anthropic key
   - `NETEASE_CLIENT_ID` / `NETEASE_CLIENT_SECRET` / `NETEASE_REFRESH_TOKEN` — from developer.music.163.com
   - `FISH_AUDIO_API_KEY` / `FISH_AUDIO_VOICE_ID` — Fish Audio account + the voice you picked
   - `OPENWEATHER_API_KEY` (optional) — free tier is fine
   - `CITY` — your city for weather context
3. Seed `data/profile.json` so the DJ knows you:
   ```json
   {
     "name": "your name",
     "bio": "what you do",
     "musicTaste": "indie folk, post-rock, …",
     "vibes": "deep work at night without lyrics"
   }
   ```
4. `npm run dev`
5. Open http://localhost:3000

## Tests

`npm test` — unit + integration tests, all externals mocked.

## How it works

- A track plays. About 5 seconds before it ends, the browser pings `/track/ending`.
- The orchestrator gathers context (time, weather, listener profile, recent history, what the DJ already said), asks Claude whether to speak and what to play next.
- If Claude wants to speak, Fish Audio synthesizes the line; the browser plays it before the next track.
- The chat box lets you talk to the DJ — request songs, ask questions, just say hi.

## Caveats

- NetEase endpoint paths in `src/adapters/netease.ts` are best-effort. Confirm against the official open-platform docs and adjust if needed.
- DJ may decide to stay quiet — that is by design.
