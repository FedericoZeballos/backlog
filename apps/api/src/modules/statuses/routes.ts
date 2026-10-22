import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../lib/auth';
import { prisma } from '../../lib/prisma';

export async function statusRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/statuses', async (req) => ({
    items: await prisma.status.findMany({
      where: { ownerId: req.user.id },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, category: true, order: true, isDefault: true },
    }),
  }));
}
