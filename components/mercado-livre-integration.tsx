"use client";

import { useEffect, useState } from "react";

type MlDiagnosticsCheck = {
  ok: boolean;
  status: number;
  code: string | null;
  message: string | null;
};

type MlDiagnostics = {
  account: MlDiagnosticsCheck;
  catalogSearch: MlDiagnosticsCheck;
  categoryDiscovery: MlDiagnosticsCheck;
  capabilities: {
    listings: MlDiagnosticsCheck & { permission?: string; hint?: string };
    businessMetrics: MlDiagnosticsCheck & { permission?: string; hint?: string };
    orders: MlDiagnosticsCheck & { permission?: string; hint?: string };
    productAds: MlDiagnosticsCheck & { permission?: string; hint?: string };
    catalogSearch: MlDiagnosticsCheck & { hint?: string };
    categoryDiscovery: MlDiagnosticsCheck & { hint?: string };
    trends: MlDiagnosticsCheck & { hint?: string };
  };
  summary: {
    healthy: boolean;
    marketplaceKeywordSearchRequired?: boolean;
    marketplaceKeywordSearchBlocked?: boolean;
  };
};

type MlStatus = {
  configured: boolean;
  connected: boolean;
  nickname?: string | null;
  userId?: string | null;
  tokenExpiresAt?: string | null;
  databaseAvailable?: boolean;
};

export function MercadoLivreIntegration() {
  const [status, setStatus] = useState<MlStatus | null>(null);
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState<MlDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/integrations/mercadolivre/status")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Falha ao consultar integração.");
        }
        setStatus(payload);
      })
      .catch((caught) => {
        setError(
          caught instanceof Error ? caught.message : "Falha ao consultar integração.",
        );
      });
  }, []);

  async function runDiagnostics() {
    setDiagnosticsLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/integrations/mercadolivre/diagnostics",
        { cache: "no-store" },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Falha ao diagnosticar integração.",
        );
      }

      setDiagnostics(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Falha ao diagnosticar integração.",
      );
    } finally {
      setDiagnosticsLoading(false);
    }
  }

  return (
    <section className="integration-panel" id="integracoes">
      <header className="page-header clean-page-header integration-head">
        <div>
          <p className="page-kicker">Configuração</p>
          <h1>Integrações</h1>
          <p>
            Conecte sua conta para o Radar buscar tarifa e frete da sua operação,
            em vez de depender de estimativas manuais.
          </p>
        </div>
      </header>

      <section className="clean-panel integration-account">
        <div className="integration-account-head">
          <span className="integration-logo" aria-hidden="true">ML</span>
          <div>
            <strong>Mercado Livre</strong>
            <span>Pedidos, anúncios, métricas e publicidade da sua conta de vendedor</span>
          </div>
          <span
            className={
              "connection-badge status-chip " +
              (status?.connected ? "good online" : "neutral")
            }
          >
            {status?.connected ? "Conectado" : "Não conectado"}
          </span>
        </div>

        <div className="clean-mini-grid integration-grid">
          <div>
            <span>Aplicação</span>
            <strong>{status?.configured ? "Configurada" : "Pendente"}</strong>
            <small>
              {status?.configured
                ? "credenciais no ambiente"
                : "faltam variáveis de ambiente"}
            </small>
          </div>
          <div>
            <span>Conta</span>
            <strong>{status?.nickname ?? "—"}</strong>
            <small>{status?.connected ? "vendedor autorizado" : "nenhuma conta ligada"}</small>
          </div>
          <div>
            <span>ID do vendedor</span>
            <strong>{status?.userId ?? "—"}</strong>
            <small>identificador no Mercado Livre</small>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        {status && !status.configured && (
          <div className="integration-note">
            Configure <code>MERCADO_LIVRE_CLIENT_ID</code>,{" "}
            <code>MERCADO_LIVRE_CLIENT_SECRET</code>,{" "}
            <code>MERCADO_LIVRE_REDIRECT_URI</code> e{" "}
            <code>APP_ENCRYPTION_KEY</code> no ambiente do deploy.
          </div>
        )}

        <div className="integration-actions">
          <a
            className={"primary-link " + (status?.connected ? "secondary" : "primary")}
            href="/api/integrations/mercadolivre/authorize"
          >
            {status?.connected ? "Reconectar conta" : "Conectar Mercado Livre"}
          </a>
          <button
            type="button"
            className={status?.connected ? "primary" : "secondary"}
            disabled={!status?.connected || diagnosticsLoading}
            onClick={runDiagnostics}
          >
            {diagnosticsLoading ? "Testando permissões..." : "Testar permissões"}
          </button>
          <small>
            Autorização OAuth 2.0 com PKCE. Os tokens ficam criptografados no banco
            de dados.
          </small>
        </div>
      </section>

      {diagnostics && (
        <section className="clean-panel integration-diagnostics">
          <div className="clean-panel-head integration-diagnostic-head">
            <div>
              <span>Diagnóstico</span>
              <strong>
                {diagnostics.summary.healthy
                  ? "Integração principal saudável"
                  : "Há recursos bloqueados"}
              </strong>
            </div>
            <small>Teste feito com a conta conectada agora.</small>
          </div>

          <div className="integration-diagnostic-grid">
            {[
              ["Conta e autorização", diagnostics.account],
              ["Publicações", diagnostics.capabilities.listings],
              ["Métricas", diagnostics.capabilities.businessMetrics],
              ["Pedidos", diagnostics.capabilities.orders],
              ["Publicidade", diagnostics.capabilities.productAds],
              ["Catálogo", diagnostics.capabilities.catalogSearch],
              ["Categorias", diagnostics.capabilities.categoryDiscovery],
              ["Tendências", diagnostics.capabilities.trends],
            ].map(([label, check]) => {
              const item = check as MlDiagnosticsCheck;
              return (
                <article
                  className={
                    "integration-diagnostic-item " +
                    (item.ok ? "ok" : "blocked")
                  }
                  key={String(label)}
                >
                  <span>{String(label)}</span>
                  <strong
                    className={"status-chip " + (item.ok ? "good" : "bad")}
                  >
                    {item.ok ? "OK" : `HTTP ${item.status || "—"}`}
                  </strong>
                  {!item.ok && (
                    <small>
                      {[item.code, item.message]
                        .filter(Boolean)
                        .join(" · ") || "Recurso indisponível"}
                    </small>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
}
