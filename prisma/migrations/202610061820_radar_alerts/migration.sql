CREATE TABLE "RadarAlert" (
    "id" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "watchItemId" TEXT,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RadarAlert_sellerUserId_readAt_createdAt_idx"
ON "RadarAlert"("sellerUserId", "readAt", "createdAt");

CREATE INDEX "RadarAlert_watchItemId_createdAt_idx"
ON "RadarAlert"("watchItemId", "createdAt");

CREATE INDEX "RadarAlert_kind_createdAt_idx"
ON "RadarAlert"("kind", "createdAt");

ALTER TABLE "RadarAlert"
ADD CONSTRAINT "RadarAlert_watchItemId_fkey"
FOREIGN KEY ("watchItemId") REFERENCES "RadarWatchItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
