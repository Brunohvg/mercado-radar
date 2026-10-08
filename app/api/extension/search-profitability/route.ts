import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getExtensionSession } from "@/lib/extension-auth";
import {
  getExistingItemShippingQuote,
  getListingPriceQuote,
} from "@/lib/mercado-livre";
import { analyzeProfitability } from "@/lib/profitability";

export const dynamic = "force-dynamic";

const schema = z.object({
  query: z.string().trim().min(2).max(180),
  items: z
    .array(
      z.object({
        id: z.string().trim().regex(/^MLB\d+$/i),
        price: z.coerce.number().positive(),
      }),
    )
    .min(1)
    .max(12),
  taxPercent: z.coerce.number().min(0).max(50).default(0),
  operatingCost: z.coerce.number().min(0).default(0),
  targetMarginPercent: z.coerce.number().min(0).max(80).default(20),
  targetRoiPercent: z.coerce.number().min(0).max(500).default(30),
});

const STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "com",
  "sem",
  "para",
  "por",
  "em",
  "um",
  "uma",
  "kit",
  "pacote",
  "un",
  "und",
  "unid",
  "unidade",
  "unidades",
  "novo",
  "nova",
]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function similarity(left: string, right: string) {
  const leftTokens = [...new Set(tokens(left))];
  const rightSet = new Set(tokens(right));

  if (!leftTokens.length || !rightSet.size) return 0;

  const matches = leftTokens.filter((token) => rightSet.has(token)).length;
  const coverage = matches / leftTokens.length;
  const precision = matches / rightSet.size;

  return coverage * 0.7 + precision * 0.3;
}

function listingTypeFromId(value: string | null) {
  return value === "gold_pro" ? ("PREMIUM" as const) : ("CLASSIC" as const);
}

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
    const sellerUserId = session.account.mercadoLivreUserId;

    const ownProducts = await prisma.mercadoLivreProduct.findMany({
      where: {
        sellerUserId,
        status: "active",
      },
      orderBy: [{ soldQuantity: "desc" }, { updatedAt: "desc" }],
      take: 100,
    });

    const ranked = ownProducts
      .map((product) => ({
        product,
        similarity: similarity(parsed.data.query, product.title),
      }))
      .sort((a, b) => b.similarity - a.similarity);

    const best = ranked[0];

    if (!best || best.similarity < 0.48) {
      return NextResponse.json({
        matchedProduct: null,
        items: [],
        message:
          "Não encontrei um produto seu parecido o suficiente para aplicar custo real nesta busca.",
      });
    }

    const ownProduct = best.product;

    let unitCost =
      ownProduct.supplierPrice == null
        ? null
        : Number(ownProduct.supplierPrice) *
          (1 - Number(ownProduct.discountPercent) / 100);

    let costSource: "LISTING" | "SKU" | null =
      unitCost == null ? null : "LISTING";

    if (unitCost == null && ownProduct.sku) {
      const localProduct = await prisma.product.findUnique({
        where: { sku: ownProduct.sku },
        select: {
          supplierPrice: true,
          discountPercent: true,
        },
      });

      if (localProduct) {
        unitCost =
          Number(localProduct.supplierPrice) *
          (1 - Number(localProduct.discountPercent) / 100);
        costSource = "SKU";
      }
    }

    if (unitCost == null || !ownProduct.categoryId) {
      return NextResponse.json({
        matchedProduct: {
          mlItemId: ownProduct.mlItemId,
          title: ownProduct.title,
          sku: ownProduct.sku,
          similarityPercent: Math.round(best.similarity * 100),
          hasCost: false,
        },
        items: [],
        needsCost: true,
        message:
          "Encontrei seu produto, mas falta custo ou categoria para calcular sua margem.",
      });
    }

    const listingType = listingTypeFromId(ownProduct.listingTypeId);
    const uniquePrices = [
      ...new Set(parsed.data.items.map((item) => Number(item.price.toFixed(2)))),
    ];

    const economicsByPrice = new Map<
      number,
      ReturnType<typeof analyzeProfitability>
    >();

    await Promise.all(
      uniquePrices.map(async (price) => {
        const [fee, shipping] = await Promise.all([
          getListingPriceQuote({
            accessToken: session.accessToken,
            price,
            categoryId: ownProduct.categoryId!,
            listingType,
          }),
          getExistingItemShippingQuote({
            accessToken: session.accessToken,
            userId: sellerUserId,
            itemId: ownProduct.mlItemId,
            price,
            listingType,
            freeShipping: ownProduct.freeShipping,
          }).catch(() => ({
            shippingCost: 0,
            billableWeight: 0,
            discountRate: 0,
            promotedAmount: 0,
            raw: null,
          })),
        ]);

        economicsByPrice.set(
          price,
          analyzeProfitability({
            productName: ownProduct.title,
            supplierPrice: unitCost!,
            discountPercent: 0,
            kitQuantity: 1,
            salePrice: price,
            listingType,
            commissionPercent: fee.commissionPercent,
            fixedFee: fee.fixedFee,
            shippingCost: shipping.shippingCost,
            operatingCost: parsed.data.operatingCost,
            taxPercent: parsed.data.taxPercent,
            targetMarginPercent: parsed.data.targetMarginPercent,
            targetRoiPercent: parsed.data.targetRoiPercent,
          }),
        );
      }),
    );

    return NextResponse.json({
      matchedProduct: {
        mlItemId: ownProduct.mlItemId,
        title: ownProduct.title,
        sku: ownProduct.sku,
        unitCost,
        costSource,
        similarityPercent: Math.round(best.similarity * 100),
        listingType,
        freeShipping: ownProduct.freeShipping,
      },
      items: parsed.data.items.map((item) => {
        const key = Number(item.price.toFixed(2));
        const analysis = economicsByPrice.get(key);

        return {
          id: item.id.toUpperCase(),
          price: item.price,
          profit: analysis?.profit ?? null,
          marginPercent: analysis?.marginPercent ?? null,
          roiPercent: analysis?.roiPercent ?? null,
          minimumSuggestedPrice: analysis?.minimumSuggestedPrice ?? null,
          verdict: analysis?.verdict ?? null,
        };
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao calcular margem personalizada da busca.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
