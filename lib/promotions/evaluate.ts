// Promoções do ML sem prejuízo: para cada convite, quanto sobra por venda no preço
// da campanha. Puro e testável. Sem custo ou sem tarifa conhecida, não há veredito.

import { ML_FREE_SHIPPING_THRESHOLD } from "@/lib/hunter/rank";

export type PromotionInvite = {
  promotionId: string;
  promotionType: string;
  promotionName: string | null;
  deadline: string | null;
  finishDate: string | null;
  mlItemId: string;
  title: string;
  status: string;
  currentPrice: number;
  /** Preço que o comprador paga na campanha. */
  dealPrice: number;
  sellerPercent: number | null;
  meliPercent: number | null;
  offerId: string | null;
};

export type PromotionContext = {
  cost: number | null;
  /** Tarifa do ML como fração do preço, dos seus pedidos. */
  feeRate: number | null;
  /** Frete médio por unidade que VOCÊ pagou (acima de R$ 79). */
  shippingPerUnit: number | null;
  taxPercent: number | null;
  operatingCost: number;
  targetMarginPercent: number;
};

/** Tipos em que o Radar sabe montar o aceite; os outros abrem no ML. */
export const JOINABLE_TYPES = new Set(["DEAL", "SELLER_CAMPAIGN", "MARKETPLACE_CAMPAIGN", "SMART", "PRICE_MATCHING", "PRICE_MATCHING_MELI_ALL", "UNHEALTHY_STOCK"]);

export const TYPE_LABEL: Record<string, string> = {
  DEAL: "Campanha tradicional",
  SELLER_CAMPAIGN: "Campanha do vendedor",
  MARKETPLACE_CAMPAIGN: "Campanha com o ML",
  SMART: "Desconto co-participado (ML paga parte)",
  PRICE_MATCHING: "Preço competitivo (ML paga parte)",
  PRICE_MATCHING_MELI_ALL: "Preço competitivo (ML paga tudo)",
  UNHEALTHY_STOCK: "Estoque parado no Full",
  LIGHTNING: "Oferta relâmpago",
  DOD: "Oferta do dia",
  VOLUME: "Desconto por quantidade",
  PRE_NEGOTIATED: "Desconto pré-acordado",
  PRICE_DISCOUNT: "Desconto individual",
};

const round2 = (v: number) => Math.round(v * 100) / 100;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function evaluateInvite(invite: PromotionInvite, ctx: PromotionContext) {
  const deal = invite.dealPrice;
  // Quando o ML banca parte do desconto, você recebe o preço cheio menos só a sua parte.
  const meliFunds = (invite.meliPercent ?? 0) > 0 && invite.sellerPercent != null;
  const received = meliFunds ? round2(invite.currentPrice * (1 - invite.sellerPercent! / 100)) : deal;
  const discountPercent = invite.currentPrice > 0 ? round2((1 - deal / invite.currentPrice) * 100) : null;

  const shipping = deal < ML_FREE_SHIPPING_THRESHOLD ? 0 : ctx.shippingPerUnit;
  const missing: string[] = [];
  if (ctx.cost == null) missing.push("custo do produto");
  if (ctx.feeRate == null) missing.push("tarifa (sem vendas recentes deste anúncio)");
  if (shipping == null) missing.push("frete acima de R$ 79");

  let profit: number | null = null;
  let marginPercent: number | null = null;
  let formula: string | null = null;
  if (!missing.length) {
    // Tarifa sobre o maior entre o que o comprador paga e o que você recebe: conta conservadora.
    const fee = round2(ctx.feeRate! * Math.max(deal, received));
    const tax = round2(((ctx.taxPercent ?? 0) / 100) * received);
    profit = round2(received - fee - tax - ctx.cost! - shipping! - ctx.operatingCost);
    marginPercent = received > 0 ? round2((profit / received) * 100) : null;
    formula =
      `${meliFunds ? `recebe ${brl(received)} (comprador paga ${brl(deal)}, ML cobre ${invite.meliPercent}%)` : `recebe ${brl(received)}`}` +
      ` − tarifa ${brl(fee)} − imposto ${brl(tax)} − custo ${brl(ctx.cost!)} − frete ${brl(shipping!)}${deal < ML_FREE_SHIPPING_THRESHOLD ? " (comprador paga)" : ""}` +
      ` − operação ${brl(ctx.operatingCost)} = ${brl(profit)}`;
  }

  const verdict: "ACEITAR" | "APERTADO" | "RECUSAR" | "SEM_DADOS" =
    profit == null ? "SEM_DADOS" : profit <= 0 ? "RECUSAR" : (marginPercent ?? 0) < ctx.targetMarginPercent ? "APERTADO" : "ACEITAR";

  return {
    ...invite,
    typeLabel: TYPE_LABEL[invite.promotionType] ?? invite.promotionType,
    joinable: JOINABLE_TYPES.has(invite.promotionType),
    discountPercent,
    received,
    profit,
    marginPercent,
    formula,
    missing,
    verdict,
  };
}

export type EvaluatedInvite = ReturnType<typeof evaluateInvite>;

/** Corpo do aceite no formato da central de promoções. */
export function joinBody(invite: Pick<PromotionInvite, "promotionId" | "promotionType" | "offerId" | "dealPrice">) {
  const base = { promotion_id: invite.promotionId, promotion_type: invite.promotionType };
  if (invite.offerId) return { ...base, offer_id: invite.offerId };
  if (invite.promotionType === "DEAL" || invite.promotionType === "SELLER_CAMPAIGN") return { ...base, deal_price: invite.dealPrice };
  return base;
}

const ORDER = { ACEITAR: 0, APERTADO: 1, SEM_DADOS: 2, RECUSAR: 3 } as const;
export function sortInvites(list: EvaluatedInvite[]) {
  return [...list].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || (b.profit ?? -1e9) - (a.profit ?? -1e9));
}
