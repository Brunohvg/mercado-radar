"use client";

import { PilotBriefing } from "@/components/pilot-briefing";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Decision = {
  mlItemId: string;
  title: string;
  thumbnail: string | null;
  stock: number;
  units: number;
  action: string;
  label: string;
  reason: string;
  marginPercent: number | null;
  inventoryCapital: number | null;
  stockDays: number | null;
  suggestedReorder: number | null;
  capitalNeeded: number | null;
  breakEvenRoas: number | null;
  adBudgetRoomPercent: number | null;
  profitCoveragePercent: number | null;
};
type Payload = {
  connected: boolean;
  configured: boolean;
  workspaceName: string;
  nickname?: string | null;
  historyComplete: boolean;
  reportComplete: boolean;
  lastSyncedAt: string | null;
  days: number;
  summary: null | {
    orders: number;
    grossRevenue: number;
    realizedProfit: number;
    realizedMarginPercent: number | null;
    profitReadyCount: number;
    awaitingCostCount: number;
    profitCoveragePercent: number | null;
    units: number;
  };
  decisions: Decision[];
};
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const percent = (n: number | null) =>
  n == null
    ? "—"
    : `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export function ExecutiveDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const run = useRef(0);
  const load = useCallback(async () => {
    const current = ++run.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/decisions?days=${days}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error ?? "Não foi possível carregar sua operação.",
        );
      if (current === run.current) setData(payload);
    } catch (caught) {
      if (current === run.current)
        setError(
          caught instanceof Error ? caught.message : "Falha de conexão.",
        );
    } finally {
      if (current === run.current) setLoading(false);
    }
  }, [days]);
  useEffect(() => {
    void load();
    return () => {
      run.current++;
    };
  }, [load]);
  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const results = await Promise.all(
        ["/api/ml/sales?days=90&refresh=1", "/api/ml/products?refresh=1"].map(
          async (url) => {
            const response = await fetch(url, { cache: "no-store" });
            const body = await response.json();
            if (!response.ok)
              throw new Error(body.error ?? "Falha ao atualizar dados.");
            return body;
          },
        ),
      );
      await load();
      if (results.some((r) => r.sync?.truncated))
        setError(
          "Importação parcial. Há mais dados no Mercado Livre; os indicadores mostram apenas o histórico importado.",
        );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Falha ao atualizar.",
      );
    } finally {
      setRefreshing(false);
    }
  }
  const visible = data?.days === days ? data : null;
  const decisions = visible?.decisions ?? [];
  const inventoryCapital = decisions.reduce(
    (sum, d) => sum + (d.inventoryCapital ?? 0),
    0,
  );
  const summary = visible?.summary;
  const coverage = summary?.profitCoveragePercent;
  return (
    <section className="overview-dashboard" aria-busy={loading || refreshing}>
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">
            {visible?.workspaceName || "Minha operação"}
          </p>
          <h1>Seu radar de decisões</h1>
          <p>Saiba onde agir para proteger lucro e fazer o estoque girar.</p>
        </div>
        <div className="page-header-actions">
          <select
            className="clean-select"
            aria-label="Período dos indicadores"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            disabled={refreshing}
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
          <button
            className="clean-secondary"
            onClick={() => void refresh()}
            disabled={refreshing || loading || !visible?.connected}
          >
            {refreshing ? "Sincronizando…" : "Atualizar dados"}
          </button>
        </div>
      </header>
      <PilotBriefing />
      {error && (
        <div className="error" role="alert">
          {error} <button onClick={() => void load()}>Tentar novamente</button>
        </div>
      )}
      {loading && !visible && (
        <div className="radar-skeleton" role="status">
          <span /> <span /> <span />
          <p>Preparando as decisões da sua operação…</p>
        </div>
      )}
      {visible && !visible.connected && (
        <section className="radar-welcome clean-panel">
          <span className="radar-symbol" aria-hidden="true">
            ◎
          </span>
          <p className="page-kicker">Comece pelo que importa</p>
          <h2>Transforme suas vendas em decisões.</h2>
          <p>
            Conecte sua conta, confira os custos e descubra quanto sobra em cada
            produto.
          </p>
          <div className="radar-start-steps">
            <span>01 · Conectar Mercado Livre</span>
            <span>02 · Definir custos e impostos</span>
            <span>03 · Encontrar sua próxima ação</span>
          </div>
          <Link className="clean-primary" href="/integracoes">
            Conectar minha conta
          </Link>
          <Link href="/configuracoes">Configurar minha operação →</Link>
        </section>
      )}
      {visible?.connected && (
        <>
          {!visible.configured && (
            <div className="radar-notice">
              <div>
                <strong>Complete o perfil financeiro</strong>
                <p>
                  Confirme seu imposto e o custo de embalagem/operação para
                  liberar o lucro e as recomendações.
                </p>
              </div>
              <Link className="clean-secondary" href="/configuracoes">
                Definir custos
              </Link>
            </div>
          )}
          <section
            className="clean-kpi-grid"
            aria-label="Indicadores do período"
          >
            <article className="clean-kpi-card">
              <span>Receita paga</span>
              <strong>{money.format(summary?.grossRevenue ?? 0)}</strong>
              <small>
                {summary?.orders ?? 0} pedidos · {summary?.units ?? 0} unidades
              </small>
            </article>
            <article
              className={
                "clean-kpi-card " +
                (summary && summary.realizedProfit < 0
                  ? "radar-loss"
                  : "accent")
              }
            >
              <span>Lucro conhecido · antes de Ads</span>
              <strong>
                {summary?.profitReadyCount
                  ? money.format(summary.realizedProfit)
                  : "A apurar"}
              </strong>
              <small>
                {summary?.profitReadyCount ?? 0} pedidos com custos completos
              </small>
            </article>
            <article className="clean-kpi-card">
              <span>Margem conhecida</span>
              <strong>{percent(summary?.realizedMarginPercent ?? null)}</strong>
              <small>
                {coverage == null ? "sem vendas no período" : `em ${coverage.toFixed(0)}% da receita · `}
                {coverage != null && <Link href="/vendas">ver vendas</Link>}
              </small>
            </article>
            <article className="clean-kpi-card">
              <span>Capital conhecido em estoque</span>
              <strong>
                {decisions.some((d) => d.inventoryCapital != null)
                  ? money.format(inventoryCapital)
                  : "A apurar"}
              </strong>
              <small>
                {decisions.filter((d) => d.inventoryCapital != null).length} de{" "}
                {decisions.length} produtos com custo
              </small>
            </article>
          </section>
          <section
            className="radar-discover clean-panel"
            aria-label="Pesquisar uma oportunidade"
          >
            <div>
              <p className="page-kicker">Sua próxima oportunidade</p>
              <h2>O que você está pensando em vender?</h2>
              <p>
                Cole o link do anúncio ou digite o produto. Mostramos fornecedores
                e quanto você pode pagar para ter lucro.
              </p>
            </div>
            <form action="/onde-comprar" method="GET">
              <label className="sr-only" htmlFor="dashboard-product-search">
                Produto para pesquisar
              </label>
              <input
                id="dashboard-product-search"
                type="search"
                name="q"
                minLength={2}
                maxLength={300}
                required
                placeholder="Link do anúncio ou nome do produto"
              />
              <button className="clean-primary" type="submit">
                Começar →
              </button>
            </form>
            <Link href="/analisar">Só quero calcular o lucro de um anúncio →</Link>
          </section>
          <footer className="radar-data-note">
            <span>
              {visible.lastSyncedAt
                ? `Vendas atualizadas em ${new Date(visible.lastSyncedAt).toLocaleString("pt-BR")}`
                : "Vendas ainda não sincronizadas"}
            </span>
            <span>
              Decisões orientam sua revisão. Preços e compras dependem da sua
              aprovação.
            </span>
          </footer>
        </>
      )}
    </section>
  );
}
