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
  lastSyncedAt: string;
  health: {
    periodDays: number;
    unitsSold: number;
    revenue: number;
    dailyVelocity: number;
    coverageDays: number | null;
    realizedMarginPercent: number | null;
    unitCost: number | null;
    action: "ADD_COST" | "STOP_BUYING" | "RESTOCK" | "WATCH" | "MAINTAIN" | "OBSERVE";
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
  return "Observar";
}

function healthTone(value: ProductRow["health"]["action"]) {
  if (value === "RESTOCK" || value === "MAINTAIN") return "good";
  if (value === "WATCH" || value === "ADD_COST") return "tight";
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
                      <span>Margem real</span>
                      <strong>
                        {product.health.realizedMarginPercent == null
                          ? "Aguardando"
                          : `${product.health.realizedMarginPercent.toFixed(1)}%`}
                      </strong>
                    </div>
                  </div>

                  <div className="product-actions">
                    <span className="data-origin">Dados Mercado Livre</span>
                    {product.permalink && (
                      <a
                        href={product.permalink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir anúncio
                      </a>
                    )}
                  </div>

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
                              ? "Sem custo do SKU, não dá para decidir capital."
                              : product.health.action === "WATCH"
                                ? "Cobertura abaixo de 14 dias."
                                : product.health.action === "MAINTAIN"
                                  ? "Giro ativo com cobertura confortável."
                                  : "Ainda não há vendas suficientes no período."}
                      </small>
                    </div>
                    <div className="product-capital">
                      <span>Capital para reposição</span>
                      <strong>
                        {product.health.capitalNeeded == null
                          ? "—"
                          : money.format(product.health.capitalNeeded)}
                      </strong>
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
