# Etapa 4: marca e identidade

**Nome:** Vidalys Radar (mantido; coerente com Vidalys Flow, Pay e Fideliza e não limita a Mercado Livre).
**Assinatura:** Inteligência para revender. **Promessa:** Encontre o produto, encontre o fornecedor, descubra sua margem.
Busca de anterioridade no INPI ainda não feita.

## Paleta Sinal

| Papel | Cor | Uso |
| --- | --- | --- |
| Grafite | `#16181D` | Barra lateral, botões principais, texto |
| Âmbar | `#F5A524` | "Blip" do radar: próxima ação, aba ativa, destaque. Nunca em texto sobre fundo claro |
| Âmbar escuro | `#B45309` | Links, títulos de seção, botões da extensão (contraste AA sobre branco) |
| Areia | `#FAF8F5` | Fundo |
| Pedra | `#6B7280` | Texto secundário |
| Verde `#15803D` / Vermelho `#B93A2B` | Só margem positiva e risco/prejuízo |

Por que: petróleo/menta é o visual padrão de fintech, e a marca verde se confundia com "dá lucro" (o próprio `DESIGN_SYSTEM.md` dizia "verde só significa saudável").

## O que mudou

- Tokens do painel (`app/styles/tokens.css`) e da extensão (`extension/ui/tokens.css`).
- Cores fixas da extensão (`sidepanel.css`, `content.js`, `product-analysis.js`) remapeadas: teal da marca → âmbar escuro, neutros esverdeados → areia/grafite. Verdes semânticos (lucro, demanda alta) preservados.
- Novo símbolo: quadrado grafite com arcos de radar e um ponto âmbar (`public/brand/mark.svg`, `logo.svg`, `social-card.svg`, `app/icon.svg`, ícones PNG da extensão).
- Nome "Mercado Radar" → "Vidalys Radar" em telas, manifest, metadados e instaladores. Pastas, domínio e identificadores técnicos não mudaram.
