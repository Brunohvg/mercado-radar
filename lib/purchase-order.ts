// Pedido de compra por fornecedor: o que vai acabar antes da próxima entrega,
// quanto comprar e quanto custa. A saída estima necessidade de estoque; a
// mensagem de compra só pode ser usada após o gate do motor de decisões.

export type PurchaseEligibility = {
  action: string;
  eligible: boolean;
  reason: string;
  marginPercent: number | null;
  profitCoveragePercent: number | null;
};

export type PoProduct = {
  mlItemId: string;
  title: string;
  stock: number;
  cost: number | null;
  supplier: string | null;
  status: string;
  eligibility?: PurchaseEligibility;
};
export type PoSupplier = {
  id: string;
  name: string;
  leadTimeDays: number | null;
  minOrderValue: number | null;
  minOrderUnits: number | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
};
export type PoSettings = { leadTimeDays: number; safetyDays: number; coverageDays: number };

const round2 = (v: number) => Math.round(v * 100) / 100;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const key = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

export function buildPurchaseOrders(input: {
  products: PoProduct[];
  unitsSold: Record<string, number>;
  days: number;
  settings: PoSettings;
  suppliers: PoSupplier[];
}) {
  const registry = new Map(input.suppliers.map((s) => [key(s.name), s]));
  const groups = new Map<string, { supplier: PoSupplier | null; name: string; lines: ReturnType<typeof line>[] }>();

  function line(p: PoProduct, daily: number, lead: number) {
    const stockDays = p.stock / daily;
    const target = Math.max(input.settings.coverageDays, lead + input.settings.safetyDays);
    const quantity = Math.max(1, Math.ceil(daily * target) - p.stock);
    return {
      mlItemId: p.mlItemId,
      title: p.title,
      stock: p.stock,
      dailyUnits: round2(daily),
      stockDays: Math.floor(stockDays),
      urgent: stockDays <= lead,
      quantity,
      unitCost: p.cost,
      subtotal: p.cost == null ? null : round2(p.cost * quantity),
      purchaseEligible: p.eligibility?.eligible === true,
      eligibilityReason:
        p.eligibility?.reason ?? "Validação financeira pendente.",
      decisionAction: p.eligibility?.action ?? "VALIDATE_PROFIT",
      marginPercent: p.eligibility?.marginPercent ?? null,
      profitCoveragePercent: p.eligibility?.profitCoveragePercent ?? null,
    };
  }

  for (const p of input.products) {
    if (p.status !== "active" && p.status !== "paused") continue;
    const sold = input.unitsSold[p.mlItemId] ?? 0;
    if (sold <= 0) continue;
    const daily = sold / Math.max(1, input.days);
    const supplier = registry.get(key(p.supplier)) ?? null;
    const lead = supplier?.leadTimeDays ?? input.settings.leadTimeDays;
    // Entra quando o estoque não cobre a entrega + a segurança.
    if (p.stock / daily > lead + input.settings.safetyDays) continue;
    const name = supplier?.name ?? p.supplier ?? "Sem fornecedor";
    const k = key(name);
    const group = groups.get(k) ?? { supplier, name, lines: [] };
    group.lines.push(line(p, daily, lead));
    groups.set(k, group);
  }

  return [...groups.values()]
    .map((g) => {
      const lines = g.lines.sort((a, b) => a.stockDays - b.stockDays);
      const known = lines.filter((l) => l.subtotal != null);
      const total = round2(known.reduce((s, l) => s + l.subtotal!, 0));
      const units = lines.reduce((s, l) => s + l.quantity, 0);
      const missingCost = lines.length - known.length;
      const minGap = g.supplier?.minOrderValue != null && total < g.supplier.minOrderValue ? round2(g.supplier.minOrderValue - total) : null;
      const minUnitsGap = g.supplier?.minOrderUnits != null && units < g.supplier.minOrderUnits ? g.supplier.minOrderUnits - units : null;
      return {
        supplierId: g.supplier?.id ?? null,
        name: g.name,
        registered: g.supplier != null,
        contact: g.supplier ? { phone: g.supplier.phone, email: g.supplier.email, name: g.supplier.contactName } : null,
        leadTimeDays: g.supplier?.leadTimeDays ?? null,
        lines,
        units,
        total,
        missingCost,
        minOrderGap: minGap,
        minUnitsGap,
        urgent: lines.some((l) => l.urgent),
      };
    })
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.total - a.total);
}

export type PurchaseOrder = ReturnType<typeof buildPurchaseOrders>[number];

/** Mensagem pronta para mandar ao fornecedor (WhatsApp ou e-mail). */
export function orderMessage(order: Pick<PurchaseOrder, "name" | "contact">, lines: Array<{ title: string; quantity: number; unitCost: number | null; purchaseEligible?: boolean }>) {
  if (lines.some((line) => line.purchaseEligible !== true))
    throw new Error("Remova as linhas não elegíveis antes de preparar a mensagem de compra.");
  const hello = order.contact?.name ? `Olá, ${order.contact.name}! Tudo bem?` : "Olá! Tudo bem?";
  const total = lines.reduce((s, l) => s + (l.unitCost ?? 0) * l.quantity, 0);
  const known = lines.every((l) => l.unitCost != null);
  return [
    hello,
    "Gostaria de fazer um pedido:",
    ...lines.map((l) => `• ${l.quantity} un. — ${l.title}`),
    "",
    known ? `Pelos últimos preços, dá ${brl(round2(total))}. Pode confirmar preço, frete e prazo de entrega?` : "Pode me passar preço, frete e prazo de entrega?",
  ].join("\n");
}
