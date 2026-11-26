# Mercado Radar — Quality Gates

Este arquivo define bloqueios objetivos para evitar que uma feature incompleta chegue a ser tratada como confiável.

## QG1 — Financeiro

Bloqueia release se:
- fórmula mudou sem teste;
- margem/ROI divergem do cálculo esperado;
- frete/tarifa estimados são exibidos como reais;
- custo ausente vira zero silenciosamente;
- arredondamento altera decisão sem indicação.

## QG2 — Mercado Livre

Bloqueia release se:
- OAuth não retorna ao domínio público;
- refresh token não funciona;
- endpoint depende de permissão não concedida;
- resposta 401/429 não é tratada;
- seller errado pode ser consultado;
- webhook pode duplicar entidade.

## QG3 — Banco

Bloqueia release se:
- migration é destrutiva sem plano;
- índice/unique necessário para idempotência está ausente;
- deploy novo perde dados;
- schema e Prisma Client estão fora de sincronia.

## QG4 — Market Intelligence

Bloqueia confiança na decisão se:
- menos de 4 comparáveis úteis e a UI não sinaliza evidência fraca;
- própria conta aparece como concorrente;
- quantidade/modelo claramente diferentes entram como similares fortes;
- preço antigo é tratado como atual sem fallback/indicação;
- score é apresentado como previsão de vendas.

## QG5 — Sales Intelligence

Bloqueia dashboard de lucro se:
- custo do SKU estiver ausente e o sistema mostrar lucro como definitivo;
- cancelamento/estorno não for tratado;
- frete realizado não estiver distinguido de estimativa;
- pedido duplicado puder entrar;
- faturamento for confundido com lucro.

## QG6 — IA

Bloqueia feature se:
- depender de provedor pago no MVP;
- não houver fallback;
- IA puder alterar custo/tarifa/frete/vendas como fato;
- resposta não for validada;
- secret/token puder ser enviado ao modelo.

## QG7 — UI

Bloqueia release se:
- mobile quebra fluxo principal;
- status positivo/negativo usa semântica inconsistente;
- erro não informa próxima ação;
- campo técnico obrigatório poderia ser obtido automaticamente e não há explicação;
- decisão importante fica escondida.

## QG8 — Deploy

Bloqueia confirmação de release se:
- HEAD não tem CI verde;
- healthcheck falha;
- migration falha;
- logs entram em loop;
- domínio público não funciona.

## Regra de status

Use somente:

- **Planejado**
- **Em desenvolvimento**
- **Implementado / aguardando validação**
- **Validado**
- **Bloqueado**
- **Concluído**

Evitar dizer "terminou" apenas porque o código foi escrito.
