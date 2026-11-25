/**
 * Preenche a oportunidade com dados oficiais do anúncio (identidade, preço,
 * tarifa). Cada etapa pode falhar sozinha; o que falhou fica registrado e
 * continua vazio, nunca estimado em silêncio.
 */
import {
  getItemFullDetails,
  getItemCurrentPrice,
  getListingPriceQuote,
} from "@/lib/mercado-livre";
import { extractIdentity, type ProductIdentity } from "@/lib/sourcing/identity";

export type Enrichment = {
  title: string | null;
  categoryId: string | null;
  identity: ProductIdentity | null;
  referencePrice: number | null;
  commissionPercent: number | null;
  fixedFee: number | null;
  notes: string[];
};

export async function enrichFromMercadoLivre(input: {
  accessToken: string;
  itemId: string;
  listingType: "CLASSIC" | "PREMIUM";
  simulationPrice?: number | null;
  fallbackTitle?: string | null;
}): Promise<Enrichment> {
  const out: Enrichment = {
    title: input.fallbackTitle ?? null,
    categoryId: null,
    identity: null,
    referencePrice: null,
    commissionPercent: null,
    fixedFee: null,
    notes: [],
  };
  try {
    const item = await getItemFullDetails({ accessToken: input.accessToken, itemId: input.itemId });
    out.title = item.title ?? out.title;
    out.categoryId = item.category_id ?? null;
    out.identity = extractIdentity({
      title: out.title ?? "",
      attributes: (item.attributes ?? []).map((a) => ({ id: a.id, name: a.name, value_name: a.value_name ?? null })),
    });
  } catch {
    out.notes.push("Atributos do anúncio indisponíveis; identidade lida só pelo título.");
    if (out.title) out.identity = extractIdentity({ title: out.title });
  }
  try {
    out.referencePrice = await getItemCurrentPrice({ accessToken: input.accessToken, itemId: input.itemId });
    if (out.referencePrice == null) out.notes.push("Preço atual não informado pela API.");
  } catch {
    out.notes.push("Preço atual indisponível na API.");
  }
  const feePrice = input.simulationPrice ?? out.referencePrice;
  if (feePrice && out.categoryId) {
    try {
      const fee = await getListingPriceQuote({
        accessToken: input.accessToken,
        price: feePrice,
        categoryId: out.categoryId,
        listingType: input.listingType,
      });
      out.commissionPercent = Math.round(fee.commissionPercent * 100) / 100;
      out.fixedFee = fee.fixedFee;
    } catch {
      out.notes.push("Tarifa oficial indisponível; informe a comissão manualmente.");
    }
  }
  return out;
}
