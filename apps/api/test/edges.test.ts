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

describe('relation rules', () => {
  it('builds goal → project → task → subtask hierarchy', async () => {
    const goal = await api.node({ type: 'GOAL', title: 'Terminar el ERP' });
    const project = await api.node({ type: 'PROJECT', title: 'Facturación' });
    const task = await api.node({ type: 'TASK', title: 'Emitir comprobantes' });
    const sub = await api.node({ type: 'TASK', title: 'Configurar certificado' });

    expect((await api.edge(goal.id, project.id, 'CONTAINS')).statusCode).toBe(201);
    expect((await api.edge(project.id, task.id, 'CONTAINS')).statusCode).toBe(201);
    expect((await api.edge(task.id, sub.id, 'PARENT_OF')).statusCode).toBe(201);

    const relations = (await api.get(`/nodes/${task.id}`)).json().relations;
    expect(relations).toHaveLength(2);
    expect(relations.find((r: { direction: string }) => r.direction === 'in')).toMatchObject({
      type: 'CONTAINS',
      category: 'STRUCTURAL',
      node: { id: project.id },
    });
  });

  it('rejects combinations the matrix does not allow', async () => {
    const idea = await api.node({ type: 'IDEA', title: 'Idea' });
    const task = await api.node({ type: 'TASK', title: 'Tarea' });
    const res = await api.edge(idea.id, task.id, 'DEPENDS_ON');
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('INVALID_RELATION');
  });

  it('rejects self relations and duplicates, including reversed symmetric ones', async () => {
    const a = await api.node({ type: 'IDEA', title: 'A' });
    const b = await api.node({ type: 'IDEA', title: 'B' });
    expect((await api.edge(a.id, a.id, 'RELATED_TO')).statusCode).toBe(400);
    expect((await api.edge(a.id, b.id, 'RELATED_TO')).statusCode).toBe(201);
    expect((await api.edge(a.id, b.id, 'RELATED_TO')).json().error.code).toBe('DUPLICATE_RELATION');
    expect((await api.edge(b.id, a.id, 'RELATED_TO')).json().error.code).toBe('DUPLICATE_RELATION');
  });

  it('a node has at most one structural parent', async () => {
    const p1 = await api.node({ type: 'PROJECT', title: 'P1' });
    const p2 = await api.node({ type: 'PROJECT', title: 'P2' });
    const task = await api.node({ type: 'TASK', title: 'T' });
    await api.edge(p1.id, task.id, 'CONTAINS');
    const res = await api.edge(p2.id, task.id, 'CONTAINS');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ALREADY_HAS_PARENT');
  });

  it('dependency cycles are rejected; conceptual cycles are fine', async () => {
    const a = await api.node({ type: 'TASK', title: 'A' });
    const b = await api.node({ type: 'TASK', title: 'B' });
    const c = await api.node({ type: 'TASK', title: 'C' });
    expect((await api.edge(a.id, b.id, 'DEPENDS_ON')).statusCode).toBe(201);
    expect((await api.edge(b.id, c.id, 'DEPENDS_ON')).statusCode).toBe(201);

    const cycle = await api.edge(c.id, a.id, 'DEPENDS_ON');
    expect(cycle.statusCode).toBe(409);
    expect(cycle.json().error.code).toBe('CYCLE_DETECTED');
    expect(cycle.json().error.details.path).toEqual([c.id, a.id, b.id, c.id]);

    // Being related is not the same as depending: these do not block each other.
    expect((await api.edge(c.id, a.id, 'RELATED_TO')).statusCode).toBe(201);
  });

  it('hierarchy cycles are rejected', async () => {
    const g1 = await api.node({ type: 'GOAL', title: 'G1' });
    const g2 = await api.node({ type: 'GOAL', title: 'G2' });
    await api.edge(g1.id, g2.id, 'CONTAINS');
    expect((await api.edge(g2.id, g1.id, 'CONTAINS')).json().error.code).toBe('CYCLE_DETECTED');
  });

  it('cannot link to deleted nodes or to another user’s nodes', async () => {
    const a = await api.node({ type: 'TASK', title: 'A' });
    const b = await api.node({ type: 'TASK', title: 'B' });
    await api.del(`/nodes/${b.id}`);
    expect((await api.edge(a.id, b.id, 'DEPENDS_ON')).statusCode).toBe(404);

    const other = client(app, (await signedInUser(app)).cookie);
    const foreign = await other.node({ type: 'TASK', title: 'Ajena' });
    expect((await api.edge(a.id, foreign.id, 'DEPENDS_ON')).statusCode).toBe(404);
  });

  it('deletes a relation and logs it', async () => {
    const a = await api.node({ type: 'TASK', title: 'A' });
    const b = await api.node({ type: 'TASK', title: 'B' });
    const edge = (await api.edge(a.id, b.id, 'DEPENDS_ON')).json().edge;
    expect((await api.del(`/edges/${edge.id}`)).statusCode).toBe(204);
    expect((await api.get(`/nodes/${a.id}`)).json().relations).toHaveLength(0);
    const actions = (await api.get(`/nodes/${a.id}/activity`)).json().items.map((x: { action: string }) => x.action);
    expect(actions).toEqual(expect.arrayContaining(['LINK', 'UNLINK']));
  });
});

describe('integrity on type changes and restore', () => {
  it('refuses a type change that would invalidate existing relations', async () => {
    const project = await api.node({ type: 'PROJECT', title: 'P' });
    const task = await api.node({ type: 'TASK', title: 'T' });
    await api.edge(project.id, task.id, 'CONTAINS');

    const res = await api.patch(`/nodes/${task.id}`, { version: 1, type: 'IDEA' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('TYPE_BREAKS_RELATIONS');
  });

  it('restore drops relations that became invalid while the node was in the trash', async () => {
    const p1 = await api.node({ type: 'PROJECT', title: 'P1' });
    const p2 = await api.node({ type: 'PROJECT', title: 'P2' });
    const task = await api.node({ type: 'TASK', title: 'T' });
    await api.edge(p1.id, task.id, 'CONTAINS');

    await api.del(`/nodes/${p1.id}`);
    // While P1 is deleted, the task can be moved to P2.
    expect((await api.edge(p2.id, task.id, 'CONTAINS')).statusCode).toBe(201);

    const restored = await api.post(`/nodes/${p1.id}/restore`);
    expect(restored.json().droppedRelations).toHaveLength(1);
    const parents = (await api.get(`/nodes/${task.id}`)).json().relations;
    expect(parents).toHaveLength(1);
    expect(parents[0].node.id).toBe(p2.id);
  });
});
