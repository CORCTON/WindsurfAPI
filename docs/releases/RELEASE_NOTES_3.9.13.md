# v3.9.13

一个真实缺陷 + 一个默认关的开关 + 一轮把**自己这一轮的修复**也审了的对抗复核。

门禁 **3401 pass / 0 fail**(260 个文件;v3.9.12 = 3342,新增 59)。

---

## 缺陷:caller 分片会把在场最差的账号提到队首,反噬 issue #37

`getApiKey` 的候选排序把 in-flight 最少的排前面,好让并发突发散开(#37)。它末尾的
**caller 分片**本意是"在同等好的账号之间,让每个 caller 确定性地偏好自己那一格",但它的门槛
只判 `candidates[0]` 与 `[1]` 是否打平,然后按 `hash % candidates.length` 在**整个数组**上
取下标 —— 于是它能提拔一个与谁都不平的账号,**包括在场最差的那个**。

并发突发下正是如此:正在服务的账号按 in-flight 排到最后,队首两个空闲账号打平、门槛放行,
交换把最忙的那个拉回 `[0]`。实测 pool=8 / tier=pro:某个 callerKey 的 bucket 落在末位时,
**同一个账号连续被选中 8 次,而七个同伴 in-flight 全是 0**。

它一直看不见,因为结果完全由 `sha256(callerKey) % pool` 决定:

```
bucket 0–1 → 8/8 全池散开      bucket 4 → 4/8
bucket 2   → 6/8               bucket 6 → 2/8
                               bucket 7 → 1/8  完全不散
```

而钉住这条行为的那条测试用的 callerKey 恰好 hash 到 bucket 0(最好的情况),所以它一直读起来
像"8 并发 → 8 账号,设计如此"。抽 8 个真实形态的 callerKey,**只有 2 个真的散开全池**。

**修法**:把置换限制在**真正与 `candidates[0]` 打平**的前缀内。分片的用途完整保留,但它结构
上不可能再提拔一个更差的账号。修完 8 个 callerKey 全部 8/8。

判据必须镜像排序的**每一项**。第一版漏了 `recentTroubleScore`(排序的第二优先键),于是近期
失败簇被降级的账号仍算"打平"、仍能被提上来,而且因为那一项优先级高,真正打平的账号可能排在
不打平的后面、扫描提前停止**分片不足**。

**五项**判据现在逐项都有对应突变:in-flight、trouble 桶、quota 桶、RPM 剩余比例各有一条隔离
断言,`lastUsed` 是**有据可查的漏网**(理由记在 spec 里)。其中 quota 那项此前静默未覆盖 ——
种子账号没有 `credits` 对象,`quotaScore` 恒返回 100,**没有 fixture 能让它说话**;设上
credits 之后实测:10% 配额的账号从「从未被选中」变成 6 个采样 callerKey 里被选中 2 次。

同时修掉 `strictPin` 的一个前提错误:它由两个**面板可实时设置**的 flag 算出,而它依赖的
sticky 钉住是 **env-only 的 module-load const**。在没设 `STICKY_SESSION_ENABLED=1` 的部署上
把两个开关打开,分片就在整池上无边界运行,而豁免所服务的那套钉住一个都没生效。

## 新开关:`WINDSURFAPI_STRICT_USAGE_TOTAL`(默认关)

OpenAI 规定 `total_tokens == prompt_tokens + completion_tokens`。本代理默认**刻意打破**它:
`cache_write > 0` 时 total 会多出 cache_write,因为它承担"完整可计费成本"这个职责,而分桶字段
严格遵守 OpenAI/Anthropic 语义。#118 是刻意这么选的 —— 另一个方案(cache_write 进
`prompt_tokens`)会让下游中转把它当普通输入计费,几小时烧穿试用额度。

设 `1` 恢复恒等式,给会**校验**这条等式的客户端用。**默认 0**,因为两种失效不对称:恒等式被
破对绝大多数消费者只是观感;而把 cache_write 从 total 里拿掉会**少报真实开销**,按
`total_tokens` 计费的中转会悄悄少收钱。观感问题比钱的问题轻,所以严格合规是 opt-in。

**开了不影响你自己的账。** 成本统计不只读 `total_tokens` —— 它取
`max(total, prompt + completion + cache_creation_input_tokens)`,所以 flag 从 total 里拿掉的
那部分会从 `cache_creation_input_tokens` 补回来。有断言钉住"同一个请求在开关前后账单完全
相同"。

三个 usage builder(Cascade / DEVIN_CONNECT / Devin CLI-ACP)**全部**生效。这点是刻意的:
一个只在部分协议前端成立的 flag 比没有这个 flag 更糟 —— 客户端无法判断手上这个响应属于哪
一种。

---

## 两条积压的结论:一条不该修,一条修错了

### RPM 满即清绑定 —— 显然的修法是净负面,已 revert

按显然的修法实现了(瞬时不可用时保留绑定 + 抑制替补轮的重钉),12 条断言、9 次双向突变全
CAUGHT、门禁全绿。**然后测代价,方向是反的:**

| 做法 | pool=4 | pool=8 |
|---|---|---|
| 保留绑定 | **4** 个冷账号 | **3** |
| 清绑定(现状) | 2 | 2 |
| queue-on-pin(v3.9.12) | 1 | 1 |

机制是结构性的:清绑定**收敛**(替补成为新绑定,后续读它的缓存);保留绑定**散射** ——
候选排序末位是 `lastUsed` 升序,刚服务过的替补被排到最后,下一轮必然换一个冷账号。

只有抖动短于相邻两轮间隔时保留才划算,而 RPM 窗口 60 秒、agentic 循环相邻轮隔几秒。已 revert,
留 `sticky-transient-blip-tradeoff.test.js` 钉住现状并记下三方数字。

### `clearCallerBindings` 无生产调用点 —— 结论是不接线

不是"该由哪个事件调用是设计决定",而是**没有正确的事件**。断连是主动错误的触发点(agent 客户
端持续半途取消,而代码库其余部分刻意把取消当"什么都没发生");没有 session-reset 事件;账号
离池是真的清理但那是**账号维度**的,而且不值得加 —— 死绑定单调老化到 LRU 前端、**最先**被
驱逐,实测容量满时 4 死 + 6 活、插 4 条后 4 条死的全被驱逐,与提前回收的存活集**完全相同**。

---

## 工程

### `npm run mutate` —— 突变验证从手搓循环变成脚本

`scripts/mutate-verify.mjs` + 入库的 `test/mutations/*.json`。三条**拒绝启动**的前置检查,
每条对应一次真实事故:

| 拒绝条件 | 为什么必须拒绝而不是警告 |
|---|---|
| 工作树脏 | 循环自己的 `git checkout HEAD --` 会连未提交的修复一起还原,之后每次突变测的是"修复缺失"而不是"突变生效" —— 而那个失败**看起来正是突变被抓到**。它伪造的是好消息 |
| baseline 不绿 / 条数不符 | SURVIVED 只在套件本来通过时才有意义 |
| anchor 匹配次数 ≠ 1 | 匹配不上的 `replace` 是静默 no-op:测试全绿、报告写 SURVIVED、什么都没突变过 |

spec 入库的理由:此前突变结果只活在跑它的人的终端里,release notes 里"N 次突变全 CAUGHT"下一
个人无法复核。现在 `npm run mutate` 会直接说话。四个 spec 共 35 条突变。

### 可选的 git hooks

`git config core.hooksPath .githooks` 本地 opt-in。`pre-commit` 拒绝在 master 上直接写
commit(流程是 分支 → 评审 → `--ff-only` → 推);`post-commit` 对 `cherry-pick` / `revert`
事后警告 —— git 不在那两条路径上调 pre-commit,所以那是钩子能做的极限。

作用范围**九条断言逐行钉住**(`githooks-scope.test.js`),因为那张表在同一轮里与实际行为偏离
过两次。未 opt-in 时 hook 完全不生效,这一点也有断言。

### 对抗复核:六个 lens + 一次裁决,查出的全是本轮自己造的

六个独立 lens 攻这一轮的全部改动,**没有一条重大发现指向老代码**。而每一步都跑过突变验证 ——
这是本轮最有信息量的结果:新代码的缺陷密度远高于被审过多轮的老代码。

随后把裁决的任务改窄成"**审那六个修复本身**"(本轮唯一没人复核过的代码),六条里三条正中:
突变工具的守卫会在突变被真正抓到时中止整轮;负数 clamp 只护住三个计数器里的一个;等价性论证
的乘法算错。

**修复本身要过一遍复核** —— 它们是在已经发现问题的紧张状态下写的,缺陷密度不会更低。
