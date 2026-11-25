// Travas das ações do Piloto. Puras para teste; o servidor sempre recalcula
// e aplica estas regras, mesmo que a tela já tenha conferido.

const CONTACT = [
  { re: /https?:\/\/|www\.|\.com(\.br)?\b/i, why: "link" },
  { re: /[\w.+-]+@[\w-]+\.[\w.]+/, why: "e-mail" },
  { re: /\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/, why: "telefone" },
  { re: /whats(\s?app)?\b|wpp|zap\b|instagram|insta\b|telegram/i, why: "contato fora do Mercado Livre" },
];

/** O Mercado Livre proíbe dados de contato nas respostas; também limita o tamanho. */
export function answerProblems(text: string): string[] {
  const problems: string[] = [];
  const clean = text.trim();
  if (clean.length < 2) problems.push("A resposta está vazia.");
  if (clean.length > 2000) problems.push("A resposta passa de 2.000 caracteres.");
  for (const rule of CONTACT) if (rule.re.test(clean)) problems.push(`Tire o ${rule.why}: o Mercado Livre não permite.`);
  return problems;
}

export function buildAnswerPrompt(input: {
  question: string;
  title: string;
  price: number | null;
  stock: number | null;
  attributes: Array<{ name: string; value: string }>;
  previous: Array<{ question: string; answer: string }>;
}) {
  const facts = [
    `Produto: ${input.title}`,
    input.price != null ? `Preço: R$ ${input.price.toFixed(2).replace(".", ",")}` : null,
    input.stock != null ? `Estoque disponível: ${input.stock} un.` : null,
    ...input.attributes.slice(0, 30).map((a) => `${a.name}: ${a.value}`),
  ].filter(Boolean);
  const history = input.previous
    .slice(0, 8)
    .map((p) => `P: ${p.question}\nR: ${p.answer}`)
    .join("\n\n");
  return [
    "Você escreve respostas de vendedor no Mercado Livre Brasil, em português, curtas e cordiais.",
    "Regras: responda só com o que está nos dados abaixo. Se o dado não estiver aqui, diga que vai confirmar e não invente.",
    "Nunca inclua telefone, e-mail, link, WhatsApp ou redes sociais. Não prometa prazo de entrega nem desconto.",
    "Comece com 'Olá!' e termine com 'Estamos à disposição.' Máximo de 400 caracteres. Devolva só o texto da resposta.",
    "",
    "DADOS DO ANÚNCIO",
    ...facts,
    history ? "\nRESPOSTAS ANTERIORES DESTE ANÚNCIO (siga o mesmo tom)\n" + history : "",
    "\nPERGUNTA DO COMPRADOR",
    input.question,
  ].join("\n");
}

/**
 * Trava de preço: nunca abaixo do piso de margem e nunca um salto grande
 * por engano (fora de 70% a 150% do preço atual).
 */
export function priceGuard(input: { current: number; proposed: number; floor: number | null }): string | null {
  if (!Number.isFinite(input.proposed) || input.proposed <= 0) return "Preço inválido.";
  if (Math.round(input.proposed * 100) !== input.proposed * 100 && Math.abs(Math.round(input.proposed * 100) - input.proposed * 100) > 1e-6)
    return "Use no máximo dois centavos.";
  if (input.floor == null) return "Sem custo e tarifa conhecidos não há piso de margem. Informe o custo antes.";
  if (input.proposed < input.floor - 0.005) return `Abaixo do piso de margem (R$ ${input.floor.toFixed(2).replace(".", ",")}).`;
  if (input.current < 79 && input.proposed >= 79)
    return "A partir de R$ 79 o frete grátis passa a ser seu e a conta muda. Confira no simulador antes de subir tanto.";
  if (input.proposed < input.current * 0.7 || input.proposed > input.current * 1.5)
    return "Mudança maior que 30% para baixo ou 50% para cima. Faça pelo Mercado Livre se for intencional.";
  if (Math.abs(input.proposed - input.current) < 0.005) return "O preço já é esse.";
  return null;
}
