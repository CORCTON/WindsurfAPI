# v3.9.8

**#234 / #235 / #239 的主体。** 一条外部报告(@andya1lan 的 backend 错配)往下挖出四层,
其中两层是**只修一层就会制造事故**的关系。

发版口径:门禁 3245 pass / 0 fail(v3.9.7 基线 3195,新增 50 条)。每条修复都做了突变
验证 —— 把缺陷重新引入,确认断言真的会失败,而不是只看绿灯。这一轮因此查出**我自己
写的 4 条测试是空转的**,详见"工程"一节。

---

## 用户可感知

### 干旱门禁在生产默认后端上从没执行过

`chat.js` 的 DEVIN_CONNECT 短路块每条出口都 `return`,而干旱门禁在这个块**之后**。
生产默认 `DEVIN_CONNECT=1`,所以它一次都没跑过 —— 这个功能不是判断错,是整段死代码。

门禁移进块内,落点在 selector 解析与 strict-model 守卫之后、工具改写与取号之前:
名字打错仍然拿到精确的 400 `model_not_found` 而不是误导性的 503,而被拦下的请求不消耗
任何 prompt 组装和账号槽位。

### 一个账号就能把整池限制到免费模型

`isDroughtMode` 把没有配额数据的账号从**分母**里剔掉,于是 `droughtCount === knownCount`
的真实含义是"所有恰好有数据的账号都干旱",而它读起来像"整池干旱"。而 `refreshCredits`
在 `GetUserStatus` 失败时写的正是 `{ lastError, fetchedAt }`(无 `weeklyPercent`)——
"GetUserStatus 报 subscription has been canceled 而 chat 正常"那个形态。

实测 40 账号池,修复前:

```
1 dry + 39 refresh-failed              drought=true   ← 1/40 就把整池限制到免费模型
1 dry + 1 healthy + 38 refresh-failed  drought=false
40 refresh-failed (none known)         drought=false
40 dry (真池级干旱)                     drought=true
```

改成要求严格多数的账号真的被测到(`known * 2 > active`)才允许宣布干旱。方向是不对称的:
误报把付费用户降级到免费模型,立刻可见;漏报只是让代理继续尝试反正会失败的付费调用 ——
那是这个功能想省的成本,不是正确性保证。

**这两条必须同批修**:因为门禁从没跑过,覆盖率缺陷一直无害;把门禁接上的那一刻它会变成
用户可见故障。

`getDroughtSummary` 把两个 `known` 口径分开报 —— `knownAccounts` 保持原义(任何 credits
对象,含刷新失败的),新增 `quotaKnownAccounts` / `droughtAccounts` / `coverageMet` 暴露
判定真正的输入。同一个词两个含义正是这条缺陷的藏身之处。

### 干旱谓词跨了命名空间 —— 照抄会打死唯一可用路径

`isModelBlockedByDrought` 用 `getTierModels('free')`(MODELS 空间)判 connect selector,
两个集合零重叠:

```
isModelBlockedByDrought('swe-1-6-slow')     = true   ← connect 唯一免费可达
isModelBlockedByDrought('gemini-2.5-flash') = false  ← connect 根本路由不到
isModelBlockedByDrought('TOTAL-GARBAGE')    = true   ← 是"不在免费表里"而非"是付费"
```

所以把门禁接上并复用这个谓词,会屏蔽干旱时唯一还能跑的模型,同时放行一个压根跑不了的。
新增 `isConnectSelectorBlockedByDrought` 走 connect 命名空间 —— 不复用也不给旧谓词加参数。

没有写空集 fail-open:`FREE_REACHABLE_SELECTORS` 是模块级冻结字面量,全仓无
`.add/.delete/.clear`,那个分支不可达,为它写测试会得到一条假测试。

`getDroughtSummary().freeTierModels` 改为按活跃后端解析,且走 `getBackendSwitch` 而不是
`process.env.DEVIN_CONNECT` —— Dashboard 可以在 env 未设时热切换。

### /v1/models 宣传 56 个模型,免费池一个都跑不了

`#232` 的保护在 connect 后端上 100% 不存在(两个过滤器在 `devinConnect` 时 early-return
未过滤输入)。作为命名空间边界这个 exemption 是对的,所以要在 connect 命名空间重做一遍。

**但只按 entitlement 过滤会更糟:**

```
现状          56 行宣传 / 0 行可达
仅过滤        0 行        ← Codex/Cline 零模型直接拒绝启动
```

原因是 `swe-1-6-slow` 在两个行来源里都不存在(不在冻结快照、不在 105 个 live 目录行、
也没有 MODELS 条目),chat 却能路由它。所以发现视图必须**合成**它 —— 第三个产出器是重建的
地板,不是过滤。修复后免费池 1 行且真的可达。

另外两处:

- `handleModels` 有**两个行产出器**,只过滤第一个的话 live-only 付费 selector 仍然漏出去
- fail-open 镜像 chat 的豁免条件(env token 被设置即豁免,**不看池大小**)并补空池一臂 ——
  `hasConnectEntitledAccount` 在空池上对每个 selector 都返回 false,少这一臂会把还没加
  账号的部署剥成零行

### connect 目录永久 latch,加付费账号不刷新

`_connectCatalogSynced` 是模块级布尔,第一个账号同步后置位且永不清除,所以往免费池里加
付费账号永远不刷新 selector 集合 —— 跨账号并集压根取不到。

**单纯去 latch 会比 latch 更糟**:`setLiveCatalogSelectors` 是 clear-then-fill,免费账号
在付费账号之后同步会把集合缩回自己那点。所以改成按账号存行、写入前取并集。存在性(并集)
与 entitlement(按账号 tier)是两个问题,分开回答。

### credit 费率表与逐请求计费接上了 —— 此前零消费者(#235 / #239)

除了最后一环,东西早就都在:解码器解码逐模型 credit 费率表(`#1.13.1.21`),
`devin-connect.js` 在 finish 事件上给出逐请求 credit/ACU 成本,`recordAccountSpend` 收
`creditCost`,Dashboard 也会渲染它。但 `fetchUserStatus` 调用时没传 catalog(费率表停在
未配对的裸浮点数组),OpenAI 适配层把 `billing` 丢掉了,4 个 connect 调用点全都不传
`creditCost` —— 所以那一列在结构上只可能是 0。

#235 报的现象是用户以为 GLM-5.2 免费结果烧掉了周配额。它确实免费 —— 是滚动促销 ——
而 MODELS 里写死 `credit: 1.5`。163 个模型里 `credit === 0` 的有 0 个。代理是真的不知道。

**一条纪律:字段缺失绝不静默放宽免费列表。** 费率表在 plan 子消息里,免费账号可能压根
不带,所以"没数据"必须回落到保守白名单 —— 后者烧的是用户的付费配额,正是 #235 那个坑的
放大版。因此:

- 未配对(数组)的费率表一律忽略 —— catalog 取失败时那些浮点数没有 selector 可归属
- 只有严格 `rate === 0` 判免费,极小非零仍然计费
- 无表时返回 `null` 而不是空集合:"不知道"与"没有免费的"必须区别处理
- 与静态白名单取**并集**而非替换 —— `swe-1-6-slow` 不在任何目录快照里,取交集会打死
  唯一全账号可达的 selector

**未校准的部分**:逐请求 `credit_cost` / `committed_acu_cost` 的 tag 号只有声明顺序推测。
默认只有 `cache_read_tokens=5,cache_write_tokens=4` 是 paid-verified。接线已完成,校准要
付费 token,已在 #239 请社区协助。

---

## 工程:突变验证查出四条我自己写的空转测试

这一轮的做法是每条修复都把缺陷重新引入一次,确认断言会失败。收获比预期大:

### 两条断言无论如何都过

- **"两个行产出器都过滤"** —— live 目录在新进程里是空的,producer 2 压根不产行。去掉
  producer 2 的过滤器不会让它失败。改成先真的填 live 目录再断言
- **"空响应不缩小并集"** —— 带空贡献者的并集在算术上本来就不变,所以即使空响应被接受
  这条也过。真正的伤害是账号被记为已同步而没有任何贡献,于是它后来真的有 selector 时
  永不重取。改成断言重取资格

### 一条断言钉的是没有行为后果的实现细节

`sawTable ? free : null` 换成 `free.size ? free : null` 不会让任何测试失败 —— 在保守回落
下谓词对 `null` 与空集合的回答相同。改成在能观察到差别的地方钉:费率表返回了但全是付费
条目时必须是空集合(我们知道)而不是 `null`(我们不知道)。

### 一条恒真断言

`assert.ok(x.length >= 0)` —— 永真。换成"未变更的 key 不得重复取"这个真实契约。

### connect 目录同步继承了 Cascade 的 latch

去掉自己那个模块级 latch 是**必要但不充分**的:`trySyncConnectCatalog` 只能从
`fetchAndMergeModelCatalog` 里被调到,而那个函数被 Cascade 的 per-key 门禁挡着 —— 一旦某
账号的 Cascade 目录被记为已同步,connect 同步对它就永久不可达,它自己的 per-key 资格压根
没被查过。这是"只覆盖部分路径"那条老陷阱的又一次。

### 两条本轮自己引入的缺陷

- `forgetConnectCatalogForAccount` 原先用动态 `import().then()` 写入,既落在调用方返回
  之后(删号后立刻读仍看得到 departed 账号的 selector),又绕过了注入的 dep seam
- rescue 重试时上一次尝试的计费会被算进这一次 —— `attempt_reset` 要一并清掉 `billing`

### 逃逸点元守卫

干旱门禁的结构守卫**按逃逸点枚举,不按 backend flow**。ACP vision 重路由压根不是
`selectBackend` 的 flow,是 `devin_connect` 逃进 `special_agent`,按 flow 枚举的守卫看不见
它。新增的 `return` 若出现在门禁之上,必须显式登记豁免理由。守卫读结构前先剥注释,并带
"守卫的守卫"(枚举结果为 0 即失败)。

---

## 明确未修

- **`WINDSURFAPI_STRICT_MODEL=0` 仍然静默把付费请求改写成 `swe-1-6-slow`,响应里的 `model`
  字段是客户端请求的那个付费名。** 这正是 #234 验收标准最强调的一点。麻烦的是
  `test/devin-connect-strict-model.test.js` 把这个行为**断言成期望行为** —— 套件在强制
  执行该验收标准的违反
- 已采纳的快照会永久往模块级 `MODELS` 表注入 key 且无人移除,已删除账号的模型仍被宣传
- #236 GLM 工具调用停滞:判据仍太模糊,等真实复现
- sticky 线 7 条积压(见 HANDOFF §3.10)

---

## 致谢

- **@andya1lan**(#234)—— 那条 backend 错配是这一整轮的入口,而且他在 #235 里提的
  "动态解析 credit"直接指向了费率表接线
- **@kuaile1993**(#235)—— "怎么快速配置只用免费模型"问得对:不是没找到设置,是代理
  确实不知道
- **@zhonxinya**(#239)—— ACU 计费的请求让逐请求计费那条断链被查出来
