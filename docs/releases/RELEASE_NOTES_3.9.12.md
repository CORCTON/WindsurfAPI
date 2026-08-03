# v3.9.12

清 `HANDOFF-2026-08-04.md` §4.1 剩下的三条 sticky/守卫积压。**三条里只有一条是"实现一个
功能",另外两条的结论是"不该按它写的方式做"** —— 一条实测净负面已 revert,一条正确答案是
不接线。

门禁 **3342 pass / 0 fail**(v3.9.11 = 3302,新增 40:维度行为 9 + 抖动取舍 5 + queue-on-pin 26)。

---

## 新功能:queue-on-pin(默认关)

**`WINDSURFAPI_STICKY_QUEUE_ON_PIN_MS=2000`**(或面板设置页的 `stickyQueueOnPinMs`,可热调)。
需要 `STICKY_SESSION_ENABLED=1`。默认 `0` = 关,现有部署行为字节级不变。

当被绑定的账号**暂时**不可用(RPM 触顶 / 冷却)时,短等它自己恢复,而不是立刻换到替补号。

**为什么值得等。** 上游 prompt cache 是按账号隔离的,换号要在替补上付一次**完整前缀写**
(实测约为读的 5.6 倍:冷 round-1 tag4=14361,暖 round-2 tag5=14356 + tag4=5)。而且绑定
**不会回来** —— 成功路径会把替补重新钉上,代码里没有回家机制。实测 6 轮受阻(前两轮
warmup 让被绑账号真正持有前缀):

```
关(现状)  A,A,sub,sub,sub,sub,sub,sub   触达 2 个账号 = 2 次完整前缀写
开          A,A,A,A,A,A,A,A               触达 1 个账号 = 1 次
```

pool=4 与 pool=8 结果相同。

**为什么默认关。** 等待把该 caller 的吞吐钉在**单账号** RPM 上(pro 60/min、未探明
20/min),而换号是把它摊到整个池子。代价实测**每个受阻轮约 +1 秒**,下界不是我们能选的:
`getAccountAvailability` 对 `retryAfterMs` 有 1000ms 地板,所以窗口实际 400ms 就恢复也会
等满 1 秒。省 token 还是抢延迟,是运维的选择而不是代码的。

**只在放得进预算时才等。** reason 码本身不够用 —— `rpm_full` 对窗口即将滚过的 caller 是
~1.5s,对刚把配额一次性打满的是 ~59s。所以比的是账号自己声明的 `retryAfterMs`:配额干涸
(小时级)立即换号;权限类不可用永不等待(它不会过期);未分类的原因一律按不可等处理。

---

## 冷却维度守卫:从源码切片改成行为断言

`connect-dimension-guard` 检查的是**源码形状** —— `finalizeConnectAccount` 到
`waitForAccount` 之间那段文本里每个 `mark*` 调用的第三个参数。实测:把同一个缺陷搬到切片
**外**声明的 helper 里,那个套件 **10/10 全绿**,而池子照样重选刚被限流的账号。

更要紧的一条台账此前没记:**既有的行为断言压根没覆盖"chat.js 选哪个维度"**。它们(以及
`connect-capacity-cooldown.test.js`)全都自己用 `markRateLimited` 手写冷却,再断言
`auth.js` 认这个维度 —— 证明的是**消费侧**逻辑对,而 #224 / #230 / v3.8.0 三次错的都是
**生产侧**。承重细节:那些测试给 `model` 与 `selector` 传同一个字符串,所以两个维度看起来
一模一样,缺陷在它们眼里不可观测。

新增 `connect-dimension-behaviour.test.js`(9 条)驱动真实的 `finalizeConnectAccount`,按
生产形状传 `{ model: 'gpt-5.5', selector: 'gpt-5-5-sol' }`,断言池子结果。5 次突变全 CAUGHT,
关键那次是"同一缺陷搬到切片外":旧源码守卫 10/10 全绿、旧 capacity 行为测试 4/4 全绿、
新断言抓到 3 条。

旧守卫**保留** —— 它另外守着"切片内不得出现新的坏维度调用点",是另一条真属性。它头注释里
"断言的是 INVARIANT 而不是具体那一行"这句被上述突变证伪,已改成如实描述。

---

## 两条积压的结论:不该按原方案做

### RPM 满即清绑定 —— 显然的修法是净负面,已 revert

按显然的修法实现了(瞬时不可用时保留绑定 + 标记让四个写入点跳过替补轮的重钉),12 条断言、
9 次双向突变全 CAUGHT、门禁全绿。**然后测代价,方向是反的:**

| 做法 | pool=4 | pool=8 |
|---|---|---|
| 保留绑定 | **4** | **3** |
| 清绑定(现状) | 2 | 2 |
| queue-on-pin | 1 | 1 |

机制是结构性的:清绑定**收敛**(替补成为新绑定,后续读它的缓存);保留绑定**散射** ——
候选排序末位是 `lastUsed` **升序**,刚服务过的替补被排到最后,下一轮必然换一个冷账号。

只有抖动短于相邻两轮间隔时保留才划算,而 RPM 窗口 60 秒、agentic 循环相邻轮隔几秒。已
revert,留 `sticky-transient-blip-tradeoff.test.js`(5 条)钉住现状并记下三方数字。

### `clearCallerBindings` 无生产调用点 —— 结论是不接线

不是"该由哪个事件调用是设计决定",而是**没有正确的事件**:

- **断连是主动错误的触发点。** 钩子确实存在(`server.js` 的 `res.on('close')`),但 agent
  客户端持续半途取消,而代码库其余部分刻意把取消当"什么都没发生":connect finalizer 对
  abort 免除全部惩罚,`poolCheckin` 还把签出的 cascade 条目**放回池里**。在那里清绑定会
  亲手制造本模块要防止的上下文丢失
- **没有 session-reset 事件。** 唯一 caller 维度的 DELETE 是 `DELETE /v1/responses/{id}`
- **账号维度的清理也不值得加。** 死绑定单调老化到 LRU 前端、**最先**被驱逐。实测
  `STICKY_SESSION_MAX=10`:4 死 + 6 活,再插 4 条 → 4 死全被驱逐、6 活全存活,与提前回收
  的存活集**完全相同**。死绑定是免费的驱逐缓冲

依据与实测数字已写进 `sticky-session.js` 的注释,这条从积压里划掉。

---

## 工程

### 新增测试文件

```
test/connect-dimension-behaviour.test.js      冷却维度的行为断言(9 条)
test/sticky-transient-blip-tradeoff.test.js   钉住"抖动即迁移"的现状 + 三方数字(5 条)
test/sticky-queue-on-pin.test.js              queue-on-pin(26 条)
```

`breaker-tunable-hotswap.test.js` 的旋钮计数守卫从 17 改 18,并补一条按名字断言
`stickyQueueOnPinMs` 可达 —— 裸计数会在"加一个同时删一个"时照样通过。

### 突变验证:同一个漏网形态出现四次

queue-on-pin 跑了 13 次突变,3 次漏网,全是同一形态 —— **断言测的是被调用的函数,不是调用点**:

| 突变 | 漏网时 | 补法 |
|---|---|---|
| 轮询改用 mutating 的 `getStickyBinding` | 三条 peek 测试全绿 | 驱动真实等待循环,断言一个排队轮恰好 +1 hit |
| 可用性探测丢掉 selector 维度 | 25/26 全绿 | 端到端只打 selector 维度冷却,断言仍等待 |
| `WAITABLE` 白名单整条删除 | 26/26 全绿 | **不补断言**,见下 |

第三条查下去发现它**今天真的守不住**:每个不可等的 reason 都把 `retryAfterMs` 写死 60000,
而旋钮 max 是 30000,预算那道闸已经全挡了。所以白名单是 belt-and-braces,不是承重件。

**没有假装守住它。** 改成钉住让这份冗余安全的**前提**:每个不可等 reason 报的窗口必须超过
任何允许的预算。谁把某个 60000 调小,白名单会在那一刻静默变成唯一的拦阻,而这条断言会在
那一刻失败。实测把 `missing` 的 60000 改成 2000,它立刻红。

### 一条被自己规则否掉的优化

按 `retryAfterMs` 给首次 sleep 定长(而不是固定 1 秒 tick),测下来**墙钟没有变化**,只是
少轮询几次。按"改行为前先测修改前后两个数字"的规矩,没测出收益的优化不上车,已丢弃。

### 一条被既有测试拦住的分类错误

被 revert 的那版第一稿把 `excludeKeys` 归成"瞬时"(理由:它随请求过期)。
`sticky-exclude-keys.test.js` 三条断言立刻失败,而它的头注释正好写着原因:走到那里的失败
类型是**死 token** —— `reportDeadToken` 只记一次健康事件,账号仍 `active` 且无冷却,
`excludeKeys` 是唯一挡住它的东西。保留那个绑定会让下一轮重新解析到已知坏账号。

### 文档更正

- `docs/README.md` 的"接手请按此顺序读"第 1 条仍把 `HANDOFF-2026-08-03` 称作 "the current
  handoff",而十一行后写着最新是 08-04。接手的人先读到编号列表,看到的是错的那条
- `.env.example` 的 sticky 段补 queue-on-pin,含实测数字与"什么时候别开"
