import { z } from 'zod';
import { categorySchema, needsSchema } from '../domain';
export type { Platform } from './provider-config';
import type { Platform } from './provider-config';
export const platforms: Platform[] = ['taobao', 'jd', 'pdd'];
export const platformNames: Record<Platform,string> = {taobao:'淘宝',jd:'京东',pdd:'拼多多'};
const platformSchema = z.enum(['taobao','jd','pdd']);
const eligibility = z.object({member:z.boolean().nullable().default(null),firstOrder:z.boolean().nullable().default(null)}).strict();
export const shoppingNeedsSchema = needsSchema.omit({member:true,firstOrder:true}).extend({
  brands:z.array(z.string().trim().min(1).max(40)).max(5).default([]),
  allowStockpile:z.boolean().default(false), maxPacks:z.number().int().min(1).max(50).nullable().default(null),
  targetAmount:z.object({value:z.number().positive().max(1_000_000),unit:z.enum(['draw','g','ml'])}).strict().nullable().default(null),
  regionCode:z.string().trim().max(80).nullable().default(null),
  eligibility:z.object({taobao:eligibility.default({member:null,firstOrder:null}),jd:eligibility.default({member:null,firstOrder:null}),pdd:eligibility.default({member:null,firstOrder:null})}).strict().default({taobao:{member:null,firstOrder:null},jd:{member:null,firstOrder:null},pdd:{member:null,firstOrder:null}}),
}).strict();
// Zod .partial retains field defaults: unwrap defaults for patches.
export const shoppingNeedsPatchSchema = z.object({
  category:categorySchema, budgetFen:shoppingNeedsSchema.shape.budgetFen,
  quantity:shoppingNeedsSchema.shape.quantity.removeDefault(), minLayers:shoppingNeedsSchema.shape.minLayers.removeDefault(),
  fragranceFree:shoppingNeedsSchema.shape.fragranceFree.removeDefault(), baselineId:shoppingNeedsSchema.shape.baselineId.removeDefault(),
  brands:shoppingNeedsSchema.shape.brands.removeDefault(), allowStockpile:shoppingNeedsSchema.shape.allowStockpile.removeDefault(),
  maxPacks:shoppingNeedsSchema.shape.maxPacks.removeDefault(), targetAmount:shoppingNeedsSchema.shape.targetAmount.removeDefault(),
  regionCode:shoppingNeedsSchema.shape.regionCode.removeDefault(), eligibility:shoppingNeedsSchema.shape.eligibility.removeDefault(),
}).partial().strict();
export type ShoppingNeeds=z.infer<typeof shoppingNeedsSchema>;
export type ShoppingNeedsPatch=z.infer<typeof shoppingNeedsPatchSchema>;
export const searchQuerySchema=z.object({text:z.string().trim().min(1).max(120),category:categorySchema,page:z.number().int().min(1).max(100).default(1)}).strict();
export type SearchQuery=z.infer<typeof searchQuerySchema>;
export const refSchema=z.object({platform:platformSchema,productId:z.string().min(1).max(200),skuId:z.string().min(1).max(200).nullable()}).strict();
export type OfferRef=z.infer<typeof refSchema>;
export const officialUrlSchema=z.string().url().max(4000).refine(s=>{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;});
export const evidenceSchema=z.object({id:z.string().min(1).max(400),platform:platformSchema,field:z.string().max(80),value:z.union([z.string().max(500),z.number(),z.boolean(),z.null()]),sourceUrl:officialUrlSchema,fetchedAt:z.iso.datetime(),origin:z.enum(['api','user','model_extracted'])}).strict();
export type Evidence=z.infer<typeof evidenceSchema>;
const money=z.number().int().min(0).max(1_000_000_000);
export const normalizedOfferSchema=z.object({
  ref:refSchema,shopId:z.string().max(200).nullable(),name:z.string().min(1).max(200),brand:z.string().max(80).nullable(),
  category:categorySchema.nullable(),
  specs:z.object({amount:z.number().positive().max(1_000_000).nullable(),unit:z.enum(['draw','g','ml']).nullable(),pack:z.string().max(200).nullable(),layers:z.number().int().min(1).max(8).nullable(),widthMm:z.number().positive().nullable(),heightMm:z.number().positive().nullable(),concentrated:z.boolean().nullable(),fragranceFree:z.boolean().nullable()}).strict(),
  priceKind:z.enum(['exact','from','range']),priceFen:money.nullable(),currency:z.literal('CNY'),shippingFen:money.nullable(),
  stock:z.enum(['available','unavailable','unknown']),sourceUrl:officialUrlSchema,fetchedAt:z.iso.datetime(),
  discounts:z.array(z.object({id:z.string().max(100),thresholdFen:money,reductionFen:money,eligibility:z.enum(['all','member','firstOrder']),startsAt:z.iso.datetime(),endsAt:z.iso.datetime(),evidenceIds:z.array(z.string()).min(1).max(20)}).strict()).max(20),
  evidenceIds:z.array(z.string().max(400)).min(1).max(30),
}).strict();
export type NormalizedOffer=z.infer<typeof normalizedOfferSchema>;
export type PlatformStatus='success'|'empty'|'unconfigured'|'unauthorized'|'rate_limited'|'timeout'|'error';
export const statusLabels:Record<PlatformStatus,string>={success:'搜索完成',empty:'无匹配商品',unconfigured:'未配置',unauthorized:'权限待确认',rate_limited:'额度受限',timeout:'查询超时',error:'暂不可用'};
export type ProviderResult={platform:Platform;status:PlatformStatus;offers:NormalizedOffer[];evidence:Evidence[];fetchedAt:string;sanitizedErrorCode:string|null;warnings?:string[]};
export type ProviderCapabilities={search:boolean;details:boolean;shipping:boolean;inventory:boolean;purchaseLink:boolean;cacheMaxAgeMs:number|null};
export type CallKind='search'|'detail'|'model';
export interface CallBudget {take(kind:CallKind):boolean;remaining(kind:CallKind):number}
export interface SearchContext {signal:AbortSignal;deadlineAt:number;budget:CallBudget;visitorId:string;now:()=>number;model?:(system:string,payload:unknown,signal:AbortSignal)=>Promise<unknown>;reserve?:(platform:Platform,kind:CallKind)=>Promise<boolean>}
export type PurchaseLinkResult={url:string|null;status:PlatformStatus};
export interface PlatformProvider {platform:Platform;capabilities:ProviderCapabilities;search(query:SearchQuery,ctx:SearchContext):Promise<ProviderResult>;getDetails(refs:OfferRef[],ctx:SearchContext):Promise<ProviderResult>;getPurchaseLink?(ref:OfferRef,ctx:SearchContext):Promise<PurchaseLinkResult>}
export type PricedCandidate={id:string;offer:NormalizedOffer;packs:number;knownCostFen:number;totalFen:number|null;unitPriceFen:number|null;pending:string[];evidenceIds:string[];comparableKey:string|null;refreshed:boolean};
export const decisionSchema=z.array(z.object({candidateId:z.string().max(500),kind:z.enum(['lowest_spend','lowest_unit','best_match']),reason:z.string().min(1).max(350),evidenceIds:z.array(z.string().max(400)).min(1).max(30)}).strict()).max(3);
export type Decision=z.infer<typeof decisionSchema>;
export type SearchOutcome={version:2;needs:ShoppingNeeds;platformResults:ProviderResult[];candidates:PricedCandidate[];decision:Decision;mode:'model'|'rules';warnings:string[];startedAt:string;finishedAt:string};
export function emptyResult(platform:Platform,status:PlatformStatus,now:number,code:string|null=null):ProviderResult{return {platform,status,offers:[],evidence:[],fetchedAt:new Date(now).toISOString(),sanitizedErrorCode:code};}
export function offerKey(ref:OfferRef){return JSON.stringify([ref.platform,ref.productId,ref.skuId]);}
