import type { StatusCategory, UserRole } from '@backlog/shared';
import { hashPassword } from '../../lib/crypto';
import type { Tx } from '../../lib/prisma';

export const DEFAULT_STATUSES: { name: string; category: StatusCategory; isDefault?: boolean }[] = [
  { name: 'Pendiente', category: 'TODO', isDefault: true },
  { name: 'En progreso', category: 'IN_PROGRESS' },
  { name: 'Bloqueada', category: 'BLOCKED' },
  { name: 'Completada', category: 'DONE' },
];

interface NewUser {
  email: string;
  name: string;
  password: string;
  role?: UserRole;
}

/** Creates the user together with their default task statuses. */
export async function createUser(tx: Tx, input: NewUser) {
  const user = await tx.user.create({
    data: {
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      role: input.role ?? 'USER',
    },
  });
  await tx.status.createMany({
    data: DEFAULT_STATUSES.map((s, order) => ({
      ownerId: user.id,
      name: s.name,
      category: s.category,
      order,
      isDefault: s.isDefault ?? false,
    })),
  });
  return user;
}

export function toUserDTO(user: { id: string; email: string; name: string; role: UserRole; disabledAt: Date | null; createdAt: Date }) {
  const { id, email, name, role, disabledAt, createdAt } = user;
  return { id, email, name, role, disabledAt, createdAt };
}
