import type { CallKind, PlatformStatus, SearchContext } from './contracts';
export class ProviderError extends Error {constructor(public status:PlatformStatus,public code:string){super(code);}}
export type OfficialRequest={platform:'taobao';body:URLSearchParams;kind:Exclude<CallKind,'model'>;fetch:typeof fetch};
export async function requestOfficial(input:OfficialRequest,ctx:SearchContext):Promise<unknown>{
  for(let attempt=0;attempt<2;attempt++){
    if(ctx.signal.aborted||ctx.now()>=ctx.deadlineAt)throw new ProviderError('timeout','deadline');
    if(!ctx.budget.take(input.kind)||ctx.reserve&&!await ctx.reserve(input.platform,input.kind))throw new ProviderError('rate_limited','quota');
    const timeout=AbortSignal.timeout(Math.max(1,Math.min(8000,ctx.deadlineAt-ctx.now())));
    const signal=AbortSignal.any([ctx.signal,timeout]);
    try{
      const response=await input.fetch('https://eco.taobao.com/router/rest',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:input.body.toString(),signal,redirect:'error',cache:'no-store'});
      if(response.status===401||response.status===403)throw new ProviderError('unauthorized','http_authorization');
      if(response.status===429)throw new ProviderError('rate_limited','http_rate_limit');
      if(!response.ok){if(response.status>=500&&attempt===0)continue;throw new ProviderError('error','http_error');}
      // Bound response memory and keep cancellation active through body consumption.
      const reader=response.body?.getReader();if(!reader)throw new ProviderError('error','empty_response');
      let bytes=0;let text='';const decoder=new TextDecoder();
      for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1_000_000){await reader.cancel();throw new ProviderError('error','response_too_large');}text+=decoder.decode(value,{stream:true});}
      text+=decoder.decode();return JSON.parse(text);
    }catch(error){
      if(error instanceof ProviderError)throw error;
      if(signal.aborted)throw new ProviderError('timeout','deadline');
      if(attempt===1||error instanceof SyntaxError)throw new ProviderError('error','invalid_or_unavailable_response');
    }
  }
  throw new ProviderError('error','request_failed');
}
