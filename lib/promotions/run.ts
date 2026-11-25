import { getPromotionItems, getSellerPromotions, type MlRawPromotion } from "@/lib/mercado-livre";
import { economicsFor } from "@/lib/pilot/briefing";
import { loadPilotData, PILOT_DAYS } from "@/lib/pilot/load";
import { evaluateInvite, sortInvites, type PromotionInvite } from "@/lib/promotions/evaluate";
import { ML_FREE_SHIPPING_THRESHOLD } from "@/lib/hunter/rank";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Convites de promoção abertos para os anúncios do vendedor, com o lucro em cada um. */
export async function loadPromotionInvites(input: { accessToken: string; sellerId: string; workspaceId: string; maxPromotions?: number }) {
  const [promotions, data] = await Promise.all([
    getSellerPromotions({ accessToken: input.accessToken, userId: input.sellerId }),
    loadPilotData({ workspaceId: input.workspaceId, sellerId: input.sellerId }),
  ]);
  const open = promotions
    .filter((p): p is MlRawPromotion & { id: string; type: string } => Boolean(p.id && p.type))
    .filter((p) => !p.status || ["started", "pending"].includes(p.status))
    .slice(0, input.maxPromotions ?? 12);
  const products = new Map(data.products.map((p) => [p.mlItemId, p]));
  const account = economicsFor(data.sales, PILOT_DAYS);
  const bigSales = data.sales.filter((s) => s.unitPrice >= ML_FREE_SHIPPING_THRESHOLD);
  const accountShipping = economicsFor(bigSales, PILOT_DAYS).shippingPerUnit;
  const notes: string[] = [];
  const invites: PromotionInvite[] = [];
  const failed: string[] = [];

  for (const promo of open) {
    const items = await getPromotionItems({ accessToken: input.accessToken, promotionId: promo.id, promotionType: promo.type, status: "candidate" }).catch(() => {
      failed.push(promo.name ?? promo.id);
      return [];
    });
    for (const item of items) {
      const id = String(item.id ?? "").toUpperCase();
      const product = products.get(id);
      if (!product || item.status && item.status !== "candidate") continue;
      const current = num(item.original_price) ?? product.price;
      const deal = num(item.deal_price) ?? num(item.suggested_discounted_price) ?? num(item.price) ?? num(item.max_discounted_price);
      if (current == null || deal == null || deal <= 0) continue;
      invites.push({
        promotionId: promo.id,
        promotionType: promo.type,
        promotionName: promo.name ?? null,
        deadline: promo.deadline_date ?? null,
        finishDate: promo.finish_date ?? item.end_date ?? null,
        mlItemId: id,
        title: product.title,
        status: item.status ?? "candidate",
        currentPrice: current,
        dealPrice: deal,
        sellerPercent: num(item.seller_percentage) ?? num(promo.benefits?.seller_percent),
        meliPercent: num(item.meli_percentage) ?? num(promo.benefits?.meli_percent),
        offerId: item.offer_id ?? null,
      });
    }
  }

  let usedAccountFee = false;
  const evaluated = invites.map((invite) => {
    const econ = economicsFor(data.sales.filter((s) => s.mlItemId === invite.mlItemId), PILOT_DAYS);
    if (econ.feeRate == null && account.feeRate != null) usedAccountFee = true;
    return evaluateInvite(invite, {
      cost: products.get(invite.mlItemId)?.cost ?? null,
      feeRate: econ.feeRate ?? account.feeRate,
      shippingPerUnit: econ.shippingPerUnit ?? accountShipping,
      taxPercent: data.settings.taxPercent,
      operatingCost: data.settings.operatingCost,
      targetMarginPercent: data.settings.targetMarginPercent,
    });
  });
  if (usedAccountFee) notes.push("Anúncio sem venda recente usa a tarifa média dos seus pedidos.");
  if (data.settings.taxPercent == null) notes.push("Imposto não configurado: contas feitas com 0%. Confirme em Configurações.");
  if (failed.length) notes.push(`Não deu para ler os itens de: ${failed.join(", ")}.`);
  return { promotions: open.length, invites: sortInvites(evaluated), notes, targetMarginPercent: data.settings.targetMarginPercent };
}
