import { NextResponse } from "next/server";
import { intelligenceUser, intelligenceError } from "@/lib/intelligence-access";
import { getWorkspaceSettings } from "@/lib/workspace-settings";
import { getWorkspaceMlAccount } from "@/lib/mercado-livre";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await intelligenceUser();
    const [settings, account] = await Promise.all([
      getWorkspaceSettings(user.workspaceId),
      getWorkspaceMlAccount(user.workspaceId),
    ]);
    return NextResponse.json(
      {
        workspaceId: user.workspaceId,
        accountId: account?.id ?? null,
        accountName: account?.nickname ?? null,
        defaults: {
          taxPercent:
            settings.taxPercent == null ? null : Number(settings.taxPercent),
          operatingCost: Number(settings.operatingCostDefault),
          targetMarginPercent: Number(settings.targetMarginPercent),
          targetRoiPercent: Number(settings.targetRoiPercent),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return intelligenceError(error, "kits/context");
  }
}
