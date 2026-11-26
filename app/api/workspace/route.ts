import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/workspace-auth";
import { getWorkspaceSettings } from "@/lib/workspace-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const schema = z.object({
  name: z.string().trim().min(2).max(100),
  taxPercent: z.number().min(0).max(50),
  operatingCostDefault: z.number().min(0).max(10000),
  defaultDiscountPercent: z.number().min(0).max(95),
  targetMarginPercent: z.number().min(10).max(80),
  targetRoiPercent: z.number().min(0).max(500),
  leadTimeDays: z.number().int().min(0).max(180),
  safetyStockDays: z.number().int().min(0).max(180),
  stockCoverageDays: z.number().int().min(1).max(365),
});

export async function GET() {
  const user = await requireUser();
  const settings = await getWorkspaceSettings(user.workspaceId);
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const usage = await prisma.radarWorkspaceUsage.findUnique({
    where: { workspaceId_day: { workspaceId: user.workspaceId, day } },
  });
  return NextResponse.json({
    user: { email: user.email, isOperator: user.isOperator },
    workspace: {
      id: user.workspaceId,
      name: user.workspace.name,
      plan: user.workspace.plan,
      dailyRequestLimit: user.workspace.dailyRequestLimit,
      requestsToday: usage?.requests ?? 0,
    },
    settings: {
      ...settings,
      taxPercent:
        settings.taxPercent == null ? null : Number(settings.taxPercent),
      operatingCostDefault: Number(settings.operatingCostDefault),
      defaultDiscountPercent: Number(settings.defaultDiscountPercent),
      targetMarginPercent: Number(settings.targetMarginPercent),
      targetRoiPercent: Number(settings.targetRoiPercent),
    },
  });
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      {
        error: "Revise os valores. Imposto, custos e prazos devem ser válidos.",
      },
      { status: 400 },
    );
  const { name, ...settings } = parsed.data;
  await prisma.$transaction([
    prisma.radarWorkspace.update({
      where: { id: user.workspaceId },
      data: { name },
    }),
    prisma.appSettings.upsert({
      where: { id: user.workspaceId },
      update: settings,
      create: { id: user.workspaceId, ...settings },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
