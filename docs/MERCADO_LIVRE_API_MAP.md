# Mercado Livre: acesso por cliente e mapa de APIs do Radar

Revisão: 16/10/2026. Brasil / MLB. Inventário das famílias relevantes para um SaaS de análise e operação; não é uma promessa de acesso a todos os endpoints do Mercado Livre.

## O que “máximo de acesso” significa

O aplicativo do Radar é o integrador. Cada cliente entra no Radar e autoriza **a própria conta do Mercado Livre** via OAuth. O token do operador não deve ser compartilhado com clientes nem usado para buscar seus dados privados.

Há quatro condições diferentes: escopos OAuth, grants da aplicação no DevCenter, autorização/titularidade do vendedor e elegibilidade do recurso/conta. Um token com `read write offline_access` não comprova que toda API esteja liberada. Acesso privado de concorrentes não passa a existir por contratar um plano no Radar.

O Radar solicita explicitamente `read offline_access` para análise e renovação autorizada. Permissão de escrita deve ser habilitada e solicitada quando existir uma funcionalidade concreta de edição, com revisão do cliente. A interface atual não publica nem muda preços por conta própria.

Fontes: [Autenticação](https://developers.mercadolivre.com.br/autenticacao-e-autorizacao), [gestão de aplicativo e grants](https://developers.mercadolivre.com.br/devcenter/gerencie-seu-aplicativo). Dados do aplicativo devem ser consultados com o token do seu criador, não com o token de cada cliente. Por isso esse teste foi retirado do diagnóstico comercial.

## Famílias de APIs e uso prático

“Existente” significa que há código no repositório; **não** que a conta de produção tenha grants homologados. A disponibilidade real deve ser verificada por cliente em **Integrações → Verificar acesso às APIs**.

| Família                               | Recursos / exemplos de consulta                                     | Utilidade no Radar                                                | Situação / limite                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OAuth e usuários                      | `/oauth/token`, `/users/me`                                         | Identidade, consentimento e renovação                             | Existente; tokens ML ficam criptografados no backend. Revogação exige reconexão só da conta afetada                                                          |
| Anúncios próprios                     | `/users/{seller}/items/search`, `/items/{id}`, `/items/bulk?ids=`   | Catálogo do cliente, preço, status e quantidade disponível        | Existente; usar scan/paginação para contas grandes. ID de catálogo, UP e anúncio não são intercambiáveis                                                     |
| User Products                         | `/user-products/{id}` e itens associados                            | Variantes e condições de venda do mesmo produto                   | Resolução própria existente; a extensão mantém MLBU quando não pode confirmar uma oferta. Não escolhe uma oferta só porque o preço é parecido                |
| Categorias e atributos                | `domain_discovery`, categorias e atributos da categoria             | Sugerir categoria e validar dados de publicação                   | Predição existente; categoria sugerida continua identificada como tal                                                                                        |
| Preços e tarifas                      | `/sites/MLB/listing_prices`, preços do próprio item                 | Precificar por categoria, modalidade e logística                  | Existente. Cotação depende dos parâmetros; não é custo realizado. Comissão, tarifa fixa, imposto e frete são separados                                       |
| Catálogo, GTIN/EAN e ofertas          | `/products/search`, `/products/{id}`, ofertas de catálogo           | Encontrar produtos equivalentes e possíveis concorrentes          | Existente, condicionado à API. EAN identifica produto; não libera vendas privadas. A equivalência precisa considerar medida, kit e condição                  |
| Competição / Buy Box                  | `/items/{id}/price_to_win?version=v2`                               | Avaliar competitividade dos próprios anúncios de catálogo         | Código existente; disponibilidade depende do anúncio e da conta. Preço sugerido não garante venda ou margem                                                  |
| Busca pública, destaques e tendências | Busca de itens, `highlights`, `trends`                              | Descoberta e sinais de mercado                                    | Código existente e opcional. Não é fonte garantida de vendas mensais. A extensão compara também cards da busca aberta pelo usuário                           |
| Pedidos e packs                       | `/orders/search?seller=...`, `/orders/{id}`                         | Unidades, faturamento, estado de pagamento e itens                | Existente, restrito ao vendedor autorizado. Pedido pago, cancelamento e estorno precisam de tratamentos distintos                                            |
| Envios e custo realizado              | `/shipments/{id}`, `/shipments/{id}/costs`, `/shipments/{id}/items` | Prazo, rastreio e rateio do custo do vendedor                     | Existente; validar todos os pedidos do envio. Frete pago pelo comprador não é custo zero do vendedor                                                         |
| Cotação de frete                      | Opções de envio do vendedor/anúncio                                 | Simular a operação do cliente                                     | Existente; contexto de preço, logística e reputação importa. Frete desconhecido permanece ausente até ser informado                                          |
| Visitas                               | `items_visits/time_window`, visitas do item autorizado              | Conversão e tráfego da própria operação                           | Existente e condicionado ao acesso. A extensão não calcula visitas de concorrentes usando uma conversão inventada                                            |
| Publicidade                           | Advertisers; Product Ads, campanhas e grupos                        | Gastos, receita atribuída, ROAS e rentabilidade                   | Product Ads existente. Requer anunciante/grants elegíveis; Brand/Display Ads são expansão futura, sem implementação completa nesta etapa                     |
| Promoções                             | `/seller-promotions/users/{id}`, campanhas e ofertas                | Conferir descontos e eventual benefício de tarifa antes de aderir | Próxima integração útil; não é ativada nesta entrega. O cliente deve revisar a margem e autorizar a adesão                                                   |
| Estoque Full e multiorigem            | `/inventories/{id}/stock/fulfillment`, `/user-products/{id}/stock`  | Reposição por depósito, disponível/bloqueado e saúde do estoque   | Próxima integração. Full/Flex e edição de estoque variam por site e conta; não prometer escrita universal no Brasil                                          |
| Perguntas e respostas                 | `/questions/search`, perguntas por ID                               | Caixa de perguntas, rascunho de resposta e prazo de atendimento   | Expansão futura. Consultar só recursos autorizados; envio de resposta deve ter ação explícita                                                                |
| Mensagens pós-venda                   | Conversas por pack/vendedor, mensagens pendentes                    | Atendimento vinculado à venda                                     | Expansão futura. Ações disponíveis e bloqueios variam com mediação e estado da conversa                                                                      |
| Reclamações e devoluções              | Claims, ações disponíveis e returns                                 | Conciliar custos de devolução, estorno e reputação                | Expansão prioritária para lucro realizado. Não automatizar reembolso ou disputa sem fluxo de decisão do cliente                                              |
| Billing, documentos e dados fiscais   | `/billing/integration/...`, billing-info do pedido                  | Conciliar cobranças, bonificações e documentos                    | Expansão prioritária. Dados fiscais pertencem à operação autorizada; proteção e retenção precisam ser definidas                                              |
| Notificações                          | Tópicos como pedidos, itens, envios e outros aprovados              | Atualizar a base sem consultar tudo o tempo inteiro               | Recepção e processamento de pedidos existentes. Os demais tópicos exigem handlers, idempotência e fila persistente; recebê-los não significa já processá-los |
| Mercado Pago                          | OAuth e APIs próprias de pagamentos/relatórios                      | Eventual conciliação financeira aprofundada                       | Integração separada a avaliar. Não assumir acesso irrestrito à carteira ou dados de pagamento usando qualquer token ML                                       |

## Configuração prática do aplicativo

1. No DevCenter, conferir aplicação, país/site, callback HTTPS exato, PKCE e identificação do integrador para terceiros. Conferir que o cadastro e os grants atendem a integração para terceiros; o guia in-house é voltado à operação própria.
2. Em permissões/grants, solicitar os módulos de leitura usados: conta, anúncios, pedidos/envios, métricas e publicidade quando disponível. Os nomes e aprovação devem ser conferidos na interface atual do DevCenter. Não substituir a aprovação por um `scope` maior na URL.
3. Conferir acesso offline e os consentimentos exigidos. Novos grants podem exigir nova autorização de cada vendedor. Essa mudança deve ser feita com o titular adequado; o Radar não modifica a aplicação pelo token de um cliente.
4. Configurar notificações para tópicos efetivamente tratados. Validar conta, application_id e recurso; reler o objeto pela API antes de aplicar efeitos. Payload recebido não é prova de uma venda.
5. Criar dois clientes de homologação, conectar vendedores distintos e verificar isolamento de catálogo, custos, relatórios, extensão e monitoramento. Não transferir uma conta vinculada para outro workspace.
6. Rodar o diagnóstico por cliente. Guardar data, recurso e HTTP; não expor tokens, segredos ou dados de compradores em screenshots/logs de suporte.
7. Testar token expirado/revogado, 403, 404, 429, conta sem Ads e conta sem vendas. Confirmar que recursos opcionais falham isoladamente.

A renovação ML usa bloqueio da linha da conta no PostgreSQL, além da trava do processo, para evitar duas réplicas consumirem o mesmo refresh token. Isso não substitui uma fila persistente e o controle central de limites em escala.

## Como ler o diagnóstico

| Resultado                       | Significado                                                             | Ação                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Disponível / 2xx                | Essa chamada foi aceita agora                                           | Homologar o fluxo e seu conteúdo; não generalizar para todas as contas                         |
| Reconectar / 401                | Autorização precisa ser revista                                         | Renovar/autorizar a conta afetada                                                              |
| Acesso restrito / 403           | Grant, titularidade, elegibilidade ou política podem impedir a consulta | Operador confere DevCenter e documentação do recurso. Reconectar sozinho não garante liberação |
| Limite temporário / 429         | Excesso de chamadas                                                     | Backoff, cache, fila e redução de frequência                                                   |
| Sem amostra                     | Não existe anúncio/envio próprio disponível para o teste                | Testar quando houver um recurso; não chamar de falta de permissão                              |
| Indisponível / rede / 4xx / 5xx | Consulta falhou ou recurso não se aplica                                | Conferir parâmetros, objeto, estado da conta e disponibilidade                                 |

O diagnóstico não exige Product Ads, catálogo ou tendências para chamar de saudável o núcleo de conta/anúncios/pedidos. Ele não consulta `/applications/{app_id}` com tokens de clientes.

## Limites do dado público e decisão comercial

- `+25 vendidos` é o texto acumulado exibido na página, sem período conhecido. Em páginas de catálogo ele pode ter escopo de produto; não atribuir tudo a uma oferta específica.
- Avaliações podem reunir ofertas/vendedores. Não transformá-las em quantidade vendida ou visitas.
- Vendidos × preço atual não comprova faturamento histórico nem um piso de receita: o preço anterior pode ser diferente.
- Número MLB/MLBU não comprova data de criação. A data só é exibida quando sua origem é conhecida.
- Faixa de preço usa amostra explícita, datada e revisada. Menos de três selecionados não gera percentis. O Radar informa se veio da página ou do catálogo.
- Monitoramento por página atualiza ao abrir o anúncio com a análise automática ativa ou o painel aberto. Não prometer cron de terceiros quando a API não autoriza.

## Prioridade de novas integrações

1. **Conciliação de faturamento + devoluções:** reduzir a distância entre lucro estimado e dinheiro efetivamente recebido.
2. **Promoções com prévia de margem:** identificar participação prejudicial antes de aplicar desconto.
3. **Estoque Full/multiorigem:** evitar reposição duplicada e ruptura entre depósitos.
4. **Perguntas e atendimento:** central de ações com revisão humana de respostas.
5. **Workers e notificações completas:** escalar a base com fila, retries, limites por conta e métricas operacionais.

Essas prioridades são uma recomendação de produto desta revisão; não são funcionalidades anunciadas como concluídas.

## Fontes oficiais verificadas

- [Anúncios e migração bulk](https://developers.mercadolivre.com.br/pt_br/itens-e-buscas): coexistência dos endpoints e migração indicada até **25/10/2026**. O acesso principal do Radar usa bulk; o diagnóstico também foi atualizado.
- [User Products](https://developers.mercadolivre.com.br/pt_br/user-products), [publicação](https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao/publicacao-de-produtos), [buscador de produtos](https://developers.mercadolivre.com.br/buscador-de-produtos).
- [Custos por vender](https://developers.mercadolivre.com.br/pt_br/descricao-de-produtos/comissao-por-vender), [competição](https://developers.mercadolivre.com.br/pt_br/imoveis-gerenciamento-de-perguntas-e-contatos/concorrencia-em-catalogo).
- [Pedidos](https://developers.mercadolivre.com.br/pt_br/gerenciamento-de-vendas), [envios](https://developers.mercadolivre.com.br/pt_br/registre-o-seu-aplicativo/gerenciamento-de-envios), [custos/cotações](https://developers.mercadolivre.com.br/pt_br/mercadolideres-lojas-oficiais/mercado-envios-custos-e-cotacoes), [visitas](https://developers.mercadolivre.com.br/pt_br/como-comecar/recurso-visits).
- [Product Ads](https://developers.mercadolivre.com.br/en_us/product-ads-us-read), [promoções](https://developers.mercadolivre.com.br/pt_br/descricao-de-produtos/gerenciar-ofertas).
- [Full](https://developers.mercadolivre.com.br/envios-fulfillment), [estoque multiorigem](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/estoque-multi-origem).
- [Perguntas](https://developers.mercadolivre.com.br/devcenter/perguntas-e-respostas), [mensagens](https://developers.mercadolivre.com.br/mensagens-post-venda), [reclamações](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/gerenciar-reclamacoes), [devoluções](https://developers.mercadolivre.com.br/pt_br/relatorios-de-faturamento/gerenciar-devolucoes).
- [Billing](https://developers.mercadolivre.com.br/pt_br/boas-praticas-para-o-consumo-das-apis-de-relatorios-de-faturamento), [notificações](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/produto-receba-notificacoes), [OAuth Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation).

A pesquisa utilizou páginas e trechos indexados oficiais. Parte do portal retornou 403 neste ambiente. Não foi feita auditoria autenticada da sua aplicação no DevCenter; os grants reais continuam sendo confirmados no painel e em homologação.
