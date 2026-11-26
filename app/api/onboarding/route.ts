import { getWorkspaceId } from "@/lib/workspace-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Estado real dos passos de primeiro uso. Nada aqui é inventado:
 * cada passo vem de uma contagem no banco.
 */
export async function GET() {
  try {
    const workspaceId = await getWorkspaceId();
    const sellers = await prisma.mercadoLivreAccount.findMany({ where: { workspaceId }, select: { id: true, mercadoLivreUserId: true } });
    const sellerUserId = { in: sellers.map((s) => s.mercadoLivreUserId) };
    const [accounts, extensions, products, withCost, settings, salesSync, suppliers] = await Promise.all([
      prisma.mercadoLivreAccount.count({ where: { workspaceId } }),
      prisma.radarExtensionAccess.count({ where: { account: { workspaceId }, revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.mercadoLivreProduct.count({ where: { sellerUserId } }),
      prisma.mercadoLivreProduct.count({ where: { sellerUserId, supplierPrice: { not: null } } }),
      prisma.appSettings.findUnique({ where: { id: workspaceId }, select: { taxPercent: true } }),
      prisma.syncRun.count({ where: { workspaceId, kind: "ML_ORDERS", status: "SUCCESS" } }),
      prisma.sourcingSupplier.count({ where: { workspaceId } }),
    ]);

    return NextResponse.json({
      steps: {
        connected: accounts > 0,
        extension: extensions > 0,
        synced: products > 0,
        cost: withCost > 0,
        tax: settings?.taxPercent != null,
        sales: salesSync > 0,
        allCosts: products > 0 && withCost >= products,
        supplier: suppliers > 0,
      },
      counts: { accounts, extensions, products, withCost, suppliers },
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível ler o estado do onboarding." },
      { status: 503 },
    );
  }
}
