CREATE TABLE "MercadoLivreNotification" (
  "id" TEXT NOT NULL,
  "externalId" TEXT,
  "topic" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "applicationId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "sentAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "processedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MercadoLivreNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivreNotification_externalId_key"
ON "MercadoLivreNotification"("externalId");

CREATE INDEX "MercadoLivreNotification_topic_createdAt_idx"
ON "MercadoLivreNotification"("topic", "createdAt");

CREATE INDEX "MercadoLivreNotification_userId_createdAt_idx"
ON "MercadoLivreNotification"("userId", "createdAt");

CREATE INDEX "MercadoLivreNotification_status_createdAt_idx"
ON "MercadoLivreNotification"("status", "createdAt");
