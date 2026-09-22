ALTER TABLE "AppSettings"
RENAME COLUMN "bibeloDiscountPercent" TO "defaultDiscountPercent";

ALTER TABLE "AppSettings"
ALTER COLUMN "defaultDiscountPercent" SET DEFAULT 0;

ALTER TABLE "Product"
ALTER COLUMN "supplier" DROP NOT NULL;

ALTER TABLE "Product"
ALTER COLUMN "supplier" DROP DEFAULT;

ALTER TABLE "Product"
ALTER COLUMN "discountPercent" SET DEFAULT 0;
