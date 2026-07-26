# v3.8.0

DEVIN_CONNECT 路径的一轮系统性修复。主线是两类**结构性**缺陷:身份中和漏掉了
一整种 content 形态,以及"写在 model 维度的状态对 connect 选号永远不可见"。
另有 PR #230(缓存亲和)合并及其随行加固。

升级无需改配置,行为默认不变(sticky 相关全部在 `STICKY_SESSION_ENABLED` 之后)。

---

## 用户可感知

### 修复 content-policy 拦截:两处身份指纹泄漏

- **parts 数组形态的 system 消息整个绕过中和。** 两个中和调用点都以
  `typeof content === 'string'` 为守卫,而 **Codex `/v1/responses` 的默认形态是
  parts 数组**(`normalizeMessageContent` 返回 `[{type:'text'}]` 且不拍平)。数组
  内容跳过全部 a1–a7 规则,直到 wire 层才被拍平 —— 于是最常见的 Codex 路径上,
  客户端身份指纹原样送达上游。新增 `neutralizeMessageContent()` 同时处理两种形态。
- **型号指纹句被小数点截断。** `You are powered by the model …` 规则用
  `[^\n.]*\.`,在第一个点就停:任何带小数点的型号(`Opus 4.8` / `Sonnet 4.6`)
  都从版本号中间被切断 —— 删掉 `…named Opus 4.`,留下悬空的
  `8. The exact model ID is claude-opus-4-8.`,既破坏 prompt 又把真指纹留在原地。
  而 `The exact model ID is <id>.` 这一句**全仓没有任何规则匹配**,所以连不带
  小数点的 `Opus 5` 也会把 `claude-opus-5` 原样泄漏。两句现已一并中和。
- **ACP vision 改道漏中和。** 该分支在中和步骤之前就 return,身份原样进
  Devin CLI —— 与中和要拦的是同一个指纹,只是换了出口。

### Gemini 流式恢复 usage

`stream_options.include_usage` 改成显式 opt-in 时只更新了 messages / responses,
gemini 被漏掉,而它的翻译层恰恰靠 `chunk.usage` 生成终帧的 `usageMetadata` ——
**此前每个 Gemini 流式响应的 usage 完全缺失**。非流式路径不受影响。

### Responses 流式错误恢复可重试语义

流式错误帧此前只读 `err.type`、忽略 DEVIN_CONNECT 的 `err.code`,导致流中途的
`CAPACITY`(503 可重试)/ `RATE_LIMITED`(429)/ `MODEL_BLOCKED`(402 终局)一律
塌成 `api_error`。现与 messages / gemini 一致,走 `connectErrorToHttp` 解析。

---

## 账号池与成本

### CAPACITY 冷却终于对 connect 生效(#224 同构缺陷第三次)

connect 选号是 `getApiKey(triedKeys, null, callerKey, selector)`,`modelKey` 恒为
`null`,而 `isRateLimitedForModel` 只在 `modelKey` 为真时才查 `_modelRateLimits`
—— 所以 CAPACITY 写在 `reqModelName` 下的 60 秒冷却**结构性不可见**,刚被上游
判定过载的账号在下一轮被立刻重新选中,窗口从未生效。

与 #224 不同,这里**没有**改成 account-wide(该分支的全部意图就是"账号对其它
模型仍完全健康"),而是把冷却写在 connect 实际查询的维度上(selector),并让
候选过滤与 sticky 快路径在两个维度各查一次。

### sticky 缓存亲和(#230)+ 随行加固

- 合并 PR #230:DEVIN_CONNECT 路径此前从不写 sticky 绑定,`STICKY_SESSION_ENABLED=1`
  在 connect 部署上完全空转。上游 prompt cache 按账号隔离、写入约为读取 10 倍
  单价,不固定账号则每轮换号、整段上下文重写。感谢 @wangergou777。
- **failover 不再被绑定困死**:`getApiKey` 的 sticky 快路径此前不检查
  `excludeKeys`,一旦有绑定,dead-token failover 每一跳都被交回同一个死账号,
  最终 401 而健康账号全程闲置,且重复 `reportError` 把该账号连带打成 error。
- **后台 re-login 不再打断亲和**:绑定改按 `account.id` 匹配。re-login 是原地
  换 key(id 不变),而 connect 在每个 `UNAUTHORIZED` 上都会触发 re-login ——
  还可能是共享该账号的**另一个** caller 触发的。上游缓存存在**账号**上而非
  session token 上,换 token 不换账号则缓存仍在。
- **多租户防护**:`bindConnectSticky` 补上 cascade 侧写绑定都有的 per-user-scope
  门禁,避免共享 API key 且无 per-user 信号的部署把全部流量漏斗到单账号。
  单租户自部署用 `WINDSURFAPI_SINGLE_TENANT_CACHE=1` opt-in。
- **绑定表按租户公平配额驱逐**:此前是单一全局 LRU、无 per-caller 配额,一个
  租户不断铸新 callerKey 即可灌满表并挤掉其他所有租户的活绑定。配额单位取
  callerKey 的 API-key 前缀(攻击者无法无限铸造的单位)。顺带把到达上限后热
  路径上的 O(MAX_BINDINGS) 全表扫描降到 O(1),并修正"读取也算使用"的 LRU 语义。
- **可观测**:`GET /dashboard/api/connect-metrics` 新增 `sticky`
  字段(`enabled` / `hits` / `misses` / `creates` / `fallbacks` / `size` …)。
  此前 `getStickyStats()` 全仓零消费者,运营上无法确认绑定是否真的在工作。

### caller-key 采纳 `prompt_cache_key` / `safety_identifier`

Responses 链式客户端用 `previous_response_id` 串轮次,而它每轮都变 → callerKey
每轮重铸,亲和永远攒不起来。现按 `user` > `safety_identifier` >
`prompt_cache_key` 优先级短路取值(OpenAI 对 `user` 的两个正式后继字段,按契约
跨轮稳定),空值仍 fail-closed 不铸 scope。

---

## 安全与运维

- **日志注入**:`model` / `selector` 直接来自请求体却被原样插进 7 处
  DEVIN_CONNECT 日志(含任何垃圾模型名都会走到的拒绝路径)。认证用户可以塞
  换行伪造一条 `[INFO]` 记录,或塞 ANSI 转义改写运维终端。新增
  `safeLogValue()` 在日志边界替换 C0/C1 控制符与 DEL 并限长;正常型号名不变。
- **调试残留**:项目 logger 是 `console.log('[INFO]', ...args)`,格式串槽位被
  级别标签占掉,消息里的 `%s` 永不替换。`[sticky]` 系列日志与 `caller-key.js`
  的每请求 info 级日志都是这类残留(还把 bindingKey 的裸 `\0` 写进了日志流),
  已全部清理;并加了守卫测试防复发。
- **发版门禁**:`npm run test:release` 此前是手维护的 9 文件白名单,新增的回归
  测试不会进入 tag 时的门禁。现改为跑全量(215 文件,进程隔离,约 70 秒)。

---

## 打包

- 新增 macOS 本地单文件打包:`npm run build:exe:macos`(arm64)/
  `build:exe:macos-x64`,以及启动自检 `npm run smoke:exe`。此前本地只有
  `build:exe`(win-x64),macOS 二进制只能靠 CI 产出,开发者在打 tag 前无法验证。
- CI 里 arm64 / x64 两处各 19 行的重复内联 smoke 抽成共用脚本
  `scripts/exe-boot-smoke.mjs`,CI 与本地共用同一套判据。判据是"能否启动并提供
  服务"(`/health` 200 + `/dashboard` 200)—— `pkg` 退出码 0 并不代表二进制可用,
  ESM→CJS 打包或 `pkg.assets` 漏项只在运行时暴露。

---

## 文档

- README(中/英)与 `.env.example` 首次记录 `STICKY_SESSION_*`。该开关自 #133
  起就存在,dashboard 上两个依赖它的实验开关早有完整 UI 文案,主开关本身却零文档。
- `deploy/macos/README.md` 补本机构建与自检步骤。

## 致谢

- @wangergou777 — #230(DEVIN_CONNECT sticky 绑定,付费实测校准)、#217
  (responses-lite `additional_tools`,此前漏记致谢名单)

---

**测试**:2856 → 全量绿。**升级**:`git pull && 重启`,或换用新版二进制 / 镜像。
