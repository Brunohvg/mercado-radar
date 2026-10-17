export const ECONOMICS_VERSION = 1;
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);

export function hasRefund(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const data = raw as {
    payments?: Array<{
      status?: string;
      transaction_amount_refunded?: number;
      amount_refunded?: number;
    }>;
  };
  return (data.payments ?? []).some(
    (p) =>
      ["refunded", "charged_back", "in_mediation"].includes(p.status ?? "") ||
      Number(p.transaction_amount_refunded ?? p.amount_refunded ?? 0) > 0,
  );
}

export function allocateCents(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => (total * weight) / sum);
  const allocated = exact.map(Math.floor);
  const remaining = total - allocated.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - allocated[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < remaining; i++)
    allocated[order[i % order.length].index]++;
  return allocated;
}

export function calculateOrderEconomics(input: {
  status: string;
  refunded: boolean;
  totalAmount: number;
  fee: number | null;
  shipping: number | null;
  taxPercent: number | null;
  operatingCost: number | null;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: number;
    unitCost: number | null;
  }>;
}) {
  let status = "REALIZED";
  if (input.status !== "paid") status = "NOT_SETTLED";
  else if (input.refunded) status = "REFUND_REVIEW";
  else if (input.taxPercent == null || input.operatingCost == null)
    status = "AWAITING_SETTINGS";
  else if (
    !input.items.length ||
    input.items.some((item) => item.unitCost == null)
  )
    status = "AWAITING_PRODUCT_COST";
  else if (input.shipping == null) status = "AWAITING_SHIPPING_COST";
  else if (input.fee == null) status = "AWAITING_FEE";

  const numbers = [
    input.totalAmount,
    input.fee,
    input.shipping,
    input.taxPercent,
    input.operatingCost,
    ...input.items.flatMap((i) => [i.unitPrice, i.unitCost, i.quantity]),
  ].filter((v): v is number => v != null);
  if (
    numbers.some((n) => !Number.isFinite(n) || n < 0) ||
    input.items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1) ||
    (input.taxPercent != null && input.taxPercent > 100) ||
    input.totalAmount <= 0
  )
    status = "INVALID_DATA";

  if (status !== "REALIZED")
    return {
      status,
      profit: null,
      marginPercent: null,
      taxAmount: null,
      itemProfits: input.items.map((i) => ({ id: i.id, profit: null })),
    };

  const revenue = cents(input.totalAmount);
  const tax = cents((input.totalAmount * input.taxPercent!) / 100);
  const sharedCosts =
    cents(input.fee!) +
    cents(input.shipping!) +
    cents(input.operatingCost!) +
    tax;
  const costs = input.items.map((i) => cents(i.unitCost! * i.quantity));
  const weights = input.items.map((i) => i.quantity * i.unitPrice);
  if (weights.every((weight) => weight === 0))
    return {
      status: "INVALID_DATA",
      profit: null,
      marginPercent: null,
      taxAmount: null,
      itemProfits: input.items.map((i) => ({ id: i.id, profit: null })),
    };
  const allocatedRevenue = allocateCents(revenue, weights);
  const allocatedCosts = allocateCents(sharedCosts, weights);
  const profit = revenue - sharedCosts - costs.reduce((a, b) => a + b, 0);
  return {
    status,
    profit: profit / 100,
    marginPercent: (profit / revenue) * 100,
    taxAmount: tax / 100,
    itemProfits: input.items.map((item, i) => ({
      id: item.id,
      profit: (allocatedRevenue[i] - allocatedCosts[i] - costs[i]) / 100,
    })),
  };
}
