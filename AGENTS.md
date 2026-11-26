# Mercado Radar — Regras de implementação

1. Escopo fechado: altere somente o que a etapa atual lista.
2. Decisões de produto, nome, preço, permissão, schema ou política fora do escopo devem ser explicitadas antes de seguir.
3. Não alterar schema/migrations, CSP, OAuth, criptografia, endpoints ou versões de dependências fora de uma etapa que exija isso.
4. Entregar arquivos consolidados; evitar camadas incrementais de CSS/JS.
5. Antes de editar, listar o escopo. Depois, executar `npm run typecheck` e `npm run build`.
6. Ao concluir: arquivos alterados, o que não foi feito, validação manual e riscos.
7. Mudança visual não altera regra de negócio, fórmula, endpoint ou formato de API.
8. Commits pequenos por etapa.
9. A experiência da revisão 0.11.0 foi aprovada pelo usuário como direção visual. Preservar sua hierarquia, análise automática e comparação; evoluir em etapas pequenas. Uma nova reformulação exige um problema demonstrado e escopo explícito.
10. Seguir `docs/EVOLUTION_PLAN.md` para a evolução e a matriz de revisão do sistema. Antes de criar uma função, conferir se já existe e se precisa apenas de integração ou correção.
11. Em cada etapa funcional, fazer checagem completa: regras e fontes dos dados, estados de erro/ausência, consistência entre telas/extensão, financeiro, autenticação/isolamento, regressão visual e integração. Usar a suíte completa do CI e a matriz de telas, registrando a cobertura e as pendências reais; não declarar uma tela ou ambiente validado sem evidência.
12. Registrar o HEAD verificado, CI, testes, evidência visual, validação real realizada e riscos restantes. CI verde e fixture sintética não substituem homologação no Mercado Livre. Etapa apenas documental preserva as verificações obrigatórias da regra 5 e a revisão de diff/links.
