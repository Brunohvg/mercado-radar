# Mercado Radar — Build Status

## MVP v0.1

Status atual: **em validação real**.

Implementado no código:
- módulos Produtos e Vendas ativados no MVP;
- sincronização de anúncios e pedidos;
- persistência PostgreSQL de produtos, pedidos e itens;
- dashboards operacionais iniciais.

Já confirmados:
- aplicação publicada no Coolify;
- domínio público `radar.optarys.com.br`;
- PostgreSQL na mesma stack;
- OAuth Mercado Livre conectado com conta real;
- tokens criptografados;
- motor de rentabilidade;
- sugestão de preço;
- comparação Clássico × Premium;
- preditor de categoria;
- webhook Mercado Livre persistido;
- Market Intelligence;
- Fit Score;
- snapshots de mercado;
- design system visual-first.

## Gate atual

Antes de mudar o foco principal para Sales Intelligence:

1. validar Ilhós nº54 ponta a ponta;
2. validar Arame encapado ponta a ponta;
3. conferir tarifa e frete contra simulador oficial;
4. revisar anúncios comparáveis;
5. validar mediana/P25/P75;
6. ajustar heurísticas se necessário.

## Próxima feature oficial

**Sales Intelligence**

Importar pedidos reais, processar novas vendas, calcular lucro realizado por pedido/SKU e criar o dashboard operacional.

## Fontes de verdade do projeto

- `docs/FEATURES.md`
- `docs/DEVELOPMENT_CHECKLIST.md`
- `docs/QUALITY_GATES.md`
- `docs/MVP_CHECKLIST.md`

Nenhuma feature deve ser chamada de concluída apenas porque foi implementada.


## Novo gate — Produtos e Vendas

Após o deploy do HEAD atual:

1. confirmar migration dos novos models;
2. abrir Produtos e sincronizar;
3. conferir quantidade/preço/estoque contra Mercado Livre;
4. abrir Vendas e sincronizar 30 dias;
5. conferir pedidos e valores;
6. validar que lucro aparece como pendente quando custos não estiverem completos;
7. somente então avançar para lucro realizado automático.
