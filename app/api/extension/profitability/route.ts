import { NextResponse } from "next/server";
import { z } from "zod";
import { isExtensionAuthorized } from "@/lib/extension-auth";
import {
  getExistingItemShippingQuote,
  getItemCurrentPrice,
  getItemsBulk,
  getListingPriceQuote,
  getMlSession,
} from "@/lib/mercado-livre";
import { analyzeProfitability } from "@/lib/profitability";
import { buildCompetitivePriceStrategy } from "@/lib/price-strategy";

export const dynamic = "force-dynamic";

const schema = z.object({
  itemId: z.string().trim().regex(/^MLB\d+$/i),
  salePrice: z.coerce.number().positive().optional(),
  marketReferencePrice: z.coerce.number().positive().optional(),
  supplierPrice: z.coerce.number().min(0),
  discountPercent: z.coerce.number().min(0).max(95).default(0),
  kitQuantity: z.coerce.number().int().min(1).max(1000).default(1),
  taxPercent: z.coerce.number().min(0).max(50).default(0),
  operatingCost: z.coerce.number().min(0).default(0),
  targetMarginPercent: z.coerce.number().min(0).max(80).default(20),
  targetRoiPercent: z.coerce.number().min(0).max(500).default(30),
});

export async function POST(request: Request) {
  if (!isExtensionAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  try {
    const session = await getMlSession();
    const itemId = parsed.data.itemId.toUpperCase();
    const details = await getItemsBulk({
      accessToken: session.accessToken,
      itemIds: [itemId],
    });
    const item = details[0];

    if (!item?.categoryId) {
      return NextResponse.json(
        { error: "Categoria do anúncio não encontrada." },
        { status: 422 },
      );
    }

    const price =
      parsed.data.salePrice ??
      (await getItemCurrentPrice({
        accessToken: session.accessToken,
        itemId,
      }).catch(() => null)) ??
      item.currentPrice;

    if (!price || price <= 0) {
      return NextResponse.json(
        { error: "Preço atual do anúncio não encontrado." },
        { status: 422 },
      );
    }

    const listingType =
      item.listingTypeId === "gold_pro" ? "PREMIUM" : "CLASSIC";

    const [fee, shipping] = await Promise.all([
      getListingPriceQuote({
        accessToken: session.accessToken,
        price,
        categoryId: item.categoryId,
        listingType,
      }),
      getExistingItemShippingQuote({
        accessToken: session.accessToken,
        userId: session.account.mercadoLivreUserId,
        itemId,
        price,
        listingType,
        freeShipping: item.freeShipping,
      }).catch(() => ({
        shippingCost: 0,
        billableWeight: 0,
        discountRate: 0,
        promotedAmount: 0,
        raw: null,
      })),
    ]);

    const analysis = analyzeProfitability({
      productName: item.title,
      supplierPrice: parsed.data.supplierPrice,
      discountPercent: parsed.data.discountPercent,
      kitQuantity: parsed.data.kitQuantity,
      salePrice: price,
      listingType,
      commissionPercent: fee.commissionPercent,
      fixedFee: fee.fixedFee,
      shippingCost: shipping.shippingCost,
      operatingCost: parsed.data.operatingCost,
      taxPercent: parsed.data.taxPercent,
      targetMarginPercent: parsed.data.targetMarginPercent,
      targetRoiPercent: parsed.data.targetRoiPercent,
    });

    const strategy = parsed.data.marketReferencePrice
      ? buildCompetitivePriceStrategy({
          currentPrice: price,
          marketReferencePrice: parsed.data.marketReferencePrice,
          minimumSuggestedPrice: analysis.minimumSuggestedPrice,
          breakEvenPrice: analysis.breakEvenPrice,
        })
      : null;

    return NextResponse.json({
      item: {
        id: item.id,
        title: item.title,
        price,
        listingType,
        freeShipping: item.freeShipping,
      },
      fees: {
        commissionPercent: fee.commissionPercent,
        commissionAmount: analysis.commissionAmount,
        fixedFee: fee.fixedFee,
        shippingCost: shipping.shippingCost,
        taxPercent: parsed.data.taxPercent,
        taxAmount: analysis.taxAmount,
      },
      result: analysis,
      strategy,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao calcular rentabilidade.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
