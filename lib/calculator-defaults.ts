/**
 * Calculadora "com o que você tem" (pedido do Bruno, 25/11/2026).
 *
 * O vendedor nem sempre sabe imposto, frete ou custo. Em vez de travar, o
 * cálculo segue com suposições VISÍVEIS: cada uma volta em `assumptions` e a
 * tela mostra o texto. Nenhuma suposição é salva como decisão verificada.
 */
import { analyzeProfitability, type ProfitabilityInput } from "@/lib/profitability";

/** Frete grátis obrigatório no Mercado Livre Brasil a partir deste preço. Abaixo, o comprador paga o envio. */
export const ML_FREE_SHIPPING_THRESHOLD = 79;

export type Assumption = {
  field: "taxPercent" | "shippingCost" | "supplierPrice";
  text: string;
  /** true quando o resultado pode mudar bastante ao confirmar o dado. */
  material: boolean;
};

export function fillMissingCosts(input: {
  price: number;
  shippingCost: number | null;
  taxPercent: number | null;
  workspaceTaxPercent: number | null;
  logisticType: string;
  freeShipping: boolean;
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
      taxPercent = 0;
      assumptions.push({
        field: "taxPercent",
        text: "Imposto não informado: calculado sem imposto. MEI costuma pagar um valor fixo por mês; no Simples, comércio começa em 4%.",
        material: true,
      });
    }
  }
  let shippingCost = input.shippingCost;
  let shippingPending = false;
  if (shippingCost == null) {
    const buyerPays =
      input.price < ML_FREE_SHIPPING_THRESHOLD &&
      input.logisticType !== "fulfillment" &&
      !input.freeShipping;
    shippingCost = 0;
    if (buyerPays)
      assumptions.push({
        field: "shippingCost",
        text: `Abaixo de R$ ${ML_FREE_SHIPPING_THRESHOLD} o frete é pago pelo comprador: nenhum frete descontado de você.`,
        material: false,
      });
    else {
      shippingPending = true;
      assumptions.push({
        field: "shippingCost",
        text: `Frete NÃO incluído. Com frete grátis (obrigatório a partir de R$ ${ML_FREE_SHIPPING_THRESHOLD}) você paga o envio: informe peso e medidas para cotar.`,
        material: true,
      });
    }
  }
  return { taxPercent, shippingCost, shippingPending, assumptions };
}

/**
 * Modo reverso: sem o custo do produto, quanto dá para pagar ao fornecedor
 * (por unidade, antes de desconto) para ainda ter a margem desejada.
 */
export function maxSupplierCost(
  input: Omit<ProfitabilityInput, "supplierPrice">,
): { forTargetMargin: number; breakEven: number } {
  const base = analyzeProfitability({ ...input, supplierPrice: 0 });
  const units = Math.max(1, input.kitQuantity);
  const discount = Math.max(0.05, 1 - (input.discountPercent ?? 0) / 100);
  const perUnit = (purchaseBudget: number) =>
    purchaseBudget > 0 ? Math.floor((purchaseBudget / units / discount) * 100) / 100 : 0;
  return {
    forTargetMargin: perUnit(base.profit - (input.salePrice * input.targetMarginPercent) / 100),
    breakEven: perUnit(base.profit),
  };
}
