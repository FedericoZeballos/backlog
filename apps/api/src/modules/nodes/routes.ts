import type { FastifyInstance } from 'fastify';
import { CreateNodeInput, IdParam, ListNodesQuery, UpdateNodeInput } from '@backlog/shared';
import { authenticate } from '../../lib/auth';
import { createNode, deleteNode, getActivity, getNode, listNodes, purgeNode, restoreNode, updateNode } from './service';

export async function nodeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/nodes', async (req) => listNodes(req.user.id, ListNodesQuery.parse(req.query)));

  app.post('/nodes', async (req, reply) => {
    const node = await createNode(req.user.id, CreateNodeInput.parse(req.body));
    return reply.status(201).send({ node });
  });

  app.get('/nodes/:id', async (req) => getNode(req.user.id, IdParam.parse(req.params).id));

  app.patch('/nodes/:id', async (req) => ({
    node: await updateNode(req.user.id, IdParam.parse(req.params).id, UpdateNodeInput.parse(req.body)),
  }));

  app.delete('/nodes/:id', async (req, reply) => {
    await deleteNode(req.user.id, IdParam.parse(req.params).id);
    return reply.status(204).send();
  });

  app.post('/nodes/:id/restore', async (req) => restoreNode(req.user.id, IdParam.parse(req.params).id));

  app.delete('/nodes/:id/purge', async (req, reply) => {
    await purgeNode(req.user.id, IdParam.parse(req.params).id);
    return reply.status(204).send();
  });

  app.get('/nodes/:id/activity', async (req) => ({
    items: await getActivity(req.user.id, IdParam.parse(req.params).id),
  }));
}
