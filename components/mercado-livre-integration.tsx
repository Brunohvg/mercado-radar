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
  marketplaceSearch: MlDiagnosticsCheck;
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
      <div className="integration-head">
        <div>
          <p className="eyebrow">Integrações</p>
          <h2>Mercado Livre API</h2>
          <p>
            Conecte sua conta para o Radar buscar tarifa e frete da sua operação,
            em vez de depender de estimativas manuais.
          </p>
        </div>
        <span className={"connection-badge " + (status?.connected ? "online" : "")}>
          {status?.connected ? "Conectado" : "Não conectado"}
        </span>
      </div>

      <div className="integration-grid">
        <div>
          <span>Aplicação</span>
          <strong>{status?.configured ? "Configurada" : "Falta configurar env"}</strong>
        </div>
        <div>
          <span>Conta</span>
          <strong>{status?.nickname ?? "—"}</strong>
        </div>
        <div>
          <span>Seller ID</span>
          <strong>{status?.userId ?? "—"}</strong>
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
        <a className="primary-link" href="/api/integrations/mercadolivre/authorize">
          {status?.connected ? "Reconectar conta" : "Conectar Mercado Livre"}
        </a>
        <button
          type="button"
          className="secondary"
          disabled={!status?.connected || diagnosticsLoading}
          onClick={runDiagnostics}
        >
          {diagnosticsLoading
            ? "Testando permissões..."
            : "Diagnóstico da integração"}
        </button>
        <small>
          OAuth 2.0 + PKCE. Tokens ficam criptografados no PostgreSQL.
        </small>
      </div>

      {diagnostics && (
        <div className="integration-diagnostics">
          <div className="integration-diagnostic-head">
            <div>
              <span className="eyebrow">Diagnóstico</span>
              <strong>
                {diagnostics.summary.healthy
                  ? "Integração principal saudável"
                  : "Há recursos bloqueados"}
              </strong>
            </div>
            <small>
              Teste feito com a conta atualmente conectada.
            </small>
          </div>

          <div className="integration-diagnostic-grid">
            {[
              ["Conta / OAuth", diagnostics.account],
              ["Catálogo", diagnostics.catalogSearch],
              ["Categorias", diagnostics.categoryDiscovery],
              ["Busca ampla (legado)", diagnostics.marketplaceSearch],
            ].map(([label, check]) => {
              const item = check as MlDiagnosticsCheck;
              return (
                <article
                  className={
                    "integration-diagnostic-item " +
                    (item.ok
                      ? "ok"
                      : String(label).includes("legado") &&
                          item.status === 403
                        ? "optional"
                        : "blocked")
                  }
                  key={String(label)}
                >
                  <span>{String(label)}</span>
                  <strong>
                    {item.ok
                      ? "OK"
                      : String(label).includes("legado") &&
                          item.status === 403
                        ? "Não utilizado"
                        : `HTTP ${item.status || "—"}`}
                  </strong>
                  {!item.ok && (
                    <small>
                      {String(label).includes("legado") &&
                      item.status === 403
                        ? "O Radar não dependerá mais desta busca por palavra-chave."
                        : [item.code, item.message]
                            .filter(Boolean)
                            .join(" · ") || "Recurso indisponível"}
                    </small>
                  )}
                </article>
              );
            })}
          </div>

          {diagnostics.summary.marketplaceKeywordSearchBlocked && (
            <div className="integration-note">
              A antiga busca ampla por palavra-chave está bloqueada para esta
              aplicação, mas ela não é mais uma dependência do Radar. A
              descoberta usa o buscador oficial de produtos e a extensão
              enriquece diretamente os anúncios que aparecem na página do
              Mercado Livre.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
