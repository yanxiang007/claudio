import OpenAI from 'openai';
import type { ContextBundle, DJDecision, ChatResponse, Track } from '../types.js';
import {
  type DJBrain,
  SYSTEM_PROMPT,
  DECIDE_USER_SUFFIX,
  CHAT_USER_SUFFIX,
  INTRODUCE_USER_SUFFIX,
  parseDecision,
  parseChat,
  sanitizeSpokenText,
  renderContext,
  renderTransitionContext
} from './dj-brain.js';

export class OpenAIDJBrain implements DJBrain {
  private client: OpenAI;
  private useWebSearch: boolean;

  constructor(apiKey: string, baseURL: string, private model: string, webSearch = true) {
    this.client = new OpenAI({ apiKey, baseURL });
    this.useWebSearch = webSearch && baseURL.includes('api.openai.com');
  }

  async decide(ctx: ContextBundle): Promise<DJDecision> {
    try {
      const text = this.useWebSearch
        ? await this.respondWithSearch(renderContext(ctx) + DECIDE_USER_SUFFIX, 900)
        : await this.respondWithChat(renderContext(ctx) + DECIDE_USER_SUFFIX, 900);
      return parseDecision(text);
    } catch (e) {
      console.error('[openai] decide failed:', (e as Error).message);
      return { shouldSpeak: false, script: null, nextTrack: { source: 'recommend', hint: '' } };
    }
  }

  async chat(userMessage: string, ctx: ContextBundle): Promise<ChatResponse> {
    try {
      const prompt = renderContext({ ...ctx, userMessage }) + CHAT_USER_SUFFIX;
      const text = this.useWebSearch
        ? await this.respondWithSearch(prompt, 800)
        : await this.respondWithChat(prompt, 800);
      return parseChat(text);
    } catch (e) {
      console.error('[openai] chat failed:', (e as Error).message);
      return { intent: 'chat', reply: 'Mm. Sorry — I drifted off for a second.' };
    }
  }

  async introduce(ctx: ContextBundle, nextTrack: Track): Promise<string> {
    try {
      const prompt = renderTransitionContext(ctx, nextTrack) + INTRODUCE_USER_SUFFIX;
      const text = this.useWebSearch
        ? await this.respondWithSearch(prompt, 900)
        : await this.respondWithChat(prompt, 900);
      return sanitizeSpokenText(text);
    } catch (e) {
      console.error('[openai] introduce failed:', (e as Error).message);
      return `Let's move into ${nextTrack.title} by ${nextTrack.artist}.`;
    }
  }

  private async respondWithChat(prompt: string, maxTokens: number): Promise<string> {
    const resp = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]
    });
    return resp.choices[0]?.message?.content ?? '';
  }

  private async respondWithSearch(prompt: string, maxTokens: number): Promise<string> {
    try {
      const resp = await this.client.responses.create({
        model: this.model,
        instructions: SYSTEM_PROMPT,
        input: prompt,
        max_output_tokens: maxTokens,
        tools: [{ type: 'web_search_preview', search_context_size: 'low' }]
      });
      return resp.output_text ?? '';
    } catch (e) {
      console.warn('[openai] web search response failed, falling back to chat:', (e as Error).message);
      return this.respondWithChat(prompt, maxTokens);
    }
  }
}
