import { z } from "zod";

export const analysisSchema = z.object({
  productName: z.string().min(2).max(160),
  supplierPrice: z.coerce.number().positive(),
  discountPercent: z.coerce.number().min(0).max(95).default(35),
  kitQuantity: z.coerce.number().int().min(1).max(1000).default(1),
  salePrice: z.coerce.number().positive(),
  listingType: z.enum(["CLASSIC", "PREMIUM"]).default("CLASSIC"),
  commissionPercent: z.coerce.number().min(0).max(50),
  fixedFee: z.coerce.number().min(0).default(0),
  shippingCost: z.coerce.number().min(0).default(0),
  operatingCost: z.coerce.number().min(0).default(1),
  targetMarginPercent: z.coerce.number().min(0).max(80).default(20),
  targetRoiPercent: z.coerce.number().min(0).max(500).default(30),
});
