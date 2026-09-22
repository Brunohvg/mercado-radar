import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getListingPriceQuote,
  getMlSession,
  getShippingQuote,
} from "@/lib/mercado-livre";

const schema = z.object({
  salePrice: z.coerce.number().positive(),
  categoryId: z.string().min(3).max(40),
  listingType: z.enum(["CLASSIC", "PREMIUM"]),
  weightGrams: z.coerce.number().int().positive().max(100000),
  heightCm: z.coerce.number().positive().max(300),
  widthCm: z.coerce.number().positive().max(300),
  lengthCm: z.coerce.number().positive().max(300),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados de cotação inválidos.", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const session = await getMlSession();
    const input = parsed.data;

    const [fee, shipping] = await Promise.all([
      getListingPriceQuote({
        accessToken: session.accessToken,
        price: input.salePrice,
        categoryId: input.categoryId,
        listingType: input.listingType,
      }),
      getShippingQuote({
        accessToken: session.accessToken,
        userId: session.account.mercadoLivreUserId,
        price: input.salePrice,
        listingType: input.listingType,
        weightGrams: input.weightGrams,
        heightCm: input.heightCm,
        widthCm: input.widthCm,
        lengthCm: input.lengthCm,
      }),
    ]);

    return NextResponse.json({
      listingType: input.listingType,
      commissionPercent:
        Math.round(fee.commissionPercent * 100) / 100,
      fixedFee: fee.fixedFee,
      saleFeeAmount: fee.saleFeeAmount,
      shippingCost: shipping.shippingCost,
      billableWeight: shipping.billableWeight,
      shippingDiscountRate: shipping.discountRate,
      shippingPromotedAmount: shipping.promotedAmount,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao consultar Mercado Livre.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
