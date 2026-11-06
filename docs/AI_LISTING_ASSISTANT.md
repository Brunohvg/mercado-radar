# Mercado Radar — Assistente de anúncios e extensão

Branch: `feature/ai-listing-assistant-v1`.
Status: implementação inicial de interface e reutilização da infraestrutura de análise. **Não publicado em produção nem validado com vendedor real.**

## Objetivo

Qualquer produto permitido no Mercado Livre (não apenas ilhós ou tintas) pode iniciar um fluxo:
1. Nome ou EAN/GTIN, inclusive recebido da extensão do Chrome.
2. Descoberta de catálogo, categoria sugerida e comparáveis com evidência.
3. Confirmação de marca, SKU, custo, kit, dimensões e parâmetros desconhecidos.
4. Cotação de tarifa e frete pela API do vendedor; cálculo determinístico de lucro, margem e ROI.
5. Rascunho revisável, com lacunas de conteúdo e publicação sinalizadas.
6. **Futuro, após homologação:** enriquecimento por IA, fotos aprovadas, atributos obrigatórios por categoria, descrição, pré-validação, aprovação explícita e publicação pela API.

## Conectividade

- Site: `/assistente-anuncios`, linkado no menu principal.
- Extensão Chrome: abre a mesma tela e passa por URL apenas nome consultado e referência pública observada (MLB/MLBU); **nunca tokens, custos ou dados sensíveis**.
- Continua em leitura: extensão não recebe permissão de publicação, não executa POST de anúncio e não altera preços.
- Rotas reaproveitadas: `/api/ml/product-discovery` e `/api/ml/suggest-price`. Se retornarem acesso restrito ou dados faltantes, mostrar erro explícito.
- A extensão carregada no Chrome é atualizada separadamente do backend; atualizar arquivos, recarregar extensão e abas do ML.

## Gemini e imagens

**Configurado nesta branch:** `POST /api/ai/listing-draft` autenticado, com Gemini e chave apenas no servidor.
A tela `/assistente-anuncios` tem botão **Gerar título e descrição com Gemini**, campo de fatos confirmados e prévia revisável. Sem chave ou cota, a análise determinística continua funcionando normalmente.

Para homologação no Coolify: `RADAR_AI_PROVIDER=gemini`, `GEMINI_API_KEY=<chave secreta>`, `GEMINI_MODEL=gemini-2.5-flash-lite`. Configure como segredos/variáveis do serviço, nunca no Git. Reinicie o deploy para aplicar. Provedor `none` desliga a função. **Sem fallback automático para Grok/OpenAI.** A chave Grok reservada não é lida nesta versão.

A existência da API Free Tier do Gemini não garante que uma chave/projeto com faturamento ativo nunca produza custos. Confira **quota e faturamento no AI Studio**, e não habilite plano pago se o objetivo for custo zero. Dados enviados ao Free Tier podem ser utilizados pelo provedor conforme seus termos; não inclua segredos, dados de compradores ou fornecedor confidencial nos textos de entrada.

**As fotos ainda são fornecidas manualmente.** Não é criado anúncio final com imagens nem ocorre publicação no Mercado Livre.

## Pontos de precisão financeira

A API `/sites/MLB/listing_prices` retorna `sale_fee_amount` com taxa fixa **já incluída**. Na simulação assistida, o motor usa esse total integral em vez de somar uma taxa fixa duas vezes. A cotação também recebe o tipo de logística e a opção de frete grátis escolhidos, refletindo as regras de setembro/2026, e devolve a composição dos custos.

**Casos de regressão:** arame encapado kit 4 (custo de 4 rolos × R$3,96 e preço R$44,90) e Shake Paint Couro 37ml (custo R$7,50 com desconto 10%). **Tarifas e preços não confirmados são cenários de teste**, não cobranças observadas no ML. Para declarar equivalência com o vendedor, é obrigatório confrontar cotação real da conta e histórico do pedido.

## Notas anteriores

## Grok e imagens

- O código examinado possui estratégia para `AIProvider` com Grok/OpenAI, mas não a configuração operacional correspondente. A existência de credencial no Coolify não foi verificada.
- A IA generativa ainda **não** cria títulos/descrições/fotos no fluxo inicial. Integrar provedor somente com credencial segura no backend, cota/custo explícitos e fallback.
- Imagens: priorizar foto verdadeira do item/embalagem. Ferramentas de imagem podem limpar fundo, enquadrar e produzir fotos secundárias somente sem distorcer cor, marca, rótulo, quantidade ou características. Submeter à validação de imagens do Mercado Livre. Não copiar imagens de outros vendedores sem direitos.
- A futura publicação exige verificar políticas, elegibilidade da conta, escopos OAuth e requisitos User Products por categoria.

## Revisão da extensão 0.11.0

Estrutura atual: Manifest V3, `selectors.js` para coleta, `content.js` para contexto e widgets, `sidepanel.js` para visualização, `background.js` para sessão e API.

Pontos positivos:
- Tokens ML ficam no servidor, extensão recebe token Radar por dispositivo.
- `background.js` usa allowlist de rotas; a extensão é de leitura, sem autorização a endpoints de escrita de anúncios.
- Separação MLB/MLBU, dados desconhecidos versus zero e origem de estimativas.
- `manifest.prod.json` não concede host localhost.

Melhorias planejadas:
1. Atalho contextual para preparar rascunho no Radar (primeiro incremento).
2. Testes de seletores de novos layouts do Mercado Livre, busca, catálogo, produto e User Products.
3. UX simplificada para transferir somente contexto revisável, evitando copiar informações privadas do concorrente.
4. Verificação do protocolo de extensão e compatibilidade ao implantar novas versões.
5. Teste real com 2 contas diferentes, troca de workspace, login revogado, falha de API e carregamento parcial.
6. Performance: medir chamadas e mudanças no DOM em buscas extensas.
7. Fluxo futuro de envio de fotos pela web, não pelo content script; histórico/consentimento no servidor.

## Critérios para liberar publicação

- Permissão de escrita realmente autorizada para cada conta; funcionalidade de criação confirmada nas APIs oficiais atuais.
- Atributos e fotos completos, próprios e revisados; categoria validada.
- Cotação financeira com fontes; custos desconhecidos bloqueiam publicação.
- Detecção de duplicidade de SKU/GTIN/MLB; idempotência e trilha de auditoria.
- Aprovação explícita de vendedor, sem publicação silenciosa.
- Migrations, testes unitários, integração, CI, homologação no Coolify e smoke test com vendedor real.
