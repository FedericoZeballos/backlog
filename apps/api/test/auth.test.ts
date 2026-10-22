import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { PASSWORD, buildTestApp, client, cookieHeader, resetDb, signedInUser } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(resetDb);

async function invite(adminCookie: string, payload: Record<string, unknown> = {}) {
  const res = await client(app, adminCookie).post('/admin/invitations', payload);
  expect(res.statusCode).toBe(201);
  return res.json() as { token: string; url: string; invitation: { id: string } };
}

const register = (payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/auth/register', payload });

describe('auth', () => {
  it('rejects requests without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nodes' });
    expect(res.statusCode).toBe(401);
  });

  it('logs in, returns the current user and logs out', async () => {
    const { user, cookie } = await signedInUser(app);
    const api = client(app, cookie);

    const me = await api.get('/auth/me');
    expect(me.json().user.email).toBe(user.email);

    expect((await api.post('/auth/logout')).statusCode).toBe(204);
    expect((await api.get('/auth/me')).statusCode).toBe(401);
  });

  it('does not reveal whether an email exists', async () => {
    const { user } = await signedInUser(app);
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: 'incorrecta-123' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nadie@test.local', password: 'incorrecta-123' },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json().error.code).toBe(unknownEmail.json().error.code);
  });
});

describe('invitations', () => {
  it('only admins can create invitations', async () => {
    const { cookie } = await signedInUser(app, 'USER');
    const res = await client(app, cookie).post('/admin/invitations', {});
    expect(res.statusCode).toBe(403);
  });

  it('registers with a valid invitation exactly once', async () => {
    const { cookie: adminCookie } = await signedInUser(app, 'ADMIN');
    const { token, url } = await invite(adminCookie);
    expect(url).toContain(token);

    const check = await app.inject({ method: 'GET', url: `/api/auth/invitations/${token}` });
    expect(check.statusCode).toBe(200);

    const first = await register({ token, email: 'nueva@test.local', name: 'Nueva', password: PASSWORD });
    expect(first.statusCode).toBe(201);
    expect(first.json().user.role).toBe('USER');
    const me = await client(app, cookieHeader(first)).get('/auth/me');
    expect(me.json().user.email).toBe('nueva@test.local');

    // New users get default statuses.
    const statuses = await client(app, cookieHeader(first)).get('/statuses');
    expect(statuses.json().items.map((s: { name: string }) => s.name)).toEqual([
      'Pendiente',
      'En progreso',
      'Bloqueada',
      'Completada',
    ]);

    const second = await register({ token, email: 'otra@test.local', name: 'Otra', password: PASSWORD });
    expect(second.statusCode).toBe(410);
  });

  it('enforces the invited email, expiry and revocation', async () => {
    const { cookie: adminCookie } = await signedInUser(app, 'ADMIN');

    const bound = await invite(adminCookie, { email: 'solo@test.local' });
    const mismatch = await register({ token: bound.token, email: 'otro@test.local', name: 'X', password: PASSWORD });
    expect(mismatch.statusCode).toBe(422);

    const expired = await invite(adminCookie);
    await prisma.invitation.update({ where: { id: expired.invitation.id }, data: { expiresAt: new Date(0) } });
    expect((await register({ token: expired.token, email: 'a@test.local', name: 'A', password: PASSWORD })).statusCode).toBe(410);

    const revoked = await invite(adminCookie);
    expect((await client(app, adminCookie).post(`/admin/invitations/${revoked.invitation.id}/revoke`)).statusCode).toBe(204);
    expect((await register({ token: revoked.token, email: 'b@test.local', name: 'B', password: PASSWORD })).statusCode).toBe(410);
  });

  it('rejects weak passwords', async () => {
    const { cookie: adminCookie } = await signedInUser(app, 'ADMIN');
    const { token } = await invite(adminCookie);
    const res = await register({ token, email: 'debil@test.local', name: 'D', password: 'corta' });
    expect(res.statusCode).toBe(400);
  });
});

describe('user administration', () => {
  it('disabling a user ends their sessions; admins cannot disable themselves', async () => {
    const { user: admin, cookie: adminCookie } = await signedInUser(app, 'ADMIN');
    const { user, cookie } = await signedInUser(app);
    const adminApi = client(app, adminCookie);

    expect((await adminApi.post(`/admin/users/${user.id}/disable`)).statusCode).toBe(200);
    expect((await client(app, cookie).get('/auth/me')).statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: user.email, password: PASSWORD } });
    expect(login.statusCode).toBe(403);

    expect((await adminApi.post(`/admin/users/${admin.id}/disable`)).statusCode).toBe(422);
  });

  it('the user list does not expose password hashes', async () => {
    const { cookie } = await signedInUser(app, 'ADMIN');
    const res = await client(app, cookie).get('/admin/users');
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('passwordHash');
  });
});
