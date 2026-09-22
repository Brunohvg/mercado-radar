import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMlSession } from "@/lib/mercado-livre";
import { syncMercadoLivreOrders } from "@/lib/ml-sync";

export const dynamic = "force-dynamic";

function startOfPeriod(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const refresh = url.searchParams.get("refresh") === "1";
    const days = Math.min(
      Math.max(Number(url.searchParams.get("days") ?? 30), 1),
      365,
    );

    const session = await getMlSession();
    const sellerUserId = session.account.mercadoLivreUserId;
    const from = startOfPeriod(days);

    const count = await prisma.mercadoLivreOrder.count({
      where: {
        sellerUserId,
        dateCreated: { gte: from },
      },
    });

    let sync = null;
    if (refresh || count === 0) {
      sync = await syncMercadoLivreOrders(days);
    }

    const orders = await prisma.mercadoLivreOrder.findMany({
      where: {
        sellerUserId,
        dateCreated: { gte: from },
      },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { dateCreated: "desc" },
      take: 200,
    });

    const validOrders = orders.filter(
      (order) => order.status !== "cancelled",
    );

    const grossRevenue = validOrders.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0,
    );
    const units = validOrders.reduce(
      (sum, order) =>
        sum +
        order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    );
    const knownFees = validOrders.reduce(
      (sum, order) => sum + Number(order.marketplaceFeeTotal ?? 0),
      0,
    );
    const feeReadyCount = validOrders.filter(
      (order) => order.marketplaceFeeTotal != null,
    ).length;
    const freightReadyCount = validOrders.filter(
      (order) => order.shippingCost != null,
    ).length;
    const realizedProfit = validOrders
      .filter((order) => order.profit != null)
      .reduce((sum, order) => sum + Number(order.profit), 0);
    const profitReadyCount = validOrders.filter(
      (order) => order.profit != null,
    ).length;
    const profitReadyRevenue = validOrders
      .filter((order) => order.profit != null)
      .reduce((sum, order) => sum + Number(order.totalAmount), 0);
    const realizedMarginPercent =
      profitReadyRevenue > 0
        ? (realizedProfit / profitReadyRevenue) * 100
        : null;

    const byItem = new Map<
      string,
      {
        mlItemId: string;
        title: string;
        quantity: number;
        revenue: number;
      }
    >();

    for (const order of validOrders) {
      for (const item of order.items) {
        const current = byItem.get(item.mlItemId) ?? {
          mlItemId: item.mlItemId,
          title: item.title,
          quantity: 0,
          revenue: 0,
        };
        current.quantity += item.quantity;
        current.revenue += Number(item.unitPrice) * item.quantity;
        byItem.set(item.mlItemId, current);
      }
    }

    const topProducts = [...byItem.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);

    return NextResponse.json({
      sellerUserId,
      nickname: session.account.nickname,
      days,
      sync,
      summary: {
        orders: validOrders.length,
        cancelled: orders.length - validOrders.length,
        units,
        grossRevenue,
        knownFees,
        feeReadyCount,
        freightReadyCount,
        realizedProfit,
        realizedMarginPercent,
        profitReadyCount,
        awaitingCostCount:
          validOrders.length - profitReadyCount,
        averageTicket:
          validOrders.length > 0 ? grossRevenue / validOrders.length : 0,
      },
      topProducts,
      orders: orders.map((order) => ({
        id: order.id,
        mlOrderId: order.mlOrderId,
        status: order.status,
        dateCreated: order.dateCreated,
        dateClosed: order.dateClosed,
        currencyId: order.currencyId,
        totalAmount: Number(order.totalAmount),
        paidAmount: Number(order.paidAmount),
        marketplaceFeeTotal:
          order.marketplaceFeeTotal == null
            ? null
            : Number(order.marketplaceFeeTotal),
        shippingId: order.shippingId,
        shippingCost:
          order.shippingCost == null ? null : Number(order.shippingCost),
        buyerNickname: order.buyerNickname,
        profit:
          order.profit == null ? null : Number(order.profit),
        marginPercent:
          order.marginPercent == null
            ? null
            : Number(order.marginPercent),
        profitabilityStatus: order.profitabilityStatus,
        items: order.items.map((item) => ({
          id: item.id,
          mlItemId: item.mlItemId,
          variationId: item.variationId,
          title: item.title,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          saleFee:
            item.saleFee == null ? null : Number(item.saleFee),
          unitCost:
            item.unitCost == null ? null : Number(item.unitCost),
        })),
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao carregar vendas.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
