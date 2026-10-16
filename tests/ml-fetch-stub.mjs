// Test-only official API contract fixtures. Never loaded by the application.
if (process.env.RADAR_TEST_DATABASE !== "1")
  throw new Error("ML fixture loader requires an isolated test database.");
const original = globalThis.fetch;
const prefix = process.env.RADAR_TEST_FIXTURE_PREFIX;
let refreshCount = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : (input.url ?? String(input)),
  );
  if (url.hostname !== "api.mercadolibre.com") return original(input, init);
  const seller = prefix + "100",
    item = "MLB999000001",
    now = new Date().toISOString();
  const json = (value) =>
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const make = (suffix, total, status = "paid", extra = {}) => ({
    id: prefix + suffix,
    status,
    date_created: now,
    currency_id: "BRL",
    total_amount: total,
    seller: { id: seller },
    shipping: {
      id: prefix + (suffix.startsWith("pack") ? "ship-pack" : "ship-missing"),
    },
    payments: [{ status: "approved", transaction_amount: total }],
    order_items: [
      {
        item: { id: item, title: "Kit ilhós", seller_sku: "SAME-SKU" },
        quantity: 1,
        unit_price: total,
        sale_fee: total * 0.12,
      },
    ],
    ...extra,
  });
  const denied = () =>
    new Response(
      JSON.stringify({ error: "forbidden", message: "fixture restricted" }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  if (url.pathname === "/oauth/token") {
    refreshCount++;
    return json({
      access_token: prefix + "ml-refresh-" + refreshCount,
      refresh_token: prefix + "ml-refresh-token-" + refreshCount,
      expires_in: 21600,
      scope: "read offline_access",
    });
  }
  if (url.pathname === "/users/me")
    return json({ id: seller, nickname: "Teste A" });
  if (url.pathname === `/users/${seller}/items/search`)
    return json({ results: [item] });
  if (url.pathname === "/items" || url.pathname === "/items/bulk")
    return json(
      (url.searchParams.get("ids") || "")
        .split(",")
        .map((id) =>
          id === item
            ? {
                code: 200,
                body: {
                  id,
                  title: "Kit ilhós",
                  price: 100,
                  category_id: "MLB1234",
                  seller_id: seller,
                  listing_type_id: "gold_special",
                  sold_quantity: 205,
                  available_quantity: 20,
                  shipping: { free_shipping: false, logistic_type: "drop_off" },
                },
              }
            : { code: 403, body: { id } },
        ),
    );
  if (url.pathname === "/sites/MLB/listing_prices") {
    const rate =
      url.searchParams.get("listing_type_id") === "gold_pro" ? 0.165 : 0.12;
    return json({
      sale_fee_amount:
        Math.round((Number(url.searchParams.get("price")) * rate + 4) * 100) /
        100,
      sale_fee_details: { fixed_fee: 4, percentage_fee: rate * 100 },
    });
  }
  if (url.pathname === "/sites/MLB/domain_discovery/search")
    return json([{ category_id: "MLB1234", category_name: "Fios" }]);
  if (
    url.pathname.startsWith("/user-products/") ||
    url.pathname.startsWith("/products") ||
    url.pathname.startsWith("/trends/") ||
    url.pathname.startsWith("/advertising/") ||
    url.pathname.includes("items_visits")
  )
    return denied();
  if (url.pathname === "/orders/search")
    return json({
      paging: { total: 4 },
      results: [
        make("pack-a", 100),
        make("pack-b", 200),
        make("missing-shipping", 100),
        make("cancelled", 100, "cancelled"),
      ],
    });
  if (/^\/orders\/[^/]+\/shipments$/.test(url.pathname)) {
    const packed = url.pathname.includes("pack-");
    return json({
      id: prefix + (packed ? "ship-pack" : "ship-missing"),
      order_cost: packed ? 20 : null,
    });
  }
  if (url.pathname.endsWith("/costs"))
    return json(
      url.pathname.includes("ship-pack")
        ? { senders: [{ id: seller, cost: 20 }] }
        : { senders: [] },
    );
  if (url.pathname.endsWith("/items"))
    return json(
      url.pathname.includes("ship-pack")
        ? [
            { order_id: prefix + "pack-a", sender_id: seller },
            { order_id: prefix + "pack-b", sender_id: seller },
          ]
        : [{ order_id: prefix + "missing-shipping", sender_id: seller }],
    );
  throw new Error("Unexpected Mercado Livre request in test: " + url.pathname);
};
