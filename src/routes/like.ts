import type { FastifyInstance } from 'fastify';
import type { UserProfileStore } from '../storage/user-profile.js';

export function likeRoutes(app: FastifyInstance, profile: UserProfileStore) {
  app.post<{ Body: { trackId: string } }>('/like', async (req) => {
    await profile.like(req.body.trackId);
    return { ok: true };
  });
}
