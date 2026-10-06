# Mercado Radar — Auditoria funcional do Cargoos

## Escopo

Auditoria baseada nas funcionalidades publicamente apresentadas no site da Cargoos e na listagem oficial da extensão na Chrome Web Store em 06/10/2026.

Referências públicas:
- https://cargoos.com.br/
- https://cargoos.com.br/calculadora/mercado-livre
- https://chromewebstore.google.com/detail/cargoos-%E2%80%94-intelig%C3%AAncia-pa/hhpmjdebejnbpidgokkeikoainkcmlgi

A meta não é copiar código, identidade visual ou ativos. A meta é cobrir as capacidades úteis e construir uma implementação própria, integrada ao motor financeiro e aos dados do Mercado Radar.

## Matriz de capacidades

| Capacidade observada | Radar | Evolução planejada |
| --- | --- | --- |
| Analytics dentro da busca | Em desenvolvimento | Score, demanda, vendas/mês, faturamento, idade e margem pessoal |
| Filtros avançados laterais | MVP implementado | Score, demanda, vendas, faturamento, idade, frete; depois margem, ROI, concorrência e Momentum |
| Analytics no anúncio | MVP implementado no Side Panel | visitas, vendas, conversão, concorrência, catálogo e tendências |
| Calculadora de lucro | Integrada ao motor Radar | comissão real, frete, imposto, operação, margem, ROI, break-even e preço alvo |
| Clássico x Premium | Motor já existente | comparação instantânea no Side Panel |
| Frete Standard/Flex/Full | Parcial | modalidade, custo, impacto na margem e vantagem logística |
| Impostos configuráveis | Implementado no motor | perfis tributários por workspace |
| Modo reverso / preço ideal | Motor já possui preço mínimo | adicionar alvo de lucro/margem/ROI interativo |
| Break-even | Já existe | exibir no Side Panel |
| Sensibilidade | Planejado | gráfico preço x margem x ROI |
| Cenários | Planejado | conservador/base/agressivo usando evidência real |
| Projeção de caixa | Planejado | diário/mensal por velocidade de venda |
| Payback | Planejado | dias para recuperar capital |
| Estoque necessário | Planejado | cobertura, giro e capital recomendado |
| Média/mediana/faixa de mercado | Já existe no market-scan | levar para extensão |
| Posição frente à concorrência | Parcial | preço, ranking, frete e reputação |
| Buy Box | Planejado | vencedor, requisitos e perda/ganho |
| Price to Win | Planejado | preço necessário sem violar margem mínima |
| Adoção de Full | Planejado | percentual de concorrentes Full |
| Catálogo e sellers | Parcial | tabela completa com preço, volume, reputação e logística |
| Busca por EAN | Já existe no Radar | levar ao Side Panel |
| EAN em lote | Planejado | upload CSV/XLSX + fila + relatório |
| Histórico de consultas | Parcial via snapshots | biblioteca por produto/EAN |
| Geolocalização | Planejado | concentração de sellers/vendas e vantagem logística |
| Tendências de busca | Backend já possui trends | termos do título, posição e tendência |
| Monitoramento contínuo | Planejado | preço, Buy Box, sellers, ranking, demanda |
| Alertas de preço | Planejado | regras por margem, preço e concorrente |
| Product Ads | Planejado | ROAS, ACOS e lucro pós-Ads |
| Multi-conta | Planejado | workspaces + várias contas ML |
| Dashboard web | Já existe | central de histórico e gestão |
| Extensão Chrome | Em desenvolvimento | principal interface operacional |
| Plano Free/Pro | Arquitetura prevista | entitlements server-side |

## Diferenciais próprios do Radar

### 1. Oportunidade para a operação do usuário

O Radar não deve parar em "esse produto vende".
Deve responder:

- com o meu custo, vale entrar?
- qual é o custo máximo de compra?
- qual preço preserva margem e ROI?
- quanto capital preciso?
- quantas unidades devo testar?
- quanto tempo o capital tende a ficar preso?

### 2. Radar Score dividido em componentes

O score final deverá explicar a nota:

- demanda;
- velocidade;
- concorrência;
- saúde financeira;
- aderência de preço;
- logística;
- tendência;
- qualidade da evidência.

Sem score-caixa-preta.

### 3. Radar Momentum

Priorizar crescimento recente em vez de volume histórico acumulado.

Sinais:
- velocidade recente;
- tendência de buscas;
- reviews recentes;
- mudança de concorrentes;
- variação de preço;
- mudança de ranking.

### 4. Price to Win saudável

Não basta calcular o preço para ganhar.
O Radar deve informar:

- preço para competir;
- margem nesse preço;
- ROI nesse preço;
- menor preço permitido pela política do usuário;
- decisão: competir, diferenciar ou abandonar.

### 5. Capital Intelligence

Para cada oportunidade:

- capital para lote teste;
- cobertura de estoque;
- payback estimado;
- retorno por R$ 1.000 investidos;
- risco de encalhe;
- prioridade contra outras oportunidades.

## Ordem de execução

### P0 — Uso diário
1. busca enriquecida;
2. filtros laterais;
3. analytics do anúncio;
4. calculadora;
5. mercado/preço;
6. custo personalizado;
7. salvar/monitorar.

### P1 — Decisão competitiva
1. catálogo;
2. concorrentes;
3. Buy Box;
4. Price to Win;
5. Full/logística;
6. tendências;
7. Radar Momentum.

### P2 — Sourcing em escala
1. EAN;
2. EAN em lote;
3. importação de tabela de fornecedor;
4. custo máximo;
5. ranking de oportunidades;
6. exportação.

### P3 — Operação
1. meus anúncios;
2. Ads;
3. lucro pós-Ads;
4. posição;
5. alertas;
6. estoque/reposição.

### P4 — SaaS
1. autenticação individual;
2. workspace;
3. multi-conta;
4. entitlements;
5. medição de uso;
6. billing;
7. Chrome Web Store;
8. onboarding;
9. telemetria e feature flags.

## Regra de produto

Toda feature competitiva deve responder a uma decisão prática.
Se um dado não muda uma decisão de comprar, precificar, anunciar, repor ou parar, ele não deve ocupar espaço principal na interface.
