/**
 * Creates the first administrator (there is no public signup).
 *   npm run create-admin -- --email vos@ejemplo.com --name "Tu nombre"
 * The password is asked interactively, or read from ADMIN_PASSWORD.
 * If the email already exists, that user is promoted to ADMIN.
 */
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { PasswordSchema } from '@backlog/shared';
import { z } from 'zod';
import { prisma } from '../src/lib/prisma';
import { createUser } from '../src/modules/users/service';

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' } },
});

const email = z.email().trim().toLowerCase().safeParse(values.email);
if (!email.success) {
  console.error('Uso: npm run create-admin -- --email vos@ejemplo.com --name "Tu nombre"');
  process.exit(1);
}

const existing = await prisma.user.findUnique({ where: { email: email.data } });
if (existing) {
  await prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN', disabledAt: null } });
  console.log(`${email.data} ya existía; ahora es administrador.`);
  process.exit(0);
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('Contraseña (mínimo 10 caracteres): ');
  rl.close();
}
const parsed = PasswordSchema.safeParse(password);
if (!parsed.success) {
  console.error(parsed.error.issues[0]?.message);
  process.exit(1);
}

await prisma.$transaction((tx) =>
  createUser(tx, { email: email.data, name: values.name ?? email.data.split('@')[0]!, password: parsed.data, role: 'ADMIN' }),
);
console.log(`Administrador ${email.data} creado.`);
await prisma.$disconnect();
