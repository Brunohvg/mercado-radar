CREATE TABLE "MercadoLivreProduct" (
  "id" TEXT NOT NULL,
  "mlItemId" TEXT NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sku" TEXT,
  "categoryId" TEXT,
  "status" TEXT NOT NULL,
  "listingTypeId" TEXT,
  "currentPrice" DECIMAL(12,2),
  "availableQuantity" INTEGER NOT NULL DEFAULT 0,
  "soldQuantity" INTEGER NOT NULL DEFAULT 0,
  "visitsTotal" INTEGER,
  "permalink" TEXT,
  "thumbnail" TEXT,
  "freeShipping" BOOLEAN NOT NULL DEFAULT false,
  "raw" JSONB NOT NULL,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MercadoLivreProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivreProduct_mlItemId_key"
ON "MercadoLivreProduct"("mlItemId");

CREATE INDEX "MercadoLivreProduct_sellerUserId_status_idx"
ON "MercadoLivreProduct"("sellerUserId", "status");

CREATE INDEX "MercadoLivreProduct_sellerUserId_soldQuantity_idx"
ON "MercadoLivreProduct"("sellerUserId", "soldQuantity");

CREATE INDEX "MercadoLivreProduct_lastSyncedAt_idx"
ON "MercadoLivreProduct"("lastSyncedAt");

CREATE TABLE "MercadoLivreOrder" (
  "id" TEXT NOT NULL,
  "mlOrderId" TEXT NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "dateCreated" TIMESTAMP(3) NOT NULL,
  "dateClosed" TIMESTAMP(3),
  "currencyId" TEXT NOT NULL DEFAULT 'BRL',
  "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "marketplaceFeeTotal" DECIMAL(12,2),
  "shippingId" TEXT,
  "shippingCost" DECIMAL(12,2),
  "buyerNickname" TEXT,
  "profit" DECIMAL(12,2),
  "marginPercent" DECIMAL(8,2),
  "profitabilityStatus" TEXT NOT NULL DEFAULT 'AWAITING_COST',
  "raw" JSONB NOT NULL,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MercadoLivreOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivreOrder_mlOrderId_key"
ON "MercadoLivreOrder"("mlOrderId");

CREATE INDEX "MercadoLivreOrder_sellerUserId_dateCreated_idx"
ON "MercadoLivreOrder"("sellerUserId", "dateCreated");

CREATE INDEX "MercadoLivreOrder_status_dateCreated_idx"
ON "MercadoLivreOrder"("status", "dateCreated");

CREATE INDEX "MercadoLivreOrder_profitabilityStatus_dateCreated_idx"
ON "MercadoLivreOrder"("profitabilityStatus", "dateCreated");

CREATE TABLE "MercadoLivreOrderItem" (
  "id" TEXT NOT NULL,
  "externalKey" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "mlItemId" TEXT NOT NULL,
  "variationId" TEXT,
  "title" TEXT NOT NULL,
  "sku" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "saleFee" DECIMAL(12,2),
  "listingTypeId" TEXT,
  "unitCost" DECIMAL(12,2),
  "profit" DECIMAL(12,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MercadoLivreOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivreOrderItem_externalKey_key"
ON "MercadoLivreOrderItem"("externalKey");

CREATE INDEX "MercadoLivreOrderItem_orderId_idx"
ON "MercadoLivreOrderItem"("orderId");

CREATE INDEX "MercadoLivreOrderItem_mlItemId_idx"
ON "MercadoLivreOrderItem"("mlItemId");

CREATE INDEX "MercadoLivreOrderItem_sku_idx"
ON "MercadoLivreOrderItem"("sku");

ALTER TABLE "MercadoLivreOrderItem"
ADD CONSTRAINT "MercadoLivreOrderItem_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "MercadoLivreOrder"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
