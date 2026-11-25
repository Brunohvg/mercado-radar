/**
 * Verificação cadastral de CNPJ (dados abertos da Receita via BrasilAPI).
 * CNPJ ativo comprova cadastro, não confiabilidade comercial.
 */

export type CnpjCheck = {
  cnpj: string;
  source: "BRASILAPI";
  checkedAt: string;
  status: "ATIVA" | "SUSPENSA" | "INAPTA" | "BAIXADA" | "NULA" | "DESCONHECIDA";
  statusLabel: string | null;
  legalName: string | null;
  tradeName: string | null;
  openedAt: string | null;
  mainActivity: string | null;
  size: string | null;
  city: string | null;
  state: string | null;
  simples: boolean | null;
  mei: boolean | null;
};

export function normalizeCnpj(raw: string | null | undefined) {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 14 ? digits : null;
}

export function isValidCnpj(raw: string | null | undefined) {
  const cnpj = normalizeCnpj(raw);
  if (!cnpj || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digit = (base: string) => {
    const weights =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base
      .split("")
      .reduce((total, char, index) => total + Number(char) * weights[index], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = digit(cnpj.slice(0, 12));
  const second = digit(cnpj.slice(0, 12) + first);
  return cnpj.endsWith(`${first}${second}`);
}

export function formatCnpj(raw: string | null | undefined) {
  const cnpj = normalizeCnpj(raw);
  if (!cnpj) return raw ?? "";
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

const STATUS_BY_CODE: Record<string, CnpjCheck["status"]> = {
  "1": "NULA",
  "2": "ATIVA",
  "3": "SUSPENSA",
  "4": "INAPTA",
  "8": "BAIXADA",
};

type BrasilApiCnpj = {
  cnpj?: string;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  situacao_cadastral?: number | string | null;
  descricao_situacao_cadastral?: string | null;
  data_inicio_atividade?: string | null;
  cnae_fiscal?: number | null;
  cnae_fiscal_descricao?: string | null;
  porte?: string | null;
  descricao_porte?: string | null;
  municipio?: string | null;
  uf?: string | null;
  opcao_pelo_simples?: boolean | null;
  opcao_pelo_mei?: boolean | null;
};

export function mapBrasilApiCnpj(
  cnpj: string,
  body: BrasilApiCnpj,
  now = new Date(),
): CnpjCheck {
  const code =
    body.situacao_cadastral == null ? "" : String(body.situacao_cadastral);
  const label = body.descricao_situacao_cadastral?.trim() || null;
  const byLabel = label?.toUpperCase() as CnpjCheck["status"] | undefined;
  const status =
    STATUS_BY_CODE[code] ??
    (byLabel && ["ATIVA", "SUSPENSA", "INAPTA", "BAIXADA", "NULA"].includes(byLabel)
      ? byLabel
      : "DESCONHECIDA");
  const activity =
    body.cnae_fiscal_descricao && body.cnae_fiscal
      ? `${body.cnae_fiscal} · ${body.cnae_fiscal_descricao}`
      : body.cnae_fiscal_descricao ?? null;
  return {
    cnpj,
    source: "BRASILAPI",
    checkedAt: now.toISOString(),
    status,
    statusLabel: label,
    legalName: body.razao_social?.trim() || null,
    tradeName: body.nome_fantasia?.trim() || null,
    openedAt: body.data_inicio_atividade ?? null,
    mainActivity: activity,
    size: body.descricao_porte ?? body.porte ?? null,
    city: body.municipio ?? null,
    state: body.uf ?? null,
    simples: body.opcao_pelo_simples ?? null,
    mei: body.opcao_pelo_mei ?? null,
  };
}

export class CnpjLookupError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID" | "NOT_FOUND" | "UNAVAILABLE",
  ) {
    super(message);
  }
}

export async function lookupCnpj(
  raw: string,
  fetcher: typeof fetch = fetch,
): Promise<CnpjCheck> {
  const cnpj = normalizeCnpj(raw);
  if (!cnpj || !isValidCnpj(cnpj))
    throw new CnpjLookupError("CNPJ inválido. Confira os 14 dígitos.", "INVALID");
  const base = process.env.BRASILAPI_BASE_URL || "https://brasilapi.com.br";
  let response: Response;
  try {
    response = await fetcher(`${base}/api/cnpj/v1/${cnpj}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
  } catch {
    throw new CnpjLookupError(
      "Consulta cadastral indisponível agora. Tente novamente mais tarde.",
      "UNAVAILABLE",
    );
  }
  if (response.status === 404)
    throw new CnpjLookupError("CNPJ não encontrado na base pública.", "NOT_FOUND");
  if (!response.ok)
    throw new CnpjLookupError(
      "Consulta cadastral indisponível agora. Tente novamente mais tarde.",
      "UNAVAILABLE",
    );
  return mapBrasilApiCnpj(cnpj, (await response.json()) as BrasilApiCnpj);
}
