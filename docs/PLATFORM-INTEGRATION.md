# 官方接口接入核验

核验日期：2026-10-22。三个平台本地均无凭证，模型密钥也未配置。当前没有真实取数、权限验证或结算核对成功记录。

| 平台 | 协议核验 | 账号/权限 | 实际接通 |
|---|---|---|---|
| 淘宝 | 官方升级版搜索、详情及 TOP MD5 协议可读 | 未配置，未验证 | 否 |
| 京东 | 官方资料确认联盟搜索能力；当前完整参数/签名/返回契约未核实 | 未配置，未验证 | 否 |
| 拼多多 | 当前官方文档访问被浏览器安全策略阻止，未绕过 | 未配置，未验证 | 否 |

## 淘宝官方依据

- 搜索：https://developer.alibaba.com/docs/api.htm?apiId=64759
- 详情：https://developer.alibaba.com/docs/api.htm?apiId=64763
- 签名：https://developer.alibaba.com/docs/doc.htm?articleId=122426&docType=1&treeId=829
- 权限：https://developer.alibaba.com/docs/doc.htm?articleId=118971&docType=1&treeId=713 （页面较旧，账号后台仍须确认）

网关为 https://eco.taobao.com/router/rest，协议 v=2.0，format=json，sign_method=md5；参数按键排序，拼接键值并在首尾加应用 secret，UTF-8 MD5 转大写。timestamp 使用 GMT+8。调用 taobao.tbk.dg.material.optional.upgrade 搜索，使用 q、adzone_id、page_no、page_size；调用 taobao.tbk.item.info.upgrade.get 查详情，item_id 为平台返回的字符串，不把新版 ID 当数字。消费比价场景 biz_scene_id=2，需要实际账号权限验证。

搜索商品位于 result_list.map_data，价格在 price_promotion_info，基础信息在 item_basic_info；推广链接使用平台返回值。zk_final_price 是销售价，final_promotion_price 是预估价格；未知具体 SKU、运费、规格和个人优惠不能推断为确定到手价。页面的“不需要授权”指用户 session，并不等于不需要应用权限。

缓存和证据留存许可、账号实际配额、消费者比价场景权限尚未取得：默认不缓存、不启用实时调用，需操作者核实后设置 TAOBAO_ACCESS_APPROVED=true。技术保护上限不是平台授予配额，必须按账号实际额度设置。

## 京东与拼多多阻塞项

京东官方入口：https://jos.jd.com/jdunion ，确认 jd.union.open.goods.query 可查询商品和优惠券；完整当前协议未确认前不发送猜测请求。

拼多多当前官方文档被浏览器安全策略阻止。2021 年官方 PDF 只能作为历史背景，不能证明当前协议。需要用户在自己的开发者后台导出当前官方文档（包括签名、搜索、详情、错误码、权限和缓存/留存条件），之后才实现该平台线协议。

JD_SITE_ID、PDD_PID 是预留配置，实际必填集合须以核实的接口为准；配置齐全不等于已授权或已实现。

## 配置与申请

在各平台官方开发者/联盟后台完成应用申请及需要的商品查询权限；记录可用接口、应用类型、推广位、配额和数据展示/留存要求。申请/接受协议由账号持有人完成。在项目本地 .env 填值，切勿提交或在聊天粘贴密钥；重启服务后再检测。诊断只返回状态及缺少的变量名。

验收分别记录：协议测试、真实搜索和详情、20 个跨平台案例的结算核对。任一项未完成就保留“待验证”，不把模拟协议测试算作已接通。
