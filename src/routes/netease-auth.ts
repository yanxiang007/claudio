import type { FastifyInstance } from 'fastify';
import type { NeteaseAuth } from '../adapters/netease-auth.js';

export function neteaseAuthRoutes(app: FastifyInstance, auth: NeteaseAuth): void {
  app.get('/auth/netease/login', async (_req, reply) => {
    return reply.redirect(auth.createWebLoginUrl());
  });

  app.get('/auth/netease/callback', async (req, reply) => {
    const query = req.query as { code?: string; state?: string };
    if (!query.code) {
      return reply.code(400).send('Missing NetEase authorization code.');
    }

    await auth.loginWithGrantCode(query.code, query.state);
    return reply.type('text/html; charset=utf-8').send(`
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8"><title>NetEase Login</title></head>
  <body>
    <p>网易云音乐授权成功，可以回到 Claudio 继续播放。</p>
  </body>
</html>`);
  });
}
