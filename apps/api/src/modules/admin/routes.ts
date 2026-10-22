import type { FastifyInstance } from 'fastify';
import { CreateInvitationInput, IdParam } from '@backlog/shared';
import { authenticate, requireAdmin } from '../../lib/auth';
import { createInvitation, listInvitations, listUsers, revokeInvitation, setUserDisabled } from './service';

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireAdmin);

  app.post('/admin/invitations', async (req, reply) => {
    const result = await createInvitation(req.user.id, CreateInvitationInput.parse(req.body ?? {}));
    return reply.status(201).send(result);
  });

  app.get('/admin/invitations', async () => ({ items: await listInvitations() }));

  app.post('/admin/invitations/:id/revoke', async (req, reply) => {
    await revokeInvitation(IdParam.parse(req.params).id);
    return reply.status(204).send();
  });

  app.get('/admin/users', async () => ({ items: await listUsers() }));

  app.post('/admin/users/:id/disable', async (req) => ({
    user: await setUserDisabled(req.user.id, IdParam.parse(req.params).id, true),
  }));

  app.post('/admin/users/:id/enable', async (req) => ({
    user: await setUserDisabled(req.user.id, IdParam.parse(req.params).id, false),
  }));
}
