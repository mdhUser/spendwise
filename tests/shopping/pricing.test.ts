import {it,expect} from 'vitest';
import {buildCandidates,priceOffer,rankByRules} from '../../src/lib/shopping/pricing';
import {needs,offer,now} from './fixtures';
it('distinguishes minimum cash from minimum unit price within comparable specs',()=>{
 const a=offer();const b=offer({ref:{...a.ref,productId:'two'},priceFen:2000,specs:{...a.specs,amount:300}});
 const candidates=buildCandidates([a,b],needs,now);const decision=rankByRules(candidates,needs);
 expect(decision.find(d=>d.kind==='lowest_spend')?.candidateId).toBe(candidates.find(c=>c.offer.ref.productId==='one')?.id);
 expect(decision.find(d=>d.kind==='lowest_unit')?.candidateId).toBe(candidates.find(c=>c.offer.ref.productId==='two')?.id);
});
it('never treats unknown shipping, unidentified SKU or from price as confirmed total',()=>{
 for(const patch of [{shippingFen:null},{priceKind:'from' as const},{ref:{...offer().ref,skuId:null}}])expect(priceOffer(offer(patch),needs,1,now)?.totalFen).toBeNull();
 expect(priceOffer(offer({priceFen:6000}),needs,1,now)).toBeNull();
});
it('does not apply expired or unknown-member discounts or stack independent coupons',()=>{
 const discount={id:'d',thresholdFen:0,reductionFen:300,eligibility:'all' as const,startsAt:new Date(now-1000).toISOString(),endsAt:new Date(now+1000).toISOString(),evidenceIds:['e1']};
 expect(priceOffer(offer({discounts:[discount,{...discount,id:'other',reductionFen:400}]}),needs,1,now)?.totalFen).toBe(800);
 expect(priceOffer(offer({discounts:[{...discount,endsAt:new Date(now-1).toISOString()}]}),needs,1,now)?.totalFen).toBe(1200);
 expect(priceOffer(offer({discounts:[{...discount,eligibility:'member'}]}),needs,1,now)?.totalFen).toBeNull();
});
it('enforces hard constraints and same-unit quantities without inventing conversions',()=>{
 expect(priceOffer(offer({stock:'unavailable'}),needs,1,now)).toBeNull();
 expect(buildCandidates([offer()],{...needs,minLayers:4},now)).toHaveLength(0);
 expect(buildCandidates([offer()],{...needs,targetAmount:{value:200,unit:'ml'}},now)).toHaveLength(0);
 const c=buildCandidates([offer()],{...needs,targetAmount:{value:250,unit:'draw'}},now);expect(c[0].packs).toBe(3);
 expect(buildCandidates([offer()],{...needs,allowStockpile:true,maxPacks:2,targetAmount:{value:250,unit:'draw'}},now)).toHaveLength(0);
});
it('requires explicit stockpile limits and rejects stale/future quotes as confirmed',()=>{
 expect(buildCandidates([offer()],needs,now)).toHaveLength(1);
 expect(buildCandidates([offer()],{...needs,allowStockpile:true,maxPacks:null},now)).toHaveLength(1);
 expect(priceOffer(offer({fetchedAt:new Date(now+1).toISOString()}),needs,1,now)).toBeNull();
 expect(priceOffer(offer({fetchedAt:new Date(now-300001).toISOString()}),needs,1,now)?.totalFen).toBeNull();
});
