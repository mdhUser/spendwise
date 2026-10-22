import {normalizedOfferSchema,offerKey,type Decision,type NormalizedOffer,type ShoppingNeeds,type PricedCandidate} from './contracts';
function comparable(o:NormalizedOffer):string|null{
 const s=o.specs;if(!o.category||!s.unit||!s.amount)return null;
 if(o.category==='detergent')return s.concentrated===null||s.fragranceFree===null?null:JSON.stringify([o.category,s.unit,s.concentrated,s.fragranceFree]);
 return !s.layers||!s.widthMm||!s.heightMm?null:JSON.stringify([o.category,s.unit,s.layers,s.widthMm,s.heightMm]);
}
export function priceOffer(input:NormalizedOffer,needs:ShoppingNeeds,packs:number,now:number):PricedCandidate|null{
 const parsed=normalizedOfferSchema.safeParse(input);if(!parsed.success)return null;const o=parsed.data;
 if(!Number.isInteger(packs)||packs<1||packs>50||o.stock==='unavailable'||o.category&&o.category!==needs.category||o.priceFen===null)return null;
 if(o.category==='tissue'&&o.specs.unit&&o.specs.unit!=='draw'||o.category==='toilet'&&o.specs.unit&&o.specs.unit!=='g'||o.category==='detergent'&&o.specs.unit==='draw')return null;
 const age=now-Date.parse(o.fetchedAt);if(age<0)return null;
 const pending:string[]=[];if(age>300000)pending.push('报价已过期，需重新核实');
 if(o.priceKind!=='exact'||!o.ref.skuId)pending.push('具体规格价格待确认');
 if(!o.category||!o.specs.amount||!o.specs.unit)pending.push('品类与用量规格待确认');
 if(o.shippingFen===null)pending.push('运费待确认');if(o.stock==='unknown')pending.push('库存待确认');
 if(needs.minLayers&&needs.category!=='detergent'){
  if(o.specs.layers!==null&&o.specs.layers<needs.minLayers)return null;
  if(o.specs.layers===null)pending.push('纸品层数待确认');
 }
 if(needs.fragranceFree){if(o.specs.fragranceFree===false)return null;if(o.specs.fragranceFree===null)pending.push('无香条件待确认');}
 let discount=0;const subtotal=o.priceFen*packs;
 for(const d of o.discounts){
  if(now<Date.parse(d.startsAt)||now>=Date.parse(d.endsAt)||subtotal<d.thresholdFen||!d.evidenceIds.every(id=>o.evidenceIds.includes(id)))continue;
  const eligible=d.eligibility==='all'?true:needs.eligibility[o.ref.platform][d.eligibility];
  if(eligible===null){pending.push('优惠资格待确认');continue;}
  if(eligible)discount=Math.max(discount,d.reductionFen);
 }
 const knownCostFen=Math.max(0,subtotal-discount)+(o.shippingFen??0);if(knownCostFen>needs.budgetFen)return null;
 const totalFen=pending.length?null:knownCostFen;const scale=o.specs.unit==='draw'||needs.category==='toilet'?100:1000;
 const unitPriceFen=totalFen!==null&&o.specs.amount?Math.round(totalFen*scale/(o.specs.amount*packs)):null;
 return {id:offerKey(o.ref)+':'+packs,offer:o,packs,knownCostFen,totalFen,unitPriceFen,pending:[...new Set(pending)],evidenceIds:o.evidenceIds,comparableKey:comparable(o),refreshed:false};
}
export function buildCandidates(offers:NormalizedOffer[],needs:ShoppingNeeds,now:number):PricedCandidate[]{
 const unique=new Map<string,PricedCandidate>();
 for(const o of offers){
  let minimum=needs.quantity;
  if(needs.targetAmount){if(o.specs.unit!==needs.targetAmount.unit||!o.specs.amount)continue;minimum=Math.max(minimum,Math.ceil(needs.targetAmount.value/o.specs.amount));}
  const maximum=needs.allowStockpile&&needs.maxPacks!==null?needs.maxPacks:minimum;
  for(let packs=minimum;packs<=Math.min(50,maximum);packs++){const c=priceOffer(o,needs,packs,now);if(c)unique.set(c.id,c);}
 }
 return [...unique.values()].sort((a,b)=>Number(a.totalFen===null)-Number(b.totalFen===null)||a.knownCostFen-b.knownCostFen||a.id.localeCompare(b.id));
}
export function rankByRules(candidates:PricedCandidate[],needs:ShoppingNeeds):Decision{
 const confirmed=candidates.filter(c=>c.totalFen!==null);const selected:Decision=[];
 const add=(c:PricedCandidate|undefined,kind:Decision[number]['kind'],reason:string)=>{if(c&&!selected.some(d=>d.candidateId===c.id))selected.push({candidateId:c.id,kind,reason,evidenceIds:c.evidenceIds});};
 const cheapest=[...confirmed].sort((a,b)=>a.totalFen!-b.totalFen!||a.id.localeCompare(b.id))[0];
 add(cheapest,'lowest_spend','在本次可确认且满足条件的候选中，总支出最低。');
 // Unit comparisons stay within the reference specification group; quality may differ.
 const unit=[...confirmed].filter(c=>c.comparableKey&&c.comparableKey===cheapest?.comparableKey&&c.unitPriceFen!==null).sort((a,b)=>a.unitPriceFen!-b.unitPriceFen!||a.knownCostFen-b.knownCostFen)[0];
 add(unit,'lowest_unit','在与最低支出方案同计量规格的候选中，单位成本最低；品牌品质可能不同。');
 const preferred=[...confirmed].sort((a,b)=>Number(needs.brands.includes(b.offer.brand??''))-Number(needs.brands.includes(a.offer.brand??''))||a.knownCostFen-b.knownCostFen).find(c=>!selected.some(d=>d.candidateId===c.id));
 add(preferred,'best_match','满足已确认条件的另一选择，请结合品牌偏好比较。');
 // Unconfirmed offers are displayed separately by the UI, never winners.
 return selected;
}
