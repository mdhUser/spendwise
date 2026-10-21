import { db } from "@/lib/db";
import { api } from "@/lib/http";
import { checkOrigin, ownedConversation } from "@/lib/security";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return api(async () => {
    const { id } = await context.params;
    await ownedConversation(id);
    const conversation = await db.conversation.findUnique({ where: { id }, include: {
      messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 },
      snapshots: { orderBy: { createdAt: "desc" }, take: 1, include: { feedback: true } },
      items: { orderBy: { createdAt: "asc" } },
    } });
    return { conversation: conversation ? { ...conversation, messages: conversation.messages.reverse() } : null };
  });
}
export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    checkOrigin(request);
    const { id } = await context.params;
    await ownedConversation(id);
    await db.conversation.delete({ where: { id } });
    return { ok: true };
  });
}
