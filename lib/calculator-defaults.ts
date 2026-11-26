/**
 * Calculadora "com o que você tem" (pedido do Bruno, 25/11/2026).
 *
 * Custos sem fonte permanecem desconhecidos. Uma simulação incompleta não
 * recebe resultado final nem se transforma em custo zero.
 */
import { analyzeProfitability, type ProfitabilityInput } from "@/lib/profitability";

export type Assumption = {
  field: "taxPercent" | "shippingCost" | "supplierPrice";
  text: string;
  /** true quando o resultado pode mudar bastante ao confirmar o dado. */
  material: boolean;
};

export function fillMissingCosts(input: {
  shippingCost: number | null;
  taxPercent: number | null;
  workspaceTaxPercent: number | null;
}) {
  const assumptions: Assumption[] = [];
  let taxPercent = input.taxPercent;
  if (taxPercent == null) {
    if (input.workspaceTaxPercent != null) {
      taxPercent = input.workspaceTaxPercent;
      assumptions.push({
        field: "taxPercent",
        text: `Imposto padrão da sua conta: ${input.workspaceTaxPercent.toLocaleString("pt-BR")}%.`,
        material: false,
      });
    } else {
      taxPercent = null;
      assumptions.push({
        field: "taxPercent",
        text: "Imposto não informado. Confirme a alíquota para concluir a simulação; custo desconhecido não será tratado como zero.",
        material: true,
      });
    }
  }
  const shippingCost = input.shippingCost;
  const shippingPending = shippingCost == null;
  if (shippingCost == null) {
    assumptions.push({
      field: "shippingCost",
      text: "Custo de envio do vendedor não confirmado. Condições de frete do comprador não confirmam frete zero para o vendedor; informe o custo ou obtenha uma cotação.",
      material: true,
    });
  }
  return { taxPercent, shippingCost, shippingPending, assumptions };
}

/**
 * Modo reverso: sem o custo do produto, quanto dá para pagar ao fornecedor
 * (por unidade, antes de desconto) para ainda ter a margem desejada.
 */
export function maxSupplierCost(
  input: Omit<ProfitabilityInput, "supplierPrice">,
): {
  forTargetMargin: number;
  forTargetRoi: number;
  maximumSupplierCost: number;
  limitingTarget: "margin" | "ROI" | null;
  breakEven: number;
} {
  const base = analyzeProfitability({ ...input, supplierPrice: 0 });
  const units = Math.max(1, input.kitQuantity);
  const discount = Math.max(0.05, 1 - (input.discountPercent ?? 0) / 100);
  const perUnit = (purchaseBudget: number) =>
    purchaseBudget > 0 ? Math.floor((purchaseBudget / units / discount) * 100) / 100 : 0;
  const forTargetMargin = perUnit(
    base.profit - (input.salePrice * input.targetMarginPercent) / 100,
  );
  const roiRate = input.targetRoiPercent / 100;
  const forTargetRoi = perUnit(
    (base.profit - roiRate * input.operatingCost) / (1 + roiRate),
  );
  let maximumSupplierCost = Math.min(forTargetMargin, forTargetRoi);
  // Rounding by unit and kit can move a theoretical limit by one cent. Verify
  // the final cent with the canonical calculation and lower it until both
  // targets are satisfied.
  for (let attempt = 0; attempt < 100_000 && maximumSupplierCost > 0; attempt++) {
    const result = analyzeProfitability({
      ...input,
      supplierPrice: maximumSupplierCost,
    });
    if (
      result.marginPercent + 1e-9 >= input.targetMarginPercent &&
      result.roiPercent + 1e-9 >= input.targetRoiPercent
    ) break;
    maximumSupplierCost = Math.floor((maximumSupplierCost - 0.01 + 1e-9) * 100) / 100;
  }
  if (maximumSupplierCost <= 0) maximumSupplierCost = 0;
  const limitingTarget =
    forTargetMargin < forTargetRoi
      ? "margin"
      : forTargetRoi < forTargetMargin
        ? "ROI"
        : null;
  return {
    forTargetMargin,
    forTargetRoi,
    maximumSupplierCost,
    limitingTarget,
    breakEven: perUnit(base.profit),
  };
}
