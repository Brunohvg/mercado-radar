"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SalesPayload = {
  days: number;
  pagination: { page: number; pages: number; total: number };
  dataQuality: { reportComplete: boolean; syncedAt: string | null };
  summary: {
    orders: number;
    cancelled: number;
    units: number;
    grossRevenue: number;
    knownFees: number;
    feeReadyCount: number;
    freightReadyCount: number;
    realizedProfit: number;
    realizedMarginPercent: number | null;
    profitReadyCount: number;
    awaitingCostCount: number;
    averageTicket: number;
  };
  missingCosts?: Array<{ mlItemId: string; title: string; units: number; revenue: number }>;
  targetMarginPercent?: number;
  productRows?: Array<{
    mlItemId: string; title: string; units: number; revenue: number; profit: number | null;
    marginPercent: number | null; coveragePercent: number; unitsWithoutCost: number; unitCost: number | null;
    costSuggestion?: { supplierPrice: number; reason: string; fromMlItemId: string } | null;
  }>;
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
  if (status === "AWAITING_FEE") return "Aguardando tarifa realizada";
  if (status === "AWAITING_SETTINGS") return "Confirme impostos e operação";
  if (status === "NOT_SETTLED") return "Pagamento não concluído";
  if (status === "REFUND_REVIEW") return "Reembolso em revisão";
  if (status === "INVALID_DATA") return "Dados precisam de revisão";
  if (status === "REALIZED") return "Lucro realizado";
  return "Em processamento";
}

export function SalesDashboard() {
  const [data, setData] = useState<SalesPayload | null>(null);
  const [page, setPage] = useState(1);
  const run = useRef(0);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showAllOrders, setShowAllOrders] = useState(false);

  const load = useCallback(async (refresh = false, period = days) => {
    const current = ++run.current;
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ days: String(period), page: String(page) });
      if (refresh) params.set("refresh", "1");

      const response = await fetch(`/api/ml/sales?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao carregar vendas.");
      }

      if (current === run.current) setData(payload);
    } catch (caught) {
      if (current === run.current) setError(
        caught instanceof Error ? caught.message : "Falha ao carregar vendas.",
      );
    } finally {
      if (current === run.current) { setLoading(false); setRefreshing(false); }
    }
  }, [days, page]);

  useEffect(() => {
    void load(false, days);
  }, [days, load]);

  const productRows = data?.productRows ?? [];
  const noCostCount = productRows.filter((row) => row.unitCost == null && row.profit == null).length;
  const riskCount = productRows.filter((row) => row.profit != null && row.profit < 0).length;
  const lowMarginCount = productRows.filter((row) => row.profit != null && row.profit >= 0 && row.marginPercent != null && row.marginPercent < (data?.targetMarginPercent ?? 20)).length;
  const pendingCount = productRows.filter((row) => row.unitCost != null && row.profit == null).length;
  const attentionTitle = noCostCount > 0
    ? "Complete os custos para fechar o lucro"
    : riskCount > 0
      ? "Revise os produtos que estão dando prejuízo"
      : lowMarginCount > 0
        ? "Confira os produtos abaixo da sua meta"
        : pendingCount > 0
          ? "Há produtos aguardando conciliação"
          : "Sua margem calculada está dentro da meta";
  const attentionDetail = noCostCount > 0
    ? `${noCostCount} produto(s) sem custo informado`
    : riskCount > 0
      ? `${riskCount} produto(s) com resultado negativo`
      : lowMarginCount > 0
        ? `${lowMarginCount} produto(s) abaixo de ${data?.targetMarginPercent ?? 20}% de margem`
        : pendingCount > 0
          ? `${pendingCount} produto(s) ainda sem dados para conciliação completa`
          : "Os produtos conciliados estão acima da meta configurada";

  return (
    <section className="module-section sales-page" id="vendas">
      <header className="sales-header">
        <div className="sales-title-block">
          <p className="eyebrow">OPERAÇÃO / RESULTADO</p>
          <h2>Vendas e lucro</h2>
          <p>Acompanhe o que entrou, o que custou e quais produtos precisam da sua atenção.</p>
        </div>
        <div className="sales-controls">
          <div className="period-switch" role="group" aria-label="Período">
            {[7, 30, 90].map((period) => (
              <button
                key={period}
                type="button"
                className={days === period ? "active" : ""}
                aria-pressed={days === period}
                onClick={() => { setPage(1); setDays(period); }}
              >
                {period} dias
              </button>
            ))}
          </div>
          <button
            type="button"
            className="vr-btn vr-btn--ghost sales-sync-button"
            disabled={refreshing}
            onClick={() => void load(true, days)}
          >
            {refreshing ? "Sincronizando..." : "Atualizar dados"}
          </button>
        </div>
      </header>

      {loading && <div className="module-loading">Carregando vendas...</div>}
      {error && <div className="error">{error}</div>}

      {data && data.days === days && data.pagination.page === page && (
        <>
          {!data.dataQuality.reportComplete && (
            <div className="sales-data-notice" role="status">
              <span className="sales-notice-mark" aria-hidden="true">!</span>
              <div>
                <strong>Os dados deste período ainda não estão completos</strong>
                <p>Atualize as vendas para carregar o histórico mais recente antes de tomar decisões.</p>
              </div>
              <button type="button" className="sales-notice-action" disabled={refreshing} onClick={() => void load(true, days)}>
                {refreshing ? "Atualizando…" : "Atualizar agora"}
              </button>
            </div>
          )}

          <section className="sales-result-panel" aria-label="Resumo financeiro do período">
            <div className="sales-result-primary">
              <div className="sales-result-label">
                <span className="sales-live-dot" aria-hidden="true" />
                RESULTADO CONFIRMADO
              </div>
              <strong className="sales-result-value">
                {data.summary.profitReadyCount > 0 ? money.format(data.summary.realizedProfit) : "—"}
              </strong>
              <div className="sales-result-meta">
                <span>
                  {data.summary.realizedMarginPercent == null
                    ? "Ainda sem pedidos com custo completo"
                    : `${data.summary.realizedMarginPercent.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% de margem nos pedidos conciliados`}
                </span>
                <span className="sales-coverage-pill">
                  {data.summary.profitReadyCount} de {data.summary.orders} pedidos conciliados
                </span>
              </div>
              <p>O resultado só é exibido quando custo, tarifas, frete e configurações necessárias estão disponíveis.</p>
            </div>
            <div className="sales-result-breakdown">
              <div className="sales-breakdown-heading">
                <span>VISÃO DO PERÍODO</span>
                <span>{days} dias</span>
              </div>
              <div className="sales-breakdown-row">
                <div><span>Vendas</span><small>{data.summary.orders} pedidos pagos</small></div>
                <strong>{money.format(data.summary.grossRevenue)}</strong>
              </div>
              <div className="sales-breakdown-row">
                <div><span>Tarifas identificadas</span><small>{data.summary.feeReadyCount} de {data.summary.orders} pedidos conciliados</small></div>
                <strong>{data.summary.feeReadyCount > 0 ? money.format(data.summary.knownFees) : "Aguardando"}</strong>
              </div>
              <div className="sales-breakdown-row sales-breakdown-secondary">
                <div><span>Unidades vendidas</span><small>Ticket médio {money.format(data.summary.averageTicket)}</small></div>
                <strong>{data.summary.units}</strong>
              </div>
            </div>
          </section>

          {productRows.length > 0 && (
            <section className="sales-attention-strip" aria-label="Resumo de atenção por produto">
              <div className="sales-attention-copy">
                <span className="sales-attention-kicker">PRÓXIMA AÇÃO</span>
                <strong>{attentionTitle}</strong>
                <small>{attentionDetail}</small>
              </div>
              <div className="sales-attention-stats" aria-label="Produtos por situação">
                {noCostCount > 0 && <span className="attention-stat is-pending"><b>{noCostCount}</b> sem custo</span>}
                {riskCount > 0 && <span className="attention-stat is-risk"><b>{riskCount}</b> prejuízo</span>}
                {lowMarginCount > 0 && <span className="attention-stat is-warn"><b>{lowMarginCount}</b> margem baixa</span>}
                {pendingCount > 0 && <span className="attention-stat"><b>{pendingCount}</b> aguardando</span>}
                {noCostCount > 0 ? (
                  <a className="vr-btn vr-btn--small sales-attention-button" href="/vendas?filtro=sem-custo#product-table-title">Revisar custos <span aria-hidden="true">→</span></a>
                ) : (
                  <a className="sales-attention-link" href="#product-table-title">Ver produtos <span aria-hidden="true">→</span></a>
                )}
              </div>
            </section>
          )}

          {data.productRows && (
            <ProductTable rows={data.productRows} targetMargin={data.targetMarginPercent ?? 20} onSaved={() => void load(false, days)} />
          )}

          <details className="clean-panel sales-order-list sales-orders-details">
            <summary className="module-subhead">
              <span className="sales-orders-summary-icon" aria-hidden="true">↳</span>
              <span className="sales-orders-summary-copy"><strong>Conferir pedidos individualmente</strong><small>{data.summary.orders} pedidos neste período · tarifas, frete e resultado por pedido</small></span>
              <span className="sales-orders-summary-count">{data.summary.orders}<span aria-hidden="true">⌄</span></span>
            </summary>

            {data.orders.length === 0 ? (
              <div className="module-empty">
                Nenhuma venda encontrada no período.
              </div>
            ) : (
              data.orders
                .slice(0, showAllOrders ? data.orders.length : 8)
                .map((order) => (
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
                      <strong
                        className={order.shippingCost == null ? "is-pending" : undefined}
                      >
                        {order.shippingCost == null
                          ? "Aguardando"
                          : money.format(order.shippingCost)}
                      </strong>
                    </div>
                    <div>
                      <span>Lucro real</span>
                      <strong
                        className={
                          order.profit == null
                            ? "is-pending"
                            : order.profit < 0
                              ? "danger-value"
                              : "good-value"
                        }
                      >
                        {order.profit == null
                          ? profitStatus(order.profitabilityStatus)
                          : money.format(order.profit)}
                      </strong>
                    </div>
                  </div>
                </article>
              ))
            )}

            {data.orders.length > 8 && (
              <button
                type="button"
                className="secondary sales-more-button"
                onClick={() => setShowAllOrders((current) => !current)}
              >
                {showAllOrders
                  ? "Mostrar menos pedidos"
                  : `Mostrar mais ${data.orders.length - 8} pedido(s)`}
              </button>
            )}
          </details>
          <div className="sales-footer-tools">
            <div className="sales-pagination">
              <button className="vr-btn vr-btn--ghost vr-btn--small" disabled={loading || page <= 1} onClick={() => { setShowAllOrders(false); setPage((p) => p - 1); }}>Anterior</button>
              <span>Página <strong>{page}</strong> de {Math.max(1, data.pagination.pages)} <i>·</i> {data.pagination.total} pedidos importados</span>
              <button className="vr-btn vr-btn--ghost vr-btn--small" disabled={loading || page >= data.pagination.pages} onClick={() => { setShowAllOrders(false); setPage((p) => p + 1); }}>Próxima</button>
            </div>
            <a className="sales-export-link" href={`/api/ml/sales/export?days=${days}`}><span aria-hidden="true">↓</span> Exportar CSV do período</a>
          </div>
        </>
      )}
    </section>
  );
}

type ProductRow = NonNullable<SalesPayload["productRows"]>[number];
type RowStatus = "GOOD" | "LOW" | "LOSS" | "NO_COST" | "PENDING";

const STATUS: Record<RowStatus, { label: string; tone: string }> = {
  GOOD: { label: "Com margem", tone: "good" },
  LOW: { label: "Margem baixa", tone: "warn" },
  LOSS: { label: "Prejuízo", tone: "risk" },
  NO_COST: { label: "Sem custo", tone: "muted" },
  PENDING: { label: "Aguardando frete", tone: "info" },
};

function rowStatus(row: ProductRow, targetMargin: number): RowStatus {
  if (row.unitCost == null && row.profit == null) return "NO_COST";
  if (row.profit == null || row.marginPercent == null) return "PENDING";
  if (row.profit < 0) return "LOSS";
  if (row.marginPercent < targetMargin) return "LOW";
  return "GOOD";
}

function ProductTable({
  rows,
  targetMargin,
  onSaved,
}: {
  rows: ProductRow[];
  targetMargin: number;
  onSaved: () => void;
}) {
  const [filter, setFilter] = useState<RowStatus | "ALL">("ALL");
  // Atalho do Início: /vendas?filtro=sem-custo abre já nos produtos sem custo.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("filtro") === "sem-custo") setFilter("NO_COST");
  }, []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const batch = useRef(false);

  const withStatus = rows.map((row) => ({ row, status: rowStatus(row, targetMargin) }));
  const counts = withStatus.reduce<Record<string, number>>((acc, { status }) => {
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
  const visible = filter === "ALL" ? withStatus : withStatus.filter((r) => r.status === filter);
  const order: RowStatus[] = ["GOOD", "LOW", "LOSS", "NO_COST", "PENDING"];

  async function saveCost(row: ProductRow, override?: number) {
    const value = override ?? Number((values[row.mlItemId] ?? "").replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setMessages((m) => ({ ...m, [row.mlItemId]: "Informe o custo por unidade." }));
      return;
    }
    setSaving(row.mlItemId);
    const response = await fetch("/api/ml/products/cost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mlItemId: row.mlItemId, supplierPrice: value }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setSaving(null);
    if (!response?.ok) {
      setMessages((m) => ({ ...m, [row.mlItemId]: body?.error ?? "Não salvou." }));
      return;
    }
    setMessages((m) => ({ ...m, [row.mlItemId]: `Salvo. ${Number(body?.ordersRecalculated ?? 0)} pedido(s) recalculado(s).` }));
    if (!batch.current) onSaved();
  }

  const suggested = rows.filter((r) => r.unitCost == null && r.costSuggestion);
  async function applyAll() {
    batch.current = true;
    for (const row of suggested) await saveCost(row, row.costSuggestion!.supplierPrice);
    batch.current = false;
    onSaved();
  }

  if (!rows.length) return null;
  return (
    <section className="clean-panel product-table" aria-labelledby="product-table-title">
      <header className="product-table-head">
        <div>
          <h3 id="product-table-title">Produtos vendidos no período</h3>
          <p>Do que mais faturou para o que menos. Margem boa é a partir de {targetMargin}% (sua meta em Configurações).</p>
          {suggested.length > 0 && (
            <p className="product-suggest-all">
              {suggested.length} produto(s) sem custo são kit, pacote ou cor de outro que já tem custo.{" "}
              <button type="button" className="vr-btn vr-btn--small" disabled={saving != null} onClick={() => void applyAll()}>
                Usar os custos sugeridos
              </button>
            </p>
          )}
        </div>
        <div className="product-table-filters" role="group" aria-label="Filtrar produtos">
          <button type="button" aria-pressed={filter === "ALL"} onClick={() => setFilter("ALL")}>
            Todos <b>{rows.length}</b>
          </button>
          {order.filter((s) => counts[s]).map((s) => (
            <button
              key={s}
              type="button"
              className={`tone-${STATUS[s].tone}`}
              aria-pressed={filter === s}
              onClick={() => setFilter(filter === s ? "ALL" : s)}
            >
              {STATUS[s].label} <b>{counts[s]}</b>
            </button>
          ))}
        </div>
      </header>

      <div className="product-table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Produto</th>
              <th scope="col" className="num">Vendidas</th>
              <th scope="col" className="num">Faturamento</th>
              <th scope="col" className="num">Lucro</th>
              <th scope="col" className="num">Margem</th>
              <th scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ row, status }) => (
              <tr key={row.mlItemId} className={`row-${STATUS[status].tone}`}>
                <td className="product-cell">
                  <strong title={row.title}>{row.title}</strong>
                  <small>
                    {row.mlItemId}
                    {row.unitCost != null && ` · custo ${money.format(row.unitCost)}/un.`}
                    {row.profit != null && row.coveragePercent < 100 && ` · lucro em ${Math.round(row.coveragePercent)}% das vendas`}
                  </small>
                </td>
                <td className="num">{row.units}</td>
                <td className="num">{money.format(row.revenue)}</td>
                <td className={`num ${row.profit == null ? "is-pending" : row.profit < 0 ? "danger-value" : "good-value"}`}>
                  {row.profit == null ? "—" : money.format(row.profit)}
                </td>
                <td className="num">{row.marginPercent == null ? "—" : `${row.marginPercent.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}</td>
                <td>
                  <span className={`product-status tone-${STATUS[status].tone}`}>{STATUS[status].label}</span>
                  {status === "NO_COST" && row.costSuggestion && (
                    <div className="product-suggest">
                      <small>{row.costSuggestion.reason}</small>
                      <button
                        type="button"
                        className="vr-btn vr-btn--small"
                        disabled={saving === row.mlItemId}
                        onClick={() => void saveCost(row, row.costSuggestion!.supplierPrice)}
                      >
                        Usar {money.format(row.costSuggestion.supplierPrice)}
                      </button>
                    </div>
                  )}
                  {status === "NO_COST" && (
                    <form
                      className="product-cost-form"
                      onSubmit={(e) => { e.preventDefault(); void saveCost(row); }}
                    >
                      <input
                        inputMode="decimal"
                        placeholder="Custo R$/un."
                        aria-label={`Custo por unidade de ${row.title}`}
                        value={values[row.mlItemId] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [row.mlItemId]: e.target.value }))}
                      />
                      <button type="submit" className="vr-btn vr-btn--small" disabled={saving === row.mlItemId}>
                        {saving === row.mlItemId ? "..." : "Salvar"}
                      </button>
                    </form>
                  )}
                  {messages[row.mlItemId] && <small className="product-cost-msg" role="status">{messages[row.mlItemId]}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
