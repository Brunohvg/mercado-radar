/**
 * Filtros e ordenação do Radar de oportunidades (funções puras).
 *
 * Regras que corrigem a versão anterior:
 *  - filtro de métrica só existe quando algum anúncio da lista tem a métrica;
 *  - anúncio SEM a métrica nunca é tratado como "0": ele sai do filtro de forma
 *    explícita e a contagem avisa quantos ficaram sem dado;
 *  - cada opção mostra quantos anúncios sobram se ela for aplicada junto com os
 *    demais filtros ativos (contagem por faceta), então nenhum clique gera lista
 *    vazia sem aviso.
 */

export type FilterableItem = {
  price: number | null;
  searchPosition: number;
  similarityPercent: number;
  score: number;
  demandLabel: "BAIXA" | "MEDIA" | "ALTA" | "EXCELENTE" | null;
  evidence: "LOW" | "MEDIUM" | "HIGH";
  freeShipping: boolean;
  logisticType: string | null;
  catalogProductId: string | null;
  bestSellerPosition: number | null;
  salesPerMonth: number | null;
  revenuePerMonth: number | null;
  ageDays: number | null;
  rhythm?: "MEDIDO" | "VIDA" | null;
};

export type DemandFilter = "ALL" | "HIGH" | "EXCELLENT";
export type ToggleKey = "freeShipping" | "catalog" | "full" | "flex" | "bestSeller" | "measured" | "highEvidence";

export type FilterState = {
  demand: DemandFilter;
  scoreMin: number;
  relevanceMin: number;
  salesMin: number;
  revenueMin: number;
  /** null = qualquer idade */
  ageMax: number | null;
  toggles: Record<ToggleKey, boolean>;
};

export const EMPTY_TOGGLES: Record<ToggleKey, boolean> = {
  freeShipping: false,
  catalog: false,
  full: false,
  flex: false,
  bestSeller: false,
  measured: false,
  highEvidence: false,
};

export const DEFAULT_FILTERS: FilterState = {
  demand: "ALL",
  scoreMin: 0,
  relevanceMin: 0,
  salesMin: 0,
  revenueMin: 0,
  ageMax: null,
  toggles: EMPTY_TOGGLES,
};

export const TOGGLE_TEST: Record<ToggleKey, (item: FilterableItem) => boolean> = {
  freeShipping: (i) => i.freeShipping,
  catalog: (i) => Boolean(i.catalogProductId),
  full: (i) => i.logisticType === "fulfillment",
  flex: (i) => i.logisticType === "self_service",
  bestSeller: (i) => i.bestSellerPosition != null,
  measured: (i) => i.rhythm === "MEDIDO",
  highEvidence: (i) => i.evidence === "HIGH",
};

export function passes(item: FilterableItem, f: FilterState): boolean {
  if (f.demand === "HIGH" && item.demandLabel !== "ALTA" && item.demandLabel !== "EXCELENTE") return false;
  if (f.demand === "EXCELLENT" && item.demandLabel !== "EXCELENTE") return false;
  if (item.score < f.scoreMin) return false;
  if (item.similarityPercent < f.relevanceMin) return false;
  if (f.salesMin > 0 && (item.salesPerMonth == null || item.salesPerMonth < f.salesMin)) return false;
  if (f.revenueMin > 0 && (item.revenuePerMonth == null || item.revenuePerMonth < f.revenueMin)) return false;
  if (f.ageMax != null && (item.ageDays == null || item.ageDays > f.ageMax)) return false;
  for (const key of Object.keys(f.toggles) as ToggleKey[]) {
    if (f.toggles[key] && !TOGGLE_TEST[key](item)) return false;
  }
  return true;
}

export function applyFilters<T extends FilterableItem>(items: T[], f: FilterState): T[] {
  return items.filter((item) => passes(item, f));
}

/** Quantos anúncios sobrariam se `patch` fosse aplicado sobre os filtros atuais. */
export function countWith(items: FilterableItem[], f: FilterState, patch: Partial<FilterState>): number {
  const next = { ...f, ...patch };
  return items.reduce((sum, item) => sum + (passes(item, next) ? 1 : 0), 0);
}

export function countToggle(items: FilterableItem[], f: FilterState, key: ToggleKey): number {
  return countWith(items, f, { toggles: { ...f.toggles, [key]: true } });
}

export function activeFilterCount(f: FilterState): number {
  return (
    (f.demand !== "ALL" ? 1 : 0) +
    (f.scoreMin > 0 ? 1 : 0) +
    (f.relevanceMin > 0 ? 1 : 0) +
    (f.salesMin > 0 ? 1 : 0) +
    (f.revenueMin > 0 ? 1 : 0) +
    (f.ageMax != null ? 1 : 0) +
    Object.values(f.toggles).filter(Boolean).length
  );
}

/** Quais métricas existem em ao menos um anúncio; o resto do filtro some. */
export function availability(items: FilterableItem[]) {
  return {
    sales: items.some((i) => i.salesPerMonth != null),
    revenue: items.some((i) => i.revenuePerMonth != null),
    age: items.some((i) => i.ageDays != null),
    demand: items.some((i) => i.demandLabel != null),
    bestSeller: items.some((i) => i.bestSellerPosition != null),
    measured: items.some((i) => i.rhythm === "MEDIDO"),
    full: items.some((i) => i.logisticType === "fulfillment"),
    flex: items.some((i) => i.logisticType === "self_service"),
    withoutSales: items.filter((i) => i.salesPerMonth == null).length,
  };
}

export type SortKey = "SCORE" | "SALES" | "REVENUE" | "NEWEST" | "PRICE_ASC" | "SEARCH_POSITION" | "BEST_SELLER";

/** Ordena; valor ausente vai sempre para o fim (nunca vira 0 nem 99999 mascarado). */
export function sortItems<T extends FilterableItem>(items: T[], sort: SortKey): T[] {
  const desc = (get: (i: T) => number | null) => (a: T, b: T) => {
    const x = get(a);
    const y = get(b);
    if (x == null && y == null) return b.score - a.score;
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x || b.score - a.score;
  };
  const asc = (get: (i: T) => number | null) => desc((i) => {
    const v = get(i);
    return v == null ? null : -v;
  });
  const copy = [...items];
  switch (sort) {
    case "SALES":
      return copy.sort(desc((i) => i.salesPerMonth));
    case "REVENUE":
      return copy.sort(desc((i) => i.revenuePerMonth));
    case "NEWEST":
      return copy.sort(asc((i) => i.ageDays));
    case "PRICE_ASC":
      return copy.sort(asc((i) => i.price));
    case "SEARCH_POSITION":
      return copy.sort((a, b) => a.searchPosition - b.searchPosition);
    case "BEST_SELLER":
      return copy.sort(asc((i) => i.bestSellerPosition));
    default:
      return copy.sort((a, b) => b.score - a.score || a.searchPosition - b.searchPosition);
  }
}
