# Mercado Radar — Arquitetura

## Objetivo

Transformar a decisão de compra para revenda em um fluxo orientado por dados:

1. custo real do fornecedor;
2. tarifa real do Mercado Livre;
3. custo de frete da conta;
4. preço praticado no mercado;
5. lucro, margem e ROI;
6. decisão: testar, reprecificar, vender em kit ou descartar.

## Princípio central

A aplicação é a fonte de verdade.

Não haverá dependência de n8n para regras de negócio ou sincronizações críticas. O Mercado Radar terá seu próprio núcleo de jobs e integrações, permitindo testes, versionamento, observabilidade e deploy junto com o restante do sistema.

## Stack

- Next.js 16 + React 19 + TypeScript
- PostgreSQL 17
- Prisma 7
- workers nativos Node.js
- Docker Compose
- Coolify com deploy automático a partir do GitHub

## Responsabilidades

### Web / API

- interface;
- autenticação;
- analisador de produtos;
- APIs internas;
- OAuth Mercado Livre;
- consultas síncronas;
- dashboards.

### Core de negócio

- rentabilidade;
- precificação;
- kits;
- score de oportunidade;
- políticas de margem e ROI;
- comparação Clássico x Premium.

A regra financeira não depende da camada de interface nem do worker.

### PostgreSQL

- produtos;
- análises;
- snapshots;
- pedidos;
- custos;
- estoque;
- histórico de preços;
- histórico de decisões;
- jobs e execuções.

### Worker nativo

Responsável por tarefas assíncronas:

- sincronizar pedidos;
- atualizar custo real de envio;
- renovar dados da conta;
- recalcular rentabilidade;
- acompanhar estoque;
- gerar alertas;
- atualizar oportunidades.

Jobs devem ser idempotentes, observáveis e protegidos contra execução duplicada.

## Direção de infraestrutura

No início, web e banco são suficientes para o MVP.

Quando as sincronizações entrarem em produção, será adicionado um serviço `worker` ao mesmo Docker Compose, usando a mesma imagem e o mesmo banco. Isso mantém o deploy simples no Coolify sem introduzir uma segunda plataforma de automação.

## Etapas

### Fase 1
Calculadora de rentabilidade + infraestrutura Coolify + sistema visual.

### Fase 2
OAuth Mercado Livre, listing_prices, custos de envio e simulador Clássico/Premium.

### Fase 3
Worker nativo, pedidos, lucro real, estoque, reposição e alertas.

### Fase 4
Radar de oportunidades, histórico de mercado e comparação automática de kits.


### Inteligência de mercado

O Radar não trata preço financeiro isoladamente como decisão final.

Fluxo:

```text
produto + custo
    ↓
categoria ML
    ↓
tarifa + frete reais
    ↓
preço financeiramente saudável
    ↓
busca de anúncios comparáveis
    ↓
preços atuais /items/{id}/prices
    ↓
P25 / mediana / P75
    ↓
Fit Score + poder de compra
    ↓
orientação de próxima ação
```

O Fit Score combina saúde financeira, posição do preço e qualidade da evidência.
Ele não representa previsão de vendas nem demanda futura.

Cada leitura de mercado é persistida como `MarketSnapshot` para permitir histórico e evolução do Radar.
