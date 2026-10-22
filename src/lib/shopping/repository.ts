import {Prisma} from '@prisma/client';
import {db} from '../db';
import {ApiError} from '../security';
import {categoryNames} from '../domain';
import type {SearchOutcome} from './contracts';
const json=(value:unknown)=>value as Prisma.InputJsonValue;
export async function saveSearchOutcome(conversationId:string,outcome:SearchOutcome,message='根据表单搜索'){
 return db.$transaction(async tx=>{
  const current=await tx.conversation.findFirst({where:{id:conversationId,expiresAt:{gt:new Date()}}});if(!current)throw new ApiError(404,'记录不存在或已过期');
  const run=await tx.searchRun.create({data:{conversationId,startedAt:new Date(outcome.startedAt),finishedAt:new Date(outcome.finishedAt),platformStatus:json(outcome.platformResults.map(r=>({platform:r.platform,status:r.status,code:r.sanitizedErrorCode}))),evidence:{create:outcome.platformResults.flatMap(r=>r.evidence).map(e=>({payload:json(e)}))}}});
  await tx.conversation.update({where:{id:conversationId},data:{needs:json(outcome.needs),title:`${categoryNames[outcome.needs.category]} · 预算 ¥${(outcome.needs.budgetFen/100).toFixed(2)}`,messages:{create:[{role:'user',content:message},{role:'assistant',content:outcome.warnings.join(' ')}]}}});
  const snapshot=await tx.snapshot.create({data:{conversationId,searchRunId:run.id,payload:json(outcome)}});
  return {snapshotId:snapshot.id,searchRunId:run.id};
 });
}
