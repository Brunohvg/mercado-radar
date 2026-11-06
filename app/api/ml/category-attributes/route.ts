import { NextResponse } from "next/server";
import { getMlSession } from "@/lib/mercado-livre";

export const dynamic = "force-dynamic";

export type RequiredCategoryAttribute = {
  id: string; name: string; required: boolean; values: Array<{ id: string; name: string }>;
};

export async function GET(request: Request) {
  const categoryId = new URL(request.url).searchParams.get("categoryId")?.trim() ?? "";
  if (!/^MLB\d{3,12}$/.test(categoryId)) {
    return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
  }
  try {
    const session = await getMlSession();
    const response = await fetch("https://api.mercadolibre.com/categories/" + categoryId + "/attributes", {
      headers: { Authorization: "Bearer " + session.accessToken },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Mercado Livre retornou HTTP " + response.status);
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error("Resposta inesperada de atributos.");
    const attributes: RequiredCategoryAttribute[] = rows
      .filter((a) => a && typeof a.id === "string" && typeof a.name === "string")
      .map((a) => ({
        id: String(a.id),
        name: String(a.name),
        required: Boolean(a.tags?.required || a.tags?.new_required),
        values: (Array.isArray(a.values) ? a.values : [])
          .filter((v: unknown) => v && typeof v === "object")
          .slice(0, 40).map((v: { id?: string; name?: string }) => ({
            id: String(v.id ?? ""), name: String(v.name ?? ""),
          })).filter((v: { name: string }) => v.name),
      }));
    return NextResponse.json({
      categoryId, required: attributes.filter(a => a.required).slice(0, 45),
      additional: attributes.filter(a => !a.required).slice(0, 45),
      source: "MERCADO_LIVRE_CATEGORY_ATTRIBUTES",
    }, { headers: { "cache-control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({
      error: "Não foi possível consultar os atributos obrigatórios desta categoria. Revise a conexão com o Mercado Livre.",
    }, { status: 502 });
  }
}
