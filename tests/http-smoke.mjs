import assert from "node:assert/strict";
import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";
import { loadTs } from "./load-ts.mjs";
const { defaultKitScenario, generateKitCompositions } = await loadTs(
  "../lib/kit-optimizer.ts",
);

if (process.env.RADAR_TEST_DATABASE !== "1")
  throw new Error(
    "RADAR_TEST_DATABASE=1 is required. Use an isolated test database.",
  );
pg.defaults.parseInputDatesAsUTC = true;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const port = Number(process.env.RADAR_TEST_PORT || 3319),
  base = `http://127.0.0.1:${port}`;
const password = "Radar-Teste-2026-Only";
const salt = randomBytes(16);
const hash = `scrypt:${salt.toString("base64url")}:${scryptSync(password, salt, 64).toString("base64url")}`;
const prefix = "qa" + randomBytes(4).toString("hex");
const child = spawn(
  process.execPath,
  [
    "--import",
    "./tests/ml-fetch-stub.mjs",
    "node_modules/next/dist/bin/next",
    "start",
    "-p",
    String(port),
    "--hostname",
    "127.0.0.1",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RADAR_TEST_FIXTURE_PREFIX: prefix,
      RADAR_INTELLIGENCE_ENABLED: "1",
      MERCADO_LIVRE_CLIENT_ID: "radar-test-app",
      MERCADO_LIVRE_CLIENT_SECRET: "radar-test-secret",
      ADMIN_EMAIL: "operator@radar.test",
      ADMIN_PASSWORD_HASH: hash,
      APP_ENCRYPTION_KEY: "radar-testing-encryption-key-never-for-production",
      NEXT_PUBLIC_APP_URL: base,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
child.stdout.on("data", (d) => {
  logs += d;
});
child.stderr.on("data", (d) => {
  logs += d;
});
let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log("PASS " + name);
}
async function req(path, cookie = "", method = "GET", body, extra = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {}
  return {
    status: response.status,
    json,
    text,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
    headers: response.headers,
  };
}
async function login(email, pw = password) {
  const r = await req("/api/auth/login", "", "POST", { email, password: pw });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.cookie);
  return r.cookie;
}
async function insert(table, data) {
  const keys = Object.keys(data);
  await db.query(
    `INSERT INTO "${table}" (${keys.map((k) => '"' + k + '"').join(",")}) VALUES (${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
    keys.map((k) => data[k]),
  );
}
function encrypt(value) {
  const key = createHash("sha256")
      .update("radar-testing-encryption-key-never-for-production")
      .digest(),
    iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    c.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
const settings = {
  name: "Operação de teste A",
  taxPercent: 4,
  operatingCostDefault: 1,
  defaultDiscountPercent: 10,
  targetMarginPercent: 20,
  targetRoiPercent: 30,
  leadTimeDays: 7,
  safetyStockDays: 7,
  stockCoverageDays: 21,
};
try {
  for (let i = 0; i < 180; i++) {
    if (child.exitCode != null) throw new Error(logs);
    try {
      if ((await fetch(base + "/login")).status === 200) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
    if (i === 179) throw new Error("Server timeout: " + logs);
  }
  await check("anonymous APIs are protected", async () =>
    assert.equal((await req("/api/workspace")).status, 401),
  );
  const operator = await login("operator@radar.test");
  const emailA = prefix + "a@radar.test",
    emailB = prefix + "b@radar.test";
  await check("operator provisions individual clients", async () => {
    for (const [email, name] of [
      [emailA, "Operação A"],
      [emailB, "Operação B"],
    ])
      assert.equal(
        (
          await req("/api/workspace/clients", operator, "POST", {
            name,
            email,
            password,
            dailyRequestLimit: 500,
          })
        ).status,
        201,
      );
  });
  const cookieA = await login(emailA),
    cookieB = await login(emailB);
  const userA = (
      await db.query('SELECT * FROM "RadarUser" WHERE email=$1', [emailA])
    ).rows[0],
    userB = (
      await db.query('SELECT * FROM "RadarUser" WHERE email=$1', [emailB])
    ).rows[0];
  await check(
    "new client starts without invented profit or confirmed tax",
    async () => {
      const r = await req("/api/decisions", cookieA);
      assert.equal(r.json.connected, false);
      assert.equal(r.json.summary, null);
      assert.equal(r.json.configured, false);
    },
  );
  await check("clients cannot manage clients", async () =>
    assert.equal((await req("/api/workspace/clients", cookieA)).status, 403),
  );
  await check("client settings cannot elevate a plan", async () => {
    assert.equal(
      (
        await req("/api/workspace", cookieA, "PATCH", {
          ...settings,
          plan: "BUSINESS",
        })
      ).status,
      200,
    );
    assert.equal(
      (await req("/api/workspace", cookieA)).json.workspace.plan,
      "PILOT",
    );
  });
  await check("cross-origin mutations rejected", async () =>
    assert.equal(
      (
        await req("/api/workspace", cookieA, "PATCH", settings, {
          origin: "https://not-radar.test",
        })
      ).status,
      403,
    ),
  );
  const now = new Date(),
    future = new Date(Date.now() + 3600_000);
  const accounts = [];
  for (const [user, seller, label] of [
    [userA, prefix + "100", "A"],
    [userB, prefix + "200", "B"],
  ]) {
    const accountId = prefix + "account" + label;
    accounts.push(accountId);
    await insert("MercadoLivreAccount", {
      id: accountId,
      workspaceId: user.workspaceId,
      mercadoLivreUserId: seller,
      nickname: "Loja " + label,
      accessTokenEncrypted: encrypt("test-access"),
      refreshTokenEncrypted: encrypt("test-refresh"),
      tokenExpiresAt: future,
      updatedAt: now,
    });
    await insert("MercadoLivreProduct", {
      id: prefix + "product" + label,
      mlItemId: "MLB" + (label === "A" ? "999000001" : "999000002"),
      sellerUserId: seller,
      title:
        label === "A" ? "Kit ilhós nº54 dourado e prata" : "Produto privado B",
      status: "active",
      currentPrice: 100,
      availableQuantity: 5,
      supplierPrice: 40,
      raw: {},
      updatedAt: now,
    });
    await insert("MarketItem", {
      id: "MLB999000100",
      workspaceId: user.workspaceId,
      title: "Observação privada " + label,
      updatedAt: now,
    });
    await insert("Product", {
      id: prefix + "local" + label,
      workspaceId: user.workspaceId,
      name: "SKU privado " + label,
      sku: "SAME-SKU",
      supplierPrice: 40,
      updatedAt: now,
    });
    await insert("ProductAnalysis", {
      id: prefix + "analysis" + label,
      workspaceId: user.workspaceId,
      productName: "Análise privada " + label,
      supplierPrice: 40,
      discountPercent: 0,
      unitCost: 40,
      purchaseCost: 40,
      salePrice: 100,
      commissionPercent: 12,
      commissionAmount: 12,
      fixedFee: 0,
      shippingCost: 7,
      operatingCost: 1,
      amountReceived: 81,
      profit: 36,
      marginPercent: 36,
      roiPercent: 87.8,
      targetMarginPercent: 20,
      targetRoiPercent: 30,
      minimumSuggestedPrice: 80,
      verdict: "GOOD",
    });
    await insert("SyncRun", {
      id: prefix + "sync" + label,
      workspaceId: user.workspaceId,
      kind: "ML_ORDERS",
      status: "SUCCESS",
      finishedAt: now,
      metadata: { days: 90, truncated: false },
    });
  }
  // 205 paid orders prove totals cover all pages; other statuses never become revenue/profit.
  await db.query(
    `INSERT INTO "MercadoLivreOrder" (id,"mlOrderId","sellerUserId",status,"dateCreated","totalAmount","marketplaceFeeTotal","shippingCost",profit,"marginPercent","profitabilityStatus","economicsVersion","taxPercentApplied","operatingCostApplied",raw,"updatedAt")
 SELECT $1||n,$1||n,$2,'paid',NOW(),100,12,7,36,36,'REALIZED',1,4,1,'{}',NOW() FROM generate_series(1,205) n`,
    [prefix + "orderA", prefix + "100"],
  );
  await db.query(
    `INSERT INTO "MercadoLivreOrderItem" (id,"externalKey","orderId","mlItemId",title,quantity,"unitPrice","unitCost",profit,"updatedAt") SELECT id||'item',id||'key',id,'MLB999000001','Kit ilhós nº54 dourado e prata',1,100,40,36,NOW() FROM "MercadoLivreOrder" WHERE "sellerUserId"=$1`,
    [prefix + "100"],
  );
  for (const [suffix, status, refund] of [
    ["pending", "confirmed", false],
    ["cancel", "cancelled", false],
    ["refund", "paid", true],
  ])
    await insert("MercadoLivreOrder", {
      id: prefix + suffix,
      mlOrderId: prefix + suffix,
      sellerUserId: prefix + "100",
      status,
      dateCreated: now,
      totalAmount: 999,
      profit: 999,
      refundDetected: refund,
      raw: {},
      updatedAt: now,
    });
  await insert("MercadoLivreOrder", {
    id: prefix + "orderB",
    mlOrderId: prefix + "orderB",
    sellerUserId: prefix + "200",
    status: "paid",
    dateCreated: now,
    totalAmount: 10000,
    raw: {},
    updatedAt: now,
  });
  await check(
    "financial summary covers every page and excludes unpaid/cancelled/refunded",
    async () => {
      const r = await req("/api/ml/sales?days=30", cookieA);
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.summary.orders, 205);
      assert.equal(r.json.summary.grossRevenue, 20500);
      assert.equal(r.json.summary.realizedProfit, 7380);
      assert.equal(r.json.orders.length, 100);
      assert.equal(r.json.pagination.pages, 3);
    },
  );
  await check("sales never leak another client", async () => {
    const r = await req("/api/ml/sales?days=30", cookieB);
    assert.equal(r.json.summary.grossRevenue, 10000);
    assert.equal(r.json.orders.length, 1);
  });
  await check(
    "market observations are scoped even with identical item ID",
    async () => {
      const a = await req("/api/market/items?scope=all", cookieA),
        b = await req("/api/market/items?scope=all", cookieB);
      assert.equal(a.status, 200, a.text);
      assert.equal(a.json.items[0].title, "Observação privada A");
      assert.equal(b.json.items[0].title, "Observação privada B");
    },
  );
  await check(
    "intelligence endpoints require a session and reject arbitrary URL imports",
    async () => {
      assert.equal(
        (await req("/api/intelligence/competitors?q=Caneta")).status,
        401,
      );
      assert.equal((await req("/api/intelligence/drafts")).status, 401);
      for (const q of [
        "https://127.0.0.1/MLB777000000",
        "https://mercadolivre.com.br.evil.test/MLB777000000",
      ])
        assert.equal(
          (
            await req(
              "/api/intelligence/competitors?q=" + encodeURIComponent(q),
              cookieA,
            )
          ).status,
          400,
        );
    },
  );
  await check(
    "competitor API supports bulk status_code, pagination and absent versus zero sold",
    async () => {
      const first = await req(
        "/api/intelligence/competitors?q=Caneta",
        cookieA,
      );
      assert.equal(first.status, 200, first.text);
      const up = await req(
        "/api/intelligence/competitors?q=" +
          encodeURIComponent(
            "https://www.mercadolivre.com.br/kit-caneta/up/MLBU5074600649?pdp_filters=item_id:MLB777000000",
          ),
        cookieA,
      );
      assert.equal(up.status, 200, up.text);
      assert.equal(up.json.referenceId, "MLB777000000");
      assert.ok(up.json.items.some((i) => i.id === "MLB777000000"));
      assert.equal(first.json.items.length, 20);
      assert.equal(first.json.paging.nextOffset, 20);
      assert.equal(first.json.paging.total, 27);
      assert.equal(first.json.items[0].sold, 0);
      assert.equal(first.json.items[1].sold, null);
      assert.equal(first.json.items[0].unitPrice, 8.99);
      assert.equal(first.json.items[0].brand, "Montovani");
      const next = await req(
        "/api/intelligence/competitors?q=Caneta&offset=20",
        cookieA,
      );
      assert.equal(next.json.items.length, 7);
      assert.equal(
        next.json.items.find((i) => i.id === "MLB777000026").price,
        null,
      );
      assert.equal(
        next.json.items.find((i) => i.id === "MLB777000025").status,
        "paused",
      );
      assert.equal(next.json.paging.hasMore, false);
      assert.equal(
        first.json.items.some((i) => i.id === next.json.items[0].id),
        false,
      );
      assert.equal(JSON.stringify(first.json).includes("accessToken"), false);
      assert.equal(JSON.stringify(first.json).includes("supplierPrice"), false);
    },
  );
  await check(
    "competitor API retries transient failures and preserves permission diagnostics",
    async () => {
      for (const suffix of ["429", "500", "timeout"]) {
        const r = await req(
          "/api/intelligence/competitors?q=qa-research-" + suffix,
          cookieA,
        );
        assert.equal(r.status, 200, r.text);
        assert.equal(r.json.items.length, 20, suffix);
        assert.equal(r.json.apiSucceeded, true);
      }
      for (const [suffix, code] of [
        ["401", "UNAUTHORIZED"],
        ["403", "FORBIDDEN"],
      ]) {
        const r = await req(
          "/api/intelligence/competitors?q=qa-research-" + suffix,
          cookieA,
        );
        assert.equal(r.json.apiSucceeded, false);
        assert.equal(
          r.json.notices.some((n) => n.code === code),
          true,
        );
      }
    },
  );
  await check(
    "saved competitor research and manual classifications cannot cross workspaces or accounts",
    async () => {
      const payload = {
        query: "Caneta",
        categoryId: "",
        referenceId: "MLB777000000",
        selectedIds: ["MLB777000000", "MLB777000001"],
        overrides: [{ id: "MLB777000001", level: "SIMILAR" }],
      };
      const saved = await req("/api/intelligence/drafts", cookieA, "POST", {
        kind: "RESEARCH",
        name: "Pesquisa privada A",
        payload,
      });
      assert.equal(saved.status, 201, saved.text);
      assert.equal(
        (await req("/api/intelligence/drafts", cookieB)).json.drafts.length,
        0,
      );
      assert.equal(
        (
          await req("/api/intelligence/drafts", cookieB, "POST", {
            id: saved.json.id,
            kind: "RESEARCH",
            name: "Ataque",
            payload,
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await req(
            "/api/intelligence/drafts?id=" + saved.json.id,
            cookieB,
            "DELETE",
          )
        ).status,
        404,
      );
      const own = (await req("/api/intelligence/drafts", cookieA)).json.drafts;
      assert.deepEqual(own[0].payload, payload);
      await db.query(
        'UPDATE "RadarResearchDraft" SET "accountId"=$1 WHERE id=$2',
        [accounts[1], saved.json.id],
      );
      assert.equal(
        (await req("/api/intelligence/drafts", cookieA)).json.drafts.length,
        0,
      );
      await db.query(
        'UPDATE "RadarResearchDraft" SET "accountId"=$1 WHERE id=$2',
        [accounts[0], saved.json.id],
      );
      assert.equal(
        (
          await req(
            "/api/intelligence/drafts?id=" + saved.json.id,
            cookieA,
            "DELETE",
          )
        ).status,
        200,
      );
    },
  );
  await check(
    "monitoring a saved observation preserves its date and cannot read a foreign workspace",
    async () => {
      const at = new Date(Date.now() - 86400000 * 3);
      await db.query(
        'UPDATE "MarketItem" SET "lastSeenAt"=$1,"lastPrice"=42,"lastSoldLower"=100 WHERE "workspaceId"=$2 AND id=$3',
        [at, userA.workspaceId, "MLB999000100"],
      );
      const r = await req(
        "/api/intelligence/competitors/watch",
        cookieA,
        "POST",
        { itemId: "MLB999000100" },
      );
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.trackingMode, "PAGE");
      const stored = (
        await db.query(
          'SELECT w."lastCheckedAt",s."capturedAt" FROM "RadarWatchItem" w JOIN "RadarWatchSnapshot" s ON s."watchItemId"=w.id WHERE w."sellerUserId"=$1 AND w."mlItemId"=$2',
          [prefix + "100", "MLB999000100"],
        )
      ).rows[0];
      assert.equal(new Date(stored.lastCheckedAt).getTime(), at.getTime());
      assert.equal(new Date(stored.capturedAt).getTime(), at.getTime());
      assert.equal(
        (
          await req("/api/intelligence/competitors/watch", cookieB, "POST", {
            itemId: "MLB777000000",
          })
        ).status,
        404,
      );
    },
  );
  const kitScenario = {
    ...defaultKitScenario(),
    productName: "Caneta Fantasminha Montovani",
    brand: "Montovani",
    model: "Fantasminha",
    categoryId: "MLB1234",
    unitCost: 4.5,
    variants: ["Azul", "Preta", "Vermelha", "Rosa"].map((label, i) => ({
      id: "v" + i,
      label,
      stock: 12,
      unitCost: null,
    })),
    packageCost: 1,
    operatingCost: 0.8,
    taxPercent: 4,
    commissionPercent: null,
    fixedFee: null,
    shippingCost: null,
    pricePerUnit: 10,
    unitWeightGrams: 10,
    packageWeightGrams: 20,
    dimensions: { heightCm: 5, widthCm: 10, lengthCm: 20 },
  };
  const kitBody = {
    quantity: 8,
    salePrice: 80,
    categoryId: "MLB1234",
    listingType: "CLASSIC",
    logisticType: "drop_off",
    freeShipping: true,
    shippingPackage: {
      weightGrams: 100,
      heightCm: 5,
      widthCm: 10,
      lengthCm: 20,
    },
  };
  await check(
    "kit context and quotes use only the current account and preserve missing costs",
    async () => {
      assert.equal((await req("/api/intelligence/kits/context")).status, 401);
      const a = await req("/api/intelligence/kits/context", cookieA),
        b = await req("/api/intelligence/kits/context", cookieB);
      assert.equal(a.json.accountId, accounts[0]);
      assert.equal(b.json.accountId, accounts[1]);
      assert.equal(b.json.defaults.taxPercent, null);
      const qa = await req(
          "/api/intelligence/kits/quote",
          cookieA,
          "POST",
          kitBody,
        ),
        qb = await req(
          "/api/intelligence/kits/quote",
          cookieB,
          "POST",
          kitBody,
        );
      assert.equal(qa.status, 200, qa.text);
      assert.equal(qb.status, 200, qb.text);
      assert.equal(qa.json.fee.saleFeeAmount, 13.6);
      assert.equal(qa.json.fee.fixedFee, 4);
      assert.equal(qa.json.shipping.shippingCost, 6.85);
      assert.equal(qb.json.shipping.shippingCost, 9.85);
      assert.equal(qa.json.accountId, accounts[0]);
      assert.equal(JSON.stringify(qa.json).includes("accessToken"), false);
      assert.equal(
        (
          await req("/api/intelligence/kits/quote", cookieA, "POST", {
            ...kitBody,
            accountId: accounts[1],
          })
        ).status,
        400,
      );
      const partial = await req(
        "/api/intelligence/kits/quote",
        cookieA,
        "POST",
        { ...kitBody, shippingPackage: null },
      );
      assert.equal(partial.json.shipping, null);
      assert.ok(
        partial.json.notices.some((n) => n.code === "PACKAGE_REQUIRED"),
      );
      const restricted = await req(
        "/api/intelligence/kits/quote",
        cookieA,
        "POST",
        {
          ...kitBody,
          shippingPackage: { ...kitBody.shippingPackage, weightGrams: 99999 },
        },
      );
      assert.equal(restricted.json.shipping, null);
      assert.ok(restricted.json.notices.some((n) => n.code === "FORBIDDEN"));
    },
  );
  await check(
    "kit quote cache preserves timestamp and re-quotes after price or listing change",
    async () => {
      const body = { ...kitBody, salePrice: 83.21 },
        a = await req("/api/intelligence/kits/quote", cookieA, "POST", body),
        b = await req("/api/intelligence/kits/quote", cookieA, "POST", body);
      assert.equal(a.json.quotedAt, b.json.quotedAt);
      assert.deepEqual(a.json.context, b.json.context);
      const changed = await req(
        "/api/intelligence/kits/quote",
        cookieA,
        "POST",
        { ...body, listingType: "PREMIUM" },
      );
      assert.equal(changed.json.fee.commissionPercent, 16.5);
      assert.notEqual(changed.json.fee.saleFeeAmount, a.json.fee.saleFeeAmount);
    },
  );
  await check(
    "kit drafts freeze server quote and canonical finances without creating an ML listing",
    async () => {
      const row = generateKitCompositions(kitScenario).find(
        (r) => r.label === "2 Azul + 2 Preta + 2 Vermelha + 2 Rosa",
      );
      const body = {
        kind: "KIT",
        name: "Kit privado A",
        payload: { scenario: kitScenario, selectedKitId: row.id },
      };
      const before = (
        await db.query('SELECT COUNT(*)::int AS count FROM "ProductAnalysis"')
      ).rows[0].count;
      const created = await req(
        "/api/intelligence/drafts",
        cookieA,
        "POST",
        body,
      );
      assert.equal(created.status, 201, created.text);
      const draft = (
        await req("/api/intelligence/drafts", cookieA)
      ).json.drafts.find((d) => d.id === created.json.id);
      assert.equal(draft.payload.snapshot.financial.profit, 18.55);
      assert.equal(
        draft.payload.snapshot.financial.minimumSuggestedPrice,
        76.02,
      );
      assert.equal(draft.payload.snapshot.quote.accountId, accounts[0]);
      assert.equal(draft.payload.snapshot.feeSource, "ML_API_ESTIMATE");
      assert.equal(draft.payload.snapshot.shippingSource, "ML_API_ESTIMATE");
      assert.equal(
        (await db.query('SELECT COUNT(*)::int AS count FROM "ProductAnalysis"'))
          .rows[0].count,
        before,
      );
      assert.ok(
        !(await req("/api/intelligence/drafts", cookieB)).json.drafts.some(
          (d) => d.id === created.json.id,
        ),
      );
      assert.equal(
        (
          await req("/api/intelligence/drafts", cookieB, "POST", {
            ...body,
            id: created.json.id,
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await req("/api/intelligence/drafts", cookieA, "POST", {
            ...body,
            payload: { ...body.payload, snapshot: { profit: 999999 } },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await req("/api/intelligence/drafts", cookieA, "POST", {
            ...body,
            payload: {
              ...body.payload,
              scenario: {
                ...kitScenario,
                variants: kitScenario.variants.map((v) => ({ ...v, stock: 0 })),
              },
            },
          })
        ).status,
        400,
      );
      await req(
        "/api/intelligence/drafts?id=" + created.json.id,
        cookieA,
        "DELETE",
      );
    },
  );
  await check(
    "turning intelligence off blocks new modules and preserves existing workspace",
    async () => {
      const offPort = port + 1,
        offBase = `http://127.0.0.1:${offPort}`;
      const disabled = spawn(
        process.execPath,
        [
          "--import",
          "./tests/ml-fetch-stub.mjs",
          "node_modules/next/dist/bin/next",
          "start",
          "-p",
          String(offPort),
          "--hostname",
          "127.0.0.1",
        ],
        {
          env: {
            ...process.env,
            RADAR_INTELLIGENCE_ENABLED: "0",
            RADAR_TEST_FIXTURE_PREFIX: prefix,
            APP_ENCRYPTION_KEY:
              "radar-testing-encryption-key-never-for-production",
            NEXT_PUBLIC_APP_URL: offBase,
          },
          stdio: "ignore",
        },
      );
      try {
        let ready = false;
        for (let i = 0; i < 60; i++) {
          try {
            if ((await fetch(offBase + "/login")).status === 200) {
              ready = true;
              break;
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 200));
        }
        assert.equal(ready, true);
        for (const path of [
          "/api/intelligence/kits/context",
          "/api/intelligence/drafts",
          "/api/intelligence/competitors?q=Caneta",
          "/kits",
          "/concorrentes",
        ])
          assert.equal(
            (await fetch(offBase + path, { headers: { cookie: cookieA } }))
              .status,
            404,
            path,
          );
        assert.equal(
          (
            await fetch(offBase + "/api/workspace", {
              headers: { cookie: cookieA },
            })
          ).status,
          200,
        );
      } finally {
        disabled.kill("SIGTERM");
      }
    },
  );
  await check("analysis history and deletion respect ownership", async () => {
    const r = await req("/api/analyses", cookieB);
    assert.equal(r.json.analyses.length, 1);
    assert.equal(r.json.analyses[0].productName, "Análise privada B");
    assert.equal(
      (await req("/api/analyses?id=" + prefix + "analysisA", cookieB, "DELETE"))
        .status,
      404,
    );
  });
  await check("foreign product cost cannot be updated", async () =>
    assert.equal(
      (
        await req("/api/ml/products/cost", cookieB, "PATCH", {
          mlItemId: "MLB999000001",
          supplierPrice: 1,
          discountPercent: 0,
        })
      ).status,
      404,
    ),
  );
  await check("new cost preserves established historical costs", async () => {
    const r = await req("/api/ml/products/cost", cookieA, "PATCH", {
      mlItemId: "MLB999000001",
      supplierPrice: 50,
      discountPercent: 0,
    });
    assert.equal(r.status, 200, r.text);
    const row = (
      await db.query(
        'SELECT "unitCost" FROM "MercadoLivreOrderItem" WHERE "orderId"=$1',
        [prefix + "orderA1"],
      )
    ).rows[0];
    assert.equal(Number(row.unitCost), 40);
  });
  await check("changed cost blocks a restock recommendation", async () => {
    const r = await req("/api/decisions?days=30", cookieA);
    assert.equal(r.json.decisions[0].action, "VALIDATE_PROFIT");
  });
  await req("/api/ml/products/cost", cookieA, "PATCH", {
    mlItemId: "MLB999000001",
    supplierPrice: 40,
    discountPercent: 0,
  });
  await check(
    "decision center sorts useful actions with known stock and history",
    async () => {
      const r = await req("/api/decisions?days=30", cookieA);
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.decisions.length, 1);
      assert.equal(r.json.decisions[0].action, "RESTOCK");
      assert.ok(r.json.decisions[0].suggestedReorder > 0);
    },
  );
  await check("CSV exports full period scoped to client", async () => {
    const r = await req("/api/ml/sales/export?days=30", cookieA);
    assert.equal(r.status, 200, r.text);
    assert.ok(r.text.includes(prefix + "orderA205"));
    assert.ok(!r.text.includes(prefix + "orderB"));
  });
  const verifier = "q".repeat(64),
    code = prefix + "authorization-code-sample",
    codeHash = createHash("sha256").update(code).digest("base64url"),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  await insert("RadarExtensionAuthCode", {
    id: prefix + "authcode",
    codeHash,
    mercadoLivreAccountId: accounts[0],
    codeChallenge: challenge,
    redirectUri: "https://" + "a".repeat(32) + ".chromiumapp.org/radar-auth",
    deviceId: "test-device-123456",
    expiresAt: future,
  });
  let access;
  await check(
    "extension authorization code can only be consumed once",
    async () => {
      const payload = {
        code,
        code_verifier: verifier,
        redirect_uri:
          "https://" + "a".repeat(32) + ".chromiumapp.org/radar-auth",
        grant_type: "authorization_code",
      };
      const responses = await Promise.all([
        req("/api/extension/auth/token", "", "POST", payload),
        req("/api/extension/auth/token", "", "POST", payload),
      ]);
      const good = responses.filter((r) => r.status === 200);
      assert.equal(
        good.length,
        1,
        JSON.stringify(
          responses.map((r) => ({ status: r.status, body: r.json })),
        ),
      );
      access = good[0].json;
    },
  );
  await check(
    "extension refresh tokens rotate and old token is rejected",
    async () => {
      const body = {
        grant_type: "refresh_token",
        refresh_token: access.refresh_token,
        device_id: "test-device-123456",
      };
      const a = await req("/api/extension/auth/refresh", "", "POST", body);
      assert.equal(a.status, 200, a.text);
      assert.notEqual(
        (await req("/api/extension/auth/refresh", "", "POST", body)).status,
        200,
      );
      access = a.json;
    },
  );
  await check(
    "concurrent ML refresh is serialized in the database",
    async () => {
      await db.query(
        'UPDATE "MercadoLivreAccount" SET "tokenExpiresAt"=$2 WHERE id=$1',
        [accounts[0], new Date(Date.now() - 60000)],
      );
      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          req("/api/extension/auth/session", "", "GET", undefined, {
            authorization: "Bearer " + access.access_token,
          }),
        ),
      );
      assert.ok(
        responses.every((r) => r.status === 200),
        JSON.stringify(responses.map((r) => r.text)),
      );
      const row = (
        await db.query(
          'SELECT "accessTokenEncrypted" FROM "MercadoLivreAccount" WHERE id=$1',
          [accounts[0]],
        )
      ).rows[0];
      const [, iv, tag, encrypted] = row.accessTokenEncrypted.split(".");
      const c = createDecipheriv(
        "aes-256-gcm",
        createHash("sha256")
          .update("radar-testing-encryption-key-never-for-production")
          .digest(),
        Buffer.from(iv, "base64url"),
      );
      c.setAuthTag(Buffer.from(tag, "base64url"));
      assert.equal(
        Buffer.concat([
          c.update(Buffer.from(encrypted, "base64url")),
          c.final(),
        ]).toString(),
        prefix + "ml-refresh-1",
      );
    },
  );
  const extensionHeaders = () => ({
    authorization: "Bearer " + access.access_token,
  });
  const pageReading = {
    id: "MLBU5074600649",
    referenceKind: "USER_PRODUCT",
    title: "Fio cordone encerado preto 165m 2mm",
    price: 17.9,
    soldLower: 25,
    soldHasPlus: true,
    soldLabel: "+25 vendidos",
    reviews: 100,
    rating: 4.8,
    permalink: "https://www.mercadolivre.com.br/fio/up/MLBU5074600649",
  };
  let extensionBToken;
  await check(
    "automatic analysis reuses only exact own listing or workspace SKU costs",
    async () => {
      const path = "/api/extension/item?id=MLB999000001&kind=ITEM";
      await db.query(
        'UPDATE "MercadoLivreProduct" SET "discountPercent"=10 WHERE "mlItemId"=$1',
        ["MLB999000001"],
      );
      const own = await req(path, "", "GET", undefined, extensionHeaders());
      assert.equal(own.status, 200, own.text);
      assert.equal(own.json.item.isOwn, true);
      assert.equal(own.json.savedCost.supplierPrice, 40);
      assert.equal(own.json.savedCost.discountPercent, 10);
      assert.equal(own.json.savedCost.source, "LISTING");
      await db.query(
        'UPDATE "MercadoLivreProduct" SET "supplierPrice"=NULL, sku=$2 WHERE "mlItemId"=$1',
        ["MLB999000001", "SAME-SKU"],
      );
      await db.query(
        'UPDATE "Product" SET "supplierPrice"=999 WHERE "workspaceId"=$1',
        [userB.workspaceId],
      );
      const sku = await req(path, "", "GET", undefined, extensionHeaders());
      assert.equal(sku.json.savedCost.supplierPrice, 40);
      assert.equal(sku.json.savedCost.source, "SKU");
      const codeB = prefix + "cost-isolation-code";
      await insert("RadarExtensionAuthCode", {
        id: prefix + "authcodeB",
        codeHash: createHash("sha256").update(codeB).digest("base64url"),
        mercadoLivreAccountId: accounts[1],
        codeChallenge: challenge,
        redirectUri:
          "https://" + "a".repeat(32) + ".chromiumapp.org/radar-auth",
        deviceId: "cost-isolation-device-b",
        expiresAt: future,
      });
      const tokenB = await req("/api/extension/auth/token", "", "POST", {
        grant_type: "authorization_code",
        code: codeB,
        code_verifier: verifier,
        redirect_uri:
          "https://" + "a".repeat(32) + ".chromiumapp.org/radar-auth",
      });
      assert.equal(tokenB.status, 200, tokenB.text);
      extensionBToken = tokenB.json.access_token;
      const other = await req(path, "", "GET", undefined, {
        authorization: "Bearer " + tokenB.json.access_token,
      });
      assert.equal(other.status, 200, other.text);
      assert.equal(other.json.item.isOwn, false);
      assert.equal(other.json.savedCost, null);
      await db.query(
        'UPDATE "MercadoLivreProduct" SET "supplierPrice"=40, "discountPercent"=0, sku=NULL WHERE "mlItemId"=$1',
        ["MLB999000001"],
      );
      await db.query(
        'UPDATE "Product" SET "supplierPrice"=40 WHERE "workspaceId"=$1',
        [userB.workspaceId],
      );
    },
  );
  await check(
    "restricted User Product keeps a useful page-only response",
    async () => {
      const r = await req(
        "/api/extension/item?id=" + pageReading.id,
        "",
        "GET",
        undefined,
        extensionHeaders(),
      );
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.availability, "PAGE_ONLY");
      assert.equal(r.json.item, null);
    },
  );
  await check(
    "observations accept MLBU and do not fabricate competitor velocity",
    async () => {
      const r = await req(
        "/api/extension/observations",
        "",
        "POST",
        { page: "product", items: [pageReading] },
        extensionHeaders(),
      );
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.items[0].id, pageReading.id);
      assert.equal(r.json.items[0].score, null);
      assert.equal(r.json.items[0].demand, null);
      assert.equal(r.json.items[0].estimate.visitsPerDay.value, null);
    },
  );
  await check(
    "page monitoring saves without private API access and stays isolated",
    async () => {
      const r = await req(
        "/api/extension/watchlist",
        "",
        "POST",
        { itemId: pageReading.id, observation: pageReading },
        extensionHeaders(),
      );
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.trackingMode, "PAGE");
      const a = await req("/api/monitoring/watchlist", cookieA),
        b = await req("/api/monitoring/watchlist", cookieB);
      const item = a.json.items.find((i) => i.mlItemId === pageReading.id);
      assert.equal(item.soldQuantity, 25);
      assert.equal(item.soldIsLowerBound, true);
      assert.equal(item.score, null);
      assert.ok(!b.json.items.some((i) => i.mlItemId === pageReading.id));
      const bad = await req(
        "/api/extension/watchlist",
        "",
        "POST",
        { itemId: "MLBU12345678", observation: pageReading },
        extensionHeaders(),
      );
      assert.equal(bad.status, 400);
      await insert("RadarWatchItem", {
        id: prefix + "api-watch",
        sellerUserId: prefix + "100",
        mlItemId: "MLB999000001",
        title: "API existente",
        currentPrice: 100,
        score: 80,
        active: true,
        updatedAt: now,
      });
      const preserve = await req(
        "/api/extension/watchlist",
        "",
        "POST",
        {
          itemId: "MLB999000001",
          observation: {
            ...pageReading,
            id: "MLB999000001",
            referenceKind: "ITEM",
            price: 99,
          },
        },
        extensionHeaders(),
      );
      assert.equal(preserve.status, 200, preserve.text);
      assert.equal(preserve.json.trackingMode, "API");
      assert.equal(Number(preserve.json.watchItem.currentPrice), 100);
    },
  );
  await check(
    "revisiting a watched page updates price and marks missing counters unknown",
    async () => {
      const r = await req(
        "/api/extension/observations",
        "",
        "POST",
        {
          page: "product",
          items: [
            { ...pageReading, price: 19.9, soldLower: null, soldLabel: null },
          ],
        },
        extensionHeaders(),
      );
      assert.equal(r.status, 200, r.text);
      const list = await req(
        "/api/extension/watchlist",
        "",
        "GET",
        undefined,
        extensionHeaders(),
      );
      const item = list.json.items.find((i) => i.mlItemId === pageReading.id);
      assert.equal(item.currentPrice, 19.9);
      assert.equal(item.soldQuantity, null);
      assert.equal(item.trackingMode, "PAGE");
      assert.ok(item.snapshots.length >= 2);
    },
  );
  await check(
    "price range uses workspace observations when catalogue access is denied",
    async () => {
      const readings = [20, 30, 40].map((price, i) => ({
        ...pageReading,
        id: "MLBU800000000" + i,
        price,
      }));
      const obs = await req(
        "/api/extension/observations",
        "",
        "POST",
        { page: "search", query: "Fio cordone", items: readings },
        extensionHeaders(),
      );
      assert.equal(obs.status, 200, obs.text);
      const r = await req(
        "/api/extension/market?" +
          new URLSearchParams({
            title: pageReading.title,
            itemId: pageReading.id,
            currentPrice: "17.9",
          }),
        "",
        "GET",
        undefined,
        extensionHeaders(),
      );
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.apiStatus, 403);
      assert.equal(r.json.market.count, 3);
      assert.equal(r.json.market.median, 30);
      assert.ok(
        r.json.competitors.every(
          (i) => i.source === "OBSERVED_PAGE" && i.id !== "MLB999000001",
        ),
      );
      assert.equal(r.json.needsReview, true);
    },
  );
  const simulation = {
    itemId: pageReading.id,
    title: pageReading.title,
    salePrice: 17.9,
    supplierPrice: 10.9,
    listingType: "PREMIUM",
  };
  await check(
    "catalog analytics measures a dated sample and never calls it unique catalog visitors",
    async () => {
      const response = await req(
        "/api/extension/item?id=MLB999000001&kind=ITEM&catalogProductId=MLB88800001&analyticsOnly=1",
        "",
        "GET",
        undefined,
        extensionHeaders(),
      );
      assert.equal(response.status, 200, response.text);
      const analytics = response.json.analytics,
        c = analytics.catalog;
      assert.equal(analytics.itemVisits.perDay, 20);
      assert.equal(c.offersObserved, 5);
      assert.equal(c.totalReported, 52);
      assert.equal(c.fullOffersObserved, 2);
      assert.equal(c.visitsSample.offersMeasured, 5);
      assert.equal(c.visitsSample.perDay, 76);
      assert.ok(Math.abs(c.visitsSample.fullVisitSharePercent - 55) < 1e-8);
      assert.match(c.note, /não são visitantes únicos/);
      const unavailable = await req(
        "/api/extension/item?id=MLB777777777&kind=ITEM&catalogProductId=MLB7777777&analyticsOnly=1",
        "",
        "GET",
        undefined,
        extensionHeaders(),
      );
      assert.equal(unavailable.json.analytics.itemVisits, null);
      assert.equal(unavailable.json.analytics.catalog.offersObserved, null);
      assert.equal(unavailable.json.analytics.catalog.visitsSample, null);
    },
  );
  const shippingPackage = {
    weightGrams: 500,
    heightCm: 10,
    widthCm: 15,
    lengthCm: 20,
    freeShipping: true,
  };
  await check(
    "package shipping quotes use each client's account and remain estimates",
    async () => {
      const payload = {
        ...simulation,
        salePrice: 100,
        supplierPrice: 40,
        taxPercent: 6,
        listingType: "CLASSIC",
        shippingPackage,
        logisticType: "drop_off",
      };
      const response = await req(
        "/api/extension/profitability",
        "",
        "POST",
        payload,
        extensionHeaders(),
      );
      assert.equal(response.status, 200, response.text);
      assert.equal(response.json.fees.shippingCost, 6.85);
      assert.deepEqual(response.json.shippingDiscount, {
        rate: 0.5,
        baseAmount: 13.7,
      });
      assert.equal(
        response.json.shippingSource,
        "MERCADO_LIVRE_PACKAGE_ESTIMATE",
      );
      assert.equal(response.json.shippingKnown, false);
      assert.equal(response.json.shippingEstimated, true);
      assert.equal(response.json.result.profit, 31.15);
      const automatic = await req(
        "/api/extension/profitability",
        "",
        "POST",
        { ...payload, itemId: "MLB999000002", shippingPackage: undefined },
        extensionHeaders(),
      );
      assert.equal(automatic.status, 200, automatic.text);
      assert.equal(automatic.json.shippingEstimated, true);
      assert.equal(automatic.json.shippingPackageSource, "ITEM_API");
      assert.equal(automatic.json.fees.shippingCost, 6.85);
      const other = await req(
        "/api/extension/profitability",
        "",
        "POST",
        payload,
        { authorization: "Bearer " + extensionBToken },
      );
      assert.equal(other.status, 200, other.text);
      assert.equal(other.json.fees.shippingCost, 9.85);
      const missing = await req(
        "/api/extension/profitability",
        "",
        "POST",
        {
          ...payload,
          shippingPackage: { ...shippingPackage, weightGrams: 99999 },
        },
        extensionHeaders(),
      );
      assert.equal(missing.json.shippingSource, "UNAVAILABLE");
      assert.equal(missing.json.fees.shippingCost, null);
      assert.equal(missing.json.result, null);
      assert.ok(missing.json.needs.includes("shippingCost"));
      const invalid = await req(
        "/api/extension/profitability",
        "",
        "POST",
        {
          ...payload,
          shippingPackage: { ...shippingPackage, weightGrams: 0.5 },
        },
        extensionHeaders(),
      );
      assert.equal(invalid.status, 400);
    },
  );
  await check(
    "reviewed snapshots preserve supplier and Ads assumptions without becoming realized profit or crossing clients",
    async () => {
      const payload = {
        ...simulation,
        itemId: "MLB999000002",
        salePrice: 100,
        supplierPrice: 40,
        taxPercent: 6,
        listingType: "CLASSIC",
        shippingPackage,
        advertising: { roasTarget: 5, attributedSalesPercent: 20 },
      };
      const response = await req(
        "/api/extension/profitability",
        "",
        "POST",
        payload,
        extensionHeaders(),
      );
      assert.equal(response.json.adsSimulation.costPerSale, 4);
      assert.equal(response.json.adsSimulation.profitAfterAds, 27.15);
      const changed = await req(
        "/api/extension/profitability",
        "",
        "POST",
        { ...payload, save: true, saveMode: "SNAPSHOT", expectedProfit: 1 },
        extensionHeaders(),
      );
      assert.equal(changed.status, 409);
      const saved = await req(
        "/api/extension/profitability",
        "",
        "POST",
        {
          ...payload,
          save: true,
          saveMode: "SNAPSHOT",
          expectedProfit: 31.15,
          supplierName: "Fornecedor teste",
        },
        extensionHeaders(),
      );
      assert.equal(saved.status, 200, saved.text);
      assert.ok(saved.json.savedAnalysisId);
      const list = await req("/api/analyses", cookieA);
      const row = list.json.analyses.find(
        (item) => item.id === saved.json.savedAnalysisId,
      );
      assert.equal(row.source, "EXTENSION_SIMULATION");
      assert.equal(row.productId, null);
      assert.equal(row.supplier, "Fornecedor teste");
      assert.equal(row.profit, 31.15);
      assert.equal(
        row.metadata.shippingSource,
        "MERCADO_LIVRE_PACKAGE_ESTIMATE",
      );
      assert.equal(row.metadata.adsSimulation.profitAfterAds, 27.15);
      const other = await req("/api/analyses", cookieB);
      assert.ok(other.json.analyses.every((item) => item.id !== row.id));
      const removed = await req(
        "/api/analyses?id=" + row.id,
        cookieB,
        "DELETE",
      );
      assert.equal(removed.status, 404);
    },
  );
  await check(
    "missing tax and freight produce partial costs, not a false profit or error page",
    async () => {
      const r = await req(
        "/api/extension/profitability",
        "",
        "POST",
        { ...simulation, quoteOnly: true },
        extensionHeaders(),
      );
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.result, null);
      assert.ok(r.json.needs.includes("taxPercent"));
      assert.ok(r.json.needs.includes("shippingCost"));
      assert.equal(r.json.feeSource, "MERCADO_LIVRE_API");
    },
  );
  await check(
    "manual fees and explicit zero freight calculate correctly without competitor API",
    async () => {
      const r = await req(
        "/api/extension/profitability",
        "",
        "POST",
        {
          ...simulation,
          taxPercent: 0,
          shippingCost: 0,
          manualFees: { commissionPercent: 16.5, fixedFee: 0 },
        },
        extensionHeaders(),
      );
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.result.profit, 4.05);
      assert.equal(r.json.feeSource, "MANUAL");
      assert.equal(r.json.shippingKnown, false);
      const save = await req(
        "/api/extension/profitability",
        "",
        "POST",
        {
          ...simulation,
          taxPercent: 0,
          shippingCost: 0,
          manualFees: { commissionPercent: 16.5, fixedFee: 0 },
          save: true,
        },
        extensionHeaders(),
      );
      assert.equal(save.status, 422);
    },
  );
  await check(
    "simulated modality overrides the original listing modality",
    async () => {
      const r = await req(
        "/api/extension/profitability",
        "",
        "POST",
        {
          ...simulation,
          itemId: "MLB999000001",
          salePrice: 100,
          taxPercent: 0,
          shippingCost: 0,
          listingType: "PREMIUM",
        },
        extensionHeaders(),
      );
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.result.commissionPercent, 16.5);
      assert.equal(r.json.item.listingType, "PREMIUM");
    },
  );
  await check(
    "optional API restrictions do not mark core integration unhealthy",
    async () => {
      const r = await req(
        "/api/integrations/mercadolivre/diagnostics",
        cookieA,
      );
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.summary.healthy, true);
      assert.equal(
        r.json.checks.find((c) => c.key === "productAds").state,
        "RESTRICTED",
      );
      assert.ok(!r.json.checks.some((c) => c.key === "application"));
    },
  );
  let secondDeviceToken;
  await check(
    "workspace quota is shared across extension devices",
    async () => {
      const code2 = prefix + "second-authorization-code";
      await insert("RadarExtensionAuthCode", {
        id: prefix + "authcode2",
        codeHash: createHash("sha256").update(code2).digest("base64url"),
        mercadoLivreAccountId: accounts[0],
        codeChallenge: challenge,
        redirectUri:
          "https://" + "a".repeat(32) + ".chromiumapp.org/radar-auth",
        deviceId: "second-device-123456",
        expiresAt: future,
      });
      const token = await req("/api/extension/auth/token", "", "POST", {
        grant_type: "authorization_code",
        code: code2,
        code_verifier: verifier,
        redirect_uri:
          "https://" + "a".repeat(32) + ".chromiumapp.org/radar-auth",
      });
      assert.equal(token.status, 200, token.text);
      secondDeviceToken = token.json.access_token;
      await db.query(
        'UPDATE "RadarWorkspace" SET "dailyRequestLimit"=2 WHERE id=$1',
        [userA.workspaceId],
      );
      await db.query(
        'DELETE FROM "RadarWorkspaceUsage" WHERE "workspaceId"=$1',
        [userA.workspaceId],
      );
      for (const value of [access.access_token, token.json.access_token])
        assert.equal(
          (
            await req("/api/extension/auth/session", "", "GET", undefined, {
              authorization: "Bearer " + value,
            })
          ).status,
          200,
        );
      assert.equal(
        (
          await req("/api/extension/auth/session", "", "GET", undefined, {
            authorization: "Bearer " + access.access_token,
          })
        ).status,
        429,
      );
    },
  );
  await check("concurrent calls respect the shared daily cap", async () => {
    await db.query('DELETE FROM "RadarWorkspaceUsage" WHERE "workspaceId"=$1', [
      userA.workspaceId,
    ]);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        req("/api/extension/auth/session", "", "GET", undefined, {
          authorization:
            "Bearer " + (index % 2 ? secondDeviceToken : access.access_token),
        }),
      ),
    );
    assert.equal(
      results.filter((r) => r.status === 200).length,
      2,
      JSON.stringify(results.map((r) => r.text)),
    );
    assert.equal(results.filter((r) => r.status === 429).length, 6);
    const used = (
      await db.query(
        'SELECT requests FROM "RadarWorkspaceUsage" WHERE "workspaceId"=$1',
        [userA.workspaceId],
      )
    ).rows;
    assert.equal(used.length, 1);
    assert.equal(used[0].requests, 2);
  });
  await check(
    "suspension immediately revokes web and extension access",
    async () => {
      assert.equal(
        (
          await req("/api/workspace/clients", operator, "PATCH", {
            id: userA.id,
            active: false,
          })
        ).status,
        200,
      );
      assert.equal((await req("/api/workspace", cookieA)).status, 401);
      assert.equal(
        (
          await req("/api/extension/auth/session", "", "GET", undefined, {
            authorization: "Bearer " + access.access_token,
          })
        ).status,
        401,
      );
    },
  );
  await check("logout revokes a copied cookie", async () => {
    assert.equal((await req("/api/auth/logout", cookieB, "POST")).status, 200);
    assert.equal((await req("/api/workspace", cookieB)).status, 401);
  });
  if (process.env.RADAR_QA_SCREENSHOTS) {
    await req("/api/workspace/clients", operator, "PATCH", {
      id: userA.id,
      active: true,
    });
    const fresh = await login(emailA);
    await db.query(
      'UPDATE "RadarWorkspace" SET "dailyRequestLimit"=500 WHERE id=$1',
      [userA.workspaceId],
    );
    await db.query('DELETE FROM "RadarWorkspaceUsage" WHERE "workspaceId"=$1', [
      userA.workspaceId,
    ]);
    await import(
      process.env.RADAR_QA_BROWSER_MODULE ?? "./intelligence-app-browser.mjs"
    ).then(async ({ runBrowserChecks }) =>
      runBrowserChecks({ base, cookie: fresh, operatorCookie: operator }),
    );
  }
  await check(
    "order sync allocates a shared shipment once and preserves unknown shipping",
    async () => {
      const activated = await req("/api/workspace/clients", operator, "PATCH", {
        id: userA.id,
        active: true,
      });
      assert.equal(activated.status, 200, activated.text);
      const fresh = await login(emailA);
      const r = await req("/api/ml/sales?days=30&refresh=1", fresh);
      assert.equal(r.status, 200, r.text);
      const rows = (
        await db.query(
          'SELECT "mlOrderId",profit,"shippingCost","profitabilityStatus" FROM "MercadoLivreOrder" WHERE "mlOrderId"=ANY($1::text[])',
          [
            [
              prefix + "pack-a",
              prefix + "pack-b",
              prefix + "missing-shipping",
              prefix + "cancelled",
            ],
          ],
        )
      ).rows;
      assert.equal(rows.length, 4);
      const packed = rows.filter((o) => o.mlOrderId.includes("pack-"));
      assert.equal(
        packed.reduce((s, o) => s + Number(o.shippingCost), 0),
        20,
      );
      assert.equal(
        packed.reduce((s, o) => s + Number(o.profit), 0),
        150,
      );
      assert.equal(
        rows.find((o) => o.mlOrderId === prefix + "missing-shipping").profit,
        null,
      );
      assert.equal(
        rows.find((o) => o.mlOrderId === prefix + "cancelled").profit,
        null,
      );
    },
  );
  console.log(`HTTP_SMOKE_OK ${checks} checks`);
} catch (error) {
  console.error(logs.slice(-5000));
  throw error;
} finally {
  child.kill("SIGTERM");
  await db.end();
}
