# Inteligência comercial v1 — auditoria e escopo

Data: 23/10/2026. Status: em desenvolvimento; homologação com conta real pendente.

## Base protegida

Não existe branch denominada homologação no remoto. A apresentação aprovada pelo usuário está em `feature/radar-commercial-readiness-v1`, HEAD `75ae61b20dbd0fb348d9f664a1f335019df0d8be`, PR #2 ainda aberto. A nova `feature/radar-intelligence-v1` deriva exatamente desse commit e terá esse branch como destino de revisão. Nenhum merge ou deploy foi realizado.

Antes de editar código: 62 testes unitários, 26 cenários da extensão, 8 cenários web, typecheck e build passaram localmente. Capturas desktop/mobile produzidas pelos harnesses foram inspecionadas. CI da base: runs 38990636684 e 38990632737, ambos aprovados. As fixtures são sintéticas; não equivalem a acesso ao Mercado Livre autenticado do cliente.

## Mapa real e reutilização

| Área | Implementação atual | Decisão nesta entrega |
| --- | --- | --- |
| Web | Next 16, React 19, tokens e primitivas em `app/styles` | Duas áreas adicionais, sem redesenhar dashboard, Mercado ou extensão |
| Extensão | Manifest v3, Shadow DOM, protocolo 2, versão 0.11.0 | Preservar arquivos, geometria, análises automáticas e contratos |
| Regras | `market-assessment`, `market-comparison`, `profitability` | Reutilizar modelo público e cálculo financeiro; equivalência e composições em módulos próprios |
| ML | `mercado-livre.ts`: OAuth, bulk, catálogo, buscas, tarifas e frete | Usar fontes autorizadas, mostrar restrições e observações já coletadas pelo Radar |
| Autenticação | `proxy.ts` fecha rotas por padrão; sessão revogável no banco | Novas rotas também autenticam e derivam workspace da sessão |
| Dados privados | Workspace, conta ML, custos e observações separados | Rascunhos separados por workspace e conta; nunca receber proprietário do cliente |
| Banco | PostgreSQL/Prisma, migrations incrementais | Uma tabela aditiva de rascunhos; não reaproveitar vendas/análises financeiras como armazenamento genérico |
| Infra | Limite de concorrência 6, timeout 12s, GET com retry e cache por token | Reutilizar; limitar resultados, chamadas e combinações; não fazer scraping no servidor |
| Qualidade | CI com unidades, browsers, pacote, build, migrations e HTTP | Ampliar cenários sem remover as verificações atuais |

## Problemas e limites encontrados

- Bulk oficial já implementado, com leitura de `status_code` e lotes de 20. O fallback legado de 30 minutos usa estado global: a falha de uma conta pode influenciar outra. Corrigir o escopo desse estado sem alterar os consumidores existentes.
- A comparação existente é conservadora por título, porém não fornece quantidade normalizada, classificação revisável ou composições de cores. Adicionar um motor específico; não relaxar a regra usada pela extensão.
- Busca ampla pode retornar 401/403 mesmo com integração conectada. Falta de acesso não significa ausência de concorrentes. Exibir aviso e observações datadas da própria operação, sem contornar restrições.
- Dados públicos não fornecem automaticamente custos privados, visitas recentes ou vendas exatas de concorrentes. Ausências devem continuar ausências. Preço dividido pela quantidade não demonstra identidade do produto.
- Tarifas e logística dependem do preço, categoria, modalidade, pacote e conta. Cotação não é cobrança final; mudança de contexto invalida a cotação. O piso calculado com taxas constantes exige nova cotação no preço escolhido.
- `radar-score.ts` e monitoramento ainda usam uma classificação legada diferente do modelo público unificado. Registrado para a fase posterior de histórico/alertas; esta entrega não reclassifica snapshots nem cria alertas por mudança de regra.
- Limites de sincronização (anúncios/pedidos), jobs sem fila durável e limite de login em memória continuam pendências operacionais do plano anterior. Não foram tratados como resolvidos.

## Entrega autorizada e ordem

O roteiro anexado substitui a ordem de prioridades do plano anterior: primeiro fases 0, 1 e 2, para avaliação. Não iniciar laboratório de anúncios, alertas novos, tendências ou cobrança nesta entrega.

1. Proteção: baseline acima, auditoria e branch isolada.
2. Concorrentes: entrada por nome/ID/link/categoria, consultas limitadas, unidades e correspondência explicada/revisável, filtros/ordenação, comparação até quatro anúncios, monitoramento existente e rascunho da seleção.
3. Kits: composições determinísticas com estoque, cálculo financeiro canônico, custos ausentes explícitos, cotação na conta conectada, recomendação condicional e rascunhos sem publicar anúncios.

Escopo técnico: novos módulos, páginas, APIs e testes; tabela aditiva de rascunhos; flag de ativação e navegação condicionada; correção isolada do cache de fallback bulk. Não alterar CSP, OAuth, versões de dependências, fórmulas ou contratos da extensão.

## Critérios e reversão

Flag de servidor `RADAR_INTELLIGENCE_ENABLED=1` habilita as novas áreas; desativada por padrão. Desligá-la retira navegação e acesso às novas APIs sem interferir na extensão. Banco novo é aditivo: em rollback, preservar rascunhos; remoção da tabela somente por decisão posterior após exportação. Nunca apagar dados existentes para reverter.

Validar unidades, kit versus modelo, cores, estoque, custos nulos/zero, piso, arredondamento, conta da cotação, respostas atrasadas, permissões e rascunhos. Executar toda a suíte do CI e revisar a matriz de `EVOLUTION_PLAN.md`. Registrar evidência real como pendente até exercitar Caneta Montovani e Ilhós Baxmann nº54 em conta autorizada. Acesso público real e fontes podem ser conferidos sem alterar anúncios; nenhum pedido ou custo de produção será modificado.

## Referências oficiais verificadas em 23/10/2026

- [Itens e buscas](https://developers.mercadolivre.com.br/pt_br/itens-e-buscas): migração de multiget para `/items/bulk` e `/users/bulk`, prazo 25/10/2026, `status_code` e campos prefixados por `body.`. Permissões ainda se aplicam.
- [Custos por vender](https://developers.mercadolivre.com.br/pt_br/guia-para-veiculos/comissao-por-vender): tarifa total já inclui tarifa fixa; não somar duas vezes. Consultar com o contexto da venda.

Documentação consultada por trechos oficiais indexados. Grants de uma conta real e números de produtos reais ainda não foram homologados.

## Fase 1 — implementado, aguardando homologação real

Rota `/concorrentes`, APIs `/api/intelligence/competitors`, `/api/intelligence/competitors/watch` e `/api/intelligence/drafts`. A flag desligada responde 404 nas APIs autenticadas novas. O status de integração ganhou apenas um campo opcional para controlar a navegação. Contratos existentes continuam compatíveis.

Entradas aceitam nome, SKU cadastrado na própria operação, anúncio MLB e links completos autorizados; URLs não são abertas pelo servidor. Busca paginada limitada a 200 resultados da API e 60 observações locais; amostra não equivale a censo de concorrentes. Bulk em lotes de 20; enriquecimento restrito preserva os campos públicos da busca. Não são solicitados custos privados, visitas ou pedidos de concorrentes.

Quantidade vem de atributo explícito ou heurística identificada do título. Não se assume uma unidade por padrão; nº54 e 165m não são quantidades de peças. Correspondências apresentam razões e aceitam revisão do vendedor. A revisão não modifica os fatos coletados. A comparação mantém até quatro anúncios, inclusive quando filtros escondem um selecionado. Rascunhos guardam entradas, seleção e revisão; ao reabrir, a busca é refeita, sem apresentar a antiga seleção como dado atual.

Monitoramento de uma observação salva conserva seu horário original e o modo por visita; não substitui acompanhamento API existente nem sobrescreve uma leitura mais recente. API indisponível e resultado vazio são estados distintos. Campos ausentes aparecem como não disponíveis.

Validação local: 66 testes de regras (incluindo quatro novos cenários de unidades, URLs e correspondência), 11 cenários web, typecheck/build. Capturas `competitors-1366`, `competitors-680` e `competitors-390` inspecionadas; sem overflow. Novos testes HTTP e migração foram incluídos para o CI com PostgreSQL. A indisponibilidade local de execução PostgreSQL como usuário não root não foi tratada como teste aprovado. A suíte de extensão permanece com 26 cenários; seus scripts e estilos não foram editados.

Pendências reais: conferir permissões de busca/grants e dados dos produtos Montovani e Baxmann em uma conta do cliente; validar as demais telas da matriz em sessão real. Falta de reputação, marca/modelo, frete ou quantidade na fonte não será preenchida com estimativas silenciosas.
