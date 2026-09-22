import { NextResponse } from "next/server";
import { getMlSession } from "@/lib/mercado-livre";

export const dynamic = "force-dynamic";

async function check(url: string, accessToken: string) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
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

export async function GET() {
  try {
    const session = await getMlSession();
    const token = session.accessToken;

    const checks = await Promise.all([
      check("https://api.mercadolibre.com/users/me", token),
      check(
        "https://api.mercadolibre.com/products/search?site_id=MLB&status=active&q=Samsung",
        token,
      ),
      check(
        "https://api.mercadolibre.com/sites/MLB/domain_discovery/search?q=Samsung&limit=1",
        token,
      ),
      check(
        "https://api.mercadolibre.com/sites/MLB/search?q=Samsung&limit=1",
        token,
      ),
    ]);

    const [account, catalogSearch, categoryDiscovery, marketplaceSearch] = checks;

    return NextResponse.json({
      account,
      catalogSearch,
      categoryDiscovery,
      marketplaceSearch,
      summary: {
        healthy:
          account.ok &&
          catalogSearch.ok &&
          categoryDiscovery.ok,
        marketplaceSearchBlocked:
          !marketplaceSearch.ok &&
          marketplaceSearch.status === 403,
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
