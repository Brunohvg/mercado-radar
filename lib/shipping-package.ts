/** Mercado Envios shipping.dimensions: height x width x length in cm, weight in grams. */
export function parseShippingDimensions(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?),(\d+)$/i.exec(
    value.trim(),
  );
  if (!match) return null;
  const [heightCm, widthCm, lengthCm, weightGrams] = match.slice(1).map(Number);
  if (
    ![heightCm, widthCm, lengthCm].every(
      (n) => Number.isFinite(n) && n >= 1 && n <= 300,
    ) ||
    !Number.isInteger(weightGrams) ||
    weightGrams < 1 ||
    weightGrams > 100000
  )
    return null;
  return { heightCm, widthCm, lengthCm, weightGrams };
}
