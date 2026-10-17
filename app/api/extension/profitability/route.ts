import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getExtensionSession } from "@/lib/extension-auth";
import {
  getExistingItemShippingQuote,
  getItemCurrentPrice,
  getItemsBulk,
  getListingPriceQuote,
  getShippingQuote,
  predictCategory,
} from "@/lib/mercado-livre";
import { analyzeProfitability } from "@/lib/profitability";
import { buildCompetitivePriceStrategy } from "@/lib/price-strategy";
import { referenceIdSchema } from "@/lib/extension-observation";
import { simulateAdvertising } from "@/lib/ads-simulation";
import { parseShippingDiscount } from "@/lib/shipping-package";

export const dynamic = "force-dynamic";

const schema = z.object({
  itemId: referenceIdSchema,
  salePrice: z.coerce.number().positive().optional(),
  marketReferencePrice: z.coerce.number().positive().optional(),
  supplierPrice: z.coerce.number().min(0),
  discountPercent: z.coerce.number().min(0).max(95).default(0),
  kitQuantity: z.coerce.number().int().min(1).max(1000).default(1),
  taxPercent: z.coerce.number().min(0).max(50).optional(),
  quoteOnly: z.boolean().default(false),
  manualFees: z
    .object({
      commissionPercent: z.number().min(0).max(50),
      fixedFee: z.number().min(0).max(10000),
    })
    .optional(),
  logisticType: z
    .enum([
      "drop_off",
      "xd_drop_off",
      "cross_docking",
      "fulfillment",
      "self_service",
    ])
    .optional(),
  operatingCost: z.coerce.number().min(0).default(0),
  targetMarginPercent: z.coerce.number().min(0).max(80).default(20),
  targetRoiPercent: z.coerce.number().min(0).max(500).default(30),
  save: z.boolean().default(false),
  saveMode: z.enum(["VERIFIED", "SNAPSHOT"]).default("VERIFIED"),
  supplierName: z.string().trim().max(160).optional(),
  expectedProfit: z.number().optional(),
  // Anúncio de outro vendedor: a API não libera os detalhes, então a página
  // informa título/categoria/tipo e o Radar calcula as tarifas mesmo assim.
  title: z.string().trim().min(3).max(300).optional(),
  categoryId: z
    .string()
    .trim()
    .regex(/^MLB\d+$/i)
    .optional(),
  listingType: z.enum(["CLASSIC", "PREMIUM"]).optional(),
  freeShipping: z.boolean().optional(),
  shippingCost: z.coerce.number().min(0).max(10000).optional(),
  shippingPackage: z
    .object({
      weightGrams: z.number().int().min(1).max(100000),
      heightCm: z.number().min(1).max(300),
      widthCm: z.number().min(1).max(300),
      lengthCm: z.number().min(1).max(300),
      freeShipping: z.boolean(),
    })
    .optional(),
  advertising: z
    .object({
      roasTarget: z.number().positive().max(1000),
      attributedSalesPercent: z.number().min(0).max(100),
    })
    .optional(),
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

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  try {
    const session = extensionSession.ml;
    const itemId = parsed.data.itemId.toUpperCase();
    const details =
      /^MLB\d+$/.test(itemId) && !parsed.data.manualFees
        ? await getItemsBulk({
            accessToken: session.accessToken,
            itemIds: [itemId],
          }).catch(() => [])
        : [];
    const apiItem = details[0] ?? null;
    const isOwnItem =
      apiItem?.sellerId != null &&
      apiItem.sellerId === session.account.mercadoLivreUserId;

    let categoryId = apiItem?.categoryId ?? parsed.data.categoryId ?? null;
    let categorySource = apiItem?.categoryId
      ? "API"
      : parsed.data.categoryId
        ? "PAGE_OR_USER"
        : "UNAVAILABLE";
    if (!categoryId && parsed.data.title && !parsed.data.manualFees) {
      const predicted = await predictCategory({
        accessToken: session.accessToken,
        title: parsed.data.title,
        limit: 1,
      }).catch(() => []);
      categoryId = predicted[0]?.categoryId ?? null;
      if (categoryId) categorySource = "PREDICTED";
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
      parsed.data.listingType ??
      (item.listingTypeId === "gold_pro" ? "PREMIUM" : "CLASSIC");

    const logisticType =
      parsed.data.logisticType ?? apiItem?.logisticType ?? "drop_off";
    const matchesOwnListing =
      isOwnItem &&
      price === apiItem?.currentPrice &&
      listingType ===
        (apiItem?.listingTypeId === "gold_pro" ? "PREMIUM" : "CLASSIC") &&
      logisticType === apiItem?.logisticType;
    const parcel =
      parsed.data.shippingPackage ||
      (!matchesOwnListing && apiItem?.shippingPackage
        ? {
            ...apiItem.shippingPackage,
            freeShipping: parsed.data.freeShipping ?? item.freeShipping,
          }
        : undefined);
    const matchesApiPackage =
      apiItem?.shippingPackage &&
      parcel &&
      (["weightGrams", "heightCm", "widthCm", "lengthCm"] as const).every(
        (key) => parcel[key] === apiItem.shippingPackage![key],
      );
    const shippingPackageSource = parcel
      ? !parsed.data.shippingPackage || matchesApiPackage
        ? "ITEM_API"
        : "USER"
      : null;
    const [quotedFee, shipping] = await Promise.all([
      categoryId && !parsed.data.manualFees
        ? getListingPriceQuote({
            accessToken: session.accessToken,
            price,
            categoryId,
            listingType,
            logisticType,
          }).catch(() => null)
        : Promise.resolve(null),
      (parsed.data.shippingCost != null
        ? Promise.resolve(null)
        : parcel
          ? getShippingQuote({
              accessToken: session.accessToken,
              userId: session.account.mercadoLivreUserId,
              price,
              listingType,
              logisticType,
              ...parcel,
            })
          : matchesOwnListing
            ? getExistingItemShippingQuote({
                accessToken: session.accessToken,
                userId: session.account.mercadoLivreUserId,
                itemId,
                price,
                listingType,
                freeShipping: item.freeShipping,
              })
            : Promise.resolve(null)
      ).catch(() => null),
    ]);
    const fee = parsed.data.manualFees ?? quotedFee;
    const feeSource = parsed.data.manualFees
      ? "MANUAL"
      : quotedFee
        ? "MERCADO_LIVRE_API"
        : "UNAVAILABLE";
    const shippingKnown =
      parsed.data.shippingCost == null &&
      !parcel &&
      Boolean(isOwnItem && shipping?.raw != null);
    const shippingEstimated =
      parsed.data.shippingCost == null &&
      Boolean(parcel && shipping?.raw != null);
    const shippingSource = shippingKnown
      ? "MERCADO_LIVRE_API"
      : shippingEstimated
        ? "MERCADO_LIVRE_PACKAGE_ESTIMATE"
        : parsed.data.shippingCost != null
          ? "MANUAL_ESTIMATE"
          : "UNAVAILABLE";
    const shippingNote =
      parsed.data.shippingCost != null
        ? "Custo de frete informado para esta simulação."
        : shippingEstimated
          ? (shippingPackageSource === "ITEM_API"
              ? "Medidas do anúncio informadas pela API; confira para sua embalagem. "
              : "Medidas informadas por você. ") +
            "Estimativa na sua conta para preço, modalidade e logística simulados. Produto novo; pode mudar no envio."
          : parcel && !shipping
            ? "A API não retornou frete para esta embalagem. Confira as medidas/logística ou informe um valor verificado."
            : shippingKnown
              ? "Cotação da API para o anúncio próprio. O custo final depende do envio realizado."
              : "Informe a embalagem para estimar na sua conta ou um custo de frete verificado.";
    const shippingCost =
      parsed.data.shippingCost ?? shipping?.shippingCost ?? null;
    const shippingDiscount = parseShippingDiscount(
      shipping?.raw?.coverage?.all_country?.discount,
    );
    const taxPercent = parsed.data.taxPercent ?? null;
    const needs = [
      !fee ? "fees" : null,
      shippingCost == null ? "shippingCost" : null,
      taxPercent == null ? "taxPercent" : null,
    ].filter(Boolean);
    const partial = {
      item: { ...item, price, listingType, isOwn: isOwnItem },
      feeSource,
      categoryId,
      categorySource,
      logisticType,
      shippingKnown,
      shippingEstimated,
      shippingSource,
      shippingNote,
      shippingPackageSource,
      shippingDiscount,
      fees: {
        commissionPercent: fee?.commissionPercent ?? null,
        commissionAmount: fee
          ? Math.round(price * fee.commissionPercent) / 100
          : null,
        fixedFee: fee?.fixedFee ?? null,
        shippingCost,
        taxPercent,
        taxAmount:
          taxPercent == null ? null : Math.round(price * taxPercent) / 100,
      },
      needs,
      result: null,
      adsSimulation: null,
      availability: needs.length ? "PARTIAL" : "READY",
      note: !fee
        ? "A API não retornou tarifas. Informe comissão e tarifa fixa do simulador oficial para fazer uma simulação manual."
        : categorySource === "PREDICTED"
          ? "Categoria sugerida pelo título. Confira a categoria antes de decidir."
          : "Cotação para os parâmetros informados; não é um custo de venda realizada.",
    };
    if (needs.length || parsed.data.quoteOnly) {
      if (parsed.data.save)
        return NextResponse.json(
          {
            ...partial,
            error: "Complete os custos e confirme a cotação antes de salvar.",
          },
          { status: 422 },
        );
      return NextResponse.json(partial);
    }
    if (!fee || shippingCost == null || taxPercent == null)
      throw new Error("Custos incompletos.");

    const analysis = analyzeProfitability({
      productName: item.title,
      supplierPrice: parsed.data.supplierPrice,
      discountPercent: parsed.data.discountPercent,
      kitQuantity: parsed.data.kitQuantity,
      salePrice: price,
      listingType,
      commissionPercent: fee.commissionPercent,
      fixedFee: fee.fixedFee,
      shippingCost,
      operatingCost: parsed.data.operatingCost,
      taxPercent,
      targetMarginPercent: parsed.data.targetMarginPercent,
      targetRoiPercent: parsed.data.targetRoiPercent,
    });

    const strategy =
      parsed.data.marketReferencePrice && analysis.minimumSuggestedPrice != null
        ? buildCompetitivePriceStrategy({
            currentPrice: price,
            marketReferencePrice: parsed.data.marketReferencePrice,
            minimumSuggestedPrice: analysis.minimumSuggestedPrice,
            breakEvenPrice: analysis.breakEvenPrice,
          })
        : null;

    let savedAnalysisId: string | null = null;

    if (
      parsed.data.save &&
      parsed.data.saveMode !== "SNAPSHOT" &&
      (parsed.data.advertising ||
        !shippingKnown ||
        feeSource !== "MERCADO_LIVRE_API" ||
        categorySource !== "API")
    )
      return NextResponse.json(
        {
          error: parsed.data.advertising
            ? "O cenário de Ads é uma hipótese. Copie a memória para revisão; não é resultado realizado."
            : "A simulação usa frete estimado. Confirme a logística na análise do painel antes de salvar uma decisão.",
        },
        { status: 422 },
      );
    if (parsed.data.save && analysis.minimumSuggestedPrice == null)
      return NextResponse.json(
        { error: "A meta de margem é inviável com estas taxas." },
        { status: 400 },
      );
    if (
      parsed.data.save &&
      parsed.data.expectedProfit != null &&
      Math.round(analysis.profit * 100) !==
        Math.round(parsed.data.expectedProfit * 100)
    )
      return NextResponse.json(
        {
          error:
            "A cotação mudou desde a revisão. Atualize a simulação e confira os novos valores antes de salvar.",
        },
        { status: 409 },
      );
    const adsSimulation = parsed.data.advertising
      ? simulateAdvertising({
          salePrice: price,
          profitBeforeAds: analysis.profit,
          ...parsed.data.advertising,
        })
      : null;
    if (parsed.data.save) {
      const localProduct =
        isOwnItem && item.sellerSku
          ? await prisma.product.findUnique({
              where: {
                workspaceId_sku: {
                  workspaceId: session.account.workspaceId,
                  sku: item.sellerSku,
                },
              },
              select: { id: true },
            })
          : null;

      const saved = await prisma.productAnalysis.create({
        data: {
          workspaceId: session.account.workspaceId,
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
          minimumSuggestedPrice: analysis.minimumSuggestedPrice!,
          verdict: analysis.verdict,
          source:
            parsed.data.saveMode === "SNAPSHOT"
              ? "EXTENSION_SIMULATION"
              : "EXTENSION",
          metadata: {
            mlItemId: item.id,
            taxPercent,
            taxAmount: analysis.taxAmount,
            marketReferencePrice: parsed.data.marketReferencePrice ?? null,
            strategy,
            simulation: true,
            feeSource,
            shippingSource,
            shippingNote,
            shippingPackage: parcel ?? null,
            shippingPackageSource,
            shippingDiscount,
            supplierName: parsed.data.supplierName || null,
            adsSimulation,
            capturedAt: new Date().toISOString(),
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
      feeSource,
      categorySource,
      categoryId,
      logisticType,
      needs: [],
      availability: "READY",
      note: partial.note,
      shippingKnown,
      shippingEstimated,
      shippingSource,
      shippingDiscount,
      shippingNote,
      shippingPackageSource,
      fees: {
        commissionPercent: fee.commissionPercent,
        commissionAmount: analysis.commissionAmount,
        fixedFee: fee.fixedFee,
        shippingCost,
        taxPercent,
        taxAmount: analysis.taxAmount,
      },
      result: analysis,
      adsSimulation,
      strategy,
      savedAnalysisId,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao calcular rentabilidade.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
