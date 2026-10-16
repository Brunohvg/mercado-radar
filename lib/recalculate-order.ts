import { prisma } from "@/lib/prisma";
import {
  calculateOrderEconomics,
  ECONOMICS_VERSION,
  hasRefund,
} from "@/lib/sales-economics";
import { getWorkspaceSettings } from "@/lib/workspace-settings";

export async function recalculateOrder(
  orderId: string,
  workspaceId: string,
  sellerUserId: string,
) {
  const order = await prisma.mercadoLivreOrder.findFirst({
    where: { id: orderId, sellerUserId },
    include: { items: true },
  });
  if (!order) return;
  const settings = await getWorkspaceSettings(workspaceId);
  // A later cost/profile edit must not rewrite the financial history of settled orders.
  const taxPercent = order.taxPercentApplied ?? settings.taxPercent;
  const operatingCost =
    order.operatingCostApplied ?? settings.operatingCostDefault;
  const economics = calculateOrderEconomics({
    status: order.status,
    refunded: order.refundDetected || hasRefund(order.raw),
    totalAmount: Number(order.totalAmount),
    fee:
      order.marketplaceFeeTotal == null
        ? null
        : Number(order.marketplaceFeeTotal),
    shipping: order.shippingCost == null ? null : Number(order.shippingCost),
    taxPercent: taxPercent == null ? null : Number(taxPercent),
    operatingCost: Number(operatingCost),
    items: order.items.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      unitCost: i.unitCost == null ? null : Number(i.unitCost),
    })),
  });
  await prisma.$transaction([
    ...economics.itemProfits.map((i) =>
      prisma.mercadoLivreOrderItem.update({
        where: { id: i.id },
        data: { profit: i.profit },
      }),
    ),
    prisma.mercadoLivreOrder.update({
      where: { id: order.id },
      data: {
        profit: economics.profit,
        marginPercent: economics.marginPercent,
        profitabilityStatus: economics.status,
        economicsVersion: ECONOMICS_VERSION,
        ...(economics.profit != null
          ? {
              taxPercentApplied: Number(taxPercent),
              operatingCostApplied: Number(operatingCost),
            }
          : {}),
      },
    }),
  ]);
  return economics;
}
