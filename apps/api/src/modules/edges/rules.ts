import { checkRelation, edgeTypesInCategory, RELATION_RULES, type EdgeType, type NodeType } from '@backlog/shared';
import { AppError } from '../../lib/errors';
import type { Tx } from '../../lib/prisma';

const STRUCTURAL_TYPES = edgeTypesInCategory('STRUCTURAL');

/** Edges whose two endpoints are not in the trash. */
export const activeEdgeWhere = { source: { deletedAt: null }, target: { deletedAt: null } } as const;

/**
 * Returns the node ids along a path from `fromId` to `toId` using only `types`
 * and skipping deleted nodes, or null if no such path exists.
 */
export async function findPath(tx: Tx, fromId: string, toId: string, types: EdgeType[]): Promise<string[] | null> {
  const rows = await tx.$queryRaw<{ path: string[] }[]>`
    WITH RECURSIVE reach(id, path) AS (
      SELECT ${fromId}::uuid, ARRAY[${fromId}::uuid]
      UNION ALL
      SELECT e."targetId", r.path || e."targetId"
      FROM reach r
      JOIN "Edge" e ON e."sourceId" = r.id
      JOIN "Node" n ON n.id = e."targetId" AND n."deletedAt" IS NULL
      WHERE e.type::text = ANY(${types}::text[])
        AND NOT e."targetId" = ANY(r.path)
    )
    SELECT path::text[] AS path FROM reach WHERE id = ${toId}::uuid LIMIT 1`;
  return rows[0]?.path ?? null;
}

interface EdgeCandidate {
  sourceId: string;
  targetId: string;
  type: EdgeType;
  /** Set when re-validating an edge that already exists (restore), so it does not conflict with itself. */
  existingEdgeId?: string;
}

/**
 * Domain checks shared by edge creation and node restore.
 * Throws an AppError describing the first violated rule.
 */
export async function assertEdgeAllowed(
  tx: Tx,
  edge: EdgeCandidate,
  sourceType: NodeType,
  targetType: NodeType,
): Promise<void> {
  if (edge.sourceId === edge.targetId) {
    throw new AppError(400, 'SELF_RELATION', 'Un elemento no puede relacionarse consigo mismo');
  }

  const check = checkRelation(edge.type, sourceType, targetType);
  if (!check.ok) throw new AppError(422, 'INVALID_RELATION', check.reason);

  const rule = RELATION_RULES[edge.type];
  const notSelf = edge.existingEdgeId ? { id: { not: edge.existingEdgeId } } : {};

  if (!edge.existingEdgeId) {
    const duplicate = await tx.edge.findFirst({
      where: {
        type: edge.type,
        OR: [
          { sourceId: edge.sourceId, targetId: edge.targetId },
          ...(rule.symmetric ? [{ sourceId: edge.targetId, targetId: edge.sourceId }] : []),
        ],
      },
    });
    if (duplicate) throw new AppError(409, 'DUPLICATE_RELATION', 'Esa relación ya existe');
  }

  if (rule.category === 'STRUCTURAL') {
    const parent = await tx.edge.findFirst({
      where: { targetId: edge.targetId, type: { in: STRUCTURAL_TYPES }, ...activeEdgeWhere, ...notSelf },
      include: { source: { select: { id: true, title: true } } },
    });
    if (parent) {
      throw new AppError(409, 'ALREADY_HAS_PARENT', `Ya pertenece a "${parent.source.title}"`, {
        parentId: parent.source.id,
      });
    }
  }

  if (rule.category !== 'CONCEPTUAL') {
    const sameCategory = edgeTypesInCategory(rule.category);
    const path = await findPath(tx, edge.targetId, edge.sourceId, sameCategory);
    if (path) {
      throw new AppError(
        409,
        'CYCLE_DETECTED',
        rule.category === 'EXECUTION'
          ? 'Esa dependencia crearía un ciclo: las tareas se bloquearían entre sí'
          : 'Esa relación crearía un ciclo en la jerarquía',
        { path: [edge.sourceId, ...path] },
      );
    }
  }
}
