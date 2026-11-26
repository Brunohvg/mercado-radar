# 10 · Inteligência de fornecedores — benchmark e gates

Data da pesquisa: 25/11/2026 (Brasil). Escopo: documentação pública, não testes de assinatura ou auditoria de precisão.

| Referência | Capacidade divulgada | Implicação para o Radar |
|---|---|---|
| [Hunter Spy](https://ajuda.hunterhub.com.br/pt-br/article/por-onde-comecar-no-hunter-spy-1a69god/) | Análise contextual do anúncio e concorrência | Entrada por anúncio; não replicar Seller Center |
| [Zentry](https://chromewebstore.google.com/detail/zentry-para-mercado-livre/hmnpeekkicccppniandgfpepjoeipmdd) | Fornecedores de produtos parecidos | Correspondência exata, equivalente e candidato devem ser separados |
| [Helium 10](https://www.helium10.com/tools/product-research/chrome-extension/supplier-finder/) | Alibaba, MOQ, preço estimado, localização, prazo | Comparar custo entregue e lote mínimo para o pequeno revendedor |
| [Sellerando](https://sellerando.com.br/) | Rede de fornecedores B2B com estoque nacional | Priorizar abastecimento local; avaliar parcerias com autorização |
| [Fornecedores 360](https://fornecedores360.com.br/) | Pedido mínimo, frete e prazo por fornecedor | Exibir capital total, não só preço unitário |

[Hunter: mudanças de acesso a dados](https://hunterhub.com.br/blog/novidades-do-hunter-hub/): a própria plataforma relata retirada de métricas de visitas em ferramentas após mudança da API. Não usar dados inacessíveis como se fossem confirmados.

## Decisões implementadas
- Custos de venda desconhecidos impedem cálculo conclusivo; zero explícito continua válido.
- Cotação vencida deve aparecer na qualificação, não só na simulação.
- Fornecedor sem nota ou com situação cadastral conhecida não ativa gera impedimento na recomendação e no radar de capital.
- Perfil CPF incompatível ou contraditório não entra como oportunidade compatível.
- Orçamento insuficiente não é oportunidade elegível.
- CI inclui homolog; verificar execução antes de promover para main.

## Próximos gates (não comprovados ainda)
1. Testar busca real autorizada, 30 produtos em pelo menos três segmentos; incluir ilhós, cola quente e bases de broche, com tamanhos/quantidades divergentes.
2. Rotular manualmente fabricante, distribuidor, varejo, correspondência, fonte e relevância. Medir precisão nos cinco primeiros resultados, tempo até primeiro fornecedor relevante, proporção de buscas que chegam a cotação válida, custo por pesquisa. Não inventar meta atingida.
3. Validar cada custo entregue com cotação, frete, quantidade, impostos e custo operacional explícitos; distinguir simulação de decisão de compra.
4. Testar a jornada extensão → fornecedor → cotação → margem → plano, em navegador e com conta autorizada; sem publicar anúncios reais durante QA.
5. Só então simplificar o painel e criar protótipos visuais. Não criar novas telas quando a capacidade já existe.

Limites: CNPJ ativo não prova confiabilidade; preço publicado não prova disponibilidade; demanda de concorrentes não prova vendas futuras. Pesquisa real e QA comercial permanecem pendentes.
