CREATE TYPE "ListingType" AS ENUM ('CLASSIC', 'PREMIUM');
CREATE TYPE "AnalysisVerdict" AS ENUM ('GOOD', 'TIGHT', 'BAD', 'KIT_ONLY', 'REPRICE');

CREATE TABLE "AppSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "bibeloDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 35,
  "targetMarginPercent" DECIMAL(5,2) NOT NULL DEFAULT 20,
  "targetRoiPercent" DECIMAL(5,2) NOT NULL DEFAULT 30,
  "operatingCostDefault" DECIMAL(10,2) NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "supplier" TEXT NOT NULL DEFAULT 'Bibelô',
  "supplierPrice" DECIMAL(12,2) NOT NULL,
  "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 35,
  "weightGrams" INTEGER,
  "widthCm" DECIMAL(8,2),
  "heightCm" DECIMAL(8,2),
  "lengthCm" DECIMAL(8,2),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductAnalysis" (
  "id" TEXT NOT NULL,
  "productId" TEXT,
  "productName" TEXT NOT NULL,
  "listingType" "ListingType" NOT NULL DEFAULT 'CLASSIC',
  "kitQuantity" INTEGER NOT NULL DEFAULT 1,
  "supplierPrice" DECIMAL(12,2) NOT NULL,
  "discountPercent" DECIMAL(5,2) NOT NULL,
  "unitCost" DECIMAL(12,2) NOT NULL,
  "purchaseCost" DECIMAL(12,2) NOT NULL,
  "salePrice" DECIMAL(12,2) NOT NULL,
  "commissionPercent" DECIMAL(5,2) NOT NULL,
  "commissionAmount" DECIMAL(12,2) NOT NULL,
  "fixedFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "shippingCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "operatingCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "amountReceived" DECIMAL(12,2) NOT NULL,
  "profit" DECIMAL(12,2) NOT NULL,
  "marginPercent" DECIMAL(7,2) NOT NULL,
  "roiPercent" DECIMAL(7,2) NOT NULL,
  "targetMarginPercent" DECIMAL(5,2) NOT NULL,
  "targetRoiPercent" DECIMAL(5,2) NOT NULL,
  "minimumSuggestedPrice" DECIMAL(12,2) NOT NULL,
  "verdict" "AnalysisVerdict" NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MercadoLivreAccount" (
  "id" TEXT NOT NULL,
  "mercadoLivreUserId" TEXT NOT NULL,
  "nickname" TEXT,
  "accessTokenEncrypted" TEXT NOT NULL,
  "refreshTokenEncrypted" TEXT NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "scopes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MercadoLivreAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncRun" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "itemsRead" INTEGER NOT NULL DEFAULT 0,
  "itemsSaved" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "metadata" JSONB,
  CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt");
CREATE INDEX "Product_active_idx" ON "Product"("active");
CREATE INDEX "ProductAnalysis_productId_createdAt_idx" ON "ProductAnalysis"("productId", "createdAt");
CREATE INDEX "ProductAnalysis_verdict_createdAt_idx" ON "ProductAnalysis"("verdict", "createdAt");
CREATE UNIQUE INDEX "MercadoLivreAccount_mercadoLivreUserId_key" ON "MercadoLivreAccount"("mercadoLivreUserId");
CREATE INDEX "SyncRun_kind_startedAt_idx" ON "SyncRun"("kind", "startedAt");

ALTER TABLE "ProductAnalysis"
ADD CONSTRAINT "ProductAnalysis_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
