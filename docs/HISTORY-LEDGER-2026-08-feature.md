# WindsurfAPI 记账本 v2 — 切片 8a 精细账（2026-08-02 ~ 08-10）

> 数据源：`/tmp/ledger-slice-8a-feature.txt`（256 条 commit，逆序）+ 全部 hash 经 `git log` 逐一核实，
> 时间戳为 commit 本地时间（`%m-%d %H:%M`），发版时间用 annotated tag 创建时间（`git for-each-ref`）。
> 实际日期范围 08-02 ~ 08-10（任务书写的 08-02~08-08 是预估边界，片内含 08-09 的 30 条与 08-10 的 7 条）。
> 深挖条目以 ◆ 标记，逻辑级详情在 §5；§2 问题链也带文件/行数证据。
> 与 v1（`ledger-out-slice-8a-feature.md`）的关系：v1 是 10 聚类总览，本账是其精细版 —— 逐条表为新增核心，
> 并修正 v1 的三处发版表错误（见 §6）。

---

## §1 逐条 commit 账（256 条）

### 08-02（3 条）

| hash | 时间 | 分类 | 账目 |
|---|---|---|---|
| `793ed79` | 17:42 | fix | ◆ rescue thinking-only 以 corrective nudge 收尾 —— swe-1-7 agentic 死循环解锁 + 丢弃毒化空 assistant turn（#238 核心，+178 行/4 文件，详见 §2-2） |
| `68da125` | 19:32 | fix | ◆ 客户端断连吞掉上游 429 冷却窗口 + 上游 aborted 被当成断连 —— 断连/中止两态分流（+348 行/2 文件，详见 §2-7） |
| `3cc5aab` | 19:45 | fix | ◆ 空/畸形目录响应零确认擦掉 last-known-good + 缩水目录永久楔住 —— 零确认不清快照 + 缩水检测（+427 行/4 文件，详见 §5-29） |

### 08-03（34 条）

| hash | 时间 | 分类 | 账目 |
|---|---|---|---|
| `c370165` | 03:19 | test | 墙钟精确相等断言（时序脆弱）+ 隐藏的分支依赖 —— 记入突变纪律 |
| `8ebdee4` | 03:20 | docs | sticky 两条注释断言了代码并不提供的保证 —— 注释比实现强 |
| `83cfdd6` | 03:40 | docs,fix | 六处文档失真 + 检索 query 参数只认下划线拼写（下划线/破折号两写法） |
| `6c0c09d` | 03:50 | fix,test | ◆ socket 码仍在驱逐健康账号 + 三条源码守卫放过自己要抓的缺陷（+267 行/4 文件，详见 §5-28） |
| `2c64fca` | 15:18 | test | 转义函数与干旱横幅此前零行为覆盖 —— 改成真的执行它们（+235 行） |
| `ba9a205` | 15:20 | release | chore(release): v3.9.7（#238 主体，上一分片尾巴） |
| `14745a8` | 15:40 | merge | Merge PR #238（rescue nudge） |
| `3d46f59` | 16:02 | fix | ◆ reasoning 提升成 content 时同一段文字返回两遍 —— 去重（+90 行/2 文件，详见 §5-33） |
| `9ef10b4` | 16:06 | fix | ◆ 每次 rescue 尝试的输出被拼进同一个答案 —— 逐次快照分离（+87 行，详见 §5-34） |
| `438d1d6` | 16:09 | docs | v3.9.7 补 #238 一节 + 台账记 warelik #238（S） |
| `2e3d765` | 18:14 | fix | 发版前对抗复核 —— 六条本轮修复自己引入的缺陷（自伤模式启动） |
| `12ebfaf` | 18:27 | docs | 交接说明 2026-08-03 + docs 索引重排 + 台账补本轮 |
| `f9c8ca2` | 19:00 | docs | 三处自失效的交接事实 —— commit 计数、行号转置、zsh 突变陷阱 |
| `d9ed81f` | 19:12 | fix | ◆ 单个账号即可宣布全池干旱 —— 干旱判定要求最低已知覆盖率（+201 行，详见 §2-11） |
| `a8b9af2` | 19:23 | fix | ◆ 干旱谓词跨了命名空间 —— 新增 connect selector 专用判定（+227 行，详见 §2-11） |
| `1c5274e` | 19:28 | fix | ◆ 干旱门禁在生产默认后端结构性不可达 —— 接进 connect 短路块（+280 行，详见 §2-11） |
| `b0989ac` | 19:43 | fix | ◆ connect 目录永久 latch + 发现视图只宣传不过滤 —— 目录同步与过滤拆开（+501 行/5 文件，详见 §5-30） |
| `310c1db` | 19:49 | fix | connect 目录同步继承 Cascade 的 latch（+68 行）+ 两条自查假测试 |
| `d032386` | 19:58 | feat | ◆ 接上 credit 费率表与逐请求计费 —— 此前零消费者（+260 行/4 文件，详见 §5-31） |
| `8e9f8bd` | 20:00 | test | 一条断言钉的是没有行为后果的实现细节 —— 记入纪律 |
| `6a954d7` | 20:09 | release | docs(release): v3.9.8 —— #234/#235/#239 主体 + 台账补第三轮 |
| `c002b4c` | 20:22 | docs | v3.9.8 发布记录 + 剩余项 + 一处对上一份交接的修正 |
| `d42f3a5` | 20:39 | fix | ◆ 已删除账号的模型仍被宣传 —— 快照注入的 key 无人移除（+256 行/2 文件，详见 §5-32） |
| `c6d3faa` | 20:40 | test | 驱逐调用顺序此前无断言钉住（+21 行） |
| `0f5a57b` | 21:01 | fix | ◆ rescue nudge 引用失败尝试的 reasoning 尾 —— 每次救援一条新 nudge、field-0 守卫（#241 layer 2，+530 行/8 文件；分支 commit，08-05 才合并，详见 §2-2） |
| `ef80bde` | 21:07 | fix | ◆ 绑定槽无 selector 维度 —— connect 每个 selector 互相驱逐（+50 行/4 文件，详见 §2-10） |
| `97a1219` | 21:15 | test | selector 维度回归守卫 + 自己踩的模块加载陷阱（+114 行） |
| `27ab174` | 21:24 | test | TTL 滑动窗口断言在满套件负载下偶发失败 —— 时序脆弱如实记下 |
| `a9f0a0b` | 21:33 | test | 转义 helper 有守卫、208 个调用点没有 —— 覆盖缺口 |
| `a01cd98` | 21:39 | docs | 第四轮记录 —— 三条积压修复 + 两条新判别动作 |
| `7d2b5a5` | 21:55 | release | chore(release): v3.9.9 |
| `c274486` | 22:43 | docs | 复核自己写过的话 —— 门禁数字三处错、一个从未发布的版本没标注 |
| `f23d9c7` | 23:53 | fix | ◆ STRICT_MODEL=0 降级后响应谎报付费模型名 —— 诚实降级（+169 行/2 文件，详见 §2-12） |
| `d4d7253` | 23:56 | test | 补 AssignModel 注入 seam —— router 分支此前无守卫 |

### 08-04（81 条）— 单日峰值，5 版

| hash | 时间 | 分类 | 账目 |
|---|---|---|---|
| `31fa424` | 00:29 | fix | ◆ 订阅取消对账号池不可见 —— 明确信号被丢进 lastError（+169 行/2 文件，详见 §2-12） |
| `ae2f4a4` | 00:37 | fix | ◆ 另两条协议路由（messages/gemini）仍在谎报降级后的模型名（+71 行，详见 §2-12） |
| `16fcb5d` | 00:39 | test | 流式 message_start 的模型名此前无守卫 |
| `6df32f9` | 00:40 | test | 流式 modelVersion 守卫 + 修正一处过强注释 |
| `b43794f` | 00:42 | test | 非流式 modelVersion 守卫 |
| `5f86e53` | 01:15 | release | chore(release): v3.9.10 |
| `f2d01d2` | 01:32 | test | 路由错误分类改为行为断言 —— 源码守卫可被绕过 |
| `9844470` | 01:37 | docs,test | ◆ 首轮 thundering-herd 是设计张力不是缺陷 —— 重新定性（+158 行/3 文件，详见 §5-22） |
| `b24ea02` | 01:40 | test | 散射断言的归因改成如实描述 |
| `756761c` | 01:43 | fix | ◆ stickyNoFallback 会把 caller 永久楔死（+194 行/2 文件，详见 §5-21） |
| `3cc4704` | 01:49 | release | chore(release): v3.9.11 |
| `49a90e8` | 02:11 | docs | 交接说明 2026-08-04 + 台账补第五轮 + 索引重排 |
| `2c680be` | 02:30 | test | 维度守卫从源码切片改成行为断言 |
| `a1b1f2d` | 02:39 | docs,test | 第六轮 + 旧守卫头注释改成如实描述 |
| `e331c0c` | 02:51 | docs | 索引「当前交接」仍指向 08-03，与十一行后自相矛盾 |
| `762d3f3` | 03:14 | docs | clearCallerBindings 无正确触发点是结论不是待办（+35 行） |
| `cbedc1f` | 03:36 | fix | ◆ 60 秒的 RPM 抖动会把会话永久迁走 —— 修复（+350 行/3 文件，详见 §2-3） |
| `75857de` | 03:43 | test | fillRpm 自证已触顶，不再靠读起来像推导的常量（+22 行） |
| `0f1d4f0` | 03:46 | revert | ◆ Revert cbedc1f —— 当天推翻，实测「保留绑定会散射，比清绑定更贵」（-368 行，详见 §2-3） |
| `68866b3` | 03:49 | test | 钉住「抖动即迁移」现状 + 三种做法实测代价（+179 行） |
| `1671ca4` | 03:55 | docs | 第七轮 —— sticky 两条积压：一条不该修、一条修错了 |
| `36cbf32` | 04:04 | docs | 交接说明 2026-08-05 + 索引重排 |
| `95f35cd` | 04:35 | feat | ◆ queue-on-pin —— 对绑定账号短等而不是立刻换号（默认关，+594 行/5 文件，详见 §2-10） |
| `cc9a03e` | 04:39 | fix | 排队轮询把每次轮询记成一次命中（+46 行） |
| `557b9f7` | 04:42 | test | 端到端断言 —— 等待循环必须按 selector 维度问可用性（+30 行） |
| `6aa25a1` | 06:04 | test | WAITABLE 白名单今天冗余，钉住让它安全的前提（+37 行） |
| `0719a9d` | 06:18 | release | chore(release): v3.9.12（tag 实际打在 06:23 的 b910c7e 上，见 §6） |
| `b910c7e` | 06:20 | docs | §3/§4 在同一会话内被取代 —— queue-on-pin 是功能不是拍板项 |
| `0d0d6ea` | 06:35 | test | 收尾「只读推断」声明 —— 范围比写的窄（+157 行） |
| `ebeeb01` | 06:40 | tooling | ◆ 突变验证改成脚本 —— 三次踩过的坑变成拒绝启动的前置检查（+358 行/6 文件，详见 §4） |
| `11fdf5a` | 06:46 | chore | 可选 pre-commit hook —— 禁止直接在 master 上写 commit |
| `917b0e1` | 06:47 | docs | 第九轮 —— 记过两次仍违反的纪律，做成工具 |
| `f429297` | 07:05 | feat | ◆ WINDSURFAPI_STRICT_USAGE_TOTAL —— 恢复 OpenAI 的算术恒等式（默认关，+286 行/5 文件，详见 §5-20） |
| `a379016` | 07:06 | test | strict-usage-total 的突变 spec（9 条） |
| `aaf487c` | 07:22 | fix | ◆ caller 分片把最忙的账号提到队首 —— 反噬 issue #37 的并发散射（+39 行，详见 §2-8） |
| `2567bbb` | 07:26 | test | 散射归因 + 分片只在打平前缀内置换的守卫（+430 行/3 文件） |
| `d03b35d` | 07:26 | test | 分片修复的突变 spec（6 条，+42 行） |
| `a919fc5` | 07:27 | test | 隔离 tie 判据的 in-flight 项 —— 不是冗余的（+38 行） |
| `574d3bc` | 07:29 | test | 隔离 tie 判据的 RPM 比例项 —— 也不是冗余的（+42 行） |
| `7bf4bc9` | 07:30 | test | lastUsed 项标为有据可查的漏网 |
| `1dc2527` | 07:32 | refactor | 删掉被 tied-prefix 边界完全吸收的那道分片门槛（-23 行） |
| `a0ec58f` | 08:23 | fix | ◆ 突变工具把「被截断的运行」报成干净的 SURVIVED（+103 行，详见 §4） |
| `53f0666` | 08:30 | test | 「最忙的账号不会被提上来」是恒真断言（+14 行） |
| `d0b9c9f` | 08:43 | fix | tie 判据漏了排序的 trouble 项，分片仍能提拔被降级账号（+40 行） |
| `8449002` | 08:51 | fix | ◆ tie 判据补上 trouble 项 —— 上一个 commit 声称改了但没改到（+24 行，详见 §2-8） |
| `9e7008e` | 13:52 | fix | ◆ 那个 flag 只在两个协议前端生效 —— helper 一个生产调用者都没有（+161 行/6 文件，详见 §5-20） |
| `3eb9a2f` | 13:52 | test | usage spec 跟上 helper 迁移，补 special-agent 与负数 clamp 两条突变 |
| `433aae3` | 13:53 | test | 负数那条突变改成复现真正的缺陷形态 |
| `2c3faa4` | 14:05 | fix | ◆ strictPin 缺 isStickyEnabled() 检查 —— 面板 flag 能豁免分片边界（+77 行/3 文件，详见 §2-8） |
| `9ea888c` | 14:07 | test | 隔离 tie 判据的 quota 项 —— 也承重，只是没 fixture 能让它说话 |
| `71b960b` | 14:11 | docs | 第十轮 —— 整体复核查出六条，全是本轮自己造的 |
| `6340f7c` | 14:13 | docs | 交接补 §8（v3.9.12 之后四件事 + 整体复核） |
| `dcc8cee` | 15:11 | docs | 修正本轮自己写下的七处不实陈述（claims-audit lens） |
| `7c7366d` | 15:37 | fix | ◆ pre-commit 作用范围被注释夸大 —— 补 post-commit 兜住两条路径（详见 §2-13） |
| `eb9d4a0` | 15:39 | docs | hook 作用范围改成实测结果 |
| `e155ced` | 15:42 | docs | 中文段 hook 范围也改实测（上一 commit 只改到英文段） |
| `a38d483` | 15:42 | docs | 补记 judge 失败、引用不支持结论、hook 范围夸大三条 |
| `9a4826c` | 16:27 | fix | ◆ judge 裁决的六条 —— 其中三条是我自己那批修复引入的（详见 §4） |
| `7a8ebfe` | 16:30 | fix | ◆ git revert 根本不跑 post-commit（探针结论一） |
| `a57a83c` | 16:31 | fix | ◆ 更正：git revert 确实会跑 post-commit，我的探针是坏的（探针结论二，详见 §2-13） |
| `135b9e3` | 16:39 | docs | 补记 judge 裁决那批修复 + 用坏探针得出错误结论 |
| `5f1403f` | 17:04 | test | ◆ 给突变工具自己的判决逻辑加回归测试 + 修 NODE_TEST_CONTEXT 泄漏（+268 行/2 文件，详见 §4） |
| `67ce2a0` | 17:14 | test | ◆ judge 要的五条守卫（+334 行/3 文件，详见 §4） |
| `02c4858` | 17:15 | docs | 第十轮收尾 —— judge 要的五条守卫 + 七条如实记录 |
| `d31589b` | 18:02 | release | chore(release): v3.9.13（tag 实际打在 18:12 的 095df44 上） |
| `deb810d` | 18:05 | docs | release notes 四项判据应为五项 —— 上一个 commit 的 heredoc 引号炸了没落进去 |
| `095df44` | 18:07 | test | 两个 spec 的 baseline 跟上新增断言（guard 2 抓的） |
| `b3d584c` | 18:14 | docs | 未扫描表三行已过期（散射成因、acquireAccountByKey、total_tokens），补两行新的 |
| `2815f61` | 18:16 | docs | 交接说明 2026-08-04 (B) + 索引重排 |
| `8024860` | 20:12 | fix | ◆ mutate-verify 在 FORCE_COLOR 环境下恒报 baseline 不绿（+72 行，详见 §4） |
| `087be35` | 20:24 | feat | ◆ 拆开 retry-on-empty 与 thinking-only rescue 的预算（+292 行/3 文件，详见 §2-2） |
| `57245ed` | 20:27 | test | 两条突变写太宽，把套件变成无界循环（guard 5 抓的） |
| `78e8aec` | 20:30 | test | backoff 倍数是有据可查的漏网，修正一句过度声明 |
| `82788fa` | 20:34 | test | 四条断言从未在任何突变下失败过，逐条处置 |
| `577dfaa` | 20:38 | docs | 第十一轮 —— 接手核实、#240、FORCE_COLOR、四个坏探针 |
| `db5658f` | 20:52 | release | chore(release): v3.9.14 |
| `1e48fcc` | 21:03 | docs | 交接说明 2026-08-04 (C) + 索引指向它 |
| `b9457b8` | 21:33 | docs | 核实并修掉六处会误导读者的地方 |
| `6a664ae` | 23:47 | fix | ◆ 模型面板与 /v1/models 对 connect 命名空间零重叠（#234，+331 行/6 文件，详见 §2-5） |
| `e609e89` | 23:48 | test | dashboard/v1-models parity 的突变 spec（11 条，+76 行） |
| `45d7e31` | 23:51 | test | connectSelector 那条 anchor 匹配两次，guard 3 拒绝（静默 no-op） |

### 08-05（45 条）

| hash | 时间 | 分类 | 账目 |
|---|---|---|---|
| `19636a9` | 00:03 | fix | ◆ Cascade 流式路径此前不记 per-account 消费（K8，+218 行/2 文件，详见 §5-19） |
| `61a7452` | 00:04 | docs | 第十二轮 —— 并更正上一轮一句假话 |
| `7b5cfe9` | 00:06 | docs | 两个默认开的反指纹开关此前无文档 |
| `7f408e8` | 00:27 | fix | 删掉上一个 commit 加的死代码 + 如实标记一条漏网（突变抓的） |
| `c0bf04f` | 00:29 | ci | 九个 action 升 node24 运行时，消 deprecation 警告 |
| `71127dc` | 00:37 | fix,test | ◆ 更正我自己那条更正 —— 守卫一直在，门禁抓到的（详见 §2-14） |
| `a9e8a49` | 00:44 | feat | ◆ ModelConfig #15 对齐 devin.exe —— session reuse 下 #15.1 稳定、#15.2 单调（opt-in，+184 行/6 文件，详见 §2-1） |
| `c76281b` | 00:47 | release | chore(release): v3.9.15 |
| `ee03af7` | 01:05 | docs | 交接说明 2026-08-04 (D) + 索引指向它 |
| `1805ce9` | 01:16 | feat | ◆ 面板显示每个模型现在吃不吃配额（#235，+147 行/6 文件，详见 §2-5） |
| `3939267` | 01:21 | test | 未知成本断言只守了一个方向，漏掉的是危险的那个（+12 行） |
| `d4845cb` | 01:26 | release | chore(release): v3.9.16 |
| `9bbab01` | 01:31 | feat | ◆ 会话内 reasoning 尾摘要的存储与回注（Thinking-core T1+T2）+ T4 出口去重（+509 行/8 文件，详见 §2-1） |
| `5acf2ca` | 01:36 | test | T1+T2+T4 补 9 条突变 + 缓存 A/B 探针入库（+155 行） |
| `93ae320` | 01:39 | fix | ◆ 破折号写法的 glm-5-2 拿到模型会忽略的工具方言 —— 两种写法映射同一 id 掩盖缺陷（+44 行/2 文件，详见 §2-4） |
| `1ce5a37` | 01:41 | release | chore(release): v3.9.17 |
| `6480f24` | 01:50 | docs | 交接说明 2026-08-04 (E) + 索引指向它 |
| `3d49657` | 03:18 | docs | 九份交接导航修掉 + 防再长的约定 |
| `47a1d12` | 05:15 | test | strict-usage-total 的 baseline 跟上被删的那条断言 |
| `628dbd9` | 05:22 | docs | 索引「master == v3.9.17」已不成立，指路新 §0.1 |
| `1e2aaea` | 05:34 | merge | Merge PR #241（rescue nudge 引用 reasoning 尾） |
| `eedf274` | 05:38 | fix | ◆ digest 上限缺钳 —— `1e9` 会把整段 reasoning 塞进每条 nudge（+97 行/3 文件，详见 §2-2） |
| `9830571` | 05:40 | test | #241 打断两条既有 anchor + 新钳补 6 条突变 |
| `87bd1e9` | 05:46 | test | baseline 改成实测的 79 —— 上一个 commit 里我把它算错了 |
| `45e5499` | 06:16 | docs | 台账第十三轮 + 交接 §6（#241 已合）+ 修两条不实自救说明 |
| `d7d043e` | 06:23 | docs | #241 记入台账（warelik，S 档） |
| `0e16817` | 06:36 | release | chore(release): v3.9.18（tag 实际打在 06:38 的 5d2bb53 上） |
| `5d2bb53` | 06:38 | docs | 交接 E 收口（v3.9.18 已发）+ 留两条给下一轮 |
| `025bb73` | 07:16 | fix | ◆ reasoning continuity 预算钮补 ceiling 钳 —— 同 #241 DIGEST_MAX_CEILING 的课后作业（+14 行，详见 §2-1） |
| `e980bc2` | 07:34 | docs | 把 #226 的 stable-from-turn-1 注释指回 findExistingState 的根锚分支（+2 行） |
| `2525ba9` | 08:09 | refactor | ◆ T4 去重上提到根 —— 一个决策点喂全部四个出口协议（+284/-235 行/9 文件，详见 §2-1） |
| `b7ee979` | 13:07 | feat | ◆ think-text reroute —— 切断 reasoning-as-text 毒环（Thinking-core item 1，+298 行/5 文件，详见 §2-1） |
| `aaaf212` | 15:37 | fix | non-stream 路径也做 leading think-tag 重路由（+67 行） |
| `23080a5` | 16:30 | test | baseline retry-rescue 81→83（上游 2451ec8 加了 2 个 fractional cap 测试）〔俄语〕 |
| `f7fde90` | 16:38 | test | think-text reroute 突变 spec 3 条（禁重路由/丢未终止/缓冲区被移除）〔俄语〕 |
| `d713ac9` | 17:17 | test | reasoning-continuity.json 补 expectBaselinePass=292（docs-consistency-guard 要数字）〔俄语〕 |
| `2451ec8` | 18:08 | fix | ◆ digest 上限漏另一半 —— `0.5` 同样等于「不设上限」（+56 行/4 文件，详见 §2-2） |
| `76df59b` | 18:26 | docs | 发版后复核查出的文档漂移 —— 含一处发布出去的版本归属错误 |
| `a916f8e` | 18:49 | test | 我自己的 Math.floor 打断了我自己写的 anchor |
| `a1eeba6` | 19:02 | release | chore(release): v3.9.19 |
| `866da63` | 20:07 | refactor | 删掉 rescueThinkingOnly —— 它已经是死配置（+18/-10 行） |
| `12eaac7` | 20:14 | fix,docs | 复核剩下五条 —— 台账补齐、日期口径、首页重复标签 |
| `f143ef1` | 20:41 | docs | 起新交接 2026-08-06，九份横幅改指它，索引归档表补 E |
| `b067c7d` | 22:06 | docs | 发版说明照着做会被自己的钩子拒绝 —— 改对并把一致性做成守卫 |
| `7d004ec` | 22:18 | docs | 交接补 §7 文档梳理 + §8 未做的那一条，门禁数字跟上 |

### 08-06（34 条）

| hash | 时间 | 分类 | 账目 |
|---|---|---|---|
| `aeb18dd` | 05:01 | fix | ◆ gemini 无法解析的 tool args 静默丢弃全部参数 —— 解析失败不丢参数、记日志（B4 parity 第七次，+297 行/4 文件，详见 §2-6） |
| `20fdbef` | 05:02 | test | 那条漏网是我的突变锚错了，不是守卫有洞 |
| `0fedab1` | 05:03 | test | gemini 那条声明漏网不成立 —— 捕获日志的手法仓库里早就有 |
| `b3594f2` | 05:28 | docs | 索引把 master 声明成一个不存在的 tag —— 修对，并把版本声明做成守卫 |
| `3cb8f3a` | 06:01 | release | chore(release): v3.9.20（tag 实际打在 06:29 的 4f05a71 上） |
| `4f05a71` | 06:20 | fix | ◆ 版本守卫在浅克隆里假红 + 分不清历史声明与当前声明（详见 §4） |
| `1e1d7e7` | 06:43 | docs | v3.9.20 已发 —— 交接与台账跟上，记下那个只在 CI 里坏的探针 |
| `c3ac2b2` | 07:09 | docs | 视觉开关两个 README 和 .env.example 都没有 —— 补齐并做成守卫 |
| `967a4e9` | 07:45 | docs | 两句 response store 的保证写得比事实强 |
| `7b99c8e` | 08:01 | fix | ◆ 零内容 + 无终止信号也必须报错，不能报完成（messages+gemini，+384 行/4 文件，详见 §2-6） |
| `6d1f087` | 08:02 | fix | ◆ response-store 四条「注释说对了、实现只覆盖一个特例」（+998 行/5 文件，详见 §2-6） |
| `aa373e4` | 08:04 | test | 四条缺陷的突变规格 22 条，锚点全是表达式（+147 行） |
| `17099c1` | 08:07 | fix | ◆ $ref 内联只防环不防扇出 —— 加全局节点预算（+469 行/3 文件，详见 §2-6） |
| `7bca624` | 08:24 | fix | ◆ identity-neutralize 跨段落 `[\s\S]*?` 把调用方自己的指令删了（+503 行/3 文件，详见 §2-6） |
| `129682f` | 08:44 | fix | ◆ intent-extractor 从反例说明里伪造工具调用 —— 客户端会去执行它（+351 行/3 文件，详见 §2-6） |
| `c5bb28e` | 08:45 | test | 那条漏网是真缺口 —— 我只测了「否定在调用之后」 |
| `e81cde7` | 08:45 | merge | Merge fix/nlu-negation-and-arg-slot |
| `b8e770a` | 08:45 | merge | Merge fix/identity-neutralize-paragraph-bound |
| `d89a00c` | 08:45 | merge | Merge fix/schema-ref-fanout-budget |
| `cc4c577` | 08:45 | merge | Merge fix/zero-content-stream-death |
| `714ebbb` | 08:45 | merge | Merge fix/response-store-four-defects |
| `c70ed2c` | 09:01 | docs | 补 RESPONSE_STORE_MAX_AGE_MS —— 空闲超时之外的绝对上界 |
| `43dc10f` | 10:07 | test | D2 那条漏网的前提是实测的，不是「守卫有洞」 |
| `54061cb` | 10:20 | test | tool_call_id 那条断言从没驱动过它守的条件 |
| `a992188` | 10:23 | test | 白名单每一项都要被「它是最大字段」驱动过一次 |
| `a7326da` | 10:29 | test | 「重写不重启绝对时钟」那条测不出来 —— 时序问题如实记下 |
| `3d4332a` | 17:53 | fix | ◆ PR #242 review 返工 —— 砍 T4 出口去重、单条 __incomingThinking 路径、digest 转义（-262 行/12 文件，详见 §2-1） |
| `69fec13` | 17:56 | fix | ◆ leading think-tag 重路由上移到事件级、在 #238 rescue 之前执行（+201 行/5 文件，详见 §2-1） |
| `185721f` | 17:57 | test | retry-rescue baseline 83→82（T4 verbatim 测试移除） |
| `16a8e09` | 17:58 | feat | ◆ 增量 content/reasoning 前缀去重（T4 rework，+318 行/5 文件，详见 §2-1） |
| `5b4d431` | 17:58 | feat | ◆ 客户端历史压缩后靠 root anchor 重关联 + 尾锚重叠（+211 行/4 文件，详见 §2-1） |
| `dd5f5a1` | 18:06 | test | retry-rescue-budget-split baseline 81→86（5 条 connect-layer think-text pin 测试） |
| `8864b58` | 18:10 | feat | ◆ WINDSURFAPI_LEAK_TRACE 结构化 reasoning/内容边界日志（默认 OFF，+312 行/8 文件，详见 §4） |
| `785a198` | 23:00 | test | 修分叉后 prefix 断言 + 加 latch 测试（+15 行） |

### 08-07（10 条）

| hash | 时间 | 分类 | 账目 |
|---|---|---|---|
| `ecc1e4f` | 00:02 | test | compaction-survival 突变 spec —— 根回退守卫、歧义规则、TTL 驱逐（baseline 34，+27 行） |
| `8313cf0` | 00:04 | test | 根回退的 TTL 驱逐钉死（baseline 35，+23 行） |
| `4bd21ee` | 00:21 | style | leak-trace 尾换行（+3/-3 行） |
| `e78fd93` | 06:14 | chore | think-reroute review nits —— 删死 suffixPrefixLen、单行 emit 守卫（-11 行） |
| `d4d416f` | 06:15 | fix | ◆ 根回退重关联必须完整重建新 pair 窗口（-6 行，详见 §2-1） |
| `6ac6b9e` | 06:21 | chore | session-fidelity review nits —— 计数上限常量、单行 thinking 累积（+3/-4 行） |
| `898af0f` | 19:52 | fix | ◆ SWE 全家模型路由到 kimi_k2 方言（+18 行/2 文件，详见 §2-9） |
| `b6e7dc9` | 23:15 | fix | ◆ 四出口路径 eleven 个客户端可见缺陷（+2231 行/21 文件，详见 §2-6） |
| `1d5c416` | 23:15 | fix | ◆ identity-neutralize 要报「长度增加的重写」，不只报过度删除（+256 行/4 文件，详见 §2-6） |
| `0487ba2` | 23:18 | chore | ◆ 脏树突变 harness + round-15 ledger（+266 行/3 文件，详见 §4） |

### 08-08（12 条）

| hash | 时间 | 分类 | 账目 |
|---|---|---|---|
| `51846e0` | 00:11 | release | chore(release): 3.9.21（eleven defects 主体） |
| `26b939b` | 10:21 | fix | ◆ 只抑制全长的逐字重复；失败路径 release()；持有上限 1 MiB（+138 行/5 文件，详见 §2-1） |
| `089a3ba` | 10:30 | fix | T2 fallback fixtures 两处提交点 + 计数钳 n<1 + trail 顺序文档（+148 行/4 文件） |
| `61871e1` | 10:33 | fix | think-reroute 与 rescue 的诚实 interplay 注释 + 钉死 history/replay 隔离（+33 行） |
| `a6c41ef` | 10:39 | fix | leak-trace：`<think>` 方言进 THINK_MARKERS；失败出口定 outcome；量化日志体积（+70 行/5 文件） |
| `a79c58f` | 10:57 | chore | retry-rescue-budget-split baseline 86→87（本分支新增 history-isolation 测试） |
| `0755b35` | 11:05 | test | 钉住小数计数边界（0.5→5、0→5、1.9→1，+6 行） |
| `fcd72b3` | 16:38 | fix | chars 旋钮 `''`/小数解析回退默认 4000（+11 行） |
| `64f9505` | 16:43 | test | chars clamp 分数洞突变入 reasoning-continuity spec（+6 行） |
| `9b25272` | 17:23 | feat | ◆ LEAK_TRACE 覆盖 think-reroute 内容路径 —— classifier 分支不再绕过流事件追踪（+36 行/2 文件，详见 §4） |
| `3f552de` | 19:21 | fix | ◆ 全长抑制受 wantThinking 门控（+44 行/5 文件，详见 §2-1） |
| `895b5dc` | 19:24 | test | dedup spec baseline 修正（13 不是 14）+ 测试头记录 wantThinking 门 |

### 08-09（30 条）

| hash | 时间 | 分类 | 账目 |
|---|---|---|---|
| `7524d52` | 11:05 | docs | 修两处与代码相反的说明 —— 模型目录来源、CASCADE_REUSE_HASH_SYSTEM 默认值（+6 行） |
| `0cfa377` | 11:23 | merge | Merge PR #247（增量 reasoning/content 去重，+461 行） |
| `b87ac6a` | 11:29 | feat | ◆ WINDSURFAPI_REASONING_DEDUP off-switch —— 默认开、可关（+105 行/3 文件，详见 §2-1） |
| `d7ac4e6` | 11:45 | test | baseline 13→18 是 #247 off-switch 测试加的，不是套件坏了 |
| `dc5d487` | 11:48 | merge | Merge PR #243（leading think-tag 重路由） |
| `1030b43` | 12:22 | merge | Merge PR #242（session fidelity，+255 行） |
| `44eeac5` | 12:22 | test | retry-rescue baseline →88（实测）—— #242 与 #243 各自量对、叠起来都错 |
| `2b42fe4` | 12:30 | merge | ◆ Merge PR #248（root-anchor fallback 抗压缩，+274 行/5 文件，详见 §2-1） |
| `0da8e02` | 13:06 | test | reasoning-continuity baseline 289→300（实测）—— #243/#248 往同一批文件加了测试 |
| `ba4d768` | 19:03 | docs | warelik 四条（#243 S+/#242 S/#248 A/#247 S）记入台账（+80 行） |
| `337c76d` | 18:37 | fix | ◆ 补全 swe kimi tool-call 支持（+617 行/10 文件，详见 §2-9） |
| `6cc2886` | 20:15 | fix | ◆ 从 kimi 方言排除 swe lightning —— 上一条过度推广的修正（+11 行/3 文件，详见 §2-9） |
| `db85abe` | 20:52 | feat | ◆ 把三类复发缺陷从「合并后才暴露」变成「CI 拦截」（+500 行/7 文件，详见 §4） |
| `27cb230` | 22:06 | fix | ◆ Firebase API_KEY_HTTP_REFERRER_BLOCKED → ERR_HTTP_REFERRER_BLOCKED + x-client-version 头（+208 行/5 文件，详见 §2-6） |
| `489f31d` | 22:09 | feat | ◆ rate-limit 历史环缓冲 —— dashboard triage 用（+250 行/4 文件，详见 §2-6） |
| `ba4b659` | 22:10 | refactor | rate-limit ring accessor 返回整环 —— 溢出可观察 |
| `6dcd0a9` | 22:24 | fix | ◆ CompletionConfiguration #2/#3 tag 互换（max_tokens/max_newlines，+134 行/5 文件，详见 §2-6） |
| `9aa22ce` | 22:25 | fix | ◆ responses 在 terminal event 后补发 trailing data:[DONE]（+196 行/4 文件，详见 §2-6） |
| `ebcc99f` | 22:27 | merge | Merge 6dcd0a9 into feat/research-gaps |
| `2646b40` | 22:27 | merge | Merge ba4b659 into feat/research-gaps |
| `97d16da` | 22:27 | merge | Merge 27cb230 into feat/research-gaps |
| `e0c3438` | 22:27 | merge | Merge 9aa22ce into feat/research-gaps |
| `e42b4b9` | 22:32 | docs | 更正 max_tokens tag —— #3 是 max_newlines，两个历史探针测的都不是上限（+20 行） |
| `41777a7` | 23:11 | fix | ◆ 修对抗式 review 挖出的 4 处真缺陷（login/devin-connect/responses，+111 行/6 文件，详见 §2-6） |
| `a01a9d3` | 23:14 | test | 三条锚点跟着上一 commit 改动更新 |
| `a4ca41a` | 23:16 | test | ◆ 补真实 403 envelope 用例 —— 修的那个形状原本没测（+30 行，详见 §2-6） |
| `29b2215` | 23:44 | fix | ◆ #250 Cascade 流路径接入 think 重路由防御（+495 行/5 文件，详见 §2-1） |
| `af0db0d` | 23:45 | fix | #250 修正 mutation spec 的 baseline 计数（harness 口径 26 而非 44） |
| `1fb1e8a` | 16:10 | test | leak-trace 加 client-abort fixture 与 outcome mutation（+38 行） |
| `d6740e2` | 16:11 | test | 调整 mutation spec 锚点缩进 |

### 08-10（7 条）

| hash | 时间 | 分类 | 账目 |
|---|---|---|---|
| `4f8f801` | 01:17 | feat | ◆ 保留上游模型能力数据 + tier 预检 —— 不再花一次往返才知道用不了（+284 行/4 文件，详见 §5-35） |
| `d11ce66` | 01:34 | feat | ◆ credit_cost 可从顶层 #14 读 —— 支持 ^ 前缀 + 顶层校准 dump（+110 行/3 文件，详见 §5-36） |
| `fb51a13` | 02:14 | feat | ◆ GetUserJwt 短期凭证路径（默认关）+ epoch 反重入守卫（+502 行/3 文件，详见 §5-37） |
| `97e0626` | 00:20 | fix | ◆ #250 错误路径释放 accThinking —— 对抗 review 挖出的 emulateTools 泄漏（+85 行/3 文件，详见 §2-1） |
| `8e1faf1` | 00:24 | fix | ◆ think-classifier 栈式互递归改迭代循环 —— 深链不再爆栈（+62 行/4 文件，详见 §2-1） |
| `ea2cefa` | 00:27 | merge | Merge feat/research-gaps —— 四修复 + #250 Cascade 防线 + 对抗 review 修正 |
| `4ee53b8` | 00:32 | merge | Merge commit '8e1faf1' |

**片外补充（master，08-10，任务点名的守卫三连崩，不在 256 条内，hash 已核实）**：

| hash | 时间 | 分类 | 账目 |
|---|---|---|---|
| `a98a572` | 04:36 | fix | 默认开开关的发现机制漏掉一种写法 —— 一个真开关一直不在台账里（+14 行） |
| `3af3f63` | 04:45 | fix | 发现机制还漏 `??` 写法 —— 又挖出两个未登记的开关（+21/-8 行） |
| `c374ec7` | 08:26 | fix | 发现机制再补 `=== '0'` 形式 —— 又挖出 5 个未登记开关（+62 行） |

---

## §2 问题链清单（11 条完整链）

### 2-1 会话保真三线 #242 / #243 / #248 / #250 —— 本片最大主线（08-05 ~ 08-10）

**#242 线（reasoning continuity，核心 9bbab01 → 合并 1030b43）**
1. `9bbab01`（08-05 01:31，+509 行）核心实现：会话内 reasoning 尾摘要的存储与回注（T1+T2）+ T4 出口去重。
2. `a9e8a49`（08-05 00:44，+184 行）ModelConfig #15 对齐 devin.exe：session reuse 下 #15.1 稳定、#15.2 单调（opt-in）。
3. `5acf2ca`（08-05 01:36）给 T1+T2+T4 补 9 条突变 + 缓存 A/B 探针入库。
4. `025bb73`（08-05 07:16）预算钮补 ceiling 钳 —— 同 #241 DIGEST_MAX_CEILING 的课后作业（把 #241 的教训提前应用）。
5. `2525ba9`（08-05 08:09）T4 去重上提到根 —— 一个决策点喂全部四个出口协议（+284/-235 行）。
6. `3d4332a`（08-06 17:53）**review 返工**：砍 T4 出口去重、收敛单条 `__incomingThinking` 路径、digest 转义（-262 行 —— 比实现的增量还大的减法）。
7. `69fec13`（08-06 17:56）think-tag 重路由上移到事件级、在 #238 rescue 之前执行。
8. `1030b43`（08-09 12:22）**合并** PR #242。
9. 合并后修正：`44eeac5`（08-09 12:22）retry-rescue baseline →88 实测（#242 与 #243 各自量对、叠起来都错）；`0da8e02`（08-09 13:06）reasoning-continuity baseline 289→300 实测。

**#243 线（think-text reroute，核心 b7ee979 → 合并 dc5d487）**
1. `b7ee979`（08-05 13:07，+298 行）核心：think-text reroute 上线，切断 reasoning-as-text 毒环（Thinking-core item 1）。
2. `aaaf212`（08-05 15:37）non-stream 路径补全。
3. `23080a5` / `f7fde90` / `d713ac9`（08-05 16:30~17:17，俄语 subject）三条突变规格与 baseline 跟进。
4. `69fec13`（08-06 17:56）重路由移到事件级、在 #238 rescue 之前（与 #242 共享的返工）。
5. `e78fd93`（08-07 06:14）review nits：删死 suffixPrefixLen、单行 emit 守卫。
6. `61871e1`（08-08 10:33）honest rescue-interplay 注释 + 钉死 history/replay 隔离。
7. `dc5d487`（08-09 11:48）**合并** PR #243。

**#248 线（session continuity 抗压缩，核心 5b4d431 → 合并 2b42fe4）**
1. `5b4d431`（08-06 17:58，+211 行）核心：客户端历史压缩后靠 root anchor + tail-anchored overlap 重关联，reuse 日志带 acct=。
2. `d4d416f`（08-07 06:15）根回退重关联必须完整重建新 pair 窗口。
3. `ecc1e4f` / `8313cf0`（08-07 00:02/00:04）compaction-survival 突变 spec（baseline 34）+ TTL 驱逐钉死（35）。
4. `089a3ba`（08-08 10:30）T2 fallback fixtures 两处提交点 + 计数钳 n<1。
5. `0755b35` / `fcd72b3` / `64f9505`（08-08 11:05~16:43）小数计数边界钉死（0.5→5、0→5、1.9→1）、chars 旋钮 `''` 回退 4000、分数洞突变。
6. `2b42fe4`（08-09 12:30）**合并** PR #248。
7. 合并后：`a79c58f`（08-08 10:57 实为合并前本分支）baseline 86→87。

**#250 线（Cascade think 防线 + classifier，08-09 晚 ~ 08-10 凌晨）**
1. `29b2215`（08-09 23:44，+495 行）核心：Cascade 流路径接入 think 重路由防御（+345 行测试）。
2. `af0db0d`（08-09 23:45）修正 mutation spec baseline（harness 口径 26 而非 44）。
3. `97e0626`（08-10 00:20）**对抗 review 挖出** emulateTools 泄漏 —— 错误路径释放 accThinking（+85 行）。
4. `8e1faf1`（08-10 00:24）think-classifier 栈式互递归改迭代循环 —— 深链不再爆栈（+62 行）。
5. `ea2cefa`（08-10 00:27）+ `4ee53b8`（00:32）**合并** feat/research-gaps。

**三线交汇的依赖事实**：`44eeac5` 与 `0da8e02` 两笔 baseline 修正说明 #242/#243/#248 在合并时互相踩锚点 —— 三条线在同一批文件（session-continuity.js、devin-connect*.js、messages 系）上工作，基线只能实测校准，这也是 §4 突变工具必须存在的原因。

### 2-2 #238 → #241 rescue nudge 链（793ed79 → 0f5a57b → eedf274 → 2451ec8）

1. `793ed79`（08-02 17:42，+178 行）**#238 核心**：rescue thinking-only 以 corrective nudge 收尾 —— swe-1-7 死循环解锁 + 丢毒化空 assistant turn。
2. `14745a8`（08-03 15:40）Merge PR #238。
3. `3d46f59`（08-03 16:02）推理提升成 content 时同一段文字返回两遍（合并后立刻暴露的缺陷）。
4. `9ef10b4`（08-03 16:06）每次 rescue 尝试的输出被拼进同一个答案（同批暴露）。
5. `0f5a57b`（08-03 21:01，+530 行）**#241 layer 2**：nudge 引用失败尝试的 reasoning 尾 —— 每次救援一条新 nudge、field-0 守卫。注意：此 commit 日期在 08-03 但走 #241 分支，08-05 才合并 —— v1 归在 08-05 线，实为 08-03 写好的分支 commit。
6. `087be35`（08-04 20:24）拆开 retry-on-empty 与 thinking-only rescue 的预算（+292 行）—— 为 #241 让路。
7. `1e2aaea`（08-05 05:34）**合并** PR #241。
8. `eedf274`（08-05 05:38）**digest 上限钳第一半**：`1e9` 会把整段 reasoning 塞进每条 nudge（+97 行）。
9. `9830571` / `87bd1e9`（08-05 05:40/05:46）#241 打断两条既有 anchor + 新钳补 6 条突变；baseline 实测 79。
10. `2451ec8`（08-05 18:08）**digest 上限钳第二半**：`0.5` 同样等于「不设上限」—— 钳的实现只挡了数值巨大的一端，没挡「无上限语义」的一端，两次复核才齐。
11. `866da63`（08-05 20:07）删掉 rescueThinkingOnly 死配置（#241 之后 rescueThinkingOnly 已无行为后果）。

**链的形态**：核心（#238）→ 分支层二（#241，隔两天）→ 合并 → 双侧钳补全（隔 12 小时两半）→ 死配置清理。典型的「功能先上线、语义钳后补齐」路径，`025bb73` 把这条教训抄给了 #242 预算钮。

### 2-3 sticky RPM 修复当天 revert（cbedc1f → 0f1d4f0）

1. `cbedc1f`（08-04 03:36，+350 行）修「60 秒的 RPM 抖动会把会话永久迁走」：加入 transient-pin 逻辑 + 282 行测试。
2. `75857de`（08-04 03:43）fillRpm 自证已触顶。
3. `0f1d4f0`（08-04 03:46）**当天 revert**（-368 行）：实测「保留绑定会散射，比清绑定更贵」，修复方向错误。
4. `68866b3`（08-04 03:49）钉住「抖动即迁移」现状 + 三种做法实测代价（+179 行测试）—— 把结论固化成测试。
5. `1671ca4`（08-04 03:55）台账第七轮自省：sticky 两条积压，一条不该修、一条修错了。
6. 替代方案登场：`95f35cd`（08-04 04:35，+594 行）queue-on-pin —— 对绑定账号短等而不是立刻换号（默认关）。

**链的形态**：修 → 3 小时后自证修错 → revert → 用测试钉住现状 → 换一条更便宜的路（queue-on-pin）。这是本片「先实测再定论」纪律的典型样本。

### 2-4 v3.9.17 glm-5-2 破折号方言（93ae320）

1. `93ae320`（08-05 01:39，+44 行）修「破折号写法的 glm-5-2 拿到这个模型会忽略的工具方言」：resolveConnectSelector 把 `glm-5-2` 与 `glm-5-2——`（破折号变体）映射到同一 id，方言选择被掩盖。
2. `1ce5a37`（08-05 01:41）**2 分钟后发 v3.9.17** —— 本片最短发版间隔（14 分钟从 v3.9.16 到 v3.9.17）由此 commit 触发。
3. 同类缺陷的后续：`898af0f`（08-07）SWE 方言线、`337c76d`/`6cc2886`（08-09）kimi 工具调用补全与排除 —— 方言选择是 8 月反复出问题的面，直到 `4f8f801`（08-10）保留上游能力数据做 tier 预检才系统化。

**链的形态**：单点方言错配 → 立即发版 → 同类问题在方言面上的两轮后续（过度推广→排除）。

### 2-5 #234 面板 parity（6a664ae）

1. `6a664ae`（08-04 23:47，+331 行）模型面板与 /v1/models 对 connect 命名空间**零重叠**（#234）：共享命名空间 + 204 行 parity 测试。
2. `e609e89`（08-04 23:48）parity 突变 spec 11 条。
3. `45d7e31`（08-04 23:51）connectSelector 那条 anchor 匹配两次（guard 3 拒绝静默 no-op）。
4. `1805ce9`（08-05 01:16，+147 行）#235：面板显示每个模型现在吃不吃配额 —— 顺着 #234 的 parity 测试框架扩展。
5. `3939267`（08-05 01:21）未知成本断言只守了一个方向，漏掉的是危险的那个。
6. 后续接线：`19636a9`（08-05 00:03）Cascade 流式不记 per-account 消费（K8）—— 面板数据源的补洞。

**链的形态**：parity 缺口 → 测试框架 → 突变规格 → 顺框架扩展新功能（#235）→ 断言方向修正 → 数据源补洞。

### 2-6 eleven defects 大 patch（b6e7dc9，08-07 23:15，+2231 行/21 文件）

`b6e7dc9` 是单个 commit 内修掉四出口路径（chat/gemini/messages/responses + server）的 11 个客户端可见缺陷，每个缺陷带测试文件 + mutation spec：

| 缺陷 | 修法 | 测试规模 |
|---|---|---|
| bash 前缀修复边界 | 边界修正 | 296 行 + 94 行 spec |
| gemini schema 类型归一 | 类型归一 | 111 行 + 47 行 spec |
| response-id 熵守卫 | 熵守卫 | 39 行 spec |
| responses post-tool text item | 补 text item | 58 行 spec |
| stale answer 拒绝 + store 拒绝 | 拒绝路径 | 46 行 spec |
| retry-after 路由 parity | 路由 parity | （并入主文件） |
| terminal event 守卫 | 守卫 | （并入主文件） |
| usage unknown ≠ zero | 三态化 | （并入主文件） |
| …其余三项 | 协议对齐 | （并入主文件） |

**同批前驱与后继**：
- 前驱（08-06 上午的审计轮，五个 fix 分支并行）：`7b99c8e`（零内容+无终止报错，+384 行）、`6d1f087`（response-store 四条「注释对、实现只盖一个特例」，+998 行）、`17099c1`（$ref 防环不防扇出，+469 行）、`7bca624`（identity-neutralize 跨段落误删指令，+503 行）、`129682f`（intent-extractor 伪造工具调用，+351 行），08-06 08:45 五连 Merge。
- 后继（08-09 research-gaps 四修复）：`27cb230`（Firebase 403 映射）、`489f31d`（rate-limit 历史环）、`6dcd0a9`（#2/#3 tag 互换）、`9aa22ce`（trailing DONE）、`41777a7`（对抗 review 4 处真缺陷）、`a4ca41a`（真实 403 用例）。
- `1d5c416`（08-07 23:15，与 b6e7dc9 同时刻）identity-neutralize 只报过度删除 → 补长度增加型重写报告。

**链的形态**：审计轮五个独立 fix 分支（同刻合并）→ 汇总成大 patch 发 v3.9.21 → 两天后 research-gaps 又挖出 4 处真缺陷 —— 「修完一轮总有下一轮」，直到 db85abe（08-09）把三类复发缺陷搬进 CI。

### 2-7 断连吞 429 冷却（68da125）

1. `68da125`（08-02 19:32，+348 行）两个缺陷一起修：客户端断连吞掉上游 429 冷却窗口（断连即丢弃冷却状态）+ 上游 aborted 被当成客户端断连（归因错乱）。修法：断连/中止两态分流 + 267 行测试。
2. 相关线：`6c0c09d`（08-03 03:50）socket 码仍在驱逐健康账号 + 三条源码守卫放过自己要抓的缺陷（+267 行）—— 断连归因的第二次修正。
3. `1fb1e8a`（08-09 16:10）leak-trace 加 client-abort fixture 与 outcome mutation —— 这条线的行为被钉进测试。

**链的形态**：两态分流 → 次日发现 socket 码误判健康账号（同主题二修）→ 一周后测试基建补漏。

### 2-8 分片反噬 #37（aaf487c，08-04 一批）

1. `aaf487c`（08-04 07:22，+39 行）核心修复：caller 分片把最忙的账号提到队首，反噬 issue #37 的并发散射 —— 只在打平前缀内置换。
2. `2567bbb`（08-04 07:26）散射归因 + 分片只在打平前缀内置换的守卫（+430 行）。
3. `d03b35d`（07:26）突变 spec 6 条；`a919fc5`/`574d3bc`（07:27/07:29）隔离 tie 判据的 in-flight 与 RPM 比例项 —— 都不是冗余；`7bf4bc9`（07:30）lastUsed 标为漏网；`53f0666`（08:30）「最忙的账号不会被提上来」是恒真断言；`1dc2527`（07:32）删掉被 tied-prefix 边界吸收的分片门槛。
4. **返工链**：`d0b9c9f`（08:43）声称补了排序的 trouble 项 → `8449002`（08:51）承认上一个 commit 声称改了但没改到，真补上。
5. `2c3faa4`（14:05）strictPin 缺 isStickyEnabled() 检查 —— 面板 flag 能豁免分片边界（+77 行）。
6. `9ea888c`（14:07）隔离 tie 判据的 quota 项。

**链的形态**：核心修复 → 守卫与隔离测试铺开（把 tie 判据逐项证伪/证实）→ 自我返工（声称改了没改到）→ 边缘豁免封堵。11 条 commit 在 7 小时内完成，是 08-04 上午的密集区。

### 2-9 SWE kimi 方言过度推广（898af0f → 6cc2886）

1. `898af0f`（08-07 19:52，+18 行）SWE 全家模型路由到 kimi_k2 方言（5 行 + 测试）。
2. `337c76d`（08-09 18:37，+617 行）补全 swe kimi tool-call 支持（302 行 tool-emulation 重写 + 163 行测试 + wire fixture）。
3. `6cc2886`（08-09 20:15，+11 行）**修正过度推广**：从 kimi 方言排除 swe lightning —— swe lightning 并不吃 kimi_k2 方言。
4. `4f8f801`（08-10 01:17，+284 行）系统化：保留上游模型能力数据 + tier 预检 —— 不再靠试错发现「这个模型用不了」，方言问题进入数据驱动。

**链的形态**：一刀切（5 行）→ 大规模补全（617 行）→ 发现一刀切过头、排除一个成员 → 数据驱动收编。方言路由从硬编码走向能力数据，是本片「方言面」的终局。

### 2-10 守卫三连崩（a98a572 → 3af3f63 → c374ec7）〔片外，master，08-10〕

1. `a98a572`（08-10 04:36，+14 行）默认开开关的发现机制漏掉一种写法 —— 一个真开关一直不在台账里。
2. `3af3f63`（08-10 04:45，+21/-8 行）发现机制还漏 `??` 写法 —— 又挖出两个未登记的开关。
3. `c374ec7`（08-10 08:26，+62 行）再补 `=== '0'` 形式 —— 又挖出 5 个未登记开关。

**链的形态**：同一个「默认开开关发现机制」三次补洞，每补一次挖出一批新开关（1→2→5）—— 说明写的守卫与它扫描的代码形态存在系统性的表示盲区。与 `db85abe`（08-09，default-on-switch-registry.test.js +167 行）同源：正是那天的开关注册表守卫，两天后暴露「发现机制」本身写不全。三连崩验证了 §4 的结论 —— 工具要有自检（`5f1403f` 的教训），否则工具本身成为最大的洞。

### 2-11 干旱门禁三连（d9ed81f → a8b9af2 → 1c5274e）

1. `d9ed81f`（08-03 19:12）单个账号即可宣布全池干旱 —— 干旱判定要求最低已知覆盖率（+201 行）。
2. `a8b9af2`（08-03 19:23）干旱谓词跨了命名空间 —— 新增 connect selector 专用判定（+227 行）。
3. `1c5274e`（08-03 19:28）干旱门禁在生产默认后端结构性不可达 —— 接进 connect 短路块（+280 行）。
4. 加固：`2c64fca`（08-03 15:18）转义函数与干旱横幅零行为覆盖 → 真执行；`a9f0a0b`（08-03 21:33）208 个转义调用点无守卫。

**链的形态**：三个独立缺陷逐层叠加（误判→跨命名空间→结构性不可达），每层都是上一层修完后暴露的下一层。同日 v3.9.8 发布。

### 2-12 诚实降级三协议（f23d9c7 → ae2f4a4）

1. `f23d9c7`（08-03 23:53）STRICT_MODEL=0 降级后 chat 响应谎报付费模型名（+169 行）。
2. `d4d7253`（08-03 23:56）补 AssignModel 注入 seam。
3. `ae2f4a4`（08-04 00:37）messages/gemini 两条协议路由仍在谎报（+71 行）—— chat 修完发现另两条也坏。
4. 守卫三连：`16fcb5d`/`6df32f9`/`b43794f`（00:39~00:42）流式 message_start、流式/非流式 modelVersion 守卫。
5. `31fa424`（08-04 00:29，同批）订阅取消对账号池不可见 —— 明确信号被丢进 lastError。
6. v3.9.10（01:15）发布，tag 注明「订阅取消不可见 + 三条协议路由谎报模型名」。

**链的形态**：一条协议修好 → 发现另外两条同病 → 三个守卫补上 → 同批再挖出订阅取消信号问题。08-04 凌晨 1 小时的密集修复批，直接触发 v3.9.10。

### 2-13 hook 探针自打脸（7a8ebfe → a57a83c）+ 守卫三连的 hook 侧

1. `7c7366d`（08-04 15:37）pre-commit 作用范围被注释夸大 → 补 post-commit 兜住两条路径。
2. `eb9d4a0` / `e155ced`（15:39/15:42）hook 作用范围文档改实测结果（先英文后中文，两段式）。
3. `7a8ebfe`（16:30）**探针结论一**：git revert 根本不跑 post-commit。
4. `a57a83c`（16:31）**探针结论二**：更正 —— git revert 确实会跑 post-commit，我的探针是坏的。
5. `135b9e3`（16:39）台账补记：用坏探针得出错误结论。

**链的形态**：文档夸大 → 修实现 → 写探针验证 → 探针本身坏 → 同分钟更正。`a57a83c` 比 `7a8ebfe` 晚 1 分钟，是本片「更正自己」最快的纪录之一。与 2-10 的守卫三连崩同构：**探针/守卫是工具，工具要有自检**。

### 2-14 版本声明三改（b3594f2 → 4f05a71）

1. `b3594f2`（08-06 05:28）索引把 master 声明成不存在的 tag —— 修对并把版本声明做成守卫。
2. `4f05a71`（08-06 06:20）版本守卫在浅克隆里假红 + 分不清历史声明与当前声明（v3.9.20 tag 打在此 commit 上）。
3. `1e1d7e7`（08-06 06:43）记下那个只在 CI 里坏的探针。
4. `71127dc`（08-05 00:37，前驱）更正自己的更正 —— 守卫一直在，门禁抓到的。

**链的形态**：守卫上线 → 守卫自己假红 → 修守卫（对比 2-13：探针坏了先甩锅给被探对象，这次守卫假红直接归因给环境）。

---

## §3 发版节奏表 v3.9.8 ~ v3.9.21（14 版 / 6 天）

时间用 annotated tag 创建时间（`git for-each-ref`），比 commit 时间晚 2~28 分钟；v1 用 release commit 时间，略有出入（见 §6）。

| 版本 | tag 时间 | 距上一版 | 核心修复（tag 说明 + 主体 commit） |
|---|---|---|---|
| v3.9.8 | 08-03 20:12 | — | #234/#235/#239 主体：干旱门禁结构性不可达（1c5274e）、connect 目录 latch（b0989ac）、credit 费率表接上（d032386）、突变验证成默认手段 |
| v3.9.9 | 08-03 21:58 | 1h46m | 三条积压缺陷 + 两条守卫补缺：已删账号模型仍被宣传（d42f3a5）、connect selector 互相驱逐（ef80bde）、TTL 偶发失败 |
| v3.9.10 | 08-04 01:19 | 3h21m | 订阅取消对账号池不可见（31fa424）+ 三条协议路由谎报降级模型名（f23d9c7/ae2f4a4） |
| v3.9.11 | 08-04 01:52 | **33m** | 守卫与 sticky 积压，三项里两项是真缺陷：stickyNoFallback 永久楔死（756761c）、路由错误分类守卫可绕过（f2d01d2） |
| v3.9.12 | 08-04 06:23 | 4h31m | queue-on-pin 上线（95f35cd，默认关）+ 冷却维度守卫改行为断言（2c680be）+ 两条 sticky 积压结论为「不该按原方案做」（1671ca4） |
| v3.9.13 | 08-04 18:12 | 11h49m | caller 分片反噬 #37（aaf487c）、STRICT_USAGE_TOTAL（f429297，默认关）、突变验证工具化（ebeeb01）、sticky RPM 修复 revert（0f1d4f0） |
| v3.9.14 | 08-04 20:55 | 2h43m | rescue 循环计数器每次记一次命中（087be35 预算拆分）、mutate-verify FORCE_COLOR 假红（8024860） |
| v3.9.15 | 08-05 00:52 | 3h57m | 模型面板与 /v1/models 零重叠（#234，6a664ae）、Cascade 流式不记 per-account 消费（K8，19636a9）、九个 CI action 升 node24 |
| v3.9.16 | 08-05 01:31 | **39m** | 面板显示每个模型吃不吃配额（#235，1805ce9） |
| v3.9.17 | 08-05 01:45 | **14m** | glm-5-2 破折号写法拿到被模型忽略的工具方言（93ae320） |
| v3.9.18 | 08-05 06:38 | 4h53m | rescue nudge 引用失败尝试的 reasoning 尾（PR #241，0f5a57b）；合并后复核补 digest 上限钳（eedf274） |
| v3.9.19 | 08-05 19:14 | 12h36m | v3.9.18 的 digest 钳漏了 `0.5` 那半边（2451ec8）；更正 v3.9.18 发布说明里的版本归属错误（76df59b） |
| v3.9.20 | 08-06 06:29 | 11h15m | Gemini 出口：畸形工具参数不再静默丢失（aeb18dd，B4 parity 第七次）；版本守卫修浅克隆假红（4f05a71） |
| v3.9.21 | 08-08 00:12 | 41h43m | 协议出口四路径 eleven 个客户端可见缺陷（b6e7dc9，+2231 行含 7 个新 mutation spec） |

**08-04 五版疯跑**：v3.9.10（01:19）→ v3.9.11（01:52）→ v3.9.12（06:23）→ v3.9.13（18:12）→ v3.9.14（20:55），单日 5 版。
08-05 再跑 5 版（v3.9.15~v3.9.19），其中 01:26→01:41 的 **14 分钟**是片内最短间隔。
发版时间集中在凌晨与傍晚，与「发版前对抗复核 → 台账 → 交接」的固定收尾流程吻合（v3.9.12/13/18/20 的 tag 都打在 release commit 之后的 docs commit 上，说明发版后还有一轮文档收尾才打 tag）。

---

## §4 突变验证基础设施主线（45 条）— 从工具到默认手段

**阶段一：脚本化（08-04 06:40）—— 三次踩坑变成前置检查**
- `ebeeb01`（+358 行）核心节点：突变验证从临时流程改成 `scripts/mutate-verify.mjs`，把三次踩过的坑（脏树、基线不对、环境变量）变成拒绝启动的前置检查；配套 `test/mutations/README.md` 与首批 spec（sticky-collapse-bypass、sticky-queue-on-pin）。
- `11fdf5a`（06:46）可选 pre-commit hook 禁 master 直写 —— 与突变验证配套的流程闸。

**阶段二：工具自修（08-04 08:23 ~ 17:14）—— 工具开始抓自己**
- `a0ec58f`（08:23）突变工具把「被截断的运行」报成干净的 SURVIVED —— 误报修复（+103 行）。
- `5f1403f`（17:04）给突变工具自己的判决逻辑加回归测试 + 修 NODE_TEST_CONTEXT 泄漏（+268 行）—— **工具开始被测试**。
- `67ce2a0`（17:14）judge 要的五条守卫（+334 行）。
- `8024860`（08-04 20:12）mutate-verify 在 FORCE_COLOR 下恒报 baseline 不绿。
- `57245ed` / `78e8aec` / `82788fa`（20:27~20:34）guard 2/5 抓到的问题：突变写太宽致无界循环、backoff 漏网、四条断言从未被任何突变驱动 —— 逐条处置。

**阶段三：judge 裁决（08-04 16:27）—— 外部裁决进流程**
- `9a4826c`（16:27）judge 裁决的六条，其中三条是「我自己那批修复引入的」。
- `135b9e3` / `a38d483`（16:39/15:42）台账补记 judge 失败与坏探针教训。
- `a57a83c` / `7a8ebfe`（16:30/16:31）hook 探针自打脸 —— 探针也纳入诚实报告范围。

**阶段四：baseline 实测化（08-04 ~ 08-09 贯穿）——「漏网是实测的不是守卫有洞」**
- 代表链：`87bd1e9`（05-05）baseline 79 实测 ← 上一条算错 → `9830571` #241 打断两条 anchor → `895b5dc`（08-08）dedup baseline 13 不是 14 → `d7ac4e6`（08-09）13→18 是 #247 测试加的，不是套件坏了 → `44eeac5` / `0da8e02`（08-09）两条线叠加实测 → `a79c58f` / `dd5f5a1` / `185721f` / `23080a5` 系列 baseline 小步跟进。
- 变异规格铺开：`a379016`（strict-usage-total 9 条）、`d03b35d`（分片 6 条）、`e609e89`（parity 11 条）、`f7fde90`（think-text 3 条）、`aa373e4`（response-store 22 条）、`5acf2ca`（continuity 9 条）、`ecc1e4f`（compaction-survival）……每个新修复都自带 mutation spec，成为约定。

**阶段五：脏树 harness 与 CI 化（08-07 23:18 ~ 08-09 20:52）—— 默认手段成立**
- `0487ba2`（08-07 23:18）脏树突变 harness（`mutate-verify-dirty.mjs`，+163 行）+ round-15 ledger —— 不再要求干净工作树。
- `8864b58`（08-06 18:10）LEAK_TRACE 结构化日志（默认 OFF）→ `9b25272`（08-08）覆盖 think-reroute 内容路径 → `a6c41ef`（08-08）`<think>` 方言入 THINK_MARKERS、失败出口定 outcome —— 观测手段补齐。
- `db85abe`（08-09 20:52，+500 行）**收官节点**：把三类复发缺陷（spec baseline 漂移、默认开开关未登记、未扫描文件）从「合并后才暴露」变成「CI 拦截」—— `scripts/spec-baseline-audit.mjs` + `spec-static-check.mjs` + default-on-switch-registry 测试进 CI。
- 片外延续：`a98a572` → `3af3f63` → `c374ec7`（08-10）default-on-switch 发现机制三连崩 —— 说明「守卫本身」仍有盲区，`5f1403f` 的「工具自检」原则还没完全落到开关注册表上。

**主线形态**：脚本化（ebeeb01）→ 工具自修（a0ec58f/5f1403f）→ 外部裁决（9a4826c）→ baseline 实测化（贯穿全片）→ 脏树支持（0487ba2）→ CI 化（db85abe）。45 条 commit 中约 20 条是 baseline/锚点小步修正，**这条线的产出不只是工具，而是一套「先实测、再断言、工具抓自己」的纪律** —— 直接支撑了 §2 里所有「合并后立刻返工」变少的过程。

---

## §5 逻辑级深挖（40 条，◆ 条目）

按 §1 表内 ◆ 编号对账，每条给出文件/行数与逻辑。

| # | hash | 逻辑级账目 |
|---|---|---|
| 1 | `793ed79` | rescue 收尾 nudge：src/devin-connect-openai.js +64、devin-connect.js +7、测试 +119。空 assistant turn 毒化循环的判定与丢弃 + corrective nudge 注入。 |
| 2 | `68da125` | src/handlers/chat.js +120、connect-abort-cooldown.test.js +267。断连（close）与上游 aborted（error）分两条状态路径，429 冷却保留在客户端断连场景。 |
| 3 | `3cc5aab` | src/models.js +87、auth.js +26、degenerate-response 测试 +284。零确认不清 last-known-good 快照；缩水目录（条目数骤降）触发楔住而不是清空。 |
| 4 | `0f5a57b` | 8 文件 +530：nudge 引用失败尝试的 reasoning 尾；每条 rescue 一条新 nudge；field-0 守卫防空注入。注意其日期是 08-03 21:01（#241 分支），08-05 才合并。 |
| 5 | `3d46f59` | reasoning 提升成 content 时同一段返回两遍：src +34、测试 +63，去重点放在提升路径。 |
| 6 | `9ef10b4` | rescue 尝试输出串接：src +22、测试 +65。逐次尝试的输出快照分离，避免拼进同一个 answer。 |
| 7 | `eedf274` | digest 上限钳第一半：src +25、测试 +69。`1e9` 等价于不设上限，引入 DIGEST_MAX_CEILING 语义。 |
| 8 | `2451ec8` | digest 钳第二半：src +24、测试 +29、mutation spec 8 行。`0.5` 也等于不设上限 —— 数值校验对「无上限语义」形式失效。 |
| 9 | `087be35` | retry-on-empty 与 thinking-only rescue 预算拆分：src +31、spec +63、测试 +202。 |
| 10 | `5b4d431` | session-continuity.js +58、测试 +155。root anchor + tail-anchored overlap 重关联；reuse 日志带 acct=。 |
| 11 | `9bbab01` | 8 文件 +509。reasoning 尾摘要存储/回注（T1/T2）+ T4 出口去重；.env.example +10 新旋钮。 |
| 12 | `3d4332a` | PR #242 review 返工，**-262 行**：删 T4 egress dedup（reasoning-dedup.js -41）、删 cache-probe 工具、收敛 __incomingThinking 单路径。 |
| 13 | `69fec13` | 重路由移到事件级：devin-connect-openai.js +44、messages.js 重构、测试 +110。在 #238 rescue 之前执行。 |
| 14 | `16a8e09` | reasoning-dedup.js +97、docs/reasoning-dedup.md 新建。增量 prefix dedup（T4 rework）：只在分叉后释放、只抑制全长的逐字重复。 |
| 15 | `26b939b` | 只抑制全长逐字重复 + 失败路径 release() + 1 MiB 持有上限（src +60、测试 +41）。 |
| 16 | `8e1faf1` | response-classifier.js +61。栈式互递归 → 迭代循环，深链不再爆栈（#250）。 |
| 17 | `97e0626` | chat.js +28、cascade-think-reroute 测试 +50。错误路径释放 accThinking（emulateTools 泄漏）。 |
| 18 | `29b2215` | chat.js +107、classifier +9、测试 +345（+495 总）。Cascade 流路径接入 think 重路由防御。 |
| 19 | `19636a9` | chat.js +25、cascade-stream-account-spend.test.js +193。Cascade 流式 per-account 记账（K8）。 |
| 20 | `f429297`+`9e7008e` | STRICT_USAGE_TOTAL（默认关，+286）→ 9e7008e 发现 flag 只在两个协议前端生效、helper 零生产调用者（+161），接线到 special-agent 等全部调用面。 |
| 21 | `756761c` | auth.js +40、sticky-no-fallback-wedge 测试 +160。stickyNoFallback 把 caller 永久楔死。 |
| 22 | `9844470` | sticky-session.js +18、auth.js +11、测试 +130。首轮 thundering-herd 重新定性为设计张力（非缺陷），并钉住并发张力现状。 |
| 23 | `95f35cd` | sticky-session.js +27、auth.js +30、chat.js +90、runtime-config +18、测试 +431（+594 总）。queue-on-pin 默认关。 |
| 24 | `cbedc1f`/`0f1d4f0` | 修（+350，测试 +282）→ 当天 revert（-368，测试 -300）。「保留绑定会散射」实测结论。 |
| 25 | `6a664ae` | dashboard/api.js +48、models.js +76、parity 测试 +204（+331 总）。connect 命名空间接入面板与 /v1/models 共享视图。 |
| 26 | `b6e7dc9` | 21 文件 +2231：四出口协议 11 缺陷，逐缺陷测试文件 + mutation spec（见 §2-6 表）。 |
| 27 | `6d1f087` | response-store.js +234 重写 + 4 个新测试文件（绝对保留/条目上限数组/过期归属/flag 归一），+998 总。 |
| 28 | `6c0c09d` | chat.js +19、三个测试文件 +267。socket 码驱逐健康账号 + 三条源码守卫放过自己要抓的缺陷。 |
| 29 | `4f05a71` | 版本守卫浅克隆假红：脚本判定被浅克隆的 tag 缺失误导 + 无法区分历史声明与当前声明 —— 修成只查当前 package.json 声明（见 §4 阶段四）。 |
| 30 | `b0989ac` | auth.js +105、devin-connect-models.js +14、models.js +66、两个测试 +329（+501 总）。目录 latch 与「只宣传不过滤」拆开。 |
| 31 | `d032386` | auth.js +76、devin-connect-openai.js +17、chat.js +22、测试 +153（+260 总）。credit 费率表从零消费者接到逐请求计费。 |
| 32 | `d42f3a5` | models.js +61、injection-eviction 测试 +196。已删账号的模型仍被宣传（快照注入 key 无人移除）。 |
| 33 | `3d46f59` | 见上 #5。 |
| 34 | `9ef10b4` | 见上 #6。 |
| 35 | `4f8f801` | models.js +72、chat.js +19、测试 +168（+284 总）。保留上游能力数据 + tier 预检。 |
| 36 | `d11ce66` | devin-connect.js +65、测试 +29（+110 总）。credit_cost 顶层 #14 读取 + `^` 前缀 + 校准 dump。 |
| 37 | `fb51a13` | devin-connect.js +200、测试 +269（+502 总）。GetUserJwt 短期凭证路径（默认关）+ epoch 反重入守卫。 |
| 38 | `41777a7` | 6 文件 +111：windsurf-login.js、devin-connect.js、responses.js + 3 个测试修正 —— 对抗 review 挖出的 4 处真缺陷。 |
| 39 | `489f31d` | auth.js +64、dashboard/api.js +13、测试 +154（+250 总）。rate-limit 历史环缓冲。 |
| 40 | `db85abe` | 7 文件 +500：CI 拦截三类复发缺陷（spec-baseline-audit、spec-static-check、default-on-switch-registry、secret-scan 扩展）。 |

---

## §6 与 v1 的差异与更正

1. **发版 tag 指向**：v1 把 v3.9.12/13/18/20 的 release commit 当作 tag 目标；实测 annotated tag 打在这些 release commit **之后的 docs commit** 上（v3.9.12→b910c7e、v3.9.13→095df44、v3.9.18→5d2bb53、v3.9.20→4f05a71）。本账时间列用 tag 创建时间。
2. **最短间隔**：v1 说 34 分钟（v3.9.10→v3.9.11）；实测最短是 v3.9.16→v3.9.17 的 **14 分钟**（08-05 01:31→01:45）。
3. **每日版本数**：v1 说 08-05 六版；实测 08-05 是 **5 版**（v3.9.15~v3.9.19），08-04 五版不变。
4. **0f5a57b 日期**：v1 归入 08-05 的 #241 合并线；实测 commit 日期 08-03 21:01（分支 commit，08-05 05:34 合并）—— 链上时间按实际标注。
5. **守卫三连崩**：v1 未收录；本账 §2-10 收录（片外 master 08-10，hash 已核实）。
6. **深挖范围**：v1 无逐条表与逻辑级行数证据；本账 §1 逐条 256 条 + §5 深挖 40 条（全部 `git show --stat` 实测）。

## §7 备注

- 片内 4 条俄语 subject（`f7fde90`/`d713ac9`/`23080a5`/`b7ee979`，08-05）已译为中文，内容均为 think-text reroute 线的突变规格与 baseline。
- 256 条中 merge commit 12 条（5 个跨分片 research-gaps 合并 + 5 个 fix 分支合并 + 2 个 PR 合并），并入所属链。
- 08-09 的 `ba4d768` 是外部贡献者（warelik）四条 PR 的台账记录：S+/S/A/S —— 本片唯一的多人协作出场，其余全部单作者。
- 凭证纪律：全片零密钥输出，`fb51a13` 的 GetUserJwt 路径默认关，相关值一律不落本账。
