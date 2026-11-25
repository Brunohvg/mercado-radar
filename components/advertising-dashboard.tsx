"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdsMarginResult } from "@/lib/ads-margin";

type Campaign = {
  id: string | null;
  name: string;
  status: string;
  budget: number | null;
  roasTarget: number | null;
  metrics: {
    cost: number;
    roas: number;
    acos: number;
    clicks: number;
    prints: number;
    ctr: number;
    cvr: number;
    totalAmount: number;
    units: number;
  };
};

type AdGroup = {
  id: string | null;
  externalId: string | null;
  campaignId: string | null;
  status: string;
  title: string | null;
  catalogListing: boolean | null;
  product: {
    mlItemId: string;
    userProductId: string | null;
    title: string;
    thumbnail: string | null;
  } | null;
  metrics: {
    cost: number;
    roas: number;
    tacos: number;
    clicks: number;
    prints: number;
    totalAmount: number;
    units: number;
    organicUnits: number;
  };
  profit: {
    realizedProfitBeforeAds: number | null;
    realizedProfitAfterAds: number | null;
    realizedMarginAfterAds: number | null;
    profitCoveragePercent: number;
  };
  recommendation: {
    action: "SCALE" | "HOLD" | "REDUCE" | "PAUSE_REVIEW" | "LEARN";
    confidence: "LOW" | "MEDIUM" | "HIGH";
    label: string;
    reason: string;
  };
  margin: AdsMarginResult;
};

type Payload = {
  enabled: boolean;
  days: number;
  dateFrom?: string;
  dateTo?: string;
  message?: string;
  error?: string;
  advertiser?: {
    advertiserId: string;
    siteId: string;
    advertiserName: string | null;
    accountName: string | null;
  };
  summary?: {
    clicks: number;
    prints: number;
    ctr: number;
    cost: number;
    cpc: number;
    acos: number;
    tacos: number;
    cvr: number;
    roas: number;
    sov: number;
    direct_amount: number;
    indirect_amount: number;
    total_amount: number;
    direct_units_quantity: number;
    indirect_units_quantity: number;
    units_quantity: number;
    advertising_items_quantity: number;
    organic_units_quantity: number;
    organic_units_amount: number;
    organic_items_quantity: number;
    impression_share: number;
    top_impression_share: number;
    lost_impression_share_by_budget: number;
    lost_impression_share_by_ad_rank: number;
    acos_benchmark: number;
    realizedProfitBeforeAds: number;
    realizedProfitAfterAds: number | null;
    realizedMarginAfterAds: number | null;
    profitCoveragePercent: number;
    profitReadyOrders: number;
    totalOrders: number;
    recommendation: {
      action: "SCALE" | "HOLD" | "REDUCE" | "PAUSE_REVIEW" | "LEARN";
      confidence: "LOW" | "MEDIUM" | "HIGH";
      label: string;
      reason: string;
    };
  };
  campaigns?: Campaign[];
  adGroups?: AdGroup[];
  freshness?: {
    metricsWindowMaxDays: number;
    note: string;
  };
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const integer = new Intl.NumberFormat("pt-BR");

function pct(value: number | null | undefined) {
  return value == null
    ? "—"
    : Number(value).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + "%";
}

const RANK: Record<AdsMarginResult["verdict"], number> = {
  COME_LUCRO: 0,
  SEM_VENDA: 1,
  VENDA_ADS_NO_PREJUIZO: 2,
  SEM_CUSTO: 3,
  PAGA: 4,
  PODE_INVESTIR: 5,
};

function statusLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "active") return "Ativa";
  if (normalized === "paused") return "Pausada";
  return value;
}

export function AdvertisingDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"todos" | "problema" | "ok">("todos");

  const load = useCallback(
    async (refresh = false) => {
      refresh ? setRefreshing(true) : setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/ml/ads?days=" + days, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Falha ao carregar publicidade.");
        setData(payload);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Falha ao carregar publicidade.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [days],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const summary = data?.summary;
  const campaigns = data?.campaigns ?? [];
  const groups = useMemo(
    () =>
      [...(data?.adGroups ?? [])]
        .filter((g) => g.metrics.cost > 0)
        .sort((a, b) => RANK[a.margin.verdict] - RANK[b.margin.verdict] || b.metrics.cost - a.metrics.cost),
    [data],
  );
  const problems = groups.filter((g) => g.margin.tone === "risk" || g.margin.tone === "warn");
  const wasted = problems.reduce((s, g) => s + g.metrics.cost, 0);
  const shown = groups.filter((g) =>
    filter === "todos" ? true : filter === "problema" ? g.margin.tone === "risk" || g.margin.tone === "warn" : g.margin.tone === "good",
  );

  return (
    <section className="ads-page">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Operação</p>
          <h1>Publicidade x margem</h1>
          <p>Quanto cada anúncio patrocinado gasta perto do lucro que o produto deixa. Primeiro os que comem a sua margem.</p>
        </div>
        <div className="page-header-actions">
          <select className="clean-select" aria-label="Período" value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
          <button type="button" className="clean-secondary" disabled={refreshing} onClick={() => void load(true)}>
            {refreshing ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </header>

      {loading && <div className="clean-loading">Lendo seus anúncios patrocinados...</div>}
      {error && <div className="error">{error}</div>}

      {!loading && data && !data.enabled && (
        <section className="clean-panel module-empty">
          <strong>Mercado Ads não está ativo nesta conta</strong>
          <span>
            {data.error ?? data.message ?? "A conta não retornou um anunciante do Mercado Ads."} Quando você patrocinar
            anúncios, o Radar mostra aqui se eles cabem na margem.
          </span>
        </section>
      )}

      {!loading && data?.enabled && summary && (
        <>
          <section className="clean-kpi-grid ads-kpis">
            <article className="clean-kpi-card">
              <span>Gasto com anúncios</span>
              <strong>{money.format(summary.cost)}</strong>
              <small>nos últimos {data.days} dias</small>
            </article>
            <article className="clean-kpi-card">
              <span>Vendas pelos anúncios</span>
              <strong>{money.format(summary.total_amount)}</strong>
              <small>
                {integer.format(summary.units_quantity)} un. · ACOS {pct(summary.acos)}
              </small>
            </article>
            <article className="clean-kpi-card accent">
              <span>Lucro depois dos anúncios</span>
              <strong className={summary.realizedProfitAfterAds != null && summary.realizedProfitAfterAds < 0 ? "danger-value" : ""}>
                {summary.realizedProfitAfterAds == null ? "—" : money.format(summary.realizedProfitAfterAds)}
              </strong>
              <small>
                {summary.realizedProfitAfterAds == null
                  ? "informe os custos em Vendas"
                  : `era ${money.format(summary.realizedProfitBeforeAds)} antes · margem ${pct(summary.realizedMarginAfterAds)}`}
              </small>
            </article>
            <article className={"clean-kpi-card" + (problems.length ? " ads-kpi-risk" : "")}>
              <span>Comendo a margem</span>
              <strong>{problems.length}</strong>
              <small>{problems.length ? `${money.format(wasted)} gastos neles` : "nenhum anúncio"}</small>
            </article>
          </section>

          {summary.profitCoveragePercent < 70 && summary.cost > 0 && (
            <p className="ads-note">
              Só {pct(summary.profitCoveragePercent)} dos pedidos têm custo informado. <a href="/vendas">Complete os custos</a> para
              o lucro depois dos anúncios valer para a conta toda.
            </p>
          )}

          <section className="clean-panel ads-margin-panel">
            <div className="ads-margin-head">
              <strong>Anúncios patrocinados</strong>
              <div className="ads-chips" role="group" aria-label="Filtrar">
                {([
                  ["todos", `Todos (${groups.length})`],
                  ["problema", `Comendo a margem (${problems.length})`],
                  ["ok", `Se pagam (${groups.filter((g) => g.margin.tone === "good").length})`],
                ] as const).map(([key, label]) => (
                  <button key={key} type="button" className={"ads-chip" + (filter === key ? " is-active" : "")} onClick={() => setFilter(key)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {!shown.length ? (
              <div className="module-empty">
                {groups.length ? "Nada neste filtro." : "Nenhum anúncio com gasto no período."}
              </div>
            ) : (
              <ul className="ads-margin-list">
                {shown.map((g, index) => {
                  const m = g.margin;
                  const title = g.product?.title ?? g.title ?? g.externalId ?? "Anúncio";
                  const over = m.acos != null && m.breakEvenAcos != null && m.acos > m.breakEvenAcos;
                  return (
                    <li key={g.id ?? g.externalId ?? String(index)} className={"ads-margin-row tone-" + m.tone}>
                      <div className="ads-margin-product">
                        {g.product?.thumbnail ? <img src={g.product.thumbnail} alt="" /> : <span className="clean-product-thumb">AD</span>}
                        <div>
                          <span className={"ads-verdict tone-" + m.tone}>{m.label}</span>
                          <strong title={title}>{title}</strong>
                          <p>{m.reason}</p>
                        </div>
                      </div>
                      <dl className="ads-margin-numbers">
                        <div>
                          <dt>Gasto</dt>
                          <dd>{money.format(g.metrics.cost)}</dd>
                        </div>
                        <div>
                          <dt>Vendeu pelo anúncio</dt>
                          <dd>
                            {money.format(g.metrics.totalAmount)}
                            <small>{integer.format(g.metrics.units)} un.</small>
                          </dd>
                        </div>
                        <div>
                          <dt>ACOS / limite</dt>
                          <dd className={over ? "danger-value" : ""}>
                            {pct(m.acos)} <small>/ {pct(m.breakEvenAcos)}</small>
                          </dd>
                        </div>
                        <div>
                          <dt>Lucro depois</dt>
                          <dd className={m.profitAfterAds == null ? "" : m.profitAfterAds < 0 ? "danger-value" : "good-value"}>
                            {m.profitAfterAds == null ? "—" : money.format(m.profitAfterAds)}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {!!campaigns.length && (
            <details className="clean-panel ads-campaigns-details">
              <summary>Campanhas ({campaigns.length})</summary>
              <div className="clean-table-wrap">
                <table className="clean-table ads-table">
                  <thead>
                    <tr>
                      <th>Campanha</th>
                      <th>Status</th>
                      <th>Orçamento/dia</th>
                      <th>Gasto</th>
                      <th>Vendas</th>
                      <th>ACOS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c, index) => (
                      <tr key={c.id ?? c.name + "-" + String(index)}>
                        <td><strong>{c.name}</strong></td>
                        <td>{statusLabel(c.status)}</td>
                        <td>{c.budget == null ? "—" : money.format(c.budget)}</td>
                        <td>{money.format(c.metrics.cost)}</td>
                        <td>{money.format(c.metrics.totalAmount)}</td>
                        <td>{pct(c.metrics.acos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <p className="pilot-foot">
            Limite de ACOS é a margem do produto antes dos anúncios: acima dele, cada venda que vem do anúncio dá prejuízo.
            Lucro vem dos seus pedidos com custo informado. Orçamento e pausa você muda no{" "}
            <a href="https://ads.mercadolivre.com.br/" target="_blank" rel="noreferrer">Mercado Ads</a>.{" "}
            {data.freshness?.note}
          </p>
        </>
      )}
    </section>
  );
}
