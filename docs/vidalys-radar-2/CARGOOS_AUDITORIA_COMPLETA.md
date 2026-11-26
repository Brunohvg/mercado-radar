# Cargoos — auditoria funcional e comercial

Data: 25/11/2026, horário de São Paulo. Método: navegação autenticada no Cloud Browser, leitura das interfaces e consulta às páginas públicas oficiais. Plano observado: Free/Starter. Nenhum registro comercial foi salvo ou alterado. As origens de dados abaixo são **aparentes**, inferidas da conexão e da interface; não houve inspeção de endpoints privados, código ou banco do concorrente.

## Convenções e cobertura

**Observado** significa visível e percorrido. **Parcial** significa interface acessível com conteúdo ou ação bloqueados. **Anunciado** significa declaração comercial. **Não verificado** significa ausência de acesso ou de teste suficiente; não significa inexistência.

O mapa de navegação observado foi percorrido. DRE, pedidos ao vivo, análise de produto e funcionalidades Pro não foram destravados. Não é possível declarar auditoria integral dos módulos internos desses planos. Capturas, recortes e limitações estão em [EVIDENCIAS.md](EVIDENCIAS.md).

## 1. Autenticação — `/auth`

- **Objetivo:** acesso à conta.
- **Informações e origem:** formulário de e-mail/senha, opção Google, recuperação de senha, cadastro, termos e apresentação comercial lateral. Identidade informada pelo usuário; autenticação não foi inspecionada internamente.
- **Filtros:** não se aplicam.
- **Ações:** entrar, escolher Google, iniciar recuperação/cadastro, alternar aparência. Somente o login foi executado, pelo painel seguro do ChatGPT.
- **Fluxo:** abrir a página → escolher método → autenticar → onboarding.
- **Positivos:** separação clara entre credenciais e apresentação; um botão principal; rótulos acessíveis.
- **Negativos:** conteúdo promocional animado cria ruído durante uma tarefa simples; muitos controles decorativos aparecem na árvore de acessibilidade.
- **Implementar no Radar:** login conciso, estado de envio, erro útil, retorno seguro ao destino solicitado.
- **Não priorizar:** carrossel promocional e animação decorativa no login.
- **Captura:** o formulário foi observado antes do login, mas não houve captura exportável desse estado. Não foi recriado para simular evidência.
- **Restrições:** criação de conta, reset, Google e erros de credenciais não testados.

## 2. Onboarding — `/dashboard/onboarding`

- **Objetivo:** ativar conta, integração, trial e extensão; incentivar indicação.
- **Informações e origem:** quatro passos, progresso e indicação bloqueada até conclusão. Os estados vêm da própria conta e de detecção declarada pela plataforma.
- **Filtros:** nenhum observado.
- **Ações:** verificar/atualizar progresso, acessar suporte, iniciar trial, consultar mais informações.
- **Fluxo:** conta → conectar Mercado Livre → trial → instalar extensão. Na sessão, o trial era o passo pendente.
- **Positivos:** progresso compreensível e tarefas concretas.
- **Negativos:** indicação ocupa a região principal antes de o usuário concluir uma tarefa de valor; mistura ativação funcional com ativação comercial.
- **Implementar:** progresso até primeira análise útil, com integração opcional até o recurso que a exige.
- **Não priorizar:** ranking de indicação e bloqueio de onboarding por campanha de aquisição.
- **Capturas:** navegação C01 e restrição de plano C02; não há captura específica do onboarding sem identificação pessoal.
- **Restrições:** trial não iniciado; conclusão real dos passos não repetida.

## 3. Dashboard — `/dashboard`

- **Objetivo:** acompanhar vendas e operação.
- **Informações e origem:** pedidos, faturamento, ticket médio, indicadores de lucro/saúde e pedidos no período. A conexão com Mercado Livre aparece nas configurações; os agregados não foram conciliados com extratos oficiais.
- **Filtros:** hoje, ontem e últimos sete dias visíveis no seletor Free; busca por pedido/produto; status, tipo, logística; itens por página.
- **Ações:** atualizar dados, alternar visão, abrir pedidos ao vivo, copiar identificador. Pedidos ao vivo abre oferta de plano nesta conta.
- **Fluxo:** escolher janela → avaliar indicadores → filtrar tabela → identificar pedido.
- **Positivos:** síntese e tabela na mesma página; detalhes de frete compartilhado contextualizados na linha.
- **Negativos:** vários indicadores dependem de upgrade; o score de saúde não teve seu método comprovado; valores em regiões bloqueadas não servem como evidência de resultado real.
- **Implementar:** janela explícita, cobertura financeira, rateio e acesso ao detalhe do pedido.
- **Não priorizar:** score agregado sem método, período e próxima ação.
- **Captura:** C07, cabeçalho recortado; números e pedidos reais excluídos.
- **Restrições:** cálculo interno, histórico amplo e atualização ao vivo não verificados.

## 4. Pedidos e vendas — dentro do Dashboard

- **Objetivo:** examinar vendas por pedido; não foi encontrado um item principal independente de pedidos.
- **Informações e origem:** produto, identificador, pagamento, logística, meio de pagamento, unidades, receita, lucro/margem/ROI bloqueados, data. A origem aparente é a conta conectada.
- **Filtros:** busca, pago/cancelado observados; tipo e logística presentes, sem exaustão de todas as combinações.
- **Ações e fluxo:** localizar pedido → ler status e contexto → copiar ID. Não houve processamento, cancelamento ou alteração de pedido.
- **Positivos:** identificação curta com opção de cópia; indicação de compartilhamento de envio.
- **Negativos:** rótulos financeiros no Free não permitem conferir composição; diferenças entre receita e resultado precisam de explicação.
- **Implementar:** pedido com memória de cálculo, custos faltantes, rateio em centavos e estados de estorno.
- **Não priorizar:** replicar todo o backoffice logístico do Mercado Livre.
- **Capturas:** C07 preserva contexto; linhas reais omitidas por privacidade.
- **Restrições:** detalhes financeiros Pro, devoluções e reembolsos não testados.

## 5. Anúncios — `/dashboard/listings`

- **Objetivo:** identificar anúncios que precisam de preço, estoque ou verba.
- **Informações e origem:** totais, ativos, conversão, ticket, qualidade; tabela com ID, status, tipo, canal, preço, vendidos, receita, lucro e criação. Origem aparente: Mercado Livre e cálculos Cargoos.
- **Filtros:** período, busca por nome/ID/SKU, canal, status, tipo, ordenação e paginação.
- **Ações:** selecionar linhas; menu oferece produto na Cargoos, copiar ID e abrir anúncio no Mercado Livre. O detalhe na Cargoos abriu plano nesta conta.
- **Fluxo:** restringir amostra → ordenar → abrir ações do anúncio → examinar detalhe quando permitido.
- **Positivos:** tabela adequada ao volume e ações secundárias recolhidas.
- **Negativos:** indicadores e ações bloqueados fragmentam a tarefa; um gráfico observado continha rótulos de datas diferentes do período selecionado, sem explicação visível. Não foi determinada a causa.
- **Implementar:** conta e janela consistentes, ação principal criar anúncio, detalhe por linha.
- **Não priorizar:** uma nova tela para cada indicador de qualidade.
- **Captura:** C08, cabeçalho sem os anúncios e valores da conta.
- **Restrições:** edição, criação/publicação e detalhamento Pro não executados.

## 6. Produtos, estoque e lotes — `/dashboard/products`

- **Objetivo:** relacionar SKUs, custo, estoque e necessidade de reposição.
- **Informações e origem:** SKUs, unidades, localização logística, curva ABC, valor e saúde do estoque; linhas com grupo/kit/unitário, SKU, variação, fornecedor, custo e curva. Parte financeira está bloqueada.
- **Filtros:** período, busca por nome/SKU, tipo, fornecedor e pedidos; opção somente Full bloqueada.
- **Ações:** registrar SKUs, expandir grupo, anexar fornecedor; aba custo por fornecedor Pro. O modal de SKUs foi aberto e fechado, sem acionar registro no Mercado Livre.
- **Fluxo:** localizar produto → conferir identidade/variação → associar fornecedor/custo → analisar estoque.
- **Positivos:** distinção explícita entre grupo, variação e kit; auxílio a SKUs ausentes.
- **Negativos:** densidade horizontal alta; curva/estoque e resultados do período exigem explicação de janelas distintas.
- **Implementar:** identidade de embalagem, custo com vigência, custo por lote e vínculo por ID do fornecedor.
- **Não priorizar:** mutação em lote sem revisão; estoque real de concorrentes como se fosse público.
- **Captura:** C09. O registro de SKU é ação de escrita e não foi disparado.
- **Restrições:** gestão interna de lotes/FIFO e baixa por lote são anunciadas no site; não foram acessíveis para validação operacional.

## 7. Fornecedores — `/dashboard/suppliers`

- **Objetivo:** manter quem abastece a operação e apoiar reposição.
- **Informações e origem:** estado vazio, cadastro manual e parâmetros de estoque. O formulário contém nome, tipo, CNPJ, site, e-mail, WhatsApp, país, CEP, endereço, cidade/UF, prazo de entrega, pedido mínimo e observações.
- **Filtros:** não apareceram no estado vazio; não foi possível conferir uma listagem preenchida.
- **Ações:** abrir cadastro; abrir parâmetros de preparo/envio Full e dias de segurança; cancelar. Nenhum dado salvo.
- **Fluxo:** registrar identificação → localização → condições/logística → salvar; depois relacionar a produtos, conforme ações em Produtos.
- **Positivos:** progressão por seções e explicação do efeito do prazo sobre a ruptura.
- **Negativos:** texto diz que só nome/tipo são obrigatórios, mas o rodapé também pede prazo; pequena inconsistência de validação percebida. Descoberta ativa não apareceu nesta tela.
- **Implementar:** cadastro simples e progressivo, prazo/MOQ, comparação do custo entregue; aprofundar descoberta e evidências no Radar.
- **Não priorizar:** chamar um cadastro manual de fornecedor aprovado ou pesquisa nacional completa.
- **Capturas:** C03, formulário vazio; C14, estado vazio.
- **Restrições:** comparação por fornecedor é anunciada e há aba Pro em Produtos. Não foi testada; não afirmar que Cargoos não compara fornecedores.

## 8. Publicidade — `/dashboard/growth/ads`

- **Objetivo:** avaliar gasto, vendas atribuídas e resultado por campanha.
- **Informações e origem:** investimento, vendas por Ads, campanhas por estratégia, ROAS, ACOS/TACOS, funil, CTR, tabela de campanhas; resumo parcial acessível, métricas detalhadas/relatórios dependem de Pro.
- **Filtros:** período, busca por campanha, tipo, status e paginação.
- **Ações:** menu de campanha, exportação Pro e calculadora ACOS/ROAS. A calculadora local abre com relação 20% ↔ 5 vezes; não foi alterada nenhuma campanha.
- **Fluxo:** escolher período → avaliar funil → aprofundar campanha → confrontar gasto com resultado.
- **Positivos:** conecta publicidade à margem, em vez de destacar só vendas atribuídas.
- **Negativos:** atribuição e conciliação do lucro não puderam ser auditadas; ROAS positivo isoladamente não demonstra lucro.
- **Implementar:** contribuição antes/depois de Ads, cobertura e janela de atribuição.
- **Não priorizar:** automatizar orçamento com base apenas em ROAS.
- **Captura:** C10, cabeçalho; dados das campanhas removidos.
- **Restrições:** nenhuma mudança de orçamento, ativação ou exportação Pro.

## 9. Pesquisa EAN e análise — menu Playground

- **Objetivo:** pesquisar produtos e guardar análises.
- **Informações/origem:** EAN aparece desabilitado com manutenção. Análise de Produtos, em `/dashboard/analysis`, mostra requisito de ativar trial.
- **Filtros e ações:** não verificados após o bloqueio; há retorno ao onboarding. Não foram contornadas restrições.
- **Fluxo:** menu → bloqueio explícito → onboarding; a tarefa de análise não pode ser concluída nesse estado.
- **Positivos:** indisponibilidade sinalizada no menu.
- **Negativos:** oferta pública não equivale a disponibilidade operacional imediata; texto de EAN na página de análise dificulta distinguir as duas áreas.
- **Implementar:** validação de GTIN, importação com revisão e diagnóstico de disponibilidade.
- **Não priorizar:** gerar GTINs aleatórios ou exibir demanda sem método verificável.
- **Capturas:** C01 e C04. C06 é demonstração pública de análise em lote, não teste autenticado.
- **Restrições:** pesquisa, histórico e precisão de resultados não testados.

## 10. MCP e IA — `/dashboard/mcp`

- **Objetivo:** orientar conexão de assistentes à operação.
- **Informações/origem:** opções Claude, ChatGPT, Gemini, Grok, DeepSeek e cliente MCP genérico; propostas de uso, passos de conexão e indicadores de uso Pro. Outras integrações aparecem como futuras.
- **Filtros:** não observados.
- **Ações:** saber mais e conectar assistentes; não iniciadas, pois poderiam gerar acesso persistente ou credenciais.
- **Fluxo:** escolher cliente → seguir instrução → autorizar conexão → consultar dados; somente o ponto de entrada foi auditado.
- **Positivos:** exemplos de perguntas aproximam tecnologia da tarefa comercial.
- **Negativos:** muitas opções desconectadas; consumo de tokens não foi relacionado a benefício comprovado.
- **Implementar:** primeiro perguntas úteis sobre dados já autorizados; eventual MCP somente leitura, com escopos e revogação.
- **Não priorizar:** um catálogo de modelos de IA antes de validar o fluxo de compra e margem.
- **Captura:** C05.
- **Restrições:** nenhuma conexão MCP, geração de token ou consulta por assistente foi executada. A política de leitura é declaração do site, não verificação interna.

## 11. DRE, despesas e relatórios

- **Objetivo:** resultado econômico após custos da operação.
- **Informações/origem:** DRE abre seleção de plano. Em `/dashboard/costs`, despesas fixas, variáveis e pontuais, totais do mês, vigência e histórico são visíveis.
- **Filtros:** mês, nome/categoria, tipo e custos ocultos.
- **Ações:** novo custo, editar/ativar/desativar/ocultar indicados; abrir formulário, escolher seções e cancelar foram os únicos passos executados.
- **Fluxo:** cadastrar natureza → nome/categoria → valor/vigência → acompanhar mês → consolidar DRE quando disponível.
- **Positivos:** separa despesas do negócio dos custos do produto; vigência explícita; Free informa limite de cinco custos ativos.
- **Negativos:** receitas, CMV, Ads, impostos e devoluções da DRE Pro não puderam ser conciliados.
- **Implementar:** despesas com competência, resultado operacional e cobertura financeira; nomear cada subtotal corretamente.
- **Não priorizar:** chamar contribuição por pedido de lucro líquido da empresa.
- **Capturas:** C11 e C02 para o bloqueio da DRE.
- **Restrições:** relatórios gerenciais, exportações e regras de competência da DRE não testados.

## 12. Configurações, integrações e planos — modal da conta

- **Objetivo:** perfil, integrações, preferências financeiras/logísticas e assinatura.
- **Informações/origem:** Conta, Integrações, Privacidade e segurança, Custos gerais, Plano e créditos, Padrões de anúncio, Envio Full e Envio Flex. Mercado Livre e Google aparecem conectados; Shopee/Amazon futuras.
- **Filtros:** navegação por seções; mensal/anual na oferta de planos.
- **Ações:** alterar perfil/aparência, desconectar, redefinir senha, excluir conta, configurar padrões e assinar. Somente leitura das seções; nenhum desses comandos foi executado.
- **Fluxo:** menu da conta → configuração → seção contextual → revisão antes de eventual mudança.
- **Positivos:** configuração concentrada; mostra conta conectada e diferencia recursos futuros.
- **Negativos:** 2FA e códigos de backup aparecem como futuros; parte dos padrões de anúncio também. Não é possível inferir a segurança interna da aplicação a partir disso.
- **Implementar:** integrações/permissões legíveis, configurações com vigência, autenticação e recuperação bem testadas.
- **Não priorizar:** campos ainda sem função; várias plataformas antes de validar Mercado Livre.
- **Captura:** C02 mostra planos sem perfil ou credenciais; não foram salvas telas de conta preenchida.
- **Restrições:** plano pago e billing não testados. Oferta observada: Pro R$49,99/mês; site divulga equivalente anual de R$42,99/mês e cobrança anual, enquanto o modal mostra promoção própria. Valores comerciais sujeitos a alteração, não recomendação de compra.

## 13. Site comercial e calculadora pública

- **Objetivo:** apresentar valor e converter visitante para extensão/conta.
- **Informações/origem:** páginas oficiais do fabricante; promessa integrada, planos e demonstrações. Números de usuários/GMV são declarações comerciais, sem verificação independente.
- **Filtros:** ciclo de cobrança; na calculadora, Clássico/Premium e regime tributário.
- **Ações:** navegação, links de instalação, cadastro e cálculo local. Sem cadastro/trial/compra.
- **Fluxo testado:** calculadora pública → valores fictícios de venda R$100, mercadoria R$50, frete R$10, operação R$2, opção tributária exibida 4% → resultado R$22, margem 22%, ROI 44% e equilíbrio R$73,81. Isso confirma a resposta da interface, não a adequação da tarifa à categoria de um anúncio.
- **Positivos:** formulário curto e resposta imediata; aquisição demonstra utilidade.
- **Negativos:** não havia categoria nem composição da comissão nesse formulário. ROI de 44% é compatível com base de R$50; definição interna não inspecionada. Máscara monetária interpreta `100` como R$1,00; para R$100 foram inseridos os dígitos `10000` e o valor foi conferido na tela.
- **Implementar:** simulação rápida, memória de cálculo e denominador do ROI explícito.
- **Não priorizar:** enquadramento tributário simplificado como se fosse confirmação fiscal.
- **Capturas:** C12 e C13; esta última usa somente valores fictícios.
- **Restrições:** calculadora de importação e comportamento de cada tipo de página ML dependem da extensão; não testados.

## Diagnóstico comercial

A competitividade aparente decorre da continuidade entre análise na extensão, custos/estoque e acompanhamento de vendas, somada a uma porta de entrada gratuita. Essa é uma avaliação de produto, não uma medida de participação de mercado ou de precisão financeira.

O Radar deve adotar continuidade de contexto e clareza de ações. Seu diferencial proposto é descoberta nacional com evidência, identidade correta, cotação vigente, custo entregue e compatibilidade com capital. A comparação de custo por fornecedor **já é anunciada pelo Cargoos**; a diferenciação precisa ser mais profunda que essa função isolada.

Referências públicas: [site](https://cargoos.com.br/), [calculadora observada](https://cargoos.com.br/calculadora/mercado-livre), [extensão oficial](https://chromewebstore.google.com/detail/cargoos-%E2%80%94-intelig%C3%AAncia-pa/hhpmjdebejnbpidgokkeikoainkcmlgi). A página autenticada é evidência visual, não acesso ao funcionamento interno.
