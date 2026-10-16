import { z } from "zod";

export const referenceIdSchema = z
  .string()
  .trim()
  .regex(/^MLBU?\d{5,}$/i)
  .transform((id) => id.toUpperCase());
const mlUrl = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        /(^|\.)(mercadolivre\.com\.br|mercadolibre\.com|mlstatic\.com)$/i.test(
          url.hostname,
        )
      );
    })
    .nullable()
    .optional()
    .catch(null);

/** Untrusted, dated public facts read from the user's currently open page. */
export const observationSchema = z.object({
  id: referenceIdSchema,
  referenceKind: z.enum(["ITEM", "USER_PRODUCT", "CATALOG"]).optional(),
  title: z.string().trim().min(1).max(300),
  price: z.number().positive().max(10_000_000).nullable(),
  originalPrice: z.number().positive().max(10_000_000).nullable().optional(),
  soldLower: z.number().int().min(0).max(100_000_000).nullable().optional(),
  soldHasPlus: z.boolean().optional(),
  soldLabel: z.string().trim().max(60).nullable().optional(),
  reviews: z.number().int().min(0).max(10_000_000).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  freeShipping: z.boolean().optional(),
  fulfillment: z.boolean().optional(),
  bestSellerRank: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .nullable()
    .optional()
    .catch(null),
  bestSellerLabel: z.string().trim().max(120).nullable().optional(),
  catalogProductId: z
    .string()
    .trim()
    .regex(/^MLB\d{5,}$/i)
    .nullable()
    .optional(),
  sellerName: z.string().trim().max(120).nullable().optional(),
  condition: z.string().trim().max(30).nullable().optional(),
  thumbnail: mlUrl(500),
  permalink: mlUrl(800),
  position: z.number().int().min(1).max(500).nullable().optional(),
  categoryId: z
    .string()
    .regex(/^MLB\d+$/i)
    .nullable()
    .optional(),
});
