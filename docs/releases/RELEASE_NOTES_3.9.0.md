# v3.9.0

Responses API 拿到真正的服务端会话状态,账号池少了一条会误伤健康账号的路径,
并首次用**付费账号**把挂了几个月的 wire 校准问题跑通。

本轮的验证方式和以往不同:除单元/回归测试外,用一个真实 agent 循环
(`/v1/responses` + 工具调用 + 多轮链式)端到端压测,并对运行实例做了 30+ 次
鉴权绕过探测。下面每条"实测"都出自这些运行,不是推断。

升级无需改配置。

---

## 用户可感知

### `/v1/responses` 真正支持服务端会话(`previous_response_id`)

此前 `previous_response_id` **在代码里零命中** —— 从未被读取。Responses API 的
核心特性就是服务端持有对话:客户端只发新一轮 + 该 id。于是链式客户端每轮只有
1 条消息到达上游,**模型每轮盲答,既不报错也不告警**,产出通顺但完全没有上下文
的回答,调用方无从发现。

真上游实测:第 1 轮告知数字 `84317`,第 2 轮只发新问题 + `previous_response_id`
→ 模型正确答出 `84317`。修复前必然失败。

- 每条记录存该轮**完整**累积消息,而非父指针 —— 解析是 O(1),且中途被驱逐不会
  静默截断历史(要么全有,要么明确失败)
- 按 `callerKey` 隔离:某租户铸的 id 对其他租户不可解析,否则重放 id 即可读到
  对方对话。失配 fail-closed,统一报 404(不让人探测哪些 id 存在)
- 未知/过期/跨租户 → **404 `response_not_found`**;store 被关 → 400 并提示改发
  完整 `input`。**任何情况下都不静默按新一轮发出**
- 遵守 `store: false` 契约;有界(TTL 1 小时 + 上限 + LRU + 租户公平配额);
  截断时保留开头的 system 消息
- 流式仅在完整完成时提交 —— 中途出错或客户端断连都不入库,避免用客户端从未
  收到的半轮回复污染下一轮

新开关:`RESPONSE_STORE_ENABLED`(默认开)/ `RESPONSE_STORE_TTL_MS` /
`RESPONSE_STORE_MAX` / `RESPONSE_STORE_MAX_MESSAGES`。
观测:`GET /dashboard/api/connect-metrics` → `responseStore`。

### 链式工具循环:客户端重发 tool_calls 不再挂

按契约链式客户端只该回传 `function_call_output`(call 本身已在服务端存储的
response 里),但重发是很自然的写法。重发时上游会看到**同一个 tool_call 出现
两次**,直接拒绝整段对话并返回不透明的 `an internal error occurred (trace ID …)`
—— 调用方无法处理,也**无法与"账号已死"区分**。

真实 agent 循环实测(同一修 bug 任务,claude-sonnet-4.6):

| 模式 | 结果 |
|---|---|
| 全量(不用 `previous_response_id`) | 4 轮完成 |
| 链式 + 只回传 output(严格契约) | 4 轮完成 |
| 链式 + 重发 `function_call` | **turn 2 必挂 503** |

现在按 id 去重服务端已有的 tool_calls;tool 结果、新用户轮、未见过的 call id
一律原样透传,带自有文本的 assistant 消息永不丢弃。修复后同一重发形态 4 轮跑通。

---

## 账号池

### `UPSTREAM_ERROR` 不再把健康账号打下线

`finalizeConnectAccount` 没有 `UPSTREAM_ERROR` 分支,它落到末尾通用的
`reportError` —— 攒 3 次就把账号翻成 `status='error'` 并**持久化**(重启不恢复)。

但该 code 的两个来源都不是账号故障:gRPC `internal` 类(分类器自己的注释写明是
"PERMANENT client mistakes:短指纹、gzip 请求体,每次重试都同样失败"),以及所有
未分类的上游错误。**错在请求,账号无辜** —— 与已经豁免的 `CONTENT_BLOCKED`
完全同族。

实测复现:一个调用方循环发畸形请求,每 3 次打下线一个账号,可把整池逐个清空。
此前未被发现是因为单账号池有 last-account 豁免遮蔽,只有存在健康同伴时才暴露。

改为记 health-window 事件(持续故障照样降权、连续 2 次进 5 分钟自愈隔离),不走
永久驱逐。新增 `upstream_error` 计数到 `/connect-metrics` —— **该值飙升说明调用
方在发坏请求,而不是账号池在坏**。

---

## 安全

- **回显清洗**:`previous_response_id` 是客户端可控值,却被原样插进 404 错误消息
  —— 实测 500 字符的 id 连裸换行与 ANSI 转义一起完整反射。现在过 `safeLogValue`,
  控制符中和并限长。
- **路由层守卫**(新增 11 条):既有四个鉴权套件全部直接 import
  `handleDashboardApi`,证明了鉴权逻辑正确,却从未走过 `server.js` 里决定"哪个
  URL 进哪个 handler"的路由层。而该层有四条承重属性零覆盖:运维路由 `===` 精确
  匹配、`/dashboard/api/` 前缀带尾斜杠、`path` 从不 URL 解码(否则 `%2e%2e` 会在
  路由判定**之后**变成 `..`)、locale 走文件名白名单。任何"顺手"加归一化或把
  `===` 放宽成 `startsWith` 的重构都会静默打开绕过。突变验证:四种真实绕过逐个
  注入,守卫分别以 2/1/1/1 条失败抓到。

**鉴权面探测结论(30+ 次,全部被拦)**:未授权运维端点、用 chat API key 冒充
dashboard 密码、前缀混淆 / `../` / `%2e%2e` / `//` / 大小写 / `/v1/v1/` 重写链、
locale 穿越、SSRF(含 `metadata.google.internal` —— 防护是**先解析再判定**,
故 DNS rebinding 也挡得住)、暴力破解(伪造 XFF 无法绕过桶,锁定期内正确密码
也挡)、12MB 体积(413,`data` 事件即时中断)、2000 层嵌套 JSON(400)。
六个端点与日志文件对上游 token / dashboard 密码 / API key 均**零命中**。

---

## 首次付费 wire 校准(§8 系列解锁)

`§8.0`/`§8.1` 工具链"已就绪、等付费 token"挂了几个月。付费 `teams` 账号终于跑通,
结论已归档进 `docs/DEVIN-CONNECT-CUTOVER.md`:

- **§8.1 付费可达性已解答**:`tier=teams paid=true`,**13/13 selector 可达**
  (opus-4-6 ×4 / sonnet-4-6 ×4 / gpt-5.2 ×5)
- **缓存计量:标签校准正确,GPT/Claude 差异是真的**。同一 ~2.3k token 前缀每族
  连发三次:Claude 首轮 `cache_creation=2268`、后续 `cached_tokens=2262`(写后读,
  与 `DEFAULT_BILLING_TAGS` 假设完全一致);GPT 报 `cached_tokens=1280` 但**从不报**
  `cache_creation`。这证实了 `devin-connect.js` 里"GPT 系不带 tag 4"的注释,同时说明
  **PR #230 成本表里 gpt 出现 tag4 的那一行在此无法复现** —— 该 PR 的机制结论
  (轮换账号要重付上下文)仍由 Claude 那一行成立,但其 GPT 数字不应作为校准依据
- **付费账号上免费模型依然被墙**:`swe-1-6-slow` 仍 `UPSTREAM_INTERNAL` 而付费
  selector 全正常 —— 不能把它读成"账号已死"
- `actual_model_uid` 第二次独立确认(`#7.9`),另 dump 到 `#7.7` 上游 message id、
  `#28` "Token Usage" 块、`#2.x` 为时间戳而非计费(均未接线,留待刻意 pin)
- **校准器别名陷阱已修**:`streamChat` 收原始 selector,传 `claude-sonnet-4.6`
  会返回 `UPSTREAM_INTERNAL` —— 与 dead token / 账号被墙**无法区分**,而这恰是
  付费校准要诊断的状态。现在自动解析别名

---

## 防复发守卫

本轮暴露的两类缺陷是**结构性、会重复发生**的,已变成 CI 失败:

- **`modelKey=null` 陷阱(已三次)**:connect 选号恒传 `modelKey=null`,任何写在
  model 维度的状态对它结构性不可见(#224 的 RATE_LIMITED、#230 的绑定键、
  v3.8.0 的 CAPACITY)。守卫断言的是**不变式** —— connect 请求能造成的每种冷却
  都必须能关住 connect 查询 —— 而非某一行,所以第四次以不同形式复发也会被抓
- **修复只覆盖部分路由(已两次)**:#188 的 sticky 漏了 connect、O1 的
  `include_usage` 漏了 gemini。守卫逐路由核对 usage 帧、`stream_options` 合并、
  错误分类,并有一条元守卫:新增的流式委托路由若不登记进列表,直接失败

两个守卫均做过突变验证(把历史 bug 重新注入,分别以 2 条 / 1 条失败抓到)。

---

## 其他

- 图片/二进制解码链审计通过,无需改动:PNG 13/13、JPEG 16/16 畸形输入全部可控
  抛出、零挂死;200 张畸形图 6ms(无 DoS);0×0 退化图被 `shrinkPixels` 正确拦下
- 计费记账四条路径(非流式 chat / 流式 chat / responses / messages)实测均正确
- 修掉一个字面 NUL 字节,它曾让一个测试文件被 git 归类为 binary(diff 不可读)

---

**测试**:2923 → 全量绿(222 文件,进程隔离门禁)。**升级**:`git pull && 重启`,
或换用新版二进制 / 镜像。
