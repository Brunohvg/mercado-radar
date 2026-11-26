# Validação do protótipo de aprovação

Referência: 25/11/2026. Artefato isolado, sem comunicação com APIs e sem alteração da aplicação publicada.

## Verificado

- `node docs/vidalys-radar-2/prototipos/verificar.mjs`: aprovado. Verifica a sintaxe de todo o script, geração de HTML nas onze vistas, filtro sem resultado, valores ausentes versus zero explícito, quantidade inválida, prejuízo e metas conjuntas.
- Exemplo financeiro: custo entregue 45, contribuição 24, capital 500, piso de margem 93,75 e ROI 51,06%. No caso de reprodução da auditoria, o teto por margem/ROI simultâneos é 35. Os valores são fictícios.
- HTML com Manrope incorporada, favicon embutido, sem bibliotecas externas e sem chamadas de rede no script. A licença da fonte acompanha os ativos.
- Marca vetorial própria e favicon SVG/PNG 16/32/48/180 presentes. Não substituem a marca publicada.
- Onze pranchas desktop e três mobile renderizadas com WeasyPrint 70.0 como **documento estático**; páginas rasterizadas e revisadas visualmente. A geração chama as mesmas funções de composição do HTML, sem navegação de browser. Cada composição ocupa uma página no PDF.
- `npm run typecheck` e `npm run build` aprovados depois da criação do material. A suíte de regras da base auditada teve 183 aprovações, zero falhas; aplicação/lockfile não alterados.

## Limitações reais

O Cloud Browser recusou abrir o arquivo local, pois admite somente URLs HTTP/HTTPS. Não houve contorno desse bloqueio. A tentativa de baixar o Chromium pelo Playwright local também falhou. Portanto **não foram validados** os eventos interativos, teclado, foco, overflow real, responsividade em Chrome, leitor de tela ou equivalência visual entre o PDF e um browser.

As pranchas são material de decisão visual. O motor de documento pode compor espaçamentos, tabelas, botões e controles de maneira diferente. Os cenários numéricos aprovados não homologam tarifas reais, publicação, extensões ou a segurança das rotas existentes.

## Como revisar

Abrir [index.html](index.html) num navegador compatível. O HTML é autocontido; não há autenticação real. Usar somente dados fictícios na tela de login. Usar a seleção de tela e o modo Mobile 390. No simulador, alternar completo, frete ausente e prejuízo; apagar um custo e depois informar zero. Comparar o resumo da extensão com o mesmo cenário. A simulação não persiste dados.

Verificar também busca vazia, filtro CPF/CNPJ, modal de cotação e cancelamento, etapas do onboarding e retorno ao estudo. Só registrar esses casos como aprovados depois de observá-los em navegador. Para aplicação futura, executar a matriz de [TEST_PLAN.md](../TEST_PLAN.md).

## Pranchas incluídas

| Composição | Arquivo |
| --- | --- |
| Início | [home.png](pranchas/home.png) |
| O que vender | [discover.png](pranchas/discover.png) |
| Fornecedores | [suppliers.png](pranchas/suppliers.png) |
| Simulador | [simulator.png](pranchas/simulator.png) |
| Operação | [operation.png](pranchas/operation.png) |
| Configurações | [settings.png](pranchas/settings.png) |
| Landing | [landing.png](pranchas/landing.png) |
| Login | [login.png](pranchas/login.png) |
| Onboarding | [onboarding.png](pranchas/onboarding.png) |
| Extensão | [extension.png](pranchas/extension.png) |
| Componentes | [components.png](pranchas/components.png) |
| Início mobile | [home-mobile.png](pranchas/home-mobile.png) |
| Fornecedores mobile | [suppliers-mobile.png](pranchas/suppliers-mobile.png) |
| Simulador mobile | [simulator-mobile.png](pranchas/simulator-mobile.png) |

Conjunto: [VIDALYS_RADAR_PROPOSTA_VISUAL.pdf](pranchas/VIDALYS_RADAR_PROPOSTA_VISUAL.pdf). Aprovação de direção visual continua pendente em [APROVACAO.md](../APROVACAO.md).
