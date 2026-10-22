import type { FastifyInstance } from 'fastify';
import { LoginInput, RegisterInput } from '@backlog/shared';
import { z } from 'zod';
import { authenticate, clearSessionCookie, setSessionCookie } from '../../lib/auth';
import { toUserDTO } from '../users/service';
import { checkInvitation, login, logout, register } from './service';

// `max` comes from the plugin options in app.ts.
const authRateLimit = { rateLimit: { timeWindow: '1 minute' } };

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', { config: authRateLimit }, async (req, reply) => {
    const { user, token } = await login(LoginInput.parse(req.body));
    setSessionCookie(reply, token);
    return { user: toUserDTO(user) };
  });

  app.post('/auth/register', { config: authRateLimit }, async (req, reply) => {
    const { user, token } = await register(RegisterInput.parse(req.body));
    setSessionCookie(reply, token);
    return reply.status(201).send({ user: toUserDTO(user) });
  });

  app.get('/auth/invitations/:token', { config: authRateLimit }, async (req) => {
    const { token } = z.object({ token: z.string().min(10).max(200) }).parse(req.params);
    return checkInvitation(token);
  });

  app.post('/auth/logout', { preHandler: authenticate }, async (req, reply) => {
    await logout(req.sessionId);
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get('/auth/me', { preHandler: authenticate }, async (req) => ({ user: req.user }));
}
