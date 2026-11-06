export type PublicationModel = "LEGACY" | "USER_PRODUCTS";
export type PublicationChannel = "TRADITIONAL" | "CATALOG";

export function sellerPublicationModel(tags: unknown): PublicationModel {
  if (!Array.isArray(tags) || !tags.every(tag => typeof tag === "string")) {
    throw new Error("A API do vendedor não informou tags válidas. Não é seguro decidir o modelo de publicação.");
  }
  return tags.includes("user_product_seller") ? "USER_PRODUCTS" : "LEGACY";
}

export function buildPublicationBody(input: {
  model: PublicationModel;
  channel: PublicationChannel;
  title: string;
  categoryId: string;
  price: number;
  stock: number;
  listingType: "CLASSIC" | "PREMIUM";
  pictures: Array<{ id: string } | { source: string }>;
  attributes: Array<{ id: string; value_name: string }>;
  freeShipping: boolean;
  catalogProductId: string | null;
  catalogExactMatchConfirmed: boolean;
}) {
  if (input.channel === "CATALOG" &&
    (!input.catalogExactMatchConfirmed || !input.catalogProductId || !/^MLB\d+$/.test(input.catalogProductId))) {
    throw new Error("Antes de publicar no catálogo, confirme o ID de catálogo e a correspondência exata do produto.");
  }
  const body = {
    category_id: input.categoryId,
    price: input.price,
    currency_id: "BRL",
    available_quantity: input.stock,
    buying_mode: "buy_it_now",
    listing_type_id: input.listingType === "PREMIUM" ? "gold_pro" : "gold_special",
    condition: "new",
    pictures: input.pictures,
    attributes: input.attributes,
    shipping: { mode: "me2", free_shipping: input.freeShipping },
    status: "paused",
    ...(input.model === "USER_PRODUCTS" ? { family_name: input.title } : { title: input.title }),
    ...(input.channel === "CATALOG" ? {
      catalog_listing: true,
      catalog_product_id: input.catalogProductId,
    } : {}),
  };
  return body;
}
