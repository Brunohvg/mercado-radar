ALTER TABLE "MarketSnapshot"
ADD COLUMN "mlItemId" TEXT,
ADD COLUMN "position" INTEGER;

CREATE INDEX "MarketSnapshot_sellerUserId_mlItemId_createdAt_idx"
ON "MarketSnapshot"("sellerUserId", "mlItemId", "createdAt");
