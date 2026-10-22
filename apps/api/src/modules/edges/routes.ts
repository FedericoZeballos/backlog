import type { FastifyInstance } from 'fastify';
import { CreateEdgeInput, IdParam } from '@backlog/shared';
import { authenticate } from '../../lib/auth';
import { createEdge, deleteEdge } from './service';

export async function edgeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.post('/edges', async (req, reply) => {
    const edge = await createEdge(req.user.id, CreateEdgeInput.parse(req.body));
    return reply.status(201).send({ edge });
  });

  app.delete('/edges/:id', async (req, reply) => {
    await deleteEdge(req.user.id, IdParam.parse(req.params).id);
    return reply.status(204).send();
  });
}
