# WindsurfAPI 记账本 v2 —— 2026-08-09 ~ 08-11（精细账）

- 范围：43 条 commit（`1308ff4` 08-09 20:46 → `9e8080a` 08-11 23:35），与 slice 一致
- 口径：所有 hash 均来自 `git log` 实测；深挖到逻辑级的条目 33 条（≥15 要求）
- 相对 v1 的三处纠正见文末「v1 纠错清单」

---

## 一、逐条 commit 账（时间正序）

### 08-09（1 条）

**1. `1308ff4` refactor(tool-emulation): trim unproven kimi compatibility**
删 264 行「未验证的 kimi 兼容」：tool-emulation.js -88（wrapperless 保护逻辑）、windsurf.js -44、cascade-native-bridge.test.js -70、swe-streaming-toolcall.test.js -68、mutate-verify.mjs 顺带删 Node 22 的 TAP 计数兼容（`# pass`/`ℹ pass` 双格式 → 只留 Node 24 格式）。删的标准是「unproven」：无 wire 证据的方言分支不留活路。注意方向：次日合并的 #252 又引入 kimi 方言抑制逻辑（默认关），与本次删除取向相反——「删无证据的活跃路径」与「加默认关的未证实开关」是同一哲学的两面。

### 08-10（39 条）

**2. `8c75d38` feat(devin-connect): 显式 prompt 缓存 #13（默认关）—— 前置阻塞已被证伪**
核心是「证伪前置阻塞」：repo 历史上认为做不了（#13 tag 未确认），本 commit 把它做成默认关开关。证据分层写进注释：**已测**——缓存命中省 ~82.2% 成本（#220 A/B）、缓存按 prompt 前缀匹配而非 session id（三次独立测量：随机 UUID 仍命中）、粘性会话已把调用方钉在一个账号上；**未测**——#13 是否为 system_prompt_cache_options 的真实 tag（来自第三方 .proto 声明顺序，prost 允许 tag 间隙）。`DEVIN_CONNECT_PROMPT_CACHE=1` 才发 #13，off 时返回 null 而非空 buffer（保持默认 wire 字节不变）。

**3. `015d730` test(mutations): 换掉一条无效突变**
原突变「null 时发零长度 #13」是无效的：`writeMessageField(13, Buffer.alloc(0))` 对空 buffer 本来就不产字节，突变体与原文行为等价（SURVIVED 不构成保护）。换成有效突变：「#13 的 varint 直接裸拼在顶层」——那会让 field 1（ClientMetadata）的位置出现裸 varint，碰撞认证元数据。换突变的依据（59ff863 记录）：「先试 `if (userJwt)` → `if (userJwt !== undefined)`，SURVIVED——但那是第十五轮 (c) 类的无效突变」。

**4. `9adae25` feat(devin-connect): tool_choice #12 / disable_parallel_tool_calls #11 透传（默认关）**
坐标来源与 #13 同层：第三方 .proto 声明顺序，未抓包确认，option_name 词汇表也未知 → 默认关 + `DEVIN_CONNECT_TOOL_CHOICE_TAGS` 可改。`normalizeToolChoice` 只发非默认意图：'auto' 返回 null 不发字段（auto 就是上游默认，发出等于白加未确认字段）；'any' 按 Anthropic 对 'required' 的拼写归一。此前仓库只能对 tool_choice 做分类（缓存键/提示词模拟），`required` 和强制工具名是「静默降级」——本 commit 是第一次让它到上游。

**5. `f3e0094` fix(test): web search 夹具 key 去掉 sk- 前缀**
自伤型修复：自己写的测试夹具（`sk-` 前缀的 `ws-web-search-exposure-test` 形态）触发自己的 secret 扫描器（`sk-` 前缀判 OpenAI key）。改成 `ws-fixture-...` 一行。与 1a95e11 的 fixture 策略一致（ws-fixture 前缀）。本账本在描述此 commit 时曾原文引用该夹具名，同样触发了 secret-scan（openai-api-key 模式）——「审计工具与被审对象共享盲点」的又一实例。

**6. `ac8fa06` feat(dashboard): 暴露 web search —— POST /accounts/:id/web-search**
`getWebSearchResults`（GetWebSearchResults RPC）「已存在且已测，但从来没人调用它」——本 commit 是首次暴露。设计要点：账号由**调用方指名**而非内部挑选（静默选择会让未解释的限流/封禁落到运营者没选的账号）；错误 in-band 返回（{ok:false} 渲染成消息而非 500）；ESM 不可 monkey-patch → `__setWebSearchDeps` 注入缝。

**7. `d007317` fix(devin-connect): tool_choice tag 改写不能指向请求已占用的字段**
逻辑级：`DEVIN_CONNECT_TOOL_CHOICE_TAGS` 可把 choice 指向 #1——而 protobuf 允许非 repeated 字段重复出现、解码器取**最后一个**：10 字节的 tool_choice 覆盖 ~800 字节的 ClientMetadata（实测 choice=1 时请求带两个 #1：814 和 10 字节）。静默失败且表现为 auth failure 而非配置错误。修：`REQUEST_OCCUPIED_TAGS = {1,2,3,7,8,15,16,20,21,22}` 冲突跳过 + warn；parallel 撞 choice 拦；两者相等整体还原默认。三条新 mutation 覆盖三种碰撞。注释点明 #11/#12/#13 故意不在集合里（它们正是本批要占的未确认坐标）。

**8. `a98a572` fix(test): 默认开的发现机制漏掉一种写法 —— 一个真开关一直不在台账里**
「挑刺挑到了这个门槛自己身上」。两条发现正则都锚 `!== '0'`，而 identity-neutralize.js:83 是 `String(env.WINDSURFAPI_NEUTRALIZE_CLIENT_ID || '1') === '0'`（提前 return 写法）——`WINDSURFAPI_NEUTRALIZE_CLIENT_ID` 一直默认开、活跃、对台账不可见，台账测试照样绿。修法不锚比较、锚 `|| '1'` 兜底本身（「默认开是 `|| '1'` 造成的，比较怎么写只是风格」）。关闭路径确已有测试（client-identity-neutralize.test.js 三处 '0' 驱动），登记 tested:true 而非 waived。

**9. `3af3f63` fix(test): 发现机制还漏 ?? 写法 —— 又挖出两个未登记的开关**
`?? '1'` 链式写法：`String(process.env.RESPONSE_CACHE_ENABLED ?? process.env.WINDSURFAPI_RESPONSE_CACHE ?? '1')`。中间版用 `[^)]*?` 会从 `env.DASHBOARD_PASSWORD || ''` 一路跑到同行后面的 `'1'`，**把凭证误报成默认开开关**——收紧为只允许跳过 `env.X ??` 链后误报消失。登记诚实：ENV_LIFT 关闭路径有测试（tested），RESPONSE_CACHE_ENABLED 没有 → waived 并写明「新暴露的缺口而不是新产生的」。

**10. `c374ec7` fix(test): 再补 === '0' 形式 —— 又挖出 5 个未登记开关**
第三类写法：无 '1' 字面量，只在显式 `=== '0'` 时关。新正则锚关闭比较本身（「默认开」的本质是「只有显式的关值才改变行为」）。挖出 5 个：CASCADE_COMPACT_CLAUDE_SYSTEM（waived）、CASCADE_REUSE_HASH_SYSTEM（waived，只影响缓存键粒度）、WINDSURFAPI_LS_PER_PROXY_USER（tested）、WINDSURFAPI_NLU_RECOVERY（tested）、WINDSURFAPI_VARIANT_FALLBACK_ON_RATE_LIMIT（tested）。另：`DEVIN_CONNECT_RETRY_ON_EMPTY` 读进局部变量再比四种关值，任何正则都抓不到（要数据流分析）→ 引入 `HAND_REGISTERED` 显式豁免集 + 新测试断言豁免项仍在 src/ 被引用（手工登记不 outlive 代码）。诚实立场写进注释：「正则覆盖常见写法，台账仍是真源」。

**11. `b5c2e90` fix(secret-scan): 补上仓库自己的令牌格式**
扫描器一直漏 `devin-session-token$`：旧规则 `literal-credential-assignment` 的字符类 `[A-Za-z0-9_./+=-]` 没有 `$`，裸 JWT 能抓、仓库实际传递的 `devin-session-token$<JWT>` 抓不到。修复前实测：含真实格式的假文件扫干净 exit 0。新增 4 条**结构**规则（jwt-literal：三段 base64url + 头解码为 `{"`，0 误报可测量；session-token-literal：混合大小写+数字熵启发；firebase-refresh-token：固定前缀 AMf-；account-credential-pair：email----password 批量导入格式）。明确拒绝按字段名匹配（试过，误报 12 个合法 fixture）。

**12. `9c9912f` docs: 补 35 个只存在于源码里的环境开关（第一批 5 个）**
新建 docs/ENV-SWITCHES.md。基线：README 表 + .env.example 合计 47 个，源码里还有 35 个只存在于源码的开关待补。纪律写进头部：「每个默认值都是**逐个打开源码站点读出来的**，不是按名字推断。文档写错默认值比没文档更坏」。第一批 5 个：隔离防线类（CASCADE_REUSE_ALLOW_SHARED_API_KEY、DEVIN_CONNECT_ALLOW_REMOTE_CRED_STORE）+ think-leak 防线（WINDSURFAPI_CASCADE_THINK_REROUTE / WINDSURFAPI_REASONING_DEDUP，默认开、关掉泄漏思维链）+ 身份中和。

**13. `ddc4b26` docs: 第二批 native tool bridge 组 9 个**

**14. `8ab098a` docs: 第三批 5 个默认开的功能开关**

**15. `aabba74` docs: 第四批 trace / dump / 运维 8 个**

**16. `0f21c21` docs: 第五批 —— 模型与工具行为微调 8 个，35/35 收齐**
5+9+5+8+8 = 35，宣称「至此 35 个全部收录」。这批含 FORCE_TOOL_DIALECT（白名单正则，写错值被忽略而不报错）、WEAK_MODEL_TOOL_LIMIT 等。**「35/35」是对「手工发现清单」的完成度，不是对「全部存在」的证明——4 小时后被推翻（见链 3）。**

**17. `bf4dcfd` docs: 补最后一个漏掉的开关 PROTO_TRACE_STRINGS，86/86 收齐**
「86/86」是交接文档的旧口径（86 个开关全部有文档）。实测后来证明：数这个数的 grep 只认 `env.FOO`，漏掉的一半恰好就是没文档的（自我印证）。

**18. `f2283a7` fix(devin-connect): 注释里写成了字面 NUL 字节**
devin-connect.js:759 想说明 userJwt 缓存键用 NUL 分隔，写进去的是**真 0x00** 而非 `\0` 转义文本。功能零影响（实际代码用的是 '\0' 转义，对的），坏的是工具链：rg/grep 判文件为二进制，**该文件上所有搜索静默失效**。作者因此得出过一串错误结论（「contextWindow 不存在了」「buildCompletionConfig 找不到了」「零命中」）——实际 buildCompletionConfig 一直在 :1107。教训：「搜不到不等于不存在，工具报零命中时要先确认工具本身没坏」。

**19. `4404015` fix(docs): 交接文档自己也含一个字面 NUL**
docs/HANDOFF-2026-07-27.md:287 记录「别写字面控制字符」的教训时，演示「用 `\0` 转义」写进了**真 NUL**——记录教训的文档踩同一个坑，自己也变二进制。全仓自检后只剩 deploy/windows/windsurfapi.ico（真二进制，正常）。本仓库第三次踩此坑（历史测试文件、这份文档、devin-connect.js），已升格为 .claude/state/CURRENT.md 独立条目。

**20. `3c1a173` feat(cascade): GetUserJwt 短期凭证接到 Cascade 路径（默认关）**
+397 行（含 183 行测试）。GetUserJwt RPC mint ~24min HS256 短期凭证（rsvedant/opencode-windsurf-auth 视为 chat RPC 必需）。设计：`WINDSURFAPI_USER_JWT=1` 才启用，任何失败 resolve null → chat RPC 保持原 wire 形状（改 wire 是 opt-in）；auth.js 侧 epoch 反重入守卫（apiKey 轮换/重登/删账号时 bump，防止 mint 与 logout 竞态回填过期 JWT）；循环依赖规避用 fire-and-forget dynamic import（auth.js 不能静态依赖 windsurf-api.js）。测试里藏了随机失败的雷（f91d54b/62dec04 同日拆掉，见链）。

**21. `741b469` test(docs): 补 src→文档 方向的开关覆盖守卫，反方向一直是盲区**
逻辑级。旧守卫只做「散文提到 → 必须在 .env.example」，src→docs 方向注释里承认盲区（「需要 parser，正则会有几百个误报」）。代价：交接文档记的「86 个开关，86 个全有文档」**两半都错**——真实 156 个，47 个在四份文档里都搜不到，**含上一轮新增的全部 5 个 wire 坐标开关**（#13 prompt 缓存、#12/#11 tool_choice、signature tag、user_jwt）——恰恰是最需要写清「tag 号来自声明顺序而非抓包、默认关是刻意的」那一批。「几百个误报」对无锚点扫描成立，对「限定三前缀 + 只匹配本仓库实际用的四种读取形式 + 先剥注释」不成立。五个探针实测四种读取形式全抓得到、前缀碰撞（_TRACE 不被 _TRACE_DIR 冒充）不误报、纯注释提及不误报。守卫自检断言 read_.size > 100（扫描器坏了测试才红）。

**22. `d12eea3` fix(auth): 注释说 degraded serve 默认关 —— ea1332e 早就把它翻成默认开了**
src/auth.js pickDegradedFallback 注释写「Default OFF（degradedServeEnabled）」，实际 ea1332e（07-12，本片之外）早已 `def:true` 默认开（故意破 429 锁死循环）。修：注释改「Default ON since ea1332e」+ 退出方式 `WINDSURFAPI_DEGRADED_SERVE=0`。这类「注释与行为脱节」在排查 429 死锁时是第一个要确认的事实——注释是错的会引错方向。

**23. `20f0643` test(registry): 台账第四个盲点 —— 表驱动的默认开开关一个都没被发现**
逻辑级。runtime-config.js 表驱动声明 `{ env: 'WINDSURFAPI_BREAKER', kind: 'bool', def: true }`：名字是**字符串**、默认值是布尔 true，前四个发现模式（都要求字面 `env.NAME` 紧邻 '0'/'1'）全匹配不到 → 六个默认开开关带绿灯上线：BREAKER（关掉=坏账号永不摘除）、DEGRADED_SERVE、QUOTA_COOLDOWN、SPEND_ON_DEMAND（真实花钱）、LAST_ACCOUNT_EXEMPT、NEW_ACCOUNT_BASELINE。新模式要求 kind:'bool'，def:3 数值旋钮不误判。**顺带修 hasOffPathTest 反向误判**：表驱动开关的关闭路径测试走运行时字段名（setBreakerTunables({degradedServe:false})）而非 env 名——只搜 env 名会把已覆盖判成未覆盖，「我照着这个错误结论写了一个完整的重复测试文件才发现 degraded serve 的关闭路径 devin-connect-breaker.test.js 早就测了」（已删）。别名映射从表里读 + 断言解析 ≥20 条（映射变空是往「安全」方向的静默失效，不会让任何测试变红）。

**24. `4ada929` docs: 47 个开关一份文档都没进，含上一轮全部 5 个 wire 坐标**
「35/35」「86/86」作废。ENV-SWITCHES 头部改为「覆盖 73 个，剩下 83 个只存在于源码里」，并把**正确数法写进文档**（python 脚本：剥注释 + 四/五种读取形式 + 三前缀过滤 + 边界正则防前缀碰撞），注明「数开关别用裸 `grep 'env\.'`」的两个坑（前缀碰撞重复计数；positiveIntEnv/表驱动等真读取点不像 env.FOO）。+130 行表格。

**25. `08861f7` Merge PR #249（warelik）LEAK_TRACE**
新增 src/leak-trace.js（43 行）+ 250 行测试 + .env.example 14 行，改 chat.js/messages.js/devin-connect-openai.js。**带进来一个新的开关读取形式**：`export const LEAK_TRACE_ENV = 'WINDSURFAPI_LEAK_TRACE'; env[LEAK_TRACE_ENV]`——常量间接引用，11 分钟后被守卫盲点发现（1fbefd0）。

**26. `ed1ac35` Merge PR #252（wjurkowlaniec）swe-1-7 tool dialect**
tool-emulation.js +226（含 kimi preamble 抑制与 SWE 工具调用支持、wire fixture 文件）、runtime-config.js 1 行（toolReinforcement 默认值换掉）、windsurf.js 10 行（conflictsWithKimiPreamble + 条件拼强化段）、+96/57 测试。**合并后 10 分钟被证实两处改动互相抵消（见链 1）。**

**27. `0523910` fix(prompt): #252 的两处改动互相抵消 —— 还原全局默认值，让方言隔离真正生效**
还原 toolReinforcement 默认值（带回 `<tool_call>` 格式示例）+ 新测试钉住前置条件：**「the assertion #252 needed and did not have」**——默认值必须含 marker + 用真实默认值跑端到端（Kimi preamble 下抑制真正生效）。突变验证双保险：重新施加泛化默认值 → 变红；短路抑制调用 → 变红。#252 自己的 137 个测试还原后仍全过（要修的 SWE 问题照旧被修，「只是走它设计的那条路径」）。

**28. `1fbefd0` test(docs): 守卫第五个盲点 —— 常量间接引用，PR #249 一进来就漏掉了**
匹配声明处 `const X = 'FOO'` 保持静态扫描（名字仍是 src/ 里的字面量，只隔一跳）；限定三前缀，`const SOME_MODE = 'STREAMING_CHUNKED'` 不误报。关键句：「它本身文档写全了，于是守卫绿着、统计却少算一个——正是这道守卫要防的失效，从它不看的那扇门进来的」。156 → 157。

**29. `f91d54b` fix(test): user_jwt 那条断言有 4.3% 概率随机失败 —— 扫裸字节不是判定字段存在**
buildMetadata 断言扫裸 `0xaa`（field 21 wire tag = 21<<3|2 = 170）判字段存在。但 Metadata 有随机字段，其值的**任意一字节**都可能是 0xaa——tag 只在字段边界上才是 tag，2000 次实测 4.3% 假失败。改 `getAllFields(parseFields(buf), 21)`。落实既有规则「断言字段缺席，绝不比字节」。

**30. `62dec04` fix(test): 同一条测试里还有第二个随机失败 —— 比长度和比字节是同一个坑**
`without.length === plain.length` 在随机字段下 3.3% 失败（实测长度在 73/74/75 间跳）。改成断言字段编号集合相等。两处合计 ~7.5%——「合并后的全量恰好掀到，第一反应是『合并破坏了什么』，错的」（59ff863）。

**31. `2e3daeb` docs: 开关数 156 -> 157，补第五种读取形式**
ENV-SWITCHES 头部脚本加 `const X = 'FOO'` 模式；注明第五种形式是 #249 带进来的，「守卫绿着，统计却少算一个」；「这份清单的数字**不要手抄**，跑上面的脚本」。

**32. `309bd70` docs(release): 补 v3.9.21 的发布说明 —— 21 个版本里唯一缺的一份**
16 条外部审计清单、作者自陈「没有验证过任何一条」：11 修 / 3 判「真实但不值得修」并写理由 / 2 已覆盖；其中 4 条报告把成因说错（按修正后成因记录）。最重一条不是报告说的「扩展成更长的命令」而是**语义反转**。

**33. `59ff863` docs(ledger): 第十六轮 —— 审计工具与被审对象共享同一个盲点**
三个发现（计数与守卫同正则、反面错误+重复测试文件、合并 PR 两个新变体）+ 一条测试两个随机失败 + 五个探针判据 + 未扫面表更新。**它引用的 hash（93b38f9/c445c9d/d367a50/0d2f1dc）是 rewrite 前的旧套，当前仓库对应 4ada929/20f0643/741b469/d12eea3**（同内容不同 hash、非祖先关系）——审计文档自身的引用也会过时，与它自己写的「轮次名和行号一样会过时」互相印证。

**34. `1a95e11` test(dashboard): account-text-parser 440 行零测试 —— 而它决定什么算凭证**
4 个 src/ 文件从未在 test/ 出现，唯一真缺口：440 行纯字符串解析、无网络无副作用、dashboard 账号导入路径直达，且**决定什么算凭证**（devin-session-token$/auth1_/Firebase refresh JWT 各走不同下游），还有两个静默 catch{}（误解析表现为「导入什么都没发生」而非报错）。204 行测试，fixture 全 ws-fixture 前缀、刻意不带 sk- 形状（防 secret-scan 误报）。

**35. `d8a2bff` docs: 192 个文件只有一个入口 —— 补 docs/ 的用户索引和 CHANGELOG**
新建 CHANGELOG.md（129 行，明确「这是索引不是权威」，从 docs/releases/ 机械提取）+ docs/README.md 用户索引。数字：172 份发布说明、192 个文件只有一个入口。

**36. `ab70fa1` docs(readme): 补 Gemini / Responses 示例、故障分流图，中英两版对齐**

**37. `6202c34` fix(test): 剥注释的正则会吃掉真代码 —— 两个开关对守卫隐形，其中一个是凭证开关**
逻辑级，本轮最重。d367a50（即 741b469）的 stripComments 用 `/\/\*[\s\S]*?\*\//g`，在本仓库**不成立**：src/ 有两个文件的**正则字面量里含 `*/`**（如 `/\*\//`），`*/` 比 `/*` 多（identity-neutralize.js 9:7）。惰性匹配在正则内部的 `*/` 处收尾、从那之后全部错配、删真代码。实测代价：`WINDSURFAPI_NEUTRALIZE_CC_AGGRESSIVE` 和 `DEVIN_CONNECT_CRED_KEY`（**凭证**开关）对守卫和统计双双隐形，**两者一直是绿的**；census 同 bug 是 ENV-SWITCHES 声称覆盖 83、表格实际 81 的原因。改逐行状态机（单行自闭合直接删、跨行按深度逐行推进，一行里的 `*/` 无法再吞文件）。同 commit 还新增死锚点守卫：仓库内 #anchor 必须指向真实标题（GitHub 上死锚点**静默失效**——页面正常加载只是不滚动，既有断链守卫只管文件存在管不到锚点）。这个守卫自己也踩两个坑：初版只匹配 markdown `[](#x)`，而导航条是 `<p align>` 里的原生 `<a href="#x">`——「它对催生自己的那个 bug 完全失明，重新植入双连字符锚点后仍报绿。**一个开不了火的守卫和一个通过了的守卫看起来一样。**」；slug() 初版先 trim 把 emoji 标题算错，对着 github-slugger（GitHub 自己用的实现）逐例核对 17/17 一致（`🚀 Just want to run it` → `-just-want-to-run-it` **带前导连字符**）。还纠正了作者自己的误判：曾把 `#claude-code--cline--cursor-怎么用` 的双连字符「修」成单的，github-slugger 证明双连字符才对，已改回。

**38. `7585aaa` docs(env): 三个开关一份文档都没进，数字 157 -> 158**
6202c34 修好剥注释后立刻挖出 3 个未登记（含 WINDSURFAPI_TRACE_DIR——此前只作为 TRACE 说明的一部分出现，没有自己的条目）。文档头部脚本同步逐行剥注释版（带 9:7 的警告注释），157 → 158。

**39. `07e928e` docs: 四份文档补视觉引导 —— 文档地图、版本演进、上报与贡献分流**
CHANGELOG/CONTRIBUTING/SECURITY/docs-README 加 mermaid 图（版本演进）、文档地图、分流说明。

**40. `5c21e43` docs(github): issue 模板两个死链 + 一份声明"暂无测试套件"的 PR 模板**
重做 issue 模板（bug.yml/config.yml/feature.yml/model-availability.yml +221 行）+ PR 模板。**注意 diff 方向：是修正而非引入**——旧模板写着「没跑自动测试（项目暂无测试套件）」，新模板改为「项目有完整测试套件（当前 3900+ 断言）」，贴实际命令（npm run test:release 权威口径、Node 24 必需、Node 22 挂死一条 deadline 测试连带取消约 80 个）。checklist 加 6 条：零 npm 运行时依赖、贴测试输出、断言行为而非 grep 源码文本、**新开关默认关+台账登记**、四文档同步（守卫逐个查）、**commit 无 AI 署名尾注**。

**41. `121fb9b` fix(test): issue 模板守卫同步 —— 修 CI 红**
5c21e43 重写 model-availability.yml 时 labels 用了 `["model-availability", "needs-triage"]`，与 issue-template-governance.test.js 守卫期望（`upstream`）不符 → CI 红，次日修。改回 labels + 守卫扩展：连 `.github/ISSUE_TEMPLATE/*.yml` 一起扫（GitHub 要求 config.yml 用**绝对链接**，相对路径检查看不见它；issue 表单 YAML 的 `url: https://…#anchor` 是裸 URL，不在两种链接语法里，新增第三种匹配）；指回本仓库的绝对 URL 也校验锚点（HTTP 200 证明不了什么——页面加载了但就是不滚动）。

**42. `681bbc0` docs(readme): 加 logo 与徽章组，英文版补故障分流章节和四条 FAQ**

**43. `9e8080a` feat(models): 同步 gpt-5.6-luna 与 Claude 5 全系，补 swe 图片明确报错（#244）**
+462 行（含 195 行专项测试）。models.js +84：Claude 5 全系 25 个（fable/sonnet/opus 5 各五档 effort + opus-5 fast 五档，credit 从官方 modelCostData 表），gpt-5.6 系；devin-catalog-snapshot.json +64。测试双解析层：Cascade 静态目录 + DEVIN_CONNECT selector 解析器——**问题背景**：`gpt5.6-luna`/`claude5` 紧写形式之前 resolve NOWHERE（models.js 别名表对 connect 路径不可见，chat.js 把原始请求名直接传给 resolveConnectSelector），全部 400 model_not_found。**swe 图片报错**：SWE 家族上游从不声明视觉（cognition swe-1-7 发布文零 vision 提及 + 网关实测 swe 与 claude 走相同 wire 字节、图片发出去被上游静默忽略）→ 现在显式 400 model_no_vision（放在 ACP 改道之前，CLI 路径也会撞同一堵墙）。

---

## 二、问题链清单

### 链 1：`#252` 两处互相抵消（`ed1ac35` 合并 → `0523910` 发现并修）

**完整链条**：
1. 分支作者在 #252 里做两件事：① windsurf.js 加 `conflictsWithKimiPreamble()`——检测条件为「toolPreamble 含 `<|tool_calls_section_begin|>` **且** reinforcement 含 `<tool_call>`」，命中则跳过 XML 强化段；② runtime-config.js 把 `toolReinforcement` 默认值换成不含 `<tool_call>` 的泛化句。
2. ①的触发条件依赖的 marker 被②删掉 → 抑制逻辑永久 no-op。合并后实测：默认配置下 `conflictsWithKimiPreamble` 永不触发。
3. 实际生效的机制变成「把冲突文本从全局默认值里删干净」——而 toolReinforcement 在 windsurf.js 是**无条件**拼给所有带工具 Cascade 请求的，没有方言分流 → 所有非 Kimi 方言一起失去 `<tool_call>` 格式示范，效果与 PR 意图相反。
4. `0523910`（合并 10 分钟后）还原默认值 + 补「#252 需要却没有的断言」：默认值必须含 marker（resetSystemPrompt 后用真实默认值断言）+ 真实默认值端到端（Kimi preamble 下 XML 强化段被抑制、preamble 本身存活）。突变验证：泛化默认值 → 红；抑制短路 → 红。

**为什么合并时守卫没抓到**（三层，对应三种工具）：
- **文档覆盖守卫（docs-consistency-guard）职责面不覆盖**：它只查「开关读写 ↔ 文档」的静态一致性，不验证行为语义。互相抵消是运行时行为缺陷，不在任何静态守卫的检测域内。
- **测试用了注入 fixture，出厂默认值不在断言里**：cascade-native-bridge.test.js 用 `setSystemPrompts` 注入含 `<tool_call>` 的文本验证抑制逻辑——证明「抑制**能**工作」不证明「**会被**触发」。默认值不带 marker 时抑制静默变 no-op，那条测试照样绿。这是「开不了火的守卫和通过了的守卫看起来一样」的又一实例。
- **PR 内部一致性无审查维度**：两处改动各自自洽、互相矛盾，需要端到端实测（真实默认值走完整链路）才能发现。审查（合并）时无此检查。
- 佐证：合并 14:14 → 修复 14:24，作者合并后立即实测发现（commit 写「实测」）——发现者不是守卫、不是测试，是合并后的行为测量。

### 链 2：守卫盲点五连（`a98a572` 三连漏 → `741b469` 方向 → `20f0643` 表驱动 → `1fbefd0` 常量间接 → `6202c34` 剥注释）

每段完整链（时间正序）：

**2a. `a98a572`（04:36）→ `3af3f63`（04:45）→ `c374ec7`（08:26）—— 默认开台账发现机制三连漏**
- 锚 `!== '0'` 漏 `String(env.X || '1') === '0'` 提前 return 写法 → WINDSURFAPI_NEUTRALIZE_CLIENT_ID 默认开、活跃、台账不可见、台账还绿。
- 补 `|| '1'` 后又漏 `?? '1'` 链式 → RESPONSE_CACHE_ENABLED、WINDSURFAPI_ENV_LIFT。中间版正则把 DASHBOARD_PASSWORD（凭证）误报成开关——**「松到能抓它的正则就是那条误报凭证的」**，收紧后误报消失、真的仍在。
- 补 `=== '0'`（无 '1' 字面量类）又挖出 5 个。DEVIN_CONNECT_RETRY_ON_EMPTY 需数据流分析 → 承认正则天花板，HAND_REGISTERED + 引用断言。
- 每修一次都挖出更多未登记——暴露过程本身就是守卫质量不足的证据。三个 commit 的规律：发现机制的表达语言（正则）跟不上代码的写法演进，每次只补「已知漏掉的那一种」。

**2b. `741b469`（13:52）—— 方向盲点**
- 旧守卫只做「散文提到 → 必须在 .env.example」（docs→env 方向），src→docs 方向注释里承认盲区（怕几百个误报）。反方向四年（实际按仓库历史）无人补。
- 后果量化：交接文档「86 个全有文档」两半都错——真实 156，47 个无文档，含全部 5 个 wire 坐标开关。
- 自我印证机制：计数用的裸 grep `'env\.'` 恰好漏掉的就是没文档的那 70 个（positiveIntEnv/表驱动写法）——「数字和覆盖率出自同一个正则，所以『数一遍确认』这个动作本身没有独立性」。

**2c. `20f0643`（13:53）—— 表驱动盲点（台账第四次）**
- `{env:'FOO', kind:'bool', def:true}`：名字是字符串、默认是布尔——四个要求字面 `env.NAME` 紧邻 '0'/'1' 的模式全漏，6 个默认开带绿灯上线（BREAKER 关=坏账号永不摘除、SPEND_ON_DEMAND 花钱）。
- 连带坑：hasOffPathTest 按 env 名搜，表驱动开关的关闭路径测试走字段名 → 反向误判「未覆盖」，照此写了一个完整重复测试文件才发现早已覆盖（已删）。别名映射从表里读，不手写。

**2d. `1fbefd0`（14:24）—— 常量间接引用（守卫第五盲点）**
- #249 14:13 合入，11 分钟后发现：`const LEAK_TRACE_ENV = 'WINDSURFAPI_LEAK_TRACE'; env[LEAK_TRACE_ENV]`——读取点写常量名，四种锚定 `env[字面量]` 的模式全看不见。
- 它文档写全了 → 守卫绿着、统计少算一个 → 「正是这道守卫要防的失效，从它不看的那扇门进来的」。156→157。
- 修法保持静态：匹配声明处 `const X = 'FOO'`（名字仍是 src/ 里的字面量，只隔一跳）。

**2e. `6202c34`（21:10）—— 剥注释正则吃代码**
- `/\/\*[\s\S]*?\*\//g` 在含 `*/` 正则字面量的文件上错配（identity-neutralize.js 9:7），删真代码。
- 后果：两个开关（含凭证开关 DEVIN_CONNECT_CRED_KEY）对守卫隐形**且报绿**；census 同 bug：文档声称 83 实际 81。
- 这是「审计工具本身坏掉」——不是漏看，是工具在删掉证据后看。改逐行状态机。
- 五连的共性：**每个盲点都是「守卫的检测语言 ≠ 代码的实际表达」**；每个修复都附带「先写会变红的探针」纪律（探针：已知坏样本 → 守卫必须红；近似合法样本 → 必须绿）。

### 链 3：「35/35」「86/86 收齐」被推翻（`0f21c21` → `bf4dcfd` → `4ada929`）

1. `0f21c21`（10:02）：五批 35 个待补开关全部收录，「35/35 收齐」——对**手工发现清单**的完成度。
2. `bf4dcfd`（10:16）：补 PROTO_TRACE_STRINGS，「86/86 收齐」——对**grep 能看见的口径**的完成度。
3. `741b469`（13:52）+ `4ada929`（13:53）：新守卫实测真实 156 个，47 个无文档——「两半都错：真实 156 个，47 个在四份文档里都搜不到，包括上一轮全部 5 个 wire 坐标开关。**恰恰是最需要写清『tag 号来自 .proto 声明顺序而非抓包，所以默认关是刻意的』那一批，而这段说明当时只存在于源码注释里。**」
4. 数字修正链继续：4ada929（真实 156）→ 2e3daeb（156→157，#249 常量间接）→ 7585aaa（157→158，剥注释修复挖出 3 个）。
- 根因：两个「收齐」数字都只对自己的方法成立——35 靠手工走查，86 靠裸 grep。数字与覆盖率出自同一正则，「数一遍确认」没有独立性。
- 收敛条件：直到「数法」先收敛（文档头部脚本 + 守卫探针），「数字」才停止变动。

### 链 4：ENV-SWITCHES 五批补开关（`9c9912f`→`ddc4b26`→`8ab098a`→`aabba74`→`0f21c21`→`bf4dcfd`→`7585aaa`→`2e3daeb`）

为什么补了这么多批、每批挖出什么：
- **分批不是偷懒，是纪律**：「每个默认值都是**逐个打开源码站点读出来的**，不是按名字推断」——一批对应一次主题走查：批一 5 个隔离/think-leak 防线、批二 9 个 native tool bridge 组、批三 5 个默认开功能开关、批四 8 个 trace/dump/运维、批五 8 个模型与工具行为微调、+1 个 PROTO_TRACE_STRINGS。每批都标了取值位置（`handlers/tool-emulation.js`、`proto-trace.js:814` 等），可核对。
- **五批全补完仍错**：手工走查的「35 个」只是「已知的 35 个」，而「已知」依赖 grep 能力——grep 漏掉 47 个（含 wire 坐标），于是 4ada929 一次 +130 行、数字 35→83 待补。
- **补完后数字还在动**：2e3daeb（157，新读取形式）、7585aaa（158，剥注释修复挖出 3 个）——每次审计工具能力升级，都挖出新开关。链 3/链 4 合起来的教训：**补文档是结果不是手段，手段是让「数法」可证明。**

### 链 5：CI 红修复（`5c21e43` 模板重做 → `121fb9b` 守卫同步）

1. `5c21e43`（08-10 22:25）重做 issue 模板四件套 + PR 模板修正（详见条目 40）。model-availability.yml labels 写成 `["model-availability","needs-triage"]`。
2. 守卫（issue-template-governance.test.js）期望 `upstream` → CI 红，**次日**（08-11 15:08）才修——文档装饰 commit 自己没跑守卫。
3. `121fb9b` 修两层：① labels 改回守卫期望；② 守卫扩展覆盖边界——之前只扫 markdown，不扫 `.github/ISSUE_TEMPLATE/*.yml`（config.yml 必须用绝对链接 → 相对路径检查看不见；表单 YAML 的裸 URL 锚点不在 markdown 两种链接语法里）。指回本仓库的绝对 URL 也校验锚点。
- 链的教训：守卫的覆盖边界随被审对象变——重做模板改变了被审文件集（多了 yml），守卫没跟上；CI 红是唯一哨兵，且它只在推送时响（22:25 的 commit 到次日 15:08 才被发现）。

### 链 6：NUL 字节两次（`f2283a7` → `4404015`）

1. `f2283a7`（10:39）：devin-connect.js:759 注释 `${token}<NUL>${host}` 写入真 0x00 → rg/grep 判该文件为二进制 → **该文件上所有搜索静默失效** → 作者据此得出「contextWindow 不存在了」「buildCompletionConfig 找不到了」等一串错误结论（实际一直在 :1107）。
2. `4404015`（10:41，2 分钟后）：docs/HANDOFF-2026-07-27.md:287 记录「别写字面控制字符」教训、演示「用 `\0` 转义」时写进**真 NUL**——记录教训的文档踩同一个坑。「一份专门用来被搜的交接文档，反而搜不到。」
3. 全仓自检后只剩 .ico（真二进制）。本仓库第三次踩（历史测试文件、这份文档、devin-connect.js），已升格独立条目。
- 链的教训：**工具失效的表现是「零命中」**——零命中看起来像「代码不存在」，先验证工具再下结论（与本轮 f2283a7 的结论一致：「搜不到不等于不存在」）。

### 链 7：审计工具与被审对象共享盲点（`59ff863` 主题，8-09~8-11 具体表现）

详见第三节。

---

## 三、「审计工具与被审对象共享同一个盲点」在 8-09~8-11 的具体表现

`59ff863` 第十六轮的标题即结论。本片 43 条里，这个主题有 8 个具体实例：

1. **计数与守卫共用一条正则（741b469/4ada929/59ff863）**：「86 个开关 86 个全有文档」的**计数**和**覆盖率守卫**出自同一条裸 `grep 'env\.'`——绿灯只说明它们彼此一致，不说明与代码一致。原守卫注释里承认反方向是盲区（怕几百个误报），限定三前缀 + 本仓库实际读取形式 + 先剥注释后实测零误报。
2. **台账测试与台账共享表达盲点（a98a572 三连漏 + 20f0643 表驱动）**：同一个「发现正则跟不上写法」的盲点四次出现；a98a572 的 commit 自述「挑刺挑到了这个门槛自己身上」——审计者的工具与被审对象（默认开开关清单）都依赖同一种表达假设。
3. **census 脚本与守卫共享同一个 bug（6202c34）**：剥注释正则吃代码，一处修复同时救了两处——ENV-SWITCHES.md「声称覆盖 83、表格实际只有 81」与守卫漏掉含凭证开关在内的两个开关。**被审文档的数字和被审工具的守卫坏在同一行正则上。**
4. **secret-scan 与凭证格式共享盲点（b5c2e90）**：扫描器不认识 `devin-session-token$` 的 `$`（修复前实测：含真实格式的文件扫干净 exit 0）；同一天 6202c34 又发现凭证开关 DEVIN_CONNECT_CRED_KEY 对守卫隐形——审计工具在「凭证」主题上同时存在漏检（扫描器）与隐形（守卫）两个盲点，而这两个盲点分别由两个不同的审计 commit 在 12 小时内挖出。
5. **被审对象触发审计工具（f3e0094）**：方向相反但同一主题——自己写的 web search 夹具 `sk-` 前缀触发自己的 secret 扫描器误报。审计者既是扫的人也是被扫的对象。
6. **守卫对催生自己的 bug 失明（6202c34 内部）**：死锚点守卫初版只匹配 markdown `[](#x)`，对导航条的原生 `<a href="#x">` 完全看不见——「重新植入双连字符锚点后仍报绿。**一个开不了火的守卫和一个通过了的守卫看起来一样。**」守卫的动机是某个 bug，但初版看不到那个 bug 的形态。
7. **审计者的判断本身可错（6202c34 内部）**：作者把 `#claude-code--cline--cursor-怎么用` 的双连字符「修」成单的（自认是修 bug），github-slugger 证明双连字符才是对的——审计者的修正被外部权威推翻。slug() 初版先 trim 也是同类（把 4 个正确锚点误报为死链）。
8. **审计文档自身的引用会过时（59ff863 自身）**：第十六轮引用的 hash（93b38f9/c445c9d/d367a50/0d2f1dc）是 rewrite 前的旧套，当前仓库对应 4ada929/20f0643/741b469/d12eea3（同内容、不同 hash、非祖先关系）。审计文档记录工具、工具本身被 rewrite——与它自己写的话「轮次名和行号一样会过时，判据是『最后一个命中』而不是轮次号」互相印证。

另有一个「共享盲点」的正面实例（同一个盲点、工具侧被修复）：59ff863 记录 hasOffPathTest 反向误判——审计者按 env 名搜索得出「degraded serve 无关闭路径测试」的错误结论并写了整个重复测试文件，而字段名映射（从表里读）修复了它。**「扫描说某样东西不存在时，先问它可能在另一个名字下面。」**

---

## 四、自伤事件清单（v2 修订版，13 条）

1. **`0523910`**：**#252 两处改动互相抵消**——抑制逻辑靠 `<tool_call>` marker 触发，同一 PR 删掉 marker。合入时守卫（职责面不覆盖行为）、测试（注入 fixture 而非真实默认值）、审查（无 PR 内部一致性维度）三层都没抓到；合并后 10 分钟靠实测发现。修复补「#252 需要却没有的断言」+ 突变验证。
2. **`1fbefd0`**：守卫第五盲点——常量间接引用，PR #249 合入 11 分钟即漏。它文档写全了所以守卫绿着统计少算一个。
3. **`6202c34`**：守卫自己坏掉还报绿——剥注释正则吃掉真代码，两个开关（含凭证开关）隐形；census 同 bug 让文档声称 83 实际 81。同 commit 的锚点守卫初版对催生自己的 bug 失明（「开不了火的守卫与通过了的守卫看起来一样」），slug() 初版误报 4 个正确锚点，作者还曾把正确的双连字符「修」成错误。
4. **`59ff863`**：审计台账第十六轮——引用的 hash 是 rewrite 前旧套；「审计工具与被审对象共享同一个盲点」的自我暴露。
5. **`f91d54b` + `62dec04`**：自己写的测试两个随机失败（4.3% + 3.3% ≈ 合计 7.5%），合并后全量恰好掀到，第一反应「合并破坏了什么」是错的。无效突变（writeMessageField 空 buffer）先 SURVIVED，换真突变才红（`015d730` 配套）。
6. **`a98a572` → `3af3f63` → `c374ec7`**：默认开发现机制三连漏写法，每修一次挖出更多（累计 8 个未登记）；中间版正则还把凭证 DASHBOARD_PASSWORD 误报成开关。
7. **`d12eea3`**：注释说反——ea1332e（07-12）早已把 degraded serve 翻成默认开，注释一直写默认关。注释与行为脱节，排查 429 死锁时引错方向。
8. **`f2283a7` + `4404015`**：NUL 字节两次——先 devin-connect.js 注释含真 NUL 让 rg/grep 静默失效（还带出一串错误结论），随后记录教训的 HANDOFF 文档自己含同样的 NUL。本仓库第三次踩。
9. **`bf4dcfd` / `0f21c21`**：「86/86 收齐」「35/35 收齐」随后被 4ada929 一次补 47 个推翻——两个数字都是自我印证口径。
10. **`121fb9b`**：前一日 5c21e43 的 issue 模板重做把自己 CI 弄红（labels 与守卫期望不符 + 守卫不扫 yml），次日修复。
11. **`f3e0094`**：自己写的 web search 夹具 `sk-` 前缀假 key 触发自己的 secret 扫描器误报。
12. **`5c21e43`（v1 误读纠正）**：PR 模板**修正**了「项目暂无测试套件」的过时声明（改为 3900+ 断言 + 权威口径命令）——v1 把 diff 方向看反，记为「引入矛盾声明」。实际是清理矛盾。
13. **`20f0643`（v2 新增）**：审计者按 env 名搜索得出「degraded serve 无关闭路径测试」的错误结论，写了一个完整的重复测试文件，才发现早已覆盖（已删）——「一个实体两个合法名字，搜一个然后从沉默里下结论」。

---

## 五、关联 issue / PR

- **#244**（模型同步）：`9e8080a`（subject 带 #244 + test/issue-244-model-sync.test.js 195 行）。问题链：`gpt5.6-luna`/`claude5` 紧写形式 resolve NOWHERE → 400 model_not_found（models.js 别名表对 connect 路径不可见）；swe 图片被上游静默忽略 → 显式 400 model_no_vision。
- **#249**（LEAK_TRACE）：`08861f7`（merge，warelik）；`1fbefd0`（守卫盲点正文点名「PR #249 一进来就漏掉了」）；`2e3daeb`（开关数 156→157，第五种读取形式）。
- **#252**（swe dialect）：`ed1ac35`（merge，wjurkowlaniec）；`0523910`（互相抵消修复）。方向性与 `1308ff4` 的 kimi trim 相反。
- **#11 / #12 / #13**（devin-connect 透传坐标）：`9adae25`（#11/#12）、`8c75d38`（#13）、`d007317`（REQUEEST_OCCUPIED_TAGS 注释点名 #11/#12/#13）、`015d730`（#13 突变修正）。三个坐标均为「未确认的声明顺序」→ 统一默认关。
- **#239 / #240 / #236**：59ff863 未扫面表更新（billing tag 需付费校准、#240 预算耦合按潜伏守卫处理）。

## 六、背景事实核对（相对 v1 的更新）

- 8-10 合并 PR #249/#252：在片，`08861f7`（14:13）、`ed1ac35`（14:14）。
- 合并后修补：14:24 批量 5 条恰对应「合并后 5 个修补」——`0523910`（#252 互相抵消）、`1fbefd0`+`2e3daeb`（#249 守卫盲点）、`f91d54b`+`62dec04`（3c1a173 引入的随机失败）。59ff863（14:48）的「合并 PR 抓到的两个发现」即 (a) #252 互相抵消、(b) #249 常量间接引用。
- 8-10~8-11 文档装饰轮：全部在片（CHANGELOG `d8a2bff`、docs 索引、README 对齐 `ab70fa1`/`681bbc0`、issue 模板 `5c21e43`/`121fb9b`、发布说明 `309bd70`、视觉引导 `07e928e`、ENV-SWITCHES 五批）。
- 8-11 模型同步 #244：在片，`9e8080a`。
- 片外相关：`ea1332e`（07-12，degraded serve 默认开）、`d367a50`/`c445c9d`/`93b38f9`/`0d2f1dc`（= `741b469`/`20f0643`/`4ada929`/`d12eea3` 的 rewrite 前旧 hash）。

## 七、v1 纠错清单

1. **`5c21e43`（v1 自伤 #12，误读）**：v1 写「PR 模板里声明『暂无测试套件』——与仓库实际 300+ 测试矛盾」。实际 diff 方向相反：旧模板才有「项目暂无测试套件」，`5c21e43` 是**修正**它为「项目有完整测试套件（当前 3900+ 断言）」并给出权威口径命令（npm run test:release）。v2 归为「清理矛盾」而非「引入矛盾」。
2. **`59ff863` 引用的 hash**：v1 未发现。v2 核实：93b38f9/c445c9d/d367a50/0d2f1dc 与 4ada929/20f0643/741b469/d12eea3 同 subject、同时间戳、同父子结构，但非祖先关系——AUDIT-LEDGER 第十六轮记录的是 rewrite 前的旧 hash。
3. **v1 聚类计数**：v1 把 `5c21e43` 归入「文档补课」并记「PR 模板声明与事实矛盾」；v2 纠正后该条同时是「文档补课」与「自伤清理」。其余聚类边界与 v1 一致（PR 合并 2 / 功能模型 5 / 重构清理 1 / 文档补课 16 / 测试守卫 5 / 修复 14）。
4. **随机失败合计概率**：v1 记「4.3% 概率随机失败」单条；v2 补充 62dec04 的 3.3% 与合计 ~7.5%（59ff863 口径「约 7%」）。
