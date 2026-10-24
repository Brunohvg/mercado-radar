/** Public facts only. Title heuristics remain reviewable and never prove identity. */
import { comparisonTokens } from "@/lib/market-comparison";

export const MATCH_LABELS = {
  SAME: "Mesmo produto",
  EQUIVALENT: "Produto equivalente",
  SIMILAR: "Produto similar",
  UNCERTAIN: "Correspondência incerta",
} as const;
export type MatchLevel = keyof typeof MATCH_LABELS;
export type Competitor = {
  id: string;
  title: string;
  price: number | null;
  thumbnail: string | null;
  permalink: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  material?: string | null;
  status?: string | null;
  quantity: number | null;
  quantitySource: "ATTRIBUTE" | "TITLE" | null;
  unitPrice: number | null;
  categoryId: string | null;
  catalogProductId: string | null;
  sellerId: string | null;
  sellerName: string | null;
  reputation: string | null;
  listingType: string | null;
  freeShipping: boolean | null;
  fulfillment: boolean | null;
  sold: number | null;
  soldIsLowerBound: boolean;
  isOwn: boolean;
  source: "ML_API" | "RADAR_OBSERVATION";
  observedAt: string;
};
export type Correspondence = {
  level: MatchLevel;
  reasons: string[];
  sameQuantity: boolean;
  comparable: boolean;
};
export function normalized(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export function safeMlLink(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (u.hostname === "mercadolivre.com.br" ||
        u.hostname.endsWith(".mercadolivre.com.br")) &&
      !u.port
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function safeMlImage(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.port ||
      !(u.hostname === "mlstatic.com" || u.hostname.endsWith(".mlstatic.com"))
    )
      return null;
    u.protocol = "https:";
    return u.href;
  } catch {
    return null;
  }
}
/** Never fetch the supplied URL. Extract a supported ID from a known host only. */
export function parseCompetitorQuery(value: string) {
  const text = value.trim();
  if (text.length < 2 || text.length > 240)
    throw new Error(
      "Informe um nome, código MLB ou link completo do Mercado Livre (até 240 caracteres).",
    );
  let candidate = text;
  if (/^https?:|^www\./i.test(text)) {
    const safe = safeMlLink(text.startsWith("www.") ? "https://" + text : text);
    if (!safe)
      throw new Error("Use um link HTTPS completo de mercadolivre.com.br.");
    const u = new URL(safe);
    candidate = u.searchParams.get("wid") ?? u.pathname;
    const id = candidate.match(/\b(MLB)-?(\d{6,20})\b/i);
    if (!id)
      throw new Error(
        "Este link não contém um código de anúncio ou catálogo. Copie o link completo do produto.",
      );
    const itemId = id[1].toUpperCase() + id[2];
    return {
      query: itemId,
      id: itemId,
      catalog: /\/p\/MLB\d+/i.test(u.pathname) && !u.searchParams.has("wid"),
    };
  }
  const id = candidate.match(/^MLB-?(\d{6,20})$/i);
  return {
    query: id ? "MLB" + id[1] : text,
    id: id ? "MLB" + id[1] : null,
    catalog: false,
  };
}
function packNumber(value: string) {
  const n = Number(value.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : null;
}
/** No implicit quantity=1: model nº54, length and weight are not unit counts. */
export function kitQuantity(
  title: string,
  attributes: Array<{
    id?: string;
    value_name?: string;
    value_struct?: { number?: number; unit?: string } | null;
  }> = [],
) {
  const values = new Set<number>();
  for (const a of attributes) {
    if (
      ![
        "UNITS_PER_PACK",
        "NUMBER_OF_UNITS",
        "UNITS_PER_PACKAGE",
        "ITEMS_PER_PACK",
      ].includes(a.id ?? "")
    )
      continue;
    const raw =
      a.value_struct?.number != null
        ? String(a.value_struct.number)
        : (a.value_name ?? "");
    const matched = raw
      .trim()
      .match(/^([\d.,]+)(?:\s*(?:unidades?|un|pecas?|peças?))?$/i);
    const n = matched ? packNumber(matched[1]) : null;
    if (n != null) values.add(n);
  }
  if (values.size === 1)
    return { quantity: [...values][0], source: "ATTRIBUTE" as const };
  if (values.size > 1) return { quantity: null, source: null };
  const t = normalized(title.replace(/(\d)\.(?=\d{3}(?:\D|$))/g, "$1"));
  const counts = new Set<number>();
  const patterns = [
    /(?:^|\b)(\d+)\s*(?:unidades?|unids?|unds?|un|pecas?|pcs|canetas?|refis|refil)\b/g,
    /\b(?:kit|pacote|caixa|pack|combo)\s*(?:com|c|de)?\s*(\d+)\b/g,
  ];
  for (const re of patterns)
    for (const match of t.matchAll(re)) {
      const n = packNumber(match[1]);
      if (n != null) counts.add(n);
    }
  return counts.size === 1
    ? { quantity: [...counts][0], source: "TITLE" as const }
    : { quantity: null, source: null };
}
export function unitPrice(price: number | null, quantity: number | null) {
  return price != null &&
    Number.isFinite(price) &&
    price > 0 &&
    quantity != null &&
    Number.isInteger(quantity) &&
    quantity > 0
    ? Math.round((price / quantity) * 10000) / 10000
    : null;
}
const IDENTITY_STOP = new Set(
  "kit pacote caixa pack combo unidades unidade un und pecas peca pcs caneta canetas cores sortidas sortido sortidos azul azuis preta preto pretas pretos vermelha vermelho vermelhas rosa rosas de com c".split(
    " ",
  ),
);
function identityTokens(row: Competitor) {
  return comparisonTokens(row.title).filter(
    (t) =>
      !IDENTITY_STOP.has(t) &&
      (Number(t) !== row.quantity || row.quantity == null),
  );
}
export function classifyCompetitor(
  reference: Competitor,
  candidate: Competitor,
): Correspondence {
  const sameQuantity =
    reference.quantity != null && reference.quantity === candidate.quantity;
  const reasons: string[] = [];
  const unavailable = Boolean(
    candidate.status && !["active", "unknown"].includes(candidate.status),
  );
  const conflict = ["brand", "model", "color", "material"] as const;
  for (const key of conflict)
    if (
      reference[key] &&
      candidate[key] &&
      normalized(reference[key]) !== normalized(candidate[key])
    )
      reasons.push(
        `${key === "brand" ? "Marca" : key === "model" ? "Modelo" : key === "material" ? "Material" : "Cor/variação"} diferente.`,
      );
  const refText = normalized(reference.title),
    candidateText = normalized(candidate.title);
  for (const group of [
    "aluminio ferro aco plastico latao",
    "matriz arruela arruelas correntinha correntinhas alicate refil refis",
  ]) {
    const terms = group.split(" ");
    const refSpecs = terms
      .filter((t) => new RegExp(`\\b${t}\\b`).test(refText))
      .sort();
    const candidateSpecs = terms
      .filter((t) => new RegExp(`\\b${t}\\b`).test(candidateText))
      .sort();
    if (JSON.stringify(refSpecs) !== JSON.stringify(candidateSpecs))
      reasons.push(
        "Material ou acessórios diferentes no título; confirme a composição.",
      );
  }
  if (
    reference.categoryId &&
    candidate.categoryId &&
    reference.categoryId !== candidate.categoryId
  )
    reasons.push("Categoria diferente.");
  if (!sameQuantity)
    reasons.push(
      reference.quantity == null || candidate.quantity == null
        ? "Quantidade ainda não confirmada."
        : `Quantidades diferentes: ${reference.quantity} e ${candidate.quantity}. Compare por unidade.`,
    );
  if (reference.id === candidate.id)
    return {
      level: "SAME",
      reasons: ["Mesmo identificador de anúncio."],
      sameQuantity,
      comparable: !unavailable,
    };
  if (unavailable)
    return {
      level: "UNCERTAIN",
      reasons: [
        "Anúncio não está ativo para venda. O preço não entra na referência do mercado.",
      ],
      sameQuantity,
      comparable: false,
    };
  const a = identityTokens(reference),
    b = new Set(identityTokens(candidate));
  const overlap = a.length
    ? a.filter((t) => b.has(t)).length / Math.max(a.length, b.size)
    : 0;
  const specificationsConflict = reasons.some(
    (r) => /diferente/.test(r) && !r.startsWith("Quantidades"),
  );
  if (specificationsConflict)
    return {
      level: overlap >= 0.35 ? "SIMILAR" : "UNCERTAIN",
      reasons,
      sameQuantity,
      comparable: false,
    };
  const catalogMatch =
    reference.catalogProductId &&
    reference.catalogProductId === candidate.catalogProductId;
  const brandMatch =
    reference.brand &&
    candidate.brand &&
    normalized(reference.brand) === normalized(candidate.brand);
  const modelMatch =
    reference.model &&
    candidate.model &&
    normalized(reference.model) === normalized(candidate.model);
  const variantKnown = reference.color && candidate.color;
  if (catalogMatch && sameQuantity)
    return {
      level: "SAME",
      reasons: ["Mesmo produto de catálogo e quantidade; confira a variação."],
      sameQuantity,
      comparable: Boolean(variantKnown),
    };
  if (brandMatch && modelMatch && sameQuantity && overlap >= 0.5)
    return {
      level: "EQUIVALENT",
      reasons: [
        "Marca, modelo e quantidade coincidem.",
        ...(variantKnown
          ? []
          : ["Confira a cor/variação antes de usar como referência de preço."]),
      ],
      sameQuantity,
      comparable: Boolean(variantKnown),
    };
  return {
    level: overlap >= 0.5 ? "SIMILAR" : "UNCERTAIN",
    reasons: [
      ...reasons,
      overlap >= 0.5
        ? "Título semelhante; identidade depende de revisão."
        : "Poucas características coincidem.",
      ...(!brandMatch || !modelMatch
        ? ["Marca ou modelo não confirmados."]
        : []),
    ],
    sameQuantity,
    comparable: false,
  };
}
