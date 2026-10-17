import { recalculateOrder } from "@/lib/recalculate-order";
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
      where: { mlItemId: product.mlItemId, unitCost: null, order: { sellerUserId: session.account.mercadoLivreUserId } },
      select: { id: true, orderId: true },
    });

    if (affectedItems.length > 0) {
      await prisma.mercadoLivreOrderItem.updateMany({
        where: { mlItemId: product.mlItemId, unitCost: null, order: { sellerUserId: session.account.mercadoLivreUserId } },
        data: { unitCost: netUnitCost },
      });

      const orderIds = [...new Set(affectedItems.map((item) => item.orderId))];
      for (const orderId of orderIds) {
        await recalculateOrder(orderId, session.account.workspaceId, session.account.mercadoLivreUserId);
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
