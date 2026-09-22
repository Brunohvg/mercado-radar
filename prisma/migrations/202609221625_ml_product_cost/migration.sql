ALTER TABLE "MercadoLivreProduct"
ADD COLUMN "supplier" TEXT,
ADD COLUMN "supplierPrice" DECIMAL(12,2),
ADD COLUMN "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
