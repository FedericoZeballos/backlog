import type { FastifyInstance } from 'fastify';
import { NODE_TYPES, ViewQuery } from '@backlog/shared';
import { z } from 'zod';
import { authenticate } from '../../lib/auth';
import { backlogView, blockedView, todayView, treeView, upcomingView } from './service';

const BacklogQuery = z.object({
  type: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(z.enum(NODE_TYPES)))
    .optional(),
});

export async function taskRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/views/today', async (req) => todayView(req.user.id, ViewQuery.parse(req.query)));
  app.get('/views/upcoming', async (req) => upcomingView(req.user.id, ViewQuery.parse(req.query)));
  app.get('/views/blocked', async (req) => blockedView(req.user.id));
  app.get('/views/backlog', async (req) => backlogView(req.user.id, BacklogQuery.parse(req.query).type));
  app.get('/tree', async (req) => treeView(req.user.id));
}
