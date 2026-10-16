import assert from "node:assert/strict";
import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createHash,
} from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";

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
      await db.query(
        'UPDATE "RadarWorkspace" SET "dailyRequestLimit"=2 WHERE id=$1',
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
    await import(process.env.RADAR_QA_BROWSER_MODULE).then(
      async ({ runBrowserChecks }) =>
        runBrowserChecks({ base, cookie: fresh, operatorCookie: operator }),
    );
  }
  await check(
    "order sync allocates a shared shipment once and preserves unknown shipping",
    async () => {
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
