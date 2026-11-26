export type CapabilityState =
  | "AVAILABLE"
  | "RECONNECT"
  | "RESTRICTED"
  | "RATE_LIMITED"
  | "NOT_TESTED"
  | "UNAVAILABLE";
export function capabilityState(
  status: number,
  tested = true,
): CapabilityState {
  if (!tested) return "NOT_TESTED";
  if (status >= 200 && status < 300) return "AVAILABLE";
  if (status === 401) return "RECONNECT";
  if (status === 403) return "RESTRICTED";
  if (status === 429) return "RATE_LIMITED";
  return "UNAVAILABLE";
}
export function capabilityGuidance(state: CapabilityState, optional: boolean) {
  switch (state) {
    case "AVAILABLE":
      return "Consulta aceita para esta conta e recurso neste momento.";
    case "RECONNECT":
      return "Autorização expirada ou revogada. Reconecte esta conta.";
    case "RESTRICTED":
      return "Acesso restrito. O operador deve conferir grants, titular da conta, elegibilidade e política do recurso no DevCenter. Reconectar não garante liberação.";
    case "RATE_LIMITED":
      return "Limite temporário. Aguarde e reduza a frequência das consultas.";
    case "NOT_TESTED":
      return "Sem recurso próprio de exemplo para testar. Isso não confirma falta de permissão.";
    default:
      return optional
        ? "Recurso opcional indisponível nesta consulta. A operação principal pode continuar."
        : "Não foi possível concluir a consulta. Verifique a resposta e tente novamente.";
  }
}
