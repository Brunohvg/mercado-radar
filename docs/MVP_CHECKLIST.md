# Mercado Radar — Checklist MVP v0.1

Objetivo: colocar a primeira versão no Coolify e testar com a conta real do Mercado Livre ainda hoje.

## 1. Base técnica

- [x] Repositório `Brunohvg/mercado-radar`
- [x] Branch `feature/ml-product-intelligence-mvp-v1`
- [x] Next.js 16 + React 19 + TypeScript
- [x] PostgreSQL 17
- [x] Prisma 7 + migration inicial
- [x] Dockerfile multi-stage
- [x] Docker Compose para Coolify
- [x] Healthcheck da aplicação + banco
- [x] CI com typecheck e build
- [x] Arquitetura sem n8n
- [x] Design system visual-first

## 2. Motor financeiro

- [x] Custo do fornecedor
- [x] Fornecedor e desconto configuráveis por produto
- [x] Quantidade por kit
- [x] Comissão percentual
- [x] Tarifa fixa
- [x] Frete do vendedor
- [x] Custo operacional
- [x] Valor recebido
- [x] Lucro
- [x] Margem
- [x] ROI
- [x] Ponto de equilíbrio
- [x] Preço mínimo para meta de margem/ROI
- [x] Custo máximo de compra
- [x] Classificação COMPENSA / APERTADO / NÃO COMPENSA
- [x] Simulação de kits 1 / 2 / 3 / 5 / 10

## 3. Mercado Livre API

- [x] Estrutura OAuth 2.0 + PKCE
- [x] Armazenamento criptografado de tokens
- [x] Renovação de access token
- [x] Status da conexão
- [x] Consulta de tarifa por tipo de anúncio
- [x] Consulta de custo de frete da conta
- [x] Comparação Clássico × Premium
- [x] Preditor automático de categoria pelo nome do produto
- [ ] Validar OAuth com a conta real
- [ ] Validar tarifa real contra o simulador do Mercado Livre
- [ ] Validar frete real contra o simulador do Mercado Livre

## 4. Deploy de teste de hoje

### No Coolify

- [ ] Criar recurso Docker Compose para o repositório
- [ ] Selecionar a branch `feature/ml-product-intelligence-mvp-v1`
- [ ] Ativar Auto Deploy
- [ ] Definir domínio HTTPS
- [ ] Confirmar PostgreSQL saudável
- [ ] Confirmar `/api/health` retornando OK

### Aplicação Mercado Livre

- [ ] Criar/configurar aplicação no DevCenter
- [ ] Habilitar leitura
- [ ] Habilitar PKCE
- [ ] Cadastrar Redirect URI HTTPS exata
- [ ] Copiar Client ID
- [ ] Copiar Client Secret
- [ ] Configurar `MERCADO_LIVRE_CLIENT_ID` no Coolify
- [ ] Configurar `MERCADO_LIVRE_CLIENT_SECRET` no Coolify
- [ ] Configurar `MERCADO_LIVRE_REDIRECT_URI` no Coolify
- [ ] Redeploy

## 5. Smoke test v0.1

Executar estes testes na ordem:

- [ ] Abrir desktop e conferir layout
- [ ] Abrir mobile e conferir responsividade
- [ ] Testar análise real do Ilhós nº54
- [ ] Testar análise real do Arame encapado 10 m
- [ ] Conectar a conta Mercado Livre
- [ ] Detectar categoria automaticamente
- [ ] Consultar custos reais do Ilhós
- [ ] Comparar Clássico × Premium do Ilhós
- [ ] Consultar custos reais do Arame
- [ ] Testar kits 1 / 3 / 5
- [ ] Conferir resultado com a calculadora oficial do ML
- [ ] Registrar qualquer diferença de tarifa/frete

## 6. Critério para declarar v0.1 testável

A versão pode ser marcada como `v0.1.0-test` quando:

- CI estiver verde;
- Coolify estiver saudável;
- OAuth conectar sem erro;
- pelo menos 2 produtos reais forem analisados;
- tarifa e frete estiverem compatíveis com o simulador do Mercado Livre;
- Clássico × Premium funcionar;
- desktop e mobile estiverem utilizáveis.

## 7. Depois do primeiro teste

- [ ] Salvar histórico de análises
- [ ] Dashboard executivo real
- [ ] Importar pedidos
- [ ] Calcular lucro real por venda
- [ ] Sincronizar estoque
- [ ] Alertas de reposição
- [ ] Histórico de preços
- [ ] Radar de oportunidades
- [ ] Opportunity Score
- [ ] Worker nativo para sincronizações
