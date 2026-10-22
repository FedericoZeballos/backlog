import type { FastifyInstance } from 'fastify';
import type { UserRole } from '@backlog/shared';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { createUser } from '../src/modules/users/service';

export const PASSWORD = 'contraseña-segura-123';

export function buildTestApp() {
  return buildApp({ rateLimit: false });
}

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "ActivityLog", "Edge", "Node", "Status", "Invitation", "Session", "User" CASCADE',
  );
}

let counter = 0;

/** Creates a user and returns a `cookie` header value for an authenticated session. */
export async function signedInUser(app: FastifyInstance, role: UserRole = 'USER') {
  const email = `user${++counter}@test.local`;
  const user = await prisma.$transaction((tx) => createUser(tx, { email, name: `User ${counter}`, password: PASSWORD, role }));
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
  return { user, cookie: cookieHeader(res) };
}

export function cookieHeader(res: { cookies: { name: string; value: string }[] }) {
  const sid = res.cookies.find((c) => c.name === 'sid');
  if (!sid) throw new Error('no session cookie');
  return `sid=${sid.value}`;
}

/** Small client bound to one session. */
export function client(app: FastifyInstance, cookie: string) {
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url: `/api${url}`, headers: { cookie }, payload: payload as object | undefined });
  return {
    get: (url: string) => call('GET', url),
    post: (url: string, payload?: unknown) => call('POST', url, payload ?? {}),
    patch: (url: string, payload: unknown) => call('PATCH', url, payload),
    del: (url: string) => call('DELETE', url),
    async node(payload: Record<string, unknown>) {
      const res = await call('POST', '/nodes', payload);
      if (res.statusCode !== 201) throw new Error(`create node failed: ${res.body}`);
      return res.json().node as { id: string; version: number; type: string; slug: string };
    },
    async edge(sourceId: string, targetId: string, type: string) {
      return call('POST', '/edges', { sourceId, targetId, type });
    },
  };
}
