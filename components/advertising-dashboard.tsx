"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
    realizedProfitAfterAds: number;
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

function metric(value: number | null | undefined, digits = 2) {
  return value == null
    ? "—"
    : Number(value).toLocaleString("pt-BR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
}

function statusLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "active") return "Ativa";
  if (normalized === "paused") return "Pausada";
  return value;
}

const confidenceLabel: Record<string, string> = {
  LOW: "baixa",
  MEDIUM: "média",
  HIGH: "alta",
};

const toneLabel: Record<string, string> = {
  good: "Saudável",
  attention: "Atenção",
  bad: "Crítico",
  neutral: "Sem dados",
};

export function AdvertisingDashboard() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (refresh = false) => {
      refresh ? setRefreshing(true) : setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/ml/ads?days=" + days, {
          cache: "no-store",
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Falha ao carregar publicidade.");
        }

        setData(payload);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Falha ao carregar publicidade.",
        );
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

  const insight = useMemo(() => {
    const summary = data?.summary;
    if (!summary || summary.cost <= 0) {
      return {
        tone: "neutral",
        title: "Sem investimento no período",
        text: "Assim que houver gasto, o Radar compara retorno publicitário com o lucro conhecido da operação.",
      };
    }

    if (summary.realizedProfitAfterAds < 0) {
      return {
        tone: "bad",
        title: "Publicidade está consumindo o lucro conhecido",
        text:
          "O gasto de Ads supera o lucro realizado disponível para os pedidos com custo conhecido neste período.",
      };
    }

    if (
      summary.realizedMarginAfterAds != null &&
      summary.realizedMarginAfterAds < 10
    ) {
      return {
        tone: "attention",
        title: "Retorno existe, mas a margem pós-Ads está apertada",
        text:
          "Evite aumentar orçamento só porque o ROAS parece alto. A margem real da operação é o limite.",
      };
    }

    return {
      tone: "good",
      title: "Publicidade compatível com o lucro conhecido",
      text:
        "O investimento ainda preserva lucro após Ads nos pedidos com rentabilidade calculada.",
    };
  }, [data]);

  const campaigns = data?.campaigns ?? [];
  const adGroups = data?.adGroups ?? [];
  const summary = data?.summary;


  return (
    <section className="ads-page">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Operação</p>
          <h1>Publicidade</h1>
          <p>
            Investimento, receita atribuída e lucro conhecido lado a lado, para
            saber se os anúncios realmente pagam a conta.
          </p>
        </div>

        <div className="page-header-actions">
          <select
            className="clean-select"
            aria-label="Período"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>

          <button
            type="button"
            className="clean-secondary"
            disabled={refreshing}
            onClick={() => void load(true)}
          >
            {refreshing ? "Atualizando..." : "Atualizar dados"}
          </button>
        </div>
      </header>

      {loading && <div className="clean-loading">Carregando Product Ads...</div>}
      {error && <div className="error">{error}</div>}

      {!loading && data && !data.enabled && (
        <section className="clean-panel ads-disabled-panel">
          <span className="ads-disabled-icon" aria-hidden="true">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path d="M3 3l18 18" />
            </svg>
          </span>
          <div className="ads-disabled-copy">
            <strong>Product Ads indisponível nesta conta</strong>
            <p>
              {data.error ??
                data.message ??
                "A conta não retornou um anunciante Product Ads."}
            </p>
            <small>
              Ative o Mercado Ads na sua conta do Mercado Livre ou reconecte a
              integração para o Radar ler campanhas, custos e retorno.
            </small>
          </div>
          <a className="clean-secondary" href="/integracoes">
            Ver integrações
          </a>
        </section>
      )}

      {!loading && data?.enabled && summary && (
        <>
          <section className="clean-kpi-grid ads-kpis">
            <article className="clean-kpi-card">
              <span>Investimento em Ads</span>
              <strong>{money.format(summary.cost)}</strong>
              <small>
                {integer.format(summary.clicks)} cliques · CPC{" "}
                {money.format(summary.cpc)}
              </small>
            </article>

            <article className="clean-kpi-card">
              <span>Receita atribuída</span>
              <strong>{money.format(summary.total_amount)}</strong>
              <small>
                direta {money.format(summary.direct_amount)} · indireta{" "}
                {money.format(summary.indirect_amount)}
              </small>
            </article>

            <article className="clean-kpi-card">
              <span>ROAS</span>
              <strong>{metric(summary.roas)}x</strong>
              <small>
                ACOS {pct(summary.acos)} · CVR {pct(summary.cvr)}
              </small>
            </article>

            <article className="clean-kpi-card accent">
              <span>Lucro conhecido após Ads</span>
              <strong>{money.format(summary.realizedProfitAfterAds)}</strong>
              <small>
                cobertura de {pct(summary.profitCoveragePercent)} dos pedidos
              </small>
            </article>
          </section>

          <section className={"clean-panel ads-insight " + insight.tone}>
            <div className="clean-panel-head">
              <div>
                <span>Leitura financeira</span>
                <strong>{insight.title}</strong>
              </div>
              <span className={"table-status " + insight.tone}>
                {toneLabel[insight.tone] ?? insight.tone}
              </span>
            </div>

            <div className="ads-insight-body">
              <div className="ads-insight-main">
                <p>{insight.text}</p>

                <div className="clean-mini-grid ads-insight-numbers">
                  <div>
                    <span>Lucro antes de Ads</span>
                    <strong>
                      {money.format(summary.realizedProfitBeforeAds)}
                    </strong>
                  </div>
                  <div>
                    <span>Investimento em Ads</span>
                    <strong className="danger-value">
                      -{money.format(summary.cost)}
                    </strong>
                  </div>
                  <div>
                    <span>Margem pós-Ads</span>
                    <strong>{pct(summary.realizedMarginAfterAds)}</strong>
                  </div>
                </div>
              </div>

              <aside
                className={
                  "ads-insight-recommendation " +
                  summary.recommendation.action.toLowerCase()
                }
              >
                <span>Recomendação do Radar</span>
                <strong>{summary.recommendation.label}</strong>
                <p>{summary.recommendation.reason}</p>
                <small>
                  Confiança{" "}
                  {confidenceLabel[summary.recommendation.confidence] ??
                    summary.recommendation.confidence.toLowerCase()}
                </small>
              </aside>
            </div>
          </section>

          <section className="clean-panel ads-campaigns-panel">
            <div className="clean-panel-head">
              <div>
                <span>
                  {data.advertiser?.accountName ??
                    data.advertiser?.advertiserName ??
                    "Product Ads"}
                </span>
                <strong>
                  Campanhas{" "}
                  <span className="ads-count">{campaigns.length}</span>
                </strong>
              </div>
            </div>

            {campaigns.length === 0 ? (
              <div className="module-empty">
                Nenhuma campanha retornada no período.
              </div>
            ) : (
              <div className="clean-table-wrap">
                <table className="clean-table ads-table ads-campaigns-table">
                  <thead>
                    <tr>
                      <th>Campanha</th>
                      <th>Status</th>
                      <th>Orçamento/dia</th>
                      <th>Investimento</th>
                      <th>Receita</th>
                      <th>ROAS</th>
                      <th>ACOS</th>
                      <th>CTR</th>
                      <th>CVR</th>
                      <th>Unidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((campaign, index) => (
                      <tr
                        key={
                          campaign.id ??
                          campaign.name + "-" + String(index)
                        }
                      >
                        <td>
                          <div className="ads-name-cell">
                            <strong>{campaign.name}</strong>
                            {campaign.roasTarget != null && (
                              <small className="table-subtext">
                                ROAS alvo {metric(campaign.roasTarget, 1)}x
                              </small>
                            )}
                          </div>
                        </td>
                        <td>
                          <span
                            className={
                              "table-status ads-status " +
                              campaign.status.toLowerCase()
                            }
                          >
                            {statusLabel(campaign.status)}
                          </span>
                        </td>
                        <td>
                          {campaign.budget == null
                            ? "—"
                            : money.format(campaign.budget)}
                        </td>
                        <td>{money.format(campaign.metrics.cost)}</td>
                        <td>{money.format(campaign.metrics.totalAmount)}</td>
                        <td>
                          <strong className="ads-roas">
                            {metric(campaign.metrics.roas)}x
                          </strong>
                        </td>
                        <td>{pct(campaign.metrics.acos)}</td>
                        <td>{pct(campaign.metrics.ctr)}</td>
                        <td>{pct(campaign.metrics.cvr)}</td>
                        <td>{integer.format(campaign.metrics.units)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="clean-panel ads-groups-panel">
            <div className="clean-panel-head">
              <div>
                <span>Por produto</span>
                <strong>
                  Anúncios patrocinados{" "}
                  <span className="ads-count">{adGroups.length}</span>
                </strong>
              </div>
            </div>

            {adGroups.length === 0 ? (
              <div className="module-empty">
                Nenhum anúncio com métricas retornado no período.
              </div>
            ) : (
              <div className="clean-table-wrap">
                <table className="clean-table ads-table ads-groups-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Status</th>
                      <th>Investimento</th>
                      <th>Receita</th>
                      <th>ROAS</th>
                      <th>TACOS</th>
                      <th>Cliques</th>
                      <th>Un.{"\u00a0"}Ads</th>
                      <th>Un. orgânicas</th>
                      <th>
                        Lucro <span className="ads-nowrap">pós-Ads</span>
                      </th>
                      <th>Cobertura</th>
                      <th>Recomendação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adGroups.map((group, index) => (
                      <tr
                        key={
                          group.id ??
                          group.externalId ??
                          String(index)
                        }
                      >
                        <td>
                          <div className="clean-product-cell">
                            {group.product?.thumbnail ? (
                              <img src={group.product.thumbnail} alt="" />
                            ) : (
                              <span className="clean-product-thumb">MR</span>
                            )}
                            <div>
                              <strong>
                                {group.product?.title ??
                                  group.title ??
                                  group.externalId ??
                                  (group.id
                                    ? "Ad Group " + group.id
                                    : "Ad Group")}
                              </strong>
                              <small>
                                {group.product?.mlItemId ??
                                  group.externalId ??
                                  group.id ??
                                  "—"}
                                {group.catalogListing === true
                                  ? " · Catálogo"
                                  : group.catalogListing === false
                                    ? " · Tradicional"
                                    : ""}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={
                              "table-status ads-status " +
                              group.status.toLowerCase()
                            }
                          >
                            {statusLabel(group.status)}
                          </span>
                        </td>
                        <td>{money.format(group.metrics.cost)}</td>
                        <td>{money.format(group.metrics.totalAmount)}</td>
                        <td>
                          <strong className="ads-roas">
                            {metric(group.metrics.roas)}x
                          </strong>
                        </td>
                        <td>{pct(group.metrics.tacos)}</td>
                        <td>{integer.format(group.metrics.clicks)}</td>
                        <td>{integer.format(group.metrics.units)}</td>
                        <td>{integer.format(group.metrics.organicUnits)}</td>
                        <td>
                          {group.profit.realizedProfitAfterAds == null ? (
                            <span className="table-muted">Sem custo</span>
                          ) : (
                            <span
                              className={
                                group.profit.realizedProfitAfterAds >= 0
                                  ? "ads-profit good-value"
                                  : "ads-profit danger-value"
                              }
                            >
                              {money.format(
                                group.profit.realizedProfitAfterAds,
                              )}
                            </span>
                          )}
                        </td>
                        <td>
                          {pct(group.profit.profitCoveragePercent)}
                        </td>
                        <td>
                          <span
                            className={
                              "table-status ads-action-badge " +
                              group.recommendation.action.toLowerCase()
                            }
                            title={group.recommendation.reason}
                          >
                            {group.recommendation.label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <footer className="table-footer-note">
              {data.freshness?.note} Lucro pós-Ads considera só pedidos com
              rentabilidade já calculada; a cobertura aparece no topo para
              evitar falsa precisão.
            </footer>
          </section>
        </>
      )}
    </section>
  );
}
