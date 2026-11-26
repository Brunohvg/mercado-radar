"use client";

import { SetupChecklist } from "@/components/setup-checklist";
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
    <section className="overview-dashboard radar-home" aria-busy={loading || refreshing}>
      <header className="radar-home-heading">
        <div>
          <h1>Visão geral</h1>
          <p>{visible?.workspaceName ? visible.workspaceName + " · " : ""}Inteligência para encontrar, comprar e revender.</p>
        </div>
      </header>

      <section className="radar-home-search clean-panel" aria-label="Pesquisar uma oportunidade">
        <div className="radar-home-search-copy">
          <h2>O que você quer revender?</h2>
          <p>Encontre fornecedores e descubra quanto pode pagar pelo produto.</p>
        </div>
        <form action="/onde-comprar" method="GET">
          <label className="sr-only" htmlFor="dashboard-product-search">Produto para pesquisar</label>
          <input id="dashboard-product-search" type="search" name="q" minLength={2} maxLength={300} required placeholder="Nome do produto ou link do anúncio" />
          <button className="clean-primary" type="submit">Buscar fornecedores</button>
        </form>
        <div className="radar-home-shortcuts">
          <Link href="/mercado">Explorar mercado <span aria-hidden="true">›</span></Link>
          <Link href="/analisar">Calcular rentabilidade <span aria-hidden="true">›</span></Link>
        </div>
      </section>

      {error && <div className="error" role="alert">{error} <button onClick={() => void load()}>Tentar novamente</button></div>}
      {loading && !visible && <p className="radar-home-muted" role="status">Carregando dados da operação…</p>}
      {visible && !visible.connected && (
        <section className="radar-home-connect" aria-label="Conectar conta">
          <div><h2>Conecte sua operação</h2><p>Pesquise fornecedores sem conta vinculada. Conecte o Mercado Livre para acompanhar suas vendas, custos e estoque.</p></div>
          <Link className="clean-secondary" href="/integracoes">Conectar Mercado Livre</Link>
        </section>
      )}

      {visible?.connected && (
        <>
          <section className="radar-home-performance" aria-labelledby="radar-performance-title">
            <header className="radar-home-section-head">
              <div><h2 id="radar-performance-title">Minha operação</h2><p>{visible.lastSyncedAt ? `Atualização: ${new Date(visible.lastSyncedAt).toLocaleString("pt-BR")}` : "Vendas ainda não sincronizadas"}</p></div>
              <div className="page-header-actions">
                <select className="clean-select" aria-label="Período dos indicadores" value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={refreshing}>
                  <option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option>
                </select>
                <button className="clean-secondary" onClick={() => void refresh()} disabled={refreshing || loading}>{refreshing ? "Sincronizando…" : "Atualizar dados"}</button>
              </div>
            </header>
            {!visible.reportComplete && <p className="radar-home-data-warning" role="status">Histórico parcial ou desatualizado. Os valores consideram apenas os dados importados.</p>}
            <dl className="radar-home-metrics" aria-label="Indicadores do período">
              <div><dt>Receita paga</dt><dd>{summary ? money.format(summary.grossRevenue) : "A apurar"}</dd><small>{summary ? `${summary.orders} pedidos · ${summary.units} unidades` : "Sem dados disponíveis"}</small></div>
              <div><dt>Resultado conhecido · antes de Ads</dt><dd className={summary && summary.realizedProfit < 0 ? "radar-home-negative" : undefined}>{summary?.profitReadyCount ? money.format(summary.realizedProfit) : "A apurar"}</dd><small>{summary?.profitReadyCount ?? 0} pedidos com custos completos</small></div>
              <div><dt>Margem conhecida</dt><dd>{percent(summary?.realizedMarginPercent ?? null)}</dd><small>{coverage == null ? "Cobertura não calculada" : `${coverage.toFixed(0)}% da receita`}</small></div>
              <div><dt>Capital conhecido em estoque</dt><dd>{decisions.some((d) => d.inventoryCapital != null) ? money.format(inventoryCapital) : "A apurar"}</dd><small>{decisions.filter((d) => d.inventoryCapital != null).length} de {decisions.length} produtos com custo</small></div>
            </dl>
            {!visible.configured && <p className="radar-home-data-warning">Confirme impostos e custos para melhorar a análise. <Link href="/configuracoes">Definir custos</Link></p>}
            <Link className="radar-home-link" href="/vendas">Ver detalhes das vendas <span aria-hidden="true">›</span></Link>
          </section>
          <PilotBriefing compact />
        </>
      )}

      <details className="radar-home-setup">
        <summary>Configuração e primeiros passos</summary>
        <SetupChecklist />
        <Link href="/onboarding">Abrir guia de configuração</Link>
      </details>
    </section>
  );
}
