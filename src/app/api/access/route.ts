import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { api, body } from "@/lib/http";
import { ApiError, checkOrigin, COOKIE, hash, inviteHash, ipKey, limited, randomToken, thirtyDays } from "@/lib/security";
export async function POST(request: Request) {
  return api(async () => {
    checkOrigin(request);
    await limited(`access:${ipKey(request)}`, 10, 600000);
    const input = await body(request, z.object({ code: z.string().trim().min(1).max(100) }).strict());
    const codeHash = inviteHash(input.code);
    const token = randomToken();
    const expiresAt = thirtyDays();
    await db.$transaction(async tx => {
      const result = await tx.$executeRaw`
        UPDATE "Invite" SET "uses" = "uses" + 1
        WHERE "codeHash" = ${codeHash} AND "disabled" = false AND "expiresAt" > NOW() AND "uses" < "maxUses"`;
      if (!result) throw new ApiError(403, "邀请码无效、已过期或名额已满");
      await tx.visitor.create({ data: { tokenHash: hash(token), expiresAt } });
    });
    (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.COOKIE_SECURE !== "false", path: "/", expires: expiresAt });
    return { ok: true };
  });
}
