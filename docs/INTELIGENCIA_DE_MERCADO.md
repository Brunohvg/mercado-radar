# Inteligência de mercado: evidência e limites

Atualizado em 16/10/2026 para a revisão 0.11.0 da web e da extensão.

O Radar mantém leituras datadas de páginas abertas pelo usuário e separa essas observações de pedidos e métricas autorizados da própria conta.

| Dado                       | Fonte utilizável                                    | Apresentação                                                 |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| Preço atual público        | DOM do anúncio/card aberto                          | Valor lido e horário                                         |
| `+N vendidos`              | Texto do ML                                         | Acumulado com limite inferior, sem período ou teto inventado |
| Nota e avaliações          | Página do produto                                   | Não são vendas do vendedor nem visitas                       |
| Unidades em período        | Pedidos sincronizados da própria conta              | Exige janela recente e completa                              |
| Variação de contador exato | Duas leituras datadas do mesmo contador             | Média observada no intervalo, não previsão                   |
| Idade                      | Data conhecida da API                               | Sem inferência por número MLB/MLBU                           |
| Visitas                    | Recurso oficial autorizado e período correspondente | Sem derivação por uma taxa de conversão presumida            |
| Faixa de preço             | Três ou mais anúncios equivalentes selecionados     | Amostra datada, com origem e revisão de kit/medida/condição  |

A leitura de mercado tem três camadas:

- **Demanda medida:** pedidos próprios em janela válida ou evolução de contador exato; baixa <0,7/dia, média de 0,7 a <3, alta de 3 a <10, excelente ≥10. Zero medido prevalece sobre um grande acumulado. Média desde criação só aceita idade API e contador exato, com rótulo histórico.
- **Demanda histórica:** triagem explícita por volume quando não há ritmo. Até 99 vendidos: faixa baixa/inicial; 100–499: média; 500–4.999: alta; 5.000+: excelente. São faixas operacionais de triagem, sem calibração por categoria nem validação preditiva. Um `+N` classifica somente uma faixa mínima; o total real pode ser maior. Um anúncio novo com poucas vendas recebe potencial **Em formação**, sem afirmar baixo giro atual. Avaliações e selos não fornecem vendas por dia.
- **Potencial de mercado:** forte/bom para volumes altos, moderado para intermediários, em formação ou dados parciais. Ritmo recente baixo recebe **Pouco giro**. Nota abaixo de 4 com pelo menos 10 avaliações sinaliza atenção à qualidade. Não avalia lucro nem garante venda. A conclusão financeira continua dependente de custo, tarifas, frete, imposto, operação e metas; prejuízo não é encoberto por sinal público favorável.

`vendidos × preço atual` aparece como **receita de referência**: projeção bruta do acumulado ao preço de hoje. Não comprova faturamento histórico recebido. `+N` mantém limite inferior, sem teto inventado. A abreviação de valores mínimos arredonda para baixo para não aumentar o piso observado. Sem período, esse valor não é dividido em dias ou meses.

O modelo canônico está em `lib/market-assessment.ts`. `npm run build:market-model` gera `extension/market-model.js`; teste verifica igualdade do asset e das leituras web/extensão. Build e empacotamento regeneram o asset.

Na pesquisa oficial, zero da oferta consultada não cai para o total do catálogo. Contadores de catálogo não herdam idade do anúncio vencedor; uma oferta fallback não herda vendas de outro vencedor. A resposta informa a origem do contador e, quando existe ritmo medido, `measurementDays`. A interface distingue **total do catálogo** de **acumulado do anúncio**.

Na tela Mercado, demanda e receita de referência permanecem visíveis, com filtros por faixa/potencial/logística/origem, ordenação, cards ou tabela e comparação factual de até quatro produtos. Comparação lado a lado não declara equivalência nem calcula mediana de itens misturados. A amostra da listagem é limitada a 200 resultados; não é o total do marketplace nem a quantidade de monitoramentos ativos.

A versão anterior tentava inferir vendas por avaliações, visitas por conversão calibrada e idade por sequência numérica. Essas heurísticas foram retiradas do fluxo ativo por não sustentarem a precisão que a interface sugeria.

## Persistência e isolamento

- `MarketItem` e snapshots pertencem ao workspace.
- MLB de anúncio, MLBU de User Product e catálogo são identificados separadamente no adaptador da página. IDs de recomendações não fornecem a identidade da página aberta.
- A análise ativa registra os cards/anúncio da aba ativa quando autenticada; o cálculo local de referência continua disponível sem autenticação. Não há robô navegando por páginas fechadas.
- Monitoramento `PAGE` acompanha novas visitas com o painel aberto. Monitoramento `API` depende de recursos autorizados e do agendador.
- Contadores desconhecidos e limites inferiores não são usados como deltas exatos de vendas.

## Arquivos

- `extension/selectors.js`: leitura de DOM.
- `extension/content.js`: contexto por aba e lançador isolado.
- `extension/sidepanel.js`: leitura, comparação e simulação.
- `lib/market-assessment.ts`: classificação e referência pública compartilhadas.
- `lib/opportunity-evidence.ts`: separação entre oferta, vencedor e catálogo.
- `lib/market-estimates.ts`: regras de evidência temporal.
- `lib/market-intel.ts`: persistência e consulta por workspace.
- `lib/page-watchlist.ts`: acompanhamento por leitura.

Veja [mapa de APIs e permissões](MERCADO_LIVRE_API_MAP.md) e [instalação e QA](../extension/README.md).
