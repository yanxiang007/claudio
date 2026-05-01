import type { FastifyInstance } from 'fastify';
import type { EventBus } from '../event-bus.js';

export function eventsRoute(app: FastifyInstance, bus: EventBus) {
  app.get('/events', (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    reply.raw.write(': connected\n\n');

    const unsub = bus.subscribe((e) => {
      reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
    });

    const keepalive = setInterval(() => reply.raw.write(': ping\n\n'), 15000);
    req.raw.on('close', () => { clearInterval(keepalive); unsub(); });
  });
}
