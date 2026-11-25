-- Sinais públicos do anúncio (preço por quantidade, vendedor, perguntas,
-- opiniões, ficha da categoria). Mudança aditiva: colunas opcionais.
ALTER TABLE "SourcingOpportunity" ADD COLUMN "marketInsights" JSONB;
ALTER TABLE "SourcingOpportunity" ADD COLUMN "marketInsightsAt" TIMESTAMP(3);
