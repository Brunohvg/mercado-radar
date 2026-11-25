"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

type Product = {
  mlItemId: string;
  title: string;
  supplier: string | null;
  supplierPrice: number | null;
  discountPercent: number;
  netUnitCost: number | null;
  availableQuantity: number;
  health: {
    unitsSold: number;
    inventoryCapital: number | null;
    decisionMarginPercent: number | null;
  };
};

type Payload = {
  products: Product[];
};

type SupplierGroup = {
  name: string;
  items: Product[];
  products: number;
  units: number;
  sold30d: number;
  inventoryCapital: number;
  averageCost: number | null;
  averageMargin: number | null;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function SuppliersDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ml/products", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao carregar fornecedores.");
      }
      setData(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Falha ao carregar fornecedores.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo<SupplierGroup[]>(() => {
    const map = new Map<
      string,
      {
        products: Product[];
      }
    >();

    for (const product of data?.products ?? []) {
      const name = product.supplier?.trim() || "Sem fornecedor";
      const current = map.get(name) ?? { products: [] };
      current.products.push(product);
      map.set(name, current);
    }

    return [...map.entries()]
      .map(([name, value]) => {
        const rows = value.products;
        const costs = rows
          .map((row) => row.netUnitCost)
          .filter((cost): cost is number => cost != null);
        const margins = rows
          .map((row) => row.health.decisionMarginPercent)
          .filter((margin): margin is number => margin != null);

        return {
          name,
          items: rows,
          products: rows.length,
          units: rows.reduce((sum, row) => sum + row.availableQuantity, 0),
          sold30d: rows.reduce((sum, row) => sum + row.health.unitsSold, 0),
          inventoryCapital: rows.reduce(
            (sum, row) => sum + Number(row.health.inventoryCapital ?? 0),
            0,
          ),
          averageCost: costs.length
            ? costs.reduce((sum, cost) => sum + cost, 0) / costs.length
            : null,
          averageMargin: margins.length
            ? margins.reduce((sum, margin) => sum + margin, 0) / margins.length
            : null,
        };
      })
      .sort((a, b) => b.inventoryCapital - a.inventoryCapital);
  }, [data]);

  const knownSuppliers = groups.filter((group) => group.name !== "Sem fornecedor");
  const missingSupplier = groups.find((group) => group.name === "Sem fornecedor");

  return (
    <section className="suppliers-page">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Operação</p>
          <h1>Fornecedores</h1>
          <p>Onde seu capital em estoque está concentrado e quais produtos ainda não têm fornecedor.</p>
        </div>
      </header>

      {loading && <div className="clean-loading">Carregando fornecedores...</div>}
      {error && <div className="error">{error}</div>}

      {data && (
        <>
          <section className="clean-kpi-grid">
            <article className="clean-kpi-card">
              <span>Fornecedores vinculados</span>
              <strong>{knownSuppliers.length}</strong>
              <small>na carteira atual</small>
            </article>
            <article className="clean-kpi-card">
              <span>Produtos sem fornecedor</span>
              <strong>{missingSupplier?.products ?? 0}</strong>
              <small>precisam completar cadastro</small>
            </article>
            <article className="clean-kpi-card">
              <span>Capital conhecido</span>
              <strong>
                {money.format(
                  groups.reduce((sum, group) => sum + group.inventoryCapital, 0),
                )}
              </strong>
              <small>estoque com custo cadastrado</small>
            </article>
            <article className="clean-kpi-card accent">
              <span>Produtos vinculados</span>
              <strong>
                {knownSuppliers.reduce((sum, group) => sum + group.products, 0)}
              </strong>
              <small>com origem de compra conhecida</small>
            </article>
          </section>

          <section className="clean-panel products-table-panel">
            <div className="products-table-toolbar">
              <div className="products-table-title">
                <strong>Carteira de fornecedores</strong>
                <span className="products-table-count">{groups.length}</span>
              </div>
              <span className="suppliers-toolbar-note">
                Ordenado por capital em estoque
              </span>
            </div>

            {groups.length === 0 ? (
              <div className="module-empty suppliers-empty">
                <strong>Nenhum produto sincronizado</strong>
                <span>
                  Quando os produtos do Mercado Livre forem importados, os fornecedores
                  aparecem aqui agrupados pelo cadastro de custo.
                </span>
              </div>
            ) : (
            <div className="clean-table-wrap">
              <table className="clean-table suppliers-table">
                <thead>
                  <tr>
                    <th>Fornecedor</th>
                    <th className="is-num">Produtos</th>
                    <th className="is-num">Estoque</th>
                    <th className="is-num">Vendas 30d</th>
                    <th className="is-num">Custo médio</th>
                    <th className="is-num">Margem média</th>
                    <th className="suppliers-capital-head">Capital em estoque</th>
                    <th><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <Fragment key={group.name}>
                    <tr
                      className={
                        group.name === "Sem fornecedor" ? "is-missing" : undefined
                      }
                    >
                      <td>
                        {group.name === "Sem fornecedor" ? (
                          <div className="supplier-cell">
                            <span className="table-status attention">Sem fornecedor</span>
                            <small className="table-subtext">
                              Vincule em Produtos para calcular custo e margem
                            </small>
                          </div>
                        ) : (
                          <div className="supplier-cell">
                            <span className="supplier-avatar" aria-hidden="true">
                              {group.name.charAt(0)}
                            </span>
                            <strong className="supplier-name">{group.name}</strong>
                          </div>
                        )}
                      </td>
                      <td className="is-num num">{group.products}</td>
                      <td className="is-num num">{group.units}</td>
                      <td className="is-num num">{group.sold30d}</td>
                      <td className="is-num num">
                        {group.averageCost == null
                          ? "—"
                          : money.format(group.averageCost)}
                      </td>
                      <td
                        className={
                          "is-num num" +
                          (group.averageMargin != null && group.averageMargin < 15
                            ? " danger-value"
                            : "")
                        }
                      >
                        {group.averageMargin == null
                          ? "—"
                          : `${group.averageMargin.toFixed(1)}%`}
                      </td>
                      <td className="suppliers-capital">
                        <strong className="num">
                          {money.format(group.inventoryCapital)}
                        </strong>
                        <span className="suppliers-share" aria-hidden="true">
                          <span
                            style={{
                              width: `${Math.round(
                                (group.inventoryCapital /
                                  Math.max(
                                    1,
                                    groups.reduce(
                                      (sum, item) => sum + item.inventoryCapital,
                                      0,
                                    ),
                                  )) *
                                  100,
                              )}%`,
                            }}
                          />
                        </span>
                      </td>
                      <td className="suppliers-actions">
                        <button
                          type="button"
                          className="inline-link-button"
                          aria-expanded={open === group.name}
                          onClick={() => setOpen(open === group.name ? null : group.name)}
                        >
                          {open === group.name ? "Fechar" : group.name === "Sem fornecedor" ? "Ver produtos" : "Ver e editar"}
                        </button>
                      </td>
                    </tr>
                    {open === group.name && (
                      <tr className="supplier-detail-row">
                        <td colSpan={8}>
                          {group.name !== "Sem fornecedor" && (
                            <SupplierEditor
                              name={group.name}
                              others={groups.filter((g) => g.name !== group.name && g.name !== "Sem fornecedor").map((g) => g.name)}
                              onDone={() => { setOpen(null); void load(); }}
                            />
                          )}
                          <ul className="supplier-products">
                            {group.items.map((item) => (
                              <li key={item.mlItemId}>
                                <span>
                                  <strong title={item.title}>{item.title}</strong>
                                  <small>{item.mlItemId} · estoque {item.availableQuantity} · vendeu {item.health.unitsSold} em 30 dias</small>
                                </span>
                                <span className="num">{item.netUnitCost == null ? "sem custo" : `${money.format(item.netUnitCost)}/un.`}</span>
                              </li>
                            ))}
                          </ul>
                          <p className="supplier-hint">
                            Para trocar o fornecedor ou o custo de um produto só, use <a href="/produtos">Produtos</a>.
                          </p>
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

function SupplierEditor({ name, others, onDone }: { name: string; others: string[]; onDone: () => void }) {
  const [value, setValue] = useState(name);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function send(to: string | null) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/ml/products/supplier", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: name, to }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) { setMessage(body?.error ?? "Não foi possível salvar."); return; }
    onDone();
  }

  const trimmed = value.trim();
  const merging = others.find((o) => o.toLowerCase() === trimmed.toLowerCase());
  return (
    <div className="supplier-editor">
      <label>
        <span>Nome do fornecedor</span>
        <input value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} list="supplier-names" />
        <datalist id="supplier-names">{others.map((o) => <option key={o} value={o} />)}</datalist>
      </label>
      <button
        type="button"
        className="vr-btn vr-btn--small"
        disabled={busy || !trimmed || trimmed === name}
        onClick={() => void send(merging ?? trimmed)}
      >
        {merging ? `Juntar com ${merging}` : "Renomear"}
      </button>
      {confirmUnlink ? (
        <span className="supplier-confirm">
          Tirar {name} de todos os produtos? O custo cadastrado continua.
          <button type="button" className="vr-btn vr-btn--small vr-btn--danger" disabled={busy} onClick={() => void send(null)}>
            Sim, excluir
          </button>
          <button type="button" className="vr-btn vr-btn--ghost vr-btn--small" onClick={() => setConfirmUnlink(false)}>Voltar</button>
        </span>
      ) : (
        <button type="button" className="vr-btn vr-btn--ghost vr-btn--small" onClick={() => setConfirmUnlink(true)}>
          Excluir fornecedor
        </button>
      )}
      {message && <p className="pilot-exec-error" role="alert">{message}</p>}
    </div>
  );
}
