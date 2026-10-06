"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Demand = "BAIXA" | "MEDIA" | "ALTA" | "EXCELENTE";
type Evidence = "LOW" | "MEDIUM" | "HIGH";

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
  demandLabel: Demand;
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
    price: "PRICES_API" | "ITEM_DETAIL" | "SEARCH";
    soldQuantity: "ITEM_DETAIL" | "UNAVAILABLE";
    visits: "VISITS_API" | "UNAVAILABLE";
  };
};

type SearchPayload = {
  generatedAt: string;
  query: string;
  category: {
    id: string | null;
    name: string | null;
    source: "USER" | "PREDICTED" | "OPEN";
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

type DemandFilter = "ALL" | "HIGH" | "EXCELLENT";
type EvidenceFilter = "ALL" | "HIGH";
type LogisticsFilter = "ALL" | "FULL" | "FLEX";
type Sort =
  | "SCORE"
  | "SALES"
  | "REVENUE"
  | "NEWEST"
  | "PRICE_ASC"
  | "SEARCH_POSITION";

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

function listingLabel(value: string | null) {
  if (value === "gold_pro") return "Premium";
  if (value === "gold_special") return "Clássico";
  return "Outro";
}

function demandLabel(value: Demand) {
  if (value === "EXCELENTE") return "Excelente";
  if (value === "ALTA") return "Alta";
  if (value === "MEDIA") return "Média";
  return "Baixa";
}

function evidenceLabel(value: Evidence) {
  if (value === "HIGH") return "Alta confiança";
  if (value === "MEDIUM") return "Confiança média";
  return "Baixa confiança";
}

function scoreTone(score: number) {
  if (score >= 80) return "excellent";
  if (score >= 65) return "good";
  if (score >= 45) return "attention";
  return "weak";
}

function componentLabel(key: keyof Opportunity["scoreComponents"]) {
  const labels: Record<keyof Opportunity["scoreComponents"], string> = {
    demand: "Demanda",
    velocity: "Velocidade",
    relevance: "Relevância",
    price: "Preço",
    logistics: "Logística",
    evidence: "Evidência",
  };

  return labels[key];
}

export function OpportunityRadar() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchPayload | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(false);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [error, setError] = useState("");
  const [monitored, setMonitored] = useState<Set<string>>(new Set());
  const [monitoringId, setMonitoringId] = useState<string | null>(null);

  const [demand, setDemand] = useState<DemandFilter>("ALL");
  const [evidence, setEvidence] = useState<EvidenceFilter>("ALL");
  const [logistics, setLogistics] = useState<LogisticsFilter>("ALL");
  const [scoreMin, setScoreMin] = useState(0);
  const [salesMin, setSalesMin] = useState(0);
  const [revenueMin, setRevenueMin] = useState(0);
  const [ageMax, setAgeMax] = useState(99999);
  const [freeShippingOnly, setFreeShippingOnly] = useState(false);
  const [catalogOnly, setCatalogOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("SCORE");

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
          limit: 32,
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

  const filtered = useMemo(() => {
    const source = data?.opportunities ?? [];

    const rows = source.filter((item) => {
      if (
        demand === "HIGH" &&
        item.demandLabel !== "ALTA" &&
        item.demandLabel !== "EXCELENTE"
      ) {
        return false;
      }

      if (demand === "EXCELLENT" && item.demandLabel !== "EXCELENTE") {
        return false;
      }

      if (evidence === "HIGH" && item.evidence !== "HIGH") {
        return false;
      }

      if (logistics === "FULL" && item.logisticType !== "fulfillment") {
        return false;
      }

      if (logistics === "FLEX" && item.logisticType !== "self_service") {
        return false;
      }

      if (item.score < scoreMin) return false;
      if (Number(item.salesPerMonth ?? 0) < salesMin) return false;
      if (Number(item.revenuePerMonth ?? 0) < revenueMin) return false;
      if (Number(item.ageDays ?? 99999) > ageMax) return false;
      if (freeShippingOnly && !item.freeShipping) return false;
      if (catalogOnly && !item.catalogProductId) return false;

      return true;
    });

    return [...rows].sort((a, b) => {
      if (sort === "SALES") {
        return Number(b.salesPerMonth ?? 0) - Number(a.salesPerMonth ?? 0);
      }

      if (sort === "REVENUE") {
        return Number(b.revenuePerMonth ?? 0) - Number(a.revenuePerMonth ?? 0);
      }

      if (sort === "NEWEST") {
        return Number(a.ageDays ?? 99999) - Number(b.ageDays ?? 99999);
      }

      if (sort === "PRICE_ASC") {
        return Number(a.price ?? Infinity) - Number(b.price ?? Infinity);
      }

      if (sort === "SEARCH_POSITION") {
        return a.searchPosition - b.searchPosition;
      }

      return b.score - a.score;
    });
  }, [
    ageMax,
    catalogOnly,
    data,
    demand,
    evidence,
    freeShippingOnly,
    logistics,
    revenueMin,
    salesMin,
    scoreMin,
    sort,
  ]);

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

  function resetFilters() {
    setDemand("ALL");
    setEvidence("ALL");
    setLogistics("ALL");
    setScoreMin(0);
    setSalesMin(0);
    setRevenueMin(0);
    setAgeMax(99999);
    setFreeShippingOnly(false);
    setCatalogOnly(false);
    setSort("SCORE");
  }

  return (
    <section className="opportunity-page">
      <header className="page-header clean-page-header opportunity-page-header">
        <div>
          <p className="page-kicker">Inteligência · Descoberta</p>
          <h1>Radar de oportunidades</h1>
          <p>
            Pesquise um produto e veja demanda, velocidade, faturamento estimado,
            preço, concorrência e qualidade da evidência sem depender de uma
            tendência genérica para a tela funcionar.
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
            {loading ? "Lendo mercado..." : "Pesquisar oportunidade"}
          </button>
        </form>

        <div className="opportunity-trends">
          <span>{trendsLoading ? "Lendo tendências..." : "Tendências:"}</span>
          {!trendsLoading &&
            trends.slice(0, 8).map((trend) => (
              <button
                type="button"
                key={trend.keyword}
                onClick={() => void runSearch(trend.keyword)}
              >
                #{trend.position} {trend.keyword}
              </button>
            ))}
          {!trendsLoading && trends.length === 0 && (
            <small>
              Tendências indisponíveis agora — a pesquisa continua funcionando normalmente.
            </small>
          )}
        </div>
      </section>

      {error && <div className="error opportunity-error">{error}</div>}

      {loading && (
        <section className="opportunity-loading-grid" aria-live="polite">
          <div className="opportunity-loading-card" />
          <div className="opportunity-loading-card" />
          <div className="opportunity-loading-card" />
        </section>
      )}

      {!loading && data?.summary && (
        <>
          <section className="opportunity-market-summary">
            <article>
              <span>Mediana do mercado</span>
              <strong>
                {data.summary.median == null
                  ? "—"
                  : money.format(data.summary.median)}
              </strong>
              <small>
                P25{" "}
                {data.summary.p25 == null
                  ? "—"
                  : money.format(data.summary.p25)}{" "}
                · P75{" "}
                {data.summary.p75 == null
                  ? "—"
                  : money.format(data.summary.p75)}
              </small>
            </article>

            <article>
              <span>Vendas estimadas / mês</span>
              <strong>
                {data.summary.medianEstimatedSalesPerMonth == null
                  ? "—"
                  : "~" +
                    Math.round(
                      data.summary.medianEstimatedSalesPerMonth,
                    ).toLocaleString("pt-BR")}
              </strong>
              <small>mediana entre anúncios com histórico suficiente</small>
            </article>

            <article>
              <span>Faturamento estimado / mês</span>
              <strong>
                {data.summary.medianEstimatedRevenuePerMonth == null
                  ? "—"
                  : "~" +
                    compactMoney.format(
                      data.summary.medianEstimatedRevenuePerMonth,
                    )}
              </strong>
              <small>estimativa por velocidade histórica</small>
            </article>

            <article>
              <span>Concorrência observada</span>
              <strong>{data.summary.competitionLevel}</strong>
              <small>
                {data.summary.uniqueSellers} vendedores ·{" "}
                {data.summary.comparableCount} comparáveis
              </small>
            </article>

            <article>
              <span>Logística do mercado</span>
              <strong>{data.summary.freeShippingPercent}%</strong>
              <small>
                Full {data.summary.fullPercent}% · Flex {data.summary.flexPercent}% ·{" "}
                {data.summary.catalogPercent}% catálogo
              </small>
            </article>

            <article>
              <span>Qualidade dos dados</span>
              <strong>{data.summary.exactPricePercent}%</strong>
              <small>
                preço atual confirmado · {data.summary.highEvidenceCount} com alta confiança
              </small>
            </article>
          </section>

          <div className="opportunity-context-line">
            <div>
              <strong>{data.query}</strong>
              <span>
                {data.category.name ??
                  data.category.id ??
                  "categoria aberta"}{" "}
                ·{" "}
                {data.category.source === "PREDICTED"
                  ? "categoria prevista pelo Mercado Livre"
                  : data.category.source === "USER"
                    ? "categoria informada"
                    : "busca aberta"}
              </span>
            </div>
            <span>
              Atualizado em{" "}
              {new Date(data.generatedAt).toLocaleString("pt-BR")}
            </span>
          </div>

          <section className="opportunity-workspace">
            <aside className="opportunity-filter-panel">
              <div className="opportunity-filter-head">
                <div>
                  <span>Filtros Radar</span>
                  <strong>Refine a oportunidade</strong>
                </div>
                <button type="button" onClick={resetFilters}>
                  Limpar
                </button>
              </div>

              <label>
                <span>Demanda</span>
                <select
                  value={demand}
                  onChange={(event) =>
                    setDemand(event.target.value as DemandFilter)
                  }
                >
                  <option value="ALL">Qualquer</option>
                  <option value="HIGH">Alta ou excelente</option>
                  <option value="EXCELLENT">Só excelente</option>
                </select>
              </label>

              <label>
                <span>Radar Score</span>
                <select
                  value={scoreMin}
                  onChange={(event) => setScoreMin(Number(event.target.value))}
                >
                  <option value={0}>Qualquer</option>
                  <option value={50}>50+</option>
                  <option value={65}>65+</option>
                  <option value={80}>80+</option>
                </select>
              </label>

              <label>
                <span>Vendas estimadas / mês</span>
                <select
                  value={salesMin}
                  onChange={(event) => setSalesMin(Number(event.target.value))}
                >
                  <option value={0}>Qualquer</option>
                  <option value={10}>10+</option>
                  <option value={30}>30+</option>
                  <option value={100}>100+</option>
                  <option value={300}>300+</option>
                </select>
              </label>

              <label>
                <span>Faturamento estimado / mês</span>
                <select
                  value={revenueMin}
                  onChange={(event) =>
                    setRevenueMin(Number(event.target.value))
                  }
                >
                  <option value={0}>Qualquer</option>
                  <option value={1000}>R$ 1 mil+</option>
                  <option value={5000}>R$ 5 mil+</option>
                  <option value={10000}>R$ 10 mil+</option>
                  <option value={50000}>R$ 50 mil+</option>
                </select>
              </label>

              <label>
                <span>Idade máxima</span>
                <select
                  value={ageMax}
                  onChange={(event) => setAgeMax(Number(event.target.value))}
                >
                  <option value={99999}>Qualquer</option>
                  <option value={90}>Até 90 dias</option>
                  <option value={180}>Até 180 dias</option>
                  <option value={365}>Até 1 ano</option>
                  <option value={730}>Até 2 anos</option>
                </select>
              </label>

              <label>
                <span>Qualidade da evidência</span>
                <select
                  value={evidence}
                  onChange={(event) =>
                    setEvidence(event.target.value as EvidenceFilter)
                  }
                >
                  <option value="ALL">Qualquer</option>
                  <option value="HIGH">Alta confiança</option>
                </select>
              </label>

              <label>
                <span>Logística</span>
                <select
                  value={logistics}
                  onChange={(event) =>
                    setLogistics(event.target.value as LogisticsFilter)
                  }
                >
                  <option value="ALL">Qualquer</option>
                  <option value="FULL">Só Full</option>
                  <option value="FLEX">Só Flex</option>
                </select>
              </label>

              <label>
                <span>Ordenar</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as Sort)}
                >
                  <option value="SCORE">Melhor oportunidade</option>
                  <option value="SALES">Mais vendas / mês</option>
                  <option value="REVENUE">Maior faturamento / mês</option>
                  <option value="NEWEST">Mais novos</option>
                  <option value="PRICE_ASC">Menor preço</option>
                  <option value="SEARCH_POSITION">Posição da busca</option>
                </select>
              </label>

              <label className="opportunity-check">
                <input
                  type="checkbox"
                  checked={freeShippingOnly}
                  onChange={(event) =>
                    setFreeShippingOnly(event.target.checked)
                  }
                />
                <span>Só frete grátis</span>
              </label>

              <label className="opportunity-check">
                <input
                  type="checkbox"
                  checked={catalogOnly}
                  onChange={(event) => setCatalogOnly(event.target.checked)}
                />
                <span>Só catálogo</span>
              </label>

              <div className="opportunity-filter-result">
                <strong>{filtered.length}</strong>
                <span>resultado(s) após filtros</span>
              </div>
            </aside>

            <div className="opportunity-results">
              {filtered.length === 0 ? (
                <div className="module-empty opportunity-empty">
                  Nenhum anúncio passou pelos filtros atuais. Reduza os filtros
                  ou pesquise outro termo.
                </div>
              ) : (
                <div className="opportunity-result-grid">
                  {filtered.map((item) => (
                    <article className="opportunity-result-card" key={item.id}>
                      <div className="opportunity-result-media">
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt="" loading="lazy" />
                        ) : (
                          <div className="opportunity-image-fallback">MR</div>
                        )}

                        <div className="opportunity-result-rank">
                          #{item.searchPosition} na busca
                        </div>

                        <div
                          className={
                            "opportunity-score " + scoreTone(item.score)
                          }
                        >
                          <strong>{item.score}</strong>
                          <span>/100</span>
                        </div>
                      </div>

                      <div className="opportunity-result-body">
                        <div className="opportunity-card-heading">
                          <div>
                            <span
                              className={
                                "opportunity-demand " +
                                item.demandLabel.toLowerCase()
                              }
                            >
                              {demandLabel(item.demandLabel)}
                            </span>
                            <span className="opportunity-evidence">
                              {evidenceLabel(item.evidence)}
                            </span>
                          </div>
                          <span>{item.similarityPercent}% relevante</span>
                        </div>

                        <h3>{item.title}</h3>

                        <div className="opportunity-price-row">
                          <strong>
                            {item.price == null
                              ? "—"
                              : money.format(item.price)}
                          </strong>
                          {item.gapToMedian != null && (
                            <span
                              className={
                                item.gapToMedian <= 0
                                  ? "price-below"
                                  : "price-above"
                              }
                            >
                              {item.gapToMedian >= 0 ? "+" : ""}
                              {item.gapToMedian.toFixed(1)}% vs mediana
                            </span>
                          )}
                        </div>

                        <div className="opportunity-metric-grid">
                          <div>
                            <span>Visitas / dia</span>
                            <strong>
                              {item.visitsPerDay == null
                                ? "—"
                                : "~" +
                                  item.visitsPerDay.toLocaleString("pt-BR", {
                                    maximumFractionDigits: 1,
                                  })}
                            </strong>
                            <small>ritmo histórico</small>
                          </div>

                          <div>
                            <span>Vendas / dia</span>
                            <strong>
                              {item.salesPerDay == null
                                ? "—"
                                : "~" +
                                  item.salesPerDay.toLocaleString("pt-BR", {
                                    maximumFractionDigits: 1,
                                  })}
                            </strong>
                            <small>ritmo histórico</small>
                          </div>

                          <div>
                            <span>Vendas / mês</span>
                            <strong>
                              {item.salesPerMonth == null
                                ? "Sem histórico"
                                : "~" +
                                  Math.round(
                                    item.salesPerMonth,
                                  ).toLocaleString("pt-BR")}
                            </strong>
                            <small>estimado</small>
                          </div>

                          <div>
                            <span>Faturamento / mês</span>
                            <strong>
                              {item.revenuePerMonth == null
                                ? "—"
                                : "~" +
                                  compactMoney.format(item.revenuePerMonth)}
                            </strong>
                            <small>estimado</small>
                          </div>

                          <div>
                            <span>Vendidos total</span>
                            <strong>
                              {item.soldQuantity.toLocaleString("pt-BR")}
                            </strong>
                            <small>dado do anúncio</small>
                          </div>

                          <div>
                            <span>Idade</span>
                            <strong>
                              {item.ageDays == null
                                ? "—"
                                : item.ageDays.toLocaleString("pt-BR") +
                                  " dias"}
                            </strong>
                            <small>dado do anúncio</small>
                          </div>
                        </div>

                        <div className="opportunity-tags">
                          <span>
                            {listingLabel(item.listingTypeId)}
                          </span>
                          <span>
                            {item.catalogProductId
                              ? "Catálogo"
                              : "Tradicional"}
                          </span>
                          {item.freeShipping && <span>Frete grátis</span>}
                          {item.logisticType === "fulfillment" && <span>Full</span>}
                          {item.logisticType === "self_service" && <span>Flex</span>}
                          {item.bestSellerPosition != null && (
                            <span>#{item.bestSellerPosition} mais vendidos</span>
                          )}
                          {item.visits != null && (
                            <span>
                              {item.visits.toLocaleString("pt-BR")} visitas
                            </span>
                          )}
                        </div>

                        <details className="opportunity-score-details">
                          <summary>Por que essa nota?</summary>
                          <div className="opportunity-score-breakdown">
                            {(
                              Object.entries(
                                item.scoreComponents,
                              ) as Array<
                                [
                                  keyof Opportunity["scoreComponents"],
                                  number,
                                ]
                              >
                            ).map(([key, value]) => (
                              <div key={key}>
                                <span>{componentLabel(key)}</span>
                                <div>
                                  <i style={{ width: value + "%" }} />
                                </div>
                                <strong>{value}</strong>
                              </div>
                            ))}
                          </div>
                        </details>

                        <div className="opportunity-card-actions">
                          <a
                            href={
                              "/analisar?q=" +
                              encodeURIComponent(item.title)
                            }
                          >
                            Analisar custo e margem
                          </a>

                          <button
                            type="button"
                            className={
                              "opportunity-monitor-action " +
                              (monitored.has(item.id) ? "is-monitored" : "")
                            }
                            disabled={
                              monitored.has(item.id) ||
                              monitoringId === item.id
                            }
                            onClick={() => void monitorOpportunity(item)}
                          >
                            {monitored.has(item.id)
                              ? "Monitorando"
                              : monitoringId === item.id
                                ? "Salvando..."
                                : "Monitorar"}
                          </button>

                          {item.permalink && (
                            <a
                              className="secondary-action"
                              href={item.permalink}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Abrir ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          {data.methodology && (
            <section className="opportunity-methodology">
              <div>
                <strong>Dados reais</strong>
                <p>{data.methodology.exact}</p>
              </div>
              <div>
                <strong>Estimativas</strong>
                <p>{data.methodology.estimated}</p>
              </div>
              <div>
                <strong>Radar Score</strong>
                <p>{data.methodology.score}</p>
              </div>
            </section>
          )}
        </>
      )}

      {!loading && data && !data.summary && (
        <div className="module-empty opportunity-empty">
          {data.message ??
            "Nenhuma oportunidade comparável foi encontrada nessa pesquisa."}
        </div>
      )}

      {!loading && !data && (
        <section className="opportunity-first-state">
          <div className="opportunity-first-state-icon">
            <span />
            <span />
            <span />
          </div>
          <h2>Comece por um produto real</h2>
          <p>
            O Radar agora analisa a busca diretamente. Ele não precisa esperar
            uma lista semanal de tendências para funcionar.
          </p>
          <small>
            Quanto mais específico o termo — marca, modelo, quantidade ou medida —
            melhor a qualidade dos comparáveis.
          </small>
        </section>
      )}
    </section>
  );
}
