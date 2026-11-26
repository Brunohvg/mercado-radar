"use client";

import { ChangeEvent, useMemo, useState } from "react";

type BatchResult = {
  code: string;
  status: "FOUND" | "NOT_FOUND" | "INVALID";
  reason: string | null;
  primary: {
    id: string;
    name: string;
    domainId: string | null;
    picture: string | null;
  } | null;
  market: {
    listings: number;
    minimum: number | null;
    median: number | null;
    maximum: number | null;
    freeShippingCount: number;
  } | null;
  sources?: {
    catalogUnavailable?: boolean;
    marketplaceUnavailable?: boolean;
  };
};

type BatchPayload = {
  total: number;
  found: number;
  invalid: number;
  notFound: number;
  results: BatchResult[];
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function parseCodes(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,;\t]+/)
        .map((part) => part.replace(/\D/g, ""))
        .filter(Boolean),
    ),
  ].slice(0, 50);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return '"' + text.replaceAll('"', '""') + '"';
}

export function EanBatchDashboard() {
  const [input, setInput] = useState("");
  const [data, setData] = useState<BatchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const codes = useMemo(() => parseCodes(input), [input]);

  async function run() {
    if (!codes.length) {
      setError("Cole pelo menos um EAN/GTIN.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ml/ean-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Falha na pesquisa em lote.");
      }

      setData(payload);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Falha na pesquisa em lote.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setInput((current) => (current ? current + "\n" + text : text));
    event.target.value = "";
  }

  function exportCsv() {
    if (!data?.results.length) return;

    const rows = [
      [
        "EAN/GTIN",
        "Status",
        "Produto",
        "ID",
        "Domínio",
        "Anúncios encontrados",
        "Menor preço",
        "Mediana",
        "Maior preço",
        "Frete grátis",
      ],
      ...data.results.map((item) => [
        item.code,
        item.status,
        item.primary?.name ?? item.reason ?? "",
        item.primary?.id ?? "",
        item.primary?.domainId ?? "",
        item.market?.listings ?? 0,
        item.market?.minimum ?? "",
        item.market?.median ?? "",
        item.market?.maximum ?? "",
        item.market?.freeShippingCount ?? 0,
      ]),
    ];

    const csv =
      "\uFEFF" +
      rows.map((row) => row.map(csvCell).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      "mercado-radar-ean-" + new Date().toISOString().slice(0, 10) + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="ean-batch-page">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Inteligência</p>
          <h1>EAN em lote</h1>
          <p>
            Cole a lista do fornecedor e veja quais códigos existem no catálogo
            e no mercado antes de cadastrar qualquer produto.
          </p>
        </div>
      </header>

      <section className="ean-workspace">
        <article className="clean-panel ean-input-panel">
          <div className="clean-panel-head">
            <div>
              <span>Lista de códigos</span>
              <strong>Até 50 EAN/GTIN por pesquisa</strong>
            </div>
            <span className="neutral-chip ean-counter">{codes.length}/50</span>
          </div>

          <textarea
            aria-label="Códigos EAN/GTIN"
            spellCheck={false}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              "Um código por linha, separados por vírgula ou colados direto da planilha"
            }
          />

          <div className="ean-input-actions">
            <label className="clean-secondary ean-file-button">
              Importar CSV/TXT
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={(event) => void readFile(event)}
              />
            </label>

            <button
              type="button"
              className="primary"
              disabled={loading || codes.length === 0}
              onClick={() => void run()}
            >
              {loading ? "Pesquisando..." : "Pesquisar no Mercado Livre"}
            </button>
          </div>

          <p className="ean-helper">
            O dígito verificador é validado antes da consulta: número só
            parecido com EAN não conta como produto válido.
          </p>
        </article>

        <article className="clean-panel ean-summary-panel">
          <div className="clean-panel-head">
            <div>
              <span>Resumo</span>
              <strong>Triagem da lista</strong>
            </div>
          </div>

          <div className="clean-mini-grid ean-summary-grid">
            <div>
              <span>Processados</span>
              <strong>{data?.total ?? 0}</strong>
              <small>códigos únicos</small>
            </div>
            <div className="ean-stat-found">
              <span>Encontrados</span>
              <strong>{data?.found ?? 0}</strong>
              <small>catálogo ou mercado</small>
            </div>
            <div className="ean-stat-missing">
              <span>Não encontrados</span>
              <strong>{data?.notFound ?? 0}</strong>
              <small>válidos, sem correspondência</small>
            </div>
            <div className="ean-stat-invalid">
              <span>Inválidos</span>
              <strong>{data?.invalid ?? 0}</strong>
              <small>dígito ou tamanho incorreto</small>
            </div>
          </div>
        </article>
      </section>

      {error && <div className="error">{error}</div>}

      {data && (
        <section className="clean-panel products-table-panel ean-results-panel">
          <div className="products-table-toolbar ean-toolbar">
            <div>
              <strong>Resultados</strong>
              <span className="ean-count">{data.results.length}</span>
            </div>
            <button
              type="button"
              className="clean-secondary"
              onClick={exportCsv}
            >
              Exportar CSV
            </button>
          </div>

          <div className="clean-table-wrap">
            <table className="clean-table ean-results-table">
              <thead>
                <tr>
                  <th>EAN/GTIN</th>
                  <th>Status</th>
                  <th>Produto encontrado</th>
                  <th className="ean-num">Anúncios</th>
                  <th className="ean-num">Menor preço</th>
                  <th className="ean-num">Mediana</th>
                  <th className="ean-num">Faixa</th>
                  <th className="ean-num">Frete grátis</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((item) => (
                  <tr
                    key={item.code}
                    className={"ean-row-" + item.status.toLowerCase()}
                  >
                    <td>
                      <strong className="ean-code">{item.code}</strong>
                    </td>
                    <td>
                      <span
                        className={
                          "table-status ean-status " +
                          item.status.toLowerCase() +
                          (item.status === "FOUND"
                            ? " good"
                            : item.status === "INVALID"
                              ? " bad"
                              : " neutral")
                        }
                      >
                        {item.status === "FOUND"
                          ? "Encontrado"
                          : item.status === "INVALID"
                            ? "Inválido"
                            : "Não encontrado"}
                      </span>
                    </td>
                    <td>
                      {item.primary ? (
                        <div className="clean-product-cell ean-product-cell">
                          {item.primary.picture ? (
                            <img src={item.primary.picture} alt="" loading="lazy" />
                          ) : (
                            <span className="clean-product-thumb">EAN</span>
                          )}
                          <div>
                            <strong>{item.primary.name}</strong>
                            <small>
                              {item.primary.id}
                              {item.primary.domainId
                                ? " · " + item.primary.domainId
                                : ""}
                            </small>
                          </div>
                        </div>
                      ) : (
                        <span className="table-muted">{item.reason ?? "—"}</span>
                      )}
                    </td>
                    <td className="ean-num">{item.market?.listings ?? 0}</td>
                    <td className="ean-num">
                      {item.market?.minimum == null
                        ? "—"
                        : money.format(item.market.minimum)}
                    </td>
                    <td className="ean-num ean-median">
                      {item.market?.median == null
                        ? "—"
                        : money.format(item.market.median)}
                    </td>
                    <td className="ean-num ean-range">
                      {item.market?.minimum == null ||
                      item.market?.maximum == null
                        ? "—"
                        : money.format(item.market.minimum) +
                          " – " +
                          money.format(item.market.maximum)}
                    </td>
                    <td className="ean-num">
                      {item.market?.freeShippingCount ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
