# 09 · Auditoria geral: por que tanta coisa "não funciona" e o que fazer

Data: 25/11/2026. Método: subi o sistema com uma conta de teste conectada a respostas simuladas da API do Mercado Livre e abri as 20 telas no navegador, anotando erros, chamadas que falharam e campos exigidos. Depois li o código de cada função para ver de onde vêm os dados. Também comparei com Hunter, Cargoos, Métricas Hub e GoSmarter (ver doc 07).
**Limite:** não consigo usar a sua conta real. O que falha só em produção (permissões, bloqueios do ML) foi deduzido do código e da auditoria anterior do próprio projeto.

## Resumo em 5 frases
1. O sistema tem **19 itens no menu, 22 telas e 83 rotas de API**. Os concorrentes que funcionam bem têm uma extensão e 3 ou 4 telas.
2. A causa principal das telas vazias é técnica: **várias funções dependem da busca aberta do Mercado Livre (`/sites/MLB/search`), que responde 403 para aplicativos desde 2025**. O código esconde o erro e devolve lista vazia, então a tela parece quebrada.
3. Existem **quatro calculadoras diferentes** (extensão, Análise de produto, Kits, Margem do "Onde comprar"), cada uma pedindo dados de um jeito.
4. O painel inicial abre com **três avisos amarelos e números "a apurar"**. Isso passa a impressão de sistema incompleto antes de o usuário fazer qualquer coisa.
5. Os concorrentes funcionam porque são **extension-first**: leem a página que o vendedor já está vendo, sem depender da busca bloqueada. Nós temos essa base na extensão, mas o esforço ficou espalhado na web.

## Inventário tela a tela
| Tela (menu) | Abriu? | De onde vêm os dados | Problema encontrado | Recomendação |
|---|---|---|---|---|
| Onde comprar | sim | estudos salvos + API de itens + BrasilAPI + busca de fornecedor | funciona; busca automática depende de chave | **Manter (núcleo)** |
| Dashboard | sim | vendas e custos da conta | 3 avisos e "a apurar" em tudo enquanto não há vendas sincronizadas e custos | **Manter e simplificar**: uma pergunta e um próximo passo |
| Anúncios | sim | anúncios da conta | ok | Manter, junto com Produtos |
| Criar anúncio (IA) | **travou** (sem carregar por 30 s) | Gemini + capacidades de publicação | chamada `publication-capabilities` deu 502 e a tela ficou esperando | Corrigir ou esconder até homologar |
| Produtos | sim | custos cadastrados | duplica Anúncios e Custos por fornecedor | **Juntar** com Anúncios |
| Vendas e lucro | sim | pedidos da conta | ok, depende de sincronizar | **Manter (núcleo)** |
| Publicidade | sim | Product Ads | "indisponível nesta conta" para quem não anuncia | Mostrar só se a conta for anunciante |
| Custos por fornecedor | sim | cadastro manual | duplica Onde comprar > Fornecedores | **Juntar** com Onde comprar |
| Mercado | sim | leituras da extensão | só tem dado depois de usar a extensão; tela vazia no começo | Juntar com Monitoramento |
| Radar de oportunidades | sim | busca de catálogo + **busca aberta (403)** + tendências | resultados vazios ou parciais em produção | **Esconder** até trocar a fonte |
| Monitoramento | sim | leituras salvas | ok | Manter |
| Análise de produto | sim | catálogo + **busca aberta (403)** + tarifa | 13 campos; duplica a calculadora da extensão | **Juntar** com a extensão e Onde comprar |
| EAN em lote | sim | catálogo por GTIN + **busca aberta (403)** | metade da fonte bloqueada | Manter só a parte de catálogo, dentro de Onde comprar |
| Histórico de análises | sim | análises salvas | pouco uso, duplica Onde comprar | **Juntar** |
| Concorrentes | sim | **busca aberta (403)** | depende 100% da fonte bloqueada | **Esconder**; concorrentes vêm da extensão |
| Simulador de kits | sim | cálculo local | 4ª calculadora | **Juntar** na calculadora |
| Metas e configurações | sim | configurações | ok | Manter |
| Integrações | sim | OAuth + diagnóstico | ok (agora testa as permissões novas) | Manter |
| Extensão | sim | página de instalação | ok | Manter |

Nenhuma tela deu erro de JavaScript. Os problemas são **fonte de dados bloqueada, duplicação e excesso de campos**, não "tela quebrada".

## Comparação com os concorrentes
| O que o vendedor precisa | Hunter / Cargoos / Métricas Hub | Vidalys Radar hoje |
|---|---|---|
| Ver vendas e lucro **na página do anúncio** | sim, é o produto principal | sim (extensão), com faixa estimada e calculadora sem custo |
| Analisar **a busca** do ML | sim, selos e análise ampliada | sim (extensão lê os anúncios visíveis) |
| Calculadora | 1, simples, com modo reverso (Cargoos) | 4 diferentes; a da extensão agora tem modo reverso |
| Catálogo / buy box | sim | sim |
| Painel web | pequeno ou nenhum | 19 itens de menu |
| Fornecedor nacional com prova | **não** | **sim (diferencial)** |
| Funciona sem a busca bloqueada | sim (lê a página) | só a extensão; várias telas web não |

## Plano de correção proposto
**Fase 1, estabilizar (1 a 2 dias de trabalho):**
1. Menu enxuto: **Início · Onde comprar · Vendas e lucro · Meus anúncios e custos · Monitoramento · Configurações**. O resto sai do menu e continua acessível por link interno até ser removido (nada é apagado).
2. Uma calculadora só (a da extensão, com modo reverso), reaproveitada na web.
3. Toda função que dependa da busca aberta mostra "fonte bloqueada pelo Mercado Livre" em vez de lista vazia, ou passa a usar a busca de catálogo e os anúncios lidos pela extensão.
4. Início com uma única pergunta ("O que você quer revender?") e um próximo passo, sem três avisos.
5. Corrigir a trava do "Criar anúncio" quando a API de publicação falha.

**Fase 2, provar com a sua conta:** deploy, "Verificar acesso às APIs" e 10 anúncios reais testados juntos com a extensão 0.14.0. Corrijo o que aparecer.

**Fase 3, diferencial:** pesquisa de fornecedor com IA ligada, mapa de concorrentes por UF, score de oportunidade explicável.
