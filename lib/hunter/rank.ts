// Caçador do próximo produto: decide quais produtos de catálogo valem estudar
// para revender. Puro (sem rede) para ser testável. Nada é inventado: sem tarifa
// não há teto de compra, e a origem de cada número vai junto.

export const ML_FREE_SHIPPING_THRESHOLD = 79;

export type HunterOffer = { price: number; sellerId: string | null; logisticType: string | null };

export type HunterInput = {
  productId: string;
  name: string;
  picture: string | null;
  permalink: string | null;
  categoryId: string;
  categoryName: string | null;
  /** Posição no ranking de mais vendidos da categoria (1 = mais vendido), quando houver. */
  bestSellerPosition: number | null;
  /** Termo em alta que levou até o produto, quando veio das tendências. */
  trendKeyword: string | null;
  offers: HunterOffer[];
  offersTotal: number | null;
  /** Tarifa do ML (comissão + fixa) em R$ no preço mediano, da API de tarifas. */
  saleFee: number | null;
  alreadySelling: boolean;
};

export type HunterSettings = {
  taxPercent: number | null;
  operatingCost: number;
  targetMarginPercent: number;
  /** Frete médio por unidade nos SEUS pedidos acima de R$ 79 (proxy honesto, rotulado). */
  ownShippingPerUnit: number | null;
  testLotUnits: number;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

export function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const c = Math.floor(s.length / 2);
  return s.length % 2 ? s[c] : (s[c - 1] + s[c]) / 2;
}

export function evaluateProduct(input: HunterInput, settings: HunterSettings) {
  const prices = input.offers.map((o) => o.price).filter((p) => p > 0);
  const price = median(prices);
  const sellers = new Set(input.offers.map((o) => o.sellerId).filter(Boolean)).size;
  const full = input.offers.filter((o) => o.logisticType === "fulfillment").length;
  const fullShare = input.offers.length ? full / input.offers.length : null;
  const reasons: string[] = [];
  const warnings: string[] = [];

  let shipping: number | null = null;
  let shippingSource: "COMPRADOR_PAGA" | "SEUS_PEDIDOS" | null = null;
  if (price != null) {
    if (price < ML_FREE_SHIPPING_THRESHOLD) {
      shipping = 0;
      shippingSource = "COMPRADOR_PAGA";
    } else if (settings.ownShippingPerUnit != null) {
      shipping = settings.ownShippingPerUnit;
      shippingSource = "SEUS_PEDIDOS";
    }
  }

  const tax = (settings.taxPercent ?? 0) / 100;
  const margin = settings.targetMarginPercent / 100;
  const maxCost =
    price != null && input.saleFee != null && shipping != null
      ? round2(price * (1 - tax - margin) - input.saleFee - shipping - settings.operatingCost)
      : null;

  if (input.bestSellerPosition != null) reasons.push(`${input.bestSellerPosition}º mais vendido da categoria`);
  if (input.trendKeyword) reasons.push(`busca em alta: “${input.trendKeyword}”`);
  if (sellers > 0 && sellers <= 5) reasons.push(`só ${sellers} vendedor(es) no catálogo`);
  if (fullShare != null && fullShare >= 0.6) warnings.push("a maioria vende pelo Full (entrega mais rápida que a sua)");
  if (sellers >= 20) warnings.push(`${sellers}+ vendedores disputando`);
  if (input.alreadySelling) warnings.push("você já vende este produto");
  if (maxCost == null) warnings.push(input.saleFee == null ? "tarifa indisponível: sem teto de compra" : "frete acima de R$ 79 desconhecido");
  else if (maxCost <= 0) warnings.push("no preço do mercado não sobra margem");

  // Pontuação simples e explicável: demanda primeiro, concorrência depois.
  const demand = input.bestSellerPosition != null ? Math.max(0, 21 - input.bestSellerPosition) * 5 : input.trendKeyword ? 40 : 0;
  const competition = sellers ? Math.max(0, 30 - sellers) : 10;
  const fullPenalty = fullShare != null ? Math.round(fullShare * 20) : 0;
  const viable = maxCost != null && maxCost > 0;
  const score = Math.max(0, demand + competition - fullPenalty + (viable ? 20 : -50) - (input.alreadySelling ? 100 : 0));

  return {
    productId: input.productId,
    name: input.name,
    picture: input.picture,
    permalink: input.permalink,
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    price: price == null ? null : round2(price),
    priceRange: prices.length ? { min: round2(Math.min(...prices)), max: round2(Math.max(...prices)) } : null,
    sellers,
    offersObserved: input.offers.length,
    offersTotal: input.offersTotal,
    fullShare,
    saleFee: input.saleFee,
    shipping,
    shippingSource,
    maxCost,
    testLot:
      maxCost != null && maxCost > 0
        ? { units: settings.testLotUnits, capital: round2(maxCost * settings.testLotUnits) }
        : null,
    formula:
      maxCost != null && price != null
        ? `${fmt(price)} − tarifa ${fmt(input.saleFee!)} − frete ${fmt(shipping!)}${shippingSource === "COMPRADOR_PAGA" ? " (comprador paga)" : " (média dos seus pedidos)"} − imposto ${(tax * 100).toFixed(1)}% − operação ${fmt(settings.operatingCost)} − margem ${settings.targetMarginPercent}% = pode pagar até ${fmt(maxCost)}`
        : null,
    reasons,
    warnings,
    viable,
    score,
  };
}

export type HunterCandidate = ReturnType<typeof evaluateProduct>;

export function rankCandidates(list: HunterCandidate[]) {
  return [...list].sort((a, b) => Number(b.viable) - Number(a.viable) || b.score - a.score);
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
