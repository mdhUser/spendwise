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
