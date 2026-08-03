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

## v3.9.0 新代码 (2026-07-27)

台账方法论的直接验证:老代码扫了 190+ 次 fuzz 零缺陷,而同期新代码一压就出真 bug。

| 模块 | 状态 | 依据 |
|---|---|---|
| `src/response-store.js` | ⚠️🛡 | 真实 agent 循环 + 9 个对抗 agent;发现 1 blocker + 5 major,全部已修 |
| `src/handlers/responses.js` v3.9.0 改动 | ⚠️🛡 | 同上;含一个让核心功能对规范客户端全失效的 blocker |
| `src/handlers/chat.js` 可应答守卫 | ⚠️🛡 | 我第一版守卫位置错误(可绕过 + 过度拒绝),已改到共享层 |

### 2026-07-28 补扫:流终止与 finish_reason 语义

接手会话把交接文档 §3 的 1–7 全部修完。这一批的共同主题值得单独记一条:

| 面 | 状态 | 依据 |
|---|---|---|
| 连接层流终止 | ⚠️🛡 | 缺 end-of-stream 帧被当作正常抽干 → 截断回复以"完整一轮"到达四条协议路由。现抛 `STREAM_TRUNCATED`;守卫 `test/responses-stream-truncation.test.js`(12 条,突变验证 3 种) |
| `finish_reason` 词汇映射 | ⚠️🛡 | 三处独立缺陷同源:未校准枚举猜测(connect 3/5)、子串匹配(special-agent `'content'`)、缺失即良性(responses translator)。守卫见各 commit |
| 响应检索端点作用域 | ✅🛡 | `GET`/`DELETE /v1/responses/{id}` 与续接同一套作用域;外来 id 一律 404 不泄漏存在性;路由层另有真实 HTTP 测试 |

**新的规律(值得记住)**:这一批里有三个缺陷是同一个错误模式的不同外衣 ——
**把"不知道"当成"没事"**。缺失的终止帧当成正常结束、未校准的枚举值当成已知语义、
缺失的 finish_reason 当成良性完成。三处都在"信息不足"时选了乐观解释,而代价都是
把坏结果报成好结果。遇到任何"默认值/兜底"分支时值得专门问一句:这个默认是在
断言事实,还是在承认无知?

**方法论补充(与 §5.4 突变教训同类)**:修复过程中发现三条既有测试写死了错误
前提 —— `connect-usage-finish-calibration` 断言 `3 → length`(照名字顺序的猜测)、
`responses.test.js` 一条 mock 不发终止 chunk、`request-id-body` 写死站点计数 4。
前两条是**把猜测固化成契约**:一旦写进断言,后来的人会把它当既有结论而不是待验证
假设。写这类测试时应当在注释里标明"这是猜测,证据是 X",否则它会伪装成事实。

**关键教训**:这批缺陷有一半是**我修复上一批时新引入的**。详见
[HANDOFF-2026-07-27.md](HANDOFF-2026-07-27.md) §5.3–5.4 —— "修好了"和"没修坏"是两个
独立命题;以及三条突变测试的硬教训(假测试、突变覆盖不到的路径、突变本身写错)。

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

### 2026-07-30 补扫:测试自身的质量

复核唯一跑成功的那一面审的是**测试**而非代码,5 条全部经独立突变验证成立。这一节记的
不是某个缺陷,而是三类**测试反模式** —— 它们让全绿的套件失去意义:

| 反模式 | 识别方法 | 实例 |
|---|---|---|
| **源码 grep 冒充行为守卫** | 断言里只有 `assert.match(src, /.../)` 或 `src.includes(...)`,而被守的是**行为** | 破坏 header 名派生 → 6 个信号里 4 个 404,35 个测试全绿 |
| **条件断言** | `if (X) { assert A } else { assert B }` —— 只能证明恰好走到的那一支 | DELETE 端点整个失效,套件 11/11 全绿 |
| **恒真断言** | 断言的字面量在 src 里根本不存在 | `doesNotMatch(html, /pageSize=1000/)`,而实际写法是 `pageSize: '1000'` |

**源码 grep 的正当用途是守结构性不变量**(如"新增内部路由必须消费 `__synthetic_finish`"、
"每个上游错误码必须有明确的归属分支")—— 那类命题本来就无法用行为测试表达,因为要守的
代码还没被写出来。但它不能替代行为验证。

**判别标准**:问"如果这个功能完全坏掉,这条断言会失败吗?"如果答案依赖"字符串还在
文件里",它就不是守卫。

### 2026-07-30 方法论:追问同类 + 报告者必须被独立验证

**一、修掉一个误落进兜底的东西之后,必须枚举还有什么在下面。**
v3.9.2 修了 `STREAM_TRUNCATED` 落进 `finalizeConnectAccount` 的裸 `else reportError`,
但只修了那一个码。这轮枚举全部 12 个上游错误码,又找出三个(`TIMEOUT` /
`DEADLINE_EXCEEDED` / `NO_TOKEN`),各 3 次调用即把健康账号打成 `status='error'`。
**"它是误落进去的"本身就说明那个位置会接住东西 —— 所以要问接住了几个。**
已做成源码级元守卫,新码不归类即构建失败。

**二、报告者必须被独立验证,包括报告者是自己的时候。**
本轮我曾报告"#232 逐账号隔离失效"并给出实测输出 —— 是误报,漏了两轮确认机制
(首次同步基线取静态目录数,小目录需第二轮相同快照才采纳,而探测脚本只调了一次)。
推翻自己的假警比发现它花的时间更长。**实测输出摆在眼前也可能因前提错误而无效。**

---

## 2026-08-03 补扫:错误归属、目录退化、以及守卫本身(第二轮)

这一轮扫的是**上一轮修复留下的面**,以及**守卫自己**。合并前跑对抗复核(6 面 ×
攻击→独立确认),在本轮修复上找出 6 条 —— 全部是自引入的。

| 面 | 状态 | 依据 |
|---|---|---|
| 错误归属:socket 码与透传的 gRPC status | ⚠️🛡 | v3.9.6 枚举了 `classifyUpstreamError` 能产出的 12 个码,但**枚举本身有盲区**:socket 码带 `.code` 从 Node 直接过来、无字面量;`aborted`/`cancelled`/`deadline_exceeded` 经 `code: code \|\| 'UPSTREAM_ERROR'` 原样透传、也无字面量。各 3 次驱逐健康账号(seed 健康 peer 排除 `lastAccountExempt` 掩盖)。守卫加固后又揪出 7 个未分类 status,逐个定;`unauthenticated` 是真账号故障却只是恰好落进兜底、没走 re-login,已显式归类 |
| 断连 vs 上游冷却 | ⚠️🛡 | #225 的 abort 分支排在 else-if 链首,吞掉 #224 的 429 reset window(实测 3h → 0,5 次断连吸收 5 个 429 零冷却)。修法把"冷却"与"惩罚"分开:上游声明的冷却是关于账号/模型的事实,与客户端是否还在听无关。守卫 `test/connect-abort-cooldown.test.js`(13 条,3 种突变) |
| 目录快照退化响应 | ⚠️🛡 | 空/畸形响应此前零确认擦掉 last-known-good(实测 106/163 → 263/263);缩水且**内容变化**的目录永久楔住。第一版修法**本身是错的**(见下)。守卫 `test/cloud-catalog-degenerate-response.test.js`(20 条,含池级维度) |
| Dashboard 转义 | ⚠️🛡 | 178 处 `esc(` + 29 处 `escJsAttr(` 调用,而 234 个测试文件里**没有一条执行过这两个函数**。把两者改成恒等函数(等于删掉全仓 XSS 防护)后 `dashboard-syntax` 仍 12/12 全绿。改为从 HTML 抽出真身执行;同一突变下新守卫抓 11 条 |
| 干旱横幅 fail-open 状态 | ⚠️🛡 | 反转分支条件会让两个被断言的字符串**逐字不变**,于是运维在未 fail-open 时看到 fail-open 警告、真 fail-open 时看到普通文案,套件全绿。改为抽出三元表达式对两种状态各跑一次 |

### 四条源码守卫经突变验证放过了自己要抓的缺陷

这是本轮最值得记的一节:**守卫看不见的东西守不住**,而"看不见"有四种独立成因。

| 守卫 | 逃逸口 | 同一突变下 |
|---|---|---|
| `connect-dimension-guard` | `dimension.includes('selector')` 接受**反序**的 `model \|\| selector`(connect 上 `model` 恒真,正是 v3.8.0 CAPACITY 的形状);`mark...\([^)]*\)` 遇嵌套调用截断 —— **未突变源码上就已**只在检查 4 个调用点里的 3 个 | 旧守卫 9/9 全绿 |
| `connect-error-blame` | 正则只读自构造的 `code: 'UPPER'` 字面量,对 Node 透传码与小写 gRPC status 结构性盲视 | 旧守卫全绿,报 `emitted.size=12` |
| `handler-route-parity-guard` | `includes('connectErrorToHttp(')` 被一个**丢弃返回值**的死调用满足 | 旧守卫 10/10 全绿 |
| `dashboard-syntax` 的转义检查 | 只断言四个声明字符串存在 | 旧守卫 12/12 全绿 |

修法统一改成"解析一个集合、与另一个集合求差、差非空即失败";能抽出来跑的就真的跑。

**新的判别动作(比"如果功能坏掉这条断言会失败吗"更细一层)**:问"这个守卫的**词汇表**
是从哪里推导的?那个来源会不会本身就不完整?"—— 透传(`code: code || 'X'`)按构造就是
开放的,任何从源码字面量推导的词汇表都看不见它。`connect-error-blame` 的演进史是
UPPER_SNAKE → 加 socket 码 → 加透传 status → 放宽字符类含数字连字符,**每一次都以为
已经完整了。**

### 合并前对抗复核:6 条自引入缺陷

上一轮是**发版后**跑复核,于是 v3.9.2–v3.9.6 每个版本都在修上一个版本。本轮改成**合并前**
跑,同样的成本换掉了一整个补丁版本。

最该记的一条:**我修"空目录响应"的方法本身是错的。** 我把它当成"最大幅度的缩水"走同一套
确认,但后果不对称 —— 接受小的**非空**快照是过度限制(fail closed);接受**空**快照会
`applyCloudModels([])`,那会**删除**过滤器 → fail open → 正是 #231 的症状,且经池级并集
连带掏掉其他账号。实测两次连续空响应 148/163 → 163/163。**我只是把 fail-open 延迟了一个
重试间隔。** 而确认对空响应本就是错的工具:被限流的上游会连续返回空。

第二条:那个**收敛上限在解决一个已经被解掉的问题**。计数器按账号而非按候选,两个不相关
的轮次替第三个候选付账,它第一次被看到就被采纳;采纳后 auth.js 记为已同步便不再重取,
90 秒抖动永久钉住错的模型表(实测 6/163)。楔住的真正成因是"只在首轮 arm 复查",那一半
已修 —— 真实降级是**稳定的**,会自我重复并在两轮内正常确认。

### 三类此前未记录的反模式

1. **"把 bug 固化成契约"的作者最可能是几小时前的自己。** 本轮出现 4 次。判别动作:
   **修完一个缺陷后,去看有没有测试在断言那个缺陷的现象。**
2. **结构守卫必须先剥注释。** 我自己写的目录守卫第一版被自己的注释满足(正则匹配到
   注释里引用的 `applyCloudModels([])`)。
3. **注释里的论据也要验。** 我写"RETRYABLE_CODES 已把这些当可重试",实测 `isRetryable`
   对那三个 gRPC status 全是 `false` —— 论据只对 socket 码成立。**"注释不是事实"对自己
   刚写的注释同样适用。**

### 一条断言可能同时耦合两个维度

`rate-limit.test.js:120` 既断言精确毫秒、又**隐含**断言"走的是哪条分支"。注入 4.5 秒延迟
后另一条分支回答约 1622996ms,而原断言把它当成"大约 1632000"照样通过 —— **测试在走错代码
路径时仍然全绿**。它还是全套件里唯一一条对墙钟派生输出做精确相等的断言(已 grep 核对)。

### 仍未 exhaustive 扫描 ⬜(更新)

上一版那张表仍然有效。本轮新增两个已知覆盖缺口(记录,非交付缺陷):

| 面 | 缺口 |
|---|---|
| Dashboard 调用点 | 行为守卫验证了 `esc`/`escJsAttr` 两个 helper,但不验证 **207 个调用点** —— 拆掉某个 sink 的转义调用,两个守卫仍全绿 |
| 冷却维度的写入位置 | `connect-dimension-guard` 只检查 `finalizeConnectAccount` 那一段源码,把冷却写到别处可逃 |

---

## 2026-08-03 第三轮:#234 / #235 / #239 主体 + 突变验证作为默认手段

这一轮的做法变了:**每条修复都把缺陷重新引入一次**,确认断言真的会失败,而不是只看绿灯。
成本不高,收获比对抗复核更直接 —— 它查的是"我的测试有没有在测东西",而对抗复核查的是
"我的修复有没有引入新缺陷"。两者不重叠,都要做。

| 子系统 | 结论 | 守卫 |
|---|---|---|
| 干旱判定覆盖率 | 1 个账号即可宣布全池干旱(实测 1 dry + 39 refresh-failed → true) | `drought-coverage-floor.test.js`(8 条,4 突变全 CAUGHT) |
| 干旱谓词命名空间 | MODELS 空间谓词判 connect selector,两集合零重叠 | `drought-connect-namespace.test.js`(10 条,3 突变全 CAUGHT) |
| 干旱门禁可达性 | 生产默认后端上结构性不可达,从未执行 | `drought-gate-reachability.test.js`(9 条,行为+结构双层,3 突变全 CAUGHT) |
| 发现视图 | 只测存在性;只加 entitlement 过滤会打到 0 行 | `connect-discovery-rebuild.test.js`(7 条) |
| connect 目录 latch | 模块级布尔永不清除;去 latch 后 clear-then-fill 会缩集合 | `connect-catalog-delatch.test.js`(5 条) |
| credit 费率表 / 逐请求计费 | 解码器就绪、消费者零个,4 段断链 | `connect-rate-table-wiring.test.js`(12 条,6 突变全 CAUGHT) |

### 新判别动作:突变验证前必须先证明 baseline 非零

本轮连拿 **4 次**"SURVIVED —— 守卫是瞎的",全部是 harness 一个测试都没跑:

- 本机 shell 是 zsh,`node --test $TESTS` 不对未加引号的变量做词分裂,两个路径当**一个**
  参数传进去
- `read A B < <(cmd)` 进程替换配 `read` 读不到值
- `grep --include=*.js` 未加引号被 zsh 当 glob 吃掉

`pass=0 fail=0` **不是**"守卫没抓到",是"没测量"。与台账里"confirmed:0 常是没跑成"同一条,
但这次的伪装更好:它出现在一个看起来正常运行的突变循环里。**先证明 baseline 非零,再相信
任何 SURVIVED 结论。**

### 突变验证查出四条我自己写的空转测试

1. **"两个行产出器都过滤"** —— live 目录在新进程里是空的,producer 2 压根不产行,断言无论
   如何都过。去掉 producer 2 的过滤器不会让它失败
2. **"空响应不缩小并集"** —— 带空贡献者的并集在算术上本来就不变,所以即使空响应被接受这条
   也过。**断言错了后果**:真正的伤害是账号被记为已同步而无贡献,后来真的有 selector 时永不
   重取
3. **`sawTable ? free : null` 的区分没有任何断言钉住** —— 在保守回落下谓词对 null 与空集合
   的回答相同,所以那条断言钉的是没有行为后果的实现细节。改成在
   `getCurrentlyFreeConnectSelectors` 上钉(那里可见)
4. **一条恒真断言** `assert.ok(x.length >= 0)`

判别标准补一条:**问"这条断言在什么输入下会失败?"如果答不出具体输入,它就没在测东西。**
比"功能坏掉这条断言会失败吗"更早生效 —— 后者需要先想象一个缺陷,前者只需要看断言本身。

### 结构缺陷:去掉一个 latch 不够,外面还有一个

`trySyncConnectCatalog` 只能从 `fetchAndMergeModelCatalog` 里被调到,而那个函数被 **Cascade**
的 per-key 门禁挡着。一旦某账号的 Cascade 目录被记为已同步,connect 同步对它永久不可达 ——
它自己的 per-key 资格压根没被查过。

这是"只覆盖部分路径"的第五次,形态是新的:**我修的那一层之上还有一层同类门禁**。追问方式:
修完一个 latch/gate 之后,问"到达这个 latch 的路径上还有几个 latch?"

### 两条本轮自己引入的缺陷

- `forgetConnectCatalogForAccount` 用动态 `import().then()` 写入:落在调用方返回之后(删号后
  立刻读仍看得到 departed 账号的 selector),且绕过注入的 dep seam
- rescue 重试时上一次尝试的计费被算进这一次(`attempt_reset` 未清 `billing`)

### 元守卫必须按逃逸点枚举,不按 flow

ACP vision 重路由不是 `selectBackend` 的 flow,是 `devin_connect` 逃进 `special_agent`,
按 flow 枚举的守卫看不见它。`drought-gate-reachability` 因此枚举**块内门禁之上的每个
`return`**,并要求每个都登记豁免理由;带"守卫的守卫"(枚举结果为 0 即失败),因为一个
不再匹配任何真实 `return` 的枚举会永远通过。

### 仍未 exhaustive 扫描 ⬜(第三轮更新)

| 面 | 缺口 |
|---|---|
| `STRICT_MODEL=0` 的静默改写 | 仍在;且 `devin-connect-strict-model.test.js` 把该行为断言成期望行为,套件在强制执行 #234 验收标准的违反 |
| 模块级 `MODELS` 表注入 | 已采纳快照永久注入 key 且无人移除,已删除账号的模型仍被宣传 |
| 逐请求 billing tag 号 | `credit_cost` / `committed_acu_cost` 只有声明顺序推测,需付费 token 校准(已在 #239 请社区协助) |

---

## 2026-08-03 第四轮:v3.9.8 之后的三条积压 + 突变验证继续收割

| 子系统 | 结论 | 守卫 |
|---|---|---|
| MODELS 表注入 | 已删除账号的模型永久被宣传(实测 removeAccount 后 key 仍在、listModels 仍列、池 total=0) | `models-injection-eviction.test.js`(8 条,5 突变全 CAUGHT) |
| sticky 绑定维度 | connect 每个 selector 共享单槽 `caller\0*`,按 entitlement 分区的池上零亲和 | `sticky-selector-dimension.test.js`(7 条,突变 CAUGHT) |
| dashboard 转义调用点 | 208 个调用点零覆盖;审计结论:当前无未转义的 innerHTML sink | `dashboard-escape-callsites.test.js`(3 条,3 突变全 CAUGHT) |
| sticky TTL 断言 | 70ms 对 120ms TTL 仅 50ms 余量,满套件负载下 3 次红 1 次 | 加余量至 400/600,突变确认未削弱 |

### 新判别动作:先问"这条顺序/这个记账维度在哪条路径上承重"

两次踩到同一形态:

1. **注入记账维度选错**。按"谁注入的"记账,而 applyCloudModels 跳过已存在的 key,所以
   只有第一个报告该 UID 的账号有记录 —— 移除最后一个真实持有者时什么都不驱逐。正确的
   问题不是"谁注入的"而是"还有谁能到达"
2. **调用顺序只在一条路径上承重**。`forgetCloudModelCatalog` 内部的"先丢目录再驱逐"
   顺序,经由 removeAccount 时无关(上游已经丢过了),只在直接调用时承重。我的注释声称
   它承重,而突变验证显示零测试失败 —— 补了一条直接调用的测试才让它真的承重

**动作**:写下"顺序/维度很重要"的注释时,立刻问"经由哪个调用者时它才重要?"然后给那条
路径写测试。这是本轮第五、六次"我的注释声称某处承重、实际没有断言覆盖"。

### 复现失败也要归因,不能当成"缺陷不存在"

第一次复现 MODELS 泄漏得到 delta +0,看起来像"缺陷不存在"。真实原因是单条目快照触发了
缩水确认守卫被隔离,`applyCloudModels` 压根没执行。**一次没能复现的尝试,和一次证明缺陷
不存在的实验,不是同一件事。** 归因之前不要下结论 —— 我在对话里一度声称复现成功而当时
工具输出是空的,那句话没有依据。

### 守卫的守卫抓到了我凭印象写的字段名

dashboard 守卫第一版的字段表里有 `labelHash`,它在整个 dashboard 里根本不存在。没有"每个
字段必须至少匹配一个已转义 sink"这条反向断言,那个守卫会永远通过且什么都不police。

同一条守卫的计数逻辑还有个 `break`:`keyPrefix` 与 `apiKey_masked` 共享同一表达式,break
在第一个匹配上使得 keyPrefix 永远记不到。**一个表达式可以同时命中多个维度,计数时不要
break。**

### 仍未 exhaustive 扫描 ⬜(第四轮更新)

| 面 | 缺口 |
|---|---|
| `STRICT_MODEL=0` 静默改写 | 仍在。**但上一份交接对它的描述不准确**:那条测试只断言"opt-out 不得 400",没有断言响应里的 model 字段 —— 谎言是没有断言覆盖的,不是被固化成契约的,修它不需要跟测试打架 |
| `connect-dimension-guard` | 只检查 `finalizeConnectAccount` 那一段源码,把冷却写到别处可逃 |
| `handler-route-parity-guard` | "绑定名被读到"可被一行 debug log 满足 |
| sticky 线余 6 条 | thundering-herd / RPM 清绑定 / 双 flag 楔子 / clearCallerBindings 未接线 / GPT tag 校准 / response store 租户配额 |
| 逐请求 billing tag 号 | `credit_cost` / `committed_acu_cost` 需付费 token 校准(已在 #239 请社区协助) |

---

## 2026-08-04 第五轮:并发对抗 8 条积压 + v3.9.9–v3.9.11

这一轮最有价值的产出**不是修了什么,是拦住了不该做的工作**。

用 16 个 agent 并发调查上一份交接的 8 条积压(每条先复现,通过的再过一轮对抗反驳),
**4 条被反驳**:

| 项 | 反驳理由 |
|---|---|
| `clear-caller-bindings` | **抓到伪造的复现数字**,且是已登记旧账 |
| `sticky-rpm-clear` | 机制真但归因错,严重性远低于所报;一个复现基于不可达路径 |
| `response-store-tenant-quota` | 复现真实,但那是**有文档有测试的既定策略**,不是缺陷 |
| `connect-dimension-guard` | 台账已 publish 这条限制,"不是发现" |

照 8 条全做,会有 4 条在改不该改的东西。**对抗验证的价值是拦住工作,不只是找缺陷。**

### 子系统结论

| 子系统 | 结论 | 守卫 |
|---|---|---|
| 订阅取消信号 | 明确信号被丢进 `credits.lastError`,无人读;账号 100% chat 失败却显示 active/错误 0 | `subscription-cancelled-signal.test.js`(7 条,4 突变全 CAUGHT) |
| 降级后回显名 | 三条协议路由都谎报;`messages.js`/`gemini.js` 对 `displayModel` 引用数为 0 | `connect-degrade-honesty.test.js`(9 条)+ messages/gemini 各补流式与非流式 |
| 路由错误分类守卫 | 源码形状判据可被"一个被 log 读到的死绑定"满足 | `route-error-parity-behaviour.test.js`(7 条,行为断言) |
| `stickyNoFallback` | 返回 null 却不清绑定 → 永久楔死 | `sticky-no-fallback-wedge.test.js`(6 条,含"过度修复"方向) |
| 首轮并发散射 | **不是缺陷** —— issue #37 的明确意图 | `sticky-concurrency-tension.test.js`(4 条,钉当前选择) |

### 新判别动作:"经由哪个调用者才承重"

本轮两次出现"注释声称某处承重、实际零测试失败":

1. `forgetCloudModelCatalog` 内部顺序只在**直接调用**时承重,经由 `removeAccount` 时上游
   已先丢目录 → 顺序无关
2. `messages.js` 的 `!messageStarted` 条件**不承重**(`startMessage()` 自带 early-return,
   `this.model` 只被读一次)。承重的等价物在 `gemini.js`,那里每帧重读

**动作**:写下"顺序/条件很重要"时,立刻问"**经由哪个调用者时它才重要**",然后给那条路径
写测试。否则注释就是一句没有守卫的断言。

### harness 静默失效的三种新形态

除了已记的 zsh 词分裂,本轮又踩三种:

1. **`import(...?query)` 创建独立模块实例** —— 我写绑定的实例与 `auth.js` 读的不是同一个,
   统计不涨、绑定读不到。是"守卫的守卫"(misses 必须 >0)暴露的
2. **`setExperimental('key', true)` 是 no-op** —— 它收补丁对象。四种 flag 组合的复现结果
   因此完全一样,**差点据此否掉一条真缺陷**
3. **测错了路径** —— 路由测试第一版驱动"抛出错误",而真实调用点在流式 translator 的
   `error()` 里处理 error chunk。12 条全红,但红的原因与契约无关

**共同判别动作**:每个复现/突变结果都要能回答"**这个数字是怎么产生的**"。答不出就是
harness 在骗你。

### "先提交,再突变" —— 本轮违反三次

突变循环里的 `git checkout -- <file>` 会把同一文件里**尚未提交的真修复**一起还原。之后的
突变测的是"修复缺失"而不是"突变生效",而那个失败**看起来像突变被抓到**。三次都是自己踩的。

### 长任务必须后台跑

工具层反复返回**空输出**,全部出现在多分钟阻塞命令之后。改成 `nohup ... &` + 轮询标记文件
后再没出现。十项机制逐个测过都正常 —— 问题是用法,不是工具坏了。

### 交接文档的四处修正

见 `HANDOFF-2026-08-04.md` §3。最要紧两条:`stickyNoFallback` **一个 flag 就够**楔住
(记的是两个);首轮散射**不是缺陷**而是 issue #37 的明确意图。

### 仍未 exhaustive 扫描 ⬜(第五轮更新)

| 面 | 缺口 |
|---|---|
| `connect-dimension-guard` | 词法切片,冷却写别处可逃。修法参照本轮的行为断言改造 |
| RPM 满即清绑定 | 彻底修需 queue-on-pin,且与"首轮散射张力"相关 |
| `clearCallerBindings` | 事实成立,但"该由哪个事件调用"是设计决定 |
| 散射的确切成因 | 移除两个排序机制后仍散射 —— 成因在候选**过滤**,未隔离 |
| billing tag 号 | 需付费 token 校准(#239) |
| `total_tokens` 含 `cache_write` | 产品取舍,需作者拍板 |
