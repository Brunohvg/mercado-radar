# Compatibilidade de publicação do Mercado Livre — homologação

## Objetivo
O aplicativo é multi-tenant. O **vendedor autenticado** autoriza pelo OAuth; nenhuma chamada usa a conta pessoal do desenvolvedor como fallback.

## API e modelos
- OAuth: a aplicação deve ter **Publicação e sincronização (leitura e escrita)** habilitada no DevCenter, e o vendedor precisa conceder o escopo `write` na reconexão.
- `GET /users/{SELLER_ID}`: presença de `user_product_seller` em `tags` indica User Products; ausência indica modelo legado. Dados indisponíveis bloqueiam publicação, não disparam fallback.
- Legacy: `POST /items` com `title`, sem `family_name`.
- User Products: `POST /items` com `family_name`, sem `title`; variantes são anunciadas como itens separados, sem enviar array `variations`.
- Cada criação exige `POST /items/validate` bem-sucedido antes de habilitar confirmação de criação. Revalidar custos, frete, fotos e categoria por vendedor.
- `MLBU...` é referência de **User Product**, não deve ser tratada como `catalog_product_id`; a identificação de catálogo no Brasil usa identificador `MLB...`.
- Catálogo exige correspondência exata (marca, GTIN, volume, quantidade, variante e apresentação) e elegibilidade confirmada. **O fluxo de criação direta em catálogo permanece bloqueado** até ser validado separadamente. Encontrar referência em busca de produtos não garante permissão.
- Criar apenas anúncio **pausado**, por confirmação explícita. `RADAR_ENABLE_PUBLISHING=false` é o padrão. Falhas após `POST /items` não devem gerar retry automático para evitar duplicidade.
- O volume de uploads `radar-uploads` precisa ser persistente no Compose; fotos não devem desaparecer após deploy.

## Sincronização web e extensão
- Fonte de verdade: `lib/ml-publication-capabilities.ts`.
- Web: `GET /api/ml/publication-capabilities`.
- Extensão: `GET /api/extension/publication-capabilities`, autenticado pelo dispositivo e conta vendedora associada. A resposta contém apenas metadados, **nunca o access token do Mercado Livre**.
- A extensão informa compatibilidade e bloqueios; não permite disparar criação de anúncios diretamente.
- Versão da extensão e do painel instalador devem coincidir.

## Checklist de homologação obrigatório
1. Habilitar grant de escrita no DevCenter e reconectar vendedor; conferir **Integrações**.
2. Consultar conta Legacy de teste (se disponível) e garantir envio de `title`.
3. Consultar vendedor com `user_product_seller` e garantir envio de `family_name` sem `title`.
4. Fazer `POST /items/validate` com custo, peso, dimensões, frete, fotos, marca e categoria confirmados. Verificar erros/causas retornados, sem `POST /items` real.
5. Testar produto sem catálogo, referência com apresentação divergente e referência de User Product `MLBU...` — não publicar automaticamente no catálogo.
6. Instalar extensão no Chrome/Chromium, autenticar e conferir modelo/escopo exibidos; não exigir digitar servidor.
7. Exercitar salvamento e recuperação de rascunho mesmo quando API ML estiver temporariamente indisponível.
8. Comparar tarifa e frete na mesma conta e preço com a simulação do painel vendedor; diferenças precisam de explicação.
9. Somente após autorização explícita de teste e reconciliação de preço, habilitar `RADAR_ENABLE_PUBLISHING=true` **na homologação**, criar um único anúncio pausado e confirmar o ID e status antes de qualquer novo teste.
10. Manter `main` e produção isoladas até os testes reais estarem concluídos.

## Fontes oficiais
- https://developers.mercadolivre.com.br/pt_br/publicacao-de-produtos/user-products
- https://developers.mercadolivre.com.br/pt_br/publicacao-no-catalogo
- https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao/publicacao-de-produtos
- https://developers.mercadolivre.com.br/pt_br/preco-variacao
