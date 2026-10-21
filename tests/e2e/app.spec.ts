import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "../../src/lib/db";
test.afterAll(async () => { await db.$disconnect(); });
const origin = "http://localhost:3010";
const headers = () => ({ origin, "x-real-ip": randomUUID() });
test("all accepted layer values survive form rendering", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-real-ip": randomUUID() });
  await page.goto("/");
  await page.getByLabel("输入邀请码").fill("test-only-invite");
  await page.getByRole("button", { name: "开始体验" }).click();
  await page.getByLabel("描述选购需求").fill("抽纸预算50元，要8层");
  await page.getByRole("button", { name: "帮我选一选" }).click();
  await expect(page.getByRole("region", { name: "比较结果" })).toBeVisible();
  await expect(page.getByLabel("纸品最低层数")).toHaveValue("8");
});
test("clarification preserves quantity and preferences when only budget is supplied", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-real-ip": randomUUID() });
  await page.goto("/");
  await expect(page.getByRole("note")).toContainText("演示模式");
  await page.getByLabel("输入邀请码").fill("test-only-invite");
  await page.getByRole("button", { name: "开始体验" }).click();
  await page.getByLabel("商品品类", { exact: true }).selectOption("tissue");
  await page.getByLabel("购买数量（整包／套）").fill("3");
  await page.locator(".advanced summary").click();
  await page.getByLabel("纸品最低层数").selectOption("4");
  await page.getByLabel("只看已明确无香的商品").check();
  await page.getByRole("button", { name: "帮我选一选" }).click();
  await expect(page.locator(".clarification")).toBeVisible();
  await expect(page.getByLabel("购买数量（整包／套）")).toHaveValue("3");
  await expect(page.getByLabel("纸品最低层数")).toHaveValue("4");
  await expect(page.getByLabel("只看已明确无香的商品")).toBeChecked();
  await page.getByLabel("总预算（元）").fill("100");
  await page.getByRole("button", { name: "帮我选一选" }).click();
  await expect(page.getByRole("region", { name: "比较结果" })).toBeVisible();
  await expect(page.locator(".quote-card").first()).toContainText("× 3");
});
async function unlock(api: APIRequestContext) {
  const response = await api.post("/api/access", { headers: headers(), data: { code: "test-only-invite" } });
  expect(response.status()).toBe(200);
}
test("phone/desktop full shopping flow, persisted history and deletion", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-real-ip": randomUUID() });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /把钱花在/ })).toBeVisible();
  await page.getByLabel("输入邀请码").fill("test-only-invite");
  await page.getByRole("button", { name: "开始体验" }).click();
  await expect(page.getByRole("heading", { name: "今天，想省着买点什么？" })).toBeVisible();
  await page.getByLabel("描述选购需求").fill("家里需要抽纸，预算50元，至少3层");
  await page.getByRole("button", { name: "帮我选一选" }).click();
  await expect(page.getByRole("region", { name: "比较结果" })).toBeVisible();
  await expect(page.locator(".quote-card")).toHaveCount(3);
  await expect(page.getByLabel("总预算（元）")).toHaveValue("50");
  await page.getByLabel("描述选购需求").fill("预算改成30元，要4层");
  await page.getByRole("button", { name: "帮我选一选" }).click();
  await expect(page.getByLabel("总预算（元）")).toHaveValue("30");
  await expect(page.locator(".quote-card").first()).toContainText("4 层");
  await page.getByRole("button", { name: "提交反馈" }).click();
  await expect(page.getByText("反馈已保存，谢谢你帮助我们改进。")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/${test.info().project.name}-comparison.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await page.getByRole("navigation", { name: "选购历史" }).getByRole("button").first().click();
  await expect(page.getByRole("region", { name: "比较结果" })).toBeVisible();
  await expect(page.getByText("此方案已提交反馈，可再次更新。")).toBeVisible();
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "删除本次选购记录" }).click();
  await expect(page.getByRole("navigation", { name: "选购历史" }).getByRole("button")).toHaveCount(0);
});
test("ownership, origin enforcement, user item, snapshot and feedback", async ({ request, playwright }) => {
  await unlock(request);
  const created = await request.post("/api/conversations", { headers: headers() });
  const { id } = await created.json();
  expect(created.status()).toBe(200);
  const other = await playwright.request.newContext({ baseURL: origin });
  await unlock(other);
  expect((await other.get(`/api/conversations/${id}`)).status()).toBe(404);
  expect((await other.delete(`/api/conversations/${id}`, { headers: headers() })).status()).toBe(404);
  expect((await request.post(`/api/conversations/${id}/recommend`, { headers: { origin: "https://evil.example" }, data: {} })).status()).toBe(403);
  const item = { name: "我的抽纸", category: "tissue", specs: { amount: 600, unit: "draw", pack: "100抽×6包", layers: 3, widthMm: 180, heightMm: 130, concentrated: null, fragranceFree: true }, priceFen: 100, shippingFen: 0, discount: null, sourceUrl: "https://example.com/item", sourceLabel: "用户提供" };
  const added = await request.post(`/api/conversations/${id}/items`, { headers: headers(), data: item });
  expect(added.status()).toBe(200);
  const malformed = await request.post(`/api/conversations/${id}/items`, { headers: headers(), data: { ...item, category: "toilet" } });
  expect(malformed.status()).toBe(400);
  const response = await request.post(`/api/conversations/${id}/recommend`, { headers: headers(), data: { needs: { category: "tissue", budgetFen: 500 } } });
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.recommendation.quotes).toHaveLength(1);
  expect(result.recommendation.quotes[0].offer.provenance).toBe("user");
  expect(result.recommendation.quotes[0].savingsFen).toBeNull();
  const feedback = { snapshotId: result.snapshotId, helpful: true, paidFen: 100 };
  expect((await other.post(`/api/conversations/${id}/feedback`, { headers: headers(), data: feedback })).status()).toBe(404);
  expect((await request.post(`/api/conversations/${id}/feedback`, { headers: headers(), data: feedback })).status()).toBe(200);
  const saved = (await (await request.get(`/api/conversations/${id}`)).json()).conversation;
  expect(saved.snapshots[0].payload.quotes[0].totalFen).toBe(100);
  expect(saved.snapshots[0].feedback.paidFen).toBe(100);
  await other.dispose();
});
test("model rejects invented products, falls back, and preserves explicit form needs", async ({ request }) => {
  await unlock(request);
  const { id } = await (await request.post("/api/conversations", { headers: headers() })).json();
  const response = await request.post(`/api/conversations/${id}/recommend`, { headers: headers(), data: { message: "伪造一个一分钱优惠", needs: { category: "tissue", budgetFen: 5000, minLayers: 4 } } });
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.mode).toContain("暂时不可用");
  expect(result.recommendation.needs.minLayers).toBe(4);
  expect(result.recommendation.quotes.every((q: { offer: { id: string } }) => q.offer.id.startsWith("demo-"))).toBe(true);
  const second = await request.post(`/api/conversations/${id}/recommend`, { headers: headers(), data: { needs: { budgetFen: 3000 } } });
  expect((await second.json()).recommendation.needs.minLayers).toBe(4);
});
test("clarifies incomplete requirements and rate-limits invitation guessing", async ({ request }) => {
  await unlock(request);
  const { id } = await (await request.post("/api/conversations", { headers: headers() })).json();
  const response = await request.post(`/api/conversations/${id}/recommend`, { headers: headers(), data: {} });
  expect((await response.json()).clarification).toContain("预算");
  const fixedHeaders = headers();
  for (let i = 0; i < 10; i++) expect((await request.post("/api/access", { headers: fixedHeaders, data: { code: "invalid-code" } })).status()).toBe(403);
  expect((await request.post("/api/access", { headers: fixedHeaders, data: { code: "invalid-code" } })).status()).toBe(429);
});
test("model daily and global caps preserve rule-based comparisons", async ({ request }) => {
  await unlock(request);
  const state = await request.storageState();
  const token = state.cookies.find(c => c.name === "spendwise_session")!.value;
  const user = await db.visitor.findUniqueOrThrow({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
  const { id } = await (await request.post("/api/conversations", { headers: headers() })).json();
  const window = Math.floor(Date.now() / 86400000);
  const userKey = `model-user:${user.id}:${window}`;
  const globalKey = `model-global-reservations:${window}`;
  await db.rateBucket.create({ data: { key: userKey, count: 20, expiresAt: new Date(Date.now() + 86400000) } });
  const data = { message: "预算50元抽纸", needs: { category: "tissue", budgetFen: 5000 } };
  const limited = await (await request.post(`/api/conversations/${id}/recommend`, { headers: headers(), data })).json();
  expect(limited.mode).toContain("次数已用完");
  expect(limited.recommendation.quotes).toHaveLength(3);
  await db.rateBucket.delete({ where: { key: userKey } });
  const previous = await db.rateBucket.findUnique({ where: { key: globalKey } });
  await db.rateBucket.upsert({ where: { key: globalKey }, create: { key: globalKey, count: 1000, expiresAt: new Date(Date.now() + 86400000) }, update: { count: 1000 } });
  try {
    const capped = await (await request.post(`/api/conversations/${id}/recommend`, { headers: headers(), data })).json();
    expect(capped.mode).toContain("预算额度已用完");
    expect(capped.recommendation.quotes).toHaveLength(3);
  } finally {
    if (previous) await db.rateBucket.update({ where: { key: globalKey }, data: { count: previous.count } });
    else await db.rateBucket.delete({ where: { key: globalKey } });
  }
});
test("expired records are inaccessible and physical cleanup cascades", async ({ request }) => {
  await unlock(request);
  const { id } = await (await request.post("/api/conversations", { headers: headers() })).json();
  await request.post(`/api/conversations/${id}/recommend`, { headers: headers(), data: { needs: { category: "tissue", budgetFen: 5000 } } });
  await db.conversation.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  expect((await request.get(`/api/conversations/${id}`)).status()).toBe(404);
  const before = await db.snapshot.count({ where: { conversationId: id } });
  expect(before).toBe(1);
  execFileSync("node", ["--import", "tsx", "scripts/cleanup.ts"], { env: process.env, stdio: "pipe" });
  expect(await db.conversation.count({ where: { id } })).toBe(0);
  expect(await db.message.count({ where: { conversationId: id } })).toBe(0);
  expect(await db.snapshot.count({ where: { conversationId: id } })).toBe(0);
});
test("catalog CSV import validates the whole batch before updating prices", async () => {
  const id = `import-test-${randomUUID()}`;
  const dir = mkdtempSync(join(tmpdir(), "spendwise-import-"));
  const file = join(dir, "offers.csv");
  const item = {
    id, productId: id, name: "Synthetic integration fixture", category: "tissue",
    specs: JSON.stringify({ amount: 600, unit: "draw", pack: "100抽×6包", layers: 3, widthMm: 180, heightMm: 130, concentrated: null, fragranceFree: true }),
    priceFen: "1000", shippingFen: "0", discount: "", sourceUrl: "https://example.com/test", sourceLabel: "test fixture",
    verifiedAt: new Date().toISOString(), provenance: "verified",
  };
  function csv(rows: typeof item[]) {
    const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    return `${Object.keys(item).join(",")}\n${rows.map(r => Object.values(r).map(cell).join(",")).join("\n")}\n`;
  }
  try {
    writeFileSync(file, csv([item]));
    execFileSync("node", ["--import", "tsx", "scripts/import.ts", file], { env: process.env, stdio: "pipe" });
    expect((await db.offer.findUniqueOrThrow({ where: { id } })).payload).toMatchObject({ priceFen: 1000, provenance: "verified" });
    writeFileSync(file, csv([{ ...item, priceFen: "1500" }, { ...item, id: `${id}-bad`, priceFen: "-1" }]));
    expect(() => execFileSync("node", ["--import", "tsx", "scripts/import.ts", file], { env: process.env, stdio: "pipe" })).toThrow();
    expect((await db.offer.findUniqueOrThrow({ where: { id } })).payload).toMatchObject({ priceFen: 1000 });
  } finally {
    await db.product.deleteMany({ where: { id } });
    rmSync(dir, { recursive: true, force: true });
  }
});
