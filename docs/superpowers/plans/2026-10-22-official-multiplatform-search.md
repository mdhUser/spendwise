# 三平台官方搜索与模型决策 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从淘宝、京东、拼多多官方接口并行取数，让模型在可核算、有证据的候选中给出购买方案。

**Architecture:** 在现有 Next.js 服务中加入平台适配器、统一报价、有限轮次搜索和结构化模型决策。服务器掌握金额、候选和链接，模型负责需求、补搜和选择。各平台的失败独立返回，保留历史快照和手工比较。

**Tech Stack:** TypeScript、Next.js App Router、Zod、Prisma/PostgreSQL、Node fetch/crypto、Vitest、Playwright；沿用当前锁定依赖，默认不新增 SDK。

**Spec:** `docs/superpowers/specs/2026-10-22-official-multiplatform-search-design.md`（用户已确认）。

## Global Constraints

- 淘宝、京东、拼多多三个官方平台；品类只包括抽纸、卷纸、洗衣液。
- 默认单次平台请求 8 秒超时；整次流程默认 45 秒上限；截止时取消未完成请求。
- 每次用户请求最多两轮搜索、12 次搜索尝试（含重试）、6 次详情/链接尝试（含重试）、3 次模型调用。
- 首轮至多两个查询；首轮每平台最多保留 20 条候选；每轮每平台至多两条查询；模型结果最多三个方案。
- 价格缓存内部上限 5 分钟；再取优惠到期时间和平台许可缓存期限的最短值；无缓存许可不缓存。
- 沿用现有会话归属与 30 天生命周期；密钥不进入浏览器、模型、Git 或日志。
- 金额使用整数分；未知金额不当作零；单位不擅自换算；会员/首购资格按平台区分。
- 不承诺全网最低价，不实现支付、爬虫、长期监控、第三方取数和跨店组合购物车。
- 未完成三平台真实联调，只能报告已开发连接器及各平台待授权/验证状态。
- 官方协议核验是每个平台连接器的前置条件；真实凭证是该平台联调的前置条件。某平台受阻时继续独立模块，不能编造协议或用模拟成功替代真实接通。

## Review Focus

- API 展示“起价”但未绑定规格：只能展示待确认选项，不能成为确定最低价（Task 2、5）。
- 旧会话有通用 member=true：不迁移成三个平台会员均为 true（Task 2、7）。
- 三个并发请求同时消耗最后一个调用额度：只能放行一个，重试和分页同样计数（Task 4）。
- 详情刷新改变价格或使优惠过期：重算后撤销不成立的理由/排名，不沿用旧节省数字（Task 6）。
- 两个用户搜索相同关键词但地区或资格不同：不能复用私人报价上下文（Task 4、7）。

## 文件与接口约定

新模块全部位于 `src/lib/shopping/`。`contracts.ts` 定义共享类型和 Zod schema；`providers/` 各文件只处理一个平台协议；`transport.ts` 负责固定端点调用；`budget.ts` 管理本次调用上限；`cache.ts` 管理公开缓存；`pricing.ts` 核算；`planner.ts` 和 `decision.ts` 负责模型；`orchestrator.ts` 编排；`repository.ts` 存储。旧 `domain.ts` 保留用于旧快照和手动比较，不能把官方报价强行映射成旧 verified 报价。

共享接口在 Task 2 定义，后续任务沿用：

```ts
type Platform = 'taobao' | 'jd' | 'pdd';
type CallKind = 'search' | 'detail' | 'model';
type PlatformStatus = 'success' | 'empty' | 'unconfigured' | 'unauthorized' |
  'rate_limited' | 'timeout' | 'error';
interface CallBudget { take(kind: CallKind): boolean; remaining(kind: CallKind): number; }
interface SearchContext {
  signal: AbortSignal; deadlineAt: number; budget: CallBudget;
  visitorId: string; now: () => number;
}
interface PlatformProvider {
  platform: Platform;
  capabilities: ProviderCapabilities;
  search(query: SearchQuery, ctx: SearchContext): Promise<ProviderResult>;
  getDetails(refs: OfferRef[], ctx: SearchContext): Promise<ProviderResult>;
  getPurchaseLink?(ref: OfferRef, ctx: SearchContext): Promise<PurchaseLinkResult>;
}
```

`ShoppingNeeds`：旧品类/预算/包数/规格要求，加 `brands:string[]`、`allowStockpile:boolean`、`maxPacks:number|null`、`targetAmount:{value:number;unit:'draw'|'g'|'ml'}|null`、`regionCode:string|null`、按 Platform 的 `{member:boolean|null;firstOrder:boolean|null}`。旧通用资格只能在旧手动比较中使用。

`SearchQuery`：`text`（1–120 字）、`category`、`page`（正整数）；首版不自动翻页，后续分页必须占额度。`OfferRef`：platform、productId、skuId（可空）。`ProviderCapabilities`：search/details/shipping/inventory/purchaseLink 布尔值及 `cacheMaxAgeMs:number|null`；null 表示禁止缓存。

`NormalizedOffer`：ref、shopId（可空）、name、brand（可空）、specs（字段可未知）、priceKind（exact/from/range）、priceFen（可空）、currency（CNY）、shippingFen（可空）、stock（available/unavailable/unknown）、discounts（含资格、有效期、叠加证据）、sourceUrl、fetchedAt、evidenceIds。`Evidence`：id、platform、field、value、sourceUrl、fetchedAt、origin（api/user/model_extracted）；禁止凭证及未经筛选的整段响应。

`ProviderResult`：platform、status、offers、evidence、fetchedAt、sanitizedErrorCode（可空）。`PricedCandidate`：id、offer、packs、knownCostFen、totalFen（可空）、unitPriceFen（可空）、pending、evidenceIds。`PurchaseLinkResult`：url（可空）、status。`Decision`：最多三个 `{candidateId,kind:'lowest_spend'|'lowest_unit'|'best_match',reason,evidenceIds}`。`SearchOutcome`：version=2、needs、platformResults、candidates、decision、mode（model/rules）、warnings。

## Task 1：核实官方协议与配置状态

**Files:** 新建 `docs/PLATFORM-INTEGRATION.md`、`src/lib/shopping/provider-config.ts`、`tests/shopping/provider-config.test.ts`；修改 `.env.example`（不存在则创建）、`docs/OPERATIONS.md`。

**Interfaces:** 输出 `readProviderConfig(env: NodeJS.ProcessEnv): Record<Platform, ProviderConfig>`；ProviderConfig 为 discriminated union，只有所需字段齐全才 configured=true，秘密仅服务端使用。实际字段集由官方协议核验决定，证据写入接入说明。

- [ ] 查阅三个平台最新官方文档，逐个平台记录搜索、详情、链接接口版本/URL、签名原文规则、字段、权限、配额、缓存展示要求及查询日期。公共文档无法核实的接口必须列为该平台开发阻塞，不用第三方样例补成事实。
- [ ] 只检查本地配置键是否存在，不打印值；记录账号是否可用。需要用户授权时索取配置状态和本地配置路径，不要求聊天粘贴密钥。
- [ ] 写失败测试：缺少必要字段时 `expect(config.jd.configured).toBe(false)`；错误诊断中 `expect(JSON.stringify(diagnostics)).not.toContain(secret)`。
- [ ] 运行 `npx vitest run tests/shopping/provider-config.test.ts`，确认因新模块缺失失败。
- [ ] 实现配置状态及仅含空值的配置示例；补充本地配置、权限验证和脱敏操作文档。
- [ ] 运行同一测试并确认通过；执行 `git diff --check`；提交 `feat: add official provider configuration checks`，不添加 `.env`。

## Task 2：统一数据契约与旧需求兼容

**Files:** 新建 `src/lib/shopping/contracts.ts`、`src/lib/shopping/needs.ts`、`tests/shopping/contracts.test.ts`。

**Interfaces:** 定义以上全部共享类型及对应 schema；输出 `upgradeNeeds(legacy: Needs): ShoppingNeeds`、`mergeShoppingNeeds(current: ShoppingNeeds, patch: ShoppingNeedsPatch): ShoppingNeeds`。ProviderConfig 通过 type-only import 引用 Platform，避免运行时循环。

- [ ] 写失败测试：旧 member=true 转换后 `expect(upgraded.eligibility.jd.member).toBeNull()`；未知 shipping 保持 null；from 价格可解析但不是 exact；负价、超长查询、非 CNY、未来采集时间在入库/报价校验时被拒绝。
- [ ] 运行 `npx vitest run tests/shopping/contracts.test.ts`，确认失败。
- [ ] 实现 schema 和兼容函数；默认 allowStockpile=false、maxPacks=null，已有包数语义不变；可选 patch 不填默认值，避免覆盖前轮偏好。
- [ ] 同一测试通过，运行 `npm run typecheck`。
- [ ] 提交 `feat: define evidence-backed shopping contracts`。

## Task 3：三个官方适配器

**Files:** 新建 `src/lib/shopping/transport.ts`、`src/lib/shopping/providers/{taobao,jd,pdd,index}.ts`、`tests/shopping/providers/{taobao,jd,pdd}.test.ts`、`tests/fixtures/platforms/` 下三个平台脱敏协议样本。

**Interfaces:** 输出 `createProviders(config: Record<Platform, ProviderConfig>, deps: {fetch: typeof fetch}): PlatformProvider[]`；各平台遵守 Task 2 的 PlatformProvider。transport 输出 `requestOfficial(input: OfficialRequest, ctx: SearchContext): Promise<unknown>`；OfficialRequest 包括平台、固定允许端点、body/headers、kind=search/detail，不能接受模型提供的地址。

- [ ] 每个平台先写失败测试，用官方文档明确的签名样本或独立固定向量验证签名；断言响应金额、商品标识、起售价、优惠时间映射。测试 `expect(result.status).toBe('unauthorized')`、无库存字段返回 unknown、无运费字段返回 null。
- [ ] 运行 `npx vitest run tests/shopping/providers` 确认失败；实现三个独立适配器，每个平台完成上述测试再进行下一个。
- [ ] 实现固定端点与可取消调用；拒绝未配置凭证发出请求。每次 HTTP 尝试先消耗预算；单次 8 秒上限同时受整体截止约束；最多重试一次，遵守 retry-after 且不能越过截止时间。
- [ ] 增加测试：401 不重试、429 超过截止不等待、取消后无后续请求、签名请求头不进入证据/诊断；商品 URL 校验协议与平台允许域名，不对任意用户 URL 发请求。
- [ ] 同一测试通过，执行 typecheck；每个平台独立提交 `feat: add <platform> official provider`，公共 transport 随首个平台提交。

## Task 4：并行搜索、预算与公开缓存

**Files:** 新建 `src/lib/shopping/{budget,cache,search}.ts`、`tests/shopping/search.test.ts`；复用 `src/lib/security.ts` 的数据库原子配额能力。

**Interfaces:** `createCallBudget(): CallBudget`；`searchRound(queries: SearchQuery[], providers: PlatformProvider[], ctx: SearchContext): Promise<ProviderResult[]>`；`readPublicCache(key:string, now:number): ProviderResult|null`、`writePublicCache(key:string, result:ProviderResult, expiresAt:number):void`。内存缓存最多 500 项，进程重启可丢失；跨实例不要求缓存一致，但用户/全局配额必须数据库原子执行。

- [ ] 写失败测试：先阻塞所有 mock 请求，确认三个 provider 均已启动再释放；单路 timeout 不影响另两路；同平台首轮最多 20 个候选；全部失败不读取演示库。
- [ ] 增加边界测试：剩余一次时并发三个 `take('search')`，`expect(results.filter(Boolean)).toHaveLength(1)`；第 13 次 search、第 7 次 detail、第 4 次 model 均 false；缓存 300001ms 后失效；优惠先到期时提前失效。
- [ ] 运行 `npx vitest run tests/shopping/search.test.ts` 确认失败。
- [ ] 实现 Promise.allSettled 并行与同平台状态汇总；保留部分成功的失败说明。缓存只存不带地区/个人资格的公开原始报价，用户条件每次重新核算；含私人上下文查询禁止进入共享缓存。
- [ ] 增加两用户同关键词不同地区测试，`expect(privateTransportCalls).toBe(2)`；配额耗尽时不发 HTTP。平台配额值按 Task 1 核实结果配置。
- [ ] 同一测试及 typecheck 通过；提交 `feat: orchestrate bounded parallel platform search`。

## Task 5：报价核算与确定性候选排序

**Files:** 新建 `src/lib/shopping/pricing.ts`、`tests/shopping/pricing.test.ts`。

**Interfaces:** `priceOffer(offer: NormalizedOffer, needs: ShoppingNeeds, packs:number, now:number): PricedCandidate|null`；`buildCandidates(offers:NormalizedOffer[], needs:ShoppingNeeds, now:number): PricedCandidate[]`；`rankByRules(candidates:PricedCandidate[], needs:ShoppingNeeds): Decision`。

- [ ] 写失败测试：100 抽 1200 分与 300 抽 2000 分，最低支出选前者、最低单位成本选后者；未知运费 `expect(quote.totalFen).toBeNull()`；from/range 未锁定规格不能产生确定 totalFen；已知成本超预算返回 null。
- [ ] 增加测试：会员资格跨平台不继承、优惠过期/未开始不扣减、无叠加证据不叠券、超库存剔除、g/ml 不换算、无基准不产生节省数字。相同标题但不同规格保持分开。
- [ ] 运行 `npx vitest run tests/shopping/pricing.test.ts` 确认失败。
- [ ] 实现整数核算与规格分组；不囤货时只用请求包数；囤货需显式 maxPacks，否则保留请求包数；有 targetAmount 时用同单位向上取整求满足量，无法满足预算/上限时返回无方案。批量最多 50 包，沿用现有数量上限。
- [ ] 实现三个规则目标、稳定 ID 排序、相同购买方案去重；未知费用结果与确定方案分开展示，不能标为预算内最低价。
- [ ] 同一测试通过；提交 `feat: calculate comparable shopping proposals`。

## Task 6：有限模型规划与证据校验

**Files:** 新建 `src/lib/shopping/{planner,decision,orchestrator,model-client}.ts`、`tests/shopping/decision.test.ts`、`tests/shopping/orchestrator.test.ts`；修改 `src/lib/model.ts` 提取可复用请求/配额逻辑，不破坏旧提取接口。

**Interfaces:** `planSearch(message:string, current:ShoppingNeeds, ctx:SearchContext):Promise<{needs:ShoppingNeeds;queries:SearchQuery[]}>`；`planFollowup(needs:ShoppingNeeds, results:ProviderResult[], ctx:SearchContext):Promise<SearchQuery[]>`；`chooseDecision(needs:ShoppingNeeds, candidates:PricedCandidate[], ctx:SearchContext):Promise<Decision>`；`runShopping(input:{message:string;needs:ShoppingNeeds}, providers:PlatformProvider[], ctx:SearchContext):Promise<SearchOutcome>`。

- [ ] 写失败测试：伪造 candidateId/evidenceId、商品描述中的指令、违反预算的选择、重复购买方案、无效 JSON 均被校验拒绝并使用规则；无模型 key 时仍搜索三个平台。
- [ ] 编排测试断言 `expect(modelCalls).toBeLessThanOrEqual(3)`、`expect(searchRounds).toBeLessThanOrEqual(2)`、45 秒截止后没有新请求；所有失败保持空结果；不足三个合格商品不凑数。
- [ ] 运行 `npx vitest run tests/shopping/decision.test.ts tests/shopping/orchestrator.test.ts` 确认失败。
- [ ] 实现规划调用同时提取需求，避免先调用旧 extractNeeds 再额外增加第四次模型请求；每次 HTTP 模型尝试也计入三次总限额，默认不自动重试。全局预算、用户配额仍生效；无预算则使用需求规则和规则排序。
- [ ] 实现两轮搜索与选择；预留最终校验时间（模型选择阶段最晚在整体第 35 秒结束）。对最终入选商品执行支持的详情刷新及必要转链，共享 6 次详情/链接尝试上限，重算后若改变推荐成立条件则用规则重新排序和生成理由，不追加模型调用。
- [ ] 增加价格从预算内变预算外、刷新失败、优惠到期、未来时间测试：前者剔除，失败显示未复核且不声明确定低价，过期不沿用旧节省金额。即使缓存命中也须检查资格及有效期。
- [ ] 同一测试及 typecheck 通过；提交 `feat: select evidence-backed proposals with bounded model calls`。

## Task 7：持久化与推荐 API

**Files:** 修改 `prisma/schema.prisma`、新增迁移 `prisma/migrations/<timestamp>_shopping_search/migration.sql`、新建 `src/lib/shopping/repository.ts`；修改 `src/app/api/conversations/[id]/recommend/route.ts`、`src/app/api/conversations/[id]/route.ts`、`scripts/cleanup.ts`；新建 `tests/e2e/shopping-api.spec.ts`。

**Interfaces:** `saveSearchOutcome(conversationId:string, outcome:SearchOutcome):Promise<{snapshotId:string;searchRunId:string}>`。SearchRun 归属 Conversation 并级联删除，保存开始/结束时间和三个平台状态；SearchEvidence 归属 SearchRun；Snapshot 增加可空 searchRunId，旧记录保留兼容。报价/决策以 version=2 JSON 保存。

- [ ] 写 API 失败测试：其他用户不能读搜索证据/快照；旧快照仍能读取；删除过期会话级联删除搜索和证据；并发两次请求产生独立快照；旧通用会员不跨平台继承。
- [ ] 先运行新增 Playwright 用例确认因新行为缺失而失败；应用迁移到隔离测试库，不修改用户真实数据作测试。
- [ ] 实现 repository 事务；推荐接口使用官方模式时调用 runShopping，并沿用 origin、owner、rate limit。请求增加 `sourceMode:'official'|'manual'`，默认 official；manual 显式运行旧比较，演示来源清晰标记。官方全失败不得隐式回退演示。
- [ ] 添加需求 schema 与局部补丁兼容；品类或预算仍缺失时返回现有澄清流程，不启动平台搜索、不额外重复调用模型。增加澄清保持包数/偏好的回归用例。证据响应只返回当前用户所属且脱敏字段；日志不记录原始商品长描述和用户敏感上下文。
- [ ] 在隔离库执行迁移、`npm run build`，运行 `npx playwright test tests/e2e/shopping-api.spec.ts` 确认通过；提交 `feat: persist official searches and versioned recommendation snapshots`。

## Task 8：用户界面、联调与最终验收

**Files:** 修改 `src/components/workspace.tsx`、`src/lib/form.ts`、`src/app/globals.css`、`tests/e2e/app.spec.ts`、`tests/model-server.mjs`、`playwright.config.ts`、`tests/e2e/setup.ts`；新增 `src/components/shopping-results.tsx`、`tests/e2e/shopping.spec.ts`、`tests/platform-server.mjs`、`scripts/check-platforms.ts`；更新 `package.json`、`docs/OPERATIONS.md`、`docs/IMPLEMENTATION.md`、`docs/PLATFORM-INTEGRATION.md`。

**Interfaces:** `ShoppingResults({outcome}:{outcome:SearchOutcome})` 展示三路状态与方案；脚本 `npm run platforms:check` 按真实配置执行受限搜索/详情，输出平台、状态、时间及脱敏错误，不输出秘密。测试通过依赖注入或 NODE_ENV=test 的专用 transport 连接本地协议服务器；生产环境禁止配置任意平台 endpoint。

- [ ] 写失败 E2E：三平台成功、单平台失败、全失败、无配置、模型不可用、未知运费、手动模式、旧快照、移动端无横向溢出。断言页面显示平台覆盖、报价时间、待确认条件，绝不把演示候选标为官方。
- [ ] 运行新增用例确认失败；实现按平台的资格表单、囤货上限、用量和区域输入，显示官方与手工模式。请求中只显示“正在搜索并核算”，阶段细节于响应后展示；首版不引入流式进度协议。结果中的金额和链接由服务器数据渲染。
- [ ] 实现与官方协议对应的本地测试服务器和模型场景；原演示 E2E 显式选择 manual 模式。使用单次有截止时间的请求，客户端超时留出服务端保存结果余量；错误后提供重试。
- [ ] 执行 `npm run test`、`npm run lint`、`npm run typecheck`、`npm run build`、`npm run test:e2e`；要求全通过。查看桌面/移动截图，确认条件和失败原因可见且布局正常。
- [ ] 有凭证的平台执行 `npm run platforms:check`；记录三平台搜索和详情的真实脱敏证据及日期。完成至少 20 个跨平台案例核对，记录每个案例的规格/优惠/接口价/可核对结算价/差异原因；无法确认的保持待确认，失败项必须修复或明确未完成，不纳入成功案例。
- [ ] 更新接入说明与实施记录，分别列出“代码验证”“真实接口验证”“结算核对”状态。缺凭证或权限时保留具体阻塞项，代码工作可交付但不能称三平台已接通。
- [ ] 提交 `feat: expose official platform comparisons and integration diagnostics`；执行最终独立代码审查、修复实际问题并重跑受影响测试。按用户选择的执行方式调用对应审查技能。

## 执行方式与外部信息

建议在当前会话由主代理顺序执行，统一维护数据契约，最后进行独立审查；相比逐任务新建代理更少交接。用户也可选择逐任务代理实现与审查。

实施开始后先核验官方接口，并询问三平台开发者应用/接口权限的现有状态。凭证配置和权限申请是外部依赖；不假设账号已存在，不自动接受商务协议或替用户创建平台应用。其余不依赖凭证的模块可继续开发。
