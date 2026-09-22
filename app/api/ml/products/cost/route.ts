import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getMlSession } from "@/lib/mercado-livre";

const schema = z.object({
  mlItemId: z.string().min(3),
  supplier: z.string().trim().max(120).optional().nullable(),
  supplierPrice: z.number().positive(),
  discountPercent: z.number().min(0).max(100).default(0),
});

async function recalculateOrder(orderId: string) {
  const order = await prisma.mercadoLivreOrder.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return;

  const missingProductCost = order.items.some((item) => item.unitCost == null);
  const realizedFee =
    order.marketplaceFeeTotal == null ? null : Number(order.marketplaceFeeTotal);
  const realizedShipping =
    order.shippingCost == null ? null : Number(order.shippingCost);

  const totalProductCost = missingProductCost
    ? null
    : order.items.reduce(
        (sum, item) => sum + Number(item.unitCost ?? 0) * item.quantity,
        0,
      );

  const settings = await prisma.appSettings.findUnique({
    where: { id: "default" },
    select: { operatingCostDefault: true },
  });
  const operatingCost = Number(settings?.operatingCostDefault ?? 0);
  const totalAmount = Number(order.totalAmount);

  const profitReady =
    totalProductCost != null &&
    realizedFee != null &&
    realizedShipping != null;

  const profit = profitReady
    ? totalAmount -
      realizedFee -
      realizedShipping -
      totalProductCost -
      operatingCost
    : null;

  const marginPercent =
    profit != null && totalAmount > 0 ? (profit / totalAmount) * 100 : null;

  if (profitReady && profit != null) {
    const revenueTotal = order.items.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0,
    );

    for (const item of order.items) {
      const revenue = Number(item.unitPrice) * item.quantity;
      const share = revenueTotal > 0 ? revenue / revenueTotal : 0;
      const itemCost = Number(item.unitCost ?? 0) * item.quantity;
      const itemProfit =
        revenue -
        realizedFee * share -
        realizedShipping * share -
        operatingCost * share -
        itemCost;

      await prisma.mercadoLivreOrderItem.update({
        where: { id: item.id },
        data: { profit: itemProfit },
      });
    }
  }

  await prisma.mercadoLivreOrder.update({
    where: { id: order.id },
    data: {
      profit,
      marginPercent,
      profitabilityStatus: missingProductCost
        ? "AWAITING_PRODUCT_COST"
        : realizedShipping == null
          ? "AWAITING_SHIPPING_COST"
          : realizedFee == null
            ? "AWAITING_FEE"
            : "REALIZED",
    },
  });
}

export async function PATCH(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Informe custo e desconto válidos." },
        { status: 400 },
      );
    }

    const session = await getMlSession();

    const product = await prisma.mercadoLivreProduct.findFirst({
      where: {
        mlItemId: parsed.data.mlItemId,
        sellerUserId: session.account.mercadoLivreUserId,
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Produto não encontrado nesta conta." },
        { status: 404 },
      );
    }

    const netUnitCost =
      parsed.data.supplierPrice *
      (1 - parsed.data.discountPercent / 100);

    await prisma.mercadoLivreProduct.update({
      where: { id: product.id },
      data: {
        supplier: parsed.data.supplier || null,
        supplierPrice: parsed.data.supplierPrice,
        discountPercent: parsed.data.discountPercent,
      },
    });

    const affectedItems = await prisma.mercadoLivreOrderItem.findMany({
      where: { mlItemId: product.mlItemId },
      select: { id: true, orderId: true },
    });

    if (affectedItems.length > 0) {
      await prisma.mercadoLivreOrderItem.updateMany({
        where: { mlItemId: product.mlItemId },
        data: { unitCost: netUnitCost },
      });

      const orderIds = [...new Set(affectedItems.map((item) => item.orderId))];
      for (const orderId of orderIds) {
        await recalculateOrder(orderId);
      }
    }

    return NextResponse.json({
      ok: true,
      mlItemId: product.mlItemId,
      supplier: parsed.data.supplier || null,
      supplierPrice: parsed.data.supplierPrice,
      discountPercent: parsed.data.discountPercent,
      netUnitCost,
      ordersRecalculated: new Set(
        affectedItems.map((item) => item.orderId),
      ).size,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao salvar custo do produto.",
      },
      { status: 500 },
    );
  }
}
