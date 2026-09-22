"use client";

import { useEffect, useState } from "react";

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
        <small>
          OAuth 2.0 + PKCE. Tokens ficam criptografados no PostgreSQL.
        </small>
      </div>
    </section>
  );
}
