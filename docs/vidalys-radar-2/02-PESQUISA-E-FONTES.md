# Etapa 2: concorrentes e validação das fontes de fornecedores

Data: 25/11/2026.

## Concorrentes (resumo da pesquisa de 24/11)

Hunter Spy, Zentry, Trendly, Helium 10, Jungle Scout e Sellerando já combinam análise de mercado com margem, e quatro deles já apontam fornecedores (Zentry, Trendly/China, Helium 10/Alibaba, Jungle Scout/importações EUA, Sellerando/rede B2B).
Conclusão mantida: um botão "buscar fornecedor" não diferencia. O diferencial é **fornecedor nacional, acessível a quem começa (CPF, lote pequeno), com evidência explícita e custo entregue ligado à margem.**

## Teste rápido de descoberta (3 produtos do Bruno)

Busca web genérica, 25/11/2026:

| Consulta | O que voltou |
| --- | --- |
| ilhós nº 54 Baxmann atacado distribuidor | Varejo (Magalu, lojas ML). Nenhum distribuidor ou fabricante na primeira página |
| bastão cola quente atacado fabricante CNPJ | Varejo (Loja do Mecânico, Magalu, Casas Bahia), um atacarejo (Tenda) e uma loja ML "atacado distribuidora" |
| base broche alfinete atacado fornecedor | Varejo e lojas ML de insumos (anúncios de 150 unidades) |

**Leitura:** busca genérica devolve varejo. Isso confirma que o valor está em **interpretar e filtrar**, não em encapsular uma busca. O motor precisa:

1. Partir da **marca/fabricante** do anúncio (atributo `BRAND` do ML) e procurar páginas "seja um revendedor", "onde comprar", "distribuidores".
2. **Excluir varejo conhecido** (Magalu, Americanas, Casas Bahia, Amazon, Shopee, Extra etc.) da busca de fornecedor.
3. Tratar **lojas do próprio ML com lote grande** ("atacado", "distribuidora", anúncios de 100+ unidades) como fornecedor candidato. É a fonte mais acessível para quem compra com CPF.
4. Deixar a cotação como **ação humana** (pedir preço), registrando o que o fornecedor respondeu.

Amostra pequena (3 consultas). A validação com 30 produtos continua recomendada antes de investir em automação de busca.

## Fontes avaliadas

| Fonte | Para quê | Situação em 25/11/2026 | Decisão |
| --- | --- | --- | --- |
| Cadastro manual + cotação | Registrar fornecedor, preço, pedido mínimo, CPF/CNPJ, frete | Sempre disponível | **Implementar já** (núcleo do fluxo) |
| BrasilAPI `/api/cnpj/v1/{cnpj}` | Situação cadastral, CNAE, porte, UF, abertura | Gratuita, sem chave, dados abertos da Receita | **Implementar** com cache e timeout; ausência = "não verificado" |
| Receita/Conecta gov.br (API CNPJ oficial) | Mesma informação, fonte oficial | Adesão orientada a órgãos públicos; chaves pelo Conecta | Não usar agora |
| Brave Search API | Buscar fabricante/distribuidor na web | US$ 5 por mil consultas, US$ 5/mês de crédito grátis | **Implementar como opcional** (`BRAVE_SEARCH_API_KEY`); desligada por padrão |
| Google Custom Search JSON API | Busca web | Fechada para novos clientes; encerra em 01/01/2027 | **Descartar** |
| ML "preços por quantidade" | Faixas de atacado em anúncios do ML | Página da documentação não pôde ser lida nesta sessão | **A validar** com a conta conectada antes de usar |
| Scraping de sites de fornecedores | — | Frágil e arriscado | Não fazer no servidor |

Um CNPJ ativo **não** prova que o fornecedor é confiável. A interface separa "cadastro verificado" de "reputação/condições confirmadas".

## Limites desta sessão

O ambiente de desenvolvimento não alcança `api.mercadolibre.com` nem `brasilapi.com.br` (rede bloqueada). Os conectores foram escritos contra a documentação e testados com respostas simuladas; a homologação real fica pendente e registrada.

Fontes: [Google Custom Search JSON API](https://developers.google.com/custom-search/v1/overview), [Brave: alternativas à API do Google](https://brave.com/learn/google-api-shutdown/), [Conecta gov.br: Consulta CNPJ](https://www.gov.br/conecta/catalogo/apis/consulta-cnpj), [ML: preços por quantidade](https://developers.mercadolivre.com.br/pt-br/precos-por-quantidade).
