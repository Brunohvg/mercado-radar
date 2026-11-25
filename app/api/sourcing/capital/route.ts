import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sourcingUser, sourcingError, readJson, loadOpportunityView, noStore } from "@/lib/sourcing/service";
import { matchByCapital, type CapitalCandidate } from "@/lib/sourcing/capital";

export const dynamic = "force-dynamic";

const schema = z.object({
  capital: z.number().positive("Informe quanto quer investir.").max(10_000_000),
  profile: z.enum(["TODOS", "CPF", "CNPJ", "FABRICA"]),
  minMarginPercent: z.number().min(0).max(90),
});

export async function POST(request: Request) {
  try {
    const user = await sourcingUser();
    const filters = await readJson(request, schema);
    const rows = await prisma.sourcingOpportunity.findMany({
      where: { workspaceId: user.workspaceId, status: { not: "DESCARTADA" }, quotes: { some: {} } },
      orderBy: { updatedAt: "desc" },
      take: 60,
      select: { id: true },
    });
    const candidates: CapitalCandidate[] = [];
    for (const row of rows) {
      const view = await loadOpportunityView(user.workspaceId, row.id);
      // Cada cotação vira um candidato; o pedido mínimo é comparado ao capital informado.
      for (const quote of view.quotes) {
        const supplier = view.suppliers.find((item) => item.id === quote.supplierId);
        if (!supplier) continue;
        candidates.push({
          opportunityId: view.opportunity.id,
          title: `${view.opportunity.title} · ${supplier.name}`,
          viability: quote.viability,
          supplierKind: supplier.kind,
          sellsToCpf: supplier.sellsToCpf,
          requiresCnpj: supplier.requiresCnpj,
        });
      }
    }
    const result = matchByCapital(candidates, filters);
    return NextResponse.json({ ...result, evaluated: candidates.length, opportunities: rows.length }, noStore);
  } catch (error) {
    return sourcingError(error, "capital");
  }
}
