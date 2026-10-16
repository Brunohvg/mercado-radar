export type ListingType = "CLASSIC" | "PREMIUM";
export type Verdict = "GOOD" | "TIGHT" | "BAD";

export type ProfitabilityInput = {
  productName: string;
  supplierPrice: number;
  discountPercent: number;
  kitQuantity: number;
  salePrice: number;
  listingType: ListingType;
  commissionPercent: number;
  fixedFee: number;
  shippingCost: number;
  operatingCost: number;
  taxPercent?: number;
  targetMarginPercent: number;
  targetRoiPercent: number;
};

export type ProfitabilityResult = ProfitabilityInput & {
  unitCost: number;
  purchaseCost: number;
  commissionAmount: number;
  taxAmount: number;
  amountReceived: number;
  profit: number;
  marginPercent: number;
  roiPercent: number;
  receivedPercent: number;
  breakEvenPrice: number;
  minimumSuggestedPrice: number | null;
  verdict: Verdict;
};

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

function priceForMargin(
  input: ProfitabilityInput,
  targetMarginPercent: number,
) {
  const rate = input.commissionPercent / 100;
  const taxRate = (input.taxPercent ?? 0) / 100;
  const targetMargin = targetMarginPercent / 100;
  const unitCost = input.supplierPrice * (1 - input.discountPercent / 100);
  const purchaseCost = unitCost * input.kitQuantity;
  const fixedCosts =
    purchaseCost + input.fixedFee + input.shippingCost + input.operatingCost;
  const denominator = 1 - rate - taxRate - targetMargin;
  if (denominator <= 0) return Number.POSITIVE_INFINITY;
  return fixedCosts / denominator;
}

function priceForRoi(input: ProfitabilityInput, targetRoiPercent: number) {
  const rate = input.commissionPercent / 100;
  const taxRate = (input.taxPercent ?? 0) / 100;
  const roi = targetRoiPercent / 100;
  const unitCost = input.supplierPrice * (1 - input.discountPercent / 100);
  const purchaseCost = unitCost * input.kitQuantity;
  const baseInvestment = purchaseCost + input.operatingCost;
  const requiredProfit = baseInvestment * roi;
  const numerator =
    purchaseCost +
    input.operatingCost +
    input.fixedFee +
    input.shippingCost +
    requiredProfit;
  const denominator = 1 - rate - taxRate;
  if (denominator <= 0) return Number.POSITIVE_INFINITY;
  return numerator / denominator;
}

export function analyzeProfitability(
  input: ProfitabilityInput,
): ProfitabilityResult {
  const numeric = [
    input.supplierPrice,
    input.discountPercent,
    input.kitQuantity,
    input.salePrice,
    input.commissionPercent,
    input.fixedFee,
    input.shippingCost,
    input.operatingCost,
    input.taxPercent ?? 0,
    input.targetMarginPercent,
    input.targetRoiPercent,
  ];
  if (
    numeric.some((n) => !Number.isFinite(n) || n < 0) ||
    input.salePrice <= 0 ||
    !Number.isInteger(input.kitQuantity) ||
    input.kitQuantity < 1 ||
    input.discountPercent > 100 ||
    input.commissionPercent + (input.taxPercent ?? 0) >= 100
  )
    throw new Error("Valores financeiros inválidos.");
  const unitCost = input.supplierPrice * (1 - input.discountPercent / 100);
  const purchaseCost = round2(unitCost * input.kitQuantity);
  const commissionAmount = round2(
    input.salePrice * (input.commissionPercent / 100),
  );
  const taxAmount = round2(input.salePrice * ((input.taxPercent ?? 0) / 100));
  const amountReceived =
    input.salePrice - commissionAmount - input.fixedFee - input.shippingCost;
  const profit = round2(
    amountReceived - purchaseCost - input.operatingCost - taxAmount,
  );
  const marginPercent =
    input.salePrice > 0 ? (profit / input.salePrice) * 100 : 0;
  const investment = purchaseCost + input.operatingCost;
  const roiPercent = investment > 0 ? (profit / investment) * 100 : 0;
  const receivedPercent =
    input.salePrice > 0 ? (amountReceived / input.salePrice) * 100 : 0;

  const breakEvenPrice = priceForMargin(input, 0);
  const marginPrice = priceForMargin(input, input.targetMarginPercent);
  const roiPrice = priceForRoi(input, input.targetRoiPercent);
  const theoreticalPrice = Math.max(marginPrice, roiPrice);
  let minimumSuggestedPrice =
    Number.isFinite(theoreticalPrice) &&
    (investment > 0 || input.targetRoiPercent === 0)
      ? Math.ceil((theoreticalPrice - 1e-9) * 100) / 100
      : null;
  if (minimumSuggestedPrice != null) {
    for (let i = 0; i < 20000; i++) {
      const floorProfit = round2(
        minimumSuggestedPrice -
          round2((minimumSuggestedPrice * input.commissionPercent) / 100) -
          round2((minimumSuggestedPrice * (input.taxPercent ?? 0)) / 100) -
          input.fixedFee -
          input.shippingCost -
          purchaseCost -
          input.operatingCost,
      );
      if (
        floorProfit + 1e-9 >=
          (minimumSuggestedPrice * input.targetMarginPercent) / 100 &&
        floorProfit + 1e-9 >= (investment * input.targetRoiPercent) / 100
      )
        break;
      minimumSuggestedPrice = round2(minimumSuggestedPrice + 0.01);
      if (i === 19999) {
        minimumSuggestedPrice = null;
        break;
      }
    }
  }

  let verdict: Verdict = "GOOD";
  if (profit <= 0 || marginPercent < 10) verdict = "BAD";
  else if (
    marginPercent < input.targetMarginPercent ||
    roiPercent < input.targetRoiPercent
  )
    verdict = "TIGHT";

  return {
    ...input,
    unitCost: round2(unitCost),
    purchaseCost: round2(purchaseCost),
    commissionAmount: round2(commissionAmount),
    taxAmount: round2(taxAmount),
    amountReceived: round2(amountReceived),
    profit: round2(profit),
    marginPercent: round2(marginPercent),
    roiPercent: round2(roiPercent),
    receivedPercent: round2(receivedPercent),
    breakEvenPrice: Math.ceil((breakEvenPrice - 1e-9) * 100) / 100,
    minimumSuggestedPrice,
    verdict,
  };
}

export function compareKits(
  base: Omit<ProfitabilityInput, "kitQuantity" | "salePrice">,
  prices: Record<number, number>,
) {
  return [1, 2, 3, 5, 10]
    .filter((quantity) => Number.isFinite(prices[quantity]))
    .map((quantity) =>
      analyzeProfitability({
        ...base,
        kitQuantity: quantity,
        salePrice: prices[quantity],
      }),
    );
}
