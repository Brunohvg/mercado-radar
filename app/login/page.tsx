type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

const messages: Record<string, string> = {
  invalid_credentials: "E-mail ou senha inválidos.",
  rate_limited: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  multiple_accounts:
    "Há mais de uma conta Mercado Livre conectada e o contexto precisa ser definido antes do login.",
  session_required: "Entre para acessar o Mercado Radar.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/";

  return (
    <main className="login-shell">
      <section className="login-card">
        <img src="/brand/mark.svg" alt="" className="login-mark" />
        <p className="eyebrow">Mercado Radar</p>
        <h1>Acesso administrativo</h1>
        <p>
          Entre para acessar vendas, anúncios, publicidade e dados privados da
          operação conectada.
        </p>

        {params.error && (
          <div className="error">
            {messages[params.error] ?? "Não foi possível entrar."}
          </div>
        )}

        <form action="/api/auth/login" method="post">
          <input type="hidden" name="next" value={next} />

          <label>
            E-mail
            <input
              className="input"
              type="email"
              name="email"
              autoComplete="username"
              required
            />
          </label>

          <label>
            Senha
            <input
              className="input"
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>

          <button className="primary" type="submit">
            Entrar
          </button>
        </form>
      </section>
    </main>
  );
}
