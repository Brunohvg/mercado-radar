/**
 * Radar por capital disponível: entre as oportunidades já estudadas, quais
 * cabem no dinheiro, no perfil de fornecedor e na margem desejada.
 * Só considera oportunidades com custo de fornecedor registrado.
 */
import type { Viability } from "@/lib/sourcing/viability";

export type SupplierProfile = "TODOS" | "CPF" | "CNPJ" | "FABRICA";

export type CapitalCandidate = {
  opportunityId: string;
  title: string;
  viability: Viability;
  supplierKind: string;
  sellsToCpf: boolean | null;
  requiresCnpj: boolean | null;
};

export type CapitalMatch = CapitalCandidate & {
  fits: boolean;
  reasons: string[];
};

export function matchByCapital(
  candidates: CapitalCandidate[],
  filters: { capital: number; profile: SupplierProfile; minMarginPercent: number },
): { matches: CapitalMatch[]; excluded: CapitalMatch[] } {
  const evaluated = candidates.map((candidate) => {
    const reasons: string[] = [];
    const v = candidate.viability;
    if (v.order.capital > filters.capital)
      reasons.push(
        `Lote simulado custa ${v.order.capital.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      );
    if (v.status === "CAPITAL_INSUFICIENTE") reasons.push("Capital insuficiente para o pedido mínimo");
    if (!v.perSale) reasons.push("Margem ainda não calculada");
    else if (v.perSale.marginPercent < filters.minMarginPercent)
      reasons.push(`Margem de ${v.perSale.marginPercent.toFixed(1)}%`);
    if (v.purchasePending.length) reasons.push(`Confirme: ${v.purchasePending.join(", ")}`);
    if (filters.profile === "CPF" && (candidate.sellsToCpf !== true || candidate.requiresCnpj === true))
      reasons.push(candidate.sellsToCpf === false ? "Não vende para CPF" : candidate.requiresCnpj === true ? "Exige CNPJ" : "Venda para CPF não confirmada");
    if (filters.profile === "FABRICA" && candidate.supplierKind !== "FABRICANTE")
      reasons.push("Fornecedor não é o fabricante");
    if (filters.profile === "CNPJ" && candidate.requiresCnpj === false && candidate.supplierKind === "LOJA_ML")
      reasons.push("Loja de varejo, não atacado para CNPJ");
    return { ...candidate, fits: reasons.length === 0, reasons };
  });
  const byMargin = (a: CapitalMatch, b: CapitalMatch) =>
    (b.viability.perSale?.marginPercent ?? -Infinity) -
    (a.viability.perSale?.marginPercent ?? -Infinity);
  return {
    matches: evaluated.filter((item) => item.fits).sort(byMargin),
    excluded: evaluated.filter((item) => !item.fits).sort(byMargin),
  };
}
