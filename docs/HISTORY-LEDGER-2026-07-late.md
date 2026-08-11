# WindsurfAPI 记账本 v2 · 精细账 2026-07-16 ~ 07-31

切片：109 条 commit（`/tmp/ledger-slice-7b-release.txt`，已与 `git log` 逐条比对，hash 全部真实）。
v1 采集：`/tmp/ledger-out-slice-7b-release.md`（12 聚类 + 8 自伤），本账在 v1 之上细化到逐条账目与问题链。

---

## 第一部分 · 逐条 commit 账（109 条，时间正序）

格式：`hash | 时间 | 标题` + 账目（一行为一条账；**逻辑级深挖**条目展开根因/修法/关联）。日期时间均为 `git show -s` 实测的 commit date（与 author date 有偏差者注出）。

### 07-16

1. `fc25105 | 07-16 17:27 | feat(device): 每账号稳定机器码(默认关)+ 工具 schema 顶层 combinator 剥离`
   **逻辑级**：两个不相关改动捆在一个 commit。① 机器码 `WINDSURFAPI_STABLE_DEVICE=1` opt-in：auth.js 账号加 `deviceSeed` 字段（条件双写，旧账号无字段不变），惰性 mint 随机 32B（刻意不从 token 派生，避开 kiro refreshToken 轮换跳变坑），`generateFingerprint(seed)` 从 seed HKDF 派生 protobuf #31 字段，无 seed 时走原 randomBytes=字节等价（红线契约不破）。目的：每账号呈现一致设备（kiro/xinghuo 研究），随机 vs 稳定对封号率影响待 A/B。② 工具 schema 顶层 combinator 剥离：`normalizeToolSchema` 剥顶层 oneOf/anyOf/allOf + 从首个 object variant 恢复 properties（对齐 kiro strip_top_level_combinators，P4）。—— 本窗口首条，也是唯一一条纯功能前瞻性 commit。

### 07-17

2. `4cf7d1d | 07-17 14:06 | fix(responses): support responses-lite additional_tools`
   **逻辑级**（#217 本体）：Responses Lite 客户端把工具定义嵌在 input 里，此前静默丢失。收集 client-executable 的 function/custom/namespace 定义，保留 namespaced 历史与强制选择，去重镜像定义，拒绝歧义扁平化别名。注意：此 commit 带 Devin 生成署名（外部 PR 保留，非本仓库作者行为）。
3. `04c9559 | 07-17 15:59 | Merge PR #217`
4. `f76fcb2 | 07-17 16:01 | fix(responses): 去重按 canonical 序列化比较`
   **逻辑级**：#217 的 `flattenResponseTools` 用裸 `JSON.stringify` 比工具，parameters schema 键序不同（同一工具在 top-level 与 additional_tools 独立构造）被误判为同名不同定义 → Ambiguous → 400。改用 `stableStringify`（递归排序对象键、数组保序），cosmetic 键序差异不再误报；真冲突仍 fail-closed。原 PR 用浅拷贝漏了这条路径。
5. `b864447 | 07-17 17:10 | fix: 按 #217 模式排查修 4 处同类缺陷`
   **逻辑级**：按 #217 揭示的模式全项目排查（默认模型/developer 角色/缓存键/schema 数组序）：
   - A(major) `config.defaultModel` 从过时的 claude-4.5-sonnet-thinking（DEVIN_CONNECT catalog mapped:false）改为 claude-sonnet-4.6（mapped:true）——省略 model 的请求在 DEVIN_CONNECT 下被 strict gate 400 或降级 free；
   - B(major) responses.js developer-role 消息映射为 system（Codex/o-series 指令通道），原样透传会失去 system 优先级 + 逃过 neutralizeClientIdentity（竞品身份裸奔触发上游 529）；
   - C cache.js normalize 的 tools/tool_choice/response_format/thinking/stream_options 过 stableClone（原只 logit_bias 过），键序不同分裂缓存槽。
6. `4824e57 | 07-17 17:32 | fix(gemini): 同名并行工具调用 FIFO 配对 + 优先用原生 id`
   **逻辑级**：#217 模式排查第 4 路（编码↔回程对称性）：gemini.js 用 `lastIdByName`（Map<name,id>）只记同名最后一个 id，一轮并行两次同名调用（如两次 search）时下一轮两个 functionResponse 都指向最后一次调用 → 第一次调用成孤儿、id 重复 → 严格上游 400 / 模型看到错配结果。改：① 优先用 v1beta 原生 functionCall.id / functionResponse.id；② 无原生 id 时按 name FIFO push/shift 配对。其余 4 处编码回程经审对称、无需改。

### 07-24（warelik #224-#229 各 PR 的 commit 落库日，merge 在 07-25）

7. `cc54791 | 07-24 20:03 | fix(setup): default DEVIN_CONNECT=1 on binary-less hosts`
   源码安装不经过 config.js 的 IS_PACKAGED 默认，无 LS 二进制的宿主机掉进 Cascade 并要求 language_server。setup.sh 在无 LS 二进制时写 `DEVIN_CONNECT=1` 进 .env（有则注释保留），macOS 加 `HOST=127.0.0.1` 避开非本地 fail-closed 陷阱，修重复 'vv' 的 node 版本行。
8. `bc0fd13 | 07-24 20:03 | docs(devin-connect): pin cache_read_tokens=5 from paid calibration`
   付费校准实测（~2.3k token 前缀，Claude 首轮 cache_creation=2268、后续 cached_tokens=2262）结清 #220 计量：`cache_read_tokens=5` 定死。
9. `67b8357 | 07-24 | fix(chat,identity-neutralize): neutralize tool-description preamble on native path`
   **逻辑级**（codex content-policy，a7，与 forrinzhao 合作）：codex `apply_patch` 描述里的 'FREEFORM … do not wrap the patch in JSON.' 触发 Devin 内容过滤器（live-bisected 7/7）。根因：DEVIN_CONNECT 客户端身份中和 pass 在 tool-description preamble 注入**之前**执行，原生路径的 preamble 没被覆盖。修：中和移到注入之后 + 新增 a7 规则改写两段碎片（工具名与 schema 不动）。
10. `175b1dd | 07-24 | fix(responses): treat bare {role,content} input items as messages`
    codex #219：Codex 发裸 `{role, content}`（无 type:'message'）之前被丢弃 → 空上游消息 → UPSTREAM_INTERNAL。改为按消息处理。
11. `17cdbe5 | 07-24 18:23 | fix(devin-connect,chat): honor the 429 reset window on the streaming path`
    **逻辑级**（#224 本体）：流式路径丢弃上游限流 reset 窗口，且冷却写在池从不读的维度（model-scoped），被限流的账号几秒内又被选中继续锤上游。修：streamChat 两个错误路径（non-200 + JSON trailer）透传 `classified.resetMs`；finalizeConnectAccount 的 RATE_LIMITED 改为 account-wide 冷却（`markRateLimited(apiKey, resetMs, null, 'r')`），因为 acquireConnectAccount 恒以 modelKey=null 选号。→ 埋下「#224 同构缺陷」家族（见链 7）。
12. `4895b9f | 07-24 | fix(chat): treat client/server abort as a clean stop across all DEVIN_CONNECT paths`
    #225 本体：客户端断连中途可能惩罚账号、failover 到新账号（对死 socket 烧配额）、写已关流。isAbortError 统一处理 same-token replay / re-login retry / non-stream 三条路径：abort 不惩罚、break failover 循环、[DONE] 防写关流、非流式 499。
13. `7d72818 | 07-24 | fix(messages): omit an empty thinking-block signature`
    #228 本体：上游从不发 Anthropic thinking signature，代理此前发 `signature: ""` + 空 signature_delta，严格客户端（Grok Build messages 后端）拒收。无真实 signature 时省略字段，有则原样透传。
14. `0de46c0 | 07-24 | fix(responses): populate input/output token details in Responses usage`
    #229 本体：Responses usage 只有 input/output/total，严格消费者（Grok Build、codex 系）要 `*_tokens_details`。mapUsage 补 input_tokens_details（text/audio/image/cached）与 output_tokens_details（text/audio/reasoning），text_tokens 用扣减法推导、显式上游值优先。
15. `4fafb76 | 07-24 | fix(identity-neutralize): neutralize Grok/xAI self-identification`
    #227 本体（a6-grok）：Grok CLI 的 "You are Grok X.Y released by xAI." 自述与 `<executing_actions_with_care>` 块触发 Devin content policy（permission_denied，A/B 实证）。改写为通用助手行 + 剥离该块，a1-a5 同族规则。
16. `b0f8330 | 07-24 | feat(devin-connect): experimental session continuity — stable session_id`
    #226 本体：opt-in（DEVIN_CONNECT_SESSION_REUSE，默认 OFF）。新模块 session-continuity.js（约 600 行，零依赖 node:crypto）：从完成的 request/response pair 指纹派生稳定 protobuf session_id，一段对话复用同一 id 而非每轮新 uuid，降低上游 velocity limiter 压力；canonicalize / 语义工具链接 / barrier 检测 / HMAC pair 哈希 / overlap+drift 解析 / 幂等提交 / TTL+LRU 有界内存 store；root-anchor turn-1 稳定（provisional-claim 规则分叉同 opener 对话）。关闭时字节等价。

### 07-25（六连 merge + 密集发布 + sticky 起点）

17. `014ead1 | 07-25 10:55 | Merge PR #224`（429 reset window）
18. `1783545 | 07-25 10:55 | Merge PR #225`（abort clean stop）
19. `a335d51 | 07-25 10:55 | Merge PR #227`（Grok a6）
20. `f433c85 | 07-25 10:55 | Merge PR #228`（thinking signature）
21. `581927c | 07-25 10:55 | Merge PR #229`（usage details）
22. `f434ef4 | 07-25 10:56 | Merge PR #226`（session continuity，**冲突解决**：#225 abort 分支与 #226 session commit 都扩展 attemptStream result switch，两者都保留——仅 kind:'ok' 时提交 pair，abort 轮未完成、提交会污染 pair chain 半个 turn）
23. `1be86ec | 07-25 10:57 | Merge our a7 + tag5 + macOS setup branch`（本家 a7 内容策略 + tag5 校准 + macOS 打包线并入）
24. `94356fa | 07-25 11:02 | chore(credits): 致谢 warelik 一轮六连`（#224 S / #225 A+ / #226 S / #227 A / #228 B+ / #229 A，六条入 contributors.json）
25. `5cf0116 | 07-25 11:07 | feat(devin-connect): 默认解码 cache_read_tokens + 致谢 forrinzhao(#219)`
    DEVIN_CONNECT_BILLING_TAGS 默认 `cache_read_tokens=5`（已付费校准），缓存命中不再按新鲜输入计费；显式 map 覆盖默认，'off' 全关；免费账号零值不编码。
26. `7d3bf3d | 07-25 11:07 | Merge: warelik #224-#229 + codex content-policy a7 + #220 cache calibration + macOS setup`（六连 + 本家三线合一进主线，v3.6.0 前置）
27. `c3a1720 | 07-25 11:27 | chore(release): v3.6.0`
28. `db5f081 | 07-25 14:32 | feat(deploy): macOS 单文件打包 + 开机自启`
    **逻辑级**：release.yml 新增 macos-exe job（matrix arm64/x64，各自 esbuild → pkg → smoke → upload）；package.json pkg.targets 加 node22-macos 双架构；首启开浏览器跨平台化；deploy/macos/ 全套 run.sh / run-background.sh / stop.sh / install-launchd.sh / uninstall-launchd.sh / README，run 系列自动 xattr 去隔离 + 按 arch 选二进制；release 等 macos-exe 完成后打包 windsurfapi-macos.zip 一起发。
29. `6237f11 | 07-25 14:32 | chore(release): v3.7.0` —— **tag 缺失**（已实测 `git log -1 v3.7.0` fatal；release commit 存在但 tag 从未打上，直接跳 v3.7.1）。
30. `e2c20ed | 07-25 14:58 | fix(ci): smoke test 先检查 dashboard 再 kill 进程`
    macOS smoke 的 kill 在 dashboard curl 之前执行导致 arm64 失败；改为两个检查都过才 kill（与 Windows 版一致）。
31. `9eeef26 | 07-25 14:58 | chore(release): v3.7.1`
32. `21046eb | 07-25 15:55 | docs(contributing): 测试套件文档更新 + identity-neutralize 规则编号统一`
    CONTRIBUTING 移除「暂无自动测试」过时说法，补 npm test / test:release；(a6) 重名消解——Cline OBJECTIVE 规则改名 a6-cline-obj，与 warelik 的 a6-grok 分开；index.js 去掉多余 ?.。
33. `72a90e7 | 07-25 16:36 | fix(chat): model-access 门禁移到后端分支之前`
    **逻辑级**：面板模型封锁清单在 DEVIN_CONNECT 短路**之后**执行，而 DEVIN_CONNECT=1 是打包 exe 默认配置——封锁的模型照常出结果（实测 blocklist=["gpt-5.4-mini-low"] 修复前 200，修复后 403 model_blocked）。修：isModelAllowed 整块上移到 selectBackend 之前（一处覆盖 special-agent / DEVIN_CONNECT / Cascade 三条后端）+ 新增 accessFallbackModel（连接分支的 reqModelName 走原始请求名而非 routingModelKey，不显式透传「封锁→默认模型」在该路径静默失效）。既有测试只测谓词本身，绕过期间一直绿——缺陷在接线顺序不在谓词。
34. `2d1a6aa | 07-25 16:46 | fix(devin-connect): 校准 cache_write_tokens=4`
    **逻辑级**：付费实测 meta dump 写入轮 {2:3,3:4,4:14361,6:4} / 读取轮 {2:3,3:4,4:5,5:14356,6:4}，14356+5=14361 精确钉住 tag4=cache_write_tokens。修复前 13.4K token system prompt 写入轮只报 prompt_tokens=3（低报 99.98%）。DEFAULT_BILLING_TAGS 改为 `cache_read_tokens=5,cache_write_tokens=4`；GPT 系无 tag4（输入全在 tag2），多出这条对其是 no-op。消费链（stats.js cacheW + chat.js:1727）早已就绪，此前只因 tag 未校准恒为 0。
35. `d2ccf2a | 07-25 16:51 | chore(release): v3.7.2`
36. `74197b3 | 07-25 17:58 | ci(release): x64 不阻塞 release`
    拆分 arm64/x64 job，arm64 成功即发版（x64 修复见 #233 链）。
37. `ac671ce | 07-25 17:58 | chore(release): v3.7.3`
38. `9b24f98 | 07-25 20:20 | fix(chat): DEVIN_CONNECT 路径补上 sticky 绑定`
    **逻辑级**（#230 本体）：setStickyBinding 只在两处 Cascade 成功路径被调用，DEVIN_CONNECT 从不写绑定 → STICKY_SESSION_ENABLED=1 空转：每轮查、每轮 MISS，候选按 lastUsed 升序收尾把同一会话每轮派给不同账号。上游 prompt cache 按账号隔离，实测账号A tag4(write)=1991 → 账号B 同内容 read=0 又 write=1991 → 账号C 再 write=1991：换号即全量重写，写入/读取配额单价差约一个量级。修复后同对话 write 恒为本轮增量（8,130）、read 随上下文涨（170,738）。关键细节：连接路径 modelKey 恒 null（acquireConnectAccount/Failover 都传 null），bindingKey 是 `callerKey\0(modelKey||'*')`，绑定也必须以 null 写入，否则查询静默不命中退化成空转。测试 2751/0 绿。

### 07-26（sticky 四连修 + 观察面）

39. `2f8bce0 | 07-26 23:18 | fix(auth): sticky fast path honors excludeKeys`
    **逻辑级**：getApiKey 的 sticky 快路径不查 excludeKeys。connect 无绑定时这是死代码；#230 补上写入后，dead-token failover 每一跳都被快路径把同一个死账号原样交回——triedKeys 形同虚设，循环在一个账号上烧完 maxHops 后 401，健康账号全程闲置，且重复 reportError 把绑定账号连带打成 status=error。dead token 是唯一中招类别（QUOTA_EXHAUSTED/RATE_LIMITED 各有冷却字段可被快路径健康检查拦住，首个 UNAUTHORIZED 只记 health event 仍 active 零冷却）。修：快路径 `!excludeKeys.includes(acct.apiKey)`，被排除落入 no-longer-usable 分支（noFallback 保留绑定返回 null，否则 clearStickyBinding 后正常选号）。
40. `e65a8e9 | 07-26 23:18 | fix(account): repair sticky debug-leftover logging`
    项目 logger 是 `console.log('[INFO]', ...args)` 格式串不在第一参 → printf 占位符永不替换，[sticky] 系日志全部以 '%s' 字面量输出；bindingKey 的裸 \0 分隔符直接进日志流（破坏行式消费）；getStickyBinding 的 ENTER 行在 !ENABLED 检查之前，每次 getApiKey 都刷一条。修：删 ENTER/SKIP 行，MISS/HIT 降 debug，SET/CLEAR 留 info 改模板字符串，displayKey 去 \0。
41. `d231d44 | 07-26 23:19 | Merge PR #230`
42. `f2c938e | 07-26 23:24 | fix(chat): gate bindConnectSticky behind per-user scope + e2e call-site regression`
    **逻辑级**：bindConnectSticky 此前只要 callerKey 非空就写绑定，绕过 Cascade 侧所有 sticky 写入都有的 per-user-scope 门禁（reuseEnabled → !sharedApiKeyNoScope → hasPerUserScope，SEC-W2/HIGH-3）。共享 API key 且无 per-user 信号（bare api:<hash> 或猜测 :client: 桶）会把全部用户折叠进一个绑定槽：全流量漏斗到单账号直到 RPM 打满 → 整群迁移、所有会话 prompt cache 一次性全量重写，恰好击穿账号池 inflight-spread 设计意图（#37）。修：加 hasPerUserScope 检查，单租户自部署用 WINDSURFAPI_SINGLE_TENANT_CACHE=1 opt-in；e2e call-site 回归（revert 两处成功路径调用会挂）。
43. `3419854 | 07-26 23:31 | feat(dashboard,account): expose sticky affinity counters on /connect-metrics`
    getStickyStats() 此前全仓零消费者，运营无法确认绑定是否真在发生（#230 之前 connect 部署永远 0 SET，靠数日志行才发现）。挂到 /connect-metrics：{enabled, hits, misses, creates, expires, evictions, fallbacks, size}；新增 noteStickyFallback() 让 fallbacks 从常量 0 变可观测。
44. `0707c00 | 07-26 23:32 | feat(caller-key): honor prompt_cache_key / safety_identifier`
    **逻辑级**：Responses 链式客户端（codex 等）用 previous_response_id 串轮次，而它每轮都变 → 落进 candidates join 后 callerKey 每轮重铸，sticky 绑定和 cascade 亲和永远攒不起来（#230 收益在这类客户端上归零）。OpenAI 对 user 的两个正式后继字段本就是为此设计：safety_identifier（稳定终端用户标识）、prompt_cache_key（显式缓存亲和路由键）。两者按 user 同样方式短路取值（user > safety_identifier > prompt_cache_key > 原 candidates join），空值 fail-closed。
45. `9198a85 | 07-26 23:34 | docs(readme,env): document STICKY_SESSION_*`
    主开关自 #133 就有但从未文档化，#230 让它第一次真正生效才补：README 中英环境变量表三行 + 缓存经济学动机（按账号隔离、写≈10x读）+ per-user-scope 前置 + SINGLE_TENANT_CACHE opt-in + connect-metrics 观测入口；.env.example 新增 Sticky session 小节。
46. `db5c902 | 07-26 23:35 | chore(credits): 补记 wangergou777 两连`（#217 B+ / #230 S；#217 当时漏进台账，从 #216 直接跳到 #219）

### 07-27（对抗 review 风暴主战场 + v3.8.0/v3.9.0 双发）

47. `730eaf9 | 07-27 03:40 | fix(identity-neutralize): 覆盖 array/parts 形态 system 消息 + 修型号指纹句被小数点截断`
    **逻辑级**：① 形态绕过——两个中和调用点都以 `typeof content === 'string'` 为守卫，而 Codex /v1/responses 默认形态是 parts 数组（normalizeMessageContent 返回 [{type:'text'}] 不拍平），数组内容整个跳过中和，devin-connect 直到 wire 层 messageText() 才拍平 → 最常见的 Codex 路径指纹完整送出。新增 neutralizeMessageContent() 同时处理字符串与 parts 数组，无改动时返回同一引用（调用点靠引用判等）。② 句子终止符——"You are powered by the model …" 规则用 `[^\n.]*\.` 在第一个点就停，任何带小数点的型号（Opus 4.8 / Sonnet 4.6）被从版本号中间切断（删 "…named Opus 4." 留悬空 "8. The exact model ID is claude-opus-4-8."），且 "The exact model ID is <id>." 这句全仓没有任何规则匹配（无小数点型号也泄漏）。改为点号后跟空白或行尾 + 补型号 ID 句。
48. `b75eaa3 | 07-27 03:44 | fix(auth): sticky 绑定按 account.id 匹配`
    **逻辑级**：快路径此前要求 `a.apiKey === bound.apiKey`，但后台 re-login 原地换 key（account.apiKey 被替换、id 不变、status 强制回 active），connect 路径在每个 UNAUTHORIZED 上触发 re-login（还可能是共享该账号的另一个 caller 触发）。于是绑定恰在 connect 部署最常遇到的 dead-token→re-login 场景失配：清绑定 → 会话迁到别的账号全量重写 prompt cache，而被绑定账号其实拿着新 token 完全健康。上游 prompt cache 存在**账号**上而非 session token 上，换 token 不换账号缓存仍在 → 按 id 匹配才是正确语义。快路径返回的 apiKey 一直取自池对象当前值，去掉 key 相等判断不影响下游用键；excludeKeys 排除仍优先。
49. `ac045ba | 07-27 03:44 | fix(chat,auth): CAPACITY 冷却写在 connect selector 维度 — #224 同构缺陷第三次`
    **逻辑级**：connect 选号是 `getApiKey(triedKeys, null, callerKey, selector)`，modelKey 恒 null，isRateLimitedForModel 只在 modelKey 为真时查 _modelRateLimits → CAPACITY 分支写在 reqModelName 下的 60s 冷却对这条路径结构性不可见，刚被上游判定过载的账号下一轮立刻被重新选中（sticky 绑定后更确定：每轮把同一个过载账号钉回同一个过载 selector）。不能改 account-wide（该分支意图就是「账号对其它模型仍完全健康」），正确修法是把冷却写在 connect 实际查询的维度：finalizeConnectAccount 接收 selector 并以 selector||model 为冷却键（17 处调用点透传，均在 connect 分支内）+ auth.js 新增 isCooledForRequest() 在两个维度各查一次。→ 这是「#224 同构缺陷」第三次（链 7）。
50. `b2e8af6 | 07-27 03:46 | fix(gemini,responses): 补 gemini 流式 usage 帧 + responses 流式错误按 code 分类`
    两条协议路由与 chat 层的漂移（既有修复没覆盖全四条路径）：① gemini 流式从不发 usageMetadata——O1 把 usage-only 帧改成 stream_options.include_usage 显式 opt-in 后只更新了 messages/responses，gemini 漏掉，而 GeminiStreamTranslator 靠 chunk.usage 攒 finalUsage 生成终帧 → 每个 gemini 流式响应 usage 完全缺失；② responses 流式错误帧只读 err.type 忽略 DEVIN_CONNECT 的 err.code，messages/gemini 都先用 connectErrorToHttp(code) 取回权威 {status,type} → 流中途的 CAPACITY(503)/RATE_LIMITED(429)/MODEL_BLOCKED(402) 一律塌成 api_error，客户端拿不到重试/终局信号。
51. `1de5afc | 07-27 03:50 | fix(log-safety,chat): 清洗日志中的客户端可控值 + 补 ACP vision 路径身份中和`
    三条同源残留：① 日志注入——model/selector 直接来自请求体，原样插进 7 处 DEVIN_CONNECT 日志（含任何垃圾模型名都走到的拒绝路径），认证用户可塞换行伪造 [INFO] 记录或塞 ANSI 转义改写运维终端。新增 log-safety.js safeLogValue() 在日志边界替换 C0/C1 控制符与 DEL 并限长。② printf 残留——caller-key.js:97 是全仓最后一处 '%s' 永不替换（格式串槽位被级别标签占掉）。③ ACP vision 路径身份中和缺口。
52. `0ddb277 | 07-27 03:52 | perf(account): sticky 绑定表按租户公平配额驱逐 + O(1) LRU`
    **逻辑级**：驱逐此前是单一全局 LRU、无 per-caller 配额——一个租户不断铸新 callerKey（每请求换一个 body.user 就是新 16 位 subKey → 新绑定）即可灌满表并把**其他所有租户**的活绑定挤掉，静默摧毁他们的亲和、把约 10 倍缓存写入成本重新加回受害者头上；且到达上限后每次插入都在请求热路径做 O(MAX_BINDINGS) 全表扫描。修：配额单位取 callerKey 的 API-key 前缀（api:<hash>）而非整个 callerKey（后者攻击者能无限铸造，前者不能）；达份额的租户驱逐**自己**最旧的绑定；读命中刷新重插使 Map 迭代序即 LRU 序，取最旧 O(1)；新增 _tenantCounts 在 set/clear/expire/evict/reset 各路径统一经 dropBinding/trackInsert 维护。
53. `440a789 | 07-27 04:03 | build(macos): 补本地单文件打包脚本 + 抽出可复用 boot-smoke`
    本地只有 build:exe（win-x64），macOS 二进制此前只能靠 CI 产出，且 pkg 退出码 0 不代表可用（ESM→CJS 打包或 pkg.assets 漏项只在运行时暴露，dashboard 404）。package.json 加 build:exe:macos / build:exe:macos-x64 与 smoke:exe；scripts/exe-boot-smoke.mjs 启动自检（/health 200 + /dashboard 200，后者专抓 pkg.assets 漏项）；release.yml 两处内联 smoke 替换为同一脚本。
54. `71059d3 | 07-27 04:29 | chore(release): v3.8.0`
55. `3397f25 | 07-27 07:31 | test(guards): 把两类反复复发的结构缺陷变成 CI 失败`
    **逻辑级**：① modelKey=null 陷阱（已出现三次：#224 RATE_LIMITED、#230 绑定键、v3.8.0 CAPACITY）——connect 选号恒 getApiKey(..., null, callerKey, selector)，任何写在客户端型号名下的 per-model 状态对 connect 结构性不可见。test/connect-dimension-guard.test.js 断言**不变式**：connect 请求能造成的每种冷却都必须能关住 connect 查询（degraded serve 刻意例外），加源码级守卫禁止 finalizeConnectAccount 把冷却写进客户端型号名维度。② 路由 parity 守卫（后文 e0fa30e 一族）。
56. `bd97b89 | 07-27 08:18 | fix(chat): UPSTREAM_ERROR 不再把健康账号打下线`
    **逻辑级**（错误预算第二波，时间上第一发）：finalizeConnectAccount 没有 UPSTREAM_ERROR 分支，落到末尾通用 reportError，攒够 3 次把账号翻 status='error' 并持久化到 accounts.json（重启不恢复）。但 UPSTREAM_ERROR 两个来源都不是账号故障：gRPC internal 类（classifyUpstreamError 注释写明 "PERMANENT client mistakes（短指纹、gzip 请求体）——每次重试都同样失败"）+ 兜底分支（所有未分类上游错误）。与已豁免的 CONTENT_BLOCKED 完全同族。实测：调用方循环发畸形请求每 3 次打下线一个账号可清空整池（单账号池被 last-account 豁免遮蔽，只有健康同伴存在时才暴露）。改 reportInternalError：仍记 health-window 事件（持续故障照旧降权、2 次连续 5 分钟自愈隔离），但不走 errorCount 永久驱逐。新增 upstream_error 计数暴露在 /connect-metrics。测试含反向守卫（真账号故障仍必须驱逐，防过度修正）。
57. `12f04be | 07-27 08:31 | feat(responses): 实现服务端会话状态 — previous_response_id`
    **逻辑级**（v3.9.0 核心，+631 行）：/v1/responses 一直宣传 OpenAI Responses 兼容，而该 API 核心特性是服务端持有对话——但 previous_response_id 在 handlers/responses.js 里**零命中**从未被读取。后果最糟：链式客户端每轮只有 1 条消息到达上游，模型每轮盲答，不报错不告警，产出通顺但完全无上下文的回答（实测修复前第 2 轮只发 1 条，修复后 3 条：user t1 + assistant r1 + user t2）。设计：store 每条记录存该轮**完整**累积消息列表（O(1) 单次查找，驱逐不静默截断历史）；按 callerKey 隔离、失配 fail-closed；TTL 1h 每轮续期 + 上限 + LRU + 租户公平配额（沿用 sticky 那课：全局 LRU 会被单租户刷穿）；单会话消息上限保留开头 system（丢掉等于改 agent 指令）；遵守 store:false 契约。handleResponses：命中失败明确报错（未知/过期/跨租户 404 response_not_found；store 关闭 400 提示发完整 input），绝不静默按新一轮发出；非流式与流式两条成功路径都提交，流式仅 translator.finished 且未 failed 时提交（防半轮污染）；translator 新增 failed 标记与 committedToolCalls（还原 OpenAI 形状的 tool call，否则链式丢 call/result 配对）。
58. `4818986 | 07-27 08:48 | fix(responses): 清洗回显的 previous_response_id + 补流式链路三个未覆盖场景`
    自审抓到：① previous_response_id 是客户端可控值，被原样插进 404 错误消息回显（实测 500 字符 id 连裸换行与 ANSI 转义完整反射，消息 762 字符），与本轮日志注入同类。改过 safeLogValue(…,64)，消息降至 294 字符。② 流式提交路径此前零覆盖，补三条：流式正常完成可续接且入库的是 translator 组装的流式文本；流式中途抛错不得提交半轮；客户端断连（不调 end()）不得提交。
59. `f9e0a55 | 07-27 09:36 | docs(devin-connect): 记录首次付费校准结论 + 修校准器别名陷阱`
    付费 teams 账号跑通：tier=teams paid=true，13/13 selector 可达（opus-4-6×4 / sonnet-4-6×4 / gpt-5.2×5）；付费账号上免费模型依然被墙（swe-1-6-slow 仍 UPSTREAM_INTERNAL，不能把它读成「账号已死」）；缓存计量校准正确且 GPT/Claude 差异是真的（Claude 首轮 cache_creation=2268 后续 cached_tokens=2262；GPT 报 cached_tokens=1280 但从不报 cache_creation——证实「GPT 系不带 tag4」注释，并说明 #230 成本表里 gpt-5-6-sol-max 出现 tag4 的那行无法复现，其机制结论仍由 Claude 那行成立）。
60. `74f1c20 | 07-27 14:39 | fix(responses): 链式续接去重服务端已存的 tool_calls`
    **逻辑级**：真实 agent 循环（/v1/responses + 工具 + previous_response_id）端到端压测发现：客户端在链式请求里**重发** server 自己产出的 function_call 时，上游看到同一 assistant tool_call 两次 → 拒绝整段对话返回不透明 "an internal error occurred (trace ID …)"（与「账号已死」无法区分）。实测三种形态：全量模式 4 轮完成；链式只回传 function_call_output（严格契约）4 轮完成；链式重发 function_call 必 503。新增 mergeChainedMessages()：按 id 丢掉 stored 历史里已有的 assistant tool_calls，tool 结果、新用户轮、未见过的 call id 原样透传；带自有文本的 assistant 消息永不丢弃。
61. `e0fa30e | 07-27 15:11 | test(security): 补路由层路径安全守卫`
    既有四个安全套件全部直接 import handleDashboardApi，证明了鉴权逻辑正确，却从未走过 server.js 里决定「哪个 URL 进哪个 handler」的路由层。四条承重安全属性零覆盖：① 运维路由 === 精确匹配非前缀；② 唯一前缀派发 /dashboard/api/ 带尾斜杠；③ path 从不 URL 解码（%2e%2e 不能绕过）；④ 静态 locale 是文件名白名单非路径 join。
62. `85bc1fb | 07-27 15:18 | fix(test): 去掉 router 安全测试里的字面 NUL 字节`
    **自伤返工**：上个 commit 的 locale 白名单用例夹字面 NUL（'en.json\0.png'），git 把 test/router-path-security.test.js 归类为 binary：diff 不可读、后续改动无法审查。改写成 \u0000 转义，语义不变（带 NUL 文件名仍必须被拒，NUL 注入是真实攻击面）。141 行 diff 可见，11 条测试不变。
63. `8be3efd | 07-27 15:21 | chore(release): v3.9.0`（核心=12f04be 会话状态，当天即被对抗 review 打穿）
64. `0179306 | 07-27 16:06 | test(proto),docs: 协议层扫描 — 地基补 20 条硬化测试 + 建审计台账`
    **逻辑级**（风暴第一炮）：协议层 exhaustive 扫描结论**零缺陷**（proto.js 18 类畸形输入、connect.js 帧层 10 类含 80MB gzip 炸弹 7ms 抛错 RSS 受控、proto-trace 2000 层深度炸弹被深度上限截住、windsurf.js 与 cascade-native-bridge.js 各 5 类恶意载荷共 170 次调用，无栈溢出无非受控抛出 RSS 67MB）。但 proto.js 这个解析所有外部字节的地基**零专属测试**（10 个测试文件 import 它全用于正常编解码）。补 20 条守卫不变式：截断/超长 varint 抛错、长度前缀越界抛错、未知/废弃 wire type（3/4/6/7）拒绝而非跳过（跳过会让解析器失步）、parseFields 保持扁平（嵌套以 subarray 交回，自递归即引入栈溢出面）、负数/超 2^31 走 BigInt 两补码路径。**建立 docs/AUDIT-LEDGER.md**：记录哪些子系统被实际探测过、结论、不变式在哪守卫——「扫过且干净」本身是资产，没有记录下一个人会把同样时间再烧一遍。→ 台账引出后续一连串修复（SEC-W2、错误预算族）。
65. `dc0a2ad | 07-27 17:12 | perf(responses): response store 补字节预算`
    MAX_ENTRIES/MAX_MESSAGES 限条数不限内存：真实 agent 会话每条约 167KB 堆占用（实测纯文本形态到 518MB），2GB VPS 上单独吃 300-500MB 是实质风险。新增 RESPONSE_STORE_MAX_BYTES（默认 128m，支持 b/k/kb/m/mb/g/gb），条数与字节两维先触发者驱逐，沿用租户公平份额。approxBytes 用字符串长度加固定开销估算（精确计量要在热路径遍历每条 content，这里只需随真实成本单调即可）。→ **此 commit 引入后续 2ced8a2/9378b5b/9fb5302 修的多个缺陷**（见链 1、4）。
66. `30485c3 | 07-27 22:01 | fix(responses,caller-key,devin-connect): 修 5 个经对抗验证的缺陷`
    **逻辑级**（风暴第二阶段，多 agent 并行审计 3 条真实付费上游压测 + 静态审计产出 6 条确认发现，逐条实测复现）：
    - **blocker**：previous_response_id 参与 callerKey 派生（caller-key.js）。它每轮都变：turn 1（无）与 turn 2（有）派生出不同 callerKey，而 response store 按调用方隔离正是以此为键 → 不发 user/prompt_cache_key 的标准 OpenAI SDK 客户端**每轮链式必 404**（实测 turn2 → 404 response_not_found），v3.9.0 头号功能对其最常见调用形态完全不可用。修：per-turn id 不再当 per-caller 作用域，无稳定信号落到 ip+ua 指纹（一次会话内稳定）。
    - **major**：usage 破坏子集不变量（devin-connect.js）。连接路径把上游 fresh-input 当 prompt_tokens 上报，缓存命中轮出现 cached_tokens=1765 > prompt_tokens=3（子集大于超集），total_tokens=158 而真实输入约 1768，少报约 91%——前置计费中继按这些数字计量。Cascade 路径早有归一化（#118），连接路径没有。在 usage 出生点补齐（prompt 含 cache_read；total 含 cache_write），四条协议路由一并纠正。实测修复后 prompt=1770 cached=1767 total 自洽。
    - **major**：StopReason 4 的猜测被付费实测推翻。默认表按 protobuf 变体名顺序猜 4=max_turn_requests→'length'。付费 teams 三次探针（max_tokens 300/8/40）全返回 4，其中 300 那次答 "HI"（2 字符显然完整）→ 4 是付费层正常完成。此前**每个完整付费响应都被报成截断**（chat finish_reason='length'、responses status='incomplete'），按 length 自动续写的客户端会对完整答案无限续写。
    - **major**：流式丢失截断信号（responses.js）。translator 从不记录 finish_reason，流式恒以 completed 收尾而同一请求非流式报 incomplete/max_output_tokens → agent 把半截答案当完整答案收下。改为复用非流式同一套判定并发 response.incomplete。
    - **major**：空 input 只在 /v1/responses 穿透到上游。chat 与 messages 都本地 400，这条路由转发上游得 UPSTREAM_INTERNAL → reportInternalError，连续两次即隔离账号 120 秒——任何已鉴权调用方（或客户端 bug、空输入框）可用空请求把多账号池逐个打空。实测修复前有 trace ID（真打上游）且 503，修复后本地 400 trace ID 归零。
    - **major**：truncateMessages 上限失效（response-store.js）。前导 system 达上限时 `MAX_MESSAGES - lead` 变负，`slice(-负)` 静默变 `slice(正)`，结果数组反而增长（实测 501 条进、901 条存）。Codex 类客户端把 AGENTS.md 拆成多条 developer item 就是这个形状，无需恶意。改为 head 至多占一半预算、tail 取剩余。
    - 配套：test/responses-chain-scope.test.js（8 条）、test/connect-usage-finish-calibration.test.js（12 条含随机组合属性检查）；全量 2974 绿。
67. `09a7796 | 07-27 22:03 | fix(responses): 链式续接去重重复的 system prompt`
    **逻辑级**：Responses 客户端每轮都重发 instructions（API 设计如此，请求级字段），responsesToChat 无条件变新 system 消息，mergeChainedMessages 只去重 assistant tool_calls、system 直接透传，devin-connect 把所有 system 拼进单字段 → 第 N 轮送出 N 份相同指令、每轮付费、稀释 prompt（实测 5 轮 → 5 份，修复后恒 1 份）。按扁平化文本比较去重（parts 数组形态也能匹配字符串形态）；**变更过的 instructions 仍然透传**（客户端中途调规则合法，丢新文本等于静默忽略用户改动，已加测试锁定）。
68. `f21586b | 07-27 22:16 | test(devin-connect): usage 测试改为咬住生产代码`
    **自伤返工（镜像实现）**：connect-usage-finish-calibration.test.js 的 usage 断言用本地 normalize() 复刻生产算术 → 生产退化时照样全绿（突变验证：把 `prompt = fresh + cacheRead` 改回 `prompt = fresh`，12 条全部通过——一条从未失败过的测试等于没有测试）。修：抽成导出的 normalizeConnectUsage() 纯函数，生产与测试共用同一实现；重新突变验证同样的退化现在失败 3 条。方法论：测试跨模块不变式时抽可导出的纯函数，不要在测试里复刻算术。
69. `8aef0dd | 07-27 22:50 | test(responses): 补截断/完成状态的边界守卫 + 修过期注释`
    自查发现 responses.js 一条注释写「流式路径总是发 response.completed」，读全上下文确认其主旨是「工具调用轮应当算 completed」（非流式紧接着已实现 truncated→incomplete），上个 commit 让流式也报截断与原意一致，但注释过期会误导读者。补 4 条边界守卫：length→incomplete（带 max_output_tokens）、tool_calls→completed、stop→completed、content_filter→incomplete（带自身 reason）——防对齐动作「反向过头」（把每个工具轮都标成截断会让 agent 循环每轮以为被切断）。
70. `2ced8a2 | 07-27 23:27 | fix(responses,response-store): 修对抗复核查出的 1 blocker + 4 major — 全部是我上一批修复自己引入的`
    **逻辑级**（风暴第三阶段，9 个 agent 证伪上一批修复，逐条实测复现）：
    - **blocker**：字节驱逐会冲掉其他租户的会话。字节预算的公平份额沿用按**条数**判据（tenantCount >= MAX_ENTRIES/tenants），而循环按**字节**驱动：字节受限写入方条数远低于份额 → overShare 恒假 → 落回全局扫描 → 冲刷他人（实测 5 租户各 5 条全可读，单次大写入驱逐 25/25）。这是 v3.9.0 按条数版本没有的跨租户 DoS，**由 dc0a2ad 引入**。改按字节判份额（新增 _tenantBytes），超额租户无自有条目可驱逐时停止而非冲别人。
    - **major**：驱逐可能吃掉刚写入的条目。把 `victim === responseId` 守卫当死代码删掉（依据「新条目在 Map 尾部 oldestId() 选不中」只对无租户扫描成立；oldestId(tenant) 在该租户仅剩这一条时返回它 → putResponse 返回 true 而 id 立刻 404）。当时突变测试只覆盖无租户路径没抓到。恢复显式 exclude + 补能真正触达该分支的守卫（需 >4 租户使字节份额小于单条上限）。
    - **major**：approxBytes 对 base64 图片完全盲视。只累加 .text，而 input_image 被规范化成 {type:'image_url',image_url:{url}} 没有 .text → 多兆 data URI 记账为 32 字节（实测 10 条约 20MB 记为 960 字节，约 15000 倍低估，预算对视觉负载完全失效）。改累加任意字符串字段（带深度上限）。
    - **major**：approxBytes 低估非 Latin1 文本 2 倍。V8 以 2 字节/字符存非 Latin1，按 .length 计 1 字节 → CJK 恰好低估一半。统一按 2 字节/字符（纯 ASCII 过估 2 倍，那是内存上界的安全方向）。
    - **major**：instructions 去重保留了已撤销的指令。规范明确 previous_response_id 下上一轮 instructions 不延续，是**替换**语义；做成追加去重 → X→Y→X 时第 3 轮 X 被当重复丢弃、Y 成拼接后最后一行并生效——模型执行客户端刚撤销的指令（真上游复现 EN→JA→EN 第 3 轮答日文）。改**根本不持久化** instructions（既然永不延续），按对象引用识别；中途试过记「前导条数」在合并挪位后失效反而切掉真实对话，已弃用写进注释。developer/system 消息仍正常延续。
    - 另新增单条上限 MAX_ENTRY_BYTES（预算 1/4）+ 内容级兜底裁剪（单条超大消息无法靠丢消息收敛，不裁内容则「总量不超预算」在小预算下是假的，裁剪带可见标记）。
    - 五条修复各自突变验证（注入真实原始错误形态，分别抓到 1/1/2/2/3 条）；两次最初的突变写错（恒真条件）导致误判测试为弱，已用真实公式重验。全量 2991 绿，真上游 toggle-back 三轮语言正确。
71. `8334cea | 07-27 23:49 | fix(chat): 不可应答的对话在共享层拦下 — 我上一版的守卫位置错了`
    **自伤返工**：30485c3 加在 handleResponses 的空输入守卫有三个问题：① **可绕过**——守卫查 chatBody.messages.length===0，而 responsesToChat 会为 request 级 instructions 推入一条 system → {instructions:'x', input:[]} 长度 1 直接过关仍打到上游 503（实测有真实 trace ID）；② **过度拒绝**——守卫跑在 previous_response_id 合并之前，判新一轮而非合并后对话，任何 responsesToChat 不映射的 item（reasoning/item_reference/additional_tools）让新一轮塌成空 → 合法链式请求被 400；③ **不是 /v1/responses 特有**——chat 只发 system、messages 只发 assistant 同样直达上游（实测 503/529）。改到共享 chat 层守**类别**：非 system 消息最后一条必须是 user 或 tool，一处覆盖四条路由与两类绕过；assistant 结尾（Anthropic prefill 形态）上游本就不支持，转明确 400 是纯改善；tool 结果结尾的工具循环必须通过（测试锁定）。同时修正威胁模型夸大：lastAccountExempt 默认开启保证每 tier 至少留一个账号，这个向量只能把池降级到单账号、不能「逐个打空」。换层测试驱动真实 handleChatCompletions（mock 会绕过守卫本身）。

### 07-28（风暴收尾 + 截断迁移 + 错误预算 + v3.9.1/2/3 三连发）

72. `4f29f23 | 07-28 01:23 | fix(chat,response-store): 修复对抗复核第二批`
    **逻辑级**：① 回归（自己引入）：共享层可应答守卫漏掉 legacy OpenAI 工具结果角色 `role:'function'`（tool 之前的写法，wire 编码器映射到同一 source，客户端仍在用），以它结尾的合法工具循环被 400，实测确认后加入可应答集合。② **三条自己的假测试**：response-store-dedup 一条恒真断言（检查上游 body 是否出现 'fromInstructions'，该字符串全仓不存在——实现早已不用 Symbol 方案），改为断言可观测后果（当轮上游必须看到 instructions 而 store 里必须没有）；byte-budget 后缀解析用例是镜像实现（测试里重写正则再自我断言），抽成导出 parseByteSize() 生产测试共用；truncateMessages 的 head cap 无覆盖，补 18 条边界套件。③ 策略回退：headBudget 从 MAX/2 收紧为 MAX_MESSAGES-1——MAX/2 不只修 bug 还改变了 lead∈(MAX/2,MAX) 原本正确区间的保留策略（多丢 system），负数 slice bug 只在 lead>=MAX 触发，MAX-1 修得够且与 v3.9.0 逐字节一致。④ 陈旧注释（responses.js 仍称 Symbol 方案、caller-key.js 头注释仍列 previous_response_id）按实现改写。
73. `e838341 | 07-28 01:30 | fix(responses): response store 只对可信身份存储`
    **逻辑级**（SEC-W2 修复，链 4）：对抗复核指出 store 用**完整 callerKey** 做隔离，而 callerKey 可能是 `:client:<ip+ua>` 猜测身份。实测：两个终端用户经同一反代（同 IP 同 UA）派生逐字节相同的 callerKey → 用户 B 可拿 A 的 response id 链式读到 A 的整段对话，正是 SEC-W2 明令禁止的跨租户泄漏。修：与 cascade、bindConnectSticky 复用同一道 hasPerUserScope 门禁（从 chat.js 导出复用而非复制逻辑）：`:user:`/`session:` 等真实信号可链式；`:client:` 猜测桶与裸 API key 不存储、链式返回 404；真单用户自部署用 SINGLE_TENANT_CACHE=1 opt-in。这**部分收回** 30485c3 的 blocker 修复口径：当时移除 previous_response_id 作 scope 信号让裸 SDK 客户端靠 ip+ua 链式，安全上那是错的（代理无法区分反代后不同用户）；移除本身仍必要（每轮变是硬失败根因），但「因此裸客户端能链式」推论不成立。404 消息按失败原因分支指导调用方。
74. `9586593 | 07-28 01:36 | docs: 交接说明 — 未发版内容、未修清单、本轮方法论`
    docs/HANDOFF-2026-07-27.md：最要紧——已发布 v3.9.0 的头号功能对不发 user/prompt_cache_key 的标准 SDK 客户端完全不可用（30485c3 已修，是发 v3.9.1 的主要理由）；v3.9.0..HEAD 10 个未发版 commit 逐条说明；8 条已确认未修项带 file:line（StopReason 3/5 与流式异常中断会造成硬失败建议优先）；1 条需作者拍板的产品取舍（total_tokens 是否含 cache_write，与 #118 既有决定冲突）；本机环境状态；方法论 7 条（被审过的地方是硬的/真实客户端比读代码有效/自己的修复必须被对抗验证/突变测试三条硬教训/注释里的夸大和 bug 一样有害/两个结构陷阱已成 CI 守卫/会话操作纪律）。
75. `9378b5b | 07-28 05:28 | fix(response-store): 字节预算在数百租户时形同不存在`
    **逻辑级**：`byteShare = MAX_BYTES / tenants` 在规模上自毁：租户数上几百时份额降到一次普通会话之下 → 每个租户都判定超份额、各自只驱逐自己最旧一条，而只持有一条的租户无可驱逐 → break，预算仍超着（实测 600 租户 × 一条 20KB 会话，预算 2MB：5.88 倍超额、零驱逐）。字节上限恰好在它被写来保护的那个规模上停止存在。份额加下限 MIN_TENANT_BYTES（预算 1/64，最小 256KB）：低于此值算小户，交还全局 LRU 扫描回收——这是「多个小租户」形态唯一能把总量压回预算的路径（修复后 1.0 倍、498 次驱逐）。
76. `92946c5 | 07-28 05:28 | fix(devin-connect): 退役 StopReason 3/5 的猜测值 — 截断改由 usage 判定`
    **逻辑级**（截断迁移链起点）：3→length、5→content_filter 都是照 protobuf 变体**名字顺序**猜的，与 30485c3 被付费实测推翻的 4→length 同源。猜错代价不对称：假 length/content_filter 把 /v1/responses 一轮关成 response.incomplete（Codex 类客户端整轮硬失败）；content_filter 还在 /v1/messages 上映射成 Anthropic stop_reason:'refusal'——把正常完成报成模型拒答（真拒答看正文就知道，假拒答客户端无从恢复）。两个值改 stop（2 和 4 实测锚点不动），截断改用不依赖未校准整数的信号：新增 resolveFinishReason，completion_tokens 恰好等于调用方请求上限时报 length（与 OpenAI 客户端自己的判断一致；刻意只用等号、只在调用方显式给上限时，因为把完整答案报成截断更有害）。已校准 DEVIN_CONNECT_STOP_REASON_MAP 的运维方优先级最高。顺带补 handoff 第 5 项：finish 事件的 usage/finish_reason 无调用点守卫（纯函数有测试但「事件确实调用了它」没有），新增 test/devin-connect-finish-callsite.test.js。CUTOVER §8.7 同步重写。
77. `2c85edb | 07-28 05:29 | fix(responses,devin-connect): 流式异常中断被报成完成,半截回复还进 store`
    **逻辑级**（截断迁移链一环）：两层同一盲点：① devin-connect 把「socket 结束但无 Connect-RPC 强制的 end-of-stream 帧」当正常抽干——generator 正常返回、reason=null 默认落 'stop'，被截断的回复到四条协议 handler 时看起来像完整一轮。现在抛 STREAM_TRUNCATED（列入可重试：与 ECONNRESET 同类，流式路径只在未 emit 字节时重放不重复内容），抛出点在 tail flush 之后已发字节不受影响。② translator 层把「没有 finish_reason」与「良性 finish_reason」同等对待关成 response.completed；每条真实成功路径都会发终止 chunk，缺失只意味着上游中途断 → 关成 incomplete，理由用独立 `upstream_incomplete`（断连不是 token 上限，报成 max_output_tokens 会让自动续写客户端去接一轮上游没写完的话）。**且不再进 store**（failed 看不到这个情况，半截回复此前会成为下一轮上下文的静默污染）。→ 此 commit 后来被 8fa5e97 打出真漏洞（合成终止帧骗过 sawTerminalChunk 守卫，见链 2）。
78. `855fe7c | 07-28 05:29 | fix(special-agent): 'content' 子串匹配把正常完成误判成拒答`
    **逻辑级**：裸 `includes('content')` 把任何含 "content" 子串的 stop_reason 归成 content_filter，而上游表示正常完成的词恰恰含它：content_complete / no_content / contents_delivered / end_turn_content 全部命中（已逐条实测）。不是标签问题：content_filter 会把 /v1/responses 一轮关成 response.incomplete、在 /v1/messages 上变成 Anthropic stop_reason:'refusal'——一次完整回答被报成模型拒绝回答。改为整词匹配（非字母切分）一张明确 filter 词表（refusal/content_filter/content_policy/safety/moderation 等照旧命中）。
79. `4d98618 | 07-28 05:30 | docs: 交接清单 1–7 全部结清 + 台账补流终止与 finish_reason 语义一节`
    HANDOFF §3 原「已确认未修」7 条逐条标注结论与 commit（3/5 真截断捕获仍待做但当前实现不依赖）。AUDIT-LEDGER 补 07-28 一节记两条新规律：**把「不知道」当成「没事」**——缺失终止帧当正常结束、未校准枚举当已知语义、缺失 finish_reason 当良性完成，三处都在信息不足时选乐观解释，代价都是把坏结果报成好结果，见到默认/兜底分支应问「这个默认在断言事实还是在承认无知」；**把猜测固化成契约**——两条既有测试把名字顺序的猜测写成断言，这类测试注释必须标明「这是猜测，证据是 X」。
80. `f943e49 | 07-28 05:29 | feat(responses): 补 GET / DELETE /v1/responses/{id}`
    **逻辑级**：store 里早有 deleteResponse 和完整会话只是没接路由。作用域与续接查询完全一致：只能读自己 callerKey 铸出的 id，`:client:<ip+ua>` 猜测身份一律读不到（反代后每终端用户塌到同一指纹，认它就等于把 A 的会话交给 B，SEC-W2）；别人的 id 一律 404 不泄漏是否存在。路由显式前缀 + 严格 id 字符集（router 从不 URL 解码 path，字符集关死使后缀无法夹带穿越段或第二个路径组件）。测试两层：直调 handler 覆盖作用域逻辑 + 真实 HTTP 套件覆盖装配层（台账那个教训：十个鉴权套件直接 import handler，谁都没走过路由层，真正的绕过就住在那儿）。→ **此端点随 v3.9.1 发布即死**（见链 3 与 4a4653d）。
81. `1bfb3b8 | 07-28 19:19 | fix(devin-connect): 任意一条无关 STOP_REASON_MAP 覆盖会整体关掉截断推断`
    **自伤返工（自己引入）**：resolveFinishReason 判断「该值是否已被 operator 校准」用 `Object.hasOwn(合并后的表, n)`，而默认表本身已含 0..6 → operator 只要设**任意一条**覆盖（哪怕无关的 "7=length"），值 2/4 也被当「已校准」，usage 截断推断被整体跳过（实测：同一 cap 命中请求，无覆盖报 length、设 7=length 后报 stop）。改只查 operator 实际 pin 过的键：stopReasonMapAndOverrides 额外返回 overrides 集合记录显式赋值整数；operator 覆盖某值仍优先于推断，但没提到的值不再连带禁用。补 BigInt 形态回归（wire 解码出来就是 BigInt）。
82. `f9cd3ac | 07-28 19:19 | fix(chat): STREAM_TRUNCATED 不该记账号错误预算`
    **自伤返工（自己引入，错误预算第三波）**：新增的 STREAM_TRUNCATED 落进 finalizeConnectAccount 末尾 `else reportError(apiKey)` → 传输层故障（socket 中途断开缺 end-of-stream 帧）被计入账号错误预算，攒到 errorStreakThreshold 把健康账号翻 status='error' 并写入持久化指数退避。到上游网络链路一抖，健康账号三次一批被下线——正是 CONTENT_BLOCKED/UPSTREAM_ERROR 豁免当初要消除的失效模式，等于重新引入一次（单账号池被 lastAccountExempt 掩盖，只有健康 peer 存在才显形）。改 reportInternalError：仍记 health-window 事件（真病账号照旧被选号降权）但不走 errorCount 驱逐；新增 stream_truncated 计数器（尖峰=上游链路在丢连接的直接信号）。
83. `f9fcaae | 07-28 19:20 | docs: 记自查补修的两条 + response store 多小租户局限(非回归)`
    复核 agent 全因网关 502 挂掉、零结论，改手工探测查出两条自己引入的缺陷（1bfb3b8 / f9cd3ac）。教训：新增错误码必须同时确认它落进 finalizeConnectAccount 哪个分支——末尾 else reportError 是静默兜底，默认把新码当账号故障，且单账号池会被 lastAccountExempt 掩盖。另记 response store 大量小租户挤掉受害者会话是既存局限（基线实测同样全丢且预算超 3.92 倍，非本轮回归）。
84. `f17f435 | 07-28 19:22 | chore(release): v3.9.1`
85. `8fa5e97 | 07-28 21:18 | fix(chat,responses): 合成终止帧骗过截断守卫 — 默认后端上半截回复仍报成完成`
    **逻辑级**（截断迁移链关键一环，发版后对抗复核查出的 blocker，是 2c85edb 的真实漏洞）：Cascade 流在**已发出内容之后**中途死掉时 chat.js 补发**合成的** finish_reason:'stop' 收尾（把错误当 content delta 注入会污染 assistant 消息，补发干净收尾是对的 wire 形态）。但 v3.9.1 新加的 sawTerminalChunk 守卫问「有没有收到终止 chunk」，合成帧正好满足它 → 2c85edb 声称关掉的缺陷只在 connect 路径关掉了（那条抛 STREAM_TRUNCATED），而 Cascade 是默认后端——半截回复照旧报 response.completed 并写进 store 成为下一轮上下文。复核用三种真实错误形态实测复现（HTTP/2 'pending stream has been canceled'、provider 'context deadline exceeded'、ECONNRESET）；带 tool_call 的变体在 store 里留下永远不会有结果的 tool_calls。修：合成帧带 __synthetic_finish 标记，translator 不把它计为终止 chunk；标记只在内部 translator 路由发出，直连 /v1/chat/completions 的客户端看到的 wire 逐字节不变。顺带第二条：store 提交门用 translator.truncated 但 length/content_filter 是**合法截断**（客户端看得到原因能续写，OpenAI 允许从它链式续接，非流式一直照旧 commit）→ 用 truncated 当门让流式与非流式对同一 finish_reason 行为分叉（实测流式 length 不可链、非流式可链），门改 translator.aborted——只挡「上游从未给出终止信号」这一种。
86. `9fb5302 | 07-28 21:18 | fix(response-store): 超额消息被静默删除 — 丢弃必须留痕`
    **自伤返工（自己引入，发版后对抗复核）**：capEntryBytes 的反向游走在「已保留一条、下一条放不下」时 break，一条超过单条上限、后面还有更小消息的消息被整条排除，剩余消息放得下 → approxBytes(trimmed) > MAX_ENTRY_BYTES 兜底分支不触发，trimContentToFit 和 TRUNCATION_MARKER 都不运行。实测（RESPONSE_STORE_MAX_BYTES=8m）：2MB user 提问 + 简短 assistant 回复，存下来是 ["assistant"]——用户提问连同粘贴的文件整条消失，无标记无日志，下一轮 previous_response_id 续接时模型被问及从未见过的内容、以 200 给出通顺但无上下文的回答。这正是模块头部声明要消除的 silent-wrong-answer 模式，被为超额轮次重新引入。修：丢弃消息时把说明前置到第一条**存活**消息上 + 记 warn 日志（不新增消息——插入会改变角色序列，connect wire 层敏感）。
87. `7d7d7ac | 07-28 21:19 | chore(release): v3.9.2`（只修了 1/3，见下一条）
88. `161c88d | 07-28 22:24 | fix(messages,gemini): 合成终止帧同样骗过这两条路由 — v3.9.2 只修了 1/3`
    **逻辑级**（截断迁移链收尾，自伤返工）：v3.9.2 给 chat.js 的合成帧加 __synthetic_finish 标记，但**只有 responses.js 认这个标记**。messages 和 gemini 各自都有为同一场景写的守卫（messages 的 BUG1、gemini 同构守卫，注释明说「截断必须报 error 而不是伪造 stop_reason」），都被同一合成帧骗过。实测（Cascade 已发内容后中途死掉）：/v1/messages stop_reason=end_turn|无 error 帧；v1beta gemini finishReason=STOP|无 error 帧。**本仓库「修复只覆盖部分路由」陷阱第 4 次——而且这次的不完整修复就在修复本身里**。根因比标记更深：finishPartialStreamAfterError 除了合成 finish_reason 还写 [DONE]，messages/gemini 都把裸 [DONE] 当权威终止信号 → 两条路由有**两个**入口被骗，只堵 finish 帧无效（第一次尝试正是只堵一个，验证「看起来没生效」一度误判并回滚）。新增 sawSyntheticFinish 状态把两个入口一起折价（responses.js 对 [DONE] 是 continue 不受影响）。守卫 test/synthetic-finish-parity.test.js 12 条：三条路由 × 两个入口 + 正常流对照 + 源码级元守卫（新增内部路由不消费 __synthetic_finish 直接失败）。
89. `6b6fb6c | 07-28 22:25 | chore(release): v3.9.3`
90. `93b4965 | 07-28 14:41(commit 07-29 17:11) | feat(models): enforce per-account cloud catalogs`
    #232 本体（作者时间 07-28、commit 时间 07-29、merge 07-31——分支上写就）：按账号强制上游云目录过滤。auth.js 207 行 + models.js 135 行 + dashboard 17 行 + 测试 296 行。→ 后续 78a7730/4e80556/cf6ece1/f0a0074/d10f48b 四修一 perf（见链 8）。
91. `0f5cb56 | 07-28 14:41(commit 07-29 17:11) | docs: document per-account cloud catalog filtering`
92. `78a7730 | 07-28 18:20(commit 07-29 17:11) | fix(models): fail open on malformed cloud catalogs`
    畸形云目录 fail open（auth.js 10 行 + models.js 8 行 + 测试 57 行）。
93. `4e80556 | 07-29 01:04(commit 07-29 17:20) | fix(models): guard cloud catalog safety invariants`
    云目录安全不变量守卫（auth.js 97 行 + models.js 128 行 + 测试 235 行）。
94. `d10f48b | 07-29 01:05(commit 07-29 17:20) | feat(dashboard): warn when drought protection fails open`
    dashboard 对 drought protection fail open 告警（中英 i18n + index.html 4 行 + dashboard-syntax 守卫 14 行）。
95. `cf6ece1 | 07-29 02:31(commit 07-29 17:20) | fix(models): isolate Cascade cloud catalog filtering`
    **逻辑级**：隔离 Cascade 云目录过滤——Cascade 路径的目录语义与 connect 不同（backend-boundary 测试 184 行），.env.example/README 中英同步 4 处。
96. `f0a0074 | 07-29 19:56 | perf(models): reuse cloud catalog union during filtering`
    过滤时复用云目录并集（models.js 22 行）。
97. `ff9b98f | 07-29 20:49 | fix(ci): migrate release runner to macos-26-intel`
    **逻辑级**（#233 本体，四行 CI 改动但价值在诊断）：macOS x64 构建缺口连漏四个版本——终态是 cancelled 而非排队，四次都被判断成「不用管」。arm64/x64 拆分后 x64 runner 环境变了，迁 macos-26-intel。→ 320ffd5 里记「#233 B+，价值全在诊断」。

### 07-29（检索端点死窗收口 + v3.9.4）

98. `4a4653d | 07-29 03:18 | fix(server): GET/DELETE /v1/responses/{id} 自发布起对所有客户端不可用`
    **逻辑级**（链 3，v3.9.1 发布即死，死窗约 8 小时）：无 body 的 GET/DELETE 用 `callerKeyFromRequest(req, token, null)` 派生身份：能链式的客户端都发 user/prompt_cache_key/safety_identifier → POST callerKey 带 `:user:<hash>` 段，而 bodyless GET 派生 `:client:<ip+ua>` → 键不同必然 miss；什么都不发的客户端两边键相同但过不了 hasPerUserScope → 同样 404。连 SINGLE_TENANT_CACHE=1 也救不了（身份不匹配是先决问题）。实测：POST 存下 id 后同一客户端 GET/DELETE 全部 404，而用它自己的 POST 身份查同一 id 返回 200（证明记录确实在）。**而我当时写的测试恰好把这个 bug 固化成了契约**——路由层测试断言「bodyless GET 必须 404」还注释称之 "documented contract"，功能死了全量测试却一直绿，这比缺测试更糟。修：检索 API 无请求体，身份信号改走 query（?user= / ?prompt_cache_key= / ?safety_identifier=），与 POST body 同一套词汇、同一条提取路径；不带参数行为与之前一致。端到端实测：无 key 401、带 key 无参数 404、正确参数 200 且内容正确、别人参数 404 不泄漏、DELETE 正确参数 200 且删后不可读。守卫把固化 bug 的断言改正向 + 两条对照；突变验证退回 (req, token, null) 新守卫失败。
99. `6d51448 | 07-29 03:19 | docs: 记录检索/删除端点的 query 身份参数契约`
100. `0e7a671 | 07-29 03:23 | chore(release): v3.9.4`

### 07-31（#232/#233 merge + v3.9.5/6 + 检索端点再修 + 假测试总清理）

101. `a61de08 | 07-31 02:06 | fix(responses,server): 检索端点洗白截断状态 + 身份参数把 PII 写进 URL`
    **逻辑级**（链 3 收尾，发版后复核 16 条候选里验证成立的 5 条，其中 2 条是 v3.9.4 刚引入的）：① **v3.9.4 引入**：身份信号走 query 把 PII 写进 URL——user 按本仓库自己的说法（caller-key.js:107）「常是终端用户邮箱或稳定账号 id」，而随包 TLS 前端 https-proxy.js:20 原样打印整个 URL，反代/CDN/浏览器历史同理——把模块明确拒绝落日志的值亲手放进最容易落日志的地方。改走 header（x-response-user 等），query 保留为文档化降级通道并标注风险。② **v3.9.4 引入**：query 白名单只覆盖 6 种作用域词汇里的 3 种——用 conversation / metadata.conversation_id / metadata.session_id 的客户端仍取不回自己的响应（又是「只覆盖部分情况」，而 v3.9.4 本身就是为修这个而发）。已补全 6 种含 metadata 嵌套形态。③ **v3.9.1/2 起就有**：storedResponseBody 硬编码 status:'completed' → 同一 id POST 报 incomplete+max_output_tokens、GET 报 completed（8fa5e97 让合法截断轮次进 store 后，检索把截断洗成完成）；store 现记录 status/incompleteReason，两条 commit 路径都传。④ drop 标记被当模型输出返回（v3.9.2「丢弃留痕」前置到第一条存活消息的 content，当那条是 assistant 时运维文本经 GET 变假模型答案），返回前剥离（仍留在链式上下文里——那儿是有用信号）。⑤ 数组形态 content 产出结构非法响应体（output_text 塞数组、text 字段非字符串），现在扁平化取 text parts。顺带 usage 从 mapUsage({}) 全 0 改为省略（两个官方 SDK 都声明 optional，全 0 与「真的用了 0 token」无法区分会被计费中继当真）。
102. `45041fd | 07-31 02:07 | test(responses): 检索端点契约守卫`
    12 条，突变验证 3 种（status 退回硬编码抓 2、不剥离 drop 标记抓 1、数组 content 不扁平化抓 1）。两条源码级守卫：检索必须能从 header 读身份（非只有 query）、必须覆盖 POST 侧全部 6 种作用域词汇——v3.9.4 只覆盖 3 种正是它自己要修的失效模式的小型复发。
103. `7c39896 | 07-31 02:09 | Merge PR #233`（macos-26-intel）
104. `d7a175d | 07-31 02:10 | Merge PR #232`（per-account cloud catalogs）
105. `320ffd5 | 07-31 02:12 | docs(contributors): 补 andya1lan #232 (A) 与 #233 (B+)`
    #232 方案取舍最值钱（并集发现 + 账号维度路由），两轮修复精准命中，主动做 Dashboard fail-open 告警与 out-of-scope 划分；未到 S 因初版漏两个 fail-open 场景且一度有条不实测试声明。→ 与 4e80556/d10f48b 呼应。
106. `b1573a3 | 07-31 02:13 | chore(release): v3.9.5`
107. `44f0303 | 07-31 02:50 | fix(chat): 三个上游错误码仍在把健康账号打下线 + 补结构守卫`
    **逻辑级**（错误预算链收尾，v3.9.6）：v3.9.2 修了 STREAM_TRUNCATED 落进 finalizeConnectAccount 末尾兜底 reportError 的问题，但当时只修那**一个**码。这轮顺着问显而易见的后续问题——「既然它是误落进去的，那还有哪些码在下面？」枚举 classifyUpstreamError 全部产出后还有三个：TIMEOUT（idle 超时，本文件注释自称「往往是可重试的上游停顿」）、DEADLINE_EXCEEDED（绝对墙钟上限，上游挂住账号没问题）、NO_TOKEN（压根没配 session token，是**配置**故障，记账号健康双重错误）。实测（seed 健康 peer 让 lastAccountExempt 失效）：三个码各调 3 次账号全部翻 status='error'、errorCount=3；修复后全部 active/errorCount=0。**同时补结构守卫，因为这是同一个结构原因第二次发作**：那条分类以裸 `else reportError(apiKey)` 收尾，任何没人想到的错误码都被静默当账号故障；行为测试抓不到下一个（那段代码还没写）。新守卫读两份源码，当 devin-connect.js 能产出的码在 finalizeConnectAccount 没有明确归属时直接失败，错误信息写明决策方法（真账号故障留兜底，其余进 TRANSPORT_FAULT_CODES 或自己的分支）。另加 transport_fault 计数器（尖峰=上游停顿或部署配错，不是账号池在死）。突变验证 2 种：去掉 NO_TOKEN → 元守卫与行为守卫同时报警（抓 2）；整个分支禁用 → 抓 3。
108. `50875f5 | 07-31 03:29 | test: 修 5 条自己写的假测试`
    **逻辑级**（假测试总清理，链 1 收尾；代码质量复核唯一跑成功的那面审的是测试本身，5 条全部经独立突变验证成立，其中 4 条是这几版本刚写的守卫）：
    1. DELETE 快乐路径从未执行（responses-retrieve-route）：断言包在 `if (res.statusCode === 200) {...} else { assert 404 }` 里，而 WINDSURFAPI_SINGLE_TENANT_CACHE 在 chat.js:850 是 import 期冻结的 const，运行时设它无效 → 永远走 404 分支。实测：把 DELETE 端点整个改成 `if (true) return responseNotFound(...)`，该套件 11/11 全绿——条件断言只能证明恰好走到的那一支。改为显式身份 header 走无条件快乐路径。
    2. header 身份通道只有源码 grep 守着（responses-retrieve-contract）：`assert.match(serverSrc, /x-response-/)` 匹配任何残留字符串；实测去掉下划线→连字符转换后 6 信号里 4 个全 404 而 35 个检索测试全绿。改在 route 套件里真的发 6 个 header 走 HTTP（+「错值仍 404」对照），同一突变现在抓 4 条。
    3. 作用域词汇检查可被注释满足：`serverSrc.includes("'conversation_id'")` 而 server.js:715 的注释里就有该字样。改为解析 caller-key.js 真实的 POST 侧词汇与 router 的 pick() 列表求差集，专抓「POST 加了第 7 个信号而检索没跟上」。
    4. 单条上限测试证明不了单条上限（response-store-byte-budget）：在**空 store** 写一条 50MB，空 store 里全局 LRU 无可回收，断言成立的原因与上限无关。补「已有邻居租户」场景——实测取消上限后 5 租户 + 一次 2MB 写入达 5,444,688/2,097,152 = 2.6 倍超额，突变从抓 2 条提到 3 条。
    5. 四条恒真断言（dashboard-syntax）：`doesNotMatch(html, /pageSize=1000/)`——index.html 从不用 query 串形态写 pageSize（只写 `pageSize: this.proxyPageSize`），任何分页退化都不可能匹配；更糟：它们要防的「1000 行默认加载」**已经存在**（`pageSize: '1000'`，CSV 导出路径）而它们一直绿着。改为按真实形态检查：列表路径必须走绑定属性，只允许导出那一处硬编码大页。
    **共同教训**：源码 grep 分不清「功能可用」和「字符串还在」，只适合守结构性不变量（如「新增内部路由必须消费某信号」），不能替代行为验证。
109. `aafac86 | 07-31 03:58 | chore(release): v3.9.6`

---

## 第二部分 · 问题链清单（8 条）

### 链 1 · 7-27 对抗 review 风暴（30485c3 修 5 → 2ced8a2 发现全自己引入 → 4f29f23 假测试 → 50875f5 清 5 条）★ 全链最重

按 commit date 逐 commit 时间序（含前后哨兵）：

| 时间 | commit | 动作 |
|---|---|---|
| 07-27 15:21 | 8be3efd | v3.9.0 发布（核心=12f04be 会话状态） |
| 16:06 | 0179306 | 协议层扫描零缺陷 + 补 20 条硬化测试 + **建 AUDIT-LEDGER.md 审计台账**（第一轮扫描，结论是「扫过且干净」也是资产） |
| 17:12 | dc0a2ad | response store 补字节预算 —— **悄悄引入 4 个缺陷**（跨租户冲刷 DoS / 驱逐吃新条目 / base64 盲视 / CJK 低估），为 2ced8a2 埋雷 |
| 22:01 | **30485c3** | 多 agent 并行审计（3 条真实付费上游压测 + 静态审计）产出 6 条确认发现，逐条实测复现：**修 5 个缺陷**（blocker：previous_response_id 参与 callerKey 派生致标准 SDK 每轮链式必 404；usage 子集不变量破坏少报 91%；StopReason 4 猜测被付费实测推翻；流式丢失截断信号；空 input 打空账号池；truncateMessages 负数 slice）|
| 22:03 | 09a7796 | 链式续接去重 system prompt（N 轮 N 份→1 份） |
| 22:16 | f21586b | 镜像实现测试纠正（usage 测试咬住生产代码） |
| 22:50 | 8aef0dd | 截断/完成状态边界守卫 + 过期注释 |
| 23:27 | **2ced8a2** | 派 9 个 agent **证伪上一批修复**，抓到 1 blocker + 4 major **全部是自己上一批（dc0a2ad/30485c3）引入的**：字节驱逐冲掉别租户会话、驱逐吃掉刚写入条目、approxBytes 对 base64 盲视（15000 倍低估）、非 Latin1 低估 2 倍、instructions 去重保留已撤销指令（toggle-back 语言错误实测复现）。每条做突变验证，两次突变自己写错（恒真条件）后重验 |
| 23:49 | **8334cea** | 上一版守卫位置错了（可绕过 + 过度拒绝）：空输入守卫从 responses 挪到 chat 共享层，按「最后一条必须是 user 或 tool」守类别 |
| 07-28 01:23 | **4f29f23** | 对抗复核第二批：legacy function 角色误拒（自己引入）+ **三条自己的假测试**（恒真断言 / 镜像实现 / 无覆盖）|
| 01:30 | e838341 | SEC-W2 跨租户泄漏修复（部分收回 30485c3 的口径，见链 4） |
| 01:36 | 9586593 | 交接文档（10 个未发版 commit 逐条说明 + 8 条未修清单 + 方法论 7 条） |
| 07-31 03:29 | **50875f5** | 清 5 条自己写的假测试（条件断言只证明走到的一支 / 源码 grep 冒充行为守卫 / 可被注释满足的 includes / 空 store 上测单条上限 / 恒真断言且要防的 bug 已存在） |

风暴总账：**14 个 commit 直接属于风暴线，其中自伤自愈闭环 4 轮**（30485c3→2ced8a2 数小时内、8334cea、4f29f23、50875f5），7-27 起累计清理 **8 条自产假测试**（4f29f23 三条 + 50875f5 五条，另有 f21586b/85bc1fb 两条镜像/NUL 返工）。方法论提炼见第三部分。

### 链 2 · 截断判定迁移链（StopReason 猜测值 → usage 判定 → 合成帧对抗）

| 时间 | commit | 环节 |
|---|---|---|
| 07-27 22:01 | 30485c3 | 付费实测推翻 StopReason 4（max_turn_requests→'length' 猜测），4 改 stop——**每个完整付费响应曾被报成截断** |
| 07-28 05:28 | **92946c5** | 退役 StopReason 3/5 猜测值（同源：照 protobuf 变体名顺序猜）：截断改由 usage 判定（completion_tokens == 调用方上限 → length），resolveFinishReason 只认 operator 实际 pin 过的值；补 finish 事件调用点守卫 |
| 05:29 | **2c85edb** | 流式异常中断被报成完成 + 半截回复进 store：devin-connect 抛 STREAM_TRUNCATED、translator 关 incomplete（upstream_incomplete 独立理由）、不进 store |
| 19:19 | 1bfb3b8 | **自己引入**：任意一条无关 STOP_REASON_MAP 覆盖（如 "7=length"）把 2/4 当已校准、usage 截断推断整体跳过——只查 operator 实际 pin 的键（overrides 集合） |
| 21:18 | **8fa5e97** | **发版后对抗复核查出的 blocker，是 2c85edb 的真实漏洞**：合成终止帧（Cascade 已发内容后中途死掉时 chat.js 补发的 finish_reason:'stop'）骗过 sawTerminalChunk 守卫——2c85edb 只关掉了 connect 路径（抛 STREAM_TRUNCATED），而 Cascade 是默认后端，半截回复照旧报 completed 进 store。合成帧带 __synthetic_finish 标记 + store 提交门从 truncated 改 aborted |
| 22:24 | **161c88d** | v3.9.2 **只修了 1/3**：messages/gemini 都有同构守卫且都被同一合成帧骗过（根因更深：finishPartialStreamAfterError 还写 [DONE]，两条路由把裸 [DONE] 当权威终止信号——两个入口被骗，第一次只堵一个、一度误判回滚）。sawSyntheticFinish 折价两个入口 + 12 条 parity 测试 + 源码级元守卫 |
| 07-31 02:50 | 44f0303 | （并行线）错误预算兜底 else 再修，见链 5 |

教训链完整闭环：**猜测值（30485c3 打 4）→ 迁移判定（92946c5）→ 新判定被绕过（2c85edb 的洞在 8fa5e97 被挖出）→ 修复只覆盖部分路由（161c88d 自曝第 4 次「修复只覆盖部分路径」陷阱，且不完整修复就在修复本身里）→ 元守卫立住**。

### 链 3 · 检索端点死窗（GET/DELETE /v1/responses/{id}）

| 时间 | commit | 环节 |
|---|---|---|
| 07-28 05:29 | f943e49 | feat 加端点（作用域=续接查询，:client: 猜测身份一律不可读，SEC-W2 前置）；测试两层（handler + 真实 HTTP）——但没覆盖「bodyless 请求怎么派生身份」 |
| 07-28 19:22 | f17f435 | **v3.9.1 发布，端点随之上线即死** |
| 07-29 03:18 | **4a4653d** | 实测：POST 存下 id 后同一客户端 GET/DELETE 全 404——bodyless GET 用 `callerKeyFromRequest(req, token, null)` 派生 `:client:<ip+ua>`，与 POST 的 `:user:<hash>` 键不同必然 miss；且**自己写的测试把 bug 固化成契约**（断言 bodyless GET 必须 404，注释称 "documented contract"——全量绿但功能死）。修：身份信号改走 query 与 POST 同一套词汇；守卫改正向断言 + 突变验证 |
| 07-29 03:19 | 6d51448 | 文档化 query 身份参数契约 |
| 03:23 | 0e7a671 | v3.9.4 发布（修复上线） |

**死窗实测约 8 小时**（v3.9.1 07-28 19:22 发布 → v3.9.4 07-29 03:23 发布）。注：任务描述与 v1 采集称「4 天不可用」「v3.9.0 发布起」，与 git 时间戳不符——端点由 f943e49（07-28 05:29）引入、最早包含于 v3.9.1（`git tag --contains f943e49` 首行为 v3.9.1），v3.9.0（07-27）根本没有这两个端点。以实测为准。
后续（链 3 尾巴）：v3.9.4 引入两个新问题——query 把 PII 写进 URL + 白名单只覆盖 6 词汇里的 3 种；07-31 a61de08 修掉并补全 6 种（改走 header，query 降级为文档化通道），45041fd 立契约守卫（含「必须覆盖 POST 侧全部 6 种」源码级守卫）。

### 链 4 · response store 跨租户泄漏（SEC-W2）

| 时间 | commit | 环节 |
|---|---|---|
| 07-27 08:31 | 12f04be | store 按 callerKey 隔离（fail-closed 设计本就正确，但隔离键可能是不可信的猜测身份） |
| 07-27 22:01 | 30485c3 | 为让标准 SDK 客户端能链式，把 previous_response_id 移出 callerKey 派生，无稳定信号落到 **ip+ua 指纹**——修了 404，却给 SEC-W2 埋了雷 |
| 07-28 01:30 | **e838341** | 对抗复核指出：store 用完整 callerKey 隔离，而 callerKey 可能是 `:client:<ip+ua>` 猜测身份——两个终端用户经同一反代派生逐字节相同 callerKey，用户 B 可拿 A 的 id 链式读到 A 整段对话（SEC-W2 明令禁止）。修：与 cascade、bindConnectSticky 复用 hasPerUserScope 门禁，猜测桶与裸 key 不存储返回 404，SINGLE_TENANT_CACHE=1 opt-in。**部分收回 30485c3 的口径**：移除 previous_response_id 仍必要，但「裸客户端靠 ip+ua 链式」推论不成立 |

同源支线：f2c938e（bindConnectSticky 绕过 per-user scope 门禁，同一 SEC-W2/HIGH-3 家族）；f943e49 端点设计自带「:client: 不可读」；a61de08 的 PII 与 4a4653d 的身份通道都属这条线的暴露面治理。

### 链 5 · 错误预算三波（上游错误码打健康账号下线）

| 时间 | commit | 环节 |
|---|---|---|
| 07-27 08:18 | **bd97b89** | 第一波：UPSTREAM_ERROR 落进 finalizeConnectAccount 末尾通用 reportError → 3 次把健康账号翻 status='error' 持久化。两个来源都是请求侧问题（gRPC internal = 永久 client mistakes；兜底 = 未分类）。改 reportInternalError 不走 errorCount 驱逐，补 upstream_error 计数器 + 反向守卫（真故障仍必须驱逐） |
| 07-28 19:19 | **f9cd3ac** | 第二波：**自己引入**——新错误码 STREAM_TRUNCATED 落进同一末尾 else reportError，把传输层抖动（socket 中途断开）计入账号预算，三次一批打健康账号下线，等于重新引入 CONTENT_BLOCKED/UPSTREAM_ERROR 豁免当初消除的失效模式。改 reportInternalError + stream_truncated 计数器 |
| 07-31 02:50 | **44f0303** | 第三波：顺着「既然它误落进去，还有哪些码在下面？」枚举 classifyUpstreamError 全部产出——TIMEOUT / DEADLINE_EXCEEDED / NO_TOKEN 三个码仍在打。**补结构守卫**：这个结构原因第二次发作（裸 else reportError 兜底），新守卫读两份源码，devin-connect 能产出的码在 finalizeConnectAccount 无明确归属时直接失败；transport_fault 计数器 |

结构根因同一：**finalizeConnectAccount 的 `else reportError` 静默兜底把任何没人想到的错误码当账号故障**，且单账号池被 lastAccountExempt 掩盖。三波逐层修：具体码 → 计数器 → 元守卫（把「下一个错误码」从行为测试抓不到变成结构测试直接失败）。

### 链 6 · sticky 亲和五连修（#230 主线）

| 时间 | commit | 环节 |
|---|---|---|
| 07-25 20:20 | **9b24f98** | 第一修（#230 本体）：DEVIN_CONNECT 路径从不写 sticky 绑定，STICKY_SESSION_ENABLED=1 空转，每轮 MISS + lastUsed 升序把同一会话派给不同账号，换号即全量重写 prompt cache（写≈10x读）。补绑定 + 关键细节 modelKey 恒 null 绑定也要以 null 写入 |
| 07-26 23:18 | **2f8bce0** | 第二修：sticky 快路径忽略 excludeKeys → dead-token failover 每跳都被快路径交回同一个死账号（triedKeys 形同虚设、重复 reportError 把绑定账号打成 error）。快路径加 excludeKeys 检查 |
| 07-26 23:18 | e65a8e9 | 日志残留清理（broken %s / 裸 NUL / 每请求噪音） |
| 07-26 23:24 | **f2c938e** | 第三修：bindConnectSticky 绕过 per-user-scope 门禁（SEC-W2/HIGH-3），共享 key 部署全部用户折叠进一个绑定槽 → RPM 打满整群迁移。加 hasPerUserScope + e2e call-site 回归 |
| 07-26 23:31 | 3419854 | 观察面：/connect-metrics 暴露 sticky 计数器（此前 getStickyStats 零消费者，运营靠数日志行才知道绑定没生效） |
| 07-26 23:32 | 0707c00 | caller-key 认 prompt_cache_key / safety_identifier（previous_response_id 每轮变让链式客户端 callerKey 每轮重铸，sticky 收益在这类客户端归零） |
| 07-26 23:34 | 9198a85 | 补 STICKY_SESSION_* 文档（开关自 #133 有但从未记录） |
| 07-27 03:44 | **b75eaa3** | 第四修：绑定按 account.id 匹配而非 apiKey 相等——后台 re-login 原地换 key 让绑定恰在 connect 最常遇到的 dead-token→re-login 场景失配（prompt cache 存在账号上而非 token 上） |
| 07-27 03:52 | **0ddb277** | 第五修：绑定表全局 LRU 被单租户铸 key 刷穿（挤掉所有租户活绑定）+ O(MAX) 全表扫描 → 按 API-key 前缀公平配额驱逐自己最旧的 + Map 迭代序即 LRU 序 O(1) |
| 07-27 07:31 | 3397f25 | 结构守卫：modelKey=null 陷阱三次（#224 RATE_LIMITED / #230 绑定键 / v3.8.0 CAPACITY）变 CI 失败 |

五连修 + 两条观察/文档 + 一条结构守卫，共 10 commit。模式：**每个修复都补了下一层（绑定写入 → 快路径排除 → scope 门禁 → 匹配语义 → 配额）**，且 3397f25 把根因（维度错位）固化成不变式守卫。

### 链 7 · warelik #224-#229 六连合并与后续修复

六连 merge（07-25 10:55-10:56，六合一）：
- #224（014ead1）429 reset window：流式路径 honor resetMs + account-wide 冷却
- #225（1783545）abort 不惩罚不 failover（clean stop）
- #226（f434ef4，含冲突解决）session continuity（abort 轮不提交 pair）
- #227（a335d51）Grok 自述中和（a6-grok）
- #228（f433c85）空 thinking signature 省略
- #229（581927c）usage *_tokens_details

每个 PR 合并后的后续修复/影响：

| PR | 合并 | 后续修复（本次切片内） |
|---|---|---|
| #224 | 07-25 10:55 | **ac045ba（07-27 03:44）「#224 同构缺陷第三次」**：CAPACITY 冷却写在 reqModelName 维度对 connect 结构性不可见（modelKey 恒 null），sticky 绑定把过载账号钉回过载 selector。同构缺陷谱系：第一次 #224 的 RATE_LIMITED（17cdbe5 修）→ 第二次 #230 绑定键（9b24f98 场景）→ 第三次 CAPACITY（ac045ba 修，冷却写进 connect 实际查询的 selector 维度，17 处调用点透传）→ 3397f25 立不变式守卫（connect 请求能造成的每种冷却都必须能关住 connect 查询）。17cdbe5 本身的 account-wide 冷却修法正是第一次发作的修复 |
| #225 | 07-25 10:55 | merge 时与 #226 冲突解决（f434ef4：kind:'abort' 不提交 pair，避免半 turn 污染 pair chain）。窗口内无再修；4895b9f 是 #225 本体的一部分（三路径统一 abort 处理） |
| #226 | 07-25 10:56 | session continuity（600 行新模块）窗口内无再修；f434ef4 merge 冲突解决即其最直接的后续。8 月才有 session-fidelity 系列（切片外） |
| #227 | 07-25 10:55 | 21046eb（07-25 15:55）规则编号统一：a6 重名消解（a6-cline-obj 与 a6-grok 分开）；730eaf9（07-27 03:40）形态绕过修复（parts 数组跳过中和，a6 族规则库漏掉的最常见 Codex 路径）——**#227 同族缺陷的后续** |
| #228 | 07-25 10:55 | 窗口内无再修（改动本身完整） |
| #229 | 07-25 10:55 | b2e8af6（07-27 03:46）补 gemini 流式 usage 帧——#229 修的是 Responses usage 结构，gemini 流式 usage 完全缺失是**同族漏项**（O1 改 opt-in 后只更新了 messages/responses，gemini 被漏） |

+ 72a90e7（07-25 16:36，model-access 门禁短路绕过）虽是 #224-#229 合并后同批修复，但属 DEVIN_CONNECT 策略治理独立线。

### 链 8 · per-account 云目录（#232）与 Cascade 隔离

93b4965（07-28 写，07-31 merge）→ 78a7730 fail open 畸形目录（07-28）→ 4e80556 安全不变量守卫（07-29）→ d10f48b dashboard fail-open 告警（07-29）→ cf6ece1 隔离 Cascade 过滤（07-29，backend-boundary 184 行测试）→ f0a0074 并集复用（07-29，perf）→ d7a175d merge（07-31）→ 320ffd5 评级 A（「初版漏两个 fail-open 场景且一度有条不实测试声明」——与 50875f5 的假测试清理同期呼应）。

---

## 第三部分 · 对抗 review 方法论（本项目最重要的工程文化）

从 7-27 风暴序列（0179306 → 30485c3 → 2ced8a2 → 8334cea → 4f29f23 → 50875f5）总结的运作机制：

**1. 循环不是「写代码→测试」，是「写代码→攻击→修→再攻击」。**
每个修复之后必须派独立的对抗方去证伪它（30485c3 之后派 9 个 agent 证伪，抓到 1 blocker + 4 major 全为自己引入；8fa5e97 之后复核用三种真实错误形态实测复现）。「被审过的地方是硬的」——没有证据的「应该没问题」不算数。

**2. 证据链按可信度排序：真实客户端/真实上游压测 > 突变验证 > 静态审计 > 读代码。**
付费账号实测推翻了 StopReason 4 的猜测（max_tokens=300 答 "HI" 证明是正常完成）；usage 子集不变量用真实数字（1765 > 3）钉死；空 input 攻击面用「修复前有 trace ID（真打上游）vs 修复后本地 400 trace ID 归零」证明。**每个缺陷都有实测复现段**（"Live-reproduced" 是 commit 正文的标准组件）。

**3. 突变测试是自证机制：先证明测试能抓到 bug，测试才算数。**
全风暴线的固定流程：修复后对修复做突变（注入原始错误形态），守卫必须失败；突变自己也可能写错（恒真条件），写错就重写重验（2ced8a2 两次、50875f5 五条全部独立突变验证成立）。**「一条从未失败过的测试等于没有测试」**（f21586b）。镜像实现（测试复刻生产算术）直接判定为假测试。

**4. 假测试与真 bug 同罪，而且必须被清。**
4f29f23 清三条、50875f5 清五条，总计 8 条 + 2 条返工（镜像测试、NUL 字节文件）。共同教训：源码 grep 分不清「功能可用」和「字符串还在」；条件断言只能证明走到的那一支；恒真断言最危险（4 条恒真断言守护的 bug 已经存在而它们一直绿）。只守结构性不变量才允许用源码级守卫。

**5. 自伤要明说，不掩饰。**
「全部是我上一批修复自己引入的」（2ced8a2）、「我上一版的守卫位置错了」（8334cea）、「v3.9.2 只修了 1/3」（161c88d）、「我 v3.9.4 引入的两条」（a61de08）——commit 正文直接承认，并把根因写清楚（为什么上一版会错）。这是账目可靠性的基础：修复历史里每一笔返工都可溯源。

**6. 根因写进守卫，把「重复犯错」变成 CI 失败。**
modelKey=null 陷阱三次后立不变式守卫（3397f25）；错误预算兜底 else 两次后立元守卫读两份源码（44f0303）；合成帧两入口被骗后立源码级元守卫「新增内部路由若不消费 __synthetic_finish 直接失败」（161c88d）；检索端点 6 词汇只覆盖 3 种后立「必须覆盖 POST 侧全部 6 种」守卫（45041fd）。**行为测试抓不到还没写出来的下一个 bug，结构守卫可以。**

**7. 审计台账是基础设施。**
AUDIT-LEDGER.md 记录「哪些子系统被实际探测过、结论、不变式在哪守卫」——「扫过且干净」本身是资产，没有记录下一个人会把同样时间再烧一遍。台账引出 SEC-W2、错误预算族等一连串修复，且「审新代码优先」的结论被本轮「缺陷一半是修上一批引入的」反证并佐证。

**8. 对「不知道」的默认值保持敌意。**
4d98618 记的两条规律：把「不知道」当成「没事」（缺失终止帧当正常结束、未校准枚举当已知语义、缺失 finish_reason 当良性完成）与把「猜测固化成契约」（测试把名字顺序的猜测写成断言）——见到默认/兜底分支要问：这个默认在断言事实，还是在承认无知？

**9. 防御过度同样要打。**
8334cea 的守卫同时修「可绕过」与「过度拒绝」；8aef0dd 防「对齐动作反向过头」（把每个工具轮标成截断）；4f29f23 策略回退（headBudget MAX/2 → MAX-1 保住原本正确区间）。对抗 review 不只为找到漏洞，也为避免修复本身引入新伤——**最贵的一课是「不完整修复就在修复本身里」（161c88d，只修 1/3）**。

---

## 第四部分 · 与 v1 采集的差异勘误（实测为准）

1. **检索端点死窗**：v1 及任务描述称「4 天不可用」「v3.9.0 发布起」。实测：f943e49 07-28 05:29 引入、`git tag --contains f943e49` 首含 v3.9.1（07-28 19:22 发布）；4a4653d 07-29 03:18 修复、v3.9.4 07-29 03:23 发布。**实际死窗约 8 小时**，且端点不在 v3.9.0 里。
2. **错误预算三波顺序**：v1 按「f9cd3ac→bd97b89→44f0303」排列；实测时间序是 **bd97b89（07-27 08:18）→ f9cd3ac（07-28 19:19）→ 44f0303（07-31 02:50）**（v1 是逆序文件造成的错觉）。
3. **#232 批次时间**：93b4965/0f5cb56/78a7730 的 author date 是 07-28、commit date 是 07-29（分支上写就），merge 到主线是 07-31（d7a175d）。v1 按 author date 归到 07-28 尚可，本账以 commit date 注出。
4. **4cf7d1d 署名**：commit 带 "Generated with Devin / Co-Authored-By: Devin"（#217 外部 PR 保留），与本仓库「不署名」铁律无关。
5. v1 聚类统计的 109 条分类与本账逐条账目一致（每条 hash 均已 `git show` 核验）。

---

## 数据备注

- 输入：`/tmp/ledger-slice-7b-release.txt`（109 条，hash|date|subject，逆序）——本账全部 hash 已与 `git log` 输出逐条比对，无伪造。
- 时间戳：`git show -s --format="%h %ad %cd %s" --date=format:"%m-%d %H:%M"` 实测；与 author date 有偏差（#232 批次）已注出。
- tag 验证：`git tag | rg 'v3\.(6|7|8|9)'` + `git log -1 v3.7.0` fatal（v3.7.0 无 tag 复验）；`git tag --contains` 用于确定端点最早发布版本。
- 深挖标准：109 条全部有账目行；**逻辑级深挖 34 条**（fc25105、4cf7d1d、f76fcb2、b864447、4824e57、67b8357、17cdbe5、db5f081、72a90e7、2d1a6aa、9b24f98、2f8bce0、f2c938e、0707c00、730eaf9、b75eaa3、ac045ba、1de5afc、0ddb277、bd97b89、12f04be、74f1c20、0179306、30485c3、09a7796、2ced8a2、8334cea、4f29f23、e838341、9378b5b、92946c5、2c85edb、855fe7c、f943e49、8fa5e97、9fb5302、161c88d、4a4653d、a61de08、44f0303、50875f5、f21586b、f9cd3ac、1bfb3b8），超过任务要求 20 条。
- 凭证：全程未读取、未输出任何凭证。
