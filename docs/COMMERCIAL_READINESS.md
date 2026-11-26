# Mercado Radar — preparação comercial

Data: 15/10/2026. Base: `feature/chrome-extension-radar-v1` em `809d157`.
Branch de trabalho: `feature/radar-commercial-readiness-v1`.

Status: **implementado / aguardando validação em homologação com Mercado Livre real**.
Este trabalho prepara um piloto com acessos individuais. Não representa lançamento público, integração de cobrança ou aprovação na Chrome Web Store.

## Referências e decisão de produto

Páginas oficiais consultadas em 15/10/2026:

| Referência                                                                                                                   | Capacidade divulgada                                   | Decisão no Radar                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [Cargoos](https://cargoos.com.br/) e [calculadora](https://cargoos.com.br/calculadora/mercado-livre)                         | Extensão, margem, concorrência, EAN e monitoramento    | Manter análise na página e melhorar clareza de custos, origem e decisão          |
| [Real Trends](https://www.real-trends.com/br/Ferramentas)                                                                    | Concorrência, gestão, preços e múltiplas contas        | Priorizar recomendação financeira revisável; sem alteração automática de anúncio |
| [Nubimetrics](https://www.nubimetrics.com/br/product/mercado)                                                                | Oferta, demanda, categorias, tendências e sazonalidade | Não confundir busca ou volume acumulado com venda futura garantida               |
| [Central Real Trends](https://ajuda.real-trends.com/pt-BR/articles/2905851-quais-atividades-dos-meus-concorrentes-posso-ver) | Dados de concorrentes podem ser aproximados            | Preservar indicação de estimativa e qualidade da evidência                       |
| [API de custos](https://developers.mercadolivre.com.br/pt_br/comissao-por-vender)                                            | Tarifas dependem do contexto da venda                  | Cotar novamente quando preço ou logística mudarem                                |
| [API de envios](https://developers.mercadolivre.com.br/pt_br/registre-o-seu-aplicativo/gerenciamento-de-envios)              | Um envio pode conter vários pedidos                    | Conferir membros do envio e ratear custo uma única vez                           |

A hipótese comercial do Radar é ajudar o revendedor a comprar, precificar e repor com lucro. Não copiamos código, marca, imagens ou promessas comerciais dos concorrentes. Geolocalização de vendas de terceiros não foi implementada sem uma fonte verificável.

## O que mudou

- Clientes possuem e-mail, senha, sessão revogável e workspace próprio. O operador cria, suspende e reativa acessos em **Metas e configurações**. Senhas não são enviadas por e-mail automaticamente.
- Cada operação do piloto aceita uma conta Mercado Livre. A seleção da conta é estável e respeita `ADMIN_ML_ACCOUNT_ID` apenas no workspace legado.
- Históricos, SKUs, configurações, leituras de mercado, snapshots e calibração não são globais entre clientes.
- A extensão exige login Radar antes do OAuth ML, com vinculação ao mesmo workspace no início e retorno. Uma conta ML vinculada não pode ser tomada por outro cliente.
- Códigos de autorização têm consumo atômico; refresh tokens usam comparação e atualização atômicas. Limites são conferidos no banco e compartilhados por todos os dispositivos do workspace.
- O painel inicial apresenta decisões priorizadas, cobertura de custos, lucro conhecido antes de Ads, capital conhecido, estoque e ROAS de equilíbrio estimado.
- Perfil financeiro configura imposto, operação por pedido, desconto padrão, metas de margem/ROI, lead time, segurança e cobertura de estoque.
- Vendas têm paginação independente dos totais do período e exportação CSV com proteção contra fórmulas. Pendentes, canceladas e reembolsadas não entram como receita paga normal.
- O menu mobile foi corrigido: overlay abaixo da navegação, sidebar fechada invisível, fechamento ao navegar e por Escape.
- Docker passa a copiar `public/` explicitamente, preservando fontes e identidade visual. Instalação usa lockfile.

## Regras financeiras

1. Margem inferior a 10% ou prejuízo: revisar. De 10% até atingir as metas: apertado. Compensa quando margem e ROI alcançam as metas configuradas (padrões 20% e 30%). ROI baixo não transforma sozinho uma margem positiva em prejuízo.
2. Imposto desconhecido não vira zero. É necessário confirmar a alíquota, inclusive quando ela for 0.
3. Lucro de venda exige pedido pago, itens, custo de compra, tarifa, frete e perfil financeiro. Reembolso/chargeback é separado para revisão; não afirmamos lucro líquido de um estorno parcial sem conciliação.
4. O repasse do marketplace é preço menos tarifa e frete. O lucro também desconta imposto, compra e operação. Ads é separado e identificado.
5. Comissão, imposto e resultados são arredondados em centavos. Rateios preservam a soma do pedido. O piso de preço é elevado até cumprir margem e ROI com esse arredondamento.
6. Meta matematicamente impossível resulta em `minimumSuggestedPrice: null`, exibido como meta inviável, nunca preço zero ou infinito.
7. O piso algébrico é teórico: tarifa/frete podem mudar de faixa. A sugestão de preço web volta à API para cada candidato. A extensão orienta nova cotação se o preço mudar.
8. Preço de compra e parâmetros aplicados a vendas já apuradas não são reescritos por uma edição de custo. Custos ausentes podem ser preenchidos. Novas vendas usam o novo custo.
9. O frete realizado vem de `/shipments/{id}/costs`; não usamos campos ambíguos do pedido como substituto financeiro. Um envio compartilhado só recebe rateio quando a API informa todos os pedidos e todos estão presentes e pagos. Caso incompleto/reembolsado fica sem lucro confirmado; o custo total não é repetido em cada pedido.
10. Frete indisponível não é zero. A extensão pode usar estimativa informada explicitamente, separada da operação e identificada como estimativa. Uma prévia sem cotação confirmada não é salva como decisão definitiva.

## Decisões de estoque e Ads

- Reposição depende de histórico de 30 dias completo, sincronizado nas últimas 36 horas; anúncio recente usa a janela observada desde a criação.
- Ponto de pedido: prazo do fornecedor + dias de segurança. Cobertura alvo nunca é inferior a esse prazo.
- Sem custo, cobertura financeira suficiente ou margem na meta, o Radar pede revisão em vez de sugerir compra.
- Mudança de preço, custo ou perfil tributário bloqueia recomendação baseada em margem histórica antiga.
- Quantidade e capital sugeridos são estimativas pela saída observada, sem criação automática de pedido de compra.
- ROAS de equilíbrio estimado = 100 / margem histórica antes de Ads. Pressupõe mix e custos semelhantes.
- Produto relacionado a mais de um grupo de Ads não tem seu lucro inteiro repetido como lucro de cada grupo; esse recorte fica pendente de conciliação.
- Ads com lucro zero não recebe recomendação de escala. Escalar exige cobertura alta e volume mínimo; métricas indisponíveis ou custos ausentes não geram lucro confirmado.

## Banco e compatibilidade

Migration: `202610152100_commercial_workspaces`.

- Registros anteriores ficam no workspace `default`, preservando produtos, contas, histórico e snapshots.
- SKUs e itens observados passam a admitir a mesma identificação em workspaces diferentes.
- Valores antigos de lucro que omitiam imposto são invalidados; dados de origem e custos continuam preservados para reapuração.
- Sessões antigas sem identidade deixam de autorizar acesso: é necessário entrar novamente.
- Novos workspaces começam em `PILOT`, com limite padrão de 500 consultas da extensão/dia. O operador legado recebe 5.000. Não existem valores de assinatura ou cobrança automática novos.
- Os limites são operacionais do piloto, administrados pelo operador. Não constituem planos pagos comercializados.
- A migration é de avanço. Para reversão estrutural, restaurar backup; não apagar workspaces ou aplicar downgrade manual sobre dados novos.

## Operação e deploy

1. Fazer backup e conferir as contas ML históricas do workspace legado, especialmente se mais de uma foi conectada na versão anterior.
2. Usar esta branch em homologação. O deploy de produção e a branch ativa do Coolify não foram alterados.
3. Manter `DATABASE_URL`, `APP_ENCRYPTION_KEY`, `ADMIN_EMAIL` e `ADMIN_PASSWORD_HASH`. Para o domínio público, configurar `NEXT_PUBLIC_APP_URL` explicitamente.
4. O container executa `prisma migrate deploy`. Após o deploy, entrar novamente como operador, confirmar perfil financeiro e atualizar vendas.
5. Criar um cliente em **Metas e configurações**, entrar por ele, conectar sua conta ML e conferir que não vê dados do operador.
6. Cron protegido por `RADAR_CRON_SECRET`: `/api/cron/radar-monitoring`. Ele sincroniza anúncios e vendas, atualiza watchlist e processa notificações de pedidos que foram efetivamente lidos da API.
7. O cron trabalha em lotes de até 10 contas, retornando `nextAfter`. O agendador deve seguir esse cursor até retornar `null` quando houver mais clientes.
8. Importação atual tem limite de 200 anúncios e 2.000 pedidos por sincronização. Truncamento é informado e bloqueia recomendação que depende de histórico completo. Migrar grandes contas para worker paginado antes de oferecê-las comercialmente.
9. Login possui proteção por IP em memória do processo. Antes de múltiplas réplicas públicas, centralizar esse rate limit.

## Validação desta etapa

- `npm test`: 26 testes de regras financeiras/decisão; inclui 300 combinações de preço para conferir metas em centavos.
- `npm run typecheck` e `npm run build`: passaram localmente.
- SQL de todas as migrations em banco vazio e atualização de banco com registros anteriores.
- 21 verificações HTTP passaram localmente, cobrindo autenticação, isolamento, tentativa de alterar plano, histórico/IDOR, preservação de custo, paginação, exportação, quotas entre dispositivos, código de autorização concorrente, refresh e revogação.
- Fixture de API oficial para conferir sincronização, rateio de frete entre pedidos e custo desconhecido.
- CI executa migrations e testes HTTP sobre PostgreSQL 17 real, além de typecheck, sintaxe da extensão e build.
- QA visual passou no Chromium: desktop/mobile, filtros, menu, paginação, configurações, onboarding vazio e erro. Capturas usam dados de teste, nunca dados de clientes.

## Gates antes de lançamento público

- [ ] Deploy de homologação e smoke pelo domínio real.
- [ ] Conferir 5 vendas reais com Mercado Livre, incluindo carrinho, frete grátis, cancelamento e reembolso.
- [ ] Testar OAuth completo de duas contas ML de clientes diferentes.
- [ ] Validar conta com permissão restrita, 401/403/429, expiração e renovação de tokens.
- [ ] Agendador/worker persistente com retries e observabilidade, cobrindo toda a base e limites da API.
- [ ] Billing, webhooks de pagamento, cancelamento e regras de assinatura reais.
- [ ] Recuperação de senha com canal verificado e suporte operacional. Operador consegue redefinir senha por API; não há disparo de e-mail automático.
- [ ] Políticas comerciais/privacidade e fluxo de suporte definidos para o serviço.
- [ ] Empacotamento e publicação/revisão da extensão na Chrome Web Store.

Até fechar esses gates, a entrega deve ser chamada de piloto com acessos controlados, não SaaS público pronto.

## Correção da extensão 0.7.0 — 16/10/2026 (histórico)

A versão 0.7.0 substitui os cartões/colunas injetados por uma única superfície no painel lateral do Chrome. Não altera os cards, ordenação, estilos ou colunas do Mercado Livre. O site mantém seus botões nativos e a extensão só adiciona um lançador fixo isolado.

Foram corrigidos: leitura de IDs de recomendações como se fossem o anúncio aberto, confusão entre MLB/MLBU/catálogo, modalidade inferida de parcelamento, dependência de API restrita para monitorar, cálculo sem caminho visível para informar frete/tarifas, perda de clique por alteração de altura no blur do formulário, resultado obsoleto após editar entradas e contexto compartilhado entre abas.

Removidos os atalhos estatísticos que inferiam vendas por avaliações, visitas por conversão padrão e idade por número do anúncio. Acumulado × preço atual não é exibido como faturamento histórico. Sem janela/counter exato, score e demanda ficam desconhecidos.

A calculadora aceita tarifa API ou manual explícita, e informa categoria sugerida, origem do frete e limites da simulação. Comparação usa anúncios selecionados de uma amostra datada, com mínimo de três. Monitoramento de página informa que atualiza por novas visitas; snapshots registram origem e se a quantidade é conhecida ou limite inferior.

Nova migration: `202610161300_extension_observation_sources`. Preserva acompanhamentos anteriores como API. Backup e homologação continuam necessários.

O login solicita leitura + offline_access; a renovação ML usa bloqueio de linha no PostgreSQL para serializar réplicas. O diagnóstico por cliente diferencia recursos principais, opcionais e ausência de amostra. O mapa completo de famílias relevantes, permissões, limites e próximos usos está em [MERCADO_LIVRE_API_MAP.md](MERCADO_LIVRE_API_MAP.md).

Validação da revisão: regras de domínio, testes HTTP com API restrita simulada, migrações e regressões no navegador (geometria do site, botão nativo, preços, MLBU, calculadora, comparação e troca de abas). As fixtures são sintéticas; homologação no Mercado Livre real continua pendente. O anúncio das capturas retornou uma página de erro ao ser aberto neste ambiente.

**Atualização tem duas partes:** implantar a branch no backend e atualizar/recarregar a extensão no Chrome. Apenas deploy no Coolify não atualiza uma extensão sem compactação. Recarregar também as abas ML para retirar a UI da versão anterior. Nenhum merge ou deploy de produção foi feito nesta revisão.

## Experiência contextual 0.8.0 — 16/10/2026

As capturas de busca, produto e menu do Cargoos fornecidas pelo usuário mostraram que concentrar todos os fluxos no painel aumentava os passos. A extensão agora oferece uma barra na busca, atalhos sobre as fotos e um resumo compacto depois do preço do produto. O menu **R** dá acesso às ferramentas existentes, monitoramentos e conta. A interface pode ser ocultada e restaurada. Padrões de navegação são a referência; marca, arte e código do concorrente não são reutilizados.

Os atalhos dos cards ficam em elementos próprios, fora dos cards, posicionados sobre a área da foto. Não se adicionam alturas a grades fixas nem se alteram conteúdo, estilos, ordem, filtros ou colunas ML. A barra e o resumo usam apenas âncoras de fluxo vertical reconhecidas; caso não existam, o menu/painel permanece disponível. Esses pontos ainda dependem de conferência nos layouts reais do Mercado Livre.

Marcar **+** seleciona os anúncios revisados. Com três preços válidos, a barra mostra a mediana dessa seleção e abre os mesmos IDs no painel. **Analisar** abre a calculadora do card específico sem navegar para outro anúncio. A lista do Radar oferece filtro por título e ordenação por preço, preservando a seleção. **Monitorar preço** salva pela página e trata login necessário, sucesso e tentativa após falha. Trocar anúncio invalida resultados anteriores. Pedidos oficiais só podem enriquecer o mesmo ID e a própria conta.

Escopo: extensão, apresentação da página de instalação, documentação e regressões dos novos fluxos. Nenhuma mudança de fórmula financeira, API HTTP, schema, OAuth, CSP, permissões ou dependências nesta etapa. Continua sendo protocolo 2; backend e extensão devem vir da mesma branch de homologação. A revisão não inclui publicação Chrome Web Store, merge na principal ou deploy de produção.

Validação: 40 testes de regras/autenticação, 15 verificações de navegador com DOM sintético (busca e produto, card correto, seleção compartilhada, monitoramento, menu, ocultar/restaurar, dimensões nativas, responsividade e erros), typecheck, build e empacotamento. Os testes HTTP continuam no CI com PostgreSQL. A navegação de uma extensão instalada no Chrome comum e as variantes reais do Mercado Livre exigem homologação.

## Análise automática no produto 0.9.0 — 16/10/2026

O produto passa a carregar a análise sem escolher ferramentas ou abrir o painel. A conclusão resumida fica junto ao preço; a análise completa entra depois do bloco principal quando o layout tem âncora reconhecida, com grade própria responsiva. Essa disposição evita inserir a análise inteira antes do botão de compra. Sem âncora ampla, há fallback dentro do bloco isolado.

Consultas autenticadas por referência/preço/counters: histórico, detalhes, candidatos e tarifas Clássico/Premium. Alterações na interface própria não geram consultas adicionais. Sem autenticação/protocolo compatível, mantém a leitura local e informa a conexão. Ocultar a análise interrompe novas consultas automáticas. Resultados de referências ou sessões anteriores são descartados.

Demanda baixa/média/alta/excelente usa os mesmos limiares de ritmo já existentes, com janela de pedidos próprios ou contador exato. Não deduz velocidade do acumulado, avaliações ou número do anúncio. Média de vida é identificada como histórica. A conclusão combina essa base com o resultado financeiro do backend: boa oportunidade, margem apertada, pouco giro, margem boa com demanda a confirmar ou ruim para o custo informado. Falta de dados continua explícita.

O endpoint de detalhes recebe o campo aditivo `savedCost`: apenas para anúncio confirmado como próprio, com custo do mesmo anúncio ou SKU exato ativo do workspace. Nenhuma busca por título atribui custo automaticamente. Custo/frete/imposto informados no produto recalculam a mesma fórmula do backend. Repasse é separado de lucro e tarifas/categoria/modalidade simuladas têm rótulo próprio. A faixa automática é preliminar, com pelo menos três candidatos únicos; a amostra manual revisada continua disponível.

Escopo: extensão, campo de custo autorizado na API de detalhes, instalador, apresentação, documentação e testes. Não muda schema/migrations, OAuth, permissões, CSP, dependências ou fórmula financeira. Protocolo 2 preservado. Homologação em Chrome instalado e variantes reais do Mercado Livre permanece necessária.

Validação: 44 testes de regras/autenticação/controller, 17 cenários de navegador, typecheck, build e empacotamento; teste HTTP adicional cobre custo próprio por anúncio/SKU e não exposição a outro cliente. CI utiliza PostgreSQL 17.

## Indicadores compactos na busca 0.9.1 — 16/10/2026

A referência de cards enviada pelo usuário orientou o novo bloco de dois indicadores abaixo do título, antes do vendedor/preço: selo colorido de demanda e valor com legenda. Os botões **Analisar** e **+** sobre a foto foram substituídos pelos indicadores automáticos e pela caixa **Comparar**. Links nativos abrem o produto e sua análise automática; selecionar para comparar não navega nem abre o painel.

O bloco usa os mesmos limiares de demanda e a resposta existente de histórico. Receita estimada por dia só aparece com janela medida, ritmo válido e preço correspondente ao da página; a legenda e o tooltip explicam ritmo × preço atual e distinguem estimativa bruta de faturamento recebido. Média desde a criação é identificada como histórica e não recebe esse indicador financeiro. Sem período, o card mostra o acumulado visível com `+`, ou “Sem dados”. Não transforma ausência de histórico em baixa demanda nem classifica rentabilidade sem custos. Catálogo/idade exigem referência confirmada ou fonte API.

Com sessão ativa e análise habilitada, uma consulta em lote registra até 60 referências visíveis e devolve o histórico do workspace. Seleção e atualizações da própria UI não repetem a consulta. Respostas atrasadas de outra referência/sessão são descartadas. Não há consulta de tarifas individual por card. Ocultar a análise remove os blocos e os ajustes de altura, e interrompe novos lotes automáticos.

O ajuste de altura reserva espaço dentro de cards/grade reconhecidos, preservando fotos, larguras, colunas, textos, links e ordenação. Nenhum indicador cobre a imagem ou o preço. Âncoras dentro de links, fluxo horizontal, posicionamento absoluto e alturas com prioridade inline incompatível não recebem o bloco; o menu/painel permanece disponível. Cards clonados e removidos são reconciliados sem duplicar a interface ou deixar ajustes de layout.

Escopo desta etapa: `extension/content.js`, `extension/selectors.js`, versões dos manifests/cabeçalho, apresentação do instalador, documentação e regressões de navegador. Não altera API/formato de resposta, cálculo financeiro, schema/migrations, OAuth, permissões, CSP ou dependências. Nenhum merge ou deploy foi acionado.

Validação local: 44 testes de regras, 19 cenários de navegador sem erros, typecheck, build e pacote de produção. A busca foi inspecionada visualmente em fixture sintética; os cenários verificam fotos, conteúdo e colunas preservados, espaço reservado, ausência de sobreposição, seleção, lote único, remoção/restauração e descarte de resposta de outra sessão. Variantes reais de grade/lista, zoom e Chrome instalado no Mercado Livre continuam exigindo homologação manual.

## Análise, frete, calculadora e cenários 0.10.0 — 16/10/2026

As novas capturas do usuário ampliaram a etapa para o painel lateral, a calculadora e o histórico. O painel apresenta inteligência e repasse automaticamente; os fatos brutos ficam em detalhes. A análise contextual também mostra visitas, ritmo de vendas, ofertas do catálogo e participação Full, com fonte e cobertura da amostra. O total de ofertas reportado pela API não é confundido com ofertas carregadas ou vendedores únicos.

O detalhe de item aceita `analyticsOnly=1` e `catalogProductId`. As visitas vêm da janela de 30 dias fornecida pela API para a referência consultada. O serviço consulta até 20 ofertas e até seis janelas de visitas, usa somente janelas coincidentes/logística identificada e guarda cache de cinco minutos por workspace, conta e referência. Soma de visitas das ofertas não é audiência única do catálogo. Restrição ou indisponibilidade não viram zero. Métricas são consultadas separadamente para não bloquear tarifas.

A rentabilidade aceita `shippingPackage`: gramas, centímetros e opção de frete grátis. A cotação usa o vendedor autenticado, preço, modalidade e logística simulados. Também aproveita medidas explícitas de `shipping.dimensions` quando a API as libera; não extrai embalagem de dimensões genéricas do produto. A fonte distingue anúncio próprio, estimativa de embalagem na API e valor manual. Frete informado tem prioridade. Cotação sem retorno permanece ausente; frete pago pelo comprador não é usado como custo do vendedor. O serviço lê `list_cost` já líquido do desconto indicado na cotação, sem subtrair o desconto duas vezes. O custo realizado continua vindo de `senders[].cost` no envio.

A calculadora usa seletores de modalidade/logística, atalhos de imposto, resultado automático e detalhes recolhidos. O cenário de Ads é opcional: gasto médio em centavos = preço × participação de vendas ÷ ROAS. Mostra lucro e margem após Ads, TACOS e ROAS de equilíbrio; ROI e piso anteriores a Ads têm legenda própria. ROAS zero/ausente não gera gasto zero presumido. As hipóteses não são dados reais da campanha.

Salvar exige revisão explícita dos valores/fontes. `saveMode=SNAPSHOT` grava `EXTENSION_SIMULATION`, fornecedor opcional, medidas, fontes e Ads no metadata existente. A API refaz a cotação e rejeita lucro diferente do revisado. A listagem permite conferir esses parâmetros; valores principais ficam antes de Ads. Não altera cadastro de fornecedor/custo do produto. Referência de terceiro não recebe vínculo a SKU próprio por coincidência. Isolamento de leitura/exclusão por workspace permanece. Metas inviáveis continuam sem piso fabricado e não são salvas por esse fluxo.

Escopo: extensão, APIs aditivas de item/rentabilidade e listagem de análises, módulos de métricas/embalagem/Ads, apresentação de histórico/instalador, documentação e regressões. Não altera schema/migrations, OAuth, permissões, CSP, dependências, política comercial ou fórmula financeira base. Mantém protocolo 2. CI usa PostgreSQL 17; homologação em Chrome instalado, variantes reais do ML e permissões/cotações de duas contas continua necessária.

Referências oficiais: [visitas por janela](https://developers.mercadolivre.com.br/pt_br/como-comecar/recurso-visits), [custos de envio e parâmetros](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/custos-de-envio) e [custos/cotações](https://developers.mercadolivre.com.br/pt_br/mercadolideres-lojas-oficiais/mercado-envios-custos-e-cotacoes). Algumas páginas deram 403; a verificação usou trechos oficiais indexados. A captura do Cargoos orienta apresentação e fluxos; sua metodologia interna não foi presumida.

Validação local: 49 testes de regras/autenticação/controller, 23 cenários de navegador sem erros, typecheck, build e pacote de produção. Cenários adicionais cobrem embalagem API/informada, frete aplicado com rótulo de estimativa, visita/ofertas com cobertura, recálculo após resposta antiga, Ads e revisão com fornecedor. Os testes HTTP incluem cotação por duas contas, ausência de frete sem retorno, medidas inválidas, amostra datada de catálogo e snapshot isolado com rejeição de cotação alterada.

## Sinais públicos e calculadora automática 0.10.1 — 16/10/2026

A captura da busca mostrou que preço e vendidos já estavam disponíveis, mas o destaque permanecia em “Sem período”. A correção usa preço atual × acumulado como **faturamento de referência**, preservando `+N` com limite inferior e explicando a fórmula no card. O sinal mostra quantidade vendida quando não existe janela para classificar demanda recente. Avaliações e selos não são convertidos em quantidade, visitas ou vendas por dia. Receita diária continua dependente de evidência temporal; acompanha o preço atual como projeção bruta. O cálculo local funciona sem sessão e não recupera histórico de outro workspace.

A calculadora prioriza o custo de compra e reutiliza preço, modalidade, tarifas e frete disponíveis na API, além de imposto/operação confirmados nas preferências do cliente. Entradas conhecidas de frete/imposto e edição de preço ficam recolhidas. O resultado automático destaca sobra por venda, margem e preço para as metas; ROI e memória de custos ficam em detalhes. Logística, embalagem, Ads e metas ficam depois do resultado, dentro dos ajustes. Dados que chegarem depois invalidam a cotação anterior antes de recalcular. Conta/conexão fica recolhida quando autenticada.

Medidas de embalagem preenchidas pela API não são enviadas como substituição explícita da cotação do anúncio próprio. Medidas editadas ou a ação de estimar embalagem continuam gerando uma simulação identificada. A resposta de rentabilidade acrescenta `shippingDiscount` opcional, preservado em metadados da simulação: taxa/base retornadas pela cotação, sem nova dedução de `list_cost`. Não muda fórmula financeira, schema/migrations, OAuth, permissões, CSP ou dependências. Descontos particulares não devolvidos pela API não são presumidos.

Referências oficiais consultadas: [custos de envio](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/custos-de-envio), [custos por vender](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/comissao-por-vender) e [custos do envio realizado](https://developers.mercadolivre.com.br/pt_br/registre-o-seu-aplicativo/gerenciamento-de-envios). Cotação antes da venda não equivale à cobrança final; no realizado, o custo do vendedor vem de `senders[].cost`.

Homologação manual: atualizar backend e extensão 0.10.1, recarregar abas ML, conferir valores da mesma referência no simulador oficial e na conta autorizada, incluindo desconto de frete, mudança de preço/modalidade, ausência de embalagem e dados faltantes. Variantes reais do Mercado Livre e contas com benefícios diferentes continuam exigindo essa validação. Nenhum merge/deploy é realizado por esta etapa.

A conclusão usa os mesmos critérios financeiros e de demanda: boa oportunidade exige margem/metas atendidas e demanda recente alta; pouco giro, meta não atingida e prejuízo ficam distintos. Sem custos, o acumulado gera “Vale simular”, sem declarar viabilidade. O resultado da calculadora considera lucro/margem após Ads quando esse cenário estiver ativo. A posição de preço aparece junto do resultado somente com pelo menos três anúncios selecionados de outras referências, usando o preço que está sendo simulado. O resumo próximo ao preço evita duplicar os quatro indicadores já presentes na análise completa.

Validação local da 0.10.1: 54 testes de regras/controller/autenticação, 26 cenários de navegador sem erros, typecheck, build e empacotamento. Inclui cálculo público sem sessão, atualização pelo preço da página, referência acumulada com limite inferior, critérios de decisão após Ads, entrada única com custo próprio/imposto salvo/frete da API, ausência versus zero, comparação selecionada e preservação do layout. Desconto de frete foi acrescentado ao contrato de teste HTTP para verificar custo líquido e lucro sem segunda dedução.

## Mercado e experiência 0.11.0 — 16/10/2026

Correção da regressão em `/mercado`: referência bruta restaurada com nome e fonte corretos; demanda e receita não somem por falta de histórico diário. Modelo público compartilhado entre web e extensão, separando volume histórico, ritmo medido e conclusão financeira. Faixas históricas são regras de triagem transparentes, ainda sem calibração por categoria ou validação preditiva.

Web: cards/tabela, filtros, ordenação e comparação factual de até quatro produtos; resumo mostra anúncios na amostra, potencial favorável, ritmo recente e Full. Home ganhou pesquisa direta. Capital sem custos conhecidos permanece a apurar. Busca oficial usa a mesma classificação, respeita zero, separa catálogo/oferta e não divide vendas de catálogo pela idade do vencedor. Requisições antigas não sobrescrevem nova busca.

Extensão: um painel no produto, com destaque para leitura de mercado e repasse. Dados ausentes, candidatos e origem ficam em detalhes; custo é a entrada principal. Removido painel largo duplicado. Cards mostram potencial distinto e referências monetárias compactas; mínimos não são arredondados para cima. Instalador e manifests incluem o novo asset gerado.

Sem mudança de schema, OAuth, permissões, CSP, versões de dependências ou fórmula financeira. `measurementDays` é um campo opcional adicional da pesquisa para identificar a janela do ritmo medido. Nenhum merge ou deploy nesta etapa. Antes de tratar como produto comercial validado: homologar layouts reais ML, tarifas/frete por cliente, grants, métricas de três produtos e decisão com custos completos.

Validação local: 62 testes de regras/controladores/contratos, 26 cenários de navegador da extensão e 8 da web sem erros de navegador; typecheck, build e empacotamento passaram. Capturas conferidas para desktop e celular. Fixtures são sintéticas; autenticação e isolamento são verificados na suíte HTTP com PostgreSQL no CI.
