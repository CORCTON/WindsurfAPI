# v3.9.1

修 v3.9.0 的一批缺陷。**主线是一类反复出现的错误模式:把"不知道"当成"没事"** ——
缺失的流终止帧当成正常结束、未校准的枚举值当成已知语义、缺失的 `finish_reason`
当成良性完成。三处都在信息不足时选了乐观解释,代价都是把坏结果报成好结果。

升级无需改配置。

---

## 用户可感知

### 流式回复中途断开,不再被报成"完成"

上游 socket 在答到一半时断开(缺 Connect-RPC 强制的 end-of-stream 帧)时,
连接层原本把它当成**正常抽干** —— generator 正常返回、`reason=null`,而 `null`
默认落到 `'stop'`。于是被截断的回复以"完整一轮"的身份到达全部四条协议路由。

在 `/v1/responses` 上后果更重一层:那半截回复不但被报成 `response.completed`,
还会**写进 response store 成为下一轮的上下文** —— 一个活得比引发它的那个请求
更久的静默污染,客户端无从发现。

- 连接层现在抛 `STREAM_TRUNCATED`(可重试:与 `ECONNRESET` 同类;流式路径只在
  尚未 emit 任何字节时重放,不会重复内容)。抛出点在 tail flush 之后,已发出的
  字节不受影响
- `/v1/responses` 关成 `incomplete`,理由用独立的 `upstream_incomplete` ——
  断连不是 token 上限,报成 `max_output_tokens` 会让自动续写的客户端去接一轮
  上游根本没写完的话
- 截断的一轮不再进 store
- `length` / `content_filter` / `tool_calls` 的既有语义逐条回归守住
- 新增 `stream_truncated` 计数器(`GET /dashboard/api/connect-metrics`):
  它的尖峰是"上游链路在丢连接"的直接信号

### 付费账号上的正常完成不再被报成截断或拒答

`StopReason` 枚举里只有 `2` 和 `4` 由实测钉住(`4` 是 v3.9.0 那轮用付费账号
校准的)。`3 → length`、`5 → content_filter` 一直是照 protobuf 变体**名字顺序**
猜的 —— 和已被推翻的 `4 → length` 同源。猜错的代价不对称:

- 假 `length` / `content_filter` 把 `/v1/responses` 一轮关成 `response.incomplete`,
  对 Codex 类客户端是整轮硬失败
- `content_filter` 还会在 `/v1/messages` 上映射成 Anthropic
  `stop_reason:'refusal'` —— 把一次正常完成报成**模型拒答**。真拒答看正文就知道,
  假拒答客户端无从恢复

两个值改为 `stop`,截断改用**不依赖未校准整数**的信号:`completion_tokens` 恰好
等于调用方请求的上限时报 `length` —— 与 OpenAI 客户端自己会做的判断一致。刻意
保守(只用等号、且只在调用方显式给了上限时),因为把完整答案报成截断是更有害的
那个方向。已校准 `DEVIN_CONNECT_STOP_REASON_MAP` 的运维方优先级最高。

### special-agent:正常完成不再被误判成拒答

`content_filter` 的判定原本是裸 `includes('content')`,而上游表示**正常完成**的词
恰恰含它:`content_complete`、`no_content`、`contents_delivered`、`end_turn_content`
全部命中(逐条实测)。改为按整词匹配一张明确词表 —— `refusal` / `content_filter` /
`content_policy` / `safety` / `moderation` 等照旧命中,`content_complete` 不再命中。

### `GET` / `DELETE /v1/responses/{id}`

store 里早有完整会话和 `deleteResponse`,只是没接路由 —— 客户端拿着 response id
能续接,却既读不到也删不掉。

作用域与续接查询**完全一致**:只能读自己 callerKey 铸出的 id;不可信的
`:client:<ip+ua>` 身份一律读不到(反代后每个终端用户会塌到同一指纹,认它就等于
把 A 的会话交给 B);别人的 id 一律 404,不泄漏是否存在。路由用显式前缀 + 严格
id 字符集,且本 router 从不 URL 解码 path —— 构造后缀无法夹带穿越段。

---

## 内存与稳定性

### response store 的字节预算在数百租户时形同不存在

`byteShare = MAX_BYTES / tenants` 在规模上会自毁:租户数上到几百时份额降到一次
普通会话之下,于是**每个**租户都判定为超份额、各自只驱逐自己最旧的一条,而只
持有一条的租户根本无可驱逐 —— 循环退出,预算仍然超着。

实测(600 租户 × 一条 20KB 会话,预算 2MB):**5.88 倍超额、零驱逐**。字节上限
恰好在它被写来保护的那个规模上停止存在。加下限后:**1.0 倍、498 次驱逐**。

下限以上的公平份额行为不变,防跨租户 DoS 的原语义保留。

### 传输层故障不再把健康账号打下线

`STREAM_TRUNCATED` 一度落进 `finalizeConnectAccount` 末尾的兜底 `reportError`,
于是**传输层**故障被记进账号错误预算 —— 到上游的网络链路一抖,健康账号被三次
一批地翻成 `status='error'` 并写入持久化退避。正是 `CONTENT_BLOCKED` /
`UPSTREAM_ERROR` 两条豁免当初要消除的失效模式。现在记 health-window 事件
(真病的账号照旧被降权)但不走 errorCount 驱逐。

### 一条无关的 stop-reason 覆盖会关掉整个截断推断

`resolveFinishReason` 判断"该值是否已被 operator 校准"用的是
`Object.hasOwn(合并后的表, n)`,而默认表本身已含 `0..6` —— operator 只要设了
**任意一条**覆盖(哪怕完全无关的 `7=length`),值 2/4 也被当成已校准,usage 推断
被整体跳过。改为只查 operator 实际 pin 过的键。

---

## 工程

本轮每条修复都先有**可执行复现**,再有回归守卫,且守卫都做过**突变验证**(把原始
错误形态重新注入源码,确认对应那条守卫失败)。

新增守卫:`test/responses-stream-truncation.test.js`(12 条)、
`test/devin-connect-finish-callsite.test.js`(6 条,咬住 finish **事件**而非其背后的
纯函数 —— 此前"事件确实调用了 `normalizeConnectUsage`"没有任何守卫,bug 可在调用点
原地复活而全量测试全绿)、`test/responses-retrieve-delete.test.js` +
`test/responses-retrieve-route.test.js`(后者走**真实 HTTP**,覆盖装配层)。

**修复中发现的两条既有测试反模式**,已一并纠正并记入台账:

- **把猜测固化成契约**:两条测试把"照名字顺序猜"的 `3 → length` 写成了断言。
  一旦写进断言,后来的人会当既有结论而非待验证假设。这类测试的注释必须标明
  "这是猜测,证据是 X"
- **mock 不发终止 chunk**:一条考"无名 tool delta"的测试,其 mock 省掉了每个真实
  上游都会发的终止帧 —— 修复后它会变成在考流终止语义,而不是它声称要考的东西

**测试 3001 → 3054**,全量绿(`npm run test:release`,逐文件进程隔离)。

---

**升级**:`git pull && 重启`,或换用新版二进制 / 镜像。
