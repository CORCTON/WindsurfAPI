# v3.9.32

三件事：**面板出错时不再把上一次的数据清空**、**工具前言的构造少做一半无用功**（`$ref` 钻石形 −61%）、
以及**CI 的绿终于等于"测试真的跑完了"**。

无 API 破坏：2xx 响应体逐字节不变。ACU `^22` 仍默认关。`FREE_TIER_SELECTOR` 仍是 `swe-1-6-slow`。

---

## 用户可感知

### 面板读失败时不再清空，13 个面板保留上一次的好数据

非 2xx 的 JSON 响应体过去不带 `success` 字段，前端因此**分不清"请求失败了"和"这个载荷本来就没有这个字段"**：
`data.X` 取到 `undefined`，面板被画成空的 —— 看上去像"你没有账号"，实际是"这次没读到"。

本版在**响应侧**一处收口（`src/dashboard/api.js` 的 `json()`：非 2xx 且对象体里没有 `success` 时补 `success: false`），
并在前端两处 wrapper 里对不可解析的 4xx/5xx 也合成信封；再加 13 个 loader 的单行守卫。
**HTTP 状态码一律未改，2xx 响应体逐字节不变。**

实测：审计说"10 个 loader"**不成立** —— 逐个数出来是 `index.html` 14 个 + `index-sketch.html` 5 个；
"53 个非 2xx `json()` 不带 `success:false`"这半边**完全复现**。新增 26 条测试，
三类回退各自能把它打红（注入关闭 → 2 条红；删掉一个 loader 守卫 → 1 条红；回退 wrapper → 2 条红）。

### 13 处未转义的插值已转义

`id` / `status` / `name` 被直接插进 `innerHTML`，包括 `data-name="${f.name}"`（调用方可控）与账号表、
封禁表、模型卡上的 `a.id` / `a.status`。现在统一走文件自带的 `this.esc()`。
另有 24 处经逐条审查列入 `REVIEWED_NOT_SINKS`（取 URL、`querySelector`、`Response.status` 数字、
硬编码字面量等），**每条都写明了理由**，没有"顺手跳过"。

**顺带修掉一个"看起来在工作、实际什么都没守"的守卫**：这个守卫的字段表原本命中 **0** 处插值，
而它的"守卫的守卫"是通过的 —— 所以没人会发现它没在守。现在字段表被清空时测试**必须红**。

### 工具前言：`$ref` 钻石形快 61%，34 工具档快 24%

`stripSchemaDocs` 在每个 schema 节点上重建同一份 `KEEP` 集合、每次 `$ref` 都重新解析同一个指针。
三处**行为等价**改写（hoist、按 `(root, ref)` 记忆化、`Object.keys`）。**交错 A/B**（3 轮，交替换入
master 与本版实现，同一进程内，避免把机器变快误当疗效）：

| 形状 | master | 本版 | 变化 |
|---|---|---|---|
| 34 工具 | 2.243 ms | **1.698 ms** | **−24%** |
| padded `$ref` 钻石 12 层 | 11.735 ms | **4.587 ms** | **−61%** |
| padded `$ref` 钻石 14 层 | 27.646 ms | **10.448 ms** | **−62%** |

34 工具那一档绝对值只有 2 ms 级，run 之间会波动（另一次量到 −34%），所以按**保守值**写；
钻石那两档是可复现的（两次独立测量 −60.9% / −62.2%），也是这个改动真正的收益所在。

**输出逐字节相同**，由 `test/tool-preamble-strip-equivalence.test.js` 钉住：把 master 的实现冻结一份逐字节对拍
（12 类形状 × 两种路径）、96 条 golden 行钉住 tier/`fullBytes`/`sha256(preamble)`，并且**两个方向都有牙**
（回退源码 → 红；把缓存改成只按 `ref` 索引 → 红）。

> 原本想要的"惰性构造整档"**被否决了**，理由是可观测性：`fullBytes` 会被日志（`chat.js:4220`）与测试
> （`tool-preamble-budget.test.js:34/77`）断言；提前退出还会让一条 `$ref` 预算警告变成**不可达**。
> 丢一条诊断也是输出变化，所以没做。

---

## 工程

### ★ CI 的绿曾经不等于"测试跑完了"

这是本版最重要的一条，也是**这个仓库自己文档化了几个月、却从来没被量化过**的问题。

`--test-force-exit` 会在跑完**部分 suite 之后**就让进程以 **0** 退出。被截断的那一轮写出的是一份
**自洽、完整、退出码 0** 的 TAP：`1..3`、`# suites 3`、`# tests 40`、`# duration_ms 154` ——
而那个文件有 **11 个 suite / 72 个测试**。**runner 以为它跑完了。**

同一份字节、逐轮交错对照（Linux）：

```
带   --test-force-exit : 34 x2, 36, 40, 41, 42, 48, 50, 72 x2   ← 8 个不同值
不带 --test-force-exit : 72 x10                                  ← 完全稳定
```

后果不只是"数字难看"。两次**都绿**的 CI run，逐文件计数不同：`openai-error-vocab` **47 vs 39**、
`cascade-native-bridge` **61 vs 68**、`devin-connect-catalog-drift` **225 vs 182**（323 个文件里 ≥4 个漂，
单文件最多 **19%**）。而突变规格的 `expectBaselinePass` 正是拿这个数字写的，于是守卫会随机拒判。

本版从 `package.json`、`scripts/run-test-shard.mjs` 与三个 harness 脚本中移除该 flag，
并把 `CONTRIBUTING.md` 与 release skill 里"这是轻微输出竞态、别拿它对账"的说法改成实测结论 + **不要加回来**。
（那两处文档正是它几个月没被发现的原因：**五处措辞，零次同字节对照**。）

失效模式由**静默**换成**响亮**：shard runner 的 per-file 超时本来就算失败并**点名文件**。

### master 上的手动突变 sweep 之前是死的

`set +e` 与 `fetch-depth: 0` 两个修复只活在**未合并**的分支上，master 上 dispatch sweep 会在
**第一条规格就 exit 2、零判决**。现在两条都在 master，全量 sweep 能产出全部判决。

### 无规格主干补上守卫

`src/conversation-pool.js`（33 KB）与 `src/cascade-native-bridge.js`（64 KB）此前**零突变规格**。
新增 16 条突变：`OK CAUGHT=7 SURVIVED=1`（那条存活者有意且写明理由：`callerKey` 已 hash 进 key payload，
该分支今天无法触发）与 `CAUGHT=8 SURVIVED=0`。规格 44→**46**、突变 543→**559**。

### 门禁

Linux CI **6/6 绿**。`npm test` **4245 / 4240 / 5**，那 5 条是已知的 Unix-git 机器闸
（`mutate-verify-harness` / `ota-fixture-containment-static` / `self-update-gate` /
`self-update-untracked-safety` / `update-script-release-target`），无其他失败文件。
`node --check` / `check-i18n` / `secret-scan` / `spec-static-check` 全绿。

OTA 跟 annotated tag。`docs/releases/RELEASE_NOTES_3.9.31.md` 钉在 v3.9.31 上不改。
