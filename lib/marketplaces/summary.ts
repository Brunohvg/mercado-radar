/** Resumo curto dos sinais do anúncio para telas pequenas (painel da extensão). */
import type { ListingInsights } from "@/lib/marketplaces/types";

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function summarizeInsights(insights: ListingInsights | null): Array<{ label: string; value: string }> {
  if (!insights) return [];
  const rows: Array<{ label: string; value: string }> = [];
  const price = insights.price.data;
  if (price?.tiers.length) {
    const t = price.tiers[0];
    rows.push({
      label: "Compra em volume",
      value: `${money(t.unitPrice)} cada a partir de ${t.minUnits}${t.businessOnly ? " (só CNPJ)" : ""}${price.tiers.length > 1 ? ` · +${price.tiers.length - 1} faixa(s)` : ""}`,
    });
  } else if (price) rows.push({ label: "Compra em volume", value: "anúncio não publica preço por quantidade" });
  const seller = insights.seller.data;
  if (seller)
    rows.push({
      label: "Vendedor",
      value: [seller.nickname, seller.medal, seller.state].filter(Boolean).join(" · ") || "sem reputação informada",
    });
  const questions = insights.questions.data;
  if (questions?.topics.length)
    rows.push({
      label: "Compradores perguntam",
      value: questions.topics.slice(0, 3).map((t) => t.label.toLowerCase()).join(", "),
    });
  const reviews = insights.reviews.data;
  if (reviews?.average != null) rows.push({ label: "Opiniões", value: `nota ${reviews.average.toLocaleString("pt-BR")} em ${reviews.total}` });
  const category = insights.category.data;
  if (category?.requiredAttributes.length)
    rows.push({
      label: "Peça ao fornecedor",
      value: category.requiredAttributes.map((a) => a.name).slice(0, 4).join(", "),
    });
  return rows;
}
