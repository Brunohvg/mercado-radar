import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pilotSession } from "@/lib/pilot/actions";
import { loadPilotData, PILOT_DAYS } from "@/lib/pilot/load";
import { buildPurchaseOrders } from "@/lib/purchase-order";
import { buildProductDecision } from "@/lib/decision-engine";
import { ECONOMICS_VERSION } from "@/lib/sales-economics";
import { getSalesReport } from "@/lib/sales-report";

export const dynamic = "force-dynamic";

// Só leitura: monta a lista de reposição por fornecedor. Nada é enviado daqui.
export async function GET() {
  let s;
  try { s = await pilotSession(); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sessão inválida." }, { status: 401 });
  }
  try {
    const [data, suppliers, report] = await Promise.all([
      loadPilotData({ workspaceId: s.workspaceId, sellerId: s.sellerId }),
      prisma.sourcingSupplier.findMany({
        where: { workspaceId: s.workspaceId },
        select: { id: true, name: true, leadTimeDays: true, minOrderValue: true, minOrderUnits: true, phone: true, email: true, contactName: true },
      }),
      getSalesReport(s.sellerId, PILOT_DAYS),
    ]);
    const unitsSold: Record<string, number> = {};
    for (const sale of data.sales) unitsSold[sale.mlItemId] = (unitsSold[sale.mlItemId] ?? 0) + sale.quantity;
    const decisions = new Map(data.products.map((product) => {
      const rows = report.items.filter((item) => item.mlItemId === product.mlItemId);
      const known = rows.filter((item) =>
        item.profit != null &&
        item.order.economicsVersion === ECONOMICS_VERSION &&
        item.order.profitabilityStatus === "REALIZED",
      );
      const knownUnits = known.reduce((sum, item) => sum + item.quantity, 0);
      const currentEconomicsVerified = Boolean(
        product.cost != null &&
        product.price != null &&
        knownUnits > 0 &&
        Math.abs(product.cost - known.reduce((sum, item) => sum + Number(item.unitCost ?? 0) * item.quantity, 0) / knownUnits) < 0.01 &&
        Math.abs(product.price - known.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0) / knownUnits) < 0.01 &&
        known.every((item) =>
          item.order.taxPercentApplied != null &&
          Number(item.order.taxPercentApplied) === data.settings.taxPercent &&
          item.order.operatingCostApplied != null &&
          Number(item.order.operatingCostApplied) === data.settings.operatingCost,
        ),
      );
      const windowDays = product.listingCreatedAt
        ? Math.min(30, Math.max(1, (Date.now() - product.listingCreatedAt.getTime()) / 86_400_000))
        : 30;
      const decision = buildProductDecision({
        currentEconomicsVerified,
        cost: product.cost,
        price: product.price,
        stock: product.stock,
        units: rows.reduce((sum, item) => sum + item.quantity, 0),
        revenue: rows.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0),
        knownRevenue: known.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0),
        knownUnits,
        profit: known.reduce((sum, item) => sum + Number(item.profit), 0),
        historyComplete: data.historyComplete,
        windowDays,
        targetMargin: data.settings.targetMarginPercent,
        leadTimeDays: data.settings.leadTimeDays,
        safetyDays: data.settings.safetyDays,
        coverageDays: data.settings.coverageDays,
      });
      return [product.mlItemId, decision] as const;
    }));
    const orders = buildPurchaseOrders({
      products: data.products.map((p) => {
        const decision = decisions.get(p.mlItemId);
        return {
          mlItemId: p.mlItemId, title: p.title, stock: p.stock, cost: p.cost,
          supplier: p.supplier ?? null, status: p.status,
          eligibility: decision ? {
            action: decision.action,
            eligible: decision.action === "RESTOCK",
            reason: decision.reason,
            marginPercent: decision.marginPercent,
            profitCoveragePercent: decision.profitCoveragePercent,
          } : undefined,
        };
      }),
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
