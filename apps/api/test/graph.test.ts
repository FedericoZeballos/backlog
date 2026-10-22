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

type Graph = {
  nodes: { id: string; title: string; hiddenRelations: number }[];
  edges: { sourceId: string; targetId: string; type: string; category: string }[];
  positions: Record<string, { x: number; y: number }>;
};
const graph = async (qs = '') => (await api.get(`/graph${qs}`)).json() as Graph;
const titles = (g: Graph) => g.nodes.map((n) => n.title).sort();

async function status(name: string) {
  return ((await api.get('/statuses')).json().items as { id: string; name: string }[]).find((s) => s.name === name)!;
}

/** goal → project → task1, task2; task1 depends on task2; note documents task1; idea isolated. */
async function seed() {
  const goal = await api.node({ type: 'GOAL', title: 'Terminar el ERP' });
  const project = await api.node({ type: 'PROJECT', title: 'Facturación', parentId: goal.id });
  const t1 = await api.node({ type: 'TASK', title: 'Emitir', parentId: project.id });
  const t2 = await api.node({ type: 'TASK', title: 'Certificado', parentId: project.id });
  const note = await api.node({ type: 'NOTE', title: 'Notas AFIP' });
  const idea = await api.node({ type: 'IDEA', title: 'Modo offline' });
  await api.edge(t1.id, t2.id, 'DEPENDS_ON');
  await api.edge(note.id, t1.id, 'DOCUMENTS');
  return { goal, project, t1, t2, note, idea };
}

describe('graph view', () => {
  it('global view returns every active node and relation, without inbox or deleted items', async () => {
    const { idea } = await seed();
    await api.node({ title: 'Sin clasificar' });
    const trashed = await api.node({ type: 'IDEA', title: 'Borrada' });
    await api.del(`/nodes/${trashed.id}`);
    await api.del(`/nodes/${idea.id}`);

    const g = await graph();
    expect(titles(g)).toEqual(['Certificado', 'Emitir', 'Facturación', 'Notas AFIP', 'Terminar el ERP']);
    expect(g.edges).toHaveLength(5);
    expect(new Set(g.edges.map((e) => e.category))).toEqual(new Set(['STRUCTURAL', 'EXECUTION', 'CONCEPTUAL']));

    expect(titles(await graph('?includeInbox=true'))).toContain('Sin clasificar');
  });

  it('focused view follows relations up to the requested depth and reports hidden ones', async () => {
    const { t1 } = await seed();

    const near = await graph(`?focus=${t1.id}&depth=1`);
    expect(titles(near)).toEqual(['Certificado', 'Emitir', 'Facturación', 'Notas AFIP']);
    const project = near.nodes.find((n) => n.title === 'Facturación')!;
    expect(project.hiddenRelations).toBe(1); // its goal is outside the view

    const far = await graph(`?focus=${t1.id}&depth=2`);
    expect(titles(far)).toContain('Terminar el ERP');
  });

  it('expands from several focus nodes at once', async () => {
    const { note, idea } = await seed();
    const g = await graph(`?focus=${note.id},${idea.id}&depth=1`);
    expect(titles(g)).toEqual(['Emitir', 'Modo offline', 'Notas AFIP']);
  });

  it('filters by node type, relation category and completion', async () => {
    const { t2 } = await seed();
    await api.patch(`/nodes/${t2.id}`, { version: 1, statusId: (await status('Completada')).id });

    expect(titles(await graph('?type=TASK'))).toEqual(['Certificado', 'Emitir']);
    expect((await graph('?category=EXECUTION')).edges.map((e) => e.type)).toEqual(['DEPENDS_ON']);
    expect(titles(await graph('?hideDone=true'))).not.toContain('Certificado');
  });

  it('reflects persisted changes made elsewhere', async () => {
    const { t1, t2 } = await seed();
    const before = await graph();
    const dep = before.edges.find((e) => e.type === 'DEPENDS_ON')!;
    expect(dep).toMatchObject({ sourceId: t1.id, targetId: t2.id });

    const edgeId = (await api.get(`/nodes/${t1.id}`)).json().relations.find((r: { type: string }) => r.type === 'DEPENDS_ON').id;
    await api.del(`/edges/${edgeId}`);
    expect((await graph()).edges.some((e) => e.type === 'DEPENDS_ON')).toBe(false);
  });

  it('does not leak other users’ nodes', async () => {
    await seed();
    const other = client(app, (await signedInUser(app)).cookie);
    expect((await other.get('/graph')).json().nodes).toEqual([]);
  });
});

describe('layout', () => {
  it('saves, updates and resets positions per view', async () => {
    const { t1, t2 } = await seed();
    const save = (viewKey: string, x: number) =>
      api.put('/graph/layout', { viewKey, positions: [{ nodeId: t1.id, x, y: 20 }, { nodeId: t2.id, x: 5, y: 5 }] });

    expect((await save('global', 10)).statusCode).toBe(204);
    expect((await save('global', 99)).statusCode).toBe(204);
    expect((await graph()).positions[t1.id]).toEqual({ x: 99, y: 20 });

    // Another view keeps its own positions.
    await save(`focus:${t1.id}`, 300);
    expect((await graph(`?focus=${t1.id}&viewKey=focus:${t1.id}`)).positions[t1.id]).toEqual({ x: 300, y: 20 });
    expect((await graph()).positions[t1.id]).toEqual({ x: 99, y: 20 });

    expect((await api.del('/graph/layout?viewKey=global')).statusCode).toBe(204);
    expect((await graph()).positions).toEqual({});
  });

  it('ignores positions for nodes the user does not own', async () => {
    const other = client(app, (await signedInUser(app)).cookie);
    const foreign = await other.node({ type: 'TASK', title: 'Ajena' });
    expect((await api.put('/graph/layout', { viewKey: 'global', positions: [{ nodeId: foreign.id, x: 1, y: 1 }] })).statusCode).toBe(204);
    expect((await other.get('/graph')).json().positions).toEqual({});
  });
});

describe('issues', () => {
  it('detects isolated nodes, inconsistent completion and possible duplicates', async () => {
    const { project, t1, idea } = await seed();
    const done = (await status('Completada')).id;
    await api.patch(`/nodes/${t1.id}`, { version: 1, statusId: done }); // done while its dependency is open
    await api.patch(`/nodes/${project.id}`, { version: 1, statusId: done }); // done with an open task
    await api.node({ type: 'IDEA', title: 'Modo offline!' }); // near-duplicate of "Modo offline"

    const items = (await api.get('/graph/issues')).json().items as { kind: string; nodes: { id: string; title: string }[] }[];
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain('DONE_WITH_OPEN_DEPENDENCY');
    expect(kinds).toContain('DONE_PARENT_WITH_OPEN_CHILDREN');
    const dup = items.find((i) => i.kind === 'POSSIBLE_DUPLICATE')!;
    expect(dup.nodes.map((n) => n.title).sort()).toEqual(['Modo offline', 'Modo offline!']);
    expect(items.filter((i) => i.kind === 'ISOLATED').map((i) => i.nodes[0]!.id)).toContain(idea.id);
  });

  it('flags dependencies on archived items', async () => {
    const { t2 } = await seed();
    await api.patch(`/nodes/${t2.id}`, { version: 1, archived: true });
    const kinds = (await api.get('/graph/issues')).json().items.map((i: { kind: string }) => i.kind);
    expect(kinds).toContain('DEPENDS_ON_ARCHIVED');
  });

  it('a duplicate pair already linked as DUPLICATES is not reported again', async () => {
    const a = await api.node({ type: 'IDEA', title: 'Modo offline' });
    const b = await api.node({ type: 'IDEA', title: 'Modo offline!' });
    await api.edge(a.id, b.id, 'DUPLICATES');
    const kinds = (await api.get('/graph/issues')).json().items.map((i: { kind: string }) => i.kind);
    expect(kinds).not.toContain('POSSIBLE_DUPLICATE');
  });
});
