# Roadmap de implementação

Data: 25/11/2026. Este é um plano concreto após auditoria e protótipos; fases 6–9 ainda não autorizadas por esta entrega. Estimativas abaixo são **ordens de grandeza**, em dias de engenharia com QA, sem prazo comercial prometido. Dependem da aprovação, permissões e achados de homologação.

## Etapas e critérios de saída

| Marco | Dependência | Escopo coerente | Aceite demonstrável | Esforço estimado |
| --- | --- | --- | --- | --- |
| M0 — Aprovação | Entrega atual | Escolher direção visual, navegação e política financeira; registrar ressalvas | Decisão explícita em APROVACAO.md, sem assumir aprovação pelo silêncio | Revisão humana |
| M1 — Consistência financeira | M0 | FIN-01/02/03: desconhecidos, teto por metas e política de reposição; fixtures canônicas | Vazio não vira zero; mesmo teto e elegibilidade em todos os consumidores; sem regressão de rateio | 4–7 dias |
| M2 — Uma jornada de estudo | M1 | Integrar identidade, ficha/cotação/cálculo/plano; componentes/tokens aprovados; fornecedor por ID | Fluxo completo em desktop/mobile; histórico e funções existentes preservados; zero duplicação de cenário | 5–8 dias |
| M3 — Descoberta utilizável | M1; pode acompanhar M2 após contratos | Falhas/custos de provedor, fallback, CNPJ alfanumérico, evidências por fato e região | Pesquisa real rotulada, cotação humana, quota e erro recuperáveis; sem fatos inventados | 4–7 dias |
| M4 — Catálogo revisável | M2/M3 | CSV/XLSX → mapeamento → revisão → correspondência com ofertas | Linha/célula rastreável, unidade correta, duplicidade/erros claros e isolamento | 5–8 dias |
| M5 — Extensão e continuidade | M1/M2 | Contrato compilado, contexto entre página e estudo, produto/busca/catálogo, versão/protocolo | Paridade numérica e visual; controles ML preservados; dez referências reais verificadas | 3–6 dias |
| M6 — Operação confiável | M1; antes de expansão do piloto | Jobs/cursors/retries, notificações, rate limit compartilhado, diagnóstico de release e backups | Retomada sem duplicação; prova de isolamento; restauração em ambiente isolado | 4–7 dias |
| M7 — Homologação real | M2–M6 | Coolify, conta(s) autorizadas, pedidos, cotações e extensão real; aprovação visual final | Gates do TEST_PLAN, captura/SHA/conta mascarada e diferenças registradas | 2–4 dias + dependências externas |
| M8 — Validação comercial | M7 | 30 produtos em 3 segmentos; 3–5 vendedores; custo por pesquisa e utilidade | Precisão/custo/tempo documentados, falhas conhecidas e decisão de preço/lançamento | 2–3 semanas corridas de observação |
| M9 — Expansão | Evidência de M8 | PDF/OCR, lotes/CMV, despesas/DRE, MCP e billing conforme valor | Cada recurso justificado por uso e métricas, com contrato e gates próprios | Estimar por descoberta |

Não somar linhas como um prazo fechado: algumas se sobrepõem, outras dependem de credenciais, fornecedores e revisão da loja. Não iniciar todas as frentes simultaneamente.

## Primeira fatia técnica recomendada

Uma oportunidade existente → cotação vigente → todos os custos materiais conhecidos → simulação direta/reversa consistente → capital → decisão registrada. Reaproveitar os três modelos sourcing e os adaptadores oficiais. Sem catálogo grande, novo marketplace, IA adicional ou painel de métricas de vaidade nessa fatia.

Primeiro commit funcional: corrigir estado de custos ausentes e fechar teste de metas simultâneas. Segundo: ligar os consumidores ao contrato, sem alterar telas em massa. Terceiro: migrar a experiência de estudo aprovada, preservando funções e links. São exemplos de agrupamento por responsabilidade, não uma branch para cada commit.

## Governança

- Branch de trabalho `homolog`; `main` preservada. Não criar novas branches para pequenas tarefas.
- Antes de cada marco: HEAD, árvore de trabalho, escopo, fontes e dependências. Commits coerentes e revisão de diff.
- Mudança de schema, dependência, OAuth, política de dado, permissão ou regra financeira é explicitada no marco; não entra escondida em CSS.
- Não remover fluxo existente antes de conferir substituição. Rotas antigas podem continuar encaminhando para contexto equivalente.
- CI, proteção e migration não são desativados para passar build.
- Não promover para main sem aprovação técnica e visual. Deploy/homologação e publicação na Chrome Web Store são ações distintas.
- Resposta externa ambígua exige conciliação; não repetir publicação ou ação financeira automaticamente.

## Reversão por marco

UI: voltar o commit de apresentação, sem reverter schema com dados. Motor: manter compatibilidade de snapshots antigos e versão explícita. Schema: migrations aditivas e plano de backfill/reversão de código; testar restauração. Jobs: suspender consumo mantendo fila/registro, sem apagar eventos. Extensão: pacote anterior compatível e protocolo verificado.

## Decisões comerciais pendentes

Preço/planos; quais fontes custeadas entram no pacote; retenção de catálogos/evidências; escopo do piloto; autorização e infraestrutura para QA real; eventual aprovação comercial por compra. Nenhuma delas é resolvida simplesmente porque o Cargoos divulga uma oferta ou porque um teste automatizado passou.
