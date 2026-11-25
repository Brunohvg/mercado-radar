import { getCatalogProductDetails, getItemFullDetails } from "@/lib/mercado-livre";
import { pilotSession } from "@/lib/pilot/actions";
import { prisma } from "@/lib/prisma";

const PRODUCT_FIELDS = new Set(["BRAND", "MODEL", "LINE", "COLOR", "MATERIAL", "VOLUME", "UNIT_VOLUME", "UNITS_PER_PACK", "DIAMETER", "POWER", "VOLTAGE"]);

export async function loadListingReference(id: string) {
  if (!/^MLBU?\d{5,15}$/.test(id)) return null;
  const { workspaceId, ml: { accessToken } } = await pilotSession();
  const saved = await prisma.marketItem.findUnique({
    where: { workspaceId_id: { workspaceId, id } },
    select: { catalogProductId: true, title: true, isOwn: true },
  });
  if (!saved || saved.isOwn) return null;
  const item = /^MLB\d+$/.test(id) ? await getItemFullDetails({ accessToken, itemId: id }).catch(() => null) : null;
  const catalog = !item?.attributes?.length && saved.catalogProductId && /^MLB\d+$/.test(saved.catalogProductId)
    ? await getCatalogProductDetails({ accessToken, productId: saved.catalogProductId }).catch(() => null) : null;
  const facts = (item?.attributes?.length ? item.attributes : catalog?.attributes ?? []).flatMap(a =>
    a.id && PRODUCT_FIELDS.has(a.id) && a.value_name && a.value_name !== "Não se aplica"
      ? [{ id: a.id, name: a.name || a.id, value: a.value_name.slice(0, 255) }] : []);
  return { title: item?.title || saved.title, categoryId: item?.category_id || catalog?.buy_box_winner?.category_id || "",
    source: catalog ? saved.catalogProductId : id, facts };
}
export type ListingReference = NonNullable<Awaited<ReturnType<typeof loadListingReference>>>;
