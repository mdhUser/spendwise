import {it,expect} from 'vitest';
import {createCallBudget} from '../../src/lib/shopping/budget';
import {searchRound} from '../../src/lib/shopping/search';
import {readPublicCache,writePublicCache} from '../../src/lib/shopping/cache';
import {emptyResult,type PlatformProvider,type SearchContext} from '../../src/lib/shopping/contracts';
const now=Date.parse('2026-10-22T08:00:00Z');
const ctx=():SearchContext=>({now:()=>now,deadlineAt:now+45000,signal:new AbortController().signal,budget:createCallBudget(),visitorId:'a'});
it('enforces shared attempts for concurrent callers and all call types',async()=>{
 const b=createCallBudget();for(let i=0;i<11;i++)b.take('search');
 expect((await Promise.all([1,2,3].map(async()=>b.take('search')))).filter(Boolean)).toHaveLength(1);
 for(let i=0;i<6;i++)expect(b.take('detail')).toBe(true);expect(b.take('detail')).toBe(false);
 for(let i=0;i<3;i++)expect(b.take('model')).toBe(true);expect(b.take('model')).toBe(false);
});
it('starts all platform searches before waiting and preserves partial failures',async()=>{
 const started:string[]=[];let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const providers=(['taobao','jd','pdd'] as const).map(platform=>({platform,capabilities:{search:true,details:false,shipping:false,inventory:false,purchaseLink:false,cacheMaxAgeMs:null},getDetails:async()=>emptyResult('taobao','empty',now),search:async()=>{started.push(platform);await gate;if(platform==='jd')throw Error('private');return emptyResult(platform as 'taobao','empty',now);}})) as PlatformProvider[];
 const result=searchRound([{text:'抽纸',category:'tissue',page:1}],providers,ctx());
 await Promise.resolve();expect(started.sort()).toEqual(['jd','pdd','taobao']);release();
 expect((await result).map(x=>x.status)).toEqual(['empty','error','empty']);
});
it('expires public cache and returns independent copies',()=>{
 const result=emptyResult('taobao','empty',now);writePublicCache('key',result,now+300000);
 const first=readPublicCache('key',now)!;first.warnings=['private'];expect(readPublicCache('key',now)?.warnings).toBeUndefined();
 expect(readPublicCache('key',now+300001)).toBeNull();
});
it('does not reuse user-specific or unapproved platform responses',async()=>{
 let calls=0;const provider={platform:'taobao',capabilities:{search:true,details:false,shipping:false,inventory:false,purchaseLink:false,cacheMaxAgeMs:null},getDetails:async()=>emptyResult('taobao','empty',now),search:async()=>{calls++;return emptyResult('taobao','empty',now);}} as PlatformProvider;
 await searchRound([{text:'抽纸',category:'tissue',page:1}],[provider],ctx());const other=ctx();other.visitorId='b';await searchRound([{text:'抽纸',category:'tissue',page:1}],[provider],other);expect(calls).toBe(2);
});
