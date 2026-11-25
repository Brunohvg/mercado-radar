# Vidalys Radar 2.0 — Etapa 1: auditoria do repositório

Data: 25/11/2026. Branch de trabalho: `claude/vidalys-radar-2`.

## Topologia real das branches

As cinco branches de feature não são linhas paralelas: formam uma cadeia.

```
main (1 commit, só README)
 └ ml-product-intelligence-mvp-v1   208 commits · 22/09  motor financeiro, OAuth ML, produtos, vendas
    └ chrome-extension-radar-v1      473 commits · 07/10  extensão MV3, login, segurança do painel
       └ radar-commercial-readiness-v1 501 commits · 16/10  workspaces, extensão 0.11.0 (UX aprovada)
          ├ radar-intelligence-v1     +6 commits  · 23/10  concorrentes, kits, rascunhos de pesquisa
          └ ai-listing-assistant-v1   +161 commits · 06/11  assistente de anúncio com IA, modo convidado, extensão 0.12.4
```

## Decisão

Base da branch nova: `ai-listing-assistant-v1` (a ponta mais avançada, contém todas as anteriores) + merge de `radar-intelligence-v1`.
Os conflitos foram só de configuração (env, compose, CI e relação no schema) e mantêm os dois lados. Nada foi reescrito.

Reconstruir do zero não se justifica: há ~60 mil linhas com testes, OAuth e cálculo de tarifa/frete já conferidos contra a API oficial.

Linha de base verificada no merge `e9cc5f7`: `typecheck` ok, 105 testes de regra passando.

## O que já existe e será reaproveitado

| Área | Onde | Uso no 2.0 |
| --- | --- | --- |
| Motor de margem (comissão, tarifa fixa, frete, imposto, ROI, preço mínimo) | `lib/profitability.ts`, `lib/price-strategy.ts` | Base da etapa "Descubra sua margem" com custo entregue do fornecedor |
| Leitura do anúncio na página do ML | `extension/selectors.js`, `product-analysis.js` | "Produto identificado" (marca, modelo, GTIN quando houver) |
| Mercado: P25/mediana/P75, comparáveis, demanda pública | `lib/market-*.ts` | Aba Mercado |
| Kits e concorrentes | `lib/kit-optimizer.ts`, `lib/competitor-*.ts` | Plano de compra por lote |
| Rascunhos isolados por workspace | `RadarResearchDraft` | Padrão para "Oportunidade salva" |
| Autenticação, workspaces, cota da extensão | `proxy.ts`, `lib/workspace-auth.ts` | Sem mudança |
| Tokens de design centralizados | `app/styles/tokens.css`, `extension/ui/tokens.css` | Troca de marca por tokens, sem reescrever CSS |

## O que falta (o coração do 2.0)

1. **Não existe busca de fornecedores.** A página `/fornecedores` só agrupa os produtos pelo nome de fornecedor digitado à mão.
2. Não há ficha de fornecedor, evidências, CNPJ, pedido mínimo ou exigência de CNPJ.
3. Não há "custo entregue" (preço + frete do fornecedor + impostos) ligado à margem.
4. Não há fluxo "capital disponível → oportunidade".

## Problemas encontrados

- **Marca verde confunde com resultado.** `--brand: #18967a` é o mesmo verde de `--ok`. O próprio `DESIGN_SYSTEM.md` diz "verde só significa saudável", e a marca viola isso. Resolvido na etapa 4.
- Nome antigo "Mercado Radar" em manifest, painel e textos.
- `README` de `main` aponta para uma branch antiga; `main` não tem código.
- Ordem das migrations: `202610231800_intelligence_drafts` é anterior às de novembro. Num banco que já rodou a branch de IA, `prisma migrate deploy` aplica a migration pendente normalmente, mas vale conferir no Coolify antes do deploy.
- Pendências herdadas que continuam abertas (registradas em `INTELLIGENCE_V1_AUDIT.md`): jobs sem fila durável, limite de login em memória, `radar-score.ts` com classificação legada.

## Regras herdadas que continuam valendo

`AGENTS.md`: sem mudar OAuth, CSP ou versões de dependências fora de escopo; mudanças aditivas no banco; nenhuma estimativa silenciosa; CI verde não substitui homologação no Mercado Livre.
A regra 9 (preservar a UX 0.11.0) é substituída por pedido explícito do Bruno de reformular marca e experiência; a hierarquia de análise automática é mantida.
