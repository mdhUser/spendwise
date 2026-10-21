import { db } from "./db";
import { offerSchema, type Offer } from "./domain";
export async function catalog(): Promise<Offer[]> {
  const rows = await db.offer.findMany({ where: process.env.ALLOW_DEMO_DATA === "true" ? {} : { isDemo: false } });
  return rows.flatMap(row => {
    const parsed = offerSchema.safeParse(row.payload);
    return parsed.success ? [parsed.data] : [];
  });
}
