import {z} from 'zod';
import {signTop as signJd} from './taobao';
import {requestOfficial,ProviderError} from '../transport';
import type {ProviderConfig} from '../provider-config';
import {emptyResult,normalizedOfferSchema,type Evidence,type PlatformProvider,type ProviderResult,type SearchContext} from '../contracts';
const scalar=z.union([z.string(),z.number()]);
const itemSchema=z.object({itemId:z.string().min(1),skuId:scalar.optional(),skuName:z.string().min(1),materialUrl:z.string(),brandName:z.string().optional(),priceInfo:z.object({price:scalar}),categoryInfo:z.object({cid3Name:z.string().optional()}).optional(),shopInfo:z.object({shopId:scalar.optional()}).optional()});
function normalize(raw:unknown,now:number){
 const item=itemSchema.safeParse(raw);if(!item.success)return null;const x=item.data;
 let url:URL;try{url=new URL(/^[a-z]+:/i.test(x.materialUrl)?x.materialUrl:x.materialUrl.startsWith('//')?'https:'+x.materialUrl:'https://'+x.materialUrl);}catch{return null;}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!(url.hostname==='jd.com'||url.hostname.endsWith('.jd.com')))return null;url.protocol='https:';
 const price=String(x.priceInfo.price);if(!/^\d{1,7}(\.\d{1,2})?$/.test(price))return null;const [whole,part='']=price.split('.');const priceFen=Number(whole)*100+Number(part.padEnd(2,'0'));
 const time=new Date(now).toISOString();const id=`jd:${x.itemId}:${now}:price`;
 const category=({'抽纸':'tissue','卷筒纸':'toilet','卷纸':'toilet','洗衣液':'detergent'} as Record<string,'tissue'|'toilet'|'detergent'>)[x.categoryInfo?.cid3Name??'']??null;
 const offer=normalizedOfferSchema.safeParse({ref:{platform:'jd',productId:x.itemId,skuId:x.skuId===undefined?null:String(x.skuId)},shopId:x.shopInfo?.shopId===undefined?null:String(x.shopInfo.shopId),name:x.skuName,brand:x.brandName??null,category,
  specs:{amount:null,unit:null,pack:null,layers:null,widthMm:null,heightMm:null,concentrated:null,fragranceFree:null},priceKind:x.skuId===undefined?'from':'exact',priceFen,currency:'CNY',shippingFen:null,stock:'unknown',discounts:[],sourceUrl:url.toString(),fetchedAt:time,evidenceIds:[id]});
 if(!offer.success)return null;
 const evidence:Evidence={id,platform:'jd',field:'salesPriceFen',value:priceFen,sourceUrl:url.toString(),fetchedAt:time,origin:'api'};return {offer:offer.data,evidence};
}
export function createJd(config:ProviderConfig,fetcher:typeof fetch,approved:boolean):PlatformProvider{
 const call=async(dto:Record<string,unknown>,kind:'search'|'detail',ctx:SearchContext):Promise<ProviderResult>=>{
  if(!config.configured)return emptyResult('jd','unconfigured',ctx.now());
  if(!approved)return emptyResult('jd','unauthorized',ctx.now(),'access_review_required');
  try{
   const params={method:'jd.union.open.goods.query',app_key:config.key,format:'json',v:'1.0',timestamp:new Date(ctx.now()+8*3600000).toISOString().slice(0,19).replace('T',' '),'360buy_param_json':JSON.stringify({goodsReqDTO:{sceneId:1,...dto}})};
   const raw=z.record(z.string(),z.unknown()).parse(await requestOfficial({platform:'jd',kind,body:new URLSearchParams({...params,sign:signJd(params,config.secret)}),fetch:fetcher},ctx));
   if(raw.error_response)return emptyResult('jd','error',ctx.now(),'gateway_rejected');
   const wrapper=z.object({queryResult:z.unknown()}).parse(raw.jd_union_open_goods_query_responce);
   const result=z.object({code:scalar,data:z.unknown().optional()}).parse(typeof wrapper.queryResult==='string'?JSON.parse(wrapper.queryResult):wrapper.queryResult);
   const code=String(result.code);if(code==='201')return emptyResult('jd','empty',ctx.now());
   if(code!=='200')return emptyResult('jd',['403','408','410'].includes(code)?'unauthorized':code==='429'?'rate_limited':'error',ctx.now(),'platform_rejected');
   const data=result.data;const rows=Array.isArray(data)?data:z.object({goodsResp:z.union([z.array(z.unknown()),z.record(z.string(),z.unknown())])}).parse(data).goodsResp;
   const items=Array.isArray(rows)?rows:[rows];if(items.length>100)return emptyResult('jd','error',ctx.now(),'response_too_large');
   const parsed=items.map(item=>normalize(item,ctx.now())).filter(x=>x!==null);
   if(items.length&&!parsed.length)return emptyResult('jd','error',ctx.now(),'missing_required_fields');
   return {...emptyResult('jd',parsed.length?'success':'empty',ctx.now()),offers:parsed.map(x=>x.offer),evidence:parsed.map(x=>x.evidence),warnings:parsed.length<items.length?['部分商品字段不完整，未参与比较']:[]};
  }catch(error){return emptyResult('jd',error instanceof ProviderError?error.status:'error',ctx.now(),error instanceof ProviderError?error.code:'invalid_response');}
 };
 return {platform:'jd',capabilities:{search:true,details:true,shipping:false,inventory:false,purchaseLink:false,cacheMaxAgeMs:null},search:(q,ctx)=>call({keyword:q.text,pageIndex:q.page,pageSize:20},'search',ctx),getDetails:(refs,ctx)=>call({itemIds:refs.slice(0,20).map(r=>r.productId)},'detail',ctx)};
}
