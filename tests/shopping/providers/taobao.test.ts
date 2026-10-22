import {it,expect} from 'vitest';
import {createProviders} from '../../../src/lib/shopping/providers';
import {signTop} from '../../../src/lib/shopping/providers/taobao';
import {readProviderConfig} from '../../../src/lib/shopping/provider-config';
import type {SearchContext} from '../../../src/lib/shopping/contracts';
const config=readProviderConfig({TAOBAO_APP_KEY:'key',TAOBAO_APP_SECRET:'secret',TAOBAO_ADZONE_ID:'123'});
const context=():SearchContext=>({now:()=>Date.parse('2026-10-22T08:00:00Z'),deadlineAt:Date.parse('2026-10-22T08:00:45Z'),signal:new AbortController().signal,visitorId:'test',budget:{take:()=>true,remaining:()=>12}});
const query={text:'抽纸',category:'tissue' as const,page:1};
it('uses TOP ordered UTF-8 MD5 signature with secrets at both ends',()=>{
  expect(signTop({b:'2',a:'1'},'secret')).toBe('EF16F26C937CF52AE6F85DF2FD08B24A');
});
it('maps upgraded wire response without treating predicted price or missing SKU as checkout price',async()=>{
  const provider=createProviders(config,{accessApproved:true,fetch:async(input,init)=>{
    expect(String(input)).toBe('https://eco.taobao.com/router/rest');
    const body=new URLSearchParams(String(init?.body));expect(body.get('method')).toBe('taobao.tbk.dg.material.optional.upgrade');expect(body.get('biz_scene_id')).toBe('2');
    return Response.json({tbk_dg_material_optional_upgrade_response:{result_list:{map_data:[{item_id:'opaque-id',item_basic_info:{title:'抽纸',shop_title:'店铺'},price_promotion_info:{zk_final_price:'12.34',final_promotion_price:'1.00'},publish_info:{click_url:'//item.taobao.com/item.htm?id=123'}}]}}});
  }})[0];
  const result=await provider.search(query,context());
  expect(result.status).toBe('success');expect(result.offers[0].priceFen).toBe(1234);expect(result.offers[0].priceKind).toBe('from');expect(result.offers[0].shippingFen).toBeNull();expect(result.offers[0].specs.amount).toBeNull();
});
it('does not send requests with incomplete credentials or unverified platform protocols',async()=>{
  let calls=0;const providers=createProviders(readProviderConfig({}),{fetch:async()=>{calls++;throw Error('secret');}});
  expect((await providers[0].search(query,context())).status).toBe('unconfigured');
  expect((await providers[1].search(query,context())).status).toBe('unconfigured');expect(calls).toBe(0);
});
it('does not retry HTTP authorization failure or disclose provider error strings',async()=>{
  let calls=0;const provider=createProviders(config,{accessApproved:true,fetch:async()=>{calls++;return new Response('private-secret',{status:401});}})[0];
  const result=await provider.search(query,context());expect(result.status).toBe('unauthorized');expect(calls).toBe(1);expect(JSON.stringify(result)).not.toContain('private-secret');
});
it('does not issue an already cancelled request',async()=>{
  let calls=0;const provider=createProviders(config,{accessApproved:true,fetch:async()=>{calls++;return Response.json({});}})[0];const ctx=context();ctx.signal=AbortSignal.abort();
  expect((await provider.search(query,ctx)).status).toBe('timeout');expect(calls).toBe(0);
});
it('rejects invalid response shapes and unsafe links instead of reporting empty success',async()=>{
 const provider=createProviders(config,{accessApproved:true,fetch:async()=>Response.json({unexpected:'data'})})[0];expect((await provider.search(query,context())).status).toBe('error');
});
