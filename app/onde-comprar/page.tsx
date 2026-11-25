import { AppNavigation } from "@/components/app-navigation";
import { SourcingHome } from "@/components/sourcing/sourcing-home";

import { prisma } from "@/lib/prisma";
import { sourcingUser } from "@/lib/sourcing/service";
import { redirect } from "next/navigation";

export default async function WhereToBuyPage({ searchParams }: { searchParams: Promise<{ referencia?: string }> }) {
  const id = (await searchParams).referencia;
  let reference = null;
  if (typeof id === "string" && /^MLBU?\d{5,15}$/.test(id)) {
    const user = await sourcingUser();
    const existing = await prisma.sourcingOpportunity.findFirst({
      where: { workspaceId: user.workspaceId, mlItemId: id, status: { not: "DESCARTADA" } },
      orderBy: { updatedAt: "desc" }, select: { id: true },
    });
    if (existing) redirect("/onde-comprar/" + existing.id);
    const row = await prisma.marketItem.findUnique({
      where: { workspaceId_id: { workspaceId: user.workspaceId, id } },
      select: { title: true, lastPrice: true, lastSeenAt: true, permalink: true },
    });
    if (row) reference = { id, title: row.title, price: row.lastPrice == null ? null : Number(row.lastPrice), observed: row.lastSeenAt.toISOString(), permalink: row.permalink };
  }
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <SourcingHome reference={reference} />
      </section>
    </main>
  );
}
