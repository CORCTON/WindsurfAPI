# 环境变量参考（补 .env.example 未收录的部分）

README 的表格列常用变量，[.env.example](../.env.example) 是完整清单 —— 两者合计覆盖
47 个。本文补齐**剩下 35 个只存在于源码里**的开关：注释很全，但运营翻不到。

每个默认值都是**逐个打开源码站点读出来的**，不是按名字推断。文档写错默认值比没文档更坏，
所以标了取值位置，可自行核对。

通用约定：这些开关**只认精确的 `'1'` 或 `'0'`**，不认 `true` / `yes` / `on`。这是刻意的——
历史上 `Number()` / 真值重写把开关静默翻转过（#241、#242）。

## 会放宽隔离的（优先了解）

| 变量 | 默认 | 说明 |
|---|---|---|
| `CASCADE_REUSE_ALLOW_SHARED_API_KEY` | 关 | 允许**多个调用方共享同一个上游账号**时复用 Cascade 会话（`handlers/chat.js`，`=== '1'`）。上游会保留会话状态，所以开启后不同调用方有可能看到彼此的上下文。默认关是刻意的隔离边界，**多租户场景不要开**。 |
| `DEVIN_CONNECT_ALLOW_REMOTE_CRED_STORE` | 关 | 允许**非本机**请求写凭证库（`dashboard/api.js`，`=== '1'`）。还要求对端是 loopback —— 校验的是 peer 地址而不只是监听地址，因为反向代理后面监听地址永远是本机。 |

## think-leak 防线与身份中和（#250）

前两个默认**开**，关掉会让思维链泄漏到内容通道 —— 客户端看到重复文本或裸 `<think>` 标记。
第三个默认关，且当前不改变输出。

| 变量 | 默认 | 说明 |
|---|---|---|
| `WINDSURFAPI_CASCADE_THINK_REROUTE` | **开** | Cascade 路径把带 think 标记的开头内容改道到 reasoning 通道（`handlers/chat.js`，`\|\| '1') !== '0'`）。设 `0` 关闭。 |
| `WINDSURFAPI_REASONING_DEDUP` | **开** | 抑制 reasoning 与 content 逐字重复的那一份。 |
| `WINDSURFAPI_NEUTRALIZE_CC_AGGRESSIVE` | 关 | 强制走 Claude Code 的激进中和分支（`handlers/identity-neutralize.js`，`\|\| '') === '1'`）。检测到 CC 客户端时该分支本来就会走，这个变量只是手动强制。**目前该分支是保留状态** —— 源码注释写明「no CC-only rewrites are confirmed yet」，所以开它当前不改变输出。 |

## native tool bridge

这一组只在排查 native tool call 链路时才用得上。全部默认关或有内置默认值。

| 变量 | 默认 | 说明 |
|---|---|---|
| `WINDSURFAPI_FORCE_GPT_NATIVE_DIALECT` | 关 | 对**所有**模型强制用 GPT 原生 tool call 方言，不再按模型族判断（`handlers/tool-emulation.js`，`=== '1'`）。排查方言选择时用。 |
| `WINDSURFAPI_NATIVE_BRIDGE_NO_EMUL` | 关 | 走 native bridge 时不再叠加 prompt 层的工具模拟（`=== '1'`）。用来区分「原生解码坏了」和「模拟层坏了」。 |
| `WINDSURFAPI_NATIVE_TOOL_BRIDGE_POLL_AFTER_TOOL` | 关 | 交出 tool result 后主动再轮询一次上游（`client.js`，`=== '1'`）。只在 native 模式下有意义。 |
| `WINDSURFAPI_NATIVE_TOOL_BRIDGE_WEBFETCH_AUTO_APPROVE` | 关 | 自动批准 read_url 抓取，不等确认（`client.js` 的 `isReadUrlAutoApproveAllowed`）。**光开这个不够** —— 还必须用 `..._WEBFETCH_AUTO_APPROVE_ORIGINS` 列出允许的 origin，名单为空时一律返回 false。双重门是刻意的：让模型自行发外部请求必须显式指定去哪。 |
| `WINDSURFAPI_NATIVE_TOOL_BRIDGE_READ_URL_LEGACY_SUMMARY` | 关 | read_url 结果回到旧版摘要格式（`windsurf.js`，`=== '1'`）。兼容老客户端。 |
| `WINDSURFAPI_NATIVE_TOOL_BRIDGE_CONFIG_RAW` | 空 | 直接塞一段原始 bridge 配置（`windsurf.js`，`|| ''` 后 trim）。留空则用正常构造流程。 |
| `WINDSURFAPI_NATIVE_TOOL_BRIDGE_ALLOWLIST_NAMES` | 空 | 覆盖工具白名单的名字，逗号分隔（`cascade-native-bridge.js` 的 `csvListEnv`）。留空用内置名单。 |
| `WINDSURFAPI_NATIVE_BRIDGE_STATS_KEY_LIMIT` | `200` | 统计里最多保留多少个 key（`native-bridge-stats.js`，非有限值或 ≤0 时回落 200）。 |
| `WINDSURFAPI_NATIVE_BRIDGE_DECISION_RING_SIZE` | `25` | 决策环形缓冲保留多少条（同上，回落 25）。调大能看更长的决策历史。 |

## 默认开的功能开关

这五个默认**开**，所以只能往「关」的方向调。它们都是「设 `0` 才关闭」的写法 ——
写成别的值（`false` / `off`）不生效，除 `RESPONSE_CACHE` 外都只认精确的 `'0'`。

| 变量 | 默认 | 说明 |
|---|---|---|
| `WINDSURFAPI_ENV_LIFT` | **开** | 把调用方的环境上下文提升进 prompt（`handlers/chat.js`，`?? '1'` 后 `=== '0'` 关闭）。注意这个用 `?? '1'` 而不是 `\|\| '1'`，且会 trim + 转小写。 |
| `WINDSURFAPI_LS_PER_PROXY_USER` | **开** | 每个 proxy 用户独立一个 LS 实例（`langserver.js`，`=== '0'` 关闭）。关掉会让不同用户共享 LS，省内存但失去隔离。 |
| `WINDSURFAPI_NLU_RECOVERY` | **开** | 意图抽取失败时走恢复路径（`handlers/intent-extractor.js`，`=== '0'` 时直接返回空数组）。 |
| `WINDSURFAPI_VARIANT_FALLBACK_ON_RATE_LIMIT` | **开** | 撞限流时自动回落到同族其它变体（`handlers/chat.js`，`=== '0'` 关闭）。关掉后限流直接报错给客户端。 |
| `WINDSURFAPI_RESPONSE_CACHE` | **开** | 响应缓存（`cache.js`）。链式兜底：`RESPONSE_CACHE_ENABLED ?? WINDSURFAPI_RESPONSE_CACHE ?? '1'`，所以前者优先。这个认多种关闭写法（`0`/`false`/`off`/`no`）。 |

## trace / dump / 运维

排查时才开。几个会往磁盘写内容，注意目录别落进打包或提交范围。

| 变量 | 默认 | 说明 |
|---|---|---|
| `WINDSURFAPI_TRACE` | 关 | 是否写 trace（`trace.js`，`\|\| ''` 后 `=== '1'`）。注意它**不门控** `WINDSURFAPI_TRACE_DIR` —— `traceRoot()` 无条件读目录变量，只是没开 trace 时不往里写。 |
| `WINDSURFAPI_PROTO_TRACE_DIR` | `/data/proto-trace` | proto trace 落盘目录（`\|\| '/data/proto-trace'`）。注意这是**绝对路径**默认值，和 `WINDSURFAPI_TRACE_DIR`（默认 `<cwd>/.trace`）不是一套。 |
| `WINDSURFAPI_PROTO_TRACE_ERROR_STRINGS` | 关 | 出错时额外输出字符串内容（`=== '1'`）。和 `PROTO_TRACE_STRINGS` 一样走脱敏。 |
| `WINDSURFAPI_DUMP_SYSTEM_PROMPT` | 关 | 把最终发给上游的 system prompt 打出来（`windsurf.js`，`=== '1'`）。**会输出完整 prompt 内容**，排查完记得关。 |
| `WINDSURFAPI_PROBE_CANARY` | 关 | 发探针金丝雀请求（`=== '1'`）。校准脚本用。 |
| `WINDSURFAPI_STABLE_DEVICE` | 空（= 每次随机） | 固定设备指纹种子（`\|\| ''`）。设成固定值可让请求可复现 —— 对比抓包时有用，**生产别设**，指纹固定会更容易被识别。 |
| `WINDSURFAPI_SKIP_LS_CLEANUP` | 关（= 会清理） | **名字是反的**：`!== '1'` 时执行清理，所以设 `1` 才是「跳过」（`index.js`）。自更新后残留的 LS 会占着池端口累积，默认清理。同一台机器跑多个 WindsurfAPI 时才需要设 `1`。 |
| `WINDSURFAPI_RESTART_SUPERVISED` | 关（= 自动探测） | **强制**声明自己跑在守护进程下（`restart.js`，命中时返回 `kind: 'override'`）。平时不需要设 —— systemd 自己会导出 `INVOCATION_ID`，代码据此自动识别。只在自动探测判错时用它兜底。 |

## 模型与工具行为微调

针对具体模型或具体客户端的窄开关。除末两个有数值默认外，其余默认关。

| 变量 | 默认 | 说明 |
|---|---|---|
| `WINDSURFAPI_FORCE_TOOL_DIALECT` | 空（= 按模型族判断） | 强制指定工具方言。**只接受这四个值**：`glm47` / `openai_json_xml` / `kimi_k2` / `gpt_native`（`handlers/tool-emulation.js` 的白名单正则），写别的会被忽略而不是报错。比 `FORCE_GPT_NATIVE_DIALECT` 精确。 |
| `WINDSURFAPI_DISABLE_SONNET_TOOL_REUSE` | 关 | 关掉 Sonnet 的工具复用（`=== '1'`）。怀疑复用导致串工具时用。 |
| `WINDSURFAPI_OPUS47_THINKING_UIDS` | 关 | Opus 4.7 用 thinking 专用的模型 uid（`=== '1'`）。 |
| `WINDSURFAPI_FABRICATE_REJECT` | 关 | 让上游拒绝时构造一个可读的拒绝响应而不是原样透传（`handlers/chat.js`，`=== '1'`）。 |
| `WINDSURFAPI_NEUTRALIZE_CLINE_OBJECTIVE` | 空（= 关） | 中和 Cline 客户端的 objective 段（`\|\| ''`）。 |
| `WINDSURFAPI_SHOW_DISABLED_SPECIAL_AGENT_MODELS` | 关 | 在模型列表里也显示上游标记为 disabled 的 special agent 模型（`models.js`，`=== '1'`）。默认隐藏 —— 列出来客户端也调不通。 |
| `WINDSURFAPI_WEAK_MODEL_TOOL_LIMIT` | `8` | 弱模型最多带几个工具定义（`handlers/tool-emulation.js`，非有限值或 ≤0 回落 8）。工具多了弱模型会选错。 |
| `DEVIN_CONNECT_RELOGIN_MAX_CONCURRENT` | `2` | 同时最多几个账号并发重登（`auth.js`，`>= 1` 才生效否则回落 2，且会 `Math.floor`）。调大会更快恢复但更容易撞上游限流。 |

至此 35 个全部收录。
