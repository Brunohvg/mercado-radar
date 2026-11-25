/**
 * Descoberta de fornecedores. Busca genérica devolve varejo; aqui as consultas
 * partem da marca, o varejo conhecido é descartado e cada candidato recebe um
 * tipo provável com as razões. Candidato não é fornecedor confirmado.
 */
import type { ProductIdentity } from "@/lib/sourcing/identity";

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
};

export type SearchOutcome = {
  provider: "BRAVE" | "DESLIGADO";
  status: "OK" | "DESLIGADO" | "INDISPONIVEL";
  message: string | null;
  candidates: SupplierCandidate[];
  discarded: number;
  queries: SearchQuery[];
  manualLinks: Array<{ label: string; url: string }>;
  searchedAt: string;
};

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
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
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
  return queries.slice(0, 4);
}

const RULES: Array<{ kind: SupplierKind; pattern: RegExp; reason: string }> = [
  { kind: "FABRICANTE", pattern: /\b(fabricante|fábrica|fabrica|indústria|industria|\.ind\.br)\b/i, reason: "Menciona fabricação" },
  { kind: "DISTRIBUIDOR", pattern: /\b(distribuidor|distribuidora|distribuição|representante)\b/i, reason: "Menciona distribuição" },
  { kind: "DISTRIBUIDOR", pattern: /seja (um )?revendedor|revenda autorizada|onde comprar/i, reason: "Tem programa de revenda" },
  { kind: "ATACADISTA", pattern: /\b(atacado|atacadista|atacarejo|caixa fechada|pedido mínimo|pedido minimo)\b/i, reason: "Menciona atacado" },
  { kind: "IMPORTADOR", pattern: /\b(importador|importadora|importação direta)\b/i, reason: "Menciona importação" },
];

export function classifyResult(
  result: RawResult,
  query: string,
): SupplierCandidate | null {
  const domain = domainOf(result.url);
  if (!domain || isRetail(domain)) return null;
  const text = `${result.title} ${result.description ?? ""} ${domain}`;
  const reasons: string[] = [];
  let kind: SupplierKind = "OUTRO";
  if (domain.endsWith("mercadolivre.com.br")) {
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
  if (!reasons.length) return null;
  return {
    name: cleanName(result.title, domain),
    url: result.url,
    domain,
    kind,
    reasons: [...new Set(reasons)],
    snippet: result.description?.replace(/<[^>]+>/g, "").slice(0, 240) ?? null,
    query,
  };
}

function cleanName(title: string, domain: string) {
  const first = title.split(/\s[|\-–—]\s/)[0]?.trim();
  return (first && first.length <= 80 ? first : domain).replace(/<[^>]+>/g, "");
}

export function mergeCandidates(groups: SupplierCandidate[][]) {
  const byDomain = new Map<string, SupplierCandidate>();
  for (const candidate of groups.flat()) {
    const key =
      candidate.kind === "LOJA_ML" ? candidate.url : candidate.domain;
    const current = byDomain.get(key);
    if (!current) byDomain.set(key, candidate);
    else
      current.reasons = [...new Set([...current.reasons, ...candidate.reasons])];
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
        .map((result) => classifyResult(result, item.query))
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
      ? null
      : "Nenhum fornecedor provável nos resultados. Varejo foi descartado. Tente os links de pesquisa.",
    candidates,
    discarded,
  };
}
