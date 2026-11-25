// Publicidade x margem: compara o que cada anúncio patrocinado gasta com o
// lucro real que o produto deixa. Sem estimativa silenciosa: sem custo
// conhecido em boa parte das vendas, o veredito é "faltam custos".

export type AdsMarginVerdict =
  | "COME_LUCRO" // gasto maior que todo o lucro do produto no período
  | "VENDA_ADS_NO_PREJUIZO" // cada venda que vem do anúncio dá prejuízo; o orgânico paga
  | "SEM_VENDA" // gastou e não vendeu nada pelo anúncio
  | "PAGA" // o anúncio se paga e ainda sobra lucro
  | "PODE_INVESTIR" // ACOS bem abaixo do limite, com volume
  | "SEM_CUSTO"; // não dá para saber sem o custo do produto

export type AdsMarginInput = {
  cost: number;
  adsRevenue: number;
  adsUnits: number;
  /** Lucro antes da publicidade das vendas com custo conhecido. */
  profitBeforeAds: number | null;
  readyUnits: number;
  totalUnits: number;
  totalRevenue: number;
};

export type AdsMarginResult = {
  verdict: AdsMarginVerdict;
  label: string;
  tone: "risk" | "warn" | "good" | "muted";
  reason: string;
  acos: number | null;
  /** ACOS máximo antes de a venda pelo anúncio dar prejuízo (= margem antes dos anúncios). */
  breakEvenAcos: number | null;
  profitPerUnit: number | null;
  adsCostPerSale: number | null;
  profitAfterAds: number | null;
};

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const META: Record<AdsMarginVerdict, { label: string; tone: AdsMarginResult["tone"]; rank: number }> = {
  COME_LUCRO: { label: "Come todo o lucro", tone: "risk", rank: 0 },
  SEM_VENDA: { label: "Gasta sem vender", tone: "risk", rank: 1 },
  VENDA_ADS_NO_PREJUIZO: { label: "Venda do anúncio no prejuízo", tone: "warn", rank: 2 },
  SEM_CUSTO: { label: "Falta o custo", tone: "muted", rank: 3 },
  PAGA: { label: "Se paga", tone: "good", rank: 4 },
  PODE_INVESTIR: { label: "Dá para investir mais", tone: "good", rank: 5 },
};

export function evaluateAdsMargin(input: AdsMarginInput): AdsMarginResult {
  const cost = Math.max(0, input.cost);
  const adsRevenue = Math.max(0, input.adsRevenue);
  const adsUnits = Math.max(0, input.adsUnits);
  const acos = adsRevenue > 0 ? round((cost / adsRevenue) * 100, 1) : null;
  const adsCostPerSale = adsUnits > 0 ? round(cost / adsUnits) : null;
  const coverage = input.totalUnits > 0 ? input.readyUnits / input.totalUnits : 0;
  const known = input.profitBeforeAds != null && input.readyUnits > 0 && coverage >= 0.7;

  const profitPerUnit = known ? round(input.profitBeforeAds! / input.readyUnits) : null;
  const avgPrice = input.totalUnits > 0 ? input.totalRevenue / input.totalUnits : 0;
  const breakEvenAcos = profitPerUnit != null && avgPrice > 0 ? round(Math.max(0, (profitPerUnit / avgPrice) * 100), 1) : null;
  // Projeta o lucro de todas as vendas pela média das que têm custo, só quando a cobertura é alta.
  const profitAll = profitPerUnit != null ? profitPerUnit * input.totalUnits : null;
  const profitAfterAds = profitAll != null ? round(profitAll - cost) : null;

  const out = (verdict: AdsMarginVerdict, reason: string): AdsMarginResult => ({
    verdict,
    label: META[verdict].label,
    tone: META[verdict].tone,
    reason,
    acos,
    breakEvenAcos,
    profitPerUnit,
    adsCostPerSale,
    profitAfterAds,
  });

  if (cost > 0 && adsUnits === 0 && adsRevenue === 0)
    return out("SEM_VENDA", `Gastou ${brl(cost)} e nenhuma venda veio do anúncio. Pause ou revise.`);
  if (!known)
    return out("SEM_CUSTO", "Informe o custo do produto para saber se o anúncio cabe na margem.");
  if (profitAfterAds != null && profitAfterAds < 0)
    return out(
      "COME_LUCRO",
      profitAll! > 0
        ? `O produto lucrou ${brl(profitAll!)} e o anúncio gastou ${brl(cost)}. Você está pagando para vender.`
        : `O produto já não dava lucro antes do anúncio (${brl(profitAll!)}) e o anúncio gastou mais ${brl(cost)}. Revise o preço ou o custo antes de patrocinar.`,
    );
  if (acos != null && breakEvenAcos != null && acos > breakEvenAcos)
    return out(
      "VENDA_ADS_NO_PREJUIZO",
      `Cada venda pelo anúncio custa ${brl(adsCostPerSale ?? 0)} e deixa ${brl(profitPerUnit!)} de lucro. O ACOS de ${pct(acos)} passa do limite de ${pct(breakEvenAcos)}. As vendas orgânicas pagam a conta.`,
    );
  if (acos != null && breakEvenAcos != null && acos <= breakEvenAcos * 0.5 && adsUnits >= 5)
    return out(
      "PODE_INVESTIR",
      `ACOS de ${pct(acos)}, menos da metade do limite de ${pct(breakEvenAcos)}. Há espaço para aumentar o orçamento.`,
    );
  return out(
    "PAGA",
    acos != null && breakEvenAcos != null
      ? `ACOS de ${pct(acos)} dentro do limite de ${pct(breakEvenAcos)}. Sobra lucro depois do anúncio.`
      : "Sobra lucro depois do anúncio.",
  );
}

export function adsMarginRank(verdict: AdsMarginVerdict) {
  return META[verdict].rank;
}
