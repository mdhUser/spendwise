import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";
if (existsSync(".env")) loadEnvFile(".env");
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/spendwise" },
});
