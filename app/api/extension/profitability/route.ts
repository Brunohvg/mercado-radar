import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getExtensionSession } from "@/lib/extension-auth";
import {
  getExistingItemShippingQuote,
  getItemCurrentPrice,
  getItemsBulk,
  getListingPriceQuote,
  predictCategory,
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
  save: z.boolean().default(false),
  // Anúncio de outro vendedor: a API não libera os detalhes, então a página
  // informa título/categoria/tipo e o Radar calcula as tarifas mesmo assim.
  title: z.string().trim().min(3).max(300).optional(),
  categoryId: z.string().trim().regex(/^MLB\d+$/i).optional(),
  listingType: z.enum(["CLASSIC", "PREMIUM"]).optional(),
  freeShipping: z.boolean().optional(),
});

export async function POST(request: Request) {
  let extensionSession;
  try {
    extensionSession = await getExtensionSession(request);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao validar sessão da extensão.",
      },
      { status: 429 },
    );
  }

  if (!extensionSession) {
    return NextResponse.json(
      { error: "Sessão da extensão inválida ou expirada." },
      { status: 401 },
    );
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  try {
    const session = extensionSession.ml;
    const itemId = parsed.data.itemId.toUpperCase();
    const details = await getItemsBulk({
      accessToken: session.accessToken,
      itemIds: [itemId],
    }).catch(() => []);
    const apiItem = details[0] ?? null;
    const isOwnItem =
      apiItem?.sellerId != null &&
      apiItem.sellerId === session.account.mercadoLivreUserId;

    let categoryId = apiItem?.categoryId ?? parsed.data.categoryId ?? null;
    if (!categoryId && parsed.data.title) {
      const predicted = await predictCategory({
        accessToken: session.accessToken,
        title: parsed.data.title,
        limit: 1,
      }).catch(() => []);
      categoryId = predicted[0]?.categoryId ?? null;
    }

    if (!categoryId) {
      return NextResponse.json(
        { error: "Não foi possível identificar a categoria deste anúncio." },
        { status: 422 },
      );
    }

    const item = {
      id: itemId,
      title: apiItem?.title ?? parsed.data.title ?? itemId,
      categoryId,
      currentPrice: apiItem?.currentPrice ?? 0,
      listingTypeId:
        apiItem?.listingTypeId ??
        (parsed.data.listingType === "PREMIUM" ? "gold_pro" : "gold_special"),
      freeShipping: apiItem?.freeShipping ?? Boolean(parsed.data.freeShipping),
      sellerSku: apiItem?.sellerSku ?? null,
    };

    const price =
      parsed.data.salePrice ??
      (isOwnItem
        ? await getItemCurrentPrice({
            accessToken: session.accessToken,
            itemId,
          }).catch(() => null)
        : null) ??
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
      (isOwnItem
        ? getExistingItemShippingQuote({
        accessToken: session.accessToken,
        userId: session.account.mercadoLivreUserId,
        itemId,
        price,
        listingType,
        freeShipping: item.freeShipping,
      })
        : Promise.reject(new Error("frete de terceiro"))
      ).catch(() => ({
        shippingCost: 0,
        billableWeight: 0,
        discountRate: 0,
        promotedAmount: 0,
        raw: null,
      })),
    ]);
    const shippingKnown = isOwnItem && shipping.raw != null;

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

    let savedAnalysisId: string | null = null;

    if (parsed.data.save) {
      const localProduct = item.sellerSku
        ? await prisma.product.findUnique({
            where: { sku: item.sellerSku },
            select: { id: true },
          })
        : null;

      const saved = await prisma.productAnalysis.create({
        data: {
          productId: localProduct?.id ?? null,
          productName: item.title,
          listingType,
          kitQuantity: parsed.data.kitQuantity,
          supplierPrice: parsed.data.supplierPrice,
          discountPercent: parsed.data.discountPercent,
          unitCost: analysis.unitCost,
          purchaseCost: analysis.purchaseCost,
          salePrice: analysis.salePrice,
          commissionPercent: analysis.commissionPercent,
          commissionAmount: analysis.commissionAmount,
          fixedFee: analysis.fixedFee,
          shippingCost: analysis.shippingCost,
          operatingCost: analysis.operatingCost,
          amountReceived: analysis.amountReceived,
          profit: analysis.profit,
          marginPercent: analysis.marginPercent,
          roiPercent: analysis.roiPercent,
          targetMarginPercent: analysis.targetMarginPercent,
          targetRoiPercent: analysis.targetRoiPercent,
          minimumSuggestedPrice: analysis.minimumSuggestedPrice,
          verdict: analysis.verdict,
          source: "EXTENSION",
          metadata: {
            mlItemId: item.id,
            taxPercent: parsed.data.taxPercent,
            taxAmount: analysis.taxAmount,
            marketReferencePrice:
              parsed.data.marketReferencePrice ?? null,
            strategy,
          },
        },
      });

      savedAnalysisId = saved.id;
    }

    return NextResponse.json({
      item: {
        id: item.id,
        title: item.title,
        price,
        listingType,
        freeShipping: item.freeShipping,
        isOwn: isOwnItem,
      },
      shippingKnown,
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
      savedAnalysisId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao calcular rentabilidade.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
