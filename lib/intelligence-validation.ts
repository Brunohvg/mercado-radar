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
export const draftSchema = z
  .object({
    id: z.string().min(1).max(80).optional(),
    name: z.string().trim().min(2).max(120),
    kind: z.literal("RESEARCH"),
    payload: researchPayloadSchema,
  })
  .strict();
