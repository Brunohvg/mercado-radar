# Mercado Radar — Catálogo de Features Inteligentes

Este documento é a fonte de verdade funcional do produto. Toda feature nova deve ser registrada aqui antes de entrar em desenvolvimento.

## Visão do produto

O Mercado Radar é um **copiloto de compra e rentabilidade**, organizado em quatro pilares:

1. **Sourcing** — o que comprar e quanto pagar;
2. **Pricing** — por quanto vender sem destruir margem;
3. **Profit** — quanto realmente sobrou;
4. **Capital & Estoque** — repor, reduzir ou parar.

Produtos e Vendas são fontes para essas decisões, não cópias do Seller Center.

A inteligência do sistema vem de dados reais, regras determinísticas e histórico. IA generativa é uma camada complementar, nunca a fonte de verdade financeira.

---

## F0 — Fundação do produto

### Infraestrutura e segurança
Status: **implementado / em validação**

- Next.js + TypeScript.
- PostgreSQL + Prisma.
- Docker Compose + Coolify.
- migrations automáticas.
- healthcheck aplicação + banco.
- OAuth Mercado Livre com PKCE.
- tokens criptografados.
- refresh token automático.
- redirect público compatível com proxy/Coolify.
- webhook Mercado Livre persistido no PostgreSQL.
- CI com typecheck + build.

### Design System
Status: **implementado e contínuo**

- visual dark premium;
- decisões com hierarquia visual;
- verde apenas para resultado saudável;
- âmbar para atenção;
- vermelho apenas para risco/prejuízo;
- mobile funcional;
- nenhuma feature entra com aparência de template genérico.

---

## F1 — Profitability Engine

Status: **implementado**

Objetivo: calcular a viabilidade financeira de forma determinística.

Entradas:
- custo/tabela do fornecedor;
- desconto;
- quantidade;
- tipo de anúncio;
- comissão;
- tarifa fixa;
- frete;
- custo operacional;
- meta de margem;
- meta de ROI.

Saídas:
- custo líquido;
- custo total do kit;
- valor recebido;
- lucro;
- margem;
- ROI;
- ponto de equilíbrio;
- preço mínimo;
- custo máximo de compra;
- classificação financeira.

Regras:
- nenhuma tarifa ou frete é inventado;
- quando API real estiver disponível, ela prevalece sobre estimativa manual;
- fórmulas financeiras devem ter testes de regressão.

---

## F2 — Price Suggestion Engine

Status: **implementado / validar com casos reais**

Objetivo: sugerir o menor preço saudável para a conta conectada.

Fluxo:
1. custo líquido;
2. categoria;
3. tarifa real;
4. frete real;
5. meta de margem;
6. meta de ROI;
7. busca iterativa;
8. arredondamento comercial em `,90`.

Saída:
- preço sugerido;
- lucro esperado;
- margem;
- ROI;
- tarifa;
- frete.

Importante: preço financeiramente saudável não significa preço competitivo. A decisão final depende do Market Intelligence.

---

## F3 — Listing Strategy

Status: **implementado / validar**

### Clássico × Premium

Regra de produto: **tarifas do Mercado Livre nunca são campos manuais no fluxo principal**. Comissão, tarifa fixa e frete são consultados automaticamente pela API da conta conectada. A interface apenas exibe a origem e os valores retornados.

Compara:
- comissão;
- tarifa fixa;
- frete;
- valor recebido;
- lucro;
- margem.

A interface não deve declarar um tipo como universalmente melhor. Deve mostrar o efeito financeiro na operação analisada.

### Kit Intelligence

Status: **MVP implementado; evolução planejada**

Compara 1 / 2 / 3 / 5 / 10 unidades.

Evolução:
- recalcular frete por kit;
- recalcular preço de mercado por kit;
- detectar quando o produto só fecha em kit;
- evitar usar o mesmo frete para kits maiores sem validação.

---

## F4 — Market Intelligence

Status: **implementado / validação real pendente**

Objetivo: verificar se o preço financeiramente necessário cabe no mercado.

Recursos atuais:
- pesquisa de anúncios comparáveis;
- filtro por categoria;
- similaridade textual;
- penalização por divergência de quantidade/modelo numérico;
- exclusão dos próprios anúncios;
- preço atual pela API de preços quando disponível;
- mínimo;
- P25;
- mediana;
- P75;
- máximo;
- posição do preço analisado;
- custo máximo de compra para competir;
- snapshots históricos;
- orientação de próxima ação.

### Fit Score

O score atual combina:
- saúde financeira;
- posição de preço;
- qualidade da evidência.

O Fit Score **não é previsão de vendas**.

### Decisões possíveis

- boa aderência ao mercado;
- testar com estoque pequeno;
- preço necessário acima do mercado;
- margem insuficiente;
- evidência insuficiente.

---

## F5A — Products Intelligence

Status: **em desenvolvimento — MVP de leitura ativado**

Objetivo: transformar os anúncios da conta conectada em uma visão operacional.

MVP atual:
- [x] listar anúncios da conta;
- [x] usar `/users/{user_id}/items/search`;
- [x] consultar detalhes via `/items/bulk`;
- [x] consultar preço atual pela API de preços;
- [x] estoque;
- [x] quantidade vendida;
- [x] visitas totais;
- [x] status e tipo de anúncio;
- [x] sincronização manual;
- [x] persistência PostgreSQL;
- [ ] visitas por período;
- [ ] conversão por período;
- [ ] margem estimada por SKU;
- [ ] Product Health;
- [ ] cobertura de estoque;
- [ ] alertas de produto.

---

## F5 — Sales Intelligence

Status: **em desenvolvimento — MVP de leitura ativado**

Objetivo: responder **o que realmente está dando dinheiro depois que vendeu**.

### Sincronização
- [x] importar pedidos existentes sob demanda;
- [ ] processar `orders_v2` automaticamente;
- buscar dados completos da venda;
- relacionar item, variação e envio;
- deduplicar eventos;
- reprocessar com segurança.

### Lucro realizado
- preço efetivamente vendido;
- tarifa real;
- custo real de envio;
- custo do produto;
- custo operacional;
- lucro real;
- margem real;
- ROI realizado.

### Dashboard
- hoje;
- 7 dias;
- 30 dias;
- faturamento;
- lucro;
- margem;
- pedidos;
- unidades;
- ticket;
- ranking de produtos;
- produtos com margem ruim.

### Profit Waterfall
Visual:

```text
Venda
 - tarifa
 - frete
 - custo do produto
 - custos operacionais
 = lucro real
```

---

## F6 — Inventory & Replenishment Intelligence

Status: **planejado após Sales Intelligence**

Objetivo: ajudar a comprar a quantidade certa, não apenas decidir o produto.

Recursos:
- estoque atual;
- vendas por período;
- velocidade de saída;
- cobertura em dias;
- ponto de reposição;
- estoque de segurança configurável;
- capital necessário;
- sugestão de reposição;
- alerta de ruptura.

A recomendação deve mostrar a base de cálculo. Não usar linguagem de certeza sobre demanda futura.

---

## F7 — Pricing Intelligence

Status: **planejado**

Objetivo: acompanhar margem e posição de preço ao longo do tempo.

Recursos:
- histórico do próprio preço;
- histórico da mediana de mercado;
- impacto de alteração de preço;
- alerta quando frete/tarifa derruba margem;
- preço mínimo atualizado;
- reprecificação assistida;
- comparação antes/depois.

Regra inicial: nenhuma alteração automática de anúncio sem consentimento explícito.

---

## F8 — Opportunity Radar

Status: **planejado**

Objetivo: transformar análises isoladas em uma fila de oportunidades.

Cada candidato poderá mostrar:
- Fit Score;
- margem;
- ROI;
- posição no mercado;
- custo máximo;
- capital necessário;
- qualidade da evidência;
- risco operacional;
- status da decisão.

Filtros:
- bom para testar;
- somente kit;
- precisa negociar custo;
- reprecificar;
- descartar;
- aguardando dados.

---

## F9 — Supplier Intelligence

Status: **planejado**

Objetivo: separar a lógica do Radar de qualquer fornecedor específico.

Recursos:
- múltiplos fornecedores;
- tabela de preço;
- desconto por fornecedor;
- custo líquido;
- histórico de custo;
- MOQ/lote mínimo;
- prazo;
- frete de compra;
- fornecedor preferencial por SKU;
- comparação de custo entre fornecedores.

Nenhum fornecedor será hardcoded no produto.

---

## F10 — AI Assistant

Status: **planejado; custo zero no MVP**

A IA deve ser opcional e desacoplada.

Usos permitidos:
- normalizar título;
- extrair marca/modelo/quantidade;
- sugerir termos de busca;
- explicar uma análise;
- apontar dados ausentes;
- resumir riscos;
- comparar qualitativamente anúncios já obtidos por APIs;
- gerar uma explicação de próxima ação.

A IA nunca pode inventar como fato:
- custo;
- desconto;
- peso;
- dimensões;
- tarifa;
- frete;
- vendas;
- estoque;
- preço concorrente.

Arquitetura:

```text
AIProvider
├── free cloud provider
├── self-hosted model
└── fallback sem IA
```

Se a IA falhar, o Radar continua operacional.

---

## F11 — Alerts & Decision Inbox

Status: **planejado**

Alertas úteis:
- venda com margem abaixo da meta;
- produto ficou negativo após mudança de frete;
- estoque baixo;
- oportunidade perdeu aderência;
- preço de mercado mudou;
- custo do fornecedor subiu;
- webhook/sincronização falhou.

Evitar excesso de alertas. Só emitir quando houver ação clara.

---

## F12 — History & Learning Layer

Status: **parcialmente iniciado com MarketSnapshot**

Objetivo: aprender com a própria operação sem transformar correlação em promessa.

Histórico:
- análises;
- preços;
- custos;
- concorrentes;
- vendas;
- margens;
- estoque;
- decisões tomadas.

Usos futuros:
- comparar análise prevista × resultado realizado;
- calibrar heurísticas;
- identificar faixas de margem que funcionam melhor;
- medir impacto de kits;
- medir impacto de mudanças de preço.

---

## F13 — SaaS / Multi-tenant

Status: **futuro**

Somente depois da ferramenta funcionar bem para a operação real.

Pré-requisitos:
- isolamento por tenant;
- múltiplas contas ML;
- autenticação de usuários;
- planos;
- limites;
- auditoria;
- segurança de tokens;
- onboarding;
- configuração individual de metas.

Não antecipar complexidade SaaS antes do core provar valor.

---

## Ordem oficial de desenvolvimento

1. validar Market Intelligence com Ilhós e Arame;
2. Sales Intelligence;
3. lucro real por venda/SKU;
4. Inventory & Replenishment;
5. Pricing Intelligence;
6. Opportunity Radar;
7. AI Assistant gratuito;
8. Alerts & Decision Inbox;
9. Supplier Intelligence;
10. histórico/calibração;
11. avaliar multi-tenant/SaaS.

A ordem pode mudar somente quando uma dependência técnica ou dado real justificar a mudança.


---

## F4A — Smart Product Discovery

Status: **implementado / aguardando validação real**

Objetivo: reduzir ao mínimo a digitação no analisador.

Recursos:
- [x] busca por nome;
- [x] busca por EAN/GTIN/código de barras;
- [x] consulta ao catálogo do Mercado Livre;
- [x] detecção automática de categoria;
- [x] pesquisa de anúncios semelhantes;
- [x] faixa de preço praticada;
- [x] inferência de peso e dimensões por embalagens de anúncios semelhantes;
- [x] nível de confiança e tamanho da amostra;
- [x] preenchimento automático no analisador;
- [x] fallback manual somente quando não houver evidência suficiente.

Regra: dimensões inferidas são estimativas. A embalagem real do usuário continua sendo a referência para publicação e logística.

---

## F8A — Weekly Opportunity Radar

Status: **implementado / aguardando validação real**

Objetivo: descobrir candidatos antes de procurar manualmente produtos.

Recursos:
- [x] tendências semanais do Mercado Livre;
- [x] categoria automática;
- [x] mediana de preço;
- [x] inferência de embalagem;
- [x] tarifa e frete da conta;
- [x] teto preliminar de compra para 20% margem e 30% ROI;
- [x] enviar candidato direto ao analisador;
- [ ] adicionar ranking de mais vendidos por categoria como evidência complementar;
- [ ] histórico semanal das oportunidades;
- [ ] filtros por categoria e capital disponível.

O Radar não deve chamar tendência de busca de "mais vendido". Ranking de mais vendidos é uma evidência separada.
