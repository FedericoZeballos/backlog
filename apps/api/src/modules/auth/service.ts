import type { LoginInput, RegisterInput } from '@backlog/shared';
import { SESSION_TTL_DAYS } from '../../lib/auth';
import { randomToken, sha256, verifyPassword } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { prisma, type Tx } from '../../lib/prisma';
import { createUser } from '../users/service';

export async function createSession(userId: string, tx: Tx = prisma) {
  const token = randomToken();
  await tx.session.create({
    data: {
      id: sha256(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Same error for unknown email and wrong password: do not reveal which accounts exist.
  if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos');
  }
  if (user.disabledAt) throw new AppError(403, 'ACCOUNT_DISABLED', 'La cuenta está desactivada');
  return { user, token: await createSession(user.id) };
}

export async function logout(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

async function findUsableInvitation(token: string, tx: Tx = prisma) {
  const invitation = await tx.invitation.findUnique({ where: { tokenHash: sha256(token) } });
  if (!invitation || invitation.usedAt || invitation.revokedAt || invitation.expiresAt < new Date()) {
    throw new AppError(410, 'INVITATION_INVALID', 'La invitación no existe, ya se usó o venció');
  }
  return invitation;
}

/** Lets the signup page show whether the link is still valid (and prefill the email). */
export async function checkInvitation(token: string) {
  const invitation = await findUsableInvitation(token);
  return { email: invitation.email, expiresAt: invitation.expiresAt };
}

export async function register(input: RegisterInput) {
  return prisma.$transaction(async (tx) => {
    const invitation = await findUsableInvitation(input.token, tx);
    if (invitation.email && invitation.email !== input.email) {
      throw new AppError(422, 'INVITATION_EMAIL_MISMATCH', 'Esta invitación es para otro email');
    }
    if (await tx.user.findUnique({ where: { email: input.email } })) {
      throw new AppError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese email');
    }

    const user = await createUser(tx, {
      email: input.email,
      name: input.name,
      password: input.password,
      role: invitation.role,
    });

    // Conditional update: if two signups race on the same link, only one wins.
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, usedAt: null },
      data: { usedAt: new Date(), usedById: user.id },
    });
    if (claimed.count !== 1) throw new AppError(410, 'INVITATION_INVALID', 'La invitación ya se usó');

    return { user, token: await createSession(user.id, tx) };
  });
}
