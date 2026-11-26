import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getMlSession,
  searchCatalogProducts,
  searchMarketplace,
} from "@/lib/mercado-livre";

export const dynamic = "force-dynamic";

const schema = z.object({
  codes: z.array(z.string()).min(1).max(50),
});

function normalizeCode(value: string) {
  return value.replace(/\D/g, "");
}

function validateGtin(value: string) {
  const code = normalizeCode(value);

  if (![8, 12, 13, 14].includes(code.length)) {
    return {
      code,
      valid: false,
      reason: "GTIN deve ter 8, 12, 13 ou 14 dígitos.",
    };
  }

  const digits = code.split("").map(Number);
  const checkDigit = digits[digits.length - 1];
  const body = digits.slice(0, -1);

  let sum = 0;
  let weight = 3;

  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += body[index] * weight;
    weight = weight === 3 ? 1 : 3;
  }

  const expected = (10 - (sum % 10)) % 10;

  return {
    code,
    valid: expected === checkDigit,
    reason:
      expected === checkDigit
        ? null
        : "Dígito verificador inválido.",
  };
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];

  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

const round2 = (value: number | null) =>
  value == null
    ? null
    : Math.round((value + Number.EPSILON) * 100) / 100;

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Envie de 1 a 50 códigos EAN/GTIN." },
      { status: 400 },
    );
  }

  try {
    const session = await getMlSession();
    const normalized = [
      ...new Set(parsed.data.codes.map(normalizeCode).filter(Boolean)),
    ].slice(0, 50);

    const validations = normalized.map(validateGtin);
    const results: Array<Record<string, unknown>> = [];

    for (let start = 0; start < validations.length; start += 8) {
      const batch = validations.slice(start, start + 8);

      const batchResults = await Promise.all(
        batch.map(async (validation) => {
          if (!validation.valid) {
            return {
              code: validation.code,
              status: "INVALID",
              reason: validation.reason,
              catalog: [],
              market: null,
            };
          }

          let catalogUnavailable = false;
          let marketplaceUnavailable = false;

          const [catalog, marketplace] = await Promise.all([
            searchCatalogProducts({
              accessToken: session.accessToken,
              productIdentifier: validation.code,
              limit: 5,
            }).catch(() => {
              catalogUnavailable = true;
              return [];
            }),
            searchMarketplace({
              accessToken: session.accessToken,
              query: validation.code,
              limit: 20,
            }).catch(() => {
              marketplaceUnavailable = true;
              return [];
            }),
          ]);

          const prices = marketplace
            .map((item) => item.price)
            .filter((price) => price > 0)
            .sort((a, b) => a - b);

          const market =
            prices.length > 0
              ? {
                  listings: marketplace.length,
                  minimum: round2(prices[0]),
                  median: round2(percentile(prices, 0.5)),
                  maximum: round2(prices[prices.length - 1]),
                  freeShippingCount: marketplace.filter(
                    (item) => item.freeShipping,
                  ).length,
                }
              : null;

          const primary = catalog[0] ?? null;

          return {
            code: validation.code,
            status:
              primary || marketplace.length > 0 ? "FOUND" : "NOT_FOUND",
            reason: null,
            primary: primary
              ? {
                  id: primary.id,
                  name: primary.name,
                  domainId: primary.domainId,
                  picture: primary.pictures?.[0]?.url ?? null,
                }
              : marketplace[0]
                ? {
                    id: marketplace[0].id,
                    name: marketplace[0].title,
                    domainId: null,
                    picture: marketplace[0].thumbnail,
                  }
                : null,
            catalog: catalog.slice(0, 3).map((item) => ({
              id: item.id,
              name: item.name,
              domainId: item.domainId,
              picture: item.pictures?.[0]?.url ?? null,
            })),
            market,
            sources: {
              catalogUnavailable,
              marketplaceUnavailable,
            },
          };
        }),
      );

      results.push(...batchResults);
    }

    return NextResponse.json({
      total: results.length,
      found: results.filter((item) => item.status === "FOUND").length,
      invalid: results.filter((item) => item.status === "INVALID").length,
      notFound: results.filter((item) => item.status === "NOT_FOUND").length,
      results,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha na pesquisa em lote.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
