import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { api, body } from "@/lib/http";
import { ApiError, checkOrigin, ipKey, limited, ownedConversation } from "@/lib/security";
import { needsSchema, needsPatchSchema, offerSchema, recommend, categoryNames } from "@/lib/domain";
import { extractNeeds } from "@/lib/model";
import { catalog } from "@/lib/catalog";
import { shoppingNeedsPatchSchema } from '@/lib/shopping/contracts';
import { prepareShopping } from '@/lib/shopping/planner';
import { createSearchContext } from '@/lib/shopping/runtime';
import { createProviders } from '@/lib/shopping/providers';
import { readProviderConfig } from '@/lib/shopping/provider-config';
import { runShopping } from '@/lib/shopping/orchestrator';
import { saveSearchOutcome } from '@/lib/shopping/repository';
const inputSchema = z.object({ message: z.string().trim().max(2000).default(""), needs: z.record(z.string(), z.unknown()).default({}), sourceMode: z.enum(["official", "manual"]).default("official") }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    checkOrigin(request);
    const { id } = await context.params;
    const { user, conversation } = await ownedConversation(id);
    await limited(`recommend:${user.id}`, 10);
    await limited(`recommend-ip:${ipKey(request)}`, 60);
    const input = await body(request, inputSchema);
    if (input.sourceMode === 'official') {
      const checked = shoppingNeedsPatchSchema.safeParse(input.needs);
      if (!checked.success) throw new ApiError(400, '输入格式有误，请检查金额与规格');
      const explicit = checked.data;
      const stored = typeof conversation.needs === 'object' && conversation.needs !== null ? conversation.needs : {};
      const legacyCompatible = Object.fromEntries(Object.entries(stored).filter(([key]) => key in shoppingNeedsPatchSchema.shape));
      const previous = shoppingNeedsPatchSchema.safeParse(legacyCompatible);
      const ctx = createSearchContext(user.id, request.signal);
      const prepared = await prepareShopping(input.message, previous.success ? previous.data : {}, ctx, explicit);
      if (!prepared.needs) {
        const clarification = '请补充商品品类和总预算，即可查询官方平台。';
        await db.conversation.update({where:{id}, data:{needs:prepared.draft as Prisma.InputJsonValue, asks:{increment:1}, messages:{create:[{role:'user',content:input.message || '开始搜索'},{role:'assistant',content:clarification}]}}});
        return {clarification,needs:prepared.draft,mode:'等待补充选购需求'};
      }
      const providers = createProviders(readProviderConfig(process.env), {fetch, accessApproved:process.env.TAOBAO_ACCESS_APPROVED === 'true',jdAccessApproved:process.env.JD_ACCESS_APPROVED === 'true'});
      const shopping = await runShopping({message:input.message,needs:prepared.needs,queries:prepared.queries},providers,ctx);
      const saved = await saveSearchOutcome(id,shopping,input.message || '根据表单搜索');
      return {...saved,shopping,mode:shopping.mode === 'model' ? 'AI 已比较候选，金额由程序核算' : '官方平台查询 · 规则比较（AI 未启用或降级）'};
    }
    const checkedManual = needsPatchSchema.safeParse(input.needs);
    if (!checkedManual.success) throw new ApiError(400, '输入格式有误，请检查金额与规格');
    const manualNeeds = checkedManual.data;
    const storedManual = typeof conversation.needs === 'object' && conversation.needs !== null ? Object.fromEntries(Object.entries(conversation.needs).filter(([key]) => key in needsPatchSchema.shape)) : {};
    const previous = needsPatchSchema.safeParse(storedManual);
    const current = previous.success ? previous.data : {};
    const model = input.message ? await extractNeeds(input.message, user.id, current) : { needs: {}, mode: "使用表单与规则比较" };
    const merged = { ...current, ...model.needs, ...manualNeeds };
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
