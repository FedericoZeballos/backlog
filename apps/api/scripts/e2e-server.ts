/**
 * API for the Playwright tests: its own PostgreSQL (port 5435), wiped on every start,
 * with one admin user. Never touches the development database.
 */
import { startLocalPostgres } from './pg';

export const E2E_USER = { email: 'e2e@test.local', name: 'Ana Prueba', password: 'e2e-password-123' };

const port = Number(process.env.E2E_API_PORT ?? 3101);
const { url, stop } = await startLocalPostgres({ dataDir: 'pg-e2e', port: 5435, database: 'backlog_e2e', quiet: true });

// Set before importing the app: env.ts reads these at import time (and .env never overrides them).
process.env.DATABASE_URL = url;
process.env.APP_URL = process.env.E2E_APP_URL ?? 'http://localhost:5174';

const { prisma } = await import('../src/lib/prisma');
const { createUser } = await import('../src/modules/users/service');
const { buildApp } = await import('../src/app');

await prisma.$executeRawUnsafe(
  'TRUNCATE "NodeLayout", "Comment", "ActivityLog", "Edge", "Node", "Status", "Invitation", "Session", "User" CASCADE',
);
await prisma.$transaction((tx) => createUser(tx, { ...E2E_USER, role: 'ADMIN' }));

const app = await buildApp({ rateLimit: false });
await app.listen({ host: '127.0.0.1', port });
console.log(`E2E API lista en http://127.0.0.1:${port}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await prisma.$disconnect();
    await stop();
    process.exit(0);
  });
}
