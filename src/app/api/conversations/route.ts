import { db } from "@/lib/db";
import { api } from "@/lib/http";
import { checkOrigin, limited, thirtyDays, visitor } from "@/lib/security";
export async function GET() {
  return api(async () => {
    const user = await visitor();
    return { conversations: await db.conversation.findMany({
      where: { visitorId: user.id, expiresAt: { gt: new Date() } },
      select: { id: true, title: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 50,
    }) };
  });
}
export async function POST(request: Request) {
  return api(async () => {
    checkOrigin(request);
    const user = await visitor();
    await limited(`new:${user.id}`, 30, 86400000);
    const conversation = await db.conversation.create({ data: { visitorId: user.id, title: "新的选购", expiresAt: thirtyDays() } });
    return { id: conversation.id };
  });
}
export async function DELETE(request: Request) {
  return api(async () => {
    checkOrigin(request);
    const user = await visitor();
    await db.conversation.deleteMany({ where: { visitorId: user.id } });
    return { ok: true };
  });
}
