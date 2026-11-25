// Reaproveita custo conhecido entre anúncios do mesmo produto: kits (Kit 2 × Kit 4),
// pacotes (500 × 1.000 unidades), cores e anúncios repetidos do mesmo catálogo.
// Puro e conservador: só sugere, nunca grava, e diz de onde veio cada número.

export type CostFamilyItem = {
  mlItemId: string;
  title: string;
  catalogProductId?: string | null;
  userProductId?: string | null;
  /** Custo líquido por anúncio vendido (já com desconto), quando cadastrado. */
  netCost: number | null;
  /** Preço de venda; custo sugerido acima dele é descartado como erro. */
  price?: number | null;
};

export type CostSuggestion = {
  supplierPrice: number;
  fromMlItemId: string;
  fromTitle: string;
  fromCost: number;
  fromQuantity: number;
  quantity: number;
  match: "MESMO_PRODUTO" | "MESMA_FAMILIA";
  reason: string;
};

const COLORS = new Set([
  "preto", "preta", "branco", "branca", "prata", "dourado", "dourada", "ouro", "azul", "vermelho", "vermelha",
  "verde", "amarelo", "amarela", "rosa", "pink", "cinza", "grafite", "bronze", "niquel", "niquelado", "niquelada",
  "roxo", "roxa", "lilas", "laranja", "marrom", "bege", "transparente", "cristal", "colorido", "colorida", "sortido",
  "sortida", "sortidas", "sortidos", "cobre", "inox", "fosco", "fosca", "brilhante", "envelhecido", "envelhecida",
]);
const STOP = new Set([
  "de", "da", "do", "das", "dos", "para", "p", "com", "c", "em", "e", "a", "o", "as", "os", "no", "na", "n", "nº", "n°",
  "kit", "kits", "pacote", "pacotes", "pct", "pcts", "caixa", "cx", "unidades", "unidade", "unid", "und", "un", "uni",
  "pcs", "pecas", "peca", "pç", "pçs", "jogo", "conjunto", "lote", "x", "novo", "nova", "original", "promocao", "oferta",
]);

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const toInt = (raw: string) => Number(raw.replace(/\./g, ""));

/** Quantas unidades do item-base vão em um anúncio (Kit 2 = 2, Pacote 1.000 un. = 1000). */
export function packQuantity(title: string) {
  return readPack(title).qty;
}

/** Quantidade e se ela veio escrita no título (sem número, 1 é só suposição). */
export function readPack(title: string) {
  const t = strip(title);
  const kit = t.match(/\b(?:kit|jogo|lote|conjunto)\s*(?:c\/|com|de)?\s*(\d{1,4}(?:\.\d{3})?)\b(?!\s*(?:mm|cm|m|g|kg|ml|l|x|v|w)\b)/);
  const units = t.match(/(\d{1,3}(?:\.\d{3})+|\d{1,5})\s*(?:unidades|unidade|unid|und|un|pcs|pecas|pcs\.|pçs|peças)\b/);
  const pack = t.match(/\b(?:pacote|pct|caixa|cx|embalagem)\s*(?:c\/|com|de)?\s*(\d{1,3}(?:\.\d{3})+|\d{1,5})\b/);
  const kitN = kit ? toInt(kit[1]) : null;
  const unitN = units ? toInt(units[1]) : pack ? toInt(pack[1]) : null;
  if (kitN && unitN && kitN !== unitN && kitN <= 20) return { qty: kitN * unitN, explicit: true };
  const qty = unitN ?? kitN;
  return qty ? { qty, explicit: true } : { qty: 1, explicit: false };
}

/** Palavras que identificam o produto, sem quantidade, cor e palavras de embalagem. */
export function familyTokens(title: string) {
  const t = strip(title)
    .replace(/(\d{1,3}(?:\.\d{3})+|\d{1,5})\s*(?:unidades|unidade|unid|und|un|pcs|pecas|pçs)\b/g, " ")
    .replace(/\b(?:kit|jogo|lote|conjunto|pacote|pct|caixa|cx)\s*(?:c\/|com|de)?\s*\d[\d.]*\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ");
  return new Set(t.split(" ").filter((w) => w && !STOP.has(w) && !COLORS.has(w)));
}

function similarity(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Sugere custo para cada item sem custo a partir de um parente com custo. */
export function suggestCosts(items: CostFamilyItem[], minSimilarity = 0.75) {
  const known = items
    .filter((i) => i.netCost != null && i.netCost > 0)
    .map((i) => ({ ...i, ...readPack(i.title), tokens: familyTokens(i.title) }));
  const out = new Map<string, CostSuggestion>();
  for (const item of items) {
    if (item.netCost != null && item.netCost > 0) continue;
    const { qty, explicit } = readPack(item.title);
    const tokens = familyTokens(item.title);
    let best: { k: (typeof known)[number]; match: CostSuggestion["match"]; score: number } | null = null;
    for (const k of known) {
      if (k.mlItemId === item.mlItemId) continue;
      const same =
        (item.catalogProductId && item.catalogProductId === k.catalogProductId) ||
        (item.userProductId && item.userProductId === k.userProductId);
      const score = same ? 2 : tokens.size >= 2 && k.tokens.size >= 2 ? similarity(tokens, k.tokens) : 0;
      if (score < minSimilarity) continue;
      // Só escala custo quando as duas quantidades estão escritas no título.
      if (k.qty !== qty && !(explicit && k.explicit)) continue;
      // Empate: prefere o parente com a mesma quantidade (menos conta, menos erro).
      const better = !best || score > best.score || (score === best.score && k.qty === qty && best.k.qty !== qty);
      if (better) best = { k, match: same ? "MESMO_PRODUTO" : "MESMA_FAMILIA", score };
    }
    if (!best) continue;
    const { k, match } = best;
    const supplierPrice = round2((k.netCost! / k.qty) * qty);
    if (!(supplierPrice > 0)) continue;
    if (item.price != null && item.price > 0 && supplierPrice >= item.price) continue;
    const scale = k.qty === qty ? "mesma quantidade" : `${brl(k.netCost!)} ÷ ${k.qty} × ${qty}`;
    out.set(item.mlItemId, {
      supplierPrice,
      fromMlItemId: k.mlItemId,
      fromTitle: k.title,
      fromCost: k.netCost!,
      fromQuantity: k.qty,
      quantity: qty,
      match,
      reason: `${match === "MESMO_PRODUTO" ? "Mesmo produto do catálogo" : "Mesma família"} de “${k.title}” (${scale})`,
    });
  }
  return out;
}
