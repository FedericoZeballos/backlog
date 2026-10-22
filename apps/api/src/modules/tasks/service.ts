import type { NodeType, Priority, ViewQuery } from '@backlog/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { activeEdgeWhere, STRUCTURAL_TYPES } from '../edges/rules';
import { nodeInclude, toNodeDTO, type NodeRow } from '../nodes/service';

const PRIORITY_RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };

/** Urgent first, then earliest due date, then oldest. */
function byPriorityThenDue(a: NodeRow, b: NodeRow) {
  const pa = PRIORITY_RANK[a.priority ?? 'NONE'];
  const pb = PRIORITY_RANK[b.priority ?? 'NONE'];
  if (pa !== pb) return pa - pb;
  const da = a.dueDate?.getTime() ?? Infinity;
  const db = b.dueDate?.getTime() ?? Infinity;
  if (da !== db) return da - db;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

const brief = { select: { id: true, title: true, type: true } } as const;

/** Adds each node's structural parent and its unfinished dependencies (blockers). */
async function withContext(ownerId: string, nodes: NodeRow[]) {
  const ids = nodes.map((n) => n.id);
  const [parents, deps] = await Promise.all([
    prisma.edge.findMany({
      where: { ownerId, targetId: { in: ids }, type: { in: STRUCTURAL_TYPES }, ...activeEdgeWhere },
      include: { source: brief },
    }),
    prisma.edge.findMany({
      where: {
        ownerId,
        sourceId: { in: ids },
        type: 'DEPENDS_ON',
        ...activeEdgeWhere,
        target: { deletedAt: null, status: { category: { not: 'DONE' } } },
      },
      include: { target: brief },
    }),
  ]);
  const parentOf = new Map(parents.map((e) => [e.targetId, e.source]));
  const blockersOf = new Map<string, { id: string; title: string; type: NodeType }[]>();
  for (const e of deps) blockersOf.set(e.sourceId, [...(blockersOf.get(e.sourceId) ?? []), e.target]);

  return nodes.map((n) => ({
    ...toNodeDTO(n),
    parent: parentOf.get(n.id) ?? null,
    blockers: blockersOf.get(n.id) ?? [],
  }));
}

const activeWork = (ownerId: string, types: NodeType[]): Prisma.NodeWhereInput => ({
  ownerId,
  type: { in: types },
  deletedAt: null,
  archivedAt: null,
});

const notDone: Prisma.NodeWhereInput = { OR: [{ statusId: null }, { status: { category: { not: 'DONE' } } }] };

const dateOnly = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** Overdue, due today, or already in progress; plus what was completed since local midnight. */
export async function todayView(ownerId: string, q: ViewQuery) {
  const pending = await prisma.node.findMany({
    where: {
      ...activeWork(ownerId, ['TASK']),
      AND: [notDone, { OR: [{ dueDate: { lte: dateOnly(q.date) } }, { status: { category: 'IN_PROGRESS' } }] }],
    },
    include: nodeInclude,
  });
  const done = q.since
    ? await prisma.node.findMany({
        where: { ...activeWork(ownerId, ['TASK']), completedAt: { gte: new Date(q.since) } },
        include: nodeInclude,
        orderBy: { completedAt: 'desc' },
      })
    : [];
  return {
    items: await withContext(ownerId, pending.sort(byPriorityThenDue)),
    completed: await withContext(ownerId, done),
  };
}

/** Due after today and within `days`. */
export async function upcomingView(ownerId: string, q: ViewQuery) {
  const from = dateOnly(q.date);
  const to = new Date(from.getTime() + q.days * 24 * 60 * 60 * 1000);
  const nodes = await prisma.node.findMany({
    where: { ...activeWork(ownerId, ['TASK', 'PROJECT']), ...notDone, dueDate: { gt: from, lte: to } },
    include: nodeInclude,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
  });
  return { items: await withContext(ownerId, nodes) };
}

/** Marked as blocked, or waiting on an unfinished dependency. */
export async function blockedView(ownerId: string) {
  const nodes = await prisma.node.findMany({
    where: {
      ...activeWork(ownerId, ['TASK', 'PROJECT']),
      AND: [
        notDone,
        {
          OR: [
            { status: { category: 'BLOCKED' } },
            {
              outgoing: {
                some: { type: 'DEPENDS_ON', target: { deletedAt: null, status: { category: { not: 'DONE' } } } },
              },
            },
          ],
        },
      ],
    },
    include: nodeInclude,
  });
  return { items: await withContext(ownerId, nodes.sort(byPriorityThenDue)) };
}

const BACKLOG_TYPES: NodeType[] = ['IDEA', 'PROBLEM', 'TASK', 'PROJECT'];

/** Processed, uncommitted or pending work: ideas and problems sit here without becoming tasks. */
export async function backlogView(ownerId: string, types?: NodeType[]) {
  const nodes = await prisma.node.findMany({
    where: {
      ...activeWork(ownerId, types?.length ? types.filter((t) => BACKLOG_TYPES.includes(t)) : BACKLOG_TYPES),
      processed: true,
      ...notDone,
    },
    include: nodeInclude,
  });
  return { items: await withContext(ownerId, nodes.sort(byPriorityThenDue)) };
}

const TREE_TYPES: NodeType[] = ['AREA', 'GOAL', 'PROJECT', 'TASK'];

/** Areas, goals, projects and tasks with their structural parent, for tree views and progress. */
export async function treeView(ownerId: string) {
  const nodes = await prisma.node.findMany({
    where: activeWork(ownerId, TREE_TYPES),
    include: nodeInclude,
    orderBy: { createdAt: 'asc' },
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edges = await prisma.edge.findMany({
    where: { ownerId, type: { in: STRUCTURAL_TYPES }, ...activeEdgeWhere },
    select: { sourceId: true, targetId: true },
  });
  const parentOf = new Map(edges.filter((e) => ids.has(e.sourceId)).map((e) => [e.targetId, e.sourceId]));
  return { items: nodes.map((n) => ({ ...toNodeDTO(n), parentId: parentOf.get(n.id) ?? null })) };
}
