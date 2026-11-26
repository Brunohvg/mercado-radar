# 12 · Redesign de Onde comprar
Data: 25/11/2026. Decisão: priorizar legibilidade sobre novas funcionalidades.

## Estrutura
1. Contexto compacto: nome, preço de referência, capital e meta de margem.
2. Um único resumo da situação: cotação em destaque (não chamar de melhor fornecedor confirmado), contribuição/margem e investimento quando disponíveis; próxima ação e pendências.
3. Navegação horizontal simples: Fornecedores, Custos da venda, Comparar cotações, Decisão. Uma área de trabalho por vez.
4. Pesquisa: lista com nome, tipo e evidência; justificativa, contatos sugeridos, fontes e diagnóstico de IA sob detalhes.
5. Fornecedores salvos: nome, qualificação, cotação e duas ações principais. Contatos, edição, CNPJ e exclusão sob ações adicionais. Não esconder bloqueios.
6. Comparação: primeiro números de decisão; decomposição financeira sob detalhes; manter tabela e rastreabilidade.

## Regras visuais
- Fundo neutro, superfície branca conforme tema, uma cor de ação da marca, bordas discretas. Não adicionar sombras decorativas, gradientes ou cartões dentro de cartões sem função.
- Tipografia de leitura, números tabulares, espaçamento consistente. Desktop e mobile; tabs quebram ou rolam sem cortar ações.
- Estado desconhecido é 'A confirmar' / 'Não calculado'; cotação preliminar nunca vira selo de aprovação.
- Formulários somente sob ação explícita. Manter rotas, contratos, permissões e dados existentes.

## Sequência
A. Redesign do workspace e CSS escopado; B. QA visual e fluxo de cotação; C. página inicial de Onde comprar; D. navegação global e extensão com mesmo sistema; E. identidade final com aprovação visual.
Não promover main antes do CI e inspeção visual. Não apagar funcionalidades até demonstrar substituição.

## Aceitação
- Um resumo e uma navegação principal, sem indicadores repetidos em cartões.
- Ações de cotação e verificação existentes continuam acessíveis; bloqueios visíveis.
- Testar ausência de cotação, cotação preliminar, cotação calculada, orçamento insuficiente, filtros, edição e 390/desktop.
- Validar capturas reais do browser, contraste e foco; aprovação visual humana ainda necessária.
