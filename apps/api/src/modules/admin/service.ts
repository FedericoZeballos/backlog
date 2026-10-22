import type { CreateInvitationInput } from '@backlog/shared';
import { env } from '../../env';
import { randomToken, sha256 } from '../../lib/crypto';
import { AppError, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { toUserDTO } from '../users/service';

const invitationSelect = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  usedAt: true,
  revokedAt: true,
  createdAt: true,
  usedBy: { select: { id: true, email: true, name: true } },
} as const;

/** The plain token is returned only here; the DB stores just its hash. */
export async function createInvitation(adminId: string, input: CreateInvitationInput) {
  const token = randomToken();
  const invitation = await prisma.invitation.create({
    data: {
      tokenHash: sha256(token),
      email: input.email,
      role: input.role,
      createdById: adminId,
      expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
    },
    select: invitationSelect,
  });
  return { invitation, token, url: `${env.APP_URL}/invite/${token}` };
}

export function listInvitations() {
  return prisma.invitation.findMany({ orderBy: { createdAt: 'desc' }, select: invitationSelect });
}

export async function revokeInvitation(id: string) {
  const result = await prisma.invitation.updateMany({
    where: { id, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) throw notFound('Invitación pendiente');
}

/** Admins manage accounts only; they never get access to other users' nodes. */
export async function listUsers() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  return users.map(toUserDTO);
}

export async function setUserDisabled(adminId: string, userId: string, disabled: boolean) {
  if (adminId === userId) throw new AppError(422, 'CANNOT_DISABLE_SELF', 'No podés desactivar tu propia cuenta');
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound('Usuario');
    const updated = await tx.user.update({
      where: { id: userId },
      data: { disabledAt: disabled ? (user.disabledAt ?? new Date()) : null },
    });
    if (disabled) await tx.session.deleteMany({ where: { userId } });
    return toUserDTO(updated);
  });
}
