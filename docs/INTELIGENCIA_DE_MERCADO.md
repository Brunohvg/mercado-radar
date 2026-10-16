# Inteligência de mercado: evidência e limites

Atualizado em 16/10/2026 para a extensão 0.10.1.

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

Sem evidência de ritmo, a classificação de demanda recente e o score ficam ausentes; o card ainda apresenta o acumulado como sinal público. Não há “demanda baixa” só porque um produto mostra poucos vendidos. O cálculo `vendidos × preço atual` aparece como **faturamento de referência**, com fórmula visível e limite inferior para `+N`. Ele não comprova faturamento histórico: preços e condições podem ter mudado. Sem período, essa referência não é dividida arbitrariamente em dias ou meses.

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
- `lib/market-estimates.ts`: regras de evidência temporal.
- `lib/market-intel.ts`: persistência e consulta por workspace.
- `lib/page-watchlist.ts`: acompanhamento por leitura.

Veja [mapa de APIs e permissões](MERCADO_LIVRE_API_MAP.md) e [instalação e QA](../extension/README.md).
