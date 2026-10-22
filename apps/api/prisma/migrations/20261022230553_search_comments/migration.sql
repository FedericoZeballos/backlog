-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "nodeId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comment_nodeId_createdAt_idx" ON "Comment"("nodeId", "createdAt");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Search: accent-insensitive full text (Spanish stemming) and trigram similarity for duplicate detection.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() is STABLE; indexes need an IMMUTABLE wrapper with an explicit dictionary.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE INDEX "Node_search_fts" ON "Node"
  USING gin (to_tsvector('spanish', f_unaccent("title" || ' ' || "body")));
CREATE INDEX "Node_title_trgm" ON "Node"
  USING gin (f_unaccent(lower("title")) gin_trgm_ops);

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_body_not_blank" CHECK (length(btrim("body")) > 0);
