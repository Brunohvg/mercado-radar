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

function pct(value: number | null | undefined) {
  return value == null ? "—" : Number(value).toFixed(1) + "%";
}

function metric(value: number | null | undefined, digits = 2) {
  return value == null ? "—" : Number(value).toFixed(digits);
}

function statusLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "active") return "Ativa";
  if (normalized === "paused") return "Pausada";
  return value;
}

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
          <p className="page-kicker">Operação · Publicidade</p>
          <h1>Publicidade</h1>
          <p>
            ROAS é só o começo. O Radar cruza investimento, receita atribuída e
            lucro conhecido para mostrar se os anúncios estão realmente ajudando.
          </p>
        </div>

        <div className="page-header-actions">
          <select
            className="clean-select"
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
          <strong>Product Ads não disponível nesta conexão.</strong>
          <p>
            {data.error ??
              data.message ??
              "A conta não retornou um advertiser Product Ads."}
          </p>
        </section>
      )}

      {!loading && data?.enabled && summary && (
        <>
          <section className="clean-kpi-grid ads-kpis">
            <article className="clean-kpi-card">
              <span>Investimento Ads</span>
              <strong>{money.format(summary.cost)}</strong>
              <small>
                {summary.clicks} cliques · CPC {money.format(summary.cpc)}
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
                cobertura {pct(summary.profitCoveragePercent)} dos pedidos
              </small>
            </article>
          </section>

          <section className={"clean-panel ads-insight " + insight.tone}>
            <div>
              <span>Radar Financeiro</span>
              <strong>{insight.title}</strong>
              <p>{insight.text}</p>
            </div>
            <div className="ads-insight-recommendation">
              <span>Recomendação</span>
              <strong>{summary.recommendation.label}</strong>
              <small>
                {summary.recommendation.reason} · confiança{" "}
                {summary.recommendation.confidence.toLowerCase()}
              </small>
            </div>

            <div className="ads-insight-numbers">
              <div>
                <span>Lucro antes de Ads</span>
                <strong>{money.format(summary.realizedProfitBeforeAds)}</strong>
              </div>
              <div>
                <span>Ads</span>
                <strong>-{money.format(summary.cost)}</strong>
              </div>
              <div>
                <span>Margem pós-Ads</span>
                <strong>{pct(summary.realizedMarginAfterAds)}</strong>
              </div>
            </div>
          </section>

          <section className="clean-panel products-table-panel ads-campaigns-panel">
            <div className="products-table-toolbar">
              <div>
                <strong>Campanhas</strong>
                <span>{campaigns.length}</span>
              </div>
              <span className="table-muted">
                {data.advertiser?.accountName ??
                  data.advertiser?.advertiserName ??
                  "Product Ads"}
              </span>
            </div>

            {campaigns.length === 0 ? (
              <div className="module-empty">
                Nenhuma campanha retornada no período.
              </div>
            ) : (
              <div className="clean-table-wrap">
                <table className="clean-table ads-table">
                  <thead>
                    <tr>
                      <th>Campanha</th>
                      <th>Status</th>
                      <th>Orçamento</th>
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
                          <strong className="supplier-name">
                            {campaign.name}
                          </strong>
                          {campaign.roasTarget != null && (
                            <small className="table-subtext">
                              alvo {metric(campaign.roasTarget)}x
                            </small>
                          )}
                        </td>
                        <td>
                          <span
                            className={
                              "listing-status " + campaign.status
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
                          <strong>{metric(campaign.metrics.roas)}x</strong>
                        </td>
                        <td>{pct(campaign.metrics.acos)}</td>
                        <td>{pct(campaign.metrics.ctr)}</td>
                        <td>{pct(campaign.metrics.cvr)}</td>
                        <td>{campaign.metrics.units}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="clean-panel products-table-panel ads-groups-panel">
            <div className="products-table-toolbar">
              <div>
                <strong>Ad Groups / produtos</strong>
                <span>{adGroups.length}</span>
              </div>
              <span className="table-muted">
                leitura pelo fluxo atual de Ad Groups
              </span>
            </div>

            {adGroups.length === 0 ? (
              <div className="module-empty">
                Nenhum Ad Group com métricas retornado no período.
              </div>
            ) : (
              <div className="clean-table-wrap">
                <table className="clean-table ads-table ads-groups-table">
                  <thead>
                    <tr>
                      <th>Produto / Ad Group</th>
                      <th>Status</th>
                      <th>Investimento</th>
                      <th>Receita</th>
                      <th>ROAS</th>
                      <th>TACOS</th>
                      <th>Cliques</th>
                      <th>Unidades Ads</th>
                      <th>Unidades orgânicas</th>
                      <th>Lucro pós-Ads</th>
                      <th>Cobertura</th>
                      <th>Radar</th>
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
                          <strong className="supplier-name">
                            {group.product?.title ??
                              group.title ??
                              group.externalId ??
                              (group.id
                                ? "Ad Group " + group.id
                                : "Ad Group")}
                          </strong>
                          <small className="table-subtext">
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
                        </td>
                        <td>
                          <span
                            className={"listing-status " + group.status}
                          >
                            {statusLabel(group.status)}
                          </span>
                        </td>
                        <td>{money.format(group.metrics.cost)}</td>
                        <td>{money.format(group.metrics.totalAmount)}</td>
                        <td>{metric(group.metrics.roas)}x</td>
                        <td>{pct(group.metrics.tacos)}</td>
                        <td>{group.metrics.clicks}</td>
                        <td>{group.metrics.units}</td>
                        <td>{group.metrics.organicUnits}</td>
                        <td>
                          {group.profit.realizedProfitAfterAds == null ? (
                            <span className="table-muted">Sem custo</span>
                          ) : (
                            <span
                              className={
                                group.profit.realizedProfitAfterAds >= 0
                                  ? "margin-good"
                                  : "margin-bad"
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
                              "ads-action-badge " +
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
              <span>
                {data.freshness?.note} Lucro pós-Ads considera somente pedidos
                cuja rentabilidade já pôde ser calculada; a cobertura aparece no
                topo para evitar falsa precisão.
              </span>
            </footer>
          </section>
        </>
      )}
    </section>
  );
}
