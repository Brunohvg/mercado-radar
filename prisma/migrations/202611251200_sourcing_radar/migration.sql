-- Vidalys Radar 2.0: oportunidades, fornecedores e cotações. Somente aditivo.
CREATE TABLE "SourcingOpportunity" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "mlItemId" TEXT,
  "permalink" TEXT,
  "categoryId" TEXT,
  "brand" TEXT,
  "model" TEXT,
  "gtin" TEXT,
  "packQuantity" INTEGER,
  "referencePrice" DECIMAL(12,2),
  "referenceSource" TEXT,
  "referenceAt" TIMESTAMP(3),
  "listingType" TEXT NOT NULL DEFAULT 'CLASSIC',
  "commissionPercent" DECIMAL(5,2),
  "fixedFee" DECIMAL(10,2),
  "shippingCost" DECIMAL(10,2),
  "taxPercent" DECIMAL(5,2),
  "operatingCost" DECIMAL(10,2),
  "budget" DECIMAL(12,2),
  "monthlyDemand" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PESQUISANDO',
  "notes" TEXT,
  "identity" JSONB,
  "searchSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SourcingOpportunity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SourcingOpportunity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RadarWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SourcingOpportunity_workspaceId_updatedAt_idx" ON "SourcingOpportunity"("workspaceId", "updatedAt");
CREATE INDEX "SourcingOpportunity_workspaceId_mlItemId_idx" ON "SourcingOpportunity"("workspaceId", "mlItemId");

CREATE TABLE "SourcingSupplier" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'OUTRO',
  "cnpj" TEXT,
  "website" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "city" TEXT,
  "state" TEXT,
  "sellsToCpf" BOOLEAN,
  "requiresCnpj" BOOLEAN,
  "issuesInvoice" BOOLEAN,
  "servesSmall" BOOLEAN,
  "minOrderValue" DECIMAL(12,2),
  "minOrderUnits" INTEGER,
  "leadTimeDays" INTEGER,
  "reputationNote" TEXT,
  "origin" TEXT NOT NULL DEFAULT 'MANUAL',
  "originUrl" TEXT,
  "cnpjCheck" JSONB,
  "cnpjCheckedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SourcingSupplier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SourcingSupplier_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RadarWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SourcingSupplier_workspaceId_updatedAt_idx" ON "SourcingSupplier"("workspaceId", "updatedAt");
CREATE INDEX "SourcingSupplier_workspaceId_cnpj_idx" ON "SourcingSupplier"("workspaceId", "cnpj");

CREATE TABLE "SourcingQuote" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "unitPrice" DECIMAL(12,4) NOT NULL,
  "unitsPerPack" INTEGER NOT NULL DEFAULT 1,
  "minUnits" INTEGER,
  "freightCost" DECIMAL(10,2),
  "otherCosts" DECIMAL(10,2),
  "exactMatch" BOOLEAN,
  "source" TEXT NOT NULL,
  "evidenceUrl" TEXT,
  "quotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SourcingQuote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SourcingQuote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RadarWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SourcingQuote_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SourcingOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SourcingQuote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SourcingSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SourcingQuote_workspaceId_opportunityId_idx" ON "SourcingQuote"("workspaceId", "opportunityId");
CREATE INDEX "SourcingQuote_supplierId_idx" ON "SourcingQuote"("supplierId");
