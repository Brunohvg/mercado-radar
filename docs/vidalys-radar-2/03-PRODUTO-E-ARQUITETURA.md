# Etapa 3: produto e arquitetura

## Proposta

**Vidalys Radar: encontre o produto, encontre o fornecedor, descubra sua margem.**
Para o pequeno vendedor brasileiro que precisa saber *onde comprar* antes de saber *quantos gráficos* o produto tem.

## Jornada e onde cada passo vive

| Passo | Pergunta | Implementação |
| --- | --- | --- |
| 1. Encontre | Que produto é este? | Extensão lê o anúncio → `lib/sourcing/identity.ts` extrai marca, modelo, GTIN, quantidade por pacote |
| 2. Localize | Quem vende para revenda? | `lib/sourcing/search.ts`: consultas pela marca, exclusão de varejo, busca web opcional (Brave) e links de busca manual |
| 3. Qualifique | Posso confiar e consigo comprar? | `lib/sourcing/cnpj.ts` (BrasilAPI) + `lib/sourcing/qualification.ts` (critérios do brief, cada um confirmado / a confirmar / não atende) |
| 4. Margem | Sobra dinheiro? | `lib/sourcing/viability.ts`: custo entregue por unidade → motor existente `lib/profitability.ts` |
| 5. Plano | Quanto compro e quanto arrisco? | `viability.ts`: lote mínimo, capital, ponto de equilíbrio em unidades, risco |
| 6. Venda | — | Reaproveita assistente de anúncio e monitoramento existentes |
| Radar por capital | Tenho R$ X, o que cabe? | `lib/sourcing/capital.ts` filtra oportunidades com cotação pelo capital, perfil de fornecedor e margem |

## Modelo de dados (aditivo, isolado por workspace)

- `SourcingOpportunity`: produto em estudo (identidade, preço de referência do mercado e sua origem, custos de venda, orçamento, status: pesquisando → cotando → viável/descartada → comprando).
- `SourcingSupplier`: ficha do fornecedor reutilizável (tipo, CNPJ, contato, UF, atende CPF, exige CNPJ, emite NF, pedido mínimo, prazo, verificação de CNPJ com data e fonte).
- `SourcingQuote`: cotação ligada a fornecedor + oportunidade (preço unitário, unidades por embalagem, mínimo, frete, outros custos, **origem**: cotação recebida / preço publicado / estimativa do usuário, data e validade).

Campos desconhecidos ficam `null` e aparecem como "a confirmar". Nunca viram zero.

## Regras de honestidade

1. Fornecedor só aparece como "encontrado" se veio de uma fonte (busca, ML, cadastro do usuário). Nada é inventado.
2. Toda cotação mostra a origem e a data. "Estimativa do usuário" nunca é apresentada como cotação.
3. CNPJ ativo ≠ fornecedor confiável. A ficha separa cadastro de reputação.
4. Margem sem cotação aparece como "sem custo confirmado", não como número.

## API

Painel (sessão web, isolada por workspace): `/api/sourcing/opportunities`, `/api/sourcing/opportunities/[id]`, `/api/sourcing/opportunities/[id]/search`, `/api/sourcing/suppliers`, `/api/sourcing/suppliers/[id]`, `/api/sourcing/suppliers/[id]/cnpj`, `/api/sourcing/quotes`, `/api/sourcing/quotes/[id]`, `/api/sourcing/capital`.
Extensão (Bearer por dispositivo): `POST /api/extension/sourcing` cria a oportunidade a partir do anúncio aberto.

## Telas

- `/onde-comprar`: lista de oportunidades + Radar por capital.
- `/onde-comprar/[id]`: abas **Mercado · Fornecedores · Margem · Plano**, com a "próxima ação recomendada" fixa no topo.
- Extensão: nova aba **Fornecedores** no painel lateral.

## Fora desta entrega

Busca automática de produtos por categoria (exige base de catálogo própria), Shopee/Amazon, cobrança, INPI.
