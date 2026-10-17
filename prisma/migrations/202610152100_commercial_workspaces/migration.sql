BEGIN;
-- Existing operator data remains in its own legacy workspace. New writes must
-- explicitly provide the workspace: temporary backfill defaults are removed below.
-- CreateTable
CREATE TABLE "RadarWorkspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'PILOT',
    "dailyRequestLimit" INTEGER NOT NULL DEFAULT 500,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "workspaceId" TEXT NOT NULL,
    "isOperator" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarUserSession" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarUserSession_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "RadarWorkspaceUsage" (
    "workspaceId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RadarWorkspaceUsage_pkey" PRIMARY KEY ("workspaceId","day")
);

INSERT INTO "RadarWorkspace" ("id", "name", "dailyRequestLimit") VALUES ('default', 'Minha operação', 5000);
INSERT INTO "RadarWorkspace" ("id", "name") SELECT "id", 'Operação existente' FROM "AppSettings" WHERE "id" <> 'default' ON CONFLICT DO NOTHING;
-- DropForeignKey
ALTER TABLE "MarketItemSnapshot" DROP CONSTRAINT "MarketItemSnapshot_itemId_fkey";

-- DropIndex
DROP INDEX "Product_sku_key";

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "leadTimeDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "safetyStockDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "stockCoverageDays" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN     "taxPercent" DECIMAL(5,2),
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "ProductAnalysis" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "MercadoLivreAccount" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "SyncRun" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "MercadoLivreOrder" ADD COLUMN     "economicsVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "operatingCostApplied" DECIMAL(10,2),
ADD COLUMN     "refundDetected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxPercentApplied" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "MarketItem" DROP CONSTRAINT "MarketItem_pkey",
ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'default',
ADD CONSTRAINT "MarketItem_pkey" PRIMARY KEY ("workspaceId", "id");

-- AlterTable
ALTER TABLE "MarketItemSnapshot" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'default';

-- CreateIndex
CREATE UNIQUE INDEX "RadarUser_email_key" ON "RadarUser"("email");

-- CreateIndex
CREATE INDEX "RadarUser_workspaceId_idx" ON "RadarUser"("workspaceId");

-- CreateIndex
CREATE INDEX "RadarUserSession_expiresAt_idx" ON "RadarUserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "RadarUserSession_userId_idx" ON "RadarUserSession"("userId");

-- CreateIndex
CREATE INDEX "Product_workspaceId_idx" ON "Product"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_workspaceId_sku_key" ON "Product"("workspaceId", "sku");

-- CreateIndex
CREATE INDEX "ProductAnalysis_workspaceId_idx" ON "ProductAnalysis"("workspaceId");

-- CreateIndex
CREATE INDEX "MercadoLivreAccount_workspaceId_idx" ON "MercadoLivreAccount"("workspaceId");

-- CreateIndex
CREATE INDEX "SyncRun_workspaceId_idx" ON "SyncRun"("workspaceId");

-- CreateIndex
CREATE INDEX "MarketItem_workspaceId_idx" ON "MarketItem"("workspaceId");

-- AddForeignKey
ALTER TABLE "RadarUser" ADD CONSTRAINT "RadarUser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RadarWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarUserSession" ADD CONSTRAINT "RadarUserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "RadarUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarWorkspaceUsage" ADD CONSTRAINT "RadarWorkspaceUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RadarWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_id_fkey" FOREIGN KEY ("id") REFERENCES "RadarWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RadarWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAnalysis" ADD CONSTRAINT "ProductAnalysis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RadarWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MercadoLivreAccount" ADD CONSTRAINT "MercadoLivreAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RadarWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RadarWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketItem" ADD CONSTRAINT "MarketItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RadarWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketItemSnapshot" ADD CONSTRAINT "MarketItemSnapshot_workspaceId_itemId_fkey" FOREIGN KEY ("workspaceId", "itemId") REFERENCES "MarketItem"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Old profit projections omitted tax and cannot remain labeled realized.
UPDATE "MercadoLivreOrder" SET "profit" = NULL, "marginPercent" = NULL, "profitabilityStatus" = 'AWAITING_SETTINGS';
UPDATE "MercadoLivreOrderItem" SET "profit" = NULL;
ALTER TABLE "Product" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "ProductAnalysis" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "MercadoLivreAccount" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "SyncRun" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "MarketItem" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "MarketItemSnapshot" ALTER COLUMN "workspaceId" DROP DEFAULT;
COMMIT;
