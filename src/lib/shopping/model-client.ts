import type {SearchContext} from './contracts';
export async function within<T>(promise:Promise<T>,signal:AbortSignal,fallback:T):Promise<T>{
 if(signal.aborted)return fallback;
 return new Promise(resolve=>{
  const stop=()=>{signal.removeEventListener('abort',stop);resolve(fallback);};
  signal.addEventListener('abort',stop,{once:true});
  promise.then(value=>{signal.removeEventListener('abort',stop);resolve(value);},()=>{signal.removeEventListener('abort',stop);resolve(fallback);});
 });
}
export async function callModel(system:string,payload:unknown,ctx:SearchContext):Promise<unknown|null>{
 if(!ctx.model||ctx.signal.aborted||ctx.now()>=ctx.deadlineAt||!ctx.budget.take('model'))return null;
 const signal=AbortSignal.any([ctx.signal,AbortSignal.timeout(Math.max(1,Math.min(12000,ctx.deadlineAt-ctx.now())))]);
 try{return await within(ctx.model(system,payload,signal),signal,null);}catch{return null;}
}
export function createModelCaller(env:Record<string,string|undefined>,reserve:()=>Promise<boolean>,fetcher:typeof fetch=fetch):SearchContext['model']{
 if(!env.LLM_API_KEY)return undefined;
 return async(system,payload,signal)=>{
  if(signal.aborted||!await reserve())return null;
  const endpoint=new URL((env.LLM_BASE_URL??'https://api.deepseek.com').replace(/\/$/,'')+'/chat/completions');
  const response=await fetcher(endpoint,{method:'POST',headers:{Authorization:`Bearer ${env.LLM_API_KEY}`,'Content-Type':'application/json'},signal,redirect:'error',body:JSON.stringify({model:env.LLM_MODEL??'deepseek-chat',temperature:0,max_tokens:1200,response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(payload)}]})});
  if(!response.ok)return null;
  const raw=await response.json();const content=raw?.choices?.[0]?.message?.content;
  if(typeof content!=='string'||content.length>15000)return null;
  return JSON.parse(content);
 };
}
