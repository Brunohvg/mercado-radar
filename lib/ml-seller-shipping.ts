import { getItemsBulk, getSellerItemIds } from "@/lib/mercado-livre";

export const LOGISTICS_LABELS: Record<string, string> = {
  drop_off: "Agência Mercado Livre",
  xd_drop_off: "Mercado Envios Places",
  cross_docking: "Coleta Mercado Livre",
  fulfillment: "Mercado Envios Full",
  self_service: "Mercado Envios Flex",
  turbo: "Mercado Envios Turbo",
};
export type SellerLogisticChoice = {
  type: string; label: string; default: boolean; listings: number;
};
export type SellerShippingProfile = {
  sellerId: string; choices: SellerLogisticChoice[];
  defaultType: string | null; verified: boolean;
  source: "SHIPPING_PREFERENCES" | "OWN_LISTINGS" | "UNAVAILABLE";
  notice: string; preferenceHttpStatus: number | null;
};
type LogisticsGroup = { mode?: string; logistic_types?: Array<{ type?: string; default?: boolean; status?: string }>; types?: Array<{ type?: string; default?: boolean; status?: string }> };
export function parseSellerLogistics(raw: unknown): SellerLogisticChoice[] {
  const data = raw as { logistics?: LogisticsGroup[]; modes?: string[] } | null;
  if (!data || !Array.isArray(data.logistics)) return [];
  const choices = new Map<string, SellerLogisticChoice>();
  for (const group of data.logistics) {
    if (group.mode !== "me2") continue;
    const entries = Array.isArray(group.logistic_types) ? group.logistic_types : group.types ?? [];
    for (const entry of entries) {
      if (!entry?.type || !(entry.type in LOGISTICS_LABELS) ||
          (entry.status && !["active", "enabled"].includes(entry.status))) continue;
      const previous = choices.get(entry.type);
      choices.set(entry.type, {
        type: entry.type, label: LOGISTICS_LABELS[entry.type],
        default: Boolean(entry.default) || Boolean(previous?.default), listings: 0,
      });
    }
  }
  return [...choices.values()];
}
export async function loadSellerShippingProfile(
  token: string, sellerId: string,
  options?: { fetcher?: typeof fetch; ownListings?: () => Promise<Array<{ logisticType: string | null; shippingMode: string | null; sellerId: string | null }>> },
): Promise<SellerShippingProfile> {
  const fetcher = options?.fetcher ?? fetch;
  let status: number | null = null;
  let notice = "";
  try {
    const response = await fetcher("https://api.mercadolibre.com/users/" + encodeURIComponent(sellerId) + "/shipping_preferences", {
      headers: { Authorization: "Bearer " + token }, cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    status = response.status;
    if (response.ok) {
      const data = await response.json();
      const choices = parseSellerLogistics(data);
      if (choices.length) {
        return {
          sellerId, choices, defaultType: choices.find(x => x.default)?.type ?? choices[0].type,
          source: "SHIPPING_PREFERENCES", verified: true,
          preferenceHttpStatus: status, notice: "Logística confirmada nas preferências oficiais deste vendedor.",
        };
      }
      notice = "A API de preferências não informou modalidades ME2 habilitadas.";
    } else {
      notice = "Preferências de envio indisponíveis (HTTP " + status + ").";
    }
  } catch {
    notice = "A consulta às preferências de envio não respondeu.";
  }

  // When permissions exclude shipping_preferences, verify observable logistics
  // on the SAME seller's existing listings. Never infer from another seller.
  try {
    const ownListings = options?.ownListings ?? (async () => {
      const search = await getSellerItemIds({ accessToken: token, userId: sellerId, limit: 30 });
      return getItemsBulk({ accessToken: token, itemIds: (search.results ?? []).slice(0, 30) });
    });
    const found = await ownListings();
    const counts = new Map<string, number>();
    for (const item of found) {
      if (item.sellerId !== sellerId || item.shippingMode !== "me2" ||
          !item.logisticType || !(item.logisticType in LOGISTICS_LABELS)) continue;
      counts.set(item.logisticType, (counts.get(item.logisticType) ?? 0) + 1);
    }
    const choices = [...counts].sort((a, b) => b[1] - a[1]).map(([type, listings], i) => ({
      type, label: LOGISTICS_LABELS[type], default: i === 0, listings,
    }));
    if (choices.length) return {
      sellerId, choices, defaultType: choices[0].type,
      source: "OWN_LISTINGS", verified: true, preferenceHttpStatus: status,
      notice: notice + " Logística identificada nos anúncios próprios; confirme disponibilidade para anúncios novos.",
    };
  } catch {
    // The seller may have no listings or restricted catalog access.
  }
  return {
    sellerId, choices: [], defaultType: null, verified: false,
    source: "UNAVAILABLE", preferenceHttpStatus: status,
    notice: notice + " Não conseguimos verificar a logística nem por anúncios próprios. Informe uma modalidade comprovada antes de cotar.",
  };
}
