-- Existing watches were API-backed. Public page readings must not imply exact sales.
ALTER TABLE "RadarWatchItem" ADD COLUMN "trackingMode" TEXT NOT NULL DEFAULT 'API',
 ADD COLUMN "soldIsLowerBound" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "soldKnown" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "RadarWatchSnapshot" ADD COLUMN "trackingMode" TEXT NOT NULL DEFAULT 'API',
 ADD COLUMN "soldIsLowerBound" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "soldKnown" BOOLEAN NOT NULL DEFAULT true;
