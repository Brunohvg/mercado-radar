import type { MarketplaceAdapter, MarketplaceId } from "@/lib/marketplaces/types";
import { mercadoLivreAdapter } from "@/lib/marketplaces/mercado-livre/adapter";
import { shopeeAdapter } from "@/lib/marketplaces/shopee";

export const MARKETPLACES: Record<MarketplaceId, MarketplaceAdapter> = {
  MERCADO_LIVRE: mercadoLivreAdapter,
  SHOPEE: shopeeAdapter,
};

/** Descobre o marketplace pelo formato do identificador do anúncio. */
export function adapterForListing(listingId: string): MarketplaceAdapter | null {
  return Object.values(MARKETPLACES).find((a) => a.listingIdPattern.test(listingId)) ?? null;
}
