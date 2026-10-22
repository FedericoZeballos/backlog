import type { Tx } from './prisma';

const MAX_SLUG_LENGTH = 80;

export function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug || 'nota';
}

/** Caller must hold the owner lock (see lockOwner) so two requests cannot pick the same slug. */
export async function uniqueSlug(tx: Tx, ownerId: string, title: string): Promise<string> {
  const base = slugify(title);
  const taken = new Set(
    (
      await tx.node.findMany({
        where: { ownerId, slug: { startsWith: base } },
        select: { slug: true },
      })
    ).map((n) => n.slug),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}
