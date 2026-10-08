# Inteligência de mercado (v4)

Como o Mercado Radar mostra **vendas/dia, faturamento/dia e visitas/dia de anúncios de qualquer vendedor**
sem acesso privilegiado à API do Mercado Livre.

## O que a API permite (out/2026)

| Recurso | Anúncio seu | Anúncio de terceiro |
|---|---|---|
| `/items/bulk?ids=` (substitui `/items?ids=`, prazo 25/10/2026) | completo | `sold_quantity`, `available_quantity` e datas ocultos |
| `/visits/items`, `/items/{id}/visits/time_window` | sim | 403 |
| `/orders/search` | sim | não |
| `/products/{id}` (`buy_box_winner`) | sim | sim |
| `/sites/MLB/search` | bloqueado para muitas apps desde 2025 | idem |

Conclusão: números exatos de terceiros não existem para um app comum. Ferramentas do mercado
(Cargoos, Real Trends, Hunter etc.) mostram **estimativas**. O Radar faz o mesmo, mas diz o método,
a confiança e o intervalo de cada número.

## Arquitetura

```
página do ML aberta pelo usuário
  └─ extensão (selectors.js) lê: preço, faixa de vendidos, avaliações, nota, frete, Full, "mais vendido"
       └─ POST /api/extension/observations
            ├─ grava MarketItem + MarketItemSnapshot (1 leitura a cada 6 h por anúncio, ou quando algo muda)
            └─ devolve estimativas (lib/market-intel.ts → lib/market-estimates.ts)
cron /api/cron/radar-monitoring
  └─ sincroniza seus anúncios → leitura OWN_API (vendidos exatos + visitas) → calibra o modelo
painel /mercado
  └─ GET /api/market/items e /api/market/items/{id}
```

A extensão não navega sozinha, não abre páginas, não usa a sessão do Mercado Livre e não chama
endpoints internos: só lê a página que você já abriu.

## Métodos de estimativa (lib/market-estimates.ts)

| Método | Quando | Como | Confiança |
|---|---|---|---|
| **Oficial** | anúncio seu, pedidos sincronizados há ≤ 3 dias | unidades vendidas em 30 dias; visitas pela diferença das leituras oficiais | alta |
| **Histórico** | ≥ 2 leituras com ≥ 2 dias de distância | Δavaliações/Δdias × (vendidos ÷ avaliações do próprio anúncio), limitado pela mudança de faixa de vendidos | média (≥ 3 avaliações novas em ≥ 5 dias) ou baixa |
| **Estimativa** | 1 leitura + idade conhecida | vendidos acumulados (faixa) ÷ idade | baixa |
| **Página** | 1 leitura, sem idade | só o acumulado | sem medição |

- **Faixa de vendidos**: "+1000 vendidos" vira o intervalo [1000, 2000) pela escada de faixas do ML.
- **Idade do anúncio**: data da API quando existe; senão, interpolada pelo número do anúncio (IDs MLB
  são sequenciais) usando âncoras de anúncios com data conhecida (os seus, por exemplo).
- **Visitas** = vendas ÷ conversão. A conversão é a mediana dos seus anúncios (vendidos ÷ visitas
  oficiais); sem dados seus, usa a faixa típica 1,2%–5% e avisa.
- **Catálogo**: em anúncios de catálogo as avaliações são do produto (todos os vendedores). A razão
  vendidos ÷ avaliações do próprio anúncio converte o ritmo do produto na fatia deste anúncio.

Quanto mais você navega, melhor fica: cada busca aberta grava leituras de até 60 anúncios.

## Banco

Migração `prisma/migrations/202610071900_market_intelligence` cria `MarketItem` e
`MarketItemSnapshot`. É aplicada sozinha no deploy (`prisma migrate deploy` no start do container).
Retenção: o cron apaga leituras com mais de 1 ano.

## Limitações conhecidas

- Tudo de terceiros é estimativa; o intervalo mostrado é o que importa.
- O parser do DOM depende do layout do ML. Toda leitura fica em `extension/selectors.js`, com
  JSON-LD e texto como reserva, e o aviso de layout alterado continua ativo.
- Frete de anúncio de terceiro não entra na calculadora (depende de peso e reputação de quem vende);
  a tela avisa isso.
