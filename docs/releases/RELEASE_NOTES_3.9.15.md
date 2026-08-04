# v3.9.15

面板列的模型和实际能调的模型此前是两套；Cascade 流式的账没记；九个 CI action 升到 node24。

门禁 **3427 pass / 0 fail**（263 个文件；v3.9.14 = 3418，新增 9）。

---

## 缺陷：模型面板列的 163 个模型，免费号一个都调不了（#234）

`DEVIN_CONNECT=1`、免费池上实测：

```
/v1/models          1 行(swe-1-6-slow)
Dashboard /models   163 行，与前者零重叠
```

面板列的全是账号调不了的付费模型，而**唯一调得了的那个压根不在列表里**。点一个下去，chat
那边 402。

成因是两个视图从两个命名空间各自推导同一条规则：Dashboard 走
`filterModelKeysByCloudCatalog`（`devinConnect` 打开时它按命名空间边界原样返回，这是对的），
`/v1/models` 走 connect 那套。这是本仓库最高频的缺陷形态，在册第七次。

**修法是一个导出的谓词 `buildConnectReachability`，两边都调它** —— 而不是在 Dashboard 侧再抄
一份判据。抄一份就是同一个陷阱的下一次。

**面板改成标注而非删行。** 每行多两个字段：`reachable`（这个部署现在调不调得动）和
`connectSelector`（解析出的上游 selector，映射不到时为 `null`，好把"没权限"与"压根不认这个
名字"分开）。不可达的 chip 虚化 + 虚线边框，鼠标悬停说明原因，**仍然可点**。

删行是错的，原因很具体：allow/deny 面板只渲染这个列表，narrow 掉会让已经在名单里的条目既
看不见又**点不掉** —— 运维没法点一个不存在的 chip 去移除它。

免费 selector 还需要合成：`swe-1-6-slow` 不在快照、不在 live 目录、也没有 MODELS 条目，所以
任何 Cascade 派生的列表里都没有它，而它是唯一每个账号都能服务的。合成这一步按 transport
上闸 —— 往 Cascade 部署的面板里塞一个 connect selector，与本次要修的错误同类，只是方向相反。

这条顺带缓解 **#235**（报告者是 pro 号、设了 GLM-5-2 一下把周限用完，问的正是"哪些模型吃
配额"）：现在至少看得见哪些调得动。**"哪些是免费的"仍未暴露** —— `getCurrentlyFreeConnectSelectors`
只有一个生产调用者，在干旱判定内部，没有任何接口把它露出来。这条还开着。

## 缺陷：Cascade 流式路径不记 per-account 消费

四条路径里三条有 `recordAccountSpend` 调用点（connect 流式、connect 非流式、Cascade
非流式），**Cascade 流式没有**。于是 Cascade 部署上每个流式轮次 —— agent 客户端的常态 ——
对账号累计消费没有任何贡献，面板那一列按流式占比少报。

成因是个不对称：`streamResponse` 的参数表里没有 `apiKey`（`nonStreamResponse` 有），所以
流式侧得从自己 acquire 的账号解出来。用 `currentApiKeyForId` 而不是快照里的 key：请求中途
re-login 会换 key，拿旧的会记到一个已经不存在的行上。

三个双计数隐患逐个测过，每个在本仓库历史上都真实发生过一次：**重试**（调用点在 attempt
循环内，但成功路径紧接着 return，所以重试过的请求只记一次）、**断连**（客户端中途断开会在
此之前抛出，取消的轮次不计费，与代码库其余部分刻意把 abort 当"什么都没发生"一致）、
**缓存重放**（缓存命中不进这条路径）。

守卫是行为测试而非源码 grep：调用点被 `try/catch` 包着，作用域错误会被静默吞掉，grep 到这
行什么都证明不了。`chat.js` 正好这么坏过一次 —— 它在 `streamResponse` 里引用了压根不在作用
域的 `body`，**每次流结束都 ReferenceError**（#93 后续）。所以断言的是累计值真的动了。

## 工程：九个 CI action 升到 node24

每次 CI/Release 运行都在打 `Node.js 20 is deprecated ... being forced to run on Node.js 24`。
每个版本号都是从对应 tag 的 `action.yml` 里读 `runs.using` 定的，不是照 README 或猜：

| action | 从 | 到 |
|---|---|---|
| `actions/checkout` | v4 | **v5** |
| `actions/setup-node` | v4 | **v5** |
| `actions/upload-artifact` | v4 | **v6** ← v5 仍是 node20 |
| `actions/download-artifact` | v4 | **v7** ← v5/v6 仍是 node20 |
| `docker/setup-buildx-action` | v3 | v4 |
| `docker/login-action` | v3 | v4 |
| `docker/metadata-action` | v5 | v6 |
| `docker/build-push-action` | v6 | v7 |
| `softprops/action-gh-release` | v2 | v3 |

四条 breaking change 逐条对过本仓库的实际用法，都不适用：`setup-node` v5 的
`packageManager` 自动缓存探测（本仓库无该字段且已显式写 `cache: 'npm'`）、
`download-artifact` v5 的路径嵌套（只影响按 ID 下载，本仓库三处全按 name）、
`upload-artifact` v5/v6（release notes 里无功能性变更，三个 upload 名字互不相同、未设
`archive`）、`build-push-action` v7 删掉的两个 `DOCKER_BUILD_*` 环境变量（本仓库都没设）。

两个 artifact action 与 `build-push` v7 都要求 Actions Runner ≥ 2.327.1；本仓库全用 GitHub
托管 runner，无自建，前提自动满足。

**验证范围**：`ci.yml` 的改动随本次推送即被真实运行验证；`release.yml` 的改动要等这个 tag
推上去才真的跑。届时若某个 action 出问题，表现是发版失败、产物不发布 —— 可恢复（修了重新
打 tag），但那一次运行会是红的。

## 记账口径

- 测量口径是 `npm run test:release`（逐文件进程隔离）
- 突变：新增 spec `dashboard-connect-parity.json`（11 条：**9 CAUGHT + 1 条有据可查的漏网**，
  另 1 条被删除因为它守的代码不存在了）
- `secret-scan` **EXIT=0**，但它跳过 `test/` 且只读被跟踪文件。已手工扫过本次 `test/` 增量：
  无凭据形态
- 台账第十二轮记了本轮方法论，其中三条是我自己的错：一段我加完才发现永不执行的死代码、
  一条我误判为"台账说了假话"而实际守卫一直存在的更正、以及三次在突变运行中途动工作树
