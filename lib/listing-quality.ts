// Diagnóstico do anúncio: o que falta para ele competir com os que mais vendem.
// Só usa dados lidos do Mercado Livre; nada aqui é estimado.

export type QualityItem = {
  title: string;
  pictures: number;
  attributes: Array<{ id: string; name: string; value: string | null }>;
  description: string | null;
  hasWarranty: boolean;
  freeShipping: boolean;
  price: number;
};

export type CategoryAttribute = {
  id: string;
  name: string;
  valueType: string | null;
  required: boolean;
  hidden: boolean;
  values: Array<{ id: string; name: string }>;
  hint: string | null;
};

export type QualityCheck = {
  id: "TITULO" | "PALAVRAS" | "FOTOS" | "FICHA" | "DESCRICAO" | "GTIN" | "GARANTIA";
  status: "ok" | "warn" | "bad";
  label: string;
  detail: string;
  fix: "title" | "description" | "attributes" | null;
};

export type MissingAttribute = {
  id: string;
  name: string;
  required: boolean;
  valueType: string | null;
  values: Array<{ id: string; name: string }>;
  hint: string | null;
};

const TITLE_MAX = 60;
const STOP = new Set(
  "a o e de da do das dos em para com por sem no na nos nas um uma kit un und unid unidades unidade pct pacote cx caixa c/ x - + / | the".split(" "),
);
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const titleWords = (s: string) =>
  norm(s)
    .split(/[^a-z0-9º°]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));

/** Palavras que aparecem em boa parte dos títulos concorrentes e não estão no seu. */
export function competitorTerms(title: string, competitors: string[], minShare = 0.4) {
  const titles = competitors.filter(Boolean).slice(0, 30);
  if (titles.length < 3) return [];
  const mine = new Set(titleWords(title));
  const count = new Map<string, { n: number; display: string }>();
  for (const t of titles) {
    const seen = new Set<string>();
    for (const raw of t.split(/\s+/)) {
      const w = titleWords(raw)[0];
      if (!w || seen.has(w) || mine.has(w)) continue;
      seen.add(w);
      const cur = count.get(w) ?? { n: 0, display: raw.replace(/[^\p{L}\p{N}º°-]/gu, "") };
      cur.n += 1;
      count.set(w, cur);
    }
  }
  return [...count.values()]
    .filter((c) => c.n / titles.length >= minShare)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((c) => c.display.toLowerCase());
}

const IGNORED_ATTRS = /^(SELLER_SKU|GTIN|EMPTY_GTIN_REASON|ITEM_CONDITION|PRODUCT_FEATURES|ADDITIONAL_INFO|EXCLUSIVE_CHANNEL)$/;

export function diagnoseListing(input: {
  item: QualityItem;
  category: CategoryAttribute[];
  competitorTitles: string[];
}) {
  const { item, category } = input;
  const checks: QualityCheck[] = [];
  const filled = new Set(item.attributes.filter((a) => a.value).map((a) => a.id));

  const len = item.title.trim().length;
  checks.push(
    len < 35
      ? { id: "TITULO", status: "warn", label: "Título curto", detail: `Usa ${len} de ${TITLE_MAX} caracteres. Títulos completos (produto, marca, modelo, medida, quantidade) aparecem em mais buscas.`, fix: "title" }
      : { id: "TITULO", status: "ok", label: "Título com bom tamanho", detail: `Usa ${len} de ${TITLE_MAX} caracteres.`, fix: null },
  );

  const terms = competitorTerms(item.title, input.competitorTitles);
  if (terms.length)
    checks.push({ id: "PALAVRAS", status: "warn", label: "Palavras que os concorrentes usam", detail: `Aparecem em pelo menos 40% dos títulos comparados e não no seu: ${terms.join(", ")}. Use só as que valem para o seu produto.`, fix: "title" });

  checks.push(
    item.pictures < 3
      ? { id: "FOTOS", status: "bad", label: "Poucas fotos", detail: `${item.pictures} foto(s). Use pelo menos 6: frente, detalhe, embalagem, medida e o produto em uso.`, fix: null }
      : item.pictures < 6
        ? { id: "FOTOS", status: "warn", label: "Dá para ter mais fotos", detail: `${item.pictures} fotos. Anúncios com 6 ou mais mostram detalhe, medida e embalagem.`, fix: null }
        : { id: "FOTOS", status: "ok", label: "Fotos suficientes", detail: `${item.pictures} fotos.`, fix: null },
  );

  const relevant = category.filter((a) => !a.hidden && !IGNORED_ATTRS.test(a.id));
  const missing: MissingAttribute[] = relevant
    .filter((a) => !filled.has(a.id))
    .sort((a, b) => Number(b.required) - Number(a.required))
    .map(({ id, name, required, valueType, values, hint }) => ({ id, name, required, valueType, values, hint }));
  const missingRequired = missing.filter((a) => a.required);
  const share = relevant.length ? Math.round(((relevant.length - missing.length) / relevant.length) * 100) : 100;
  checks.push(
    missingRequired.length
      ? { id: "FICHA", status: "bad", label: "Ficha técnica com obrigatórios vazios", detail: `Faltam ${missingRequired.map((a) => a.name).join(", ")}. O ML pode esconder o anúncio nos filtros.`, fix: "attributes" }
      : share < 70
        ? { id: "FICHA", status: "warn", label: "Ficha técnica incompleta", detail: `${share}% preenchida. Cada campo vira filtro de busca: ${missing.slice(0, 4).map((a) => a.name).join(", ")}${missing.length > 4 ? "…" : ""}.`, fix: "attributes" }
        : { id: "FICHA", status: "ok", label: "Ficha técnica bem preenchida", detail: `${share}% preenchida.`, fix: missing.length ? "attributes" : null },
  );

  const desc = (item.description ?? "").trim();
  checks.push(
    !desc
      ? { id: "DESCRICAO", status: "bad", label: "Sem descrição", detail: "O comprador não tem o que ler antes de perguntar ou desistir.", fix: "description" }
      : desc.length < 300
        ? { id: "DESCRICAO", status: "warn", label: "Descrição curta", detail: `${desc.length} caracteres. Conte o que vem na embalagem, medidas e para que serve.`, fix: "description" }
        : { id: "DESCRICAO", status: "ok", label: "Descrição completa", detail: `${desc.length} caracteres.`, fix: null },
  );

  if (category.some((a) => a.id === "GTIN") && !filled.has("GTIN") && !filled.has("EMPTY_GTIN_REASON"))
    checks.push({ id: "GTIN", status: "warn", label: "Sem código de barras (EAN)", detail: "Com o EAN o ML liga o anúncio ao catálogo e ele aparece nas buscas pelo código.", fix: "attributes" });

  if (!item.hasWarranty)
    checks.push({ id: "GARANTIA", status: "warn", label: "Sem garantia informada", detail: "Informe a garantia do vendedor ou de fábrica no Mercado Livre; passa confiança.", fix: null });

  const weight = { ok: 1, warn: 0.5, bad: 0 } as const;
  const score = Math.round((checks.reduce((s, c) => s + weight[c.status], 0) / checks.length) * 100);
  return { score, checks, missingAttributes: missing.slice(0, 20), titleMax: TITLE_MAX, competitorTerms: terms };
}

/**
 * Trava da sugestão de título da IA: até 60 caracteres e nenhum número que não
 * esteja no título atual nem na ficha (evita medida ou quantidade inventada).
 */
export function checkSuggestedTitle(suggested: string, sources: string[]) {
  const title = suggested.replace(/\s+/g, " ").trim();
  if (title.length < 10) return { ok: false as const, reason: "Título sugerido curto demais." };
  if (title.length > TITLE_MAX) return { ok: false as const, reason: `Título sugerido passa de ${TITLE_MAX} caracteres.` };
  const known = new Set(sources.join(" ").match(/\d+(?:[.,]\d+)?/g) ?? []);
  const invented = (title.match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => !known.has(n));
  if (invented.length) return { ok: false as const, reason: `A IA colocou número que não está no anúncio: ${invented.join(", ")}.` };
  return { ok: true as const, title };
}

export type OfficialQuality = {
  score: number;
  level: string | null;
  pending: Array<{ title: string; detail: string | null; link: string | null; warning: boolean }>;
  calculatedAt: string | null;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Lê a resposta de /item/{id}/performance de forma defensiva: nota 0–100, nível
 * (Básica, Satisfatória, Profissional) e as regras ainda pendentes com o link do ML.
 */
export function normalizePerformance(raw: unknown): OfficialQuality | null {
  const root = obj(raw);
  const score = Number(root?.score);
  if (!root || !Number.isFinite(score)) return null;
  const pending: OfficialQuality["pending"] = [];
  for (const bucket of Object.values(obj(root.buckets) ?? {})) {
    for (const variable of Object.values(obj(obj(bucket)?.variables) ?? {})) {
      const v = obj(variable);
      for (const rule of Object.values(obj(v?.rules) ?? {})) {
        const r = obj(rule);
        if (!r || r.status === "COMPLETED") continue;
        const w = obj(r.wordings);
        const title = str(w?.title) ?? str(v?.title);
        if (!title) continue;
        pending.push({ title, detail: str(w?.label), link: str(w?.link), warning: r.mode === "WARNING" });
      }
    }
  }
  pending.sort((a, b) => Number(b.warning) - Number(a.warning));
  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    level: str(root.level_wording) ?? str(root.level),
    pending: pending.slice(0, 12),
    calculatedAt: str(root.calculated_at),
  };
}

export type PriceSuggestion = { suggested: number; lowest: number | null; current: number | null };

const amount = (v: unknown) => {
  const n = Number(obj(v)?.amount ?? v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Sugestão de preço do ML (/suggestions/items/{id}/details). Null quando não há sugestão. */
export function normalizePriceSuggestion(raw: unknown): PriceSuggestion | null {
  const root = obj(raw);
  const suggested = amount(root?.suggested_price);
  if (!root || suggested == null) return null;
  return { suggested, lowest: amount(root.lowest_price), current: amount(root.current_price) };
}
