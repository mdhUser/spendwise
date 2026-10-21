import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "./security";
export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "请求不能为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 32768) { await reader.cancel(); throw new ApiError(413, "输入内容过长"); }
    chunks.push(part.value);
  }
  try { return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
  catch { throw new ApiError(400, "输入格式有误，请检查必填项、金额与规格"); }
}
export function api(handler: () => Promise<unknown>) {
  return handler().then(result => NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })).catch(error => {
    const known = error instanceof ApiError;
    // No request content, credentials, or raw provider errors in logs.
    if (!known) console.error("request_failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: known ? error.message : "服务暂时不可用，请稍后再试" }, { status: known ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  });
}
