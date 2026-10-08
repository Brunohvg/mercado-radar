"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Snapshot = {
  price: number | null;
  score: number | null;
  demandLabel: string | null;
  soldQuantity: number;
  visits: number | null;
  capturedAt: string;
};

type AlertItem = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  watchItem: {
    mlItemId: string;
    title: string;
    permalink: string | null;
    thumbnail: string | null;
  } | null;
};

type Momentum = {
  status: "LEARNING" | "READY";
  score: number | null;
  confidence: number;
  spanHours: number;
  soldDelta: number;
  visitsDelta: number | null;
  salesPerDay: number | null;
  visitsPerDay: number | null;
  conversionProxyPercent: number | null;
  scoreDelta: number | null;
  demandDelta: number | null;
  direction: "UP" | "STABLE" | "DOWN" | "LEARNING";
} | null;

type WatchItem = {
  id: string;
  mlItemId: string;
  referenceId: string | null;
  title: string;
  permalink: string | null;
  thumbnail: string | null;
  currentPrice: number | null;
  score: number | null;
  demandLabel: string | null;
  soldQuantity: number;
  visits: number | null;
  lastCheckedAt: string;
  createdAt: string;
  momentum: Momentum;
  snapshots: Snapshot[];
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function delta(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

const demandText: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  EXCELENTE: "Excelente",
};

const directionText: Record<string, string> = {
  UP: "Em alta",
  STABLE: "Estável",
  DOWN: "Em queda",
  LEARNING: "Aprendendo",
};

export function MonitoringDashboard() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [watchResponse, alertResponse] = await Promise.all([
        fetch("/api/monitoring/watchlist", { cache: "no-store" }),
        fetch("/api/monitoring/alerts?limit=12", { cache: "no-store" }),
      ]);

      const [watchPayload, alertPayload] = await Promise.all([
        watchResponse.json(),
        alertResponse.json(),
      ]);

      if (!watchResponse.ok) {
        throw new Error(
          watchPayload.error ?? "Falha ao carregar monitoramento.",
        );
      }

      if (!alertResponse.ok) {
        throw new Error(
          alertPayload.error ?? "Falha ao carregar alertas.",
        );
      }

      setItems(watchPayload.items ?? []);
      setAlerts(alertPayload.alerts ?? []);
      setUnreadCount(alertPayload.unreadCount ?? 0);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Falha ao carregar monitoramento.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refreshAll() {
    setRefreshing(true);
    setError("");

    try {
      const response = await fetch("/api/monitoring/watchlist/refresh", {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao atualizar monitoramento.");
      }

      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Falha ao atualizar monitoramento.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function remove(item: WatchItem) {
    const response = await fetch(
      "/api/monitoring/watchlist?itemId=" + encodeURIComponent(item.mlItemId),
      { method: "DELETE" },
    );
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Falha ao remover monitoramento.");
      return;
    }

    setItems((current) =>
      current.filter((entry) => entry.mlItemId !== item.mlItemId),
    );
  }

  async function markAllRead() {
    if (unreadCount <= 0) return;

    const response = await fetch("/api/monitoring/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Falha ao marcar alertas como lidos.");
      return;
    }

    setUnreadCount(0);
    setAlerts((current) =>
      current.map((alert) => ({
        ...alert,
        readAt: alert.readAt ?? payload.readAt ?? new Date().toISOString(),
      })),
    );
  }

  const summary = useMemo(() => {
    const priceChanges = items.filter((item) => {
      const previous = item.snapshots[1]?.price ?? null;
      return delta(item.currentPrice, previous) != null;
    }).length;
    const highScore = items.filter((item) => Number(item.score ?? 0) >= 70).length;
    const excellent = items.filter(
      (item) => item.demandLabel === "EXCELENTE" || item.demandLabel === "ALTA",
    ).length;
    const momentumReady = items.filter(
      (item) => item.momentum?.status === "READY",
    ).length;
    const momentumStrong = items.filter(
      (item) =>
        item.momentum?.status === "READY" &&
        Number(item.momentum.score ?? 0) >= 70,
    ).length;

    return {
      total: items.length,
      highScore,
      excellent,
      priceChanges,
      momentumReady,
      momentumStrong,
    };
  }, [items]);

  return (
    <section className="monitoring-page">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Inteligência</p>
          <h1>Monitoramento</h1>
          <p>
            Preço, demanda, score e evolução dos anúncios que você salvou pela extensão.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="clean-secondary"
            disabled={refreshing}
            onClick={() => void refreshAll()}
          >
            {refreshing ? "Atualizando..." : "Atualizar agora"}
          </button>
        </div>
      </header>

      {loading && <div className="clean-loading">Carregando monitoramento...</div>}
      {error && <div className="error">{error}</div>}

      {!loading && (
        <>
          <section className="clean-kpi-grid">
            <article className="clean-kpi-card">
              <span>Monitorados</span>
              <strong>{summary.total}</strong>
              <small>anúncios acompanhados</small>
            </article>
            <article className="clean-kpi-card">
              <span>Score 70 ou mais</span>
              <strong>{summary.highScore}</strong>
              <small>maior aderência atual</small>
            </article>
            <article className="clean-kpi-card">
              <span>Demanda alta</span>
              <strong>{summary.excellent}</strong>
              <small>demanda alta ou excelente</small>
            </article>
            <article className="clean-kpi-card accent">
              <span>Momentum 70 ou mais</span>
              <strong>{summary.momentumStrong}</strong>
              <small>
                {summary.momentumReady} com histórico suficiente
              </small>
            </article>
          </section>

          {alerts.length > 0 && (
            <section className="clean-panel monitoring-alerts-panel">
              <div className="clean-panel-head">
                <div>
                  <span>Alertas</span>
                  <strong>Mudanças recentes</strong>
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="inline-link-button"
                    onClick={() => void markAllRead()}
                  >
                    Marcar {unreadCount} como {unreadCount === 1 ? "lido" : "lidos"}
                  </button>
                )}
              </div>

              <div className="monitoring-alert-list">
                {alerts.map((alert) => (
                  <article
                    className={
                      "monitoring-alert " +
                      (alert.readAt ? "is-read " : "") +
                      alert.severity.toLowerCase()
                    }
                    key={alert.id}
                  >
                    <span className="monitoring-alert-indicator" aria-hidden="true" />
                    <div className="monitoring-alert-copy">
                      <div>
                        <strong>{alert.title}</strong>
                        {!alert.readAt && <span className="tag good">Novo</span>}
                      </div>
                      <p>{alert.message}</p>
                      <small>
                        {new Date(alert.createdAt).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </small>
                    </div>
                    {alert.watchItem?.permalink && (
                      <a
                        href={alert.watchItem.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-link-button"
                      >
                        Abrir anúncio
                      </a>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="clean-panel monitoring-list-panel">
            <div className="clean-panel-head">
              <div>
                <span>Lista de monitoramento</span>
                <strong>Anúncios acompanhados pelo Radar</strong>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="monitoring-empty">
                <strong>Nenhum anúncio monitorado ainda</strong>
                <p>
                  Abra um anúncio no Mercado Livre, abra o painel lateral da
                  extensão Radar e clique em <b>Monitorar este anúncio</b>. Ele
                  aparece aqui com preço, demanda e score atualizados.
                </p>
                <a className="inline-link-button" href="/extensao">
                  Instalar a extensão
                </a>
              </div>
            ) : (
              <div className="monitoring-grid">
                {items.map((item) => {
                  const previous = item.snapshots[1] ?? item.snapshots[0] ?? null;
                  const priceDelta = delta(
                    item.currentPrice,
                    previous?.price ?? null,
                  );
                  const soldDelta =
                    previous == null
                      ? null
                      : item.soldQuantity - previous.soldQuantity;

                  return (
                    <article className="monitoring-card" key={item.id}>
                      <div className="monitoring-card-head">
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt="" loading="lazy" />
                        ) : (
                          <span className="clean-product-thumb" aria-hidden="true">MR</span>
                        )}
                        <div>
                          <strong title={item.title}>{item.title}</strong>
                          <small>{item.mlItemId}</small>
                        </div>
                        <span
                          className={
                            "watch-score " +
                            (Number(item.score ?? 0) >= 70
                              ? "good"
                              : Number(item.score ?? 0) < 40
                                ? "low"
                                : "")
                          }
                          title="Score de oportunidade"
                        >
                          <b>{item.score ?? 0}</b>/100
                        </span>
                      </div>

                      <div className="monitoring-card-metrics">
                        <div>
                          <span>Preço</span>
                          <strong>
                            {item.currentPrice == null
                              ? "—"
                              : money.format(item.currentPrice)}
                          </strong>
                          <small
                            className={
                              priceDelta == null || priceDelta === 0
                                ? ""
                                : priceDelta > 0
                                  ? "is-up"
                                  : "is-down"
                            }
                          >
                            {priceDelta == null
                              ? "sem comparação"
                              : `${priceDelta >= 0 ? "+" : ""}${priceDelta.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
                          </small>
                        </div>
                        <div>
                          <span>Demanda</span>
                          <strong>
                            {item.demandLabel
                              ? demandText[item.demandLabel] ?? item.demandLabel
                              : "—"}
                          </strong>
                          <small>
                            {(item.visits ?? 0).toLocaleString("pt-BR")} visitas
                          </small>
                        </div>
                        <div>
                          <span>Vendidos</span>
                          <strong>{item.soldQuantity.toLocaleString("pt-BR")}</strong>
                          <small>
                            {soldDelta == null
                              ? "primeiro snapshot"
                              : `+${Math.max(0, soldDelta)} desde a última leitura`}
                          </small>
                        </div>
                        <div>
                          <span>Momentum</span>
                          <strong
                            className={
                              item.momentum?.status === "READY"
                                ? "momentum-" + item.momentum.direction.toLowerCase()
                                : "momentum-learning"
                            }
                          >
                            {item.momentum?.status === "READY"
                              ? `${item.momentum.score}/100`
                              : "Aprendendo"}
                          </strong>
                          <small>
                            {item.momentum == null
                              ? "precisa de mais leituras"
                              : item.momentum.status === "LEARNING"
                                ? `${item.momentum.confidence}% confiança · ${item.momentum.spanHours}h`
                                : `${directionText[item.momentum.direction] ?? item.momentum.direction} · ${item.momentum.confidence}% confiança`}
                          </small>
                        </div>
                      </div>

                      <div className="monitoring-card-foot">
                        <small>
                          Atualizado em{" "}
                          {new Date(item.lastCheckedAt).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </small>
                        <div>
                          {item.permalink && (
                            <a
                              className="inline-link-button"
                              href={item.permalink}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Abrir anúncio
                            </a>
                          )}
                          <button
                            type="button"
                            className="monitoring-stop"
                            onClick={() => void remove(item)}
                          >
                            Parar de monitorar
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
