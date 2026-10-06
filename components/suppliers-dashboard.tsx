"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
    <section>
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Operação · Fornecedores</p>
          <h1>Fornecedores</h1>
          <p>Veja onde seu capital está concentrado e quais produtos ainda estão sem fornecedor vinculado.</p>
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
              <div>
                <strong>Carteira de fornecedores</strong>
                <span>{groups.length}</span>
              </div>
            </div>

            <div className="clean-table-wrap">
              <table className="clean-table suppliers-table">
                <thead>
                  <tr>
                    <th>Fornecedor</th>
                    <th>Produtos</th>
                    <th>Estoque</th>
                    <th>Vendas 30d</th>
                    <th>Custo médio</th>
                    <th>Margem média</th>
                    <th>Capital em estoque</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.name}>
                      <td>
                        <strong className="supplier-name">{group.name}</strong>
                      </td>
                      <td>{group.products}</td>
                      <td>{group.units}</td>
                      <td>{group.sold30d}</td>
                      <td>
                        {group.averageCost == null
                          ? "—"
                          : money.format(group.averageCost)}
                      </td>
                      <td>
                        {group.averageMargin == null
                          ? "—"
                          : `${group.averageMargin.toFixed(1)}%`}
                      </td>
                      <td>{money.format(group.inventoryCapital)}</td>
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
