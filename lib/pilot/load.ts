import { prisma } from "@/lib/prisma";
import { getWorkspaceSettings } from "@/lib/workspace-settings";
import type { PilotProduct, PilotSale, PilotSettings } from "@/lib/pilot/briefing";

export const PILOT_DAYS = 30;

/** Dados do Piloto lidos do banco (pedidos pagos dos últimos 30 dias, produtos e metas). */
export async function loadPilotData(input: { workspaceId: string; sellerId: string; mlItemId?: string }) {
  const from = new Date(Date.now() - PILOT_DAYS * 86_400_000);
  const itemFilter = input.mlItemId ? { mlItemId: input.mlItemId } : {};
  const [settings, products, orders, sync] = await Promise.all([
    getWorkspaceSettings(input.workspaceId),
    prisma.mercadoLivreProduct.findMany({
      where: { sellerUserId: input.sellerId, status: { in: ["active", "paused"] }, ...itemFilter },
    }),
    prisma.mercadoLivreOrder.findMany({
      where: {
        sellerUserId: input.sellerId,
        status: "paid",
        refundDetected: false,
        dateCreated: { gte: from },
        ...(input.mlItemId ? { items: { some: { mlItemId: input.mlItemId } } } : {}),
      },
      select: { shippingCost: true, marketplaceFeeTotal: true, items: { select: { mlItemId: true, quantity: true, unitPrice: true, saleFee: true } } },
    }),
    prisma.syncRun.findFirst({
      where: { workspaceId: input.workspaceId, kind: "ML_ORDERS", status: "SUCCESS" },
      orderBy: { finishedAt: "desc" },
    }),
  ]);
  const meta = sync?.metadata as { days?: number; truncated?: boolean } | null;
  const historyComplete = Boolean(
    sync?.finishedAt &&
      Date.now() - sync.finishedAt.getTime() < 36 * 3_600_000 &&
      (meta?.days ?? 0) >= PILOT_DAYS &&
      meta?.truncated === false,
  );
  // Frete (e tarifa, quando falta na linha) do pedido rateados entre as linhas pela receita de cada uma.
  const sales: PilotSale[] = orders.flatMap((order) => {
    const total = order.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
    return order.items
      .filter((item) => !input.mlItemId || item.mlItemId === input.mlItemId)
      .map((item) => ({
        mlItemId: item.mlItemId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        // Tarifa por unidade da linha; sem ela, a tarifa total do pedido rateada pela receita.
        saleFee:
          item.saleFee != null
            ? Number(item.saleFee)
            : order.marketplaceFeeTotal == null || total <= 0
              ? null
              : (Number(order.marketplaceFeeTotal) * Number(item.unitPrice)) / total,
        shippingShare:
          order.shippingCost == null || total <= 0
            ? null
            : (Number(order.shippingCost) * Number(item.unitPrice) * item.quantity) / total,
      }));
  });
  const pilotProducts: PilotProduct[] = products.map((p) => ({
    mlItemId: p.mlItemId,
    title: p.title,
    thumbnail: p.thumbnail,
    permalink: p.permalink,
    price: p.currentPrice == null ? null : Number(p.currentPrice),
    stock: p.availableQuantity,
    status: p.status,
    cost: p.supplierPrice == null ? null : Number(p.supplierPrice) * (1 - Number(p.discountPercent) / 100),
  }));
  const pilotSettings: PilotSettings = {
    taxPercent: settings.taxPercent == null ? null : Number(settings.taxPercent),
    operatingCost: Number(settings.operatingCostDefault),
    targetMarginPercent: Number(settings.targetMarginPercent),
    leadTimeDays: settings.leadTimeDays,
    safetyDays: settings.safetyStockDays,
    coverageDays: settings.stockCoverageDays,
  };
  return { products: pilotProducts, sales, settings: pilotSettings, historyComplete, syncedAt: sync?.finishedAt ?? null };
}
