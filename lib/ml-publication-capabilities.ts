import { sellerPublicationModel } from "@/lib/ml-publication-model";

export async function loadSellerPublicationCapabilities(
  token: string,
  sellerId: string,
  grantedScopes: string | null | undefined,
) {
  const response = await fetch("https://api.mercadolibre.com/users/" + encodeURIComponent(sellerId), {
    headers: { Authorization: "Bearer " + token },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Não foi possível consultar o modelo de publicação do vendedor.");
  const seller = await response.json() as { id?: number; tags?: unknown; status?: { site_status?: string } };
  if (String(seller.id ?? "") !== sellerId) throw new Error("O token retornou outro vendedor.");
  const model = sellerPublicationModel(seller.tags);
  const scopes = grantedScopes?.split(/\s+/).filter(Boolean) ?? [];
  return {
    sellerId,
    model,
    canRequestPublishing: scopes.includes("write"),
    grantVerified: scopes.includes("write"),
    catalogPostingEnabled: false, // eligibility is product-specific; do not claim it from seller tags
    variantPostingMode: model === "USER_PRODUCTS" ? "ONE_ITEM_PER_VARIANT" : "LEGACY_VARIATIONS",
    message: scopes.includes("write")
      ? "Escopo de escrita presente; a criação ainda depende de regras do item e da conta."
      : "Conta conectada sem escopo de escrita confirmado. Reconecte em Integrações.",
  };
}
