# Vidalys Radar — design system proposto

Versão de proposta: 1.0, 25/11/2026. **Aprovação visual pendente.** Implementação restrita aos arquivos de protótipo; os tokens da aplicação e da extensão existentes não foram trocados.

## Direção e justificativa

O repositório atual já usa azul `#1263FF`, grafite e ciano, com Manrope. Refinar essa família preserva reconhecimento e aproveita as fontes locais. A proposta usa cobalto um pouco mais escuro, menos gradientes, navegação clara, bordas discretas e maior densidade útil. O verde fica reservado a condição financeira positiva; não é a cor principal da marca.

O Cargoos contribui com princípios de organização: menu por área, cabeçalho estável, tabela como superfície de trabalho e formulário progressivo. Não copiar sua marca, verde-lima, ilustrações, CSS ou textos.

## Identidade

Nome: **Vidalys Radar**. Assinatura: **Inteligência para revender**. Símbolo próprio: V compacto com arco e ponto de radar. O ponto é acento, não um selo de fornecedor aprovado. No favicon pequeno, simplificar o arco; não reduzir o wordmark inteiro.

Arquivos propostos em `prototipos/assets/`: `mark.svg`, `logo.svg`, `mark-mono.svg`, `favicon.svg` e favicon PNG 16/32/48/180. São ativos de revisão, sem substituir `public/brand` ou os ícones da extensão. Exploração visual da marca também apresentada nesta conversa. Não foi feita pesquisa de marca/INPI nesta etapa.

Respiro mínimo: um quarto da altura do símbolo; tamanho mínimo do símbolo completo 24px, versão simplificada a 16px. Wordmark em grafite/cobalto sobre claro, branco sobre escuro. Sem deformação, contorno extra ou sombra decorativa.

## Tokens de referência

| Token | Valor | Uso |
| --- | --- | --- |
| `brand` | `#1D4ED8` | Ação principal, link e seleção |
| `brand-hover` | `#1E40AF` | Hover/pressed |
| `brand-soft` | `#EEF3FF` | Seleção leve e contexto |
| `ink` | `#14263D` | Texto principal e marca |
| `muted` | `#5C6B7F` | Texto secundário |
| `canvas` | `#F5F7FB` | Fundo |
| `surface` | `#FFFFFF` | Área de trabalho |
| `line` | `#E2E7EF` | Divisórias decorativas |
| `control-line` | `#7C8DA3` | Borda funcional quando necessária |
| `accent` | `#22B8CF` | Ponto/sinal decorativo; não texto pequeno |
| `positive` | `#0E7660` | Contribuição/metas atendidas |
| `positive-soft` | `#E8F5EF` | Fundo positivo |
| `warning` | `#92400E` | Pendência e atenção |
| `warning-soft` | `#FFF7E7` | Fundo de pendência |
| `negative` | `#B42318` | Erro/prejuízo |
| `negative-soft` | `#FEF0EE` | Fundo de erro |

Cor nunca é o único sinal de estado. Cada badge tem texto e, quando útil, ícone. Seleção principal usa cobalto; fornecedor encontrado nunca recebe verde de aprovação comercial automática.

## Tipografia e geometria

Manrope local, com licença SIL OFL preservada. Texto comum 14px/1,5 desktop e 15–16px mobile; títulos 30–32/38px; subtítulos 18–20px; rótulos 12–13px, com contraste suficiente; números com `font-variant-numeric: tabular-nums`. Evitar títulos em caixa alta em blocos longos.

Escala de espaço: 4, 8, 12, 16, 24, 32 e 48px. Sidebar 224–232px; cabeçalho 64–72px; área principal com largura máxima aproximadamente 1280px. Raios 8/12px; 16px somente para superfícies especiais. Sombra apenas em menu, modal ou painel sobreposto.

## Componentes

| Componente | Especificação | Estados obrigatórios |
| --- | --- | --- |
| Botão principal | Cobalto, rótulo verbal; um por contexto principal | Normal, hover, foco, enviando, desabilitado com motivo |
| Botão secundário | Branco/neutro; não competir com o principal | Mesmo ciclo de foco/feedback |
| Campo | Label persistente, unidade perto do valor, ajuda contextual | Vazio, válido, erro, pendente, somente leitura |
| Campo monetário | pt-BR, aceita vírgula e ponto; distingue vazio e zero | `null`, zero confirmado, positivo e inválido |
| Tabela | Texto à esquerda, número à direita, uma ação de linha destacada | Skeleton, vazio, parcial, erro, paginação e seleção |
| Resumo de decisão | Uma frase, até três fatores e próxima ação | Dados insuficientes, negociar, metas atendidas, incompatível |
| Evidência | Fonte, captura, validade, trecho e grau de confirmação | Encontrada, revisada, vencida, conflitante |
| Badge | Texto curto, sem transformar score em aprovação | Candidato, a confirmar, confirmado, bloqueado |
| Abas | Contexto preservado; estado e teclado consistentes | Ativa, foco, carregando, restrita com motivo |
| Modal/painel | Uma tarefa; título, fechar, cancelar e submit | Foco preso, Escape e retorno ao disparador |
| Gráfico | Eixos/unidades/período, legenda e tabela alternativa | Sem base, dados parciais, erro e série completa |
| Toast | Confirma resultado sem esconder pendência | Sucesso, erro recuperável e resposta ambígua |

## Telas propostas

| Vista no protótipo | Objetivo | Ação principal |
| --- | --- | --- |
| Início | Retomar estudo ou começar por produto | Analisar produto |
| O que vender | Comparar produtos com limites das fontes | Estudar produto |
| Fornecedores | Comparar candidatos e condições do produto | Registrar cotação |
| Simulador | Ver composição, faltas e contribuição | Conferir cenário |
| Operação | Ler vendas/anúncios/estoque no mesmo contexto | Revisar pendências |
| Configurações | Revisar perfil, metas e situação das fontes | Conferir preferências |
| Login | Acesso simples e claro | Entrar |
| Landing | Explicar as quatro perguntas com demonstração | Experimentar demonstração |
| Onboarding | Primeira análise útil, sem exigir tudo antes | Iniciar estudo |
| Extensão | Resumo compacto e continuação no painel | Encontrar fornecedor |
| Componentes | Inspecionar estados e tokens | Alternar estado de demonstração |

A apresentação de revisão contém navegação entre as onze vistas e um modo mobile de 390px. Essa barra pertence ao protótipo, não à experiência final do produto. Todos os fornecedores, preços e números do protótipo estão marcados como **fictícios**. Nenhum botão publica ou contata fornecedor real.

[Pranchas para aprovação](prototipos/pranchas/VIDALYS_RADAR_PROPOSTA_VISUAL.pdf), geradas como documento estático a partir das funções do HTML. Não comprovam renderização idêntica em Chrome ou responsividade real; esses testes permanecem pendentes, conforme [registro de validação](prototipos/VALIDACAO.md).

## Mobile e extensão

Em mobile, menu em drawer, conteúdo em uma coluna, ações touch de pelo menos 44px e campos de 16px. Tabelas podem rolar horizontalmente em região identificada, mantendo produto/ação disponíveis; não criar rolagem horizontal no documento inteiro. O CTA não cobre conteúdo nem teclado. Seções avançadas ficam recolhidas.

Extensão: mesma linguagem visual em superfície estreita; resumo do produto, estado da fonte, contribuição condicional e fornecedor. Mercado e memória de cálculo sob demanda. Preservar botão comprar, galeria, preço e seletores nativos do ML; não cobrir a página com um dashboard.

## Acessibilidade e movimento

Meta: WCAG AA para conteúdo e componentes implementados. Foco visível, labels, `aria-current`, nomes de ação, navegação por teclado e descrições de erro ligadas ao campo. Respeitar `prefers-reduced-motion`; transições de 120–180ms só quando ajudam a entender abertura/seleção. Sem carrossel obrigatório.

A aprovação do desenho não comprova conformidade do produto reconstruído. O gate visual inclui contraste, teclado, leitor de tela, 200% de zoom, 320/390/768/1440px e estados financeiros faltantes.

## Migração

Após aprovação: introduzir tokens/componentes comuns; migrar uma jornada por vez; comparar função e captura antes/depois; manter rotas e recursos antigos até substituição validada. Não adicionar sucessivas folhas de override global. O refinamento de azul/clareamento de sidebar é uma proposta explícita para revisão, não decisão já aplicada à aplicação publicada.
