import { prisma } from "@/lib/prisma";
import { ECONOMICS_VERSION } from "@/lib/sales-economics";

export async function getSalesReport(sellerUserId: string, days: number) {
  const from = new Date(Date.now() - days * 86_400_000);
  const where = {
    sellerUserId,
    dateCreated: { gte: from },
    status: "paid",
    refundDetected: false,
    currencyId: "BRL",
  };
  // Totals cover the entire period. Pagination only limits the order list.
  const orders = await prisma.mercadoLivreOrder.findMany({
    where,
    select: {
      totalAmount: true,
      marketplaceFeeTotal: true,
      shippingCost: true,
      profit: true,
      economicsVersion: true,
      profitabilityStatus: true,
      taxPercentApplied: true,
      operatingCostApplied: true,
    },
  });
  const items = await prisma.mercadoLivreOrderItem.findMany({
    where: { order: where },
    select: {
      mlItemId: true,
      title: true,
      quantity: true,
      unitPrice: true,
      unitCost: true,
      profit: true,
      order: {
        select: {
          economicsVersion: true,
          profitabilityStatus: true,
          taxPercentApplied: true,
          operatingCostApplied: true,
        },
      },
    },
  });
  const [cancelled, pending, refunded] = await Promise.all([
    prisma.mercadoLivreOrder.count({
      where: { sellerUserId, dateCreated: { gte: from }, status: "cancelled" },
    }),
    prisma.mercadoLivreOrder.count({
      where: {
        sellerUserId,
        dateCreated: { gte: from },
        status: { notIn: ["paid", "cancelled"] },
      },
    }),
    prisma.mercadoLivreOrder.count({
      where: { sellerUserId, dateCreated: { gte: from }, refundDetected: true },
    }),
  ]);
  const ready = orders.filter(
    (o) =>
      o.economicsVersion === ECONOMICS_VERSION &&
      o.profitabilityStatus === "REALIZED" &&
      o.profit != null,
  );
  const grossRevenue = orders.reduce(
    (sum, o) => sum + Number(o.totalAmount),
    0,
  );
  const knownRevenue = ready.reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const realizedProfit = ready.reduce((sum, o) => sum + Number(o.profit), 0);
  const byItem = new Map<
    string,
    { mlItemId: string; title: string; quantity: number; revenue: number }
  >();
  for (const item of items) {
    const row = byItem.get(item.mlItemId) ?? {
      mlItemId: item.mlItemId,
      title: item.title,
      quantity: 0,
      revenue: 0,
    };
    row.quantity += item.quantity;
    row.revenue += Number(item.unitPrice) * item.quantity;
    byItem.set(item.mlItemId, row);
  }
  return {
    summary: {
      orders: orders.length,
      cancelled,
      pending,
      refunded,
      units: items.reduce((sum, i) => sum + i.quantity, 0),
      grossRevenue,
      knownFees: orders.reduce(
        (sum, o) => sum + Number(o.marketplaceFeeTotal ?? 0),
        0,
      ),
      feeReadyCount: orders.filter((o) => o.marketplaceFeeTotal != null).length,
      freightReadyCount: orders.filter((o) => o.shippingCost != null).length,
      realizedProfit,
      realizedMarginPercent:
        knownRevenue > 0 ? (realizedProfit / knownRevenue) * 100 : null,
      profitReadyCount: ready.length,
      awaitingCostCount: orders.length - ready.length,
      profitCoveragePercent:
        grossRevenue > 0 ? (knownRevenue / grossRevenue) * 100 : null,
      averageTicket: orders.length ? grossRevenue / orders.length : 0,
    },
    // Uma linha por produto: o que vendeu, quanto lucrou e se a margem é conhecida.
    productRows: [...items
      .reduce((map, i) => {
        const row = map.get(i.mlItemId) ?? { mlItemId: i.mlItemId, title: i.title, units: 0, revenue: 0, knownRevenue: 0, profit: 0, unitsWithoutCost: 0, unitCost: null as number | null };
        row.units += i.quantity;
        row.revenue += Number(i.unitPrice) * i.quantity;
        if (i.unitCost == null) row.unitsWithoutCost += i.quantity;
        else row.unitCost = Number(i.unitCost);
        const ready = i.profit != null && i.order.economicsVersion === ECONOMICS_VERSION && i.order.profitabilityStatus === "REALIZED";
        if (ready) {
          row.knownRevenue += Number(i.unitPrice) * i.quantity;
          row.profit += Number(i.profit);
        }
        return map.set(i.mlItemId, row);
      }, new Map<string, { mlItemId: string; title: string; units: number; revenue: number; knownRevenue: number; profit: number; unitsWithoutCost: number; unitCost: number | null }>())
      .values()]
      .map((row) => ({
        ...row,
        revenue: Math.round(row.revenue * 100) / 100,
        profit: row.knownRevenue > 0 ? Math.round(row.profit * 100) / 100 : null,
        marginPercent: row.knownRevenue > 0 ? Math.round((row.profit / row.knownRevenue) * 1000) / 10 : null,
        /** Parte da receita do produto com lucro apurado (0 a 100). */
        coveragePercent: row.revenue > 0 ? Math.round((row.knownRevenue / row.revenue) * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    // Produtos vendidos no período sem custo cadastrado: é o que trava o lucro.
    missingCosts: [...items
      .filter((i) => i.unitCost == null)
      .reduce((map, i) => {
        const row = map.get(i.mlItemId) ?? { mlItemId: i.mlItemId, title: i.title, units: 0, revenue: 0 };
        row.units += i.quantity;
        row.revenue += Number(i.unitPrice) * i.quantity;
        return map.set(i.mlItemId, row);
      }, new Map<string, { mlItemId: string; title: string; units: number; revenue: number }>())
      .values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 12),
    topProducts: [...byItem.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8),
    items,
  };
}
