import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkspaceMlAccount, getMlSessionForAccount } from "@/lib/mercado-livre";
import {
  sourcingUser,
  sourcingError,
  readJson,
  opportunitySchema,
  serializeOpportunity,
  noStore,
} from "@/lib/sourcing/service";
import { createOpportunity } from "@/lib/sourcing/create";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await sourcingUser();
    const rows = await prisma.sourcingOpportunity.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { _count: { select: { quotes: true } } },
    });
    return NextResponse.json(
      {
        opportunities: rows.map((row) => ({
          ...serializeOpportunity(row),
          quoteCount: row._count.quotes,
          supplierCount: row.supplierIds.length,
        })),
      },
      noStore,
    );
  } catch (error) {
    return sourcingError(error, "opportunities/list");
  }
}

export async function POST(request: Request) {
  try {
    const user = await sourcingUser();
    const input = await readJson(request, opportunitySchema);
    let accessToken: string | null = null;
    if (input.mlItemId) {
      const account = await getWorkspaceMlAccount(user.workspaceId);
      if (account) {
        try {
          accessToken = (await getMlSessionForAccount(account.id)).accessToken;
        } catch {
          accessToken = null;
        }
      }
    }
    const result = await createOpportunity(user.workspaceId, input, accessToken);
    return NextResponse.json(
      { opportunity: serializeOpportunity(result.opportunity), reused: result.reused, notes: result.notes },
      { status: result.reused ? 200 : 201, ...noStore },
    );
  } catch (error) {
    return sourcingError(error, "opportunities/create");
  }
}
