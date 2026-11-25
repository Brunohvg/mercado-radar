import {
  getCategory,
  getCategoryAttributes,
  getItemDescription,
  getItemFullDetails,
  getItemPerformance,
  getItemPriceSuggestion,
  getItemsBulk,
  getItemVisitWindow,
  MlApiError,
  searchMarketplaceWithSource,
} from "@/lib/mercado-livre";
import { diagnoseListing, normalizePerformance, normalizePriceSuggestion, type CategoryAttribute, type QualityItem } from "@/lib/listing-quality";
import { loadPilotData, PILOT_DAYS } from "@/lib/pilot/load";

type Session = { ml: { accessToken: string }; sellerId: string; workspaceId: string };

/** Lê tudo o que o diagnóstico precisa, direto do ML. Devolve null se o anúncio não é desta conta. */
export async function loadListingQuality(s: Session, mlItemId: string) {
  const accessToken = s.ml.accessToken;
  const live = (await getItemsBulk({ accessToken, itemIds: [mlItemId] }))[0];
  if (!live || live.sellerId !== s.sellerId) return null;

  const [full, description] = await Promise.all([
    getItemFullDetails({ accessToken, itemId: mlItemId }).catch(() => null),
    getItemDescription({ accessToken, itemId: mlItemId })
      .then((d) => d.plain_text ?? d.text ?? "")
      .catch((e) => (e instanceof MlApiError && e.status === 404 ? "" : null)),
  ]);
  const categoryId = full?.category_id ?? live.categoryId ?? null;
  const [categoryInfo, rawAttributes, market, visits, pilot, performance, suggestion] = await Promise.all([
    categoryId ? getCategory({ accessToken, categoryId }).catch(() => null) : Promise.resolve(null),
    categoryId ? getCategoryAttributes({ accessToken, categoryId }).catch(() => []) : Promise.resolve([]),
    searchMarketplaceWithSource({ accessToken, query: live.title, categoryId: categoryId ?? undefined, limit: 20 }).catch(() => null),
    getItemVisitWindow({ accessToken, itemId: mlItemId, ending: new Date().toISOString().slice(0, 10) }).catch(() => null),
    loadPilotData({ workspaceId: s.workspaceId, sellerId: s.sellerId, mlItemId }).catch(() => null),
    getItemPerformance({ accessToken, itemId: mlItemId }).catch(() => null),
    getItemPriceSuggestion({ accessToken, itemId: mlItemId }).catch(() => null),
  ]);

  const attributes = (full?.attributes ?? [])
    .filter((a) => a.id)
    .map((a) => ({
      id: a.id!,
      name: a.name ?? a.id!,
      value: a.value_name ?? (a.values ?? []).map((v) => v.name).filter(Boolean).join(", ") ?? null,
    }))
    .map((a) => ({ ...a, value: a.value || null }));
  const category: CategoryAttribute[] = (rawAttributes ?? [])
    .filter((a) => a.id && a.name)
    .map((a) => ({
      id: a.id!,
      name: a.name!,
      valueType: a.value_type ?? null,
      required: Boolean(a.tags?.required || a.tags?.catalog_required || a.tags?.conditional_required),
      hidden: Boolean(a.tags?.hidden || a.tags?.read_only || a.tags?.fixed || a.tags?.others),
      values: (a.values ?? []).filter((v) => v.id && v.name).slice(0, 80).map((v) => ({ id: v.id!, name: v.name! })),
      hint: a.hint ?? null,
    }));
  const warranty = (full?.sale_terms ?? []).some((t) => t.id === "WARRANTY_TYPE" && t.value_name && !/sem garantia/i.test(t.value_name)) || Boolean(full?.warranty);
  const item: QualityItem = {
    title: live.title,
    pictures: full?.pictures?.length ?? 0,
    attributes,
    description,
    hasWarranty: warranty,
    freeShipping: live.freeShipping,
    price: live.currentPrice,
  };
  const competitorTitles = (market?.items ?? [])
    .filter((c) => c.id !== mlItemId && c.title)
    .map((c) => c.title as string);
  const diagnosis = diagnoseListing({ item, category, competitorTitles });
  const units = (pilot?.sales ?? []).reduce((sum, sale) => sum + sale.quantity, 0);

  return {
    item: {
      mlItemId,
      title: live.title,
      price: live.currentPrice,
      availableQuantity: live.availableQuantity,
      status: live.status,
      permalink: live.permalink ?? null,
      thumbnail: live.thumbnail ?? full?.thumbnail ?? null,
      pictures: item.pictures,
      description: description ?? null,
      descriptionReadable: description != null,
      categoryName: categoryInfo?.name ?? null,
      attributes,
    },
    diagnosis,
    official: normalizePerformance(performance),
    priceSuggestion: normalizePriceSuggestion(suggestion),
    category,
    competitorTitles: competitorTitles.slice(0, 10),
    performance: {
      days: PILOT_DAYS,
      unitsSold: pilot ? units : null,
      visits: visits?.total ?? null,
      conversionPercent: visits && visits.total > 0 && pilot ? Math.round((units / visits.total) * 1000) / 10 : null,
    },
  };
}
