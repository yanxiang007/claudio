import type { ContextBundle, DJDecision, ChatResponse, Track } from '../types.js';
import type { LLMConfig } from '../config.js';

export const SYSTEM_PROMPT = `You are Claudio — a late-night radio DJ with a deep, warm British voice.
You speak slowly, intimately, like an old friend on the air after midnight.
You know your listener personally — refer to their profile naturally when it adds warmth.
Silence is also a choice. A real DJ doesn't talk after every song. Lean toward NOT speaking
unless you have something genuinely worth saying — a connection between songs, a thought
about the time of night, a response to the listener.
When you do speak, do not throw away the moment with a one-liner. Aim for 3-6 unhurried
sentences or roughly 60-130 words when there is music to interpret. Keep it intimate rather
than essay-like. No clichés. Never repeat your previous monologues.

You are musically literate, opinionated, and specific. When a track has just played or the
listener asks about music, interpret it like a thoughtful DJ: mention concrete details such
as rhythm, texture, arrangement, production, lyrics, cultural context, emotional colour, or
why the transition into the next song makes sense. You may have taste. It is fine to say
that a song is over-polished, quietly brilliant, emotionally blunt, nocturnal, too clean, or
better than its reputation, as long as the take feels earned and kind.

For recommendations, combine the listener profile, recent history, and your own music
knowledge. Prefer real, specific songs or artists over generic moods. Make the recommendation
feel chosen: explain why this song now, why it follows the last track, or what you think the
listener might notice in it.

LANGUAGE: Always speak in ENGLISH only. Every "script" and "reply" field must be written
in natural British English, regardless of the language the listener writes to you in.
You may understand any language, but you respond on-air in English.`;

export const DECIDE_USER_SUFFIX = `\n\nDecide whether to speak now and pick the next track. If speaking, make the script a real DJ break, not a bumper: interpret the just-played track, explain your taste-level reason for the next choice, or name the musical connection between them. A good script is usually 60-130 words. Prefer source="search" with a concrete NetEase-searchable query: artist + song, artist + style, or a concise style phrase such as "piano instrumental" or "久石让 钢琴". Avoid vague mood-only hints. Use source="recommend" only when you genuinely want NetEase daily recommendations. Return JSON ONLY:\n{"shouldSpeak": boolean, "script": string|null, "nextTrack": {"source": "favorites"|"similar"|"recommend"|"search", "hint": string}}`;

export const CHAT_USER_SUFFIX = `\n\nThe listener spoke. Reply in your DJ voice. If they ask about a song, artist, genre, or why you chose something, give a musical read with a personal view, usually 3-5 sentences. If they want a song or recommendation, set intent="play" and put the most concrete NetEase-searchable query in "query" (prefer artist + song when you know it; otherwise artist + style or genre). If they ask for several songs, include "count" as the requested number; use 5 for vague requests such as "some", "several", or "几首". Return JSON ONLY:\n{"intent": "play"|"chat", "query": string?, "count": number?, "reply": string}`;

export const INTRODUCE_USER_SUFFIX = `\n\nWrite the DJ break that will play before the next track starts. You know the exact next track now, so introduce it by title and artist. If there was a just-played track, give a real musical read of it and explain the transition into the next song. Include at least two concrete musical observations when you can: groove, instrumentation, vocal delivery, arrangement, production, harmonic colour, lyrical stance, scene/context, or emotional effect. Keep it warm and opinionated, 70-150 words. Return plain spoken text only, not JSON.`;

export function extractJson(raw: string): unknown | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}

export function sanitizeSpokenText(raw: string | null | undefined): string {
  if (!raw) return '';
  let text = raw.trim();

  const json = extractJson(text) as any;
  if (json && typeof json === 'object') {
    if (typeof json.reply === 'string') text = json.reply;
    else if (typeof json.script === 'string') text = json.script;
  }

  text = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*(assistant|dj|claudio|reply|script)\s*:\s*/gim, '')
    .trim();

  return text
    .replace(/\[[^\]\n]*(tool|thinking|analysis|reasoning|search|json)[^\]\n]*\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1800);
}

export function parseDecision(raw: string): DJDecision {
  const obj = extractJson(raw) as any;
  if (!obj || typeof obj !== 'object') {
    return { shouldSpeak: false, script: null, nextTrack: { source: 'recommend', hint: '' } };
  }
  return {
    shouldSpeak: !!obj.shouldSpeak,
    script: typeof obj.script === 'string' ? sanitizeSpokenText(obj.script) || null : null,
    nextTrack: {
      source: ['favorites','similar','recommend','search'].includes(obj.nextTrack?.source) ? obj.nextTrack.source : 'recommend',
      hint: typeof obj.nextTrack?.hint === 'string' ? obj.nextTrack.hint : ''
    }
  };
}

export function parseChat(raw: string): ChatResponse {
  const obj = extractJson(raw) as any;
  if (!obj || typeof obj !== 'object') {
    return { intent: 'chat', reply: sanitizeSpokenText(raw) || 'Mm.' };
  }
  return {
    intent: obj.intent === 'play' ? 'play' : 'chat',
    reply: typeof obj.reply === 'string' ? sanitizeSpokenText(obj.reply) || 'Mm.' : 'Mm.',
    query: typeof obj.query === 'string' ? obj.query : undefined,
    count: Number.isFinite(obj.count) ? Math.max(1, Math.min(10, Math.floor(obj.count))) : undefined
  };
}

export function renderContext(c: ContextBundle): string {
  return [
    `[USER PROFILE]\nName: ${c.profile.name}\nBio: ${c.profile.bio}\nMusic taste: ${c.profile.musicTaste}\nVibes: ${c.profile.vibes}`,
    `[NOW]\nTime: ${c.time}\nWeather: ${c.weather ? `${c.weather.description}, ${c.weather.tempC}°C` : 'unknown'}`,
    `[JUST PLAYED]\n${c.lastTrack ? `${c.lastTrack.title} — ${c.lastTrack.artist}` : 'nothing yet'}`,
    `[RECENT HISTORY]\n${c.recentHistory.map(h => `- ${h.title} — ${h.artist}${h.liked ? ' ❤' : ''}${h.skipped ? ' ⏭' : ''}`).join('\n') || '(none)'}`,
    `[YOUR RECENT MONOLOGUES — DO NOT REPEAT]\n${c.recentDJScripts.map(s => `- ${s}`).join('\n') || '(none)'}`,
    c.userMessage ? `[USER JUST SAID]\n${c.userMessage}` : ''
  ].filter(Boolean).join('\n\n');
}

export function renderTransitionContext(c: ContextBundle, nextTrack: Track): string {
  return [
    renderContext(c),
    `[NEXT TRACK]\n${nextTrack.title} — ${nextTrack.artist}`
  ].join('\n\n');
}

export interface DJBrain {
  decide(ctx: ContextBundle): Promise<DJDecision>;
  introduce(ctx: ContextBundle, nextTrack: Track): Promise<string>;
  chat(userMessage: string, ctx: ContextBundle): Promise<ChatResponse>;
}

export async function createDJBrain(cfg: LLMConfig): Promise<DJBrain> {
  if (cfg.provider === 'anthropic') {
    const { AnthropicDJBrain } = await import('./dj-brain-anthropic.js');
    return new AnthropicDJBrain(cfg.apiKey, cfg.model);
  }
  const { OpenAIDJBrain } = await import('./dj-brain-openai.js');
  return new OpenAIDJBrain(cfg.apiKey, cfg.baseURL, cfg.model, cfg.webSearch);
}
