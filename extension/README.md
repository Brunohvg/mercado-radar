# Mercado Radar — extensão 0.7.0

Chrome 116+. Manifest V3. Backend da branch `feature/radar-commercial-readiness-v1`, protocolo 2.

## Instalar ou atualizar

1. No Coolify, implantar a branch de homologação com backup e migrations aplicadas.
2. Baixar os arquivos desta mesma branch. O instalador em `/extensao` só entrega a versão do backend que estiver implantada.
3. Em `chrome://extensions`, carregar a pasta `extension` sem compactação. Para atualizar, substituir os arquivos da pasta que o Chrome usa e clicar em **Recarregar**.
4. **Recarregar também todas as abas abertas do Mercado Livre**. Isso remove os cartões injetados pela versão 0.6 e os scripts antigos.
5. Confirmar **0.7.0** na tela de extensões e no cabeçalho do painel lateral.
6. Entrar na sua conta Radar. Cada cliente autoriza seu próprio vendedor ML. Não usa chave global de API.

A aplicação web e a extensão são atualizadas separadamente: apenas fazer deploy no Coolify não substitui os arquivos carregados no Chrome. O painel avisa se o backend ainda usa o protocolo anterior.

## Como funciona

- O conteúdo da página permanece intacto: sem inserir colunas, esticar cards, esconder resultados ou reordenar o Mercado Livre.
- Um pequeno botão fixo abre o painel lateral nativo do Chrome. O ícone da extensão também abre o painel.
- A camada `selectors.js` lê o DOM; `content.js` envia contexto por aba; `sidepanel.js` apresenta as ferramentas; `background.js` guarda a sessão Radar e fala com o backend.
- Nenhum token ML vai ao navegador. A extensão recebe somente tokens revogáveis do Radar, por cliente/dispositivo.
- Sem painel aberto, o adaptador só mantém contexto local da página. As leituras públicas são enviadas ao Radar quando o painel está aberto e autenticado.
- Sem API para um concorrente, a leitura continua útil. Não se promete acesso privado a vendas, visitas, estoque ou receita dele.

## Ferramentas

**Leitura:** preço exibido, texto acumulado de vendidos e avaliações, quando presentes. A tela separa MLB de anúncio, MLBU de User Product e produto de catálogo. Scripts de recomendações não fornecem o ID do anúncio aberto. Parcelamento sem juros não confirma Premium.

**Simular lucro:** preço, custo unitário, quantidade do kit, desconto, imposto, operação, modalidade e logística. Frete desconhecido fica ausente. Informar zero é uma confirmação explícita. As tarifas vêm da API para os parâmetros da simulação; se não estiverem disponíveis, o usuário pode informar comissão e tarifa fixa verificadas no simulador oficial. Esse resultado é identificado como manual. Alterar entradas invalida a memória anterior. O piso é teórico e requer nova cotação ao mudar o preço.

**Comparar:** candidatos da navegação do mesmo cliente e do catálogo liberado. Confira quantidade/medida/marca/condição e selecione uma amostra. São necessários ao menos três selecionados para a faixa central. Sem amostra, há ação para abrir uma busca e comparar os cards visíveis. Não há mediana inventada nem busca automática em páginas fechadas.

**Monitorar:** salva uma leitura pública mesmo que a API não libere detalhes. Atualiza ao revisitar com o painel aberto. O dashboard mostra “leitura da página; atualiza por visita” e preserva `+N` e contadores desconhecidos. Cron continua para acompanhamentos em modo API; páginas de terceiros não ganham essa promessa.

## Desenvolvimento e testes

- Servidor padrão: `https://radar.optarys.com.br`.
- Manifest de desenvolvimento permite também `http://localhost` e `http://127.0.0.1`; porta pode ser configurada em **Servidor da extensão**. Trocar de ambiente exige novo login e não reutiliza tokens de outro servidor.
- `npm run typecheck`, `npm test`, `npm run build`.
- `npm run test:integration`: requer PostgreSQL isolado e `RADAR_TEST_DATABASE=1`.
- `npm run test:extension`: requer Chromium do Playwright (`npx playwright install chromium`). Em ambiente com navegador próprio, usar `RADAR_CHROMIUM_PATH`.
- `node scripts/build-extension.mjs`: gera `dist/extension-prod`, com manifest sem localhost. Não publica na Chrome Web Store.

## Migração desta versão

`202610161300_extension_observation_sources` identifica a origem dos acompanhamentos e se vendidos são conhecidos ou apenas um limite inferior. Dados anteriores permanecem marcados como API. Aplicar com `npm run db:deploy` no processo de deploy.

## Validar com Mercado Livre real

1. Anúncio MLB próprio: detalhes autorizados, modalidades simuladas e cotação com parâmetros reais.
2. Anúncio MLBU de outro vendedor: leitura correta, sem dados de recomendação, monitoramento por visita e simulação manual possível.
3. Catálogo sem oferta selecionada: não tratar o ID do produto como anúncio.
4. Busca: selecionar pelo menos três kits equivalentes e conferir a mediana com os preços da tela.
5. Trocar de aba e de conta Radar: não reutilizar dados privados ou resultados antigos.
6. Confirmar que galeria, botões de compra, coluna de oferta e largura do ML permanecem funcionais.

A validação automática usa fixtures de DOM, contratos de API e PostgreSQL. Ela não substitui homologação OAuth e conferência de vendas/fretes reais. Veja [mapa de APIs e permissões](../docs/MERCADO_LIVRE_API_MAP.md).
