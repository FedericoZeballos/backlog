import type { ActivityAction, Actor } from '@backlog/shared';
import type { Prisma } from '@prisma/client';
import type { Tx } from './prisma';

interface ActivityEntry {
  ownerId: string;
  action: ActivityAction;
  actor?: Actor;
  nodeId?: string | null;
  edgeId?: string | null;
  diff?: Prisma.InputJsonValue;
}

/** Always call inside the same transaction as the change it records. */
export async function logActivity(tx: Tx, entry: ActivityEntry) {
  await tx.activityLog.create({
    data: {
      ownerId: entry.ownerId,
      action: entry.action,
      actor: entry.actor ?? 'USER',
      nodeId: entry.nodeId ?? null,
      edgeId: entry.edgeId ?? null,
      diff: entry.diff,
    },
  });
}
