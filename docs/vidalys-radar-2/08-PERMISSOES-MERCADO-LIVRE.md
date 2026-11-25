# 08 · Como liberar as permissões do Mercado Livre para o Vidalys Radar

Data: 25/11/2026. O ambiente de desenvolvimento não consegue abrir a documentação oficial do Mercado Livre (o servidor recusa acesso automático). Este guia junta a documentação oficial do Mercado Libre Global Selling (atualizada em 15/01/2026), guias de integradores (ERPflex) e o que o código do Radar já faz. Os nomes exatos dos botões podem variar: confira na tela.

## Resumo em 6 passos
1. Entre em **developers.mercadolivre.com.br** com a **conta principal** do Mercado Livre (titular ou administrador). Autorização feita por **operador ou colaborador é inválida**.
2. Se for o primeiro acesso, o Mercado Livre pede o **documento do responsável** e o botão **Vincular**.
3. **Criar nova aplicação** (passo a passo abaixo).
4. Marque as **permissões funcionais** da tabela da seção 3.
5. Copie **APP ID** e **Client Secret** para o Coolify e faça deploy.
6. No Radar, em **Integrações**, conecte a conta. Depois clique em **Verificar acesso às APIs**, que testa cada permissão uma a uma.

## 1. Criar a aplicação
| Campo | O que colocar |
|---|---|
| Nome | Vidalys Radar (tem que ser único no Mercado Livre) |
| Nome curto | vidalys-radar |
| Descrição (até 150 caracteres) | "Análise de margem, mercado e fornecedores para a sua loja. Só leitura, exceto quando você pedir para publicar." Aparece para quem autoriza. |
| Logo | public/brand/mark.svg exportado em PNG |
| **URI de redirect** | `https://radar.optarys.com.br/api/integrations/mercadolivre/callback`, **exatamente igual**, sem barra no fim e sem parâmetros |
| **PKCE** | **Ligar.** O Radar já envia `code_challenge` S256 |
| **Escopos** | `read`, `offline_access` e `write`. O Radar pede os três; o `write` só é usado se `RADAR_ENABLE_PUBLISHING=true`, que publica sempre pausado |
| Tópicos / URL de notificações | Pode deixar sem tópicos por enquanto. O Radar ainda não usa notificações. Quando usar: `items`, `questions`, `orders_v2` |
| Termos | "Aceito os termos e condições" |

No Coolify:
```
MERCADO_LIVRE_CLIENT_ID=<APP ID>
MERCADO_LIVRE_CLIENT_SECRET=<Client Secret>
MERCADO_LIVRE_REDIRECT_URI=https://radar.optarys.com.br/api/integrations/mercadolivre/callback
```

## 2. Tokens (o Radar já trata)
- O access token vale algumas horas (a documentação oficial fala em 6 h, e o exemplo mostra 3 h). O refresh token vale 6 meses e é de **uso único**: o Radar renova com trava por conta.
- O token cai se: você trocar a senha, gerar novo Client Secret, revogar o app, ou passar 4 meses sem uso. Nesses casos, **reconecte** no Radar.
- **Mudou permissões no DevCenter? Desconecte e conecte de novo no Radar**, para gerar uma autorização nova com as permissões novas.

## 3. Permissões funcionais: o que marcar
| Permissão no DevCenter | Acesso | O que libera no Radar | Teste em "Verificar acesso" |
|---|---|---|---|
| **Usuários** | leitura (padrão) | conta conectada, reputação pública de vendedores | Conta e autorização · Reputação pública |
| **Publicação e sincronização** | leitura (escrita só se for publicar) | seus anúncios, preços e **faixas por quantidade**, atributos, ficha da categoria | Anúncios da sua conta · Preços e faixas |
| **Métricas do negócio** | leitura | **visitas** (base da faixa de vendas estimada) | Visitas da sua conta · Visitas por anúncio |
| **Comunicações pré e pós-venda** | leitura | **perguntas dos compradores** | Perguntas dos compradores |
| **Vendas e envios** | leitura | pedidos, frete realizado, lucro real | Pedidos · Custo de envio |
| **Publicidade de produtos** | leitura | Product Ads (só se a conta é anunciante) | Product Ads |
| Faturamento, Promoções, Mensagens, Reclamações | não precisa agora | — | — |

Opiniões (`/reviews/item`), categorias e tendências são dados públicos de leitura: não costumam exigir permissão extra, mas o teste mostra se o seu app tem acesso.

## 4. Como ler o "Verificar acesso às APIs"
| Estado | Significado | O que fazer |
|---|---|---|
| Disponível | a consulta passou | nada |
| Reconectar (401) | autorização expirada ou revogada | conectar de novo |
| **Restrito (403)** | permissão funcional faltando, ou política do Mercado Livre (`PA_UNAUTHORIZED_RESULT_FROM_POLICIES`) | marcar a permissão da tabela, salvar, **reconectar**. Se continuar 403, é política do ML para o app, e reconectar não resolve |
| Limite (429) | muitas consultas | esperar |
| Não testado | a conta não tem anúncio ou pedido para servir de exemplo | não prova falta de permissão |

## 5. Limites que nenhuma permissão libera
- Pedidos, visitas privadas, estoque e dados pessoais de **outros vendedores**: o token só abre os dados privados da conta que autorizou.
- A **busca ampla** `/sites/MLB/search?q=` responde 403 para apps desde 2025. Não é falta de permissão. O Radar usa a busca de catálogo e os anúncios que você vê na página, pela extensão.
- Visitas de anúncios de concorrentes: o teste usa o seu anúncio. Se o ML restringir para terceiros, a faixa de vendas some e o painel volta a dizer "sem período". Nunca aparece zero.

## 6. Checklist de homologação (com a sua conta)
- [ ] App criado com PKCE e a URI exata
- [ ] Permissões da seção 3 marcadas
- [ ] Variáveis no Coolify e deploy
- [ ] Conectar no Radar e clicar em "Verificar acesso às APIs"
- [ ] Me mandar o print do resultado: eu ajusto o que estiver restrito
- [ ] Abrir um anúncio com a extensão e conferir: faixa de vendas, aba Fornecedor, sinais do anúncio

Fontes: [Global Selling: autenticação e autorização (15/01/2026)](https://global-selling.mercadolibre.com/devsite/authentication-and-authorization-global-selling), [Global Selling: gerenciar aplicação](https://global-selling.mercadolibre.com/devsite/application-manager-gs), [ERPflex: obtendo permissão para integração](https://docsnew.erpflex.com.br/obtendo-permissao-para-integracao-no-mercado-livre/), [Mercado Livre: permissões funcionais](https://developers.mercadolivre.com.br/pt_br/permissoes-funcionais) (não pôde ser aberta daqui), `docs/MERCADO_LIVRE_API_AUDIT.md`.
