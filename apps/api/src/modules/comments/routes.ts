import type { FastifyInstance } from 'fastify';
import { CommentInput, IdParam } from '@backlog/shared';
import { authenticate } from '../../lib/auth';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

const commentSelect = { id: true, body: true, createdAt: true, updatedAt: true } as const;

export async function commentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/nodes/:id/comments', async (req) => {
    const { id } = IdParam.parse(req.params);
    if (!(await prisma.node.count({ where: { id, ownerId: req.user.id } }))) throw notFound();
    return {
      items: await prisma.comment.findMany({ where: { nodeId: id }, orderBy: { createdAt: 'asc' }, select: commentSelect }),
    };
  });

  app.post('/nodes/:id/comments', async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { body } = CommentInput.parse(req.body);
    if (!(await prisma.node.count({ where: { id, ownerId: req.user.id, deletedAt: null } }))) throw notFound();
    const comment = await prisma.comment.create({
      data: { ownerId: req.user.id, nodeId: id, body },
      select: commentSelect,
    });
    return reply.status(201).send({ comment });
  });

  app.delete('/comments/:id', async (req, reply) => {
    const { count } = await prisma.comment.deleteMany({ where: { id: IdParam.parse(req.params).id, ownerId: req.user.id } });
    if (!count) throw notFound('Comentario');
    return reply.status(204).send();
  });
}
