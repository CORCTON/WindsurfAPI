# v3.9.9

v3.9.8 发出去之后继续清 [HANDOFF-2026-08-03.md](../HANDOFF-2026-08-03.md) 的积压。
三条真实缺陷修复 + 两条守卫补缺 + 一条门禁偶发失败。

门禁 **3264 pass / 0 fail**(v3.9.8 = 3246,新增 18 条)。每条修复都做了突变验证 ——
把缺陷重新引入一次,确认断言真的会失败,而不是只看绿灯。

---

## 用户可感知

### 已删除账号的模型仍然被宣传

`applyCloudModels` 会为静态表不认识的 UID 往模块级 `MODELS` 表注入 key,而**没有任何
东西移除它们**。实测:注入一个只有该账号有的 UID,`removeAccount` 之后池 `total=0`,
而那个 key 仍在 `MODELS` 里、`listModels` 仍然列它。客户端看到一个宣传中的模型,选了
它,然后在 chat 拿到错误 —— 池里已经没有任何账号能跑它。

修法:标记快照派生的 key,账号目录被丢弃后驱逐所有"没有任何存活账号还能到达"的那些。
静态表的模型永不参与驱逐。

**两条自查**,形态值得记住:

第一版按"**谁注入的**"记账,错的。`applyCloudModels` 会跳过已存在的 key,所以只有第一个
报告该 UID 的账号有注入记录 —— 于是移除第一个账号时正确保留(第二个还能到达),但移除
第二个(**最后的真实持有者**)时什么都不驱逐,照样泄漏。实测确认了这个失败,然后改成
全局集合 + 反查"还有账号的目录包含这个 UID 吗"。正确的问题不是"谁注入的"而是"还有谁能
到达"。

调用顺序也与第一版相反:必须**先丢目录、再驱逐**;先驱逐会永远看到该账号自己的 UID 仍然
可达。而这条顺序**只在直接调用 `forgetCloudModelCatalog` 时承重** —— 经由 `removeAccount`
的路径上 `invalidateModelCatalogForAccount` 已经先丢了目录,顺序无关。突变验证发现这条
没有任何断言钉住,补了一条直接调用的测试。

### connect 的每个 selector 互相驱逐,sticky 亲和实际为零

一个 caller 的全部 connect 会话共享单槽 `caller\0*`:connect 路径按 `modelKey=null`
取号,所以绑定也必须按 null 写,而 `bindingKey` 只有 `(caller, modelKey)` 两维。在按
entitlement 分区的池上,一个 caller 在免费可达与付费 selector 之间交替,**每次请求都清掉
并重建那一个槽** —— 得到的是零亲和,正是 sticky 绑定要避免的缓存重写成本(上游 prompt
cache 按账号隔离,写入约为读取 10 倍单价)。

v3.9.7 把模块头那条错误的注释("模型维度防止跨模型冲突")改对了,但行为未修。

修法:`bindingKey` 加第三维,`caller\0(modelKey||*)\0(selector||*)`。**不是**把 selector
塞进 modelKey —— 那两个是不同命名空间,合并会让 Cascade 路径(真 modelKey、selector=null)
与 connect 路径(modelKey=null、真 selector)撞进同槽。`getApiKey` 一直就收着
`connectSelector`,只是绑定键忽略了它,所以两侧现在一致,没有新增参数传递链。

实测:一个 caller 的 `swe-1-6-slow` 与 `claude-opus-4-8-medium` 两个绑定同时存在且各自
解析正确;Cascade 的 opus 绑定不受影响。

**新引入的 API 陷阱**(已用测试钉住):2 参数查询 `getStickyBinding(caller, null)` 读的是
`caller\0*\0*`,与 connect 写入的槽不同。生产能解析是因为 `getApiKey` 传了 selector;
直接调用者必须自己传。

---

## 工程

### 转义 helper 有守卫,208 个调用点没有

`dashboard-escape-behaviour` 证明 `esc()` / `escJsAttr()` 能中和所有越界字符,但对"渲染
账号 label 的那个模板到底有没有调它"一无所知 —— 拆掉某个 sink 的 `esc()`,两个既有守卫
仍然全绿。208 个转义调用点对 1005 个插值,"helper 是对的"比它看起来的结论弱得多。

新守卫按字段限定,不做 1005 个插值的全量检查:大多数插值渲染的是数字、i18n key 或内部
常量,全量规则会变成噪音然后被压制而不是被修。

**审计结论:当前没有任何用户数据字段有未转义的 innerHTML sink。** 唯一一处可疑的(probe
汇总插值 `x.email`)走 `toast()`,而 toast 赋的是 `textContent` —— 安全靠的是上下文而不是
转义。所以这条守卫钉的是一个当前成立的性质,职责是在性质失效时叫出来。

自查两条:第一版字段表里的 `labelHash` 在整个 dashboard 里**根本不存在**(凭印象写的),
守卫的守卫当场抓到 —— 这就是它存在的理由;守卫的守卫计数时 `break` 在第一个匹配字段上,
而 `keyPrefix` 与 `apiKey_masked` 共享同一个表达式,于是 keyPrefix 永远记不到、看起来
没被覆盖。**一个表达式可以同时命中多个维度,计数时不要 break。**

### 门禁偶发失败:70ms 对 120ms TTL 只有 50ms 余量

`sticky-session.test.js` 的 TTL 滑动窗口断言在满套件 CPU 负载下会超时:发版门禁里约
**3 次失败 1 次**,单独跑却 3/3 通过 —— 典型的"单独跑绿、门禁红"。

这条测试要证的性质是"窗口内的查询会把 `lastAccess` 往前推,所以总耗时可以超过 TTL 而
单个间隔不超过",需要的只是 `gap < TTL < 2*gap`,绝对数值无关。`getStickyBinding` 内联读
`Date.now()`,没有可注入的时钟,所以修法是加余量:400ms 间隔对 600ms TTL,要 200ms 的
超时才会破。突变验证确认加余量没有削弱它 —— 去掉 `lastAccess` 的滑动仍然被抓。

门禁连跑 3 次:3264 / 0 / EXIT=0。

> 数字更正(2026-08-03 复核):本文原写「v3.9.8 是 3254,新增 10 条」。3254 是我工作分支
> 上已经加了 models-injection 测试之后的读数,不是 v3.9.8 tag 的数字。在 tag 上重测是
> 3246,所以真实增量是 18 条。

### 一次没能复现,不等于缺陷不存在

第一次复现 MODELS 泄漏得到 `delta +0`,看起来像"没这个缺陷"。真实原因是**单条目快照触发
了缩水确认守卫被隔离**,`applyCloudModels` 压根没执行。归因之后才拿到真实证据。

测试里的 `staticUids` 也刻意在模块加载时固定,不能实时读 `MODELS` —— 否则会把别的账号刚
注入的 phantom 算成本账号合法持有,这个错误让一条**正确实现**下的测试失败过。

### 模块加载期的 const

`sticky-session.js` 把 `STICKY_SESSION_ENABLED` 读进模块加载期的 `const`,env 必须在
import 之前设好。新测试第一版用静态 import + `beforeEach` 设 env,7 条全失败,而失败原因
与断言要测的东西毫无关系。改用既有的 `loadFresh` 每测新导入模式。

---

## 明确未修

- **`WINDSURFAPI_STRICT_MODEL=0` 仍然静默把付费请求改写成 `swe-1-6-slow`,响应里的 `model`
  字段是客户端请求的那个付费名。** 但对上一份交接的描述做了一处修正:那条测试只断言
  "opt-out 不得 400"(这正是 opt-out 的正当用途),**没有**断言响应里的 model 字段 ——
  所以那个谎言是没有断言覆盖的,不是被固化成契约的,修它不需要跟测试打架
- `connect-dimension-guard` 只检查 `finalizeConnectAccount` 那一段源码,把冷却写到别处可逃
- `handler-route-parity-guard` 的"绑定名被读到"可被一行 debug log 满足
- sticky 线余 6 条(见 HANDOFF §3.10)
- #236 GLM 工具调用停滞:判据仍太模糊,等真实复现
- 逐请求 billing 的 `credit_cost` / `committed_acu_cost` tag 号需付费 token 校准,已在
  #239 请社区协助
