import { db } from "../src/lib/db";
async function main() {
  const now = new Date();
  const result = await db.$transaction([
    db.conversation.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.visitor.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.rateBucket.deleteMany({ where: { expiresAt: { lte: now } } }),
  ]);
  console.log("Expired rows removed:", result.map(r => r.count).join(", "));
}
main().finally(() => db.$disconnect());
