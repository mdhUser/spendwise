import {emptyResult,offerKey,searchQuerySchema,normalizedOfferSchema,evidenceSchema,type PlatformProvider,type ProviderResult,type SearchContext,type SearchQuery} from './contracts';
// No shared caching until a provider's policy and privacy semantics are verified.
export async function searchRound(queries:SearchQuery[],providers:PlatformProvider[],ctx:SearchContext):Promise<ProviderResult[]>{
 const validated=queries.slice(0,2).map(q=>searchQuerySchema.parse(q));
 return Promise.all(providers.map(async provider=>{
  if(ctx.signal.aborted||ctx.now()>=ctx.deadlineAt)return emptyResult(provider.platform,'timeout',ctx.now(),'deadline');
  const results=await Promise.allSettled(validated.map(q=>provider.search(q,ctx)));
  const values=results.map(r=>r.status==='fulfilled'?r.value:emptyResult(provider.platform,'error',ctx.now(),'provider_failed'));
  const offers=new Map<string,ProviderResult['offers'][number]>();const evidence=new Map<string,ProviderResult['evidence'][number]>();
  for(const value of values){
    if(value.platform!==provider.platform)continue;
    for(const item of value.evidence){const parsed=evidenceSchema.safeParse(item);if(parsed.success&&parsed.data.platform===provider.platform&&parsed.data.origin==='api')evidence.set(item.id,parsed.data);}
    for(const item of value.offers){const parsed=normalizedOfferSchema.safeParse(item);if(!parsed.success||item.ref.platform!==provider.platform||Date.parse(item.fetchedAt)>ctx.now()||!item.evidenceIds.every(id=>evidence.has(id)))continue;
      if(offers.size<20)offers.set(offerKey(item.ref),parsed.data);
    }
  }
  const success=values.some(v=>v.status==='success'||v.status==='empty');
  const status=offers.size?'success':success?'empty':values[0]?.status??'empty';
  return {...emptyResult(provider.platform,status,ctx.now(),success?null:values[0]?.sanitizedErrorCode??null),offers:[...offers.values()],evidence:[...evidence.values()].filter(e=>[...offers.values()].some(o=>o.evidenceIds.includes(e.id)||o.discounts.some(d=>d.evidenceIds.includes(e.id)))),warnings:values.flatMap(v=>v.status==='success'||v.status==='empty'?v.warnings??[]:[v.sanitizedErrorCode??v.status])};
 }));
}
