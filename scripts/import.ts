import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { Prisma } from "@prisma/client";
import { offerSchema } from "../src/lib/domain";
import { db } from "../src/lib/db";
async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run data:import -- path/to/offers.csv");
  const rows = parse(readFileSync(file, "utf8"), { columns: true, skip_empty_lines: true, bom: true }) as Record<string, string>[];
  const seen = new Set<string>();
  const offers = rows.map((row, index) => {
    try {
      const offer = offerSchema.parse({
        ...row, specs: JSON.parse(row.specs), discount: row.discount ? JSON.parse(row.discount) : null,
        priceFen: Number(row.priceFen), shippingFen: row.shippingFen === "" ? null : Number(row.shippingFen),
      });
      if (offer.provenance !== "verified") throw new Error("Only verified records may be imported here");
      if (new Date(offer.verifiedAt).getTime() > Date.now()) throw new Error("Verification date cannot be in the future");
      if (seen.has(offer.id)) throw new Error("Duplicate offer id");
      seen.add(offer.id);
      return offer;
    } catch (e) {
      throw new Error(`Invalid CSV row ${index + 2}: ${e instanceof Error ? e.message : "invalid data"}`);
    }
  });
  await db.$transaction(async tx => {
    for (const offer of offers) {
      await tx.product.upsert({ where: { id: offer.productId },
        create: { id: offer.productId, name: offer.name, category: offer.category, specs: offer.specs },
        update: { name: offer.name, category: offer.category, specs: offer.specs } });
      await tx.offer.upsert({ where: { id: offer.id },
        create: { id: offer.id, productId: offer.productId, payload: offer as unknown as Prisma.InputJsonValue, verifiedAt: new Date(offer.verifiedAt), isDemo: false },
        update: { productId: offer.productId, payload: offer as unknown as Prisma.InputJsonValue, verifiedAt: new Date(offer.verifiedAt), isDemo: false } });
    }
  }, { timeout: 30000 });
  console.log(`Imported ${offers.length} operator-verified offers. No verification was performed by the importer.`);
}
main().finally(() => db.$disconnect());
