# Mercado Radar — Design System

## Direção visual

O produto deve parecer uma ferramenta de inteligência comercial, não um painel administrativo genérico.

A referência é uma mistura de dashboard SaaS premium e terminal financeiro moderno: escuro, limpo, visual, com números fortes e decisões fáceis de enxergar.

## Personalidade

- precisa;
- premium;
- rápida;
- visual;
- técnica sem parecer complicada.

## Linguagem

- navy quase preto no fundo;
- painéis azul petróleo translúcidos;
- verde menta apenas para resultado saudável;
- azul claro para informação e ação;
- âmbar para atenção;
- coral para risco/prejuízo;
- tipografia com números grandes e hierarquia clara.

## Componentes-chave

### KPI Cards
Valor grande, contexto pequeno e tendência quando houver histórico.

### Decision Card
Resultado deve ser visual e imediato:
- COMPENSA;
- APERTADO;
- NÃO COMPENSA;
- SOMENTE EM KIT;
- REPRECIFICAR.

### Opportunity Score
Score 0–100 decomposto em margem, ROI, concorrência, demanda, frete e capital necessário.

### Price Ladder
Comparação entre custo, preço mínimo, preço recomendado, mediana do mercado e preço do líder.

### Kit Matrix
Comparação visual de 1, 2, 3, 5 e 10 unidades.

### Profit Waterfall
Venda → tarifa → frete → custo → lucro.

## Regras

1. Nenhum número importante fica escondido em tooltip.
2. Cada tela responde uma pergunta principal.
3. Verde só significa saudável.
4. Vermelho só significa risco ou prejuízo.
5. Preferir cards, barras, escalas e gráficos a tabelas gigantes.
6. Mobile deve continuar funcional, não apenas caber.
7. Evitar aparência de template administrativo genérico.
8. Toda feature nova precisa ter desenho visual antes de entrar no produto.

## Telas planejadas

- Dashboard executivo
- Analisador de produto
- Comparador Clássico × Premium
- Simulador de kits
- Radar de oportunidades
- Produtos e estoque
- Vendas e lucro real
- Integrações
- Configurações de margem e fornecedor


## Visual System v3 — decisão de 06/10/2026

A direção visual anterior escura foi aposentada para o dashboard principal porque gerava excesso de contraste, muitos blocos competindo e pouca sensação de produto operacional.

### Nova direção

- base clara e neutra;
- cards brancos;
- bordas discretas;
- verde vivo reservado para seleção, saúde e ação positiva;
- tipografia escura de alto contraste;
- hierarquia visual mais simples;
- menos gradientes e menos efeitos decorativos;
- tabelas compactas para operação;
- cards apenas para resumo e decisão;
- bastante espaço em branco;
- menus e controles com aparência leve de SaaS moderno.

### Sidebar

A sidebar passa a ser peça estrutural do produto:

- grupos de navegação;
- ícones consistentes;
- item ativo com fundo verde suave;
- conta conectada no rodapé;
- botão de recolher;
- modo recolhido em aproximadamente 82 px;
- no modo recolhido ficam logo, ícones, avatar e botão de expandir;
- o estado recolhido é persistido localmente no navegador;
- em mobile a sidebar continua abrindo completa, nunca em modo ícones.

### Dashboard

O dashboard principal deve abrir direto no operacional, não em uma landing page.

Prioridade visual:
1. pedidos;
2. faturamento;
3. ticket médio;
4. lucro realizado;
5. saúde do negócio;
6. capital e estoque;
7. produtos que exigem ação.

### Produtos

A tela de produtos passa a usar tabela operacional como visual principal:
- produto;
- tipo de anúncio;
- SKU;
- fornecedor;
- estoque;
- preço;
- margem;
- ação do Radar;
- editor inline de custo e fornecedor.

### Regra visual

Nenhuma tela nova deve reintroduzir o estilo escuro legado. Componentes antigos devem ser migrados gradualmente para o Visual System v3.


## Visual System v3.1 — identidade própria

A referência externa ajudou a identificar problemas de hierarquia, mas o Mercado Radar não deve usar o mesmo verde-lima nem depender da mesma aparência.

### Tipografia

Stack sem download externo, priorizando qualidade no Windows e macOS:

```text
"Segoe UI Variable Text", "Inter", "Segoe UI", system-ui, sans-serif
```

Headings usam peso intermediário, tracking negativo leve e tamanhos maiores.
O objetivo é leitura de produto SaaS, não aparência de painel técnico.

### Cor principal

A identidade migrou do verde-lima para **esmeralda/teal**:

- accent: `#18967A`
- accent strong: `#0F725E`
- accent soft: `#E7F6F1`
- text: `#17342D`
- background: `#F7F9F8`

O verde mais vivo fica restrito a sinais positivos e não domina toda a interface.

### Página Anúncios

A tela passa a ser uma central de decisão, com:

- total de anúncios;
- anúncios ativos;
- ticket médio do período;
- score médio operacional;
- filtros de status/canal/score;
- ordenação por score, vendas e preço;
- canal Catálogo x Tradicional;
- MLB + User Product;
- margem;
- Radar Score por anúncio.

### Radar Score do anúncio

Score transparente de 0 a 100:

- status: 10;
- custo cadastrado: 15;
- margem: 30;
- vendas recentes: 20;
- cobertura de estoque: 15;
- visibilidade: 10.

A UI deve explicar o score e evitar métricas inventadas. Por exemplo, não calcular "conversão" usando visitas de vida inteira com vendas de somente 30 dias.
