# OAMP/0.1 参考协议（Skill 与仓库共享规范）

实验版本，无兼容性认证。参考类型位于 `src/protocol.ts`，业务校验位于 `src/domain.ts`，签名互通由 TypeScript 与 Python 的实际进程测试覆盖。

## 编码与签名

UTF-8 JSON；规范化只接受 null、布尔、安全整数、合法 Unicode 字符串及 JSON 容器。按 UTF-16 code unit 排序对象键；不接受浮点数、孤立代理码点、未定义字段。金额以货币最小单位整数表示，时间为 Unix 毫秒。此处是受限的 JCS profile，不宣称接受 RFC8785 全部数字。

```json
{
  "version": "oamp/0.1", "kind": "listing.put", "subject": "listing:your-id",
  "principal": "oamp:persistent-root-id", "actor": "oamp:current-signing-key-id",
  "publicKey": "base64-canonical-Ed25519-SPKI", "issuedAt": 1791690000000,
  "nonce": "unique-string", "payload": {}, "id": "sha256-hex", "signature": "base64"
}
```

`actor = 'oamp:' + SHA256(publicKey的base64字符串)`。去掉 id/signature 后，`id = SHA256('oamp/0.1:event:' + canonical(body))`；Ed25519 签署 32 字节 id。可选 `delegation` 为 grant subject ID，纳入签名。未知信封字段和未知业务字段明确拒绝。

节点记录：去掉 publicKey/actor/signature，签署 UTF-8 `oamp/0.1:record:` + canonical(body)。身份相同不等于人类实名；签名证明密钥持有，不证明交易客观真实。

## 事件字段

| kind | subject | 必填 payload / 规则 |
|---|---|---|
| identity.create | 根 actor ID | name, roles；可选 recovery 为恢复 actor ID |
| identity.rotate / recover | 持久主体 ID | newPublicKey；当前控制键或预登记恢复键；旧授权须显式撤销 |
| delegation.grant | 唯一 grant ID | delegate, scopes, expiresAt；不允许操作键再授身份控制权 |
| delegation.revoke | 操作 subject | grant；原主体撤销 |
| listing.put | 商品 ID | revision, previous, title, category, priceMinor, currency, serviceUrl, facts, faq, resources, active |
| policy.publish | 策略 ID | reviewers（至少 8 个）, commitMs, revealMs, appealMs, retentionDays；不可原地修改 |
| quote.offer | 报价 ID | listing, listingVersion, buyer, termsHash, expiresAt, policy, reservation=false |
| trade.accept | 交易 ID | quote, termsHash；特定买方接受；一份报价至多使用一次 |
| trade.fact | 交易 ID | phase, evidence（事件 ID 数组）；仅角色允许的阶段 |
| review.submit | 交易 ID | target, dimension, score（1..5）, text；仅交易对手方 |
| review.amend | 交易 ID | 同上及 previous 当前评价事件 ID；旧记录保留，样本不翻倍 |
| case.open | 案件 ID | trade, claim, evidence；当事人发起 |
| case.response | 案件 ID | statement, evidence；当事人回应 |
| case.assign | 案件 ID | round, seed, reviewers；固定策略协调者；3/5人，排除已知关联及旧面板 |
| case.commit | 案件 ID | round, commitment；承诺期内且未投过 |
| case.reveal | 案件 ID | round, ballot, salt；揭示期内且匹配承诺 |
| case.appeal | 案件 ID | reason；初审揭示结束后、申诉期内 |
| case.finalize | 案件 ID | 空对象；初审需申诉期结束，复审需揭示结束 |
| case.correction.vote | 案件 ID | decision, reason；排除当事人、旧评审及已知直接关系 |
| case.correct | 案件 ID | votes（5 个不同评审的更正事件 ID） |

商品 facts/faq 为字符串键值，resources 为 `{url, relation: manufacturer|seller|reference, digest?}`。URL 只提供引用，不自动下载；serviceUrl 为无凭据、路径/查询为空的 HTTP(S) origin。知识聚合规范化后最多 24,000 字节；标题 200 字符，价格非负。下架采用新 revision 的 active=false。

买方行为：payment_claim、delivery_ack、return_requested、refund_received。卖方行为：shipment_claim、return_received、refund_claim。当前均属当事人声明，不能据此证明真实付款/配送；不声称完整订单或退款执行状态机。

卖方评价维度：description、quality、shipping、service、resolution。买方：payment、handover、return_cooperation、communication。description/quality 需当事人声明收到货；它提高关联条件，不能证明现实收货。

报价在有效期内保持原来商品版本和条款；之后调价不改写旧报价。下架、在线性与库存的最终确认须在接受前由宿主复核，参考交易记录不担保库存或自动履约。

ballot = `{outcome: buyer|seller|shared|insufficient, integrity: none|buyer|seller|both, reason, evidence}`。
承诺：`SHA256(canonical({caseId, round, reviewer, ballot, salt}))`，salt 至少32字符。超过面板一半才形成责任意见；严重诚信意见还须同一结论的多数支持。未达人数/证据不足不自动扣诚信。程序时间采用已签名分配事件时间；历史重放仅限信任来源，不等于全网可验证时间。

## HTTP 接口

默认开发 origin 为 localhost；公网 HTTPS 由部署环境提供。写入事件以签名和领域权限验证，无全平台登录；同步另需运营者 Bearer 令牌。额度默认为每来源 IP 每分钟120请求，最多10,000事件；幂等重发不额外占事件额度。

| 接口 | 返回/预算 |
|---|---|
| GET /.well-known/oamp-node | 签名运营声明：费用、能力、限额、保留与迁移 |
| POST /v1/events | 接收一个事件、签名检查点；仅证明本节点接受 |
| GET /v1/events?cursor=0&limit=100 | 本节点序号日志，1..200/页，检查点 |
| GET /v1/events/:id | 原始公开签名事件 |
| POST /v1/batch | `{ids: [...]}`，最多50个，顺序一致，不存在返回null |
| POST /v1/sync | `{source: configuredOrigin}`，需运营者令牌和公钥固定；最多20页×100事件/调用 |
| GET /v1/search | q、category、cursor、limit（1..50）、fields（逗号分隔）；签名摘要 |
| GET /v1/listings/:id | 当前签名出版及投影、在线性；允许历史查询 |
| GET /v1/knowledge/:id?q=warranty | 结构化 facts/FAQ/资源，modelCalls=0 |
| GET /v1/reputation/:id | 参考多维度结果、证据范围及检查点；totalScore=null |
| GET /v1/cases/:id | 案件程序及当前结论 |
| GET /health?seller=:id&challenge=:nonce | 卖方当前键签名在线证明，有效最多10秒 |
| GET /v1/metrics | 本地事件/缓存/进程内存指标 |

信誉读取视图：省略 view 或 view=legacy 时保留旧字段与数值，新增 counterpartyIndependence=not-verified 和 legacyFieldWarnings。acceptedTrades 只表示已接受约定，independentCounterparties 只统计不同评价者主体，均不能当成真实成交或独立买家。新调用使用 ?view=evidence-v2：viewVersion=evidence/0.2、acceptedAgreements，维度内为 distinctCounterpartyIdentities、maxSamplesFromOneIdentity、counterpartyIndependence=not-verified，不含误导性的旧名称。未知视图返回 BAD_REPUTATION_VIEW；节点签名声明增加 reputationViews。TS/Python Client.reputation(id, 'evidence-v2') 均可选择新视图，旧调用兼容。algorithm=reference/0.1、评分均值、案件处理、证据类别和 totalScore=null 不变，不改变 OAMP/0.1 签名事件或历史。样本集中程度不等于串谋检测；独立验证数量仍为0。

买方授权参考使用私密 buyer-terms/0.1 和既有加盐 termsHash，不添加协议事件字段。完整费用、附加项、续费及取消条款由可信宿主检查并取得人工批准；签名权限不等于预算执行。参考批准仅内存保存、每份约定一次使用，不执行外部付款或自动续费，不证明实际人工认证、库存或履约。真实宿主必须隔离密钥与批准入口，并提供持久同意及外部支付控制。

search fields 可选 id/seller/title/category/priceMinor/currency/version/presence，id/version/presence始终保留。每页最多检查limit个候选，最多4个在线探测同时执行；可能因离线候选返回不足一页，通过cursor继续。覆盖范围始终是本节点可见的活跃商品。

哈希链：初始前值为64个0，`chain=SHA256('oamp:log:'+previous+':'+event.id)`。检查点签署本地seq/chain，顺序必须连续。不同节点有不同本地序号，不比较两节点检查点哈希来判断信誉一致。不提供 Merkle 包含证明、全局排序或隐瞒事件检测保证。

响应错误 `{error: {code, message}}`。权限403、缺失404、冲突409、请求预算429（retry-after=60）、输入过大413、存储额度507。未知版本/字段拒绝；未知升级先协商能力而不是猜测执行。同步遇分叉拒绝冲突事件并停止，已接收的前序事件保留，可幂等重试，运营者需处理冲突来源。
