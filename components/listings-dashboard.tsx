"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
          <p className="page-kicker">Overview · Anúncios</p>
          <h1>Anúncios</h1>
          <p>
            Descubra qual anúncio merece preço, estoque ou atenção — e qual está
            consumindo capital sem retorno.
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
              <div className="listing-ticket-spark" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
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
                <strong>Anúncios</strong>
                <span>{listings.length}</span>
              </div>

              <div className="products-table-actions listings-toolbar-actions">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar anúncio, ID, SKU ou User Product..."
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
                    <th>Radar</th>
                    <th />
                  </tr>
                </thead>

                <tbody>
                  {listings.map((item) => (
                    <tr key={item.mlItemId}>
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
                          {item.userProductId && <small>{item.userProductId}</small>}
                        </div>
                      </td>

                      <td>
                        <span className={"listing-status " + item.status}>
                          {statusLabel(item.status)}
                        </span>
                      </td>

                      <td>
                        <span className="neutral-chip">
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

                      <td>{item.availableQuantity}</td>
                      <td>{item.health.unitsSold}</td>

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
                            "listing-score-pill " + scoreTone(item.score.total)
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="table-footer-note">
              <span>
                Score Radar usa status, custo cadastrado, margem, vendas recentes,
                cobertura de estoque e visibilidade. Não mistura períodos
                incompatíveis para inventar conversão.
              </span>
            </footer>
          </section>
        </>
      )}
    </section>
  );
}
