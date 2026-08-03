# v3.9.11

清 `HANDOFF-2026-08-03.md` 剩下的守卫与 sticky 积压。**三项里只有两项是真缺陷** ——
第三项是设计张力,记下来而不是改掉。

门禁 **3302 pass / 0 fail**(v3.9.10 = 3285,新增 17)。

---

## `stickyNoFallback` 会把 caller 永久楔死

这个 flag 的语义是"不要换号" —— 拒绝本身是它的用途,换号会重写整个按账号隔离的 prompt
cache。但那个拒绝**不可恢复**:`getApiKey` 返回 `null` 却把绑定留在原地,于是后续每次
请求都重新解析同一个死绑定、再次拒绝,永远。

实测(修复前):绑定一个 caller、把绑定账号 disable,连续四次取号全部返回 `null` 且绑定
仍在。

**交接文档低估了暴露面。** 它记的是"需两个实验 flag 全开":

```
无 flag                      → 自愈
仅 stickyNoFallback          → 楔住     ← 一个就够
仅 stickyBindByUserOnly      → 自愈
两个都开                      → 楔住
```

一个文档化的 flag 就够,而 `stickyBindByUserOnly` 与楔子无关。

修法区分两种不可用:

- **结构性**(不在池里了、或非 `active`):绑定永远无法再解析,清掉并落到常规选择
- **瞬时**(冷却、RPM、维护):拒绝是对的,caller 应重试,绑定仍有意义,保留

两半都钉了测试 —— 只修第一半会把这个 flag 变成 no-op,每次冷却都换号,正是它要防止的
缓存重写。突变验证两个方向都被抓,包括"过度修复"那个。

## 路由错误分类的守卫可被绕过

`handler-route-parity-guard` 检查的是**源码形状**:`connectErrorToHttp` 被调用,且绑定名
在函数体里出现 >1 次。任何第二次提及都能满足。

实测:把 messages.js 的接线改回读扁平 `err.type`(pre-v3.8.0 缺陷),同时留一个被
`console.log` 读到的死绑定 —— 那个守卫仍然 **10/10 全绿**。

新增行为断言,驱动真实路径(流式 translator 的 `error()`,处理流中途的 error chunk)。
同一突变下:行为测试 6 条失败,源码守卫 10 条全绿。

期望值从 shipped helper 现算而不写死表 —— 那里是两层映射链
(`connectErrorToHttp` → `toAnthropicError`,`CAPACITY → 503 → 529`),写死会变成重新
编码今天的数字,两层一起坏掉也照样过。

源码守卫保留不删:它还钉着"新增协议前端不得逃过清单",那是另一条真实性质。

---

## 不是缺陷:首轮并发散射

交接文档 §3.10-1 把它列为待修缺陷。现象复现了(8 次同 caller 取号落到 8 个不同账号、
0 sticky hit),但**散射是明确的设计意图**:

```
// Pick the account with the fewest in-flight requests first (so a burst
// of concurrent calls spreads across accounts ... — see issue #37).
```

把首轮绑到一个账号会直接违反 #37,并把并发突发串行到单账号的 RPM 上限。而代理分不出
"一个会话的 8 个并行工具调用"(想要一个账号,付 1 次缓存写而不是 8 次)和"8 个独立
会话"(想要 8 个账号)。

**两侧此前都没记过这个张力** —— sticky 模块头完全没提并发。所以交付是:两侧互相引用地
写下张力与实测数字,加测试钉住当前选择,让未来改动任何一侧都是自觉的(有失败测试要更新)
而不是静默漂移。同时钉住无争议的那一半:绑定存在后,连续轮次必须回到同一账号。

---

## 工程:这一轮我自己踩的三个坑

都写进了对应 commit,因为形态会复发:

1. **`import(...?query)` 拿 sticky 模块创建了独立实例**,而 auth.js 用它自己的静态导入
   —— 统计不涨、我写的绑定 `getApiKey` 读不到。是我加的"守卫的守卫"(misses 必须 >0)
   把它暴露的,否则那条测试会在两个互不相干的 map 上空转
2. **`setExperimental('key', true)` 是 no-op** —— 它收补丁对象。所以四种 flag 组合的
   复现结果看起来完全一样,我差点据此否掉整条缺陷
3. **散射断言原本归因于 issue #37**,但移除那个比较器后测试仍全绿 —— 成因在候选**过滤**
   (RPM 预留让刚服务过的账号对下一次不合格),我没隔离出来。已把断言消息改成钉结果而
   不是机制,并写明"失败不该读成 #37 回归了"

---

## 未修

- `connect-dimension-guard`:只检查 `finalizeConnectAccount` 的词法切片,把冷却写到别处
  可逃(经对抗复核判定为"台账已 publish 的已知限制",非新发现)
- sticky 线:RPM 满即清绑定(彻底修需 queue-on-pin)、`clearCallerBindings` 无生产调用点
- response store 按租户配额(经对抗复核判定为**有文档有测试的既定策略**,不是缺陷)
- #236 GLM 工具调用停滞:判据仍太模糊,等真实复现
- 逐请求 billing 的 `credit_cost` / `committed_acu_cost` tag 号需付费 token 校准(#239)
