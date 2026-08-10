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

## 待补

余下 30 个（native bridge 一组 10 个、容量调参、开发调试）分批补齐。
