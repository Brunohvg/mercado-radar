# Mercado Radar — Roadmap da Extensão

## Visão

A extensão é a camada operacional do Mercado Radar dentro do Mercado Livre.
O dashboard web continua como fonte de verdade para histórico, custos, produtos, vendas, fornecedores, alertas e decisões.

Objetivo comercial futuro: vender acesso ao Radar como SaaS, com planos e recursos liberados por assinatura.

## Princípios

- A extensão nunca concentra regras financeiras críticas.
- Toda regra de margem, ROI, comissão, frete, score e autorização fica na API do Radar.
- O navegador renderiza dados e coleta contexto da página.
- Nenhuma credencial do Mercado Livre vai para a extensão.
- Recursos premium são controlados no servidor.
- O sistema deve suportar multiusuário, multiloja e limites por plano sem reescrever a extensão.

## Fase 1 — Fundação funcional

- [x] Branch própria da extensão.
- [x] Manifest V3.
- [x] Content script no Mercado Livre.
- [x] Side Panel.
- [x] Endpoint seguro da extensão.
- [x] Enriquecimento inicial dos cards de busca.
- [x] Radar Score inicial.
- [x] Demanda, velocidade de vendas e idade do anúncio.
- [x] Detectar preço visível do card e usar no enriquecimento.
- [x] Exibir faturamento estimado no card.
- [~] Tratar layouts alternativos e catálogo (fallback por título/preço + suporte inicial a MLBU no anúncio).
- [ ] Testes de seletores do Mercado Livre.

## Fase 2 — Página do produto

- [x] analytics do anúncio;
- [x] preço atual;
- [x] vendas estimadas;
- [x] visitas;
- [x] idade do anúncio;
- [x] tipo do anúncio;
- frete;
- seller;
- [x] comparação com faixa de mercado;
- botão Adicionar ao Radar;
- botão Eu vendo este produto;
- [x] abrir Side Panel já no produto atual.

## Fase 3 — Calculadora no Side Panel

- [x] puxar preço automaticamente;
- [x] custo de compra;
- [x] desconto do fornecedor;
- [x] kit;
- [x] Clássico/Premium;
- [x] comissão real;
- [x] frete estimado;
- [x] imposto configurável;
- [x] custo operacional;
- [x] lucro;
- [x] margem;
- [x] ROI;
- [x] break-even no motor;
- [x] preço mínimo saudável;
- [x] preço do anúncio puxado automaticamente;
- [x] salvar simulação no histórico do Radar.

## Fase 4 — Inteligência de busca

- Radar Score;
- demanda;
- faturamento estimado;
- velocidade de vendas;
- idade do anúncio;
- catálogo/tradicional;
- frete grátis;
- [x] filtros Radar iniciais;
- [x] ordenar por oportunidade;
- [x] ordenar por vendas;
- [x] ordenar por margem do usuário;
- ordenar por menor concorrência;
- [x] Radar Momentum baseado em histórico monitorado.
- [x] ordenar por faturamento;
- [x] ordenar por anúncios mais novos;

## Fase 5 — Concorrência

- relacionar concorrente ao produto próprio;
- VOCÊ x CONCORRENTE;
- diferença de preço;
- diferença de frete;
- diferença de reputação;
- [x] impacto de igualar preço;
- [x] margem mínima;
- [x] recomendação de manter/reduzir/aumentar;
- monitorar concorrente.

## Fase 6 — Meus anúncios

- [x] posição por consulta comparável;
- [x] histórico de posição via MarketSnapshot;
- preço;
- vendas;
- visitas;
- conversão;
- lucro;
- margem;
- [x] Ads — leitura inicial Product Ads;
- [x] ROAS;
- [x] ACOS;
- [x] lucro conhecido depois de Ads, com cobertura explícita;
- [~] orgânico x patrocinado via métricas de Ad Group;
- [x] recomendação de preço saudável.

## Fase 7 — Monitoramento

- [x] histórico de preço via snapshots do monitoramento;
- novos concorrentes;
- queda de posição;
- alteração de frete;
- alteração de catálogo;
- variação de demanda;
- [x] alertas de preço, score e demanda;
- [x] watchlist;
- [x] snapshots manuais;
- [x] endpoint seguro para snapshots automáticos por cron.

## Fase 8 — Produto comercial

Backend:
- usuários;
- organizações/workspaces;
- múltiplas contas ML;
- autenticação;
- sessões;
- roles;
- subscription;
- entitlement por feature;
- usage metering;
- limites por plano;
- auditoria;
- rate limit;
- revogação remota.

Planos possíveis:
- Free: score e poucas análises/mês;
- Pro: calculadora, busca enriquecida e monitoramento;
- Business: múltiplas contas, equipe, Ads e automações.

A extensão deve receber do backend apenas as capabilities liberadas para a conta.

## Fase 9 — Distribuição

- Chrome Web Store;
- onboarding;
- login;
- telemetry sem dados sensíveis;
- feature flags;
- canal beta;
- atualização automática;
- política de privacidade;
- termos;
- página de assinatura.

## Fase 10 — Diferenciais próprios

- score personalizado pelo custo real do usuário;
- fornecedor + desconto;
- custo máximo de compra;
- oportunidade para minha operação;
- Radar Momentum;
- comparação de kits;
- preço recomendado;
- capital necessário;
- retorno projetado;
- descoberta de oportunidades;
- assistente IA apoiado nos dados reais do Radar.

## Arquitetura alvo

Mercado Livre
→ Chrome Extension
→ Mercado Radar API
→ Auth / Entitlements / Rate Limit
→ Motor financeiro e inteligência
→ Mercado Livre API
→ PostgreSQL
→ Workers
→ Dashboard web

A extensão é um cliente do produto, não o produto inteiro.


## Auditoria competitiva

A matriz detalhada das capacidades públicas observadas no Cargoos e a evolução equivalente/mais inteligente do Radar está em `docs/CARGOOS_FEATURE_AUDIT.md`.

Regra: replicar capacidades úteis, não código, identidade visual ou ativos de terceiros.


## Progresso adicional — 06/10/2026

### Dashboard web
- [x] Visual System v3 claro e unificado.
- [x] Sidebar recolhível com persistência local.
- [x] Dashboard executivo.
- [x] Produtos em tabela operacional.
- [x] Anúncios.
- [x] Fornecedores.
- [x] Monitoramento.

### Extensão
- [x] Instalação unpacked documentada em `extension/README.md`.
- [x] Backend local permitido no Manifest para desenvolvimento.
- [x] Botão Monitorar este anúncio.
- [x] Faixa de mercado P25 / mediana / P75.
- [x] Concorrentes próximos.
- [x] Simulação financeira no preço da Buy Box ou P25.
- [x] Recomendação para não entrar em guerra de preço quando a margem não fecha.

### Próxima sequência
1. [x] margem personalizada diretamente nos cards de busca;
2. [x] estratégia de preço competitivo saudável com margem mínima;
3. [x] concorrentes enriquecidos com score, demanda e velocidade;
4. [x] Radar Momentum baseado em snapshots;
5. [x] monitoramento automático e alertas;
6. [x] EAN em lote;
7. [x] Ads / lucro pós-Ads inicial;
8. [ ] multi-conta, autenticação individual e planos.

### Entregas adicionais desta rodada
- [x] EAN/GTIN em lote com validação de checksum;
- [x] importação CSV/TXT no navegador;
- [x] faixa de preços por EAN e exportação CSV;
- [x] Product Ads no fluxo atual de campanhas + Ad Groups;
- [x] ROAS, ACOS, TACOS, CTR, CVR e receita atribuída;
- [x] lucro conhecido da operação após descontar investimento Ads;
- [x] cobertura de lucro exibida para evitar falsa precisão.

### Próxima sequência comercial
1. autenticação individual da aplicação e extensão;
2. workspaces;
3. múltiplas contas Mercado Livre;
4. capabilities/entitlements por plano;
5. medição de uso;
6. limites e rate limiting;
7. billing;
8. onboarding e publicação na Chrome Web Store.


## Progresso — Anúncios e Ads

- [x] painel inline por anúncio com posição, P25, mediana e gap de preço;
- [x] histórico de posição e preço em MarketSnapshot;
- [x] estratégia de preço saudável direto na tela de Anúncios;
- [x] concorrentes próximos no detalhe do anúncio;
- [x] Product Ads com lucro conhecido pós-Ads por operação;
- [x] lucro pós-Ads por produto quando o Ad Group pode ser relacionado ao anúncio;
- [x] recomendação de orçamento: escalar, manter, reduzir, revisar/pausar ou coletar mais dados;
- [x] recomendação condicionada à cobertura de custos para evitar decisões com falsa precisão.


## Radar de Oportunidades v2

A tela antiga baseada em tendências semanais deixou de ser o fluxo principal.

### Implementado
- [x] busca direta independente de trends;
- [x] fallback quando a categoria prevista tem baixa aderência;
- [x] matching com penalidade para modelo/medida/quantidade incompatível;
- [x] preço atual com fallback controlado;
- [x] vendidos, visitas e idade do anúncio;
- [x] visitas/dia, vendas/dia, vendas/mês e faturamento/mês marcados como estimativa;
- [x] P25, mediana e P75;
- [x] concorrência por quantidade de vendedores;
- [x] Full e Flex;
- [x] catálogo/tradicional;
- [x] posição real na busca;
- [x] ranking de mais vendidos quando o highlight oficial permite relacionar o anúncio;
- [x] Radar Score explicável;
- [x] indicador de qualidade dos dados;
- [x] filtros laterais completos;
- [x] filtro de relevância do comparável;
- [x] filtro de mais vendidos;
- [x] monitoramento em um clique;
- [x] degradação graciosa quando uma fonte secundária falha.

Metodologia: `docs/OPPORTUNITY_RADAR.md`.
