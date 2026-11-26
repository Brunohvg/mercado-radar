# Mercado Radar — auditoria visual da extensão no Mercado Livre
Data: 05/11/2026 (revisão do código), branch `feature/ai-listing-assistant-v1`.
Base avaliada: extensão **0.11.0**, Manifest V3, código da branch de trabalho.

## Escopo e evidência

Inspecionados: `extension/content.js`, `extension/selectors.js`, `extension/sidepanel.{html,js}`, `extension/ui/sidepanel.css`, `extension/manifest*.json` e `tests/extension-browser.mjs`.

CI da branch (HEAD `558afe1eb3066b459ed4404a0c6ec6b07abb02b8`) concluído com **success** em https://github.com/Brunohvg/mercado-radar/actions/runs/42150982785, contendo Playwright e testes de layout da extensão em fixtures locais.

**Limite importante:** não foi feito um smoke test visual com o Mercado Livre real nesta auditoria. O ambiente local não conseguiu alcançar github.com por rede, mas o GitHub conectado permitiu leitura de fontes e evidências de CI. Os testes existentes executam páginas de exemplo; não comprovam compatibilidade com todos os layouts vivos.

## Diagnóstico de risco

| Região | Situação observada no código | Interferência possível | Priorização |
| --- | --- | --- | --- |
| Busca: cards | bloco de indicadores após o título; `fit` marca cards e grade; `ensureCardStyle` altera `height`, `max-height`, `grid-auto-rows` e `grid-template-rows` com `!important` | nova distribuição de linhas em layouts não reconhecidos, cartões mais altos e elementos deslocados | **Alta** — testar layouts novos e remover overrides globais evitáveis |
| Busca: faixa superior | bloco antes dos resultados via `contextualSearchAnchor` | muda altura vertical acima dos cards, embora não deva alterar colunas | Média — tornar colapsável/compacta |
| Página de produto | painel inserido perto do preço usando `contextualProductAnchor` e Shadow DOM | desloca conteúdo vertical perto de compra; depende do template da página | **Alta** — verificar compra, frete, variações, sticky bar e catálogo real |
| Botão flutuante | botão R fixo em `right:20px; bottom:24px; z-index:2147483000` | pode ficar sobre controle fixo/nativo ou atendimento, principalmente em janelas estreitas | **Alta** — posição configurável ou auto-reposicionamento + teste de sobreposição |
| Atualização dinâmica | `MutationObserver` observa toda a página e reavalia após debounce de 500 ms | custo extra de CPU em scroll infinito, páginas com renderização dinâmica e filtragem | Média — limitar ao container de resultados quando possível e medir chamadas |
| Painel lateral | CSS exclusivo em documento da extensão, tokens próprios | não injeta estilos no Mercado Livre; risco apenas de densidade visual dentro do painel | Baixa — hierarquia simplificada e ações prioritárias |
| Navegador | extensão 0.11.0 usa Manifest V3 e `selectors.js` centraliza seletores | variação de layout pode fazer o card/painel não aparecer | Média — fallback não intrusivo e healthcheck |

## Proteções já existentes

- Shadow DOM isola os estilos dos widgets.
- Os testes existentes verificam largura dos cards e fotos inalteradas, botão nativo de compra clicável, ausência de duplicação, tratamento de mudanças de preço, e restauração de atributos/alturas ao ocultar a análise.
- Há opção **Ocultar análise na página**, que remove os ajustes visuais e preserva extensão/painel lateral.
- `selectors.js` concentra heurísticas para facilitar atualização quando o Mercado Livre mudar.
- A extensão 0.11.0 não envia tokens do Mercado Livre ao navegador e usa rotas do backend autorizadas.

## Refinamentos recomendados — priorizados

1. **P0 visual:** automatizar detector de colisões da UI do Radar com botões nativos e garantir modo de análise compacta ou opção `somente painel lateral`.
2. **P0 compatibilidade:** fixtures representativas de lista clássica, grid `poly-card`, página com catálogo MLBU, compra fixa, variações e filtros; validar viewport 320, 375, 390, 768 e desktop. Anexar screenshots antes/depois.
3. **P0 comportamento:** em layout desconhecido, falhar de modo seguro: manter painel lateral e não mexer em regras da grade nativa.
4. **P1 UX:** reduzir indicadores duplicados e deixar informações secundárias atrás de `Detalhes`; CTA `Preparar anúncio no Radar` abre fluxo revisável no painel.
5. **P1 performance:** limitar mutações e chamadas por navegação/aba, medir latência de busca e observar re-render.
6. **P1 publicação:** quando entrar o assistente com IA, nenhum botão da extensão publica, edita preços ou cadastra imagens no ML sem confirmação no backend.

## Critério de aprovação da extensão aprimorada

- Nenhum botão nativo do ML deixa de ser clicável.
- Nenhuma foto, título, preço ou atributo nativo é alterado pelo Radar.
- Não há scroll horizontal inesperado nem cards sobrepostos.
- Pesquisa + produto, desktop + janela estreita, online + API restrita, ocultar/restaurar funcionam.
- CI e regressão Playwright verdes **e** smoke visual no site real antes de distribuição pública.
- Atualização separada da extensão no Chrome, compatível com o backend implantado.

**Conclusão:** o desenho atual é razoavelmente isolado e já testado em fixtures, mas o risco não é zero. O ajuste prioritário é reduzir os overrides de grade e tratar colisões da UI flutuante. Não promover a extensão para produção até validar em páginas reais.
