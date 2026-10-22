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

const TODAY = '2026-10-22';
const titles = (res: { json: () => { items: { title: string }[] } }) => res.json().items.map((n) => n.title);

async function status(name: string) {
  return ((await api.get('/statuses')).json().items as { id: string; name: string }[]).find((s) => s.name === name)!;
}

describe('hierarchy', () => {
  it('creates tasks and subtasks directly under a parent', async () => {
    const project = await api.node({ type: 'PROJECT', title: 'ERP' });
    const task = await api.node({ type: 'TASK', title: 'Facturación', parentId: project.id });
    const sub = await api.node({ type: 'TASK', title: 'Certificado', parentId: task.id });

    const relations = (await api.get(`/nodes/${task.id}`)).json().relations;
    expect(relations.map((r: { type: string; direction: string }) => `${r.direction}:${r.type}`).sort()).toEqual([
      'in:CONTAINS',
      'out:PARENT_OF',
    ]);

    const tree = (await api.get('/tree')).json().items as { id: string; parentId: string | null }[];
    expect(tree.find((n) => n.id === sub.id)?.parentId).toBe(task.id);
    expect(tree.find((n) => n.id === project.id)?.parentId).toBeNull();
  });

  it('rolls back node creation when the parent is invalid', async () => {
    const idea = await api.node({ type: 'IDEA', title: 'Idea' });
    const res = await api.post('/nodes', { type: 'TASK', title: 'Huérfana', parentId: idea.id });
    expect(res.statusCode).toBe(422);
    expect((await api.get('/nodes?type=TASK')).json().total).toBe(0);
  });

  it('moves a node to another parent and detaches it', async () => {
    const p1 = await api.node({ type: 'PROJECT', title: 'P1' });
    const p2 = await api.node({ type: 'PROJECT', title: 'P2' });
    const task = await api.node({ type: 'TASK', title: 'T', parentId: p1.id });

    expect((await api.put(`/nodes/${task.id}/parent`, { parentId: p2.id })).statusCode).toBe(204);
    let tree = (await api.get('/tree')).json().items as { id: string; parentId: string | null }[];
    expect(tree.find((n) => n.id === task.id)?.parentId).toBe(p2.id);

    expect((await api.put(`/nodes/${task.id}/parent`, { parentId: null })).statusCode).toBe(204);
    tree = (await api.get('/tree')).json().items;
    expect(tree.find((n) => n.id === task.id)?.parentId).toBeNull();
  });

  it('refuses to move a node under its own descendant', async () => {
    const goal = await api.node({ type: 'GOAL', title: 'G' });
    const sub = await api.node({ type: 'GOAL', title: 'Sub', parentId: goal.id });
    const res = await api.put(`/nodes/${goal.id}/parent`, { parentId: sub.id });
    expect(res.json().error.code).toBe('CYCLE_DETECTED');
    // The original placement is kept (transaction rolled back).
    const tree = (await api.get('/tree')).json().items as { id: string; parentId: string | null }[];
    expect(tree.find((n) => n.id === sub.id)?.parentId).toBe(goal.id);
  });
});

describe('execution views', () => {
  it('today: overdue, due today and in progress; not future or done', async () => {
    const inProgress = await status('En progreso');
    await api.node({ type: 'TASK', title: 'Vencida', dueDate: '2026-10-20' });
    await api.node({ type: 'TASK', title: 'Hoy', dueDate: TODAY, priority: 'HIGH' });
    await api.node({ type: 'TASK', title: 'En curso', statusId: inProgress.id });
    await api.node({ type: 'TASK', title: 'Futura', dueDate: '2026-10-30' });
    const done = await api.node({ type: 'TASK', title: 'Hecha', dueDate: TODAY });
    await api.patch(`/nodes/${done.id}`, { version: 1, statusId: (await status('Completada')).id });

    const res = await api.get(`/views/today?date=${TODAY}&since=${TODAY}T00:00:00-03:00`);
    expect(titles(res)).toEqual(['Hoy', 'Vencida', 'En curso']); // priority, then due date
    expect(res.json().completed.map((n: { title: string }) => n.title)).toEqual(['Hecha']);
  });

  it('upcoming: due within the window, by date', async () => {
    await api.node({ type: 'TASK', title: 'En 5 días', dueDate: '2026-10-27' });
    await api.node({ type: 'TASK', title: 'Mañana', dueDate: '2026-10-23' });
    await api.node({ type: 'TASK', title: 'En un mes', dueDate: '2026-11-22' });
    await api.node({ type: 'TASK', title: 'Hoy', dueDate: TODAY });
    expect(titles(await api.get(`/views/upcoming?date=${TODAY}&days=14`))).toEqual(['Mañana', 'En 5 días']);
  });

  it('blocked: explicit status or unfinished dependency, with the blockers listed', async () => {
    const a = await api.node({ type: 'TASK', title: 'Emitir factura' });
    const b = await api.node({ type: 'TASK', title: 'Obtener certificado' });
    await api.edge(a.id, b.id, 'DEPENDS_ON');
    await api.node({ type: 'TASK', title: 'Marcada', statusId: (await status('Bloqueada')).id });
    await api.node({ type: 'TASK', title: 'Libre' });

    const res = await api.get('/views/blocked');
    expect(titles(res).sort()).toEqual(['Emitir factura', 'Marcada']);
    const item = res.json().items.find((n: { id: string }) => n.id === a.id);
    expect(item.blockers.map((x: { title: string }) => x.title)).toEqual(['Obtener certificado']);

    // Finishing the dependency unblocks the task.
    await api.patch(`/nodes/${b.id}`, { version: 1, statusId: (await status('Completada')).id });
    expect(titles(await api.get('/views/blocked'))).toEqual(['Marcada']);
  });

  it('backlog: processed ideas, problems and pending work; not inbox or done items', async () => {
    await api.node({ title: 'Sin procesar' });
    await api.node({ type: 'IDEA', title: 'Idea' });
    await api.node({ type: 'PROBLEM', title: 'Problema' });
    await api.node({ type: 'TASK', title: 'Tarea' });
    await api.node({ type: 'NOTE', title: 'Nota' });
    const done = await api.node({ type: 'TASK', title: 'Hecha' });
    await api.patch(`/nodes/${done.id}`, { version: 1, statusId: (await status('Completada')).id });

    expect(titles(await api.get('/views/backlog')).sort()).toEqual(['Idea', 'Problema', 'Tarea']);
    expect(titles(await api.get('/views/backlog?type=IDEA'))).toEqual(['Idea']);
  });
});

describe('search and duplicates', () => {
  it('finds by stem and ignores accents and case', async () => {
    await api.node({ type: 'TASK', title: 'Implementar facturación electrónica' });
    await api.node({ type: 'NOTE', title: 'Otra cosa', body: 'Notas sobre FACTURAS de proveedores' });
    await api.node({ type: 'IDEA', title: 'Modo offline' });

    expect(titles(await api.get('/nodes?q=facturacion'))).toEqual(['Implementar facturación electrónica']);
    expect(titles(await api.get('/nodes?q=factura')).length).toBe(2);
    expect(titles(await api.get('/nodes?q=OFFLI'))).toEqual(['Modo offline']);
    expect((await api.get('/nodes?q=100%25')).json().total).toBe(0); // LIKE wildcards are escaped
  });

  it('suggests possible duplicates when capturing', async () => {
    const existing = await api.node({ type: 'TASK', title: 'Implementar facturación electrónica' });
    await api.node({ type: 'IDEA', title: 'Modo offline' });

    const res = await api.get(`/nodes/similar?title=${encodeURIComponent('implementar facturacion electronica en el ERP')}`);
    const items = res.json().items as { id: string; score: number }[];
    expect(items.map((i) => i.id)).toEqual([existing.id]);
    expect(items[0]!.score).toBeGreaterThan(0.3);

    const self = await api.get(`/nodes/similar?title=${encodeURIComponent('Implementar facturación electrónica')}&excludeId=${existing.id}`);
    expect(self.json().items).toEqual([]);
  });
});

describe('statuses', () => {
  it('adds, renames, reorders and changes the default', async () => {
    const created = await api.post('/statuses', { name: 'En revisión', category: 'IN_PROGRESS' });
    expect(created.statusCode).toBe(201);
    const review = created.json().status;

    expect((await api.patch(`/statuses/${review.id}`, { name: 'Revisión' })).json().status.name).toBe('Revisión');
    expect((await api.patch(`/statuses/${review.id}`, { isDefault: true })).statusCode).toBe(200);
    const all = (await api.get('/statuses')).json().items as { id: string; isDefault: boolean }[];
    expect(all.filter((s) => s.isDefault).map((s) => s.id)).toEqual([review.id]);

    const reversed = all.map((s) => s.id).reverse();
    const reordered = await api.put('/statuses/order', { ids: reversed });
    expect(reordered.json().items.map((s: { id: string }) => s.id)).toEqual(reversed);
  });

  it('a status in use can only be deleted by moving its items, keeping completion consistent', async () => {
    const done = await status('Completada');
    const pending = await status('Pendiente');
    const task = await api.node({ type: 'TASK', title: 'T', statusId: done.id });

    const blocked = await api.del(`/statuses/${done.id}`);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.details.count).toBe(1);

    expect((await api.del(`/statuses/${done.id}?moveTo=${pending.id}`)).statusCode).toBe(204);
    const node = (await api.get(`/nodes/${task.id}`)).json().node;
    expect(node.status.name).toBe('Pendiente');
    expect(node.completedAt).toBeNull();
  });

  it('protects the default status and categories in use', async () => {
    const pending = await status('Pendiente');
    expect((await api.del(`/statuses/${pending.id}`)).statusCode).toBe(422);
    await api.node({ type: 'TASK', title: 'T' });
    expect((await api.patch(`/statuses/${pending.id}`, { category: 'DONE' })).statusCode).toBe(409);
  });
});

describe('comments', () => {
  it('adds, lists and deletes comments on a node', async () => {
    const task = await api.node({ type: 'TASK', title: 'T' });
    const created = await api.post(`/nodes/${task.id}/comments`, { body: 'Hablar con el contador' });
    expect(created.statusCode).toBe(201);
    expect((await api.get(`/nodes/${task.id}/comments`)).json().items).toHaveLength(1);

    const other = client(app, (await signedInUser(app)).cookie);
    expect((await other.get(`/nodes/${task.id}/comments`)).statusCode).toBe(404);
    expect((await other.del(`/comments/${created.json().comment.id}`)).statusCode).toBe(404);

    expect((await api.del(`/comments/${created.json().comment.id}`)).statusCode).toBe(204);
    expect((await api.get(`/nodes/${task.id}/comments`)).json().items).toHaveLength(0);
  });
});
