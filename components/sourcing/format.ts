export const brl = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: digits,
        maximumFractionDigits: Math.max(digits, value < 1 ? 4 : 2),
      });

export const pct = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export const dateBr = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleDateString("pt-BR") : "—";

export const parseNumber = (raw: string): number | null => {
  const text = raw.trim().replace(/^R\$\s*/, "");
  const decimal = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
  const brazilian = /^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/;
  if (!decimal.test(text) && !brazilian.test(text)) return null;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

export const STATUS_LABEL: Record<string, string> = {
  PESQUISANDO: "Pesquisando",
  COTANDO: "Cotando",
  VIAVEL: "Viável",
  DESCARTADA: "Descartada",
  COMPRANDO: "Comprando",
};

export const KIND_LABEL: Record<string, string> = {
  FABRICANTE: "Fabricante",
  DISTRIBUIDOR: "Distribuidor",
  ATACADISTA: "Atacadista",
  IMPORTADOR: "Importador",
  LOJA_ML: "Loja no Mercado Livre",
  OUTRO: "Outro",
};

export const SOURCE_LABEL: Record<string, string> = {
  COTACAO_RECEBIDA: "Cotação recebida",
  PRECO_PUBLICADO: "Preço publicado",
  ESTIMATIVA_USUARIO: "Estimativa sua",
};

export const REFERENCE_LABEL: Record<string, string> = {
  ANUNCIO: "preço atual do anúncio",
  MEDIANA_MERCADO: "mediana do mercado",
  MANUAL: "informado por você",
};

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Não foi possível concluir agora.");
  return body as T;
}
