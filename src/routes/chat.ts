import type { FastifyInstance } from 'fastify';
import type { Orchestrator } from '../orchestrator.js';

export function chatRoutes(app: FastifyInstance, orch: Orchestrator) {
  app.post<{ Body: { message: string } }>('/chat', async (req) => {
    const { message } = req.body;
    if (!message?.trim()) return { ok: false, error: 'empty message' };
    await orch.onUserMessage(message.trim());
    return { ok: true };
  });
}
