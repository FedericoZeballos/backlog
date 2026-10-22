import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { Prisma } from '@prisma/client';
import Fastify, { type FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './lib/errors';
import { prisma } from './lib/prisma';
import { adminRoutes } from './modules/admin/routes';
import { authRoutes } from './modules/auth/routes';
import { edgeRoutes } from './modules/edges/routes';
import { nodeRoutes } from './modules/nodes/routes';
import { commentRoutes } from './modules/comments/routes';
import { graphRoutes } from './modules/graph/routes';
import { statusRoutes } from './modules/statuses/routes';
import { taskRoutes } from './modules/tasks/routes';

interface BuildOptions {
  logger?: boolean;
  /** Tests log in many times per minute. */
  rateLimit?: boolean;
}

export async function buildApp(opts: BuildOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1024 * 1024 });

  await app.register(cookie);
  await app.register(rateLimit, { global: false, max: opts.rateLimit === false ? 1_000_000 : 10 });
  app.decorateRequest('user', null as never);
  app.decorateRequest('sessionId', '');

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Datos inválidos',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return reply.status(409).send({ error: { code: 'CONFLICT', message: 'El registro ya existe' } });
    }
    const fastifyErr = err as FastifyError;
    if (fastifyErr.statusCode && fastifyErr.statusCode < 500) {
      return reply
        .status(fastifyErr.statusCode)
        .send({ error: { code: fastifyErr.code ?? 'BAD_REQUEST', message: fastifyErr.message } });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Error interno del servidor' } });
  });

  app.get('/api/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(adminRoutes);
      await api.register(statusRoutes);
      await api.register(nodeRoutes);
      await api.register(edgeRoutes);
      await api.register(taskRoutes);
      await api.register(commentRoutes);
      await api.register(graphRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
