CREATE TABLE "RadarWatchItem" (
    "id" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "mlItemId" TEXT NOT NULL,
    "referenceId" TEXT,
    "title" TEXT NOT NULL,
    "permalink" TEXT,
    "thumbnail" TEXT,
    "currentPrice" DECIMAL(12,2),
    "score" INTEGER,
    "demandLabel" TEXT,
    "soldQuantity" INTEGER NOT NULL DEFAULT 0,
    "visits" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarWatchItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RadarWatchSnapshot" (
    "id" TEXT NOT NULL,
    "watchItemId" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "score" INTEGER,
    "demandLabel" TEXT,
    "soldQuantity" INTEGER NOT NULL DEFAULT 0,
    "visits" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarWatchSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RadarWatchItem_sellerUserId_mlItemId_key"
ON "RadarWatchItem"("sellerUserId", "mlItemId");

CREATE INDEX "RadarWatchItem_sellerUserId_active_updatedAt_idx"
ON "RadarWatchItem"("sellerUserId", "active", "updatedAt");

CREATE INDEX "RadarWatchSnapshot_watchItemId_capturedAt_idx"
ON "RadarWatchSnapshot"("watchItemId", "capturedAt");

ALTER TABLE "RadarWatchSnapshot"
ADD CONSTRAINT "RadarWatchSnapshot_watchItemId_fkey"
FOREIGN KEY ("watchItemId") REFERENCES "RadarWatchItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
