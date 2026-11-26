/** A catalog total and a winning offer are different references. In particular,
 * an explicit zero from the chosen item must not fall back to catalog sales.
 */
export function opportunitySalesEvidence(input: {
  itemSoldQuantity?: number | null;
  itemDateCreated?: string | null;
  chosenItemId: string;
  winnerItemId?: string | null;
  winnerSoldQuantity?: number | null;
  catalogSoldQuantity?: number | null;
}) {
  const valid = (v: unknown): v is number =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  if (valid(input.itemSoldQuantity))
    return {
      quantity: input.itemSoldQuantity,
      source: "ITEMS_BULK",
      dateCreated: input.itemDateCreated ?? null,
    };
  if (
    input.chosenItemId === input.winnerItemId &&
    valid(input.winnerSoldQuantity)
  )
    return {
      quantity: input.winnerSoldQuantity,
      source: "CATALOG_WINNER",
      dateCreated: input.itemDateCreated ?? null,
    };
  if (valid(input.catalogSoldQuantity))
    return {
      quantity: input.catalogSoldQuantity,
      source: "CATALOG_PRODUCT",
      dateCreated: null,
    };
  return { quantity: 0, source: "UNAVAILABLE", dateCreated: null };
}
