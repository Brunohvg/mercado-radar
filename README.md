# Mercado Radar

Painel próprio para decidir **o que comprar, quanto pagar, por quanto vender e quanto realmente sobra** em uma operação no Mercado Livre.

## Direção do produto

O Mercado Radar é um sistema completo, não um conjunto de automações externas.

As integrações, cálculos, sincronizações, regras de preço, histórico, alertas e decisões ficam versionadas dentro do próprio projeto. Processos assíncronos serão executados por workers nativos usando PostgreSQL como fonte de verdade.

## MVP atual

- cálculo do custo real após desconto do fornecedor;
- kits;
- comissão;
- tarifa fixa;
- custo de frete do vendedor;
- custo operacional;
- valor recebido;
- lucro;
- margem;
- ROI;
- preço de equilíbrio;
- preço mínimo para atingir meta de margem + ROI;
- classificação automática;
- OAuth Mercado Livre em evolução;
- interface visual-first.

A interface foi preparada para substituir os campos manuais pelos dados reais da API do Mercado Livre.

## Stack

- Next.js 16
- React 19
- TypeScript
- PostgreSQL 17
- Prisma 7
- workers nativos da aplicação
- Docker / Docker Compose
- Coolify

## Desenvolvimento

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npm run db:deploy
npm run dev
```

## Coolify

O repositório segue o mesmo padrão dos demais apps:

1. recurso do tipo **Docker Compose**;
2. branch de desenvolvimento: `feature/ml-product-intelligence-mvp-v1`;
3. deploy automático ao receber push nessa branch;
4. domínio apontado para o serviço `app`, porta 3000;
5. PostgreSQL persistido em `postgres-data`;
6. migrations executadas automaticamente no start do container;
7. healthcheck em `/api/health`.

Variáveis automáticas do Coolify utilizadas:

- `SERVICE_LOWERCASEUSER_POSTGRES`
- `SERVICE_PASSWORD_64_POSTGRES`
- `SERVICE_REALBASE64_64_ENCRYPTION`
- `SERVICE_URL_APP_3000`

Variáveis externas:

- `MERCADO_LIVRE_CLIENT_ID`
- `MERCADO_LIVRE_CLIENT_SECRET`
- `MERCADO_LIVRE_REDIRECT_URI`

## Regras iniciais

- margem boa: >= 20%;
- margem mínima: 15%;
- ROI alvo: >= 30%;
- ROI abaixo de 20%: produto reprovado;
- desconto Bibelô padrão: 35%, sempre editável.

Esses limites serão configuráveis.

## Roadmap

- [x] Infraestrutura deployável no Coolify
- [x] Motor financeiro inicial
- [x] Analisador manual
- [x] Base visual profissional
- [ ] OAuth Mercado Livre completo
- [ ] Tarifas e frete via API
- [ ] Comparação Clássico x Premium
- [ ] Simulação automática de kits
- [ ] Worker nativo de sincronização
- [ ] Importação de pedidos e lucro real
- [ ] Estoque e alertas
- [ ] Radar de oportunidades
