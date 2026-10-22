import { edgeCategory, type Actor, type CreateEdgeInput } from '@backlog/shared';
import { logActivity } from '../../lib/activity';
import { notFound } from '../../lib/errors';
import { lockOwner, prisma } from '../../lib/prisma';
import { assertEdgeAllowed } from './rules';

type EdgeRow = Awaited<ReturnType<typeof prisma.edge.create>>;

export function toEdgeDTO(edge: EdgeRow) {
  return {
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    type: edge.type,
    category: edgeCategory(edge.type),
    note: edge.note,
    createdBy: edge.createdBy,
    createdAt: edge.createdAt,
  };
}

export async function createEdge(ownerId: string, input: CreateEdgeInput, actor: Actor = 'USER') {
  return prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);

    const endpoints = await tx.node.findMany({
      where: { ownerId, deletedAt: null, id: { in: [input.sourceId, input.targetId] } },
      select: { id: true, type: true },
    });
    const source = endpoints.find((n) => n.id === input.sourceId);
    const target = endpoints.find((n) => n.id === input.targetId);
    if (!source) throw notFound('Elemento de origen');
    if (!target) throw notFound('Elemento de destino');

    await assertEdgeAllowed(tx, input, source.type, target.type);

    const edge = await tx.edge.create({
      data: { ownerId, sourceId: input.sourceId, targetId: input.targetId, type: input.type, note: input.note, createdBy: actor },
    });
    await logActivity(tx, {
      ownerId,
      actor,
      action: 'LINK',
      nodeId: edge.sourceId,
      edgeId: edge.id,
      diff: { after: { sourceId: edge.sourceId, targetId: edge.targetId, type: edge.type } },
    });
    return toEdgeDTO(edge);
  });
}

export async function deleteEdge(ownerId: string, edgeId: string, actor: Actor = 'USER') {
  await prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const edge = await tx.edge.findFirst({ where: { id: edgeId, ownerId } });
    if (!edge) throw notFound('Relación');
    await tx.edge.delete({ where: { id: edge.id } });
    await logActivity(tx, {
      ownerId,
      actor,
      action: 'UNLINK',
      nodeId: edge.sourceId,
      edgeId: edge.id,
      diff: { before: { sourceId: edge.sourceId, targetId: edge.targetId, type: edge.type } },
    });
  });
}
