import {takeLimit} from '../security';
import {createModelCaller} from './model-client';
import {createCallBudget} from './budget';
import type {SearchContext} from './contracts';
function limit(name:string,fallback:number){const n=Number(process.env[name]??fallback);return Number.isInteger(n)&&n>=0?n:0;}
export function createSearchContext(visitorId:string,signal:AbortSignal):SearchContext{
 const now=Date.now();
 return {visitorId,signal,now:Date.now,deadlineAt:now+45000,budget:createCallBudget(),
  reserve:async platform=>{
   const global=limit(`${platform.toUpperCase()}_DAILY_LIMIT`,limit('SHOPPING_PLATFORM_DAILY_LIMIT',0));const user=limit('SHOPPING_USER_DAILY_LIMIT',40);
   return global>0&&user>0&&await takeLimit(`shopping-user:${visitorId}`,user,86400000)&&await takeLimit(`shopping-platform:${platform}`,global,86400000);
  },
  model:createModelCaller(process.env,async()=>{
   const user=limit('LLM_USER_DAILY_LIMIT',20);const reservation=limit('LLM_RESERVATION_FEN',100);const attempts=reservation?Math.floor(limit('LLM_DAILY_BUDGET_FEN',3000)/reservation):0;
   return user>0&&attempts>0&&await takeLimit(`model-user:${visitorId}`,user,86400000)&&await takeLimit('model-global-reservations',attempts,86400000);
  })};
}
