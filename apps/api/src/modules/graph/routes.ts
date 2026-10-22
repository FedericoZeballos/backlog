import type { FastifyInstance } from 'fastify';
import { GraphQuery, SaveLayoutInput } from '@backlog/shared';
import { z } from 'zod';
import { authenticate } from '../../lib/auth';
import { getGraph, graphIssues, resetLayout, saveLayout } from './service';

export async function graphRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/graph', async (req) => getGraph(req.user.id, GraphQuery.parse(req.query)));

  app.get('/graph/issues', async (req) => ({ items: await graphIssues(req.user.id) }));

  app.put('/graph/layout', async (req, reply) => {
    await saveLayout(req.user.id, SaveLayoutInput.parse(req.body));
    return reply.status(204).send();
  });

  app.delete('/graph/layout', async (req, reply) => {
    const { viewKey } = z.object({ viewKey: z.string().min(1).max(200) }).parse(req.query);
    await resetLayout(req.user.id, viewKey);
    return reply.status(204).send();
  });
}
