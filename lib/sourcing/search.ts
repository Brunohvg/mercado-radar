/**
 * Descoberta de fornecedores. Busca genérica devolve varejo; aqui as consultas
 * partem da marca, o varejo conhecido é descartado e cada candidato recebe um
 * tipo provável com as razões. Candidato não é fornecedor confirmado.
 */
import { productCore, type ProductIdentity } from "@/lib/sourcing/identity";

export type SupplierKind =
  | "FABRICANTE"
  | "DISTRIBUIDOR"
  | "ATACADISTA"
  | "IMPORTADOR"
  | "LOJA_ML"
  | "OUTRO";

export const SUPPLIER_KIND_LABEL: Record<SupplierKind, string> = {
  FABRICANTE: "Fabricante",
  DISTRIBUIDOR: "Distribuidor",
  ATACADISTA: "Atacadista",
  IMPORTADOR: "Importador",
  LOJA_ML: "Loja no Mercado Livre",
  OUTRO: "Outro",
};

export type SearchQuery = { intent: string; query: string };

export type RawResult = { title: string; url: string; description?: string };

export type SupplierCandidate = {
  name: string;
  url: string;
  domain: string;
  kind: SupplierKind;
  reasons: string[];
  snippet: string | null;
  query: string;
  evidence?: "PRODUTO" | "MARCA" | "CANDIDATO";
};

export type SearchOutcome = {
  provider: "BRAVE" | "DESLIGADO" | "IA" | "BRAVE_IA";
  status: "OK" | "DESLIGADO" | "INDISPONIVEL";
  message: string | null;
  candidates: SupplierCandidate[];
  discarded: number;
  queries: SearchQuery[];
  manualLinks: Array<{ label: string; url: string }>;
  searchedAt: string;
  /** Pesquisa com IA (Gemini + Google Search), quando ligada. */
  ai?: import("@/lib/sourcing/ai-research").AiResearch | null;
};

/** Junta a busca web com a pesquisa da IA. A IA entra só com fonte verificada. */
export function withAiResearch(
  outcome: SearchOutcome,
  research: import("@/lib/sourcing/ai-research").AiResearch,
  aiCandidates: SupplierCandidate[],
): SearchOutcome {
  const merged = mergeCandidates([
    outcome.candidates,
    aiCandidates.map((candidate) => ({ ...candidate, evidence: "CANDIDATO" })),
  ]);
  const aiOk = research.status === "OK";
  const webOk = outcome.status === "OK";
  return {
    ...outcome,
    provider: outcome.provider === "BRAVE" ? "BRAVE_IA" : "IA",
    status: aiOk || webOk ? "OK" : outcome.status === "DESLIGADO" ? "INDISPONIVEL" : outcome.status,
    message: merged.length
      ? null
      : research.message ?? outcome.message,
    candidates: merged.slice(0, 20),
    ai: research,
  };
}

/** Varejo e marketplaces de consumidor final: não são fornecedores para revenda. */
export const RETAIL_DOMAINS = [
  "magazineluiza.com.br",
  "magalu.com.br",
  "americanas.com.br",
  "casasbahia.com.br",
  "pontofrio.com.br",
  "extra.com.br",
  "amazon.com.br",
  "amazon.com",
  "shopee.com.br",
  "aliexpress.com",
  "shein.com",
  "carrefour.com.br",
  "submarino.com.br",
  "kabum.com.br",
  "lojadomecanico.com.br",
  "leroymerlin.com.br",
  "kalunga.com.br",
  "temu.com",
  "youtube.com",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "pinterest.com",
  "reclameaqui.com.br",
  "wikipedia.org",
  "zoom.com.br",
  "buscape.com.br",
];

export function domainOf(url: string) {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed.hostname.replace(/^www\./, "").toLowerCase() : "";
  } catch {
    return "";
  }
}

export function isRetail(domain: string) {
  return RETAIL_DOMAINS.some(
    (retail) => domain === retail || domain.endsWith("." + retail),
  );
}

export function buildSupplierQueries(identity: ProductIdentity): SearchQuery[] {
  const queries: SearchQuery[] = [];
  const core = identity.searchTerms.at(-1) ?? identity.title;
  const maker = identity.manufacturer ?? identity.brand;
  if (maker) {
    queries.push({
      intent: "Programa de revenda do fabricante",
      query: `"${maker}" seja um revendedor OR distribuidores OR "onde comprar"`,
    });
    queries.push({
      intent: "Distribuidores da marca",
      query: `"${maker}" distribuidor atacado ${core}`,
    });
  }
  queries.push({
    intent: "Atacadistas nacionais",
    query: `${core} atacado distribuidora CNPJ`,
  });
  queries.push({
    intent: "Fabricantes nacionais",
    query: `${core} fabricante indústria brasileira`,
  });
  if (identity.gtin && identity.gtinValid)
    queries.push({ intent: "Código de barras", query: identity.gtin });
  return queries.length > 4 ? [...queries.slice(0, 3), queries[queries.length - 1]] : queries;
}

const RULES: Array<{ kind: SupplierKind; pattern: RegExp; reason: string }> = [
  { kind: "FABRICANTE", pattern: /\b(fabricante|fábrica|fabrica|indústria|industria|\.ind\.br)\b/i, reason: "Menciona fabricação" },
  { kind: "DISTRIBUIDOR", pattern: /\b(distribuidor|distribuidora|distribuição|representantes?)\b/i, reason: "Menciona distribuição" },
  { kind: "DISTRIBUIDOR", pattern: /seja (um )?revendedor|revenda autorizada|onde comprar/i, reason: "Tem programa de revenda" },
  { kind: "ATACADISTA", pattern: /\b(atacado|atacadista|atacarejo|caixa fechada|pedido mínimo|pedido minimo)\b/i, reason: "Menciona atacado" },
  { kind: "IMPORTADOR", pattern: /\b(importador|importadora|importação direta)\b/i, reason: "Menciona importação" },
];

export function classifyResult(
  result: RawResult,
  query: string,
  identity?: ProductIdentity,
): SupplierCandidate | null {
  const domain = domainOf(result.url);
  if (!domain || isRetail(domain)) return null;
  const text = `${result.title} ${result.description ?? ""} ${domain}`;
  const reasons: string[] = [];
  let kind: SupplierKind = "OUTRO";
  if (domain === "mercadolivre.com.br" || domain.endsWith(".mercadolivre.com.br")) {
    if (!/(atacado|distribuidora|distribuidor|insumos|\b\d{3,}\s*(un|unidades|peças))/i.test(text))
      return null;
    kind = "LOJA_ML";
    reasons.push("Loja no Mercado Livre com venda em volume");
  }
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      if (kind === "OUTRO") kind = rule.kind;
      reasons.push(rule.reason);
    }
  }
  if (domain.endsWith(".ind.br") && !reasons.includes("Menciona fabricação")) {
    reasons.push("Domínio de indústria (.ind.br)");
    if (kind === "OUTRO") kind = "FABRICANTE";
  }
  const evidence = identity ? productEvidence(identity, `${text} ${result.url}`, kind) : undefined;
  if (identity && !evidence) return null;
  if (!reasons.length && evidence !== "PRODUTO") return null;
  return {
    name: cleanName(result.title, domain),
    url: result.url,
    domain,
    kind,
    reasons: [...new Set(reasons)],
    snippet: result.description?.replace(/<[^>]+>/g, "").slice(0, 240) ?? null,
    query,
    evidence: evidence ?? undefined,
  };
}

function words(value: string): string[] {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function productEvidence(identity: ProductIdentity, text: string, kind: SupplierKind): SupplierCandidate["evidence"] | null {
  const resultWords = new Set(words(text));
  const brand = words(identity.brand ?? identity.manufacturer ?? "");
  const model = words(identity.model ?? identity.title.match(/(?:n[º°]|número)\s*(\d+)/i)?.[1] ?? "");
  const terms = words(productCore(identity.title, 8))
    .filter((term) => term.length >= 3 && /[a-z]/.test(term) && !brand.includes(term));
  const uniqueTerms = [...new Set(terms)];
  const brandMatches = brand.length > 0 && brand.every((word) => resultWords.has(word));
  const gtinMatches = identity.gtin && identity.gtinValid && resultWords.has(identity.gtin);
  const matchedTerms = uniqueTerms.filter((word) => resultWords.has(word)).length;
  const modelMatches = model.length === 0 || model.every((word) => resultWords.has(word));
  if (gtinMatches || (modelMatches && matchedTerms >= Math.min(2, uniqueTerms.length) && matchedTerms > 0 && (!brand.length || brandMatches)))
    return "PRODUTO";
  if (brandMatches && (kind === "FABRICANTE" || kind === "DISTRIBUIDOR")) return "MARCA";
  if (matchedTerms > 0 && (brandMatches || (!brand.length && matchedTerms >= 2))) return "CANDIDATO";
  return null;
}

function cleanName(title: string, domain: string) {
  const first = title.split(/\s[|\-–—]\s/)[0]?.trim();
  return (first && first.length <= 80 ? first : domain).replace(/<[^>]+>/g, "");
}

export function mergeCandidates(groups: SupplierCandidate[][]) {
  const rank = { PRODUTO: 0, MARCA: 1, CANDIDATO: 2 };
  const evidenceRank = (candidate: SupplierCandidate) => rank[candidate.evidence ?? "CANDIDATO"];
  const byDomain = new Map<string, SupplierCandidate>();
  for (const candidate of groups.flat()) {
    const key = candidate.kind === "LOJA_ML" ? candidate.url : candidate.domain;
    const current = byDomain.get(key);
    if (!current || evidenceRank(candidate) < evidenceRank(current)) byDomain.set(key, candidate);
  }
  const order: SupplierKind[] = [
    "FABRICANTE",
    "DISTRIBUIDOR",
    "IMPORTADOR",
    "ATACADISTA",
    "LOJA_ML",
    "OUTRO",
  ];
  return [...byDomain.values()]
    .sort(
      (a, b) =>
        evidenceRank(a) - evidenceRank(b) ||
        order.indexOf(a.kind) - order.indexOf(b.kind) ||
        b.reasons.length - a.reasons.length,
    )
    .slice(0, 20);
}

/** Links para o usuário pesquisar no próprio navegador. O servidor não abre esses sites. */
export function manualSearchLinks(identity: ProductIdentity) {
  const core = identity.searchTerms.at(-1) ?? identity.title;
  const maker = identity.manufacturer ?? identity.brand;
  const google = (q: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  const links = [
    { label: "Atacado e distribuidoras", url: google(`${core} atacado distribuidora -magalu -americanas -shopee`) },
    { label: "Fabricantes nacionais", url: google(`${core} fabricante`) },
    {
      label: "Lojas de atacado no Mercado Livre",
      url: `https://lista.mercadolivre.com.br/${encodeURIComponent(`${core} atacado`).replace(/%20/g, "-")}`,
    },
  ];
  if (maker)
    links.unshift({
      label: `Revenda ${maker}`,
      url: google(`"${maker}" seja um revendedor OR distribuidores`),
    });
  return links;
}

export type WebSearchProvider = (query: string) => Promise<RawResult[]>;

export function braveProvider(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): WebSearchProvider {
  return async (query) => {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("country", "BR");
    url.searchParams.set("search_lang", "pt-br");
    url.searchParams.set("count", "10");
    const response = await fetcher(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Busca web respondeu ${response.status}`);
    const body = (await response.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    return (body.web?.results ?? [])
      .filter((item) => item.url && item.title)
      .map((item) => ({
        title: item.title!,
        url: item.url!,
        description: item.description,
      }));
  };
}

export async function searchSuppliers(
  identity: ProductIdentity,
  provider: WebSearchProvider | null,
  now = new Date(),
): Promise<SearchOutcome> {
  const queries = buildSupplierQueries(identity);
  const base = {
    queries,
    manualLinks: manualSearchLinks(identity),
    searchedAt: now.toISOString(),
  };
  if (!provider)
    return {
      ...base,
      provider: "DESLIGADO",
      status: "DESLIGADO",
      message:
        "Busca automática desligada nesta instalação. Use os links de pesquisa e cadastre o fornecedor que encontrar.",
      candidates: [],
      discarded: 0,
    };
  const groups: SupplierCandidate[][] = [];
  let discarded = 0;
  let failures = 0;
  for (const item of queries) {
    try {
      const results = await provider(item.query);
      const kept = results
        .map((result) => classifyResult(result, item.query, identity))
        .filter((value): value is SupplierCandidate => Boolean(value));
      discarded += results.length - kept.length;
      groups.push(kept);
    } catch {
      failures += 1;
    }
  }
  if (failures === queries.length)
    return {
      ...base,
      provider: "BRAVE",
      status: "INDISPONIVEL",
      message: "Busca web indisponível agora. Os links de pesquisa continuam funcionando.",
      candidates: [],
      discarded: 0,
    };
  const candidates = mergeCandidates(groups);
  return {
    ...base,
    provider: "BRAVE",
    status: "OK",
    message: candidates.length
      ? failures ? "Parte das fontes não respondeu. Os resultados abaixo são parciais." : null
      : "Nenhum resultado teve evidência suficiente. Revise o nome, a marca ou o modelo e tente a pesquisa manual.",
    candidates,
    discarded,
  };
}
