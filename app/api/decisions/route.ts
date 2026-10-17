import { getWorkspaceMlAccount } from "@/lib/mercado-livre";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/workspace-auth";
import { getWorkspaceSettings } from "@/lib/workspace-settings";
import { getSalesReport } from "@/lib/sales-report";
import { buildProductDecision } from "@/lib/decision-engine";
import { ECONOMICS_VERSION } from "@/lib/sales-economics";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await requireUser();
  const rawDays = Number(new URL(request.url).searchParams.get("days") ?? 30);
  const days = [7, 30, 90].includes(rawDays) ? rawDays : 30;
  const settings = await getWorkspaceSettings(user.workspaceId);
  const account = await getWorkspaceMlAccount(user.workspaceId);
  if (!account)
    return NextResponse.json({
      connected: false,
      workspaceName: user.workspace.name,
      configured: settings.taxPercent != null,
      summary: null,
      decisions: [],
      days,
    });
  const [report, monthly, products, sync, productSync] = await Promise.all([
    getSalesReport(account.mercadoLivreUserId, days),
    days === 30 ? null : getSalesReport(account.mercadoLivreUserId, 30),
    prisma.mercadoLivreProduct.findMany({
      where: {
        sellerUserId: account.mercadoLivreUserId,
        status: { in: ["active", "paused"] },
      },
    }),
    prisma.syncRun.findFirst({
      where: {
        workspaceId: user.workspaceId,
        kind: "ML_ORDERS",
        status: "SUCCESS",
      },
      orderBy: { finishedAt: "desc" },
    }),
    prisma.syncRun.findFirst({
      where: {
        workspaceId: user.workspaceId,
        kind: "ML_PRODUCTS",
        status: "SUCCESS",
      },
      orderBy: { finishedAt: "desc" },
    }),
  ]);
  const meta = sync?.metadata as { days?: number; truncated?: boolean } | null;
  const historyComplete = Boolean(
    sync?.finishedAt &&
    Date.now() - sync.finishedAt.getTime() < 36 * 60 * 60 * 1000 &&
    (meta?.days ?? 0) >= 30 &&
    meta?.truncated === false,
  );
  const items = (monthly ?? report).items;
  const decisions = products
    .map((product) => {
      const rows = items.filter((i) => i.mlItemId === product.mlItemId);
      const known = rows.filter(
        (i) =>
          i.profit != null &&
          i.order.economicsVersion === ECONOMICS_VERSION &&
          i.order.profitabilityStatus === "REALIZED",
      );
      const windowDays = product.listingCreatedAt
        ? Math.min(
            30,
            Math.max(
              1,
              (Date.now() - product.listingCreatedAt.getTime()) / 86_400_000,
            ),
          )
        : 30;
      const knownUnits = known.reduce((sum, i) => sum + i.quantity, 0);
      const currentCost =
        product.supplierPrice == null
          ? null
          : Number(product.supplierPrice) *
            (1 - Number(product.discountPercent) / 100);
      const costBasis =
        knownUnits > 0
          ? known.reduce(
              (sum, i) => sum + Number(i.unitCost ?? 0) * i.quantity,
              0,
            ) / knownUnits
          : null;
      const saleBasis =
        knownUnits > 0
          ? known.reduce(
              (sum, i) => sum + Number(i.unitPrice) * i.quantity,
              0,
            ) / knownUnits
          : null;
      const currentEconomicsVerified =
        currentCost != null &&
        costBasis != null &&
        saleBasis != null &&
        product.currentPrice != null &&
        Math.abs(currentCost - costBasis) < 0.01 &&
        Math.abs(Number(product.currentPrice) - saleBasis) < 0.01 &&
        known.every(
          (i) =>
            i.order.taxPercentApplied != null &&
            Number(i.order.taxPercentApplied) === Number(settings.taxPercent) &&
            i.order.operatingCostApplied != null &&
            Number(i.order.operatingCostApplied) ===
              Number(settings.operatingCostDefault),
        );
      const decision = buildProductDecision({
        currentEconomicsVerified,
        cost:
          product.supplierPrice == null
            ? null
            : Number(product.supplierPrice) *
              (1 - Number(product.discountPercent) / 100),
        price:
          product.currentPrice == null ? null : Number(product.currentPrice),
        stock: product.availableQuantity,
        units: rows.reduce((sum, i) => sum + i.quantity, 0),
        revenue: rows.reduce(
          (sum, i) => sum + Number(i.unitPrice) * i.quantity,
          0,
        ),
        knownRevenue: known.reduce(
          (sum, i) => sum + Number(i.unitPrice) * i.quantity,
          0,
        ),
        knownUnits: known.reduce((sum, i) => sum + i.quantity, 0),
        profit: known.reduce((sum, i) => sum + Number(i.profit), 0),
        historyComplete,
        windowDays,
        targetMargin: Number(settings.targetMarginPercent),
        leadTimeDays: settings.leadTimeDays,
        safetyDays: settings.safetyStockDays,
        coverageDays: settings.stockCoverageDays,
      });
      return {
        mlItemId: product.mlItemId,
        title: product.title,
        thumbnail: product.thumbnail,
        stock: product.availableQuantity,
        status: product.status,
        units: rows.reduce((sum, i) => sum + i.quantity, 0),
        ...decision,
      };
    })
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (b.inventoryCapital ?? 0) - (a.inventoryCapital ?? 0),
    );
  return NextResponse.json({
    connected: true,
    workspaceName: user.workspace.name,
    nickname: account.nickname,
    configured: settings.taxPercent != null,
    summary: report.summary,
    decisions,
    days,
    historyComplete,
    lastSyncedAt: sync?.finishedAt ?? null,
    productsSyncedAt: productSync?.finishedAt ?? null,
    reportComplete: Boolean(
      sync?.finishedAt &&
      Date.now() - sync.finishedAt.getTime() < 36 * 60 * 60 * 1000 &&
      (meta?.days ?? 0) >= days &&
      meta?.truncated === false,
    ),
  });
}
