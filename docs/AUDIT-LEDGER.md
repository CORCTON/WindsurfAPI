# 审计台账 / Audit Ledger

哪些子系统被**实际探测过**、结论是什么、以及在哪里被守卫住。

写这份台账的动机:2026-07 那一轮把鉴权面探了 30+ 次、协议层 fuzz 了 190+ 次,
**零缺陷** —— 因为它们早被审过多轮。这种"扫过且是干净的"结论本身就是资产:
没有记录,下一个人(或下一个我)会把同样的时间再烧一遍。

台账只记 **exhaustive 扫描过的老代码**。新代码的缺陷走 commit / release notes。

---

## 图例

| 状态 | 含义 |
|---|---|
| ✅ CLEAN | 实际探测过,未发现缺陷。列出探测方式,便于复核或加码 |
| 🛡 GUARDED | 关键不变式已有测试守卫,且**做过突变验证**(注入退化确认守卫会失败) |
| ⚠️ FINDINGS | 发现过缺陷,已修;列出 commit |
| ⬜ UNAUDITED | 尚未 exhaustive 扫描 |

「突变验证」是这份台账的信任基础:一条从未失败过的测试等于没有测试。下表标注
🛡 的都做过 —— 把历史缺陷或退化重新注入源码,确认守卫以具体条数失败。

---

## 协议层 (2026-07-27)

| 模块 | 行数 | 状态 | 依据 |
|---|---|---|---|
| `src/proto.js` | 178 | ✅🛡 | 18 类畸形输入 fuzz 全部可控抛出、无慢路径 |
| `src/connect.js` | 170 | ✅🛡 | 帧层 10 类畸形输入;gzip 炸弹(80MB→7ms 抛错,RSS 受控) |
| `src/proto-trace.js` | 907 | ✅ | 2000 层深度炸弹 1ms 内被深度上限截住,零栈溢出 |
| `src/windsurf.js` | 1540 | ✅ | 170 次畸形帧调用(见下),零栈溢出、零非受控抛出 |
| `src/cascade-native-bridge.js` | 1525 | ✅ | 同上;另核实 30+ 处 `parseFields` 消费者**无一自递归** |
| `src/grpc.js` | 457 | ✅ | trailer 解码已有测试;HTTP/2 会话池按 port 复用、error/close 即摘除 |

**探测方式**:对每个模块的每个导出函数喂 5 类恶意载荷(1500 层嵌套炸弹、8KB
随机字节、全 0、全 0xFF、空 buffer),共 170 次调用,断言无栈溢出、无非 `Error`
抛出、RSS 受控(67MB)。

**关键设计发现(值得保留的知识)**:

- `parseFields` 是**扁平**的 —— 嵌套消息以 `subarray` 交回调用方,由调用方决定是否
  下钻。这是深度炸弹打不穿协议层的根本原因:递归深度由调用方的业务逻辑决定,而
  那些消费者经核实无一自递归。**任何把 `parseFields` 改成自动递归的重构都会引入
  栈溢出面。**
- `decodeVarint` 走双路径:≤28 位用整数快路(覆盖全部字段 tag 和多数小整数),
  超出转 BigInt。这不是优化洁癖 —— `>>>` 会把 >2^31 的值静默截断成 uint32,
  request_id / 时间戳 / 计费计数器都会算错。
- 未知/废弃 wire type(3/4/6/7)**拒绝而非跳过**。跳过会让解析器失步,后续所有
  字段错位 —— 比直接失败危险得多。
- `connect.js` 的 gzip 上限加在**解压后**(`maxOutputLength`),不只是线长。通过
  16MB 线长检查的高压缩比帧仍可膨胀到 GB 级;没有这层,低内存主机上 OOM-killer
  会在 throw 被 catch 之前先杀进程(audit CONN-1)。

**守卫**:`test/proto-codec-hardening.test.js`(20 条)。突变验证 4 种退化:
移除 len-delim 越界检查(抓 2)、未知 wire type 改静默跳过(抓 1)、移除 varint
64 位溢出守卫(抓 1)、负数走 int32 截断(抓 2)。
`test/connect.test.js` 已覆盖帧层炸弹(8 条,先前既有)。

---

## 鉴权与暴露面 (2026-07-27)

| 面 | 状态 | 依据 |
|---|---|---|
| 运维端点鉴权 | ✅ | 无凭据 / 用 chat API key 冒充 dashboard 密码 → 全 401 |
| 路径归一化 | ✅🛡 | 前缀混淆、`../`、`%2e%2e`、`//`、大小写、`/v1/v1/` 重写链 → 全 401 |
| 静态文件穿越 | ✅🛡 | locale 白名单;`../../.env`、`%2e%2e%2f`、`....//` → 401/400 |
| SSRF | ✅ | `169.254.169.254` / `127.0.0.1:22` / 私网段 / `metadata.google.internal` → 全 `ERR_PROXY_PRIVATE_IP` |
| 暴力破解 | ✅ | 5–8 次后 429;**伪造 XFF 无法绕过桶**;锁定期内正确密码同样被挡 |
| 请求体 / 畸形 JSON | ✅ | 12MB → 413(`data` 事件即时中断);2000 层嵌套 → 400;截断 JSON → 400 |
| 密钥泄漏 | ✅ | 6 端点 + 日志文件对上游 token / dashboard 密码 / API key **零命中** |

共 30+ 次绕过尝试,全部被拦。

**关键设计发现**:

- **SSRF 防护是"先解析再判定"**:`metadata.google.internal` 的 `latencyMs=4` 说明
  真做了 DNS 解析,再按解析出的私网 IP 拒绝 —— 不是字符串黑名单。所以
  **DNS rebinding 也挡得住**。改成字符串匹配会静默退化。
- **`safeEqualString` 连长度泄漏都堵了**:先 sha256 再 `timingSafeEqual`,两边永远
  等长;`verifyPassword` 的明文路径在长度不等时还刻意烧等量周期。
- 路由层用 `===` 精确匹配 + `path` **从不 URL 解码**。这是路径穿越打不进来的原因:
  `%2e%2e` 保持字面,匹配不上任何精确路由。**任何"顺手"加归一化/解码的重构都会
  打开经典双解码绕过。**
- `/dashboard/api/` 前缀**带尾斜杠**。少了它,`/dashboard/apiaccounts` 会被
  `slice` 成伪 subpath。

**守卫**:`test/router-path-security.test.js`(11 条,突变验证 4 种绕过:加 URL
解码抓 2、前缀去尾斜杠抓 1、`===` 放宽成 `startsWith` 抓 1、locale 白名单放宽抓 1)。
另有既有的 10 个安全测试文件(`dashboard-auth-fail-closed` / `-hardening` /
`brute-force` / `lockout-map-bound` / `server-auth` / `auth-safe-equal-hash` /
`dashboard-proxy-validate` / `caller-key-xff-spoof` / `xff-client-ip-consistency` /
`local-windsurf-security`)。

**审计缺口的教训**:上述既有 10 个套件全部直接 `import handleDashboardApi` ——
它们证明了**鉴权逻辑**正确,却从未走过 `server.js` 里决定"哪个 URL 进哪个 handler"
的**路由层**。这类"测了逻辑、没测装配"的缺口值得主动找。

---

## 图片 / 二进制解码 (2026-07-27)

| 模块 | 状态 | 依据 |
|---|---|---|
| `src/vendor/png.js` | ✅ | 13 类畸形 PNG 全部可控抛出(签名、截断 chunk、尺寸/像素上限、inflate 上限) |
| `src/vendor/jpeg-js/decoder.js` | ✅ | 16 类畸形 JPEG 全部可控抛出;0×0 退化图被 `shrinkPixels` 正确拦下 |
| `src/image.js` 入口链 | ✅ | 200 张畸形图 6ms,无 DoS |

---

## 未 exhaustive 扫描 ⬜

按当前架构下的实际风险排序。注意 `tool-emulation` 与协议层大文件主要服务
**Cascade 路径**,而生产默认走 `DEVIN_CONNECT` —— 投入产出比低于新代码审计。

| 模块 | 行数 | 备注 |
|---|---|---|
| `src/handlers/tool-emulation.js` | 1784 | 工具方言/提示注入面 |
| `src/langserver.js` | 1721 | LS 进程生命周期、内存护栏 |
| `src/conversation-pool.js` | 768 | 跨租户复用边界(与 sticky 有交互) |
| `src/models.js` | 697 | 目录合并/别名解析 |
| `src/auth.js` 其余部分 | ~3000 | `getApiKey` 已审;凭据加密、持久化竞态未审 |

---

## 方法论笔记

这轮最有价值的规律:**被审过的地方是硬的,没审过的地方才有货。**

- 鉴权面 30+ 次探测、协议层 190+ 次 fuzz → **零缺陷**(都被审过多轮)
- 同期新写的 response store,一用真实 agent 循环压测 → **立刻出真 bug**

推论:审计预算应优先投向**新代码**和**从未被真实客户端走过的路径**,而不是继续
扫老代码。老代码的价值在于把它的不变式**守卫住**(上表 🛡),而不是反复重扫。

第二条:**用真实客户端跑真实任务**比读代码有效。response store 的
tool_calls 重复缺陷靠单元测试发现不了 —— 它只在一个真实 agent 多轮工具循环里
出现,且症状是一个与"账号已死"无法区分的不透明 503。
