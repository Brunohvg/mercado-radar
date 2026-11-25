import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pilotSession } from "@/lib/pilot/actions";
import { loadPilotData, PILOT_DAYS } from "@/lib/pilot/load";
import { buildPurchaseOrders } from "@/lib/purchase-order";

export const dynamic = "force-dynamic";

// Só leitura: monta a lista de reposição por fornecedor. Nada é enviado daqui.
export async function GET() {
  let s;
  try { s = await pilotSession(); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sessão inválida." }, { status: 401 });
  }
  try {
    const [data, suppliers] = await Promise.all([
      loadPilotData({ workspaceId: s.workspaceId, sellerId: s.sellerId }),
      prisma.sourcingSupplier.findMany({
        where: { workspaceId: s.workspaceId },
        select: { id: true, name: true, leadTimeDays: true, minOrderValue: true, minOrderUnits: true, phone: true, email: true, contactName: true },
      }),
    ]);
    const unitsSold: Record<string, number> = {};
    for (const sale of data.sales) unitsSold[sale.mlItemId] = (unitsSold[sale.mlItemId] ?? 0) + sale.quantity;
    const orders = buildPurchaseOrders({
      products: data.products.map((p) => ({ mlItemId: p.mlItemId, title: p.title, stock: p.stock, cost: p.cost, supplier: p.supplier ?? null, status: p.status })),
      unitsSold,
      days: PILOT_DAYS,
      settings: { leadTimeDays: data.settings.leadTimeDays, safetyDays: data.settings.safetyDays, coverageDays: data.settings.coverageDays },
      suppliers: suppliers.map((x) => ({ ...x, minOrderValue: x.minOrderValue == null ? null : Number(x.minOrderValue) })),
    });
    return NextResponse.json(
      { orders, historyComplete: data.historyComplete, days: PILOT_DAYS, settings: { leadTimeDays: data.settings.leadTimeDays, safetyDays: data.settings.safetyDays, coverageDays: data.settings.coverageDays } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível montar o pedido." }, { status: 502 });
  }
}
