# Mercado Radar — Checklist Mestre de Desenvolvimento

Este checklist deve ser usado em **toda feature**, sem exceção. O objetivo é reduzir regressões, cálculos errados, migrations perigosas e decisões baseadas em dados incorretos.

---

## 0. Regra principal

Uma feature só está pronta quando:

```text
problema entendido
→ fonte de dados definida
→ regra documentada
→ banco compatível
→ implementação
→ testes
→ CI verde
→ deploy
→ smoke test real
→ evidência registrada
```

**Código compilando não significa feature pronta.**

---

## Gate de valor do produto

Antes de qualquer feature:
- [ ] melhora uma decisão de compra, preço, lucro ou capital?
- [ ] evita repetir algo que o Seller Center já resolve bem?
- [ ] reduz digitação, pesquisa manual ou uso de planilha?
- [ ] a ação resultante fica clara para o usuário?
- [ ] a feature usa dado real antes de heurística?
- [ ] se não gera decisão, deve ficar secundária ou fora do MVP.

## 1. Antes de programar

- [ ] Definir qual pergunta a feature responde.
- [ ] Definir qual decisão do usuário ela melhora.
- [ ] Confirmar que não duplica feature existente.
- [ ] Identificar dependências.
- [ ] Identificar fonte de verdade de cada campo.
- [ ] Separar dado real, estimativa e inferência.
- [ ] Definir comportamento quando dado estiver ausente.
- [ ] Definir comportamento quando API externa falhar.
- [ ] Desenhar o fluxo visual antes do código.
- [ ] Registrar a feature em `docs/FEATURES.md`.

### Matriz de confiança de dados

Use esta prioridade:

1. dado realizado da venda;
2. API oficial da conta;
3. fornecedor/catalogo;
4. dado informado pelo usuário;
5. cálculo determinístico;
6. heurística;
7. IA.

IA nunca sobrescreve silenciosamente níveis 1–5.

---

## 2. Contrato da feature

Antes do backend/UI:

- [ ] listar inputs;
- [ ] listar outputs;
- [ ] definir unidade de cada número;
- [ ] definir moeda;
- [ ] definir arredondamento;
- [ ] definir campos obrigatórios;
- [ ] definir validações;
- [ ] definir estados de erro;
- [ ] definir estados de loading;
- [ ] definir estado vazio;
- [ ] definir se a resposta pode ser cacheada;
- [ ] definir se precisa histórico.

Para cálculos financeiros, adicionar exemplos manuais esperados.

---

## 3. Banco de dados

Se houver mudança de schema:

- [ ] preferir migration aditiva;
- [ ] evitar rename/drop destrutivo sem necessidade;
- [ ] definir índices;
- [ ] definir unicidade/idempotência;
- [ ] definir relação e comportamento de delete;
- [ ] verificar compatibilidade com dados antigos;
- [ ] garantir que deploy com migration não exige intervenção manual;
- [ ] testar migration em banco limpo;
- [ ] testar migration sobre schema anterior;
- [ ] planejar rollback lógico quando migration for irreversível.

Nunca usar dados de demonstração como default de produção.

---

## 4. Integrações Mercado Livre

Para cada endpoint usado:

- [ ] validar endpoint oficial;
- [ ] validar escopo/permissão necessária;
- [ ] validar seller/user correto;
- [ ] validar moeda/site;
- [ ] validar tipo de anúncio;
- [ ] validar logística;
- [ ] tratar HTTP 401;
- [ ] tratar refresh token;
- [ ] tratar 429/rate limit;
- [ ] tratar timeout;
- [ ] tratar resposta vazia;
- [ ] não assumir campos opcionais;
- [ ] registrar erro sem expor token;
- [ ] confirmar resultado contra interface/simulador oficial em pelo menos um caso real.

### Webhooks

- [ ] responder rápido;
- [ ] persistir antes de processamento pesado;
- [ ] deduplicar;
- [ ] tornar processamento idempotente;
- [ ] validar aplicação/usuário quando possível;
- [ ] permitir retry;
- [ ] registrar status `PENDING/PROCESSED/ERROR`;
- [ ] nunca criar venda duplicada por reentrega do webhook.

---

## 5. Motor financeiro

Regra de UX/dados:
- [ ] tarifas do Mercado Livre não aparecem como inputs editáveis no fluxo principal;
- [ ] comissão, tarifa fixa e frete vêm automaticamente da API da conta conectada;
- [ ] qualquer override manual futuro deve ficar em modo avançado, identificado como exceção.

Toda alteração deve validar:

- [ ] custo líquido;
- [ ] quantidade;
- [ ] comissão variável;
- [ ] tarifa fixa;
- [ ] frete;
- [ ] custo operacional;
- [ ] valor recebido;
- [ ] lucro;
- [ ] margem;
- [ ] ROI;
- [ ] break-even;
- [ ] preço mínimo;
- [ ] custo máximo de compra.

Casos de teste obrigatórios:
- [ ] lucro positivo;
- [ ] lucro zero;
- [ ] prejuízo;
- [ ] frete zero;
- [ ] tarifa fixa;
- [ ] desconto zero;
- [ ] desconto alto;
- [ ] kit > 1;
- [ ] preço abaixo de R$79 quando aplicável;
- [ ] mudança de frete por faixa de preço.

Nunca classificar como saudável apenas porque o ML deixa mais de X% do preço.

---

## 6. Market Intelligence

Antes de usar concorrentes na decisão:

- [ ] excluir anúncios da própria conta;
- [ ] confirmar categoria;
- [ ] comparar quantidade;
- [ ] comparar modelo/tamanho;
- [ ] penalizar números divergentes;
- [ ] eliminar preços inválidos;
- [ ] consultar preço atual quando possível;
- [ ] registrar quantidade de comparáveis;
- [ ] registrar similaridade média;
- [ ] indicar quando evidência for fraca;
- [ ] evitar mínimo/máximo como única referência;
- [ ] usar P25/mediana/P75;
- [ ] salvar snapshot para auditoria.

O Fit Score não pode ser apresentado como probabilidade de venda.

---

## 7. Sales Intelligence

Antes de calcular lucro real:

- [ ] pedido pertence ao seller conectado;
- [ ] pedido não está duplicado;
- [ ] status financeiro está entendido;
- [ ] cancelamentos/estornos são tratados;
- [ ] quantidade por item está correta;
- [ ] variação/SKU está correta;
- [ ] tarifa realizada foi obtida;
- [ ] custo real de envio foi obtido;
- [ ] custo de compra tem data/vigência;
- [ ] custo operacional está definido;
- [ ] margem realizada diferencia estimativa de realizado.

Nunca misturar faturamento bruto com lucro.

---

## 8. Estoque e reposição

Antes de recomendar compra:

- [ ] estoque atual confiável;
- [ ] vendas canceladas não contam como saída;
- [ ] período da média está explícito;
- [ ] cobertura em dias está explícita;
- [ ] estoque de segurança é configurável;
- [ ] lead time do fornecedor é considerado quando disponível;
- [ ] capital necessário é mostrado;
- [ ] recomendação pode ser revisada pelo usuário.

Não apresentar demanda futura como certeza.

---

## 9. IA

Para qualquer feature de IA:

- [ ] custo zero no MVP;
- [ ] provider desacoplado;
- [ ] timeout curto;
- [ ] fallback sem IA;
- [ ] saída estruturada;
- [ ] validação de schema da resposta;
- [ ] nenhuma escrita financeira automática baseada só em IA;
- [ ] toda inferência aparece como sugestão;
- [ ] números reais continuam vindo das fontes oficiais;
- [ ] não enviar tokens/secrets ao modelo;
- [ ] minimizar dados pessoais enviados ao modelo.

---

## 10. Segurança

- [ ] secrets apenas em env;
- [ ] tokens criptografados no banco;
- [ ] nenhuma credencial em log;
- [ ] nenhum secret no frontend;
- [ ] PKCE ativo;
- [ ] OAuth state validado;
- [ ] URLs públicas resolvidas corretamente atrás de proxy;
- [ ] endpoints sensíveis exigem conta conectada;
- [ ] payload externo validado com schema;
- [ ] não confiar em IDs vindos do cliente sem validação.

---

## 11. UX e visual

- [ ] uma pergunta principal por tela;
- [ ] resultado importante visível sem tooltip;
- [ ] loading claro;
- [ ] erro claro e acionável;
- [ ] empty state;
- [ ] desktop;
- [ ] mobile;
- [ ] números formatados em BRL;
- [ ] cores seguem semântica do Design System;
- [ ] evitar campos técnicos quando podem ser preenchidos automaticamente;
- [ ] configurações avançadas ficam separadas;
- [ ] mostrar origem do dado quando relevante: API, manual, estimado.

---

## 12. Testes antes do push

- [ ] typecheck;
- [ ] build;
- [ ] testes unitários da regra;
- [ ] testes de parsing/validação;
- [ ] teste de API interna;
- [ ] testar valores extremos;
- [ ] revisar diff;
- [ ] confirmar que nenhum secret entrou no commit.

Para fórmula crítica, criar golden cases que não podem mudar sem revisão explícita.

---

## 13. CI

Nenhum deploy deve ser considerado aprovado se:

- [ ] CI ainda estiver rodando;
- [ ] CI estiver vermelho;
- [ ] build falhar;
- [ ] migration falhar;
- [ ] typecheck falhar.

Se um commit funcional depende de commits posteriores, validar o HEAD final, não apenas um commit intermediário.

---

## 14. Deploy Coolify

Antes:
- [ ] envs presentes;
- [ ] domínio correto;
- [ ] volume persistente;
- [ ] branch correta;
- [ ] auto deploy correto.

Depois:
- [ ] container app saudável;
- [ ] postgres saudável;
- [ ] migration concluída;
- [ ] `/api/health` OK;
- [ ] página carrega;
- [ ] login/OAuth funciona;
- [ ] logs sem erro recorrente.

---

## 15. Smoke test de produção

Testar pelo domínio real, não por localhost/container.

- [ ] desktop;
- [ ] mobile;
- [ ] fluxo feliz;
- [ ] erro previsível;
- [ ] refresh da página;
- [ ] OAuth retorno;
- [ ] API ML real;
- [ ] banco persistiu;
- [ ] novo deploy não apagou dados.

Para feature financeira, comparar pelo menos um produto com o simulador oficial.

---

## 16. Observabilidade

Toda integração/job crítico deve registrar:

- [ ] início;
- [ ] fim;
- [ ] duração;
- [ ] itens lidos;
- [ ] itens salvos;
- [ ] falha;
- [ ] retry;
- [ ] referência externa sem secret.

Criar alertas apenas quando houver ação possível.

---

## 17. Definition of Done

Uma feature recebe ✅ somente quando:

- [ ] código final está no HEAD;
- [ ] documentação atualizada;
- [ ] CI do HEAD verde;
- [ ] migration aplicada;
- [ ] deploy saudável;
- [ ] smoke test realizado;
- [ ] resultado real conferido;
- [ ] nenhuma regressão visual óbvia;
- [ ] nenhuma regressão de dados;
- [ ] próxima dependência registrada.

Se faltar qualquer item crítico, marcar como **implementado / aguardando validação**, nunca como concluído.

---

# Checklist por fase do produto

## Gate A — Market Intelligence

- [ ] Ilhós: categoria correta.
- [ ] Ilhós: tarifa compatível com ML.
- [ ] Ilhós: frete compatível com ML.
- [ ] Ilhós: concorrentes realmente comparáveis.
- [ ] Ilhós: mediana plausível.
- [ ] Arame: repetir todos os testes.
- [ ] revisar heurística de similaridade.
- [ ] revisar Fit Score após dados reais.

**Só depois avançar o foco principal para Sales Intelligence.**

## Gate B — Sales Intelligence

- [ ] import inicial de pedidos.
- [ ] webhook de nova venda.
- [ ] deduplicação.
- [ ] pedido + itens.
- [ ] envio.
- [ ] tarifas realizadas.
- [ ] custo do SKU.
- [ ] lucro realizado.
- [ ] cancelamento.
- [ ] dashboard.
- [ ] comparação manual de 5 vendas.

## Gate C — Inventory Intelligence

- [ ] estoque.
- [ ] saída líquida.
- [ ] cobertura.
- [ ] reposição.
- [ ] lead time.
- [ ] capital.
- [ ] teste com produtos reais.

## Gate D — Pricing Intelligence

- [ ] snapshots históricos.
- [ ] alerta de margem.
- [ ] posição de mercado.
- [ ] sugestão de reprecificação.
- [ ] sem alteração automática inicialmente.

## Gate E — IA

- [ ] provider gratuito/self-hosted.
- [ ] fallback.
- [ ] enriquecimento de entrada.
- [ ] explicação de decisão.
- [ ] avaliação de qualidade.
- [ ] nenhum número crítico inventado.


## Smart Product Discovery

- [ ] nome simples encontra produto relevante;
- [ ] EAN/GTIN encontra produto de catálogo correto;
- [ ] categoria preenchida automaticamente;
- [ ] faixa de preço plausível;
- [ ] dimensões só são preenchidas quando há amostra;
- [ ] confiança da estimativa é exibida;
- [ ] análise automática funciona sem exigir dimensões quando a inferência é suficiente;
- [ ] fallback manual é claro quando não há dados;
- [ ] testar no mobile.

## Opportunity Radar

- [ ] tendências semanais carregam;
- [ ] candidatos têm preço mediano plausível;
- [ ] teto de compra usa tarifa/frete reais da conta;
- [ ] candidato abre diretamente no analisador;
- [ ] tendência não é rotulada como venda realizada;
- [x] ranking de mais vendidos por categoria integrado como evidência;
- [ ] validar correspondência do ranking com casos reais.


## Reforma UX por rotas

- [x] home não empilha todos os módulos;
- [x] análise em rota própria;
- [x] oportunidades em rota própria;
- [x] produtos em rota própria;
- [x] vendas em rota própria;
- [x] integrações em rota própria;
- [ ] smoke test mobile em iPhone/Android;
- [ ] confirmar fechamento do menu após navegação.

## Scanner EAN/GTIN

- [x] câmera traseira;
- [x] formatos EAN/UPC/Code128;
- [x] preencher busca após leitura;
- [x] fallback manual quando BarcodeDetector não existir;
- [ ] testar Safari/iOS;
- [ ] testar Chrome/Android.

## Lucro realizado

- [x] resolver shipment pela order quando necessário;
- [x] consultar custo final do vendedor em /shipments/{id}/costs;
- [x] calcular lucro e margem apenas quando custos estiverem completos;
- [x] distribuir lucro por item proporcionalmente à receita;
- [ ] comparar manualmente 5 pedidos com Mercado Livre.

## Product Health

- [x] vendas 30d;
- [x] velocidade diária;
- [x] cobertura em dias;
- [x] margem realizada quando disponível;
- [x] ações REPOR / ATENÇÃO / MANTER / PARAR / VINCULAR CUSTO;
- [x] quantidade inicial sugerida para 21 dias;
- [x] capital necessário quando custo está disponível;
- [ ] validar regra com produtos reais;
- [ ] adicionar lead time antes de considerar recomendação concluída.
