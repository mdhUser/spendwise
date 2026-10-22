import {test,expect,type APIRequestContext} from '@playwright/test';
import {db} from '../../src/lib/db';
test.afterAll(async()=>{await db.$disconnect();});
import {randomUUID} from 'node:crypto';
const origin='http://localhost:3010';
const headers=()=>({origin,'x-real-ip':randomUUID()});
async function start(request:APIRequestContext){expect((await request.post('/api/access',{headers:headers(),data:{code:'test-only-invite'}})).status()).toBe(200);return (await (await request.post('/api/conversations',{headers:headers()})).json()).id as string;}
test('official is default, missing credentials stay visible, snapshot is private and deletable',async({request,playwright})=>{
 const id=await start(request);const response=await request.post(`/api/conversations/${id}/recommend`,{headers:headers(),data:{needs:{category:'tissue',budgetFen:5000}}});
 expect(response.status()).toBe(200);const value=await response.json();expect(value.shopping.version).toBe(2);expect(value.shopping.platformResults.map((r:{status:string})=>r.status)).toEqual(['unconfigured','unconfigured','unconfigured']);expect(value.shopping.candidates).toHaveLength(0);
 const history=await (await request.get(`/api/conversations/${id}`)).json();expect(history.conversation.snapshots[0].payload.version).toBe(2);expect(history.conversation.snapshots[0].searchRunId).toBeTruthy();
 const other=await playwright.request.newContext({baseURL:origin});await start(other);expect((await other.get(`/api/conversations/${id}`)).status()).toBe(404);await other.dispose();
 expect((await request.delete(`/api/conversations/${id}`,{headers:headers()})).status()).toBe(200);expect((await request.get(`/api/conversations/${id}`)).status()).toBe(404);expect(await db.searchRun.count({where:{conversationId:id}})).toBe(0);
});
test('official clarification preserves quantities and does not silently select manual data',async({request})=>{
 const id=await start(request);const first=await (await request.post(`/api/conversations/${id}/recommend`,{headers:headers(),data:{needs:{category:'tissue',quantity:4,minLayers:3}}})).json();expect(first.clarification).toBeTruthy();
 const second=await (await request.post(`/api/conversations/${id}/recommend`,{headers:headers(),data:{needs:{budgetFen:5000}}})).json();expect(second.shopping.needs.quantity).toBe(4);expect(second.shopping.needs.minLayers).toBe(3);expect(second.shopping.candidates).toHaveLength(0);
});

test('rejects malformed official needs as input error',async({request})=>{
 const id=await start(request);expect((await request.post(`/api/conversations/${id}/recommend`,{headers:headers(),data:{needs:{budgetFen:-1}}})).status()).toBe(400);
});
test('official snapshots reject invented feedback choices without server error',async({request})=>{
 const id=await start(request);const search=await (await request.post(`/api/conversations/${id}/recommend`,{headers:headers(),data:{needs:{category:'tissue',budgetFen:5000}}})).json();
 const feedback=await request.post(`/api/conversations/${id}/feedback`,{headers:headers(),data:{snapshotId:search.snapshotId,helpful:true,chosenId:'invented'}});expect(feedback.status()).toBe(400);
});
test('preserves platform-specific eligibility through partial clarification and update',async({request})=>{
 const id=await start(request);
 const first=await request.post(`/api/conversations/${id}/recommend`,{headers:headers(),data:{needs:{category:'tissue',eligibility:{taobao:{firstOrder:true},jd:{member:true}}}}});
 expect(first.status()).toBe(200);expect((await first.json()).clarification).toBeTruthy();
 const response=await request.post(`/api/conversations/${id}/recommend`,{headers:headers(),data:{needs:{budgetFen:5000,eligibility:{taobao:{member:true}}}}});
 expect(response.status()).toBe(200);const value=await response.json();
 expect(value.shopping.needs.eligibility.taobao).toEqual({member:true,firstOrder:true});expect(value.shopping.needs.eligibility.jd).toEqual({member:true,firstOrder:null});
});
