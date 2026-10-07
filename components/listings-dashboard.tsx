"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

type Listing = {
  mlItemId: string;
  title: string;
  sku: string | null;
  status: string;
  listingTypeId: string | null;
  channel: "CATALOG" | "TRADITIONAL";
  catalogProductId: string | null;
  userProductId: string | null;
  listingCreatedAt: string | null;
  currentPrice: number | null;
  availableQuantity: number;
  soldQuantity: number;
  visitsTotal: number | null;
  permalink: string | null;
  thumbnail: string | null;
  freeShipping: boolean;
  score: {
    total: number;
    breakdown: {
      status: number;
      cost: number;
      margin: number;
      sales: number;
      inventory: number;
      visibility: number;
    };
  };
  economics: {
    estimatedProfit: number;
    estimatedMarginPercent: number;
    saleFee: number;
    shippingCost: number;
  } | null;
  health: {
    unitsSold: number;
    decisionMarginPercent: number | null;
    action: string;
  };
};

type ProductPayload = {
  summary: {
    total: number;
    active: number;
    paused: number;
    stockUnits: number;
    soldUnits: number;
  };
  products: Listing[];
};

type SalesPayload = {
  summary: {
    orders: number;
    grossRevenue: number;
    averageTicket: number;
  };
};

type ListingInsight = {
  item: {
    mlItemId: string;
    title: string;
    currentPrice: number | null;
    status: string;
    listingTypeId: string | null;
    channel: "CATALOG" | "TRADITIONAL";
  };
  ranking: {
    position: number | null;
    searched: number;
    note: string | null;
    source?: "EXTENSION_SEARCH" | "NOT_CAPTURED";
    capturedAt?: string | null;
  };
  market: {
    count: number;
    minimum: number | null;
    p25: number | null;
    median: number | null;
    p75: number | null;
    maximum: number | null;
    average: number | null;
    gapToMedian: number | null;
  };
  profitability: {
    profit: number;
    marginPercent: number;
    roiPercent: number;
    breakEvenPrice: number;
    minimumSuggestedPrice: number;
    verdict: "GOOD" | "TIGHT" | "BAD";
  } | null;
  strategy: {
    action: "HOLD" | "RAISE" | "REDUCE" | "RAISE_OR_EXIT";
    recommendedPrice: number;
    safeFloor: number;
    marketReferencePrice: number;
    message: string;
    caveat: string;
  } | null;
  competitors: Array<{
    id: string;
    title: string;
    price: number | null;
    freeShipping: boolean;
    listingTypeId: string | null;
    similarityPercent: number | null;
    searchPosition?: number | null;
    logisticType?: string | null;
    source?: "EXTENSION_SEARCH" | "CATALOG_WINNER";
  }>;
  catalogCompetition?: {
    status: string | null;
    priceToWin: number | null;
    visitShare: string | null;
    competitorsSharingFirstPlace: number | null;
    consistent: boolean | null;
    reasons: string[];
    winner: {
      itemId: string | null;
      price: number | null;
    } | null;
  } | null;
  history: Array<{
    position: number | null;
    testedPrice: number | null;
    medianPrice: number | null;
    p25Price: number | null;
    createdAt: string;
  }>;
};

type Filter =
  | "ALL"
  | "ACTIVE"
  | "PAUSED"
  | "CATALOG"
  | "TRADITIONAL"
  | "SCORE_70";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function listingType(value: string | null) {
  if (value === "gold_pro") return "Premium";
  if (value === "gold_special") return "Clássico";
  return value ?? "—";
}

function statusLabel(value: string) {
  if (value === "active") return "Ativo";
  if (value === "paused") return "Pausado";
  if (value === "closed") return "Encerrado";
  return value;
}

function channelLabel(value: Listing["channel"]) {
  return value === "CATALOG" ? "Catálogo" : "Tradicional";
}

function scoreTone(score: number) {
  if (score >= 75) return "good";
  if (score >= 55) return "attention";
  return "bad";
}

export function ListingsDashboard() {
  const [data, setData] = useState<ProductPayload | null>(null);
  const [sales, setSales] = useState<SalesPayload | null>(null);
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"SCORE" | "SALES" | "PRICE" | "ORIGINAL">(
    "SCORE",
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [insightItemId, setInsightItemId] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState<string | null>(null);
  const [insightById, setInsightById] = useState<Record<string, ListingInsight>>({});
  const [insightError, setInsightError] = useState("");

  const load = useCallback(
    async (refresh = false) => {
      refresh ? setRefreshing(true) : setLoading(true);
      setError("");

      try {
        const productsUrl = "/api/ml/products" + (refresh ? "?refresh=1" : "");
        const salesUrl =
          "/api/ml/sales?days=" +
          days +
          (refresh ? "&refresh=1" : "");

        const [productsResponse, salesResponse] = await Promise.all([
          fetch(productsUrl, { cache: "no-store" }),
          fetch(salesUrl, { cache: "no-store" }),
        ]);

        const [productsPayload, salesPayload] = await Promise.all([
          productsResponse.json(),
          salesResponse.json(),
        ]);

        if (!productsResponse.ok) {
          throw new Error(
            productsPayload.error ?? "Falha ao carregar anúncios.",
          );
        }

        if (!salesResponse.ok) {
          throw new Error(
            salesPayload.error ?? "Falha ao carregar indicadores de venda.",
          );
        }

        setData(productsPayload);
        setSales(salesPayload);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Falha ao carregar anúncios.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [days],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  async function toggleInsight(item: Listing) {
    if (insightItemId === item.mlItemId) {
      setInsightItemId(null);
      return;
    }

    setInsightItemId(item.mlItemId);
    setInsightError("");

    if (insightById[item.mlItemId]) return;

    setInsightLoading(item.mlItemId);

    try {
      const response = await fetch(
        "/api/ml/listing-insights?id=" + encodeURIComponent(item.mlItemId),
        { cache: "no-store" },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Falha ao analisar posição e mercado.",
        );
      }

      setInsightById((current) => ({
        ...current,
        [item.mlItemId]: payload,
      }));
    } catch (caught) {
      setInsightError(
        caught instanceof Error
          ? caught.message
          : "Falha ao analisar posição e mercado.",
      );
    } finally {
      setInsightLoading(null);
    }
  }

  function strategyLabel(
    action: "HOLD" | "RAISE" | "REDUCE" | "RAISE_OR_EXIT",
  ) {
    if (action === "REDUCE") return "Reduzir com limite";
    if (action === "RAISE") return "Subir preço";
    if (action === "RAISE_OR_EXIT") return "Subir ou sair";
    return "Manter";
  }

  const listings = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    const filtered = (data?.products ?? []).filter((item) => {
      if (filter === "ACTIVE" && item.status !== "active") return false;
      if (filter === "PAUSED" && item.status !== "paused") return false;
      if (filter === "CATALOG" && item.channel !== "CATALOG") return false;
      if (filter === "TRADITIONAL" && item.channel !== "TRADITIONAL") return false;
      if (filter === "SCORE_70" && item.score.total < 70) return false;

      if (!normalized) return true;

      return (
        item.title.toLowerCase().includes(normalized) ||
        item.mlItemId.toLowerCase().includes(normalized) ||
        item.sku?.toLowerCase().includes(normalized) ||
        item.userProductId?.toLowerCase().includes(normalized)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sort === "SCORE") return b.score.total - a.score.total;
      if (sort === "SALES") return b.health.unitsSold - a.health.unitsSold;
      if (sort === "PRICE") {
        return Number(b.currentPrice ?? 0) - Number(a.currentPrice ?? 0);
      }
      return 0;
    });
  }, [data, filter, query, sort]);

  const metrics = useMemo(() => {
    const rows = data?.products ?? [];
    const scoreRows = rows.filter((item) => Number.isFinite(item.score.total));

    const averageScore = scoreRows.length
      ? Math.round(
          scoreRows.reduce((sum, item) => sum + item.score.total, 0) /
            scoreRows.length,
        )
      : 0;

    const withHealthyMargin = rows.filter(
      (item) =>
        item.health.decisionMarginPercent != null &&
        item.health.decisionMarginPercent >= 15,
    ).length;

    const catalogCount = rows.filter((item) => item.channel === "CATALOG").length;

    return {
      averageScore,
      healthyMargins: withHealthyMargin,
      catalogCount,
      scored: scoreRows.length,
    };
  }, [data]);

  const activePercent =
    data && data.summary.total > 0
      ? (data.summary.active / data.summary.total) * 100
      : 0;

  return (
    <section className="listings-page">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Operação</p>
          <h1>Anúncios</h1>
          <p>
            Veja qual anúncio pede ajuste de preço, estoque ou atenção — e qual
            está prendendo capital sem retorno.
          </p>
        </div>

        <div className="page-header-actions">
          <select
            className="clean-select"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            aria-label="Período"
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>

          <button
            type="button"
            className="clean-secondary"
            disabled={refreshing}
            onClick={() => void load(true)}
          >
            {refreshing ? "Atualizando..." : "Atualizar dados"}
          </button>
        </div>
      </header>

      {loading && <div className="clean-loading">Carregando anúncios...</div>}
      {error && <div className="error">{error}</div>}

      {data && (
        <>
          <section className="listing-overview-grid">
            <div className="listing-overview-stack">
              <article className="clean-kpi-card listing-kpi-compact">
                <span>Total de anúncios</span>
                <strong>{data.summary.total}</strong>
                <small>{metrics.catalogCount} em catálogo</small>
              </article>

              <article className="clean-kpi-card listing-kpi-compact">
                <span>Anúncios ativos</span>
                <strong>{data.summary.active}</strong>
                <small>{activePercent.toFixed(1)}% do total</small>
              </article>
            </div>

            <article className="clean-kpi-card listing-kpi-feature">
              <div>
                <span>Ticket médio</span>
                <strong>
                  {sales ? money.format(sales.summary.averageTicket) : "—"}
                </strong>
                <small>
                  {sales
                    ? sales.summary.orders + " pedido(s) no período"
                    : "aguardando vendas"}
                </small>
              </div>
            </article>

            <article className="clean-kpi-card listing-score-card">
              <div className="listing-score-head">
                <div>
                  <span>Score médio dos anúncios</span>
                  <small>{metrics.scored} anúncio(s) avaliados</small>
                </div>
                <span className={"table-status " + scoreTone(metrics.averageScore)}>
                  {metrics.averageScore >= 75
                    ? "Saudável"
                    : metrics.averageScore >= 55
                      ? "Atenção"
                      : "Revisar"}
                </span>
              </div>

              <div
                className="score-dial"
                style={
                  {
                    "--score": metrics.averageScore,
                  } as React.CSSProperties
                }
              >
                <div>
                  <strong>{metrics.averageScore}</strong>
                  <span>/100</span>
                </div>
              </div>

              <p>
                {metrics.healthyMargins} anúncio(s) com margem conhecida de 15%+.
              </p>
            </article>
          </section>

          <section className="clean-panel products-table-panel listings-panel">
            <div className="products-table-toolbar">
              <div>
                <strong>Lista de anúncios</strong>
                <span className="num">{listings.length}</span>
              </div>

              <div className="products-table-actions listings-toolbar-actions">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar título, ID ou SKU"
                  aria-label="Buscar anúncios"
                  type="search"
                />

                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as Filter)}
                  aria-label="Filtrar anúncios"
                >
                  <option value="ALL">Todos</option>
                  <option value="ACTIVE">Ativos</option>
                  <option value="PAUSED">Pausados</option>
                  <option value="CATALOG">Catálogo</option>
                  <option value="TRADITIONAL">Tradicional</option>
                  <option value="SCORE_70">Score 70+</option>
                </select>

                <select
                  value={sort}
                  onChange={(event) =>
                    setSort(
                      event.target.value as
                        | "SCORE"
                        | "SALES"
                        | "PRICE"
                        | "ORIGINAL",
                    )
                  }
                  aria-label="Ordenar anúncios"
                >
                  <option value="SCORE">Melhor score</option>
                  <option value="SALES">Mais vendidos</option>
                  <option value="PRICE">Maior preço</option>
                  <option value="ORIGINAL">Ordem original</option>
                </select>
              </div>
            </div>

            <div className="clean-table-wrap">
              <table className="clean-table listings-table">
                <thead>
                  <tr>
                    <th>Anúncio</th>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Plano</th>
                    <th>Canal</th>
                    <th>Preço</th>
                    <th>Estoque</th>
                    <th>Vendas 30d</th>
                    <th>Margem</th>
                    <th>Score</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>

                <tbody>
                  {listings.length === 0 && (
                    <tr className="listing-empty-row">
                      <td colSpan={11}>
                        <div className="empty-result">
                          <strong>
                            {data.products.length === 0
                              ? "Nenhum anúncio sincronizado"
                              : "Nenhum anúncio com esses filtros"}
                          </strong>
                          <span>
                            {data.products.length === 0
                              ? "Conecte a conta do Mercado Livre ou use Atualizar dados para importar seus anúncios."
                              : "Ajuste a busca, o filtro ou a ordenação para ver mais resultados."}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {listings.map((item) => {
                    const insight = insightById[item.mlItemId] ?? null;
                    const isOpen = insightItemId === item.mlItemId;
                    const isLoadingInsight =
                      insightLoading === item.mlItemId;

                    return (
                      <Fragment key={item.mlItemId}>
                        <tr>
                          <td>
                            <div className="clean-product-cell">
                              {item.thumbnail ? (
                                <img src={item.thumbnail} alt="" loading="lazy" />
                              ) : (
                                <span className="clean-product-thumb">ML</span>
                              )}

                              <div>
                                <strong>{item.title}</strong>
                                <small>
                                  {item.sku ? "SKU " + item.sku : "Sem SKU"}
                                  {item.listingCreatedAt
                                    ? " · desde " +
                                      new Date(
                                        item.listingCreatedAt,
                                      ).toLocaleDateString("pt-BR")
                                    : ""}
                                </small>
                              </div>
                            </div>
                          </td>

                          <td>
                            <div className="listing-id-cell">
                              <strong>{item.mlItemId}</strong>
                              {item.userProductId && (
                                <small>{item.userProductId}</small>
                              )}
                            </div>
                          </td>

                          <td>
                            <span className={"listing-status " + item.status}>
                              {statusLabel(item.status)}
                            </span>
                          </td>

                          <td>
                            <span className="listing-plan">
                              {listingType(item.listingTypeId)}
                            </span>
                          </td>

                          <td>
                            <span
                              className={
                                "channel-chip " +
                                (item.channel === "CATALOG"
                                  ? "catalog"
                                  : "traditional")
                              }
                            >
                              {channelLabel(item.channel)}
                            </span>
                          </td>

                          <td>
                            <strong className="listing-price">
                              {item.currentPrice == null
                                ? "—"
                                : money.format(item.currentPrice)}
                            </strong>
                          </td>

                          <td className="num">{item.availableQuantity}</td>
                          <td className="num">{item.health.unitsSold}</td>

                          <td>
                            {item.health.decisionMarginPercent == null ? (
                              <span className="table-muted">Sem custo</span>
                            ) : (
                              <span
                                className={
                                  item.health.decisionMarginPercent >= 15
                                    ? "margin-good"
                                    : "margin-bad"
                                }
                              >
                                {item.health.decisionMarginPercent.toFixed(1)}%
                              </span>
                            )}
                          </td>

                          <td>
                            <div
                              className={
                                "listing-score-pill " +
                                scoreTone(item.score.total)
                              }
                              title={
                                "Status " +
                                item.score.breakdown.status +
                                "/10 · Custo " +
                                item.score.breakdown.cost +
                                "/15 · Margem " +
                                item.score.breakdown.margin +
                                "/30 · Vendas " +
                                item.score.breakdown.sales +
                                "/20 · Estoque " +
                                item.score.breakdown.inventory +
                                "/15 · Visibilidade " +
                                item.score.breakdown.visibility +
                                "/10"
                              }
                            >
                              <strong>{item.score.total}</strong>
                              <span>/100</span>
                            </div>
                          </td>

                          <td>
                            <div className="listing-row-actions">
                              <button
                                type="button"
                                className={
                                  "row-insight-button " +
                                  (isOpen ? "active" : "")
                                }
                                onClick={() => void toggleInsight(item)}
                                aria-expanded={isOpen}
                                disabled={isLoadingInsight}
                                title="Analisar posição, mercado e preço"
                              >
                                {isLoadingInsight ? "Abrindo…" : isOpen ? "Fechar" : "Analisar"}
                              </button>

                              {item.permalink && (
                                <a
                                  className="row-external-link"
                                  href={item.permalink}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={"Abrir " + item.title}
                                >
                                  ↗
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr className="listing-insight-row">
                            <td colSpan={11}>
                              <div className="listing-insight-panel">
                                {isLoadingInsight && (
                                  <div className="listing-insight-loading">
                                    Analisando posição, concorrência e preço...
                                  </div>
                                )}

                                {!isLoadingInsight && insightError && !insight && (
                                  <div className="error">{insightError}</div>
                                )}

                                {!isLoadingInsight && insight && (
                                  <>
                                    <div className="listing-insight-summary">
                                      <div>
                                        <span>Posição na busca</span>
                                        <strong>
                                          {insight.ranking.position == null
                                            ? "50+"
                                            : "#" + insight.ranking.position}
                                        </strong>
                                        <small>
                                          {insight.ranking.position == null
                                            ? insight.ranking.note ??
                                              "fora dos resultados analisados"
                                            : "entre " +
                                              insight.ranking.searched +
                                              " resultados lidos"}
                                        </small>
                                      </div>

                                      <div>
                                        <span>P25 mercado</span>
                                        <strong>
                                          {insight.market.p25 == null
                                            ? "—"
                                            : money.format(insight.market.p25)}
                                        </strong>
                                        <small>
                                          {insight.market.count} comparáveis
                                        </small>
                                      </div>

                                      <div>
                                        <span>Mediana</span>
                                        <strong>
                                          {insight.market.median == null
                                            ? "—"
                                            : money.format(
                                                insight.market.median,
                                              )}
                                        </strong>
                                        <small>
                                          {insight.market.gapToMedian == null
                                            ? "sem comparação"
                                            : (insight.market.gapToMedian >= 0
                                                ? "+"
                                                : "") +
                                              insight.market.gapToMedian.toFixed(
                                                1,
                                              ) +
                                              "% seu preço"}
                                        </small>
                                      </div>

                                      <div>
                                        <span>Lucro atual</span>
                                        <strong>
                                          {insight.profitability == null
                                            ? "Sem custo"
                                            : money.format(
                                                insight.profitability.profit,
                                              )}
                                        </strong>
                                        <small>
                                          {insight.profitability == null
                                            ? "cadastre custo para liberar"
                                            : "margem " +
                                              insight.profitability.marginPercent.toFixed(
                                                1,
                                              ) +
                                              "% · ROI " +
                                              insight.profitability.roiPercent.toFixed(
                                                1,
                                              ) +
                                              "%"}
                                        </small>
                                      </div>
                                    </div>

                                    {insight.strategy && (
                                      <div
                                        className={
                                          "listing-price-strategy " +
                                          insight.strategy.action.toLowerCase()
                                        }
                                      >
                                        <div>
                                          <span>Radar de preço</span>
                                          <strong>
                                            {strategyLabel(
                                              insight.strategy.action,
                                            )}
                                          </strong>
                                          <p>{insight.strategy.message}</p>
                                          <small>{insight.strategy.caveat}</small>
                                        </div>

                                        <div className="listing-price-strategy-numbers">
                                          <div>
                                            <span>Preço recomendado</span>
                                            <strong>
                                              {money.format(
                                                insight.strategy
                                                  .recommendedPrice,
                                              )}
                                            </strong>
                                          </div>
                                          <div>
                                            <span>Piso saudável</span>
                                            <strong>
                                              {money.format(
                                                insight.strategy.safeFloor,
                                              )}
                                            </strong>
                                          </div>
                                          <div>
                                            <span>Referência</span>
                                            <strong>
                                              {money.format(
                                                insight.strategy
                                                  .marketReferencePrice,
                                              )}
                                            </strong>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    <div className="listing-insight-grid">
                                      <div className="listing-history-box">
                                        <strong>Histórico de posição</strong>
                                        {insight.history.length === 0 ? (
                                          <p className="table-muted">
                                            Primeiro snapshot criado agora.
                                          </p>
                                        ) : (
                                          <div className="listing-history-list">
                                            {insight.history
                                              .slice(0, 6)
                                              .map((point, index) => (
                                                <div
                                                  key={
                                                    point.createdAt +
                                                    "-" +
                                                    String(index)
                                                  }
                                                >
                                                  <span>
                                                    {new Date(
                                                      point.createdAt,
                                                    ).toLocaleDateString(
                                                      "pt-BR",
                                                    )}
                                                  </span>
                                                  <strong>
                                                    {point.position == null
                                                      ? "50+"
                                                      : "#" + point.position}
                                                  </strong>
                                                  <small>
                                                    {point.testedPrice == null
                                                      ? "—"
                                                      : money.format(
                                                          point.testedPrice,
                                                        )}
                                                  </small>
                                                </div>
                                              ))}
                                          </div>
                                        )}
                                      </div>

                                      <div className="listing-competitors-box">
                                        <strong>Concorrentes próximos</strong>
                                        {insight.competitors.length === 0 ? (
                                          <p className="table-muted">
                                            Nenhum comparável forte encontrado.
                                          </p>
                                        ) : (
                                          <div className="listing-competitors-list">
                                            {insight.competitors
                                              .slice(0, 5)
                                              .map((competitor) => (
                                                <div key={competitor.id}>
                                                  <span>
                                                    {competitor.title}
                                                  </span>
                                                  <strong>
                                                    {competitor.price == null
                                                      ? "—"
                                                      : money.format(
                                                          competitor.price,
                                                        )}
                                                  </strong>
                                                  <small>
                                                    {competitor.source ===
                                                    "CATALOG_WINNER"
                                                      ? "vencedor do catálogo"
                                                      : competitor.searchPosition !=
                                                          null
                                                        ? "#" +
                                                          competitor.searchPosition +
                                                          " na busca"
                                                        : "observado na busca"}
                                                    {competitor.freeShipping
                                                      ? " · frete grátis"
                                                      : ""}
                                                    {competitor.logisticType ===
                                                    "fulfillment"
                                                      ? " · Full"
                                                      : ""}
                                                  </small>
                                                </div>
                                              ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <footer className="table-footer-note">
              <span>
                O score Radar combina status, custo cadastrado, margem, vendas
                recentes, cobertura de estoque e visibilidade. Não mistura
                períodos incompatíveis para estimar conversão.
              </span>
            </footer>
          </section>
        </>
      )}
    </section>
  );
}
