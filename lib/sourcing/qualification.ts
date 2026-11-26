/**
 * Qualificação do fornecedor pelos critérios do brief. Cada critério é
 * confirmado, a confirmar ou não atende. Não há nota inventada: o resultado
 * conta o que foi comprovado e aponta o próximo dado a pedir.
 */
import type { CnpjCheck } from "@/lib/sourcing/cnpj";

export type CriterionState = "OK" | "PENDENTE" | "FALHA";
export type Importance = "ESSENCIAL" | "ALTA";

export type Criterion = {
  key: string;
  label: string;
  importance: Importance;
  state: CriterionState;
  detail: string;
};

export type SupplierFacts = {
  cnpj: string | null;
  cnpjCheck: CnpjCheck | null;
  sellsToCpf: boolean | null;
  requiresCnpj: boolean | null;
  issuesInvoice: boolean | null;
  servesSmall: boolean | null;
  minOrderValue: number | null;
  minOrderUnits: number | null;
  leadTimeDays: number | null;
  state: string | null;
  reputationNote: string | null;
};

export type QuoteFacts = {
  unitPrice: number;
  source: "COTACAO_RECEBIDA" | "PRECO_PUBLICADO" | "ESTIMATIVA_USUARIO";
  exactMatch: boolean | null;
  freightCost: number | null;
} | null;

export type Qualification = {
  level: "QUALIFICADO" | "PARCIAL" | "INSUFICIENTE" | "BLOQUEADO";
  label: string;
  confirmed: number;
  total: number;
  criteria: Criterion[];
  nextAsk: string | null;
};

const yesNo = (
  value: boolean | null,
  ok: string,
  fail: string,
  pending: string,
): [CriterionState, string] =>
  value === true ? ["OK", ok] : value === false ? ["FALHA", fail] : ["PENDENTE", pending];

export function qualifySupplier(
  supplier: SupplierFacts,
  quote: QuoteFacts,
  context: { buyerHasCnpj: boolean | null; buyerState: string | null } = {
    buyerHasCnpj: null,
    buyerState: null,
  },
): Qualification {
  const criteria: Criterion[] = [];

  criteria.push({
    key: "match",
    label: "Correspondência exata do produto",
    importance: "ESSENCIAL",
    ...(() => {
      const [state, detail] = yesNo(
        quote?.exactMatch ?? null,
        "Fornecedor confirmou o mesmo produto",
        "Produto diferente ou equivalente",
        "Confirmar marca, modelo e quantidade",
      );
      return { state, detail };
    })(),
  });

  const check = supplier.cnpjCheck;
  criteria.push({
    key: "cnpj",
    label: "CNPJ e situação cadastral",
    importance: "ESSENCIAL",
    state: !check ? "PENDENTE" : check.status === "ATIVA" ? "OK" : "FALHA",
    detail: !check
      ? supplier.cnpj
        ? "CNPJ informado, ainda não verificado"
        : "Pedir o CNPJ"
      : check.status === "ATIVA"
        ? `Ativa na base pública (${new Date(check.checkedAt).toLocaleDateString("pt-BR")})`
        : `Situação ${check.statusLabel ?? check.status}`,
  });

  criteria.push({
    key: "price",
    label: "Preço de atacado",
    importance: "ESSENCIAL",
    state: !quote
      ? "PENDENTE"
      : quote.source === "ESTIMATIVA_USUARIO"
        ? "PENDENTE"
        : "OK",
    detail: !quote
      ? "Solicitar cotação"
      : quote.source === "COTACAO_RECEBIDA"
        ? "Cotação recebida do fornecedor"
        : quote.source === "PRECO_PUBLICADO"
          ? "Preço publicado pelo fornecedor"
          : "Só há estimativa sua; confirmar com o fornecedor",
  });

  criteria.push({
    key: "moq",
    label: "Pedido mínimo",
    importance: "ALTA",
    state:
      supplier.minOrderUnits != null || supplier.minOrderValue != null
        ? "OK"
        : "PENDENTE",
    detail:
      supplier.minOrderUnits != null || supplier.minOrderValue != null
        ? [
            supplier.minOrderUnits != null ? `${supplier.minOrderUnits} un.` : null,
            supplier.minOrderValue != null
              ? supplier.minOrderValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : "Perguntar o pedido mínimo",
  });

  {
    let state: CriterionState = "PENDENTE";
    let detail = "Perguntar se vende para CPF ou exige CNPJ";
    if (supplier.requiresCnpj === true && context.buyerHasCnpj === false) {
      state = "FALHA";
      detail = "Exige CNPJ e você comprará como CPF";
    } else if (supplier.sellsToCpf === true || supplier.servesSmall === true) {
      state = "OK";
      detail = supplier.sellsToCpf ? "Vende para CPF" : "Atende pequenos revendedores";
    } else if (supplier.requiresCnpj === true) {
      state = context.buyerHasCnpj ? "OK" : "PENDENTE";
      detail = "Exige CNPJ";
    } else if (supplier.servesSmall === false) {
      state = "FALHA";
      detail = "Não atende pequenos revendedores";
    }
    criteria.push({
      key: "small",
      label: "Atende pequenos revendedores",
      importance: "ALTA",
      state,
      detail,
    });
  }

  {
    const [state, detail] = yesNo(
      supplier.issuesInvoice,
      "Emite nota fiscal",
      "Não emite nota fiscal",
      "Confirmar emissão de nota fiscal",
    );
    criteria.push({ key: "invoice", label: "Emissão de nota fiscal", importance: "ALTA", state, detail });
  }

  criteria.push({
    key: "freight",
    label: "Localização e frete",
    importance: "ALTA",
    state: quote?.freightCost != null ? "OK" : "PENDENTE",
    detail:
      quote?.freightCost != null
        ? `Frete cotado${supplier.state ? ` · ${supplier.state}` : ""}${
            context.buyerState && supplier.state === context.buyerState ? " (mesmo estado)" : ""
          }`
        : supplier.state
          ? `Fica em ${supplier.state}; pedir o frete até você`
          : "Pedir localização e frete",
  });

  criteria.push({
    key: "lead",
    label: "Prazo de abastecimento",
    importance: "ALTA",
    state: supplier.leadTimeDays != null ? "OK" : "PENDENTE",
    detail:
      supplier.leadTimeDays != null
        ? `${supplier.leadTimeDays} dia(s)`
        : "Perguntar o prazo de entrega",
  });

  criteria.push({
    key: "reputation",
    label: "Evidências de reputação",
    importance: "ALTA",
    state: supplier.reputationNote?.trim() ? "OK" : "PENDENTE",
    detail: supplier.reputationNote?.trim() || "Registrar referência (Reclame Aqui, indicação, compra anterior)",
  });

  const confirmed = criteria.filter((item) => item.state === "OK").length;
  const essential = criteria.filter((item) => item.importance === "ESSENCIAL");
  const blocked = criteria.some((item) => item.state === "FALHA" && item.importance === "ESSENCIAL") ||
    criteria.some((item) => item.key === "small" && item.state === "FALHA");
  const essentialOk = essential.every((item) => item.state === "OK");
  const level: Qualification["level"] = blocked
    ? "BLOQUEADO"
    : essentialOk && confirmed >= 7
      ? "QUALIFICADO"
      : essentialOk || confirmed >= 4
        ? "PARCIAL"
        : "INSUFICIENTE";
  const label = {
    BLOQUEADO: "Não atende um requisito",
    QUALIFICADO: "Qualificado",
    PARCIAL: "Parcialmente qualificado",
    INSUFICIENTE: "Dados insuficientes",
  }[level];
  const pending =
    criteria.find((item) => item.state === "PENDENTE" && item.importance === "ESSENCIAL") ??
    criteria.find((item) => item.state === "PENDENTE");
  return {
    level,
    label,
    confirmed,
    total: criteria.length,
    criteria,
    nextAsk: pending ? pending.detail : null,
  };
}
