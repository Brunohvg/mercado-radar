"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Listing = {
  mlItemId: string;
  title: string;
  sku: string | null;
  status: string;
  listingTypeId: string | null;
  currentPrice: number | null;
  availableQuantity: number;
  soldQuantity: number;
  visitsTotal: number | null;
  permalink: string | null;
  thumbnail: string | null;
  freeShipping: boolean;
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

type Payload = {
  summary: {
    total: number;
    active: number;
    paused: number;
    stockUnits: number;
    soldUnits: number;
  };
  products: Listing[];
};

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

export function ListingsDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<"ALL" | "active" | "paused">("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/ml/products${refresh ? "?refresh=1" : ""}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao carregar anúncios.");
      }
      setData(payload);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Falha ao carregar anúncios.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const listings = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.products ?? []).filter((item) => {
      if (filter !== "ALL" && item.status !== filter) return false;
      if (!normalized) return true;
      return (
        item.title.toLowerCase().includes(normalized) ||
        item.mlItemId.toLowerCase().includes(normalized) ||
        item.sku?.toLowerCase().includes(normalized)
      );
    });
  }, [data, filter, query]);

  const averageMargin = useMemo(() => {
    const margins = (data?.products ?? [])
      .map((item) => item.health.decisionMarginPercent)
      .filter((value): value is number => value != null);
    return margins.length
      ? margins.reduce((sum, value) => sum + value, 0) / margins.length
      : null;
  }, [data]);

  return (
    <section>
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Overview · Anúncios</p>
          <h1>Anúncios</h1>
          <p>Preço, estoque, vendas, visitas e rentabilidade dos anúncios conectados.</p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="clean-secondary"
            disabled={refreshing}
            onClick={() => void load(true)}
          >
            {refreshing ? "Atualizando..." : "Atualizar anúncios"}
          </button>
        </div>
      </header>

      {loading && <div className="clean-loading">Carregando anúncios...</div>}
      {error && <div className="error">{error}</div>}

      {data && (
        <>
          <section className="clean-kpi-grid">
            <article className="clean-kpi-card">
              <span>Anúncios</span>
              <strong>{data.summary.total}</strong>
              <small>{data.summary.active} ativos</small>
            </article>
            <article className="clean-kpi-card">
              <span>Pausados</span>
              <strong>{data.summary.paused}</strong>
              <small>exigem revisão operacional</small>
            </article>
            <article className="clean-kpi-card">
              <span>Unidades anunciadas</span>
              <strong>{data.summary.stockUnits}</strong>
              <small>estoque dos anúncios ativos</small>
            </article>
            <article className="clean-kpi-card accent">
              <span>Margem média conhecida</span>
              <strong>
                {averageMargin == null ? "—" : `${averageMargin.toFixed(1)}%`}
              </strong>
              <small>realizada ou estimada</small>
            </article>
          </section>

          <section className="clean-panel products-table-panel">
            <div className="products-table-toolbar">
              <div>
                <strong>Anúncios</strong>
                <span>{listings.length}</span>
              </div>
              <div className="products-table-actions">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar anúncio, SKU ou MLB..."
                />
                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value as "ALL" | "active" | "paused")
                  }
                >
                  <option value="ALL">Todos</option>
                  <option value="active">Ativos</option>
                  <option value="paused">Pausados</option>
                </select>
              </div>
            </div>

            <div className="clean-table-wrap">
              <table className="clean-table listings-table">
                <thead>
                  <tr>
                    <th>Anúncio</th>
                    <th>Status</th>
                    <th>Tipo</th>
                    <th>Preço</th>
                    <th>Estoque</th>
                    <th>Vendas 30d</th>
                    <th>Visitas</th>
                    <th>Margem</th>
                    <th>Lucro est.</th>
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
                            <small>{item.mlItemId}{item.sku ? ` · ${item.sku}` : ""}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={"listing-status " + item.status}>
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td>{listingType(item.listingTypeId)}</td>
                      <td>{item.currentPrice == null ? "—" : money.format(item.currentPrice)}</td>
                      <td>{item.availableQuantity}</td>
                      <td>{item.health.unitsSold}</td>
                      <td>{item.visitsTotal ?? "—"}</td>
                      <td>
                        {item.health.decisionMarginPercent == null
                          ? "—"
                          : `${item.health.decisionMarginPercent.toFixed(1)}%`}
                      </td>
                      <td>
                        {item.economics == null
                          ? "—"
                          : money.format(item.economics.estimatedProfit)}
                      </td>
                      <td>
                        {item.permalink && (
                          <a
                            className="row-external-link"
                            href={item.permalink}
                            target="_blank"
                            rel="noreferrer"
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
          </section>
        </>
      )}
    </section>
  );
}
