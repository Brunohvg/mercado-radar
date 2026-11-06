export const DIMENSION_IDS = {
  height: "SELLER_PACKAGE_HEIGHT",
  width: "SELLER_PACKAGE_WIDTH",
  length: "SELLER_PACKAGE_LENGTH",
  weight: "SELLER_PACKAGE_WEIGHT",
} as const;

export function numberFromAttribute(
  attributes: Array<{
    id?: string;
    value_name?: string;
    value_struct?: { number?: number; unit?: string } | null;
    values?: Array<{
      name?: string;
      struct?: { number?: number; unit?: string } | null;
    }>;
  }> | undefined,
  id: string,
) {
  const attribute = attributes?.find(item => item.id === id);
  if (!attribute) return null;
  const struct = attribute.value_struct ??
    attribute.values?.find(value => value.struct?.number != null)?.struct;
  const rawText = attribute.value_name ??
    attribute.values?.find(value => value.name)?.name ?? "";
  const numerical = typeof struct?.number === "number"
    ? struct.number : Number(String(rawText).replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(numerical) || numerical <= 0) return null;
  const rawUnit = (struct?.unit || String(rawText).replace(/[\d.,\s]/g, "")).toLowerCase();
  const normalizedUnit = rawUnit.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const isWeight = id === DIMENSION_IDS.weight;
  let multiplier = 1;
  if (isWeight) {
    if (["kg", "quilo", "kilogram", "kilograms"].includes(normalizedUnit)) multiplier = 1000;
    else if (["g", "gr", "gram", "grams", "gramas", ""].includes(normalizedUnit)) multiplier = 1;
    else return null;
  } else {
    if (["mm", "milimetro", "milimetros"].includes(normalizedUnit)) multiplier = 0.1;
    else if (["m", "metro", "metros"].includes(normalizedUnit)) multiplier = 100;
    else if (["cm", "centimetro", "centimetros", ""].includes(normalizedUnit)) multiplier = 1;
    else return null;
  }
  const normalized = numerical * multiplier;
  if (normalized > (isWeight ? 100000 : 300) || normalized <= 0) return null;
  return normalized;
}

