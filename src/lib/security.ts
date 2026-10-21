import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

export const COOKIE = "spendwise_session";
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("hex");
export const thirtyDays = () => new Date(Date.now() + 30 * 86400000);
export function inviteHash(code: string) {
  const pepper = process.env.INVITE_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("INVITE_PEPPER must contain at least 32 characters");
  return createHmac("sha256", pepper).update(code.trim()).digest("hex");
}
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function visitor() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) throw new ApiError(401, "请先输入邀请码");
  const found = await db.visitor.findUnique({ where: { tokenHash: hash(token) } });
  if (!found || found.expiresAt <= new Date()) throw new ApiError(401, "试用会话已过期，请重新输入邀请码");
  return found;
}
export async function ownedConversation(id: string) {
  const user = await visitor();
  const conversation = await db.conversation.findFirst({ where: { id, visitorId: user.id, expiresAt: { gt: new Date() } } });
  if (!conversation) throw new ApiError(404, "记录不存在或已过期");
  return { user, conversation };
}
export function checkOrigin(request: Request) {
  const allowed = process.env.APP_ORIGIN;
  if (!allowed) throw new ApiError(503, "服务尚未配置访问域名");
  if (request.headers.get("origin") !== new URL(allowed).origin) throw new ApiError(403, "请求来源不受信任");
}
export function ipKey(request: Request) {
  // Without a trusted proxy, all callers share one conservative bucket.
  const ip = process.env.TRUST_PROXY === "true" ? request.headers.get("x-real-ip") ?? "unknown" : "shared";
  return hash(ip).slice(0, 24);
}
export async function takeLimit(key: string, limit: number, durationMs: number) {
  const window = Math.floor(Date.now() / durationMs);
  const expiresAt = new Date((window + 1) * durationMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateBucket" ("key", "count", "expiresAt")
    VALUES (${`${key}:${window}`}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "count" = "RateBucket"."count" + 1
    WHERE "RateBucket"."count" < ${limit}
    RETURNING "count"`;
  return rows.length > 0;
}
export async function limited(key: string, limit: number, duration = 60000) {
  if (!await takeLimit(key, limit, duration)) throw new ApiError(429, "操作太频繁，请稍后再试");
}
