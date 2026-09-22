import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMlSession } from "@/lib/mercado-livre";
import { syncMercadoLivreProducts } from "@/lib/ml-sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const refresh = url.searchParams.get("refresh") === "1";
    const session = await getMlSession();
    const sellerUserId = session.account.mercadoLivreUserId;

    const count = await prisma.mercadoLivreProduct.count({
      where: { sellerUserId },
    });

    let sync = null;
    if (refresh || count === 0) {
      sync = await syncMercadoLivreProducts();
    }

    const products = await prisma.mercadoLivreProduct.findMany({
      where: { sellerUserId },
      orderBy: [
        { status: "asc" },
        { soldQuantity: "desc" },
        { updatedAt: "desc" },
      ],
      take: 200,
    });

    const recentFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentItems = await prisma.mercadoLivreOrderItem.findMany({
      where: {
        order: {
          sellerUserId,
          status: { not: "cancelled" },
          dateCreated: { gte: recentFrom },
        },
      },
      include: {
        order: {
          select: {
            status: true,
            dateCreated: true,
          },
        },
      },
    });

    const skuValues = products
      .map((item) => item.sku)
      .filter((sku): sku is string => Boolean(sku));

    const localProducts = skuValues.length
      ? await prisma.product.findMany({
          where: { sku: { in: skuValues } },
          select: {
            sku: true,
            supplierPrice: true,
            discountPercent: true,
          },
        })
      : [];

    const costBySku = new Map(
      localProducts
        .filter((item) => item.sku)
        .map((item) => [
          item.sku as string,
          Number(item.supplierPrice) *
            (1 - Number(item.discountPercent) / 100),
        ]),
    );

    const salesByItem = new Map<
      string,
      {
        units: number;
        revenue: number;
        realizedProfit: number;
        profitKnownRevenue: number;
      }
    >();

    for (const row of recentItems) {
      const current = salesByItem.get(row.mlItemId) ?? {
        units: 0,
        revenue: 0,
        realizedProfit: 0,
        profitKnownRevenue: 0,
      };

      const revenue = Number(row.unitPrice) * row.quantity;
      current.units += row.quantity;
      current.revenue += revenue;

      if (row.profit != null) {
        current.realizedProfit += Number(row.profit);
        current.profitKnownRevenue += revenue;
      }

      salesByItem.set(row.mlItemId, current);
    }

    const active = products.filter((item) => item.status === "active");
    const stockUnits = active.reduce(
      (sum, item) => sum + item.availableQuantity,
      0,
    );
    const soldUnits = products.reduce(
      (sum, item) => sum + item.soldQuantity,
      0,
    );

    return NextResponse.json({
      sellerUserId,
      nickname: session.account.nickname,
      sync,
      summary: {
        total: products.length,
        active: active.length,
        paused: products.filter((item) => item.status === "paused").length,
        stockUnits,
        soldUnits,
      },
      products: products.map((item) => {
        const recent = salesByItem.get(item.mlItemId) ?? {
          units: 0,
          revenue: 0,
          realizedProfit: 0,
          profitKnownRevenue: 0,
        };
        const dailyVelocity = recent.units / 30;
        const coverageDays =
          dailyVelocity > 0
            ? item.availableQuantity / dailyVelocity
            : null;
        const realizedMargin =
          recent.profitKnownRevenue > 0
            ? (recent.realizedProfit / recent.profitKnownRevenue) * 100
            : null;
        const directUnitCost =
          item.supplierPrice == null
            ? null
            : Number(item.supplierPrice) *
              (1 - Number(item.discountPercent) / 100);
        const unitCost =
          directUnitCost ??
          (item.sku ? costBySku.get(item.sku) ?? null : null);

        let healthAction:
          | "ADD_COST"
          | "STOP_BUYING"
          | "RESTOCK"
          | "WATCH"
          | "MAINTAIN"
          | "OBSERVE" = "OBSERVE";

        if (unitCost == null) {
          healthAction = "ADD_COST";
        } else if (realizedMargin != null && realizedMargin < 15) {
          healthAction = "STOP_BUYING";
        } else if (recent.units > 0 && coverageDays != null && coverageDays <= 7) {
          healthAction = "RESTOCK";
        } else if (recent.units > 0 && coverageDays != null && coverageDays <= 14) {
          healthAction = "WATCH";
        } else if (recent.units > 0) {
          healthAction = "MAINTAIN";
        }

        const targetStock =
          dailyVelocity > 0 ? Math.ceil(dailyVelocity * 21) : 0;
        const suggestedReorder = Math.max(
          0,
          targetStock - item.availableQuantity,
        );
        const capitalNeeded =
          unitCost != null && suggestedReorder > 0
            ? unitCost * suggestedReorder
            : null;

        return {
          id: item.id,
          mlItemId: item.mlItemId,
          title: item.title,
          sku: item.sku,
          categoryId: item.categoryId,
          status: item.status,
          listingTypeId: item.listingTypeId,
          currentPrice:
            item.currentPrice == null ? null : Number(item.currentPrice),
          availableQuantity: item.availableQuantity,
          soldQuantity: item.soldQuantity,
          visitsTotal: item.visitsTotal,
          permalink: item.permalink,
          thumbnail: item.thumbnail,
          freeShipping: item.freeShipping,
          supplier: item.supplier,
          supplierPrice:
            item.supplierPrice == null ? null : Number(item.supplierPrice),
          discountPercent: Number(item.discountPercent),
          netUnitCost: unitCost,
          lastSyncedAt: item.lastSyncedAt,
          health: {
            periodDays: 30,
            unitsSold: recent.units,
            revenue: recent.revenue,
            dailyVelocity,
            coverageDays,
            realizedMarginPercent: realizedMargin,
            unitCost,
            action: healthAction,
            suggestedReorder,
            capitalNeeded,
          },
        };
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao carregar produtos.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
