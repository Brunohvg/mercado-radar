ALTER TABLE "RadarExtensionAccess"
ADD COLUMN "deviceId" TEXT;

UPDATE "RadarExtensionAccess"
SET "deviceId" = 'legacy-' || "id"
WHERE "deviceId" IS NULL;

ALTER TABLE "RadarExtensionAccess"
ALTER COLUMN "deviceId" SET NOT NULL;

CREATE UNIQUE INDEX "RadarExtensionAccess_mercadoLivreAccountId_deviceId_key"
ON "RadarExtensionAccess"("mercadoLivreAccountId", "deviceId");

CREATE TABLE "RadarExtensionAuthCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "mercadoLivreAccountId" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarExtensionAuthCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RadarExtensionAuthCode_codeHash_key"
ON "RadarExtensionAuthCode"("codeHash");

CREATE INDEX "RadarExtensionAuthCode_mercadoLivreAccountId_expiresAt_idx"
ON "RadarExtensionAuthCode"("mercadoLivreAccountId", "expiresAt");

CREATE INDEX "RadarExtensionAuthCode_expiresAt_consumedAt_idx"
ON "RadarExtensionAuthCode"("expiresAt", "consumedAt");

ALTER TABLE "RadarExtensionAuthCode"
ADD CONSTRAINT "RadarExtensionAuthCode_mercadoLivreAccountId_fkey"
FOREIGN KEY ("mercadoLivreAccountId")
REFERENCES "MercadoLivreAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
