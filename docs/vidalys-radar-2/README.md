# Vidalys Radar — diagnóstico e proposta para aprovação

Data de referência: **25/11/2026, America/Sao_Paulo**. Escopo autorizado: fases 1–5. Entrega documental e protótipo isolado; aprovação visual e autorização para implementar continuam pendentes.

## Parecer

**Evoluir a base existente. Não reescrever o produto.** O Cargoos apresenta uma operação integrada e uma aquisição por extensão/calculadora; o Radar já possui parte importante dessa base e um fluxo de fornecedores mais profundo no código. A vantagem comercial ainda precisa ser demonstrada com fornecedores e cotações reais.

Antes da reconstrução visual, corrigir a política de valores desconhecidos, a divergência entre limites de compra e metas de ROI e a reposição que usa critérios diferentes em fluxos distintos. A busca por fornecedores precisa funcionar sem depender da disponibilidade de um único provedor de IA.

## Leitura recomendada

1. [Auditoria técnica do Radar](VIDALYS_RADAR_AUDITORIA_TECNICA.md): achados, reprodução, versões, reaproveitamento e limites.
2. [Matriz comparativa](MATRIZ_COMPARATIVA.md): capacidades conferidas, lacunas e decisões.
3. [Visão de produto](PRODUCT_VISION.md): proposta comercial e especificação de fornecedores.
4. [Protótipo navegável](prototipos/index.html): onze vistas, estados e simulação local com dados fictícios. Abrir o HTML em um navegador; não depende de credenciais ou APIs.
5. [Pranchas visuais em PDF](prototipos/pranchas/VIDALYS_RADAR_PROPOSTA_VISUAL.pdf): onze vistas desktop e três composições mobile, com dados fictícios. São renderizações de documento, não capturas de navegador. [Validação e limites](prototipos/VALIDACAO.md).
6. [Design system](DESIGN_SYSTEM.md), [fluxos](UX_FLOWS.md) e [arquitetura](ARCHITECTURE.md).
7. [Roadmap](ROADMAP_IMPLEMENTACAO.md) e [plano de testes](TEST_PLAN.md).

## Documentos obrigatórios

| Documento | Conteúdo |
| --- | --- |
| [CARGOOS_AUDITORIA_COMPLETA.md](CARGOOS_AUDITORIA_COMPLETA.md) | Inspeção autenticada por área e restrições do plano |
| [CARGOOS_MAPA_FUNCIONAL.md](CARGOOS_MAPA_FUNCIONAL.md) | Navegação, dependências e ações |
| [CARGOOS_ANALISE_VISUAL.md](CARGOOS_ANALISE_VISUAL.md) | Medições e avaliação de usabilidade |
| [CARGOOS_ANALISE_EXTENSAO.md](CARGOOS_ANALISE_EXTENSAO.md) | Demonstrações públicas e testes não executáveis |
| [VIDALYS_RADAR_AUDITORIA_TECNICA.md](VIDALYS_RADAR_AUDITORIA_TECNICA.md) | Auditoria do código e da aplicação publicada |
| [MATRIZ_COMPARATIVA.md](MATRIZ_COMPARATIVA.md) | Comparação com estado e evidência por capacidade |
| [PRODUCT_VISION.md](PRODUCT_VISION.md) | Público, proposta de valor e diferencial de fornecedores |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Identidade, tokens, componentes e protótipos |
| [UX_FLOWS.md](UX_FLOWS.md) | Jornadas, navegação e tratamento de estados |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Arquitetura existente e evolução incremental |
| [ROADMAP_IMPLEMENTACAO.md](ROADMAP_IMPLEMENTACAO.md) | Etapas, dependências, esforço e critérios de saída |
| [TEST_PLAN.md](TEST_PLAN.md) | Validação realizada e gates futuros |

Complementos: [evidências](EVIDENCIAS.md), [inventário de rotas](INVENTARIO_ROTAS.md), [contrato financeiro proposto](FINANCIAL_CONTRACT.md) e [registro de aprovação](APROVACAO.md).

## Base e limites

- Código auditado: `homolog`, commit `7fdfa333474f4254ffd3e0daa44f3193c145392c`.
- `main` observada: `3b76b987352a4b86409dbed5a05eb24ebe618629`; preservada. Apenas duas branches remotas na consulta; `homolog` 38 commits à frente, sem commits atrás.
- [CI da base](https://github.com/Brunohvg/mercado-radar/actions/runs/45736103637): sucesso. A confirmação pertence a esse SHA, não a um futuro commit documental.
- Cargoos: conta Free, acesso autenticado pelo formulário seguro. Trial não ativado, assinatura não alterada, integrações não concedidas, dados reais não modificados.
- Extensão Cargoos: a loja mostra instalação desabilitada neste navegador. Inspeção pública e de demonstrações; comportamento injetado no Mercado Livre **não testado**.
- Radar publicado: sessão autenticada, navegação de leitura e exame de um estudo existente; sem sincronização forçada, publicação ou alteração de custos.
- Não houve conciliação contábil completa de pedidos reais, instalação da extensão Cargoos, teste de duas contas reais, auditoria de infraestrutura Coolify ou homologação de APIs externas.

Os documentos numéricos anteriores são histórico. Afirmações antigas sobre 19 itens de menu, ausência de fornecedores, versões antigas e busca de terceiros não substituem a inspeção deste SHA. Não foram apagados.
