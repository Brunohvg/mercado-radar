CREATE TABLE "MarketSnapshot" (
  "id" TEXT NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "categoryId" TEXT,
  "resultCount" INTEGER NOT NULL,
  "minimumPrice" DECIMAL(12,2),
  "p25Price" DECIMAL(12,2),
  "medianPrice" DECIMAL(12,2),
  "p75Price" DECIMAL(12,2),
  "maximumPrice" DECIMAL(12,2),
  "averagePrice" DECIMAL(12,2),
  "testedPrice" DECIMAL(12,2),
  "marketGapPercent" DECIMAL(8,2),
  "opportunityScore" INTEGER,
  "verdict" TEXT,
  "competitors" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketSnapshot_sellerUserId_createdAt_idx"
ON "MarketSnapshot"("sellerUserId", "createdAt");

CREATE INDEX "MarketSnapshot_categoryId_createdAt_idx"
ON "MarketSnapshot"("categoryId", "createdAt");

CREATE INDEX "MarketSnapshot_verdict_createdAt_idx"
ON "MarketSnapshot"("verdict", "createdAt");
