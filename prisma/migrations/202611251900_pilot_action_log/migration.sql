-- CreateTable
CREATE TABLE "PilotActionLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "sellerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mlItemId" TEXT NOT NULL,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PilotActionLog_workspaceId_createdAt_idx" ON "PilotActionLog"("workspaceId", "createdAt");
