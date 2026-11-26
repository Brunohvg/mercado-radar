ALTER TABLE "ListingDraft" ADD COLUMN "mlItemId" TEXT;
ALTER TABLE "ListingDraft" ADD COLUMN "validatedAt" TIMESTAMP(3);
ALTER TABLE "ListingDraft" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "ListingDraft" ADD COLUMN "validation" JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX "ListingDraft_mlItemId_key" ON "ListingDraft"("mlItemId");
