"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type SalesPayload = {
  nickname: string | null;
  summary: {
    orders: number;
    units: number;
    grossRevenue: number;
    realizedProfit: number;
    realizedMarginPercent: number | null;
    profitReadyCount: number;
    awaitingCostCount: number;
    averageTicket: number;
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
  products: Array<{
    mlItemId: string;
    title: string;
    sku: string | null;
    currentPrice: number | null;
    availableQuantity: number;
    netUnitCost: number | null;
    thumbnail: string | null;
    supplier: string | null;
    health: {
      unitsSold: number;
      coverageDays: number | null;
      decisionMarginPercent: number | null;
      inventoryCapital: number | null;
      action:
        | "ADD_COST"
        | "STOP_BUYING"
        | "RESTOCK"
        | "WATCH"
        | "MAINTAIN"
        | "VALIDATE_PROFIT"
        | "OBSERVE";
    };
  }>;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function actionLabel(action: ProductPayload["products"][number]["health"]["action"]) {
  if (action === "RESTOCK") return "Repor";
  if (action === "WATCH") return "Atenção";
  if (action === "MAINTAIN") return "Saudável";
  if (action === "STOP_BUYING") return "Parar compra";
  if (action === "ADD_COST") return "Cadastrar custo";
  if (action === "VALIDATE_PROFIT") return "Validar lucro";
  return "Observar";
}

function actionTone(action: ProductPayload["products"][number]["health"]["action"]) {
  if (action === "MAINTAIN" || action === "RESTOCK") return "good";
  if (action === "STOP_BUYING") return "bad";
  return "attention";
}

export function ExecutiveDashboard() {
  const [days, setDays] = useState(7);
  const [sales, setSales] = useState<SalesPayload | null>(null);
  const [products, setProducts] = useState<ProductPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");

    try {
      const [salesResponse, productsResponse] = await Promise.all([
        fetch(
          `/api/ml/sales?days=${days}${refresh ? "&refresh=1" : ""}`,
          { cache: "no-store" },
        ),
        fetch(
          `/api/ml/products${refresh ? "?refresh=1" : ""}`,
          { cache: "no-store" },
        ),
      ]);

      const [salesPayload, productsPayload] = await Promise.all([
        salesResponse.json(),
        productsResponse.json(),
      ]);

      if (!salesResponse.ok) {
        throw new Error(salesPayload.error ?? "Falha ao carregar vendas.");
      }
      if (!productsResponse.ok) {
        throw new Error(productsPayload.error ?? "Falha ao carregar produtos.");
      }

      setSales(salesPayload);
      setProducts(productsPayload);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Falha ao carregar dashboard.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const health = useMemo(() => {
    const rows = products?.products ?? [];
    if (!rows.length) {
      return {
        score: 0,
        costScore: 0,
        stockScore: 0,
        marginScore: 0,
        giroScore: 0,
        attention: 0,
        inventoryCapital: 0,
      };
    }

    const costKnown = rows.filter((row) => row.netUnitCost != null).length;
    const withStock = rows.filter((row) => row.availableQuantity > 0).length;
    const withHealthyMargin = rows.filter(
      (row) =>
        row.health.decisionMarginPercent != null &&
        row.health.decisionMarginPercent >= 15,
    ).length;
    const withMovement = rows.filter((row) => row.health.unitsSold > 0).length;
    const attention = rows.filter(
      (row) =>
        row.health.action === "STOP_BUYING" ||
        row.health.action === "ADD_COST" ||
        row.health.action === "WATCH" ||
        row.health.action === "VALIDATE_PROFIT",
    ).length;

    const costScore = Math.round((costKnown / rows.length) * 100);
    const stockScore = Math.round((withStock / rows.length) * 100);
    const marginScore = Math.round((withHealthyMargin / rows.length) * 100);
    const giroScore = Math.round((withMovement / rows.length) * 100);
    const score = Math.round(
      costScore * 0.3 + stockScore * 0.2 + marginScore * 0.3 + giroScore * 0.2,
    );
    const inventoryCapital = rows.reduce(
      (sum, row) => sum + Number(row.health.inventoryCapital ?? 0),
      0,
    );

    return {
      score,
      costScore,
      stockScore,
      marginScore,
      giroScore,
      attention,
      inventoryCapital,
    };
  }, [products]);

  const visibleProducts = products?.products.slice(0, 8) ?? [];

  return (
    <section className="overview-dashboard">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Overview</p>
          <h1>Dashboard</h1>
          <p>
            Faturamento, lucro, estoque e saúde da operação em uma única visão.
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

      {error && <div className="error">{error}</div>}
      {loading && <div className="clean-loading">Carregando visão geral...</div>}

      {sales && products && (
        <>
          <section className="clean-kpi-grid" aria-label="Indicadores principais">
            <article className="clean-kpi-card">
              <span>Pedidos realizados</span>
              <strong>{sales.summary.orders}</strong>
              <small>{sales.summary.units} unidades vendidas</small>
            </article>
            <article className="clean-kpi-card">
              <span>Faturamento</span>
              <strong>{money.format(sales.summary.grossRevenue)}</strong>
              <small>período selecionado</small>
            </article>
            <article className="clean-kpi-card">
              <span>Ticket médio</span>
              <strong>{money.format(sales.summary.averageTicket)}</strong>
              <small>por pedido válido</small>
            </article>
            <article className="clean-kpi-card accent">
              <span>Lucro realizado</span>
              <strong>
                {sales.summary.profitReadyCount > 0
                  ? money.format(sales.summary.realizedProfit)
                  : "Aguardando"}
              </strong>
              <small>
                {sales.summary.realizedMarginPercent == null
                  ? `${sales.summary.awaitingCostCount} pedido(s) incompleto(s)`
                  : `${sales.summary.realizedMarginPercent.toFixed(1)}% de margem`}
              </small>
            </article>
          </section>

          <section className="overview-grid">
            <article className="clean-panel business-health">
              <div className="clean-panel-head">
                <div>
                  <span>Saúde do negócio</span>
                  <strong>Pulso geral da operação</strong>
                </div>
                <span className={"health-badge " + (health.score >= 75 ? "good" : "attention")}>
                  {health.score >= 75 ? "Saudável" : "Atenção"}
                </span>
              </div>

              <div className="health-main">
                <div className="health-score">
                  <strong>{health.score}</strong>
                  <span>/100</span>
                </div>
                <div className="health-bar">
                  <span style={{ width: `${health.score}%` }} />
                </div>
              </div>

              <div className="health-dimensions">
                {[
                  ["Custos cadastrados", health.costScore],
                  ["Produtos com estoque", health.stockScore],
                  ["Margem saudável", health.marginScore],
                  ["Giro no período", health.giroScore],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <span>{label}</span>
                    <div>
                      <i style={{ width: `${Number(value)}%` }} />
                    </div>
                    <strong>{value}%</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="clean-panel stock-summary">
              <div className="clean-panel-head">
                <div>
                  <span>Capital & estoque</span>
                  <strong>Visão rápida dos produtos</strong>
                </div>
                <Link href="/produtos">Ver produtos</Link>
              </div>

              <div className="clean-mini-grid">
                <div>
                  <span>Produtos</span>
                  <strong>{products.summary.total}</strong>
                  <small>{products.summary.active} ativos</small>
                </div>
                <div>
                  <span>Unidades em estoque</span>
                  <strong>{products.summary.stockUnits}</strong>
                  <small>nos anúncios ativos</small>
                </div>
                <div>
                  <span>Capital conhecido</span>
                  <strong>{money.format(health.inventoryCapital)}</strong>
                  <small>com custos cadastrados</small>
                </div>
                <div>
                  <span>Precisam atenção</span>
                  <strong>{health.attention}</strong>
                  <small>custo, margem ou reposição</small>
                </div>
              </div>
            </article>
          </section>

          <section className="clean-panel dashboard-products">
            <div className="clean-panel-head">
              <div>
                <span>Produtos</span>
                <strong>O que merece sua atenção agora</strong>
              </div>
              <Link href="/produtos">Abrir gestão de produtos</Link>
            </div>

            <div className="clean-table-wrap">
              <table className="clean-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>SKU</th>
                    <th>Preço</th>
                    <th>Estoque</th>
                    <th>Vendas 30d</th>
                    <th>Margem</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((product) => (
                    <tr key={product.mlItemId}>
                      <td>
                        <div className="clean-product-cell">
                          {product.thumbnail ? (
                            <img src={product.thumbnail} alt="" />
                          ) : (
                            <span className="clean-product-thumb">MR</span>
                          )}
                          <div>
                            <strong>{product.title}</strong>
                            <small>{product.mlItemId}</small>
                          </div>
                        </div>
                      </td>
                      <td>{product.sku ?? "Sem SKU"}</td>
                      <td>
                        {product.currentPrice == null
                          ? "—"
                          : money.format(product.currentPrice)}
                      </td>
                      <td>{product.availableQuantity}</td>
                      <td>{product.health.unitsSold}</td>
                      <td>
                        {product.health.decisionMarginPercent == null
                          ? "—"
                          : `${product.health.decisionMarginPercent.toFixed(1)}%`}
                      </td>
                      <td>
                        <span className={"table-status " + actionTone(product.health.action)}>
                          {actionLabel(product.health.action)}
                        </span>
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
