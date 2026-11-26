CREATE TABLE "RadarExtensionAccess" (
    "id" TEXT NOT NULL,
    "mercadoLivreAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'PRO',
    "dailyRequestLimit" INTEGER NOT NULL DEFAULT 5000,
    "capabilities" JSONB,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarExtensionAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RadarExtensionUsage" (
    "id" TEXT NOT NULL,
    "accessId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarExtensionUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RadarExtensionAccess_tokenHash_key"
ON "RadarExtensionAccess"("tokenHash");

CREATE INDEX "RadarExtensionAccess_mercadoLivreAccountId_revokedAt_idx"
ON "RadarExtensionAccess"("mercadoLivreAccountId", "revokedAt");

CREATE INDEX "RadarExtensionAccess_plan_createdAt_idx"
ON "RadarExtensionAccess"("plan", "createdAt");

CREATE UNIQUE INDEX "RadarExtensionUsage_accessId_day_key"
ON "RadarExtensionUsage"("accessId", "day");

CREATE INDEX "RadarExtensionUsage_day_requests_idx"
ON "RadarExtensionUsage"("day", "requests");

ALTER TABLE "RadarExtensionAccess"
ADD CONSTRAINT "RadarExtensionAccess_mercadoLivreAccountId_fkey"
FOREIGN KEY ("mercadoLivreAccountId")
REFERENCES "MercadoLivreAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RadarExtensionUsage"
ADD CONSTRAINT "RadarExtensionUsage_accessId_fkey"
FOREIGN KEY ("accessId")
REFERENCES "RadarExtensionAccess"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
