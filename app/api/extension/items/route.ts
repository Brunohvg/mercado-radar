import { NextResponse } from "next/server";
import { z } from "zod";
import { getExtensionSession } from "@/lib/extension-auth";
import {
  getItemsBulk,
  getItemsVisitTotals,
} from "@/lib/mercado-livre";
import { calculateRadarOpportunityScore } from "@/lib/radar-score";

export const dynamic = "force-dynamic";

const schema = z.object({
  ids: z
    .string()
    .trim()
    .min(1)
    .transform((value) =>
      [...new Set(
        value
          .split(",")
          .map((item) => item.trim().toUpperCase())
          .filter((item) => /^MLB\d+$/.test(item)),
      )].slice(0, 50),
    ),
});

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const parsed = schema.safeParse({ ids: url.searchParams.get("ids") ?? "" });

  if (!parsed.success || parsed.data.ids.length === 0) {
    return NextResponse.json({ items: [] });
  }

  try {
    const session = extensionSession.ml;
    const details = await getItemsBulk({
      accessToken: session.accessToken,
      itemIds: parsed.data.ids,
    });

    let visits: Record<string, number> = {};
    try {
      visits = await getItemsVisitTotals({
        accessToken: session.accessToken,
        itemIds: parsed.data.ids,
      });
    } catch {
      visits = {};
    }

    const items = details.map((item) => {
      const itemVisits = visits[item.id] ?? null;
      const intelligence = calculateRadarOpportunityScore({
        price: 0,
        soldQuantity: item.soldQuantity,
        visits: itemVisits,
        dateCreated: item.dateCreated,
        freeShipping: item.freeShipping,
        listingTypeId: item.listingTypeId,
      });

      return {
        id: item.id,
        title: item.title,
        soldQuantity: item.soldQuantity,
        availableQuantity: item.availableQuantity,
        visits: itemVisits,
        categoryId: item.categoryId,
        listingTypeId: item.listingTypeId,
        freeShipping: item.freeShipping,
        permalink: item.permalink,
        thumbnail: item.thumbnail,
        dateCreated: item.dateCreated,
        intelligence,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao consultar dados para a extensão.";

    return NextResponse.json({ error: message, items: [] }, { status: 502 });
  }
}
