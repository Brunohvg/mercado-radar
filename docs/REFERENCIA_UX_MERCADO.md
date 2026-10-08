# Referência de UX: como o mercado apresenta métricas no Mercado Livre

Fonte: prints enviados por Bruno em 07/10/2026 (busca "ilhos baxmann" e anúncio MLBU5121399622).
Objetivo: copiar a QUALIDADE (hierarquia, densidade, honestidade, discrição), não marca, logotipo nem textos.

## 1. Página de busca

### 1.1 Painel lateral (topo da coluna de filtros do ML, antes dos filtros nativos)
- Faixa de oferta (verde): título curto, 1 linha de benefício, botão escuro "Testar grátis".
- Cartão branco, borda 1px, raio ~12:
  - Cabeçalho: marca à esquerda, "68 itens" à direita (tamanho da amostra).
  - 3 mini-KPIs lado a lado (valor grande, rótulo pequeno cinza): Catálogos 7 | Full 35 | Full+Cat 4.
  - Caixa cinza clara: "Amostra de 1 páginas · 68 itens" + link "Ver a busca inteira" com selo PRO.
    -> deixa claro que a análise é sobre a amostra carregada, não sobre os 1.395 resultados.
  - Rótulo "Filtros" (cinza pequeno) + 4 interruptores com contagem à direita:
    Apenas catálogo 7 | Sem catálogo 61 | Apenas Full 35 | Ganhador sem Full 31.
  - Rótulo "Ordenar" + grade 2x2 de botões: Oportunidade (PRO, desabilitado) | + Vendidos | Menor R$ | Maior R$.
- Os filtros agem no cliente, sobre os cards já carregados (esconde/mostra e reordena).
- Contagem ao lado de cada filtro evita clique que resulta em lista vazia.

### 1.2 Dentro de cada card (entre o título e a marca)
- Caixa com borda fina, raio ~8, altura FIXA (linhas alinhadas entre cards, mesmo vazio).
- Duas colunas: [pílula de demanda + rótulo "demanda"] | [seta de tendência verde + "R$ 79k" em negrito + rótulo "faturamento"].
  - Pílula: "Baixa" (cinza), "Alta" (azul claro). Rótulo embaixo, cinza, minúsculo.
  - Valores compactos: R$ 4k, R$ 79k.
- Sem dados: mesma caixa, texto cinza "Sem dados disponíveis" (não some, não quebra o grid).
- Selo no canto superior da imagem: tipo de anúncio ("TRADICIONAL", fundo creme, texto laranja, borda).
- Logo abaixo, pílula com data de criação: "05/09/2026 · 32 dias atrás".
- O resto do card do ML não muda.

### 1.3 Pistas numéricas dos cards (hipótese a validar)
- "+25 vendidos", R$ 178,45 (riscado) / 169,52  -> "R$ 4k" (25 x ~170 = 4,2k)
- "+1000 vendidos", R$ 78,99 (riscado) / 67,14 -> "R$ 79k" (1000 x 78,99 = 79k)
- Leitura: o "faturamento" do card parece ser (piso da faixa de vendidos) x preço, ou seja ACUMULADO, não por dia.
  Já no anúncio o faturamento é por dia (vendas/dia x preço). O card deveria dizer isso no rótulo.
- Dois anúncios "+500 vendidos" aparecem como "Sem dados disponíveis" (motivo desconhecido: plano gratuito? sem histórico?).
- Todos os 4 cards eram anúncios patrocinados ("Ad").

## 2. Página do anúncio

### 2.1 Posição
Coluna da direita, abaixo do seletor de variação (Cor) e da linha "Calculadora" (botão com ícone + botão de loja).

### 2.2 Painel de métricas
- Cartão branco, borda 1px, raio ~12, padding ~20.
- Cabeçalho: marca à esquerda; pílula de demanda ("Baixa") à direita.
- Grade 2x2 de blocos (fundo cinza muito claro, borda fina, raio 8):
  - Visitas/dia 12
  - Vendas/dia 0,4 (ícone "i")
  - Faturamento/dia ~R$ 17,16 (ícone "i", prefixo "~" quando é estimativa)
  - Score 15 /100 ("/100" menor e cinza; ícone "i")
  - Valor ~18px, peso regular (não negrito); rótulo ~12px cinza abaixo.
- Bloco "Payout do Meli" (ícone "i"): valor grande R$ 30,90 | divisor vertical | Comissão 12% / 17% (a % ativa sublinhada, clicável alterna Clássico/Premium) | Frete Est. R$ 6,85.
- Rodapé: "Abra a calculadora ... para análise completa" (12px, cinza, só um trecho sublinhado).

### 2.3 Balões (tooltips) — textos curtos, 1 a 3 linhas
- Fundo verde-petróleo quase preto, texto branco ~13px, raio ~8, sem seta marcada, aparece ao lado do bloco.
- Faturamento: "Vendas por dia estimadas vezes o preço deste anúncio."
- Score: "Saúde de 0 a 100: tráfego, vendas, idade e histórico."
- Vendas/dia: "Conversão média do Meli aplicada às visitas dos últimos 30 dias."
- Payout: "Valor que o Mercado Livre deposita: preço – comissão – frete. Não inclui custo do produto nem seu imposto. Clique nas porcentagens pra ver o payout em Clássico ou Premium."
- Vendedor: "Informações públicas do vendedor obtidas do Mercado Livre."

### 2.4 Cartão do vendedor (abaixo do bloco de compra do ML)
- Nome + ícone copiar + "i".
- Chips com borda (raio 8, 12-13px): [bandeira] Belo Horizonte - MG | [ponto verde] Verde (reputação) | [etiqueta] +50 vendas | [caixa] Anúncio: Clássico | Estoque [cadeado] [PRO].
- Recurso bloqueado = chip com cadeado e selo PRO (a pessoa vê que existe).

### 2.5 Botão flutuante e menu
- Botão redondo (~44px) no canto inferior direito com a marca; abre menu branco (raio 12, sombra):
  Ativar plano grátis [7 dias] (destacado em verde claro) | Ferramentas Web > | Ferramentas 3D > |
  Calculadora de Importação | Calculadora Meli | Gerar EAN | Configurações | Suporte | Sair (vermelho).
- Ícones de linha, 1 por item, texto 14px.

## 3. Calibração com dado real (anúncio do próprio Bruno, loja VIDALYS)
- Anúncio MLBU5121399622, "Ilhós Nº 54 Baxmann Dourado 1000 un", preço deduzido R$ 42,90
  (30,90 + 12% de 42,90 + 6,85 = 42,90).
- Referência de mercado: visitas 12/dia, vendas 0,4/dia, faturamento ~R$ 17,16/dia (= 0,4 x 42,90), score 15/100, demanda Baixa.
- Conversão implícita: 0,4 / 12 = 3,3% (faixa 2,8% a 3,9% com arredondamento). O tooltip diz que as vendas vêm da
  visita x conversão média, ou seja, o caminho inverso do nosso (nós partimos das vendas).
- Como é anúncio dele, a API dá vendas e visitas exatas: comparar com o que o Radar estima.

## 4. Princípios extraídos
1. Número grande, rótulo pequeno, uma linha de ajuda por balão.
2. Todo número estimado leva "~" e balão explicando a conta.
3. Estado vazio ocupa o mesmo espaço (grid estável).
4. Contagens ao lado dos filtros. Filtros e ordenação sobre a amostra visível, dita explicitamente.
5. Cor só para estado (demanda, tendência). Sem gradientes. Bordas finas, raio 8/12.
6. O que não está disponível aparece bloqueado, nunca escondido.

## 5. Painel lateral em tamanho real (recorte enviado às 21:47)

Contagens desta captura (amostra de 68 itens): Catálogos 7 | Full 30 | Full+Cat 3.
Filtros: Apenas catálogo 7 | Sem catálogo 61 | Apenas Full 30 | Ganhador sem Full 36.
- 7 + 61 = 68: "catálogo" e "sem catálogo" particionam a amostra.
- Full+Cat (3) é a interseção de Full e Catálogo.
- Full 30 + "Ganhador sem Full" 36 = 66, não 68: o 3º filtro NÃO é o complemento exato de Full.
  Provável: ganhador da buy box entre os não-Full, com 2 itens sem classificação. A confirmar.
- Na captura anterior (mesma busca) os números eram 35 / 4 / 31: as contagens são recalculadas ao vivo
  sobre os cards carregados naquele momento (anúncios patrocinados mudam entre carregamentos).
  Consequência para nós: recalcular a cada mudança de DOM e nunca guardar a contagem.

Visual:
- Faixa de oferta: verde claro chapado (sem degradê), título negrito ~17px escuro, subtítulo cinza-esverdeado,
  botão escuro (verde-petróleo) arredondado com ícone de seta diagonal.
- Cartão branco: marca (ícone verde 28px arredondado + nome) à esquerda, "68 itens" pequeno à direita.
- 3 blocos iguais (fundo cinza claro, sem borda): número ~16px negrito, rótulo ~11px cinza.
- Caixa de amostra: fundo cinza muito claro com borda fina; texto 11px à esquerda, link em negrito à direita
  seguido de "PRO" em texto simples.
- "Filtros" e "Ordenar": rótulos cinza 12px, sentence case; linhas finas separam as seções.
- Linha de filtro: texto 15px escuro à esquerda, contagem alinhada à direita (peso médio), interruptor cinza (~36x20) desligado.
- Ordenar: grade 2x2, botões de borda fina, raio ~6, texto 13px. "Oportunidade" desabilitado com ícone de cadeado
  e selo "PRO" verde sobreposto ao canto superior direito.
