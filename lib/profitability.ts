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
  targetMarginPercent: number;
  targetRoiPercent: number;
};

export type ProfitabilityResult = ProfitabilityInput & {
  unitCost: number;
  purchaseCost: number;
  commissionAmount: number;
  amountReceived: number;
  profit: number;
  marginPercent: number;
  roiPercent: number;
  receivedPercent: number;
  breakEvenPrice: number;
  minimumSuggestedPrice: number;
  verdict: Verdict;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function priceForMargin(input: ProfitabilityInput, targetMarginPercent: number) {
  const rate = input.commissionPercent / 100;
  const targetMargin = targetMarginPercent / 100;
  const unitCost = input.supplierPrice * (1 - input.discountPercent / 100);
  const purchaseCost = unitCost * input.kitQuantity;
  const fixedCosts = purchaseCost + input.fixedFee + input.shippingCost + input.operatingCost;
  const denominator = 1 - rate - targetMargin;
  if (denominator <= 0) return Number.POSITIVE_INFINITY;
  return fixedCosts / denominator;
}

function priceForRoi(input: ProfitabilityInput, targetRoiPercent: number) {
  const rate = input.commissionPercent / 100;
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
  const denominator = 1 - rate;
  if (denominator <= 0) return Number.POSITIVE_INFINITY;
  return numerator / denominator;
}

export function analyzeProfitability(input: ProfitabilityInput): ProfitabilityResult {
  const unitCost = input.supplierPrice * (1 - input.discountPercent / 100);
  const purchaseCost = unitCost * input.kitQuantity;
  const commissionAmount = input.salePrice * (input.commissionPercent / 100);
  const amountReceived =
    input.salePrice - commissionAmount - input.fixedFee - input.shippingCost;
  const profit = amountReceived - purchaseCost - input.operatingCost;
  const marginPercent = input.salePrice > 0 ? (profit / input.salePrice) * 100 : 0;
  const investment = purchaseCost + input.operatingCost;
  const roiPercent = investment > 0 ? (profit / investment) * 100 : 0;
  const receivedPercent = input.salePrice > 0 ? (amountReceived / input.salePrice) * 100 : 0;

  const breakEvenPrice = priceForMargin(input, 0);
  const marginPrice = priceForMargin(input, input.targetMarginPercent);
  const roiPrice = priceForRoi(input, input.targetRoiPercent);
  const minimumSuggestedPrice = Math.max(marginPrice, roiPrice);

  let verdict: Verdict = "GOOD";
  if (profit <= 0 || marginPercent < 15 || roiPercent < 20) verdict = "BAD";
  else if (
    marginPercent < input.targetMarginPercent ||
    roiPercent < input.targetRoiPercent
  ) verdict = "TIGHT";

  return {
    ...input,
    unitCost: round2(unitCost),
    purchaseCost: round2(purchaseCost),
    commissionAmount: round2(commissionAmount),
    amountReceived: round2(amountReceived),
    profit: round2(profit),
    marginPercent: round2(marginPercent),
    roiPercent: round2(roiPercent),
    receivedPercent: round2(receivedPercent),
    breakEvenPrice: round2(breakEvenPrice),
    minimumSuggestedPrice: round2(minimumSuggestedPrice),
    verdict,
  };
}

export function compareKits(base: Omit<ProfitabilityInput, "kitQuantity" | "salePrice">, prices: Record<number, number>) {
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
