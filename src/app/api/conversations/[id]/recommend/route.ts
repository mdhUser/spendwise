import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { api, body } from "@/lib/http";
import { checkOrigin, ipKey, limited, ownedConversation } from "@/lib/security";
import { needsSchema, needsPatchSchema, offerSchema, recommend, categoryNames } from "@/lib/domain";
import { extractNeeds } from "@/lib/model";
import { catalog } from "@/lib/catalog";
const inputSchema = z.object({ message: z.string().trim().max(2000).default(""), needs: needsPatchSchema.default({}) }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    checkOrigin(request);
    const { id } = await context.params;
    const { user, conversation } = await ownedConversation(id);
    await limited(`recommend:${user.id}`, 10);
    await limited(`recommend-ip:${ipKey(request)}`, 60);
    const input = await body(request, inputSchema);
    const previous = needsPatchSchema.safeParse(conversation.needs);
    const current = previous.success ? previous.data : {};
    const model = input.message ? await extractNeeds(input.message, user.id, current) : { needs: {}, mode: "使用表单与规则比较" };
    const merged = { ...current, ...model.needs, ...input.needs };
    const parsed = needsSchema.safeParse(merged);
    if (!parsed.success) {
      const reply = conversation.asks >= 1
        ? "请在表单中选择品类并填写总预算，即可开始比较。"
        : "想买抽纸、卷纸还是洗衣液？这次的总预算是多少？也可以直接填写下方表单。";
      await db.conversation.update({ where: { id }, data: {
        needs: merged as Prisma.InputJsonValue, asks: { increment: 1 },
        messages: { create: [{ role: "user", content: input.message || "开始比较" }, { role: "assistant", content: reply }] },
      } });
      return { clarification: reply, mode: model.mode, needs: merged };
    }
    const privateItems = await db.userItem.findMany({ where: { conversationId: id } });
    const offers = [...await catalog(), ...privateItems.map(i => offerSchema.parse(i.payload))];
    const recommendation = recommend(offers, parsed.data);
    const snapshot = await db.$transaction(async tx => {
      await tx.conversation.update({ where: { id }, data: {
        title: `${categoryNames[parsed.data.category]} · 预算 ¥${(parsed.data.budgetFen / 100).toFixed(2)}`,
        needs: parsed.data as Prisma.InputJsonValue,
        messages: { create: [{ role: "user", content: input.message || "根据表单比较方案" }, { role: "assistant", content: recommendation.explanation }] },
      } });
      return tx.snapshot.create({ data: { conversationId: id, payload: recommendation as unknown as Prisma.InputJsonValue } });
    });
    return { snapshotId: snapshot.id, recommendation, mode: model.mode };
  });
}
