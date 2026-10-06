import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1),
      250,
    );

    const analyses = await prisma.productAnalysis.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        product: {
          select: {
            sku: true,
            supplier: true,
          },
        },
      },
    });

    return NextResponse.json({
      analyses: analyses.map((analysis) => ({
        id: analysis.id,
        productId: analysis.productId,
        productName: analysis.productName,
        sku: analysis.product?.sku ?? null,
        supplier: analysis.product?.supplier ?? null,
        listingType: analysis.listingType,
        kitQuantity: analysis.kitQuantity,
        supplierPrice: Number(analysis.supplierPrice),
        discountPercent: Number(analysis.discountPercent),
        unitCost: Number(analysis.unitCost),
        purchaseCost: Number(analysis.purchaseCost),
        salePrice: Number(analysis.salePrice),
        commissionPercent: Number(analysis.commissionPercent),
        commissionAmount: Number(analysis.commissionAmount),
        fixedFee: Number(analysis.fixedFee),
        shippingCost: Number(analysis.shippingCost),
        operatingCost: Number(analysis.operatingCost),
        amountReceived: Number(analysis.amountReceived),
        profit: Number(analysis.profit),
        marginPercent: Number(analysis.marginPercent),
        roiPercent: Number(analysis.roiPercent),
        targetMarginPercent: Number(analysis.targetMarginPercent),
        targetRoiPercent: Number(analysis.targetRoiPercent),
        minimumSuggestedPrice: Number(analysis.minimumSuggestedPrice),
        verdict: analysis.verdict,
        source: analysis.source,
        metadata: analysis.metadata,
        createdAt: analysis.createdAt,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao carregar histórico de análises.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = (url.searchParams.get("id") ?? "").trim();

  if (!id) {
    return NextResponse.json(
      { error: "Análise não informada." },
      { status: 400 },
    );
  }

  try {
    await prisma.productAnalysis.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao excluir análise.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
