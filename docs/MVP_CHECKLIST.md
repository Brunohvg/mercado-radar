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

- [x] Criar recurso Docker Compose para o repositório
- [x] Selecionar a branch `feature/ml-product-intelligence-mvp-v1`
- [ ] Ativar Auto Deploy
- [x] Definir domínio HTTPS
- [ ] Confirmar PostgreSQL saudável
- [ ] Confirmar `/api/health` retornando OK

### Aplicação Mercado Livre

- [x] Criar/configurar aplicação no DevCenter
- [ ] Habilitar leitura
- [ ] Habilitar PKCE
- [x] Cadastrar Redirect URI HTTPS exata
- [x] Copiar Client ID
- [x] Copiar Client Secret
- [x] Configurar `MERCADO_LIVRE_CLIENT_ID` no Coolify
- [x] Configurar `MERCADO_LIVRE_CLIENT_SECRET` no Coolify
- [x] Configurar `MERCADO_LIVRE_REDIRECT_URI` no Coolify
- [ ] Redeploy

## 5. Smoke test v0.1

Executar estes testes na ordem:

- [ ] Abrir desktop e conferir layout
- [ ] Abrir mobile e conferir responsividade
- [ ] Testar análise real do Ilhós nº54
- [ ] Testar análise real do Arame encapado 10 m
- [x] Conectar a conta Mercado Livre
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


## 8. Inteligência de mercado

- [x] Buscar anúncios comparáveis no Mercado Livre
- [x] Filtrar por categoria e similaridade de título
- [x] Penalizar divergência de quantidade/modelo numérico
- [x] Consultar preço atual pela API de preços quando disponível
- [x] Excluir anúncios da própria conta
- [x] Calcular mínimo / P25 / mediana / P75 / máximo
- [x] Comparar preço saudável com faixa do mercado
- [x] Calcular Fit Score
- [x] Calcular custo máximo de compra na mediana do mercado
- [x] Gerar orientação de próxima ação
- [x] Persistir snapshot no PostgreSQL
- [ ] Validar comparáveis do Ilhós nº54
- [ ] Validar comparáveis do Arame encapado
- [ ] Ajustar heurísticas após os primeiros testes reais


## 9. Próxima feature oficial — Sales Intelligence

Após validar a inteligência de mercado com produtos reais, a próxima feature será transformar a conta conectada em um painel operacional de vendas.

Escopo:
- [ ] sincronizar pedidos existentes da conta conectada;
- [ ] processar notificações `orders_v2`;
- [ ] buscar detalhes completos do pedido;
- [ ] relacionar pedido, item, variação e envio;
- [ ] capturar tarifa e custo real de envio da venda;
- [ ] cadastrar/vincular custo de compra por SKU;
- [ ] calcular lucro real por venda;
- [ ] calcular margem real por produto;
- [ ] dashboard Hoje / 7 dias / 30 dias;
- [ ] produtos mais lucrativos e menos lucrativos;
- [ ] alertas de margem ruim;
- [ ] base para reposição inteligente de estoque.

Objetivo da feature: responder não apenas "vale vender?", mas também "o que realmente está dando dinheiro depois que vendeu?".

## 10. IA no MVP

- [ ] camada `AIProvider` desacoplada;
- [ ] usar somente opção gratuita ou self-hosted;
- [ ] IA para enriquecer entrada e explicar análises;
- [ ] nenhuma tarifa, frete, custo ou venda pode ser inventada pela IA;
- [ ] aplicação deve continuar 100% funcional sem IA.
