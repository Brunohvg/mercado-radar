# Mercado Radar — Estratégia de IA

## Princípio

IA ajuda a reduzir digitação e organizar informação. Ela não é a fonte de verdade para números financeiros.

Custos, tarifas, frete, preço de compra, peso e dimensões devem vir de:
- API do Mercado Livre;
- fornecedor;
- catálogo integrado;
- usuário.

## Onde IA faz sentido

Um provedor como Grok, OpenAI ou outro modelo pode ser usado para:

- limpar e normalizar o nome do produto;
- extrair marca, modelo, quantidade e variação de uma descrição;
- sugerir palavras-chave para busca de concorrentes;
- comparar anúncios semelhantes;
- resumir por que um produto parece ou não interessante;
- explicar margem, ROI e risco em linguagem simples;
- sugerir quais dados ainda faltam para uma análise confiável.

## Onde IA não deve inventar

Nunca preencher silenciosamente como fato:

- preço de compra;
- desconto do fornecedor;
- peso;
- dimensões;
- tarifa do Mercado Livre;
- custo de frete;
- vendas;
- preço de concorrente.

Quando houver inferência, a interface deve mostrar claramente "sugestão" e pedir confirmação.

## Arquitetura

A camada de IA será independente do provedor:

```text
AIProvider
├── Grok
├── OpenAI
└── outros
```

O motor financeiro continuará determinístico e testável.

## Ordem de implementação

1. validar custos reais do Mercado Livre;
2. validar sugestão de preço;
3. buscar faixa de mercado;
4. adicionar assistente de IA para enriquecer a entrada e explicar decisões.

Assim a IA melhora a experiência sem comprometer a confiabilidade financeira.


## Restrição de custo

Durante o MVP, a camada de IA deve ter **custo zero**.

Regras:
- não depender de API paga;
- aceitar somente provedor com uso gratuito suficiente para o MVP ou modelo self-hosted;
- manter a interface `AIProvider` desacoplada para trocar de provedor sem alterar o motor financeiro;
- se a cota gratuita acabar, o sistema continua funcionando sem IA;
- nenhuma decisão financeira crítica depende da disponibilidade do modelo.

A IA é complementar. O núcleo do Radar continua funcionando apenas com dados reais do Mercado Livre e regras determinísticas.
