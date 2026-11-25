# 06 · Mercado Livre por inteiro, camada de marketplaces e pesquisa com IA

## 1. Mapa da API do Mercado Livre (usado x novo x fora)

Todos os endpoints são de leitura e usam o token da conta que o próprio usuário conectou (OAuth). Nada é publicado.

| Recurso | Endpoint oficial | Antes | Agora | Para que serve no Radar |
|---|---|---|---|---|
| Identidade do anúncio | `/items/{id}?include_attributes=all` | usado | usado | marca, modelo, GTIN, fabricante, unidades |
| Preço atual | `/items/{id}/prices` | só varejo | **todas as faixas** | preço ao consumidor, **preço por quantidade** e **preço para CNPJ** |
| Tarifa de venda | `/sites/MLB/listing_prices` | usado | usado | comissão e tarifa fixa oficiais |
| Frete | `/users/{id}/shipping_options/free`, `/shipments/{id}/costs` | usado | usado | custo de envio |
| Visitas | `/visits/items`, `/items/{id}/visits/time_window` | usado | usado | tráfego |
| Catálogo e buy box | `/products/{id}`, `/products/{id}/items`, `/items/{id}/price_to_win` | usado | usado | concorrência |
| Tendências | `/trends/MLB`, `/highlights/MLB/category/{id}` | usado | usado | buscas em alta, mais vendidos |
| Categoria prevista | `/sites/MLB/domain_discovery/search` | usado | usado | categoria pelo título |
| Busca | `/sites/MLB/search`, `/products/search` | usado | usado | pesquisa de concorrentes |
| Vendas da conta | `/orders/search`, `/orders/{id}/shipments` | usado | usado | lucro real |
| Product Ads | `/advertising/...` | usado | usado | custo de anúncio |
| **Reputação do vendedor** | `/users/{id}` | — | **novo** | termômetro, medalha, vendas, reclamações, cidade/UF |
| **Perguntas** | `/questions/search?item={id}` | — | **novo** | dúvidas reais dos compradores, agrupadas por tema |
| **Opiniões** | `/reviews/item/{id}` | — | **novo** | nota, distribuição e críticas recentes |
| **Ficha da categoria** | `/categories/{id}`, `/categories/{id}/attributes` | — | **novo** | caminho da categoria e atributos obrigatórios para anunciar |

Fora por decisão (não agregam ao sourcing ou exigem papel de vendedor sobre o anúncio de outro): mensagens pós-venda, reclamações e mediações, faturamento, promoções/campanhas de terceiros, notificações (webhooks). Notificações entram quando o Radar monitorar a conta do próprio usuário em tempo real.

### Como os sinais novos aparecem
- **Preço por quantidade**: se o anúncio publica faixa ("a partir de 10, R$ 82 cada"), a tela oferece **Usar como cotação**. Isso cria o vendedor como fornecedor (Loja no Mercado Livre) e uma cotação marcada como *preço publicado*, com o link de evidência. Frete da compra fica "a confirmar".
- **Vendedor**: reputação e UF ajudam a decidir se vale comprar dele ou competir com ele.
- **Perguntas**: temas como "atacado", "nota fiscal", "medida" viram perguntas para o fornecedor e insumo para o anúncio.
- **Opiniões**: sem opinião, a nota fica vazia (nunca zero).
- **Ficha da categoria**: lista o que é obrigatório para anunciar e destaca o que nem o anúncio de referência informa. É o que pedir ao fornecedor antes de comprar.

Cada sinal falha sozinho: se o Mercado Livre restringir um endpoint (403) ou não tiver o dado (404), o card mostra o motivo e os outros continuam.

## 2. Camada de marketplaces (Shopee e outros)

`lib/marketplaces/` define um contrato único:
- `types.ts`: sinais normalizados (`PriceSignal`, `SellerSignal`, `QuestionsSignal`, `ReviewsSignal`, `CategorySignal`) com status `OK`, `SEM_DADOS`, `INDISPONIVEL` ou `NAO_SUPORTADO`, e a matriz de capacidades de cada marketplace.
- `mercado-livre/normalize.ts`: funções puras e testadas.
- `mercado-livre/adapter.ts`: coleta em paralelo, falha isolada.
- `shopee.ts`: capacidades mapeadas para a Shopee Open Platform v2 (`get_item_base_info`, `get_comment`, `get_attribute_tree`, pedidos, logística, ads). Ainda não consulta nada: exige cadastro de parceiro (partner_id/partner_key) e autorização da loja.
- `registry.ts`: escolhe o adaptador pelo formato do ID do anúncio.

A tela consome só o formato comum, então a Shopee entra implementando o adaptador, sem mudar a interface.

## 3. Pesquisa de fornecedores com a IA já integrada (Gemini + Google Search)

O projeto já usa o Gemini (assistente de anúncio). O Gemini tem pesquisa Google embutida (*grounding*), então ele pode substituir ou complementar a Brave.

Fluxo:
1. A IA recebe **só dados do produto**: título, marca, fabricante, modelo, GTIN válido, unidades e caminho da categoria.
2. Ela pesquisa no Google e devolve fornecedores em JSON.
3. O Radar **descarta** qualquer fornecedor cujo site não esteja entre as fontes que o Google devolveu para essa pesquisa, e também varejo.
4. **Preço nunca vem da IA.** Telefone, e-mail e CNPJ só aparecem como "confirmado na página" se o texto estiver na página do próprio fornecedor (lida com proteção contra endereços internos). O resto fica "a confirmar". CNPJ com dígito inválido é descartado, e o válido segue para a consulta na Receita (BrasilAPI).
5. As sugestões de pesquisa do Google são exibidas como os termos do grounding exigem.

Ligar (decisão do Bruno, tem custo):
```
RADAR_AI_PROVIDER=gemini
GEMINI_API_KEY=...
RADAR_AI_SUPPLIER_SEARCH=1
```
Custo: a pesquisa com Google Search é cobrada à parte pelo Google, além dos tokens, depois da franquia gratuita do plano. Conferir os valores no Google AI Studio antes de ligar. Cada pesquisa consome 1 da cota diária do workspace.

Brave e IA podem rodar juntos: os resultados são unidos por domínio.

## 4. Pendências de homologação (lado do Bruno)
- Confirmar com a conta real que `/questions/search`, `/reviews/item` e `/users/{id}` respondem para o app (o ambiente de nuvem não alcança a API do ML).
- Confirmar em anúncios reais com "preço por quantidade" que o valor de `min_purchase_unit` é o preço por unidade do anúncio.
- Testar a pesquisa com IA em 10 produtos e medir quantos fornecedores sobrevivem à regra de fonte.
