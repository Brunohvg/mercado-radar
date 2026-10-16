import { readdir, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
if (process.env.RADAR_TEST_DATABASE !== "1")
  throw new Error("Use an isolated database with RADAR_TEST_DATABASE=1.");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const schema = "radar_upgrade_" + randomBytes(6).toString("hex");
try {
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}"`);
  const root = new URL("../prisma/migrations/", import.meta.url);
  const names = (await readdir(root))
    .filter((n) => !n.endsWith(".toml"))
    .sort();
  const target = names.indexOf("202610152100_commercial_workspaces");
  assert.ok(target > 0);
  for (const name of names.slice(0, target))
    await client.query(
      await readFile(new URL(name + "/migration.sql", root), "utf8"),
    );
  await client.query(`INSERT INTO "AppSettings" (id,"updatedAt") VALUES ('default',NOW());
 INSERT INTO "Product" (id,name,sku,"supplierPrice","updatedAt") VALUES ('old-product','Produto existente','LEGACY',10,NOW());
 INSERT INTO "MarketItem" (id,title,"updatedAt") VALUES ('MLB999000001','Observação existente',NOW());
 INSERT INTO "MarketItemSnapshot" (id,"itemId",source) VALUES ('old-snapshot','MLB999000001','SEARCH_CARD');
 INSERT INTO "MercadoLivreOrder" (id,"mlOrderId","sellerUserId",status,"dateCreated",profit,raw,"updatedAt") VALUES ('old-order','old-order','old-seller','paid',NOW(),99,'{}',NOW());`);
  await client.query(
    await readFile(new URL(names[target] + "/migration.sql", root), "utf8"),
  );
  assert.equal(
    (
      await client.query(
        'SELECT "workspaceId" FROM "Product" WHERE id=\'old-product\'',
      )
    ).rows[0].workspaceId,
    "default",
  );
  assert.equal(
    (
      await client.query(
        'SELECT "workspaceId" FROM "MarketItemSnapshot" WHERE id=\'old-snapshot\'',
      )
    ).rows[0].workspaceId,
    "default",
  );
  assert.equal(
    (
      await client.query(
        "SELECT profit FROM \"MercadoLivreOrder\" WHERE id='old-order'",
      )
    ).rows[0].profit,
    null,
  );
  assert.equal(
    (
      await client.query(
        'SELECT "taxPercent" FROM "AppSettings" WHERE id=\'default\'',
      )
    ).rows[0].taxPercent,
    null,
  );
  // A new workspace may reuse the same SKU and observe the same external item.
  await client.query(`INSERT INTO "RadarWorkspace" (id,name) VALUES ('new-workspace','Outra operação');
 INSERT INTO "Product" (id,"workspaceId",name,sku,"supplierPrice","updatedAt") VALUES ('new-product','new-workspace','Outro produto','LEGACY',10,NOW());
 INSERT INTO "MarketItem" (id,"workspaceId",title,"updatedAt") VALUES ('MLB999000001','new-workspace','Outra observação',NOW());`);
  console.log(
    "MIGRATION_UPGRADE_OK legacy rows, snapshots, distinct workspaces and financial invalidation",
  );
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.query("SET search_path TO public");
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await client.end();
}
