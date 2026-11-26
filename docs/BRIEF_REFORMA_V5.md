# Brief v5: tornar busca, anúncio, menu, /mercado e Radar de oportunidades competitivos

Contexto: Bruno comparou o Radar com o Cargoos no Mercado Livre e reprovou o nosso por: informações mal colocadas,
menu flutuante feio e sem função útil, tela /mercado com colunas vazias, Radar de oportunidades com filtros que não funcionam
e informações confusas. Leia `docs/REFERENCIA_UX_MERCADO.md` (como a referência apresenta métricas) e `hx/DESIGN_BRIEF.md`.

## Imagens
Referência (outro produto), em /root/.claude/uploads/af85f141-3d5c-50bd-9bcd-dd99fe0d8cd4/:
- 2db46ac4-image.png (cards na busca), 40aef910-image.png (card com selo de tipo e data), b6b39ba5-image.png (painel no anúncio),
  b8269259/073ac96c/638a9c2b/1c0c2e42/43c644ce-image.png (balões e cartão do vendedor), 5019441b-image.png (menu flutuante),
  9b435e9d-image.png (painel lateral de filtros na busca).
O NOSSO sistema hoje (o que reprovaram):
- bdbf741c-image.png (painel lateral), d3ae079c-image.png (cards), 71c9089f-image.png (painel no anúncio),
  5019441b é do outro; nosso menu é 1f9aac2b-image.png; /mercado: 5bd01771-image.jpg; oportunidades: 987d230a-image.png.

## Princípios
1. Primeiro o que o usuário quer ver: vendas/dia, faturamento/dia, visitas/dia, demanda, score. Calculadora vem DEPOIS e recolhida.
2. Nada de "—" em coluna inteira nem "Sem histór…" truncado: se não há dado, um único estado vazio claro que diz o que falta
   (ex.: "Abra este anúncio de novo amanhã para medir o ritmo") ou esconder a coluna.
3. Todo número estimado leva "~", faixa e um balão curto explicando a conta. Nunca inventar precisão.
4. Altura fixa nos blocos dos cards (grade estável), mesmo sem dado.
5. Cor só para estado. Sem gradiente decorativo. Borda 1px, raio 8/12. Marca teal #18967A.
6. Funciona sem login com o que a página mostra (demanda aproximada, faturamento acumulado = piso de vendidos x preço),
   e melhora quando logado/com histórico.
7. Nenhum filtro/botão decorativo: tudo que aparece funciona e tem teste no harness.
8. Português do Brasil, sentence case, sem inglês ("alta", "média", não "high").

## Limites técnicos (não violar)
- A extensão só lê o DOM da página que o usuário abriu; não navega, não chama endpoints internos do ML, 1 POST por página.
- Não copiar logotipo, nome, ícones nem frases literais da referência; mesma qualidade, identidade própria.
- Não há npm install aqui; testar com o harness (esbuild + Playwright): `hx/build.mjs`, `hx/shot.py`, `hx/ext/run.py`.
- Não rodar git commit nem push; o lead faz o patch. Não mexer fora do seu escopo.
- Dados que o servidor já tem: ver `lib/market-estimates.ts` (ItemEstimate) e `lib/market-intel.ts`.
