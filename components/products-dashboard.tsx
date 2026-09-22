"use client";

import { useCallback, useEffect, useState } from "react";

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
    unitCost: number | null;
    grossMarkupPercent: number | null;
    inventoryCapital: number | null;
    action: "ADD_COST" | "STOP_BUYING" | "RESTOCK" | "WATCH" | "MAINTAIN" | "VALIDATE_PROFIT" | "OBSERVE";
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
  if (value === "MAINTAIN") return "Manter";
  if (value === "STOP_BUYING") return "Parar compra";
  if (value === "ADD_COST") return "Vincular custo";
  if (value === "VALIDATE_PROFIT") return "Validar lucro";
  return "Observar";
}

function healthTone(value: ProductRow["health"]["action"]) {
  if (value === "RESTOCK" || value === "MAINTAIN") return "good";
  if (
    value === "WATCH" ||
    value === "ADD_COST" ||
    value === "VALIDATE_PROFIT"
  )
    return "tight";
  if (value === "STOP_BUYING") return "bad";
  return "neutral";
}

function statusLabel(value: string) {
  if (value === "active") return "Ativo";
  if (value === "paused") return "Pausado";
  if (value === "closed") return "Encerrado";
  return value;
}

export function ProductsDashboard() {
  const [data, setData] = useState<ProductPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
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
    <section className="module-section" id="produtos">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Capital & estoque</p>
          <h2>Quais produtos merecem mais capital — e quais não?</h2>
        </div>
        <div className="module-heading-actions">
          <p>
            Os anúncios da conta são a base para decidir reposição, cobertura,
            preço e capital. Não queremos apenas repetir o Seller Center.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={refreshing}
            onClick={() => void load(true)}
          >
            {refreshing ? "Sincronizando..." : "Sincronizar produtos"}
          </button>
        </div>
      </div>

      {loading && <div className="module-loading">Carregando produtos...</div>}
      {error && <div className="error">{error}</div>}

      {data && (
        <>
          <div className="module-kpis">
            <article>
              <span>Anúncios</span>
              <strong>{data.summary.total}</strong>
              <small>{data.summary.active} ativos</small>
            </article>
            <article>
              <span>Estoque ativo</span>
              <strong>{data.summary.stockUnits}</strong>
              <small>unidades anunciadas</small>
            </article>
            <article>
              <span>Vendas acumuladas</span>
              <strong>{data.summary.soldUnits}</strong>
              <small>nos anúncios sincronizados</small>
            </article>
            <article>
              <span>Pausados</span>
              <strong>{data.summary.paused}</strong>
              <small>atenção operacional</small>
            </article>
          </div>

          {data.products.length === 0 ? (
            <div className="module-empty">
              Nenhum anúncio foi encontrado na conta conectada.
            </div>
          ) : (
            <div className="product-list">
              {data.products.map((product) => (
                <article className="product-row-card" key={product.mlItemId}>
                  <div className="product-identity">
                    {product.thumbnail ? (
                      <img src={product.thumbnail} alt="" loading="lazy" />
                    ) : (
                      <div className="product-thumb-placeholder">ML</div>
                    )}
                    <div>
                      <div className="product-flags">
                        <span className={"status-chip " + product.status}>
                          {statusLabel(product.status)}
                        </span>
                        <span>{listingLabel(product.listingTypeId)}</span>
                        {product.freeShipping && <span>Frete grátis</span>}
                      </div>
                      <strong>{product.title}</strong>
                      <small>
                        {product.mlItemId}
                        {product.sku ? ` · SKU ${product.sku}` : ""}
                      </small>
                    </div>
                  </div>

                  <div className="product-metrics">
                    <div>
                      <span>Preço atual</span>
                      <strong>
                        {product.currentPrice == null
                          ? "Consultar"
                          : money.format(product.currentPrice)}
                      </strong>
                    </div>
                    <div>
                      <span>Estoque atual</span>
                      <strong>{product.availableQuantity}</strong>
                    </div>
                    <div>
                      <span>Vendas 30d</span>
                      <strong>{product.health.unitsSold}</strong>
                    </div>
                    <div>
                      <span>Cobertura</span>
                      <strong>
                        {product.health.coverageDays == null
                          ? "Sem giro"
                          : `${Math.round(product.health.coverageDays)} dias`}
                      </strong>
                    </div>
                    <div>
                      <span>
                        {product.health.realizedMarginPercent != null
                          ? "Margem real"
                          : "Margem estimada"}
                      </span>
                      <strong>
                        {product.health.decisionMarginPercent == null
                          ? "Aguardando"
                          : `${product.health.decisionMarginPercent.toFixed(1)}%`}
                      </strong>
                    </div>
                  </div>

                  {product.netUnitCost == null ? (
                    <div className="product-cost-empty">
                      <div>
                        <span>Custo ainda não informado</span>
                        <small>
                          Informe o preço pago e o desconto para liberar margem,
                          capital e lucro real.
                        </small>
                      </div>
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => openCostEditor(product)}
                      >
                        Informar custo
                      </button>
                    </div>
                  ) : (
                    <div className="product-cost-summary compact">
                      <div>
                        <span>Custo líquido</span>
                        <strong>{money.format(product.netUnitCost)}</strong>
                        <small>
                          tabela {money.format(product.supplierPrice ?? 0)}
                          {product.discountPercent > 0
                            ? ` · -${product.discountPercent.toFixed(1)}%`
                            : ""}
                        </small>
                      </div>
                      <div>
                        <span>Markup bruto</span>
                        <strong>
                          {product.health.grossMarkupPercent == null
                            ? "—"
                            : `${product.health.grossMarkupPercent.toFixed(1)}%`}
                        </strong>
                      </div>
                      <div>
                        <span>Capital em estoque</span>
                        <strong>
                          {product.health.inventoryCapital == null
                            ? "—"
                            : money.format(product.health.inventoryCapital)}
                        </strong>
                      </div>
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => openCostEditor(product)}
                      >
                        Editar custo
                      </button>
                    </div>
                  )}

                  {product.economics && (
                    <div className="listing-economics">
                      <div>
                        <span>Tarifa do anúncio</span>
                        <strong>{money.format(product.economics.saleFee)}</strong>
                      </div>
                      <div>
                        <span>Frete estimado</span>
                        <strong>{money.format(product.economics.shippingCost)}</strong>
                      </div>
                      <div>
                        <span>Recebe do ML</span>
                        <strong>{money.format(product.economics.amountReceived)}</strong>
                      </div>
                      <div>
                        <span>Lucro estimado</span>
                        <strong>{money.format(product.economics.estimatedProfit)}</strong>
                      </div>
                      <div>
                        <span>Margem estimada</span>
                        <strong>{product.economics.estimatedMarginPercent.toFixed(1)}%</strong>
                      </div>
                    </div>
                  )}

                  {costEditorId === product.mlItemId && (
                    <div className="product-cost-editor">
                      <div className="product-cost-editor-head">
                        <div>
                          <span className="eyebrow">Custo do produto</span>
                          <strong>Quanto este item realmente custou?</strong>
                        </div>
                        <button
                          type="button"
                          className="table-action"
                          onClick={() => setCostEditorId(null)}
                        >
                          Fechar
                        </button>
                      </div>

                      <div className="product-cost-editor-grid">
                        <label>
                          <span>Fornecedor (opcional)</span>
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
                          <span>Preço pago / tabela</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={costDraft.supplierPrice}
                            placeholder="Ex.: 27,90"
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
                        <div className="product-cost-preview">
                          <span>Custo líquido</span>
                          <strong>
                            {Number(costDraft.supplierPrice) > 0
                              ? money.format(
                                  Number(costDraft.supplierPrice) *
                                    (1 -
                                      Number(costDraft.discountPercent || 0) /
                                        100),
                                )
                              : "—"}
                          </strong>
                        </div>
                      </div>

                      <div className="product-cost-editor-actions">
                        <small>
                          Ao salvar, o Radar recalcula pedidos históricos deste
                          anúncio que já tenham tarifa e frete realizados.
                        </small>
                        <button
                          type="button"
                          className="secondary"
                          disabled={costSaving}
                          onClick={() => void saveCost(product)}
                        >
                          {costSaving ? "Recalculando..." : "Salvar e recalcular"}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className={"product-health-card " + healthTone(product.health.action)}>
                    <div>
                      <span>Ação do Radar</span>
                      <strong>{healthLabel(product.health.action)}</strong>
                      <small>
                        {product.health.action === "RESTOCK"
                          ? `Sugestão: repor ${product.health.suggestedReorder} un.`
                          : product.health.action === "STOP_BUYING"
                            ? "Margem realizada abaixo do mínimo."
                            : product.health.action === "ADD_COST"
                              ? "Sem custo do produto, não dá para calcular margem nem decidir capital."
                              : product.health.action === "VALIDATE_PROFIT"
                                ? "O custo já está salvo, mas ainda faltam tarifa ou frete realizados para concluir a margem real."
                                : product.health.action === "WATCH"
                                  ? "Cobertura abaixo de 14 dias."
                                  : product.health.action === "MAINTAIN"
                                    ? "Margem conhecida e cobertura confortável."
                                    : "Ainda não há vendas suficientes no período."}
                      </small>
                    </div>
                    <div className="product-health-side">
                      <div className="product-capital">
                        <span>Capital para reposição</span>
                        <strong>
                          {product.health.capitalNeeded == null
                            ? "—"
                            : money.format(product.health.capitalNeeded)}
                        </strong>
                      </div>
                      {product.permalink && (
                        <a
                          className="table-action"
                          href={product.permalink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir anúncio
                        </a>
                      )}
                    </div>
                  </div>

                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
