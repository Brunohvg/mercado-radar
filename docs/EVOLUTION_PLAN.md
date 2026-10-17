# Mercado Radar — plano de evolução

Data: 16/10/2026. Estado: **Planejado**.

Direção aprovada pelo usuário: a experiência da revisão 0.11.0 melhorou e deve ser preservada. A evolução deve aumentar a utilidade das decisões, com menos digitação e motivos claros, mantendo a organização atual.

Este documento registra o plano e a checagem de código que o fundamenta. Não significa que as próximas funcionalidades foram implementadas ou que todas as telas foram homologadas em produção.

## Base verificada

- Branch: `feature/radar-commercial-readiness-v1`.
- HEAD funcional de referência: `bf7ce81e8616ed8a3a58dc3237287d420ceb586f`, extensão 0.11.0.
- [PR #2](https://github.com/Brunohvg/mercado-radar/pull/2) aberto em rascunho, sem merge; base `feature/chrome-extension-radar-v1`.
- [CI da referência](https://github.com/Brunohvg/mercado-radar/actions/runs/38988244342) aprovado: typecheck, 62 testes de regras, 26 cenários de navegador da extensão, 8 da web, empacotamento/build, migrations em banco limpo/upgrade e 36 verificações HTTP.
- Os cenários web atuais cobrem componentes de Mercado, pesquisa e dashboard com APIs sintéticas; não são uma auditoria de todas as páginas com navegação, sessão e contas reais.
- Esta etapa altera somente documentação e instruções de revisão. Não altera telas, regras, permissões, schema ou dados.

## O valor que queremos entregar

O cliente deve conseguir responder, com origem e limites dos dados visíveis:

1. Este produto merece uma análise mais profunda?
2. Quanto posso pagar ao fornecedor para cumprir minhas metas?
3. Vendendo ao preço desta oferta concorrente, quanto sobra nas condições da minha conta?
4. O lucro realizado confirmou a simulação? O que mudou?
5. Devo repor, aguardar, rever preço ou parar de comprar?

Uma nova informação só recebe destaque se melhorar uma dessas decisões. Não criar um novo painel para cada indicador.

## Achados que definem a prioridade

| Evidência no código atual                                                                                                             | Implicação                                                                                                                                  | Próxima ação                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/market-assessment.ts` atende Mercado, pesquisa e extensão; `lib/radar-score.ts` ainda atribui demanda por score no monitoramento | A mesma referência pode receber classificações diferentes conforme o fluxo                                                                  | Unificar sem misturar volume histórico, média desde criação e giro recente; não reinterpretar snapshots antigos como se usassem a regra nova |
| `components/product-analyzer.tsx` já tem limite de compra por margem, com cálculo no cliente                                          | Não precisamos criar outro simulador; a regra atual não é ainda um teto único que considere conjuntamente margem, ROI e cotação no servidor | Consolidar a regra e levar uma resposta simples para o fluxo principal e a extensão                                                          |
| `lib/market-comparison.ts` compara tokens, números e presença de kit; faixa exige três preços                                         | Há uma base funcional, mas títulos semelhantes não provam equivalência                                                                      | Enriquecer quantidade, unidade, marca/modelo, EAN/GTIN e confirmação do usuário                                                              |
| `lib/radar-monitoring.ts` e `lib/page-watchlist.ts` já geram acompanhamento/alertas                                                   | Alertas não precisam ser recriados                                                                                                          | Relacionar mudança de preço com a margem e a decisão do cliente, sem alertar por score isolado                                               |
| `lib/ml-sync.ts` limita uma sincronização a 200 anúncios e 2.000 pedidos; cron processa até dez contas por lote                       | Contas maiores e retomada após falha exigem trabalho operacional                                                                            | Paginação persistente, continuidade por cursor, retries, idempotência e progresso observável                                                 |
| `lib/admin-auth.ts` guarda tentativas de login em memória do processo                                                                 | O controle não é compartilhado entre réplicas                                                                                               | Centralizar antes de ampliar a operação pública; conferir os cabeçalhos do proxy                                                             |
| Acesso individual, quotas, custos, vendas e decisões de reposição já existem                                                          | Recriar esses módulos aumentaria complexidade e risco                                                                                       | Homologar e integrar o que está pronto antes de ampliar                                                                                      |
| `QUALITY_GATES.md` menciona quatro comparáveis; código e guia atual usam três para percentis                                          | Existe divergência documental que precisa de decisão explícita                                                                              | Harmonizar a política na etapa de comparação, preservando revisão/evidência da amostra                                                       |

São achados delimitados de código e documentação, não uma lista de vulnerabilidades exploradas nem confirmação de defeitos em produção.

## Etapas, na ordem recomendada

### 0. Proteger a base e fechar consistência

**Decisão melhorada:** confiar na mesma análise em qualquer tela.

- Inventariar as 17 rotas de interface e as APIs usadas por cada uma, com fonte, unidade, identidade MLB/MLBU/catálogo, período, atualização e autorização.
- Cobrir os fluxos da matriz abaixo e guardar capturas de referência desktop/mobile da experiência aprovada, sem dados pessoais.
- Unificar monitoramento e demais consumidores ativos no mesmo contrato de análise; dado ausente não vira zero ou baixa demanda.
- Indicar quando a leitura está antiga ou não há base para giro recente. Comparar sempre a mesma referência, janela e origem.
- Homologar dez produtos representativos: próprios/terceiros, catálogo/tradicional, kits e unidades, com/sem contador, cotação disponível/restrita, Clássico/Premium e Full quando houver acesso.
- Conferir cinco pedidos reais, incluindo custos desconhecidos, envio compartilhado e cancelamento/reembolso quando houver amostra. Caso indisponível permanece pendente.
- Testar dois workspaces com contas distintas; histórico, custos, configurações, extensão e quotas não podem vazar entre clientes.

**Aceite:** mesma entrada/evidência gera mesma leitura nos consumidores; toda diferença tem motivo registrado; nenhum erro crítico nos fluxos; todas as linhas da matriz possuem evidência ou pendência explícita. Homologação real permanece separada da validação sintética.

### 1. Decisão de compra em uma resposta

**Decisão melhorada:** quanto pagar e se a operação cabe no mercado.

- Reaproveitar o teto de compra existente, consolidando o cálculo no servidor com margem, ROI, quantidade do kit, desconto de compra, imposto, operação, tarifas e frete aplicáveis.
- Mostrar uma conclusão curta, por exemplo: **“Até R$ X para sua meta”**, **“Custo acima do limite”** ou **“Falta confirmar frete”**. Exemplos são formatos de resposta, não novos números de mercado.
- Simular vender ao preço de uma oferta concorrente com as condições da conta do cliente. Não chamar o resultado de lucro real do concorrente.
- Preencher automaticamente os dados disponíveis; pedir somente os desconhecidos. Ajustes avançados continuam recolhidos.
- Revalidar a cotação se preço, modalidade ou logística mudarem. Um piso teórico não resolve sozinho mudanças de faixa de tarifa/frete.
- Preservar arredondamento em centavos e metas impossíveis como estado explícito; não produzir um teto financeiro confirmado com custo obrigatório desconhecido.

**Aceite:** web e extensão conciliam o teto para os mesmos parâmetros; valor de compra no limite atende às metas pela fórmula canônica; acima do limite deixa de atender à meta limitante; casos com zero, dados ausentes, kits, descontos e mudança de faixa são cobertos. A tela principal fica mais simples, sem duplicar calculadoras.

### 2. Comparação mais confiável e contexto de demanda

**Decisão melhorada:** comparar produtos equivalentes, não apenas títulos parecidos.

- Identificar marca/modelo, EAN/GTIN quando disponível, condição, conteúdo e unidade do kit. Normalizar preço por unidade somente com quantidade e equivalência confirmadas.
- Separar oferta do vendedor e produto de catálogo; eliminar duplicações e permitir revisar/remover candidatos sem perder a seleção.
- Explicar em uma linha por que uma oferta entrou ou foi excluída. Amostra sem equivalência comprovada continua preliminar.
- Harmonizar a regra mínima de amostra e os rótulos em código/documentação antes de alterar a regra atual.
- Evoluir as faixas históricas com amostras representativas por categoria e histórico suficiente, documentando o método e comparando os resultados com a base aprovada antes de substituir os limiares atuais.
- Calibração por categoria não cria acesso a vendas privadas nem transforma acumulado em vendas/dia. Sem dados suficientes, manter a classificação histórica identificada e o giro desconhecido.

**Aceite:** testes rejeitam quantidades/modelos incompatíveis e duplicações; usuário consegue revisar a amostra; indicadores conservam origem/período; nenhuma previsão de vendas é anunciada sem método, dados e validação próprios.

### 3. Acompanhamento que leva a uma ação

**Decisão melhorada:** saber quando uma mudança exige rever preço, margem ou estoque.

- Reaproveitar watchlist, snapshots e alertas existentes para destacar: mudança de preço relevante para a simulação, margem abaixo da meta, leitura antiga e necessidade de revisão.
- Guardar favoritos/listas de análise com cenário e justificativa, sem duplicar cadastro de produto. Definir previamente a persistência necessária.
- Tornar visível o modo de acompanhamento: por nova visita ou pela API autorizada. Não prometer atualização automática de terceiros sem fonte disponível.
- Relacionar preço, custo e resultado; impedir alertas repetidos do mesmo evento e permitir dispensar/resolver.
- Evoluir o histórico previsto × realizado, explicando diferenças de tarifa, frete, desconto, imposto, Ads e devolução somente quando a conciliação sustentar esse detalhe.
- Aproveitar as recomendações de reposição já existentes; proteger a decisão contra custos ausentes, histórico incompleto e margem antiga.

**Aceite:** cada alerta mostra motivo, momento e próxima ação; reprocessamento não duplica alerta nem venda; resultado parcial permanece identificado. Primeiro entregar dentro do Radar; canais externos dependem de configuração e consentimento próprios.

### 4. Piloto comercial e operação para terceiros

**Decisão melhorada:** provar utilidade e operar com previsibilidade para cada cliente.

- Conduzir piloto controlado com três a cinco clientes, observando se conseguem analisar, comparar e decidir sem ajuda constante.
- Medir tempo até primeira análise útil, digitação evitada, análises concluídas, falhas por recurso e motivos de abandono. Estabelecer a linha de base antes de prometer metas percentuais.
- Completar recuperação de acesso, suporte, diagnóstico por conta e instalação/atualização da extensão.
- Implementar fila/agendador persistente, retomada das importações, limites por conta, proteção de login compartilhada e alertas operacionais antes de atender contas maiores/múltiplas réplicas.
- Exercitar backup/restauração em ambiente isolado e documentar a reversão de cada etapa.
- Definir planos/preços e cobrança em etapa própria, após validar valor. O status de assinatura deve vir do servidor e o recebimento de webhook deve ser idempotente.
- Preparar publicação da extensão, políticas de dados e suporte; revisão/aprovação da Chrome Web Store não é presumida.

**Aceite:** isolamento de duas contas confirmado, fluxos operacionais testados, falhas recuperáveis, custos de operação conhecidos e piloto demonstrando ganho de tempo/decisão. Cobrança e publicação pública só depois dos respectivos critérios e decisões de negócio.

## Matriz de checagem do sistema

Cada etapa funcional revisa esta matriz e identifica impactos diretos e cruzados. A aprovação de um marco exige cobertura de todas as linhas; uma limitação de ambiente é registrada como pendência, não como aprovação. Testar carregamento, vazio, erro, dado parcial, atualização, persistência e desktop/mobile em cada fluxo aplicável.

| Rota                              | Fluxos e riscos obrigatórios                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                          | Credenciais, sessão, suspensão, logout/expiração e tentativas excessivas                                                                  |
| `/onboarding`                     | Operação nova, configurações pendentes e caminho até primeira análise                                                                     |
| `/integracoes`                    | OAuth, retorno, renovação/revogação, conta correta e permissões restritas                                                                 |
| `/configuracoes`                  | Imposto/zero confirmado, metas, operação, clientes e limites por workspace                                                                |
| `/`                               | Dados próprios, lucro parcial, prioridades, período e acesso à pesquisa                                                                   |
| `/mercado`                        | Identidade, demanda/fonte, receita de referência, filtros, ordenação, comparação e histórico                                              |
| `/oportunidades`                  | Busca, ausência de acesso, catálogo/oferta, concorrentes, respostas atrasadas e monitorar                                                 |
| `/monitoramento`                  | Modo PAGE/API, regras compartilhadas, atualização, snapshots e deduplicação de alertas                                                    |
| `/analisar`                       | Cotação, custo/kit/desconto, margem/ROI, teto/piso, metas impossíveis e salvar cenário                                                    |
| `/historico`                      | Parâmetros congelados, origem, cenário Ads, reabertura e isolamento de registros                                                          |
| `/ean`                            | Código válido/ausente, leitura manual/scanner, correspondência de produto e limites de lote                                               |
| `/produtos`                       | Sincronização/paginação, SKU/variações, custo com vigência, estoque e recomendação                                                        |
| `/anuncios`                       | Conta/SKU corretos, preço/estoque, links, leitura parcial e mudança de contexto                                                           |
| `/vendas`                         | Pagos/pendentes/cancelados/estornos, rateio, lucro, totais versus paginação e CSV seguro                                                  |
| `/publicidade`                    | Conta sem Ads, atribuição/cobertura, gasto, lucro antes/depois de Ads e recomendação prudente                                             |
| `/fornecedores`                   | Cadastro, vínculo do cenário, desconto e custo, sem alterar retroativamente vendas apuradas                                               |
| `/extensao`                       | Versão, instalador completo, pacote, instrução de atualização e protocolo do backend                                                      |
| Busca/produto ML e painel lateral | Seletores reais, foto/preço/botão nativos, Shadow DOM, múltiplas abas, troca de conta, resize, ocultar/restaurar, monitorar e calculadora |

## Checagem obrigatória por etapa

1. **Antes:** confirmar branch/HEAD, árvore limpa ou mudanças existentes, escopo e funcionalidades já prontas. Identificar fontes, contratos, unidades e dependências. Usar a experiência aprovada como referência visual.
2. **Código e lógica:** revisar imports, consumidores da regra, estados de erro e ausência, concorrência/respostas atrasadas, cache/contexto, arredondamento e origem dos dados. Revisar diff e exposição de segredos.
3. **Automação:** typecheck, testes de regras, sintaxe da extensão, cenários de navegador web/extensão, pacote, build, migrations em banco limpo/upgrade e testes HTTP em PostgreSQL isolado. Conferir o CI do HEAD final, não de um ancestral.
4. **Visual:** conferir capturas, estados e ações da matriz em desktop/mobile; preservar a geometria e controles nativos do ML. Navegação autenticada real complementa o harness de componentes.
5. **Real:** quando a etapa envolver integração/financeiro, conferir com página, conta e simulador do cliente, anotando referência, data, parâmetros, fonte e diferença. Não usar pedidos ou dados de outro workspace.
6. **Entrega:** registrar arquivos alterados, critérios atendidos, testes/capturas, pendências, riscos, branch/commit, compatibilidade de extensão/backend e caminho de reversão. Separar implementado, validado automaticamente e homologado com conta real.

Documentação isolada: revisar diff, links, rotas e evidências, executar typecheck/build conforme AGENTS e preservar a validação funcional anterior. Não inventar uma nova homologação por atualizar um documento.

## Como conduzir as próximas alterações

- Começar pela etapa 0 e depois fechar a decisão de compra da etapa 1. Não abrir todas as frentes ao mesmo tempo.
- Cada etapa tem branch/commits pequenos e critérios verificáveis. Mudanças de schema, grants, regra financeira ou interface ficam explicitadas em seu próprio escopo.
- Liberar a evolução de forma controlada e comparar com a base aprovada; corrigir regressões antes de iniciar outra etapa.
- IA é complementar: normalizar descrição, sugerir equivalência e explicar resultados. Números e autorização continuam determinísticos e verificáveis; o produto funciona sem provedor de IA, conforme `AI_STRATEGY.md`.
- O deploy continua separado da implementação; um plano e um CI aprovado não significam publicação no ambiente do usuário.

## Fontes e limites da checagem

Evidências locais: arquivos citados, `AGENTS.md`, `PRODUCT_STRATEGY.md`, `DEVELOPMENT_CHECKLIST.md`, `QUALITY_GATES.md`, `COMMERCIAL_READINESS.md`, `INTELIGENCIA_DE_MERCADO.md`, `MERCADO_LIVRE_API_MAP.md` e workflow de CI.

Documentação oficial consultada por trechos indexados em 16/10/2026:

- [Custos por vender](https://developers.mercadolivre.com.br/pt_br/guia-para-veiculos/comissao-por-vender): cotação contextual por preço/modalidade/categoria/logística. Uma mudança de parâmetros exige nova validação dos custos.
- [Notificações](https://developers.mercadolivre.com.br/produto-receba-notificacoes): notificações de vendas e necessidade de consultar o recurso correspondente; isso não equivale a um worker durável já implementado no Radar.

Parte do portal retornou 403 na leitura direta. Não foi acessado o DevCenter autenticado nem foram conferidos grants ou números de contas reais nesta etapa. A inspeção atual é de planejamento/código; auditoria completa de telas e homologação real são a primeira etapa do plano.
