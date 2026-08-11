# WindsurfAPI 记账本 v2 · 精细账 · 2026-06-06 ~ 06-30（devin-connect 桥诞生月）

- 范围：89 commits（6-06 23:05 至 6-30 16:59，全为 dwgx 单人提交）
- 数据：全部 hash / 时间戳 / message 从 git 仓库逐条核验；深挖条目（标 ★）读至 diff 级
- 边界说明：6-06 00:38~22:48 另有 17 个 native-bridge 收尾 commit（fc57ae1 等），
  属上一时间片 slice-5-bridge，不计入本片；本片从 v2.0.137 发布闸 452871c 起算
- 凭证：正文不出现任何 token / 密码 / 邮箱值（涉及处用「<凭证>」占位）
- 术语：本片内「Devin」与「Windsurf」为同一账户体系（Windsurf 是 Devin 的消费前端）

主线一句话：**6-06/07 承接 native bridge 爆发潮收尾（v2.0.137→144）→ 中旬安全加固与
治理 → 6-22/23 目录扩展 + LS 镜像稳定化 → 6-29 审计修复潮 + 桥前夜 → 6-30 一天
27 个 commit 从零长出纯 HTTP devin-connect 桥并当天修掉 10+ 自伤。**

---

# 第一部分 · 逐条 commit 账（89 条，时间正序）

## 6-06（1 条）· 上片收尾

| # | hash | 账 |
|---|---|---|
| 1 | 452871c | ci：发布测试闸改有界（`--test-force-exit` 系，v2.0.137 收尾）。5 文件 12+4 |

## 6-07（13 条）· 发布潮尾段

| # | hash | 账 |
|---|---|---|
| 2 | 1335f89 | chore(release)：稳定 v2.0.138 —— cache 硬化 68 行、run-test-shard 脚本落地、dashboard 改版（18 文件 448+41） |
| 3 | 8a53cc8 | ci：稳定全量测试分片（分片间抖动治理，6 文件 45+4） |
| 4 | 736eefb | ★ fix：surface 真实上游冷却 —— 上片引入的「假冷却」被换成真实 cooldown（5 文件 162+15）。见问题链 10 |
| 5 | 81f6156 | fix：加工具路由诊断（v2.0.141，native-bridge-smoke 覆盖，9 文件 361+3） |
| 6 | 72e1b9c | fix：清理部分流错误尾巴（v2.0.142，4 文件 175+15）。见问题链 10 |
| 7 | c247c33 | docs：issue 审计路线图（4 文件 260 行） |
| 8 | ed4d85f | docs：agent handoff 指南（3 文件 178+3） |
| 9 | 3a8d472 | fix：#177/#178/#183/#190 诊断与 canary 覆盖加固（7 文件 332+18）：SWE-1.6 边界 /health?verbose 暴露限制、媒体拒绝单测；WebFetch 硬判定 completed_web_document；native bridge 每请求 BridgeResult 诊断 |
| 10 | 6c0ad43 | chore(release)：v2.0.143（诊断 + canary 硬化发布） |
| 11 | d495395 | docs：handoff 更新至 v2.0.143 |
| 12 | 3945c51 | ★ fix：#183 WebFetch 完成步误标（9 文件 330+17，v2.0.144）。见问题链 6 |
| 13 | 562f98c | docs：handoff 更新至 v2.0.144 |
| 14 | 5324178 | docs：刷新 handoff 发布 SHA |

## 6-08（2 条）· 日志安全

| # | hash | 账 |
|---|---|---|
| 15 | e282bf9 | fix：敏感账户日志引用 hash 化（log-safety.js，6 文件 119+45） |
| 16 | e785d21 | docs：更新安全披露邮箱（SECURITY.md） |

## 6-10（2 条）· 安全加固

| # | hash | 账 |
|---|---|---|
| 17 | fe6d9b9 | docs：协议 RE 完成计划 + lab-box runbook（PROTOCOL_RE_PLAN.md，93 行） |
| 18 | 185cfd9 | ★ fix：内部安全审计纵深 v2.0.145（7 文件 150+2）——畸形 proto 根 buffer 返回 [] 而非抛错、单坏 step 跳过而非整段丢弃、compose-label 校验、NLU 正则 200KB 上限。见问题链 10 |

## 6-13（4 条）· 仓库治理

| # | hash | 账 |
|---|---|---|
| 19 | edd5896 | docs：README 澄清仓库安全边界 |
| 20 | 7e69392 | chore：issue 模板 bug_report.yml |
| 21 | 15cbc1d | chore：issue 模板 feature_request.yml |
| 22 | 710c327 | chore：issue 模板 config.yml |

## 6-17/18（2 条）

| # | hash | 账 |
|---|---|---|
| 23 | 88d6cca | docs：公共维护文档打磨（6 文件 32+23） |
| 24 | 8e352a9 | chore：架构审查（docs/review.html 417 行）+ 代理校验硬化（账户添加代理顺序验证，6 文件 580+22） |

## 6-22/23（12 条）· 目录扩展 + LS 镜像稳定化

| # | hash | 账 |
|---|---|---|
| 25 | ef1cf6f | feat：GLM 5.2 + Kimi K2.7 目录条目（PR #201，6 文件 53+11） |
| 26 | 6ef8481 | fix：dashboard API 畸形 JSON 返回 400（PR #195，1 行） |
| 27 | b746f4d | fix：NLU 不从工具清单恢复 tool-call（2 文件 15+2） |
| 28 | f4df9fd | fix：显示 LS fallback 下载进度 |
| 29 | 0a1ae91 | fix：OAuth 受阻时引导到 token 兜底登录（5 文件 43+7） |
| 30 | 5ee7ff2 | docs：收紧 issue triage 与贡献者致谢治理（10 文件 174+71） |
| 31 | 5ef0ed1 | docs：首页贡献者改从共享数据加载（sync-docs-contributors.mjs，7 文件 439+103） |
| 32 | a69d948 | fix：改用维护版 LS 发布镜像（3 文件 14+5）。见问题链 10 |
| 33 | d704d1a | docs：公开 LS 发布镜像（README/README.en/index.html） |
| 34 | ec74d3f | fix：校验维护镜像下载 —— checksum 验证（3 文件 68+8） |
| 35 | 1509992 | fix：支持 POSIX awk checksum 解析 |
| 36 | 2c447c9 | fix：容忍 CRLF checksum 文件（1 行） |

## 6-29（26 条）· 审计修复潮 + 桥前夜

| # | hash | 账 |
|---|---|---|
| 37 | 7ee509a | fix：#204 glm-5.2 走 gpt_native tool dialect（glm47 XML 标记被忽略答散文，1 文件 10+1） |
| 38 | 46b9497 | test：测试运行与本地运行时配置隔离（test/setup-env.mjs，临时 DATA_DIR + 跳过 .env） |
| 39 | 97ebad9 | fix：compat 层保留 falsy tool 值（`\|\|` → `??`，0/false/空串不再被吞；Responses 流式 translator 缺 name 时合成 'unknown' 防崩） |
| 40 | 441baf9 | perf：账户列表统计单遍计算（3 次 filter 折叠为 1 次循环） |
| 41 | 0dc3e23 | test：锁定 #204 dialect 路由（含 FORCE_TOOL_DIALECT 覆盖） |
| 42 | 6adec7b | feat：dashboard 对目录外模型回退默认模型（重做 #198，死代码路径补活，7 文件 164+9） |
| 43 | b9031b4 | feat：按线上实证加 claude-opus-4-8-medium（GetCascadeModelConfigs 实dump，credit 25 / 1M ctx / 128k out） |
| 44 | 7fd275a | ★ fix：probe-pending 误标 —— expired 账户被当新账户送去无限 re-probe（2 文件 60+1）。见问题链 2 |
| 45 | 21393b9 | ★ fix：计费 canary 扫掠改 opt-in —— 探针烧账户事故（4 文件 91+9）。见问题链 2 |
| 46 | e57401e | fix：加固 glm-5.2 dialect 守卫（补 dotted SKU 匹配）+ 修正 opus-4.8-thinking 误导性注释 |
| 47 | 789137e | ★ fix：Responses 工具调用回合是 'completed' 不是 'incomplete'（Codex 式 agent 循环 key 住 status；流式/非流式此前互相矛盾） |
| 48 | 0e1cbd9 | ★ fix：auth 双 bug —— tierManual 被自动写覆盖 + 无时间窗错误计数永久禁号（3 文件 90+9）。见问题链 4 |
| 49 | 4296675 | ★ fix：PDF ReDoS + 停记原始 body.user + key cache 补 stop/seed（5 文件 52+3）。见问题链 7 |
| 50 | 7b765b0 | fix：进程崩溃网（unhandledRejection/uncaughtException）+ 关停 await LS 退出（F-1/F-2，孤儿端口竞态） |
| 51 | c6990d5 | fix：native-bridge-stats 客户端可控 tool/kind maps 设上限（默认 200 key，溢出进 (other) 桶） |
| 52 | 5dace50 | docs：致谢台账补 6 位已合并 PR 贡献者（#64/#163/#204/#90/#88/#89） |
| 53 | 36c4056 | feat：devin-acp 拆分 thought/message chunk + 可选 reasoning 透传（DEVIN_ACP_EXPOSE_REASONING，5 文件 799+12） |
| 54 | 5062eb5 | ★ feat：app.devin.ai REST/SSE 适配器脚手架（escape hatch B，3 文件 574 行）——Bearer + x-cog-org-id 头、读端点；写端点 501 存根「不猜 schema」 |
| 55 | f7ceee9 | feat：cascade 存活探针脚本（默认仅零计费 /health；--chat 才计费） |
| 56 | cc3a912 | refactor：后端选择集中进 backend-router（selectBackend() 纯函数 + BACKEND 常量，9 用例锁定旧行为） |
| 57 | 1ae8e77 | ★ feat：createSession 用已验证 v3 REST 端点实现（POST api.devin.ai/v3/organizations/{org}/sessions，7 字段白名单；curl+FastAPI 422 探测定 schema，零 MITM） |
| 58 | e373642 | ★ feat：special-agent 真实 ACP 流式（runDevinAcpProcess onChunk 边到边转发；此前是假流式：整段缓冲后切片） |
| 59 | b2ed9e6 | feat：多轮提示对话式 framing（'Conversation so far:' 结构，实测跨轮记忆 7×6=42） |
| 60 | 7133715 | test：锁定 /v1/messages 真实 ACP 流式（Anthropic 事件序全链验证） |
| 61 | 0d5a97d | test：smoke 覆盖流式/多轮/Anthropic（6 阶段全绿） |
| 62 | ad00989 | fix：smoke 基线 chat 挂 REAL_CALLS 闸（'零计费' 运行此前仍发 1 次真实请求，且禁用后端时 Windows libuv UV_HANDLE_CLOSING 崩溃） |

## 6-30（27 条）· devin-connect 桥 24 小时诞生

| # | hash | 账 |
|---|---|---|
| 63 | 22f32b2 | ★ feat：账户池自愈（3 文件 144+1）——AP-BUG-1 错误状态持久化、AP-RISK-1 半开恢复、AP-RISK-4 Firebase 刷新连击降级。见问题链 8 |
| 64 | b7c87b6 | ★ feat：special-agent 生存硬化（3 文件 524+24）——真流式转发、真实 usage/finish_reason、GAP-ACP-01 slot 泄漏修复（干净退出不再卡死并发槽） |
| 65 | 7b816ee | ★ feat：DEVIN_ONLY kill-switch（4 文件 162+1）——Cascade 退役开关，全模型强制走 Devin ACP；默认 OFF 可回滚；已知缺口（模型名仅作 prompt 提示）记入注释 |
| 66 | f25950c | ★★ feat：纯 HTTP GetChatMessage 客户端（2 文件 641 行，devin-connect.js 首日 405 行）。见问题链 1 |
| 67 | 6e83477 | ★ feat：OpenAI ChatCompletion 适配器（4 文件 424 行）——非流式 + SSE 帧（role/reasoning_content/content/finish/usage）+ resolveConnectSelector（27 项捕获目录，未映射降级免费 swe-1-6-slow） |
| 68 | 2c54e35 | ★ feat：router 接入 DEVIN_CONNECT（3 文件 133+2）——最高优先级 kill-switch（先于 DEVIN_ONLY 与模型路由），chat 短路先于 Cascade 'Unsupported model' 门，流头 no-store 按 #97 |
| 69 | 67de6d5 | ★ feat：上游错误分类 + 有界重试（6 文件 258+15）——classifyUpstreamError：MODEL_BLOCKED/UNAUTHORIZED/RATE_LIMITED；错误体缓冲分类不再喂帧解析器；非流式指数退避；错误→HTTP 映射（402/401/429/504/502） |
| 70 | 294393c | ★ feat：会话 token 从共享账户池取 + 计费记账（2 文件 117+1）——acquireConnectAccount + finalizeConnectAccount 全出口路径配对 reportSuccess/Error/markRateLimited + recordRequest；空池回落 env token |
| 71 | fba3bd4 | feat：abort signal 上溯上游 + 取消不罚账户（3 文件 49+1）——AbortError 视为客户端取消，释放+记账但不 reportError |
| 72 | c0585d2 | ★ feat：live catalog + entitlement probe（2 文件 307 行）——GetCliModelConfigs/GetUserStatus 两个零计费只读 RPC；selector 即请求 model 字段（#21），catalog 是 SELECTOR_MAP 的唯一真源 |
| 73 | 710a4c1 | test：e2e smoke 零计费 preflight + #15 闸（3 文件 217 行，9 阶段） |
| 74 | 0ecf623 | ★ feat：tool/function calling 文本仿真（4 文件 223+8）——normalizeMessagesForCascade 注入工具协议前导；非流式 parseToolCallsFromText、流式 ToolCallStreamParser；实测 get_weather 返回 tool_calls |
| 75 | a84acc5 | feat：vision 铺垫（5 文件 298+4）——gated 图像编码器（DEVIN_CONNECT_IMAGE_TAG 未设=逐字节文本行为）+ 标定 harness（1x1 红点分类 hit/ignored/rejected） |
| 76 | a8091d5 | ★ fix：catalog alias 漂移（4 文件 176 行）——要 GPT 拿 SWE。见问题链 5 |
| 77 | 1e97985 | ★ fix：MODEL_BLOCKED tier 墙不罚账户健康预算（2 文件 35+1）——免费账户被问 claude-* 不该被 3-strike 逐出轮换。见问题链 8 |
| 78 | d7c3182 | ★ feat：加密凭证库（3 文件 262 行）——AES-256-GCM + scrypt 派生主键，明文永不上盘，每写随机 salt/iv，错键/tamper fail-closed。见问题链 8 |
| 79 | 59164f3 | ★ feat：auto re-login 复活死 token（3 文件 299+2，P0 SPOF）——Auth1 邮箱/密码重登换新 session_id；60s 冷却 + inflight 合并防风暴。见问题链 8 |
| 80 | 8828b5a | ★ feat：re-login 成功后透明重放一次（2 文件 94+5）——非流式重试；流式 emitted 守卫（已出字节则只报错不重放） |
| 81 | 8c40123 | ★ feat：零计费存活探针 + 预防性恢复（3 文件 203 行）——GetUserStatus 200/401/403 判活；启动扫掠可选（DEVIN_CONNECT_LIVENESS_PROBE=1，10 分钟间隔） |
| 82 | 6f2e274 | test：smoke 覆盖 liveness + 凭证库 + recovery 配置链（Stage 0c，零计费） |
| 83 | bb9a273 | ★ feat：跨账户 failover（2 文件 389+57）——同账户 re-login 救不活就换下一个健康账户；triedKeys 防重选；流式只在 emitted=false 时 hop；DEVIN_CONNECT_FAILOVER_MAX 上限（默认 2） |
| 84 | 27d31de | ★ fix：cutover 日双 P0（2 文件 121+5）。见问题链 3 |
| 85 | bca363c | docs：生产 cutover runbook + .env.example 全覆盖（DEVIN_CONNECT-CUTOVER.md，2 文件 163 行） |
| 86 | 1a3826d | ★ fix：quota/tier 误分类 + 收紧重试（4 文件 97+12）——dry-well 账户不再被无限选中 402；429/'internal' 移出重试码。见问题链 8 |
| 87 | e279fe9 | ★ fix：绝对墙钟 deadline 治挂起流（3 文件 106+24）——socket idle 计时器按字节重置，trickling 挂起流永久钉死 slot；加 DEVIN_CONNECT_TIMEOUT_MS 绝对上限（默认 10 分钟）+ unref 定时器 + 全出口清理 |
| 88 | 060f3f9 | ★ fix：流式 pre-emit 瞬时错误重放一次（2 文件 73 行，P1 #34）——非流式有重试而流式没有，一次 hiccup 变硬错误帧；!emitted 门控防重复 |
| 89 | 7f8d403 | ★ feat：recovery 可观测性 + 轮转 cred-key 告警（7 文件 261+7，P2 #36/#37）——devin-connect-metrics.js 生命周期计数器（relogin_ok/fail、failover_hops、dead_tokens…）+ GET /connect-metrics；GCM 解密失败全局告警（错键=全 fleet 静默失效） |

---

# 第二部分 · ★ 逻辑级深挖（24 条，按 commit）

> 每条给出：机制、根因/决策、关键代码事实。hash 均为真实 7 位短哈希。

## f25950c —— 桥的原子核：纯 HTTP GetChatMessage 客户端

- 直连 `server.codeium.com`，端点 `exa.api_server_pb.ApiServerService/GetChatMessage`，Connect-RPC 单信封多帧流式响应。
- **两个决定全流程成败的非显然事实（注释原话，frame 捕获校准）**：
  1. AUTH 头是 session token **加倍 dash-拼接**：`Basic <token>-<token>`；单个 token 被拒 `permission_denied`。而 proto 体里 ClientMetadata.session_token（字段 #3）保持**单份**。
  2. ClientMetadata fingerprint（字段 #31）必须 **732 位 hex（366 字节）**，短值触发服务器端 "internal" 错误；值本身不绑定会话——每次请求随机生成即可（顺带反指纹）。
- 帧解码：`decodeFrame()` 把 GetChatMessageResponse 拆出原生分离的 #3 content / #9 reasoning / #5 finish / #7 usage——这是后续 reasoning 透传与真实 usage 的地基。
- 请求侧：system 拼进字段 #2 system_prompt，其余进 repeated ChatMessage #3；CompletionConfig（#8）用 f64le 写 temp/top_p（wire type 1）。
- 零 npm 依赖；import 时不联网。免费账户 swe-1-6-slow 实测通过。

## 6e83477 —— 适配层：OpenAI ChatCompletion 适配器 + selector 解析

- `devin-connect-openai.js`：非流式 `toChatCompletion` + 流式 `streamChatCompletion`（chat.completion.chunk SSE），与 Cascade 路径逐字段对齐（role / reasoning_content / content / finish / usage 帧）。
- `devin-connect-models.js`：`resolveConnectSelector` 把 OpenAI 风格模型名映射到 27 项捕获目录的 selector（proto #21）；**未映射名静默降级免费 swe-1-6-slow**——这个「优雅降级」策略四小时后（a8091d5）被证实会「要 GPT 拿 SWE」。

## 2c54e35 —— 路由接入：kill-switch 最高优先

- backend-router 新增 BACKEND.DEVIN_CONNECT + `DEVIN_CONNECT=1` 判定，**优先于 DEVIN_ONLY 和全部模型路由**。
- chat.js 在 Cascade 'Unsupported model' 门**之前**短路——connect selector（swe-1-6-slow）是独立命名空间，无 Cascade 目录条目，不进那扇门。
- 流头 no-store + X-Accel-Buffering:no（#97）。免费账户端到端验证通过。

## 67de6d5 —— 错误语义化：从「裸 502」到五类错误

- `classifyUpstreamError`：非 200 响应体先缓冲再分类（此前直接喂帧解析器 → 解析错误掩盖真实原因）。
- 分类：MODEL_BLOCKED（免费墙 /upgrade）/ UNAUTHORIZED / RATE_LIMITED，其余保留原码。
- `connectErrorToHttp` 映射：MODEL_BLOCKED→402、UNAUTHORIZED→401、RATE_LIMITED→429、TIMEOUT→504、其余→502——免费账户拒绝不再读成笼统 502。
- 非流式有界指数退避重试（重试丢弃已缓冲体防重复 token）。
- **注意此时 RETRYABLE_CODES 还含 RATE_LIMITED 与 'internal'**——这是 1a3826d 当天下午要修掉的过度重试。

## 294393c —— 计费入池：连接路径不再白嫖 env token

- `acquireConnectAccount` → 共享池 waitForAccount（modelKey 传 null，因 connect selector 不在 Cascade 目录，账户级模型过滤不能误伤）。
- `finalizeConnectAccount`：流式 finally / 非流式成败**每条出口**都配对 reportSuccess/reportError/markRateLimited + recordRequest，再 releaseAccount；env token 路径也 recordRequest 保 dashboard 总数。
- 空池回落到 env token（单 token 部署不受影响）——这个「空池回落」是 27d31de 要修的两个坑之一。

## c0585d2 —— 目录真源：两个零计费只读 RPC

- `fetchCatalog()` → GetCliModelConfigs 解码为 {selector, label, provider, alias, isFreeDefault}；**selector 就是 GetChatMessageRequest.model 期望的字段**（#21），catalog 是手写 SELECTOR_MAP 的唯一真源。
- `fetchUserStatus()` → GetUserStatus planName（#2.#2）；catalog 全模型列示（entitlement 服务端 chat 时强校验），planName 是免费/付费闸。
- 免费账户实测：catalog 200/24 模型、status 200/plan=free。把 #15（付费账户验证）变成一条命令。

## 0ecf623 —— 工具调用：复用 Cascade 文本仿真机制

- connect 模型无原生 function-calling 槽位 → 与 Cascade 路径同款仿真：chat.js 在 connect 调用**之前**跑 `normalizeMessagesForCascade(messages, tools, {route:'devin_connect'})` 注入工具协议前导、role:tool 历史折进 `<tool_result>` 回合——关键是在 devin-connect.js 的非协议 `[tool result]` 文本包装**之前**做。
- 适配层新增 emulateTools：非流式对缓冲答案 parseToolCallsFromText；流式 threading content deltas 过 ToolCallStreamParser；两者都输出**整段 arguments、index 键控**（与 Cascade 一致，非逐 token），finish_reason 翻 tool_calls。
- 实测：get_weather 查询返回 finish_reason=tool_calls（非流式与 SSE 均通过）。

## a8091d5 —— alias 漂移：要 GPT 拿到 SWE

- 机制链：catalog 广告 `gpt-5.5`（gpt-5-5-low 的别名）与 `gemini-3.0-flash`（家族别名）→ 客户端按 catalog 发请求 → 规范化成 `gpt-5-5` / `gemini-3-0-flash` → SELECTOR_MAP 只认 `gpt-5-5-low` / `gemini-3-flash` → **miss 后按 6e83477 的降级策略落到免费 swe-1-6-slow**。
- 修复：补 bare + dotted 两种形式进 map。
- **防复发（漂移守卫三件套）**：① 24 模型 catalog 快照 fixture 入库（含别名非唯一性说明：gpt-5.2 跨 5 变体）；② 离线 drift 测试：每个 selector 自解析、每个别名解析到真实 selector、每个 map 目标存在；③ smoke 新增零计费 catalog-drift 阶段对 LIVE catalog 与快照 diff。
- 当天引入当天修（07:08 落地降级策略，08:21 补洞），+25 测试。

## 1e97985 —— MODEL_BLOCKED 不罚：免费墙不是账户病

- 机制：finalizeConnectAccount 把一切非 abort 错误当账户故障 reportError，向 3-strike 驱逐线累积。但 MODEL_BLOCKED 是 entitlement 墙——免费账户被点名 claude-*/gpt-* 时被上游拒绝，**这不该把健康免费账户逐出轮换**。
- 修法：MODEL_BLOCKED 与客户端 abort 同级干净释放（零惩罚）；UNAUTHORIZED/RATE_LIMITED 照旧罚。+2 测试钉契约（MODEL_BLOCKED 不动 errorCount，UNAUTHORIZED 才动）。

## d7c3182 —— 加密凭证库：恢复的最后一块拼图

- 背景事实：DEVIN_CONNECT 凭证是**不透明 session_id，无 exp 声明、无刷新路径**——死了就永久死（Firebase 刷新循环只处理 Codeium-api_key 账户）。唯一复活手段是完整 Auth1 邮箱/密码重登 → 自动恢复必须先持有密码。
- 实现：AES-256-GCM，密钥由 scrypt(DEVIN_CONNECT_CRED_KEY) 派生；**主密钥永不上盘**，盘上只有密文 + 每记录 salt/iv/authTag（accounts.creds.json，gitignored、0600、原子 tmp+rename）。
- 明文永不入日志；邮箱小写规范化；每写随机 salt+iv（相同密码产生不同密文）；错键/tamper → GCM auth-tag 不匹配 → fail-closed throw。
- 默认 OFF（无 key 即禁用，不读不写）。**副作用留到 7f8d403**：全库共用一把主键，错键会让所有账户的解密**同一错误**——这是 7f8d403 #37 要告警化的坑。

## 59164f3 —— auto re-login：堵死 P0 单点故障

- 病链：session_id 死 → 每请求 401 → 账户 march 到 status='error' **永久**（Firebase 刷新循环跳过 session-token 账户）。
- 修法：auth.js `reLoginAccount(id)`——用加密存储的凭证做 Auth1 邮箱/密码登录，换入新 session_id，重置 status/errorCount；`DEVIN_CONNECT_AUTO_RELOGIN=1` + 配置了 cred store 才启用（双默认 OFF）。
- 防风暴：每账户 60s 冷却 + 并发调用 inflight promise 合并。
- chat.js `finalizeConnectAccount`：UNAUTHORIZED 时 reportError 之外**追加**后台 re-login，下个请求落到新 token。
- addAccountByEmail 在 cred store 启用时顺带持久化密码（加密、best-effort）→ 邮箱登录的账户可自动恢复。
- 11 个离线测试经 DI seam（__setReloginDeps）驱动。

## 8828b5a —— 透明重放：客户端看不到失败

- 非流式：UNAUTHORIZED → re-login → 拿到新 token 用**显式 freshKey** 重放 toChatCompletion（getApiKey 返回快照，不依赖原地换血）。
- 流式：emit 守卫跟踪是否已有字节上 wire——只在 emitted=false 时重放（已出字节再重试=内容重复），否则把错误当正常流错误帧输出。
- 测试钉死：AUTO_RELOGIN=1 时 finalize 恰好触发一次后台 re-login，关掉则零次。

## 8c40123 —— 存活探针：在用户请求撞上死 token 之前发现

- `checkSessionLiveness`：复用 GetUserStatus（免费座位管理 RPC，无推理无计费）做纯存活信号；200→活、401/403→死；永不 throw，返回 {alive, plan?, code?, error?}。
- `probeAndRecoverConnectAccount`：活探针给 error 账户消错（un-error）；死探针（UNAUTHORIZED）标 error + 触发 force re-login；**瞬时故障（限流/5xx）不算 token 死亡，不触发恢复**。
- 启动扫掠：DEVIN_CONNECT_LIVENESS_PROBE=1 开启（间隔 10 分钟默认），与 AUTO_RELOGIN 配对实现免手恢复。

## bb9a273 —— 跨账户 failover：单账户救不活就换人

- 触发条件：池中账户 token 死 + 同账户 re-login 救不活（raw token 添加的账户没存密码 / re-login 失败）。
- 统一流式+非流式为 **failover 循环**：per-account attempt() 先同账户 re-login 升级，再 hop 下一个未试账户；`triedKeys` 喂给 getApiKey 的 excludeKeys——**已知死的账户永不被重选**。
- 流式只在 emitted=false 时 hop；出字节后错误 → SSE 错误帧。
- `acquireConnectFailover` **非阻塞**：死账户不会再以 untried 身份回池，等队列只会白等 QUEUE_MAX_WAIT_MS → 当场取可用的，没有就失败。
- `DEVIN_CONNECT_FAILOVER_MAX` 封顶 hop 数（默认 2，0 禁用）。7 个新测试，且每账户恰好 finalize/release 一次（无 inflight 泄漏）。

## 27d31de —— cutover 日双 P0

- **P0-1 re-login 风暴**：请求路径 UNAUTHORIZED 处理器给 reLoginAccount 传 `force:true`，绕过 60s 冷却。Cascade 退役引发的**集体 token 死亡**会让每个 in-flight 请求对每账户各发一次完整 Auth1 登录、无速率上限 → 账户/IP 封禁风险。修法：两个请求路径调用（流+非流）去掉 force；并发调用仍靠 auth.js 的 inflight promise 合并（死 token 恢复一次），顺序风暴被冷却压制；force 只留给定时扫掠（本身有间隔节流）。
- **P0-2 池耗尽静默降级**：整个池被限流时 acquire 返回 null → connect 客户端**静默**落到无记账的 env token → 零 RPM 记账把单账户锤向封禁。修法：区分**空池**（env fallback 正确，单 token 部署）与**耗尽池**（干净 429 + retry_after，isAllRateLimited/isAllTemporarilyUnavailable 前置检查）。
- 附带：空池短路 acquireConnectAccount，单 token 部署不再每个请求白吃 30s 排队。+5 测试。

## 1a3826d —— quota 误分类：dry-well 账户被无限选中

- P1 #33：classifyUpstreamError 把 'insufficient credit/quota' 并进 MODEL_BLOCKED → finalizeConnectAccount 按零惩罚 tier 墙放行 → **付费账户跑干后被无限重新选中，对每个客户端 402 到永远**。
- 修法：新 QUOTA_EXHAUSTED 码（正则区分 insufficient credit/quota/balance/funds vs /upgrade/requires paid plan）→ 冷却账户 30 分钟（markRateLimited）让池绕行；两者都映射 402 但 type 不同（insufficient_quota vs model_blocked）。
- P2 #35：RETRYABLE_CODES 剔除 RATE_LIMITED（同 token 重试 2 次 = 对已限流上游三倍负载）与 'internal'（服务器对**永久性客户端错误**——坏指纹/gzip 体——返回，重试纯烧次数）。重试只剩网络 blip + 'unavailable' + 5xx；限流交给池冷却 + failover。

## e279fe9 —— 挂起流：socket idle 计时器的语义漏洞

- req.setTimeout 是 **idle 计时器——每字节重置**：trickling 上游（几秒一字节、永不完成）无限续命，账户 _inflight slot 被**永久钉死**。
- 修法：idle 计时器之外加**绝对墙钟 deadline**：DEVIN_CONNECT_IDLE_TIMEOUT_MS（原硬编码 120000 变可配）+ DEVIN_CONNECT_TIMEOUT_MS 绝对上限（默认 600000/10 分钟）。
- deadline 定时器 unref（不独活事件循环）；finally 块在**每个** generator 出口（成功/抛错/调用方提前返回）清定时器 + destroy 请求——不能对已完成请求误触发或泄漏。
- `__setRequestImpl` 传输 seam 让假挂起 socket 可离线测试：静默传输 + 50ms deadline → 51ms 内 TIMEOUT。

## 060f3f9 —— 流式路径缺重试：一次 hiccup 变硬错误

- 不对称：非流式有 maxRetries（5xx/ECONNRESET/unavailable），流式没有——上游一次瞬时失误在**零字节发出前**就变成客户端的硬错误帧。
- 修法：attemptStream 在 `isRetryable(err) && !emitted` 时同 token 重放一次，**先于** UNAUTHORIZED/re-login 处理；!emitted 门控保证出字节后绝不重放（落到错误帧路径）；重放失败落回常规处理（仍可经 re-login 救 UNAUTHORIZED）。
- 测试：pre-emit 503 → 同 token 重放 1 次 → 流式 RECOVERED 无错误帧；post-emit 503 → 不重放、错误帧。

## 7f8d403 —— 恢复可观测性：给自愈机制装仪表盘

- #36：自愈机械（re-login/failover/liveness/cooldown）此前只打日志，事故中只能 grep。新增 devin-connect-metrics.js：**进程内生命周期计数器**（relogin_ok/fail、failover_hops/exhausted、dead_tokens、pool_exhausted、transient_replays、quota_exhausted、liveness_recovered），在 chat.js/auth.js 事件路径上 bump，dashboard GET /connect-metrics 暴露（DELETE 重置）。**刻意不持久化**——这是健康/速率信号，重启清零是对的。
- #37：**错/轮转的 DEVIN_CONNECT_CRED_KEY 让 getCredential 对所有账户抛同一 GCM auth-tag 不匹配**（全库共用一把主键）→ fleet 级 auto-relogin 静默失效，只留 per-account debug warn。修法：getCredential 跟踪解密失败（计数 + lastError），打**一条**响亮的 error 级日志说明 auto-relogin 已禁用，后续一次成功解密自清告警；折进 /connect-metrics（credDecryptFailures）可告警。缺凭证返回 null 不 bump（与错键区分）。__registerCredHealth 规避静态循环依赖。

## 22f32b2 —— 账户池自愈：池子不再单调收缩

- AP-BUG-1：reportError 翻 'error' 时**持久化 status+erroredAt**——坏账户重启不复活（镜像 reportBanSignal 的保存行为，仅状态真变时存）。
- AP-RISK-1：`errorRecoveryTtlMs()`（默认 15 分钟）+ `maybeRecoverErrorAccount`——error 账户过 TTL 转 half-open 试一次：成功即 reportSuccess 清账，失败再禁；**banned 永不自动恢复**。
- AP-RISK-4：`refreshAllFirebaseTokens` 记 `_refreshFailStreak`——3 连失败把 active 降级 error（自愈走 AP-RISK-1），一次成功清零。
- 语义收尾（下一天 0e1cbd9 前的铺垫）：'error' 从「永久」变成「可自愈中间态」。

## b7c87b6 —— special-agent 生存硬化

- batch2：runDevinAcp 包装转发 onChunk（此前缓冲到流尾一次 flush——假流式）；pickUsage 用 runner 真实 token 数（估计值兜底）；mapFinishReason 映射 Devin stopReason → OpenAI 值。
- batch3 GAP-ACP-01：干净 CLI 退出（code 0）且仍有 in-flight 请求时 failAll(502) 而非 cleanup()——**防止永久并发槽泄漏**（DEVIN_MAX_PROCS=1 下卡死整个队列）。
- DEVIN_ONLY 钩子进 isEnabled()：一个开关打通整条路径。

## 7b816ee —— DEVIN_ONLY kill-switch

- Cascade 上游退役在即。`DEVIN_ONLY=1` 让 selectBackend() 短路全部模型路由到 special-agent（Devin）后端：claude/gpt/legacy/null 全走 Devin。
- 默认 OFF（DEVIN_ONLY=0 完整回滚；Cascade 代码不动）。
- **接受并记录的缺口**：ACP 路径只把请求模型名当 prompt 提示传，Devin 仍答自己的 SWE core；真模型选择是 Phase C（DEVIN_CONNECT + model_override）。注释写死在 selectBackend()。
- 8 新测试（7 路由 + 1 e2e：claude 真实路由进 ACP runner）。

## 5062eb5 —— devin-backend 脚手架（escape hatch B）

- 同一账户体系的 REST 逃生口：Bearer + x-cog-org-id 头装配、post-auth 存活探针、读端点（sessions/org/events）、SSE 请求构造器。
- **createSession/sendPrompt 是 501 存根**，注释明写 TODO(unverified)——写端点 body schema 未证实前不猜路由。这个「不猜」纪律 3 小时后被 1ae8e77 兑现（curl + FastAPI 422 探测定 schema）。

## 1ae8e77 —— createSession 走已验证 v3 REST

- 替换 501 存根：POST api.devin.ai/v3/organizations/{org}/sessions，body 白名单到 7 个已验证字段（prompt 必填 + title/tags/max_acu_limit/playbook_id/knowledge_ids/secret_ids）；**本地 prompt 校验先拒非字符串**，零网络。
- 验证方法：curl + FastAPI 422 错误探查（Devin 钉证书但 v3 是公网 REST 面，Windsurf token 可达）——零 MITM 拿 schema。
- listSessionsV3/getSessionV3：v3 读+poll（Windsurf token 只读能力）。
- **sendPrompt 保持 501 是设计**：prompt 走 ACP（REST /sessions/{id}/messages 对 Windsurf token 403）；P3 接 ACP。

## e373642 —— 真流式：onChunk 边到边转发

- 此前 stream:true 是**假的**：ACP runner 缓冲完整回复，streamFromText 把成品文本切 SSE——用户等整个生成结束才看到东西。
- ACP 本就实时推 agent_message_chunk → 接入：runDevinAcpProcess 可选 onChunk 逐 chunk 触发；默认（无回调）逐字节等价旧行为。
- 流式：streamLiveAcp 每 delta 立即转发，经 **PathSanitizeStream 增量消毒**（敏感字面量无法跨 chunk 边界泄漏）；live handler 经 onDone 在函数返回后拥有账户生命周期 + 记账（避免中途抽走账户）；中段失败 → 终态 SSE error 事件（头已发出）；不 chunk 的 runner（print 模式/mock）回落发返回值，流永不为空。
- 实测：onChunk 3 次触发，首 chunk 6.6s，早于完成——真流式。

## 36c4056 —— devin-acp：thought/message 分流

- agent_thought_chunk vs agent_message_chunk 分缓冲；getReasoning() 暴露 thought 流、默认不进回复文本。
- special-agent：DEVIN_ACP_EXPOSE_REASONING 开关（默认关）可选把 reasoning 显示为 OpenAI reasoning_content——这是 f25950c 帧级 reasoning 分离在 CLI 路径的对应物。

## 3945c51 —— #183：完成步被误标

见问题链 6。

## 185cfd9 —— v2.0.145：审计纵深

- #1 parseTrajectorySteps：畸形 proto 根 buffer 返回 [] 而非抛；单个坏 step 跳过而非整段丢弃。
- #2 docker-self-update：compose project/working_dir 标签校验（isSafeComposeProject/isSafeComposeWorkingDir）后才进 deployer——shellQuote 之上的纵深。
- #3 正则工作量上界：narrative 工具意图提取 200KB 上限、reuse-fingerprint 剥除器 256KB 上限；tool-emulation dialect 正则复查确认线性。
- 正常流量零行为变化；+6 测试。这是「先看同族问题（4296675 ReDoS）再补全族」的范例。

## 21393b9 —— 探针烧账户

见问题链 2。

## 0e1cbd9 —— tierManual 逃生门

见问题链 4。

## 4296675 —— PDF ReDoS

见问题链 7。

---

# 第三部分 · 问题链清单（10 条完整链）

## 链 1 —— devin-connect 桥 24 小时（6-30，27 commits 全链）

**时间线逐 commit**（从 f25950c 第一个纯 HTTP GetChatMessage 到 7f8d403）：

| 时刻 | hash | 加的是什么 |
|---|---|---|
| 03:48 | 22f32b2 | 地基：账户池自愈（错误持久化/半开恢复/刷新降级）——桥要读的池子先变可靠 |
| 03:48 | b7c87b6 | 地基：special-agent 生存硬化（真流式/slot 泄漏）——桥的对立面（CLI 路径）先修稳 |
| 03:49 | 7b816ee | 地基：DEVIN_ONLY 开关——退役开关先立，桥再上场 |
| 07:08 | **f25950c** | **骨架：纯 HTTP GetChatMessage 客户端 + 帧解码（双 token auth、732 位指纹）** |
| 07:08 | 6e83477 | 骨架：OpenAI 适配器（非流+SSE）+ selector 解析（未映射降级免费） |
| 07:08 | 2c54e35 | 骨架：router 接入 + kill-switch 最高优先 + 流头 no-store |
| 07:21 | 67de6d5 | 能力：错误分类（MODEL_BLOCKED/UNAUTHORIZED/RATE_LIMITED）+ 有界重试 + 错误→HTTP 映射 |
| 07:27 | 294393c | 能力：从账户池取 token + 全出口计费记账 + 空池 env 回落 |
| 07:31 | fba3bd4 | 能力：abort 上溯 + 客户端取消不罚账户 |
| 07:53 | c0585d2 | 能力：live catalog + entitlement probe（零计费只读 RPC，selector 真源） |
| 07:57 | 710a4c1 | 能力：e2e smoke 9 阶段（零计费 preflight + #15 闸） |
| 08:02 | 1e97985 | **修复：MODEL_BLOCKED 不罚账户健康预算** |
| 08:21 | a8091d5 | **修复：catalog alias 漂移 + drift 守卫三件套** |
| 08:29 | 0ecf623 | 能力：tool/function calling 文本仿真（复用 Cascade 机制） |
| 08:38 | a84acc5 | 能力：vision 铺垫（gated 编码器 + tag 标定 harness） |
| 12:39 | d7c3182 | 能力：加密凭证库（AES-256-GCM，恢复的前提） |
| 12:44 | 59164f3 | 能力：auto re-login 复活死 token（P0 SPOF，60s 冷却 + inflight 合并） |
| 12:47 | 8828b5a | 能力：re-login 后透明重放一次（!emitted 门控） |
| 12:51 | 8c40123 | 能力：零计费存活探针 + 预防性恢复（启动扫掠） |
| 12:53 | 6f2e274 | 测试：smoke Stage 0c（liveness/凭证库/恢复配置链） |
| 16:04 | bb9a273 | 能力：跨账户 failover（统一循环、triedKeys 防重选、hop 上限） |
| 16:33 | **27d31de** | **修复：cutover 日双 P0（re-login 风暴去 force + 池耗尽干净 429）** |
| 16:35 | bca363c | 文档：生产 cutover runbook + .env.example |
| 16:45 | 1a3826d | **修复：quota/tier 误分类 + 重试码收紧** |
| 16:48 | e279fe9 | **修复：绝对墙钟 deadline 治挂起流** |
| 16:51 | 060f3f9 | **修复：流式 pre-emit 瞬时错误重放** |
| 16:59 | 7f8d403 | 能力：recovery 可观测性（计数器仪表）+ cred-key 告警 |

**推进逻辑（桥怎么长出来的）**：03 点先把「桥的两边」修稳（池子 + CLI 路径），07 点三连发立起最小链路（客户端→适配器→路由），随后按「先语义（错误分类）→ 再记账（池+计费）→ 再治理（目录、smoke、vision/tool 能力）」的顺序补生产要素；12 点转入**生存主题**——token 死亡是 op 后第一个会打死桥的问题，凭证库→自动重登→透明重放→存活探针→failover 五连发；16 点是**复盘修复潮**：6 个修复全是桥自身引入或暴露的缺陷（降级策略、重试过度、idle 计时器语义、路径不对称、风暴守卫缺失）。

## 链 2 —— 探针烧账户事故（21393b9）：引入 → 事故 → 修复 → 防复发

- **引入**：探针设计为三阶段——Step 1 GetUserStatus（免费）；Step 2 PROBE_CANARIES 列表对每个模型发真实 `cascadeChat('hi')`（**计费**）；Step 3 动态 cloud 候选扫掠（**计费**）。设计意图是发现 UID-only 模型与免费层额外模型。
- **事故**（homecloud 2026-06-29 线上）：force-probe 把活着的免费账户 free→expired。根因：Step 2/3 每个模型一次真实对话，各花 prompt 额度；约 12 个模型扫完，低额度免费/trial 账户额度耗尽，账户读成 expired。
- **修复**：计费 canary 改 opt-in——`probeCanaryDefault()` = `WINDSURFAPI_PROBE_CANARY === '1'`；_probeAccountImpl 收 {canary}，Step 2/3 仅在 runCanary 时跑；dashboard probe 路由只有显式 {canary:true}/{deep:true} 才开；**默认 probe 按钮零额度**。
- **防复发**：新测试 test/probe-canary-optin.test.js 钉死门控；更新钉旧签名的 langserver-resource 断言。Step 1 免费且权威，enum 键控模型全部免费分类——计费 canary 只剩 UID-only 模型一个用途。
- **关联**：同一天稍早的 7fd275a 已暴露探针链的另一环（expired 被当新账户送去无限 re-probe），21393b9 与 7fd275a 是探针链的连续两次修复。

## 链 3 —— cutover 日双 P0（27d31de）

见 ★ 深挖。补充链条上下文：
- P0-1 的引子：59164f3 给 reLoginAccount 设计了 60s 冷却 + inflight 合并，但**请求路径**调用方（chat.js 流+非流）传了 force:true 绕过冷却——冷却只存在于定时扫掠路径。修复把 force 限定到扫掠（扫掠本身按间隔节流），请求路径靠 coalescing + 冷却双保险。
- P0-2 的引子：294393c 的「空池回落 env token」设计——对单 token 部署正确，但**耗尽池**（池存在且全员限流）时同一回落变成无记账锤单账户。修复按 getAccountCount().total 区分：空池（=0）回落；耗尽池（>0 且 isAllRateLimited/isAllTemporarilyUnavailable）→ 429 + Retry-After，检查先于队列等待（限流中白等 30s 无意义）。
- 附带修复：空池短路，单 token 部署不再每请求吃 30s 排队。

## 链 4 —— tierManual 逃生门（0e1cbd9）

- **逃生门定义**：#8（4 月 issue）后引入 tierManual——操作员手动钉死账户 tier，isModelAllowedForAccount 在 tierManual 下信任 account.tier。
- **被击穿**：三处自动写一律无视逃生门——refreshCredits planName 推断、fetchUserStatus、探针 tier 恢复，全都无条件写 account.tier。6h 重探 / 15m 信用刷新把手工钉的 'pro' 几分钟内覆写回 'free'（顺带 10rpm），逃生门名存实亡。
- **同 commit 第二 bug**：reportError 无时间窗终身计数——跨数小时的 3 次瞬时 'unauthenticated' blip 永久翻 'error'，而 error 账户被选择/重探/刷新全跳过 → **永不康复**。
- **修复**：① 三处自动写全部套 `!account.tierManual` 守卫（updateCapability/inferTier 早已守卫）；② reportError 镜像 reportBanSignal 的 30 分钟窗口——窗口内 3 次才禁，陈旧连击重新计，reportSuccess 全量康复。守护用「源文本断言测试」钉死（任何新增无条件 `account.tier =` 写都会被测试抓）。
- **遗留披露**：已卡在 status='error' 的老账户仍需手动重置（定期康复通道是更大的生命周期改造，标注未做）——22f32b2 的 AP-RISK-1 半开恢复（次日 03:48）补上了这条。

## 链 5 —— alias 漂移「要 GPT 拿 SWE」（a8091d5）

见 ★ 深挖。链条要点：
- 6e83477 的降级策略（未映射→免费 swe-1-6-slow）本意是「启用部署永不死」，代价是**静默换模型**——错模型比报错更危险（用户以为在用 GPT）。
- 触发条件双缺一不可：catalog 广告别名（bare gpt-5.5 / 带 .0 的 gemini-3.0-flash）+ SELECTOR_MAP 只收变体名。
- 修复分三层：当场补映射（症状）、快照 fixture + 离线 drift 测试（回归闸）、live catalog diff smoke（环境漂移哨兵）。当天 07:08 引入、08:21 修复、+25 测试。

## 链 6 —— WebFetch 完成步误标 #183（3945c51）

- **症状**：native WebFetch 丢模型答案和抓取的文档（#183，6-29 关闭）。
- **真相**（修复 commit 自述）：端到端实际是通的——LS 已执行 read_url_content 并返回真实 web_document，Cascade 也产出了最终 assistant 答案。**但 proxy 先检查共存的 requested_interaction 回声**，把完成步误标成 pending_permission → 输出死 read_url_content 工具调用提案，模型答案 + 抓取文档双丢。
- **修复**（4 处协同）：
  - proto-trace.js：completed_web_document 分类**先于** pending_permission（两者并存时判完成）；
  - windsurf.js：标记带真实 web_document 的 read_url_content step；
  - client.js：完成态 WebFetch 结果与提案分流（isCompletedReadUrlNativeResult：cascade_native + name=read_url_content + hasWebDocument + 非空 result）；已执行结果不再 re-approve / early-stop；nativeToolResult 与 nativeToolCall 区分；
  - handlers/chat.js：完成态 read_url_content 不转 OpenAI tool_calls；保留最终模型文本（finish_reason=stop）；模型无文本时回落文档体；流式防重复输出。Bash/Read/Grep 与无文档 pending 语义不变。
- **关联**：3a8d472（同发布窗）给 smoke 加 hard verdict：completed_web_document 是通过必要条件。
- **模式**：同一 step 携带两类信号（完成态 + 回声），检查顺序错了整个行为翻转——「信号优先级」类 bug。

## 链 7 —— PDF ReDoS（4296675）

- **漏洞**：pdf.js 的 TJ 提取正则 `/\[((?:[^[\]]*|\([^)]*\))*)\]\s*TJ/` 灾难回溯。未闭合 '[' 的恶意 PDF 内容（代理公网绑定、摄入不可信 PDF、解压流最大 25MB）——38 个字符挂事件循环约 **53 秒**，单请求 DoS。
- **修复**：线性 `/\[([^\]]*)\]\s*TJ/`（50 万字符 0ms）。权衡：TJ 数组里 (...) 字符串内出现字面 ']' 会被跳过——文本提取本就 best-effort，可接受。
- **同 commit 另两件**：caller-key.js 停记原始 body.user（OpenAI user 字段常是终端用户邮箱/账号 id，PII；bodySubKey 哈希照旧）；cache.js key 补齐 stop/seed/frequency_penalty/presence_penalty/logit_bias/n——**相同 body 不同 stop/seed 此前会命中对方生成的响应**。
- **家族关联**：185cfd9（6-10）已对同族正则做过工作量上界与线性化复查（NLU 200KB 上限、fingerprint 256KB），4296675 是同一审计在 PDF 路径的补漏。

## 链 8 —— 会话 token 死亡链（6-30 12:39→16:59 主线）

一条从「死 token 永久禁号」到「全自动恢复 + 可观测」的五连发修复链：

1. **死因**：DEVIN_CONNECT 凭证是不透明 session_id——无 exp 声明、无刷新路径，Firebase 刷新循环只认 Codeium-api_key 账户 → token 死 = 账户永久死（d7c3182 的 message 原文：permanently dead with no recovery）。
2. **前提**（d7c3182 12:39）：要恢复必须持密码 → 加密凭证库（AES-256-GCM + scrypt，主键永不上盘，fail-closed）。
3. **复活**（59164f3 12:44）：Auth1 邮箱/密码重登换新 token，60s 冷却 + inflight 合并防风暴（P0 SPOF 修复）。
4. **透明化**（8828b5a 12:47）：re-login 成功后请求重放一次，客户端无感；!emitted 门控。
5. **提前发现**（8c40123 12:51）：零计费存活探针（GetUserStatus 200/401/403）+ 启动扫掠，用户请求撞上死 token **之前**恢复；瞬时故障不算死亡。
6. **换人**（bb9a273 16:04）：同账户救不活 → 跨账户 failover（triedKeys 防重选、hop 上限 2）。
7. **防风暴**（27d31de 16:33）：请求路径去 force，集体 token 死亡不再触发无节流登录风暴。
8. **防误伤**（1e97985 08:02 + 1a3826d 16:45）：免费墙（MODEL_BLOCKED）与额度耗尽（QUOTA_EXHAUSTED）不往 token 死亡方向罚/冷却错误。
9. **可观测**（7f8d403 16:59）：计数器 + cred-key 错键全局告警——自愈机制本身能被看见、能告警。

## 链 9 —— Cascade 退役链（6-29 21:09 → 6-30 16:35）

- 6-29 21:09 5062eb5 立 REST 逃生口 B（app.devin.ai，写端点 501 存疑不猜）→ 21:16 cc3a912 后端选择集中化（selectBackend 纯函数，为多后端做准备）→ 21:57 1ae8e77 验证 v3 schema 实现 createSession。
- 6-30 03:49 7b816ee DEVIN_ONLY 开关（Cascade 退役、全模型走 Devin CLI，缺口记录在注释）→ 07:08 2c54e35 DEVIN_CONNECT 接路由（纯 HTTP，无 CLI 依赖，最高优先）→ 16:35 bca363c cutover runbook（纠正「开关是 DEVIN_CONNECT 不是 DEVIN_ONLY」——DEVIN_ONLY 需要本机 devin 二进制，容器场景不可用）+ .env.example 全覆盖。
- **结论文档化**：生产切换 = DEVIN_CONNECT=1；DEVIN_ONLY 是 CLI 在场时的退役开关。默认 OFF 双保险可回滚。

## 链 10 —— 旧债与治理线（跨片）

- **假冷却债**（736eefb 6-07）：上片引入的假上游冷却被换真（v2.0.139 系）。
- **流错误尾巴债**（72e1b9c 6-07）：部分流错误残留片段暴露给客户端。
- **ReDoS 家族债**（185cfd9 6-10 → 4296675 6-29）：同审计两个波次。
- **LS 镜像稳定化链**（a69d948→d704d1a→ec74d3f→1509992→2c447c9→f4df9fd 6-23）：换维护版镜像→文档→checksum 校验→POSIX awk→CRLF 容忍→下载进度，全链 6 commit 出自 PR #192 一条线。

---

# 第四部分 · 桥诞生日志（6-30，27 commits 按小时）

图例：【骨架】= 让桥本体跑通的链路件；【能力】= 生产级功能件；【修复】= 桥当天引入/暴露缺陷的修补。

| 时刻 | hash | 标色 | 事件 |
|---|---|---|---|
| 03:48 | 22f32b2 | 【骨架】 | 账户池自愈（错误持久化/半开恢复/刷新降级）——桥要读的池子先变可靠 |
| 03:48 | b7c87b6 | 【骨架】 | special-agent 生存硬化（真流式/slot 泄漏修复）——CLI 对面先修稳 |
| 03:49 | 7b816ee | 【骨架】 | DEVIN_ONLY kill-switch（Cascade 退役开关，默认 OFF） |
| 07:08 | **f25950c** | 【骨架】 | ★★ 纯 HTTP GetChatMessage 客户端 + 帧解码（双 token auth / 732 位指纹） |
| 07:08 | 6e83477 | 【骨架】 | OpenAI 适配器（非流 + SSE）+ selector 解析（未映射降级免费） |
| 07:08 | 2c54e35 | 【骨架】 | router 接入 + kill-switch 最高优先 + 流头 no-store |
| 07:21 | 67de6d5 | 【能力】 | 错误分类 + 有界重试 + 错误→HTTP 映射（免费墙不再读成 502） |
| 07:27 | 294393c | 【能力】 | 账户池取 token + 全出口计费记账（RPM 预算对齐 Cascade） |
| 07:31 | fba3bd4 | 【能力】 | abort 上溯 + 客户端取消不罚账户 |
| 07:53 | c0585d2 | 【能力】 | live catalog + entitlement probe（零计费只读 RPC） |
| 07:57 | 710a4c1 | 【能力】 | e2e smoke 9 阶段（零计费 preflight + #15 闸） |
| 08:02 | 1e97985 | 【修复】 | MODEL_BLOCKED 免费墙不再罚账户健康预算 |
| 08:21 | a8091d5 | 【修复】 | catalog alias 漂移（要 GPT 拿 SWE）+ drift 守卫三件套 |
| 08:29 | 0ecf623 | 【能力】 | tool/function calling 文本仿真（复用 Cascade 机制） |
| 08:38 | a84acc5 | 【能力】 | vision 铺垫（gated 编码器 + tag 标定 harness） |
| 12:39 | d7c3182 | 【能力】 | 加密凭证库（AES-256-GCM）——token 恢复的前提 |
| 12:44 | 59164f3 | 【能力】 | auto re-login 复活死 token（P0 SPOF，60s 冷却） |
| 12:47 | 8828b5a | 【能力】 | re-login 后透明重放一次（!emitted 门控） |
| 12:51 | 8c40123 | 【能力】 | 零计费存活探针 + 预防性恢复 |
| 12:53 | 6f2e274 | 【能力】 | smoke Stage 0c：liveness/凭证库/恢复配置链 |
| 16:04 | bb9a273 | 【能力】 | 跨账户 failover（统一循环、triedKeys、hop 上限） |
| 16:33 | **27d31de** | 【修复】 | cutover 日双 P0（re-login 风暴去 force + 池耗尽干净 429） |
| 16:35 | bca363c | 【能力】 | 生产 cutover runbook + .env.example 全覆盖 |
| 16:45 | 1a3826d | 【修复】 | quota/tier 误分类 + 重试码收紧（429/'internal' 移出） |
| 16:48 | e279fe9 | 【修复】 | 绝对墙钟 deadline 治挂起流（idle 计时器语义漏洞） |
| 16:51 | 060f3f9 | 【修复】 | 流式 pre-emit 瞬时错误重放一次（路径不对称） |
| 16:59 | 7f8d403 | 【能力】 | recovery 可观测性（计数器仪表）+ cred-key 错键全局告警 |

**诞生形态**：03 点地基 3 连（骨架）→ 07 点链路 3 连（骨架核心）→ 07:21-08:38 能力 7 连
（语义/记账/治理/工具/vision）→ 12:39-12:53 生存主题 5 连（凭证→重登→重放→探针→smoke）
→ 16:04-16:59 收尾 7 连（failover → 双 P0 修复 → runbook → 3 修复 → 可观测）。
**修复集中在两个窗**：08:02-08:21（上午首轮验证暴露：免费墙误伤、alias 降级）
与 16:33-16:51（cutover 预演暴露：风暴守卫、池耗尽、quota 分类、idle 语义、流式不对称）。

---

# 第五部分 · 统计与自伤对照

- 总量 89：6-29+6-30 = 53（59.6%）；6-30 一天 27（30.3%）
- 类型分布：fix 32 / feat 27 / docs 14 / test 6 / ci 2 / chore 2 / refactor 1 / perf 1
- 6-30 当天 27 个 commit 中：骨架 6、能力 15、修复 6——**修复全部针对桥自身引入的缺陷**（self-inflicted 密度最高的一天）
- 自伤事件（v1 采 12 起，本片内 9 起）：探针烧账户（21393b9）、cutover 双 P0（27d31de）、
  alias 漂移（a8091d5）、quota 误分类（1a3826d）、idle 计时器（e279fe9）、流式不对称
  （060f3f9）、MODEL_BLOCKED 误罚（1e97985）、无时间窗禁号（0e1cbd9）、probe-pending
  误标（7fd275a）、假冷却（736eefb）、流错误尾巴（72e1b9c）、WebFetch 误标（3945c51）
- 6-30 修复潮的共性模式：**「先能用，再计量，再语义化，再自愈，最后可观测」**——
  桥 16:59 收盘时的形态（failover + 恢复 + 计数器 + 告警）与 07:08 首跑形态
  （裸客户端 + 降级）已不是同一个系统
- 测试规模演进：6-29 早 1156 → 6-30 晨 1334 → 收盘 1506（+350，其中桥相关约 130 个新用例）
