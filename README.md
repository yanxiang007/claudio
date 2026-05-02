# Claudio

Personal AI radio. Late-night-DJ Claude over your NetEase library, with British TTS via Fish Audio.

## Setup

1. `npm install`
2. Install and set up the official NetEase CLI:
   ```powershell
   npm install -g @music163/ncm-cli
   ncm-cli configure
   ncm-cli login
   ```
3. `cp .env.example .env` and fill in keys:
   - `ANTHROPIC_API_KEY` — your Anthropic key
   - `NETEASE_BACKEND=cli` — recommended for personal developer access
   - `NETEASE_CLI_COMMAND=ncm-cli` — path/name of the official CLI executable
   - `NETEASE_APP_ID` / `NETEASE_APP_SECRET` / `NETEASE_PRIVATE_KEY_PATH` — only needed when using `NETEASE_BACKEND=openapi`
   - `NETEASE_REDIRECT_URL` / `NETEASE_CLIENT_TYPE` — only needed for the OpenAPI Web OAuth path
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

Useful NetEase commands:

```powershell
npm run netease:configure
npm run netease:login
npm run verify:netease
```

## Tests

`npm test` — unit + integration tests, all externals mocked.

## How it works

- A track plays. About 5 seconds before it ends, the browser pings `/track/ending`.
- The orchestrator gathers context (time, weather, listener profile, recent history, what the DJ already said), asks Claude whether to speak and what to play next.
- If Claude wants to speak, Fish Audio synthesizes the line; the browser plays it before the next track.
- The chat box lets you talk to the DJ — request songs, ask questions, just say hi.

## Caveats

- Personal developer access should use the official `ncm-cli` backend. In this mode Claudio asks the LLM what to play, then delegates NetEase search/recommend/playback to `ncm-cli` and mpv.
- The browser UI does not stream NetEase audio in CLI mode; the official CLI/mpv player handles music playback locally.
- The OpenAPI OAuth path is still available with `NETEASE_BACKEND=openapi`, but the callback URL and public request parameters must match the NetEase console configuration.
- NetEase endpoint paths in `src/adapters/netease.ts` are best-effort. Confirm against the official open-platform docs and adjust if needed.
- DJ may decide to stay quiet — that is by design.
