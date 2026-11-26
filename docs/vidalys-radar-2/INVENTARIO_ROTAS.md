# Inventário físico da base auditada

Base: `7fdfa333474f4254ffd3e0daa44f3193c145392c`. Gerado dos arquivos desse checkout; inventário não equivale a homologação de cada rota.

## Páginas — 26

| Rota | Arquivo |
| --- | --- |
| `/analisar` | `app/analisar/page.tsx` |
| `/anuncios` | `app/anuncios/page.tsx` |
| `/assistente-anuncios` | `app/assistente-anuncios/page.tsx` |
| `/concorrentes` | `app/concorrentes/page.tsx` |
| `/configuracoes` | `app/configuracoes/page.tsx` |
| `/ean` | `app/ean/page.tsx` |
| `/extensao/conectar` | `app/extensao/conectar/page.tsx` |
| `/extensao` | `app/extensao/page.tsx` |
| `/fornecedores` | `app/fornecedores/page.tsx` |
| `/historico` | `app/historico/page.tsx` |
| `/integracoes` | `app/integracoes/page.tsx` |
| `/kits` | `app/kits/page.tsx` |
| `/login` | `app/login/page.tsx` |
| `/melhorar-anuncio` | `app/melhorar-anuncio/page.tsx` |
| `/mercado` | `app/mercado/page.tsx` |
| `/monitoramento` | `app/monitoramento/page.tsx` |
| `/onboarding` | `app/onboarding/page.tsx` |
| `/onde-comprar/[id]` | `app/onde-comprar/[id]/page.tsx` |
| `/onde-comprar` | `app/onde-comprar/page.tsx` |
| `/oportunidades` | `app/oportunidades/page.tsx` |
| `/` | `app/page.tsx` |
| `/produtos` | `app/produtos/page.tsx` |
| `/promocoes` | `app/promocoes/page.tsx` |
| `/publicidade` | `app/publicidade/page.tsx` |
| `/reposicao` | `app/reposicao/page.tsx` |
| `/vendas` | `app/vendas/page.tsx` |

## APIs — 98

Handlers públicos no proxy podem ter autenticação própria (Bearer, cron, callback ou webhook). A lista de métodos é extraída das funções exportadas; requisitos completos dependem da implementação.

| Rota | Métodos | Arquivo |
| --- | --- | --- |
| `/api/ai/listing-draft` | POST | `app/api/ai/listing-draft/route.ts` |
| `/api/ai/packaging-estimate` | POST | `app/api/ai/packaging-estimate/route.ts` |
| `/api/ai/photo-facts` | POST | `app/api/ai/photo-facts/route.ts` |
| `/api/ai/status` | GET, POST | `app/api/ai/status/route.ts` |
| `/api/analyses` | GET, DELETE | `app/api/analyses/route.ts` |
| `/api/analyze` | POST | `app/api/analyze/route.ts` |
| `/api/auth/login` | POST | `app/api/auth/login/route.ts` |
| `/api/auth/logout` | POST | `app/api/auth/logout/route.ts` |
| `/api/auth/password` | POST | `app/api/auth/password/route.ts` |
| `/api/calculator` | POST | `app/api/calculator/route.ts` |
| `/api/cron/radar-monitoring` | GET, POST | `app/api/cron/radar-monitoring/route.ts` |
| `/api/decisions` | GET | `app/api/decisions/route.ts` |
| `/api/extension/auth/browser-link` | POST | `app/api/extension/auth/browser-link/route.ts` |
| `/api/extension/auth/logout` | POST | `app/api/extension/auth/logout/route.ts` |
| `/api/extension/auth/refresh` | POST | `app/api/extension/auth/refresh/route.ts` |
| `/api/extension/auth/session` | GET | `app/api/extension/auth/session/route.ts` |
| `/api/extension/auth/start` | GET | `app/api/extension/auth/start/route.ts` |
| `/api/extension/auth/token` | POST | `app/api/extension/auth/token/route.ts` |
| `/api/extension/dev-installer` | GET | `app/api/extension/dev-installer/route.ts` |
| `/api/extension/dev-installer-cmd` | GET | `app/api/extension/dev-installer-cmd/route.ts` |
| `/api/extension/item` | GET | `app/api/extension/item/route.ts` |
| `/api/extension/items` | GET | `app/api/extension/items/route.ts` |
| `/api/extension/linux-installer` | GET | `app/api/extension/linux-installer/route.ts` |
| `/api/extension/market` | GET | `app/api/extension/market/route.ts` |
| `/api/extension/observations` | POST | `app/api/extension/observations/route.ts` |
| `/api/extension/profitability` | POST | `app/api/extension/profitability/route.ts` |
| `/api/extension/publication-capabilities` | GET | `app/api/extension/publication-capabilities/route.ts` |
| `/api/extension/search` | POST, GET | `app/api/extension/search/route.ts` |
| `/api/extension/search-profitability` | POST | `app/api/extension/search-profitability/route.ts` |
| `/api/extension/sourcing` | POST | `app/api/extension/sourcing/route.ts` |
| `/api/extension/watchlist` | GET, POST, DELETE | `app/api/extension/watchlist/route.ts` |
| `/api/health` | GET | `app/api/health/route.ts` |
| `/api/hunter` | GET | `app/api/hunter/route.ts` |
| `/api/integrations/mercadolivre/authorize` | GET | `app/api/integrations/mercadolivre/authorize/route.ts` |
| `/api/integrations/mercadolivre/callback` | GET | `app/api/integrations/mercadolivre/callback/route.ts` |
| `/api/integrations/mercadolivre/diagnostics` | GET | `app/api/integrations/mercadolivre/diagnostics/route.ts` |
| `/api/integrations/mercadolivre/probe` | GET | `app/api/integrations/mercadolivre/probe/route.ts` |
| `/api/integrations/mercadolivre/status` | GET | `app/api/integrations/mercadolivre/status/route.ts` |
| `/api/intelligence/competitors` | GET | `app/api/intelligence/competitors/route.ts` |
| `/api/intelligence/competitors/watch` | POST | `app/api/intelligence/competitors/watch/route.ts` |
| `/api/intelligence/drafts` | GET, POST, DELETE | `app/api/intelligence/drafts/route.ts` |
| `/api/intelligence/kits/context` | GET | `app/api/intelligence/kits/context/route.ts` |
| `/api/intelligence/kits/quote` | POST | `app/api/intelligence/kits/quote/route.ts` |
| `/api/listing-drafts/photos/[id]` | GET | `app/api/listing-drafts/photos/[id]/route.ts` |
| `/api/listing-drafts/photos` | POST | `app/api/listing-drafts/photos/route.ts` |
| `/api/listing-drafts/publication` | POST | `app/api/listing-drafts/publication/route.ts` |
| `/api/listing-drafts` | GET, POST | `app/api/listing-drafts/route.ts` |
| `/api/market/items/[id]` | GET | `app/api/market/items/[id]/route.ts` |
| `/api/market/items` | GET | `app/api/market/items/route.ts` |
| `/api/ml/ads` | GET | `app/api/ml/ads/route.ts` |
| `/api/ml/category-attributes` | GET | `app/api/ml/category-attributes/route.ts` |
| `/api/ml/category-predict` | POST | `app/api/ml/category-predict/route.ts` |
| `/api/ml/ean-batch` | POST | `app/api/ml/ean-batch/route.ts` |
| `/api/ml/listing-insights` | GET | `app/api/ml/listing-insights/route.ts` |
| `/api/ml/listing-quality/apply` | POST | `app/api/ml/listing-quality/apply/route.ts` |
| `/api/ml/listing-quality` | GET | `app/api/ml/listing-quality/route.ts` |
| `/api/ml/listing-quality/suggest` | POST | `app/api/ml/listing-quality/suggest/route.ts` |
| `/api/ml/market-scan` | POST | `app/api/ml/market-scan/route.ts` |
| `/api/ml/opportunities` | GET | `app/api/ml/opportunities/route.ts` |
| `/api/ml/opportunity-search` | POST | `app/api/ml/opportunity-search/route.ts` |
| `/api/ml/opportunity-trends` | GET | `app/api/ml/opportunity-trends/route.ts` |
| `/api/ml/product-discovery` | POST | `app/api/ml/product-discovery/route.ts` |
| `/api/ml/product-search` | GET | `app/api/ml/product-search/route.ts` |
| `/api/ml/products/cost` | PATCH | `app/api/ml/products/cost/route.ts` |
| `/api/ml/products/edit` | POST | `app/api/ml/products/edit/route.ts` |
| `/api/ml/products` | GET | `app/api/ml/products/route.ts` |
| `/api/ml/products/supplier` | PATCH | `app/api/ml/products/supplier/route.ts` |
| `/api/ml/publication-capabilities` | GET | `app/api/ml/publication-capabilities/route.ts` |
| `/api/ml/quote` | POST | `app/api/ml/quote/route.ts` |
| `/api/ml/sales/export` | GET | `app/api/ml/sales/export/route.ts` |
| `/api/ml/sales` | GET | `app/api/ml/sales/route.ts` |
| `/api/ml/seller-shipping` | GET | `app/api/ml/seller-shipping/route.ts` |
| `/api/ml/suggest-price` | POST | `app/api/ml/suggest-price/route.ts` |
| `/api/monitoring/alerts` | GET, PATCH | `app/api/monitoring/alerts/route.ts` |
| `/api/monitoring/watchlist/refresh` | POST | `app/api/monitoring/watchlist/refresh/route.ts` |
| `/api/monitoring/watchlist` | POST, GET, DELETE | `app/api/monitoring/watchlist/route.ts` |
| `/api/onboarding` | GET | `app/api/onboarding/route.ts` |
| `/api/pilot/briefing` | GET | `app/api/pilot/briefing/route.ts` |
| `/api/pilot/price` | POST | `app/api/pilot/price/route.ts` |
| `/api/pilot/questions/[id]/answer` | POST | `app/api/pilot/questions/[id]/answer/route.ts` |
| `/api/pilot/questions/[id]/draft` | POST | `app/api/pilot/questions/[id]/draft/route.ts` |
| `/api/promotions/join` | POST | `app/api/promotions/join/route.ts` |
| `/api/promotions` | GET | `app/api/promotions/route.ts` |
| `/api/purchase-order` | GET | `app/api/purchase-order/route.ts` |
| `/api/sourcing/capital` | POST | `app/api/sourcing/capital/route.ts` |
| `/api/sourcing/cnpj` | GET | `app/api/sourcing/cnpj/route.ts` |
| `/api/sourcing/opportunities/[id]/insights` | POST | `app/api/sourcing/opportunities/[id]/insights/route.ts` |
| `/api/sourcing/opportunities/[id]` | GET, PATCH, DELETE | `app/api/sourcing/opportunities/[id]/route.ts` |
| `/api/sourcing/opportunities/[id]/search` | POST | `app/api/sourcing/opportunities/[id]/search/route.ts` |
| `/api/sourcing/opportunities` | GET, POST | `app/api/sourcing/opportunities/route.ts` |
| `/api/sourcing/quotes/[id]` | DELETE, PATCH | `app/api/sourcing/quotes/[id]/route.ts` |
| `/api/sourcing/quotes` | POST | `app/api/sourcing/quotes/route.ts` |
| `/api/sourcing/suppliers/[id]/cnpj` | POST | `app/api/sourcing/suppliers/[id]/cnpj/route.ts` |
| `/api/sourcing/suppliers/[id]` | PATCH, DELETE | `app/api/sourcing/suppliers/[id]/route.ts` |
| `/api/sourcing/suppliers` | GET, POST | `app/api/sourcing/suppliers/route.ts` |
| `/api/webhooks/mercadolivre` | GET, POST | `app/api/webhooks/mercadolivre/route.ts` |
| `/api/workspace/clients` | GET, POST, PATCH | `app/api/workspace/clients/route.ts` |
| `/api/workspace` | GET, PATCH | `app/api/workspace/route.ts` |

## Modelos — 28

`RadarWorkspace`, `RadarResearchDraft`, `RadarUser`, `RadarUserSession`, `RadarWorkspaceUsage`, `AppSettings`, `Product`, `ProductAnalysis`, `MercadoLivreAccount`, `SyncRun`, `MercadoLivreNotification`, `MarketSnapshot`, `MercadoLivreProduct`, `MercadoLivreOrder`, `MercadoLivreOrderItem`, `RadarWatchItem`, `RadarWatchSnapshot`, `RadarAlert`, `RadarExtensionAccess`, `RadarExtensionAuthCode`, `RadarExtensionUsage`, `MarketItem`, `MarketItemSnapshot`, `ListingDraft`, `SourcingOpportunity`, `SourcingSupplier`, `SourcingQuote`, `PilotActionLog`

## Migrations — 23

As migrations existentes foram inventariadas e não alteradas. Execução em banco limpo/upgrade consta do CI da base; não foi repetida contra banco comercial nesta sessão.
