import type {ProviderResult} from './contracts';
const cache=new Map<string,{expiresAt:number;result:ProviderResult}>();
export function readPublicCache(key:string,now:number):ProviderResult|null{const entry=cache.get(key);if(!entry)return null;if(now>=entry.expiresAt){cache.delete(key);return null;}return structuredClone(entry.result);}
export function writePublicCache(key:string,result:ProviderResult,expiresAt:number):void{
 const fetched=Date.parse(result.fetchedAt);const couponEnds=result.offers.flatMap(o=>o.discounts.map(d=>Date.parse(d.endsAt)));
 const expiry=Math.min(expiresAt,fetched+300000,...couponEnds);if(!Number.isFinite(expiry)||expiry<=fetched)return;
 cache.delete(key);if(cache.size>=500)cache.delete(cache.keys().next().value!);cache.set(key,{result:structuredClone(result),expiresAt:expiry});
}
