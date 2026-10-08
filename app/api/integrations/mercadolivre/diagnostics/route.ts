import { NextResponse } from "next/server";
import { getMlSession } from "@/lib/mercado-livre";

export const dynamic = "force-dynamic";

async function check(
  url: string,
  accessToken: string,
  extraHeaders: Record<string, string> = {},
) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...extraHeaders,
      },
      signal: AbortSignal.timeout(10000),
    });

    const body = await response.json().catch(() => ({}));

    return {
      ok: response.ok,
      status: response.status,
      code:
        typeof body?.code === "string"
          ? body.code
          : typeof body?.error === "string"
            ? body.error
            : null,
      message:
        typeof body?.message === "string"
          ? body.message
          : null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: "NETWORK_OR_TIMEOUT",
      message:
        error instanceof Error ? error.message : "Falha de rede.",
    };
  }
}

function permissionHint(result: Awaited<ReturnType<typeof check>>) {
  if (result.ok) return "OK";

  if (
    result.status === 403 ||
    result.code === "PA_UNAUTHORIZED_RESULT_FROM_POLICIES"
  ) {
    return "PERMISSION_REQUIRED";
  }

  if (result.status === 401) return "RECONNECT_REQUIRED";
  if (result.status === 429) return "RATE_LIMITED";
  return "API_ERROR";
}

export async function GET() {
  try {
    const session = await getMlSession();
    const token = session.accessToken;
    const userId = session.account.mercadoLivreUserId;
    const appId = process.env.MERCADO_LIVRE_CLIENT_ID?.trim() ?? null;

    const checks = await Promise.all([
      check("https://api.mercadolibre.com/users/me", token),
      check(
        `https://api.mercadolibre.com/users/${userId}/items/search?limit=1`,
        token,
      ),
      check(
        `https://api.mercadolibre.com/users/${userId}/items_visits/time_window?last=1&unit=day`,
        token,
      ),
      check(
        `https://api.mercadolibre.com/orders/search?seller=${userId}&limit=1`,
        token,
      ),
      check(
        "https://api.mercadolibre.com/advertising/advertisers?product_id=PADS",
        token,
        { "Api-Version": "1" },
      ),
      check(
        "https://api.mercadolibre.com/products/search?site_id=MLB&status=active&q=Samsung",
        token,
      ),
      check(
        "https://api.mercadolibre.com/sites/MLB/domain_discovery/search?q=Samsung&limit=1",
        token,
      ),
      check(
        "https://api.mercadolibre.com/trends/MLB",
        token,
      ),
      appId
        ? check(
            `https://api.mercadolibre.com/applications/${appId}`,
            token,
          )
        : Promise.resolve({
            ok: false,
            status: 0,
            code: "APP_ID_NOT_CONFIGURED",
            message: "MERCADO_LIVRE_CLIENT_ID não configurado.",
          }),
    ]);

    const [
      account,
      listings,
      businessMetrics,
      orders,
      productAds,
      catalogSearch,
      categoryDiscovery,
      trends,
      application,
    ] = checks;

    return NextResponse.json({
      account,
      application,
      capabilities: {
        listings: {
          ...listings,
          hint: permissionHint(listings),
          permission: "Publicação e sincronização",
        },
        businessMetrics: {
          ...businessMetrics,
          hint: permissionHint(businessMetrics),
          permission: "Métricas de negócio",
        },
        orders: {
          ...orders,
          hint: permissionHint(orders),
          permission: "Usuários / vendas e envios",
        },
        productAds: {
          ...productAds,
          hint: permissionHint(productAds),
          permission: "Publicidade de produtos",
        },
        catalogSearch: {
          ...catalogSearch,
          hint: permissionHint(catalogSearch),
        },
        categoryDiscovery: {
          ...categoryDiscovery,
          hint: permissionHint(categoryDiscovery),
        },
        trends: {
          ...trends,
          hint: permissionHint(trends),
        },
      },
      oauth: {
        userId,
        appId,
        storedScope: session.account.scopes ?? null,
      },
      summary: {
        healthy:
          account.ok &&
          listings.ok &&
          businessMetrics.ok &&
          orders.ok &&
          productAds.ok,
        marketplaceKeywordSearchRequired: false,
        marketplaceKeywordSearchBlocked: false,
        permissionsMissing: [
          !listings.ok && listings.status === 403
            ? "Publicação e sincronização"
            : null,
          !businessMetrics.ok && businessMetrics.status === 403
            ? "Métricas de negócio"
            : null,
          !orders.ok && orders.status === 403
            ? "Usuários / vendas e envios"
            : null,
          !productAds.ok && productAds.status === 403
            ? "Publicidade de produtos"
            : null,
        ].filter((value): value is string => Boolean(value)),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao diagnosticar integração.",
      },
      { status: 502 },
    );
  }
}
