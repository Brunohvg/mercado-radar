# Cargoos — análise visual e de usabilidade

Data: 25/11/2026. Inspeção desktop no Cloud Browser, capturas de aproximadamente 1363 × 936. Valores medidos são estilos computados de elementos visíveis, não extração do design system ou código do concorrente.

## Medições e observações

| Elemento | Evidência observada | Por que ajuda / onde limita | Diretriz para o Radar |
| --- | --- | --- | --- |
| Sidebar | Clara, aproximadamente 250px; grupos Overview, Playground e Contabilidade | Agrupa tarefas, mas mistura taxonomia em inglês com produto em português | Seis destinos por intenção; rótulos em português |
| Barra superior | Breadcrumb, notificações, aparência, ajuda e upgrade | Contexto consistente; upgrade repetido compete com o trabalho | Breadcrumb e estado da conta; promover ação da página |
| Marca/ação | Botão de upgrade medido `rgb(177,254,123)`, texto `rgb(5,45,43)` | Destaque forte; verde também aparece em resultados/estados | Cobalto para ação, verde exclusivamente para resultado positivo |
| Fonte | DM Sans observada | Leitura relativamente leve e consistente | Manrope já disponível no Radar, com escala mais curta |
| Título principal | 36px, peso 500, `rgb(5,45,43)` em Dashboard | Entrada clara; títulos longos consomem altura | 30–32px desktop, 26px mobile |
| Botão superior | Altura 31,5px; raio 7px; fonte 14px no elemento medido | Compacto no desktop; alvo pequeno para touch | 40px desktop; mínimo 44px em mobile |
| Espaçamento | Cabeçalho, indicadores e tabela separados por zonas | Evita misturar decisão, filtro e linha | Uma zona de decisão e uma zona de trabalho |
| Tabelas | Cabeçalho sóbrio, busca/filtros acima, ações de linha e paginação abaixo | Bom para operação; muitas colunas exigem rolagem horizontal | Colunas prioritárias fixas; detalhes sob demanda |
| Números | Receita, margem e ROI próximos do registro | Facilita comparar; fórmulas e cobertura nem sempre acessíveis | Fonte tabular, unidade, fonte, período e cobertura visíveis |
| Gráficos | Séries, barras de distribuição e funil de publicidade | Síntese útil quando a pergunta é clara | Só incluir gráfico se houver decisão associada e tabela alternativa |
| Formulários | Modal por seções: identificação, endereço, logística | Reduz esforço inicial; validação obrigatória tem pequena inconsistência no fornecedor | Obrigatoriedade consistente, erro junto ao campo |
| Modal | Foco inicial em fechar/primeiro campo; cancelamento acessível | Mantém contexto sem nova rota | Foco preso, Escape, retorno ao disparador e um submit |
| Vazios | Fornecedor vazio explica utilidade e oferece cadastro | Boa ligação entre ausência e próxima ação | Vazio com uma ação, sem métricas artificiais |
| Loading | Marca/estado de carregamento e skeletons nas páginas | Reconhecível; cargas em etapas podem mostrar rótulos temporários | Skeleton com dimensões estáveis e progresso para tarefas longas |
| Erros/restrições | Manutenção no EAN, bloqueio por trial e ofertas Pro | Há distinção de estados; repetição de upgrade interrompe fluxos | Diferenciar plano, permissão, falta de dados e indisponibilidade |
| Consistência | Sidebar, cabeçalho e tabelas reutilizam padrões | Menor reaprendizado | Tokens e componentes compartilhados com extensão |
| Responsividade | Não foi possível variar o viewport móvel da sessão concorrente | Não há evidência de comportamento mobile | Testar o protótipo e depois o produto a 390px e 320px |

## O que torna a experiência mais fácil

O usuário encontra a tabela sob um cabeçalho conhecido, com busca e filtros próximos. Ações pouco frequentes ficam nos menus das linhas e seções do modal. Estados vazios explicam o primeiro passo. Esses princípios são reaproveitáveis sem copiar a expressão visual da marca.

Há também problemas a evitar: promoção antes da tarefa, densidade de indicadores bloqueados, pontuação sem método visível e definições financeiras não suficientemente explícitas. A inspeção encontrou carregamentos progressivos; um frame intermediário não foi tratado como estado final do produto.

## Proposta própria

Manter a família Vidalys, refinando o azul já existente no repositório; a base atual **não é somente petróleo/menta**. Usar navegação clara, grafite no texto, branco/cinza nas superfícies, cobalto no comando principal e ciano só como acento. Densidade suficiente para tabelas, menos painéis empilhados e um resumo de decisão por produto.

Não foram copiados CSS, componentes, logos, ilustrações ou textos promocionais. As capturas do Cargoos servem exclusivamente como evidências de auditoria e não são usadas na interface proposta.

Evidências: C01–C05 e C07–C14 em [EVIDENCIAS.md](EVIDENCIAS.md). Identidade e componentes próprios: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).
