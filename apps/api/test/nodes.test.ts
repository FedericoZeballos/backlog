import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, client, resetDb, signedInUser } from './helpers';

let app: FastifyInstance;
let api: ReturnType<typeof client>;

beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb();
  api = client(app, (await signedInUser(app)).cookie);
});

async function statusByName(name: string) {
  const res = await api.get('/statuses');
  return (res.json().items as { id: string; name: string }[]).find((s) => s.name === name)!;
}

describe('quick capture and inbox', () => {
  it('captures free text with only a title, unclassified and unprocessed', async () => {
    const res = await api.post('/nodes', { title: 'Quiero mejorar mi app para organizar el ERP y la carrera' });
    expect(res.statusCode).toBe(201);
    const { node } = res.json();
    expect(node.type).toBe('INBOX_ITEM');
    expect(node.processed).toBe(false);
    expect(node.status).toBeNull();
    expect(node.createdAt).toBeTruthy();

    const inbox = await api.get('/nodes?processed=false');
    expect(inbox.json().total).toBe(1);
  });

  it('stores any Unicode text (database must be UTF-8)', async () => {
    const title = 'Facturación 🚀 日本語 — “citas”';
    const node = await api.node({ title });
    expect((await api.get(`/nodes/${node.id}`)).json().node.title).toBe(title);
  });

  it('rejects an empty title', async () => {
    const res = await api.post('/nodes', { title: '   ' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('classifying an inbox item marks it processed', async () => {
    const item = await api.node({ title: 'Idea suelta' });
    const res = await api.patch(`/nodes/${item.id}`, { version: item.version, type: 'IDEA' });
    expect(res.statusCode).toBe(200);
    expect(res.json().node).toMatchObject({ type: 'IDEA', processed: true, version: 2 });
  });

  it('filters by type and searches title and body', async () => {
    await api.node({ type: 'TASK', title: 'Configurar certificado', body: 'para facturación' });
    await api.node({ type: 'IDEA', title: 'Modo offline' });
    expect((await api.get('/nodes?type=IDEA')).json().total).toBe(1);
    expect((await api.get('/nodes?type=IDEA,TASK')).json().total).toBe(2);
    expect((await api.get('/nodes?q=FACTURACI')).json().total).toBe(1);
  });

  it('generates unique slugs for repeated titles', async () => {
    const a = await api.node({ type: 'NOTE', title: 'Facturación electrónica' });
    const b = await api.node({ type: 'NOTE', title: 'Facturación electrónica' });
    expect(a.slug).toBe('facturacion-electronica');
    expect(b.slug).toBe('facturacion-electronica-2');
  });
});

describe('statuses, completion and history', () => {
  it('actionable nodes get the default status; ideas never have one', async () => {
    const task = await api.node({ type: 'TASK', title: 'Tarea' });
    expect((await api.get(`/nodes/${task.id}`)).json().node.status.name).toBe('Pendiente');

    const pending = await statusByName('Pendiente');
    const res = await api.post('/nodes', { type: 'IDEA', title: 'Idea', statusId: pending.id });
    expect(res.statusCode).toBe(422);
  });

  it('records completion and reopening', async () => {
    const task = await api.node({ type: 'TASK', title: 'Emitir primera factura' });
    const done = await statusByName('Completada');
    const pending = await statusByName('Pendiente');

    const completed = await api.patch(`/nodes/${task.id}`, { version: 1, statusId: done.id });
    expect(completed.json().node.completedAt).toBeTruthy();

    const reopened = await api.patch(`/nodes/${task.id}`, { version: 2, statusId: pending.id });
    expect(reopened.json().node.completedAt).toBeNull();

    const actions = (await api.get(`/nodes/${task.id}/activity`)).json().items.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['CREATE', 'UPDATE', 'COMPLETE', 'REOPEN']));
  });

  it('rejects stale writes with a version conflict', async () => {
    const task = await api.node({ type: 'TASK', title: 'Tarea' });
    expect((await api.patch(`/nodes/${task.id}`, { version: 1, title: 'Primera edición' })).statusCode).toBe(200);
    const stale = await api.patch(`/nodes/${task.id}`, { version: 1, title: 'Edición vieja' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.details.currentVersion).toBe(2);
  });

  it('clears optional fields with null and stores due dates as plain dates', async () => {
    const task = await api.node({ type: 'TASK', title: 'Tarea', dueDate: '2026-11-15', nextAction: 'Llamar al contador' });
    const detail = (await api.get(`/nodes/${task.id}`)).json().node;
    expect(detail.dueDate).toBe('2026-11-15');
    const cleared = await api.patch(`/nodes/${task.id}`, { version: 1, nextAction: null, dueDate: null });
    expect(cleared.json().node).toMatchObject({ nextAction: null, dueDate: null });
  });
});

describe('trash', () => {
  it('soft delete hides the node and its relations; restore brings both back', async () => {
    const project = await api.node({ type: 'PROJECT', title: 'ERP' });
    const task = await api.node({ type: 'TASK', title: 'Facturación' });
    expect((await api.edge(project.id, task.id, 'CONTAINS')).statusCode).toBe(201);

    expect((await api.del(`/nodes/${task.id}`)).statusCode).toBe(204);
    expect((await api.get('/nodes?type=TASK')).json().total).toBe(0);
    expect((await api.get('/nodes?deleted=true')).json().total).toBe(1);
    expect((await api.get(`/nodes/${project.id}`)).json().relations).toHaveLength(0);

    const restored = await api.post(`/nodes/${task.id}/restore`);
    expect(restored.statusCode).toBe(200);
    expect(restored.json().droppedRelations).toEqual([]);
    expect((await api.get(`/nodes/${project.id}`)).json().relations).toHaveLength(1);
  });

  it('purge removes the node and its relations permanently, only from the trash', async () => {
    const a = await api.node({ type: 'TASK', title: 'A' });
    const b = await api.node({ type: 'TASK', title: 'B' });
    await api.edge(a.id, b.id, 'DEPENDS_ON');

    expect((await api.del(`/nodes/${b.id}/purge`)).statusCode).toBe(404); // not in trash yet
    await api.del(`/nodes/${b.id}`);
    expect((await api.del(`/nodes/${b.id}/purge`)).statusCode).toBe(204);
    expect((await api.get(`/nodes/${b.id}`)).statusCode).toBe(404);

    // The dependency is gone too, so A can depend on a new B without leftovers.
    expect((await api.get(`/nodes/${a.id}`)).json().relations).toHaveLength(0);
  });
});

describe('isolation between users', () => {
  it('a user cannot read, edit or delete another user’s nodes', async () => {
    const mine = await api.node({ type: 'TASK', title: 'Privada' });
    const other = client(app, (await signedInUser(app)).cookie);

    expect((await other.get(`/nodes/${mine.id}`)).statusCode).toBe(404);
    expect((await other.patch(`/nodes/${mine.id}`, { version: 1, title: 'X' })).statusCode).toBe(404);
    expect((await other.del(`/nodes/${mine.id}`)).statusCode).toBe(404);
    expect((await other.get('/nodes')).json().total).toBe(0);
  });
});
