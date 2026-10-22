import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test('shows all official source states, persists history and switches explicitly to manual',async({page})=>{
 test.setTimeout(20000);
 await page.setExtraHTTPHeaders({'x-real-ip':randomUUID()});await page.goto('/');await page.getByLabel('输入邀请码').fill('test-only-invite');await page.getByRole('button',{name:'开始体验'}).click();
 await expect(page.getByLabel('比较数据来源')).toHaveValue('official');
 await page.getByLabel('商品品类',{exact:true}).selectOption('tissue');await page.getByLabel('总预算（元）').fill('50');await page.getByRole('button',{name:'帮我选一选'}).click();
 const results=page.getByRole('region',{name:'官方搜索结果'});await expect(results).toBeVisible();await expect(results.getByText('未配置',{exact:true})).toHaveCount(3);await expect(results).toContainText('淘宝');await expect(results).toContainText('京东');await expect(results).toContainText('拼多多');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/${test.info().project.name}-official-search.png`,fullPage:true});
 await page.reload();await page.getByRole('navigation',{name:'选购历史'}).getByRole('button').first().click();await expect(page.getByRole('region',{name:'官方搜索结果'})).toBeVisible();
 await page.getByLabel('比较数据来源').selectOption('manual');await page.getByRole('button',{name:'帮我选一选'}).click();await expect(page.getByRole('region',{name:'比较结果'})).toBeVisible();await expect(page.locator('.quote-card')).toHaveCount(3);
});
test('sends only edited eligibility fields alongside a natural-language request',async({page})=>{
 test.setTimeout(15000);
 await page.setExtraHTTPHeaders({'x-real-ip':randomUUID()});await page.goto('/');await page.getByLabel('输入邀请码').fill('test-only-invite');await page.getByRole('button',{name:'开始体验'}).click();
 await page.getByLabel('商品品类',{exact:true}).selectOption('tissue');await page.getByLabel('总预算（元）').fill('50');
 await page.locator('summary').filter({hasText:'规格偏好与优惠资格'}).click();
 await page.getByLabel('淘宝会员优惠资格').selectOption('yes');
 await page.getByPlaceholder('例如：想买家里用的抽纸，预算 50 元，希望至少 3 层。').fill('继续找抽纸');
 const sent=page.waitForRequest(r=>r.url().endsWith('/recommend')&&r.method()==='POST');await page.getByRole('button',{name:'帮我选一选'}).click();
 expect((await sent).postDataJSON().needs.eligibility).toEqual({taobao:{member:true}});
});
