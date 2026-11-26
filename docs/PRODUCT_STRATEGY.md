# Mercado Radar — Estratégia de Produto

## Posicionamento

O Mercado Radar não deve ser um clone do Seller Center nem um ERP genérico.

A proposta é:

> **Copiloto de compra e rentabilidade para quem revende no Mercado Livre.**

O Mercado Livre continua sendo onde o usuário vende. O Radar é onde ele decide:

- o que comprar;
- quanto pagar;
- quanto cobrar;
- se o preço cabe no mercado;
- quanto realmente lucrou;
- se deve repor;
- quanto capital deve colocar no produto;
- quando deve reduzir ou parar.

## Os quatro pilares

### 1. Sourcing

Pergunta principal:

> **O que comprar e quanto pagar?**

Entregas:
- identificação por nome/EAN/GTIN;
- faixa de preço de mercado;
- tendências e oportunidades;
- comparáveis;
- teto de compra;
- custo máximo para meta de margem/ROI;
- validação antes de colocar dinheiro em estoque.

### 2. Pricing

Pergunta principal:

> **Por quanto vender sem destruir margem?**

Entregas:
- tarifa e frete reais da conta;
- preço mínimo;
- preço sugerido;
- Clássico × Premium;
- posição versus mercado;
- estratégia de kit quando fizer sentido.

### 3. Profit

Pergunta principal:

> **Quanto realmente sobrou depois da venda?**

Entregas:
- faturamento;
- tarifa realizada;
- frete realizado;
- custo do produto;
- custos operacionais;
- lucro realizado;
- margem realizada;
- comparação previsto × realizado.

### 4. Capital & Estoque

Pergunta principal:

> **Repor, reduzir ou parar?**

Entregas:
- estoque;
- velocidade de saída;
- cobertura em dias;
- capital necessário;
- reposição sugerida;
- produtos que consomem capital sem retorno suficiente.

## Regra de priorização

Uma feature só merece prioridade quando melhora pelo menos uma destas decisões:

1. comprar;
2. precificar;
3. medir lucro;
4. alocar capital/estoque.

Se apenas repetir informação que o Mercado Livre já mostra, ela não deve ocupar espaço principal no produto.

## Regra de UX

> **Se uma informação puder ser descoberta com segurança, o Radar não deve pedir que o usuário digite.**

Prioridade:
1. API oficial;
2. catálogo/fornecedor;
3. histórico próprio;
4. cálculo determinístico;
5. inferência sinalizada;
6. entrada manual apenas como fallback.

## Produtos e Vendas

As telas Produtos e Vendas existem para alimentar decisões.

### Produtos não é catálogo administrativo

Deve evoluir para:
- margem;
- posição de preço;
- giro;
- cobertura;
- capital preso;
- recomendação de reposição.

### Vendas não é lista de pedidos

Deve evoluir para:
- lucro real;
- margem real;
- causas de diferença;
- ranking por lucro;
- previsto × realizado.

## O que não priorizar no MVP

- mensagens/perguntas;
- emissão fiscal;
- gestão de publicação em massa;
- ERP genérico;
- duplicação de telas do Seller Center;
- repricing totalmente automático;
- multi-tenant antes de validar valor.

## North Star do MVP

O produto precisa ser claramente melhor que:

> Mercado Livre + calculadora + planilha + pesquisa manual.

Se uma análise não economiza tempo, reduz erro ou melhora uma decisão financeira, ela não é prioridade.
