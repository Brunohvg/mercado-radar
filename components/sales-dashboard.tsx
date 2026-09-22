"use client";

import { useCallback, useEffect, useState } from "react";

type SalesPayload = {
  days: number;
  summary: {
    orders: number;
    cancelled: number;
    units: number;
    grossRevenue: number;
    knownFees: number;
    realizedProfit: number;
    profitReadyCount: number;
    awaitingCostCount: number;
    averageTicket: number;
  };
  topProducts: Array<{
    mlItemId: string;
    title: string;
    quantity: number;
    revenue: number;
  }>;
  orders: Array<{
    id: string;
    mlOrderId: string;
    status: string;
    dateCreated: string;
    totalAmount: number;
    marketplaceFeeTotal: number | null;
    shippingCost: number | null;
    profit: number | null;
    marginPercent: number | null;
    profitabilityStatus: string;
    items: Array<{
      id: string;
      mlItemId: string;
      title: string;
      sku: string | null;
      quantity: number;
      unitPrice: number;
      saleFee: number | null;
      unitCost: number | null;
    }>;
  }>;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function orderStatus(status: string) {
  if (status === "paid") return "Pago";
  if (status === "cancelled") return "Cancelado";
  if (status === "confirmed") return "Confirmado";
  return status;
}

function profitStatus(status: string) {
  if (status === "AWAITING_PRODUCT_COST") return "Aguardando custo do produto";
  if (status === "AWAITING_SHIPPING_COST") return "Aguardando frete realizado";
  return "Em processamento";
}

export function SalesDashboard() {
  const [data, setData] = useState<SalesPayload | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false, period = days) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ days: String(period) });
      if (refresh) params.set("refresh", "1");

      const response = await fetch(`/api/ml/sales?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao carregar vendas.");
      }

      setData(payload);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Falha ao carregar vendas.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    void load(false, days);
  }, [days, load]);

  return (
    <section className="module-section" id="vendas">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Profit Intelligence</p>
          <h2>O que realmente está deixando dinheiro?</h2>
        </div>
        <div className="module-heading-actions">
          <div className="period-switch">
            {[7, 30, 90].map((period) => (
              <button
                key={period}
                type="button"
                className={days === period ? "active" : ""}
                onClick={() => setDays(period)}
              >
                {period}d
              </button>
            ))}
          </div>
          <button
            type="button"
            className="secondary"
            disabled={refreshing}
            onClick={() => void load(true, days)}
          >
            {refreshing ? "Sincronizando..." : "Sincronizar vendas"}
          </button>
        </div>
      </div>

      {loading && <div className="module-loading">Carregando vendas...</div>}
      {error && <div className="error">{error}</div>}

      {data && (
        <>
          <div className="module-kpis sales-kpis">
            <article>
              <span>Faturamento</span>
              <strong>{money.format(data.summary.grossRevenue)}</strong>
              <small>{data.summary.orders} pedidos válidos</small>
            </article>
            <article>
              <span>Unidades</span>
              <strong>{data.summary.units}</strong>
              <small>ticket {money.format(data.summary.averageTicket)}</small>
            </article>
            <article>
              <span>Taxas identificadas</span>
              <strong>{money.format(data.summary.knownFees)}</strong>
              <small>quando presentes no pedido</small>
            </article>
            <article className={data.summary.awaitingCostCount > 0 ? "attention" : ""}>
              <span>Lucro realizado</span>
              <strong>
                {data.summary.profitReadyCount > 0
                  ? money.format(data.summary.realizedProfit)
                  : "Em preparação"}
              </strong>
              <small>
                {data.summary.awaitingCostCount > 0
                  ? `${data.summary.awaitingCostCount} pedido(s) aguardando custo/frete`
                  : "custos completos"}
              </small>
            </article>
          </div>

          {data.topProducts.length > 0 && (
            <div className="sales-top-products">
              <div className="module-subhead">
                <strong>Produtos que mais saíram</strong>
                <small>Por unidades no período selecionado</small>
              </div>
              <div className="top-product-grid">
                {data.topProducts.slice(0, 4).map((product, index) => (
                  <article key={product.mlItemId}>
                    <span>#{index + 1}</span>
                    <div>
                      <strong>{product.title}</strong>
                      <small>{product.mlItemId}</small>
                    </div>
                    <div className="top-product-number">
                      <strong>{product.quantity}</strong>
                      <small>{money.format(product.revenue)}</small>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          <div className="sales-order-list">
            <div className="module-subhead">
              <strong>Pedidos recentes</strong>
              <small>
                O Radar só chama de lucro real quando custo do produto, tarifa e
                frete realizado estiverem completos.
              </small>
            </div>

            {data.orders.length === 0 ? (
              <div className="module-empty">
                Nenhuma venda encontrada no período.
              </div>
            ) : (
              data.orders.slice(0, 30).map((order) => (
                <article className="sales-order-card" key={order.mlOrderId}>
                  <div className="order-main">
                    <div>
                      <div className="product-flags">
                        <span className={"status-chip " + order.status}>
                          {orderStatus(order.status)}
                        </span>
                        <span>
                          {new Date(order.dateCreated).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <strong>Pedido #{order.mlOrderId}</strong>
                      <small>
                        {order.items
                          .map(
                            (item) =>
                              `${item.quantity}× ${item.title}`,
                          )
                          .join(" · ")}
                      </small>
                    </div>
                    <div className="order-total">
                      <span>Venda</span>
                      <strong>{money.format(order.totalAmount)}</strong>
                    </div>
                  </div>

                  <div className="order-finance">
                    <div>
                      <span>Tarifas identificadas</span>
                      <strong>
                        {order.marketplaceFeeTotal == null
                          ? "—"
                          : money.format(order.marketplaceFeeTotal)}
                      </strong>
                    </div>
                    <div>
                      <span>Frete realizado</span>
                      <strong>
                        {order.shippingCost == null
                          ? "Aguardando"
                          : money.format(order.shippingCost)}
                      </strong>
                    </div>
                    <div>
                      <span>Lucro real</span>
                      <strong>
                        {order.profit == null
                          ? profitStatus(order.profitabilityStatus)
                          : money.format(order.profit)}
                      </strong>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
