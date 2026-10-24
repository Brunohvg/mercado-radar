import {
  analyzeProfitability,
  type ProfitabilityResult,
  type ListingType,
} from "@/lib/profitability";
import {
  classifyCompetitor,
  normalized,
  type Competitor,
} from "@/lib/competitor-analysis";
import { priceSample } from "@/lib/market-comparison";

export type KitVariant = {
  id: string;
  label: string;
  stock: number | null;
  unitCost: number | null;
};
export type KitScenario = {
  productName: string;
  brand: string | null;
  model: string | null;
  referenceId: string | null;
  categoryId: string;
  unitCost: number | null;
  variants: KitVariant[];
  sizes: number[];
  packageCost: number | null;
  operatingCost: number | null;
  taxPercent: number | null;
  commissionPercent: number | null;
  fixedFee: number | null;
  shippingCost: number | null;
  targetMarginPercent: number;
  targetRoiPercent: number;
  listingType: ListingType;
  logisticType: "drop_off" | "self_service" | "fulfillment";
  freeShipping: boolean;
  pricePerUnit: number | null;
  salePrices: Array<{ quantity: number; price: number }>;
  unitWeightGrams: number | null;
  packageWeightGrams: number | null;
  dimensions: {
    heightCm: number | null;
    widthCm: number | null;
    lengthCm: number | null;
  } | null;
  useApiQuotes: boolean;
  reviewedOffers: Array<{ kitId: string; itemIds: string[] }>;
};
export type KitComposition = {
  id: string;
  quantity: number;
  parts: Array<{ variantId: string; label: string; quantity: number }>;
  label: string;
  stockConfirmed: boolean;
  maxKits: number | null;
  purchaseCost: number | null;
};
export type KitQuoteRequest = {
  quantity: number;
  salePrice: number;
  categoryId: string;
  listingType: ListingType;
  logisticType: "drop_off" | "self_service" | "fulfillment";
  freeShipping: boolean;
  shippingPackage: {
    weightGrams: number;
    heightCm: number;
    widthCm: number;
    lengthCm: number;
  } | null;
};
export type KitQuote = {
  context: KitQuoteRequest;
  quotedAt: string;
  accountName: string;
  accountId: string;
  fee: {
    commissionPercent: number;
    fixedFee: number;
    saleFeeAmount: number;
  } | null;
  shipping: { shippingCost: number; discountRate: number } | null;
  notices: Array<{ code: string; message: string }>;
};
export type KitResult = KitComposition & {
  salePrice: number | null;
  priceSource: "MANUAL" | "MARKET_SAMPLE" | "COST_FLOOR" | null;
  financial: ProfitabilityResult | null;
  missing: string[];
  risks: string[];
  feeSource: "ML_API_ESTIMATE" | "USER_ESTIMATE" | null;
  shippingSource: "ML_API_ESTIMATE" | "USER_ESTIMATE" | null;
  market: ReturnType<typeof priceSample>;
  comparableIds: string[];
  candidateIds: string[];
  status: "INCOMPLETE" | "LOSS" | "BELOW_TARGET" | "VALIDATE" | "PILOT";
  reason: string;
};
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const known = (n: number | null | undefined): n is number =>
  n != null && Number.isFinite(n) && n >= 0;
export function defaultKitScenario(): KitScenario {
  return {
    productName: "",
    brand: null,
    model: null,
    referenceId: null,
    categoryId: "",
    unitCost: null,
    variants: [{ id: "base", label: "Única", stock: null, unitCost: null }],
    sizes: [2, 4, 6, 8],
    packageCost: null,
    operatingCost: null,
    taxPercent: null,
    commissionPercent: null,
    fixedFee: null,
    shippingCost: null,
    targetMarginPercent: 20,
    targetRoiPercent: 30,
    listingType: "CLASSIC",
    logisticType: "drop_off",
    freeShipping: true,
    pricePerUnit: null,
    salePrices: [],
    unitWeightGrams: null,
    packageWeightGrams: null,
    dimensions: null,
    useApiQuotes: true,
    reviewedOffers: [],
  };
}
/** Commercial sample, capped at 16 compositions per size and 128 overall. Not every permutation. */
export function generateKitCompositions(
  scenario: KitScenario,
): KitComposition[] {
  const variants = scenario.variants
    .filter(
      (v) => v.stock == null || (Number.isInteger(v.stock) && v.stock > 0),
    )
    .slice(0, 8);
  const sizes = [...new Set(scenario.sizes)]
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 10000)
    .slice(0, 8);
  const result = new Map<string, KitComposition>();
  for (const quantity of sizes) {
    const groups: KitVariant[][] = [...variants.map((v) => [v]), variants];
    for (let count = 2; count < variants.length; count++)
      for (let start = 0; start <= variants.length - count; start++)
        groups.push(variants.slice(start, start + count));
    let added = 0;
    for (const group of groups) {
      if (!group.length || group.length > quantity) continue;
      const amounts = group.map((v) =>
        Math.min(Math.floor(quantity / group.length), v.stock ?? quantity),
      );
      let remaining = quantity - amounts.reduce((s, n) => s + n, 0);
      while (remaining > 0) {
        let allocated = false;
        for (let i = 0; i < group.length && remaining > 0; i++)
          if (amounts[i] < (group[i].stock ?? quantity)) {
            amounts[i]++;
            remaining--;
            allocated = true;
          }
        if (!allocated) break;
      }
      if (remaining) continue;
      const parts = group
        .map((v, i) => ({
          variantId: v.id,
          label: v.label,
          quantity: amounts[i],
        }))
        .filter((p) => p.quantity > 0);
      const id =
        quantity +
        ":" +
        parts
          .map((p) => `${p.variantId}=${p.quantity}`)
          .sort()
          .join("|");
      if (result.has(id)) continue;
      const used = parts.map((p) => ({
        part: p,
        variant: variants.find((v) => v.id === p.variantId)!,
      }));
      const stockConfirmed = used.every((v) => v.variant.stock != null);
      const costs = used.map((v) => {
        const cost = v.variant.unitCost ?? scenario.unitCost;
        return known(cost) ? cost * v.part.quantity : null;
      });
      result.set(id, {
        id,
        quantity,
        parts,
        label: parts.map((p) => `${p.quantity} ${p.label}`).join(" + "),
        stockConfirmed,
        maxKits: stockConfirmed
          ? Math.min(
              ...used.map((v) =>
                Math.floor(v.variant.stock! / v.part.quantity),
              ),
            )
          : null,
        purchaseCost: costs.every(known)
          ? cents(costs.reduce((s, n) => s + n, 0))
          : null,
      });
      if (++added >= 16) break;
    }
  }
  return [...result.values()];
}
export function kitQuoteContext(
  scenario: KitScenario,
  quantity: number,
  salePrice: number,
): KitQuoteRequest {
  const weight =
    known(scenario.unitWeightGrams) && known(scenario.packageWeightGrams)
      ? scenario.unitWeightGrams * quantity + scenario.packageWeightGrams
      : null;
  return {
    quantity,
    salePrice,
    categoryId: scenario.categoryId,
    listingType: scenario.listingType,
    logisticType: scenario.logisticType,
    freeShipping: scenario.freeShipping,
    shippingPackage:
      weight != null &&
      weight > 0 &&
      weight <= 100000 &&
      scenario.dimensions &&
      Object.values(scenario.dimensions).every(
        (n) => n != null && n >= 1 && n <= 300,
      )
        ? {
            weightGrams: Math.ceil(weight),
            heightCm: scenario.dimensions.heightCm!,
            widthCm: scenario.dimensions.widthCm!,
            lengthCm: scenario.dimensions.lengthCm!,
          }
        : null,
  };
}
export const kitQuoteKey = (context: KitQuoteRequest) =>
  JSON.stringify(context);

export function evaluateKits(
  scenario: KitScenario,
  competitors: Competitor[] = [],
  quotes: KitQuote[] = [],
  now = Date.now(),
  accountId: string | null = null,
): KitResult[] {
  const compositions = generateKitCompositions(scenario);
  return compositions.map((kit) => {
    const risks: string[] = [],
      missing: string[] = [];
    const single = kit.parts.length === 1 ? kit.parts[0].label : null;
    const synthetic: Competitor = {
      id: "KIT_SCENARIO",
      title: scenario.productName,
      price: null,
      thumbnail: null,
      permalink: null,
      brand: scenario.brand,
      model: scenario.model,
      color: single,
      quantity: kit.quantity,
      quantitySource: null,
      unitPrice: null,
      categoryId: scenario.categoryId || null,
      catalogProductId: null,
      sellerId: null,
      sellerName: null,
      reputation: null,
      listingType: null,
      freeShipping: null,
      fulfillment: null,
      sold: null,
      soldIsLowerBound: false,
      isOwn: true,
      source: "RADAR_OBSERVATION",
      observedAt: new Date(now).toISOString(),
    };
    const reviewed = new Set(
      scenario.reviewedOffers.find((r) => r.kitId === kit.id)?.itemIds ?? [],
    );
    const candidates = competitors.filter(
      (i) =>
        !i.isOwn &&
        (!i.status || ["active", "unknown"].includes(i.status)) &&
        i.quantity === kit.quantity &&
        i.price != null &&
        i.price > 0,
    );
    const comparables = candidates.filter((i) => {
      const age = now - new Date(i.observedAt).getTime();
      if (!Number.isFinite(age) || age < 0 || age > 86400000) return false;
      const match = classifyCompetitor(synthetic, i);
      // A mixed kit needs an explicitly reviewed composition, not a generic 'sortido'.
      return (
        reviewed.has(i.id) ||
        Boolean(
          single &&
            normalized(single) !== "unica" &&
            i.quantitySource === "ATTRIBUTE" &&
            match.comparable,
        )
      );
    });
    const market = priceSample(comparables.map((i) => i.price!));
    const entered = scenario.salePrices.find(
      (p) => p.quantity === kit.quantity,
    )?.price;
    let salePrice =
      entered ??
      (scenario.pricePerUnit != null && scenario.pricePerUnit > 0
        ? cents(scenario.pricePerUnit * kit.quantity)
        : (market?.median ?? null));
    let priceSource: KitResult["priceSource"] =
      entered != null || scenario.pricePerUnit != null
        ? "MANUAL"
        : market
          ? "MARKET_SAMPLE"
          : null;
    // Establish a manual constant-rate floor first, so a matching API quote can
    // subsequently replace those rates at this exact trial price.
    if (
      salePrice == null &&
      [
        kit.purchaseCost,
        scenario.packageCost,
        scenario.operatingCost,
        scenario.taxPercent,
        scenario.commissionPercent,
        scenario.fixedFee,
        scenario.shippingCost,
      ].every(known)
    ) {
      try {
        const floor = analyzeProfitability({
          productName: scenario.productName,
          supplierPrice: kit.purchaseCost! / kit.quantity,
          discountPercent: 0,
          kitQuantity: kit.quantity,
          salePrice: 1,
          listingType: scenario.listingType,
          commissionPercent: scenario.commissionPercent!,
          fixedFee: scenario.fixedFee!,
          shippingCost: scenario.shippingCost!,
          operatingCost: cents(scenario.packageCost! + scenario.operatingCost!),
          taxPercent: scenario.taxPercent!,
          targetMarginPercent: scenario.targetMarginPercent,
          targetRoiPercent: scenario.targetRoiPercent,
        }).minimumSuggestedPrice;
        if (floor != null && floor > 0) {
          salePrice = floor;
          priceSource = "COST_FLOOR";
        }
      } catch {
        /* The missing/invalid state below explains the unresolved scenario. */
      }
    }
    const quote =
      salePrice != null && scenario.useApiQuotes
        ? quotes.find(
            (q) =>
              accountId != null &&
              q.accountId === accountId &&
              now - new Date(q.quotedAt).getTime() >= -60000 &&
              now - new Date(q.quotedAt).getTime() <= 300000 &&
              kitQuoteKey(q.context) ===
                kitQuoteKey(
                  kitQuoteContext(scenario, kit.quantity, salePrice!),
                ),
          )
        : null;
    const commission =
        quote?.fee?.commissionPercent ?? scenario.commissionPercent,
      fixed = quote?.fee?.fixedFee ?? scenario.fixedFee;
    const shipping = quote?.shipping?.shippingCost ?? scenario.shippingCost;
    const feeSource = quote?.fee
      ? "ML_API_ESTIMATE"
      : known(commission) && known(fixed)
        ? "USER_ESTIMATE"
        : null;
    const shippingSource = quote?.shipping
      ? "ML_API_ESTIMATE"
      : known(shipping)
        ? "USER_ESTIMATE"
        : null;
    for (const [label, value] of [
      ["Custo de compra", kit.purchaseCost],
      ["Embalagem", scenario.packageCost],
      ["Outras despesas", scenario.operatingCost],
      ["Imposto", scenario.taxPercent],
      ["Comissão", commission],
      ["Tarifa fixa", fixed],
      ["Frete do vendedor", shipping],
    ] as const)
      if (!known(value)) missing.push(label);
    if (!kit.stockConfirmed)
      risks.push(
        "Estoque ainda não confirmado para todas as variações deste kit.",
      );
    if (!market)
      risks.push(
        `${comparables.length} oferta(s) equivalente(s) recente(s). São necessárias três para uma referência automática de preço.`,
      );
    else if (market.count < 4)
      risks.push(
        "Amostra pequena: três ofertas equivalentes. Valide mais vendedores antes de comprar estoque.",
      );
    if (!single)
      risks.push(
        "Kit misto: confirme cores e quantidades de cada oferta antes de incluí-la na comparação.",
      );
    if (scenario.logisticType === "fulfillment")
      risks.push(
        "No Full, confirme também armazenagem e demais cobranças nas outras despesas.",
      );
    if (feeSource === "USER_ESTIMATE")
      risks.push(
        "Comissão e tarifa fixa são estimativas informadas, não uma cotação da API.",
      );
    if (shippingSource === "USER_ESTIMATE")
      risks.push(
        "Frete informado manualmente. Confirme o custo aplicável à sua conta.",
      );
    else if (shippingSource)
      risks.push(
        "Frete cotado pela API é estimativa para o pacote informado, não cobrança final.",
      );
    let financial: ProfitabilityResult | null = null;
    if (!missing.length) {
      try {
        const base = {
          productName: scenario.productName,
          supplierPrice: kit.purchaseCost! / kit.quantity,
          discountPercent: 0,
          kitQuantity: kit.quantity,
          salePrice: salePrice ?? 1,
          listingType: scenario.listingType,
          commissionPercent: commission!,
          fixedFee: fixed!,
          shippingCost: shipping!,
          operatingCost: cents(scenario.packageCost! + scenario.operatingCost!),
          taxPercent: scenario.taxPercent!,
          targetMarginPercent: scenario.targetMarginPercent,
          targetRoiPercent: scenario.targetRoiPercent,
        };
        if (salePrice == null) {
          const floor = analyzeProfitability(base).minimumSuggestedPrice;
          salePrice = floor != null && floor > 0 ? floor : null;
          priceSource = salePrice != null ? "COST_FLOOR" : null;
        }
        if (salePrice != null)
          financial = analyzeProfitability({ ...base, salePrice });
        else missing.push("Preço de venda ou metas viáveis");
      } catch {
        missing.push("Revisar taxas e valores financeiros");
      }
    }
    if (
      salePrice == null &&
      !missing.includes("Preço de venda ou metas viáveis")
    )
      missing.push("Preço de venda");
    let status: KitResult["status"] = "INCOMPLETE",
      reason = "Complete: " + missing.join(", ") + ".";
    if (financial) {
      if (financial.profit <= 0) {
        status = "LOSS";
        reason = "Não compensa neste preço: os custos consomem a venda.";
      } else if (financial.minimumSuggestedPrice == null) {
        status = "BELOW_TARGET";
        reason = "Meta inviável com estas taxas e custos. Revise suas metas.";
      } else if (
        financial.marginPercent + 0.005 < scenario.targetMarginPercent ||
        financial.roiPercent + 0.005 < scenario.targetRoiPercent
      ) {
        status = "BELOW_TARGET";
        reason = "O preço simulado não atinge suas metas de margem e ROI.";
      } else if (market && financial.minimumSuggestedPrice > market.median) {
        status = "BELOW_TARGET";
        reason =
          "Seu custo limita a margem: o piso estimado está acima da mediana das ofertas equivalentes.";
      } else if (!kit.stockConfirmed || !market) {
        status = "VALIDATE";
        reason = !kit.stockConfirmed
          ? "Margem simulada atende à meta; confirme o estoque antes de montar o kit."
          : "Margem simulada atende à meta; valide o preço com ofertas do mesmo produto e composição.";
      } else {
        status = "PILOT";
        reason =
          "Atende às metas neste cenário e cabe na referência observada. Faça um teste pequeno antes de ampliar.";
      }
      risks.push(
        "Preço mínimo e equilíbrio supõem taxas constantes. Recote ao mudar preço, pacote ou modalidade.",
      );
    }
    return {
      ...kit,
      salePrice,
      priceSource,
      financial,
      missing,
      risks,
      feeSource,
      shippingSource,
      market,
      comparableIds: comparables.map((i) => i.id),
      candidateIds: candidates.map((i) => i.id),
      status,
      reason,
    };
  });
}
export function rankKitResults(results: KitResult[]) {
  const rank = {
    PILOT: 4,
    VALIDATE: 3,
    BELOW_TARGET: 2,
    LOSS: 1,
    INCOMPLETE: 0,
  };
  return [...results].sort(
    (a, b) =>
      rank[b.status] - rank[a.status] ||
      Number(b.stockConfirmed) - Number(a.stockConfirmed) ||
      (b.financial?.roiPercent ?? -Infinity) -
        (a.financial?.roiPercent ?? -Infinity) ||
      (b.financial?.profit ?? -Infinity) - (a.financial?.profit ?? -Infinity) ||
      b.parts.length - a.parts.length ||
      a.quantity - b.quantity ||
      a.id.localeCompare(b.id),
  );
}
