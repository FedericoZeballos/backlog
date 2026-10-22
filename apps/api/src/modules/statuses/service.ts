import type { CreateStatusInput, UpdateStatusInput } from '@backlog/shared';
import { AppError, notFound } from '../../lib/errors';
import { lockOwner, prisma } from '../../lib/prisma';

const statusSelect = { id: true, name: true, category: true, order: true, isDefault: true } as const;

export function listStatuses(ownerId: string) {
  return prisma.status.findMany({ where: { ownerId }, orderBy: { order: 'asc' }, select: statusSelect });
}

export async function createStatus(ownerId: string, input: CreateStatusInput) {
  return prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const last = await tx.status.findFirst({ where: { ownerId }, orderBy: { order: 'desc' } });
    return tx.status.create({
      data: { ownerId, name: input.name, category: input.category, order: (last?.order ?? -1) + 1 },
      select: statusSelect,
    });
  });
}

export async function updateStatus(ownerId: string, id: string, input: UpdateStatusInput) {
  return prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const status = await tx.status.findFirst({ where: { id, ownerId } });
    if (!status) throw notFound('Estado');

    const category = input.category ?? status.category;
    if (input.category && input.category !== status.category) {
      // Would silently change what "completed" means for existing items.
      const used = await tx.node.count({ where: { statusId: id } });
      if (used) {
        throw new AppError(409, 'STATUS_IN_USE', `No se puede cambiar la categoría: lo usan ${used} elementos`, { count: used });
      }
    }
    if ((input.isDefault || status.isDefault) && category === 'DONE') {
      throw new AppError(422, 'INVALID_DEFAULT_STATUS', 'El estado por defecto no puede ser de tipo completado');
    }
    if (input.isDefault) await tx.status.updateMany({ where: { ownerId }, data: { isDefault: false } });

    return tx.status.update({
      where: { id },
      data: { name: input.name, category: input.category, isDefault: input.isDefault },
      select: statusSelect,
    });
  });
}

/** Items using the status must be moved to `moveTo` first (done in the same transaction). */
export async function deleteStatus(ownerId: string, id: string, moveTo?: string) {
  await prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const status = await tx.status.findFirst({ where: { id, ownerId } });
    if (!status) throw notFound('Estado');
    if (status.isDefault) {
      throw new AppError(422, 'DEFAULT_STATUS', 'Elegí otro estado por defecto antes de borrar este');
    }

    const used = await tx.node.count({ where: { statusId: id } });
    if (used) {
      if (!moveTo) {
        throw new AppError(409, 'STATUS_IN_USE', `Lo usan ${used} elementos; elegí a qué estado moverlos`, { count: used });
      }
      const target = await tx.status.findFirst({ where: { id: moveTo, ownerId } });
      if (!target || target.id === id) throw new AppError(422, 'INVALID_STATUS', 'El estado de destino no es válido');

      const changesCompletion = (status.category === 'DONE') !== (target.category === 'DONE');
      await tx.node.updateMany({
        where: { statusId: id },
        data: {
          statusId: target.id,
          version: { increment: 1 },
          ...(changesCompletion && { completedAt: target.category === 'DONE' ? new Date() : null }),
        },
      });
    }
    await tx.status.delete({ where: { id } });
  });
}

export async function reorderStatuses(ownerId: string, ids: string[]) {
  await prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const existing = await tx.status.findMany({ where: { ownerId }, select: { id: true } });
    const same = existing.length === ids.length && existing.every((s) => ids.includes(s.id));
    if (!same) throw new AppError(422, 'INVALID_ORDER', 'La lista debe incluir todos los estados exactamente una vez');
    await Promise.all(ids.map((id, order) => tx.status.update({ where: { id }, data: { order } })));
  });
  return listStatuses(ownerId);
}
