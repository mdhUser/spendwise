import { describe, expect, it } from "vitest";
import { comparableKey, needsSchema, needsPatchSchema, userItemSchema, offerSchema, quote, recommend, type Offer, type Needs } from "../src/lib/domain";
const now = new Date("2026-10-21T00:00:00Z");
export const base: Offer = {
  id: "a", productId: "p-a", name: "Test tissue", category: "tissue",
  specs: { amount: 600, unit: "draw", pack: "100 抽 × 6 包", layers: 3, widthMm: 180, heightMm: 130, concentrated: null, fragranceFree: true },
  priceFen: 1200, shippingFen: 0, discount: null, sourceUrl: "https://example.com/a", sourceLabel: "fixture", verifiedAt: "2026-10-20T00:00:00Z", provenance: "verified",
};
const needs: Needs = { category: "tissue", budgetFen: 5000, quantity: 1, minLayers: null, fragranceFree: false, member: null, firstOrder: null, baselineId: null };
const offer = (patch: Partial<Offer> = {}): Offer => ({ ...base, ...patch });
describe("integer price calculations", () => {
  it.each([
    [1200, 1, 0, 1200], [1200, 2, 0, 2400], [1200, 3, 600, 4200], [1, 50, 1, 51], [999, 3, 599, 3596],
  ])("price %i × %i plus shipping %i = %i", (priceFen, quantity, shippingFen, want) => {
    expect(quote(offer({ priceFen, shippingFen }), { ...needs, quantity }, now).totalFen).toBe(want);
  });
  it.each([[2999, 2999], [3000, 2500], [3001, 2501], [6000, 5500]])("one threshold discount at %i", (priceFen, want) => {
    expect(quote(offer({ priceFen, discount: { thresholdFen: 3000, reductionFen: 500, eligibility: "all" } }), needs, now).totalFen).toBe(want);
  });
  it("never lets a discount reduce shipping or make goods negative", () => {
    expect(quote(offer({ shippingFen: 600, discount: { thresholdFen: 0, reductionFen: 9000, eligibility: "all" } }), needs, now).totalFen).toBe(600);
  });
  it.each(["member", "firstOrder"] as const)("requires explicit %s eligibility", eligibility => {
    const o = offer({ discount: { thresholdFen: 0, reductionFen: 300, eligibility } });
    expect(quote(o, needs, now).totalFen).toBeNull();
    expect(quote(o, { ...needs, [eligibility]: true }, now).totalFen).toBe(900);
    expect(quote(o, { ...needs, [eligibility]: false }, now).totalFen).toBe(1200);
  });
  it("unknown shipping has no final or unit price", () => {
    const q = quote(offer({ shippingFen: null }), needs, now);
    expect(q.totalFen).toBeNull(); expect(q.unitPriceFen).toBeNull(); expect(q.pending).toHaveLength(1);
  });
  it("uses entire pack amount for tissue unit price", () => expect(quote(base, needs, now).unitPriceFen).toBe(200));
  it("rounds fractional fen only at unit-price display", () => expect(quote(offer({ priceFen: 1000 }), needs, now).unitPriceFen).toBe(167));
  it("includes shipping in unit price", () => expect(quote(offer({ shippingFen: 600 }), needs, now).unitPriceFen).toBe(300));
  it("toilet paper uses 100g", () => {
    const o = offer({ category: "toilet", specs: { ...base.specs, unit: "g", amount: 1000 } });
    expect(quote(o, needs, now).unitPriceFen).toBe(120);
  });
  it.each(["g", "ml"] as const)("detergent uses 1000 %s without mass-volume conversion", unit => {
    const o = offer({ category: "detergent", specs: { ...base.specs, unit, amount: 2000 } });
    expect(quote(o, needs, now).unitPriceFen).toBe(600);
  });
});
describe("recommendation integrity", () => {
  it("does not apply previous paper-layer preferences to detergent", () => {
    const detergent = offer({ category: "detergent", specs: { ...base.specs, unit: "g", layers: null, concentrated: false } });
    expect(recommend([detergent], { ...needs, category: "detergent", minLayers: 4 }, now).quotes).toHaveLength(1);
  });
  it("never returns a confirmed over-budget purchase", () => expect(recommend([base], { ...needs, budgetFen: 1199 }, now).quotes).toHaveLength(0));
  it("returns at most three candidates", () => expect(recommend([0,1,2,3,4].map(i => offer({ id: String(i) })), needs, now).quotes).toHaveLength(3));
  it("filters category", () => expect(recommend([base], { ...needs, category: "toilet" }, now).quotes).toHaveLength(0));
  it("enforces minimum layers", () => expect(recommend([base], { ...needs, minLayers: 4 }, now).quotes).toHaveLength(0));
  it("unknown fragrance does not satisfy fragrance-free", () => expect(recommend([offer({ specs: { ...base.specs, fragranceFree: null } })], { ...needs, fragranceFree: true }, now).quotes).toHaveLength(0));
  it("ranks complete prices ahead of incomplete cheaper quotes", () => {
    expect(recommend([offer({ id: "unknown", priceFen: 100, shippingFen: null }), base], needs, now).quotes[0].offer.id).toBe("a");
  });
  it("ranks fresh verified data ahead of cheaper expired data", () => {
    expect(recommend([offer({ id: "old", priceFen: 100, verifiedAt: "2026-10-01T00:00:00Z" }), base], needs, now).quotes[0].offer.id).toBe("a");
  });
  it("rejects future timestamps as current prices", () => expect(quote(offer({ verifiedAt: "2026-10-22T00:00:00Z" }), needs, now).stale).toBe(true));
  it("seven-day freshness boundary is inclusive", () => expect(quote(offer({ verifiedAt: "2026-10-14T00:00:00Z" }), needs, now).stale).toBe(false));
  it("does not calculate savings without a baseline", () => expect(recommend([base], needs, now).quotes[0].savingsFen).toBeNull());
  it("calculates savings against an explicit comparable baseline", () => {
    const result = recommend([base, offer({ id: "baseline", priceFen: 2000 })], { ...needs, baselineId: "baseline" }, now);
    expect(result.quotes[0].savingsFen).toBe(800);
  });
  it.each(["demo", "user"] as const)("does not claim verified savings for %s data", provenance => {
    expect(recommend([offer({ provenance }), offer({ id: "b", priceFen: 2000 })], { ...needs, baselineId: "b" }, now).quotes.find(q => q.offer.id === "a")?.savingsFen).toBeNull();
  });
  it("does not equate different amounts for savings", () => {
    expect(recommend([base, offer({ id: "b", priceFen: 2000, specs: { ...base.specs, amount: 1200 } })], { ...needs, baselineId: "b" }, now).quotes[0].savingsFen).toBeNull();
  });
  it("does not equate unknown specs", () => expect(comparableKey(offer({ specs: { ...base.specs, widthMm: null } }))).toBeNull());
  it("does not equate detergent mass and volume", () => {
    const o = offer({ category: "detergent", specs: { ...base.specs, concentrated: false, unit: "g" } });
    expect(comparableKey(o)).not.toBe(comparableKey({ ...o, specs: { ...o.specs, unit: "ml" } }));
  });
});
describe("input boundaries", () => {
  it.each([0, -1, 1.5, Infinity])("rejects invalid money %s", priceFen => expect(offerSchema.safeParse(offer({ priceFen })).success).toBe(false));
  it("rejects mismatched category/unit", () => expect(offerSchema.safeParse(offer({ category: "toilet" })).success).toBe(false));
  it("rejects javascript links", () => expect(offerSchema.safeParse(offer({ sourceUrl: "javascript:alert(1)" })).success).toBe(false));
  it("rejects credential-bearing links", () => expect(offerSchema.safeParse(offer({ sourceUrl: "https://user:pass@example.com" })).success).toBe(false));
  it("rejects zero quantity", () => expect(needsSchema.safeParse({ ...needs, quantity: 0 }).success).toBe(false));
  it("accepts manual item input schema without throwing on refinement omission", () => {
    const { id, productId, provenance, verifiedAt, ...input } = base;
    void id; void productId; void provenance; void verifiedAt;
    expect(() => userItemSchema.parse(input)).not.toThrow();
  });
  it("partial requirements do not reset previous preferences via defaults", () => {
    expect(needsPatchSchema.parse({ category: "tissue" })).toEqual({ category: "tissue" });
  });
});
