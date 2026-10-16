# Mercado Radar

**Copiloto de compra e rentabilidade para quem revende no Mercado Livre.** Decide o que comprar, quanto pagar, quanto cobrar, quanto realmente sobrou e onde vale colocar capital.

## Direção do produto

O Mercado Radar não é um clone do Seller Center. Produtos e Vendas existem para gerar decisão, não para repetir telas do Mercado Livre.

## Os quatro pilares

1. **Sourcing** — o que comprar e quanto pagar;
2. **Pricing** — por quanto vender sem destruir margem;
3. **Profit** — quanto realmente sobrou;
4. **Capital & Estoque** — repor, reduzir ou parar.

O Mercado Radar é um sistema completo, não um conjunto de automações externas.

As integrações, cálculos, sincronizações, regras de preço, histórico, alertas e decisões ficam versionadas dentro do próprio projeto. Processos assíncronos serão executados por workers nativos usando PostgreSQL como fonte de verdade.

## Piloto para clientes

A preparação comercial está em `feature/radar-commercial-readiness-v1`: login individual, dados por operação, metas financeiras, central de decisões e gestão de acessos. Consulte [preparação comercial](docs/COMMERCIAL_READINESS.md) para implantação, validações e limites. Billing e lançamento público ainda dependem dos gates documentados.

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
- OAuth Mercado Livre conectado;
- interface visual-first;
- inteligência de mercado com anúncios comparáveis;
- faixa de preços P25/mediana/P75;
- fit score financeiro + mercado;
- cálculo do custo máximo de compra para competir;
- snapshots históricos de mercado.

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

Antes do primeiro login local, configure `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (gerado por `scripts/hash-password.mjs`) e `APP_ENCRYPTION_KEY`. O painel usa autenticação também em desenvolvimento.

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
- margem de 10% até atingir as metas: apertada;
- margem abaixo de 10% ou prejuízo: revisar;
- ROI alvo: >= 30%, configurável por operação;
- fornecedor e desconto são configuráveis; nenhum fornecedor é fixo no produto.

Metas, imposto, desconto, operação e prazos são configuráveis em **Metas e configurações**.

## Roadmap

- [x] Infraestrutura deployável no Coolify
- [x] Motor financeiro inicial
- [x] Analisador manual
- [x] Base visual profissional
- [x] OAuth Mercado Livre
- [x] Tarifas e frete via API
- [x] Comparação Clássico x Premium
- [x] Simulação inicial de kits
- [x] Rotas separadas para análise, oportunidades, produtos, vendas e integrações
- [x] Busca por nome + EAN/GTIN + scanner de câmera quando suportado
- [x] Importação de pedidos
- [x] Custo real de envio por shipment
- [x] Lucro e margem realizados quando os custos estão completos
- [x] Product Health inicial com giro, cobertura e reposição
- [x] Inteligência de mercado e fit score
- [x] Tendências semanais + evidência de mais vendidos
- [ ] Webhook orders_v2 processado automaticamente
- [ ] histórico previsto × realizado
- [ ] lead time de fornecedor e estoque de segurança configurável

## Próximo foco

Validar em produção os cinco fluxos reais: busca/scan, análise, oportunidades, lucro realizado e Product Health. Depois disso, fechar processamento automático de `orders_v2`, previsto × realizado e reposição com lead time.

A camada de IA do MVP terá custo zero: apenas provedor gratuito ou modelo self-hosted, sempre opcional e desacoplado do motor financeiro.

## Documentação de desenvolvimento

Antes de implementar qualquer feature, consulte:

- `docs/PRODUCT_STRATEGY.md` — posicionamento, pilares e regra de priorização;
- `docs/FEATURES.md` — catálogo e ordem oficial das features inteligentes;
- `docs/DEVELOPMENT_CHECKLIST.md` — checklist obrigatório de implementação, teste e deploy;
- `docs/QUALITY_GATES.md` — bloqueios de qualidade que impedem tratar uma feature como pronta;
- `docs/ARCHITECTURE.md` — arquitetura e responsabilidades;
- `docs/DESIGN_SYSTEM.md` — regras visuais;
- `docs/AI_STRATEGY.md` — uso de IA sem comprometer os dados financeiros;
- `docs/MVP_CHECKLIST.md` — validação específica do MVP.

Regra: uma feature escrita no código não é automaticamente concluída. O status só avança após CI verde, deploy saudável e validação real quando aplicável.

## Testes

```bash
npm test
npm run typecheck
npm run build
```

Testes de integração exigem banco isolado e `RADAR_TEST_DATABASE=1`; veja `.github/workflows/ci.yml`.

## Extensão 0.9.0 e APIs por cliente

A revisão de 16/10/2026 oferece análise automática no produto, com classificação de demanda/oportunidade, tarifas, repasse e simulação no próprio anúncio. O custo de anúncio próprio pode ser recuperado por vínculo exato. Menu rápido, painel lateral e atalhos na busca continuam disponíveis. Os cards nativos preservam dimensões e conteúdo; a lista do Radar permite filtrar e ordenar. IDs MLB/MLBU são separados e as fontes ficam explícitas, sem estimativas sem evidência. Monitoramento público funciona por novas leituras; comparação exige amostra revisada; a calculadora permite custos e tarifas manuais identificados.

- [Instalação, atualização e validação da extensão](extension/README.md)
- [Mapa de APIs, grants, limitações e prioridades de integração](docs/MERCADO_LIVRE_API_MAP.md)
- [Preparação comercial e homologação](docs/COMMERCIAL_READINESS.md)

Atualize o backend e os arquivos da extensão para a mesma branch. Depois recarregue a extensão e as abas do Mercado Livre.
