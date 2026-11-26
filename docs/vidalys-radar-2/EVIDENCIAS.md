# Registro de evidências

Data da sessão: 25/11/2026, America/Sao_Paulo. Código fixado em `7fdfa333474f4254ffd3e0daa44f3193c145392c`. Capturas são observações, não reprodução do código concorrente. Informações pessoais, números de pedidos, preços/custos privados e identificadores de estudos não foram incluídos nos arquivos publicados.

## Capturas

| ID | Arquivo | Origem e contexto | Tratamento e limite |
| --- | --- | --- | --- |
| C01 | [Menu](evidencias/C01-menu.jpg) | Cargoos autenticado; sidebar | Recorte termina antes do perfil |
| C02 | [Planos](evidencias/C02-planos.jpg) | Modal de planos no Free | Somente modal; não houve assinatura |
| C03 | [Cadastro de fornecedor](evidencias/C03-fornecedor-formulario.jpg) | Modal novo fornecedor | Formulário vazio e exemplos da própria interface |
| C04 | [Análise bloqueada](evidencias/C04-analise-bloqueada.jpg) | `/dashboard/analysis` | Conteúdo principal, sem perfil |
| C05 | [MCP](evidencias/C05-mcp.jpg) | `/dashboard/mcp` | Opções desconectadas, sem tokens ou perfil |
| C06 | [Mídia pública](evidencias/C06-demonstracao-publica.jpg) | Primeira mídia da Chrome Web Store | Material demonstrativo público; não teste da extensão |
| C07 | [Dashboard](evidencias/C07-dashboard-cabecalho.jpg) | `/dashboard` | Cabeçalho; indicadores e pedidos excluídos |
| C08 | [Anúncios](evidencias/C08-anuncios-cabecalho.jpg) | `/dashboard/listings` | Cabeçalho; linhas comerciais excluídas |
| C09 | [Produtos](evidencias/C09-produtos-cabecalho.jpg) | `/dashboard/products` | Cabeçalho; estoques e custos excluídos |
| C10 | [Publicidade](evidencias/C10-publicidade-cabecalho.jpg) | `/dashboard/growth/ads` | Cabeçalho; campanhas e números excluídos |
| C11 | [Custos](evidencias/C11-custos-cabecalho.jpg) | `/dashboard/costs` | Cabeçalho; valores privados excluídos |
| C12 | [Site comercial](evidencias/C12-site-comercial.jpg) | `https://cargoos.com.br/` | Conteúdo público do fabricante |
| C13 | [Calculadora pública](evidencias/C13-calculadora-publica.jpg) | Calculadora web | Entradas fictícias de auditoria, conferidas na tela |
| C14 | [Fornecedor vazio](evidencias/C14-fornecedores-vazio.jpg) | `/dashboard/suppliers` | Conteúdo principal, sem conta |
| R02 | [Pesquisa indisponível](evidencias/R02-pesquisa-indisponivel.jpg) | Radar publicado; aba Fornecedores de estudo existente | Recorte só da mensagem e controles; nenhum ID ou dado financeiro |
| R03 | [Calculadora Radar](evidencias/R03-calculadora.jpg) | `/analisar` publicado | Recorte sem sidebar/perfil; campos vazios |

Nem toda tela possui uma captura completa: autenticação, onboarding e configurações preenchidas foram observados sem exportar dados pessoais. Pedidos reais não foram publicados. Modais bloqueados compartilham C02; uma captura do bloqueio não prova funcionamento da página paga.

## Evidências de código e execução

| ID | Fonte | O que comprova |
| --- | --- | --- |
| G01 | [Commit auditado](https://github.com/Brunohvg/mercado-radar/commit/7fdfa333474f4254ffd3e0daa44f3193c145392c) | Base técnica e escopo da inspeção |
| G02 | [CI da base](https://github.com/Brunohvg/mercado-radar/actions/runs/45736103637) | Sucesso automatizado nesse commit |
| G03 | `package.json` + `package-lock.json` | Versões e scripts efetivos |
| G04 | [Inventário](INVENTARIO_ROTAS.md) | 26 páginas, 98 handlers API, 23 migrations encontrados na base |
| F01 | `lib/calculator-defaults.ts` e `lib/profitability-request.ts` | Preenchimento de custos desconhecidos com zero e sinais de hipótese |
| F02 | [Reprodução financeira](evidencias/financial-reproduction.json) | Limite de R$52 atende margem de 20%, mas ROI 37,04% não atende meta de 100%; exemplo fictício |
| F03 | `lib/purchase-order.ts`, `/api/purchase-order` e `lib/decision-engine.ts` | Fluxos de reposição com critérios diferentes |
| S01 | `lib/sourcing/*`, `prisma/schema.prisma` | Fornecedor, evidência, cotação, qualificação e capital já implementados |
| S02 | `lib/sourcing/cnpj.ts` | Normalização somente numérica; limitação para CNPJ alfanumérico |
| A01 | `proxy.ts`, `workspace-auth.ts`, `extension-auth.ts` | Controles de sessão, escopo por workspace e tokens de dispositivo |

## Fontes públicas oficiais

| ID | Fonte | Uso e limite |
| --- | --- | --- |
| W01 | [Cargoos](https://cargoos.com.br/) | Oferta comercial; funcionalidades anunciadas não são testes |
| W02 | [Calculadora](https://cargoos.com.br/calculadora/mercado-livre) | Interface e exemplo local observados |
| W03 | [Chrome Web Store](https://chromewebstore.google.com/detail/cargoos-%E2%80%94-intelig%C3%AAncia-pa/hhpmjdebejnbpidgokkeikoainkcmlgi) | Descrição e versão ao vivo 1.0.44; índice ainda mostrava 1.0.42 |
| W04 | [ML: custos por vender](https://developers.mercadolivre.com.br/pt_br/comissao-por-vender) | Documentação oficial indexada; leitura direta retornou 403 nesta sessão |
| W05 | [ML: custos e cotações de envio](https://developers.mercadolivre.com.br/pt_br/mercadolideres-lojas-oficiais/mercado-envios-custos-e-cotacoes) | Separação de custo vendedor/comprador; índice oficial consultado, leitura direta 403 |
| W06 | [Receita: primeiro CNPJ alfanumérico](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico) | Mudança em operação desde julho/2026; validação numérica precisa evoluir |
| W07 | [Receita: projeto CNPJ alfanumérico](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/cnpj-alfanumerico) | Coexistência de formatos e documentação técnica |

Não foram utilizados dados privados do Cargoos fora do que a própria conta permitiu visualizar. Segredos e detalhes de autenticação não fazem parte do material. A origem aparente de dados do concorrente permanece identificada como inferência.
