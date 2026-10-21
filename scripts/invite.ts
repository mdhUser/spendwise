import { createHmac, randomBytes } from "node:crypto";
import { db } from "../src/lib/db";
async function main() {
  const pepper = process.env.INVITE_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("Configure INVITE_PEPPER (32+ characters) first");
  const code = randomBytes(12).toString("base64url");
  const maxUses = Number(process.argv[2] ?? 20);
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 10000) throw new Error("Usage: npm run invite:create -- <1..10000>");
  await db.invite.create({ data: {
    codeHash: createHmac("sha256", pepper).update(code).digest("hex"),
    maxUses, expiresAt: new Date(Date.now() + 30 * 86400000),
  } });
  console.log(`Invite (shown once): ${code}\nUses: ${maxUses}; expires in 30 days.`);
}
main().finally(() => db.$disconnect());
