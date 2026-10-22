import { edgeCategory, type GraphIssueDTO, type GraphQuery, type NodeBrief, type SaveLayoutInput } from '@backlog/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { toEdgeDTO } from '../edges/service';
import { activeEdgeWhere, STRUCTURAL_TYPES } from '../edges/rules';
import { nodeInclude, toNodeDTO } from '../nodes/service';

/** Above this the global view is cut; focused views have no limit. */
export const GLOBAL_NODE_LIMIT = 1_500;

/**
 * Personal graphs are small (hundreds to a few thousand nodes), so the active graph is
 * loaded once and traversed in memory; relational storage plus an edge table is enough.
 */
export async function getGraph(ownerId: string, q: GraphQuery) {
  const nodeWhere: Prisma.NodeWhereInput = {
    ownerId,
    deletedAt: null,
    archivedAt: null,
    ...(!q.includeInbox && { type: { not: 'INBOX_ITEM' } }),
  };
  const [allNodes, allEdges] = await Promise.all([
    prisma.node.findMany({ where: nodeWhere, include: nodeInclude, orderBy: { createdAt: 'asc' } }),
    prisma.edge.findMany({ where: { ownerId, ...activeEdgeWhere } }),
  ]);

  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const edges = allEdges.filter((e) => nodeById.has(e.sourceId) && nodeById.has(e.targetId));
  const categoryOk = (e: (typeof edges)[number]) => !q.category || q.category.includes(edgeCategory(e.type));

  // Which nodes are in view: everything, or a breadth-first neighbourhood of the focus.
  let inView: Set<string>;
  const focus = (q.focus ?? []).filter((id) => nodeById.has(id));
  if (focus.length) {
    const neighbours = new Map<string, string[]>();
    for (const e of edges.filter(categoryOk)) {
      neighbours.set(e.sourceId, [...(neighbours.get(e.sourceId) ?? []), e.targetId]);
      neighbours.set(e.targetId, [...(neighbours.get(e.targetId) ?? []), e.sourceId]);
    }
    inView = new Set(focus);
    let frontier = focus;
    for (let hop = 0; hop < q.depth; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const n of neighbours.get(id) ?? []) {
          if (!inView.has(n)) {
            inView.add(n);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
  } else {
    inView = new Set(nodeById.keys());
  }

  // Display filters never hide the focus nodes themselves.
  const keep = (id: string) => {
    if (focus.includes(id)) return true;
    const n = nodeById.get(id)!;
    if (q.type && !q.type.includes(n.type)) return false;
    if (q.hideDone && n.status?.category === 'DONE') return false;
    return true;
  };
  let visibleIds = [...inView].filter(keep);
  const truncated = !focus.length && visibleIds.length > GLOBAL_NODE_LIMIT;
  if (truncated) visibleIds = visibleIds.slice(0, GLOBAL_NODE_LIMIT);
  const visible = new Set(visibleIds);

  const visibleEdges = edges.filter((e) => categoryOk(e) && visible.has(e.sourceId) && visible.has(e.targetId));
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.sourceId, (degree.get(e.sourceId) ?? 0) + 1);
    degree.set(e.targetId, (degree.get(e.targetId) ?? 0) + 1);
  }
  const shownDegree = new Map<string, number>();
  for (const e of visibleEdges) {
    shownDegree.set(e.sourceId, (shownDegree.get(e.sourceId) ?? 0) + 1);
    shownDegree.set(e.targetId, (shownDegree.get(e.targetId) ?? 0) + 1);
  }

  const layout = await prisma.nodeLayout.findMany({
    where: { ownerId, viewKey: q.viewKey, nodeId: { in: visibleIds } },
    select: { nodeId: true, x: true, y: true },
  });

  return {
    nodes: visibleIds.map((id) => ({
      ...toNodeDTO(nodeById.get(id)!),
      hiddenRelations: (degree.get(id) ?? 0) - (shownDegree.get(id) ?? 0),
    })),
    edges: visibleEdges.map(toEdgeDTO),
    positions: Object.fromEntries(layout.map((l) => [l.nodeId, { x: l.x, y: l.y }])),
    truncated,
  };
}

/** Upserts positions; ids that are not the owner's nodes are silently ignored. */
export async function saveLayout(ownerId: string, input: SaveLayoutInput) {
  const ids = input.positions.map((p) => p.nodeId);
  const xs = input.positions.map((p) => p.x);
  const ys = input.positions.map((p) => p.y);
  await prisma.$executeRaw`
    INSERT INTO "NodeLayout" ("ownerId", "viewKey", "nodeId", "x", "y", "updatedAt")
    SELECT ${ownerId}::uuid, ${input.viewKey}, n.id, p.x, p.y, now()
    FROM unnest(${ids}::uuid[], ${xs}::float8[], ${ys}::float8[]) AS p(id, x, y)
    JOIN "Node" n ON n.id = p.id AND n."ownerId" = ${ownerId}::uuid
    ON CONFLICT ("ownerId", "viewKey", "nodeId") DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y, "updatedAt" = now()`;
}

export async function resetLayout(ownerId: string, viewKey: string) {
  await prisma.nodeLayout.deleteMany({ where: { ownerId, viewKey } });
}

const brief = { select: { id: true, title: true, type: true } } as const;
const toBrief = (n: NodeBrief): NodeBrief => ({ id: n.id, title: n.title, type: n.type });

/** Structural problems worth reviewing; nothing is changed automatically. */
export async function graphIssues(ownerId: string): Promise<GraphIssueDTO[]> {
  const live = { deletedAt: null } as const;
  const [isolated, doneWithOpenDeps, doneParents, archivedDeps, duplicates] = await Promise.all([
    prisma.node.findMany({
      where: {
        ownerId,
        ...live,
        archivedAt: null,
        type: { not: 'INBOX_ITEM' },
        outgoing: { none: { target: live } },
        incoming: { none: { source: live } },
      },
      select: brief.select,
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.edge.findMany({
      where: {
        ownerId,
        type: 'DEPENDS_ON',
        source: { ...live, status: { category: 'DONE' } },
        target: { ...live, status: { category: { not: 'DONE' } } },
      },
      include: { source: brief, target: brief },
    }),
    prisma.edge.findMany({
      where: {
        ownerId,
        type: { in: STRUCTURAL_TYPES },
        source: { ...live, status: { category: 'DONE' } },
        target: { ...live, archivedAt: null, status: { category: { not: 'DONE' } } },
      },
      include: { source: brief, target: brief },
    }),
    prisma.edge.findMany({
      where: {
        ownerId,
        type: 'DEPENDS_ON',
        source: { ...live, archivedAt: null, status: { category: { not: 'DONE' } } },
        target: { ...live, archivedAt: { not: null } },
      },
      include: { source: brief, target: brief },
    }),
    prisma.$queryRaw<{ aId: string; aTitle: string; aType: string; bId: string; bTitle: string; bType: string }[]>`
      SELECT a.id::text AS "aId", a.title AS "aTitle", a.type::text AS "aType",
             b.id::text AS "bId", b.title AS "bTitle", b.type::text AS "bType"
      FROM "Node" a
      JOIN "Node" b ON a.id < b.id
        AND b."ownerId" = a."ownerId"
        AND b."deletedAt" IS NULL
        AND f_unaccent(lower(a.title)) % f_unaccent(lower(b.title))
      WHERE a."ownerId" = ${ownerId}::uuid
        AND a."deletedAt" IS NULL
        AND similarity(f_unaccent(lower(a.title)), f_unaccent(lower(b.title))) > 0.6
        AND NOT EXISTS (
          SELECT 1 FROM "Edge" e
          WHERE e.type = 'DUPLICATES'
            AND ((e."sourceId" = a.id AND e."targetId" = b.id) OR (e."sourceId" = b.id AND e."targetId" = a.id))
        )
      ORDER BY similarity(f_unaccent(lower(a.title)), f_unaccent(lower(b.title))) DESC
      LIMIT 50`,
  ]);

  return [
    ...doneWithOpenDeps.map((e) => ({
      kind: 'DONE_WITH_OPEN_DEPENDENCY' as const,
      nodes: [toBrief(e.source), toBrief(e.target)],
      edgeId: e.id,
    })),
    ...doneParents.map((e) => ({
      kind: 'DONE_PARENT_WITH_OPEN_CHILDREN' as const,
      nodes: [toBrief(e.source), toBrief(e.target)],
      edgeId: e.id,
    })),
    ...archivedDeps.map((e) => ({
      kind: 'DEPENDS_ON_ARCHIVED' as const,
      nodes: [toBrief(e.source), toBrief(e.target)],
      edgeId: e.id,
    })),
    ...duplicates.map((d) => ({
      kind: 'POSSIBLE_DUPLICATE' as const,
      nodes: [
        { id: d.aId, title: d.aTitle, type: d.aType as NodeBrief['type'] },
        { id: d.bId, title: d.bTitle, type: d.bType as NodeBrief['type'] },
      ],
    })),
    ...isolated.map((n) => ({ kind: 'ISOLATED' as const, nodes: [toBrief(n)] })),
  ];
}
