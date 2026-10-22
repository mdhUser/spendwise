# 运行与维护

## 本地开发

需要 Node.js 24、npm 和 PostgreSQL 16（或 Docker）。

```bash
cp .env.example .env
npm ci
# 编辑 .env：设置数据库地址、随机 INVITE_PEPPER（至少 32 字符）
# 若使用 Docker，仅先启动数据库：
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run db:seed
npm run invite:create -- 20
npm run dev
```

浏览器打开 `http://localhost:3000`，输入上一步输出的邀请码。`APP_ORIGIN` 必须与浏览器地址完全一致；本机 HTTP 仅设置 `COOKIE_SECURE=false`。

`db:seed` 仅在 `ALLOW_DEMO_DATA=true` 时运行，创建 36 条虚构商品。不会声称它们已核验，也不会显示可购买链接。清除演示模式请设置 `ALLOW_DEMO_DATA=false` 并重启服务；不能只移除页面提示。

当前开发机器已有单独的 PostgreSQL 数据目录 `.local/postgres`，监听 `127.0.0.1:55432`。其本地 trust 认证仅用于开发；请勿复用到服务器。若停止后需要启动：

```bash
pg_ctl -D .local/postgres -l .local/postgres.log -o '-p 55432 -h 127.0.0.1 -k /tmp' start
```

## 模型

服务端读取 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`。默认适配 OpenAI 兼容的 `/chat/completions` 请求格式，目标供应商为 DeepSeek；真实账号、模型能力与费用仍需用自己的服务配置验证。

无密钥、请求失败、输出无效或触及额度时，保留表单与规则比较。模型只提取明确需求；不允许返回商品、优惠、价格或自由生成的购买理由。解释由可核验规则模板生成。

手动比较流程每次需求提取最多两个供应商请求，每个请求超时 12 秒、输出上限 600 tokens。每次尝试消耗一个保守预算预留单位，失败也计入。默认每日 3000 分预留额度、每次 100 分，最多 30 次请求尝试；每个匿名身份每日最多 20 次提取。**这不是供应商实际账单计量或保证的人民币支出上限**。上线前需核实模型单价与输入长度，另在供应商后台设置支出限制。

## 导入真实商品

`npm run data:import -- path/to/offers.csv`。导入前运营人员必须实际核验商品与报价；程序只验证格式，不执行事实核验。所有行先校验，随后在同一事务中导入；一个错误会阻止整批导入。

CSV 列：

| 列 | 内容 |
| --- | --- |
| id / productId | 稳定报价 ID / 商品 ID |
| name / category | 名称；`tissue`、`toilet`、`detergent` |
| specs | JSON：`amount, unit, pack, layers, widthMm, heightMm, concentrated, fragranceFree` |
| priceFen / shippingFen | 整数分；未知运费留空，包邮为 0 |
| discount | 可空；JSON：`thresholdFen, reductionFen, eligibility` |
| sourceUrl / sourceLabel | HTTP(S) 商品来源与平台名称 |
| verifiedAt / provenance | ISO UTC 核验时间；真实导入必须为 `verified` |

`unit` 为 `draw`、`g` 或 `ml`，必须与品类匹配；`amount` 是整套包装总含量。规格未知使用 JSON `null`。优惠只支持一次整单满减，`eligibility` 为 `all`、`member` 或 `firstOrder`；不支持叠券、跨店满减、阶梯或循环满减。相同方案的运费按整单计一次。

规格 JSON 示例（仅格式示例，不是真实报价）：

```json
{"amount":600,"unit":"draw","pack":"100抽×6包","layers":3,"widthMm":180,"heightMm":130,"concentrated":null,"fragranceFree":true}
```

每周复核一次；超过七天的价格可以作为历史参考展示，但不能产生确定性节省结论。新报价更新不会改写历史推荐快照。用户提交的链接不会由服务器访问，仅保存在该用户的选购记录中。

## 邀请与留存

`npm run invite:create -- 20` 生成 30 天有效、20 次使用的邀请码，仅显示一次明文。数据库仅保存 HMAC；轮换 `INVITE_PEPPER` 会使现有邀请码失效。匿名会话独立使用高熵随机 token，只存 hash。

管理员可在数据库将邀请码 `disabled` 设为 true。会话到期后读取即不可见；`npm run data:cleanup` 物理删除过期记录。Compose 的 cleanup 服务每小时执行一次。服务器需监控该服务退出、数据库磁盘和备份情况。

## 国内服务器部署

1. 准备国内 Linux 云主机、域名、HTTPS 和合法可用的模型服务；完成实际需要的备案及服务配置。
2. 设置强数据库密码（连接字符串中的特殊字符需要 URL 编码）、随机 pepper，`APP_ORIGIN=https://你的域名`、`COOKIE_SECURE=true`、`ALLOW_DEMO_DATA=false`。
3. `docker compose up -d --build`：数据库健康后运行迁移，再启动应用与清理进程。应用与数据库端口仅绑定本机。
4. 配置 Nginx/Caddy 反向代理至 `127.0.0.1:3000`。只有代理覆盖并可信地提供 `X-Real-IP` 时才设置 `TRUST_PROXY=true`，否则所有请求共享保守 IP 限额。
5. 在 build 服务中执行运营脚本：`docker compose run --rm migrate npm run invite:create -- 20`。同理运行数据导入，但先将 CSV 挂载进容器；不把真实数据或密钥提交进仓库。
6. `GET /api/health` 返回 200 才可视为应用连接数据库正常。该检查不代表模型、数据质量或备案完成。

上线前先导入 30–50 个真实核验商品（每类至少 10 个），确认不再显示演示数据。只向明确参与试用的用户提供邀请码；应用没有自动发送邀请的功能。

## 备份与恢复

宿主机安装 PostgreSQL 客户端，并在环境中设置数据库 URL（shell 脚本不自动加载 `.env`）。

```bash
DATABASE_URL='postgresql://…/spendwise' npm run db:backup -- /secure/path/spendwise.dump
RESTORE_DATABASE_URL='postgresql://…/spendwise_restore' npm run db:restore -- /secure/path/spendwise.dump
```

恢复目标必须是另建的空数据库。脚本不使用 `--clean`，不会主动删除已有表。备份包含用户记录，按敏感数据保护，限制权限与保留周期；30 天删除政策也应覆盖备份。

## 测试与试用

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

浏览器测试使用独立的 `spendwise_test` 数据库，先在相同 PostgreSQL 实例中建立它。测试会清空该测试库的用户、邀请码与限流记录，绝不对产品库执行清理。默认使用 macOS Chrome；其他环境设置 `CHROME_PATH`。测试端口为 3010/3011，模型使用本地测试替身，不消耗真实 API 额度。

四周试用目标仍需实际运营完成：10 位用户、30 次有效会话。统计完成推荐的会话数 / 总会话数，以及有帮助反馈 / 有效反馈，记录样本量；用户自报支付额不可当作已验证节省额。首版不把生成的建议次数当作购买次数。

## 官方平台接入

参见 [接入核验](PLATFORM-INTEGRATION.md)。复制 `.env.example` 中对应平台空配置到本地 `.env` 后填值，不要覆盖已有数据库与邀请码配置。未配置/未授权平台会明确报状态，不使用演示商品替代。真实接通须有账号权限及联调证据。

运行 `npm run platforms:check` 查看缺少的配置及实际查询状态；有已批准权限和非零配额时，此命令会进行每平台一次搜索和至多一次详情查询。默认不发送未配置/未批准请求。使用 `TAOBAO_DAILY_LIMIT`、`JD_DAILY_LIMIT` 分别设置不超过账号配额的日调用上限，`SHOPPING_USER_DAILY_LIMIT` 控制单用户尝试数。模型沿用原有全局预算和用户次数，单次购物流程额外限制三次模型调用。

升级前备份数据库，然后执行 `npm run db:migrate`；本次迁移只新增搜索/证据表和可空快照关联，不改写旧记录。界面默认官方搜索，手工/演示比较需显式切换。历史快照兼容旧格式，删除/到期清理会级联移除搜索证据。

官方搜索流程与上述手动比较提取不同：每次至多 3 次模型调用（含规划、补搜、选择），每次输出上限 1200 tokens，共享每日模型额度；平台搜索尝试至多 12 次、详情/转链尝试至多 6 次，失败重试也消耗额度。整体计算截止时间 45 秒，模型阶段提前 10 秒结束，为刷新预留时间。当前重试仅覆盖一次网络/HTTP 5xx 失败，429/权限错误直接返回状态。未确认平台缓存政策前不启用共享缓存。

2026-10-22 本地开发数据库迁移前备份位于 `.local/pre-official-search-20261022.dump`，已成功应用 `202610220001_shopping_search`。该路径是本机开发备份，不是生产备份策略。
