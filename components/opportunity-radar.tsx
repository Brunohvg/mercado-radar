"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_FILTERS,
  EMPTY_TOGGLES,
  activeFilterCount,
  applyFilters,
  availability,
  countToggle,
  countWith,
  sortItems,
  type FilterState,
  type SortKey,
  type ToggleKey,
} from "@/lib/opportunity-filters";

type Demand = "BAIXA" | "MEDIA" | "ALTA" | "EXCELENTE";
type Evidence = "LOW" | "MEDIUM" | "HIGH";
type Rhythm = "MEDIDO" | "VIDA" | null;

type Opportunity = {
  id: string;
  title: string;
  price: number | null;
  thumbnail: string | null;
  permalink: string | null;
  categoryId: string | null;
  sellerId: string | null;
  listingTypeId: string | null;
  freeShipping: boolean;
  logisticType: string | null;
  shippingMode: string | null;
  catalogProductId: string | null;
  userProductId: string | null;
  searchPosition: number;
  similarityPercent: number;
  soldQuantity: number;
  visits: number | null;
  dateCreated: string | null;
  gapToMedian: number | null;
  score: number;
  demandLabel: Demand | null;
  scorePartial?: boolean;
  rhythm?: Rhythm;
  evidence: Evidence;
  salesPerDay: number | null;
  salesPerMonth: number | null;
  visitsPerDay: number | null;
  revenuePerDay: number | null;
  revenuePerMonth: number | null;
  ageDays: number | null;
  bestSellerPosition: number | null;
  scoreComponents: {
    demand: number;
    velocity: number;
    relevance: number;
    price: number;
    logistics: number;
    evidence: number;
  };
  sources: {
    discovery?: string;
    price: string;
    soldQuantity: string;
    visits: string;
  };
};

type SearchPayload = {
  generatedAt: string;
  query: string;
  category: {
    id: string | null;
    name: string | null;
    source: "USER" | "PREDICTED" | "CATALOG";
  };
  summary: {
    comparableCount: number;
    uniqueSellers: number;
    competitionLevel: "BAIXA" | "MEDIA" | "ALTA";
    minimum: number | null;
    p25: number | null;
    median: number | null;
    p75: number | null;
    maximum: number | null;
    average: number | null;
    freeShippingPercent: number;
    fullPercent: number;
    flexPercent: number;
    catalogPercent: number;
    highEvidenceCount: number;
    exactPricePercent: number;
    medianEstimatedSalesPerMonth: number | null;
    medianEstimatedRevenuePerMonth: number | null;
  } | null;
  opportunities: Opportunity[];
  source?: "CATALOG_SEARCH";
  extensionRecommended?: boolean;
  extensionMessage?: string;
  message?: string;
  methodology?: {
    exact: string;
    estimated: string;
    score: string;
  };
};

type Trend = {
  keyword: string;
  position: number;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const compactMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const SORT_LABELS: Record<SortKey, string> = {
  SCORE: "Melhor oportunidade",
  SALES: "Mais vendas por mês",
  REVENUE: "Maior faturamento por mês",
  NEWEST: "Mais novos",
  PRICE_ASC: "Menor preço",
  SEARCH_POSITION: "Posição na busca",
  BEST_SELLER: "Ranking de mais vendidos",
};

const DEMAND_TEXT: Record<Demand, string> = {
  EXCELENTE: "excelente",
  ALTA: "alta",
  MEDIA: "média",
  BAIXA: "baixa",
};

const COMPONENT_LABEL: Record<keyof Opportunity["scoreComponents"], string> = {
  demand: "demanda",
  velocity: "vendas acumuladas",
  relevance: "relevância",
  price: "preço",
  logistics: "logística",
  evidence: "confiança dos dados",
};

function competitionText(value: "BAIXA" | "MEDIA" | "ALTA") {
  return DEMAND_TEXT[value];
}

/* faixas coerentes: cor acompanha a nota, sem vermelho de alarme */
function scoreTone(score: number) {
  if (score >= 70) return "top";
  if (score >= 50) return "good";
  if (score >= 35) return "mid";
  return "low";
}

function scoreExplanation(item: Opportunity) {
  const entries = Object.entries(item.scoreComponents) as Array<
    [keyof Opportunity["scoreComponents"], number]
  >;
  const usable = item.scorePartial
    ? entries.filter(([key]) => key !== "demand" && key !== "velocity")
    : entries;
  const sorted = [...usable].sort((a, b) => b[1] - a[1]);
  const best = sorted.slice(0, 2).map(([k, v]) => `${COMPONENT_LABEL[k]} ${v}`);
  const worst = sorted[sorted.length - 1];
  const lines = [
    item.scorePartial
      ? `Nota parcial (${item.score} de 100): este anúncio não tem vendas conhecidas, então a nota usa só relevância, preço, logística e confiança, com teto de 60.`
      : `Nota ${item.score} de 100: combina demanda, vendas acumuladas, relevância, preço, logística e confiança dos dados.`,
    `Pontos fortes: ${best.join(", ")}.`,
  ];
  if (worst && worst[1] < 50) lines.push(`Ponto fraco: ${COMPONENT_LABEL[worst[0]]} ${worst[1]}.`);
  return lines;
}

function gapPill(gap: number | null) {
  if (gap == null) return null;
  const rounded = Math.round(gap);
  if (Math.abs(gap) < 3) return { tone: "flat", text: "na mediana" };
  if (gap < 0) return { tone: "below", text: `${Math.abs(rounded)}% abaixo da mediana` };
  return { tone: gap >= 25 ? "above" : "flat", text: `${rounded}% acima da mediana` };
}

function formatAge(days: number) {
  if (days >= 730) return `${Math.floor(days / 365)} anos`;
  if (days >= 365) return "1 ano";
  if (days >= 60) return `${Math.round(days / 30)} meses`;
  return `${days} dias`;
}

const SCORE_OPTIONS = [50, 65, 80];
const RELEVANCE_OPTIONS = [50, 70, 85];
const SALES_OPTIONS = [10, 30, 100, 300];
const REVENUE_OPTIONS = [1000, 5000, 10000, 50000];
const AGE_OPTIONS = [90, 180, 365, 730];

const TOGGLES: Array<{ key: ToggleKey; label: string }> = [
  { key: "freeShipping", label: "Frete grátis" },
  { key: "catalog", label: "Catálogo" },
  { key: "full", label: "Full" },
  { key: "flex", label: "Flex" },
  { key: "bestSeller", label: "Mais vendidos da categoria" },
  { key: "measured", label: "Com ritmo medido" },
  { key: "highEvidence", label: "Alta confiança" },
];

export function OpportunityRadar() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchPayload | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(false);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [error, setError] = useState("");
  const [monitored, setMonitored] = useState<Set<string>>(new Set());
  const [monitoringId, setMonitoringId] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortKey>("SCORE");
  const [filtersOpen, setFiltersOpen] = useState(true);

  useEffect(() => {
    // em tela estreita o painel começa recolhido para não empurrar os resultados
    if (typeof window !== "undefined" && window.innerWidth < 900) setFiltersOpen(false);
  }, []);

  const runSearch = useCallback(async (term: string) => {
    const normalized = term.trim();
    if (normalized.length < 2) {
      setError("Digite pelo menos 2 caracteres para pesquisar.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ml/opportunity-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: normalized,
          limit: 24,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Falha ao pesquisar oportunidades.",
        );
      }

      setData(payload);
      setQuery(normalized);
      setFilters(DEFAULT_FILTERS);
      setSort("SCORE");

      const url = new URL(window.location.href);
      url.searchParams.set("q", normalized);
      window.history.replaceState({}, "", url);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Falha ao pesquisar oportunidades.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMonitored() {
      try {
        const response = await fetch("/api/monitoring/watchlist", {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!cancelled && response.ok) {
          setMonitored(
            new Set(
              (payload.items ?? []).map(
                (item: { mlItemId: string }) => item.mlItemId,
              ),
            ),
          );
        }
      } catch {
        // Monitoring is optional for opportunity discovery.
      }
    }

    async function loadTrends() {
      setTrendsLoading(true);
      try {
        const response = await fetch("/api/ml/opportunity-trends", {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!cancelled && response.ok) {
          setTrends(payload.trends ?? []);
        }
      } finally {
        if (!cancelled) setTrendsLoading(false);
      }
    }

    void loadTrends();
    void loadMonitored();

    const initialQuery = new URLSearchParams(window.location.search)
      .get("q")
      ?.trim();

    if (initialQuery) {
      setQuery(initialQuery);
      void runSearch(initialQuery);
    }

    return () => {
      cancelled = true;
    };
  }, [runSearch]);

  const all = useMemo(() => data?.opportunities ?? [], [data]);
  const avail = useMemo(() => availability(all), [all]);

  const filtered = useMemo(
    () => sortItems(applyFilters(all, filters), sort),
    [all, filters, sort],
  );

  const columns = useMemo(() => {
    const sold = all.some((i) => i.soldQuantity > 0);
    const visits = all.some((i) => i.visitsPerDay != null);
    return {
      sales: avail.sales,
      revenue: avail.revenue,
      sold,
      visits: !sold && visits,
    };
  }, [all, avail]);
  const hasAnyColumn = columns.sales || columns.revenue || columns.sold || columns.visits;

  // se a ordenação escolhida deixar de ter dado (nova busca), volta para a nota
  const sortOptions = (Object.keys(SORT_LABELS) as SortKey[]).filter((key) => {
    if (key === "SALES") return avail.sales;
    if (key === "REVENUE") return avail.revenue;
    if (key === "NEWEST") return avail.age;
    if (key === "BEST_SELLER") return avail.bestSeller;
    return true;
  });
  const activeSort = sortOptions.includes(sort) ? sort : "SCORE";
  const activeCount = activeFilterCount(filters);

  function patch(next: Partial<FilterState>) {
    setFilters((current) => ({ ...current, ...next }));
  }

  function toggle(key: ToggleKey) {
    setFilters((current) => ({
      ...current,
      toggles: { ...current.toggles, [key]: !current.toggles[key] },
    }));
  }

  function resetFilters() {
    setFilters({ ...DEFAULT_FILTERS, toggles: { ...EMPTY_TOGGLES } });
    setSort("SCORE");
  }

  async function monitorOpportunity(item: Opportunity) {
    if (monitored.has(item.id)) return;

    setMonitoringId(item.id);
    setError("");

    try {
      const response = await fetch("/api/monitoring/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          referenceId: data?.query ?? item.title,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Falha ao adicionar ao monitoramento.",
        );
      }

      setMonitored((current) => {
        const next = new Set(current);
        next.add(item.id);
        return next;
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Falha ao adicionar ao monitoramento.",
      );
    } finally {
      setMonitoringId(null);
    }
  }

  function thresholdOptions(
    values: number[],
    field: "scoreMin" | "relevanceMin" | "salesMin" | "revenueMin",
    format: (v: number) => string,
  ) {
    return values.map((v) => {
      const count = countWith(all, filters, { [field]: v });
      return (
        <option key={v} value={v} disabled={count === 0 && filters[field] !== v}>
          {format(v)} ({count})
        </option>
      );
    });
  }

  const summary = data?.summary ?? null;
  const measuredCount = all.filter((i) => i.rhythm === "MEDIDO").length;

  return (
    <section className="opportunity-page">
      <header className="page-header clean-page-header opportunity-page-header">
        <div>
          <p className="page-kicker">Inteligência</p>
          <h1>Radar de oportunidades</h1>
          <p>
            Pesquise um produto e compare os anúncios: preço frente à mediana,
            vendas e faturamento estimados por mês e a confiança de cada número.
          </p>
        </div>
      </header>

      <section className="opportunity-search-panel">
        <form
          className="opportunity-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch(query);
          }}
        >
          <div className="opportunity-search-input-wrap">
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex.: ilhós nº 54 Baxmann, pistola cola quente 20W..."
              aria-label="Pesquisar oportunidade"
            />
          </div>
          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Lendo mercado..." : "Pesquisar"}
          </button>
        </form>

        <div className="opportunity-trends">
          <span>{trendsLoading ? "Lendo tendências..." : "Em alta no Mercado Livre"}</span>
          {!trendsLoading &&
            trends.slice(0, 8).map((trend) => (
              <button
                type="button"
                key={trend.keyword}
                onClick={() => void runSearch(trend.keyword)}
              >
                <b>{trend.position}</b>
                {trend.keyword}
              </button>
            ))}
          {!trendsLoading && trends.length === 0 && (
            <small>
              Tendências indisponíveis agora — a pesquisa funciona normalmente.
            </small>
          )}
        </div>
      </section>

      {error && <div className="error opportunity-error" role="alert">{error}</div>}

      {loading && (
        <section className="opportunity-loading-grid" aria-live="polite" aria-label="Lendo o mercado">
          <div className="opportunity-loading-card" />
          <div className="opportunity-loading-card" />
          <div className="opportunity-loading-card" />
        </section>
      )}

      {!loading && summary && (
        <>
          <div className="opportunity-context-line">
            <div>
              <h2>{data!.query}</h2>
              <span>
                {data!.category.name ?? data!.category.id ?? "categoria aberta"} ·{" "}
                {data!.category.source === "PREDICTED"
                  ? "categoria prevista pelo Mercado Livre"
                  : data!.category.source === "USER"
                    ? "categoria informada"
                    : "busca oficial de produtos"}
              </span>
            </div>
            <span>
              Atualizado em {new Date(data!.generatedAt).toLocaleString("pt-BR")}
            </span>
          </div>

          <section className="opp-strip" aria-label="Resumo do mercado">
            <div className="opp-strip__cell is-main">
              <span>Preço mediano</span>
              <strong className="num">
                {summary.median == null ? "sem preço" : money.format(summary.median)}
              </strong>
              <small>
                {summary.p25 != null && summary.p75 != null
                  ? `faixa típica ${money.format(summary.p25)} a ${money.format(summary.p75)}`
                  : "faixa indisponível"}
              </small>
            </div>
            {summary.medianEstimatedSalesPerMonth != null && (
              <div className="opp-strip__cell">
                <span>Vendas por mês</span>
                <strong className="num">
                  ~{Math.round(summary.medianEstimatedSalesPerMonth).toLocaleString("pt-BR")}
                </strong>
                <small>mediana por anúncio, estimada</small>
              </div>
            )}
            {summary.medianEstimatedRevenuePerMonth != null && (
              <div className="opp-strip__cell">
                <span>Faturamento por mês</span>
                <strong className="num">
                  ~{compactMoney.format(summary.medianEstimatedRevenuePerMonth)}
                </strong>
                <small>mediana por anúncio, estimada</small>
              </div>
            )}
            <div className="opp-strip__cell">
              <span>Concorrência</span>
              <strong>{competitionText(summary.competitionLevel)}</strong>
              <small>
                {summary.uniqueSellers} vendedores em {summary.comparableCount} anúncios
              </small>
            </div>
            <div className="opp-strip__cell">
              <span>Frete grátis</span>
              <strong className="num">{summary.freeShippingPercent}%</strong>
              <small>
                Full {summary.fullPercent}% · Flex {summary.flexPercent}%
              </small>
            </div>
          </section>

          <section className="opportunity-workspace">
            <aside className="opp-filters" aria-label="Filtros">
              <div className="opp-filters__head">
                <button
                  type="button"
                  className="opp-filters__toggle"
                  aria-expanded={filtersOpen}
                  aria-controls="opp-filters-body"
                  onClick={() => setFiltersOpen((open) => !open)}
                >
                  Filtros
                  {activeCount > 0 && <b className="opp-filters__badge">{activeCount}</b>}
                </button>
                <button
                  type="button"
                  className="opp-filters__clear"
                  onClick={resetFilters}
                  disabled={activeCount === 0}
                >
                  Limpar
                </button>
              </div>

              <div id="opp-filters-body" className="opp-filters__body" hidden={!filtersOpen}>
                {avail.demand && (
                  <fieldset className="opp-field">
                    <legend>Demanda</legend>
                    <div className="opp-seg" role="radiogroup" aria-label="Demanda">
                      {(
                        [
                          ["ALL", "Todas"],
                          ["HIGH", "Alta ou mais"],
                          ["EXCELLENT", "Excelente"],
                        ] as const
                      ).map(([value, label]) => {
                        const count = countWith(all, filters, { demand: value });
                        return (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={filters.demand === value}
                            disabled={count === 0 && filters.demand !== value}
                            className={filters.demand === value ? "is-on" : undefined}
                            onClick={() => patch({ demand: value })}
                          >
                            {label} <em>{count}</em>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                )}

                <label className="opp-field">
                  <span>Score mínimo</span>
                  <select
                    value={filters.scoreMin}
                    onChange={(event) => patch({ scoreMin: Number(event.target.value) })}
                  >
                    <option value={0}>Qualquer ({countWith(all, filters, { scoreMin: 0 })})</option>
                    {thresholdOptions(SCORE_OPTIONS, "scoreMin", (v) => `${v} ou mais`)}
                  </select>
                </label>

                <label className="opp-field">
                  <span>Relevância mínima</span>
                  <select
                    value={filters.relevanceMin}
                    onChange={(event) => patch({ relevanceMin: Number(event.target.value) })}
                  >
                    <option value={0}>Qualquer ({countWith(all, filters, { relevanceMin: 0 })})</option>
                    {thresholdOptions(RELEVANCE_OPTIONS, "relevanceMin", (v) => `${v}% ou mais`)}
                  </select>
                </label>

                {avail.sales && (
                  <label className="opp-field">
                    <span>Vendas por mês</span>
                    <select
                      value={filters.salesMin}
                      onChange={(event) => patch({ salesMin: Number(event.target.value) })}
                    >
                      <option value={0}>Qualquer ({countWith(all, filters, { salesMin: 0 })})</option>
                      {thresholdOptions(SALES_OPTIONS, "salesMin", (v) => `${v} ou mais`)}
                    </select>
                  </label>
                )}

                {avail.revenue && (
                  <label className="opp-field">
                    <span>Faturamento por mês</span>
                    <select
                      value={filters.revenueMin}
                      onChange={(event) => patch({ revenueMin: Number(event.target.value) })}
                    >
                      <option value={0}>Qualquer ({countWith(all, filters, { revenueMin: 0 })})</option>
                      {thresholdOptions(REVENUE_OPTIONS, "revenueMin", (v) =>
                        `R$ ${(v / 1000).toLocaleString("pt-BR")} mil ou mais`,
                      )}
                    </select>
                  </label>
                )}

                {avail.age && (
                  <label className="opp-field">
                    <span>Idade do anúncio</span>
                    <select
                      value={filters.ageMax ?? 0}
                      onChange={(event) => {
                        const v = Number(event.target.value);
                        patch({ ageMax: v === 0 ? null : v });
                      }}
                    >
                      <option value={0}>Qualquer ({countWith(all, filters, { ageMax: null })})</option>
                      {AGE_OPTIONS.map((v) => {
                        const count = countWith(all, filters, { ageMax: v });
                        return (
                          <option key={v} value={v} disabled={count === 0 && filters.ageMax !== v}>
                            Até {formatAge(v)} ({count})
                          </option>
                        );
                      })}
                    </select>
                  </label>
                )}

                {!avail.sales && (
                  <p className="opp-filters__note">
                    Filtros de vendas, faturamento e idade aparecem quando o Mercado Livre
                    libera esses dados para os anúncios da busca.
                  </p>
                )}

                <div className="opp-switches" role="group" aria-label="Características">
                  {TOGGLES.map(({ key, label }) => {
                    const on = filters.toggles[key];
                    const count = countToggle(all, filters, key);
                    const disabled = !on && count === 0;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="switch"
                        aria-checked={on}
                        disabled={disabled}
                        className="opp-switch"
                        onClick={() => toggle(key)}
                      >
                        <span className="opp-switch__label">{label}</span>
                        <em>{on ? filtered.length : count}</em>
                        <i aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            <div className="opportunity-results">
              <div className="opportunity-results-toolbar">
                <div className="opportunity-filter-result" aria-live="polite">
                  <strong>{filtered.length}</strong>
                  <span>
                    {filtered.length === all.length
                      ? filtered.length === 1 ? "anúncio" : "anúncios"
                      : `de ${all.length} anúncios`}
                  </span>
                  {measuredCount > 0 && <small>{measuredCount} com ritmo medido</small>}
                </div>

                <label className="opportunity-sort">
                  <span>Ordenar</span>
                  <select
                    value={activeSort}
                    onChange={(event) => setSort(event.target.value as SortKey)}
                  >
                    {sortOptions.map((key) => (
                      <option key={key} value={key}>
                        {SORT_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {!hasAnyColumn && (
                <p className="opp-missing" role="note">
                  <strong>Sem vendas nem faturamento por enquanto.</strong> O Mercado Livre não
                  liberou idade e vendidos destes {all.length} anúncios. Abra-os com a extensão em
                  dias diferentes e o Radar mede o ritmo de cada um.{" "}
                  <a href="/extensao">Ver a extensão</a>
                </p>
              )}

              {filtered.length === 0 ? (
                <div className="module-empty opportunity-empty">
                  <strong>Nenhum anúncio passou pelos filtros</strong>
                  <span>Afrouxe algum filtro ou pesquise outro termo.</span>
                  <button type="button" className="secondary inline" onClick={resetFilters}>
                    Limpar filtros
                  </button>
                </div>
              ) : (
                <ol className="opp-list">
                  {filtered.map((item) => {
                    const gap = gapPill(item.gapToMedian);
                    const tone = scoreTone(item.score);
                    return (
                      <li className="opp-row" key={item.id} data-opportunity-id={item.id}>
                        <div className="opp-thumb">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt="" loading="lazy" />
                          ) : (
                            <span aria-hidden="true">Sem foto</span>
                          )}
                        </div>

                        <div className="opp-main">
                          <h3>
                            {item.permalink ? (
                              <a href={item.permalink} target="_blank" rel="noreferrer">
                                {item.title}
                              </a>
                            ) : (
                              item.title
                            )}
                          </h3>
                          <div className="opp-meta">
                            {item.demandLabel ? (
                              <span className={"opp-demand is-" + item.demandLabel.toLowerCase()}>
                                Demanda {DEMAND_TEXT[item.demandLabel]}
                              </span>
                            ) : (
                              <span className="opp-demand is-none">Sem ritmo medido</span>
                            )}
                            {item.catalogProductId && <span>Catálogo</span>}
                            {item.logisticType === "fulfillment" && <span className="is-full">Full</span>}
                            {item.logisticType === "self_service" && <span>Flex</span>}
                            {item.freeShipping && <span>Frete grátis</span>}
                            {item.bestSellerPosition != null && (
                              <span className="is-best">{item.bestSellerPosition}º mais vendido</span>
                            )}
                            <small>{item.searchPosition}º na busca</small>
                          </div>
                        </div>

                        <div className="opp-price">
                          <strong className="num">
                            {item.price == null ? "sem preço" : money.format(item.price)}
                          </strong>
                          {gap && <span className={"opp-gap is-" + gap.tone}>{gap.text}</span>}
                        </div>

                        {hasAnyColumn && !(item.salesPerMonth != null || item.revenuePerMonth != null || item.soldQuantity > 0 || item.visitsPerDay != null) && (
                          <p className="opp-metrics opp-metrics--empty">
                            Sem vendas conhecidas deste anúncio. Abra-o com a extensão em outro dia para medir o ritmo.
                          </p>
                        )}
                        {hasAnyColumn && (item.salesPerMonth != null || item.revenuePerMonth != null || item.soldQuantity > 0 || item.visitsPerDay != null) && (
                          <dl className="opp-metrics">
                            {columns.sales && (
                              <div>
                                <dt>Vendas por mês</dt>
                                <dd className="num">
                                  {item.salesPerMonth == null
                                    ? <span className="opp-none">sem dado</span>
                                    : "~" + Math.round(item.salesPerMonth).toLocaleString("pt-BR")}
                                </dd>
                                {item.salesPerMonth != null && (
                                  <small>{item.rhythm === "MEDIDO" ? "medido pelo Radar" : "média desde a criação"}</small>
                                )}
                              </div>
                            )}
                            {columns.revenue && (
                              <div>
                                <dt>Faturamento por mês</dt>
                                <dd className="num">
                                  {item.revenuePerMonth == null
                                    ? <span className="opp-none">sem dado</span>
                                    : "~" + compactMoney.format(item.revenuePerMonth)}
                                </dd>
                                {item.revenuePerMonth != null && <small>vendas × preço</small>}
                              </div>
                            )}
                            {columns.sold && (
                              <div>
                                <dt>Vendidos no total</dt>
                                <dd className="num">
                                  {item.soldQuantity > 0
                                    ? item.soldQuantity.toLocaleString("pt-BR")
                                    : <span className="opp-none">sem dado</span>}
                                </dd>
                                {item.soldQuantity > 0 && <small>acumulado</small>}
                              </div>
                            )}
                            {columns.visits && (
                              <div>
                                <dt>Visitas por dia</dt>
                                <dd className="num">
                                  {item.visitsPerDay == null
                                    ? <span className="opp-none">sem dado</span>
                                    : "~" + Math.round(item.visitsPerDay).toLocaleString("pt-BR")}
                                </dd>
                              </div>
                            )}
                          </dl>
                        )}

                        <div className="opp-score">
                          <button
                            type="button"
                            className={"opp-score__chip is-" + tone}
                            aria-describedby={"tip-" + item.id}
                            aria-label={`Score ${item.score} de 100${item.scorePartial ? ", parcial" : ""}. Ver explicação`}
                          >
                            <b className="num">{item.score}</b>
                            <span>{item.scorePartial ? "parcial" : "score"}</span>
                          </button>
                          <div className="opp-tip" role="tooltip" id={"tip-" + item.id}>
                            {scoreExplanation(item).map((line) => (
                              <p key={line}>{line}</p>
                            ))}
                          </div>
                        </div>

                        <div className="opp-actions">
                          <button
                            type="button"
                            className={
                              "secondary inline opportunity-monitor-action " +
                              (monitored.has(item.id) ? "is-monitored" : "")
                            }
                            disabled={monitored.has(item.id) || monitoringId === item.id}
                            onClick={() => void monitorOpportunity(item)}
                          >
                            {monitored.has(item.id)
                              ? "Monitorando"
                              : monitoringId === item.id
                                ? "Salvando..."
                                : "Monitorar"}
                          </button>
                          <a className="primary inline" href={"/analisar?q=" + encodeURIComponent(item.title)}>
                            Analisar custo
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>

          {data!.extensionRecommended && data!.extensionMessage && (
            <section className="opportunity-extension-banner">
              <div>
                <strong>Quer ver todos os anúncios da busca?</strong>
                <p>{data!.extensionMessage}</p>
              </div>
              <a className="secondary" href="/extensao">
                Abrir a extensão
              </a>
            </section>
          )}

          {data!.methodology && (
            <section className="opportunity-methodology" aria-label="Como os números são calculados">
              <div>
                <strong>Dados reais</strong>
                <p>{data!.methodology.exact}</p>
              </div>
              <div>
                <strong>Estimativas</strong>
                <p>{data!.methodology.estimated}</p>
              </div>
              <div>
                <strong>Score</strong>
                <p>{data!.methodology.score}</p>
              </div>
            </section>
          )}
        </>
      )}

      {!loading && data && !data.summary && (
        <div className="module-empty opportunity-empty opportunity-no-result">
          <strong>Nenhum comparável para “{data.query}”</strong>
          <span>
            {data.message ??
              "Nenhuma oportunidade comparável foi encontrada nessa pesquisa."}
          </span>
          {data.extensionRecommended && (
            <a className="secondary inline" href="/extensao">
              Abrir a extensão
            </a>
          )}
        </div>
      )}

      {!loading && !data && (
        <section className="opportunity-first-state">
          <div className="opportunity-first-state-copy">
            <h2>Comece por um produto real</h2>
            <p>
              Digite um termo ou toque numa tendência. O Radar lê os anúncios
              comparáveis do Mercado Livre na hora e mostra:
            </p>
            <ul>
              <li>
                <strong>Faixa de preço</strong>
                <span>mediana e faixa típica do mercado</span>
              </li>
              <li>
                <strong>Demanda por anúncio</strong>
                <span>vendas e faturamento estimados por mês</span>
              </li>
              <li>
                <strong>Score</strong>
                <span>nota de 0 a 100 com a confiança de cada dado</span>
              </li>
            </ul>
            <small>
              Quanto mais específico o termo — marca, modelo, quantidade ou
              medida — melhores os comparáveis.
            </small>
          </div>
        </section>
      )}
    </section>
  );
}
