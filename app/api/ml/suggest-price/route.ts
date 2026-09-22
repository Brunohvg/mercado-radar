import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getListingPriceQuote,
  getMlSession,
  getShippingQuote,
} from "@/lib/mercado-livre";
import { analyzeProfitability, type ListingType } from "@/lib/profitability";

const schema = z.object({
  productName: z.string().trim().min(2).max(180),
  supplierPrice: z.coerce.number().positive(),
  discountPercent: z.coerce.number().min(0).max(95).default(0),
  kitQuantity: z.coerce.number().int().min(1).max(1000).default(1),
  listingType: z.enum(["CLASSIC", "PREMIUM"]),
  categoryId: z.string().min(3).max(40),
  weightGrams: z.coerce.number().int().positive().max(100000),
  heightCm: z.coerce.number().positive().max(300),
  widthCm: z.coerce.number().positive().max(300),
  lengthCm: z.coerce.number().positive().max(300),
  operatingCost: z.coerce.number().min(0).default(0),
  targetMarginPercent: z.coerce.number().min(0).max(80).default(20),
  targetRoiPercent: z.coerce.number().min(0).max(500).default(30),
});

function psychologicalPrice(value: number) {
  const minimum = Math.max(1, value);
  const whole = Math.floor(minimum);
  const sameReal = whole + 0.9;
  const candidate = sameReal >= minimum ? sameReal : whole + 1.9;
  return Math.round(candidate * 100) / 100;
}

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Preencha custo, categoria, peso e dimensões para sugerir o preço." },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const session = await getMlSession();
    const netUnitCost =
      input.supplierPrice * (1 - input.discountPercent / 100);
    const purchaseCost = netUnitCost * input.kitQuantity;

    let candidate = psychologicalPrice(
      Math.max(9.9, purchaseCost + input.operatingCost + 3),
    );
    let lastAnalysis = null;
    let lastQuote = null;

    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const [fee, shipping] = await Promise.all([
        getListingPriceQuote({
          accessToken: session.accessToken,
          price: candidate,
          categoryId: input.categoryId,
          listingType: input.listingType,
        }),
        getShippingQuote({
          accessToken: session.accessToken,
          userId: session.account.mercadoLivreUserId,
          price: candidate,
          listingType: input.listingType,
          weightGrams: input.weightGrams,
          heightCm: input.heightCm,
          widthCm: input.widthCm,
          lengthCm: input.lengthCm,
        }),
      ]);

      const analysis = analyzeProfitability({
        productName: input.productName,
        supplierPrice: input.supplierPrice,
        discountPercent: input.discountPercent,
        kitQuantity: input.kitQuantity,
        salePrice: candidate,
        listingType: input.listingType as ListingType,
        commissionPercent: fee.commissionPercent,
        fixedFee: fee.fixedFee,
        shippingCost: shipping.shippingCost,
        operatingCost: input.operatingCost,
        targetMarginPercent: input.targetMarginPercent,
        targetRoiPercent: input.targetRoiPercent,
      });

      lastAnalysis = analysis;
      lastQuote = {
        commissionPercent: Math.round(fee.commissionPercent * 100) / 100,
        fixedFee: fee.fixedFee,
        shippingCost: shipping.shippingCost,
        saleFeeAmount: fee.saleFeeAmount,
        billableWeight: shipping.billableWeight,
        shippingDiscountRate: shipping.discountRate,
      };

      if (
        analysis.profit > 0 &&
        analysis.marginPercent >= input.targetMarginPercent &&
        analysis.roiPercent >= input.targetRoiPercent
      ) {
        return NextResponse.json({
          suggestedPrice: candidate,
          analysis,
          quote: lastQuote,
          attempts: attempt,
          method: "mercado_livre_cost_search",
        });
      }

      const nextByFormula = Number.isFinite(analysis.minimumSuggestedPrice)
        ? analysis.minimumSuggestedPrice
        : candidate * 1.25;
      const nextByStep = candidate + Math.max(2, candidate * 0.08);
      const next = psychologicalPrice(Math.max(nextByFormula, nextByStep));

      if (next <= candidate) {
        candidate = psychologicalPrice(candidate + 2);
      } else {
        candidate = next;
      }

      if (candidate > 50000) break;
    }

    return NextResponse.json(
      {
        error: "Não encontrei um preço saudável dentro da faixa de busca.",
        lastAnalysis,
        lastQuote,
      },
      { status: 422 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao sugerir preço com os custos do Mercado Livre.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
