import { z } from "zod";
export const itemIdSchema = z.string().regex(/^MLB\d{6,20}$/);
export const matchLevelSchema = z.enum([
  "SAME",
  "EQUIVALENT",
  "SIMILAR",
  "UNCERTAIN",
]);
export const researchPayloadSchema = z
  .object({
    query: z.string().trim().min(2).max(240),
    categoryId: z
      .string()
      .regex(/^MLB\d+$/)
      .or(z.literal("")),
    referenceId: itemIdSchema.nullable(),
    selectedIds: z.array(itemIdSchema).max(4),
    overrides: z
      .array(z.object({ id: itemIdSchema, level: matchLevelSchema }))
      .max(200),
  })
  .strict();
const amount = z.number().min(0).max(10000000).nullable();
const percent = z.number().min(0).max(50).nullable();
export const packageSchema = z
  .object({
    weightGrams: z.number().int().min(1).max(100000),
    heightCm: z.number().min(1).max(300),
    widthCm: z.number().min(1).max(300),
    lengthCm: z.number().min(1).max(300),
  })
  .strict();
export const kitQuoteSchema = z
  .object({
    quantity: z.number().int().min(1).max(10000),
    salePrice: z.number().positive().max(10000000),
    categoryId: z.string().regex(/^MLB\d+$/),
    listingType: z.enum(["CLASSIC", "PREMIUM"]),
    logisticType: z.enum(["drop_off", "self_service", "fulfillment"]),
    freeShipping: z.boolean(),
    shippingPackage: packageSchema.nullable(),
  })
  .strict();
export const kitScenarioSchema = z
  .object({
    productName: z.string().trim().min(2).max(160),
    brand: z.string().trim().max(160).nullable(),
    model: z.string().trim().max(160).nullable(),
    referenceId: itemIdSchema.nullable(),
    categoryId: z
      .string()
      .regex(/^MLB\d+$/)
      .or(z.literal("")),
    unitCost: amount,
    variants: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
            label: z.string().trim().min(1).max(60),
            stock: z.number().int().min(0).max(1000000).nullable(),
            unitCost: amount,
          })
          .strict(),
      )
      .min(1)
      .max(8),
    sizes: z.array(z.number().int().min(1).max(10000)).min(1).max(8),
    packageCost: amount,
    operatingCost: amount,
    taxPercent: percent,
    commissionPercent: percent,
    fixedFee: amount,
    shippingCost: amount,
    targetMarginPercent: z.number().min(0).max(80),
    targetRoiPercent: z.number().min(0).max(500),
    listingType: z.enum(["CLASSIC", "PREMIUM"]),
    logisticType: z.enum(["drop_off", "self_service", "fulfillment"]),
    freeShipping: z.boolean(),
    pricePerUnit: z.number().positive().max(1000000).nullable(),
    salePrices: z
      .array(
        z
          .object({
            quantity: z.number().int().min(1).max(10000),
            price: z.number().positive().max(10000000),
          })
          .strict(),
      )
      .max(8),
    unitWeightGrams: z.number().positive().max(100000).nullable(),
    packageWeightGrams: z.number().min(0).max(100000).nullable(),
    dimensions: z
      .object({
        heightCm: z.number().min(1).max(300).nullable(),
        widthCm: z.number().min(1).max(300).nullable(),
        lengthCm: z.number().min(1).max(300).nullable(),
      })
      .strict()
      .nullable(),
    useApiQuotes: z.boolean(),
    reviewedOffers: z
      .array(
        z
          .object({
            kitId: z.string().min(1).max(500),
            itemIds: z.array(itemIdSchema).max(20),
          })
          .strict(),
      )
      .max(128),
  })
  .strict()
  .refine(
    (s) =>
      new Set(s.variants.map((v) => v.id)).size === s.variants.length &&
      new Set(s.variants.map((v) => v.label.toLowerCase())).size ===
        s.variants.length,
    { message: "Variações precisam de identificadores e nomes únicos." },
  )
  .refine(
    (s) =>
      new Set(s.sizes).size === s.sizes.length &&
      new Set(s.salePrices.map((p) => p.quantity)).size === s.salePrices.length,
    { message: "Não repita o tamanho do kit ou o preço da mesma quantidade." },
  );
export const kitPayloadSchema = z
  .object({
    scenario: kitScenarioSchema,
    selectedKitId: z.string().max(500).nullable(),
  })
  .strict();
const draftBase = {
  id: z.string().min(1).max(80).optional(),
  name: z.string().trim().min(2).max(120),
};
export const draftSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...draftBase,
      kind: z.literal("RESEARCH"),
      payload: researchPayloadSchema,
    })
    .strict(),
  z
    .object({ ...draftBase, kind: z.literal("KIT"), payload: kitPayloadSchema })
    .strict(),
]);
