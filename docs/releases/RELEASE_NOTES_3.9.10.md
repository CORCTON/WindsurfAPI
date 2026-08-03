# v3.9.10

两条用户可感知的修复,都是本轮用**真实账号**跑出来的。

门禁 **3285 pass / 0 fail**(v3.9.9 = 3264,新增 21)。每条修复都做了突变验证。

---

## 订阅取消对账号池不可见

一个订阅已取消的账号会**静默吞掉所有 chat 请求**,而 Dashboard 显示它 `active`、
`错误 0`、宣传 163 个模型。

实测这个账号身上三个 RPC 三种结果:

```
目录 RPC        200 → 167 个 selector   (不检查 entitlement,照常返回)
GetUserStatus   403 → "Your subscription has been canceled. Resubscribe to continue."
GetChatMessage  CAPACITY ×2 → UPSTREAM_INTERNAL "an internal error occurred"
```

chat 的失败被归类成 `UPSTREAM_INTERNAL`,**刻意不记在账号头上** —— 一次上游抖动不该把
整池打下线,那条规则本身是对的。但结果是:唯一知道真实原因的 RPC 把它写进
`credits.lastError`,然后没有任何东西读它。账号永远不会被降级,会被反复选中、反复失败。

处置机制本来就有:`looksLikeBanSignal` 匹配这条消息,`reportBanSignal` 要求 30 分钟内
两次命中才禁用。**缺的只是一条线** —— 没有新状态、没有新正则、没有新阈值。

安全性由既有阈值保证:`refreshAllCredits` 15 分钟一轮,真的取消订阅会在相邻两轮命中
两次;部署期的瞬时错误不匹配正则(实测 `an internal error occurred` / `CAPACITY` /
`DEADLINE_EXCEEDED` 全部 false),压根到不了上报。

**恢复路径**:重新订阅后,Dashboard 的"重置"按钮(`PATCH /accounts/:id {resetErrors:true}`)
把账号改回 `active`。不是永久判死。

## 降级后的响应谎报模型名(三条协议路由)

`WINDSURFAPI_STRICT_MODEL=0` 把未映射的模型降级到免费 selector —— 降级本身是 operator
显式选的。但响应把请求的**付费名**当成实际跑的模型报回去,这不是。

实测:请求 `claude-opus-4.9` 返回 200,`model` 字段写着 `claude-opus-4.9`(非流式 body
与每个流式 chunk 都是),`system_fingerprint` 也由那个名字派生,而上游实际跑的是
`swe-1-6-slow`。计费归属错,信任回显名的客户端被静默误导。这是 #234 验收标准点名的一条。

**三条协议路由全部修了。** `/v1/messages` 和 `/v1/gemini` 对 `displayModel` 的引用数原本
都是 0,各自回显客户端请求名 —— 只修 `/v1/chat/completions` 就发,正是本仓库的标志性
失效模式。

- 非流式:`result.model` 优先于请求名
- 流式:translator 在上游结果之前构造,所以从**第一个 chunk** 学真名(OpenAI 每个 chunk
  都带 `model`,而 `message_start` 是懒发的,来得及)

映射成功的别名**仍然回显请求名**:`claude-sonnet-4.6` → `claude-sonnet-4-6-thinking` 是
同一个模型的规范 selector,不是降级,OpenAI 自己也回显请求的别名。

### 一个反直觉的点

交接文档 §3.6 写的是"报实际跑的 selector"。**照做会把一个谎言换成另一个** ——
`selector` 在 AssignModel router 跳转之前就被捕获,而 router 名解析为 `mapped:false`,
所以一个实际跑了 `claude-opus-4-8-medium` 的 `adaptive` 请求会被报成免费的
`swe-1-6-slow`。两种写法都复现过才选定 `connectParams.model`。

---

## 工程

突变验证抓出 **5 条我自己的盲点**:

1. **router 分支压根到不了** —— hop 的条件是 `connectParams.token` 存在,而那只在取到
   账号时才赋值。为此加了 `assignModel` 注入 seam(`assignModel` 做真实 unaryCall,没有
   seam 就只能靠付费账号才能测到 hop 后状态)
2. messages 流式没测 —— 去掉"从第一个 chunk 采纳"整段,零测试失败
3. gemini 流式没测 —— 同上
4. gemini **非流式**没测 —— 流式与非流式在不同位置构造 `modelVersion`,只驱动一条的
   测试看不见另一条的回归
5. **一处注释说得比事实强** —— messages 的 `!messageStarted` 条件其实**不承重**
   (`startMessage()` 自己就有 early-return,且 `this.model` 在该类只被读一次)。承重的
   等价物在 gemini.js,那里每一帧都重读名字。注释已改成如实描述

---

## 未修

- `connect-dimension-guard` / `handler-route-parity-guard` 两条守卫覆盖缺口
- sticky 线:thundering-herd(8 个并发请求散射到 8 个账号,零亲和)、
  double-flag wedge、RPM 清绑定等
- #236 GLM 工具调用停滞:判据仍太模糊,等真实复现
- 逐请求 billing 的 `credit_cost` / `committed_acu_cost` tag 号需付费 token 校准(#239)
