import Anthropic from '@anthropic-ai/sdk';
import type { ContextBundle, DJDecision, ChatResponse } from '../types.js';
import {
  type DJBrain,
  SYSTEM_PROMPT,
  DECIDE_USER_SUFFIX,
  CHAT_USER_SUFFIX,
  parseDecision,
  parseChat,
  renderContext
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
        max_tokens: 400,
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
        max_tokens: 300,
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
}
