import { NextResponse } from "next/server";
import { z } from "zod";
import { getExtensionSession } from "@/lib/extension-auth";
import { opportunitySchema } from "@/lib/sourcing/service";
import { createOpportunity } from "@/lib/sourcing/create";
import { getPublicOrigin } from "@/lib/public-url";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  itemId: z.string().trim().regex(/^MLBU?\d{5,15}$/i),
  title: z.string().trim().min(2).max(200),
  permalink: opportunitySchema.shape.permalink,
  price: z.number().positive().max(10_000_000).nullable().optional(),
  listingType: z.enum(["CLASSIC", "PREMIUM"]).optional(),
});

/** Cria a oportunidade a partir do anúncio aberto e devolve o link do painel. */
export async function POST(request: Request) {
  let session;
  try {
    session = await getExtensionSession(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Limite da extensão atingido." },
      { status: 429 },
    );
  }
  if (!session)
    return NextResponse.json({ error: "Sessão da extensão inválida ou expirada." }, { status: 401 });
  try {
    const text = await request.text();
    if (text.length > 5000) return NextResponse.json({ error: "Dados muito grandes." }, { status: 413 });
    const parsed = schema.safeParse(JSON.parse(text || "{}"));
    if (!parsed.success) return NextResponse.json({ error: "Anúncio inválido." }, { status: 400 });
    const input = parsed.data;
    const result = await createOpportunity(
      session.account.workspaceId,
      {
        title: input.title,
        mlItemId: input.itemId.toUpperCase(),
        permalink: input.permalink ?? null,
        listingType: input.listingType,
        // O preço da página só entra se a API não informar; registrado como leitura do anúncio.
      },
      session.ml.accessToken,
    );
    let opportunity = result.opportunity;
    if (!result.reused && opportunity.referencePrice == null && input.price) {
      opportunity = await prisma.sourcingOpportunity.update({
        where: { id: opportunity.id },
        data: { referencePrice: input.price, referenceSource: "ANUNCIO", referenceAt: new Date() },
      });
    }
    return NextResponse.json({
      id: opportunity.id,
      reused: result.reused,
      notes: result.notes,
      url: `${getPublicOrigin(request)}/onde-comprar/${opportunity.id}`,
      identity: {
        brand: opportunity.brand,
        model: opportunity.model,
        gtin: opportunity.gtin,
        packQuantity: opportunity.packQuantity,
        referencePrice: opportunity.referencePrice == null ? null : Number(opportunity.referencePrice),
      },
    });
  } catch (error) {
    console.error("[extension/sourcing]", error);
    return NextResponse.json({ error: "Não foi possível salvar a oportunidade agora." }, { status: 500 });
  }
}
