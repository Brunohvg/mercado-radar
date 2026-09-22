import { NextResponse } from "next/server";
import { z } from "zod";
import { getMlSession, predictCategory } from "@/lib/mercado-livre";

const schema = z.object({
  title: z.string().trim().min(3).max(180),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Informe um nome de produto válido." },
        { status: 400 },
      );
    }

    const session = await getMlSession();
    const suggestions = await predictCategory({
      accessToken: session.accessToken,
      title: parsed.data.title,
      limit: 3,
    });

    return NextResponse.json({
      suggestions,
      best: suggestions[0] ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao detectar categoria no Mercado Livre.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
