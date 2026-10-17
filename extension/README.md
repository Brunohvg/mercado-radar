# Mercado Radar — extensão 0.11.0

Chrome 116+. Manifest V3. Backend da branch `feature/radar-commercial-readiness-v1`, protocolo 2.

## Instalar ou atualizar

1. No Coolify, implantar a branch de homologação com backup e migrations aplicadas.
2. Baixar os arquivos desta mesma branch. O instalador em `/extensao` só entrega a versão do backend que estiver implantada.
3. Em `chrome://extensions`, carregar a pasta `extension` sem compactação. Para atualizar, substituir os arquivos da pasta que o Chrome usa e clicar em **Recarregar**.
4. **Recarregar também todas as abas abertas do Mercado Livre** para retirar scripts e interfaces da versão anterior.
5. Confirmar **0.11.0** na tela de extensões e no cabeçalho do painel lateral.
6. Entrar na sua conta Radar. Cada cliente autoriza seu próprio vendedor ML. Não usa chave global de API.

A aplicação web e a extensão são atualizadas separadamente: apenas fazer deploy no Coolify não substitui os arquivos carregados no Chrome. O painel avisa se o backend ainda usa o protocolo anterior.

## Como funciona

- A busca recebe uma barra acima dos resultados e um bloco compacto com dois indicadores após o título de cada card reconhecido, antes do preço. A foto fica livre de botões. Apenas a altura dos contêineres é ajustada para reservar espaço; largura, colunas, conteúdo, filtros e ordem nativos são preservados. Ocultar a análise remove esses ajustes.
- No produto, há um único painel isolado junto ao preço: potencial, demanda com origem, receita de referência, repasse e custo de compra. Não duplica o resumo em um segundo painel largo. Dados ausentes, tarifas e candidatos ficam em detalhes. Frete/imposto pendentes só pedem confirmação após informar o custo; valores disponíveis continuam automáticos.
- O painel lateral também abre com a análise, tarifas de Clássico/Premium e repasse automáticos. Dados brutos ficam recolhidos. Visitas, vendas por período, ofertas e participação Full informam acesso e cobertura; a calculadora concentra as entradas da sua operação.
- O botão **R** abre um menu com análise, lucro, pesquisa, monitoramentos e conta. **Ocultar análise na página** remove os elementos contextuais; o menu permite restaurar. O ícone da extensão continua abrindo o painel nativo.
- A camada `selectors.js` lê o DOM; `content.js` envia contexto por aba; `sidepanel.js` apresenta as ferramentas; `background.js` guarda a sessão Radar e fala com o backend.
- Nenhum token ML vai ao navegador. A extensão recebe somente tokens revogáveis do Radar, por cliente/dispositivo.
- Com análise na página habilitada e sessão autenticada, o produto consulta automaticamente detalhes, histórico, candidatos e tarifas de Clássico/Premium. A busca registra até 60 referências visíveis em uma única consulta em lote por contexto reconhecido e recebe o histórico do próprio cliente. Não exige abrir o painel nem faz consultas de tarifas por card. Selecionar anúncios não repete a consulta. Ocultar a análise interrompe novas consultas automáticas; monitorar continua uma ação explícita.
- Sem API para um concorrente, a leitura continua útil. Não se promete acesso privado a vendas, visitas, estoque ou receita dele.

## Ferramentas

**Análise automática do produto:** conclusão e demanda perto do preço; tarifas de Clássico e Premium, repasse, vendas por dia quando há base, posição frente aos candidatos e calculadora já apresentados. Custos cadastrados só são aplicados em anúncio próprio, por vínculo exato de anúncio ou SKU do mesmo workspace. Não há associação de custo por título parecido. Informar custo/frete/imposto recalcula automaticamente, sem botão para iniciar a análise.

**Demanda, potencial e lucro:** ritmo medido usa as mesmas faixas anteriores: baixa <0,7 un./dia; média de 0,7 a <3; alta de 3 a <10; excelente ≥10. Sem período, triagem histórica por volume: até 99 inicial/baixa, 100–499 média, 500–4.999 alta, 5.000+ excelente. `+N` indica faixa mínima. Não é previsão de vendas nem modelo calibrado por categoria. O potencial público distingue **Bom potencial**, **Potencial forte**, **Potencial moderado**, **Em formação**, **Pouco giro** ou **Dados parciais**. Motivo e origem estão disponíveis. Nota baixa com avaliações suficientes sinaliza qualidade. Nenhum desses sinais comprova lucro. “Boa oportunidade” financeira exige demanda recente alta e resultado GOOD; custos ruins e prejuízo prevalecem sobre o potencial público.

**Indicadores na busca:** demanda histórica/medida e receita de referência aparecem com destaque. Sem período, `100+` a R$ 17,88 produz projeção bruta mínima de R$ 1.788 ao preço atual, abreviada para **≥ R$ 1,7 mil** (arredondamento para baixo). A quantidade continua visível; o detalhe informa acumulado × preço atual. Não é faturamento recebido. Receita est./dia só usa ritmo medido e preço atual. Avaliações nunca viram vendas. O cálculo público funciona sem sessão; histórico exige o workspace autenticado. O rodapé mostra o potencial e sua justificativa, em vez de repetir “Vale simular” para todos.

**Tela Mercado no sistema:** cards ou tabela, filtros por demanda/potencial/Full/catálogo/origem, várias ordenações e comparação lado a lado de até quatro produtos. As colunas principais permanecem visíveis, com ausência explícita. A comparação mostra fatos individuais e não mistura kits para gerar médias. O painel inicial oferece pesquisa direta de produtos.

**Preço preliminar automático:** mínimo de três candidatos de IDs distintos, excluindo a referência. A seleção automática recebe rótulo de amostra preliminar sem revisão; o fluxo Comparar continua permitindo conferir equivalência antes de uma comparação revisada. Repasse antes de compra/imposto/operação não é chamado de lucro.

**Leitura:** preço exibido, texto acumulado de vendidos e avaliações, quando presentes. A tela separa MLB de anúncio, MLBU de User Product e produto de catálogo. Scripts de recomendações não fornecem o ID do anúncio aberto. Parcelamento sem juros não confirma Premium.

**Simular lucro:** preço, custo unitário, quantidade do kit, desconto, imposto, operação, modalidade e logística. Frete desconhecido fica ausente. Informar zero é uma confirmação explícita. As tarifas vêm da API para os parâmetros da simulação; se não estiverem disponíveis, o usuário pode informar comissão e tarifa fixa verificadas no simulador oficial. Esse resultado é identificado como manual. Alterar entradas invalida a memória anterior. O piso é teórico e requer nova cotação ao mudar o preço.

**Frete estimado:** anúncio próprio preserva a cotação do próprio item nos parâmetros atuais. Havendo `shipping.dimensions` válido na API, as medidas de envio podem alimentar a estimativa automaticamente. Sem essas medidas, informe peso em gramas e altura/largura/comprimento da embalagem em centímetros. Modalidade, logística, preço e opção de oferecer frete grátis acompanham a consulta, sempre na conta autorizada do cliente. “Frete estimado” pode diferir do custo final de um envio; não assume o custo de outro vendedor. Falha ou dados incompletos mantêm o frete desconhecido, com caminho manual. O `list_cost` devolvido já considera o desconto indicado pelo serviço.

**Visitas e concorrência:** a API de visitas usa janela datada de até 30 dias por anúncio. O catálogo consulta até 20 ofertas e mede visitas de até seis delas. O total reportado de ofertas aparece separado das ofertas carregadas. “Visitas/dia · ofertas” soma as visitas das ofertas medidas; não representa visitantes únicos do catálogo. “Visitas Full · amostra” é a participação no tráfego medido na mesma janela. Cobertura parcial fica explícita; restrição/ausência não vira zero. Consultas têm cache de cinco minutos por workspace/conta/referência e não atrasam a apresentação das tarifas.

**Calculadora automática:** o custo de compra é a entrada principal; em anúncio próprio, pode vir do cadastro por vínculo exato. Preço, modalidade e tarifas são preenchidos pela leitura/API; imposto e operação usam preferências confirmadas do cliente. Frete cotado/estimado entra automaticamente quando liberado. Os campos de frete e imposto só ficam abertos enquanto faltam valores ou ao escolher **Alterar frete e imposto**. **Alterar preço** permite testar outro valor. A conclusão informa **boa oportunidade**, **margem apertada**, **não compensa neste custo** ou a necessidade de confirmar giro/custos. Com ao menos três concorrentes selecionados, mostra também a posição do preço simulado. O resultado automático destaca sobra por venda, margem e preço para as metas; ROI, Ads e memória de cálculo ficam em detalhes. Modalidade, logística, embalagem, metas e tarifas manuais ficam em **Frete, publicidade e outros ajustes**. Valores desconhecidos não recebem zero presumido. Medidas preenchidas pela API não sobrescrevem a cotação do anúncio próprio; embalagem explícita permite simular outra condição. O desconto de frete retornado pela API é informativo, pois já integra o custo líquido cotado.

**Salvar cenário:** revise preço, custo, lucro, margem e fontes, informe um fornecedor opcional e confirme. A API confere a cotação novamente e rejeita lucro diferente do revisado. O histórico guarda parâmetros e hipóteses como `EXTENSION_SIMULATION`, por workspace, com fornecedor e detalhes do cenário. Estimativa de embalagem, tarifa manual e Ads mantêm origem explícita. O vínculo de fornecedor identifica somente o cenário; não altera o custo cadastrado do produto. Valores principais no histórico ficam antes de Ads; o detalhe mostra o cenário após Ads. Meta inviável ainda precisa ser ajustada antes de salvar.

**Pesquisar e comparar:** a caixa **Comparar** abaixo dos indicadores marca anúncios; a barra calcula a mediana somente após três selecionados e envia essa seleção ao painel. Marcar a caixa não abre o anúncio nem o painel. Os links nativos continuam abrindo o produto, onde a análise é automática. A lista do Radar oferece filtro por título e ordenação por preço, sem reordenar a página ML. Candidatos da navegação do mesmo cliente e do catálogo liberado. Confira quantidade/medida/marca/condição e selecione uma amostra. São necessários ao menos três selecionados para a faixa central. Sem amostra, há ação para abrir uma busca e comparar os cards visíveis. Não há mediana inventada nem busca automática em páginas fechadas.

**Monitorar:** o resumo na página salva diretamente uma leitura pública, com estados de envio, sucesso, login necessário e tentativa após erro, mesmo que a API não libere detalhes. Atualiza ao revisitar o produto com a análise ativa ou o painel aberto. O dashboard mostra “leitura da página; atualiza por visita” e preserva `+N` e contadores desconhecidos. Cron continua para acompanhamentos em modo API; páginas de terceiros não ganham essa promessa.

## Desenvolvimento e testes

- Servidor padrão: `https://radar.optarys.com.br`.
- Manifest de desenvolvimento permite também `http://localhost` e `http://127.0.0.1`; porta pode ser configurada em **Servidor da extensão**. Trocar de ambiente exige novo login e não reutiliza tokens de outro servidor.
- `npm run typecheck`, `npm test`, `npm run build`.
- `npm run test:integration`: requer PostgreSQL isolado e `RADAR_TEST_DATABASE=1`.
- `npm run test:market`: testa os componentes web reais com React, CSS do app e APIs sintéticas; Next Link é substituído por âncora no harness. Autenticação e isolamento continuam nos testes HTTP.
- `npm run test:extension`: requer Chromium do Playwright (`npx playwright install chromium`). Em ambiente com navegador próprio, usar `RADAR_CHROMIUM_PATH`.
- `node scripts/build-extension.mjs`: gera `dist/extension-prod`, com manifest sem localhost. Não publica na Chrome Web Store.

## Banco

A revisão 0.11.0 não acrescenta migration. A instalação precisa das migrations anteriores:

`202610161300_extension_observation_sources` identifica a origem dos acompanhamentos e se vendidos são conhecidos ou apenas um limite inferior. Dados anteriores permanecem marcados como API. Aplicar com `npm run db:deploy` no processo de deploy.

## Validar com Mercado Livre real

1. Anúncio MLB próprio: detalhes autorizados, modalidades simuladas e cotação com parâmetros reais.
2. Anúncio MLBU de outro vendedor: leitura correta, sem dados de recomendação, monitoramento por visita e simulação manual possível.
3. Catálogo sem oferta selecionada: não tratar o ID do produto como anúncio.
4. Busca: conferir o bloco abaixo do título, fotos livres, preço e entrega dentro do card. Marcar **Comparar** em três kits equivalentes, conferir a mediana na barra e abrir a seleção no painel. Abrir o produto pelo link nativo e conferir a análise automática. Testar filtros e ordenação da lista do Radar.
5. Produto com custo próprio: abrir sem clicar e conferir lucro/demanda/tarifas. Produto de terceiro sem histórico: triagem histórica com rótulo, sem ritmo recente ou lucro inventado. Alterar custo e conferir reclassificação.
6. Trocar de aba e de conta Radar: não reutilizar dados privados ou resultados antigos.
7. Confirmar que galeria, botões de compra, coluna de oferta e largura do ML permanecem funcionais. Rolar a busca, testar grade/lista, zoom, abas e ocultar/restaurar a interface contextual.
8. O menu de ferramentas oferece apenas funções existentes; não inclui botões sem implementação.

A validação automática usa fixtures de DOM, contratos de API e PostgreSQL. Ela não substitui homologação OAuth e conferência de vendas/fretes reais. Veja [mapa de APIs e permissões](../docs/MERCADO_LIVRE_API_MAP.md).
