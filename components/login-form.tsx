"use client";

import { useState } from "react";

function safeNext() {
  const next = new URLSearchParams(window.location.search).get("next");
  // só caminhos internos; bloqueia "//host" e "http://host" (open redirect)
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginForm({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body?.error || "Não foi possível entrar.");
        setLoading(false);
        return;
      }

      window.location.assign(safeNext());
    } catch {
      setError("Sem conexão com o servidor. Tente de novo.");
      setLoading(false);
    }
  }

  return (
    <main className="rd-auth">
      <aside className="rd-auth__aside" aria-hidden="true">
        <div className="rd-auth__scope">
          <svg viewBox="0 0 200 200" fill="none">
            <circle cx="100" cy="100" r="96" />
            <circle cx="100" cy="100" r="66" />
            <circle cx="100" cy="100" r="36" />
            <path d="M100 4v192M4 100h192" />
            <g className="rd-auth__sweep">
              <path d="M100 100 L100 4 A96 96 0 0 1 183 52 Z" />
            </g>
            <circle className="rd-auth__blip" cx="146" cy="62" r="4" />
            <circle className="rd-auth__blip rd-auth__blip--2" cx="58" cy="128" r="3" />
            <circle className="rd-auth__blip rd-auth__blip--3" cx="128" cy="148" r="3" />
          </svg>
        </div>
        <div className="rd-auth__pitch">
          <strong>Veja o que vende antes de investir.</strong>
          <p>
            Vendas, faturamento e visitas estimadas de qualquer anúncio do Mercado Livre,
            com a sua margem calculada na hora.
          </p>
        </div>
      </aside>

      <div className="rd-auth__card">
        <div className="rd-auth__brand">
          <img src="/brand/mark.svg" alt="" aria-hidden="true" />
          <div>
            <strong>Mercado Radar</strong>
            <small>Inteligência para vender no Mercado Livre</small>
          </div>
        </div>

        <h1>Entrar</h1>
        <p>Acesse o painel com a conta do operador.</p>

        {!configured ? (
          <div className="rd-auth__error" role="alert">
            Login não configurado no servidor. Defina ADMIN_EMAIL,
            ADMIN_PASSWORD_HASH e ADMIN_SESSION_SECRET e reinicie a aplicação.
          </div>
        ) : (
          <form onSubmit={submit}>
            <label className="rd-label" htmlFor="rd-email">E-mail</label>
            <input
              id="rd-email"
              className="rd-input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <label className="rd-label" htmlFor="rd-password">Senha</label>
            <input
              id="rd-password"
              className="rd-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            {error && (
              <div className="rd-auth__error" role="alert">{error}</div>
            )}

            <button className="rd-btn rd-btn--block" type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
