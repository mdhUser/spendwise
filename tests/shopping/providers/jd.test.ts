import {it,expect} from 'vitest';
import {createProviders} from '../../../src/lib/shopping/providers';
import {readProviderConfig} from '../../../src/lib/shopping/provider-config';
import {context} from '../fixtures';
const config=readProviderConfig({JD_APP_KEY:'key',JD_APP_SECRET:'secret',JD_SITE_ID:'site'});
it('uses official JOS signing transport, preserves item IDs and ignores conditional coupon prices',async()=>{
 const provider=createProviders(config,{jdAccessApproved:true,fetch:async(url,init)=>{
  expect(String(url)).toBe('https://api.jd.com/routerjson');const body=new URLSearchParams(String(init?.body));
  expect(body.get('method')).toBe('jd.union.open.goods.query');expect(JSON.parse(body.get('360buy_param_json')!).goodsReqDTO).toMatchObject({keyword:'抽纸',sceneId:1,pageSize:20});
  return Response.json({jd_union_open_goods_query_responce:{queryResult:{code:'200',data:{goodsResp:{itemId:'opaque-id',skuId:'123',skuName:'抽纸',materialUrl:'item.jd.com/123.html',priceInfo:{price:'19.90',lowestCouponPrice:'1.00'}}}}}});
 }})[1];
 const result=await provider.search({text:'抽纸',category:'tissue',page:1},context());expect(result.status).toBe('success');expect(result.offers[0].ref.productId).toBe('opaque-id');expect(result.offers[0].priceFen).toBe(1990);expect(result.offers[0].shippingFen).toBeNull();
});
it('refreshes by returned itemIds, without guessing numeric SKU identity',async()=>{
 const provider=createProviders(config,{jdAccessApproved:true,fetch:async(_url,init)=>{
  const dto=JSON.parse(new URLSearchParams(String(init?.body)).get('360buy_param_json')!).goodsReqDTO;expect(dto).toMatchObject({itemIds:['opaque-id'],sceneId:1});expect(dto.keyword).toBeUndefined();
  return Response.json({jd_union_open_goods_query_responce:{queryResult:{code:'201'}}});
 }})[1];expect((await provider.getDetails([{platform:'jd',productId:'opaque-id',skuId:'123'}],context())).status).toBe('empty');
});
it('reports permission denial and malformed data distinctly from empty results',async()=>{
 for(const [raw,status] of [[{jd_union_open_goods_query_responce:{queryResult:{code:403,message:'secret'}}},'unauthorized'],[{jd_union_open_goods_query_responce:{queryResult:{code:200,data:{unexpected:[]}}}},'error']] as const){
  const provider=createProviders(config,{jdAccessApproved:true,fetch:async()=>Response.json(raw)})[1];const r=await provider.search({text:'抽纸',category:'tissue',page:1},context());expect(r.status).toBe(status);expect(JSON.stringify(r)).not.toContain('secret');
 }
});
