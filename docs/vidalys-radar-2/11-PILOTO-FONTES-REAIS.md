# 11 · Piloto de descoberta com fontes reais

Data: 25/11/2026 (Brasil). Pesquisa manual independente em páginas públicas; não executada pelo provedor Brave/Gemini da instalação. Não é certificação de fornecedor, cotação comercial nem medida de precisão do motor em produção.

## Casos iniciais

| Produto de referência | Fonte pública | Evidência | Pendente |
|---|---|---|---|
| Ilhós Baxmann nº 54 alumínio, 1.000 un. | https://www.baxmann.com.br/representantes/ | Canal oficial de representantes | Produto, lote e condições para revendedor |
| Mesmo | https://www.baxmann.com.br/ilhoses/ | Linha do fabricante | Modelo, acabamento e embalagem |
| Mesmo | https://brasferroaviamentos.com.br/categoria/ilhos/26 | Catálogo cita modelo 54, 1000 un. | Material, cor e condições de atacado |
| Mesmo | https://armarinhos25.com.br/produtos/ilhos-de-aluminio-04-mm-baxmann-54-colorido-c-1000-un-pubpy/ | Produto compatível em marca/modelo/material/quantidade | Variante e condições comerciais |
| Cola quente fina 30 cm, 1 kg | https://www.reval.net/produto/cola-quente-refil-fina-eco-1-kgtransp-75x30cm-rendicolla-053254 | Catálogo de atacadista, 7,5 mm x 30 cm | Marca desejada, preço, lote, CPF |
| Cola quente grossa 30 cm, 1 kg | https://www.reval.net/produto/cola-quente-refil-grossa-eco-1kgtransp112x30-rendicolla-053255 | Catálogo de atacadista, 11,2 mm x 30 cm | Marca desejada, preço, lote, CPF |
| Cola quente 30 cm | https://loja.rhamosebrito.com.br/bastoes-de-cola-quente | Linha de produtos com tamanhos e embalagens distintos | Peso, diâmetro, cor, equivalência e condições |
| Base broche 22 mm | https://www.fazendoartesanato.com.br/produtos-pecas_para_montagem-base_metalica_para_broche-378.html | Catálogo lista base ferro 22 mm, 1.000 un. | Variante, disponibilidade, preço e lote |
| Base broche 22 mm | https://www.fazendoartesanato.com.br/base_de_broche_peq_15_mm_ferro_p030___1000_un_2073.html | Controle negativo: medida 15 mm | Não tratar como equivalente |
| Base broche 22 mm | https://www.fazendoartesanato.com.br/ | Canal de alto atacado divulgado | Confirmar acesso e condições |

## Aprendizados incorporados
- Canal de representantes da marca pode ser relevante sem comprovar o SKU exato.
- Normalizar medidas com e sem espaço, e rejeitar medidas únicas explicitamente divergentes. Resultado com várias medidas exige análise humana. Não inferir equivalência entre materiais, cores ou marcas.
- Fixtures reduzidas inspiradas nas páginas públicas testam o classificador, não a cobertura ou a disponibilidade da busca.
- Preço, frete, nota fiscal, pedido mínimo e CPF permanecem desconhecidos até confirmação específica.

## Próximos gates
- Expandir para 30 produtos distintos em três ou mais segmentos (não contar variantes ou URLs como produtos distintos sem justificativa).
- Executar o provedor real com credenciais autorizadas, guardar candidatos, fontes e data, rotular acertos/falsos positivos. Medir precisão@5, latência, custo e percentual de estudos com cotação útil.
- Validar contato comercial e custo entregue com o usuário. Não importar automaticamente candidatos do piloto para dados de clientes.
- A pesquisa manual de hoje não demonstra performance do sistema nem aprova lançamento.
