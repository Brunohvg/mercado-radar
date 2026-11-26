# Contrato financeiro proposto

Proposta de domínio, 25/11/2026. Não é regra fiscal personalizada nem implementação já aplicada. Fontes oficiais de tarifa/envio estão em [EVIDENCIAS.md](EVIDENCIAS.md), W04/W05.

## Estado de cada valor

Um custo é `{valor, moeda, unidade, estado, origem, capturadoEm, validoAte, contexto}`. Estados mínimos: **desconhecido**, **hipótese**, **cotado**, **confirmado** e **realizado**. `null` não é zero. Zero pode ser conhecido, mas precisa de confirmação ou fonte.

Resultado: incompleto quando falta componente material; hipótese quando houver pressuposto material; simulado completo quando houver insumos suficientes; realizado parcial/completo conforme cobertura. A interface pode mostrar subtotais conhecidos sem fabricar margem final.

## Aquisição e unidade comercial

`mercadoria = Σ(quantidade × preço líquido na unidade correta)`.

`compra entregue = mercadoria + frete de aquisição + seguro/manuseio + tributos não recuperáveis + outros custos atribuíveis`.

`custo entregue por unidade = compra entregue / unidades utilizáveis`.

Guardar embalagem, peças por embalagem, múltiplo de compra, perdas conhecidas e eventual sobra ao formar kits. Ratear frete/despesas do pedido por critério explícito (peso, valor ou quantidade, conforme natureza), preservando total em centavos. Não dividir frete por SKU antes de saber o que compõe o pedido.

Custos por peça podem exigir mais de duas casas decimais. Arredondar totais monetários em centavos no ponto definido, preservando precisão intermediária e soma das parcelas. `Decimal(16,8)` já existe nas cotações; harmonizar transferências para produtos/análises antes de mudar schema.

## Venda e contribuição

`receita líquida comercial = preço reconhecido − descontos suportados pelo vendedor`, sem descontar duas vezes um abatimento já refletido no preço.

`contribuição antes de Ads = receita líquida comercial − CMV entregue − tarifa total de venda − frete efetivo do vendedor − embalagem/operação variável − tributos incidentes − outros variáveis`.

`contribuição após Ads = contribuição antes de Ads − publicidade atribuída − custo esperado de devoluções do cenário`, quando esses insumos forem conhecidos/explicitamente assumidos. Em realizado, conciliar reembolsos e custos efetivos; reserva estimada não é gasto realizado.

`margem de contribuição = contribuição / receita líquida comercial`.

Se despesas gerais/competência/ajustes do negócio não estiverem completos, não nomear o resultado de **lucro líquido da empresa**. DRE: soma de contribuições realizadas menos despesas do período, depreciações/financeiro e ajustes aplicáveis, com cobertura declarada.

## Tarifas e frete

Usar cotação oficial contextual por preço, categoria, modalidade e logística. `sale_fee_amount` é o total; se já inclui fixa, não somar fixa novamente. Registrar o breakdown informativo e conferir consistência.

Frete do comprador e custo do vendedor são grandezas distintas. Para realizado, usar `senders[].cost` correspondente à conta em `/shipments/{id}/costs`; não inferir gratuidade para o vendedor porque o comprador paga ou porque o preço está abaixo de um limiar. Tratar envios compartilhados com rateio reconciliável.

Mudou preço, categoria, logística, modalidade, embalagem ou condição comercial: invalidar cotação dependente e consultar novamente. Não perpetuar tabela genérica como tarifa oficial atualizada.

## ROI e capital

Definir o denominador ao lado do resultado. Para paridade com a base do exemplo: `ROI da venda = contribuição / (CMV entregue + operação variável financiada pelo vendedor)`. Se o denominador for zero, ROI é **indefinido**, não 0%.

O ROI de um lote usa capital comprometido definido, incluindo compra entregue e os recursos operacionais/reserva adotados. Não comparar ROI da venda, ROI do lote e retorno anualizado como se fossem o mesmo indicador. Prazo e giro não são inferidos de contadores acumulados.

`capital necessário = compra entregue + desembolsos operacionais antes do recebimento + reserva explicitamente definida`.

Mostrar também capital de compra e saldo de orçamento separadamente. Despesa conhecida não pode desaparecer porque foi incluída no capital; capital e resultado são perspectivas distintas.

## Equilíbrio e preço mínimo

Com percentuais e custos invariantes, um preço candidato pode ser calculado pela fórmula: `custos monetários / (1 − percentuais de venda − margem-alvo)`. Denominador menor/igual a zero significa meta inviável. A fórmula fechada é apenas candidata: tarifa e frete podem mudar de faixa; recotar e reavaliar o preço final em centavos.

Separar:

- preço de equilíbrio da venda (contribuição zero);
- ponto de equilíbrio da operação no período (despesas fixas / contribuição por venda, somente com base suficiente);
- vendas para recuperar o desembolso do lote (fluxo de caixa condicionado), sem confundir com lucro.

## Limite de compra

Calcular o limite por margem e o limite por ROI, ajustar por desconto/unidade/kit/custo entregue e escolher o menor. Capital/MOQ impõem restrição adicional. Nomear a restrição que limitou a decisão.

Exemplo fictício reproduzido da base: venda 100, comissão 12, frete 10, operação 2 e tributos 4 deixam `72 − C` de contribuição. Para margem de 20%, `C ≤ 52`. Para ROI de 100% na base `C + 2`, `72 − C ≥ C + 2`, portanto `C ≤ 35`. O teto conjunto é **R$35**, não R$52. Toda grandeza é por anúncio de uma unidade neste exemplo.

Um teto econômico não prova preço de mercado, fornecedor ou demanda. Sem cotação de aquisição, é um limite condicional para negociar.

## Exemplo do protótipo

Todos os valores são fictícios. Venda 100; custo entregue 45; comissão 12; tarifa fixa 0 explicitamente informada; envio 10; operação 2; tributos 4; Ads 3; devoluções 0 explicitamente assumidas. Contribuição: **24**; margem: **24%**; ROI da venda na base 47: **51,06%**. Com custos constantes, equilíbrio candidato 71,43; piso por margem 20%: 93,75, sujeitos a nova cotação num produto real.

Lote de 10 pacotes: mercadoria 420 + aquisição 30 = compra entregue 450. Reserva operacional fictícia 50 → capital necessário 500. Contribuição se os dez pacotes venderem nessas condições: 240; não é promessa ou previsão. Sem preencher frete/tributos, o protótipo deixa a contribuição final indisponível.

## Gates de paridade

Mesma entrada normalizada e versão produzem mesmo resultado no servidor, na web e na extensão. Testar zero/vazio, tarifas oficiais totais, moedas/unidades, pacotes de 1.000 peças, desconto, custos de aquisição, metas simultâneas, Ads, devolução, rateio, limiares de tarifa/frete e custo alterado após validação.

O contrato deve ser aprovado antes de substituir fórmulas atuais. Persistir versão e snapshot de decisões; nunca reinterpretar venda ou cenário antigo silenciosamente.
