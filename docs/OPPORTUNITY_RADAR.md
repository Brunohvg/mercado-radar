# Radar de Oportunidades v2

## Objetivo

O Radar de Oportunidades deve funcionar mesmo quando o endpoint de tendências do Mercado Livre estiver indisponível.

A busca direta é a fonte principal. Tendências são somente atalhos de descoberta.

## Fluxo

1. usuário pesquisa um produto;
2. Radar prevê uma categoria;
3. busca anúncios no Mercado Livre;
4. valida relevância de título/modelo/medida;
5. se a categoria prevista tiver baixa aderência, repete a busca sem restringir categoria;
6. lê detalhes dos anúncios em lote;
7. consulta preço atual;
8. consulta visitas;
9. consulta ranking de mais vendidos da categoria quando disponível;
10. calcula distribuição de preço;
11. calcula Radar Score e qualidade da evidência;
12. aplica filtros e ordenação no cliente;
13. permite abrir análise financeira ou monitorar o anúncio.

## Dados tratados como reais

Quando retornados pela API do Mercado Livre:

- preço atual;
- vendidos acumulados;
- visitas acumuladas;
- data de criação;
- tipo do anúncio;
- catálogo / tradicional;
- frete grátis;
- logística Full/Flex;
- posição da busca retornada;
- posição em mais vendidos quando o highlight permite relacionar ITEM, PRODUCT ou USER_PRODUCT.

## Dados estimados

São sempre marcados como estimativa:

- vendas por dia;
- vendas por mês;
- faturamento por dia;
- faturamento por mês.

Estimativa base atual:

```text
vendas/dia = vendidos acumulados / idade do anúncio
vendas/mês = vendas/dia * 30
faturamento = vendas estimadas * preço atual
```

Essa estimativa representa ritmo histórico médio. Não deve ser apresentada como venda recente oficial.

## Match de comparáveis

O match considera:

- cobertura das palavras relevantes;
- tokens críticos que contêm números/modelos/medidas;
- posição original da busca;
- categoria prevista como ajuda, nunca como verdade absoluta.

Se tokens críticos como `54`, `1000`, `20w` ou outro identificador do termo não aparecem no título, o comparável recebe penalidade forte.

## Radar Score

Score de 0 a 100, explicável na interface.

Componentes:

- demanda: 34%;
- velocidade: 24%;
- relevância: 16%;
- preço frente à mediana: 11%;
- logística: 5%;
- qualidade da evidência: 10%.

O usuário consegue abrir “Por que essa nota?” em cada card.

## Qualidade da evidência

O Radar mede disponibilidade dos sinais usados.

Alta confiança não significa que a venda mensal seja oficial.
Significa que há dados suficientes para que a estimativa seja mais defensável.

A interface deve sempre separar:

- dado do anúncio;
- ritmo histórico;
- estimativa.

## Filtros

- demanda;
- Radar Score;
- relevância;
- vendas/mês;
- faturamento/mês;
- idade;
- evidência;
- Full;
- Flex;
- frete grátis;
- catálogo;
- mais vendidos.

Ordenações:

- melhor oportunidade;
- vendas/mês;
- faturamento/mês;
- mais novos;
- menor preço;
- posição da busca;
- ranking mais vendidos.

## Monitoramento

Qualquer resultado pode ser enviado para a watchlist.

Ao monitorar:
- cria RadarWatchItem;
- cria snapshot inicial;
- passa a participar do Radar Momentum;
- pode gerar alertas de preço, score e demanda.

## Regra de produto

Não bloquear a página porque uma fonte secundária falhou.

Exemplos:
- trends falhou -> busca continua;
- highlights falhou -> resultado continua sem ranking;
- prices falhou -> usa preço do detalhe ou busca e reduz cobertura de preço exato;
- visits falhou -> score continua com evidência menor.

A prioridade é degradação graciosa, não tela vazia.
