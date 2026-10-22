import {createHash} from 'node:crypto';
import {z} from 'zod';
import {emptyResult, normalizedOfferSchema, type Evidence,type PlatformProvider,type ProviderResult,type SearchContext,type OfferRef, type NormalizedOffer} from '../contracts';
import type {ProviderConfig} from '../provider-config';
import {requestOfficial,ProviderError} from '../transport';
export function signTop(params:Record<string,string>,secret:string){return createHash('md5').update(secret+Object.keys(params).filter(k=>k!=='sign').sort().map(k=>k+params[k]).join('')+secret,'utf8').digest('hex').toUpperCase();}
const wireItem=z.object({item_id:z.string().min(1),input_item_iid:z.string().optional(),item_basic_info:z.object({title:z.string(),brand_name:z.string().optional(),category_name:z.string().optional(),seller_id:z.union([z.string(),z.number()]).optional(),item_url:z.string().optional()}),price_promotion_info:z.object({zk_final_price:z.string().optional()}).optional(),publish_info:z.object({click_url:z.string().optional()}).optional()});
function safeLink(value:string|undefined){if(!value)return null;try{const u=new URL(value.startsWith('//')?'https:'+value:value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!['taobao.com','tmall.com'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))return null;u.protocol='https:';return u.toString();}catch{return null;}}
function fen(value:string|undefined){if(!value||!/^\d{1,7}(\.\d{1,2})?$/.test(value))return null;const [whole,part='']=value.split('.');return Number(whole)*100+Number(part.padEnd(2,'0'));}
function normalize(raw:unknown,now:number):{offer:NormalizedOffer;evidence:Evidence[]}|null{
 const item=wireItem.safeParse(raw);if(!item.success)return null;const x=item.data;
 const url=safeLink(x.publish_info?.click_url??x.item_basic_info.item_url);if(!url)return null;
 const time=new Date(now).toISOString();const id=`taobao:${x.input_item_iid??x.item_id}:${now}:price`;
 const category=({'抽纸':'tissue','卷筒纸':'toilet','卷纸':'toilet','洗衣液':'detergent'} as const)[x.item_basic_info.category_name as '抽纸'];
 const offer=normalizedOfferSchema.safeParse({ref:{platform:'taobao',productId:x.input_item_iid??x.item_id,skuId:null},shopId:x.item_basic_info.seller_id===undefined?null:String(x.item_basic_info.seller_id),name:x.item_basic_info.title,brand:x.item_basic_info.brand_name??null,category:category??null,
 specs:{amount:null,unit:null,pack:null,layers:null,widthMm:null,heightMm:null,concentrated:null,fragranceFree:null},priceKind:'from',priceFen:fen(x.price_promotion_info?.zk_final_price),currency:'CNY',shippingFen:null,stock:'unknown',sourceUrl:url,fetchedAt:time,discounts:[],evidenceIds:[id]});
 if(!offer.success)return null;
 return {offer:offer.data,evidence:[{id,platform:'taobao',field:'salesPriceFen',value:offer.data.priceFen,sourceUrl:url,fetchedAt:time,origin:'api'}]};
}
export function createTaobao(config:ProviderConfig,fetcher:typeof fetch,approved:boolean):PlatformProvider{
 const call=async(method:string,business:Record<string,string>,ctx:SearchContext):Promise<ProviderResult>=>{
  if(!config.configured)return emptyResult('taobao','unconfigured',ctx.now());
  if(!approved)return emptyResult('taobao','unauthorized',ctx.now(),'access_review_required');
  try{
   const params={method,app_key:config.key,sign_method:'md5',format:'json',v:'2.0',timestamp:new Date(ctx.now()+8*3600000).toISOString().slice(0,19).replace('T',' '),biz_scene_id:'2',...business};
   const body=new URLSearchParams({...params,sign:signTop(params,config.secret)});
   const raw=z.record(z.string(),z.unknown()).parse(await requestOfficial({platform:'taobao',body,kind:method.includes('optional')?'search':'detail',fetch:fetcher},ctx));
   if(raw.error_response){const err=z.object({code:z.union([z.number(),z.string()]),sub_code:z.string().optional()}).safeParse(raw.error_response);const code=err.success?String(err.data.code):'';
    // Unknown business errors remain errors, never an empty search.
    return emptyResult('taobao',code==='50002'?'rate_limited':code==='27'||code==='29'?'unauthorized':'error',ctx.now(),'platform_rejected');}
   const isSearch=method.includes('optional');const root=raw[isSearch?'tbk_dg_material_optional_upgrade_response':'tbk_item_info_upgrade_get_response'];
   const object=z.record(z.string(),z.unknown()).parse(root);
   const container=z.record(z.string(),z.unknown()).parse(object[isSearch?'result_list':'results']);
   const items=z.array(z.unknown()).max(100).parse(container[isSearch?'map_data':'tbk_item_detail']);
   const parsed=items.map(item=>normalize(item,ctx.now())).filter(x=>x!==null);
   if(items.length&&!parsed.length)return emptyResult('taobao','error',ctx.now(),'missing_required_fields');
   return {...emptyResult('taobao',parsed.length?'success':'empty',ctx.now()),offers:parsed.map(x=>x.offer),evidence:parsed.flatMap(x=>x.evidence),warnings:parsed.length<items.length?['部分商品字段不完整，未参与比较']:[]};
  }catch(error){return emptyResult('taobao',error instanceof ProviderError?error.status:'error',ctx.now(),error instanceof ProviderError?error.code:'invalid_response');}
 };
 return {platform:'taobao',capabilities:{search:true,details:true,shipping:false,inventory:false,purchaseLink:false,cacheMaxAgeMs:null},
 search:(query,ctx)=>call('taobao.tbk.dg.material.optional.upgrade',{q:query.text,adzone_id:config.configured?config.placement:'',page_no:String(query.page),page_size:'20'},ctx),
 getDetails:(refs:OfferRef[],ctx)=>call('taobao.tbk.item.info.upgrade.get',{item_id:refs.slice(0,20).map(r=>r.productId).join(',')},ctx)};
}
