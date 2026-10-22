import {emptyResult, type PlatformProvider} from '../contracts';
import type {Platform,ProviderConfig} from '../provider-config';
import {createTaobao} from './taobao';
export function createProviders(config:Record<Platform,ProviderConfig>,deps:{fetch:typeof fetch;accessApproved?:boolean}):PlatformProvider[]{
 const unavailable=(platform:'jd'|'pdd'):PlatformProvider=>({platform,capabilities:{search:false,details:false,shipping:false,inventory:false,purchaseLink:false,cacheMaxAgeMs:null},
 search:async(_query,ctx)=>emptyResult(platform,config[platform].configured?'error':'unconfigured',ctx.now(),'protocol_unverified'),
 getDetails:async(_refs,ctx)=>emptyResult(platform,'error',ctx.now(),'protocol_unverified')});
 return [createTaobao(config.taobao,deps.fetch,deps.accessApproved??false),unavailable('jd'),unavailable('pdd')];
}
