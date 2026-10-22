import type { FastifyInstance } from 'fastify';
import { CreateStatusInput, DeleteStatusQuery, IdParam, ReorderStatusesInput, UpdateStatusInput } from '@backlog/shared';
import { authenticate } from '../../lib/auth';
import { createStatus, deleteStatus, listStatuses, reorderStatuses, updateStatus } from './service';

export async function statusRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/statuses', async (req) => ({ items: await listStatuses(req.user.id) }));

  app.post('/statuses', async (req, reply) => {
    const status = await createStatus(req.user.id, CreateStatusInput.parse(req.body));
    return reply.status(201).send({ status });
  });

  app.put('/statuses/order', async (req) => ({
    items: await reorderStatuses(req.user.id, ReorderStatusesInput.parse(req.body).ids),
  }));

  app.patch('/statuses/:id', async (req) => ({
    status: await updateStatus(req.user.id, IdParam.parse(req.params).id, UpdateStatusInput.parse(req.body)),
  }));

  app.delete('/statuses/:id', async (req, reply) => {
    await deleteStatus(req.user.id, IdParam.parse(req.params).id, DeleteStatusQuery.parse(req.query).moveTo);
    return reply.status(204).send();
  });
}
