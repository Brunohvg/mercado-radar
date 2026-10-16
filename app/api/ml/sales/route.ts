import { getSalesReport } from "@/lib/sales-report";
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
      Math.max(Number(url.searchParams.get("days") ?? 30) || 30, 1),
      365,
    );

    const session = await getMlSession();
    const sellerUserId = session.account.mercadoLivreUserId;
    const from = startOfPeriod(days);

    const page = Math.max(1, Math.min(100000, Math.floor(Number(url.searchParams.get("page")) || 1)));
    const limit = 100;
    let count = await prisma.mercadoLivreOrder.count({
      where: {
        sellerUserId,
        dateCreated: { gte: from },
      },
    });

    let sync = null;
    if (refresh || count === 0) {
      sync = await syncMercadoLivreOrders(days);
      count = await prisma.mercadoLivreOrder.count({ where: { sellerUserId, dateCreated: { gte: from } } });
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
      skip: (page - 1) * limit,
      take: limit,
    });

    const report = await getSalesReport(sellerUserId, days);
    const lastSync = await prisma.syncRun.findFirst({ where: { workspaceId: session.account.workspaceId, kind: "ML_ORDERS", status: "SUCCESS" }, orderBy: { finishedAt: "desc" } });
    const metadata = lastSync?.metadata as { days?: number; truncated?: boolean } | null;
    return NextResponse.json({
      sellerUserId, nickname: session.account.nickname, days, sync,
      summary: report.summary, topProducts: report.topProducts,
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
      dataQuality: { syncedAt: lastSync?.finishedAt ?? null, reportComplete: Boolean(lastSync?.finishedAt && Date.now() - lastSync.finishedAt.getTime() < 36 * 60 * 60 * 1000 && (metadata?.days ?? 0) >= days && metadata?.truncated === false) },
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
          order.economicsVersion !== 1 || order.status !== "paid" || order.refundDetected || order.profit == null ? null : Number(order.profit),
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
