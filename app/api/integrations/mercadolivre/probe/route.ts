import { NextResponse } from "next/server";
import { getMlSession } from "@/lib/mercado-livre";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico de acesso: com o token do operador, quais endpoints do Mercado
 * Livre respondem para um anúncio/produto QUALQUER (de outro vendedor)?
 *
 * Protegido pelo login do painel (proxy.ts). Devolve só códigos HTTP e nomes
 * de campos; nunca o token, e só amostras de campos públicos do anúncio.
 *
 * Uso (logado no painel):
 *   /api/integrations/mercadolivre/probe?item=MLB123456789&product=MLBU123456789
 */
const API = "https://api.mercadolibre.com";
const ITEM = /^MLB\d{6,}$/i;
const PRODUCT = /^MLBU?\d{6,}$/i;
const SAFE_FIELDS = [
  "sold_quantity",
  "available_quantity",
  "date_created",
  "status",
  "listing_type_id",
  "catalog_listing",
  "visit_share",
  "status",
  "price_to_win",
];

type Probe = { name: string; path: string };

async function run(probe: Probe, token: string) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${API}${probe.path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    const body: unknown = await response.json().catch(() => null);
    const row: Record<string, unknown> = {
      name: probe.name,
      status: response.status,
      ms: Date.now() - startedAt,
    };

    if (response.ok && body) {
      const target = Array.isArray(body) ? (body[0]?.body ?? body[0]) : body;
      if (Array.isArray(body)) {
        row.entries = body.length;
        row.entryCodes = body.map(
          (entry: { code?: number; status_code?: number }) =>
            entry?.code ?? entry?.status_code ?? null,
        );
      }
      if (target && typeof target === "object") {
        const record = target as Record<string, unknown>;
        row.keys = Object.keys(record).slice(0, 14);
        const sample: Record<string, unknown> = {};
        for (const field of SAFE_FIELDS) {
          if (field in record) sample[field] = record[field];
        }
        if (Object.keys(sample).length) row.sample = sample;
        if (Array.isArray(record.results)) row.results = record.results.length;
      }
    } else if (!response.ok && body && typeof body === "object") {
      const { message, error } = body as { message?: string; error?: string };
      row.message = message ?? error ?? null;
    }

    return row;
  } catch (error) {
    return {
      name: probe.name,
      status: 0,
      message: error instanceof Error ? error.message : "falha de rede",
    };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const item = (url.searchParams.get("item") ?? "").trim().toUpperCase();
  const product = (url.searchParams.get("product") ?? "").trim().toUpperCase();

  if (!ITEM.test(item)) {
    return NextResponse.json(
      { error: "Informe ?item=MLB123456789 (id do anúncio de outro vendedor)." },
      { status: 400 },
    );
  }

  if (product && !PRODUCT.test(product)) {
    return NextResponse.json({ error: "Parâmetro product inválido." }, { status: 400 });
  }

  const session = await getMlSession().catch((error: unknown) => {
    return error instanceof Error ? error : new Error("Sem conta conectada.");
  });

  if (session instanceof Error) {
    return NextResponse.json({ error: session.message }, { status: 409 });
  }

  const probes: Probe[] = [
    { name: "item", path: `/items/${item}` },
    { name: "multiget", path: `/items?ids=${item}` },
    { name: "visitas_total", path: `/visits/items?ids=${item}` },
    { name: "visitas_30d", path: `/items/${item}/visits/time_window?last=30&unit=day` },
    { name: "price_to_win", path: `/items/${item}/price_to_win?siteId=MLB&version=v2` },
    { name: "busca_publica", path: `/sites/MLB/search?q=ilhos&limit=1` },
  ];

  if (product) {
    probes.push(
      { name: "produto", path: `/products/${product}` },
      { name: "produto_ofertas", path: `/products/${product}/items?limit=5` },
    );
  }

  const results = [];
  for (const probe of probes) {
    results.push(await run(probe, session.accessToken));
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return NextResponse.json({
    account: session.account.nickname,
    item,
    product: product || null,
    note: "200 = o app consegue ler; 401/403 = o Mercado Livre bloqueia para este app.",
    results,
  });
}
