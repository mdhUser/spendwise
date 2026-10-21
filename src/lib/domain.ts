import { z } from "zod";

export const categorySchema = z.enum(["tissue", "toilet", "detergent"]);
export type Category = z.infer<typeof categorySchema>;
export const categoryNames: Record<Category, string> = { tissue: "抽纸", toilet: "卷纸", detergent: "洗衣液" };
export const specsSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  unit: z.enum(["draw", "g", "ml"]),
  pack: z.string().trim().min(1).max(100),
  layers: z.number().int().min(1).max(8).nullable(),
  widthMm: z.number().int().positive().max(1000).nullable(),
  heightMm: z.number().int().positive().max(1000).nullable(),
  concentrated: z.boolean().nullable(),
  fragranceFree: z.boolean().nullable(),
}).strict();
export const safeUrl = z.string().url().max(2000).refine((url) => {
  const parsed = new URL(url);
  return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
}, "仅支持不含账号密码的 HTTP(S) 链接");
const offerFields = z.object({
  id: z.string().min(1).max(100),
  productId: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  category: categorySchema,
  specs: specsSchema,
  priceFen: z.number().int().positive().max(1_000_000),
  shippingFen: z.number().int().min(0).max(100_000).nullable(),
  discount: z.object({
    thresholdFen: z.number().int().min(0).max(1_000_000),
    reductionFen: z.number().int().min(0).max(1_000_000),
    eligibility: z.enum(["all", "member", "firstOrder"]),
  }).strict().nullable(),
  sourceUrl: safeUrl,
  sourceLabel: z.string().trim().min(1).max(100),
  verifiedAt: z.iso.datetime(),
  provenance: z.enum(["verified", "user", "demo"]),
}).strict();
const validateUnit = (o: { category: Category; specs: z.infer<typeof specsSchema> }, ctx: z.RefinementCtx) => {
  if ((o.category === "tissue" && o.specs.unit !== "draw") ||
      (o.category === "toilet" && o.specs.unit !== "g") ||
      (o.category === "detergent" && o.specs.unit === "draw")) {
    ctx.addIssue({ code: "custom", message: "商品品类与计量单位不匹配" });
  }
};
export const offerSchema = offerFields.superRefine(validateUnit);
export const userItemSchema = offerFields.omit({ id: true, productId: true, provenance: true, verifiedAt: true }).superRefine(validateUnit);
export type Offer = z.infer<typeof offerSchema>;
export const needsSchema = z.object({
  category: categorySchema,
  budgetFen: z.number().int().min(1).max(1_000_000),
  quantity: z.number().int().min(1).max(50).default(1),
  minLayers: z.number().int().min(1).max(8).nullable().default(null),
  fragranceFree: z.boolean().default(false),
  member: z.boolean().nullable().default(null),
  firstOrder: z.boolean().nullable().default(null),
  baselineId: z.string().max(100).nullable().default(null),
}).strict();
export const needsPatchSchema = needsSchema.extend({
  quantity: z.number().int().min(1).max(50),
  minLayers: z.number().int().min(1).max(8).nullable(),
  fragranceFree: z.boolean(), member: z.boolean().nullable(), firstOrder: z.boolean().nullable(),
  baselineId: z.string().max(100).nullable(),
}).partial();
export type Needs = z.infer<typeof needsSchema>;
export type Quote = {
  offer: Offer;
  quantity: number;
  subtotalFen: number;
  discountFen: number;
  totalFen: number | null;
  knownCostFen: number;
  unitPriceFen: number | null;
  unitLabel: string;
  comparableKey: string | null;
  stale: boolean;
  pending: string[];
  notices: string[];
  savingsFen: number | null;
};
export const money = (fen: number) => (fen / 100).toFixed(2);
export function comparableKey(offer: Offer): string | null {
  const s = offer.specs;
  if (offer.category === "detergent") {
    if (s.concentrated === null || s.fragranceFree === null) return null;
    return `${offer.category}:${s.unit}:${s.concentrated}:${s.fragranceFree}`;
  }
  if (!s.layers || !s.widthMm || !s.heightMm) return null;
  return `${offer.category}:${s.layers}:${s.widthMm}:${s.heightMm}`;
}
export function quote(offer: Offer, needs: Needs, now = new Date()): Quote {
  const subtotalFen = offer.priceFen * needs.quantity;
  const pending: string[] = [];
  const notices: string[] = [];
  let discountFen = 0;
  if (offer.shippingFen === null) pending.push("运费待确认");
  if (offer.discount && subtotalFen >= offer.discount.thresholdFen) {
    const eligible = offer.discount.eligibility === "all" ? true : needs[offer.discount.eligibility];
    if (eligible === null) pending.push(offer.discount.eligibility === "member" ? "会员优惠资格待确认" : "首购优惠资格待确认");
    if (eligible === true) discountFen = Math.min(subtotalFen, offer.discount.reductionFen);
  }
  const knownCostFen = subtotalFen - discountFen + (offer.shippingFen ?? 0);
  const totalFen = pending.length ? null : knownCostFen;
  const ageMs = now.getTime() - new Date(offer.verifiedAt).getTime();
  const stale = ageMs > 7 * 86400000 || ageMs < 0;
  if (stale) notices.push("报价待复核，不能据此确认当前低价或节省金额");
  if (offer.provenance === "demo") notices.push("演示数据，不代表真实商品或可购买价格");
  if (offer.provenance === "user") notices.push("用户提供，未经核验");
  const unitLabel = offer.specs.unit === "draw" ? "100 抽" : offer.category === "toilet" ? "100 克" : offer.specs.unit === "g" ? "千克" : "升";
  const scale = offer.category === "detergent" ? 1000 : 100;
  const unitPriceFen = totalFen === null ? null : Math.round(totalFen * scale / (offer.specs.amount * needs.quantity));
  const key = comparableKey(offer);
  if (key === null) notices.push("关键规格不完整，不能作同规格节省比较");
  if (offer.category === "detergent") notices.push("单位价不等于单次洗衣成本，请同时考虑浓缩程度与建议用量");
  return { offer, quantity: needs.quantity, subtotalFen, discountFen, totalFen, knownCostFen, unitPriceFen, unitLabel, comparableKey: key, stale, pending, notices, savingsFen: null };
}
export function recommend(offers: Offer[], needs: Needs, now = new Date()) {
  const candidates = offers.filter(o => o.category === needs.category &&
    (needs.category === "detergent" || !needs.minLayers || (o.specs.layers !== null && o.specs.layers >= needs.minLayers)) &&
    (!needs.fragranceFree || o.specs.fragranceFree === true));
  const all = candidates.map(o => quote(o, needs, now));
  const fits = all.filter(q => q.knownCostFen <= needs.budgetFen);
  // Fresh, sourced quotes with complete prices take priority. Unknown prices are never called within-budget.
  fits.sort((a, b) =>
    Number(a.totalFen === null) - Number(b.totalFen === null) ||
    Number(a.stale) - Number(b.stale) ||
    Number(a.offer.provenance !== "verified") - Number(b.offer.provenance !== "verified") ||
    (a.totalFen ?? a.knownCostFen) - (b.totalFen ?? b.knownCostFen) ||
    a.offer.id.localeCompare(b.offer.id));
  const baselineOffer = offers.find(o => o.id === needs.baselineId);
  const baseline = baselineOffer ? quote(baselineOffer, needs, now) : null;
  const selected = fits.slice(0, 3).map(q => {
    const safe = baseline && baseline.offer.id !== q.offer.id &&
      baseline.comparableKey !== null && baseline.comparableKey === q.comparableKey &&
      baseline.offer.specs.amount === q.offer.specs.amount &&
      baseline.totalFen !== null && q.totalFen !== null && !baseline.stale && !q.stale &&
      baseline.offer.provenance === "verified" && q.offer.provenance === "verified";
    return { ...q, savingsFen: safe ? Math.max(0, baseline!.totalFen! - q.totalFen!) : null };
  });
  return {
    needs, quotes: selected, baseline: baseline ? { name: baseline.offer.name, totalFen: baseline.totalFen } : null,
    candidateCount: all.length,
    explanation: selected.length
      ? "已按预算和明确偏好筛选，优先展示价格完整、近期核验的方案，再按购买总价排序。不同包装与品质请结合单位价和规格判断。"
      : "暂时没有满足条件的方案。可以调整预算或偏好，也可以补充你正在考虑的商品；不必为了优惠增加购买。",
    createdAt: now.toISOString(),
  };
}
export type Recommendation = ReturnType<typeof recommend>;
