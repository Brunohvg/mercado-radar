import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getMlSession,
  getProductAdsAdGroups,
  getProductAdsAdvertisers,
  getProductAdsCampaigns,
} from "@/lib/mercado-livre";

export const dynamic = "force-dynamic";

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function numberValue(
  source: Record<string, any> | null | undefined,
  key: string,
) {
  const direct = source?.[key];
  const nested = source?.metrics?.[key];
  const value = direct ?? nested ?? 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarizeRows(rows: Array<Record<string, any>>) {
  const sumKeys = [
    "clicks",
    "prints",
    "cost",
    "direct_amount",
    "indirect_amount",
    "total_amount",
    "direct_units_quantity",
    "indirect_units_quantity",
    "units_quantity",
    "advertising_items_quantity",
    "organic_units_quantity",
    "organic_units_amount",
    "organic_items_quantity",
  ];

  const summary: Record<string, number> = {};

  for (const key of sumKeys) {
    summary[key] = rows.reduce(
      (sum, row) => sum + numberValue(row, key),
      0,
    );
  }

  const cost = summary.cost ?? 0;
  const totalAmount = summary.total_amount ?? 0;
  const clicks = summary.clicks ?? 0;
  const prints = summary.prints ?? 0;
  const units = summary.units_quantity ?? 0;

  summary.roas = cost > 0 ? totalAmount / cost : 0;
  summary.acos = totalAmount > 0 ? (cost / totalAmount) * 100 : 0;
  summary.ctr = prints > 0 ? (clicks / prints) * 100 : 0;
  summary.cvr = clicks > 0 ? (units / clicks) * 100 : 0;
  summary.cpc = clicks > 0 ? cost / clicks : 0;

  return summary;
}

function normalizeSummary(
  summary: Record<string, number | null> | undefined,
  rows: Array<Record<string, any>>,
) {
  const fallback = summarizeRows(rows);
  const keys = [
    "clicks",
    "prints",
    "ctr",
    "cost",
    "cpc",
    "acos",
    "tacos",
    "cvr",
    "roas",
    "sov",
    "direct_amount",
    "indirect_amount",
    "total_amount",
    "direct_units_quantity",
    "indirect_units_quantity",
    "units_quantity",
    "advertising_items_quantity",
    "organic_units_quantity",
    "organic_units_amount",
    "organic_items_quantity",
    "impression_share",
    "top_impression_share",
    "lost_impression_share_by_budget",
    "lost_impression_share_by_ad_rank",
    "acos_benchmark",
  ];

  return Object.fromEntries(
    keys.map((key) => {
      const raw = summary?.[key];
      const parsed = Number(raw);
      return [
        key,
        Number.isFinite(parsed) && raw != null
          ? parsed
          : Number(fallback[key] ?? 0),
      ];
    }),
  ) as Record<string, number>;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const days = Math.min(
      Math.max(Number(url.searchParams.get("days") ?? 7) || 7, 1),
      90,
    );

    const session = await getMlSession();
    const sellerUserId = session.account.mercadoLivreUserId;

    let advertisers;
    try {
      advertisers = await getProductAdsAdvertisers({
        accessToken: session.accessToken,
      });
    } catch (error) {
      return NextResponse.json({
        enabled: false,
        days,
        error:
          error instanceof Error
            ? error.message
            : "Product Ads não está disponível para esta conta.",
        advertisers: [],
        campaigns: [],
        adGroups: [],
      });
    }

    const advertiser =
      advertisers.find((item) => item.siteId === "MLB") ??
      advertisers[0] ??
      null;

    if (!advertiser) {
      return NextResponse.json({
        enabled: false,
        days,
        message:
          "Nenhum anunciante Product Ads foi encontrado para a conta conectada.",
        advertisers,
        campaigns: [],
        adGroups: [],
      });
    }

    const now = new Date();
    const from = new Date(
      now.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
    );
    const dateFrom = dateOnly(from);
    const dateTo = dateOnly(now);

    const [campaignPayload, adGroupPayload, orders, orderItems, products] =
      await Promise.all([
      getProductAdsCampaigns({
        accessToken: session.accessToken,
        siteId: advertiser.siteId,
        advertiserId: advertiser.advertiserId,
        dateFrom,
        dateTo,
        limit: 50,
      }).catch(() => ({
        results: [] as Array<Record<string, any>>,
        metrics_summary: undefined,
      })),
      getProductAdsAdGroups({
        accessToken: session.accessToken,
        siteId: advertiser.siteId,
        advertiserId: advertiser.advertiserId,
        dateFrom,
        dateTo,
        limit: 100,
      }).catch(() => ({
        results: [] as Array<Record<string, any>>,
        metrics_summary: undefined,
      })),
      prisma.mercadoLivreOrder.findMany({
        where: {
          sellerUserId,
          status: { not: "cancelled" },
          dateCreated: { gte: from },
        },
        select: {
          totalAmount: true,
          profit: true,
        },
        take: 1000,
      }),
      prisma.mercadoLivreOrderItem.findMany({
        where: {
          order: {
            sellerUserId,
            status: { not: "cancelled" },
            dateCreated: { gte: from },
          },
        },
        select: {
          mlItemId: true,
          quantity: true,
          unitPrice: true,
          profit: true,
        },
        take: 5000,
      }),
      prisma.mercadoLivreProduct.findMany({
        where: { sellerUserId },
        select: {
          mlItemId: true,
          userProductId: true,
          title: true,
          thumbnail: true,
        },
        take: 500,
      }),
    ]);

    const campaignRows = campaignPayload.results ?? [];
    const adGroupRows = adGroupPayload.results ?? [];

    const metrics = normalizeSummary(
      campaignPayload.metrics_summary ??
        adGroupPayload.metrics_summary,
      campaignRows.length > 0 ? campaignRows : adGroupRows,
    );

    const validOrders = orders;
    const profitReadyOrders = validOrders.filter(
      (order) => order.profit != null,
    );
    const realizedProfitBeforeAds = profitReadyOrders.reduce(
      (sum, order) => sum + Number(order.profit ?? 0),
      0,
    );
    const profitReadyRevenue = profitReadyOrders.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0,
    );
    const adsCost = Number(metrics.cost ?? 0);
    const realizedProfitAfterAds =
      realizedProfitBeforeAds - adsCost;
    const realizedMarginAfterAds =
      profitReadyRevenue > 0
        ? (realizedProfitAfterAds / profitReadyRevenue) * 100
        : null;

    const productByExternalId = new Map<
      string,
      {
        mlItemId: string;
        userProductId: string | null;
        title: string;
        thumbnail: string | null;
      }
    >();

    for (const product of products) {
      productByExternalId.set(product.mlItemId, product);
      if (product.userProductId) {
        productByExternalId.set(product.userProductId, product);
      }
    }

    const realizedByItem = new Map<
      string,
      {
        profit: number;
        revenue: number;
        readyUnits: number;
        totalUnits: number;
      }
    >();

    for (const item of orderItems) {
      const current = realizedByItem.get(item.mlItemId) ?? {
        profit: 0,
        revenue: 0,
        readyUnits: 0,
        totalUnits: 0,
      };

      current.totalUnits += item.quantity;
      current.revenue += Number(item.unitPrice) * item.quantity;

      if (item.profit != null) {
        current.profit += Number(item.profit);
        current.readyUnits += item.quantity;
      }

      realizedByItem.set(item.mlItemId, current);
    }

    const campaigns = campaignRows.map((row) => ({
      id: row.id == null ? null : String(row.id),
      name: String(row.name ?? "Campanha"),
      status: String(row.status ?? "unknown").toLowerCase(),
      budget:
        row.budget == null && row.daily_budget == null
          ? null
          : Number(row.budget ?? row.daily_budget),
      roasTarget:
        row.roas_target == null ? null : Number(row.roas_target),
      metrics: {
        cost: numberValue(row, "cost"),
        roas: numberValue(row, "roas"),
        acos: numberValue(row, "acos"),
        clicks: numberValue(row, "clicks"),
        prints: numberValue(row, "prints"),
        ctr: numberValue(row, "ctr"),
        cvr: numberValue(row, "cvr"),
        totalAmount: numberValue(row, "total_amount"),
        units: numberValue(row, "units_quantity"),
      },
    }));

    const adGroups = adGroupRows
      .map((row) => {
        const externalId =
          row.ad_group_external_id == null
            ? null
            : String(row.ad_group_external_id);
        const product =
          externalId == null ? null : productByExternalId.get(externalId) ?? null;
        const realized =
          product == null ? null : realizedByItem.get(product.mlItemId) ?? null;
        const cost = numberValue(row, "cost");

        const realizedProfitBeforeAds = realized?.profit ?? null;
        const realizedProfitAfterAds =
          realizedProfitBeforeAds == null
            ? null
            : realizedProfitBeforeAds - cost;
        const realizedMarginAfterAds =
          realizedProfitAfterAds == null || !realized || realized.revenue <= 0
            ? null
            : (realizedProfitAfterAds / realized.revenue) * 100;
        const profitCoveragePercent =
          !realized || realized.totalUnits <= 0
            ? 0
            : (realized.readyUnits / realized.totalUnits) * 100;

        return {
          id: row.id == null ? null : String(row.id),
          externalId,
          campaignId:
            row.campaign_id == null ? null : String(row.campaign_id),
          status: String(row.status ?? "unknown").toLowerCase(),
          title: row.title == null ? null : String(row.title),
          catalogListing:
            typeof row.catalog_listing === "boolean"
              ? row.catalog_listing
              : null,
          product:
            product == null
              ? null
              : {
                  mlItemId: product.mlItemId,
                  userProductId: product.userProductId,
                  title: product.title,
                  thumbnail: product.thumbnail,
                },
          metrics: {
            cost,
            roas: numberValue(row, "roas"),
            tacos: numberValue(row, "tacos"),
            clicks: numberValue(row, "clicks"),
            prints: numberValue(row, "prints"),
            totalAmount: numberValue(row, "total_amount"),
            units: numberValue(row, "units_quantity"),
            organicUnits: numberValue(row, "organic_units_quantity"),
          },
          profit: {
            realizedProfitBeforeAds,
            realizedProfitAfterAds,
            realizedMarginAfterAds,
            profitCoveragePercent,
          },
        };
      })
      .sort((a, b) => b.metrics.cost - a.metrics.cost)
      .slice(0, 50);

    return NextResponse.json({
      enabled: true,
      days,
      dateFrom,
      dateTo,
      advertiser,
      advertisers,
      summary: {
        ...metrics,
        realizedProfitBeforeAds,
        realizedProfitAfterAds,
        realizedMarginAfterAds,
        profitCoveragePercent:
          validOrders.length > 0
            ? (profitReadyOrders.length / validOrders.length) * 100
            : 0,
        profitReadyOrders: profitReadyOrders.length,
        totalOrders: validOrders.length,
      },
      campaigns,
      adGroups,
      freshness: {
        metricsWindowMaxDays: 90,
        note:
          "As métricas do Mercado Ads podem ter defasagem intradiária; trate o período atual como parcial.",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao carregar publicidade.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
