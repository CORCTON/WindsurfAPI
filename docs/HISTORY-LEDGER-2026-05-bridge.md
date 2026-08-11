# 记账本 · v2 精细账 · 切片 5：bridge（2026-05-01 ~ 06-06，146 条）

数据源：`/tmp/ledger-slice-5-bridge.txt`（逆序）＋ v1 采集 `/tmp/ledger-out-slice-5-bridge.md`。
本版为精细账：逐条 commit 账 + 问题链 + 停滞期衔接分析。

## 数据完整性披露（先于一切）

**hash 真实性**：146 条 hash 全部经 `git cat-file` 验证存在，日期与 git 作者日期一致。

**素材与 git 实际历史的差异**（本次核查新发现）：
- 素材缺 **4 条 5-01 的 commit**（在切片起点之前、v2.0.45~48 时代）：`b4a9ebf`（v2.0.45 #106/#107 Claude Code 2.x cwd 提取）、`222526b`（v2.0.46 #107 follow-up untrusted workspace 重试）、`04bb2ad`（v2.0.47 #108 proxy workspace scaffold 误判）、`a24855f`（v2.0.48 docker self-update 三 bug）。切片从 v2.0.49 起，故被切掉。
- 素材漏 **1 条 6-06 的 commit**：`452871c`「ci: use bounded release test gate」（6-06 晚于 d374b25，与 6-07 的 4 条同属下一切片内容）。
- 6-07 还有 4 条（`81f6156`、`736eefb`、`8a53cc8`、`1335f89` release 2.0.138）属下一切片。

**结构性发现（v1 完全没抓到）**：5-22 的 v2.0.97 之后**不再有独立 release commit**。6-05/06 的 48 条 commit 中 40 条自带 package.json 版本 bump + 内嵌 `docs/releases/RELEASE_NOTES_2.0.x.md`——即 **v2.0.98 ~ v2.0.137 共 40 个版本号在两天内被"隐式 release"消化**，每条 fix/feat 即一次发布。版本轨迹见各条账目括号内标注。

---

# 第一部分 · 逐条 commit 账（按 git 时间正序）

## 05-01（1 条）

- `3f916b8` (v2.0.49) fix: LS update toast 区分「no change」与「cold pool」—— 上一片 #108 线的收尾。深挖点：这是切片内唯一 5-01 条，是 4 条被切掉的 v2.0.45-48 commit 之后第一笔，说明 5-01 当天实际有 5 条（v2.0.45→49）。

## 05-02（18 条，v2.0.50 → v2.0.67）——社区 issue 洪峰起点

- `b7e5910` (v2.0.50) feat: gpt-5.5 + claude-opus-4-7-max + gpt-5.3-codex tier ladder —— #109 模型 SKU 系列第一笔。
- `30657ab` (v2.0.51) fix(#109): 废除 6 个上游实际拒绝的 SKU —— 与上条同天，先加后砍，说明对上游 catalog 的认知是边发边纠。
- `5b952fa` (v2.0.52) fix(#109): gpt-5.2/5.4/5.3-codex 跨档别名。
- `455a9c6` (v2.0.53) feat(#109): 非规范格式 tool_calls salvage —— 从模型输出文本里捞 tool_call。
- `80cffbb` (v2.0.54) test(#109): salvage → tool_use 端到端链测试（测试先行，本切片少见的 TDD）。
- `9dd578f` (v2.0.56) release: 安全加固 + 运行时凭证轮换 + ban 检测 + 暴力破解锁（v2.0.55 未入本片）。
- `5a69928` (v2.0.57) release: RegisterUser/PostAuth 迁移 + quota-aware 路由 + 邮箱锁 —— 「research-driven upgrades」。**深挖**：2.0.90 的 release notes 回指「v2.0.57 学习对象 windsurf-assistant v17.42.20」——这条是上游协议研究的起点，Auth1 → PostAuth → OTT → registerWithCodeium 四段链路成型于此。
- `f5f2ac5` (v2.0.58) release: drought mode 硬拦截 premium 模型 503 —— 上游配额枯竭时不再挂起，直接 503。
- `dab698c` (v2.0.59) release: dashboard chart 时间线填充 + 暖色板。
- `70bbaf5` (v2.0.60) release: dashboard UX 大改（logs export + chart crosshair + 上游透明度 + GOD/MR/LR rarity）。
- `b8c0554` (v2.0.61) release: issue triage 四连（#110 #111 #113 #114）。**深挖**（#114 链起点）：#114 邮箱登录 ERR_TOKEN_FETCH_FAILED，根因判定「v2.0.57 dual-path 让 PostAuth 走新 host、OneTimeAuthToken 也优先新 host，但半迁移期内新 host 给的 sessionToken 旧 host 拒识」→ 修法 `oneTimeTokenDualPath` 接受 `preferredHost` 参数 pin 到 PostAuth 同 host。同时修了 #110（dashboard 锁死 UX）、#111（fingerprint 动态字段导致 reuse 100% miss → normalizeSystemPromptForHash + toolContextDigest 排序）、#113（policy_blocked 识别为 451 不烧账号重试）。同条里 #114 的修法事后证明只治标。
- `1026cd3` (v2.0.62) release: gpt_native dialect（**自称 #115 root cause**）。**深挖**（#115 链第 1 步，自伤源头）：诊断「Cascade proto 无 native function-calling 字段 → 一直用文本协议 emulation 让模型 emit `<tool_call>` 文本块；Claude 顺从，GPT 不顺从（训练让它期望 native JSON）」。修法：构造伪装协议 `gpt_native` dialect —— anti-refusal preamble 6 条 rules + `pickToolDialect` 加 route 参数（仅 responses 路由 + GPT 家族启用）+ 8 个流式 sentinel + history 序列化改 `{"function_call":{...}}` 形态。**当晚部署即炸**：非流式路径在 `nonStreamResponse` 内直接引用 `body.__route`，而 `body` 不在该函数作用域。
- `acdaae5` (v2.0.62 hotfix) fix: pass route to nonStreamResponse via positional arg。**深挖**（自伤实锤）：commit message 自述「Initial v2.0.62 used body.__route directly inside the parser call inside nonStreamResponse — but body is not in that function's scope. Production logs showed `Chat error: body is not defined`」——**2.0.62 自己引入的 ReferenceError，当天 19:35 热修**。同一功能：早上 10:00 左右 ship，晚上 19:35 修自己。此即「当日自爆」。
- `bda413a` (v2.0.63) release: 2.0.62 hotfix 打包（纯 release 包装）。
- `e2fc261` (v2.0.64 #115) fix: 加固 gpt_native user-message preamble + dialect-aware emit hint（+15 行 preamble 强化）。
- `c047d06` (v2.0.65) release: Cascade native tool bridge（**自称 #115 真修**）。**深挖**（#115 链第 3 步）：新建 688 行 `src/cascade-native-bridge.js` —— 把 client 的 OpenAI tools 翻译成 Cascade 内置 IDE step（Read↔view_file、Bash↔run_command、Glob↔find、Grep↔grep_search_v2、Write↔write_to_file），trajectory step.action 反向翻译成 tool_calls，tool_result 经 `additional_steps[9]` 注回。激活门槛 `canMapAllTools` 全映射严格模式；auto-on 只命中 GPT 家族 + responses 路由。release notes 自列 3 个 known gap（stream batch emit、Edit 未真编、server-side 副作用）。
- `9b383ea` (v2.0.66) release: partition mode + reasoning effort merge（#115 cont.）。**深挖**（#115 链第 4 步）：VPS 部署后日志 `tools=15 emulateTools=true markers=none`，**新代码路径 0 触发**——codex CLI 0.128 默认发 11 个工具，只有 shell_command 能干净映射，`canMapAllTools` all-or-nothing 让所有请求回退老路径。修法：`partitionTools` 取代严格门——mapped 走 native trajectory + unmapped 同时走 emulation toolPreamble 两路并存；`shell_command` 加入 TOOL_MAP；新增 `mergeReasoningEffortIntoModel` 修 codex 的 `model=gpt-5.5` + `reasoning.effort=xhigh` 丢失问题。
- `9ae100b` (v2.0.67) release: quiet-window 自动 docker self-update（#112）。

## 05-03（20 条，v2.0.68 → v2.0.84）——release 暴雨 + NLU 七连 hotfix

- `c5185fb` (v2.0.71) release: 7 issue 自己做完不再推回去 —— 注意素材逆序，正序里 2.0.68 在最前。此条是「不回复 issue 了，直接做完」的节奏宣言。
- `c50637f` (v2.0.70) release: **#115 翻方向** + 积压 follow-up 全清。**深挖**（#115 链第 5 步，方向翻转点）：v2.0.69 的 NO_EMUL 诊断 probe 实测——partition 模式 + 关掉 emulation toolPreamble 后 GPT 依旧 `markers=none`，反而 fabricate 了一个「像样的 epoch 时间戳交差」。结论：「cascade DEFAULT planner 给 GPT 看到的 run_command 工具描述用的是 cascade 内部 trajectory grammar，GPT 训练分布里没见过」→ **GPT 退出 native bridge（默认 OFF）、Claude 默认 ON、Gemini OFF**。同时补 v2.0.65 欠的 Edit/MultiEdit 真编 ActionSpec proto、web_search→search_web（field 42，之前错映射成 read_url_content）、apply_patch 标记 unmappable（v2.0.71 接 fan-out）、stream 路径流式 emit native tool_calls。anti-fabrication ruleset 加第 4 条枪口指向「echo timestamp」fabrication trap。release notes 自陈「**#115 真验证未完成**」。
- `5e5220c` (v2.0.69) release: dashboard token 拆分 + thinking 长思考不杀 + #115 partition 调试开关。
- `e82c065` (v2.0.68) release: issue triage 三连（#117 alias / #118 usage / #119 sticky-IP LS）。
- `a4216be` (v2.0.72) release: **NLU 协议转换层**。**深挖**（NLU 链起点，第二条技术路线）：承认「anti-fabrication / fabricate detection 都只是让 operator 看见问题，没真修」→ proxy 端写 NLU intent extractor（267 行新模块），从模型 narrate 文本反向抠 tool_call。三层 extraction 按 confidence 排序：Layer 1 explicit invocation（0.9-0.95）→ Layer 2 backtick 引用（0.8）→ Layer 3 natural narrative（0.65，需用户 prompt 含 run/exec/read/cat/ls 动词闸）。tool name 必须在 caller 声明的 tools[] 里。证据：`scripts/probes/v2071-glm-kimi-tool-probe.mjs` 实测 GLM-4.7 emit 「I should call the shell_exec function with the command 'echo HELLO_FROM_PROBE'.」被抠出。
- `201889c` (v2.0.73) release: NLU recovery hotfix（**allThinking 通道漏**）。**深挖**（NLU 链第 2 修）：部署后跑 GLM/Kimi probe 发现 NLU 没真触发——cascade `CortexStepPlannerResponse` 有 response(1) 和 thinking(3) 两个字段，GLM-4.7/5.1 把 narrate 输出塞进 thinking 字段；而 v2.0.69 加的「thinking-only promote」在 markers 检测**之后**跑，allText 为空导致整个检测块跳过。修法：`narrativeSource = allText || allThinking` 统一三段检测入口。
- `52c75eb` (v2.0.74) release: 真修两条没人接的超时 + reuse miss —— 「没人接」指 issue 挂了没人处理的积压。
- `8592fb0` (v2.0.75) release: **Claude 工具卡死回归紧急修** + 登录 cross-host + UI N/A。**深挖**（NLU 链第 3 修）：2.0.72 的 NLU 改动波及 native bridge 路径，Claude 走 trajectory 的工具调用卡死 → cascade-native-bridge.js 45 行修正。同条还改 windsurf-login.js 88 行（登录 cross-host 重构，为 #114 后续埋线）。
- `5ad5515` (v2.0.76) release: NLU 误抠 placeholder patch（v2.0.75 实测追加）。**深挖**（NLU 链第 4 修）：v2.0.75 实机测试发现 extractor 把对话里的占位示例（placeholder）误抠成 tool_call → intent-extractor.js +11 行加守卫。
- `ba6f5ee` (v2.0.77) release: NLU recovery 入口扩宽（v2.0.76 实测发现真问题）。**深挖**（NLU 链第 5 修）：实测发现入口条件太窄（markers=none 判定漏路径）→ chat.js +20 行扩宽触发条件。
- `d9bee99` (v2.0.78) release: 严格 dual-audit 4 HIGH 全修 —— 引入「双重审计」工作方式。
- `1693de9` (v2.0.79) release: audit MED + LOW 收尾。
- `c9800f7` (v2.0.80) release: H-4 narrowing hotfix —— 二审审计漏的 HIGH 立即修。
- `f6194f2` (v2.0.81) release: #125 中文 NLU + bilingual anti-narrate dialect。
- `c793899` (v2.0.82) release: #125 NLU retry-with-correction（**自称「真正」的兼容/转换层**）。**深挖**（NLU 链核心收口）：chat.js +77 行——NLU 抠出 tool_call 后不再只报告，而是构造 corrected retry 让模型按标准形态重发。
- `0489823` (v2.0.82 追加) fix: widen detectToolIntentInNarrative 加 action-verb 兜底 pass —— GLM-5.1 说「Let me list the files」不点工具名（+25 行）。
- `7bba0c3` (v2.0.83) release: retry detector Pass 2 fallback（GLM-5.1 narrate 不点名工具）。
- `1198ca8` docs(readme): 修正免费账号模型清单（GLM/Kimi/Qwen 也有） + tool-calling 可靠性矩阵 + opus-4-7-max 周配额 FAQ。
- `a9b43ef` docs(readme.en): 英文镜像同步。
- `ccc8b61` (v2.0.84) release: #118 rate-limit fallback hint（fallback_model + remediation 字段，为 #129 埋线）。

## 05-04（7 条，v2.0.85 → v2.0.90）——#129 回归三连 + #114 紧急绕路

- `1514f1f` fix(models): dotted-form 别名（claude-haiku-4.5 等）——README/近期回复用点号形态而 catalog 只有破折号，纯兼容补充。
- `9156063` (v2.0.85) release: #126/#128 自动 model fallback + #127 LS orphan cleanup。**深挖**（#129 链第 1 步）：auto-fallback 默认 **ON**——rate_limit 时 wrapper 改 `body.model` 重发。测试 100 行新 case。
- `80d6079` (v2.0.86) release: **#129 wnfilm regression hotfix，auto-fallback 默认 OFF**。**深挖**（#129 链第 2 步）：wnfilm 报告 fallback 后「client 后续请求像新会话一样失忆」。真根因：cascade reuse fingerprint 把 modelKey 锁进 hash，fallback 改 model 重发后 cascade 存到新 model fingerprint 下，client 下次原 model 请求 reuse MISS → 起新 cascade；依赖 cascade reuse 的 client（不重发完整 history）→ 模型看到空 history 失忆。修法：`shouldAutoFallback` env gate 反向（`!== '1'` 才允许）。release notes 自陈「**v2.0.85 ship 默认 ON 是仓促**」——同日 85 上、86 撤，自伤三连第 2 环。
- `9a404a0` (v2.0.87) release: **#129 真修 cascade pool alias + auto-fallback 默认 ON**。**深挖**（#129 链第 3 步）：修 conversation-pool.js `checkin` 接受 `string | string[]`——fallback 走完后 cascade 同时挂到原 model 和新 model 两个 fingerprint 下（`__aliasModelKey` 机制）。实测路径：turn 1 max 限流 → fallback xhigh 跑 → checkin([fp_xhigh, fp_max])；turn 2 max → checkout(fp_max) 命中同一 cascade。默认 ON 安全开回。
- `ac19e70` (v2.0.88) release: 严格 dual-audit v2.0.85-87 找 4 HIGH + 3 polish —— 对刚发的三个版本回头二审。
- `76193a9` (v2.0.89) release: v2.0.88 修法二审 latent guard。
- `fd031fd` (v2.0.90) release: **#114 OTT 端点全坏 紧急绕路**。**深挖**（#114 链终章）：lnqdev 再报 ERR_TOKEN_FETCH_FAILED + e2e 实测 dwgx 自己 3 个账号在 VPS 全炸 → `scripts/probes/v2089-ott-host-matrix.mjs` 3 账号 × 2 sessionToken × 2 OTT host = **12/12 全 401 invalid_token**——不是路径问题，是上游 GetOneTimeAuthToken 端点本身废了，v2.0.61/75/79 三层 fallback 全救不了。反向工程 windsurf-assistant v17.42.20（其 CHANGELOG 已标「Cognition 全面迁移至 Devin，完全跳过 OTT 和 RegisterUser」）+ `scripts/probes/v2089-sessiontoken-as-apikey.mjs` 6 shape × 2 host 实测——**shape A（裸 sessionToken 当 apiKey）4/4 全通**。修法：登录链路 Auth1→PostAuth→OTT→registerWithCodeium 塌成 Auth1→PostAuth→apiKey=sessionToken（60 行→10 行），OTT 整段删除（函数保留给 Firebase 路径）。

## 05-05 / 05-06（2 条）

- `a1eb82e` (05-05) fix: #114 #123 #132 + circuit breaker stats —— 4 HIGH 全部出自 dual-audit v2.0.88-90，给 #114 绕路补断路器统计（审计线产物，非 release）。
- `e3c0322` (05-06) fix(dashboard): proxy save 反馈 + parseProxyUrl 空白处理。

## 05-07（9 条）——#134 PostAuth / #135 / kimi-k2 方言

- `ace8e5a` chore: 允许 CLAUDE.md 进仓（agent rules）——**自伤第 5 项第 1 半**，两天后被自己移除。
- `22578d2` fix: 自动启用 NLU retry for GLM/Kimi + 历史预算 600KB —— NLU 链尾气，一周后还在给同层打补丁。
- `a7e36d1` fix: kimi-k2 切 openai_json_xml 工具方言（kimi-k2 链第 0 步，05-07）。
- `f0a6598` docs: 加 kimi-k2 idle_empty 行为注释。
- `5269f04` fix: **ReferenceError context is not defined in streamResponse (#135)**。**深挖**（自伤实锤第 2 例）：streamResponse 内部引用外部作用域 `context` 变量——跟 acdaae5 同型错误（闭包作用域误用），5-02 修过一处，5-07 又炸另一处。修法：deps.context 透传。
- `a4b768a` fix(#134): PostAuth 请求加 X-Devin-Auth1-Token 头。
- `defe660` feat: RESPONSE_CACHE_ENABLED env 开关。
- `04c1500` fix(#134): PostAuth 空 proto body + raw token 解析（PR #144 @Await-d，社区贡献）。
- `7e5ae0e` (v2.0.91) release: #135 + #134 + #137 proxy parse + cache switch 打包。附带实测：7 模型 tool-call 全测，**kimi-k2 FAIL idle_empty**（上游问题，见 tmp-testing/comment-125.txt 证据落盘）。

## 05-08（7 条）——kimi-k2 三天三修 + #138

- `ea86e33` fix: **kimi-k2 上游 outage 检测** + content policy bypass 加固。**深挖**（kimi-k2 链第 1 修）：在 nonStreamResponse 的 tool_calls 处理循环内加 idle_empty 检测（`/^kimi/i` + 0 toolCalls + 0 text + 0 thinking → 502 upstream_model_unavailable + suggested_models）。同时 neutralizeIdentityForCascade 加 prompt-injection 形态过滤。
- `a0924be` chore: gitignore tmp-testing/（清理实测现场）。
- `f6651ce` fix: kimi-k2 502 带模型建议（第 2 修）：同一位置改注释、微调行为——diff 仅注释与措辞变化，说明第 1 修在实测里基本可用，只做语义澄清。
- `d942269` fix: **kimi-k2 空响应检测移到消息组装处**（第 3 修）。**深挖**：把检测从循环内部（NLU recovery 之前）整段删掉，挪到 cache 写入前的消息组装处——**检测位置决定语义**：放循环里会先于 NLU/narrate promote 触发，可能误伤合法输出；放组装处则空响应判定在一切 recovery 之后，语义是「最终产物为空才算 upstream outage」。
- `b0e4671` (v2.0.92) release: 打包。
- `dd5a4d1` feat(#138): /auth/login 支持 proxy 绑定。
- `5622824` fix: 移除未用 import + 无效 proxy 格式告警（#138 的清理尾巴）。

## 05-09 / 05-10（5 条）

- `c370caf` (05-09) chore: **把 CLAUDE.md 移出跟踪 + gitignore**——自伤第 5 项第 2 半，2.0.93 当天完成两次反复（05-07 放行 → 05-09 移除）。**深挖**：仅隔一天，无任何中间 commit 解释原因，纯规则反复。
- `aca8cb4` (v2.0.93) release。
- `3f8a58d` fix(#153): ToolSearch & WebFetch 进工具映射 + web_search_20250305 转 function tool。
- `f08c0c8` fix(#157): LS 二进制源升级 + 启动超时 30s + sticky proxy 检测扩展。
- `c457593` (v2.0.94) release。

## 05-12 / 05-13（7 条）——社区 PR 合并周

- `971eaca` fix(#175): 跨平台 language server 路径（@linqichenggg）。
- `d72b093` refactor(#173): dashboard UI cleanup（@datfooldive）。
- `549a775` feat(#163): LS 崩溃指数退避自动重启（@you922）。
- `626f71b` feat(#162): **sticky session 会话连续性**（@you922）——sticky-session 链起点。**深挖**：社区 PR 引入 per-callerKey 的账户绑定（getStickyBinding get/set/clear），为后续两周的深水区埋下全部伏笔：多用户隔离（body.user vs callerKey 双路径）、流式重试漏传、dashboard 无开关。
- `06dc8a5` (v2.0.95) release: 合并 #162 #163 #173 #175 + dashboard 宽度修复。
- `6b9e6d8` fix(#165 #174): **inflight stale 超时 + LS 实例上限**。**深挖**：`releaseAccount` 漏减 inflight 时账号被永久降权（#165 池死锁）；修法 `_inflightAt` 时间戳 + 60s 周期扫描、120s 超时自复位 + unref。同时 LS 实例设上限防内存爆炸（#174）。
- `632afca` (v2.0.96) release —— **8 天空窗前最后一条 commit**。

## 05-14 ~ 05-21（0 条）——停滞期（空窗分析见第三部分）

## 05-22（4 条）——v2.0.97 社区 PR 三连

- `8090033` (07:59) feat(#182): dashboard 批量导入解析改进（@lauvww）——**空窗后第一 commit**。
- `acac78a` (07:59) feat(#184): Astraflow provider 支持（@ucloudnb666）。
- `a6b7936` (07:59) feat(#181): **Cascade reuse 优化 + HTTPS proxy + 可配置池大小**（@Fermiz，任务点名）——reuse 优化线为 6-05 bridge 爆发供血。
- `54707dd` (09:01) release: 2.0.97 —— **本切片最后一个独立 release commit**。

## 05-23 / 05-24（0 条）——停滞期

## 05-25（11 条）——sticky-session 自查风暴（16:05 → 21:56）

- `11e953b` (16:05) fix(sticky-session): extractBodyCallerSubKey 当 body.user 存在时**独占**使用 —— 多用户隔离正确性修正，**自查风暴第 1 条**。
- `ab1db96` (16:05) fix(dashboard): log export 401 用 this.password 而非 sessionStorage —— 同分钟两条修复，回来先灭火。
- `43c7990` (16:07) docs: proxy-user-inject.js 多用户隔离示例。
- `60b5326` (19:40) feat(sticky-session): dashboard 开关（per-user model-ignoring binding 切换）——16:05 修完到 19:40 之间有 3 小时空档，疑似实机验证后发现问题扩大。
- `5e6fb51` (20:28) debug(sticky-session): get/set/clear 加 trace 日志 —— 风暴进入 debug 轰炸阶段。
- `bb2d497` (20:40) fix(messages): **防 :user: 双重打标**。**深挖**：proxy 已注入 body.user 时 callerKey 又被 stamp 一遍 `:user:`，导致 sticky key 分叉；修法 `alreadyUserScoped` 前置检查。修复与 debug 交错——说明 debug 日志暴露了新问题。
- `c898d76` (20:56) debug: get/set/clear 无条件日志（升级为无条件）。
- `8217639` (21:04) debug: getStickyBinding 顶部无条件 ENTER 日志。
- `3fcabe4` (21:12) debug(auth): getApiKey sticky 分支加 [sticky] CHECK/SKIP-CHECK 日志。
- `74db283` (21:45) fix(chat): **流式重试路径 waitForAccount 漏传 callerKey**。**深挖**：stream 路径 retry 时 `waitForAccountFn(..., modelKey)` 没传 callerKey → sticky 绑定失效 + 绑错账户——这是 5-25 风暴里最后一个被挖出的 bug，与 16:05 修的是同一条链路的另一端。
- `81858d4` (21:56) chore: PR-FLOW.md 进 gitignore。

**深挖小结**：11 条里 debug 5 条、fix 4 条、feat 1 条、docs 1 条、chore 1 条。模式是「下午修 2 个自以为完事 → 晚上实测发现还有问题 → debug 日志轰炸 1 小时（4 条 debug + 1 条穿插修复）→ 21:45 挖出流式路径漏传 → 收工」。

## 05-26 / 05-29（3 条）

- `7411c25` (05-26) feat(sticky-session): stickyNoFallback 开关——绑定账户失败时禁止轮换（5-25 风暴的直接产物，给运营方止血手段）。
- `f566ada` (05-29 14:50) fix(proxy): proxy-user 脚本保留 HTTP method，仅 POST/PUT/PATCH 注入 body.user——多用户隔离线的精细修正。
- `c736b6d` (05-29 16:52) feat(auth): getApiKey 加 user-aware 分片 tiebreaker——**4 天空窗前最后一条 commit**。

## 05-30 ~ 06-02（0 条）——停滞期

## 06-03（4 条）——#188 收尾（07:26 → 07:38，12 分钟四连）

- `9e1f17f` (07:26) fix: **3 bugs（tool-emulation flush、消息顺序、sticky session）+ contributors**——**空窗后第一 commit**，一早上连修三条。
- `f5425ff` (07:33) fix: sticky session 流式路径绑定破坏 + 多用户隔离（#188 @The-five-stooges）——**深挖**：5-25 自查风暴的最终外部收口：社区 PR #188 把流式路径的 sticky 绑定修掉，与 5-25 `74db283`（漏传 callerKey）同一病灶的另一面。
- `6ce8591` (07:36) fix(i18n): sticky session dashboard 面板补翻译。
- `542bb7c` (07:38) chore: 加 @The-five-stooges 到 contributors。

## 06-05（31 条，v2.0.97 → v2.0.122）——native bridge 爆发第一波

版本轨迹（每条自带 bump）：db2666b~682a700 仍在 v2.0.97 → 71f3f2c 起 v2.0.98 → 每 1~2 条升一个版本 → 收尾 faeee57 v2.0.122。**31 条 = 26 个版本号**。

- `db2666b` (v2.0.97) fix(update): LS 安装改走 install-ls 源（#192 线）。
- `e5e4442` (v2.0.97) fix(update): 支持灵活 LS env 解析。
- `14ad336` (v2.0.97) chore: 模型身份测试强制显式 API key（测试安全加固，凭证管理）。
- `682a700` (v2.0.97) fix: LS pool 与 native tool 路由加固。
- `71f3f2c` (v2.0.98) fix: LS capacity + release telemetry 加固。
- `b446460` (v2.0.99) fix: docker 打包 native bridge smoke 脚本。
- `d1c7ec1` (v2.0.99) fix: 降级正常短 cascade 回复（不要误报警）。
- `2f63907` (v2.0.100) stabilize: lsp admission + native bridge gates。**深挖**：README 新增 8 项 env——LS_MAX_INSTANCES（自适应默认 max 20）、LS_SPAWN_MIN_AVAILABLE_BYTES（700MB 内存护栏）、LS_PREWARM_PROXIES/ON_ACCOUNT_ADD（预热策略收紧，防批量导入打爆内存）、`WINDSURFAPI_NATIVE_TOOL_BRIDGE`（all_mapped vs partition 双模式）、`..._TOOLS/MODELS/PROVIDERS/ROUTES/CALLERS/ACCOUNTS/API_KEYS`（6 类灰度门，API_KEYS 匹配不明文透传）。**#115 从「猜根因」正式转「可观测 + 灰度」的标志**。
- `9e62a8f` (v2.0.101) harden: LS pool admission。
- `8bd4b63` (v2.0.102) fix(update): 对齐 LS 安装源（#192）。
- `3e133bb` (v2.0.102) merge pr #192: 对齐 ls install sources。
- `d7797e1` (v2.0.103) feat(lsp): 暴露 admission 遥测。
- `6913225` (v2.0.104) test(native): 扩展 bridge gray smoke。
- `3481647` (v2.0.105) test(native): 真 bridge smoke 加守卫。
- `90b1db5` (v2.0.106) fix(native): **bridge 工具调用后 return**。**深挖**：cascadeChat 拿到 native step 转成 tool_call 后仍继续轮询，等远程 LS 执行完 run_command 才返回——caller 早已拿到 tool_call 本地执行，双执行浪费 + 延迟。修法：nativeMode 下轮询到首个 native step 立即停。同条附 smoke 增强（失败不中断、failures[] 汇总）。
- `e817a48` (v2.0.107) fix(native): 传 env facts 给 bridge。
- `fea3134` (v2.0.108) test(native): **修 smoke done 检测**——smoke 自身逻辑修。
- `e939f02` (v2.0.109) test(native): 放开 allowlist 矩阵。
- `ad335d5` (v2.0.110) fix(native): 编码 bridge 工具配置别名。
- `e471729` (v2.0.111) fix(native): **Read 用 read_file allowlist**。**深挖**：实测证据——claude-4.5-haiku 真跑 smoke，`Read:read_file` 产生 top-level field-14 native step，`Read:view_file` 通常返回自然语言无 tool_call。修法：`nativeAllowlistNameForTool` 把 view_file 默认映射 read_file（对外仍译回 view_file）。
- `9cd8ebb` (v2.0.112) fix(lsp): 预留 pending starts + trace native proto。
- `898095d` (v2.0.113) fix(lsp): 重启隔离 + probe 维护。
- `7590db7` (v2.0.114) fix(native): list directory 步骤映射到 glob。
- `ce6a1da` (v2.0.115) feat(native): **暴露 bridge 遥测**。**深挖**：`GET /health?verbose=1` 加 6 类运行时计数器（requested tools / emitted tool calls / provider XML fallbacks / unmapped Cascade calls / no-tool-call responses / account-gate skips/rejects），流式非流式同源。proto 子配置 trace 含 find/run_command/view_file/list_dir/grep_v2 的字段号与 wire type——「不 dump 原始 prompt 也能对比真 IDE 与 proxy 请求差异」。
- `411d42a` (v2.0.116) test(native): smoke 加诊断。
- `a2eaec6` (v2.0.117) test(native): 强制 bridge smoke 源码。
- `6227ba3` (v2.0.118) test(native): 校验 smoke 工具参数。
- `b102203` (v2.0.119) test(native): smoke 与 LS capacity 隔离。
- `b912f5b` (v2.0.120) test(native): smoke 强制走 bridge gate。
- `d136204` (v2.0.121) fix(lsp): admission 加固 + native 工具选择。
- `faeee57` (v2.0.122) fix(lsp): probes 驻留化（探测不驱逐常驻 LS）。

## 06-06（17 条，v2.0.123 → v2.0.137）——爆发第二波

- `fc57ae1` (v2.0.123) fix(native): **收窄 bridge canary 默认值**。
- `306a07c` (v2.0.123) docs: 澄清 canary 范围——canary 收窄后立刻文档澄清「范围是啥」，边写边纠。
- `898e8c6` (v2.0.124) fix(native): trace web steps 但**不扩宽默认**——可观测性优先，行为保守。
- `74e814e` (v2.0.125) fix(native): 加 web tool 协议 lab hooks。
- `ebcb16d` (v2.0.126) fix(native): 确认 web tool 配置字段。
- `bc71ff6` (v2.0.127) feat(native): **暴露 bridge 决策与探针**（任务点名：决策路径 + 探针）。
- `02e4a6b` (v2.0.128) fix(docker): 打包运维探针脚本。
- `b0bca38` (v2.0.129) fix(native): **bridge gates 尊重请求模型**——灰度门按实际请求 model 判定而非默认值。
- `8de4146` (v2.0.130) fix(native): 解析 read wrapper 轨迹。
- `99a4b42` (v2.0.131) fix(native): read wrapper 路径解析守卫（防御层）。
- `a11c13c` (v2.0.132) fix(native): trace read wrapper 字段。
- `eb00b3b` (v2.0.133) fix(native): 分类 cascade 错误 trace。
- `6377cda` (v2.0.134) fix(native): **对齐 WebFetch document 协议**。
- `17a8b4a` (v2.0.135) feat(native): lab WebFetch approval 探针。
- `da95565` (v2.0.136) fix(audit): native lab gates + 持久化加固。
- `6ef7494` (v2.0.137) feat(dashboard): 账户分页 + release 扫描加固。
- `d374b25` (v2.0.137) ci: **force test runner exit in release gates**。**深挖**：CI release.yml 由 `node --test test/*.test.js` 改 `npm test` + timeout-minutes: 10——node --test runner 在 Windows/某些环境下不退出导致 gate 挂起，强制退出保证 release 门可判定。切片内最后一笔，且 6-06 还有 `452871c`（bounded release test gate，素材漏）紧随其后。

---

# 第二部分 · 问题链清单（6 条完整链）

## 链 1：#115 最长战线（5-02 ~ 6-06，35 天，五阶段）

**阶段 0 —— root cause 误判（5-02）**：
- `1026cd3` (2.0.62)：判定根因「GPT 不顺从文本协议 emulation」→ gpt_native dialect 伪装协议。
- `acdaae5` (2.0.62 hotfix 19:35)：**当日自爆**——nonStreamResponse 引用无作用域的 `body`，`body is not defined` 生产事故。
- `bda413a` (2.0.63)：hotfix 打包。
- `e2fc261` (2.0.64)：preamble 强化。

**阶段 1 —— 第一稿「真修」（5-02）**：
- `c047d06` (2.0.65)：688 行 cascade-native-bridge.js，声称真修，但 `canMapAllTools` 严格模式生产 0 触发。
- `9b383ea` (2.0.66)：partition 模式修正触发条件。
- `9ae100b` (2.0.67)：同天还在发 #112。

**阶段 2 —— 方向翻转（5-03）**：
- `5e5220c` (2.0.69)：partition 调试开关 + NO_EMUL 诊断 probe。
- `c50637f` (2.0.70)：probe 实测「GPT fabricate epoch 时间戳交差」→ 承认翻方向：GPT 退出 native bridge、Claude 默认 ON。anti-fabrication 第 4 条 + Edit/MultiEdit 真编 + web_search 修映射 + apply_patch sentinel + 流式 emit。自陈「真验证未完成」。

**阶段 3 —— NLU 层（5-03 ~ 5-07，并入链 3）**：
- `a4216be` (2.0.72)：NLU intent extractor 从 narrate 反向抠 tool_call（第三条技术路线）。
- `201889c` ~ `7bba0c3` (2.0.73~83)：七连 hotfix。

**阶段 4 —— native bridge 终章（6-05/06，48 条）**：
- 以「可观测 + 灰度 + 测试体系」形态全面重做：遥测（`ce6a1da`/`bc71ff6`/`d7797e1`）、灰度门 6 类 env（`2f63907`）、canary 收窄（`fc57ae1` + `306a07c` 澄清）、9 条 smoke 测试线（`b912f5b` 等）、read wrapper 三连（`8de4146`→`99a4b42`→`a11c13c`）、WebFetch 协议对齐（`6377cda`/`17a8b4a`）。版本号 2.0.98→2.0.137 全部隐式 release。

**链形态**：误判根因 → 当日自爆 → 严格模式 0 触发 → probe 打脸翻方向 → 换 NLU 路线 → 七连 hotfix 收不了尾 → 停滞两周 → 以工程化形态（测试+遥测+灰度）重做收场。六天内四易其稿，35 天后以完全不同的方法论兑现。

## 链 2：#129 wnfilm 回归三连（5-04 当天完成）

- `9156063` (2.0.85)：auto-fallback 默认 ON（wrapper 改 body.model 重发）。
- `80d6079` (2.0.86)：wnfilm 抓副作用——fallback 后 client 失忆。根因：fingerprint 锁 modelKey，fallback 后的 cascade 存到新 model 下，原 model 请求 reuse MISS + client 不重发 history = 空 history 失忆。默认 OFF。自陈「ship 默认 ON 是仓促」。
- `9a404a0` (2.0.87)：真修——`checkin` 接受 fingerprint 数组（`__aliasModelKey` 双挂），默认 ON 安全开回。

**链形态**：一天内 ON→OFF→真修 ON。85 上线的缺陷 86 当天被社区抓，87 同天补真修。是「社区当 QA」模式的典型样本，与 5-25/6-03 的 sticky 同构。

## 链 3：NLU 七连 hotfix（2.0.72 ~ 2.0.83，一周 8 个补丁）

- `a4216be` (2.0.72)：NLU intent extractor 三层 extraction 上线。
- `201889c` (2.0.73)：allThinking 通道漏——promote 顺序导致 markers 检测整段跳过。
- `52c75eb` (2.0.74)：两条没人接的超时 + reuse miss（同层积压）。
- `8592fb0` (2.0.75)：**Claude 工具卡死回归**——NLU 改动波及 native bridge 路径。
- `5ad5515` (2.0.76)：误抠 placeholder（实测追加）。
- `ba6f5ee` (2.0.77)：入口扩宽（实测发现真问题）。
- `c793899` (2.0.82)：retry-with-correction（#125，自称真正兼容层）。
- `0489823` (2.0.82 追加)：action-verb 兜底（GLM-5.1 不点名工具）。
- `7bba0c3` (2.0.83)：Pass 2 fallback 打包。
- 尾气：`22578d2` (5-07) 自动启用 GLM/Kimi + 600KB 预算。

**链形态**：2.0.72 上线当周 8 个补丁（73/75/76/77/82/83 直改 NLU，74/84 邻域）。每次都是「实测发现前一版漏路径」。5-03 的 20 条 release 里 8 条是这条链，是 5-03「release 暴雨」的骨架。

## 链 4：sticky-session 自查风暴（5-12 引入 → 5-25 一天 11 条 → 6-03 外部收口）

- `626f71b` (5-12)：社区 PR #162 引入 sticky session（get/set/clear 绑定）。
- `549a775` (5-12)：#163 LS 自动重启（同 PR 作者）。
- `06dc8a5` (5-12)：v2.0.95 合并。
- **5-25 风暴**：`11e953b`（16:05 body.user 独占）→ `ab1db96`（16:05 dashboard 401）→ `43c7990`（docs）→ `60b5326`（19:40 开关）→ `5e6fb51`（20:28 debug）→ `bb2d497`（20:40 双重打标）→ `c898d76`/`8217639`/`3fcabe4`（20:56~21:12 debug 轰炸）→ `74db283`（21:45 流式漏传 callerKey）→ `81858d4`（21:56 chore）。
- `7411c25` (5-26)：stickyNoFallback 止血开关。
- `f5425ff`/`9e1f17f` (6-03)：**社区 PR #188 收口**——流式路径绑定破坏 + 多用户隔离 + tool-emulation flush + 消息顺序，12 分钟四连。

**链形态**：自己合并的功能自己发现 bug 自己修（5-25 的 11 条 debug/fix），修完 6 天后社区 PR 又来修同一层的流式路径——5-25 修到 non-stream 语义（body.user 优先级、双重打标），6-03 修 stream 实际绑定，两段合起来才是完整修复。debug 提交占比 5/11 反常，是「线上排查未遂 → 铺日志 → 挖出真 bug」的标准流程留痕。

## 链 5：#114 OTT 端点紧急事故（5-02 ~ 5-04 + 6-03）

- `b8c0554` (2.0.61, 5-02)：第一波——「新 host sessionToken 旧 host 拒识」→ preferredHost pin 修。
- `8592fb0` (2.0.75, 5-03)：登录 cross-host 重构（同层加固）。
- `fd031fd` (2.0.90, 5-04)：**端点全坏紧急绕路**——12/12 实测 401，判定 GetOneTimeAuthToken 上游废弃；反向工程 windsurf-assistant 跳过 OTT；sessionToken 直接当 apiKey 4/4 通；60 行塌 10 行。
- `a1eb82e` (5-05)：补 circuit breaker stats（#114 #123 #132，4 HIGH 出自 dual-audit）。
- 尾气：`dd5a4d1`/`5622824` (5-08) #138 proxy 绑定（登录链路再加固）。

**链形态**：两波——第一波当路径问题修（preferredHost），第二波发现是端点整体废弃（上游迁移 Devin，OTT 停用），只能绕路。2.0.61 的「根因」在 2.0.90 被推翻。上游生态变迁（Cognition→Devin 迁移）是这条链的真正驱动，proxy 侧只能追着绕。

## 链 6：kimi-k2 上游 outage 三天三修（5-07 ~ 5-08）

- `a7e36d1` (5-07)：方言切 openai_json_xml（kimi 在 cascade 后端调工具的前置）。
- `f0a6598` (5-07)：idle_empty 行为注释。
- `ea86e33` (5-08)：idle_empty 检测上线（循环内位置）——同 commit 还做 content policy bypass 加固。
- `f6651ce` (5-08)：502 带模型建议（同位置微调）。
- `d942269` (5-08)：**检测位置移至消息组装处**（从 NLU recovery 之前移到 cache 写入之前，语义修正）。

**链形态**：同源问题（上游 idle_empty）三天内三改检测逻辑，最后通过「挪位置」完成语义修正——从「早判早退」到「一切 recovery 之后才判定」。同日还有 `5269f04`（#135 context crash，第二个自伤），5-07 是集中翻车日。

## 链 7（补充）：CLAUDE.md 两天反复（自伤）

`ace8e5a` (5-07) 放行进仓 → `c370caf` (5-09) 移出 + gitignore。无中间解释。

---

# 第三部分 · 停滞期分析（空窗衔接）

## 空窗 1：05-14 ~ 05-21（8 天，最长）

- **空窗前最后**：`632afca`（5-13，release 2.0.96，打包 #165/#174 修复）——收在「上一批工作完整交付」的干净节点。
- **空窗后第一**：`8090033`（5-22 07:59，合并 #182 dashboard 批量导入）——回来第一动作是合并三个社区 PR（#182/#184/#181 同为 07:59）并发 2.0.97（09:01）。
- **判断**：前后都是社区 PR 合并 + release，**空窗期没有任何本地开发的半成品残留在窗后**。结合 6-05 以「48 条、40 个版本号、测试/遥测/灰度全套」落地 #115 终章——这个空窗是「离线研究期」：研究完 native bridge 的正确工程形态（测试先行、灰度门、遥测），6-05 才一次性兑现。空窗内的产出不是 commit，是方法论。

## 空窗 2：05-23 ~ 05-24（2 天）

- **空窗前最后**：`54707dd`（5-22 09:01，release 2.0.97）——三个社区 PR 合并后的发布节点。
- **空窗后第一**：`11e953b`（5-25 16:05，sticky body.user 独占修复）——**回来第一笔是修复**，且同分钟还有 `ab1db96`（dashboard 401）。说明 2.0.97 上线后两天有人在跑、暴露了多用户隔离问题，5-25 一开门就灭火，随即演变成 11 条自查风暴。
- **判断**：2 天空窗更像「发布后的观察期」，窗后首笔即 bug 修复，与空窗 1 的「研究期」性质不同。

## 空窗 3：05-30 ~ 06-02（4 天）

- **空窗前最后**：`c736b6d`（5-29 16:52，getApiKey user-aware 分片 tiebreaker）——sticky 深水区工作正常推进中。
- **空窗后第一**：`9e1f17f`（6-03 07:26，3 bugs：tool-emulation flush、消息顺序、sticky session）——**回来第一笔就是三连 bug 修复**，然后 12 分钟内连发 4 条收口 #188。
- **判断**：窗后首笔是「多条 bug 一次性修」，窗前的 5-26/5-29 工作（stickyNoFallback、分片 tiebreaker）是 #188 修复的铺垫。这个空窗 4 天，紧接 6-05 的 48 条爆发——同样是「酝酿→落地」节奏，但与空窗 1 不同：空窗 1 前后无 bug 残留，空窗 3 后第一件事就是清 bug 积压。

## 综合判断

| 空窗 | 天数 | 窗前最后动作 | 窗后第一动作 | 性质 |
|---|---|---|---|---|
| 05-14~21 | 8 | 交付干净（2.0.96） | 合并社区 PR | 离线研究期（#115 方法论成型） |
| 05-23~24 | 2 | 发布节点（2.0.97） | 修复 2 条（16:05 双发） | 发布后观察/扑火 |
| 05-30~06-02 | 4 | 推进中（分片 tiebreaker） | 三连 bug 修复 | 酝酿期（#188 收口 + bridge 爆发前） |

三处空窗共性：**都是「回来先做非自研动作」**（合并 PR / 修社区报的 bug），没有一处空窗后第一笔是「续写自己的半成品」——强烈支持「停滞期是离线工作（研究、调试、规划）而非停工」的假说。空窗 1 的 8 天产出的是 6-05 的整套工程方法论（遥测 + 灰度 + 测试线），空窗 3 的 4 天衔接了 sticky 深水区收尾与 bridge 爆发。

---

# 附 · 结构性发现汇总

1. **隐式 release 模式**（v2.0.98~137）：5-22 之后 release commit 消失，package.json bump + RELEASE_NOTES 内嵌进 feature/fix commit。6-05/06 两天 48 条 = 40 个版本号。5-03 的暴雨日（20 条/17 版本）是前奏，但仍是独立 release commit；6-05 起彻底并轨。
2. **社区贡献占比**：146 条中至少 15 条来自社区 PR（#144/#162/#163/#173/#175/#181/#182/#184/#188/#192），集中在 5-12（合并周）、5-22（三连）、6-03（收口）。社区 PR 的质量直接决定 5-25 风暴与 6-03 收口的形态。
3. **自伤模式三重复现**：acdaae5（body 作用域）、5269f04（context 作用域）同型；#129 当天 ON-OFF-真修；#115 六天四易其稿。审计文化（dual-audit 2.0.88/89）在 5-03~05-04 短暂出现后未延续，6-05 的测试线（9 条 smoke）是第二次尝试制度化。
4. **凭证纪律**：本片 146 条 commit 无任何凭证泄漏迹象（14ad336 反而强制测试用显式 API key）；本账也未输出任何凭证。

## 未解决/留待下片

- #115 的最终验证状态（6-05/06 后是否真稳定）需查 6-07 之后（`1335f89` v2.0.138 起）。
- 452871c（bounded release test gate）与 6-07 四条属下片账。
- 5-25 风暴中 `c898d76`/`8217639`/`3fcabe4` 三条 debug 日志是否随 6-03 #188 清理，需看后续 commit。
