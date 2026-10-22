import {emptyResult,offerKey,normalizedOfferSchema,type ShoppingNeeds,type SearchContext,type PlatformProvider,type SearchOutcome,type SearchQuery,type ProviderResult,type PricedCandidate} from './contracts';
import {planSearch,planFollowup} from './planner';
import {searchRound} from './search';
import {buildCandidates,rankByRules} from './pricing';
import {chooseDecision} from './decision';
import {within} from './model-client';
export async function runShopping(input:{message:string;needs:ShoppingNeeds;queries?:SearchQuery[]},providers:PlatformProvider[],original:SearchContext):Promise<SearchOutcome>{
 const startedAt=new Date(original.now()).toISOString();
 const rootSignal=AbortSignal.any([original.signal,AbortSignal.timeout(Math.max(1,original.deadlineAt-original.now()))]);
 const ctx={...original,signal:rootSignal};
 const modelCtx={...ctx,deadlineAt:ctx.deadlineAt-10000};
 const planned=input.queries?{needs:input.needs,queries:input.queries}:await planSearch(input.message,input.needs,modelCtx);
 const needs=planned.needs;
 const failed=()=>providers.map(p=>emptyResult(p.platform,'timeout',ctx.now(),'deadline'));
 let results=await within(searchRound(planned.queries,providers,ctx),rootSignal,failed());
 let candidates=buildCandidates(results.flatMap(r=>r.offers),needs,ctx.now());
 if(candidates.filter(c=>c.totalFen!==null).length<3&&results.some(r=>r.status==='success'||r.status==='empty')&&ctx.now()<modelCtx.deadlineAt){
  const queries=await planFollowup(needs,results,modelCtx);
  if(queries.length){const extra=await within(searchRound(queries,providers,ctx),rootSignal,failed());
   results=results.map(r=>{const e=extra.find(x=>x.platform===r.platform)!;return {...r,status:r.status==='success'?r.status:e.status,offers:[...new Map([...r.offers,...e.offers].map(o=>[offerKey(o.ref),o])).values()].slice(0,40),evidence:[...r.evidence,...e.evidence],warnings:[...(r.warnings??[]),...(e.warnings??[])]};});
   candidates=buildCandidates(results.flatMap(r=>r.offers),needs,ctx.now());
  }
 }
 const choice=await chooseDecision(needs,candidates,modelCtx);
 const chosen=choice.decision.map(d=>candidates.find(c=>c.id===d.candidateId)!);
 const finalists=chosen.length?chosen:candidates.slice(0,3);
 const refreshed=new Map<string,ProviderResult>();
 await Promise.all(finalists.map(async c=>{
  const p=providers.find(p=>p.platform===c.offer.ref.platform);if(!p?.capabilities.details)return;
  const response=await within(p.getDetails([c.offer.ref],ctx),rootSignal,emptyResult(p.platform,'timeout',ctx.now(),'deadline'));
  refreshed.set(offerKey(c.offer.ref),response);
 }));
 let changed=false;
 candidates=candidates.flatMap((c):PricedCandidate[]=>{
  const key=offerKey(c.offer.ref);const r=refreshed.get(key);
  const raw=r?.offers.find(o=>offerKey(o.ref)===key);const validation=normalizedOfferSchema.safeParse(raw);
  const replacement=validation.success&&r?.status==='success'&&validation.data.evidenceIds.every(id=>r.evidence.some(e=>e.id===id&&e.platform===c.offer.ref.platform&&e.origin==='api'))?validation.data:null;
  if(replacement){const updated=buildCandidates([replacement],{...needs,quantity:c.packs,allowStockpile:false,targetAmount:null},ctx.now())[0];
   if(!updated){changed=true;return [];}
   if(updated.totalFen!==c.totalFen||updated.unitPriceFen!==c.unitPriceFen||updated.comparableKey!==c.comparableKey||updated.offer.brand!==c.offer.brand||JSON.stringify(updated.pending)!==JSON.stringify(c.pending))changed=true;
   return [{...updated,refreshed:true}];
  }
  if(choice.decision.some(d=>d.candidateId===c.id)&&c.totalFen!==null)changed=true;
  return [{...c,totalFen:null,unitPriceFen:null,pending:[...new Set([...c.pending,'当前报价尚未复核'])]}];
 });
 // Only finalists with successfully refreshed terms can retain confirmed recommendations.
 const decision=changed?rankByRules(candidates,needs):choice.decision.map(d=>({...d,evidenceIds:candidates.find(c=>c.id===d.candidateId)!.evidenceIds}));
 const warnings=['结果仅覆盖本次成功查询的来源；平台销售价可能与个人结算价不同。'];
 if(!candidates.some(c=>c.totalFen!==null))warnings.push('暂无可确认到手价的方案；可查看待确认商品或使用手动比较。');
 results=results.map(r=>({...r,evidence:[...new Map([...r.evidence,...[...refreshed.values()].filter(x=>x.platform===r.platform).flatMap(x=>x.evidence)].map(e=>[e.id,e])).values()]}));
 return {version:2,needs,platformResults:results,candidates:candidates.slice(0,60),decision,mode:changed?'rules':choice.mode,warnings,startedAt,finishedAt:new Date(ctx.now()).toISOString()};
}
