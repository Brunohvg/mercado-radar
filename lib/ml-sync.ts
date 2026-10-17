import { hasRefund, allocateCents } from "@/lib/sales-economics";
import { recalculateOrder } from "@/lib/recalculate-order";
import { prisma } from "@/lib/prisma";
import { recordOwnListings } from "@/lib/market-intel";
import {
  getItemsBulk,
  getItemsCurrentPrices,
  getItemsVisitTotals,
  getMlSession,
  getMlSessionForAccount,
  getOrderShipment,
  getShipmentCosts,
  getShipmentOrderIds,
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

export async function syncMercadoLivreProducts(accountId?: string) {
  const session = accountId ? await getMlSessionForAccount(accountId) : await getMlSession();
  const sellerUserId = session.account.mercadoLivreUserId;
  const syncRun = await prisma.syncRun.create({
    data: { workspaceId: session.account.workspaceId, kind: "ML_PRODUCTS", status: "RUNNING" },
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
            catalogProductId: item.catalogProductId,
            userProductId: item.userProductId,
            listingCreatedAt: item.dateCreated ? new Date(item.dateCreated) : null,
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
            catalogProductId: item.catalogProductId,
            userProductId: item.userProductId,
            listingCreatedAt: item.dateCreated ? new Date(item.dateCreated) : null,
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

      // Série oficial dos anúncios próprios (vendidos exatos + visitas da API):
      // calibra a conversão e a idade usadas nas estimativas de terceiros.
      await recordOwnListings(
        session.account.workspaceId,
        details.map((item) => ({
          id: item.id,
          title: item.title,
          price: prices[item.id] ?? (item.currentPrice > 0 ? item.currentPrice : null),
          soldQuantity: item.soldQuantity,
          visitsTotal: visits[item.id] ?? null,
          dateCreated: item.dateCreated,
          permalink: item.permalink,
          thumbnail: item.thumbnail,
          categoryId: item.categoryId,
          catalogProductId: item.catalogProductId,
          sellerId: item.sellerId,
          freeShipping: item.freeShipping,
          fulfillment: item.logisticType === "fulfillment",
        })),
      ).catch((error) => {
        console.warn("[market-intel] falha ao registrar leitura oficial", error);
      });
    }

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        itemsRead: ids.length,
        itemsSaved: saved,
        metadata: { total, truncated: ids.length < total },
      },
    });

    return { itemsRead: ids.length, itemsSaved: saved, total, truncated: ids.length < total };
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

export async function syncMercadoLivreOrders(days = 30, accountId?: string) {
  const session = accountId ? await getMlSessionForAccount(accountId) : await getMlSession();
  const sellerUserId = session.account.mercadoLivreUserId;
  const syncRun = await prisma.syncRun.create({
    data: {
      workspaceId: session.account.workspaceId,
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

      if (results.length === 0 || orders.length >= 2000) break;
    } while (offset < total);

    let saved = 0;
    const shipmentQuotes = new Map<string, Promise<{ cost: number | null; orderIds: string[] | null }>>();
    const sharedShipments = new Map<string, { cost: number; orderIds: string[] }>();

    for (const raw of orders) {
      const mlOrderId = String(raw.id ?? "");
      if (!mlOrderId) continue;

      const paymentRows = Array.isArray(raw.payments) ? raw.payments : [];
      const orderMarketplaceFee =
        raw.marketplace_fee == null ? null : toNumber(raw.marketplace_fee);
      const paymentMarketplaceFee = paymentRows.length && paymentRows.every((p: Record<string, any>) => p.marketplace_fee != null)
        ? paymentRows.reduce(
            (sum: number, payment: Record<string, any>) =>
              sum + toNumber(payment.marketplace_fee),
            0,
          )
        : null;
      const marketplaceFeeTotal =
        orderMarketplaceFee != null
          ? orderMarketplaceFee
          : paymentMarketplaceFee != null
            ? paymentMarketplaceFee
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

      let resolvedShipmentId =
        raw.shipping?.id == null ? null : String(raw.shipping.id);

      const orderShipment = await getOrderShipment({
        accessToken: session.accessToken,
        orderId: mlOrderId,
      }).catch(() => null);

      if (orderShipment) {
        resolvedShipmentId =
          resolvedShipmentId ?? orderShipment.shipmentId;
      }

      const order = await prisma.mercadoLivreOrder.upsert({
        where: { mlOrderId },
        update: {
          sellerUserId,
          refundDetected: hasRefund(raw),
          status: String(raw.status ?? "unknown"),
          dateCreated,
          dateClosed,
          currencyId: String(raw.currency_id ?? "BRL"),
          totalAmount,
          paidAmount,
          marketplaceFeeTotal,
          shippingId: resolvedShipmentId,
          buyerNickname:
            typeof raw.buyer?.nickname === "string" ? raw.buyer.nickname : null,
          raw,
          lastSyncedAt: new Date(),
        },
        create: {
          mlOrderId,
          sellerUserId,
          refundDetected: hasRefund(raw),
          status: String(raw.status ?? "unknown"),
          dateCreated,
          dateClosed,
          currencyId: String(raw.currency_id ?? "BRL"),
          totalAmount,
          paidAmount,
          marketplaceFeeTotal,
          shippingId: resolvedShipmentId,
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

        const mlProductCost = await prisma.mercadoLivreProduct.findUnique({
          where: { mlItemId },
          select: {
            supplierPrice: true,
            discountPercent: true,
          },
        });

        if (mlProductCost?.supplierPrice != null) {
          unitCost =
            Number(mlProductCost.supplierPrice) *
            (1 - Number(mlProductCost.discountPercent) / 100);
        } else if (sku) {
          const localProduct = await prisma.product.findUnique({
            where: { workspaceId_sku: { workspaceId: session.account.workspaceId, sku } },
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
        if (unitCost != null) await prisma.mercadoLivreOrderItem.updateMany({ where: { externalKey, unitCost: null }, data: { unitCost } });
      }

      if (Array.isArray(raw.order_items)) {
        const currentKeys = orderItems.map((row: Record<string, any>, index: number) => [mlOrderId, String(row.item?.id ?? ""), row.item?.variation_id == null ? "base" : String(row.item.variation_id), String(index)].join(":"));
        await prisma.mercadoLivreOrderItem.deleteMany({ where: { orderId: order.id, externalKey: { notIn: currentKeys } } });
      }
      const persistedItems = await prisma.mercadoLivreOrderItem.findMany({
        where: { orderId: order.id },
        select: {
          id: true,
          mlItemId: true,
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
        let quote = shipmentQuotes.get(order.shippingId);
        if (!quote) {
          quote = Promise.all([
            getShipmentCosts({ accessToken: session.accessToken, shipmentId: order.shippingId }).then((q) => q.sellerCost).catch(() => null),
            getShipmentOrderIds({ accessToken: session.accessToken, shipmentId: order.shippingId, sellerUserId }).catch(() => null),
          ]).then(([cost, orderIds]) => ({ cost, orderIds }));
          shipmentQuotes.set(order.shippingId, quote);
        }
        const shipping = await quote;
        if (shipping.orderIds?.length === 1 && shipping.orderIds[0] === mlOrderId) {
          realizedShippingCost = shipping.cost;
        } else if (shipping.orderIds && shipping.orderIds.length > 1 && shipping.cost != null) {
          sharedShipments.set(order.shippingId, { cost: shipping.cost, orderIds: shipping.orderIds });
        }
        // Unknown members of a shipment cannot safely be charged its full cost.
      }

      const itemFeeTotal = persistedItems.reduce(
        (sum, item) =>
          sum + Number(item.saleFee ?? 0) * Math.max(item.quantity, 1),
        0,
      );
      const realizedFee =
        marketplaceFeeTotal != null
          ? marketplaceFeeTotal
          : persistedItems.length > 0 && persistedItems.every((item) => item.saleFee != null)
            ? itemFeeTotal
            : null;

      await prisma.mercadoLivreOrder.update({
        where: { id: order.id },
        data: { shippingCost: realizedShippingCost, marketplaceFeeTotal: realizedFee },
      });
      await recalculateOrder(order.id, session.account.workspaceId, sellerUserId);
      await prisma.mercadoLivreNotification.updateMany({ where: { userId: sellerUserId, resource: `/orders/${mlOrderId}`, topic: "orders_v2", status: "PENDING", createdAt: { lte: syncRun.startedAt } }, data: { status: "PROCESSED", processedAt: new Date() } });

      saved += 1;
    }

    for (const [shipmentId, shipping] of sharedShipments) {
      const siblings = await prisma.mercadoLivreOrder.findMany({ where: { sellerUserId, shippingId: shipmentId, mlOrderId: { in: shipping.orderIds } }, orderBy: { mlOrderId: "asc" } });
      if (siblings.length !== shipping.orderIds.length || siblings.some((o) => o.status !== "paid" || o.refundDetected)) continue;
      const allocated = allocateCents(Math.round(shipping.cost * 100), siblings.map((o) => Number(o.totalAmount)));
      for (let index = 0; index < siblings.length; index++) {
        const sibling = siblings[index];
        await prisma.mercadoLivreOrder.update({ where: { id: sibling.id }, data: { shippingCost: allocated[index] / 100 } });
        await recalculateOrder(sibling.id, session.account.workspaceId, sellerUserId);
      }
    }

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        itemsRead: orders.length,
        itemsSaved: saved,
        // o Radar só trata vendas por anúncio como "oficiais" se a janela
        // tiver 30+ dias e nenhum pedido tiver ficado de fora
        metadata: { days, total, truncated: orders.length < total },
      },
    });

    return { itemsRead: orders.length, itemsSaved: saved, total, truncated: orders.length < total };
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
