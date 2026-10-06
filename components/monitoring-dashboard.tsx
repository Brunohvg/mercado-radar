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

export function MonitoringDashboard() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/monitoring/watchlist", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao carregar monitoramento.");
      }
      setItems(payload.items ?? []);
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

  const summary = useMemo(() => {
    const priceChanges = items.filter((item) => {
      const previous = item.snapshots[1]?.price ?? null;
      return delta(item.currentPrice, previous) != null;
    }).length;
    const highScore = items.filter((item) => Number(item.score ?? 0) >= 70).length;
    const excellent = items.filter(
      (item) => item.demandLabel === "EXCELENTE" || item.demandLabel === "ALTA",
    ).length;

    return {
      total: items.length,
      highScore,
      excellent,
      priceChanges,
    };
  }, [items]);

  return (
    <section className="monitoring-page">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Inteligência · Monitoramento</p>
          <h1>Monitoramento</h1>
          <p>
            Acompanhe preço, demanda, score e evolução das oportunidades salvas pela extensão.
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
              <small>oportunidades ativas</small>
            </article>
            <article className="clean-kpi-card">
              <span>Score 70+</span>
              <strong>{summary.highScore}</strong>
              <small>maior aderência atual</small>
            </article>
            <article className="clean-kpi-card">
              <span>Demanda alta</span>
              <strong>{summary.excellent}</strong>
              <small>alta ou excelente</small>
            </article>
            <article className="clean-kpi-card accent">
              <span>Com histórico</span>
              <strong>{summary.priceChanges}</strong>
              <small>já possuem comparação de preço</small>
            </article>
          </section>

          <section className="clean-panel monitoring-list-panel">
            <div className="clean-panel-head">
              <div>
                <span>Watchlist</span>
                <strong>Produtos acompanhados pelo Radar</strong>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="monitoring-empty">
                <strong>Nenhum produto monitorado ainda.</strong>
                <p>
                  Abra um anúncio no Mercado Livre, abra o Side Panel da extensão
                  e clique em <b>Monitorar este anúncio</b>.
                </p>
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
                          <span className="clean-product-thumb">MR</span>
                        )}
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.mlItemId}</small>
                        </div>
                        <span
                          className={
                            "watch-score " +
                            (Number(item.score ?? 0) >= 70 ? "good" : "")
                          }
                        >
                          {item.score ?? 0}/100
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
                          <small>
                            {priceDelta == null
                              ? "sem comparação"
                              : `${priceDelta >= 0 ? "+" : ""}${priceDelta.toFixed(1)}%`}
                          </small>
                        </div>
                        <div>
                          <span>Demanda</span>
                          <strong>{item.demandLabel ?? "—"}</strong>
                          <small>{item.visits ?? 0} visitas</small>
                        </div>
                        <div>
                          <span>Vendidos</span>
                          <strong>{item.soldQuantity}</strong>
                          <small>
                            {soldDelta == null
                              ? "primeiro snapshot"
                              : `+${Math.max(0, soldDelta)} desde o anterior`}
                          </small>
                        </div>
                      </div>

                      <div className="monitoring-card-foot">
                        <small>
                          Atualizado{" "}
                          {new Date(item.lastCheckedAt).toLocaleString("pt-BR")}
                        </small>
                        <div>
                          {item.permalink && (
                            <a href={item.permalink} target="_blank" rel="noreferrer">
                              Abrir anúncio
                            </a>
                          )}
                          <button type="button" onClick={() => void remove(item)}>
                            Parar
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
