# Plano de testes e registro de validação

Data: 25/11/2026. Base técnica `7fdfa333474f4254ffd3e0daa44f3193c145392c`. A entrega atual altera documentação/evidências e protótipo isolado. Não representa implementação das fases 6–9.

## Executado na auditoria

| Verificação | Resultado | Limite |
| --- | --- | --- |
| Branches/HEAD | Apenas main/homolog; SHA fixado; homolog 38 à frente | Snapshot da consulta, não trava contra alterações posteriores |
| Lockfile e dependências | Instalação concluída; versões conferidas | Sem atualizar versões |
| Prisma generate | Aprovado, client 7.10.0 | Não aplica migrations |
| `npm run typecheck` na base | Aprovado | Runtime Node 24.22.3 |
| Testes de regras na base | **183 passaram; 0 falhas** | Não detectam todas as divergências da nova política de produto |
| `npm run build` na base | Aprovado | Configuração fictícia de build; sem DB comercial |
| CI remoto da base | [Sucesso](https://github.com/Brunohvg/mercado-radar/actions/runs/45736103637) | Aquele SHA; não um futuro commit |
| Reproduções FIN-01/02 | Confirmadas; JSON em evidencias | Cenários determinísticos fictícios, não tarifas de produto real |
| Navegação Cargoos Free | Autenticada; áreas/limites documentados | Trial/Pro não ativados |
| Calculadora pública Cargoos | Exemplo fictício conferido | Não é validação da extensão ou tarifa por categoria |
| Radar publicado | Navegação autenticada de leitura; R02/R03 | SHA implantado não exposto/verificado; sem gravações comerciais |
| Capturas | Recortadas e revisadas para privacidade | Não há captura completa de cada estado/tela |
| Instalação Chromium local 1.64.1 | Download do binário falhou no ambiente | Não reduzir versões, desativar proteção ou declarar suíte browser local aprovada |
| `npm run typecheck` e `npm run build` após a criação dos documentos/protótipo | Aprovados novamente | Código operacional e lockfile preservados; sem banco comercial |
| Verificação isolada do protótipo | Sintaxe, 11 geradores, ausência/zero, prejuízo e metas simultâneas aprovados | Não executa eventos nem layout em browser |
| Pranchas visuais | 14 composições estáticas geradas e revisadas | Documento renderizado; não captura de navegador |
| Prévia interativa no Cloud Browser | URL de arquivo local recusada pela política de protocolos | Sem contorno; QA interativo/responsivo pendente |

A matriz de validação final do protótipo e a revisão documental são registradas em `prototipos/VALIDACAO.md` e `APROVACAO.md`. Não transferir sucesso de um componente/harness para todas as páginas reais.

## Gates funcionais do motor financeiro

| Grupo | Casos essenciais | Resultado esperado |
| --- | --- | --- |
| Conhecimento | null, vazio, zero confirmado, hipótese, cotação e realizado | Ausência não vira zero; subtotais/resultado identificados |
| Tarifa | Total oficial já inclui fixa; total zero explícito; falha/restrição | Sem cobrança duplicada; ausência preservada |
| Frete | Comprador paga e vendedor pode ter custo; Full/Flex; pacote e envio compartilhado | Custo correto por conta; sem inferência por preço |
| Precificação | Mudança de faixa, categoria/logística, meta inviável | Recotação e revalidação em centavos |
| Metas | Margem/ROI isolados e simultâneos; caso FIN-02 | Menor teto; meta limitante visível |
| Precisão | Peça R$0,024 em pacote de 1.000, kit, sobra e desconto | Total reconciliado; nenhuma perda por arredondar peça antes do total |
| Capital | MOQ, múltiplo, aquisição, operação e reserva | Plano cabe no capital sem ocultar componentes |
| Resultado | Ads, desconto, cancelamento, devolução, chargeback e competência | Contribuição distinta de líquido; pendência preservada |
| Consistência | Web, servidor, extensão e consumidores do sourcing | Mesmo contrato/versão/resultado para mesma entrada |

Fixtures canônicas são de domínio, independentes de JSX/estrutura interna. Acrescentar testes sobre divergências reais e invariantes, sem testes que apenas repetem a implementação.

## Fornecedores e importação

Testar papel provável versus comprovado; fabricante/representante/distribuidor/varejo; CPF sim/não/desconhecido; CNPJ numérico/alfanumérico, inválido e consulta indisponível; nota/contato sem prova; validade vencida; preço por peça/pacote; faixa de quantidade; incompatibilidade de marca/material/medida; equivalência manual; mesmo domínio com empresas distintas.

CSV/XLSX: separador decimal e milhar, datas, códigos com zeros à esquerda, fórmulas/células maliciosas, arquivo muito grande, linhas duplicadas, preço ausente, unidade ambígua e revisão parcial. PDF: tabelas multipágina, OCR incorreto, texto mesclado e associação do valor ao produto. Guardar referência de linha/página e exigir confirmação de correspondência.

Provedores: timeout, 401/403/429/5xx, resposta incompleta, grounding sem fonte, contato que não aparece na página, URL interna/redirect/DNS alterado, custo excedido e fallback manual. Não consultar serviços reais em loop para simular falha.

## Segurança/isolamento

Dois workspaces de teste: tentar ler/alterar fornecedor, cotação, arquivo, oportunidade, pedido, rascunho e observação do outro; IDs cruzados também nas relações. Sessão expirada, usuário/workspace inativo, token revogado, refresh concorrente, quota no limite, mutação cross-origin e referência de conta não pertencente ao usuário.

Upload deve validar tipo/tamanho, nomes/caminhos e acesso ao arquivo; logs sem dados privados. Rate limit deve funcionar entre réplicas. Teste dirigido de SSRF sem acessar rede interna real. Nenhuma ampliação de escopo OAuth ou permissão é pressuposta pela auditoria.

## Visual e acessibilidade

Todas as páginas afetadas: carregando, vazio, completo, parcial, erro, permissão, quota e dado vencido. Conferir 320/390/768/1440px, zoom 200%, foco, teclado, contraste, texto longo, moeda com centavos, números negativos e estados sem cor. Em tabela, diferenciar overflow local de overflow global.

Extensão: busca/produto/catálogo, variações, anúncio próprio/terceiro, login/guest, várias abas, navegação dinâmica, resposta atrasada, conta trocada, painel estreito, recolher/restaurar e controles ML livres. Fonte/contexto devem acompanhar cada número.

## CI e regressão

Preservar os gates existentes: generate, typecheck, regras, sintaxe da extensão, harnesses web/extensão, pacote, build, migrations em banco limpo e upgrade com dados, isolamento/autenticação HTTP. Banco de QA isolado. Nenhum teste desativado, assert removido ou migration marcada como aplicada artificialmente.

Para o commit documental: typecheck/build exigidos por AGENTS, diff/links/assets e inspeção do protótipo. Não executar migrations comerciais ou nova implantação de infraestrutura só porque documentos mudaram.

## Homologação real futura

1. Fixar release SHA/protocolo em Coolify; confirmar saúde e versão implantada.
2. Usar conta(s) autorizadas e dez anúncios representativos: próprio/terceiro, catálogo/tradicional, kit/unidade, restrito/disponível, Full/Flex quando houver acesso.
3. Conferir cinco pedidos com fonte oficial/simulador/relatório, incluindo envio compartilhado e custos faltantes; estorno só se houver amostra autorizada.
4. Completar produto → fornecedor → cotação verdadeira → cálculo → plano, sem compra nem publicação real durante QA.
5. Testar duas operações reais distintas ou ambiente equivalente autorizado; registrar o limite se indisponível.
6. Restaurar backup em ambiente isolado e verificar reversão; não afetar banco publicado.
7. Aprovação técnica/visual explícita antes de main; validação comercial conforme roadmap.

Cada caso registra data, referência mascarada, fonte, parâmetros, resultado esperado/obtido, diferença, artefato e responsável. Ausência de amostra ou permissão é pendência, não aprovação.
