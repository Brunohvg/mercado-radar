import { prisma } from "@/lib/prisma";
import {
  getItemsBulk,
  getItemsCurrentPrices,
  getItemsVisitTotals,
  getMlSession,
  getShipmentCosts,
  getSellerItemIds,
  getSellerOrders,
} from "@/lib/mercado-livre";

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function toDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function syncMercadoLivreProducts() {
  const session = await getMlSession();
  const sellerUserId = session.account.mercadoLivreUserId;
  const syncRun = await prisma.syncRun.create({
    data: { kind: "ML_PRODUCTS", status: "RUNNING" },
  });

  try {
    const ids: string[] = [];
    let offset = 0;
    let total = 0;

    do {
      const page = await getSellerItemIds({
        accessToken: session.accessToken,
        userId: sellerUserId,
        limit: 50,
        offset,
      });

      const pageIds = page.results ?? [];
      ids.push(...pageIds);
      total = Number(page.paging?.total ?? ids.length);
      offset += pageIds.length;

      if (pageIds.length === 0 || ids.length >= 200) break;
    } while (offset < total);

    let saved = 0;

    for (let index = 0; index < ids.length; index += 50) {
      const batchIds = ids.slice(index, index + 50);
      const [details, prices, visits] = await Promise.all([
        getItemsBulk({
          accessToken: session.accessToken,
          itemIds: batchIds,
        }),
        getItemsCurrentPrices({
          accessToken: session.accessToken,
          itemIds: batchIds,
        }),
        getItemsVisitTotals({
          accessToken: session.accessToken,
          itemIds: batchIds,
        }).catch(() => ({} as Record<string, number>)),
      ]);

      for (const item of details) {
        const price = prices[item.id];
        await prisma.mercadoLivreProduct.upsert({
          where: { mlItemId: item.id },
          update: {
            sellerUserId,
            title: item.title,
            sku: item.sellerSku,
            categoryId: item.categoryId,
            status: item.status,
            listingTypeId: item.listingTypeId,
            currentPrice: price,
            availableQuantity: item.availableQuantity,
            soldQuantity: item.soldQuantity,
            visitsTotal: visits[item.id] ?? null,
            permalink: item.permalink,
            thumbnail: item.thumbnail,
            freeShipping: item.freeShipping,
            raw: item.raw as object,
            lastSyncedAt: new Date(),
          },
          create: {
            mlItemId: item.id,
            sellerUserId,
            title: item.title,
            sku: item.sellerSku,
            categoryId: item.categoryId,
            status: item.status,
            listingTypeId: item.listingTypeId,
            currentPrice: price,
            availableQuantity: item.availableQuantity,
            soldQuantity: item.soldQuantity,
            visitsTotal: visits[item.id] ?? null,
            permalink: item.permalink,
            thumbnail: item.thumbnail,
            freeShipping: item.freeShipping,
            raw: item.raw as object,
            lastSyncedAt: new Date(),
          },
        });
        saved += 1;
      }
    }

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        itemsRead: ids.length,
        itemsSaved: saved,
      },
    });

    return { itemsRead: ids.length, itemsSaved: saved };
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : "Unknown sync error",
      },
    });
    throw error;
  }
}

export async function syncMercadoLivreOrders(days = 30) {
  const session = await getMlSession();
  const sellerUserId = session.account.mercadoLivreUserId;
  const syncRun = await prisma.syncRun.create({
    data: {
      kind: "ML_ORDERS",
      status: "RUNNING",
      metadata: { days },
    },
  });

  try {
    const orders: Array<Record<string, any>> = [];
    let offset = 0;
    let total = 0;

    do {
      const page = await getSellerOrders({
        accessToken: session.accessToken,
        userId: sellerUserId,
        days,
        limit: 50,
        offset,
      });

      const results = page.results ?? [];
      orders.push(...results);
      total = Number(page.paging?.total ?? orders.length);
      offset += results.length;

      if (results.length === 0 || orders.length >= 200) break;
    } while (offset < total);

    let saved = 0;

    for (const raw of orders) {
      const mlOrderId = String(raw.id ?? "");
      if (!mlOrderId) continue;

      const paymentRows = Array.isArray(raw.payments) ? raw.payments : [];
      const marketplaceFeeTotal = paymentRows.length
        ? paymentRows.reduce(
            (sum: number, payment: Record<string, any>) =>
              sum + toNumber(payment.marketplace_fee),
            0,
          )
        : null;

      const dateCreated = toDate(raw.date_created) ?? new Date();
      const dateClosed = toDate(raw.date_closed);
      const totalAmount = toNumber(raw.total_amount);
      const paidAmount =
        paymentRows.reduce(
          (sum: number, payment: Record<string, any>) =>
            sum + toNumber(payment.total_paid_amount ?? payment.transaction_amount),
          0,
        ) || totalAmount;

      const order = await prisma.mercadoLivreOrder.upsert({
        where: { mlOrderId },
        update: {
          sellerUserId,
          status: String(raw.status ?? "unknown"),
          dateCreated,
          dateClosed,
          currencyId: String(raw.currency_id ?? "BRL"),
          totalAmount,
          paidAmount,
          marketplaceFeeTotal,
          shippingId:
            raw.shipping?.id == null ? null : String(raw.shipping.id),
          buyerNickname:
            typeof raw.buyer?.nickname === "string" ? raw.buyer.nickname : null,
          raw,
          lastSyncedAt: new Date(),
        },
        create: {
          mlOrderId,
          sellerUserId,
          status: String(raw.status ?? "unknown"),
          dateCreated,
          dateClosed,
          currencyId: String(raw.currency_id ?? "BRL"),
          totalAmount,
          paidAmount,
          marketplaceFeeTotal,
          shippingId:
            raw.shipping?.id == null ? null : String(raw.shipping.id),
          buyerNickname:
            typeof raw.buyer?.nickname === "string" ? raw.buyer.nickname : null,
          raw,
          lastSyncedAt: new Date(),
        },
      });

      const orderItems = Array.isArray(raw.order_items) ? raw.order_items : [];

      for (let itemIndex = 0; itemIndex < orderItems.length; itemIndex += 1) {
        const row = orderItems[itemIndex] as Record<string, any>;
        const item = (row.item ?? {}) as Record<string, any>;
        const mlItemId = String(item.id ?? "");
        if (!mlItemId) continue;

        const variationId =
          item.variation_id == null ? null : String(item.variation_id);
        const externalKey = [
          mlOrderId,
          mlItemId,
          variationId ?? "base",
          String(itemIndex),
        ].join(":");
        const sku =
          typeof item.seller_sku === "string"
            ? item.seller_sku
            : typeof item.seller_custom_field === "string"
              ? item.seller_custom_field
              : null;

        let unitCost: number | null = null;
        if (sku) {
          const localProduct = await prisma.product.findUnique({
            where: { sku },
            select: {
              supplierPrice: true,
              discountPercent: true,
            },
          });

          if (localProduct) {
            unitCost =
              Number(localProduct.supplierPrice) *
              (1 - Number(localProduct.discountPercent) / 100);
          }
        }

        await prisma.mercadoLivreOrderItem.upsert({
          where: { externalKey },
          update: {
            orderId: order.id,
            mlItemId,
            variationId,
            title: String(item.title ?? mlItemId),
            sku,
            quantity: Math.max(1, toNumber(row.quantity)),
            unitPrice: toNumber(row.unit_price),
            saleFee:
              row.sale_fee == null ? null : toNumber(row.sale_fee),
            listingTypeId:
              typeof row.listing_type_id === "string"
                ? row.listing_type_id
                : null,
            unitCost,
          },
          create: {
            externalKey,
            orderId: order.id,
            mlItemId,
            variationId,
            title: String(item.title ?? mlItemId),
            sku,
            quantity: Math.max(1, toNumber(row.quantity)),
            unitPrice: toNumber(row.unit_price),
            saleFee:
              row.sale_fee == null ? null : toNumber(row.sale_fee),
            listingTypeId:
              typeof row.listing_type_id === "string"
                ? row.listing_type_id
                : null,
            unitCost,
          },
        });
      }

      const persistedItems = await prisma.mercadoLivreOrderItem.findMany({
        where: { orderId: order.id },
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          unitCost: true,
          saleFee: true,
        },
      });

      const missingProductCost = persistedItems.some(
        (item) => item.unitCost == null,
      );

      let realizedShippingCost: number | null = null;
      if (order.shippingId) {
        realizedShippingCost = await getShipmentCosts({
          accessToken: session.accessToken,
          shipmentId: order.shippingId,
        })
          .then((quote) => quote.sellerCost)
          .catch(() => null);
      }

      const itemFeeTotal = persistedItems.reduce(
        (sum, item) => sum + Number(item.saleFee ?? 0),
        0,
      );
      const realizedFee =
        marketplaceFeeTotal != null && marketplaceFeeTotal > 0
          ? marketplaceFeeTotal
          : itemFeeTotal > 0
            ? itemFeeTotal
            : null;

      const totalProductCost = missingProductCost
        ? null
        : persistedItems.reduce(
            (sum, item) =>
              sum + Number(item.unitCost ?? 0) * item.quantity,
            0,
          );

      const settings = await prisma.appSettings.findUnique({
        where: { id: "default" },
        select: { operatingCostDefault: true },
      });
      const operatingCost = Number(settings?.operatingCostDefault ?? 0);

      const profitReady =
        totalProductCost != null &&
        realizedShippingCost != null &&
        realizedFee != null;

      const realizedFeeValue = realizedFee ?? 0;
      const realizedShippingValue = realizedShippingCost ?? 0;
      const totalProductCostValue = totalProductCost ?? 0;

      const realizedProfit = profitReady
        ? totalAmount -
          realizedFeeValue -
          realizedShippingValue -
          totalProductCostValue -
          operatingCost
        : null;
      const realizedMargin =
        realizedProfit != null && totalAmount > 0
          ? (realizedProfit / totalAmount) * 100
          : null;

      if (profitReady && realizedProfit != null) {
        const totalItemRevenue = persistedItems.reduce(
          (sum, item) => sum + Number(item.unitPrice) * item.quantity,
          0,
        );

        for (const item of persistedItems) {
          const itemRevenue = Number(item.unitPrice) * item.quantity;
          const share =
            totalItemRevenue > 0 ? itemRevenue / totalItemRevenue : 0;
          const allocatedFee = realizedFeeValue * share;
          const allocatedShipping = realizedShippingValue * share;
          const allocatedOperating = operatingCost * share;
          const itemCost = Number(item.unitCost ?? 0) * item.quantity;
          const itemProfit =
            itemRevenue -
            allocatedFee -
            allocatedShipping -
            allocatedOperating -
            itemCost;

          await prisma.mercadoLivreOrderItem.update({
            where: { id: item.id },
            data: { profit: itemProfit },
          });
        }
      }

      await prisma.mercadoLivreOrder.update({
        where: { id: order.id },
        data: {
          shippingCost: realizedShippingCost,
          marketplaceFeeTotal: realizedFee,
          profit: realizedProfit,
          marginPercent: realizedMargin,
          profitabilityStatus: missingProductCost
            ? "AWAITING_PRODUCT_COST"
            : realizedShippingCost == null
              ? "AWAITING_SHIPPING_COST"
              : realizedFee == null
                ? "AWAITING_FEE"
                : "REALIZED",
        },
      });

      saved += 1;
    }

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        itemsRead: orders.length,
        itemsSaved: saved,
      },
    });

    return { itemsRead: orders.length, itemsSaved: saved };
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : "Unknown sync error",
      },
    });
    throw error;
  }
}
