# Mercado Radar — Integração Product Ads

## Decisão de integração

O Radar usa somente o fluxo atual de Product Ads.

Não implementar novamente os endpoints legados de métricas de anúncios.
A camada de produto deve trabalhar com:

1. advertiser;
2. campanhas;
3. Ad Groups;
4. métricas de Ad Groups;
5. métricas orgânicas + patrocinadas quando retornadas.

## Endpoints usados

### Advertiser

```text
GET /advertising/advertisers?product_id=PADS
Api-Version: 1
```

### Campanhas + métricas

```text
GET /advertising/{site_id}/advertisers/{advertiser_id}/product_ads/campaigns/search
api-version: 2
```

### Ad Groups + métricas

```text
GET /advertising/{site_id}/advertisers/{advertiser_id}/product_ads/ad_groups/search
api-version: 2
```

## Métricas prioritárias no Radar

- cost;
- total_amount;
- direct_amount;
- indirect_amount;
- roas;
- acos;
- tacos;
- clicks;
- prints;
- ctr;
- cvr;
- units_quantity;
- organic_units_quantity;
- impression_share;
- lost_impression_share_by_budget;
- lost_impression_share_by_ad_rank.

## Regra financeira

ROAS alto não significa lucro alto.

O Radar calcula, no mesmo período:

```text
lucro conhecido pós-Ads
=
lucro realizado dos pedidos com custo conhecido
-
investimento Product Ads
```

Sempre mostrar a cobertura:

```text
pedidos com lucro calculado / pedidos totais
```

Se a cobertura não for 100%, o resultado deve ser apresentado como lucro conhecido/parcial, nunca como lucro total definitivo.

## Período

A UI oferece 7, 30 e 90 dias.

O dashboard deve tratar o período corrente como potencialmente parcial e nunca transformar ausência de atualização intradiária em queda real de performance.

## Próximos passos Ads

- mapear Ad Group -> item/User Product;
- cruzar custo real por produto;
- lucro pós-Ads por produto;
- identificar Ads que vendem mas destroem margem;
- orçamento recomendado pelo lucro marginal;
- alertar ROAS caindo;
- alertar orçamento limitando impressão;
- comparar ROAS atual x roas_target;
- recomendar aumentar, manter ou reduzir orçamento;
- histórico diário próprio no PostgreSQL.
