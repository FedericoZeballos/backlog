-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('AREA', 'GOAL', 'PROJECT', 'TASK', 'IDEA', 'PROBLEM', 'NOTE', 'DECISION', 'RESOURCE', 'INBOX_ITEM');

-- CreateEnum
CREATE TYPE "EdgeType" AS ENUM ('CONTAINS', 'PARENT_OF', 'DEPENDS_ON', 'RELATED_TO', 'DOCUMENTS', 'DEVELOPS', 'INFORMS', 'SUPPORTS', 'DERIVED_FROM', 'DUPLICATES');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ValueSource" AS ENUM ('USER', 'AI_SUGGESTED');

-- CreateEnum
CREATE TYPE "StatusCategory" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE');

-- CreateEnum
CREATE TYPE "Actor" AS ENUM ('USER', 'AI');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'PURGE', 'COMPLETE', 'REOPEN', 'LINK', 'UNLINK');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedById" UUID,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Status" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "StatusCategory" NOT NULL,
    "order" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Node" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "type" "NodeType" NOT NULL DEFAULT 'INBOX_ITEM',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL,
    "statusId" UUID,
    "priority" "Priority",
    "prioritySource" "ValueSource",
    "dueDate" DATE,
    "outcome" TEXT,
    "doneCriteria" TEXT,
    "nextAction" TEXT,
    "effort" INTEGER,
    "effortSource" "ValueSource",
    "url" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT true,
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Edge" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "type" "EdgeType" NOT NULL,
    "note" TEXT,
    "createdBy" "Actor" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Edge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "actor" "Actor" NOT NULL DEFAULT 'USER',
    "action" "ActivityAction" NOT NULL,
    "nodeId" UUID,
    "edgeId" UUID,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_usedById_key" ON "Invitation"("usedById");

-- CreateIndex
CREATE UNIQUE INDEX "Status_ownerId_name_key" ON "Status"("ownerId", "name");

-- CreateIndex
CREATE INDEX "Node_ownerId_type_idx" ON "Node"("ownerId", "type");

-- CreateIndex
CREATE INDEX "Node_ownerId_deletedAt_idx" ON "Node"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Node_ownerId_processed_idx" ON "Node"("ownerId", "processed");

-- CreateIndex
CREATE INDEX "Node_ownerId_dueDate_idx" ON "Node"("ownerId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Node_ownerId_slug_key" ON "Node"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "Edge_ownerId_sourceId_idx" ON "Edge"("ownerId", "sourceId");

-- CreateIndex
CREATE INDEX "Edge_ownerId_targetId_idx" ON "Edge"("ownerId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Edge_sourceId_targetId_type_key" ON "Edge"("sourceId", "targetId", "type");

-- CreateIndex
CREATE INDEX "ActivityLog_ownerId_nodeId_createdAt_idx" ON "ActivityLog"("ownerId", "nodeId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Status" ADD CONSTRAINT "Status_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "Status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edge" ADD CONSTRAINT "Edge_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edge" ADD CONSTRAINT "Edge_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edge" ADD CONSTRAINT "Edge_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Constraints Prisma cannot express in schema.prisma
ALTER TABLE "Edge" ADD CONSTRAINT "Edge_no_self_loop" CHECK ("sourceId" <> "targetId");
ALTER TABLE "Node" ADD CONSTRAINT "Node_title_not_blank" CHECK (length(btrim("title")) > 0);
ALTER TABLE "Node" ADD CONSTRAINT "Node_version_positive" CHECK ("version" >= 1);
