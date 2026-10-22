import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../env';

export const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });

export type Tx = Prisma.TransactionClient;

/**
 * Serializes graph mutations of a single user (slug allocation, cycle and
 * single-parent checks) so concurrent requests cannot race past validation.
 */
export async function lockOwner(tx: Tx, ownerId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 0))`;
}
