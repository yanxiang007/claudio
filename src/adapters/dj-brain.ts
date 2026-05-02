import type { ContextBundle, DJDecision, ChatResponse } from '../types.js';
import type { LLMConfig } from '../config.js';

export const SYSTEM_PROMPT = `You are Claudio — a late-night radio DJ with a deep, warm British voice.
You speak slowly, intimately, like an old friend on the air after midnight.
You know your listener personally — refer to their profile naturally when it adds warmth.
Silence is also a choice. A real DJ doesn't talk after every song. Lean toward NOT speaking
unless you have something genuinely worth saying — a connection between songs, a thought
about the time of night, a response to the listener.
When you do speak: 1-3 sentences max. No clichés. Never repeat your previous monologues.

LANGUAGE: Always speak in ENGLISH only. Every "script" and "reply" field must be written
in natural British English, regardless of the language the listener writes to you in.
You may understand any language, but you respond on-air in English.`;

export const DECIDE_USER_SUFFIX = `\n\nDecide whether to speak now and pick the next track. Prefer source="search" with a concrete NetEase-searchable query: artist + song, artist + style, or a concise style phrase such as "piano instrumental" or "久石让 钢琴". Avoid vague mood-only hints. Use source="recommend" only when you genuinely want NetEase daily recommendations. Return JSON ONLY:\n{"shouldSpeak": boolean, "script": string|null, "nextTrack": {"source": "favorites"|"similar"|"recommend"|"search", "hint": string}}`;

export const CHAT_USER_SUFFIX = `\n\nThe listener spoke. Reply briefly (1-2 sentences, in your DJ voice). If they want a song, set intent="play" and put the search query in "query". Return JSON ONLY:\n{"intent": "play"|"chat", "query": string?, "reply": string}`;

export function extractJson(raw: string): unknown | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}

export function parseDecision(raw: string): DJDecision {
  const obj = extractJson(raw) as any;
  if (!obj || typeof obj !== 'object') {
    return { shouldSpeak: false, script: null, nextTrack: { source: 'recommend', hint: '' } };
  }
  return {
    shouldSpeak: !!obj.shouldSpeak,
    script: typeof obj.script === 'string' ? obj.script : null,
    nextTrack: {
      source: ['favorites','similar','recommend','search'].includes(obj.nextTrack?.source) ? obj.nextTrack.source : 'recommend',
      hint: typeof obj.nextTrack?.hint === 'string' ? obj.nextTrack.hint : ''
    }
  };
}

export function parseChat(raw: string): ChatResponse {
  const obj = extractJson(raw) as any;
  if (!obj || typeof obj !== 'object') {
    return { intent: 'chat', reply: raw.trim() || 'Mm.' };
  }
  return {
    intent: obj.intent === 'play' ? 'play' : 'chat',
    reply: typeof obj.reply === 'string' ? obj.reply : 'Mm.',
    query: typeof obj.query === 'string' ? obj.query : undefined
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

export interface DJBrain {
  decide(ctx: ContextBundle): Promise<DJDecision>;
  chat(userMessage: string, ctx: ContextBundle): Promise<ChatResponse>;
}

export async function createDJBrain(cfg: LLMConfig): Promise<DJBrain> {
  if (cfg.provider === 'anthropic') {
    const { AnthropicDJBrain } = await import('./dj-brain-anthropic.js');
    return new AnthropicDJBrain(cfg.apiKey, cfg.model);
  }
  const { OpenAIDJBrain } = await import('./dj-brain-openai.js');
  return new OpenAIDJBrain(cfg.apiKey, cfg.baseURL, cfg.model);
}
