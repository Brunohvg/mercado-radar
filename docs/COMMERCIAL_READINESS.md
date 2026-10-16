# Mercado Radar — preparação comercial

Data: 15/10/2026. Base: `feature/chrome-extension-radar-v1` em `809d157`.
Branch de trabalho: `feature/radar-commercial-readiness-v1`.

Status: **implementado / aguardando validação em homologação com Mercado Livre real**.
Este trabalho prepara um piloto com acessos individuais. Não representa lançamento público, integração de cobrança ou aprovação na Chrome Web Store.

## Referências e decisão de produto

Páginas oficiais consultadas em 15/10/2026:

| Referência | Capacidade divulgada | Decisão no Radar |
| --- | --- | --- |
| [Cargoos](https://cargoos.com.br/) e [calculadora](https://cargoos.com.br/calculadora/mercado-livre) | Extensão, margem, concorrência, EAN e monitoramento | Manter análise na página e melhorar clareza de custos, origem e decisão |
| [Real Trends](https://www.real-trends.com/br/Ferramentas) | Concorrência, gestão, preços e múltiplas contas | Priorizar recomendação financeira revisável; sem alteração automática de anúncio |
| [Nubimetrics](https://www.nubimetrics.com/br/product/mercado) | Oferta, demanda, categorias, tendências e sazonalidade | Não confundir busca ou volume acumulado com venda futura garantida |
| [Central Real Trends](https://ajuda.real-trends.com/pt-BR/articles/2905851-quais-atividades-dos-meus-concorrentes-posso-ver) | Dados de concorrentes podem ser aproximados | Preservar indicação de estimativa e qualidade da evidência |
| [API de custos](https://developers.mercadolivre.com.br/pt_br/comissao-por-vender) | Tarifas dependem do contexto da venda | Cotar novamente quando preço ou logística mudarem |
| [API de envios](https://developers.mercadolivre.com.br/pt_br/registre-o-seu-aplicativo/gerenciamento-de-envios) | Um envio pode conter vários pedidos | Conferir membros do envio e ratear custo uma única vez |

A hipótese comercial do Radar é ajudar o revendedor a comprar, precificar e repor com lucro. Não copiamos código, marca, imagens ou promessas comerciais dos concorrentes. Geolocalização de vendas de terceiros não foi implementada sem uma fonte verificável.

## O que mudou

- Clientes possuem e-mail, senha, sessão revogável e workspace próprio. O operador cria, suspende e reativa acessos em **Metas e configurações**. Senhas não são enviadas por e-mail automaticamente.
- Cada operação do piloto aceita uma conta Mercado Livre. A seleção da conta é estável e respeita `ADMIN_ML_ACCOUNT_ID` apenas no workspace legado.
- Históricos, SKUs, configurações, leituras de mercado, snapshots e calibração não são globais entre clientes.
- A extensão exige login Radar antes do OAuth ML, com vinculação ao mesmo workspace no início e retorno. Uma conta ML vinculada não pode ser tomada por outro cliente.
- Códigos de autorização têm consumo atômico; refresh tokens usam comparação e atualização atômicas. Limites são conferidos no banco e compartilhados por todos os dispositivos do workspace.
- O painel inicial apresenta decisões priorizadas, cobertura de custos, lucro conhecido antes de Ads, capital conhecido, estoque e ROAS de equilíbrio estimado.
- Perfil financeiro configura imposto, operação por pedido, desconto padrão, metas de margem/ROI, lead time, segurança e cobertura de estoque.
- Vendas têm paginação independente dos totais do período e exportação CSV com proteção contra fórmulas. Pendentes, canceladas e reembolsadas não entram como receita paga normal.
- O menu mobile foi corrigido: overlay abaixo da navegação, sidebar fechada invisível, fechamento ao navegar e por Escape.
- Docker passa a copiar `public/` explicitamente, preservando fontes e identidade visual. Instalação usa lockfile.

## Regras financeiras

1. Margem inferior a 10% ou prejuízo: revisar. De 10% até atingir as metas: apertado. Compensa quando margem e ROI alcançam as metas configuradas (padrões 20% e 30%). ROI baixo não transforma sozinho uma margem positiva em prejuízo.
2. Imposto desconhecido não vira zero. É necessário confirmar a alíquota, inclusive quando ela for 0.
3. Lucro de venda exige pedido pago, itens, custo de compra, tarifa, frete e perfil financeiro. Reembolso/chargeback é separado para revisão; não afirmamos lucro líquido de um estorno parcial sem conciliação.
4. O repasse do marketplace é preço menos tarifa e frete. O lucro também desconta imposto, compra e operação. Ads é separado e identificado.
5. Comissão, imposto e resultados são arredondados em centavos. Rateios preservam a soma do pedido. O piso de preço é elevado até cumprir margem e ROI com esse arredondamento.
6. Meta matematicamente impossível resulta em `minimumSuggestedPrice: null`, exibido como meta inviável, nunca preço zero ou infinito.
7. O piso algébrico é teórico: tarifa/frete podem mudar de faixa. A sugestão de preço web volta à API para cada candidato. A extensão orienta nova cotação se o preço mudar.
8. Preço de compra e parâmetros aplicados a vendas já apuradas não são reescritos por uma edição de custo. Custos ausentes podem ser preenchidos. Novas vendas usam o novo custo.
9. O frete realizado vem de `/shipments/{id}/costs`; não usamos campos ambíguos do pedido como substituto financeiro. Um envio compartilhado só recebe rateio quando a API informa todos os pedidos e todos estão presentes e pagos. Caso incompleto/reembolsado fica sem lucro confirmado; o custo total não é repetido em cada pedido.
10. Frete indisponível não é zero. A extensão pode usar estimativa informada explicitamente, separada da operação e identificada como estimativa. Uma prévia sem cotação confirmada não é salva como decisão definitiva.

## Decisões de estoque e Ads

- Reposição depende de histórico de 30 dias completo, sincronizado nas últimas 36 horas; anúncio recente usa a janela observada desde a criação.
- Ponto de pedido: prazo do fornecedor + dias de segurança. Cobertura alvo nunca é inferior a esse prazo.
- Sem custo, cobertura financeira suficiente ou margem na meta, o Radar pede revisão em vez de sugerir compra.
- Mudança de preço, custo ou perfil tributário bloqueia recomendação baseada em margem histórica antiga.
- Quantidade e capital sugeridos são estimativas pela saída observada, sem criação automática de pedido de compra.
- ROAS de equilíbrio estimado = 100 / margem histórica antes de Ads. Pressupõe mix e custos semelhantes.
- Produto relacionado a mais de um grupo de Ads não tem seu lucro inteiro repetido como lucro de cada grupo; esse recorte fica pendente de conciliação.
- Ads com lucro zero não recebe recomendação de escala. Escalar exige cobertura alta e volume mínimo; métricas indisponíveis ou custos ausentes não geram lucro confirmado.

## Banco e compatibilidade

Migration: `202610152100_commercial_workspaces`.

- Registros anteriores ficam no workspace `default`, preservando produtos, contas, histórico e snapshots.
- SKUs e itens observados passam a admitir a mesma identificação em workspaces diferentes.
- Valores antigos de lucro que omitiam imposto são invalidados; dados de origem e custos continuam preservados para reapuração.
- Sessões antigas sem identidade deixam de autorizar acesso: é necessário entrar novamente.
- Novos workspaces começam em `PILOT`, com limite padrão de 500 consultas da extensão/dia. O operador legado recebe 5.000. Não existem valores de assinatura ou cobrança automática novos.
- Os limites são operacionais do piloto, administrados pelo operador. Não constituem planos pagos comercializados.
- A migration é de avanço. Para reversão estrutural, restaurar backup; não apagar workspaces ou aplicar downgrade manual sobre dados novos.

## Operação e deploy

1. Fazer backup e conferir as contas ML históricas do workspace legado, especialmente se mais de uma foi conectada na versão anterior.
2. Usar esta branch em homologação. O deploy de produção e a branch ativa do Coolify não foram alterados.
3. Manter `DATABASE_URL`, `APP_ENCRYPTION_KEY`, `ADMIN_EMAIL` e `ADMIN_PASSWORD_HASH`. Para o domínio público, configurar `NEXT_PUBLIC_APP_URL` explicitamente.
4. O container executa `prisma migrate deploy`. Após o deploy, entrar novamente como operador, confirmar perfil financeiro e atualizar vendas.
5. Criar um cliente em **Metas e configurações**, entrar por ele, conectar sua conta ML e conferir que não vê dados do operador.
6. Cron protegido por `RADAR_CRON_SECRET`: `/api/cron/radar-monitoring`. Ele sincroniza anúncios e vendas, atualiza watchlist e processa notificações de pedidos que foram efetivamente lidos da API.
7. O cron trabalha em lotes de até 10 contas, retornando `nextAfter`. O agendador deve seguir esse cursor até retornar `null` quando houver mais clientes.
8. Importação atual tem limite de 200 anúncios e 2.000 pedidos por sincronização. Truncamento é informado e bloqueia recomendação que depende de histórico completo. Migrar grandes contas para worker paginado antes de oferecê-las comercialmente.
9. Login possui proteção por IP em memória do processo. Antes de múltiplas réplicas públicas, centralizar esse rate limit.

## Validação desta etapa

- `npm test`: 26 testes de regras financeiras/decisão; inclui 300 combinações de preço para conferir metas em centavos.
- `npm run typecheck` e `npm run build`: passaram localmente.
- SQL de todas as migrations em banco vazio e atualização de banco com registros anteriores.
- 21 verificações HTTP passaram localmente, cobrindo autenticação, isolamento, tentativa de alterar plano, histórico/IDOR, preservação de custo, paginação, exportação, quotas entre dispositivos, código de autorização concorrente, refresh e revogação.
- Fixture de API oficial para conferir sincronização, rateio de frete entre pedidos e custo desconhecido.
- CI executa migrations e testes HTTP sobre PostgreSQL 17 real, além de typecheck, sintaxe da extensão e build.
- QA visual passou no Chromium: desktop/mobile, filtros, menu, paginação, configurações, onboarding vazio e erro. Capturas usam dados de teste, nunca dados de clientes.

## Gates antes de lançamento público

- [ ] Deploy de homologação e smoke pelo domínio real.
- [ ] Conferir 5 vendas reais com Mercado Livre, incluindo carrinho, frete grátis, cancelamento e reembolso.
- [ ] Testar OAuth completo de duas contas ML de clientes diferentes.
- [ ] Validar conta com permissão restrita, 401/403/429, expiração e renovação de tokens.
- [ ] Agendador/worker persistente com retries e observabilidade, cobrindo toda a base e limites da API.
- [ ] Billing, webhooks de pagamento, cancelamento e regras de assinatura reais.
- [ ] Recuperação de senha com canal verificado e suporte operacional. Operador consegue redefinir senha por API; não há disparo de e-mail automático.
- [ ] Políticas comerciais/privacidade e fluxo de suporte definidos para o serviço.
- [ ] Empacotamento e publicação/revisão da extensão na Chrome Web Store.

Até fechar esses gates, a entrega deve ser chamada de piloto com acessos controlados, não SaaS público pronto.
