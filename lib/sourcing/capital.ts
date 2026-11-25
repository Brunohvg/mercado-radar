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
    const minimumCapital =
      v.order.minimumUnits * (v.order.goodsCost / Math.max(1, v.order.units)) +
      v.order.extraCosts;
    if (minimumCapital > filters.capital)
      reasons.push(
        `Pedido mínimo custa ${minimumCapital.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      );
    if (!v.perSale) reasons.push("Margem ainda não calculada");
    else if (v.perSale.marginPercent < filters.minMarginPercent)
      reasons.push(`Margem de ${v.perSale.marginPercent.toFixed(1)}%`);
    if (v.source === "ESTIMATIVA_USUARIO") reasons.push("Custo é estimativa, não cotação");
    if (filters.profile === "CPF" && candidate.sellsToCpf !== true)
      reasons.push(candidate.sellsToCpf === false ? "Não vende para CPF" : "Venda para CPF não confirmada");
    if (filters.profile === "FABRICA" && candidate.supplierKind !== "FABRICANTE")
      reasons.push("Fornecedor não é o fabricante");
    if (filters.profile === "CNPJ" && candidate.requiresCnpj === false && candidate.supplierKind === "LOJA_ML")
      reasons.push("Loja de varejo, não atacado para CNPJ");
    const blocking = reasons.filter((reason) => reason !== "Custo é estimativa, não cotação");
    return { ...candidate, fits: blocking.length === 0, reasons };
  });
  const byMargin = (a: CapitalMatch, b: CapitalMatch) =>
    (b.viability.perSale?.marginPercent ?? -Infinity) -
    (a.viability.perSale?.marginPercent ?? -Infinity);
  return {
    matches: evaluated.filter((item) => item.fits).sort(byMargin),
    excluded: evaluated.filter((item) => !item.fits).sort(byMargin),
  };
}
