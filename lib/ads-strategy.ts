export type AdsAction =
  | "SCALE"
  | "HOLD"
  | "REDUCE"
  | "PAUSE_REVIEW"
  | "LEARN";

export type AdsRecommendation = {
  action: AdsAction;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  label: string;
  reason: string;
};

export function recommendAdsAction(input: {
  cost: number;
  attributedRevenue: number;
  roas: number;
  roasTarget?: number | null;
  profitAfterAds?: number | null;
  profitCoveragePercent?: number | null;
  units?: number | null;
}): AdsRecommendation {
  const cost = Math.max(0, input.cost);
  const revenue = Math.max(0, input.attributedRevenue);
  const roas = Math.max(0, input.roas);
  const coverage = Math.max(
    0,
    Math.min(100, Number(input.profitCoveragePercent ?? 0)),
  );
  const units = Math.max(0, Number(input.units ?? 0));
  const target =
    input.roasTarget != null && input.roasTarget > 0
      ? input.roasTarget
      : null;

  if (cost <= 0) {
    return {
      action: "LEARN",
      confidence: "LOW",
      label: "Sem dados",
      reason:
        "Ainda não há investimento suficiente para recomendar aumento ou corte.",
    };
  }

  if (revenue <= 0 && units <= 0) {
    return {
      action: "PAUSE_REVIEW",
      confidence: "HIGH",
      label: "Revisar / pausar",
      reason:
        "Existe gasto no período sem receita atribuída nem unidades vendidas.",
    };
  }

  if (input.profitAfterAds != null && coverage >= 70) {
    if (input.profitAfterAds < 0) {
      return {
        action: "REDUCE",
        confidence: "HIGH",
        label: "Reduzir",
        reason:
          "Com boa cobertura de custo, o investimento está consumindo mais lucro do que gera.",
      };
    }

    if (target != null && roas < target * 0.8) {
      return {
        action: "REDUCE",
        confidence: "HIGH",
        label: "Reduzir",
        reason:
          "O ROAS está bem abaixo da meta e o Radar já possui boa cobertura do lucro real.",
      };
    }

    if (target != null && roas >= target * 1.2) {
      return {
        action: "SCALE",
        confidence: "HIGH",
        label: "Pode escalar",
        reason:
          "ROAS acima da meta e lucro pós-Ads positivo com boa cobertura de custos.",
      };
    }

    return {
      action: "HOLD",
      confidence: "HIGH",
      label: "Manter",
      reason:
        "A publicidade preserva lucro e não há evidência suficiente para aumentar ou cortar agressivamente.",
    };
  }

  if (target != null) {
    if (roas < target * 0.7) {
      return {
        action: "REDUCE",
        confidence: "MEDIUM",
        label: "Reduzir com cautela",
        reason:
          "O ROAS está muito abaixo da meta, mas a cobertura de lucro real ainda é incompleta.",
      };
    }

    if (roas >= target * 1.3) {
      return {
        action: "HOLD",
        confidence: "MEDIUM",
        label: "Manter e validar",
        reason:
          "O ROAS está forte, porém o Radar ainda precisa de mais custos conhecidos antes de recomendar escala.",
      };
    }
  }

  return {
    action: "LEARN",
    confidence: coverage >= 40 ? "MEDIUM" : "LOW",
    label: "Coletar mais dados",
    reason:
      "A cobertura de lucro real ainda é pequena para uma decisão de orçamento confiável.",
  };
}
