-- CreateTable
CREATE TABLE "NodeLayout" (
    "ownerId" UUID NOT NULL,
    "viewKey" TEXT NOT NULL,
    "nodeId" UUID NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeLayout_pkey" PRIMARY KEY ("ownerId","viewKey","nodeId")
);

-- AddForeignKey
ALTER TABLE "NodeLayout" ADD CONSTRAINT "NodeLayout_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeLayout" ADD CONSTRAINT "NodeLayout_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
