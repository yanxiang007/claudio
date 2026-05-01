import OpenAI from 'openai';
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

export class OpenAIDJBrain implements DJBrain {
  private client: OpenAI;

  constructor(apiKey: string, baseURL: string, private model: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async decide(ctx: ContextBundle): Promise<DJDecision> {
    try {
      const resp = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 400,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: renderContext(ctx) + DECIDE_USER_SUFFIX }
        ]
      });
      const text = resp.choices[0]?.message?.content ?? '';
      return parseDecision(text);
    } catch (e) {
      console.error('[openai] decide failed:', (e as Error).message);
      return { shouldSpeak: false, script: null, nextTrack: { source: 'recommend', hint: '' } };
    }
  }

  async chat(userMessage: string, ctx: ContextBundle): Promise<ChatResponse> {
    try {
      const resp = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 300,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: renderContext({ ...ctx, userMessage }) + CHAT_USER_SUFFIX }
        ]
      });
      const text = resp.choices[0]?.message?.content ?? '';
      return parseChat(text);
    } catch (e) {
      console.error('[openai] chat failed:', (e as Error).message);
      return { intent: 'chat', reply: 'Mm. Sorry — I drifted off for a second.' };
    }
  }
}
