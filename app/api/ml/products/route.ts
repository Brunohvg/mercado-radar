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
      products: products.map((item) => ({
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
        lastSyncedAt: item.lastSyncedAt,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao carregar produtos.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
