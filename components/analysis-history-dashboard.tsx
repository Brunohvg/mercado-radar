"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AnalysisRow = {
  id: string;
  productId: string | null;
  productName: string;
  sku: string | null;
  supplier: string | null;
  listingType: "CLASSIC" | "PREMIUM";
  kitQuantity: number;
  supplierPrice: number;
  discountPercent: number;
  unitCost: number;
  purchaseCost: number;
  salePrice: number;
  commissionPercent: number;
  commissionAmount: number;
  fixedFee: number;
  shippingCost: number;
  operatingCost: number;
  amountReceived: number;
  profit: number;
  marginPercent: number;
  roiPercent: number;
  targetMarginPercent: number;
  targetRoiPercent: number;
  minimumSuggestedPrice: number;
  verdict: "GOOD" | "TIGHT" | "BAD" | "KIT_ONLY" | "REPRICE";
  source: string;
  metadata: unknown;
  createdAt: string;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function verdictLabel(value: AnalysisRow["verdict"]) {
  if (value === "GOOD") return "Saudável";
  if (value === "TIGHT") return "Apertado";
  if (value === "KIT_ONLY") return "Só em kit";
  if (value === "REPRICE") return "Reprecificar";
  return "Ruim";
}

function verdictTone(value: AnalysisRow["verdict"]) {
  if (value === "GOOD") return "good";
  if (value === "TIGHT" || value === "KIT_ONLY" || value === "REPRICE") {
    return "attention";
  }
  return "bad";
}

export function AnalysisHistoryDashboard() {
  const [items, setItems] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"ALL" | "EXTENSION" | "MANUAL">("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/analyses?limit=250", {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Falha ao carregar histórico de análises.",
        );
      }

      setItems(payload.analyses ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Falha ao carregar histórico de análises.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    const response = await fetch(
      "/api/analyses?id=" + encodeURIComponent(id),
      { method: "DELETE" },
    );
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Falha ao excluir análise.");
      return;
    }

    setItems((current) => current.filter((item) => item.id !== id));
  }

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return items.filter((item) => {
      if (source !== "ALL" && item.source !== source) return false;
      if (!normalized) return true;

      return (
        item.productName.toLowerCase().includes(normalized) ||
        item.sku?.toLowerCase().includes(normalized) ||
        item.supplier?.toLowerCase().includes(normalized)
      );
    });
  }, [items, query, source]);

  const summary = useMemo(() => {
    const healthy = items.filter((item) => item.verdict === "GOOD").length;
    const fromExtension = items.filter(
      (item) => item.source === "EXTENSION",
    ).length;
    const averageMargin =
      items.length > 0
        ? items.reduce((sum, item) => sum + item.marginPercent, 0) /
          items.length
        : 0;
    const averageRoi =
      items.length > 0
        ? items.reduce((sum, item) => sum + item.roiPercent, 0) / items.length
        : 0;

    return {
      total: items.length,
      healthy,
      fromExtension,
      averageMargin,
      averageRoi,
    };
  }, [items]);

  return (
    <section className="analysis-history-page">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Inteligência</p>
          <h1>Histórico de análises</h1>
          <p>
            Compare simulações feitas no painel e na extensão sem recalcular
            tudo do zero.
          </p>
        </div>
        <div className="page-header-actions">
          <a className="primary" href="/analisar">
            Nova análise
          </a>
        </div>
      </header>

      {loading && (
        <div className="clean-loading">Carregando histórico...</div>
      )}
      {error && <div className="error">{error}</div>}

      {!loading && (
        <>
          <section className="clean-kpi-grid">
            <article className="clean-kpi-card">
              <span>Análises salvas</span>
              <strong>{summary.total}</strong>
              <small>{summary.fromExtension} vindas da extensão</small>
            </article>

            <article className="clean-kpi-card">
              <span>Saudáveis</span>
              <strong>{summary.healthy}</strong>
              <small>atingiram as metas da análise</small>
            </article>

            <article className="clean-kpi-card">
              <span>Margem média</span>
              <strong>{summary.averageMargin.toFixed(1)}%</strong>
              <small>entre simulações armazenadas</small>
            </article>

            <article className="clean-kpi-card accent">
              <span>ROI médio</span>
              <strong>{summary.averageRoi.toFixed(1)}%</strong>
              <small>histórico completo</small>
            </article>
          </section>

          <section className="clean-panel products-table-panel history-table-panel">
            <div className="products-table-toolbar history-toolbar">
              <div>
                <strong>Análises</strong>
                <span className="history-count">{visible.length}</span>
              </div>

              <div className="products-table-actions history-filters">
                <input
                  type="search"
                  aria-label="Buscar análises"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar produto, SKU ou fornecedor..."
                />

                <select
                  aria-label="Filtrar por origem"
                  value={source}
                  onChange={(event) =>
                    setSource(
                      event.target.value as "ALL" | "EXTENSION" | "MANUAL",
                    )
                  }
                >
                  <option value="ALL">Todas as origens</option>
                  <option value="EXTENSION">Extensão</option>
                  <option value="MANUAL">Painel</option>
                </select>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="module-empty history-empty">
                <strong>Nenhuma análise salva ainda</strong>
                <p>
                  Simule um produto na análise ou pela extensão e salve o
                  resultado para comparar aqui depois.
                </p>
                <a className="secondary inline" href="/analisar">
                  Abrir análise de produto
                </a>
              </div>
            ) : visible.length === 0 ? (
              <div className="module-empty history-empty">
                <strong>Nada encontrado</strong>
                <p>Nenhuma análise corresponde à busca ou à origem escolhida.</p>
              </div>
            ) : (
            <div className="clean-table-wrap">
              <table className="clean-table analysis-history-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Origem</th>
                    <th className="history-num">Kit</th>
                    <th className="history-num">Custo</th>
                    <th className="history-num">Preço</th>
                    <th className="history-num">Lucro</th>
                    <th className="history-num">Margem</th>
                    <th className="history-num">ROI</th>
                    <th className="history-num">Piso saudável</th>
                    <th>Status</th>
                    <th>Data</th>
                    <th>
                      <span className="history-sr">Ações</span>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id}>
                      <td className="history-product">
                        <strong className="history-product-name">
                          {item.productName}
                        </strong>
                        <small className="table-subtext">
                          {item.sku ?? "Sem SKU"}
                          {item.supplier ? " · " + item.supplier : ""}
                        </small>
                      </td>

                      <td>
                        <span className="neutral-chip">
                          {item.source === "EXTENSION"
                            ? "Extensão"
                            : "Painel"}
                        </span>
                      </td>

                      <td className="history-num">{item.kitQuantity}x</td>
                      <td className="history-num">
                        {money.format(item.purchaseCost)}
                      </td>
                      <td className="history-num">
                        {money.format(item.salePrice)}
                      </td>
                      <td className="history-num history-profit">
                        <span
                          className={
                            item.profit >= 0 ? "margin-good" : "margin-bad"
                          }
                        >
                          {money.format(item.profit)}
                        </span>
                      </td>
                      <td className="history-num">
                        {item.marginPercent.toFixed(1)}%
                      </td>
                      <td className="history-num">
                        {item.roiPercent.toFixed(1)}%
                      </td>
                      <td className="history-num">
                        {money.format(item.minimumSuggestedPrice)}
                      </td>

                      <td>
                        <span
                          className={
                            "table-status " + verdictTone(item.verdict)
                          }
                        >
                          {verdictLabel(item.verdict)}
                        </span>
                      </td>

                      <td className="history-date">
                        <span>
                          {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                        </span>
                        <small className="table-subtext">
                          {new Date(item.createdAt).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </small>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="history-delete-button"
                          onClick={() => void remove(item.id)}
                          title="Excluir análise"
                          aria-label={"Excluir análise de " + item.productName}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                          </svg>
                        </button>
                      </td>
                    </tr>
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
