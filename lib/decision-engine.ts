export type ProductDecisionInput = {
  cost: number | null;
  price: number | null;
  stock: number;
  units: number;
  revenue: number;
  knownRevenue: number;
  knownUnits: number;
  profit: number;
  historyComplete: boolean;
  currentEconomicsVerified?: boolean;
  windowDays: number;
  targetMargin: number;
  leadTimeDays: number;
  safetyDays: number;
  coverageDays: number;
};
export function buildProductDecision(input: ProductDecisionInput) {
  const margin =
    input.knownRevenue > 0 ? (input.profit / input.knownRevenue) * 100 : null;
  const profitCoverage =
    input.revenue > 0 ? (input.knownRevenue / input.revenue) * 100 : null;
  const financialEvidence =
    input.currentEconomicsVerified !== false &&
    margin != null &&
    (profitCoverage ?? 0) >= 80;
  const dailyUnits = input.historyComplete
    ? input.units / Math.max(1, input.windowDays)
    : null;
  const stockDays =
    dailyUnits != null && dailyUnits > 0 ? input.stock / dailyUnits : null;
  let action = "OBSERVE",
    label = "Observar",
    reason = "Aguarde mais vendas e histórico para decidir.",
    priority = 10;
  if (input.cost == null) {
    action = "ADD_COST";
    label = "Cadastrar custo";
    reason = "Sem custo de compra, não é possível confirmar o lucro.";
    priority = 90;
  } else if (financialEvidence && margin! < 10) {
    action = "STOP_BUYING";
    label = "Revisar margem";
    reason =
      "Margem abaixo de 10%. Revise preço e custos antes de comprar mais.";
    priority = 100;
  } else if (
    input.historyComplete &&
    input.units === 0 &&
    input.stock > 0 &&
    input.windowDays >= 30
  ) {
    action = "IDLE";
    label = "Revisar estoque parado";
    reason = "Há estoque e nenhuma venda paga nos últimos 30 dias.";
    priority = 70;
  } else if (input.currentEconomicsVerified === false) {
    action = "VALIDATE_PROFIT";
    label = "Recalcular margem atual";
    reason =
      "Preço, custo ou imposto mudou desde as vendas apuradas. Revise a margem antes de repor.";
    priority = 80;
  } else if (!financialEvidence) {
    action = "VALIDATE_PROFIT";
    label = "Validar lucro";
    reason =
      "Faltam custos, impostos ou vendas suficientes para recomendar novas compras.";
    priority = 80;
  } else if (margin! < input.targetMargin) {
    action = "WATCH";
    label = "Ajustar rentabilidade";
    reason =
      "A margem conhecida está abaixo da sua meta. Revise antes de repor.";
    priority = 75;
  } else if (
    stockDays != null &&
    stockDays <= input.leadTimeDays + input.safetyDays
  ) {
    action = "RESTOCK";
    label = "Planejar reposição";
    reason = `A cobertura chegou ao prazo de entrega + segurança (${input.leadTimeDays + input.safetyDays} dias).`;
    priority = 85;
  } else if (financialEvidence && input.historyComplete) {
    action = "MAINTAIN";
    label = "Manter";
    reason = "Margem na meta e cobertura fora do ponto de reposição.";
    priority = 20;
  }
  const suggestedReorder =
    action === "RESTOCK" && dailyUnits != null
      ? Math.max(
          0,
          Math.ceil(
            dailyUnits *
              Math.max(
                input.coverageDays,
                input.leadTimeDays + input.safetyDays,
              ),
          ) - input.stock,
        )
      : null;
  return {
    action,
    label,
    reason,
    priority,
    marginPercent: margin,
    profitCoveragePercent: profitCoverage,
    stockDays,
    dailyUnits,
    suggestedReorder,
    capitalNeeded:
      suggestedReorder != null && input.cost != null
        ? suggestedReorder * input.cost
        : null,
    inventoryCapital: input.cost != null ? input.cost * input.stock : null,
    breakEvenRoas: financialEvidence && margin! > 0 ? 100 / margin! : null,
    maxAcosPercent: financialEvidence && margin! > 0 ? margin : null,
    adBudgetRoomPercent: financialEvidence
      ? Math.max(0, margin! - input.targetMargin)
      : null,
  };
}
