import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMlSession, getUnansweredQuestions } from "@/lib/mercado-livre";
import { getWorkspaceSettings } from "@/lib/workspace-settings";
import { buildBriefing, type PilotSale } from "@/lib/pilot/briefing";

export const dynamic = "force-dynamic";

const DAYS = 30;

// Briefing do Piloto. Só leitura: nada aqui altera anúncios.
export async function GET() {
  let session;
  try {
    session = await getMlSession();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Conecte o Mercado Livre em Integrações." },
      { status: 409 },
    );
  }
  const seller = session.account.mercadoLivreUserId;
  const from = new Date(Date.now() - DAYS * 86_400_000);
  const [settings, products, orders, sync, questions] = await Promise.all([
    getWorkspaceSettings(session.account.workspaceId),
    prisma.mercadoLivreProduct.findMany({
      where: { sellerUserId: seller, status: { in: ["active", "paused"] } },
    }),
    prisma.mercadoLivreOrder.findMany({
      where: { sellerUserId: seller, status: "paid", refundDetected: false, dateCreated: { gte: from } },
      select: { shippingCost: true, items: { select: { mlItemId: true, quantity: true, unitPrice: true, saleFee: true } } },
    }),
    prisma.syncRun.findFirst({
      where: { workspaceId: session.account.workspaceId, kind: "ML_ORDERS", status: "SUCCESS" },
      orderBy: { finishedAt: "desc" },
    }),
    getUnansweredQuestions({ accessToken: session.accessToken, sellerId: seller, limit: 20 })
      .then((rows) => ({ rows, ok: true }))
      .catch(() => ({ rows: [], ok: false })),
  ]);
  const meta = sync?.metadata as { days?: number; truncated?: boolean } | null;
  const historyComplete = Boolean(
    sync?.finishedAt &&
      Date.now() - sync.finishedAt.getTime() < 36 * 3_600_000 &&
      (meta?.days ?? 0) >= DAYS &&
      meta?.truncated === false,
  );

  // Frete do pedido rateado entre as linhas pela receita de cada uma.
  const sales: PilotSale[] = orders.flatMap((order) => {
    const total = order.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
    return order.items.map((item) => ({
      mlItemId: item.mlItemId,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      saleFee: item.saleFee == null ? null : Number(item.saleFee),
      shippingShare:
        order.shippingCost == null || total <= 0
          ? null
          : (Number(order.shippingCost) * Number(item.unitPrice) * item.quantity) / total,
    }));
  });

  const briefing = buildBriefing({
    products: products.map((p) => ({
      mlItemId: p.mlItemId,
      title: p.title,
      thumbnail: p.thumbnail,
      permalink: p.permalink,
      price: p.currentPrice == null ? null : Number(p.currentPrice),
      stock: p.availableQuantity,
      status: p.status,
      cost: p.supplierPrice == null ? null : Number(p.supplierPrice) * (1 - Number(p.discountPercent) / 100),
    })),
    sales,
    questions: questions.rows,
    settings: {
      taxPercent: settings.taxPercent == null ? null : Number(settings.taxPercent),
      operatingCost: Number(settings.operatingCostDefault),
      targetMarginPercent: Number(settings.targetMarginPercent),
      leadTimeDays: settings.leadTimeDays,
      safetyDays: settings.safetyStockDays,
      coverageDays: settings.stockCoverageDays,
    },
    historyComplete,
    days: DAYS,
  });
  if (!questions.ok) briefing.assumptions.push("Não consegui ler as perguntas agora; elas ficam fora deste briefing.");
  return NextResponse.json(
    { ...briefing, days: DAYS, historyComplete, syncedAt: sync?.finishedAt ?? null },
    { headers: { "cache-control": "private, no-store" } },
  );
}
