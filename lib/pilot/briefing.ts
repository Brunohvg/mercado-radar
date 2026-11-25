// Briefing do Piloto: transforma pedidos, estoque e perguntas em ações do dia,
// ordenadas por dinheiro em jogo. Puro (sem banco nem rede) para ser testável.
// Regra da casa: nada é inventado. Sem custo, o lucro não é afirmado; sem
// imposto cadastrado, a conta usa 0% e diz isso.

export type PilotProduct = {
  mlItemId: string;
  title: string;
  thumbnail: string | null;
  permalink: string | null;
  price: number | null;
  stock: number;
  status: string;
  /** Custo líquido por unidade (já com desconto do fornecedor). */
  cost: number | null;
};

export type PilotSale = {
  mlItemId: string;
  quantity: number;
  unitPrice: number;
  /** Tarifa do ML por unidade, como vem no pedido. */
  saleFee: number | null;
  /** Parte do frete do pedido que cabe a esta linha (rateado pela receita). */
  shippingShare: number | null;
};

export type PilotQuestion = {
  id: string;
  itemId: string;
  text: string;
  dateCreated: string;
};

export type PilotSettings = {
  taxPercent: number | null;
  operatingCost: number;
  targetMarginPercent: number;
  leadTimeDays: number;
  safetyDays: number;
  coverageDays: number;
};

export type PilotActionKind =
  | "RESTOCK"
  | "BELOW_FLOOR"
  | "LOSS"
  | "ADD_COST"
  | "QUESTION"
  | "IDLE_STOCK";

export type PilotAction = {
  id: string;
  kind: PilotActionKind;
  mlItemId: string;
  title: string;
  thumbnail: string | null;
  permalink: string | null;
  headline: string;
  detail: string;
  /** Valor em R$ que justifica a ordem da lista (sempre explicado em stakeLabel). */
  stake: number;
  stakeLabel: string;
  /** Conta mostrada ao vendedor, para ele conferir. */
  formula: string | null;
  cta: { label: string; href: string };
  /** Ação que o Piloto pode executar com um clique (sempre com confirmação). */
  execute?:
    | { type: "PRICE"; current: number; suggested: number }
    | { type: "ANSWER"; questionId: string; question: string };
};

export type ProductEconomics = {
  units: number;
  revenue: number;
  avgPrice: number | null;
  feePerUnit: number | null;
  feeRate: number | null;
  shippingPerUnit: number | null;
  dailyUnits: number;
};

import { priceGuard } from "./guards";

const round2 = (v: number) => Math.round(v * 100) / 100;
const ceilCents = (v: number) => Math.ceil(v * 100 - 1e-6) / 100;
const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function economicsFor(sales: PilotSale[], days: number): ProductEconomics {
  const units = sales.reduce((s, r) => s + r.quantity, 0);
  const revenue = sales.reduce((s, r) => s + r.unitPrice * r.quantity, 0);
  const withFee = sales.filter((r) => r.saleFee != null);
  const feeUnits = withFee.reduce((s, r) => s + r.quantity, 0);
  const feeTotal = withFee.reduce((s, r) => s + (r.saleFee as number) * r.quantity, 0);
  const feeRevenue = withFee.reduce((s, r) => s + r.unitPrice * r.quantity, 0);
  const withShip = sales.filter((r) => r.shippingShare != null);
  const shipUnits = withShip.reduce((s, r) => s + r.quantity, 0);
  const shipTotal = withShip.reduce((s, r) => s + (r.shippingShare as number), 0);
  return {
    units,
    revenue,
    avgPrice: units ? revenue / units : null,
    feePerUnit: feeUnits ? feeTotal / feeUnits : null,
    feeRate: feeRevenue > 0 ? feeTotal / feeRevenue : null,
    shippingPerUnit: shipUnits ? shipTotal / shipUnits : null,
    dailyUnits: units / Math.max(1, days),
  };
}

/**
 * Lucro por venda no preço atual e o piso de preço para a meta de margem.
 * Usa a tarifa e o frete REALIZADOS nos seus pedidos (média do período).
 */
export function unitEconomics(input: {
  price: number;
  cost: number;
  feeRate: number;
  shippingPerUnit: number;
  taxRate: number;
  operatingCost: number;
  targetMargin: number;
}) {
  const variable = input.feeRate + input.taxRate;
  const fixed = input.cost + input.shippingPerUnit + input.operatingCost;
  const profit = input.price * (1 - variable) - fixed;
  const denominator = 1 - variable - input.targetMargin;
  const floor = denominator > 0.05 ? fixed / denominator : null;
  const maxCost =
    input.price * (1 - variable - input.targetMargin) -
    input.shippingPerUnit -
    input.operatingCost;
  return {
    profit: round2(profit),
    marginPercent: input.price > 0 ? round2((profit / input.price) * 100) : null,
    floor: floor == null ? null : round2(floor),
    maxCost: round2(maxCost),
  };
}

export function buildBriefing(input: {
  products: PilotProduct[];
  sales: PilotSale[];
  questions: PilotQuestion[];
  settings: PilotSettings;
  historyComplete: boolean;
  days: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const s = input.settings;
  const taxRate = (s.taxPercent ?? 0) / 100;
  const target = s.targetMarginPercent / 100;
  const actions: PilotAction[] = [];
  const assumptions: string[] = [];
  if (s.taxPercent == null)
    assumptions.push("Imposto não cadastrado: as contas usam 0%. Cadastre em Configurações.");
  if (!input.historyComplete)
    assumptions.push("Histórico de pedidos incompleto: reposição só aparece depois de sincronizar 30 dias.");

  const byItem = new Map<string, PilotSale[]>();
  for (const sale of input.sales) {
    const list = byItem.get(sale.mlItemId) ?? [];
    list.push(sale);
    byItem.set(sale.mlItemId, list);
  }
  const products = new Map(input.products.map((p) => [p.mlItemId, p]));

  for (const product of input.products) {
    if (product.status !== "active" && product.status !== "paused") continue;
    const econ = economicsFor(byItem.get(product.mlItemId) ?? [], input.days);
    const price = product.price ?? econ.avgPrice;
    const base = {
      mlItemId: product.mlItemId,
      title: product.title,
      thumbnail: product.thumbnail,
      permalink: product.permalink,
    };
    const unit =
      price != null && product.cost != null && econ.feeRate != null
        ? unitEconomics({
            price,
            cost: product.cost,
            feeRate: econ.feeRate,
            shippingPerUnit: econ.shippingPerUnit ?? 0,
            taxRate,
            operatingCost: s.operatingCost,
            targetMargin: target,
          })
        : null;
    const unitFormula =
      unit && price != null
        ? `${brl(price)} − tarifa ${(econ.feeRate! * 100).toFixed(1)}% − frete ${brl(econ.shippingPerUnit ?? 0)} − imposto ${(taxRate * 100).toFixed(1)}% − operação ${brl(s.operatingCost)} − custo ${brl(product.cost!)} = ${brl(unit.profit)} por venda`
        : null;

    // 1. Reposição: acaba antes de o fornecedor entregar.
    if (input.historyComplete && econ.dailyUnits > 0 && product.status === "active") {
      const stockDays = product.stock / econ.dailyUnits;
      const window = s.leadTimeDays + s.safetyDays;
      if (stockDays <= window) {
        const qty = Math.max(1, Math.ceil(econ.dailyUnits * Math.max(s.coverageDays, window)) - product.stock);
        const monthly = econ.dailyUnits * 30 * (price ?? 0);
        const buyLimit = unit && unit.maxCost > 0 ? ` pagando até ${brl(unit.maxCost)} por unidade` : "";
        actions.push({
          id: `restock:${product.mlItemId}`,
          kind: "RESTOCK",
          ...base,
          headline:
            product.stock === 0
              ? `Sem estoque: compre ${qty} un.${buyLimit}`
              : `Acaba em ${Math.max(0, Math.floor(stockDays))} dia(s): compre ${qty} un.${buyLimit}`,
          detail: `Vende ${econ.dailyUnits.toFixed(1).replace(".", ",")} un./dia, tem ${product.stock} em estoque e o fornecedor leva ${s.leadTimeDays} dias (+${s.safetyDays} de segurança).`,
          stake: round2(monthly),
          stakeLabel: `${brl(monthly)}/mês em vendas`,
          formula: unit ? `Teto de compra para ${s.targetMarginPercent}% de margem: ${brl(unit.maxCost)}` : null,
          cta: { label: "Onde comprar", href: `/onde-comprar?q=${encodeURIComponent(product.title)}` },
        });
      }
    }

    // 2. Vende sem custo: lucro desconhecido.
    if (product.cost == null && econ.units > 0) {
      actions.push({
        id: `cost:${product.mlItemId}`,
        kind: "ADD_COST",
        ...base,
        headline: "Informe o custo: o lucro deste produto está às cegas",
        detail: `${econ.units} un. vendidas no período sem custo cadastrado.`,
        stake: round2(econ.revenue),
        stakeLabel: `${brl(econ.revenue)} vendidos sem lucro conhecido`,
        formula: null,
        cta: { label: "Informar custo", href: "/vendas" },
      });
    }

    // 3. Prejuízo ou abaixo do piso de margem.
    if (unit && price != null && econ.units > 0) {
      if (unit.profit < 0) {
        const loss = -unit.profit * econ.units;
        actions.push({
          id: `loss:${product.mlItemId}`,
          kind: "LOSS",
          ...base,
          headline: `Cada venda dá prejuízo de ${brl(-unit.profit)}${unit.floor ? `. Piso: ${brl(unit.floor)}` : ""}`,
          detail: `No preço atual (${brl(price)}), com a tarifa e o frete que o Mercado Livre cobrou nos seus pedidos.`,
          stake: round2(loss),
          stakeLabel: `${brl(loss)} perdidos no período`,
          formula: unitFormula,
          cta: { label: "Ver anúncio", href: product.permalink ?? "/anuncios" },
          ...priceExecute(product.price, unit.floor),
        });
      } else if (unit.floor != null && price < unit.floor - 0.01) {
        const gap = (unit.floor - price) * econ.units;
        actions.push({
          id: `floor:${product.mlItemId}`,
          kind: "BELOW_FLOOR",
          ...base,
          headline: `Abaixo da sua meta: lucro de ${brl(unit.profit)} (${unit.marginPercent}%). Piso para ${s.targetMarginPercent}%: ${brl(unit.floor)}`,
          detail: `Preço atual ${brl(price)}. Subir até o piso ou negociar custo abaixo de ${brl(Math.max(0, unit.maxCost))}.`,
          stake: round2(gap),
          stakeLabel: `${brl(gap)} abaixo da meta no período`,
          formula: unitFormula,
          cta: { label: "Ver anúncio", href: product.permalink ?? "/anuncios" },
          ...priceExecute(product.price, unit.floor),
        });
      }
    }

    // 4. Estoque parado: dinheiro empatado sem venda.
    if (
      input.historyComplete &&
      econ.units === 0 &&
      product.stock > 0 &&
      product.cost != null &&
      product.status === "active"
    ) {
      const capital = product.cost * product.stock;
      actions.push({
        id: `idle:${product.mlItemId}`,
        kind: "IDLE_STOCK",
        ...base,
        headline: `${product.stock} un. paradas há ${input.days} dias`,
        detail: "Nenhuma venda paga no período. Considere promoção, Ads ou kit com um produto que vende.",
        stake: round2(capital),
        stakeLabel: `${brl(capital)} empatados`,
        formula: null,
        cta: { label: "Ver anúncio", href: product.permalink ?? "/anuncios" },
      });
    }
  }

  // 5. Perguntas sem resposta: cada uma é um comprador esperando.
  for (const q of input.questions) {
    const product = products.get(q.itemId);
    const hours = Math.max(0, (now.getTime() - Date.parse(q.dateCreated)) / 3_600_000);
    const price = product?.price ?? 0;
    actions.push({
      id: `question:${q.id}`,
      kind: "QUESTION",
      mlItemId: q.itemId,
      title: product?.title ?? q.itemId,
      thumbnail: product?.thumbnail ?? null,
      permalink: product?.permalink ?? null,
      headline: `Comprador esperando há ${hours < 1 ? "menos de 1 h" : `${Math.floor(hours)} h`}: “${q.text.slice(0, 140)}”`,
      detail: "Pergunta sem resposta. Quem responde rápido vende mais.",
      stake: round2(price),
      stakeLabel: price ? `uma venda de ${brl(price)}` : "uma venda",
      formula: null,
      cta: { label: "Abrir anúncio", href: product?.permalink ?? "/anuncios" },
      execute: { type: "ANSWER", questionId: q.id, question: q.text },
    });
  }

  actions.sort((a, b) => b.stake - a.stake);
  return {
    generatedAt: now.toISOString(),
    actions,
    totalStake: round2(actions.reduce((sum, a) => sum + a.stake, 0)),
    assumptions,
  };
}

/** Piso de margem de um anúncio, recalculado no servidor antes de mudar preço. */
export function floorFor(input: {
  product: PilotProduct;
  sales: PilotSale[];
  settings: PilotSettings;
  days: number;
}) {
  const econ = economicsFor(input.sales.filter((s) => s.mlItemId === input.product.mlItemId), input.days);
  const price = input.product.price ?? econ.avgPrice;
  if (price == null || input.product.cost == null || econ.feeRate == null) return null;
  return unitEconomics({
    price,
    cost: input.product.cost,
    feeRate: econ.feeRate,
    shippingPerUnit: econ.shippingPerUnit ?? 0,
    taxRate: (input.settings.taxPercent ?? 0) / 100,
    operatingCost: input.settings.operatingCost,
    targetMargin: input.settings.targetMarginPercent / 100,
  }).floor;
}

/** Só oferece o botão quando a trava de preço aceitaria o piso sugerido. */
function priceExecute(current: number | null, floor: number | null): Pick<PilotAction, "execute"> {
  if (current == null || floor == null) return {};
  const suggested = ceilCents(floor);
  return priceGuard({ current, proposed: suggested, floor: suggested }) == null
    ? { execute: { type: "PRICE", current, suggested } }
    : {};
}
