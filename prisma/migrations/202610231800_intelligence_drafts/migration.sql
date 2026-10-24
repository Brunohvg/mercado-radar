-- Additive only. Existing orders, observations, costs and analyses are untouched.
CREATE TABLE "RadarResearchDraft" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "accountId" TEXT,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RadarResearchDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RadarResearchDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RadarWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RadarResearchDraft_workspaceId_accountId_updatedAt_idx" ON "RadarResearchDraft"("workspaceId", "accountId", "updatedAt");
