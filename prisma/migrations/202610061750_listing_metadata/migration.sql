ALTER TABLE "MercadoLivreProduct"
ADD COLUMN "catalogProductId" TEXT,
ADD COLUMN "userProductId" TEXT,
ADD COLUMN "listingCreatedAt" TIMESTAMP(3);

CREATE INDEX "MercadoLivreProduct_catalogProductId_idx"
ON "MercadoLivreProduct"("catalogProductId");

CREATE INDEX "MercadoLivreProduct_userProductId_idx"
ON "MercadoLivreProduct"("userProductId");
