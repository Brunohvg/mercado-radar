"use client";

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
const tone = (action: string) =>
  action === "STOP_BUYING"
    ? "bad"
    : ["MAINTAIN", "RESTOCK"].includes(action)
      ? "good"
      : "attention";

export function ExecutiveDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
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
  const attention = decisions.filter(
    (d) => !["MAINTAIN", "OBSERVE"].includes(d.action),
  );
  const inventoryCapital = decisions.reduce(
    (sum, d) => sum + (d.inventoryCapital ?? 0),
    0,
  );
  const rows =
    filter === "ALL"
      ? decisions
      : filter === "ATTENTION"
        ? attention
        : decisions.filter((d) => d.action === filter);
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
      <section
        className="radar-discover clean-panel"
        aria-label="Pesquisar uma oportunidade"
      >
        <div>
          <p className="page-kicker">Sua próxima oportunidade</p>
          <h2>O que você está pensando em vender?</h2>
          <p>
            Pesquise produtos, compare ofertas e confira o custo antes de
            investir.
          </p>
        </div>
        <form action="/oportunidades" method="GET">
          <label className="sr-only" htmlFor="dashboard-product-search">
            Produto para pesquisar
          </label>
          <input
            id="dashboard-product-search"
            type="search"
            name="q"
            minLength={2}
            maxLength={120}
            required
            placeholder="Ex.: kit ferramentas, prensa manual…"
          />
          <button className="clean-primary" type="submit">
            Pesquisar produtos →
          </button>
        </form>
        <Link href="/mercado">Comparar meus anúncios pesquisados →</Link>
      </section>
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
          {!visible.reportComplete && (
            <div className="radar-notice">
              <div>
                <strong>Histórico parcial ou desatualizado</strong>
                <p>
                  Atualize os dados para conferir o período completo. Reposição
                  depende de 30 dias de histórico recente.
                </p>
              </div>
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
              <small>Somente vendas com custos conferidos</small>
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
            className="radar-evidence clean-panel"
            aria-label="Confiabilidade dos resultados"
          >
            <div>
              <strong>Quanto do lucro já conseguimos apurar?</strong>
              <p>
                {coverage == null
                  ? "Ainda não há vendas pagas no período."
                  : `${coverage.toFixed(0)}% da receita tem custos completos. ${summary?.awaitingCostCount ?? 0} pedido(s) aguardam conferência.`}
              </p>
            </div>
            <div className="radar-coverage">
              <progress
                value={coverage ?? 0}
                max="100"
                aria-label="Receita com custos completos"
              />
              <b>{percent(coverage ?? null)}</b>
            </div>
            <Link href="/vendas">Conferir vendas →</Link>
          </section>
          <div className="radar-section-head">
            <div>
              <p className="page-kicker">Prioridades · últimos 30 dias</p>
              <h2>O que merece sua atenção</h2>
            </div>
            <span className="table-status attention">
              {attention.length}{" "}
              {attention.length === 1
                ? "ação para revisar"
                : "ações para revisar"}
            </span>
          </div>
          <div
            className="radar-filter-bar"
            role="group"
            aria-label="Filtrar decisões"
          >
            {[
              ["ALL", "Todos"],
              ["ATTENTION", "Precisam de atenção"],
              ["RESTOCK", "Reposição"],
              ["ADD_COST", "Sem custo"],
              ["STOP_BUYING", "Margem em risco"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={filter === key}
                className={filter === key ? "active" : ""}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {!rows.length && (
            <div className="radar-empty clean-panel">
              <h3>
                {decisions.length
                  ? "Nenhum produto neste filtro"
                  : "Seu radar está pronto para receber produtos"}
              </h3>
              <p>
                {decisions.length
                  ? "Escolha outro filtro para continuar a análise."
                  : "Atualize os dados para importar seus anúncios e, em Produtos, cadastre os custos de compra."}
              </p>
              <Link href="/produtos">Abrir produtos →</Link>
            </div>
          )}
          <div className="radar-decision-grid">
            {rows.slice(0, 12).map((item) => (
              <article
                className={
                  "radar-decision-card clean-panel " + tone(item.action)
                }
                key={item.mlItemId}
              >
                <div className="radar-decision-top">
                  <span className={"table-status " + tone(item.action)}>
                    {item.label}
                  </span>
                  <small>{item.mlItemId}</small>
                </div>
                <div className="radar-decision-product">
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <div
                      className="radar-product-placeholder"
                      aria-hidden="true"
                    >
                      ◎
                    </div>
                  )}
                  <h3>{item.title}</h3>
                </div>
                <p>{item.reason}</p>
                <dl className="radar-decision-metrics">
                  <div>
                    <dt>Margem conhecida</dt>
                    <dd>{percent(item.marginPercent)}</dd>
                  </div>
                  <div>
                    <dt>Cobertura de estoque</dt>
                    <dd>
                      {item.stockDays == null
                        ? "A apurar"
                        : item.stockDays < 1 && item.stock > 0
                          ? "< 1 dia"
                          : `${Math.floor(item.stockDays)} dias`}
                    </dd>
                  </div>
                  <div>
                    <dt>Vendas pagas · 30d</dt>
                    <dd>{item.units} un.</dd>
                  </div>
                </dl>
                {item.suggestedReorder != null && (
                  <div className="radar-reorder">
                    Lote sugerido: <strong>{item.suggestedReorder} un.</strong>{" "}
                    · capital {money.format(item.capitalNeeded ?? 0)}
                    <small>
                      Estimativa pela saída observada. Confira o prazo com o
                      fornecedor.
                    </small>
                  </div>
                )}
                {item.breakEvenRoas != null && (
                  <div className="radar-ad-room">
                    <span>
                      ROAS de equilíbrio estimado{" "}
                      <b>
                        {item.breakEvenRoas.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        ×
                      </b>
                    </span>
                    <small>
                      Margem histórica antes de Ads. Mix e custos precisam se
                      manter.
                    </small>
                  </div>
                )}
                <Link
                  className="radar-card-action"
                  href={`/produtos?item=${item.mlItemId}`}
                >
                  {item.action === "ADD_COST"
                    ? "Cadastrar custo"
                    : "Revisar produto"}{" "}
                  <span aria-hidden="true">↗</span>
                </Link>
              </article>
            ))}
          </div>
          {rows.length > 12 && (
            <Link className="clean-secondary" href="/produtos">
              Revisar todos os {rows.length} produtos
            </Link>
          )}
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
