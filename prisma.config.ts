import "dotenv/config";
import { defineConfig } from "prisma/config";

const buildSafeDatabaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://build:build@127.0.0.1:5432/build?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: buildSafeDatabaseUrl },
});
