import {it,expect} from 'vitest';
import {runShopping} from '../../src/lib/shopping/orchestrator';
import {needs,offer,now,context,provider,result} from './fixtures';
import {emptyResult} from '../../src/lib/shopping/contracts';
it('runs searches without a model and eliminates winners invalidated by refreshed prices',async()=>{
 const p=provider({getDetails:async()=>result([offer({priceFen:6000})])});
 const outcome=await runShopping({message:'',needs},[p],context());expect(outcome.candidates).toHaveLength(0);expect(outcome.decision).toHaveLength(0);expect(outcome.mode).toBe('rules');
});
it('marks a failed refresh unconfirmed without stale lowest-price claims',async()=>{
 const p=provider({getDetails:async()=>emptyResult('taobao','timeout',now)});
 const outcome=await runShopping({message:'',needs},[p],context());expect(outcome.decision).toHaveLength(0);expect(outcome.candidates[0].totalFen).toBeNull();expect(outcome.candidates[0].pending.join()).toContain('复核');
});
it('never fills all-platform failures with demo offers or calls the model indefinitely',async()=>{
 const ctx=context();let calls=0;ctx.model=async()=>{calls++;throw Error('offline');};
 const out=await runShopping({message:'抽纸',needs},[provider({search:async()=>emptyResult('taobao','error',now)})],ctx);
 expect(out.candidates).toHaveLength(0);expect(calls).toBeLessThanOrEqual(3);
});
it('stops a provider that ignores cancellation at the whole-request deadline',async()=>{
 const ctx=context();ctx.now=Date.now;ctx.deadlineAt=Date.now()+25;
 const out=await runShopping({message:'',needs},[provider({search:()=>new Promise(()=>{})})],ctx);
 expect(out.platformResults[0].status).toBe('timeout');expect(out.decision).toHaveLength(0);
});
it('recomputes required packs when refreshed package amount changes',async()=>{
 const changed=offer({specs:{...offer().specs,amount:50}});
 const out=await runShopping({message:'',needs:{...needs,targetAmount:{value:200,unit:'draw'}}},[provider({getDetails:async()=>result([changed])})],context());
 expect(out.candidates.every(c=>c.packs*(c.offer.specs.amount??0)>=200)).toBe(true);
 expect(out.candidates[0].packs).toBe(4);
 expect(out.decision.every(d=>out.candidates.some(c=>c.id===d.candidateId))).toBe(true);
});
it('preserves successful platform results when another source never resolves',async()=>{
 const ctx=context();ctx.now=Date.now;ctx.deadlineAt=Date.now()+25;
 const out=await runShopping({message:'',needs},[provider(),provider({platform:'jd',search:()=>new Promise(()=>{})})],ctx);
 expect(out.platformResults[0].status).toBe('success');expect(out.platformResults[1].status).toBe('timeout');
 expect(out.candidates.length).toBeGreaterThan(0);
});
it('keeps refresh errors isolated and returns pending candidates',async()=>{
 const out=await runShopping({message:'',needs},[provider({getDetails:async()=>{throw Error('network');}})],context());
 expect(out.decision).toHaveLength(0);expect(out.candidates[0].totalFen).toBeNull();
});
it('retains every selected candidate when the result payload is capped',async()=>{
 const items=Array.from({length:70},(_,i)=>offer({ref:{...offer().ref,productId:String(i).padStart(3,'0')},priceFen:100+i,shippingFen:200,specs:{...offer().specs,amount:i===19?1000:100}}));
 const out=await runShopping({message:'',needs:{...needs,allowStockpile:true,maxPacks:5}},[provider({search:async()=>result(items),getDetails:async refs=>result(items.filter(o=>refs.some(r=>r.productId===o.ref.productId)))})],context());
 expect(out.decision.length).toBeGreaterThan(1);
 expect(out.decision.every(d=>out.candidates.some(c=>c.id===d.candidateId))).toBe(true);
});
