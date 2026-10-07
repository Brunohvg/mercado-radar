import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Estado real dos passos de primeiro uso. Nada aqui é inventado:
 * cada passo vem de uma contagem no banco.
 */
export async function GET() {
  try {
    const [accounts, extensions, products, withCost] = await Promise.all([
      prisma.mercadoLivreAccount.count(),
      prisma.radarExtensionAccess.count({ where: { revokedAt: null } }),
      prisma.mercadoLivreProduct.count(),
      prisma.mercadoLivreProduct.count({ where: { supplierPrice: { not: null } } }),
    ]);

    return NextResponse.json({
      steps: {
        connected: accounts > 0,
        extension: extensions > 0,
        synced: products > 0,
        cost: withCost > 0,
      },
      counts: { accounts, extensions, products, withCost },
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível ler o estado do onboarding." },
      { status: 503 },
    );
  }
}
