import type { FastifyInstance } from 'fastify';
import type { Orchestrator } from '../orchestrator.js';

export function trackRoutes(app: FastifyInstance, orch: Orchestrator) {
  app.post('/track/ending', async () => { await orch.onTrackEnding(); return { ok: true }; });
  app.post('/track/skip', async () => { await orch.onSkip(); return { ok: true }; });
  app.post('/track/start', async () => { await orch.start(); return { ok: true }; });
}
