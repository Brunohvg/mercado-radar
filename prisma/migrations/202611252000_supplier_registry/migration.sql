-- Cadastro completo de fornecedor (aditivo).
ALTER TABLE "SourcingSupplier" ADD COLUMN "contactName" TEXT;
ALTER TABLE "SourcingSupplier" ADD COLUMN "address" TEXT;
ALTER TABLE "SourcingSupplier" ADD COLUMN "zipCode" TEXT;
ALTER TABLE "SourcingSupplier" ADD COLUMN "paymentTerms" TEXT;
