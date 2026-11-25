"use client";

import { useEffect, useState } from "react";
import { orderMessage, type PurchaseOrder } from "@/lib/purchase-order";

type Payload = {
  orders: PurchaseOrder[];
  historyComplete: boolean;
  days: number;
  settings: { leadTimeDays: number; safetyDays: number; coverageDays: number };
  error?: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function PurchaseOrders() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/purchase-order", { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as Payload;
        if (!r.ok || !Array.isArray(body.orders)) throw new Error(body.error || "Não foi possível montar o pedido.");
        if (active) setData(body);
      })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Falha ao carregar."); });
    return () => { active = false; };
  }, []);

  return (
    <section className="po-page">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Operação</p>
          <h1>Pedido de compra</h1>
          <p>
            O que vai acabar antes da próxima entrega, separado por fornecedor, com a quantidade e o valor. Ajuste as
            quantidades e mande a mensagem pronta.
          </p>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {!data && !error && <div className="clean-loading">Calculando o que repor...</div>}

      {data && (
        <>
          <p className="po-rule">
            Regra: entra o produto cujo estoque não cobre o prazo de entrega ({data.settings.leadTimeDays} dias, ou o do
            fornecedor) mais {data.settings.safetyDays} dias de segurança. A quantidade cobre {data.settings.coverageDays}{" "}
            dias de vendas, pela média dos últimos {data.days} dias.{" "}
            <a href="/configuracoes">Mudar prazos</a>
            {!data.historyComplete && <b> Histórico de vendas incompleto: sincronize para não comprar de menos.</b>}
          </p>
          {!data.orders.length ? (
            <div className="clean-panel module-empty">
              <strong>Nada para repor agora</strong>
              <span>O estoque de todos os produtos que venderam cobre o prazo de entrega com folga.</span>
            </div>
          ) : (
            <div className="po-list">
              {data.orders.map((order) => <OrderCard key={order.name} order={order} />)}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function OrderCard({ order }: { order: PurchaseOrder }) {
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(order.lines.map((l) => [l.mlItemId, String(l.quantity)])));
  const [copied, setCopied] = useState(false);
  const lines = order.lines
    .map((l) => ({ ...l, quantity: Math.max(0, Math.floor(Number(qty[l.mlItemId]) || 0)) }))
    .filter((l) => l.quantity > 0);
  const total = lines.reduce((s, l) => s + (l.unitCost ?? 0) * l.quantity, 0);
  const missingCost = lines.some((l) => l.unitCost == null);
  const message = orderMessage(order, lines);
  const phone = order.contact?.phone?.replace(/\D/g, "");
  const valueGap = order.minOrderGap == null ? null : order.minOrderGap - (total - order.total);
  const unitsGap = order.minUnitsGap == null ? null : order.minUnitsGap - (lines.reduce((s, l) => s + l.quantity, 0) - order.units);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* sem permissão de área de transferência */ }
  }

  return (
    <article className={`clean-panel po-card${order.urgent ? " po-card--urgent" : ""}`}>
      <header className="po-card-head">
        <div>
          <h2>{order.name}</h2>
          <small>
            {order.registered
              ? [order.contact?.name, order.contact?.phone, order.leadTimeDays != null ? `entrega em ${order.leadTimeDays} dia(s)` : null].filter(Boolean).join(" · ") || "Cadastro sem contato"
              : order.name === "Sem fornecedor"
                ? "Produtos sem fornecedor vinculado"
                : "Fornecedor não cadastrado"}
          </small>
        </div>
        <div className="po-total">
          <span>Total {missingCost ? "conhecido" : ""}</span>
          <strong>{money.format(total)}</strong>
          <small>{lines.reduce((s, l) => s + l.quantity, 0)} un.</small>
        </div>
      </header>

      <div className="po-table-wrap">
        <table className="po-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th className="num">Estoque</th>
              <th className="num">Dura</th>
              <th className="num">Comprar</th>
              <th className="num">Custo un.</th>
              <th className="num">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => {
              const q = Math.max(0, Math.floor(Number(qty[l.mlItemId]) || 0));
              return (
                <tr key={l.mlItemId}>
                  <td>
                    <strong title={l.title}>{l.title}</strong>
                    <small>vende {l.dailyUnits.toLocaleString("pt-BR")} por dia</small>
                  </td>
                  <td className="num">{l.stock}</td>
                  <td className={`num ${l.urgent ? "danger-value" : ""}`}>{l.stockDays} dia(s)</td>
                  <td className="num">
                    <input
                      inputMode="numeric"
                      aria-label={`Quantidade de ${l.title}`}
                      value={qty[l.mlItemId] ?? ""}
                      onChange={(e) => setQty((v) => ({ ...v, [l.mlItemId]: e.target.value.replace(/\D/g, "") }))}
                    />
                  </td>
                  <td className="num">{l.unitCost == null ? <a href={`/produtos?item=${l.mlItemId}`}>informar</a> : money.format(l.unitCost)}</td>
                  <td className="num">{l.unitCost == null ? "—" : money.format(l.unitCost * q)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {((valueGap ?? 0) > 0 || (unitsGap ?? 0) > 0) && (
        <p className="po-warn">
          {(valueGap ?? 0) > 0 && `Faltam ${money.format(valueGap!)} para o pedido mínimo deste fornecedor. `}
          {(unitsGap ?? 0) > 0 && `Faltam ${unitsGap} un. para o mínimo de unidades.`}
        </p>
      )}

      <div className="po-actions">
        <button type="button" className="vr-btn vr-btn--small" disabled={!lines.length} onClick={() => void copy()}>
          {copied ? "Mensagem copiada" : "Copiar mensagem"}
        </button>
        {phone && phone.length >= 10 && (
          <a className="vr-btn vr-btn--ghost vr-btn--small" href={`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
            Abrir no WhatsApp
          </a>
        )}
        {order.contact?.email && (
          <a className="vr-btn vr-btn--ghost vr-btn--small" href={`mailto:${order.contact.email}?subject=${encodeURIComponent("Pedido de compra")}&body=${encodeURIComponent(message)}`}>
            Abrir e-mail
          </a>
        )}
        {!order.registered && order.name !== "Sem fornecedor" && <a href="/fornecedores">Cadastrar fornecedor</a>}
      </div>
      <details className="po-preview">
        <summary>Ver mensagem</summary>
        <pre>{message}</pre>
      </details>
    </article>
  );
}
