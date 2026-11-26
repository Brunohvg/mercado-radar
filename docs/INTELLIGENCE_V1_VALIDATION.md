# Concorrentes e kits — entrega para avaliação

Data de referência: 23/10/2026 (Brasil). Branch `feature/radar-intelligence-v1`, [PR #3](https://github.com/Brunohvg/mercado-radar/pull/3), derivado da versão aprovada `feature/radar-commercial-readiness-v1`. Sem merge e sem deploy.

## O que foi implementado

- `/concorrentes`: nome/SKU da operação/ID/link, amostra paginada, marca/modelo/cor quando disponíveis, quantidade e preço unitário, fontes datadas, correspondência explicada e revisável, filtros/ordenação, comparação até quatro ofertas, monitoramento e rascunhos.
- `/kits`: geração de composições para até oito variações e oito tamanhos, respeitando estoques inteiros. São alternativas comerciais, limitadas a 16 por tamanho, não uma enumeração irrestrita. Composições alternativas compartilham o estoque; seus máximos não podem ser somados.
- O exemplo Montovani gera 2 azuis, 2 azuis + 2 pretas, quatro cores, 2 azuis + 2 pretas + 2 vermelhas e oito com duas de cada. Valores do exemplo são de teste e aparecem identificados.
- Reutilização integral de `analyzeProfitability`: compra, embalagem, operação, imposto, comissão e tarifa fixa, frete, lucro, margem, ROI, equilíbrio e preço mínimo. Nenhuma fórmula da extensão foi substituída. O piso é condicionado às taxas constantes, exige nova cotação no preço escolhido e não é apresentado como preço do mercado.
- Tarifas e frete consultados na conta ativa por contexto completo: preço, quantidade, categoria, modalidade, logística, condição de frete e pacote. Peso soma unidades e embalagem; dimensões não são inventadas. Agência, Flex e Full são cenários distintos; armazenagem Full e outras cobranças precisam entrar nas despesas.
- Comissão e frete indisponíveis permanecem ausentes. Estimativas manuais são identificadas e editáveis. Zero exige informação explícita ou resposta válida da API. Desconto de frete não é subtraído novamente e tarifa fixa não é somada duas vezes.
- Cotações são invalidadas quando o contexto ou a conta mudam. Cache privado de 60 segundos, coalescência de consultas idênticas e cotação com data de emissão; o cliente deixa de aplicar valores com mais de cinco minutos.
- Referência automática de preço exige três ofertas recentes, de terceiros, com mesma quantidade e composição compatível. Marca/modelo/cor precisam sustentar a equivalência; kits mistos e quantidades inferidas do título dependem de revisão. Três ofertas ainda recebem aviso de amostra pequena. Anúncios inativos não são referência competitiva e moeda diferente de BRL não vira preço em reais.
- A recomendação prioriza cenário viável, estoque e qualidade da amostra, depois ROI/lucro. Nunca transforma concorrência, avaliações ou preço em demanda. Resultado sem comparação suficiente indica validar o mercado, não comprar estoque automaticamente.
- Rascunhos de kits guardam entradas, composição, cotação obtida pelo servidor e cálculo canônico datado. O cliente não pode enviar um lucro ou uma cotação marcada como oficial para falsificar o registro. Reabrir preserva o registro e refaz a cotação atual. Não cria nem altera anúncios, pedidos ou análises financeiras existentes.

## Ativação e teste

1. Subir **esta branch** em ambiente de teste. Usando o Dockerfile/Compose do repositório, o comando de início já executa `prisma migrate deploy`. Em instalação com outro comando de início, aplicar as migrations antes de habilitar o módulo.
2. Definir `RADAR_INTELLIGENCE_ENABLED=1` e reiniciar a aplicação. A variável já é repassada no Compose. O padrão é desligado; as novas rotas autenticadas respondem 404 enquanto desativadas.
3. Abrir **Concorrentes** e pesquisar o produto ou colar um anúncio completo. Conferir quantidades, marca/modelo, variação, data e fontes; selecionar até quatro ofertas e revisar correspondências.
4. Usar **Simular kits**. Informar custo unitário líquido, estoque e embalagem. As configurações disponíveis da operação preenchem imposto, outras despesas e metas. Consultar ofertas para importar identidade/categoria quando a API permitir.
5. Informar um preço de cenário se não houver amostra comparável. Confirmar pacote para estimar frete ou informar uma estimativa manual. Conferir modalidade, logística e se haverá frete grátis ao comprador em **Ajustar cotação**.
6. Alterar custo/preço e conferir recálculo. Escolher composição, salvar e reabrir o rascunho. Conferir o registro datado e repetir com outra conta.
7. Recarregar a extensão 0.11.0 se necessário e verificar a busca, produto, calculadora e monitoramento já existentes. Os arquivos em `extension/` não foram alterados nesta entrega.

## Evidência automatizada

- Base aprovada: 62 regras, 26 cenários da extensão e 8 cenários web; typecheck/build locais aprovados antes das mudanças.
- Pesquisa competitiva: CI do HEAD `8705e6f286154f838de24d31c9c72e6659460a38`, [run 40023379564](https://github.com/Brunohvg/mercado-radar/actions/runs/40023379564), aprovado: 66 regras, 26 extensão, 11 web, migrations limpas/upgrade e 41 verificações HTTP. Proteção adicional de materiais/acessórios no HEAD `2d0b5d8fc335779b1b4beff1130f126191d6406a`, [run 40023936784](https://github.com/Brunohvg/mercado-radar/actions/runs/40023936784), também aprovada.
- Kits: 77 regras e 16 cenários web passaram localmente, incluindo composições, estoque insuficiente/fracionado/desconhecido, custos por cor, pacotes Baxmann de 500/1000/2000, centavos, metas impossíveis, cotação contextual, troca de conta e falha recuperável. Capturas de kits e concorrentes em 1366, 680 e 390 px foram inspecionadas.
- O CI final também executa a suíte de extensão, pacote, typecheck/build, migrations e HTTP. Inclui teste da flag desligada e navegação da aplicação autenticada em 18 rotas em desktop/mobile, mais login e pesquisa → kit → rascunho. As capturas ficam no artefato `radar-browser-evidence` do workflow. **O resultado do HEAD final é registrado no PR; esta lista de testes não substitui o resultado desse run.**
- A comparação local da primeira etapa encontrou 12 capturas idênticas à base; cinco diferiam em campos temporais ou na aparição do botão flutuante. A geometria e os controles nativos continuaram aprovados nos 26 cenários. Isso não é uma garantia sobre todos os seletores futuros do site real.

## Cobertura e limites reais

| Área | Cobertura | Pendência |
| --- | --- | --- |
| Login, sessão, OAuth/refresh, suspensão, quotas e operações separadas | HTTP com PostgreSQL e APIs sintéticas | Conferir DevCenter e duas contas reais |
| As 17 telas anteriores e os dois módulos novos | Harnesses de componentes; smoke autenticado e screenshots no CI | Navegação renderizada não valida todas as ações de cada tela; homologação de fluxos reais continua necessária |
| Busca/produto/calculadora da extensão | 26 cenários com HTML representativo; scripts e estilos preservados | Mercado Livre real, contas e seletores atuais |
| Financeiro de kits | Regras reproduzíveis, quotes por conta, snapshot calculado no servidor | Comparar com simulador oficial e custos reais de Montovani/Baxmann |
| APIs e fontes | 401/403, 429/5xx, retry/timeout, paginação, cache e dados parciais | Permissões concretas da aplicação do cliente e disponibilidade de cada anúncio |

As páginas públicas consultadas ajudaram a verificar formatos de títulos Baxmann e canetas com refis; não confirmaram preços atuais via API nem a identidade da caneta Montovani. Não houve publicação ou edição de anúncios reais. Não foram conferidos dez produtos ou cinco pedidos reais. Não declarar o SaaS pronto para venda apenas porque o CI ficou verde.

Rascunhos pertencem ao workspace e ao contexto da conta que os criou; cenários sem conta conectada usam o contexto sem conta. A migração automática desses cenários para a primeira conta conectada não faz parte desta entrega. Ao mudar conta/contexto, a interface limpa custos e cotações anteriores para evitar mistura.

O monitoramento legado ainda possui classificação diferente do modelo público unificado; os snapshots não foram reinterpretados nem foram disparados alertas por mudança de fórmula. Fila durável, recuperação de acesso, billing, publicação na Chrome Web Store e fases posteriores continuam no plano.

## Impacto e rollback

Uma migration aditiva cria `RadarResearchDraft`. Não altera custos, vendas, pedidos ou análises existentes. Não muda OAuth, CSP, criptografia ou versões de dependências. O fallback bulk passou a ser isolado por token/conta; endpoints e consumidores antigos foram preservados.

Para desativar o piloto: definir `RADAR_INTELLIGENCE_ENABLED=0` e reiniciar. As páginas anteriores e extensão continuam disponíveis. Preservar a tabela e rascunhos ao reverter o código; não executar exclusão destrutiva para desligar o módulo. Integração real e revisão funcional/visual do usuário são os próximos critérios antes das fases seguintes.
