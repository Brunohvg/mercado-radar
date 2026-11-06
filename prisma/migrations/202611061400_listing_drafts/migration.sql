CREATE TABLE "ListingDraft" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "name" TEXT NOT NULL,
  "barcode" TEXT,
  "sku" TEXT,
  "categoryId" TEXT,
  "content" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ListingDraft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ListingDraft_workspaceId_updatedAt_idx" ON "ListingDraft"("workspaceId", "updatedAt");
CREATE INDEX "ListingDraft_workspaceId_status_idx" ON "ListingDraft"("workspaceId", "status");
CREATE INDEX "ListingDraft_ownerId_updatedAt_idx" ON "ListingDraft"("ownerId", "updatedAt");
ALTER TABLE "ListingDraft" ADD CONSTRAINT "ListingDraft_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "RadarWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingDraft" ADD CONSTRAINT "ListingDraft_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "RadarUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
