# Vidalys Radar — visão de produto

Estado: proposta para aprovação, 25/11/2026. Não é anúncio de recursos já lançados.

## Problema e promessa

O vendedor consegue encontrar muitos anúncios, mas não sabe se o produto corresponde ao que o fornecedor vende, se consegue comprar o lote com seu capital e quanto sobra após os custos. A resposta precisa ser uma decisão explicável e revisável.

**Vidalys Radar: da ideia de produto à compra com números conferidos.**

Quatro perguntas organizam o produto:

| Pergunta | Resposta útil | Evidência necessária | Ação principal |
| --- | --- | --- | --- |
| O que vender? | Produto que merece estudo e por quê | Identidade, ofertas comparáveis, observações datadas e limites de demanda | Estudar produto |
| Onde comprar? | Candidatos relevantes e condições confirmadas | Fonte, papel comercial, contato, perfil comprador e cotação | Registrar cotação |
| Quanto investir? | Quantidade mínima/possível e capital total | Embalagem, MOQ, frete de entrada, prazo, despesas e reserva | Revisar plano |
| Quanto posso ganhar? | Contribuição no cenário e condicionantes | Todos os custos materiais, preço, método e versão | Conferir cálculo |

## Público inicial

Revendedores brasileiros iniciantes ou pequenos, com operação própria no Mercado Livre, capital limitado e compra nacional. O primeiro piloto deve incluir compra por CPF, CNPJ, pacote grande vendido fracionado e variações de material/tamanho. O produto também deve atender quem já vende, preservando tabelas, importação e memória de cálculo.

Não tentar substituir ERP, emissão fiscal, atendimento completo, logística e todos os marketplaces no mesmo MVP.

## Diferencial de fornecedores: requisitos concretos

O fluxo básico já existe no Radar. A evolução abaixo integra capacidades existentes e preenche lacunas, conforme a matriz técnica.

| Necessidade | Como entregar | Regra de evidência / limite | Situação na base |
| --- | --- | --- | --- |
| Fabricantes brasileiros | Partir de marca/fabricante; páginas oficiais de revenda e rede autorizada | Papel provável até comprovação; site não prova fabricação daquele SKU | Busca/classificação parcial |
| Distribuidores | Cruzar rede da marca e catálogo do distribuidor | Registrar autorização quando publicada; não inventar vínculo | Parcial |
| Atacadistas | Consultas por categoria, embalagem e atacado; excluir varejo irrelevante | Varejo em lote pode ser candidato, com classificação honesta | Parcial |
| Representantes | Entidade/papel explícito, marca representada, UF e área atendida | Representante não é necessariamente quem fatura/vende | Hoje consultas existem, papel dedicado falta |
| Regionais | Filtrar UF/cidade e área atendida; comparar frete cotado | Proximidade não prova atendimento ou menor custo | Campos existentes; descoberta regional precisa evoluir |
| CPF/CNPJ | Respostas sim/não/desconhecido com fonte e data | Contradição bloqueia recomendação; não inferir pelo porte | Implementado; aprofundar evidência |
| Pedido mínimo | MOQ por valor, SKU, embalagem e/ou pedido total | Converter para unidade certa; múltiplos SKUs podem compor pedido | Campos existentes; agregação precisa evoluir |
| Condições comerciais | Forma/prazo de pagamento, desconto, disponibilidade, frete, validade | Condição por cotação e data, não atributo eterno do fornecedor | Cadastro parcial |
| Cotações | Recebida, preço publicado ou hipótese do usuário | Origem, validade, anexo/link e confirmação específica | Implementado; ampliar rastreabilidade |
| Custo entregue | Mercadoria líquida + aquisição + custos atribuíveis, rateados por critério | Desconhecido não vira zero; guardar critério de rateio | Implementado parcialmente |
| Identidade do produto | GTIN, marca/modelo, material, medida, cor, condição, pacote, unidade | Separar idêntico/equivalente/candidato/incompatível | Extração e parte da comparação existentes |
| Cadastro público | Provedor documentado, data, situação e nome empresarial | CNPJ ativo não demonstra entrega, reputação ou produto | Consulta numérica existente; alfanumérico pendente |
| Contatos | Conferir telefone/e-mail na página oficial e registrar trecho/fonte | Presença de contato não prova resposta nem qualidade comercial | Verificação textual existente |
| Excel/CSV | Importar colunas, mapear unidade/preço, preservar linha e arquivo | Revisar duplicidade, separadores, fórmula maliciosa e validade | Ausente no sourcing |
| PDF | Extração de texto/tabelas, OCR só quando necessário; revisão humana | Página/posição por item; preço ilegível permanece ausente | Ausente |
| Cruzar catálogo e Mercado Livre | GTIN primeiro, depois marca/modelo/atributos/embalagem; candidatos revisáveis | Similaridade semântica não confirma equivalência | Parte da identidade existe; pipeline de catálogo falta |
| Compatibilidade com capital | Usar somente estudos com cotação e custos suficientes; depois expandir corpus | Orçamento não cria oferta, demanda ou fornecedor | Implementado para estudos; capital total precisa unificar |

## Estados que não podem se confundir

| Estado | Significado | O que não permite afirmar |
| --- | --- | --- |
| Encontrado | Há resultado rastreável | Que vende o produto exato |
| Identidade conferida | Há evidência da correspondência | Que o fornecedor é confiável |
| Cadastro consultado | Consulta pública datada | Que houve análise de crédito ou aprovação comercial |
| Contato localizado | Contato consta de fonte identificada | Que respondeu ou confirmou condições |
| Cotação recebida | Condições informadas por canal/evidência datados | Que haverá estoque futuro ou preço perpétuo |
| Viabilidade calculada | Cenário completo satisfaz regras/metas definidas | Lucro garantido ou demanda futura |
| Comercialmente aprovado | Decisão humana documentada para aquela compra | Certificação universal do fornecedor |

Separar rótulo manual do usuário de elegibilidade calculada pelo sistema. Um estudo sem cotação pode ter anotação pessoal, mas não recebe selo automático de compra apta.

## Descoberta e verificação

1. Identificar anúncio/oferta/variante/pacote. Pedir confirmação dos atributos ausentes.
2. Buscar fontes oficiais da marca e diretórios/rede B2B permitidos; fornecedores já conhecidos do workspace e importação manual continuam disponíveis.
3. Normalizar candidatos por domínio/CNPJ sem unir automaticamente empresas apenas por nome.
4. Classificar relevância e papel; registrar motivo e fonte. IA pode sugerir, nunca criar preço ou contato confirmado.
5. Verificar identidade/cadastro/contato de forma independente. Informação conflitante permanece explícita.
6. Solicitar cotação por ação humana. O sistema prepara o pedido; não envia mensagem nesta missão.
7. Validar condições, calcular custo entregue e revisar capital/metas antes de registrar decisão.

Dados de catálogo ou mensagens comerciais enviados a um provedor externo exigem finalidade e configuração visíveis. A busca de produto não deve transmitir pedidos, dados de compradores ou custo privado ao modelo sem necessidade e autorização específica.

## Corte de MVP e sequência

Primeiro: uma jornada de oportunidade com candidato, ficha, cotação, cálculo consistente e plano. Depois: importação CSV/XLSX com revisão. PDF/OCR e rede de fornecedores ampliada entram após medir a qualidade da descoberta. DRE completo e MCP ficam depois da base financeira/operacional.

As capacidades existentes de vendas, anúncios, extensão e monitoramento continuam acessíveis. A nova navegação não apaga rotas nem históricos; cada migração exige equivalência demonstrada.

## Validação comercial

Piloto proposto: 30 produtos distintos em pelo menos três segmentos, incluindo ilhós, insumos de artesanato e ferramentas; depois 3–5 vendedores. Esses números são **desenho de teste**, não meta atingida.

Medir precisão dos cinco primeiros candidatos, taxa de identidade confirmada, percentual de pesquisas que chegam a cotação utilizável, tempo até a primeira cotação, custo de pesquisa, indisponibilidade por fonte e conclusão das quatro perguntas sem ajuda. Registrar falsos positivos e custo total de operação.

Hipótese de monetização: entrada gratuita para análise limitada; cobrança por valor recorrente em fornecedores/importação/monitoramento. **Preço não definido**. Validar disposição a pagar e custo por pesquisa; não copiar os preços do concorrente automaticamente.

## Critério de sucesso do produto

Um usuário consegue concluir o estudo e explicar a origem de cada número. Quando falta um dado, sabe exatamente o próximo passo. Quando o fornecedor não atende, o produto explica o impedimento. Quando a conta fecha, apresenta contribuição e capital condicionais, sem prometer vendas futuras.
