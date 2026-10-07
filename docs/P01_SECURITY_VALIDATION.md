# P01 — Segurança e confiabilidade

Data: 2026-10-07

## Variáveis de ambiente de produção

Obrigatórias:

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `APP_ENCRYPTION_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH`
- `MERCADO_LIVRE_CLIENT_ID`
- `MERCADO_LIVRE_CLIENT_SECRET`
- `MERCADO_LIVRE_REDIRECT_URI`
- `RADAR_CRON_SECRET`

Opcional:

- `RADAR_EXTENSION_SIGNING_KEY` — se ausente, usa `APP_ENCRYPTION_KEY`.

A chave global antiga `RADAR_EXTENSION_API_KEY` não é usada pela autenticação atual da extensão.

## Gerar ADMIN_PASSWORD_HASH

Com as dependências instaladas:

```bash
node -e "import('bcryptjs').then(async ({default:b}) => console.log(await b.hash('TROQUE_PELA_SENHA', 12)))"
```

Salve apenas o hash em `ADMIN_PASSWORD_HASH`.

## Gate web

`proxy.ts` exige cookie administrativo assinado para páginas e APIs privadas.

Exceções intencionais:

- `/login`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/health`
- `/api/extension/**` — Bearer próprio da extensão
- `/api/cron/**` — secret próprio
- `/api/integrations/mercadolivre/authorize`
- `/api/integrations/mercadolivre/callback`
- `/api/webhooks/mercadolivre` — callback server-to-server do Mercado Livre
- assets estáticos

## Conta Mercado Livre por contexto

O Proxy injeta `x-radar-account-id` somente depois de validar a sessão.

`getMlSession()`:
1. usa o accountId autenticado quando presente;
2. sem accountId, aceita somente quando existe exatamente uma conta conectada;
3. com múltiplas contas sem contexto, falha explicitamente;
4. nunca escolhe "a conta mais recente".

## Refresh token

O Mercado Livre usa refresh token de uso único. O backend usa lock em memória por accountId e relê a conta depois de adquirir o lock antes de renovar.

## Resiliência da API ML

`jsonFetch`:
- até 3 tentativas em 429/5xx;
- respeita `Retry-After`;
- backoff exponencial + jitter;
- não repete 400/401/403/404;
- OAuth token exchange/refresh não faz retry automático;
- até 4 chamadas simultâneas por token/conta;
- cache de 60 s para GET de `/items/bulk`, `/visits/items` e `/products/{id}`;
- `searchMarketplace` não repete a chamada sem token.

## Extensão

A busca usa:
- observer apenas do container de resultados;
- detecção de mudança de URL por intervalo leve;
- nós próprios marcados com `data-radar-owned="1"`;
- dedupe por hash de query + IDs visíveis;
- debounce de 800 ms;
- uma chamada em voo;
- observer pausado durante reordenação de cards.

## Instalador de desenvolvimento

`/api/extension/dev-installer` retorna 404 em produção.

## Validação manual

1. Aba anônima: abrir `/api/ml/products` → deve responder 401.
2. Abrir `/login`, entrar e repetir `/api/ml/products` → deve responder normalmente.
3. Na busca do Mercado Livre, DevTools > Network: `/api/extension/search` deve ocorrer uma vez por conjunto de resultados e só repetir quando query/IDs mudarem.
4. Forçar token ML próximo da expiração e disparar duas leituras simultâneas: deve haver uma única renovação por processo.
5. Em produção, `/api/extension/dev-installer` → 404.
