"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

type ProductRow = {
  id: string;
  mlItemId: string;
  title: string;
  sku: string | null;
  categoryId: string | null;
  status: string;
  listingTypeId: string | null;
  currentPrice: number | null;
  availableQuantity: number;
  soldQuantity: number;
  visitsTotal: number | null;
  permalink: string | null;
  thumbnail: string | null;
  freeShipping: boolean;
  supplier: string | null;
  supplierPrice: number | null;
  discountPercent: number;
  netUnitCost: number | null;
  lastSyncedAt: string;
  economics: {
    saleFee: number;
    shippingCost: number;
    estimatedProfit: number;
    estimatedMarginPercent: number;
    amountReceived: number;
  } | null;
  health: {
    periodDays: number;
    unitsSold: number;
    revenue: number;
    dailyVelocity: number;
    coverageDays: number | null;
    realizedMarginPercent: number | null;
    decisionMarginPercent: number | null;
    unitCost: number | null;
    grossMarkupPercent: number | null;
    inventoryCapital: number | null;
    action:
      | "ADD_COST"
      | "STOP_BUYING"
      | "RESTOCK"
      | "WATCH"
      | "MAINTAIN"
      | "VALIDATE_PROFIT"
      | "OBSERVE";
    suggestedReorder: number;
    capitalNeeded: number | null;
  };
};

type ProductPayload = {
  nickname: string | null;
  summary: {
    total: number;
    active: number;
    paused: number;
    stockUnits: number;
    soldUnits: number;
  };
  products: ProductRow[];
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function listingLabel(value: string | null) {
  if (value === "gold_pro") return "Premium";
  if (value === "gold_special") return "Clássico";
  return value ?? "—";
}

function healthLabel(value: ProductRow["health"]["action"]) {
  if (value === "RESTOCK") return "Repor";
  if (value === "WATCH") return "Atenção";
  if (value === "MAINTAIN") return "Saudável";
  if (value === "STOP_BUYING") return "Parar compra";
  if (value === "ADD_COST") return "Cadastrar custo";
  if (value === "VALIDATE_PROFIT") return "Validar lucro";
  return "Observar";
}

function healthTone(value: ProductRow["health"]["action"]) {
  if (value === "RESTOCK" || value === "MAINTAIN") return "good";
  if (value === "STOP_BUYING") return "bad";
  return "attention";
}

export function ProductsDashboard() {
  const [data, setData] = useState<ProductPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "ATTENTION" | "NO_COST">("ALL");
  const [costEditorId, setCostEditorId] = useState<string | null>(null);
  const [costDraft, setCostDraft] = useState({
    supplier: "",
    supplierPrice: "",
    discountPercent: "0",
  });
  const [costSaving, setCostSaving] = useState(false);

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
        throw new Error(payload.error ?? "Falha ao carregar produtos.");
      }

      setData(payload);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Falha ao carregar produtos.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const products = useMemo(() => {
    const rows = data?.products ?? [];
    const normalized = query.trim().toLowerCase();

    return rows.filter((product) => {
      const textMatch =
        !normalized ||
        product.title.toLowerCase().includes(normalized) ||
        product.mlItemId.toLowerCase().includes(normalized) ||
        product.sku?.toLowerCase().includes(normalized) ||
        product.supplier?.toLowerCase().includes(normalized);

      if (!textMatch) return false;
      if (filter === "NO_COST") return product.netUnitCost == null;
      if (filter === "ATTENTION") {
        return (
          product.health.action === "STOP_BUYING" ||
          product.health.action === "WATCH" ||
          product.health.action === "ADD_COST" ||
          product.health.action === "VALIDATE_PROFIT"
        );
      }
      return true;
    });
  }, [data, filter, query]);

  const summary = useMemo(() => {
    const rows = data?.products ?? [];
    const knownCost = rows.filter((product) => product.netUnitCost != null);
    const inventoryCapital = knownCost.reduce(
      (sum, product) => sum + Number(product.health.inventoryCapital ?? 0),
      0,
    );
    const healthy = rows.filter(
      (product) =>
        product.health.action === "MAINTAIN" ||
        product.health.action === "RESTOCK",
    ).length;
    const healthScore = rows.length
      ? Math.round(
          (knownCost.length / rows.length) * 40 +
            (healthy / rows.length) * 35 +
            (rows.filter((product) => product.health.unitsSold > 0).length /
              rows.length) *
              25,
        )
      : 0;

    return {
      knownCost: knownCost.length,
      inventoryCapital,
      healthScore,
    };
  }, [data]);

  function openCostEditor(product: ProductRow) {
    setCostEditorId(product.mlItemId);
    setCostDraft({
      supplier: product.supplier ?? "",
      supplierPrice:
        product.supplierPrice == null ? "" : String(product.supplierPrice),
      discountPercent: String(product.discountPercent ?? 0),
    });
  }

  async function saveCost(product: ProductRow) {
    const supplierPrice = Number(costDraft.supplierPrice);
    const discountPercent = Number(costDraft.discountPercent);

    if (!Number.isFinite(supplierPrice) || supplierPrice <= 0) {
      setError("Informe quanto foi pago no produto.");
      return;
    }

    if (
      !Number.isFinite(discountPercent) ||
      discountPercent < 0 ||
      discountPercent > 100
    ) {
      setError("Informe um desconto entre 0% e 100%.");
      return;
    }

    setCostSaving(true);
    setError("");

    try {
      const response = await fetch("/api/ml/products/cost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mlItemId: product.mlItemId,
          supplier: costDraft.supplier.trim() || null,
          supplierPrice,
          discountPercent,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao salvar custo.");
      }

      setCostEditorId(null);
      await load(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Falha ao salvar custo.",
      );
    } finally {
      setCostSaving(false);
    }
  }

  return (
    <section className="products-page">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Overview · Produtos</p>
          <h1>Produtos</h1>
          <p>Quanto cada produto deixa, quanto capital está parado e quando repor.</p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="clean-secondary"
            disabled={refreshing}
            onClick={() => void load(true)}
          >
            {refreshing ? "Atualizando..." : "Atualizar produtos"}
          </button>
        </div>
      </header>

      {loading && <div className="clean-loading">Carregando produtos...</div>}
      {error && <div className="error">{error}</div>}

      {data && (
        <>
          <section className="clean-kpi-grid product-overview-kpis">
            <article className="clean-kpi-card">
              <span>SKUs / anúncios</span>
              <strong>{data.summary.total}</strong>
              <small>{data.summary.active} ativos</small>
            </article>
            <article className="clean-kpi-card">
              <span>Unidades em estoque</span>
              <strong>{data.summary.stockUnits}</strong>
              <small>somando anúncios ativos</small>
            </article>
            <article className="clean-kpi-card">
              <span>Capital conhecido</span>
              <strong>{money.format(summary.inventoryCapital)}</strong>
              <small>{summary.knownCost} produto(s) com custo</small>
            </article>
            <article className="clean-kpi-card accent">
              <span>Saúde do estoque</span>
              <strong>{summary.healthScore}/100</strong>
              <small>custo, giro e margem</small>
            </article>
          </section>

          <section className="clean-panel products-table-panel">
            <div className="products-table-toolbar">
              <div>
                <strong>Produtos</strong>
                <span>{products.length} de {data.summary.total}</span>
              </div>

              <div className="products-table-actions">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nome, SKU, fornecedor..."
                  aria-label="Buscar produtos"
                />
                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value as "ALL" | "ATTENTION" | "NO_COST")
                  }
                  aria-label="Filtrar produtos"
                >
                  <option value="ALL">Todos</option>
                  <option value="ATTENTION">Precisam atenção</option>
                  <option value="NO_COST">Sem custo</option>
                </select>
              </div>
            </div>

            {products.length === 0 ? (
              <div className="module-empty">Nenhum produto encontrado.</div>
            ) : (
              <div className="clean-table-wrap">
                <table className="clean-table products-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Tipo</th>
                      <th>SKU</th>
                      <th>Fornecedor</th>
                      <th>Estoque</th>
                      <th>Preço</th>
                      <th>Margem</th>
                      <th>Ação Radar</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <Fragment key={product.mlItemId}>
                        <tr>
                          <td>
                            <div className="clean-product-cell">
                              {product.thumbnail ? (
                                <img src={product.thumbnail} alt="" loading="lazy" />
                              ) : (
                                <span className="clean-product-thumb">MR</span>
                              )}
                              <div>
                                <strong>{product.title}</strong>
                                <small>{product.mlItemId}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="neutral-chip">
                              {listingLabel(product.listingTypeId)}
                            </span>
                          </td>
                          <td>{product.sku ?? "Sem SKU"}</td>
                          <td>
                            {product.supplier ? (
                              <span>{product.supplier}</span>
                            ) : (
                              <button
                                type="button"
                                className="inline-link-button"
                                onClick={() => openCostEditor(product)}
                              >
                                + Vincular
                              </button>
                            )}
                          </td>
                          <td>
                            <strong>{product.availableQuantity}</strong>
                            {product.health.coverageDays != null && (
                              <small className="table-subtext">
                                {Math.round(product.health.coverageDays)} dias
                              </small>
                            )}
                          </td>
                          <td>
                            {product.currentPrice == null
                              ? "—"
                              : money.format(product.currentPrice)}
                          </td>
                          <td>
                            {product.health.decisionMarginPercent == null
                              ? "—"
                              : `${product.health.decisionMarginPercent.toFixed(1)}%`}
                          </td>
                          <td>
                            <span
                              className={
                                "table-status " + healthTone(product.health.action)
                              }
                            >
                              {healthLabel(product.health.action)}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="row-menu-button"
                              aria-label={"Editar " + product.title}
                              onClick={() =>
                                costEditorId === product.mlItemId
                                  ? setCostEditorId(null)
                                  : openCostEditor(product)
                              }
                            >
                              •••
                            </button>
                          </td>
                        </tr>

                        {costEditorId === product.mlItemId && (
                          <tr className="product-editor-row">
                            <td colSpan={9}>
                              <div className="product-inline-editor">
                                <div className="product-inline-editor-head">
                                  <div>
                                    <strong>Custo e fornecedor</strong>
                                    <small>
                                      O Radar usa isso para margem, lucro real e capital.
                                    </small>
                                  </div>
                                  {product.permalink && (
                                    <a
                                      href={product.permalink}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Abrir anúncio ↗
                                    </a>
                                  )}
                                </div>

                                <div className="product-inline-editor-grid">
                                  <label>
                                    <span>Fornecedor</span>
                                    <input
                                      value={costDraft.supplier}
                                      placeholder="Ex.: Bibelô"
                                      onChange={(event) =>
                                        setCostDraft((current) => ({
                                          ...current,
                                          supplier: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                  <label>
                                    <span>Preço tabela</span>
                                    <input
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      value={costDraft.supplierPrice}
                                      onChange={(event) =>
                                        setCostDraft((current) => ({
                                          ...current,
                                          supplierPrice: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                  <label>
                                    <span>Desconto %</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={costDraft.discountPercent}
                                      onChange={(event) =>
                                        setCostDraft((current) => ({
                                          ...current,
                                          discountPercent: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                  <div className="product-inline-cost">
                                    <span>Custo líquido</span>
                                    <strong>
                                      {Number(costDraft.supplierPrice) > 0
                                        ? money.format(
                                            Number(costDraft.supplierPrice) *
                                              (1 -
                                                Number(
                                                  costDraft.discountPercent || 0,
                                                ) /
                                                  100),
                                          )
                                        : "—"}
                                    </strong>
                                  </div>
                                  <button
                                    type="button"
                                    className="primary inline"
                                    disabled={costSaving}
                                    onClick={() => void saveCost(product)}
                                  >
                                    {costSaving ? "Salvando..." : "Salvar custo"}
                                  </button>
                                </div>

                                {product.economics && (
                                  <div className="product-inline-economics">
                                    <span>
                                      Tarifa {money.format(product.economics.saleFee)}
                                    </span>
                                    <span>
                                      Frete {money.format(product.economics.shippingCost)}
                                    </span>
                                    <span>
                                      Lucro estimado{" "}
                                      <strong>
                                        {money.format(product.economics.estimatedProfit)}
                                      </strong>
                                    </span>
                                    <span>
                                      Margem{" "}
                                      <strong>
                                        {product.economics.estimatedMarginPercent.toFixed(1)}%
                                      </strong>
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
