# Mercado Radar — Regras de implementação

1. Escopo fechado: altere somente o que a etapa atual lista.
2. Decisões de produto, nome, preço, permissão, schema ou política fora do escopo devem ser explicitadas antes de seguir.
3. Não alterar schema/migrations, CSP, OAuth, criptografia, endpoints ou versões de dependências fora de uma etapa que exija isso.
4. Entregar arquivos consolidados; evitar camadas incrementais de CSS/JS.
5. Antes de editar, listar o escopo. Depois, executar `npm run typecheck` e `npm run build`.
6. Ao concluir: arquivos alterados, o que não foi feito, validação manual e riscos.
7. Mudança visual não altera regra de negócio, fórmula, endpoint ou formato de API.
8. Commits pequenos por etapa.
