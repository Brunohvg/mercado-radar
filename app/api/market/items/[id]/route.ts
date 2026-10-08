import { NextResponse } from "next/server";
import { getMarketItemHistory } from "@/lib/market-intel";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^MLB\d{6,}$/i.test(id)) {
    return NextResponse.json({ error: "ID de anúncio inválido." }, { status: 400 });
  }

  try {
    const history = await getMarketItemHistory(id);
    if (!history) {
      return NextResponse.json(
        { error: "O Radar ainda não observou este anúncio." },
        { status: 404 },
      );
    }
    return NextResponse.json(history);
  } catch (error) {
    console.error("[market/items/:id]", error);
    return NextResponse.json(
      { error: "Não foi possível carregar o histórico deste anúncio." },
      { status: 500 },
    );
  }
}
