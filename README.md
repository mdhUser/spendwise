# SpendWise AI · 帮你省

面向中国大陆的日用品选购助手：从预算和真实需求出发，比较包装、单位价格和优惠条件，帮助用户判断买什么、是否值得买。

首版覆盖 **抽纸、卷纸、洗衣液**，提供适配手机的中文 Web 界面。

## 技术架构与文档

当前采用 **TypeScript 模块化单体**：React 网页与 Next.js API 一起部署，内部划分搜索编排、平台适配、价格核算、模型调用和数据存储。数据库使用 PostgreSQL 16，通过 Prisma 访问。

- **[技术架构与设计图](docs/ARCHITECTURE.md)**：TS 选型理由、系统总览图、推荐时序图、数据库关系图、部署拓扑，以及已实现与待完成的边界。
- [运行与维护](docs/OPERATIONS.md)：本地开发、配置、迁移、配额和备份。
- [官方接口接入核验](docs/PLATFORM-INTEGRATION.md)：三平台状态与真实接入要求。
- [开发与验证记录](docs/IMPLEMENTATION.md)：实现进度、测试和审查结果。

## 官方平台搜索进度

默认进入官方搜索，支持并行来源、有限轮次的模型规划、报价刷新和可追溯记录。淘宝、京东连接器通过协议夹具测试；拼多多尚待官方协议核验。三个平台均未使用真实账号联调，当前缺少完整规格、运费和库存的报价只能展示为待确认商品。手动比较可单独切换。

接入配置与真实验收要求见 [官方接口接入核验](docs/PLATFORM-INTEGRATION.md)，运行 `npm run platforms:check` 可检查本地配置与接入状态。

## 已实现

- 邀请码与匿名会话，同一浏览器恢复历史，可删除，默认保留 30 天。
- 自然语言需求提取与结构化表单；AI 不可用时仍可使用规则比较。
- 最多 3 个方案，展示商品小计、整单运费、确定适用的优惠、单位价及来源时间。
- 整数分计算；未知条件、过期报价、不同规格和质量体积单位明确区分。
- 用户补充链接、规格和所见价格，仅用于自己的选购，不自动抓取链接。
- 推荐快照、用户反馈、CSV 商品导入、限流、清理脚本与数据库备份恢复。

**当前附带 36 条虚构演示商品，不能作为真实购买依据。** 真实模型密钥、核验商品库和国内公开部署仍需配置；没有自动下单、支付或全网最低价承诺。

## 开发

技术栈：Next.js / React / TypeScript / Tailwind CSS / Prisma / PostgreSQL。

完整的安装、模型接入、商品数据格式、邀请码生成、Docker 部署和备份步骤见 [运行与维护](docs/OPERATIONS.md)。本地启动后访问 `http://localhost:3000`。

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run invite:create -- 20
npm run dev
```

执行前需准备 PostgreSQL，并根据 `.env.example` 创建 `.env`。不要提交密钥。

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

浏览器测试使用单独的 `spendwise_test` 数据库和本地模型替身，不访问真实供应商。

## 产品原则

1. 先满足真实需求，不以凑单和促成购买为目标。
2. 不编造商品、价格、优惠或核验来源。
3. 预计节省必须有明确且可比的基准，不冒充实际节省。
4. 仅存储完成任务需要的信息，不自动操作交易。

四周试用目标与实现进度见 [开发记录](docs/IMPLEMENTATION.md)。
