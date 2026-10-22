import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole } from '@backlog/shared';
import { env } from '../env';
import { sha256 } from './crypto';
import { AppError } from './errors';
import { prisma } from './prisma';

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_DAYS = 30;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
    sessionId: string;
  }
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** preHandler: resolves the session cookie into `request.user`. */
export async function authenticate(req: FastifyRequest) {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Iniciá sesión para continuar');

  const session = await prisma.session.findUnique({
    where: { id: sha256(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || session.user.disabledAt) {
    throw new AppError(401, 'UNAUTHENTICATED', 'La sesión no es válida o expiró');
  }

  const { id, email, name, role } = session.user;
  req.user = { id, email, name, role };
  req.sessionId = session.id;
}

/** preHandler: must run after `authenticate`. */
export async function requireAdmin(req: FastifyRequest) {
  if (req.user.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Solo un administrador puede hacer esto');
}
