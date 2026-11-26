# Vidalys Radar — auditoria técnica

Data: 25/11/2026, São Paulo. Base: `homolog` em **`7fdfa333474f4254ffd3e0daa44f3193c145392c`**. Inspeção de código, documentação existente, CI, execução local e aplicação publicada autenticada. Achados são da base fixada; não representam correções já aplicadas.

## Parecer

**Reaproveitar o monólito modular e reconstruir progressivamente a experiência.** Já existem autenticação, workspaces, OAuth, cotações oficiais, cálculo de pedidos, extensão MV3, pesquisa de fornecedores, qualificação, evidências, cotações e filtro por capital. Não há evidência técnica para uma reescrita total.

As prioridades anteriores à expansão comercial são consistência financeira, disponibilidade da pesquisa e continuidade do fluxo. Um novo visual não resolve custos desconhecidos preenchidos com zero, critérios diferentes de reposição ou dependências externas indisponíveis.

## Stack confirmada

| Camada | Versão/estrutura observada | Evidência |
| --- | --- | --- |
| Next.js | 16.3.4; App Router; `proxy.ts`; standalone | `package.json`, lock e `next.config.ts` |
| React / React DOM | 19.3.0 | Lockfile |
| TypeScript | 5.9.2 | Lockfile |
| Prisma / client / adapter-pg | 7.10.0 | Manifest e lockfile |
| PostgreSQL | Imagem declarada `postgres:17-alpine` | Compose e CI; versão do servidor publicado não foi consultada |
| Driver pg | 8.16.3 | Lockfile |
| Node | Docker/CI 22; engine >=22; runtime de auditoria 24.22.3 | Dockerfile, workflow e execução local |
| Testes de navegador | Playwright 1.64.1 | Lockfile |
| Extensão | Manifest V3; versão 0.15.0; Chrome mínimo 116 | `extension/manifest*.json` |
| Deploy | Docker multi-stage, usuário sem root, healthcheck; migrations no startup | Dockerfile/Compose; Coolify não auditado internamente |

Inventário da base: **26 arquivos de página, 98 handlers API e 23 migrations**. A contagem é física, não uma afirmação de 26 produtos independentes ou 98 recursos completamente homologados. [Lista completa](INVENTARIO_ROTAS.md).

## Arquitetura observada

`app/` contém páginas e handlers; `components/` concentra as experiências; `lib/` mistura domínio, integração e orquestração. `prisma/schema.prisma` modela workspaces, usuários, sessões, contas ML, produtos/pedidos, observações, análises, estudos/fornecedores/cotações, rascunhos e ações de piloto. A extensão combina content scripts, Shadow DOM, side panel e um service worker.

A camada `lib/marketplaces/` normaliza sinais por adaptador. Mercado Livre tem implementação; Shopee é um mapeamento de capacidades sem integração operacional. Isso deve continuar visível como não suportado, não como marketplace ativo.

## Achados priorizados

P0: resolver antes de ampliar decisões comerciais. P1: resolver na consolidação do MVP. P2: evolução após os fundamentos. A classificação expressa risco de produto e operação, não vulnerabilidade explorada.

| ID | Prioridade | Evidência concreta | Efeito | Ação proposta |
| --- | --- | --- | --- | --- |
| FIN-01 | P0 | `fillMissingCosts` em `lib/calculator-defaults.ts` atribui zero a imposto e frete ausentes; frete abaixo do limiar pode receber `material:false` | Ausência transforma-se em premissa financeira e pode parecer apta a decisão; conflita com esta missão | Manter `null` e bloquear resultado conclusivo; cenários hipotéticos separados, com zero confirmado explicitamente |
| FIN-02 | P0 | `maxSupplierCost` considera margem, mas ignora a meta de ROI recebida | Limite reverso pode não satisfazer as duas metas | Teto deve ser o menor entre limites por margem, ROI e capital; revalidar no motor canônico |
| FIN-03 | P0 | `lib/purchase-order.ts` e `/api/purchase-order` geram quantidades com giro/estoque; `historyComplete` retorna separadamente; não usam os gates de margem/evidência de `decision-engine.ts` | Fluxos de reposição podem recomendar revisão/compra em condições diferentes | Uma política de elegibilidade; pedido preliminar separado de reposição financeiramente apta |
| FIN-04 | P1 | `runProfitability` é compartilhado por calculadora/endpoint da extensão, mas `ProductAnalyzer` calcula teto local e `sourcing/viability.ts` tem outra fórmula de teto | Mesmo conceito em lugares diferentes; fontes e arredondamentos podem divergir | Consolidar contrato e derivadores puros, preservando comparação com resultados da base |
| FIN-05 | P1 | `sourcing/viability.ts` usa `otherCosts ?? 0`; imposto/operação têm bloqueios próprios, despesas e devoluções não integram um DRE completo | Custo entregue pode permanecer parcial sem bloquear todos os subtotais | Rastrear cada componente desconhecido; resultado por pedido não equivale a líquido da empresa |
| FIN-06 | P1 | Sourcing guarda `unitPrice` em Decimal(16,8), mas `Product`/`ProductAnalysis` usam custos Decimal(12,2); saída `unitCost` é arredondada a centavos | Peças baratas e pacotes exigem unidade de medida consistente ao transferir dados | Preservar precisão por peça e arredondar o total monetário na etapa correta; migração só com escopo aprovado |
| SRC-01 | P0 | Estudo existente no Radar publicado exibia falha de cota/limite do Gemini; evidência R02 | A tarefa central pode terminar sem candidatos | Orçamento/diagnóstico por provedor, alternativas manuais, retomada e teste de custo/latência |
| SRC-02 | P1 | `lib/sourcing/cnpj.ts` remove tudo que não é dígito e valida apenas 14 dígitos | CNPJs alfanuméricos não são suportados | Adequar normalização, DV, máscara, persistência e provedor; manter compatibilidade numérica |
| SRC-03 | P1 | Não há parser/upload de catálogos PDF/XLSX no escopo `sourcing`; dependências não contêm esses parsers | Importação de catálogos e cruzamento em lote ainda faltam | Pipeline assíncrono com revisão, evidência por página/célula e identidade de embalagem |
| SRC-04 | P1 | `purchase-order.ts` relaciona fornecedor por nome normalizado; telas exibem nomes legados ainda sem cadastro | Variações de nome/acentos fragmentam o abastecimento | Migrar vínculo por ID com tela de reconciliação; não mesclar automaticamente empresas |
| SRC-05 | P1 | `supplierIds` é array de strings em oportunidade; inclusão de cotação e atualização da oportunidade são passos distintos | Integridade e concorrência dependem da aplicação | Transação na orquestração e, quando necessário, relação explícita com constraints por workspace |
| MKT-01 | P1 | `radar-monitoring.ts` ainda usa score legado; `market-assessment.ts` e `market-estimates.ts` têm outras leituras | Volume histórico, hipótese e giro recente podem receber interpretações diferentes | Versionar e unificar a política; não recalcular histórico como se usasse regra nova |
| MKT-02 | P1 | Busca aberta, fallback catálogo e capturas de página coexistem em `mercado-livre.ts` | Fonte/restrição/cobertura variam; catálogo não representa todo o mercado | Estado por fonte e proveniência por resultado; testar permissões reais sem presumir bloqueio universal |
| OPS-01 | P1 | `ml-sync.ts` interrompe produtos em 200 e pedidos em 2.000 por execução; cursors de execução não são persistidos | Conta maior/retomada incompleta | Jobs persistentes, checkpoint e progresso; não apresentar totais parciais como universo |
| OPS-02 | P1 | Webhook persiste notificações; sincronização de pedidos marca algumas como processadas; não há worker dedicado observado | Persistência do evento não comprova processamento em tempo real | Processamento durável, idempotência e reexecução observável |
| SEC-01 | P1 | `admin-auth.ts`: tentativas em `Map`, IP por cabeçalhos encaminhados | Limite não compartilhado entre réplicas; depende de proxy confiável | Limite compartilhado e configuração explícita de proxy; sem enfraquecer autenticação |
| SEC-02 | P1 | `safe-page.ts` verifica DNS antes do fetch, sem vincular o fetch ao endereço validado | Proteção SSRF existente merece endurecimento contra troca de resolução | Revisão específica de rede/endereço e redirects; não é prova de exploração |
| UX-01 | P1 | `/analisar` contém calculadora rápida e análise completa; fornecedores aparecem em cadastro e em estudos; ferramentas legadas seguem acessíveis | Mais de um caminho para a mesma decisão | Unificar contexto e componentes antes de remover rotas |
| DOC-01 | P1 | Docs anteriores afirmam 19 itens de menu e ausência de busca; o código atual tem sete destinos principais e sourcing implementado | Plano baseado em histórico pode duplicar trabalho | Este snapshot prevalece; documentos antigos mantidos como histórico |
| REL-01 | P2 | `package.json` 0.1.0, manifest extensão 0.15.0 e nome do artefato CI 0.14.0 | Identificação de entrega confusa | Manifesto de release com versão/protocolo/SHA; corrigir nome em etapa própria |

### Reprodução determinística de FIN-01 e FIN-02

[JSON da execução](evidencias/financial-reproduction.json), sem API, fornecedor ou conta real.

| Entrada fictícia | Valor |
| --- | --- |
| Venda / comissão / tarifa fixa | R$100 / 12% / R$0 explicitamente informado |
| Envio / operação / tributos | R$10 / R$2 / 4% |
| Meta de margem / ROI | 20% / 100% |
| Custo reverso retornado | R$52 |
| Resultado recalculado nesse custo | Contribuição R$20; margem 20%; ROI 37,04%; estado TIGHT |

O nome do campo limita explicitamente por margem; o problema de produto é utilizá-lo como teto da decisão quando existem metas simultâneas. O novo contrato deve explicitar a meta limitante. No mesmo script, frete/imposto ausentes retornaram zero; o frete recebeu `shippingPending:false` no cenário abaixo do limiar.

### CNPJ alfanumérico

A Receita anunciou o primeiro CNPJ alfanumérico em 31/07/2026 e a coexistência dos formatos. O problema do código é verificável pela remoção de letras; não foi consultado CNPJ real nesta auditoria. [Fonte oficial](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico). O suporte do provedor BrasilAPI ao novo formato permanece a validar.

## Segurança e isolamento

Controles conferidos no código: proxy com negação por padrão; sessão web consultada no banco; cookies HttpOnly/Secure em produção/SameSite; senha scrypt/bcrypt; tokens ML criptografados com AES-256-GCM; OAuth com state e PKCE S256; refresh ML serializado por trava de linha; códigos e refresh de extensão com hash e rotação; quota de workspace incrementada atomicamente no PostgreSQL.

Handlers de estudos/fornecedores/cotações consultados filtram workspace e verificam propriedade antes de mutar. Pedidos/produtos do ML usam a conta do workspace. Alguns modelos pertencem ao vendedor em vez de armazenar workspace diretamente, portanto a cadeia de propriedade importa. Isso **não** equivale a prova completa de isolamento de cada handler nem a pentest. O CI contém testes de isolamento com fixtures; duas operações reais distintas não foram exercitadas.

Publicação existe, com flag `RADAR_ENABLE_PUBLISHING`, confirmação, pré-validação, bloqueio de concorrência e criação pausada. A experiência publicada oferece "Publicar no Mercado Livre" como entrada progressiva. Não houve publicação na sessão. Resposta externa ambígua precisa continuar impedindo retry cego; validar a conciliação antes de ampliar o recurso.

## Financeiro e dados

Pontos a preservar: total oficial de tarifa evita duplicar fixa; cálculo de pedidos usa centavos/rateio; reembolso/chargeback deixa resultado pendente de revisão; estados de custos faltantes existem; vendas mostram cobertura. Na aplicação publicada, alguns lugares qualificam o lucro como antes de Ads e outros usam "lucro realizado". Padronizar nomes e composição no contrato.

Ainda não há evidência de DRE gerencial completo, despesas gerais com competência, CMV por lote efetivamente baixado ou conciliação detalhada de devoluções. Não confundir o resumo de vendas com esses recursos.

## Reaproveitar, consolidar e acrescentar

| Decisão | Componentes/domínio | Justificativa |
| --- | --- | --- |
| Reaproveitar | Sessões, OAuth, criptografia, quotas, adaptador ML | Base implementada e coberta por CI; alterações só por problema demonstrado |
| Reaproveitar | `sales-economics`, rateio, custo de envio realizado, status de pendência | Proteções contra resultados falsamente completos |
| Reaproveitar | `SourcingOpportunity`, `SourcingSupplier`, `SourcingQuote`, identidade, qualificação e capital | Núcleo do diferencial já existe |
| Consolidar | Cálculo direto/reverso, sourcing, kits, Ads | Contrato financeiro com mesmas definições e metadados |
| Consolidar | Mercado/monitoramento/concorrentes e ferramentas auxiliares | Fonte, identidade e janela únicas, sem perder funcionalidades |
| Consolidar | Formulários de fornecedor e custo | Cadastro único e vínculo por ID; telas especializadas apenas quando úteis |
| Refatorar gradualmente | Componentes grandes de análise/rascunho/sourcing | Extrair responsabilidades ao tocar o fluxo, sem reescrever em massa |
| Acrescentar | Catálogos, preços/condições por faixa e importação revisável | Lacuna concreta para pesquisa nacional por capital |
| Acrescentar depois | Jobs, telemetria operacional, despesas/DRE e release manifest | Sustentar disponibilidade e expansão |

## Aplicação publicada examinada

Navegação autenticada em Início, Onde comprar, um estudo existente (quatro abas), Anúncios, Criar anúncio (rascunho/publicação), Vendas, Reposição, Fornecedores, Configurações (entrada), Extensão, Monitoramento, Mercado e Calculadora. Carregamentos foram aguardados nas áreas usadas para conclusões. Não foi submetida sincronização nem formulário comercial.

Observações relevantes: busca de estudo com erro de quota Gemini; calculadora rápida e avançada coexistem; fornecedor legado por nome aparece sem cadastro; estoque/pedidos são exibidos na conta conectada; publicação tem caminho progressivo. A versão da implantação **não foi vinculada a um SHA por evidência do servidor**. Sem essa prova, código auditado e comportamento publicado são fontes distintas.

## Verificação e limites

Base local: instalação pelo lockfile, Prisma generate, typecheck, **183 testes de regras aprovados** e build Next de produção aprovados. Ambiente local usou Node 24.22.3 e dados de configuração fictícios apenas para build. Não houve conexão ao PostgreSQL comercial.

[CI da base](https://github.com/Brunohvg/mercado-radar/actions/runs/45736103637) aprovado, incluindo gates declarados no workflow. Validação do commit documental e do protótipo: [TEST_PLAN.md](TEST_PLAN.md). Capturas e logs sintéticos não provam precisão comercial nem homologação de duas contas reais.
