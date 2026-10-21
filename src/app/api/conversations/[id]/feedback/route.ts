import { z } from "zod";
import { db } from "@/lib/db";
import { api, body } from "@/lib/http";
import { ApiError, checkOrigin, limited, ownedConversation } from "@/lib/security";
import type { Recommendation } from "@/lib/domain";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    checkOrigin(request);
    const { id } = await context.params;
    const { user } = await ownedConversation(id);
    await limited(`feedback:${user.id}`, 20);
    const input = await body(request, z.object({
      snapshotId: z.string(), helpful: z.boolean(), reason: z.string().max(500).optional(),
      chosenId: z.string().max(100).optional(), paidFen: z.number().int().min(0).max(1_000_000).optional(),
    }).strict());
    const snapshot = await db.snapshot.findFirst({ where: { id: input.snapshotId, conversationId: id } });
    if (!snapshot) throw new ApiError(404, "比较记录不存在");
    if (input.chosenId && !(snapshot.payload as unknown as Recommendation).quotes.some(q => q.offer.id === input.chosenId)) throw new ApiError(400, "请选择本次比较中的商品");
    await db.feedback.upsert({ where: { snapshotId: input.snapshotId }, create: input, update: input });
    return { ok: true };
  });
}
