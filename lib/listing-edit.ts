// Regras da edição de anúncio feita pelo Radar. Puro para ser testável.
// O vendedor está no controle, mas o Radar barra erro de digitação e avisa
// quando o preço fica abaixo do piso de margem.

export type ListingSnapshot = {
  price: number;
  availableQuantity: number;
  status: string;
  variationIds: Array<string | number>;
};

export type ListingChange = { price?: number; availableQuantity?: number; status?: "active" | "paused" };

export function planListingEdit(input: {
  live: ListingSnapshot;
  change: ListingChange;
  floor: number | null;
  allowBelowFloor: boolean;
}): { error: string; status: number; floor?: number } | { body: Record<string, unknown>; summary: string[] } {
  const { live, change } = input;
  const body: Record<string, unknown> = {};
  const summary: string[] = [];
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (live.status !== "active" && live.status !== "paused")
    return { error: "Só dá para editar anúncio ativo ou pausado. Este está encerrado ou em revisão no Mercado Livre.", status: 409 };

  if (change.price != null && Math.abs(change.price - live.price) >= 0.005) {
    const ratio = change.price / live.price;
    if (!(change.price > 0) || ratio < 0.2 || ratio > 5)
      return { error: `De ${brl(live.price)} para ${brl(change.price)} parece erro de digitação. Confira o valor.`, status: 422 };
    if (input.floor != null && change.price < input.floor && !input.allowBelowFloor)
      return { error: `${brl(change.price)} fica abaixo do seu piso de margem (${brl(input.floor)}).`, status: 422, floor: input.floor };
    if (live.variationIds.length) body.variations = live.variationIds.map((id) => ({ id, price: change.price }));
    else body.price = change.price;
    summary.push(`preço ${brl(live.price)} → ${brl(change.price)}`);
  }

  if (change.availableQuantity != null && change.availableQuantity !== live.availableQuantity) {
    if (live.variationIds.length)
      return { error: "Este anúncio tem variações: o estoque é por variação. Altere no Mercado Livre por enquanto.", status: 422 };
    body.available_quantity = change.availableQuantity;
    summary.push(`estoque ${live.availableQuantity} → ${change.availableQuantity}`);
  }

  if (change.status && change.status !== live.status) {
    if (change.status === "active" && (change.availableQuantity ?? live.availableQuantity) <= 0)
      return { error: "Para reativar, o anúncio precisa ter estoque.", status: 422 };
    body.status = change.status;
    summary.push(change.status === "paused" ? "pausar anúncio" : "reativar anúncio");
  }

  if (!summary.length) return { error: "Nada mudou em relação ao que está no Mercado Livre.", status: 400 };
  return { body, summary };
}
