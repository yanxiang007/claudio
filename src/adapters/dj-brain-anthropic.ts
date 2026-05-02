import Anthropic from '@anthropic-ai/sdk';
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

export class AnthropicDJBrain implements DJBrain {
  private client: Anthropic;

  constructor(apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey });
  }

  async decide(ctx: ContextBundle): Promise<DJDecision> {
    try {
      const resp = await this.client.messages.create({
        model: this.model,
        max_tokens: 900,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: renderContext(ctx) + DECIDE_USER_SUFFIX }]
      });
      const text = resp.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
      return parseDecision(text);
    } catch (e) {
      console.error('[anthropic] decide failed:', (e as Error).message);
      return { shouldSpeak: false, script: null, nextTrack: { source: 'recommend', hint: '' } };
    }
  }

  async chat(userMessage: string, ctx: ContextBundle): Promise<ChatResponse> {
    try {
      const resp = await this.client.messages.create({
        model: this.model,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: renderContext({ ...ctx, userMessage }) + CHAT_USER_SUFFIX }]
      });
      const text = resp.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
      return parseChat(text);
    } catch (e) {
      console.error('[anthropic] chat failed:', (e as Error).message);
      return { intent: 'chat', reply: 'Mm. Sorry — I drifted off for a second.' };
    }
  }

  async introduce(ctx: ContextBundle, nextTrack: Track): Promise<string> {
    try {
      const resp = await this.client.messages.create({
        model: this.model,
        max_tokens: 900,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: renderTransitionContext(ctx, nextTrack) + INTRODUCE_USER_SUFFIX }]
      });
      const text = resp.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
      return sanitizeSpokenText(text);
    } catch (e) {
      console.error('[anthropic] introduce failed:', (e as Error).message);
      return `Let's move into ${nextTrack.title} by ${nextTrack.artist}.`;
    }
  }
}
