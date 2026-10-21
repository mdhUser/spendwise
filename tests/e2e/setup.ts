import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { db } from "../../src/lib/db";
export default async function setup() {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Refusing to seed a non-test database");
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: process.env, stdio: "pipe" });
  execFileSync("node", ["--import", "tsx", "scripts/seed.ts"], { env: process.env, stdio: "pipe" });
  await db.visitor.deleteMany();
  await db.rateBucket.deleteMany();
  await db.invite.deleteMany();
  await db.invite.create({ data: { codeHash: createHmac("sha256", process.env.INVITE_PEPPER!).update("test-only-invite").digest("hex"), maxUses: 1000, expiresAt: new Date(Date.now() + 86400000) } });
  await db.$disconnect();
}
