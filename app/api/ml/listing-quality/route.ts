import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pilotSession } from "@/lib/pilot/actions";
import { loadListingQuality } from "@/lib/listing-quality-load";
import { geminiConfiguration } from "@/lib/ai/gemini-listing";

export const dynamic = "force-dynamic";

// Só leitura. Sem ?id devolve a lista de anúncios para escolher.
export async function GET(request: Request) {
  let s;
  try { s = await pilotSession(); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sessão inválida." }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id")?.trim().toUpperCase() ?? "";
  if (!id) {
    const products = await prisma.mercadoLivreProduct.findMany({
      where: { sellerUserId: s.sellerId, status: { in: ["active", "paused"] } },
      select: { mlItemId: true, title: true, thumbnail: true, currentPrice: true, status: true },
      orderBy: [{ status: "asc" }, { title: "asc" }],
      take: 500,
    });
    return NextResponse.json({ products: products.map((p) => ({ ...p, currentPrice: p.currentPrice == null ? null : Number(p.currentPrice) })) });
  }
  if (!/^MLB\d{5,}$/.test(id)) return NextResponse.json({ error: "Anúncio inválido." }, { status: 400 });
  try {
    const data = await loadListingQuality(s, id);
    if (!data) return NextResponse.json({ error: "Anúncio não encontrado nesta conta." }, { status: 404 });
    const ai = geminiConfiguration();
    return NextResponse.json({ ...data, ai: { configured: ai.configured, message: ai.message } }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível ler o anúncio." }, { status: 502 });
  }
}
