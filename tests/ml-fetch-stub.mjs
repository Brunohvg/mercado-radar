// Test-only official API contract fixtures. Never loaded by the application.
if (process.env.RADAR_TEST_DATABASE !== "1")
  throw new Error("ML fixture loader requires an isolated test database.");
const original = globalThis.fetch;
const prefix = process.env.RADAR_TEST_FIXTURE_PREFIX;
let refreshCount = 0;
const researchCalls = new Map();
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
  const researchItem = (id) => {
    const index = Number(id.slice(-3));
    const quantity = [2, 4, 6, 8][index % 4];
    return {
      id,
      title: `Kit ${quantity} Canetas Fantasminha Montovani Azul`,
      price: quantity * 8.99,
      currency_id: index === 26 ? "USD" : "BRL",
      status: index === 25 ? "paused" : "active",
      category_id: "MLB1234",
      seller_id: "competitor-" + index,
      attributes: [
        { id: "BRAND", value_name: "Montovani" },
        { id: "MODEL", value_name: "Fantasminha" },
        { id: "COLOR", value_name: "Azul" },
        { id: "UNITS_PER_PACK", value_name: String(quantity) },
      ],
      shipping: {
        free_shipping: true,
        logistic_type: index % 2 ? "fulfillment" : "drop_off",
      },
      ...(index === 0 ? { sold_quantity: 0 } : {}),
      permalink: `https://produto.mercadolivre.com.br/${id}`,
      listing_type_id: "gold_special",
    };
  };
  if (url.pathname === "/sites/MLB/search") {
    const q = url.searchParams.get("q") ?? "";
    if (
      ![
        "Caneta Fantasminha Montovani",
        "Caneta",
        "Kit 2 Canetas Fantasminha Montovani Azul",
      ].includes(q) &&
      !q.startsWith("qa-research-")
    )
      return denied();
    const attempt = (researchCalls.get(q) ?? 0) + 1;
    researchCalls.set(q, attempt);
    if (q.includes("401") || q.includes("403"))
      return new Response(JSON.stringify({ message: "fixture restriction" }), {
        status: q.includes("401") ? 401 : 403,
      });
    if (q.includes("timeout") && attempt === 1)
      throw new DOMException("Fixture timeout", "TimeoutError");
    if ((q.includes("429") || q.includes("500")) && attempt < 3)
      return new Response("{}", {
        status: q.includes("429") ? 429 : 500,
        headers: { "Retry-After": "0" },
      });
    const offset = Number(url.searchParams.get("offset") ?? 0),
      limit = Number(url.searchParams.get("limit") ?? 20);
    return json({
      results: Array.from(
        { length: Math.max(0, Math.min(limit, 27 - offset)) },
        (_, n) =>
          researchItem("MLB777000" + String(offset + n).padStart(3, "0")),
      ),
      paging: { total: 27 },
    });
  }
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
      (url.searchParams.get("ids") || "").split(",").map((id) =>
        /^MLB777000\d{3}$/.test(id)
          ? { id, status_code: 200, body: researchItem(id) }
          : [item, "MLB999000002"].includes(id)
            ? {
                code: 200,
                body: {
                  id,
                  title: "Kit ilhós",
                  price: 100,
                  category_id: "MLB1234",
                  seller_id: id === item ? seller : "foreign-seller",
                  seller_custom_field: id === item ? undefined : "SAME-SKU",
                  listing_type_id: "gold_special",
                  sold_quantity: 205,
                  available_quantity: 20,
                  shipping: {
                    free_shipping: id !== item,
                    logistic_type: "drop_off",
                    dimensions: id === item ? null : "10x15x20,500",
                  },
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
  if (/^\/users\/[^/]+\/shipping_options\/free$/.test(url.pathname)) {
    const account = url.pathname.split("/")[2];
    if (![seller, prefix + "200"].includes(account)) return denied();
    const dimensions = url.searchParams.get("dimensions");
    if (dimensions?.endsWith(",99999")) return denied();
    if (
      dimensions &&
      (!url.searchParams.has("item_price") ||
        !url.searchParams.has("listing_type_id") ||
        !url.searchParams.has("logistic_type"))
    )
      return denied();
    if (!dimensions && url.searchParams.get("item_id") !== item)
      return denied();
    return json({
      coverage: {
        all_country: {
          list_cost: dimensions ? (account === seller ? 6.85 : 9.85) : 0,
          billable_weight: 500,
          ...(dimensions
            ? {
                discount: {
                  rate: 0.5,
                  promoted_amount: account === seller ? 13.7 : 19.7,
                },
              }
            : {}),
        },
      },
    });
  }
  if (url.pathname === "/products/MLB88800001/items")
    return json({
      paging: { total: 52 },
      results: [0, 1, 2, 3, 4].map((i) => ({
        item_id: "MLB88000000" + (i + 1),
        seller_id: "seller-" + i,
        price: 19.68 + i,
        shipping: {
          logistic_type: [0, 2].includes(i) ? "fulfillment" : "drop_off",
        },
      })),
    });
  if (/^\/items\/MLB\d+\/visits\/time_window$/.test(url.pathname)) {
    const id = url.pathname.split("/")[2];
    if (!/^MLB88000000[1-5]$/.test(id) && id !== item) return denied();
    const to = new Date(url.searchParams.get("ending"));
    const from = new Date(to.getTime() - 30 * 86400000);
    return json({
      item_id: id,
      date_from: from.toISOString(),
      date_to: to.toISOString(),
      total_visits:
        id === item ? 600 : [900, 700, 354, 326, 0][Number(id.at(-1)) - 1],
    });
  }
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
