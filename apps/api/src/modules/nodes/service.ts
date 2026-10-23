import {
  checkRelation,
  edgeCategory,
  isActionable,
  structuralTypeFor,
  type Actor,
  type CreateNodeInput,
  type ListNodesQuery,
  type NodeType,
  type UpdateNodeInput,
} from '@backlog/shared';
import type { Prisma, Status } from '@prisma/client';
import { logActivity } from '../../lib/activity';
import { AppError, notFound } from '../../lib/errors';
import { lockOwner, prisma, withTx, type Tx } from '../../lib/prisma';
import { uniqueSlug } from '../../lib/slug';
import { activeEdgeWhere, assertEdgeAllowed, STRUCTURAL_TYPES } from '../edges/rules';
import { searchNodeIds } from './search';

export const nodeInclude = {
  status: { select: { id: true, name: true, category: true } },
} satisfies Prisma.NodeInclude;

export type NodeRow = Prisma.NodeGetPayload<{ include: typeof nodeInclude }>;

const toDateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const fromDateOnly = (s: string) => new Date(`${s}T00:00:00.000Z`);

export function toNodeDTO(node: NodeRow) {
  const { ownerId: _owner, statusId: _statusId, dueDate, ...rest } = node;
  return { ...rest, dueDate: toDateOnly(dueDate) };
}
export type NodeDTO = ReturnType<typeof toNodeDTO>;

/** Fields recorded in the activity log diff. */
function snapshot(node: NodeRow) {
  const { status: _s, createdAt: _c, updatedAt: _u, version: _v, ...fields } = toNodeDTO(node);
  return { ...fields, status: node.status?.name ?? null } as Record<string, unknown>;
}

async function defaultStatus(tx: Tx, ownerId: string): Promise<Status | null> {
  return tx.status.findFirst({ where: { ownerId }, orderBy: [{ isDefault: 'desc' }, { order: 'asc' }] });
}

/** Statuses only apply to actionable types; otherwise must be null. */
async function resolveStatus(tx: Tx, ownerId: string, type: NodeType, statusId: string | null | undefined) {
  if (!isActionable(type)) {
    if (statusId) throw new AppError(422, 'STATUS_NOT_ALLOWED', 'Este tipo de elemento no tiene estado');
    return null;
  }
  if (!statusId) return defaultStatus(tx, ownerId);
  const status = await tx.status.findFirst({ where: { id: statusId, ownerId } });
  if (!status) throw new AppError(422, 'INVALID_STATUS', 'El estado no existe');
  return status;
}

export async function listNodes(ownerId: string, q: ListNodesQuery) {
  const where: Prisma.NodeWhereInput = {
    ownerId,
    deletedAt: q.deleted ? { not: null } : null,
    ...(q.type && { type: { in: q.type } }),
    ...(q.processed !== undefined && { processed: q.processed }),
    ...(q.statusCategory && { status: { category: { in: q.statusCategory } } }),
    ...(q.archived === 'exclude' && { archivedAt: null }),
    ...(q.archived === 'only' && { archivedAt: { not: null } }),
  };

  if (!q.q) {
    const [items, total] = await prisma.$transaction([
      prisma.node.findMany({ where, include: nodeInclude, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      prisma.node.count({ where }),
    ]);
    return { items: items.map(toNodeDTO), total };
  }

  // Search: relevance order comes from SQL, filters from Prisma.
  const rankedIds = await searchNodeIds(ownerId, q.q);
  const matches = await prisma.node.findMany({ where: { ...where, id: { in: rankedIds } }, include: nodeInclude });
  const rank = new Map(rankedIds.map((id, i) => [id, i]));
  matches.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return { items: matches.slice(q.offset, q.offset + q.limit).map(toNodeDTO), total: matches.length };
}

// `version` and status let the client complete a related task without fetching it first.
const briefNode = {
  select: { id: true, title: true, type: true, version: true, status: { select: { id: true, name: true, category: true } } },
};

export async function getNode(ownerId: string, id: string) {
  const node = await prisma.node.findFirst({ where: { id, ownerId }, include: nodeInclude });
  if (!node) throw notFound();

  const edges = await prisma.edge.findMany({
    where: { ownerId, OR: [{ sourceId: id }, { targetId: id }], ...activeEdgeWhere },
    include: { source: briefNode, target: briefNode },
    orderBy: { createdAt: 'asc' },
  });

  return {
    node: toNodeDTO(node),
    relations: edges.map((e) => {
      const outgoing = e.sourceId === id;
      return {
        id: e.id,
        type: e.type,
        category: edgeCategory(e.type),
        direction: outgoing ? ('out' as const) : ('in' as const),
        note: e.note,
        createdBy: e.createdBy,
        createdAt: e.createdAt,
        node: outgoing ? e.target : e.source,
      };
    }),
  };
}

export async function createNode(ownerId: string, input: CreateNodeInput, actor: Actor = 'USER', outerTx?: Tx) {
  return withTx(outerTx, async (tx) => {
    await lockOwner(tx, ownerId);
    const status = await resolveStatus(tx, ownerId, input.type, input.statusId);
    const { statusId: _s, dueDate, processed, parentId, ...fields } = input;

    const node = await tx.node.create({
      data: {
        ...fields,
        ownerId,
        slug: await uniqueSlug(tx, ownerId, input.title),
        statusId: status?.id ?? null,
        dueDate: dueDate ? fromDateOnly(dueDate) : null,
        // Quick captures land unprocessed in the inbox; anything created with an explicit type does not.
        processed: processed ?? input.type !== 'INBOX_ITEM',
        completedAt: status?.category === 'DONE' ? new Date() : null,
      },
      include: nodeInclude,
    });
    await logActivity(tx, { ownerId, actor, action: 'CREATE', nodeId: node.id, diff: { after: snapshot(node) } as Prisma.InputJsonValue });
    if (parentId) await attachToParent(tx, ownerId, node, parentId, actor);
    return toNodeDTO(node);
  });
}

/** Creates the structural relation parent → child. Caller holds the owner lock. */
async function attachToParent(tx: Tx, ownerId: string, child: { id: string; type: NodeType }, parentId: string, actor: Actor) {
  const parent = await tx.node.findFirst({ where: { id: parentId, ownerId, deletedAt: null }, select: { id: true, type: true } });
  if (!parent) throw notFound('Elemento padre');
  const type = structuralTypeFor(parent.type, child.type);
  await assertEdgeAllowed(tx, { sourceId: parent.id, targetId: child.id, type }, parent.type, child.type);
  const edge = await tx.edge.create({ data: { ownerId, sourceId: parent.id, targetId: child.id, type, createdBy: actor } });
  await logActivity(tx, {
    ownerId,
    actor,
    action: 'LINK',
    nodeId: parent.id,
    edgeId: edge.id,
    diff: { after: { sourceId: parent.id, targetId: child.id, type } },
  });
}

/** Moves a node in the hierarchy (or detaches it with `parentId: null`) atomically. */
export async function setParent(ownerId: string, id: string, parentId: string | null, actor: Actor = 'USER', outerTx?: Tx) {
  await withTx(outerTx, async (tx) => {
    await lockOwner(tx, ownerId);
    const node = await tx.node.findFirst({ where: { id, ownerId, deletedAt: null }, select: { id: true, type: true } });
    if (!node) throw notFound();

    const current = await tx.edge.findFirst({ where: { targetId: id, type: { in: STRUCTURAL_TYPES }, ...activeEdgeWhere } });
    if (current?.sourceId === parentId) return;
    if (current) {
      await tx.edge.delete({ where: { id: current.id } });
      await logActivity(tx, {
        ownerId,
        actor,
        action: 'UNLINK',
        nodeId: current.sourceId,
        edgeId: current.id,
        diff: { before: { sourceId: current.sourceId, targetId: id, type: current.type } },
      });
    }
    if (parentId) await attachToParent(tx, ownerId, node, parentId, actor);
  });
}

/** Changing a node's type must not leave relations that the new type does not allow. */
async function assertEdgesFitType(tx: Tx, nodeId: string, newType: NodeType) {
  const edges = await tx.edge.findMany({
    where: { OR: [{ sourceId: nodeId }, { targetId: nodeId }], ...activeEdgeWhere },
    include: { source: { select: { id: true, type: true, title: true } }, target: { select: { id: true, type: true, title: true } } },
  });
  const invalid = edges.filter((e) => {
    const sourceType = e.sourceId === nodeId ? newType : e.source.type;
    const targetType = e.targetId === nodeId ? newType : e.target.type;
    return !checkRelation(e.type, sourceType, targetType).ok;
  });
  if (invalid.length) {
    throw new AppError(409, 'TYPE_BREAKS_RELATIONS', 'El nuevo tipo no es compatible con algunas relaciones existentes', {
      relations: invalid.map((e) => ({ id: e.id, type: e.type, sourceId: e.sourceId, targetId: e.targetId })),
    });
  }
}

const NULLABLE_FIELDS = ['priority', 'prioritySource', 'outcome', 'doneCriteria', 'nextAction', 'effort', 'effortSource', 'url'] as const;

export async function updateNode(ownerId: string, id: string, input: UpdateNodeInput, actor: Actor = 'USER', outerTx?: Tx) {
  return withTx(outerTx, async (tx) => {
    await lockOwner(tx, ownerId);
    const current = await tx.node.findFirst({ where: { id, ownerId, deletedAt: null }, include: nodeInclude });
    if (!current) throw notFound();
    if (current.version !== input.version) {
      throw new AppError(409, 'VERSION_CONFLICT', 'El elemento cambió mientras lo editabas; recargalo', {
        currentVersion: current.version,
      });
    }

    const type = input.type ?? current.type;
    if (type !== current.type) await assertEdgesFitType(tx, id, type);

    const data: Prisma.NodeUncheckedUpdateInput = { version: { increment: 1 } };
    if (input.type !== undefined) data.type = input.type;
    if (input.title !== undefined) data.title = input.title;
    if (input.body !== undefined) data.body = input.body;
    for (const f of NULLABLE_FIELDS) if (input[f] !== undefined) (data as Record<string, unknown>)[f] = input[f];
    if (input.dueDate !== undefined) data.dueDate = input.dueDate ? fromDateOnly(input.dueDate) : null;
    if (input.archived !== undefined) data.archivedAt = input.archived ? (current.archivedAt ?? new Date()) : null;
    if (input.processed !== undefined) data.processed = input.processed;
    else if (current.type === 'INBOX_ITEM' && type !== 'INBOX_ITEM') data.processed = true;

    // Status: re-resolve when it is set explicitly or the type change makes the current one invalid.
    let status: { id: string; category: string } | null = current.status;
    const typeChangesActionability = isActionable(type) !== isActionable(current.type);
    if (input.statusId !== undefined || typeChangesActionability) {
      status = await resolveStatus(tx, ownerId, type, input.statusId ?? null);
      data.statusId = status?.id ?? null;
    }

    const wasDone = current.status?.category === 'DONE';
    const isDone = status?.category === 'DONE';
    if (isDone && !wasDone) data.completedAt = new Date();
    if (!isDone && wasDone) data.completedAt = null;

    const updated = await tx.node.update({ where: { id }, data, include: nodeInclude });

    const before = snapshot(current);
    const after = snapshot(updated);
    const changed = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    if (changed.length) {
      await logActivity(tx, {
        ownerId,
        actor,
        action: 'UPDATE',
        nodeId: id,
        diff: {
          before: Object.fromEntries(changed.map((k) => [k, before[k]])),
          after: Object.fromEntries(changed.map((k) => [k, after[k]])),
        } as Prisma.InputJsonValue,
      });
    }
    if (isDone !== wasDone) {
      await logActivity(tx, { ownerId, actor, action: isDone ? 'COMPLETE' : 'REOPEN', nodeId: id });
    }
    return toNodeDTO(updated);
  });
}

/** Moves the node to the trash. Its relations are hidden, not removed, so restore brings them back. */
export async function deleteNode(ownerId: string, id: string, actor: Actor = 'USER') {
  await prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const node = await tx.node.findFirst({ where: { id, ownerId, deletedAt: null } });
    if (!node) throw notFound();
    await tx.node.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
    await logActivity(tx, { ownerId, actor, action: 'DELETE', nodeId: id });
  });
}

/**
 * Restores a node from the trash. While it was deleted, the rest of the graph may have
 * changed (e.g. a child got another parent); relations that would now break a rule are
 * removed and reported in `droppedRelations`.
 */
export async function restoreNode(ownerId: string, id: string, actor: Actor = 'USER') {
  return prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const node = await tx.node.findFirst({ where: { id, ownerId, deletedAt: { not: null } } });
    if (!node) throw notFound('Elemento en la papelera');
    await tx.node.update({ where: { id }, data: { deletedAt: null, version: { increment: 1 } } });

    const edges = await tx.edge.findMany({
      where: { OR: [{ sourceId: id }, { targetId: id }], ...activeEdgeWhere },
      include: { source: { select: { type: true } }, target: { select: { type: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const droppedRelations: { id: string; type: string; reason: string }[] = [];
    for (const e of edges) {
      try {
        await assertEdgeAllowed(tx, { ...e, existingEdgeId: e.id }, e.source.type, e.target.type);
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        await tx.edge.delete({ where: { id: e.id } });
        await logActivity(tx, {
          ownerId,
          actor,
          action: 'UNLINK',
          nodeId: e.sourceId,
          edgeId: e.id,
          diff: { before: { sourceId: e.sourceId, targetId: e.targetId, type: e.type }, reason: err.code },
        });
        droppedRelations.push({ id: e.id, type: e.type, reason: err.message });
      }
    }

    await logActivity(tx, { ownerId, actor, action: 'RESTORE', nodeId: id });
    const restored = await tx.node.findUniqueOrThrow({ where: { id }, include: nodeInclude });
    return { node: toNodeDTO(restored), droppedRelations };
  });
}

/** Permanent deletion; only from the trash. Relations go with it (FK cascade). */
export async function purgeNode(ownerId: string, id: string, actor: Actor = 'USER') {
  await prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const node = await tx.node.findFirst({ where: { id, ownerId, deletedAt: { not: null } }, include: nodeInclude });
    if (!node) throw notFound('Elemento en la papelera');
    await tx.node.delete({ where: { id } });
    await logActivity(tx, { ownerId, actor, action: 'PURGE', diff: { before: { id, ...snapshot(node) } } as Prisma.InputJsonValue });
  });
}

export async function getActivity(ownerId: string, nodeId: string) {
  const exists = await prisma.node.count({ where: { id: nodeId, ownerId } });
  if (!exists) throw notFound();
  return prisma.activityLog.findMany({
    where: { ownerId, nodeId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, actor: true, action: true, edgeId: true, diff: true, createdAt: true },
  });
}
