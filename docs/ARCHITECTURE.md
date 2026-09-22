# Mercado Radar — Arquitetura

## Objetivo

Transformar a decisão de compra para revenda em um fluxo orientado por dados:

1. custo real do fornecedor;
2. tarifa real do Mercado Livre;
3. custo de frete da conta;
4. preço praticado no mercado;
5. lucro, margem e ROI;
6. decisão: testar, reprecificar, vender em kit ou descartar.

## Stack

- Next.js 16 + React 19 + TypeScript
- PostgreSQL 17
- Prisma 7
- n8n para sincronizações e alertas
- Docker Compose
- Coolify com deploy automático a partir do GitHub

## Responsabilidades

### Next.js
Interface, autenticação futura, regras de negócio, APIs internas e integrações síncronas.

### PostgreSQL
Produtos, análises, snapshots, pedidos, custos, sincronizações e histórico de decisões.

### n8n
Orquestração assíncrona:
- sincronizar pedidos;
- atualizar custos reais de envio;
- alertar estoque baixo;
- recalcular produtos após mudanças;
- gerar resumos periódicos.

Regra: lógica financeira fica no código da aplicação, não espalhada em nodes do n8n.

## Etapas

### Fase 1
Calculadora de rentabilidade + infraestrutura Coolify.

### Fase 2
OAuth Mercado Livre, listing_prices, custos de envio e simulador Clássico/Premium.

### Fase 3
Pedidos, lucro real, estoque, reposição e alertas.

### Fase 4
Radar de oportunidades e comparação de kits/faixa de mercado.
