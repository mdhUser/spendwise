import {readProviderConfig,providerDiagnostics} from '../src/lib/shopping/provider-config';
import {createProviders} from '../src/lib/shopping/providers';
import {createSearchContext} from '../src/lib/shopping/runtime';
import {db} from '../src/lib/db';
async function main(){
 const config=readProviderConfig(process.env);console.log(JSON.stringify({configuration:providerDiagnostics(config)}));
 const providers=createProviders(config,{fetch,accessApproved:process.env.TAOBAO_ACCESS_APPROVED==='true',jdAccessApproved:process.env.JD_ACCESS_APPROVED==='true'});
 const ctx=createSearchContext('operator-check',AbortSignal.timeout(45000));
 for(const provider of providers){
  const result=await provider.search({text:'抽纸',category:'tissue',page:1},ctx);
  const details=result.offers.length&&provider.capabilities.details?await provider.getDetails([result.offers[0].ref],ctx):null;
  console.log(JSON.stringify({platform:provider.platform,search:result.status,details:details?.status??'not_attempted',count:result.offers.length,code:result.sanitizedErrorCode,time:result.fetchedAt}));
 }
}
main().catch(()=>{console.error('Platform diagnostics failed; inspect local database/configuration.');process.exitCode=1;}).finally(()=>db.$disconnect());
