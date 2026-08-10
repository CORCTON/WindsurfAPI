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

## 待补

余下 16 个（trace / dump 一组、单模型行为微调一组）分批补齐。
