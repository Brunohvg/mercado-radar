import {
  getWorkspaceMlAccount,
  getMlSessionForAccount,
  getListingPriceQuote,
  getShippingQuote,
  MlApiError,
} from "@/lib/mercado-livre";
import { IntelligenceError } from "@/lib/intelligence-access";
import {
  evaluateKits,
  kitQuoteContext,
  kitQuoteKey,
  type KitQuoteRequest,
  type KitQuote,
  type KitScenario,
} from "@/lib/kit-optimizer";

const cache = new Map<string, { until: number; quote: KitQuote }>();
const inFlight = new Map<string, Promise<KitQuote>>();
/** A private, account-scoped quote. No competitor's shipping or private fees are requested. */
export async function quoteKit(
  workspaceId: string,
  context: KitQuoteRequest,
): Promise<KitQuote> {
  const account = await getWorkspaceMlAccount(workspaceId);
  if (!account)
    throw new IntelligenceError(
      "Conecte sua conta para consultar tarifas e frete. A simulação manual continua disponível.",
      409,
      "CONNECT_ACCOUNT",
    );
  const key = account.id + "|" + kitQuoteKey(context);
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.quote;
  if (hit) cache.delete(key);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const task = (async () => {
    const session = await getMlSessionForAccount(account.id);
    const results = await Promise.allSettled([
      getListingPriceQuote({
        accessToken: session.accessToken,
        price: context.salePrice,
        categoryId: context.categoryId,
        listingType: context.listingType,
        logisticType: context.logisticType,
        shippingMode: "me2",
      }),
      context.shippingPackage
        ? getShippingQuote({
            accessToken: session.accessToken,
            userId: account.mercadoLivreUserId,
            price: context.salePrice,
            listingType: context.listingType,
            ...context.shippingPackage,
            logisticType: context.logisticType,
            shippingMode: "me2",
            freeShipping: context.freeShipping,
          })
        : Promise.resolve(null),
    ]);
    const notices: KitQuote["notices"] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "rejected")
        notices.push({
          code: r.reason instanceof MlApiError ? r.reason.code : "UNAVAILABLE",
          message: `${i === 0 ? "Tarifas" : "Frete"}: ${r.reason instanceof MlApiError ? r.reason.message : "cotação indisponível. Use uma estimativa identificada e confira no simulador oficial."}`,
        });
    }
    if (!context.shippingPackage)
      notices.push({
        code: "PACKAGE_REQUIRED",
        message:
          "Frete não cotado: informe peso e dimensões do pacote, ou uma estimativa manual. Frete grátis para o comprador não significa custo zero para o vendedor.",
      });
    const fee = results[0].status === "fulfilled" ? results[0].value : null,
      shipping = results[1].status === "fulfilled" ? results[1].value : null;
    const quote: KitQuote = {
      context,
      accountId: account.id,
      accountName: account.nickname ?? "Sua conta",
      quotedAt: new Date().toISOString(),
      fee: fee
        ? {
            commissionPercent: fee.commissionPercent,
            fixedFee: fee.fixedFee,
            saleFeeAmount: fee.saleFeeAmount,
          }
        : null,
      shipping: shipping
        ? {
            shippingCost: shipping.shippingCost,
            discountRate: shipping.discountRate,
          }
        : null,
      notices,
    };
    if (fee) {
      if (cache.size >= 500) {
        for (const [k, v] of cache) if (v.until <= Date.now()) cache.delete(k);
        if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      }
      cache.set(key, { until: Date.now() + 60000, quote });
    }
    return quote;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}
/** The server freezes inputs + its own quote + canonical calculation. Never trust a posted profit. */
export async function freezeKitDraft(
  workspaceId: string,
  payload: { scenario: KitScenario; selectedKitId: string | null },
) {
  const at = new Date().toISOString(),
    account = await getWorkspaceMlAccount(workspaceId);
  const initial =
    evaluateKits(payload.scenario).find(
      (r) => r.id === payload.selectedKitId,
    ) ?? evaluateKits(payload.scenario)[0];
  if (payload.selectedKitId && initial?.id !== payload.selectedKitId)
    throw new IntelligenceError(
      "A composição escolhida não cabe mais no estoque informado.",
      400,
      "NO_COMPOSITION",
    );
  if (!initial)
    throw new IntelligenceError(
      "Nenhuma composição cabe no estoque informado.",
      400,
      "NO_COMPOSITION",
    );
  let quote: KitQuote | null = null;
  let notice: string | null = null;
  if (
    account &&
    payload.scenario.useApiQuotes &&
    payload.scenario.categoryId &&
    initial.salePrice != null
  ) {
    try {
      quote = await quoteKit(
        workspaceId,
        kitQuoteContext(payload.scenario, initial.quantity, initial.salePrice),
      );
    } catch {
      notice =
        "A cotação não ficou disponível ao salvar. O registro conserva apenas o cenário informado.";
    }
  }
  const result = evaluateKits(
    payload.scenario,
    [],
    quote ? [quote] : [],
    Date.now(),
    account?.id ?? null,
  ).find((r) => r.id === initial.id)!;
  return {
    ...payload,
    selectedKitId: initial.id,
    snapshot: {
      at: new Date().toISOString(),
      formula: "profitability-v1",
      quote,
      notice,
      composition: result.parts,
      purchaseCost: result.purchaseCost,
      salePrice: result.salePrice,
      financial: result.financial,
      missing: result.missing,
      feeSource: result.feeSource,
      shippingSource: result.shippingSource,
    },
  };
}
