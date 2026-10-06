# Mercado Radar — Extensão Chrome (MVP)

A extensão roda como **unpacked extension** durante o desenvolvimento. Não precisa estar publicada na Chrome Web Store.

## 1. Baixar a branch

No terminal:

```bash
git fetch origin --prune
git switch feature/chrome-extension-radar-v1
git pull --ff-only origin feature/chrome-extension-radar-v1
```

A pasta que o Chrome deve carregar é:

```text
mercado-radar/extension
```

Não carregue a raiz inteira do repositório.

## 2. Instalar no Chrome

1. Abra `chrome://extensions/`.
2. Ative **Modo do desenvolvedor** no canto superior direito.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `extension` do projeto.
5. Fixe **Mercado Radar** na barra do Chrome se quiser acesso rápido.
6. Ao clicar no ícone da extensão, o Side Panel deve abrir.

Depois de alterar arquivos da extensão, volte a `chrome://extensions/` e clique em **Recarregar** no card do Mercado Radar.

## 3. Testar com backend local

A versão de desenvolvimento aceita:

- `http://localhost/*`
- `http://127.0.0.1/*`

Na raiz do projeto:

```bash
npm install
npm run db:generate
npm run db:deploy
npm run dev
```

Por padrão o Next.js abre em:

```text
http://localhost:3000
```

Abra o Side Panel da extensão, expanda **Configuração da extensão** e use:

```text
URL da API: http://localhost:3000
Chave: deixe vazia em desenvolvimento
```

Importante: o arquivo `.env` local precisa ter as mesmas configurações necessárias para o Radar funcionar, incluindo PostgreSQL e integração Mercado Livre.

## 4. Testar contra radar.optarys.com.br

Se esta branch estiver implantada no servidor de teste/produção, configure no backend:

```text
RADAR_EXTENSION_API_KEY=<uma-chave-privada-longa>
```

No Side Panel:

```text
URL da API: https://radar.optarys.com.br
Chave da extensão: a mesma chave configurada no servidor
```

Não compartilhe essa chave. Ela é temporária para o MVP. Antes da distribuição pública será substituída por login, token por usuário/dispositivo e entitlements por plano.

## 5. Aplicar a migration do monitoramento

Esta branch adiciona:

- `RadarWatchItem`
- `RadarWatchSnapshot`

Em ambiente implantado:

```bash
npm run db:deploy
```

A migration criada é:

```text
202610061730_radar_watchlist
```

## 6. Fluxo de teste

### Busca

1. Abra uma pesquisa no Mercado Livre.
2. Exemplo: `cola quente`.
3. Aguarde a extensão enriquecer os cards.
4. Confira:
   - Radar Score;
   - demanda;
   - vendas/mês;
   - faturamento/mês;
   - idade;
   - filtros laterais Radar.

### Anúncio

1. Abra um anúncio.
2. Clique no ícone Mercado Radar.
3. O Side Panel deve exibir:
   - preço;
   - tipo;
   - score;
   - demanda;
   - vendas;
   - faturamento estimado;
   - Buy Box quando disponível;
   - tendências;
   - calculadora de rentabilidade.

### Monitoramento

1. No Side Panel clique em **Monitorar este anúncio**.
2. Abra no Radar:
   `/monitoramento`
3. O item deve aparecer na watchlist.
4. Clique **Atualizar agora** para criar um novo snapshot.
5. O Radar compara preço, score, vendidos e visitas com os snapshots anteriores.

## 7. Problemas comuns

### A extensão aparece, mas não traz dados

Verifique primeiro:
- API configurada no Side Panel;
- backend rodando;
- Mercado Livre conectado no Radar;
- migration aplicada;
- chave correta se estiver usando produção.

### Alterei o código e nada mudou

Em `chrome://extensions/`, clique em **Recarregar** no Mercado Radar e atualize a aba do Mercado Livre.

### Erro 401

Em produção, a chave da extensão está ausente ou diferente da configurada em `RADAR_EXTENSION_API_KEY`.

### Erro de banco envolvendo RadarWatchItem

A migration do monitoramento ainda não foi aplicada. Rode `npm run db:deploy`.

## Segurança do MVP

- OAuth e tokens do Mercado Livre não entram na extensão.
- A extensão conversa somente com a API do Radar.
- Regras financeiras permanecem no backend.
- A chave global é provisória e não será usada na versão comercial.
