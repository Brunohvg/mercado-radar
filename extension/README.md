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
- `RadarAlert`
- metadados de catálogo/User Product nos anúncios

Em ambiente implantado:

```bash
npm run db:deploy
```

As migrations desta etapa incluem:

```text
202610061730_radar_watchlist
202610061750_listing_metadata
202610061820_radar_alerts
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
   - filtros laterais Radar;
   - botão **Calcular minha margem**;
   - margem e lucro usando o custo do produto correspondente na sua operação;
   - filtro/ordenação por margem e ROI;
   - Momentum quando já houver histórico monitorado.

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
   - calculadora de rentabilidade;
   - produto próprio compatível e custo conhecido, quando existir;
   - P25, mediana e P75;
   - concorrentes enriquecidos com score, demanda e velocidade;
   - estratégia de preço competitivo saudável;
   - alerta quando perseguir o concorrente quebraria sua margem.

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


## 8. Monitoramento automático

O Radar possui um endpoint protegido para criar snapshots sem abrir o dashboard:

```text
POST /api/cron/radar-monitoring
```

No servidor configure:

```text
RADAR_CRON_SECRET=<uma-chave-privada-diferente-da-chave-da-extensao>
```

Exemplo de chamada pelo agendador do servidor:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $RADAR_CRON_SECRET" \
  https://radar.optarys.com.br/api/cron/radar-monitoring
```

Uma execução por hora é suficiente para o MVP.

O monitoramento cria snapshots e alertas quando houver mudança relevante de:
- preço;
- Radar Score;
- nível de demanda.

O **Radar Momentum** só sai do estado `Aprendendo` quando existe janela histórica suficiente. Isso evita transformar duas leituras feitas em poucos minutos em uma falsa tendência.

## 9. Margem personalizada na busca

Na busca do Mercado Livre clique em **Calcular minha margem**.

O Radar:
1. procura entre seus anúncios o produto mais compatível com a pesquisa;
2. exige confiança mínima no match;
3. usa o custo real cadastrado;
4. simula os preços encontrados usando a estrutura do seu próprio anúncio;
5. adiciona margem/lucro aos cards;
6. libera filtros **Minha margem** e **Meu ROI**.

Se a confiança for insuficiente, o Radar não aplica custo de outro produto silenciosamente.
