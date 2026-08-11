# WindsurfAPI 记账本 v2 · 精细账章节 · 时间片 2026-04-21 ~ 2026-05-01（含 05-01 尾巴 4 条）

来源：`/tmp/ledger-slice-4-late.txt`（265 条，逆序）。全部 hash 经 `git cat-file -e` 核实存在（0 缺失），逐条 file-level diff 统计来自 `git log --stat` 与 `git show` 实测。

## 0. 数据口径

- 265 条 commit，按来源文件逆序（最新在前）逐条入账，**无遗漏**。
- 表列：`hash | 日期 | 聚类 | 干了什么（含 diff 细节） | 关联`。聚类沿用 v1 的 A-H 八类 + M(merge)。
- `(深挖 §3.N)` = 该条在 §3 有逻辑级深挖（共 36 条，超过要求的 25 条）。
- merge 提交无源码 diff，账目记「合并分支」，关联记 PR/分支名。
- 凭证相关改动只记「去掉硬编码凭据」这类事实，任何值不落账。

### 聚类分布

| 聚类 | 主题 | 条数 |
|---|---|---|
| A | Cascade 会话复用 / 上下文（#24 家族、#93） | ~33 |
| B | 工具调用解析与仿真（#22 家族、#86 方言、#77） | ~25 |
| C | 协议面：/v1/responses、Anthropic 兼容、stream 硬化 | ~21 |
| D | 模型目录 / 路由 / tier 探测 / JSON 结构化 | ~28 |
| E | Dashboard / i18n / 图表 / 登录 | ~45 |
| F | 安全加固（SSRF、auth、redact、指纹） | ~24 |
| G | 发布 / 基建 / CI / docker / 脚本 | ~40 |
| H | 调试 / 文档 / 杂项 | ~23 |
| M | merge / release 纯账目 | ~26 |

## 1. 逐条 commit 账（265 条）

| hash | 日期 | 聚类 | 干了什么（含 diff 细节） | 关联 |
|---|---|---|---|---|
| a24855f | 05-01 | G | docker 一键自更新三连炸一起修：`docker-self-update.js` 创建 sidecar 前补 `dockerPull(DEPLOYER_IMAGE)`，新增独立 `deployer-pull-failed` reason 码（原来只拉应用镜像，新主机首次点按钮 `POST /containers/create` 直接 404 `No such image: docker:24-cli`）；`index.html` `applyUpdate()` 错误分支从 `r.detail || r.reason` 改 `translateError(r.reason)` + detail 仅作后缀（detail 是上游 docker 原始长串，会被当 i18n key 拼成 `error.<长串>`）；`I18n.t` zh-CN fallback 的 `querySelector` 加 `/^[A-Za-z0-9_.-]+$/` charset 校验 + `CSS.escape()` + try/catch（`"` `{` `:` 等 CSS 元字符会让 selector 抛 SyntaxError，红字直出 UI）；i18n 补 5 个 reason key；`test/docker-self-update.test.js` +4 钉死调用顺序 | v2.0.48；(深挖 §3.30) |
| 04bb2ad | 05-01 | A | #108 代理 workspace 脚手架不再被当成用户项目：`client.js` `ensureWorkspaceDir` 脚手架改名 `proxy-workspace-stub`（package.json name/description 直白写「NOT the user project」、README 首行 `# Proxy workspace placeholder`、删掉 `src/index.js` Hello-world、git commit 改 `proxy stub`），新增 `isLegacyScaffold()` 迁移检测（读 package.json name，旧值即重写 + 删 src/ + 记日志）；`tool-emulation.js` 四个 preamble tier（full/schema-compact/skinny/compact）的 Environment facts 块统一追加 `WORKSPACE_STUB_OVERRIDE` 中性陈述句（措辞避开 PR #51 banned 的 `ignore prior`/`for this request only`，只在有 env cwd 时注入）；`test/workspace-stub-108.test.js` 10 case 覆盖 | #108；(深挖 §3.31) |
| 222526b | 05-01 | A | #107 follow-up：`client.js` SendUserCascadeMessage 遇 `untrusted workspace` 重试 + `UpdateWorkspaceTrust` 静默失败升级为可感知（`handleWarmupError` 原来对非 transport 错误只 warn 不抛，trust 悄悄失败后 warmup 照常打印「workspace init complete」误导，第一条真请求才被 LS 拒）；per-Send retry 循环补 trust 重建路径；`test/untrusted-workspace-retry.test.js` 77 行 | #107 |
| b4a9ebf | 05-01 | A | #106/#107：Claude Code 2.x 的 cwd 提取补两个格式窟窿——`handlers/chat.js` 新增对 system prompt 侧 `# Environment` 块 ` - Primary working directory: D:\Project\foo`（bullet 前缀）与形容词句式（`You are in a ...`）两套新措辞的匹配（v2.0.44 只修了 user message 侧，system 侧 Claude Code 2.x 改了措辞老正则不认，`env NOT lifted` 26KB system prompt 里裸奔）；`test/caller-environment.test.js` +90 | #106, #107；(深挖 §3.31) |
| c878669 | 04-30 | A | #100 follow-up：`handlers/chat.js` `scanUserMessageForBareCwd` 加 pass 2——pass 1 抓不到时先剥掉全部 `<system-reminder>...</system-reminder>` 块再对前 500 字符跑同一锚定正则（yunduobaba 根因：Claude Code hooks 在消息头注入大量 reminder 块，真路径 `C:\Users\...分析下这个项目` 被推到 300 字符 head 之外）；约束保持：只扫第一条 user 消息、剥后路径仍须是首个 token、无 reminder 标记直接 skip pass 2；`test/caller-environment.test.js` +50 | #100 |
| 4efd0e3 | 04-30 | D | #103+#104 一起修：`dashboard/model-access.js` `isModelAllowed` 加 `-thinking` 兄弟继承（`siblingsForAllowlist`：base↔`-thinking` 双向认，allowlist/blocklist 都生效；`-fast`/`-1m`/`-high`/`-mini`/`-codex`/`-max-*` 刻意不继承——那些是不同 entitlement）；`handlers/chat.js` `applyJsonResponseHint` **只注入 system message**、删 `appendJsonHintToContent` helper、清 `extractRequestedJsonKeys` 里 split 旧后缀死代码（根因：早期版本把长 JSON-only 指令 append 到最近 user message 尾部，被 cascade 上游存进 trajectory，下一轮复用同一个 cascade 时模型仍按旧暗示走 JSON 模式，`你好` 回 `{"reply":"你好"}`）；`test/model-access-thinking-inheritance.test.js` 96 行 + messages.test +67 | #103, #104；(深挖 §3.28) |
| 1a59503 | 04-30 | F | 2.0.42 审计驱动三处加固：`cache.js` `cacheKey(body, callerKey)`——原来只 hash body，用户 A 与 B 同模型同短句会跨租户串读缓存（P0，补 caller 维度 + `\0` 分隔防拼接伪造）；`conversation-pool.js` checkout 先验证指纹再删（防误删他人 entry）；新建 `fs-atomic.js`，dashboard 4 个 JSON 写文件改原子写（tmp + rename，防 SIGTERM 截断丢配置）；`test/audit-fixes.test.js` 199 行 14 条回归，457/457 | v2.0.42；(深挖 §3.32) |
| 5fb400f | 04-30 | G | LS 更新 ETXTBSY 修复 + docker 一键自更新（opt-in）：`install-ls.sh` 改下载 `${TARGET}.new.$$` 兄弟文件 + chmod +x + `mv -f` 原子替换（Linux 对正在 exec 的 ELF `O_WRONLY|O_TRUNC` 返回 ETXTBSY "Text file busy"，curl 直覆写必挂）；新增 `docker-self-update.js` 252 行（detectDockerSelfUpdate → dockerPull → docker.sock 起 `docker:24-cli` sidecar 跑 `docker compose up -d`）；`docker-compose.yml` 注释掉的 `/var/run/docker.sock` 挂载 + 安全警告；`test/install-ls-atomic-rename.test.js` +63 | v2.0.41；(深挖 §3.35) |
| 31578fd | 04-30 | G | Probe 锁从全局布尔改 per-account `Map<id, Promise>`（`_probeInFlight` 全局锁导致同时探测多个账号时后进的全被 `return null` 顶回，dashboard 把 null 一律当「Account not found」404 弹 toast——截图实锤的假错误）；`auth.js` +34；dashboard 新增一键 LS binary 更新（`api.js` +133、`langserver.js` 加更新端点）；`test/probe-lock-per-account.test.js` +65 | v2.0.40；(深挖 §3.35) |
| ef41682 | 04-30 | E | 恢复 `/auth/login` email 模式：`auth.js` `addAccountByEmail` 拆掉一行 stub（`throw new Error('Direct email/password login is not supported...')`），接进 dashboard 现成的 `windsurfLogin` → `addAccountByKey` → `setAccountTokens` 管线，`account.method='email'` 标记来源，Firebase refreshToken 落盘供后台续期；`windsurf-login.js` `fetchCheckUserLoginMethod` 用 `hasOwnProperty` 显式查 `userExists`/`hasPassword`，两字段都缺（Vercel edge 偶发 `{}`）返回 null 触发 `/_devin-auth/connections` 回退，保留 `hasPassword:false` 的 ERR_NO_PASSWORD_SET 友好报错；`test/addaccount-by-email.test.js` 92 行；VPS 实测 3 账号 batch 全 active | v2.0.39；(深挖 §3.29) |
| 4a96d92 | 04-30 | A | 一波三连：#100 cwd fallback——`extractCallerEnvironment` 无 env block 时扫第一条 user message 开头裸绝对路径（`^[A-Z]:[\\/]` / `^\/[A-Za-z]` / `^~[\\/]` 三种 shape，文件后缀拒、路径须是首个 token）；#101 cascade 超时后轨迹失效——超时 invalidate 坏轨迹不再放回池，下一轮不再命中坏 entry 丢上下文；#102 kimi-k2-6 方言补充；`chat.js` +83、`tool-emulation.js` +15；三个新测试文件共 ~190 行 | #100, #101, #102；(深挖 §3.36) |
| 599ddf0 | 04-30 | A | #93 follow-up：apiKey 模式 cascade reuse 不工作——`caller-key.js` `callerKeyFromRequest` 在 apiKey 存在但 body 无 `:user:` 信号时原来直接返 `api:<hash>`，`hasPerUserScope` 判 false 导致 reuse 全程禁用（单用户 apikey 跑 claudecode 每次 cascadeId 都换、msgs 涨到 52 全 reuse=false）；修：无 bodySubKey 时自动拼 `:client:<ip+ua-hash>` fallback subkey；`chat.js` +5；`test/caller-key.test.js` +56 | #93；(深挖 §3.33) |
| 1d5b61c | 04-30 | C | #93+#98：`handlers/chat.js` 修 `routingModelKey is not defined` ReferenceError——v2.0.33 GLM5.1 silence fallback 在 `streamResponse`（参数名 `modelKey`）里用对象 shorthand `{ routingModelKey }` 引用不存在的变量，**每个 stream 完结必崩一次**（正常响应已发完、结尾爆 upstream_error）；修：`shouldFallbackThinkingToText` 签名从 `body` 改 `wantThinking` boolean，在 `handleChatCompletions` 一次算好透传；#98 workspace 标记被 shell 解析（`tool-emulation.js` 补转义）；相关测试同步改 | #93, #98；(深挖 §3.33) |
| ca96019 | 04-30 | C | #97：Chat/RESPONSE/Messages 三个响应统一加 `Cache-Control: no-store`（`server.js` +5、chat/messages/responses 各 2 行），测试 +102；顺带 repo 卫生：release notes 全部归位 `docs/releases/`、.gitignore 补、workflow 微调，39 文件 | #97 |
| a742d85 | 04-30 | M | release v2.0.34——fresh-account 403 race 修复版（QQ 群报告），只动 version + release notes | v2.0.34 |
| c5e5be6 | 04-30 | M | merge：tier-unknown 403 race 修复分支 | — |
| 91b2441 | 04-30 | D | fresh account 不再全模型 403：根因是新号 `tier='unknown'` 只放行 `[gemini-2.5-flash]`，110/111 模型在 probe 完成前全被 `anyEligible` 预检 403 `model_not_entitled`（QQ 群「获取不到模型/添加账号后不能调用」）；修：`models.js` `MODEL_TIER_ACCESS.unknown` 乐观放行**全量 pro 目录**（`Object.keys(MODELS)`，真实权益错误交给上游 LS 返回更准确），`chat.js` 检测 `!userStatusLastFetched` 的未 probe 账号返回 `probe_pending` 错误类型 + 提示「请稍候 10-30 秒或手动 Probe」；`test/tier-unknown-optimistic.test.js` 67 行 | QQ 群；(深挖 §3.27) |
| 9af5e20 | 04-30 | M | release v2.0.33——#93 cascade reuse + #96 marker + GLM5.1 silence | v2.0.33 |
| 8f7a9f5 | 04-30 | M | merge：GLM5.1 silence——thinking 提升为 content | — |
| 4a882a0 | 04-30 | M | merge：#96 workspace marker + system-prompt hint | — |
| 6ab39a4 | 04-30 | M | merge：#93 cascade reuse（Sonnet 4.6 thinking） | — |
| 0984875 | 04-30 | B | #86 follow-up：GLM 5.1（非 reasoning 模型）静默无输出——cascade 上游把整段响应打包进 `step.thinking` 而非 `step.responseText`，客户端默认隐藏 reasoning_content 只见「thinking」指示无文字；修：新增 `shouldFallbackThinkingToText`——stream 结束时对**非 reasoning 模型**（未显式要 thinking、没落 -thinking 变体）且只有 thinking 无 text/tool_calls 时，把 thinking 提升为 content delta；`chat.js` +54，`test/thinking-fallback-glm.test.js` 131 行 | #86；(深挖 §3.34) |
| 8539d2e | 04-30 | A | #96：workspace 路径 marker 从省略号 `…` 改成 `<workspace>` 文本 + 四档 preamble 追加 `WORKSPACE_PATH_HINT`（`Your sandbox workspace path is hidden from the user; if asked for path/cwd, say real path unavailable...`）——省略号会被 Sonnet 4.6 在散文里复读成「your path is …」造成问答回声循环；`sanitize.js` 占位符体系再迭代；`test/sanitize-marker-no-loop.test.js` +50 | #96；(深挖 §3.34) |
| eeff104 | 04-30 | A | #93：Sonnet 4.6 thinking 开 cascade reuse——`isToolEmulatedReusableModel` 从只认 Opus 4.6/4.7 扩展到 sonnet-4.6（`WINDSURFAPI_DISABLE_SONNET_TOOL_REUSE=1` 可关）；`chat.js` +25、`test/chat-reuse.test.js` +31 | #93；(深挖 §3.33) |
| 6fe337e | 04-29 | M | release v2.0.32——#94 Opus 4.7 thinking + #87 Docker self-update + #86 follow-ups | v2.0.32 |
| 6f20680 | 04-29 | M | merge v2.0.32（#87 Docker self-update graceful unavailable） | — |
| 1c40d46 | 04-29 | G | #87：Docker self-update 不可用状态优雅降级——`dashboard/api.js` +42 检测无 docker.sock / 非 docker 环境返回明确状态码，UI 显示「不可用」而非报错；`test/self-update-docker.test.js` +100 | #87 |
| 3ebd658 | 04-29 | D | #94：`claude-opus-4-7` thinking 自动路由关闭——`chat.js` +25：对 opus-4-7 不再自动切 `-thinking` 变体（上游不支持或路由出错），`test/thinking-routing.test.js` +11 | #94 |
| 946a14f | 04-29 | E | dashboard i18n centralization（PR #92 smeinecke）+ Windows 路径 sanitizer（#86 follow-up）：`index.html` +25 收拢翻译入口；`sanitize.js` +23 处理 `\` 分隔的 Windows 路径泄漏；`test/sanitize.test.js` +33 | PR #92, #86 |
| 5b86ca8 | 04-29 | M | release v2.0.31——GLM/Kimi tool dialect（#86） | v2.0.31 |
| 1f055a9 | 04-29 | M | merge v2.0.31（#86 方言） | — |
| 9c2dc30 | 04-29 | B | #86：GLM/Kimi tool-call 方言支持——`tool-emulation.js` +365 重构：新增 `pickToolDialect` 按模型选方言，4 种 preamble 变体（标准/glm47/kimi_k2 等），GLM 4.7/5/5.1 的 `<tool_call>NAME<arg_key>` 与 Kimi K2 的 `<|tool_calls_section_begin|>` 两套解析器 + 历史序列化回写原方言（此前这两种格式被静默丢弃：finish_reason=stop 但 tool_calls 空）；`chat.js` +62；`test/tool-emulation.test.js` +199 | #86；(深挖 §3.25) |
| 07d3df1 | 04-29 | M | 2.0.30——三层 AI 审计完成（3×Spark workers + GPT-5.5 reviewer + Claude spot-check），纯 release notes | v2.0.30 |
| 1e1f334 | 04-29 | M | merge：解 spark-B/C 的 alias 测试冲突 + 重新生成 docs | — |
| 92ccf6d | 04-29 | M | merge spark-C：3 个缺失 Opus 4.7 alias + 6 条 catalog 测试 | — |
| 1f57bab | 04-29 | M | merge spark-B：11 新测试 + gen-docs 幂等修复 | — |
| 4406bd2 | 04-29 | M | merge spark-A：local-windsurf import 安全加固 | — |
| 18e9b7b | 04-29 | D | audit(spark-C)：catalog 正确性——`models.js` +3 补 Opus 4.7 alias 缺口，`test/models-catalog-correctness.test.js` 66 行 | — |
| f6b770a | 04-29 | G | audit(spark-B)：11 条新测试横跨 models/proxy/i18n/gen-docs + `gen-docs-models.js` 幂等修复（重复跑不产生 diff）；`test/gen-docs-models.test.js` 133 行 | — |
| 810ab0d | 04-29 | F | audit(spark-A)：local-windsurf 凭证导入安全加固——`local-windsurf.js` 198 行重写：loopback bind gate（导入只允许本机来源）、sqlite 资源上限、路径掩码防误导外部文件；`test/local-windsurf-security.test.js` 97 行 | — |
| bb5cc75 | 04-29 | D | 2.0.29：模型目录补全——`models.js` +44（Opus 4.7 全系 + Adaptive + 缺失变体）、`scripts/gen-docs-models.js` +82 加 GitHub Pages 自动同步（docs/index.html +148）、README 同步 | v2.0.29 |
| 7299d4a | 04-29 | E | 2.0.28：本地 Windsurf 凭证导入（#91）——`dashboard/local-windsurf.js` 186 行新模块（扫描本机 Windsurf 配置目录导入账号）、`api.js` +70 导入端点、UI +62、i18n；PR #90 proxy 顺序修正（`account-add-proxy-ordering.test.js` +123） | #91, PR #90 |
| ce9dfba | 04-29 | M | merge PR #90（smeinecke：add-account proxy 支持） | — |
| a24dbd8 | 04-28 | E | PR #90 主体：single-add 表单加 per-account proxy 字段——`api.js` +17、`index.html` +12、i18n 双语 | PR #90 |
| b933fb8 | 04-29 | E | 2.0.27：i18n guard 收尾——`check-i18n.js` 校验逻辑 +10、补 7 处 key、`index.html` -5 | v2.0.27 |
| 8d2bfc8 | 04-29 | M | merge PR #88（smeinecke：ALLOW_PRIVATE_PROXY_HOSTS） | — |
| e2c951b | 04-29 | M | merge PR #89（smeinecke：missing i18n） | — |
| 41fc303 | 04-29 | E | 2.0.26：dashboard 登录「没反应」修复——`index-sketch.html` +46 / `index.html` +40：提交前 pre-flight 校验（空表单/格式错直接 inline error，不再静默失败） | v2.0.26 |
| 38398c4 | 04-29 | A | 2.0.25：Cascade conversation reuse 全面加固（codex 审计 7 条整改）——`conversation-pool.js` 387 行重写：HIGH-1 fingerprint 升级 server-state 语义 key（version:2、systemDigest、toolContextDigest、canonicalContentBlock、stableStringify，正确性优先于命中率）；HIGH-2 expired cascade 必须 fresh fallback + 坏 entry 不可 restore（6 处 restore 路径跳过）；HIGH-3 caller isolation 扩展到 chat/responses（per-user scope）；+3 MED（tool schema digest、TTL 策略、原子 checkout）+2 LOW；`client.js` +53、`langserver.js` +34；15 新测试，311/311 | v2.0.25；(深挖 §3.24) |
| d8c63a3 | 04-29 | E | 2.0.24：dashboard UX 三件套（代理输入移到页面底部 + 饼图悬浮 + 手绘草稿风同步）：`index.html` +99、`index-sketch.html` +112 | v2.0.24 |
| 1e773a3 | 04-29 | E | 2.0.23：OAuth backup-login URL 改用 Windsurf 2.0.67 editor 真实模板——`index.html` +14 | v2.0.23 |
| 1928f05 | 04-29 | E | 2.0.22：OAuth-only 账号一键 token 入池——`index.html` +39（OAuth 账号无密码场景直接走 token 导入）、i18n | v2.0.22 |
| 4b555bb | 04-29 | G | 2.0.21 hotfix：回退 v2.0.19 的 GRPC_PROTOCOL Connect 默认——`grpc.js` `USE_CONNECT = process.env.GRPC_PROTOCOL !== 'grpc'` 改回 `=== 'connect'`，注释记下 v2.0.20 实测的 StartCascade 空 cascade_id 问题；测试翻转回 legacy 默认；**作者 postmortem 自己写了：单测只验 const 取值，没起 fake LS 端到端验 Connect framing** | v2.0.21；(深挖 §3.26) |
| 9f13cc5 | 04-29 | G | 2.0.20：RPC 序列对齐——`windsurf.js` 新增 `buildHeartbeatRequest` + `buildUpdatePanelStateWithUserStatusRequest` + `extractUserStatusBytes`（wire 层 byte-for-byte pass-through）；`client.js` Heartbeat 挂到 workspace warmup 链尾（InitializeCascadePanelState → AddTrackedWorkspace → UpdateWorkspaceTrust → Heartbeat，失败只 warn），GetUserStatus 后 fire-and-forget UpdatePanelStateWithUserStatus（不 await 不影响返回值）；覆盖 171 个 LS method 中的第 11/12 个 | v2.0.20；(深挖 §3.26) |
| 04616c6 | 04-29 | G | 2.0.19：fingerprint 刷新 + transport 默认修正——`windsurf.js` `buildMetadata` 版本默认 `1.9600.41`（不存在的版本）→ `2.0.67`（真实 Windsurf stable）+ `WINDSURF_CLIENT_VERSION` env override；`grpc.js` `USE_CONNECT = process.env.GRPC_PROTOCOL === 'connect'` 改成 `!== 'grpc'`（注释说 Connect 默认、代码是显式 opt-in，**修注释/代码不一致**）——这个「看起来非破坏」的改动成为 F1 事故源头 | v2.0.19；(深挖 §3.26) |
| 454604f | 04-28 | H | docs：ALLOW_PRIVATE_PROXY_HOSTS 进 README env 表（en/zh 各 1 行） | — |
| e61580e | 04-29 | F | `scripts/vps-exec.py` 改 env 驱动（55+/18-），**去掉硬编码 SSH 凭据**（凭据卫生，值不落账） | — |
| 9e6afc2 | 04-29 | F | 2.0.18：dual-audit 第二轮 follow-up（2 HIGH + 2 MED）——`client.js` +5、`conversation-pool.js` +8、`chat.js` 41 行重构、`tool-emulation.js` +14；`test/client-panel-retry.test.js` +192 | v2.0.18；(深挖 §3.32) |
| 850118e | 04-28 | H | test(ssrf)：错误码断言跟进 `ERR_PROXY_PRIVATE_IP` 改名（1+/2-） | — |
| 2d266c6 | 04-28 | E | i18n：`ERR_PROXY_PRIVATE_HOST` 翻译 + net-safety 错误码改名（`net-safety.js` 6 行、双语 json 各 1 行） | — |
| 7df3f80 | 04-28 | E | dashboard i18n UX：整词语言切换 + 面板自动刷新 + `error.*` 命名空间（`index.html` 54 行） | — |
| a5b9d25 | 04-28 | E | dashboard：Windsurf 登录流的错误消息在有 i18n key 时翻译（`index.html` 21 行） | — |
| 31d774c | 04-28 | E | refactor：抽取 `parseProxyUrl` helper 统一代理串解析（`api.js` 28 行） | — |
| 5fc656a | 04-28 | E | feat：`ALLOW_PRIVATE_PROXY_HOSTS` 配置（本地代理测试用）——`config.js` +3、`net-safety.js` +12、`.env.example` +6 | — |
| 2a9724a | 04-28 | F | 2.0.17：安全审计一波过（5 HIGH + 1 MED 自伤 + LOW 收尾）——HIGH-1 无 apiKey 时 default-allow 改 **fail-closed**（仅 localhost bind 放行，`crypto.timingSafeEqual` 取代 `===`，新增 HOST/BIND_HOST env）；HIGH-2 `/auth/accounts` 泄漏完整上游 apiKey → 改 `apiKey_masked` + `getAccountInternal` 内部路径 + reveal-key 流程；HIGH-3 dashboard 写接口 default-allow 同样 fail-closed；HIGH-4 gRPC frame parser 异常炸 Node 进程 → `req.on('data')` 内 try/catch + 关 HTTP/2 stream + Connect 帧解压失败改抛错 + 100MB pendingBuf cap；HIGH-5 **完全禁用 LS 端口盲接管**（42100 被占就换端口起新 LS，任何本地恶意进程先占端口即可窃取账号 key，nginx `server: custom-grpc-decoy` 一行就能骗过 probe）；MED-6 是 v2.0.16 自己 ship 的 schema-compact 回归；`test/` 8 文件 +303 | v2.0.17；(深挖 §3.19) |
| 0cbecfd | 04-28 | B | #77 AromaACG：tiered tool preamble 四档压缩——修 opus-4-7 短回复 14 字符（full 71KB 超 24KB soft cap 后直接降 names-only 丢全部 schema，模型懵了敷衍 14 字符）；`tool-emulation.js` +132 新建 `buildSchemaCompactToolPreambleForProto` / `buildSkinnyToolPreambleForProto` + `stripSchemaDocs`/`firstSentence`/`paramSignature`；`chat.js` `applyToolPreambleBudget` 改四档逐级降级（full→schema-compact 10KB→skinny 5KB→names-only 2KB）；`test/tool-preamble-budget.test.js` 74 行 | #77；(深挖 §3.23) |
| bbc9746 | 04-28 | E | 2.0.15：Claude Code edit/Bash 工具流修复 + dashboard XSS 收紧 + #84 proxy scope——`chat.js` 64 行、`messages.js` +42、`responses.js` +21、`tool-emulation.js` +20、`runtime-config.js` +18；XSS 转义（check-i18n +7 顺带）；`test/messages.test.js` +121 | #84 |
| a18661b | 04-28 | C | #77 follow-up：账号队列超时给出真实原因——`chat.js` +46：pool 耗尽时错误不再空泛，带队列状态/等待时长；`test/stream-pool-exhausted-error.test.js` +77 | #77 |
| ea7ad69 | 04-28 | C | #82,#83 紧急修复：v2.0.12 prompt caching 引入的 `cachePolicy is not defined` ReferenceError——`cachePolicy` 在 `handleChatCompletions` 顶层声明但没传给 `streamResponse()`/`nonStreamResponse()` 两个独立 helper，stream 和非 stream 主路径响应中段全崩（`Stream error after retries: cachePolicy is not defined`，**所有 v2.0.12 部署都中招**）；修：stream 走 `deps.cachePolicy`、non-stream 加显式参数；codex 独立审计还抓到 nonStreamResponse 的同一问题；`test/stream-cache-policy.test.js` 102 行静态断言 | #82, #83；(深挖 §3.32) |
| 0b2d051 | 04-27 | G | 2.0.12：安全加固 cherry-pick + credits 补全——`src/index.js` +42 / `langserver.js` +45 带回安全修复、contributors.json +27、`test/langserver-redact.test.js` +45 | v2.0.12 |
| 5e8c067 | 04-27 | H | credits：sandleft 记 PR #72 Codex Responses 工具层（contributors.json +9） | PR #72 |
| efbcf16 | 04-26 | C | Codex Responses 工具兼容（PR #72 sandleft）——`responses.js` 406 行重写：Responses 端点完整工具调用往返（function_call → tool_calls 翻译、execute → tool_result 回填、取消/续跑语义）；`test/responses.test.js` +189 | PR #72；(深挖 §3.20) |
| e3ea65f | 04-27 | C | 尊重 Anthropic prompt-caching `cache_control` 标记——`messages.js` +98 解析 `cache_control:{ttl}` → cascade 复用 TTL 提示，`conversation-pool.js` +23、`chat.js` +51；`test/cache-control.test.js` 197 行 | (深挖 §3.20) |
| c66aae6 | 04-27 | C | responses：server-side tools 静默 drop 而不是 500——`responses.js` +20（上游不支持 server-side tools 时降级），`test/responses.test.js` +35 | — |
| 9699d10 | 04-27 | D | auth：保留手动 tier 覆盖 + 刷新 tier modal 文案——`auth.js` +21（probe 刷新不覆盖 operator 手改的 tier）、i18n 双语各 6 行 | — |
| 217f8b5 | 04-27 | D | auth：信任 per-account allowlist 做模型路由——`auth.js` +47（allowlist 配置优先于全局 tier 判断），`test/account-entitlement.test.js` +98 | — |
| 2469c57 | 04-27 | E | refactor：contributor 名册单一来源 `/dashboard/data/contributors.json`（130 行新文件），`index.html` -151 / `index-sketch.html` +106、`server.js` +19 | — |
| 7a7dbb9 | 04-27 | C | messages：转发上游前丢弃 Anthropic server-side tools——`messages.js` +49、`test/messages.test.js` +55 | — |
| 181ffc5 | 04-27 | A | messages：cascade 池按 Claude Code 设备隔离——`messages.js` +43 用 `metadata.user_id` 分池（多设备共用账号不互串上下文），`test/messages.test.js` +88 | — |
| 664e5a5 | 04-27 | H | chore：thinking 路由时记录实际生效 model key（`chat.js` +3 日志） | — |
| efa72c2 | 04-27 | C | adaptive thinking 路由 + Anthropic `output_config` 翻译——`chat.js` +14、`messages.js` +24（reasoning_effort/thinking 配置双向翻译），测试 +115 | — |
| 5a4eae9 | 04-27 | F | Windows 兼容 + 6 bug（PR #73 Yuuqq 一带）：`sanitize.js` repo-root 解析支持 `\` 分隔符 + META_TAG 正则转义（regex 注入），`server.js` OPTIONS 补 CORS 头返回 204（原来空响应）+ `conversation-pool.js` pool 正则转义 | PR #73 |
| 1b1a473 | 04-27 | E | dashboard：Credits 面板按 contributor 分组 + PR 历史——`index.html` +92、i18n 各 +2 | — |
| c663001 | 04-27 | B | messages：行号化的 Read body 跳过 stub 启发式——`messages.js` +10（带行号的真实 Read 结果不再被当 stub），`test/messages.test.js` +19 | — |
| f78b2d1 | 04-27 | D | json：key 提取忽略注入的 hint——`chat.js` 4 行（`extractRequestedJsonKeys` 不再被用户消息里伪造的 JSON-only 指令误导），测试 +3 | — |
| b30e85b | 04-27 | D | json：稳定 requested key 形状——`chat.js` +132（key 提取/校验/透传全链路重构，多轮稳定），`test/messages.test.js` +27 | — |
| d07f013 | 04-27 | D | json：保留请求方指定的最终 keys——`chat.js` 2 行 | — |
| fcc3c82 | 04-27 | D | json：尊重显式 JSON-only 请求——`chat.js` +68（`response_format`/`json_object` 显式请求时不加料不丢 key），`test/messages.test.js` +34 | — |
| 37c149f | 04-27 | B | tools：修复显式 Bash 命令截断——`chat.js` +78（完整命令按长度预算截断时保留语义边界），`test/tool-emulation.test.js` +34 | — |
| db2ed3e | 04-27 | B | tools：加 compact Bash fallback hints——`tool-emulation.js` +6（预算内给精简命令示例），测试 +8 | — |
| 84cb2cc | 04-27 | B | tools：强化参数保真 hints——`tool-emulation.js` +34（提示模型参数须原样传，防 JSON 转义丢失），测试 +22 | — |
| 4440cfa | 04-27 | A | rate-limit：尊重 Cascade reset 窗口——`chat.js` +12（429 后按上游 reset 时间而非固定值退避），`test/rate-limit.test.js` +9 | — |
| 072e5e1 | 04-26 | B | chat：Claude Code Windows cwd hints 提升——`chat.js` 2 行（Windows 盘符路径在 tool preamble 里更显式），`test/caller-environment.test.js` +11 | — |
| 7649f9f | 04-26 | B | messages：歧义 Read 结果标记——`messages.js` +27（Read 返回疑似 stub/重复时打标），`test/messages.test.js` +52 | — |
| 42d531f | 04-26 | B | tool-payload：先 compact 再强制硬上限——`chat.js` +55（PR #74 baily-zhang：超大 tool payload 先压缩再砍），`test/tool-preamble-budget.test.js` +49 | PR #74 |
| a9152b2 | 04-26 | E | dashboard：credits contributor 卡片压缩——`index.html` 55 行 | — |
| 295ac29 | 04-26 | M | bump 2.0.11 + release notes（sketch skin） | v2.0.11 |
| e9a9033 | 04-26 | E | cookie-based skin 路由 + 实验性 sketch UI——`index-sketch.html` 3242 行新文件（手绘风 dashboard）、`server.js` +18 cookie 切换、`index.html` +33 | — |
| 8f4f7b6 | 04-26 | D | hotfix：`positiveIntEnv` 在 auth.js 漏定义——`auth.js` +10 补上 helper（client.js/pool 各有局部版，auth.js 没抄全），动态云探测路径每次 refresh 周期 `ReferenceError` 被 try/catch 吞成一行 WARN、pm2 日志长期污染、free 账号 cloud 候选发现完全不工作 | v2.0.10；(深挖 §3.32) |
| ec0125e | 04-26 | M | bump 2.0.9 + release notes（#67/#68 + cloud tool-calling fix） | v2.0.9 |
| 71d1dba | 04-26 | B | tool-payload：删 field 10 schema 重复 + proto-preamble 字节预算——`chat.js` +36、`tool-emulation.js` +41、`windsurf.js` -21（清理重复字段定义），测试 +85 | — |
| 2ed79ad | 04-26 | D | #67：docker-compose 升级保留 accounts.json——根因：REPLICA_ISOLATE=1 时 accounts.json 进 per-replica `dataDir`，每次升级容器 HOSTNAME 变化账号就丢；修：`config.js` 加 `sharedDataDir`、`auth.js` ACCOUNTS_FILE 改指共享目录 + 迁移逻辑、compose replicas 3→1 默认 + REPLICA_ISOLATE=0 注释说明；`test/auth-migration.test.js` 125 行 | #67；(深挖 §3.32) |
| 2e29724 | 04-26 | D | #68：裸 `claude-4.6` 路由到 sonnet + 未知模型 400——`models.js` +9（`_lookup.set('claude-4.6','claude-sonnet-4.6')` 等 2 条），`chat.js` +18：`modelInfo` 为 null 时 400 `model_not_found`（原来 fall through 到 legacy rawGetChatMessage modelEnum=0，上游静默路由默认模型，用户看到「I'm Claude 4.5」） | #68；(深挖 §3.32) |
| 9b8fde8 | 04-26 | M | bump 2.0.8 + release notes（emergency login fix） | v2.0.8 |
| 20b11d9 | 04-26 | E | login：改用新的 `CheckUserLoginMethod` 作 email 主探测——`windsurf-login.js` +54 新增 `fetchCheckUserLoginMethod`（Connect-RPC `_backend/exa.seat_management_pb.SeatManagementService/CheckUserLoginMethod`，返回 `{userExists,hasPassword}`，旧的 `/_devin-auth/connections` 跑在 Vercel functions 上几秒一 504）+ probe 序列改 1 新 2 旧 3 Firebase；**这个「追上游迁移」的改动成了 F11 email 登录挂掉的引入点** | v2.0.8；(深挖 §3.29) |
| a4f2e19 | 04-26 | E | login：适配新 connections schema + 5xx 重试——`windsurf-login.js` +71（`interpretConnections` 兼容 `{auth_method:{...}}` 与 `{connections:[...]}` 两种 CDN 边缘形态 + 5xx 重试） | (深挖 §3.29) |
| 66f3ade | 04-26 | M | bump 2.0.7 + release notes | v2.0.7 |
| 61e7846 | 04-26 | C | 5824773 的 polish review——`auth.js` +28 / `chat.js` +24：reservation 亚毫秒 token、rate-limit 兜底 30s 误伤修正、流/非流语义对齐；自曝 5824773 里写了从没被读的 `_lastReservationAt` 字段 | (深挖 §3.21) |
| 5824773 | 04-26 | C | #59,#63,#66 审计驱动硬化（7 项）：P1 真因 ToolCallStreamParser 丢 text/tool 相对顺序 → items 数组保序；#66 rate-limit cooldown 精确解析 retry-after（不再一刀切 5min）+ 并发 429 不再无限后推；#63 非 function tools 静默 drop → 400 + function-only 响应去空 message；/v1/messages 透传 thinking + tool_choice；全账号 RPM 满返 429 不是 503；`test/rate-limit.test.js` +136 | #59, #63, #66；(深挖 §3.21) |
| 875cf53 | 04-26 | C | #59：`CASCADE_MAX_WAIT_MS` 默认 180s → 600s——`client.js` +7 | #59 |
| e968fbf | 04-26 | C | #63：/v1/responses 生命周期事件包进 `response` envelope——`responses.js` +25，`test/_research/responses-cache-hit-seq-*.json` 记录真实时序研究 | #63 |
| ca0df42 | 04-26 | G | CI：修 release workflow 镜像名 + 恢复 docker-compose build 选项（workflow 5 行 + compose 7 行） | #65 |
| 60eab58 | 04-26 | G | #65：release workflow——`.github/workflows/release.yml` 100 行（GHCR 推送 + GitHub Release 自动发版）、compose/nginx 微调 | #65 |
| 54e78ad | 04-25 | C | #64：从取消的 cascade panel transport 恢复——`client.js` +52 新增 `isCascadeTransportError`/`markCascadeTransportError`/`resetCascadeTransportState`（HTTP/2 canceled/ECONNRESET/panel state 视为 transient，`closeSessionForPort` 清会话 + `closeSessionForPort` + workspaceInit/sessionId 归零），warmup 各步错误从「只 warn 继续」改为「transport 错误即抛并清状态」，`chat.js` +67 对应重试路径 | #64；(深挖 §3.21) |
| a434c40 | 04-26 | C | #57,#59：stream reuse 硬化 + 安全边缘——33 文件 +853 的大包：`net-safety.js` 105 行新模块（SSRF 双向校验）、`image.js`/`pdf.js` 安全下载、`sse-registry.js` +21、auth-warning、stream-stall 测试等 | #57, #59 |
| b5a8856 | 04-26 | M | bump 2.0.5 + baily-zhang PR #62 入 credits（`index.html` +9） | v2.0.5, PR #62 |
| 9c6b685 | 04-26 | C | #56,#63：实现 /v1/responses 端点（Codex CLI 兼容）——`handlers/responses.js` 476 行新模块：responsesToChat 双向翻译（input items → messages / function_call → tool_calls、指令前缀、reasoning.effort 透传）+ chatToResponse + ResponsesStreamTranslator（capture-the-stream 模式复用 SSE 序列）；`server.js` +41 路由；`test/responses.test.js` 245 行 | #56, #63；(深挖 §3.20) |
| 4d51b5a | 04-25 | E | #62：修 credits 面板语法崩溃——`index.html` 2 行（手写 credits HTML 模板语法错误），`test/dashboard-syntax.test.js` +21 | #62 |
| 37f0ce1 | 04-26 | C | stream 路径错误优先级：upstream_transient 优先于 rate-limit 文案——`chat.js` +13、`test/chat-reuse.test.js` +37（4.6 reuse 回归） | — |
| fd34859 | 04-26 | C | #59：Opus tool-emulated cascade reuse 扩展到 4.6——`chat.js` +16（helper 改名 isToolEmulatedReusableModel） | #59 |
| 39177e0 | 04-26 | H | docs：GitHub Pages 完整 contributors 章节——`docs/index.html` +121 | — |
| a71bdd1 | 04-26 | E | dashboard：PR #61 #58 #54 #53 入 credits 面板 + baily-zhang 升 S+（`index.html` +36） | PR #61 等 |
| 9dc019e | 04-26 | G | #58：修 nginx 共享内存错误 + 缺失 join import——`nginx.conf` 3 行、`config.js` 2 行 | #58 |
| e078f35 | 04-25 | A | #61：防 Opus 4.7 上下文爆炸——`client.js` +75 `safeBlockToString`（image/base64/二进制块压缩成 `[Image omitted]`/`[Binary content omitted]`，防 base64 泄漏进 text 通道）+ `extractCompactSystemFacts`（从 sysText 提取 cwd/git/platform 五要素注入）；`conversation-pool.js` +15、`chat.js` +75、`tool-emulation.js` +26；`test/client-content.test.js` +33 | #61；(深挖 §3.22) |
| 5a6e7be | 04-25 | C | #28：账号间 backoff（Cascade internal_error 后换账号前等待）+ 清理 `upstream_transient_error`——`chat.js` +74 | #28 |
| 79cd990 | 04-25 | C | #28：拒绝空 user 消息 + 重 system prompt 警告——`chat.js` +49 | #28 |
| ae4067c | 04-25 | B | #54：Claude Code 工具调用流回到 Anthropic 等价行为——`chat.js` +150、`tool-emulation.js` +134（-63）、`sanitize.js` +38（-26）、`client.js` +13：工具仿真按 Anthropic 语义重排（tool_use/tool_result 配对、step 结构对齐）；`test/caller-environment.test.js` +154、`test/identity-neutralization.test.js` 97 行 | PR #54；(深挖 §3.22) |
| f53248c | 04-25 | M | bump version 2.0.4（package.json 1 行） | v2.0.4 |
| 2ed0967 | 04-25 | D | 上游退役模型返回 410 `model_deprecated`——`chat.js` +20：deprecated 模型（9 个）不再让上游返 cryptic 502 `neither PlanModel nor RequestedModel specified`（调用方会误判 transient 无限重试），改 410 明确提示换模型 | (深挖 §3.22) |
| b3af74a | 04-25 | E | #52：cascadeConversationReuse 文案纠正 + credits 面板加权——`index.html` 106 行、i18n 各 4 行 | #52 |
| 2557fb8 | 04-25 | A | #24（PR #53 aict666）：redact marker 必须无 shell 元字符——`sanitize.js` +36：占位符从 `(internal path redacted)` 改 `redacted internal path`（括号会被 zsh 当 glob-qualifier 解析 → `unknown file attribute: i`，Opus 懵掉停止调工具；`<redacted-path>` 被当路径传 Read/Bash → ENOENT/Errno 22；`[internal]` 被 `ls` 当目录）；三个约束：无 shell 元字符 + 不像路径 + 读起来像散文；`test/sanitize.test.js` 51 行 | #24, PR #53；(深挖 §3.14) |
| ca770ab | 04-25 | M | merge PR #51（aict666：tool preamble 注入守卫措辞） | — |
| 06fb854 | 04-25 | M | bump version 2.0.3 | v2.0.3 |
| 85cc005 | 04-24 | B | PR #51 主体：tool preamble 重新措辞过 Opus-class 注入守卫——`tool-emulation.js` +34（去掉被 ban 的 `[Tool-calling context]`/`ignore prior` 等句式），`test/tool-emulation.test.js` +46 | PR #51 |
| b8a2057 | 04-25 | A | #24：redact marker 从 `<redacted-path>` 改自然语言短语 `(internal path redacted)`——`sanitize.js` +21：尖括号 marker 会被下游模型当真实路径复用（drift probe 实测 sonnet 反复调 `read_file('<redacted-path>')` 崩溃）；多词括号短语无法被 tokenize 成路径 | #24；(深挖 §3.13) |
| 3792678 | 04-25 | B | lenient JSON parse：小模型尾部多括号的 `<tool_call>` body 放宽解析——`tool-emulation.js` +31 | — |
| 4aa4d7b | 04-25 | A | #24：panel-state-missing 重试 3 次 + backoff——`client.js` +54：`MAX_PANEL_RETRIES=3`，每次重试完整 re-warm（新 sessionId + panel init + 新 StartCascade）+ 重建全量历史，超过抛带 payload 大小的诊断错误（30KB+ system prompt 场景 LS 频繁失效） | #24；(深挖 §3.15) |
| 2ae9d15 | 04-24 | M | merge PR #50（aict666：工具仿真轮禁用 cascade reuse）——`chat.js` +13 带 diff | PR #50 |
| 1e1d923 | 04-24 | A | #24：泄漏路径 redact 成 `<redacted-path>`——`sanitize.js` +14：从 `./tail`/`[internal]` 演进（`./tail` 让 LLM 去 Read ENOENT 循环、`[internal]` 被 `ls [internal]` 循环），尖括号打破 token 化混淆 | #24；(深挖 §3.12) |
| 78d3628 | 04-24 | A | #24：停止 Cascade 文件路径幻觉 + read-loop——`sanitize.js` +19：sandbox 路径重写从 `./tail` 改 `[internal]` 扁平化（模型会从训练先验脑补「我看了 /tmp/windsurf-workspace/config.yaml」，Claude Code 拿到重写路径去 Read → ENOENT → 重试循环）；`windsurf.js` +22：field 12 追加 CRITICAL OPERATING CONSTRAINT 行为级禁令（No tools/No file access… Never narrate tool-like actions），从「能力层面」升级到「行为层面」 | #24；(深挖 §3.11) |
| 58a80f1 | 04-24 | D | #48：移除所有自动 system-prompt 注入——`chat.js` -90、`runtime-config.js` -49、`index.html` -82、`api.js` -19（-228 净删） | #48 |
| 35373be | 04-24 | E | dashboard：rich per-account quota 详情面板——`index.html` +376、i18n 各 +42 | — |
| 9fe97b9 | 04-24 | D | **revert**：drop bare-probe guard——自己加的 guard 把「请问中国首都是哪里」打成 kindergarten 内容（hvoy.ai 纯 API 诉求与 Cascade 人格根本冲突），`chat.js` -39 收场 | (深挖 §3.19) |
| bbd072f | 04-24 | D | bare-probe guard 修正：正确性优先 + 语言匹配（3×7 必须答 21 不是 3 或 7、中文问题中文答）——`chat.js` 12 行 | — |
| 9a18d90 | 04-24 | D | 合并 phantom-attachment + verbosity 两个 guard 成一个 bare-probe guard——`chat.js` +33/-23 | — |
| a0b5963 | 04-24 | D | model-signature 响应头 + phantom-attachment guard——`chat.js` +30、`server.js` +10 | — |
| f468459 | 04-24 | H | debug：probe-log 前 3 条消息头（`chat.js` +6） | — |
| 0f53ec2 | 04-24 | H | debug：probe-log content-type 形状 + 末轮 user tail（`chat.js` 26 行） | — |
| 619d8b3 | 04-24 | H | debug：记录 probe 风格请求（response_format / 非文本 content，`chat.js` +15） | — |
| 1b0b5b4 | 04-24 | D | `response.model` 原样回显请求名 + identity 用干净名——`chat.js` +10 | — |
| 05de907 | 04-24 | D | 健壮 JSON 提取 + 完整 OpenAI PDF 输入覆盖——`chat.js` +76（JSON fence/markdown 剥离提取）、`image.js` +47（PDF 双格式识别） | #47；(深挖 §3.19) |
| 6445d43 | 04-24 | E | dashboard：默认柱状图 + 图表动画 + 固定 tooltip——`index.html` 228 行 | — |
| 9b3e6f0 | 04-24 | E | dashboard：图表 polish + 日期范围 + 去 prompt bar——`index.html` 541 行 | — |
| ac664dc | 04-24 | E | dashboard：4 类图表切换 + 模型饼图 + 配额列 i18n 修复——`index.html` 769 行 | — |
| 50a4a5e | 04-24 | E | dashboard：Canvas 面积图 + 配额 D/W/P 通用标签 + 缺失数据 N/A——`index.html` 157 行 | — |
| 7a6e1ac | 04-24 | E | wantJson 作用域 + 配额短标签 tooltip——`chat.js` 4 行、`index.html` 6 行 | — |
| 906de1a | 04-24 | E | 干净配额条（短 D/W/P 标签 + tooltip，去 clutter）——`index.html` 32 行 | — |
| 60a15ae | 04-24 | E | 配额标签 日/周/提示词 + 6 contributors 进 dashboard——`index.html` 41 行 | — |
| 6ae7f79 | 04-24 | E | #49：LS stderr 以 warn 展示 + exit code 1 诊断提示——`langserver.js` +8 | #49 |
| 9351159 | 04-24 | D | #47：结构化输出 + PDF 提取 + 工具调用 bug 修复——`pdf.js` 147 行新模块（PDF 文本提取）、`image.js` +21、`chat.js` -17 | #47 |
| 0eaee36 | 04-24 | D | structured output + thinking 自动升级 + 模型签名头（hvoy.ai 准备）——`chat.js` +22、`server.js` +17；**此处 applyJsonResponseHint 开始 append 长指令到 user content，是 #104 JSON 跨轮污染的引入点** | (深挖 §3.28) |
| 4ca1aeb | 04-24 | H | 模型身份与质量测试脚本（hvoy.ai 准备）——`scripts/model-identity-test.js` 144 行新文件 | — |
| 42b278c | 04-24 | D | 中和 Cascade 身份——响应替换为真实模型名（`chat.js` +21，LLM 自称 Cascade 时改写） | — |
| d483b13 | 04-24 | D | `displayModel` 作为 model 参数传给 cascadeChat（`chat.js` 4 行） | — |
| b4a5aaa | 04-24 | D | cascadeChat 解构 `displayModel`（`client.js` 2 行） | — |
| ea80bca | 04-24 | D | 注入模型身份上下文（hvoy.ai 评分准备）——`client.js` +11、`chat.js`/`runtime-config.js` 各 4 行 | — |
| 1aa0824 | 04-24 | H | revert：恢复原 landing page 设计——`docs/index.html` 1216 行（暗色版 843+/373- 撤掉） | — |
| 03673e4 | 04-24 | H | docs：新增 baily-zhang、aict666、smeinecke 三位 contributors（README en/zh） | — |
| ff539c7 | 04-24 | M | merge PR #43（smeinecke：英文翻译） | — |
| 9b3ef69 | 04-24 | M | merge PR #45（baily-zhang：防 cascade reuse 重放旧上下文） | — |
| c8a86c5 | 04-24 | M | merge PR #44（aict666：保留权威 tier） | — |
| 20b3f1b | 04-23 | A | 防 cascade reuse replay 重复上下文——`client.js` +49：resume 轮若从 step offset 0 重新 poll，旧 planner-response 步骤会被重放成新输出，文本和 usage 跨轮累积（`alpha`→`alphabeta`→…）；修：pool 存绝对 `stepOffset`/`generatorOffset`，resume 时从绝对偏移续读，旧 entry 无 offset 时调 `GetCascadeTrajectorySteps`/`GetGeneratorMetadata` 一次性快照兜底 | (深挖 §3.09) |
| a4422cc | 04-24 | E | i18n：identityPrompt.templateHint 去掉 `I18n.t()` 调用，只用 data-i18n 属性（`index.html` 4 行） | — |
| 537a60f | 04-24 | E | cascadeReuse 区块布局修正：删多余 closing div + toggle 容器加背景（`index.html` 3 行） | — |
| 4ab470d | 04-24 | E | i18n：cascadeReuse.desc 去掉 `I18n.t()` 调用（`index.html` 4 行） | — |
| 740a5a4 | 04-24 | M | merge dwgx:master 进 upd/english-translation（PR #43 过程分支） | — |
| c32d4d7 | 04-24 | D | #44：chat 后不再把 Pro/Trial tier 降级为 `free`——`auth.js` +8（权威 tier 保留，PR #44 aict666） | PR #44 |
| 2530e94 | 04-24 | E | i18n：`I18n.t()` 调用校验 + probe/credits 缺 key 补齐——`check-i18n.js` +74、双语 json 各 +25 | — |
| fa32980 | 04-24 | E | i18n：补翻译键 + UI 文案一致性——`index.html` 236 行、双语 json 各 +55 | — |
| cd8f6b4 | 04-24 | H | 暗色沉浸式 landing page + 协议转换动画——`docs/index.html` 375+/845- | — |
| 4b72ecd | 04-24 | D | v2.0.0：9 个枚举模型标 deprecated + `FREE_TIER_BASE` 只留 gemini-2.5-flash + connect-rpc 实测——`models.js` 38 行 | v2.0.0；(深挖 §3.27) |
| 0476121 | 04-24 | D | probe 只打 gemini canary——Claude canary 烧 Trial 配额太快（`auth.js` -4/+2） | (深挖 §3.27) |
| 7ae39d0 | 04-24 | H | docs：删除 xyiqq credit 行（README.en 2 行） | — |
| 9c83dfd | 04-24 | H | Update README.md（删 1 行 credit） | — |
| 2d102bd | 04-24 | H | docs：deprecated 模型的 Cascade 路由注释澄清（`chat.js` 7 行） | — |
| 9c96663 | 04-24 | C | 全部模型走 Cascade——Legacy Raw 路径被 LS 弃用（`chat.js` -6/+4 删 raw 分支） | (深挖 §3.19) |
| e2bd1e5 | 04-23 | E | i18n：翻译文件重构 + dashboard 缺 key 补齐——`index.html` 98 行、双语 json 各 +57/+77 | — |
| 3706214 | 04-24 | H | cli-agent-sim 改非流式求稳定测试结果（`scripts/cli-agent-sim.js` 57 行） | — |
| cb19e7f | 04-24 | H | cli-agent-sim 处理 SSE 尾部多行残留（5 行） | — |
| 1aa33e8 | 04-24 | H | cli-agent-sim 改 SSE 行式解析（56 行） | — |
| 101cd90 | 04-24 | G | v2.0 革新：53 项测试 + connect-rpc + 动态模型探测 + 8 issue 修复——`grpc.js` +107（connect-rpc 支持）、`auth.js` +52（#42 免费账号云候选探测）、`cache.js`（base64 图跳过缓存）、`client.js` +42（65KB 溢出、XML 标签注入）、`conversation-pool.js`（meta-tag 自动学习）、`server.js`（Retry-After、/health?verbose）、新增 `version.js`、`scripts/cli-agent-sim.js` 348 行、nginx.conf +52、CI +14；修复 releaseAccount 空指针、nginx `$proxy_addrs` 拼写、VERSION 循环依赖等 | v2.0.0；(深挖 §3.22) |
| 8bd8752 | 04-23 | H | i18n 回归保护脚本 + 指南——`check-i18n.js` 208 行新模块、`docs/dashboard-i18n.md` 252 行 | — |
| e8e1497 | 04-23 | E | 硬编码中文错误消息改 i18n 错误码——`api.js` 29 行、`windsurf-login.js` 46 行、双语 json 各 +85 | — |
| fcd1ed0 | 04-23 | E | Dashboard 英文翻译（PR #43 smeinecke）——`en.json` 632 行、`index.html` 504 行 | PR #43 |
| 864aa8f | 04-23 | H | docs：Mermaid 流程图 LS 节点 label 加引号（README.en 2 行） | — |
| 3726570 | 04-23 | H | docs：`<br/>` → `<br>` Mermaid 一致性（README.en 24 行） | — |
| 8e583ba | 04-23 | H | docs：ASCII 图换 Mermaid 流程图 + 时序图（README.en 78 行） | — |
| c55aa60 | 04-23 | H | README.en 同步到最新 README.md（31 行） | — |
| e063cb0 | 04-23 | F | META_TAG_NAMES 补 analysis/summary/example——`conversation-pool.js` +4（防这些 tag 污染 reuse fingerprint） | — |
| 28dc511 | 04-23 | F | 动态 REPO_ROOT sanitize + .env 内联注释解析 + META_TAG 审计日志——`config.js` +4、`conversation-pool.js` +13、`sanitize.js` +18 | — |
| b86eb82 | 04-23 | H | docs：致谢 @xyiqq——捐赠 10 个 Pro 账号（README 各 1 行） | — |
| d200d9f | 04-23 | H | docs：v1.9.5 代码深度分析审计报告——`docs/analysis-v1.9.5.md` 312 行新文件 | — |
| 2d6d2c6 | 04-23 | A | CJK 语言跟随 hint + fake workspace scaffold——`client.js` +38（ensureWorkspaceDir 脚手架）、`chat.js` +37 | — |
| 17e0637 | 04-23 | B | 统一 sanitizeToolCall 到非流式路径 + 修 streamResponse 里 reqId 作用域——`chat.js` 9 行 | — |
| 11629f1 | 04-23 | B | #35 regression：强化 communication_section 语言跟随指令——Claude Code 中英文混输出（`runtime-config.js` 4 行） | #35 |
| bef4b8a | 04-23 | A | #24,#38：meta-tag strip 修 reuse fingerprint + workspace 路径全链路 sanitize——`conversation-pool.js` +45（META_TAG_NAMES 7 类 client 注入 tag strip 后再 hash，修 PR #36 后仍 reuse=false 的漂移源）、`sanitize.js` +37（tool call input 也 sanitize）、`chat.js` +12 | #24, #38；(深挖 §3.10) |
| ee069d6 | 04-23 | G | 反代：gRPC unary 补 user-agent + Raw 路径对齐 per-LS sessionId——`grpc.js` +6、`client.js` +11、`windsurf.js` +8 | — |
| ab44d8f | 04-23 | B | #41 round 2：sysText 身份语句改第三人称——绕过上游 prompt injection 检测（`client.js` +38） | #41 |
| c504f1f | 04-23 | B | #41：`<system_instructions>` 包住 sysText 避免上游模型判 prompt injection（`client.js` +10） | #41 |
| 01cbafb | 04-23 | M | chore(release)：v1.9.0 | v1.9.0 |
| a8e3189 | 04-23 | G | 周期性 prune 会话池 + LS 进程 HOME 仅缺失时 fallback——`conversation-pool.js` +5、`langserver.js` +6 | — |
| 6957f08 | 04-23 | A | sysText 计入历史预算 + coldStall 以最终 prompt 计算阈值——`client.js` +11 | — |
| dea6758 | 04-23 | A | #37：账号池按 in-flight 计数均衡并发请求——`auth.js` +24、`chat.js` +16 | #37 |
| 5f5397a | 04-23 | F | 防 SSRF（DNS rebinding）+ deepMerge 防 prototype pollution——`image.js` +23：http/https `lookup` hook 在 DNS 解析后拒绝私有网段（127/10/172.16-31/192.168/169.254/100.64/0/::1/fe80 等，防公网 hostname 解析到内网 IP）、`runtime-config.js` deepMerge 跳过 `__proto__`/`constructor`/`prototype` | (深挖 §3.16) |
| cc60746 | 04-23 | F | 修 Dashboard auth bypass——禁止空 password header：`api.js` `return !pw || pw === config.apiKey` 改回 `pw === config.apiKey` | (深挖 §3.17) |
| 89512bf | 04-23 | M | merge PR #36（baily-zhang：Claude Code cascade 上下文复用） | — |
| 66897aa | 04-22 | A | strict cascade reuse 模式（PR #36 baily-zhang）——`chat.js` +90：`auth.js` +35 per-user 隔离开关、`conversation-pool.js` +10 | PR #36 |
| 24ff63a | 04-22 | A | reuse 跨失败尝试保留（PR #36）——`chat.js` +16 | PR #36 |
| 5d2bb68 | 04-22 | A | 本地 cascade 上下文复用改进（PR #36）——`client.js` +21、`conversation-pool.js` +45、`langserver.js` +13 | PR #36 |
| 4b6cde8 | 04-23 | F | Dashboard API 无密码时允许空 header 访问——**自己为前端免密访问加的**：`api.js` `pw === config.apiKey` 改 `!pw || pw === config.apiKey`；本意修「前端没配 dashboardPassword 时 fall through 到 apiKey 导致认证失败」，实成严重 auth bypass（F2 引入点） | (深挖 §3.17) |
| 3c5bca5 | 04-23 | E | 统计图表全面重设计——渐变玻璃感 + 顶部流光 + 精致 tooltip + hover 发光（`index.html` 78 行） | — |
| cb2974b | 04-23 | E | 图表重设计——蓝色渐变 + hover 发光 + tooltip 浮层（`index.html` 42 行） | — |
| bbb8a34 | 04-23 | G | proto 深度补全——5 个关键字段（`windsurf.js` +22） | — |
| dfb979a | 04-23 | F | #27,#29：反代指纹深度修复 6 项——`windsurf-api.js` +10（OS/硬件跟随实际平台）、`windsurf.js` +8（workspace 按账号哈希）、`client.js`（云端版本统一 1.9600.41、去 3 个禁用 flag）、`langserver.js` -3（poll 250→500ms、request_id 改随机数）；**commit message 明确记录 3 个「不能改」：LS metadata 版本、gRPC 压缩头、planner READ_ONLY——当日就被 F3 三连踩中** | #27, #29；(深挖 §3.18) |
| 410d867 | 04-23 | F | **revert**：去掉 gRPC 压缩头——LS 开始发压缩数据导致 wire-type 解析错误（`grpc.js` 删 2 行 `grpc-accept-encoding` + UA） | F3；(深挖 §3.18) |
| 163a276 | 04-23 | F | **revert**：planner mode 回退 NO_TOOL——README_ONLY(2) 导致 LS proto wire-type 错误（`windsurf.js` 10 行，cac0b8d 的改动收回） | F3；(深挖 §3.18) |
| 1d022ff | 04-23 | F | **revert**：buildMetadata 版本号回退 1.9600.41——改成 1.108.2 导致 LS proto 解析错误 wire type 7（`windsurf.js` 2 行） | F3；(深挖 §3.18) |
| 9740ec2 | 04-23 | F | #27,#29：反代指纹修复 + Dashboard prompt 编辑器 + 搜索筛选——`windsurf.js` 24 行、`grpc.js` +4、`runtime-config.js` +32、`api.js` +16、`index.html` 93 行 | #27, #29 |
| d6e816c | 04-23 | F | #28：柔化 prompt 注入语气降低 content policy 触发——`windsurf.js` -14/+9 | #28 |
| a1d4efc | 04-23 | G | #33：批量代理+账号导入 + update.sh 自动更新 LS + 请求级日志 ID——`api.js` +53、`chat.js` 13 行、`update.sh` 40 行 | #33 |
| 2a92d09 | 04-23 | G | install-ls.sh 优先从我们的 GitHub Release 下载 LS binary（39 行 + `server.js` -2） | — |
| 86fdab4 | 04-23 | D | 加 kimi-k2-6 模型定义（`models.js` 1 行） | — |
| 621888e | 04-23 | E | #34：账号余额日额度/周额度/Prompt 三条进度条（`index.html` 39 行） | #34 |
| cac0b8d | 04-23 | B | #32,#22：工具仿真改用 READ_ONLY(2) 替代 NO_TOOL(3)——NO_TOOL 的 system prompt 告诉模型「你没有工具」导致 opus/thinking 拒绝注入的工具定义；**当日被 163a276 revert**（READ_ONLY 触发 LS proto wire-type 错误） | #32, #22；(深挖 §3.18) |
| 280a5ae | 04-23 | H | 架构图协议标签移到线下方防遮挡 + 紫色回应流粒子反向动画（`docs/index.html` 16 行） | — |
| f0c33c7 | 04-23 | H | 架构图全面重构——暗色沉浸 + 数据流粒子 + 特性矩阵（`docs/index.html` 249 行） | — |
| 0874851 | 04-23 | H | 架构图重构——节点渐入 + 数据流动画 + 中心辐射光晕（`docs/index.html` 124 行） | — |
| 0edf11e | 04-23 | B | #35：中文回复英文 + 历史截断防超大 payload——`client.js` +21、`windsurf.js` +6 | #35 |
| 8846eb4 | 04-23 | A | #24：cascade reuse 账号忙时等 5s 而不是直接放弃——`chat.js` +19：`for w<10 { await 500ms; acquireAccountByKey }`，放弃 reuse 意味着回退 text-blob 历史丢上下文 | #24 |
| 45ddc02 | 04-23 | A | #24：idle 阈值回调 3→2 防 180s 超时——`client.js` 4 行（growthSettled 阈值 pollInterval×3→×2、idleCount 3→2） | #24 |
| 0372c18 | 04-23 | B | #30：图片+工具同时存在时保持 NO_TOOL 模式——`windsurf.js` +5 | #30 |
| d1687e1 | 04-23 | A | #24：cascade 过期 fallback 重建全量历史——**上下文丢失根因**：resume 时 `reuseEntry.cascadeId = null`（force StartCascade）导致全新 cascade 但 text 仍是 resume-only 的最后一条消息；修：`reuseEntry = null` 后按完整历史 XML-tagged 重建（`The following is a multi-turn conversation. You MUST remember...`），`client.js` +16 | #24；(深挖 §3.05) |
| b173f3d | 04-23 | A | #24：恢复 conversation reuse + resume 只发最后一条——`client.js` +12/-21：与 37d42e6 的「reuse 也发完整历史」方向相反（native cascade 上下文远好于 text-blob 重打包，reuse 命中时只发最新 user 消息；fresh 才打全量 XML 历史）；顺带把 37d42e6 漏掉的 reuse 开关恢复 | #24；(深挖 §3.04) |
| 18a3d81 | 04-22 | A | #22,#24：三模块全面审计 10 个边界问题——`conversation-pool.js`（fingerprint 加 system prompt hash 防碰撞、非流式补 !emulateTools 守卫、prune 先清过期再 LRU）；`tool-emulation.js`（64KB buffer 上限防 OOM、flush 用 `_findClosingBrace` 提取 JSON 防尾部文本丢调用）；`client.js`（warm stall 检查移到 step 循环后修「最后一轮文本被掐断」、cold stall 计入 toolPreamble 长度、idle 2→3） | #22, #24；(深挖 §3.06) |
| 5a0d738 | 04-22 | A | #22,#24：双层工具注入 + fingerprint 加模型名 + Pages 重构——`conversation-pool.js` +8（fingerprint 加 modelKey）、`chat.js` +18（field 12 + user preamble 双层注入）、`docs/index.html` 大改 -1021/+360 | #22, #24 |
| 3b2a30c | 04-22 | B | #22：兼容裸 JSON 工具调用 `{"name":"…","arguments":{…}}`——`tool-emulation.js` +68（`_findClosingBrace` 括号深度扫描 + `_consumeJsonBlock`） | #22；(深挖 §3.08) |
| d313476 | 04-22 | M | merge branch 'master'（远程同步） | — |
| 9f1de4b | 04-22 | M | merge PR #26（youfak：docker 支持） | — |
| 3ef2061 | 04-22 | B | #22：tool_code 格式流式实时解析——`tool-emulation.js` +71：`{"tool_code":"name(args)"}` 块不再漏给客户端当文本（原来 malformed 直接 surface 成 literal text），括号深度 + 字符串转义感知的流式解析 | #22；(深挖 §3.07) |
| 4fce358 | 04-22 | B | #22：加强 tool_call 格式指令 + 兼容 Cascade tool_code 格式——`tool-emulation.js` +23、`windsurf.js` +5 | #22；(深挖 §3.07) |
| 25332ff | 04-22 | M | merge dwgx:master 进 youfak 分支 | — |
| 28174cf | 04-22 | G | 修复重启语言服务出错（youfak）——`install-ls.sh` 2 行、`api.js` +14、`.gitattributes` +4 | PR #26 |
| 2ba6ee0 | 04-22 | G | docker 支持（PR #26 youfak）——`Dockerfile` 30 行 + `docker-compose.yml` 20 行 + `.dockerignore` + 5 个 dashboard 模块改 env 直读（logger/model-access/proxy-config/stats/runtime-config 各 4-8 行，容器内不读本地文件） | PR #26 |
| 06c2643 | 04-22 | A | #24：多轮历史打包改 XML 标记 `<human>...</human>`/`<assistant>...</assistant>` + 记忆指令（`client.js` 6 行） | #24 |
| 37d42e6 | 04-22 | A | #24：reuse 模式也发完整历史不再只发最后一条——`client.js` +20/-24：Cascade server 不保证跨轮保留 per-cascade context，reuse 只省 StartCascade RPC | #24；(深挖 §3.03) |
| ba53e92 | 04-22 | G | #25：SOCKS5 代理支持——零依赖手写 RFC 1928/1929：`socks.js` 115 行新模块（握手/auth/method 协商）、`windsurf-api.js` +6、`api.js`/`windsurf-login.js` 接入 | #25 |
| dfe0c43 | 04-22 | A | #24：fingerprint 改为只用 user 消息——修复 0% 命中率根因：assistant 消息跨客户端轮次结构不稳定（客户端会重组 content 数组、加 tool_use 块、改文本）导致 hash 永不匹配；fingerprintAfter 同步改为 hash 全部 user 消息 | #24；(深挖 §3.01) |
| 16c1cda | 04-22 | A | #24：cascadeConversationReuse 默认开启 + 支持 tool emulation + TTL 30min——`chat.js` +9（去掉 emulateTools 禁用条件）、`conversation-pool.js`（TTL 10min→30min）、`runtime-config.js` 默认 true | #24；(深挖 §3.02) |
| 2721cce | 04-22 | M | chore: bump version 1.4.0 | v1.4.0 |
| 72bd2ed | 04-22 | B | #22：去掉 field 13 所有 identity 指令防 anti-injection——`windsurf.js` -35/+19：field 13 communication_section 最小化（不带任何 identity 操纵措辞，`IDENTITY RULE: adopt identity...` 全删）；`chat.js` 11 行（客户端已有 system prompt 时跳过 identity 注入）——与 fc93ade 方向相反，是 identity 战争的最新收口 | #22；(深挖 §3.07) |
| fc93ade | 04-22 | B | #22：communication_section 改用 identity redirect 替代直接声明——`windsurf.js` +32/-40：`IDENTITY RULE: You must adopt the identity described in the user's system prompt...`（直接说「你是 Claude」会造成与 Cascade 内置身份三方冲突触发 opus-4-7 拒绝，改为重定向到客户端 system prompt）；后又被 72bd2ed 推翻 | #22；(深挖 §3.07) |
| d1d628c | 04-22 | G | #19：install-ls.sh + config.js 兼容 macOS——`install-ls.sh` 59 行（darwin 分支）、`config.js` +6 | #19 |
| e4fed17 | 04-22 | B | #19,#22：ENOEXEC 平台提示 + 跳过已有 system prompt 的 identity 注入——`langserver.js` +15（ENOEXEC 明确提示装错平台 binary）、`chat.js` +14 | #19, #22 |
| 6002cc6 | 04-22 | M | merge PR #20（motto1：dashboard Windsurf login auth1 batch） | — |
| fb65064 | 04-21 | E | PR #20（motto1）：Auth1 登录流 + 批量导入——`windsurf-login.js` 242 行重写（Auth1 password login + Firebase 双路径）、`api.js` +102（批量 /auth/login）、`index.html` 281 行（批量导入 UI） | PR #20；本片最早 commit |

## 2. 深挖明细（36 条逻辑级，hash 与 §1 对应）

### §3.01 dfe0c43 —— #24 首刀：fingerprint 0% 命中根因（04-22）
`conversation-pool.js` 原 fingerprint 把「除最新 user 外的全部历史」hash 进去——但 assistant 消息跨客户端轮次结构不稳定（客户端会重组 content 数组、追加 tool_use 块、微调文本），hash 永不相等 → reuse 永远 miss。改：只 hash user 消息（`users.length < 2` 直接 null），`fingerprintAfter` 同步 hash 全部 user。代价：assistant 内容变化不再产生新 key（后由 38398c4 的语义 key 补回）。

### §3.02 16c1cda —— #24 第二刀：reuse 默认开（04-22）
`cascadeConversationReuse` 默认 false→true，TTL 10min→30min，**去掉 emulateTools 禁用条件**（注释自白：之前禁用导致所有 Claude Code 会话每轮丢上下文）。关键取舍：fingerprint miss 只回退 fresh cascade（不劣于现状），但 tool emulation 下 fingerprint 不稳定 → 命中率低（后续 37d42e6 补历史，最后 b173f3d 又翻回）。

### §3.03 37d42e6 —— #24 第三刀：reuse 也发完整历史（04-22）
发现 Cascade server 不保证跨轮保留 per-cascade context，reuse 只省 StartCascade RPC。改：无论是否 resume 都打包完整历史（`[Conversation so far]...` 文本）——**与 b173f3d 方向相反**，两刀互相打脸后以 b173f3d 收口。

### §3.04 b173f3d —— #24 方向反转：恢复 resume-only（04-23）
37d42e6 的全量历史 text-blob 重打包会丢 native cascade 上下文（模型对多轮的记忆不如上游轨迹真实）；改回：reuse 命中只发最新 user 消息（`isResume || convo.length <= 1`），fresh 才全量打包；并修复 37d42e6 漏掉的 reuse 开关（`!emulateTools` 条件恢复前被删）。上下文丢失的两难：**上游轨迹保真 vs 上游不保真时的自愈**。

### §3.05 d1687e1 —— #24 根因：过期 fallback 只发最后一条（04-23）
resume 时原代码 `reuseEntry.cascadeId = null` 强制 StartCascade——但 text 早已按「resume-only（最后一条）」构建。新 cascade 是全新的，只有最后一条消息 → **上下文丢失的真根因**。修：`reuseEntry = null` 后重建全量 XML-tagged 历史（`<human>/<assistant>` 标签 + `You MUST remember and use all information from prior turns`），且 sysText 前置。这正是 4aa4d7b 里 rebuildFullHistoryText 的前身。

### §3.06 18a3d81 —— #22,#24 三模块审计 10 边界（04-22，本片承重件）
- conversation-pool：fingerprint 加 system prompt hash 防碰撞；非流式补 `!emulateTools` 守卫；prune 先清过期再 LRU
- tool-emulation：64KB buffer 上限防 OOM；`flush()` 用 `_findClosingBrace` 提取 JSON 防尾部文本丢调用
- client：warm stall 检查移到 step 循环后（修「最后一轮文本被掐断」）；cold stall 计入 toolPreamble 长度；idle 2→3
- 4 文件 +58/-56。此后 idle 阈值在 45ddc02 又回调 3→2——同一常量来回调，反映「LS 轮询时序」一直在猜。

### §3.07 工具调用格式战争（#22，4fce358 → 3ef2061 → 3b2a30c → fc93ade → 72bd2ed）
四层递进：① 4fce358 加强 preamble 格式指令 + 兼容 Cascade `tool_code` 输出；② 3ef2061 实现 `{"tool_code":"name(args)"}` 流式解析（括号深度 + 字符串转义感知），不再漏给客户端当文本；③ 3b2a30c 兼容裸 JSON `{"name":…,"arguments":{…}}`（`_findClosingBrace` 通用化）；④ 身份注入两连翻：fc93ade 用「identity redirect」避免三方身份冲突触发 opus-4-7 anti-injection，72bd2ed 又彻底去掉 field 13 所有 identity 措辞（客户端已有 system prompt 时跳过注入）。同一目标四个策略层，反映与上游模型注入守卫的拉锯。

### §3.08 3b2a30c —— 裸 JSON 工具调用（04-22）
`tool-emulation.js` +68：新增 `_findClosingBrace()`（跟踪 `{`/`}` 深度 + 字符串内转义）+ `_consumeJsonBlock()`，把流式输出里形如 `{"name":"…","arguments":{…}}` 的整块 JSON 在闭合括号处切出来解析成 tool_call，非 JSON 内容回退 safeParts 当文本。这是后续 3792678（lenient JSON parse）和 37c149f（Bash 截断修复）的解析基础设施。

### §3.09 20b3f1b —— reuse replay 重复上下文（04-23）
resume 轮若从 step offset 0 重新 poll 轨迹，旧 planner-response 步骤被重放成新输出，文本/usage 跨轮累积（`alpha`→`alphabeta`→…）。修：conversation pool entry 存绝对 `stepOffset`/`generatorOffset`，resume 从绝对偏移续读；旧 entry 无 offset 时调 `GetCascadeTrajectorySteps`/`GetGeneratorMetadata` 一次性快照兜底。这是「reuse 功能自己引入的重复」（F9）。

### §3.10 bef4b8a —— #24,#38：meta-tag strip（04-23）
PR #36（baily-zhang）修了 fingerprint 的 stableTurns 后 reuse 仍 0%——根因是 client 注入的 7 类 meta-tag（system-reminder/command-message/command-name/command-args/local-command-stdout/local-command-stderr/user-prompt-submit-hook）每轮内容都变（cwd 快照/todo/时间戳/hook 输出），hash 永不相等。修：`META_TAG_NAMES` 列表 + 正则 strip 后再 hash；顺带把 tool call input 也全链路 sanitize（#38 路径泄漏）。e063cb0 后来把 analysis/summary/example 也补进列表。

### §3.11 78d3628 —— #24 路径幻觉 + read-loop（04-24）
Cascade 会从训练先验脑补「我看了 /tmp/windsurf-workspace/config.yaml」（根本没真读），原 sanitize 把这些路径改写成 `./tail` 期望落到用户 cwd——反成 antifeature：Claude Code 拿 `./config.yaml` 去 Read → ENOENT → 重试循环。修：扁平化为 `[internal]` 中性标记 + field 12 追加行为级禁令（`CRITICAL OPERATING CONSTRAINT`：Never narrate tool-like actions, Never reference file paths...）。**能力层禁止升级为行为层禁止**，是 #24 从「路径工程」转向「行为约束」的分水岭。

### §3.12 1e1d923 —— #24 redact 标记 2.0：`<redacted-path>`（04-24）
`[internal]` 被 LLM 当括号目录名执行 `ls [internal]` 循环。改 HTML 风格尖括号标记——shell/file API 不会解析，下游模型不把尖括号 token 当文件名。注释明确记录了演进史（`./tail`→`[internal]`→`<redacted-path>`）。

### §3.13 b8a2057 —— #24 redact 标记 3.0：自然语言短语（04-25）
`<redacted-path>` 仍被模型当 file_path 参数传 Read/Bash → ENOENT（Windows Errno 22）循环（drift probe 实测 sonnet 反复 `read_file('<redacted-path>')` 崩溃）。改多词括号短语 `(internal path redacted)`——无法被 tokenize 成路径。

### §3.14 2557fb8 —— #24 redact 标记 4.0：无 shell 元字符（PR #53，04-25）
`(internal path redacted)` 被 zsh 解析成 glob-qualifier 语法 → `unknown file attribute: i` 诡异报错，Opus 直接懵掉停调工具。最终版 `redacted internal path`：三约束（无 shell 元字符 + 不像路径 + 读起来像散文），任何 shell 把它当 argv 也只产生干净可恢复的错误。**四个标记四轮迭代**，每一版都踩一种消费端（客户端工具循环 / shell 解析 / 模型复用），是 #24 链条里最典型的「LLM 行为不变量 vs 工程符号」博弈。

### §3.15 4aa4d7b —— #24 panel-state-missing 重试 3 次（04-25）
`client.js` +54：`MAX_PANEL_RETRIES=3`，每次重试 = 完整 re-warm（新 sessionId + panel init + 新 StartCascade）+ `rebuildFullHistoryText()` 全量历史重建 + backoff；超过后抛带 payload 大小的诊断（30KB+ system prompt 的 opencode+omo 场景 LS 反复失效）。d1687e1 的 fallback 逻辑在这里被抽成可复用函数。

### §3.16 5f5397a —— SSRF DNS rebinding + prototype pollution（04-23）
`image.js` +23：在 `node:dns` lookup hook 里做 DNS 解析后地址检查（`PRIVATE_IP` 正则覆盖 127/10/172.16-31/192.168/169.254/100.64/0/::1/fe80/fd..），**解析后拦截**而不是字符串 host 检查——公网 hostname 解析到内网 IP 的 DNS rebinding 被闭合；socket 根本不建立。`runtime-config.js` deepMerge 跳过 `__proto__`/`constructor`/`prototype`（dashboard 可写 JSON 防 prototype pollution）。此前 a434c40 已建 `net-safety.js` 105 行做字符串层校验，这刀补解析层。

### §3.17 F2 链：4b6cde8 → cc60746（auth bypass 引入与收口，04-23）
- **引入** 4b6cde8：dashboard 前端没配 dashboardPassword 时请求带空 password header 会 fall through 到 apiKey 校验失败 → 前端认证挂。作者为「修复」把 `pw === config.apiKey` 改成 `!pw || pw === config.apiKey`——**任何无 header 请求直接放行**，秒变严重 auth bypass。
- **收口** cc60746（同日）：改回 `pw === config.apiKey`。2 行 diff 一来一回。
- **加深** 2a9724a（2.0.17）：fail-closed 基建（无 secret 时仅 localhost 放行 + timingSafeEqual）从体系上消灭这类默认放行。

### §3.18 F3 链：dfb979a 警告 + 当日三连 revert（04-23）
dfb979a 的 commit message 明确记录 3 个「不能改」：LS metadata 版本、gRPC 压缩头、planner READ_ONLY。当日三个改动全部踩中：
1. **410d867**：删 `grpc-accept-encoding: identity,gzip,deflate` + UA → LS 开始发压缩数据，wire-type 解析错误 → revert（删 2 行）。
2. **163a276**：cac0b8d 把 planner 从 NO_TOOL(3) 改 READ_ONLY(2)（动机：NO_TOOL 的「你没有工具」system prompt 让 opus 拒绝注入的工具定义）→ LS proto wire-type 错误 → 改回 NO_TOOL。
3. **1d022ff**：buildMetadata 版本 1.9600.41 → 1.108.2（想伪装成 grpc-node）→ LS 解析 wire type 7 错误 → 改回 1.9600.41。
**三个「聪明改动」全部触发 LS 端协议解析失败**——proxy 侧怎么伪装都行，LS 侧是唯一真值，任何偏离都会在 wire 层爆掉。

### §3.19 2a9724a —— 2.0.17 安全审计一波（5 HIGH，04-28）
- HIGH-1 无 apiKey default-allow → fail-closed（仅 localhost bind，timingSafeEqual，HOST/BIND_HOST env）
- HIGH-2 `/auth/accounts` 泄漏完整上游 apiKey → `apiKey_masked` + `getAccountInternal` + reveal-key 显式流程
- HIGH-3 dashboard 写接口 default-allow → fail-closed
- HIGH-4 gRPC frame parser 异常炸进程（`req.on('data')` 未 catch → Node 默认 crash）→ try/catch + NGHTTP2_CANCEL + Connect 解压失败改抛错 + 100MB cap
- HIGH-5 **完全禁用 LS 端口盲接管**：42100 被占即换端口起新 LS（原来直接当 LS 用并把手持 apiKey 的账号元数据发过去，本地恶意进程抢端口即可窃取；nginx `server: custom-grpc-decoy` 一行就能骗过 probe）——「方便」换「安全」
- MED-6：自曝 v2.0.16 自己 ship 的 schema-compact 回归（0cbecfd 的四档 preamble 里 MED）。

### §3.20 C 协议面三连：9c6b685 → efbcf16 → e3ea65f（04-26~27）
- **9c6b685**（#56,#63）：/v1/responses 476 LOC 新模块：responsesToChat 双向翻译（input items→messages、function_call→tool_calls、reasoning.effort 透传）+ chatToResponse + ResponsesStreamTranslator（capture-the-stream 复用 SSE 序列）。Codex CLI 兼容目标。
- **efbcf16**（PR #72 sandleft）：responses.js 406 行重写补完整工具调用往返（execute→tool_result 回填、取消/续跑语义）——第一个来自外部贡献者的协议层大件。
- **e3ea65f**：Anthropic prompt-caching `cache_control:{ttl}` → cascade 复用 TTL 提示（messages.js +98、conversation-pool.js +23）。**这刀就是 ea7ad69（#82/#83）ReferenceError 的引入源**——`cachePolicy` 在顶层声明没传给两个 helper。

### §3.21 5824773 + 61e7846 + 54e78ad —— 协议面审计与 transport 恢复（04-25~26）
- **5824773**（#59,#63,#66）7 项：P1 真因 ToolCallStreamParser 丢 text/tool 相对顺序 → items 数组保序；#66 rate-limit cooldown 精确解析 retry-after（不再一刀切 5min）+ 并发 429 不再无限后推；#63 非 function tools 静默 drop → 400 + function-only 响应去空 message；/v1/messages 透传 thinking + tool_choice；全账号 RPM 满返 429 不是 503。
- **61e7846** polish：reservation 亚毫秒 token、30s 兜底误伤修正、流/非流语义对齐；**自曝 5824773 里写了从没被读的 `_lastReservationAt` 字段**。
- **54e78ad**（#64）：HTTP/2 取消/ECONNRESET/panel state 统一视为 transient（`isCascadeTransportError` + `resetCascadeTransportState` 清会话），warmup 各步 transport 错误即抛即清，不再「只 warn 继续」——为 9f13cc5 的 Heartbeat 加固铺路。

### §3.22 101cd90 + ae4067c + e078f35 + 2ed0967 —— v2.0 大包与工具流回归（04-23~25）
- **101cd90** v2.0：53 测试 + connect-rpc（grpc.js +107）+ #42 动态云探测（auth.js +52）+ Retry-After + TOOL_PARSE_MODE + REPLICA_ISOLATE + cli-agent-sim 348 行 + nginx.conf；修 releaseAccount 空指针、nginx `$proxy_addrs` 拼写、VERSION 循环依赖、cache key 跳 base64 图、XML 标签注入、65KB 溢出、meta-tag 自动学习。
- **ae4067c**（#54）：工具调用流回到 Anthropic 等价行为——tool_use/tool_result 配对、step 结构对齐（8 文件 +661/-111）。
- **e078f35**（#61）：Opus 4.7 上下文爆炸——`safeBlockToString` 把 image/base64/二进制块压成占位符（防 base64 泄漏进 text 通道重放）+ `extractCompactSystemFacts` 从 sysText 提取 cwd/git/platform 五要素。
- **2ed0967**：deprecated 模型 410 `model_deprecated`（不再让上游返 cryptic 502 让人无限重试）。

### §3.23 0cbecfd —— #77 tiered tool preamble 四档（04-28）
binary fallback（71KB full 或 2KB names-only）改四档逐级降级：full（完整 schema ~150KB）→ schema-compact（minified + 剥 description/examples/default/title/additionalProperties ~10KB，**新档**）→ skinny（name + 首句描述 + 参数签名 ~5KB，**新档**）→ names-only（~2KB）。25 工具/71KB 案例从「直接降 names-only 丢全部 schema（opus-4-7 懵掉回 14 字符）」变成「落在 schema-compact 档」。新增 `stripSchemaDocs`/`firstSentence`/`paramSignature` 三个压缩工具函数。**这是 #86 方言重构（9c2dc30）的前置基础设施**。

### §3.24 38398c4 —— 2.0.25 codex 审计 7 条整改（04-29）
- HIGH-1：fingerprint 升级 server-state 语义 key（version:2 + systemDigest + toolContextDigest + canonicalContentBlock + stableStringify 递归排序）——**正确性 over 命中率**，system/assistant/tool 配置不同不再撞 entry（修 dfe0c43 只 hash user 造成的 cross-context bleed）。
- HIGH-2：expired/not_found cascade 必须 fresh fallback + 坏 entry 不可 restore（6 处 restore 路径跳过，`reuseEntryInvalid` 标志传播）。
- HIGH-3：caller isolation（per-user scope）扩展到 chat/responses 两入口。
- 3 MED（tool schema digest、TTL 策略、原子 checkout）+ 2 LOW（LS-restart sync、history coverage）。
- `conversation-pool.js` 387 行重写 + 15 新测试，311/311。

### §3.25 9c2dc30 —— #86 GLM/Kimi tool 方言（04-29）
`tool-emulation.js` +365：`pickToolDialect` 按模型选 preamble 变体（4 种），GLM 4.7/5/5.1 的 `<tool_call>NAME<arg_key>` 与 Kimi K2 的 `<|tool_calls_section_begin|>` 两套解析器 + **历史序列化回写原方言**（修完后把 tool_calls 序列化成模型自己的方言格式回填历史，而不是统一标准格式）。此前这些格式被静默丢弃（finish_reason=stop 但 tool_calls 空）。0984875（GLM5.1 thinking→content 提升）与 946a14f（Windows sanitizer）是同一 issue 的 follow-up。

### §3.26 F1 链：04616c6 → 9f13cc5 → 4b555bb（GRPC_PROTOCOL 生产全挂，04-29）
- **引入** 04616c6（2.0.19）：`USE_CONNECT = process.env.GRPC_PROTOCOL !== 'grpc'`——把「Connect only when explicit」改成「Connect by default」，理由：注释说 Connect 是默认但代码不是（注释/代码不一致 bug）+ Connect headers 更像真实 client。release notes 明写「非破坏性改动」。
- **恶化** 9f13cc5（2.0.20）：继续补 Heartbeat + UpdatePanelStateWithUserStatus，**没发现 transport 切换的问题**（单测只验 const 取值）。
- **引爆** 生产部署：所有 cascade 模型 `StartCascade returned empty cascade_id`，chat 流瞬间全挂。临时 `.env GRPC_PROTOCOL=grpc` 立刻恢复。
- **收口** 4b555bb（2.0.21）：`USE_CONNECT = process.env.GRPC_PROTOCOL === 'connect'` 改回 + 注释记下空 cascade_id 问题 + 测试翻转。**作者 postmortem：单测只验 const 取值，没起 fake LS HTTP/2 server 真跑一次 Connect framing 的 StartCascade**——「改 transport 默认必须端到端验证」成为教训写入注释。
- 现状：legacy 默认，Connect 保持 opt-in，空 cascade_id 解析缺陷留待后续审计。

### §3.27 91b2441 + 4b72ecd + 0476121 —— fresh account 403 race（04-30）
- **引入** 4b72ecd（v2.0.0）：tier 体系引入 `MODEL_TIER_ACCESS.unknown = [gemini-2.5-flash]`——新号 probe 完成前 tier='unknown'。
- **恶化** 0476121：probe 只打 gemini canary（Claude canary 烧 Trial 配额）→ 新号更晚才有真实 tier。
- **引爆** QQ 群 04-30 报告「获取不到模型，添加账号后不能调用」：`chat.js` anyEligible 预检用 unknown tier 判模型可用性，110/111 模型全 403 `model_not_entitled`。
- **修复** 91b2441：`unknown` 乐观放行全量 pro 目录（`Object.keys(MODELS)`）+ 未 probe 账号返回 `probe_pending` 错误类型（提示等 10-30 秒或手动 Probe）。取舍：free 用户可能在 probe 完成前试 opus → 由上游 LS 返回真实权益错误（比代理层误导性 403 准确）。验证：tmp/probe-race.mjs 0/111 403。

### §3.28 F10/#104 链：0eaee36 → 4efd0e3（JSON 跨轮污染，04-24→04-30）
- **引入** 0eaee36/9351159（hvoy.ai 准备）：`applyJsonResponseHint` 除 system message 外还把长 JSON-only 指令 append 到**最近一条 user message content 末尾**。
- **暴露** #104（ccnetcore）：`claude-opus-4-7` 第一轮要 JSON，第二轮纯问候 `你好` 仍回 `{"reply":"你好"}`。根因：user content 被上游 cascade 存进 trajectory，下一轮复用同一 cascade 时历史里仍挂着「[You MUST respond with valid JSON only ...]」。
- **修复** 4efd0e3：只注入 system message（system 每轮重建不进 trajectory），删 `appendJsonHintToContent` 整个 helper + `extractRequestedJsonKeys` 的 split 死代码；回归测试钉死「user content 字节级不变」。顺带修 #103（-thinking allowlist 继承）。

### §3.29 F11 链：a4f2e19/20b11d9 → ef41682（email 登录挂 4 天，04-26→04-30）
- **引入** a4f2e19/20b11d9（04-26）：Windsurf 把 email 主探测迁到 Connect-RPC `CheckUserLoginMethod`（旧 `/_devin-auth/connections` 跑 Vercel functions 几秒一 504），为追上游迁移把主探测切到新端点。
- **暴露** #84「账号密码登陆又不行了」（04-28 前后）：两个叠加缺陷——① `addAccountByEmail` 一直是一行 stub（`throw 'Direct email/password login is not supported'`），dashboard 有完整管线但 `/auth/login` HTTP 路径没接；② CheckUserLoginMethod Vercel edge 偶发返回空 `{}`，原代码把缺失字段当 false → `hasPassword:false` → 误抛 ERR_NO_PASSWORD_SET，连旧路径/Firebase fallback 都没尝试。**回归跨 4 天**。
- **修复** ef41682（2.0.39）：拆 stub 接进 windsurfLogin 管线 + `hasOwnProperty` 显式查字段，两字段都缺才回退 `/_devin-auth/connections`；保留 `userExists:false`（不存在）与 `hasPassword:false`（仅 OAuth）语义。VPS 实测 3 账号 batch 全 active。
- 现状：/auth/login 三模式（email/token/api_key）+ 批量可用。

### §3.30 a24855f —— docker 一键自更新三连炸（05-01）
一个红字串起三个独立 bug：① `runDockerSelfUpdate` 只 pull 应用镜像没 pull `docker:24-cli` sidecar → 新主机首次点按钮 `/containers/create` 404；② 前端 `applyUpdate` 用 `r.detail || r.reason`，长而不可控的 detail 优先于稳定短码 → 整段 docker 报错被当 i18n key；③ `I18n.t` zh-CN fallback 的 `querySelector('[data-i18n="${key}"]')` 无转义 → `"` `{` `:` 等 CSS 元字符抛 SyntaxError，堆栈直出 UI。修：后端补 `dockerPull(DEPLOYER_IMAGE)` + 独立 reason 码；前端 reason 本地化 + detail 作后缀；i18n 加 charset 校验 + CSS.escape + try/catch 双层防御。

### §3.31 04bb2ad + b4a9ebf + 222526b + c878669 + 4a96d92 —— cwd 提取五连（#100→#108，04-30~05-01）
一条用户报告链：yunduobaba（#100）「opus 拒绝读 Windows 路径」→ c878669（v2.0.44）剥 `<system-reminder>` 再扫 → zhangzhang-bit（#106/#107）「好像没提取到」：Claude Code 2.x 把 env 块从 user message 挪进 system prompt 且改措辞（b4a9ebf 补形容词 + bullet 两套格式）→ 修好后暴露 trust 半开（222526b：UpdateWorkspaceTrust 静默失败升级 + untrusted workspace 重试）→ nalayahfowlkest-ship-it（#108）「模型把代理脚手架当用户项目分析」：04bb2ad 脚手架换皮 `proxy-workspace-stub` + 四档 preamble 加 `WORKSPACE_STUB_OVERRIDE` 优先级声明。**同一现象五轮递进，每轮修复揭开下一层**——cwd 提取从「user 消息正则」演进到「system prompt 多措辞 + 上游 trust 状态 + 脚手架语义」三层。

### §3.32 1a59503 + 9e6afc2 + ea7ad69 + 8f4f7b6 + 2ed79ad + 2e29724 —— 审计与回归集合（04-26~04-30）
- **1a59503**（2.0.42）：cacheKey 补 caller 维度（跨租户串读 P0）+ pool checkout 先验证再删 + `fs-atomic.js` 原子写 4 处 JSON。
- **9e6afc2**（2.0.18）：dual-audit 第二轮 2 HIGH + 2 MED。
- **ea7ad69**（#82/#83）：`cachePolicy` 作用域泄漏 ReferenceError（e3ea65f 引入），stream + non-stream 双路径，所有 v2.0.12 用户中招，hotfix。
- **8f4f7b6**：`positiveIntEnv` 复制漏改（client.js/pool 有、auth.js 没有）→ 云探测每 15min ReferenceError 被吞成 WARN，长期污染 pm2 日志。
- **2ed79ad**（#67）：accounts.json 进 per-replica dataDir → compose 升级即丢账号；改 sharedDataDir + 迁移。
- **2e29724**（#68）：未知模型 fall through 到 modelEnum=0 被上游静默路由默认模型（「I'm Claude 4.5」）→ 400 + 裸 claude-4.6 别名归 sonnet。

### §3.33 #93 链：eeff104 → 1d5b61c → 599ddf0（Sonnet 4.6 reuse，04-30）
- **eeff104**：reuse 从只认 Opus 扩展到 Sonnet 4.6 thinking（`isToolEmulatedReusableModel` + `WINDSURFAPI_DISABLE_SONNET_TOOL_REUSE` 逃生门）。
- **1d5b61c**：新功能撞上旧 bug——v2.0.33 的 `shouldFallbackThinkingToText` 在 streamResponse 里引用不在作用域的 `routingModelKey`（对象 shorthand 语法），**每个 stream 完结必崩一次**（#93）；修成 `wantThinking` boolean 透传。
- **599ddf0**：zhangzhang-bit 升完仍「ID 每次变」——apiKey 模式无 body 用户信号时 callerKey 只有 `api:<hash>`，`hasPerUserScope` false → reuse 全程禁用；补 `:client:<ip+ua-hash>` fallback subkey。

### §3.34 0984875 + 8539d2e —— 静默输出与回声循环（#86 follow-up / #96，04-30）
- **0984875**：GLM 5.1 整段响应进 `step.thinking`（客户端默认隐藏 reasoning_content）→ 用户只见「thinking」指示无文字；`shouldFallbackThinkingToText` 在非 reasoning 模型 + 无 text/tool_calls 时把 thinking 提升为 content。
- **8539d2e**（#96）：占位符 `…`（省略号）被 Sonnet 4.6 在散文里复读（「your path is …」）造成问答回声循环 → 改 `<workspace>` 文本 + 四档 preamble 挂 `WORKSPACE_PATH_HINT`。占位符第六次迭代（`./tail`→`[internal]`→`<redacted-path>`→`(internal path redacted)`→`redacted internal path`→`…`→`<workspace>`）。

### §3.35 31578fd + 5fb400f + 1c40d46 —— LS 运维三件套（04-29~30）
- **31578fd**（2.0.40）：probe 全局布尔锁 → per-account `Map<id,Promise>`（同 id 去重共享 promise，不同 id 并行；null 只留给「账号真不存在」）——修多账号同时探测时「Account not found」假错误；dashboard 一键更新 LS binary。
- **5fb400f**（2.0.41）：install-ls.sh 覆写正在 exec 的 ELF 触发 ETXTBSY → `${TARGET}.new.$$` + chmod + `mv -f` 原子替换；docker.sock opt-in 自更新（安全警告写进 compose 注释）。
- **1c40d46**（#87，2.0.32）：自更新不可用状态优雅降级（无 docker 环境返回明确状态而非报错）。

### §3.36 4a96d92 —— #100/#101/#102 三连（04-30，cwd fallback + 轨迹失效 + 方言）
- #100：`extractCallerEnvironment` 兜底扫第一条 user message 开头裸绝对路径（三种 shape，文件后缀拒、须是首 token）——修 claudecode fork/旧版不发 canonical env block 时 cwd 全丢。
- #101：cascade 超时后坏轨迹失效（不再把超时轨迹放回池，下轮不再命中坏 entry 丢上下文）。
- #102：kimi-k2-6 方言在 #86 框架内的补充。
- 测试三件套 ~190 行，是「用户报告 → debug log 定位 → 保守约束」模式的样板。

## 3. 问题链清单（10 条完整链）

### 链 1：#24 上下文丢失（本片头号，16 次 commit 引用）
- **引入**：cascadeConversationReuse 从 0 到 1 的过程中，fingerprint/打包/重试三层各自有缺陷。
- **演化**：dfe0c43（fingerprint 只用 user，修 0% 命中）→ 16c1cda（默认开 + tool emulation 支持 + TTL 30min）→ 37d42e6（reuse 也发完整历史）→ 06c2643（XML 标签打包）→ b173f3d（反转：resume 只发最后一条，native context 优先）→ d1687e1（**过期 fallback 重建全量历史——真根因**）→ 45ddc02（idle 3→2）→ 8846eb4（忙时等 5s）→ 4aa4d7b（panel retry 3 次 + backoff）→ 78d3628（路径幻觉/read-loop 行为禁令）→ 1e1d923/b8a2057/2557fb8（redact 标记三迭代）→ bef4b8a（meta-tag strip 修 fingerprint 漂移）→ 20b3f1b（replay 去重 offset）→ 66897aa/24ff63a/5d2bb68（PR #36 strict 模式）。
- **返工**：37d42e6 ↔ b173f3d 方向互翻；18a3d81 与 45ddc02 对 idle 阈值两头调。
- **现状**：2.0.25（38398c4）语义 key 重写后「正确性 over 命中率」，命中率下降但每次命中语义对得上；2.0.37/2.0.38（599ddf0/4a96d92）补 apiKey 模式与超时失效。13+ 次修复，从路径工程走向行为约束再走向语义 key。

### 链 2：#22 工具调用兼容（9 次 commit 引用）
- **引入**：上游模型（Opus 系）输出方言化 + 注入守卫，标准 tool_call 解析接不住。
- **演化**：4fce358（格式指令 + tool_code）→ 3ef2061（tool_code 流式解析）→ 3b2a30c（裸 JSON 兼容）→ fc93ade（identity redirect）→ 72bd2ed（去 identity 指令）→ cac0b8d（READ_ONLY 模式，当日被 revert）→ ae4067c（#54 Anthropic 等价流）→ 85cc005（PR #51 措辞过注入守卫）→ 9c2dc30（#86 GLM/Kimi 方言）→ 0cbecfd（#77 四档 preamble）。
- **返工**：fc93ade ↔ 72bd2ed 身份注入两连翻；cac0b8d 当日被 163a276 revert。
- **现状**：4 种方言解析器 + 四档 preamble + 注入守卫友好措辞；仍处「上游一动就回归」的拉锯态。

### 链 3：F1 GRPC_PROTOCOL 生产全挂（04616c6 → 9f13cc5 → 4b555bb）
- **引入**：04616c6 修注释/代码不一致，Connect 默认化——「看起来非破坏」。
- **暴露**：生产部署后所有 cascade 模型 `StartCascade returned empty cascade_id`，chat 流全挂（gemini-2.5-flash/sonnet-4.6 实测同错）。
- **恶化**：9f13cc5 继续加 RPC 没发现。
- **修复**：4b555bb hotfix 回退 legacy 默认 + postmortem（单测只验 const 取值、没起 fake LS 端到端验 Connect framing）。
- **现状**：legacy 默认，Connect opt-in 待审计。最严重自伤，作者自己写了 postmortem。

### 链 4：F2 Dashboard auth bypass（4b6cde8 → cc60746 → 2a9724a）
- **引入**：4b6cde8 为修前端认证失败放行空 password header。
- **暴露**：秒级——任何无 header 请求直接通过 dashboard 认证。
- **修复**：cc60746 当日 revert（2 行 diff 一来一回）。
- **深化**：2a9724a fail-closed + timingSafeEqual，从体系上杜绝默认放行。
- **现状**：认证 fail-closed，apiKey 掩码 + reveal 流程。

### 链 5：F3 三连 revert（dfb979a 警告 → 410d867/163a276/1d022ff）
- **引入**：三个「聪明改动」——删 gRPC 压缩头、planner 改 READ_ONLY、buildMetadata 改 1.108.2。
- **暴露**：全部触发 LS 侧 proto wire-type 解析错误（分别 2/3/7）。
- **讽刺**：dfb979a 的 commit message 当天刚列过这 3 个「不能改」。
- **修复**：三个 revert 一个下午完成。
- **现状**：回到「LS 认可的保守配置」；README 级的「不能改」清单靠注释传承。

### 链 6：#104 JSON 跨轮污染 trajectory（0eaee36 → 4efd0e3）
- **引入**：0eaee36/9351159 把 JSON-only 指令 append 进 user content（hvoy.ai 结构化输出需求）。
- **暴露**：ccnetcore #104「你好 回 {"reply":"你好"}」——cascade trajectory 存了带指令的 user 消息，下轮复用继续生效。
- **修复**：4efd0e3 只注入 system message（不进 trajectory）+ 删死代码 + 字节级回归断言。
- **现状**：user content 永不改写；system 每轮重建，JSON 指令只对本轮生效。

### 链 7：F11 email 登录挂 4 天（a4f2e19/20b11d9 → ef41682）
- **引入**：04-26 追 Windsurf 上游迁移，主探测切 CheckUserLoginMethod（旧路径 504 频繁）。
- **暴露**：#84「账号密码登陆又不行了」——① `addAccountByEmail` 是 stub throw（HTTP 路径从未接管线）；② CheckUserLoginMethod 偶发 `{}` 被当 `hasPassword:false` → ERR_NO_PASSWORD_SET 误杀。
- **恶化**：2.0.8 标 emergency login fix 只修了探测侧，stub 未拆。
- **修复**：ef41682（2.0.39）拆 stub 接 windsurfLogin 管线 + 空 body 显式回退 + 字段存在性检查。
- **现状**：/auth/login email/token/api_key 三模式批量可用；空 `{}` 回退路径有回归测试。

### 链 8：fresh account 403 race（4b72ecd/0476121 → 91b2441）
- **引入**：v2.0.0 tier 体系 `unknown = [gemini-2.5-flash]`。
- **暴露**：QQ 群 04-30「获取不到模型，添加账号后不能调用」——probe 完成前 110/111 模型 403。
- **修复**：91b2441 unknown 乐观全量 pro + probe_pending 错误类型。
- **现状**：新号立即可用，真实权益由上游 LS 纠错；probe 完成后 tier 收敛。

### 链 9：#86 GLM/Kimi 方言（0cbecfd 基础设施 → 9c2dc30 → 0984875/946a14f）
- **引入**：GLM 4.7/5/5.1 `<tool_call>NAME<arg_key>`、Kimi K2 `<|tool_calls_section_begin|>` 被静默丢弃（finish_reason=stop 但 tool_calls 空）。
- **演化**：#77 先建四档 preamble 基础设施 → 9c2dc30 pickToolDialect + 双方言解析器 + 历史回写 → 0984875 GLM5.1 静默输出（thinking 提升 content）→ 946a14f Windows sanitizer。
- **现状**：4 种 preamble 变体 + 2 套方言解析 + 回写，非标准模型的 tool 能力闭环。

### 链 10：#93 Sonnet 4.6 reuse（eeff104 → 1d5b61c → 599ddf0）
- **引入**：reuse 扩展名单到 Sonnet 4.6 thinking。
- **暴露**：① 扩展撞上 v2.0.33 的 `routingModelKey` 作用域 bug（每 stream 完结 ReferenceError）；② apiKey 模式 callerKey 无用户信号 → reuse 全程禁用（ID 每次变）。
- **修复**：1d5b61c wantThinking 透传；599ddf0 IP+UA fallback subkey。
- **现状**：单用户 apikey 部署 reuse 恢复，跨用户安全隔离保留。

## 4. 修复频率统计（按 commit message 的 #N 引用计数，本片 265 条内）

| 排名 | issue | 引用次数 | 主题 | 主要修复 commit |
|---|---|---|---|---|
| 1 | **#24** | 16（含 #22/#24 联合 2 次） | 聊天上下文丢失 | dfe0c43, 16c1cda, 37d42e6, 06c2643, b173f3d, d1687e1, 45ddc02, 8846eb4, 4aa4d7b, 78d3628, 1e1d923, b8a2057, 2557fb8, bef4b8a |
| 2 | **#22** | 9 | Claude Code/Cline 工具调用兼容 | 3ef2061, 4fce358, 3b2a30c, 5a0d738, 18a3d81, 72bd2ed, fc93ade, e4fed17, cac0b8d |
| 3 | **#86** | 6（含 merge/release 2 次） | GLM/Kimi tool 方言 | 9c2dc30, 0984875, 946a14f |
| 4 | **#93** | 5（含 merge/release 2 次） | zhangzhang-bit 上下文会丢 | eeff104, 1d5b61c, 599ddf0 |
| 5 | **#59** | 4 | 多轮工具调用后上下文失败 | 875cf53, a434c40, fd34859, 5824773 |

并列 3 次：#28（5a6e7be, 79cd990, d6e816c）、#63（9c6b685, e968fbf, 5824773）、#87（1c40d46 + merge/release）、#96（8539d2e + merge/release）。

### 口径说明
- 计数 = 该时段 265 条 commit message 中 `#N` 出现的条数（含带 merge/release 的联合引用，故 #24/#22 有联合 2 条）。
- 自伤事件（§1 关联列 F1~F11 标注）与高频 issue 高度重合：F1（GRPC 默认）、F2（auth bypass）、F3（三连 revert）、F10（#104 污染）、F11（email 登录）全部落在「高频发版日」04-23 与 04-29~30——高发版节奏下改完就发、实测定根因的模式再次验证。

## 5. 数据口径与验证

1. 265 条 hash 全部 `git cat-file -e <hash>^{commit}` 核实存在，0 缺失；date 列与 `git log` 实测一致。
2. 每条账目的「干了什么」基于 `git show --stat`（文件级 diff 统计）+ commit message；36 条深挖基于 `git show -U0` 实际 diff 阅读。
3. 版本节奏：v1.4.0（04-22）→ v1.9.0（04-23）→ v2.0.0（04-24）→ 2.0.3~2.0.12（04-25~27）→ 2.0.15~2.0.21（04-28~29）→ 2.0.22~2.0.32（04-29）→ 2.0.33~2.0.44（04-30）→ 2.0.45~48（05-01）。版本号与 commit 顺序无强对应（bump 独立 commit）。
4. 占位符迭代史（sanitize.js 内注释实录）：`./tail` → `[internal]` → `<redacted-path>` → `(internal path redacted)` → `redacted internal path` → `…` → `<workspace>` —— 七版，每版都被某一种 LLM/客户端消费端踩坏，是 #24 链条的浓缩标本。
5. 凭证纪律：本账只记「去掉硬编码 SSH 凭据（e61580e）」类事实，未输出任何 key/secret 值。
