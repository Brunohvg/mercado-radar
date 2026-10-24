import { NextResponse } from "next/server";
import {
  intelligenceUser,
  intelligenceError,
  IntelligenceError,
} from "@/lib/intelligence-access";
import { getWorkspaceMlAccount } from "@/lib/mercado-livre";
import { prisma } from "@/lib/prisma";
import { draftSchema } from "@/lib/intelligence-validation";
import { freezeKitDraft } from "@/lib/kit-quotes";
import { consumeIntelligenceRequest } from "@/lib/intelligence-access";

export const dynamic = "force-dynamic";
async function context() {
  const user = await intelligenceUser();
  const account = await getWorkspaceMlAccount(user.workspaceId);
  return {
    where: { workspaceId: user.workspaceId, accountId: account?.id ?? null },
    limit: user.workspace.dailyRequestLimit,
  };
}
export async function GET() {
  try {
    const { where } = await context();
    const drafts = await prisma.radarResearchDraft.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        kind: true,
        payload: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(
      { drafts },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return intelligenceError(error, "drafts/list");
  }
}
export async function POST(request: Request) {
  try {
    const { where, limit } = await context();
    const text = await request.text();
    if (text.length > 50000)
      throw new IntelligenceError(
        "Rascunho muito grande.",
        413,
        "PAYLOAD_LIMIT",
      );
    const parsed = draftSchema.safeParse(JSON.parse(text));
    if (!parsed.success)
      throw new IntelligenceError(
        "Rascunho inválido. Revise os campos e tente novamente.",
        400,
        "INVALID_INPUT",
      );
    const { id, ...data } = parsed.data;
    // Verify ownership before any external quote for an update.
    if (
      id &&
      !(await prisma.radarResearchDraft.findFirst({
        where: { ...where, id },
        select: { id: true },
      }))
    )
      throw new IntelligenceError(
        "Rascunho não encontrado nesta conta.",
        404,
        "NOT_FOUND",
      );
    if (data.kind === "KIT") {
      await consumeIntelligenceRequest(where.workspaceId, limit);
      data.payload = JSON.parse(
        JSON.stringify(await freezeKitDraft(where.workspaceId, data.payload)),
      );
    }
    if (id) {
      const updated = await prisma.radarResearchDraft.updateMany({
        where: { ...where, id },
        data,
      });
      if (!updated.count)
        throw new IntelligenceError(
          "Rascunho não encontrado nesta conta.",
          404,
          "NOT_FOUND",
        );
      return NextResponse.json({ id, ok: true });
    }
    if (
      (await prisma.radarResearchDraft.count({
        where: { workspaceId: where.workspaceId },
      })) >= 100
    )
      throw new IntelligenceError(
        "Limite de 100 rascunhos atingido. Exclua os que não usa antes de salvar.",
        409,
        "DRAFT_LIMIT",
      );
    const row = await prisma.radarResearchDraft.create({
      data: { ...where, ...data },
    });
    return NextResponse.json({ id: row.id, ok: true }, { status: 201 });
  } catch (error) {
    return intelligenceError(
      error instanceof SyntaxError
        ? new IntelligenceError("JSON inválido.", 400, "INVALID_INPUT")
        : error,
      "drafts/save",
    );
  }
}
export async function DELETE(request: Request) {
  try {
    const { where } = await context();
    const id = new URL(request.url).searchParams.get("id");
    if (!id || id.length > 80)
      throw new IntelligenceError(
        "Informe um rascunho válido.",
        400,
        "INVALID_INPUT",
      );
    const result = await prisma.radarResearchDraft.deleteMany({
      where: { ...where, id },
    });
    if (!result.count)
      throw new IntelligenceError(
        "Rascunho não encontrado nesta conta.",
        404,
        "NOT_FOUND",
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return intelligenceError(error, "drafts/delete");
  }
}
