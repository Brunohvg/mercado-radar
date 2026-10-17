import { getMlSession } from "@/lib/mercado-livre";
import { prisma } from "@/lib/prisma";
import { buildCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const session = await getMlSession();
  const days = Math.min(
    365,
    Math.max(
      1,
      Math.floor(Number(new URL(request.url).searchParams.get("days")) || 30),
    ),
  );
  const orders = await prisma.mercadoLivreOrder.findMany({
    where: {
      sellerUserId: session.account.mercadoLivreUserId,
      dateCreated: { gte: new Date(Date.now() - days * 86_400_000) },
    },
    orderBy: { dateCreated: "desc" },
    include: { items: true },
  });
  const decimal = (value: unknown) =>
    value == null ? "" : Number(value).toFixed(2).replace(".", ",");
  const rows: unknown[][] = [
    [
      "Pedido",
      "Data",
      "Status",
      "Moeda",
      "Receita",
      "Tarifa",
      "Frete",
      "Imposto aplicado (%)",
      "Operação aplicada",
      "Lucro antes de Ads",
      "Margem (%)",
      "Apuração",
      "Produtos",
    ],
  ];
  for (const order of orders) {
    const ready =
      order.status === "paid" &&
      !order.refundDetected &&
      order.economicsVersion === 1 &&
      order.profitabilityStatus === "REALIZED";
    rows.push([
      order.mlOrderId,
      order.dateCreated.toISOString(),
      order.status,
      order.currencyId,
      decimal(order.totalAmount),
      decimal(order.marketplaceFeeTotal),
      decimal(order.shippingCost),
      decimal(order.taxPercentApplied),
      decimal(order.operatingCostApplied),
      ready ? decimal(order.profit) : "",
      ready ? decimal(order.marginPercent) : "",
      order.profitabilityStatus,
      order.items.map((i) => `${i.quantity}x ${i.title}`).join(" | "),
    ]);
  }
  return new Response(buildCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="radar-vendas-${days}d.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
