CREATE TABLE "MarketItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "permalink" TEXT,
    "thumbnail" TEXT,
    "catalogProductId" TEXT,
    "categoryId" TEXT,
    "sellerId" TEXT,
    "sellerName" TEXT,
    "condition" TEXT,
    "lastPrice" DECIMAL(12,2),
    "lastOriginalPrice" DECIMAL(12,2),
    "lastSoldLower" INTEGER,
    "lastSoldUpper" INTEGER,
    "lastSoldLabel" TEXT,
    "lastReviews" INTEGER,
    "lastRating" DECIMAL(3,2),
    "freeShipping" BOOLEAN NOT NULL DEFAULT false,
    "fulfillment" BOOLEAN NOT NULL DEFAULT false,
    "bestSellerRank" INTEGER,
    "bestSellerLabel" TEXT,
    "dateCreated" TIMESTAMP(3),
    "isOwn" BOOLEAN NOT NULL DEFAULT false,
    "observationCount" INTEGER NOT NULL DEFAULT 0,
    "lastSnapshotAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketItemSnapshot" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "soldLower" INTEGER,
    "soldUpper" INTEGER,
    "soldExact" INTEGER,
    "reviews" INTEGER,
    "rating" DECIMAL(3,2),
    "bestSellerRank" INTEGER,
    "visitsTotal" INTEGER,
    "searchQuery" TEXT,
    "searchPosition" INTEGER,

    CONSTRAINT "MarketItemSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketItem_lastSeenAt_idx" ON "MarketItem"("lastSeenAt");
CREATE INDEX "MarketItem_catalogProductId_idx" ON "MarketItem"("catalogProductId");
CREATE INDEX "MarketItem_categoryId_idx" ON "MarketItem"("categoryId");
CREATE INDEX "MarketItem_isOwn_lastSeenAt_idx" ON "MarketItem"("isOwn", "lastSeenAt");
CREATE INDEX "MarketItemSnapshot_itemId_observedAt_idx" ON "MarketItemSnapshot"("itemId", "observedAt");
CREATE INDEX "MarketItemSnapshot_observedAt_idx" ON "MarketItemSnapshot"("observedAt");

ALTER TABLE "MarketItemSnapshot"
ADD CONSTRAINT "MarketItemSnapshot_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "MarketItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
