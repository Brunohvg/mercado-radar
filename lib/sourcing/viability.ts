/**
 * Viabilidade de compra: custo entregue do fornecedor → motor de margem
 * existente → plano de compra. Valores desconhecidos não viram zero.
 */
import {
  analyzeProfitability,
  type ProfitabilityResult,
  type ListingType,
} from "@/lib/profitability";

export type QuoteSource =
  | "COTACAO_RECEBIDA"
  | "PRECO_PUBLICADO"
  | "ESTIMATIVA_USUARIO";

export const QUOTE_SOURCE_LABEL: Record<QuoteSource, string> = {
  COTACAO_RECEBIDA: "Cotação recebida",
  PRECO_PUBLICADO: "Preço publicado",
  ESTIMATIVA_USUARIO: "Estimativa sua",
};

export type SaleContext = {
  salePrice: number | null;
  saleUnits: number | null;
  listingType: ListingType;
  commissionPercent: number | null;
  fixedFee: number | null;
  shippingCost: number | null;
  taxPercent: number | null;
  operatingCost: number | null;
  targetMarginPercent: number;
  targetRoiPercent: number;
  budget: number | null;
  monthlyDemand: number | null;
};

export type QuoteInput = {
  id: string;
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  unitsPerPack: number;
  minUnits: number | null;
  freightCost: number | null;
  otherCosts: number | null;
  source: QuoteSource;
  exactMatch: boolean | null;
  expired?: boolean;
  supplierMinOrderUnits: number | null;
  supplierMinOrderValue: number | null;
};

export type Risk = { level: "ALTO" | "MEDIO"; text: string };

export type Viability = {
  quoteId: string;
  supplierName: string;
  source: QuoteSource;
  status: "CALCULADO" | "FALTAM_DADOS" | "CAPITAL_INSUFICIENTE";
  missing: string[];
  purchasePending: string[];
  freightPending: boolean;
  order: {
    minimumUnits: number;
    units: number;
    sellableListings: number;
    goodsCost: number;
    extraCosts: number;
    capital: number;
    limitedBy: "PEDIDO_MINIMO" | "ORCAMENTO" | "DEMANDA";
  };
  landedUnitCost: number;
  perSale: ProfitabilityResult | null;
  maxUnitCostForTarget: number | null;
  plan: {
    salesToRecoverCapital: number | null;
    profitIfAllSold: number | null;
    monthsOfStock: number | null;
  };
  risks: Risk[];
};

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const ceilTo = (value: number, step: number) =>
  Math.ceil(value / step) * step;
const floorTo = (value: number, step: number) =>
  Math.floor(value / step) * step;

export function missingSaleData(sale: SaleContext) {
  const missing: string[] = [];
  if (!sale.salePrice || sale.salePrice <= 0) missing.push("preço de venda");
  if (sale.saleUnits == null || sale.saleUnits < 1) missing.push("unidades por anúncio");
  if (sale.commissionPercent == null) missing.push("comissão do Mercado Livre");
  if (sale.fixedFee == null) missing.push("tarifa fixa");
  if (sale.shippingCost == null) missing.push("frete do vendedor");
  return missing;
}

/** Custo máximo por peça que ainda entrega a margem-alvo no preço de referência. */
export function maxUnitCostForMargin(sale: SaleContext, extraPerPiece = 0) {
  if (missingSaleData(sale).length) return null;
  const price = sale.salePrice!;
  const pieces = Math.max(1, sale.saleUnits ?? 1);
  const available =
    price *
      (1 -
        sale.commissionPercent! / 100 -
        (sale.taxPercent ?? 0) / 100 -
        sale.targetMarginPercent / 100) -
    sale.fixedFee! -
    sale.shippingCost! -
    (sale.operatingCost ?? 0);
  const value = available / pieces - extraPerPiece;
  // Peças baratas (ilhós, contas) precisam de 4 casas: R$ 0,0185 não é R$ 0,01.
  return value > 0 ? Math.floor(value * 10000) / 10000 : 0;
}

export function evaluateQuote(sale: SaleContext, quote: QuoteInput): Viability {
  const pack = Math.max(1, quote.unitsPerPack || 1);
  const saleUnits = Math.max(1, sale.saleUnits ?? 1);
  const extraCosts = round2((quote.freightCost ?? 0) + (quote.otherCosts ?? 0));

  const byValue =
    quote.supplierMinOrderValue && quote.unitPrice > 0
      ? Math.ceil(quote.supplierMinOrderValue / quote.unitPrice)
      : 0;
  const minimumUnits = ceilTo(
    Math.max(pack, quote.minUnits ?? 0, quote.supplierMinOrderUnits ?? 0, byValue, saleUnits),
    pack,
  );

  let units = minimumUnits;
  let limitedBy: Viability["order"]["limitedBy"] = "PEDIDO_MINIMO";
  let status: Viability["status"] = "CALCULADO";

  if (sale.budget != null && sale.budget > 0) {
    const affordable = floorTo(
      Math.max(0, (sale.budget - extraCosts) / quote.unitPrice),
      pack,
    );
    if (affordable < minimumUnits) {
      status = "CAPITAL_INSUFICIENTE";
    } else {
      units = affordable;
      limitedBy = "ORCAMENTO";
    }
  }

  if (status === "CALCULADO" && sale.monthlyDemand && sale.monthlyDemand > 0) {
    // Até ~2 meses de giro observado; acima disso o capital fica parado.
    const demandCap = ceilTo(sale.monthlyDemand * saleUnits * 2, pack);
    if (demandCap < units) {
      units = Math.max(minimumUnits, demandCap);
      limitedBy = units === minimumUnits ? "PEDIDO_MINIMO" : "DEMANDA";
    }
  }

  const goodsCost = round2(units * quote.unitPrice);
  const capital = round2(goodsCost + extraCosts);
  const landedUnitCost = quote.unitPrice + extraCosts / units;
  const sellableListings = Math.floor(units / saleUnits);

  const missing = missingSaleData(sale);
  const freightPending = quote.freightCost == null;
  const purchasePending: string[] = [];
  if (quote.expired) purchasePending.push("validade da cotação");
  if (quote.exactMatch !== true) purchasePending.push("correspondência do produto");
  if (freightPending) purchasePending.push("frete do fornecedor");
  if (quote.source !== "COTACAO_RECEBIDA") purchasePending.push("preço confirmado pelo fornecedor");
  const risks: Risk[] = [];
  if (quote.source === "ESTIMATIVA_USUARIO")
    risks.push({ level: "ALTO", text: "Preço é estimativa sua, não cotação do fornecedor." });
  if (quote.exactMatch !== true)
    risks.push({
      level: quote.exactMatch === false ? "ALTO" : "MEDIO",
      text:
        quote.exactMatch === false
          ? "Produto do fornecedor é equivalente, não idêntico ao anúncio."
          : "Correspondência exata do produto ainda não confirmada.",
    });
  if (quote.freightCost == null)
    risks.push({ level: "MEDIO", text: "Frete do fornecedor não informado; custo entregue pode subir." });
  if (sale.taxPercent == null)
    risks.push({ level: "MEDIO", text: "Imposto não informado; cálculo considera 0%." });

  let perSale: ProfitabilityResult | null = null;
  const maxUnit = maxUnitCostForMargin(sale, extraCosts / units);
  const plan: Viability["plan"] = {
    salesToRecoverCapital: null,
    profitIfAllSold: null,
    monthsOfStock: null,
  };

  if (!missing.length && !freightPending) {
    perSale = analyzeProfitability({
      productName: quote.supplierName,
      supplierPrice: landedUnitCost,
      discountPercent: 0,
      kitQuantity: saleUnits,
      salePrice: sale.salePrice!,
      listingType: sale.listingType,
      commissionPercent: sale.commissionPercent!,
      fixedFee: sale.fixedFee!,
      shippingCost: sale.shippingCost!,
      operatingCost: sale.operatingCost ?? 0,
      taxPercent: sale.taxPercent ?? 0,
      targetMarginPercent: sale.targetMarginPercent,
      targetRoiPercent: sale.targetRoiPercent,
    });
    const cashBack =
      perSale.amountReceived - perSale.operatingCost - perSale.taxAmount;
    plan.salesToRecoverCapital =
      cashBack > 0 ? Math.ceil(capital / cashBack) : null;
    plan.profitIfAllSold = round2(perSale.profit * sellableListings);
    if (perSale.profit <= 0)
      risks.unshift({ level: "ALTO", text: "Cada venda dá prejuízo no preço de referência." });
    else if (perSale.marginPercent < sale.targetMarginPercent)
      risks.push({ level: "MEDIO", text: `Margem abaixo da meta de ${sale.targetMarginPercent}%.` });
    if (plan.salesToRecoverCapital != null && plan.salesToRecoverCapital > sellableListings)
      risks.push({ level: "ALTO", text: "O lote não recupera o capital investido nem vendendo tudo." });
  }
  if (sale.monthlyDemand && sale.monthlyDemand > 0) {
    plan.monthsOfStock = round2(sellableListings / sale.monthlyDemand);
    if (plan.monthsOfStock > 3)
      risks.push({ level: "MEDIO", text: "Estoque para mais de 3 meses do giro observado." });
  }
  if (status === "CAPITAL_INSUFICIENTE")
    risks.unshift({ level: "ALTO", text: "Orçamento não cobre o pedido mínimo deste fornecedor." });

  return {
    quoteId: quote.id,
    supplierName: quote.supplierName,
    source: quote.source,
    status: (missing.length || freightPending) && status === "CALCULADO" ? "FALTAM_DADOS" : status,
    missing,
    purchasePending,
    freightPending,
    order: {
      minimumUnits,
      units,
      sellableListings,
      goodsCost,
      extraCosts,
      capital,
      limitedBy,
    },
    landedUnitCost,
    perSale,
    maxUnitCostForTarget: freightPending ? null : maxUnit,
    plan,
    risks,
  };
}

export function bestViability(results: Viability[]) {
  const sourceRank: Record<QuoteSource, number> = {
    COTACAO_RECEBIDA: 0,
    PRECO_PUBLICADO: 1,
    ESTIMATIVA_USUARIO: 2,
  };
  return (
    [...results].sort((a, b) => {
      const aOk = a.status === "CALCULADO" ? 0 : 1;
      const bOk = b.status === "CALCULADO" ? 0 : 1;
      return (
        Number(a.purchasePending.length > 0) - Number(b.purchasePending.length > 0) ||
        aOk - bOk ||
        a.purchasePending.length - b.purchasePending.length ||
        sourceRank[a.source] - sourceRank[b.source] ||
        (b.perSale?.marginPercent ?? -Infinity) - (a.perSale?.marginPercent ?? -Infinity) ||
        a.order.capital - b.order.capital
      );
    })[0] ?? null
  );
}

export type NextAction = { title: string; detail: string; tab: "mercado" | "fornecedores" | "margem" | "plano" };

const brl = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: Math.abs(value) < 1 ? 4 : 2,
  });

export function recommendNextAction(input: {
  sale: SaleContext;
  supplierCount: number;
  quoteCount: number;
  best: Viability | null;
}): NextAction {
  const { best } = input;
  if (!input.supplierCount)
    return { title: "Encontrar fornecedores", detail: "Busque fabricantes, distribuidores e atacadistas deste produto.", tab: "fornecedores" };
  if (!input.quoteCount || !best)
    return { title: "Solicitar cotação de atacado", detail: "Compare o custo entregue antes de decidir quanto investir.", tab: "fornecedores" };
  if (best.purchasePending.length)
    return { title: "Confirmar condições da compra", detail: `${best.supplierName}: ${best.purchasePending.join(", ")}.`, tab: "fornecedores" };
  if (best.missing.length)
    return { title: "Completar custos de venda", detail: `Falta: ${best.missing.join(", ")}.`, tab: "mercado" };
  if (best.status === "CAPITAL_INSUFICIENTE")
    return { title: "Buscar fornecedor com lote menor", detail: `O pedido mínimo custa ${brl(best.order.capital)}, acima do seu orçamento.`, tab: "plano" };
  if (best.perSale && best.perSale.verdict === "BAD")
    return {
      title: "Negociar ou descartar",
      detail:
        best.maxUnitCostForTarget && best.maxUnitCostForTarget > 0
          ? `Para a meta de margem, o custo precisa cair para ${brl(best.maxUnitCostForTarget)} por peça.`
          : "Mesmo com custo zero o preço atual não cobre tarifas e frete.",
      tab: "margem",
    };
  if (best.perSale && best.perSale.verdict === "TIGHT")
    return {
      title: "Negociar antes de comprar",
      detail: best.maxUnitCostForTarget
        ? `Margem apertada. O custo ideal é até ${brl(best.maxUnitCostForTarget)} por peça.`
        : "Margem apertada no preço de referência.",
      tab: "margem",
    };
  return {
    title: `Planejar compra de ${best.order.units.toLocaleString("pt-BR")} unidades`,
    detail: `Investimento de ${brl(best.order.capital)} com ${best.supplierName}.`,
    tab: "plano",
  };
}
