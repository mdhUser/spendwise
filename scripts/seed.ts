import { Prisma } from "@prisma/client";
import { offerSchema, type Category, type Offer } from "../src/lib/domain";
import { db } from "../src/lib/db";
async function main() {
  if (process.env.ALLOW_DEMO_DATA !== "true") throw new Error("Demo seed requires ALLOW_DEMO_DATA=true");
  const names = { tissue: "柔韧抽纸", toilet: "原色卷纸", detergent: "日常洗衣液" };
  for (const category of ["tissue", "toilet", "detergent"] as Category[]) {
    for (let i = 0; i < 12; i++) {
      const id = `demo-${category}-${i + 1}`;
      const amount = category === "tissue" ? (i % 3 + 1) * 600 : (i % 3 + 1) * 1000;
      const offer: Offer = offerSchema.parse({
        id, productId: id, name: `示例 ${String.fromCharCode(65 + i)} · ${names[category]}`, category,
        specs: {
          amount, unit: category === "tissue" ? "draw" : category === "toilet" || i % 2 === 0 ? "g" : "ml",
          pack: category === "tissue" ? `100 抽 × ${amount / 100} 包` : category === "toilet" ? `100 克 × ${amount / 100} 卷` : `${amount} ${i % 2 ? "毫升" : "克"} / 瓶`,
          layers: category === "detergent" ? null : i % 4 === 0 ? 4 : 3,
          widthMm: category === "detergent" ? null : 180, heightMm: category === "detergent" ? null : 130,
          concentrated: category === "detergent" ? i % 3 === 0 : null,
          fragranceFree: i % 2 === 0,
        },
        priceFen: 1290 + i * 360, shippingFen: i === 11 ? null : i % 4 === 0 ? 600 : 0,
        discount: i % 3 === 0 ? { thresholdFen: 3000, reductionFen: 500, eligibility: i === 3 ? "member" : i === 6 ? "firstOrder" : "all" } : null,
        sourceUrl: "https://example.com/demo", sourceLabel: "仅供演示的虚构商品",
        verifiedAt: new Date().toISOString(), provenance: "demo",
      });
      await db.$transaction(async tx => {
        await tx.product.upsert({ where: { id }, create: { id, name: offer.name, category, specs: offer.specs }, update: { name: offer.name, specs: offer.specs } });
        await tx.offer.upsert({ where: { id }, create: { id, productId: id, payload: offer as unknown as Prisma.InputJsonValue, verifiedAt: new Date(offer.verifiedAt), isDemo: true }, update: { payload: offer as unknown as Prisma.InputJsonValue, verifiedAt: new Date(offer.verifiedAt), isDemo: true } });
      });
    }
  }
  console.log("Imported 36 fictional demo offers. These are NOT verified shopping data.");
}
main().finally(() => db.$disconnect());
