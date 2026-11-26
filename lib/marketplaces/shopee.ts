/**
 * Adaptador da Shopee (planejado). Nada é consultado ainda: a Shopee Open
 * Platform exige cadastro de parceiro (partner_id/partner_key) e autorização
 * da loja, e o Radar só lê dados com a autorização do próprio usuário.
 * Os recursos marcados como PLANEJADO têm equivalente documentado na API v2.
 */
import { unsupported, type ListingInsights, type MarketplaceAdapter } from "@/lib/marketplaces/types";

const planned = (source: string) => ({ state: "PLANEJADO" as const, source, auth: "CONTA_CONECTADA" as const });
const none = (source: string) => ({ state: "NAO_SUPORTADO" as const, source, auth: "NENHUMA" as const });

export const shopeeAdapter: MarketplaceAdapter = {
  id: "SHOPEE",
  label: "Shopee",
  listingIdPattern: /^\d{1,20}\.\d{1,20}$/, // shopId.itemId
  capabilities: {
    identity: planned("v2.product.get_item_base_info"),
    price: planned("v2.product.get_item_base_info / get_model_list"),
    quantityPricing: planned("v2.product.get_item_base_info (wholesales) — confirmar na homologação"),
    seller: planned("v2.shop.get_shop_info (só da loja autorizada)"),
    questions: none("Sem API pública de perguntas de compradores"),
    reviews: planned("v2.product.get_comment (só da loja autorizada)"),
    categoryRequirements: planned("v2.product.get_attribute_tree / get_category"),
    fees: planned("v2.payment.get_escrow_detail (pós-venda)"),
    shipping: planned("v2.logistics.get_channel_list"),
    visits: none("Sem API pública de visitas por anúncio"),
    catalogCompetition: none("Sem catálogo compartilhado como no Mercado Livre"),
    trends: none("Sem API pública de tendências"),
    ads: planned("v2.ads (Shopee Ads)"),
    orders: planned("v2.order.get_order_list / get_order_detail"),
  },
  async collectInsights(_auth, listingId): Promise<ListingInsights> {
    const off = unsupported<never>("Shopee ainda não conectada ao Radar.");
    return {
      marketplace: "SHOPEE",
      listingId,
      collectedAt: new Date().toISOString(),
      price: off,
      seller: off,
      questions: off,
      reviews: off,
      category: off,
    };
  },
};
