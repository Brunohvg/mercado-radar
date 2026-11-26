# Cargoos — análise da extensão Chrome

Data: 25/11/2026. [Listagem oficial](https://chromewebstore.google.com/detail/cargoos-%E2%80%94-intelig%C3%AAncia-pa/hhpmjdebejnbpidgokkeikoainkcmlgi).

## Limite do teste

A Chrome Web Store mostrou o botão de instalação desabilitado e pediu um navegador Chrome compatível. Não houve instalação nem execução do Cargoos no Mercado Livre. Não foi encontrada uma sessão compatível já fornecida. Não foram extraídos CRX, código, endpoints privados ou controles de licença.

A listagem **ao vivo** exibia versão **1.0.44**, atualizada em **25/11/2026**, aproximadamente **6.000 usuários** e 27 avaliações. A cópia indexada da mesma página ainda mostrava 1.0.42/19 de novembro; o registro ao vivo prevalece para a versão observada. Quantidade de usuários/avaliações é metadado da loja, não validação de precisão.

## Capacidade anunciada versus comportamento comprovado

| Superfície/capacidade | O que a documentação oficial anuncia | O que foi possível verificar | Pendente |
| --- | --- | --- | --- |
| Página de produto | Lucro, tarifas, frete e desempenho contextual | Descrição pública | Injeção, posição, carregamento e atualização |
| Catálogo | Comparar vendedores e Buy Box | Descrição e demonstração pública | Troca entre catálogo e oferta; identidade |
| Resultado de pesquisa | Analisar anúncios no Mercado Livre | Alegação geral; não houve teste na busca | Seletores, cobertura e paginação |
| Anúncio concorrente | Preço, vendas, visitas e reputação | Oferta comercial | Origem, período, autorização e precisão |
| Calculadora de lucro | Modo reverso, margem, equilíbrio e sensibilidade | Calculadora web pública testada; extensão não | Paridade web/extensão |
| Importação | Simulação de custos | Anunciada no site comercial | Regime, NCM, câmbio e tributos usados |
| Visitas/vendas | Indicadores e projeções | Descrição pública | Fonte e método não comprovados |
| Conversão | Série diária e cenários | Descrição pública | Correspondência de janela e denominador |
| Buy Box | Status e preço para vencer | Descrição pública | Cobertura e atualização real |
| Geolocalização | Distribuição regional de vendedores | Segunda mídia promocional mostra distribuição por UF | Precisão, granularidade e origem |
| Comparação de vendedores | Tabela com preço, reputação e filtros | Descrição pública | Ações, ordenação e dados permitidos |
| Histórico | Consultas e indicadores históricos | Descrição pública | Retenção, exportação e rastreabilidade |
| EAN em lote | Importação/pesquisa e histórico | Primeira mídia mostra tabela, resumo e ações salvar/exportar | Pesquisa ao vivo; menu autenticado está em manutenção |

## Organização visual que foi efetivamente observada

As duas mídias da loja mostram um painel de pesquisa em lote com resumo superior e tabela abaixo, e uma distribuição geográfica. **Elas não comprovam a ordem dos elementos injetados numa página de produto.** Não foi possível determinar quais informações aparecem inicialmente na extensão e quais dependem de abrir abas ou painéis.

O painel web autenticado envia o usuário à loja pelo menu Extensão Chrome. Não foi necessário expor nenhum token ou fazer conexão adicional.

## Decisões para o Radar

1. Entrada pelo produto já aberto, com identidade e fonte preservadas.
2. Resumo compacto: situação da análise, custo máximo condicional e ação "Encontrar fornecedor".
3. Detalhes de mercado, calculadora e fontes sob demanda; manter o contexto ao trocar de aba.
4. O mesmo contrato financeiro da web; nenhuma inferência de frete zero por preço.
5. Mostrar contador acumulado como acumulado. Vendas estimadas exigem método e intervalo; não substituem pedidos próprios.
6. Manter Shadow DOM e controles nativos do ML; testar busca, produto, catálogo, variações, múltiplas abas e sessão vencida.
7. Sem permissão para dado privado, apresentar motivo e uma ação possível; não contornar restrição.

## O que não adotar

Não prometer vendas exatas/estoque privado de terceiros, localização precisa de pessoas, GTIN inventado ou resultado de importação completo sem regime e custos confirmados. Um recurso anunciado pode orientar investigação, mas não vira requisito de paridade validado automaticamente.

Capturas: C06 demonstra mídia pública; C13 registra o teste da calculadora web com valores fictícios. Roteiro futuro de instalação e comparação real: [TEST_PLAN.md](TEST_PLAN.md).
