# Auditoria de APIs Mercado Livre — 2026-10-06

## Resultado

A arquitetura atual usa os endpoints corretos para os fluxos principais do Mercado Radar.

### OAuth
- Authorization Code server-side;
- state;
- PKCE;
- access token;
- refresh token;
- Authorization: Bearer no backend.

### Itens
Atual:
- /users/{user_id}/items/search
- /items/bulk?ids=...

Correto e alinhado com a migração oficial de /items?ids= para /items/bulk?ids=.

### Busca de marketplace
Atual:
- /sites/MLB/search?q=...

Endpoint válido para leitura das listagens do marketplace.

### Visitas
Atual:
- /visits/items?ids=...

Endpoint válido para visitas totais por anúncio.

### Trends
Atual:
- /trends/MLB
- /trends/MLB/{category_id}

Correto.

### Mais vendidos
Atual:
- /highlights/MLB/category/{category_id}

Correto.

### Product Ads — advertiser
Atual:
- /advertising/advertisers?product_id=PADS
- Api-Version: 1

Correto.

### Product Ads — campanhas
Atual:
- /advertising/{site_id}/advertisers/{advertiser_id}/product_ads/campaigns/search
- api-version: 2
- metrics_summary=true

Correto.

### Product Ads — Ad Groups
Atual:
- /advertising/{site_id}/advertisers/{advertiser_id}/product_ads/ad_groups/search
- api-version: 2
- métricas atuais de Ad Group

Correto. Não usar mais os antigos endpoints /product_ads/ads/search.

## Permissões funcionais necessárias no DevCenter

Para o escopo atual do Radar:

1. Usuários (default)
2. Publicação e sincronização
3. Métricas de negócio
4. Publicidade de produtos

Para o produto final, usar read + write apenas onde houver ações de alteração.
Manter offline_access para refresh token.

## Diagnóstico de 403

Um 403 com:
- PA_UNAUTHORIZED_RESULT_FROM_POLICIES
- At least one policy returned UNAUTHORIZED

indica permissão funcional ausente ou grant sem autorização suficiente.

Após alterar permissões no DevCenter, refazer o fluxo OAuth para garantir um grant atualizado.

## Extensão Chrome

O erro "Não autorizado" mostrado pelo Side Panel não é uma resposta do Mercado Livre.

Ele acontece antes, na autenticação:
- browser extension -> radar.optarys.com.br
- header x-radar-extension-key
- comparação com RADAR_EXTENSION_API_KEY

A chave exibida/configurada na extensão nunca deve ser o access token do Mercado Livre.

## Diagnóstico do Radar

/api/integrations/mercadolivre/diagnostics agora testa separadamente:
- conta;
- aplicação;
- publicações;
- métricas;
- vendas/pedidos;
- Product Ads;
- catálogo;
- category discovery;
- busca de marketplace;
- trends.

Assim conseguimos distinguir:
- problema de token;
- permissão funcional;
- endpoint bloqueado;
- rate limit;
- API indisponível.


## Correção — busca ampla por palavra-chave

O endpoint `/sites/MLB/search?q=...` respondeu HTTP 403 para a aplicação mesmo com OAuth, catálogo e demais permissões saudáveis.

A documentação atual mantém `/sites/{site}/search` principalmente para consultas por `seller_id` ou `nickname`. Para descoberta por palavra-chave, o Radar passa a usar:

- `/products/search?site_id=MLB&status=active&q=...` no dashboard web;
- `/products/{product_id}` para obter detalhes e `buy_box_winner`;
- `/items/{item_id}/price_to_win?siteId=MLB&version=v2` para competição de catálogo;
- IDs dos anúncios visíveis na própria página do Mercado Livre quando a Extensão Radar está ativa;
- `/items/bulk?ids=...` para enriquecer esses IDs.

A busca ampla antiga deixa de ser requisito de saúde da integração.

### Ranking orgânico

O Radar não tenta mais inferir posição orgânica chamando uma busca ampla bloqueada.

A Extensão Radar observa a posição real dos cards na página de resultados e grava `MarketSnapshot` quando anúncios da conta conectada aparecem. Esse snapshot abastece:
- posição;
- P25/mediana/P75 dos anúncios visíveis;
- concorrentes observados;
- histórico de preço e posição.

Assim, o ranking representa o que o usuário realmente viu na busca do Mercado Livre.
