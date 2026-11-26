# Cargoos — mapa funcional observado

Data: 25/11/2026. Conta Free. O mapa descreve navegação observada; não pressupõe acesso aos módulos pagos.

| Grupo | Destino | Estado na sessão | Tarefa e dependência | Ação de escrita identificada |
| --- | --- | --- | --- | --- |
| Entrada | `/auth` | Login concluído | Autenticar por senha ou Google | Cadastro/reset não executados |
| Ativação | `/dashboard/onboarding` | Acessível | Conta, Mercado Livre, trial e extensão | Ativar trial, não acionado |
| Overview | `/dashboard` | Parcial | Resumo e pedidos do período | Atualização não forçada |
| Overview | Pedidos ao vivo | Bloqueado | Alternância no Dashboard | Nenhuma executada |
| Overview | `/dashboard/listings` | Parcial | Buscar e ordenar anúncios próprios | Menu de linha consultado |
| Overview | `/dashboard/products` | Parcial | SKU, variações, estoque, fornecedor | Registrar SKU no ML, não acionado |
| Overview | Custo por fornecedor | Pro | Aba em Produtos | Não verificada |
| Overview | `/dashboard/suppliers` | Estado vazio acessível | Cadastro e logística de abastecimento | Criar fornecedor/configurar estoque, cancelados |
| Overview | `/dashboard/growth/ads` | Resumo parcial | Campanhas e atribuição de receita | Alterações comerciais não executadas |
| Playground | Pesquisar por EAN | Desabilitado | Indicado em manutenção | Não disponível |
| Playground | `/dashboard/analysis` | Bloqueado por trial | Pesquisas/análises | Não disponível |
| Playground | `/dashboard/mcp` | Entrada acessível | Conectar clientes de IA | Tokens/grants não criados |
| Playground | Extensão Chrome | Abre Chrome Web Store | Instalação oficial | Instalação desabilitada no ambiente |
| Contabilidade | DRE | Abre oferta Pro | Consolidar custos e resultado | Não verificada |
| Contabilidade | `/dashboard/costs` | Acessível | Fixos, variáveis e pontuais por competência | Novo custo aberto e cancelado |
| Contabilidade | Notas fiscais | Em breve | Sem fluxo operacional | Não disponível |
| Conta | Configurações | Modal acessível | Perfil, integrações, privacidade e logística | Somente leitura |
| Conta | Notificações/feedback | Itens de menu observados | Avisos e suporte | Conteúdo e envio não testados |
| Conta | Planos/créditos | Oferta acessível | Starter, Pro e Enterprise futuro | Compra/trial não acionados |
| Site | `/calculadora/mercado-livre` | Cálculo local testado | Simulação com valores fictícios | Nenhum registro comercial |

## Relações úteis para o Radar

| Contexto de origem | Contexto de destino | O que deve acompanhar o usuário |
| --- | --- | --- |
| Produto na página ML | Análise/fornecedor | Oferta, catálogo, marca, variante, pacote, fonte e data |
| Fornecedor | Produto/cotação | Identificador do fornecedor, perfil comprador, MOQ e prazo |
| Cotação | Simulação | Preço com unidade, frete de aquisição, validade, condição e evidência |
| Simulação | Plano de compra | Custos completos, metas, quantidade, capital e riscos |
| Venda realizada | Revisão da decisão | Tarifas e frete realizados, devoluções e diferença para o cenário |

O encadeamento é a proposta para o Radar. O fluxo completo não foi executado no Cargoos porque partes exigem trial/Pro. Estoque por lote e DRE são anunciados, mas suas relações internas permanecem não verificadas.
