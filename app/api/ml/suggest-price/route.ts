import { getWorkspaceSettings } from "@/lib/workspace-settings";
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
  logisticType: z.enum(["drop_off", "cross_docking", "xd_drop_off", "fulfillment", "self_service"]).default("drop_off"),
  freeShipping: z.boolean().default(true),
  categoryId: z.string().min(3).max(40),
  weightGrams: z.coerce.number().int().positive().max(100000),
  heightCm: z.coerce.number().positive().max(300),
  widthCm: z.coerce.number().positive().max(300),
  lengthCm: z.coerce.number().positive().max(300),
  taxPercent: z.coerce.number().min(0).max(50).optional(),
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
    const settings = await getWorkspaceSettings(session.account.workspaceId);
    if (input.taxPercent == null && settings.taxPercent == null) return NextResponse.json({ error: "Confirme seu imposto em Metas e configurações." }, { status: 422 });
    const taxPercent = input.taxPercent ?? Number(settings.taxPercent);
    const netUnitCost =
      input.supplierPrice * (1 - input.discountPercent / 100);
    const purchaseCost = netUnitCost * input.kitQuantity;

    let candidate = psychologicalPrice(
      Math.max(9.9, purchaseCost + input.operatingCost + 3),
    );
    let lastAnalysis = null;
    let lastQuote = null;

    for (let attempt = 1; attempt <= 12; attempt += 1) {
      // New products in eligible ME2 shipping must honor mandatory free
      // shipping above the Brazilian threshold. The real seller quote still
      // determines the cost; no discount is invented locally.
      const effectiveFreeShipping = candidate >= 79 ? true : input.freeShipping;
      const [fee, shipping] = await Promise.all([
        getListingPriceQuote({
          accessToken: session.accessToken,
          price: candidate,
          categoryId: input.categoryId,
          listingType: input.listingType,
          logisticType: input.logisticType,
          shippingMode: "me2",
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
          logisticType: input.logisticType,
          shippingMode: "me2",
          freeShipping: effectiveFreeShipping,
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
        quotedSaleFeeAmount: fee.saleFeeAmount,
        shippingCost: shipping.shippingCost,
        taxPercent,
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
        logisticType: input.logisticType,
        freeShipping: effectiveFreeShipping,
        feeSource: "ML_SELLER_LISTING_PRICES",
        shippingSource: "ML_SELLER_SHIPPING_OPTIONS_FREE",
        shippingCostKind: "ESTIMATE_NET_AFTER_DISCOUNT",
        shippingGrossReference: shipping.promotedAmount,
        mandatoryFreeShippingApplied: candidate >= 79 && !input.freeShipping,
        sellerUserId: session.account.mercadoLivreUserId,
        billableWeight: shipping.billableWeight,
        shippingDiscountRate: shipping.discountRate,
      };

      if (
        analysis.profit > 0 &&
        analysis.marginPercent >= input.targetMarginPercent &&
        analysis.roiPercent >= input.targetRoiPercent
      ) {
        // Compare the two plans at exactly the same listing price, never
        // compare each plan's independently suggested minimum price.
        const otherType = input.listingType === "CLASSIC" ? "PREMIUM" : "CLASSIC";
        let comparison = null;
        try {
          const [otherFee, otherShipping] = await Promise.all([
            getListingPriceQuote({
              accessToken: session.accessToken, price: candidate, categoryId: input.categoryId,
              listingType: otherType, logisticType: input.logisticType, shippingMode: "me2",
            }),
            getShippingQuote({
              accessToken: session.accessToken, userId: session.account.mercadoLivreUserId,
              price: candidate, listingType: otherType, weightGrams: input.weightGrams,
              heightCm: input.heightCm, widthCm: input.widthCm, lengthCm: input.lengthCm,
              logisticType: input.logisticType, shippingMode: "me2",
              freeShipping: effectiveFreeShipping,
            }),
          ]);
          const alternate = analyzeProfitability({
            productName: input.productName, supplierPrice: input.supplierPrice,
            discountPercent: input.discountPercent, kitQuantity: input.kitQuantity,
            salePrice: candidate, listingType: otherType,
            commissionPercent: otherFee.commissionPercent, fixedFee: otherFee.fixedFee,
            quotedSaleFeeAmount: otherFee.saleFeeAmount,
            shippingCost: otherShipping.shippingCost, taxPercent,
            operatingCost: input.operatingCost,
            targetMarginPercent: input.targetMarginPercent,
            targetRoiPercent: input.targetRoiPercent,
          });
          comparison = {
            price: candidate,
            selected: {
              listingType: input.listingType, saleFeeAmount: fee.saleFeeAmount,
              shippingCost: shipping.shippingCost, profit: analysis.profit,
            },
            alternative: {
              listingType: otherType, saleFeeAmount: otherFee.saleFeeAmount,
              shippingCost: otherShipping.shippingCost, profit: alternate.profit,
            },
            cheaperPlan: analysis.profit >= alternate.profit ? input.listingType : otherType,
            observation: "Comparação no mesmo preço; diferenças de frete ou benefícios podem alterar o resultado.",
          };
        } catch {
          // The primary quote is useful even if another plan is unavailable.
        }
        return NextResponse.json({
          suggestedPrice: candidate,
          analysis, comparison,
          quote: lastQuote,
          attempts: attempt,
          method: "mercado_livre_cost_search",
        });
      }

      const nextByFormula = analysis.minimumSuggestedPrice != null && Number.isFinite(analysis.minimumSuggestedPrice)
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
