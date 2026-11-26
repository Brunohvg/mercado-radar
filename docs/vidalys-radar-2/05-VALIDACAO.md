# Etapas 5 e 6: fatia vertical e validação

Fatia entregue: **produto identificado → fornecedores → evidências → viabilidade → oportunidade salva**, no painel (`/onde-comprar`) e na extensão (aba Fornecedor).

## Verificações (25/11/2026, sessão na nuvem)

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | ok |
| `npm test` (regras) | 122 passaram (17 novos de fornecedores) |
| `npm run test:extension` | 27 cenários (1 novo: aba Fornecedor), sem overflow de 280 a 720 px |
| `npm run test:market` | 16 cenários |
| Migrations em PostgreSQL 16 limpo + upgrade com dados | ok |
| `npm run test:integration` (HTTP) | 46 checks; 1 novo cobre a jornada inteira e o isolamento entre operações |
| `npm run build` e pacote da extensão | ok |
| Capturas desktop 1366 e celular 390 | sem overflow, sem erro de página |

## Encontrado e corrigido durante a validação

- Custo por peça arredondado para 2 casas: R$ 0,024 virava R$ 0,02 e escondia R$ 4 por venda de 1.000 ilhós. Agora 4 casas, com teste.
- 4 abas não cabiam no painel de 280 px; a grade passa a 2×2 abaixo de 340 px.

## Não validado (depende do Bruno)

- Conta real do Mercado Livre: tarifa, preço e atributos (marca/GTIN) vindos da API. A sessão na nuvem não alcança `api.mercadolibre.com` nem `brasilapi.com.br`; usamos respostas simuladas.
- Busca web real: exige `BRAVE_SEARCH_API_KEY`. Sem a chave a busca fica desligada e mostra links de pesquisa manual.
- Validação comercial: buscar fornecedores para 30 produtos reais e medir quantos geram cotação útil.

## Como ativar

1. Rodar `npm run db:deploy` (migration aditiva `202611251200_sourcing_radar`).
2. Opcional: `BRAVE_SEARCH_API_KEY` no Coolify para a busca automática.
3. Instalar a extensão 0.13.0.

Fornecedores nas capturas são fictícios e marcados como tal.
