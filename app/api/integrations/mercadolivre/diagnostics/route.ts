import { NextResponse } from "next/server";
import { getMlSession } from "@/lib/mercado-livre";
import { capabilityState, capabilityGuidance } from "@/lib/ml-capabilities";
export const dynamic = "force-dynamic";
const API = "https://api.mercadolibre.com";
async function probe(
  path: string | null,
  token: string,
  headers: Record<string, string> = {},
) {
  if (!path) return { status: 0, code: null, tested: false, data: null as any };
  try {
    const response = await fetch(API + path, {
      headers: { Authorization: `Bearer ${token}`, ...headers },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json().catch(() => null);
    return {
      status: response.status,
      code: typeof data?.error === "string" ? data.error : null,
      tested: true,
      data: response.ok ? data : null,
    };
  } catch {
    return {
      status: 0,
      code: "NETWORK_OR_TIMEOUT",
      tested: true,
      data: null as any,
    };
  }
}
export async function GET() {
  try {
    const session = await getMlSession(),
      token = session.accessToken,
      seller = session.account.mercadoLivreUserId;
    const checks: Array<{
      key: string;
      title: string;
      optional: boolean;
      path: string | null;
      grant: string;
      result: Awaited<ReturnType<typeof probe>>;
    }> = [];
    async function add(
      key: string,
      title: string,
      optional: boolean,
      path: string | null,
      grant: string,
      headers?: Record<string, string>,
    ) {
      const result = await probe(path, token, headers);
      checks.push({ key, title, optional, path, grant, result });
      return result.data;
    }
    const [account, listings, orders] = await Promise.all([
      add(
        "account",
        "Conta e autorização",
        false,
        "/users/me",
        "Leitura de usuários",
      ),
      add(
        "listings",
        "Anúncios da sua conta",
        false,
        `/users/${seller}/items/search?limit=1`,
        "Publicação e sincronização · leitura",
      ),
      add(
        "orders",
        "Pedidos da sua conta",
        false,
        `/orders/search?seller=${seller}&limit=1`,
        "Vendas · leitura",
      ),
    ]);
    const itemId = /^MLB\d+$/.test(String(listings?.results?.[0] ?? ""))
      ? String(listings.results[0])
      : null;
    const items = itemId
      ? await probe(`/items/bulk?ids=${itemId}`, token)
      : null;
    const detail = Array.isArray(items?.data)
      ? items.data[0]?.status_code === 200 || items.data[0]?.code === 200
        ? items.data[0]?.body
        : null
      : null;
    const order = orders?.results?.[0];
    const shipment = /^[0-9]+$/.test(String(order?.shipping?.id ?? ""))
      ? String(order.shipping.id)
      : null;
    const feePath =
      detail?.category_id && Number(detail.price) > 0
        ? "/sites/MLB/listing_prices?" +
          new URLSearchParams({
            price: String(detail.price),
            category_id: detail.category_id,
            listing_type_id: detail.listing_type_id || "gold_special",
            currency_id: "BRL",
            logistic_type: detail.shipping?.logistic_type || "drop_off",
            shipping_mode: detail.shipping?.mode || "me2",
          })
        : null;
    await Promise.all([
      add(
        "businessMetrics",
        "Visitas da sua conta",
        true,
        `/users/${seller}/items_visits/time_window?last=1&unit=day`,
        "Métricas de negócio · leitura",
      ),
      add(
        "productAds",
        "Product Ads",
        true,
        "/advertising/advertisers?product_id=PADS",
        "Publicidade + anunciante elegível",
        { "Api-Version": "1" },
      ),
      add(
        "catalogSearch",
        "Busca de catálogo",
        true,
        "/products/search?site_id=MLB&status=active&q=ilhos&limit=1",
        "Catálogo · sujeito à política de acesso",
      ),
      add(
        "categoryDiscovery",
        "Identificação de categoria",
        true,
        "/sites/MLB/domain_discovery/search?q=ilhos&limit=1",
        "Categorias · leitura",
      ),
      add(
        "trends",
        "Tendências",
        true,
        "/trends/MLB",
        "Mercado · sujeito à disponibilidade",
      ),
      add(
        "fees",
        "Cotação de tarifas",
        true,
        feePath,
        "Custos por vender · parâmetros de anúncio próprio",
      ),
      add(
        "shippingCosts",
        "Custo de envio realizado",
        true,
        shipment ? `/shipments/${shipment}/costs` : null,
        "Envios · vínculo com o pedido",
      ),
    ]);
    const results = checks.map(
      ({ key, title, optional, path, grant, result }) => {
        const state = capabilityState(result.status, result.tested);
        return {
          key,
          title,
          optional,
          path,
          grant,
          status: result.status,
          state,
          ok: state === "AVAILABLE",
          code: result.code,
          guidance: capabilityGuidance(state, optional),
        };
      },
    );
    const scopes = (session.account.scopes || "").split(/\s+/).filter(Boolean);
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      account: {
        userId: seller,
        nickname: account?.nickname || session.account.nickname,
      },
      oauth: {
        storedScope: scopes,
        offlineAccess: scopes.includes("offline_access"),
        note: "Scopes gerais não comprovam todos os grants granulares. Confira as permissões da aplicação no DevCenter; cada cliente precisa autorizar o acesso.",
      },
      checks: results,
      summary: {
        healthy: results.filter((c) => !c.optional).every((c) => c.ok),
        optionalUnavailable: results.filter((c) => c.optional && !c.ok).length,
      },
      limits:
        "O token desta conta não libera pedidos, visitas, estoque ou dados pessoais privados de outros vendedores. Este diagnóstico não modifica anúncios nem permissões.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível verificar esta conexão.",
      },
      { status: 502 },
    );
  }
}
