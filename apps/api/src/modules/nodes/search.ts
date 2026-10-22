import { prisma } from '../../lib/prisma';

// f_unaccent, the full-text index and the trigram index are defined in the
// *_search_comments migration. Expressions here must match the indexed ones.

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

/**
 * Ids of the owner's nodes matching `q`, best match first. Matches Spanish word stems
 * ("facturar" ~ "facturación") and plain substrings, ignoring accents and case.
 */
export async function searchNodeIds(ownerId: string, q: string): Promise<string[]> {
  const like = `%${escapeLike(q.toLowerCase())}%`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text
    FROM "Node"
    WHERE "ownerId" = ${ownerId}::uuid
      AND (
        to_tsvector('spanish', f_unaccent("title" || ' ' || "body")) @@ websearch_to_tsquery('spanish', f_unaccent(${q}))
        OR f_unaccent(lower("title" || ' ' || "body")) LIKE f_unaccent(${like}) ESCAPE '\\'
      )
    ORDER BY
      ts_rank(to_tsvector('spanish', f_unaccent("title" || ' ' || "body")), websearch_to_tsquery('spanish', f_unaccent(${q}))) DESC,
      similarity(f_unaccent(lower("title")), f_unaccent(lower(${q}))) DESC,
      "createdAt" DESC
    LIMIT 500`;
  return rows.map((r) => r.id);
}

export interface SimilarNode {
  id: string;
  title: string;
  type: string;
  score: number;
}

/** Possible duplicates of `title` among active nodes (trigram similarity). */
export async function similarNodes(ownerId: string, title: string, excludeId?: string): Promise<SimilarNode[]> {
  const exclude = excludeId ?? null;
  return prisma.$queryRaw<SimilarNode[]>`
    SELECT id::text, "title", "type"::text AS type,
           similarity(f_unaccent(lower("title")), f_unaccent(lower(${title})))::float AS score
    FROM "Node"
    WHERE "ownerId" = ${ownerId}::uuid
      AND "deletedAt" IS NULL
      AND (${exclude}::uuid IS NULL OR id <> ${exclude}::uuid)
      AND f_unaccent(lower("title")) % f_unaccent(lower(${title}))
    ORDER BY score DESC
    LIMIT 5`;
}
