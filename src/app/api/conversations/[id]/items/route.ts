import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { api, body } from "@/lib/http";
import { ApiError, checkOrigin, limited, ownedConversation } from "@/lib/security";
import { offerSchema, userItemSchema } from "@/lib/domain";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    checkOrigin(request);
    const { id } = await context.params;
    const { user } = await ownedConversation(id);
    await limited(`items:${user.id}`, 20, 86400000);
    if (await db.userItem.count({ where: { conversationId: id } }) >= 10) throw new ApiError(400, "每次选购最多补充 10 个商品");
    const raw = await body(request, userItemSchema);
    const itemId = `user-${randomUUID()}`;
    const offer = offerSchema.parse({ ...raw, id: itemId, productId: itemId, provenance: "user", verifiedAt: new Date().toISOString() });
    await db.userItem.create({ data: { conversationId: id, payload: offer as unknown as Prisma.InputJsonValue } });
    return { offer };
  });
}
