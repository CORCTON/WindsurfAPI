# WindsurfAPI 记账本 v2 · 精细账 · 2026-07-10 ~ 07-16（v3.1.2 → v3.5.0）

## 元信息

- 范围：93 条 commit（4fc3c39 至 4a105fd），全部 hash 经 `git rev-parse` 逐个验证存在，无一缺失。
- 时区口径：统一按 +0900（主作者 dwgx 所在时区）。两条 warelik 贡献（15e9562/2047628）原提交时区 +0300，其作者日期为 07-14 22:41；按 +0900 归入 07-15，文中已标注。
- 深挖标记：★ = 逻辑级（读了 diff 或完整 commit message 的因果链）。
- 与 v1 采集（ledger-out-slice-7a-v3.md）的关系：本账在其聚类/修复明细基础上做逐条精细账，末尾「勘误」列出对 v1 的三处修正。

---

## 一、版本轨迹精细表（22 个 tag，v3.1.2 ~ v3.5.0）

rc 系列用 `rc` 标注。tag 落点均经 `git rev-list -n1` 验证。

| tag | 日期(+0900) | 当天发布的 tag 数 | tag 落点 commit | 核心内容 |
|---|---|---|---|---|
| v3.1.2 | 07-11 | 第 1/6 版 | a10a781 | self-update + trend-clip 修复 + WebGL pool fire（新增） |
| v3.1.3 | 07-11 | 第 2/6 版 | f9a4d6c | 加固 WebGL pool fire（context leak 修复） |
| v3.1.4 | 07-11 | 第 3/6 版 | a14fb2d | fire lifecycle recovery + trend clamp + review 修复（含 add9bd4 按 account id 发布、a228daa Docker/update.sh 加固） |
| v3.1.5 | 07-11 | 第 4/6 版 | 270dd0b | dashboard a11y + i18n gate + CORS & proxy SSRF 修复（#9/#11） |
| v3.2.0 | 07-11 | 第 5/6 版 | dcc2eb6 | statistics dashboard overhaul（统计页大改，129827b） |
| v3.2.1 | 07-11 | 第 6/6 版 | e13886d | 审计修复轮（安全/正确性/运维/性能） |
| v3.2.2 | 07-12 | 第 1/5 版 | cc5a9e7 | 审计批 4/5 + 账号池可靠性 + Windows 部署（d331b18 脚本套件；**热更新退出码 bug 引入点**） |
| v3.2.3 | 07-12 | 第 2/5 版 | 60bd3fd | 模型 catalog live-sync + 外部审计修复（65240aa；**烧账号事故源头**） |
| v3.2.4 | 07-12 | 第 3/5 版 | 9edd148 | /v1/models 发现回归修复（d3f1f4c；**烧账号引爆点**） |
| v3.2.5 | 07-12 | 第 4/5 版 | f91d417 | live-catalog alias-fold 修复（7a8d658；**烧账号根治**） |
| v3.2.6-rc4 | 07-12 | 1 rc | c40ae89 | esbuild 先打单 CJS 再 pkg（解 ESM 打包崩溃） |
| v3.2.6-rc5 | 07-13 | 1 rc | 5a76a71 | 数据存 exe 旁 Windsurf_data + 首跑自动开面板 |
| v3.2.6-rc6 | 07-13 | 2 rc | c725370 | 首跑自动生成 API_KEY + DASHBOARD_PASSWORD 写 .env |
| v3.2.6 | 07-13 | 第 1/7 版 | e1d6632 | **tag 落点非 release commit**：4851629 打出 release（429 缓解默认开 + Windows 单 exe + 热更新修复）后，补 e1d6632 托盘再定 tag |
| v3.2.7 | 07-13 | 第 2/7 版 | 17b024a | Windows 系统托盘（零依赖 NotifyIcon + W 波浪图标）+ 落地页 tab/FAQ |
| v3.2.8 | 07-13 | 第 3/7 版 | b991004 | 托盘双模式启 exe + CI 打解压即用 zip 分发包 |
| v3.2.9 | 07-13 | 第 4/7 版 | f2a3f89 | SOCKS5 隧道测试覆盖（tq-01）+ dashboard 每账号累计花费（K8） |
| v3.3.0 | 07-13 | 第 5/7 版 | e4c31ed | dashboard 池操作大改（diff 门 / 请求卫生 / 池事件通知 / 批量操作） |
| v3.3.1 | 07-13 | 第 6/7 版 | 75a267b | 打磨三件套（KPI count-up + 骨架屏 + reduced-motion）+ 批量池操作 |
| v3.3.2 | 07-13 | 第 7/7 版 | 655e74f | **无独立 release commit，tag 直接打在主题化 checkbox/radio 上** |
| v3.4.0 | 07-15 | 1 版 | a9fba98 | cline 可插拔兼容层 + identity-neutralize + content-policy 可观测 + MCP-gate neutralize（#216）+ IPv6（#215） |
| v3.5.0 | 07-16 | 1 版 | 81370f5 | Claude Code 专属兼容层 /v1/cc/*（4a105fd 在其后收尾） |

节奏：07-11 六连发，07-12 五连发（含 rc4），07-13 七版 + 2 rc，07-15/16 各一。三股主线：Dashboard 大改版、外部审计修复轮、Windows exe/托盘链。

---

## 二、逐条 commit 账（93 条，时间正序）

### 07-10

**1. 4fc3c39 · docs(contributors)**
致谢 clarezoe（catalog-resync fix，#206）。本片首条，前接 v3.0.x 尾巴。

### 07-11（六连发日）

**2. 421e80d ★ · fix(server)**
dashboard 空 body POST 按 `{}` 处理，不再误报 Invalid JSON。逻辑：server.js 对空请求体（length 0 或非 JSON 字符串）此前直接抛 400；改后按空对象走默认分支。+40 行测试。

**3. 5c526b0 ★ · feat(dashboard)**
WebGL fire on saturated pool rows + trend peak clipping 修复。池满行加 WebGL 火焰动画；修复趋势图峰值被 clip 吞掉的 bug。

**4. a10a781 · chore(release): v3.1.2**
当天第 1 版。self-update + trend-clip 修复，WebGL pool fire 首秀。

**5. 877fbef ★ · fix(dashboard)**
cap WebGL fires + empty-state/navigate 时 dispose（review 修复）。逻辑：v3.1.2 的 WebGL 动画在空态/页面切换时不释放 context，多次进出页面累积 context 泄漏 → 浏览器 context 上限（约 16 个）后新动画全黑；加「每行限一次 fire + 空态/导航时 dispose context」。index.html +41。

**6. f9a4d6c · chore(release): v3.1.3**
当天第 2 版。harden WebGL pool fire（context leak fixes）——5 的加固版。

**7. add9bd4 ★ · fix(reliability)**
release 按 account id + self-update 非零退出。逻辑：systemd 场景下 update 脚本静默 0 退出会让 systemd 以为更新成功、不重启 → 旧版继续跑；改非零退出让 systemd 感知需要重启。

**8. a228daa ★ · fix(deploy)**
Dockerfile 默认 DEVIN_CONNECT=1 + update.sh dirty/ahead 时 fails closed。逻辑：git 目录脏/落后于远端时 update 继续会留下半更新状态；改失败即停（fails closed）。

**9. a14fb2d · chore(release): v3.1.4**
当天第 3 版。fire lifecycle recovery + trend clamp + review fixes。

**10. 5464913 ★ · feat(a11y)**
radiogroup/canvas/dialog 语义 + data-i18n-aria-label 运行时。逻辑：补齐原生 HTML 语义（radiogroup role、canvas 替代文本、dialog role）+ i18n 键在运行时写入 aria-label，修复读屏器读不到中文文案的问题。

**11. c41596c ★ · feat(i18n)**
check-i18n #8 扫 App `<script>` 区英文硬编码（warn-first）。逻辑：此前 i18n 检查只扫 HTML 文本节点，JS 里拼的英文 UI 字符串漏检；加 warn-first 扫描器，先警告不阻断。

**12. 211b657 ★ · fix(security) #11**
pin proxy host to vetted IP 关 DNS-rebinding TOCTOU。逻辑：代理先解析域名再连接，两次解析可能不同（DNS rebinding 攻击窗口）；改为「连接前解析 → 校验 IP 在 vetted 集 → 直连 IP（不走域名）」。7 文件 +113（net-safety +35）。

**13. 39794ec ★ · fix(security) #9**
dashboard-API preflight 走 CORS allowlist。逻辑：dashboard 内部 API 的 OPTIONS 预检此前不经过 CORS 白名单 → 浏览器跨站可探测；改走统一 allowlist。server.js +7。

**14. 270dd0b · chore(release): v3.1.5**
当天第 4 版。dashboard a11y + i18n gate + CORS & proxy SSRF fixes。

**15. 499df14 · chore(repo)**
目录重构收尾——docs-internal/ 归拢 + 路径引用同步。

**16. 39b58fe ★ · fix(i18n)**
check-i18n #8 跳过 JS 表达式片段、收紧成员访问守卫（防误报）。逻辑：c41596c 的扫描器把模板表达式里合法的英文标识符/成员名误报为硬编码；加「跳过表达式片段 + 只认字符串字面量」的守卫。

**17. 129827b ★ · feat(dashboard)**
统计页大改：token 采集补全 + 时序按模型 + 排行多维度 + 观感打磨。本片 dashboard 主线最大单 commit（index.html +198/chat.js +22/测试 +69）。逻辑：前端统计口径对齐后端 token 字段（此前部分模型缺 token 计数）；时序图改为按模型分组；排行支持多维度切换（按 token/按请求/按花费）。

**18. dcc2eb6 · chore(release): v3.2.0**
当天第 5 版。statistics dashboard overhaul。

**19. 313bb8e ★ · fix(security) #1/#7**
dashboard 回退按可信客户端 IP 判本地 + lockout 塌缩告警。逻辑：①此前 dashboard「本地判定」用 XFF 头（可伪造）→ 回退策略被远程利用；改 trustedClientIp 单一来源判本地。②lockout（锁定）事件此前逐个告警，短时间大量锁定刷屏/被忽略 → 塌缩为「N 次锁定汇总告警」。7 文件 +128。

**20. 5e7aabc ★ · fix(dashboard)**
缓存/租户键正确性 + 删死代码 hasCallerScope。逻辑：租户（tenant）维度缓存键此前漏带租户 → 跨租户串数据；修键 + 删掉已无调用的 hasCallerScope。

**21. 9ad7c6c ★ · fix(ops) #11**
dockerPull 扫 JSONL error + update.sh 健康检查修恒真。逻辑：docker pull 的进度 JSONL 里 error 字段此前不检查 → pull 失败误判成功；update.sh 健康检查条件恒真（永远通过）→ 修条件。

**22. d9e82e6 ★ · perf(stats)**
recordRequest 缓存当前小时桶，O(n) find → O(1)。逻辑：每请求在小时桶数组里 find 目标桶 → 高并发 O(n)；缓存当前小时索引，跨小时才重找。

**23. e13886d · chore(release): v3.2.1**
当天第 6 版。审计修复轮（安全/正确性/运维/性能）。

### 07-12（烧账号链 + Windows 链同日）

**24. d29b246 ★ · fix(cache) #10**
logit_bias 键序归一化防 cache 槽分裂。逻辑：同一模型同一请求，logit_bias 键顺序不同 → 缓存键哈希不同 → 同一缓存内容分裂成多个槽、命中率下降；键序排序后再入键。

**25. 29a843b ★ · refactor(net-safety) S4**
抽 trustedClientIp 单一真相源，去 XFF 双写副本。逻辑：可信 IP 判定此前散落多处、各自解析 XFF（解析逻辑漂移风险 + 绕过可能）；收敛为单函数单真相源。

**26. 36c2095 ★ · perf(sanitize) S5**
PathSanitizeStream O(n²)→O(N) 增量续扫。逻辑：路径净化流每收到新块都从头重扫整个 buffer → O(n²)；改为记录已扫边界、增量续扫。sanitize.js +67。

**27. 1781882 ★ · fix(chat) 批2**
inflight 泄漏释放 + reportError transient 守卫。逻辑：请求异常路径不释放 inflight 计数 → 计数器漂移、池容量被永久占用（泄漏）；补释放。reportError 只在非 transient 错误时进错误统计，避免瞬态抖动污染健康窗口。chat.js +31 / 测试 +159。

**28. e96f422 ★ · test**
补 selectBackend 双调一致性 + sticky-session 回归。逻辑：同一请求两次调 selectBackend 必须返回同一选择（幂等）；sticky 会话（按 caller 绑定账号）回归保护。

**29. 6a95fe5 ★ · chore(test) S3 —— 假绿测试摘除（问题链 3）**
删 devin-backend 假绿测试 423 行（devin-backend.test.js 308 + devin-backend-edge.test.js 115），代码留作 DEVIN_REST stub（devin-backend.js +10）。审计批 S3 揭穿：该后端测试长期假绿掩盖真实状态。详见问题链 3。

**30. d331b18 ★ · feat(deploy) —— Windows 脚本套件上线（问题链 2 引入点）**
deploy/windows/ 15 文件 477 行：run/start/stop/status/update/uninstall + run-background/run.vbs。**Start-Process -PassThru + -RedirectStandardOutput 的监督循环在 Windows PowerShell 下 ExitCode 恒为 $null —— 热更新退出码致命 bug 埋点。** 详见问题链 2。

**31. cc5a9e7 · chore(release): v3.2.2**
审计批 4/5 + 账号池可靠性 + Windows 部署。

**32. 65240aa ★ · fix(models) —— 烧账号链引入点（问题链 1/4）**
DEVIN_CONNECT 选择器 catalog 接上游 live-sync。根因：CATALOG_SELECTORS 是 105 条帧抓快照（2026-06-30），上游新增 selector（qwen-3/glm-5/kimi-k2.5/deepseek-v3/minimax）不在快照 → strict 门 400 误拒。修：_liveSelectors 运行时集合，auth.js 在 catalog sync 时用 GetCliModelConfigs 回填；存在性判断 = snapshot ∪ live。**但 setLiveCatalogSelectors 把每行 alias 也折进集合（家族形态，如 selector gpt-5-6-sol-medium → alias gpt-5.6-sol；opus-4-7 五档共享 alias claude-opus-4.7），测试还专门断言了「folds alias」行为 —— 事故种子。** auth.js +15 / devin-connect-models.js +66 / 测试 +52。

**33. 4f368d6 ★ · fix(devin-connect)**
拆分 idle-TIMEOUT vs absolute-DEADLINE + captureRes 断连短路。逻辑：此前一个超时值兼管「空闲无数据」与「总时长」，慢流被 idle 误杀、挂死流撑满 deadline；拆成两个独立窗口。captureRes 路径断连后短路不再继续解帧。

**34. 60bd3fd · chore(release): v3.2.3**
模型 catalog live-sync + 外部审计修复。**烧账号事故版本。** 07:51（65240aa）引入。

**35. d3f1f4c ★ · fix(models) —— 烧账号引爆点（问题链 1）**
/v1/models 列出 live-catalog 新 selector。背景：v3.2.3 后 chat 能跑 live selector 但 /v1/models 仍只查冻结快照 + 37 个上游新增 selector 不在硬编码 MODELS 表 → Codex 发现不了。修：handleModels 过滤改 snapshot ∪ live（与 resolveConnectSelector 同源）、_liveCatalog 留完整行、live-only 合成条目。**引爆逻辑：SELECTOR_MAP 没兜的 family alias（gpt-5.6-sol）被 /v1/models 列出去 → 客户端照单请求 → resolveConnectSelector 返回 mapped:true + 原样 family 形态 → 写上游 GetChatMessageRequest #21（只认全档位形态）→ UPSTREAM_INTERNAL 烧 homecloud 单账号。** 09:05。

**36. 9edd148 · chore(release): v3.2.4**
/v1/models 发现回归修复（自伤应急）。

**37. 7a8d658 ★ · fix(models) —— 烧账号根治（问题链 1/4）**
live-catalog 不再折叠 family alias。ultracode review 抓出 + 真号坐实：只折 canonical selector、不折 alias；别名交给手维 SELECTOR_MAP（解析到真 selector）；map 没有的 family alias fail closed（降级/strict 400），不原样透传。**改测试：原「folds alias」用例断言了错误行为，改成钉「canonical 识别但 family alias 不原样透传」+ SELECTOR_MAP 别名回归守卫。2547/0 绿。** 10:35 —— 引入到根治 2 小时 44 分。

**38. f91d417 · chore(release): v3.2.5**
live-catalog alias-fold 修复（烧账号回归根治）。第 4 版。

**39. 3e87736 ★ · tools**
diag-analyze 故障诊断台：解码 .trace 逐请求（selector/#31）、system + 响应分类、ok/fail shape diff。逻辑：trace 文件按请求重构 selector 选择轨迹，对照 system 日志分类响应，shape diff 找协议层字段不一致。与 #31（diag-analyze 相关 issue）关联。

**40. 68917b5 ★ · feat(auth) K7**
accounts.json fsync 耐久写 + 周期 dirty-flush，去掉关机回写。逻辑：原子写已是 temp→rename+0600，但 rename 后内容滞留 page cache（断电丢数据窗口）；新增 writeFileSyncDurable（open→write→fsync→close）贯穿三处写点。热路径（reportSuccess/markRateLimited 等）原靠关机 saveAccountsSync 兜底 → 改 recordHealthEvent 单点 markDirty + 30s 定时 flushDirty，盘上最多落后一个 interval。**index.js 关机只 drain 不回写** —— 解除「stop→等 hook→再写」的部署约束，消除与外部运维写 accounts.json 的竞争。+7 测试，2554/0 绿。

**41. 9afc1dd ★ · fix(deploy/windows) —— 热更新退出码致命 bug 修复（问题链 2）**
run.ps1 监督循环原用 Start-Process -PassThru + -RedirectStandardOutput：Windows PowerShell 下 $proc.ExitCode 返回 $null → 退出码 75（面板重启/OTA）和 0（优雅）永远匹配不上、全落 else 崩溃分支 → 热更新彻底失效。改 [System.Diagnostics.Process] 可靠取 ExitCode + 异步抽干 stdout/stderr 到独立 node 日志（与 Write-Sup 分离，不再互相截断）。用可控退出码替身进程做 4 场景 8 断言模拟全绿。**副修：stop.ps1 的 supervisor 匹配正则只匹配 run.ps1，而 start.ps1 用 & run.ps1 内联跑循环（进程命令行是 start.ps1）→ 杀了 node 杀不掉 supervisor → 立刻重拉停不掉；补 start.ps1 匹配。优雅停超时 8s→3s（K7 起 /F 安全）。** 5 个 ps1 加 [Console]::OutputEncoding=UTF8 修中文乱码；README 加「两种跑法」。6 脚本 +114。

**42. ea1332e ★ · feat(ratelimit) —— 429 缓解三招默认开启（问题链 6）**
治 Claude Code / OpenCode 的 429 死循环（单号被限流→秒拒→立即重试→冷却越叠越长→打穿账号池）。机制早已实现但默认全关，本次翻默认：degradedServe false→true（整池仅瞬态限流时降级服务最不糟号，配额干井仍严格排除）；rlBurstMs 300000→15000（裸 429 冷却 5min→15s，KiroStudio 生产数据显示裸 burst 几秒自愈，冻 5min 是小池雪崩源）；rlClientBackoffFloorMs 0→30000（客户端 Retry-After 地板，掐断 1s 提示→立即重试热循环）。4 个断言旧默认的测试同步改。

**43. 5714dca · docs(config)**
记录 429 缓解旋钮 + Docker 默认说明。

**44. d6a476b ★ · feat(release)**
CI 构建 Windows 单 exe 随 Release 发布。

**45. 4851629 · chore(release): v3.2.6**
429 缓解默认开启 + Windows 单 exe（CI 构建）+ 热更新修复。release commit（tag 落点见 e1d6632）。

**46. 7d6c8e8 ★ · fix(release)**
pkg 目标改 node22-win-x64。逻辑：node20 无 pkg 预编译 base binary → 打包失败；升 node22 有预编译版。

**47. 2901911 ★ · fix(release)**
pkg exe 加 --fallback-to-source + smoke 捕获 exe 输出。逻辑：pkg 打包后依赖动态 require 的文件可能漏进快照 → 加 fallback-to-source 让缺失文件回源读取；smoke 步骤此前吞掉 exe 输出，失败难查。

**48. c40ae89 ★ · fix(release) —— v3.2.6-rc4**
esbuild 先打成单 CJS 再 pkg（解 ESM 打包崩溃）。逻辑：项目是 ESM（import 语法），pkg 对 ESM 支持差 → 先 esbuild 出单文件 CJS bundle，pkg 打 CJS 稳。release.yml 27 行重构 + package.json。

### 07-13（七版 + 2 rc + 安全审计收尾）

**49. 5a76a71 ★ · feat(exe) —— v3.2.6-rc5**
数据存 exe 旁 Windsurf_data + 首跑自动开面板。逻辑：pkg 打包后 __dirname 在快照 FS 内，数据写不进去 → 数据目录重定向到 exe 旁的 Windsurf_data/。

**50. c725370 ★ · fix(exe) —— v3.2.6-rc6**
首跑自动生成 API_KEY + DASHBOARD_PASSWORD 并写入 .env。逻辑：exe 无 .env 时无密钥 → 面板/API 裸奔或不可用；首跑生成随机凭证写 .env（config.js +42 / index.js +15）。**凭证只写本地 .env，不落日志。**

**51. 7bb0eec ★ · fix(security) —— 外部审计批（H1/H2/M1/M3）**
收紧 /auth 与 dashboard 鉴权。9 文件 +214：/auth 管理员门 fail-closed（auth-admin-gate 测试 +88）、dashboard 鉴权加固（fail-closed 测试 +17）、鉴权告警（auth-warning +13）等。逻辑：审计发现 /auth 与 dashboard 的鉴权判定存在可绕过/默认宽松路径，统一 fail-closed（默认拒绝，白名单放行）。

**52. 0af0f09 ★ · fix(security) M2**
补齐 isPrivateIp SSRF 网段。net-safety.js +19。逻辑：私有 IP 判定此前漏网段（如 CGNAT 100.64/10、链路本地 169.254/16 等边界）→ SSRF 经遗漏网段打到内网；补齐全部保留网段。

**53. a903341 ★ · fix(api) T1/T3**
拒绝不支持的采样参数 + gRPC 仅 identity 编码。chat.js +26 / grpc.js +7。逻辑：T1——OpenAI 兼容层对不认识的采样参数此前静默忽略（客户端以为生效实则没有）→ 显式 400；T3——gRPC 头部此前编码整块 payload 到 identity 之外的字段 → 收窄为仅 identity 编码，防上游误读。

**54. 72955de ★ · fix(security) —— ultracode 审计 3 个 high**
修 H-1 视觉丢图 / H-2 auth 锁定 / H-3 gRPC。grpc.js 46 / responses.js 19 / server.js 36 / 测试 +50。逻辑：H-1 视觉请求（image 内容）在传输中被丢 → 补全视觉 payload 传递路径；H-2 auth 锁定机制存在绕过/误锁 → 修锁定判定；H-3 gRPC 层问题 → 修传输编码。与 51（内审 H1/H2/M1/M3）区分：51 是内审批次编号，54 是 ultracode 外部审计编号。

**55. e1d6632 ★ · feat(deploy/windows) —— tag v3.2.6 落点**
系统托盘运行：零依赖 .NET WinForms NotifyIcon + W 波浪图标。右键菜单：打开面板/复制密码/复制 API Key/状态/重启/退出。tray.ps1 消息泵定时器监督 node（75/0 重启、崩溃退避 5 次停），直接 spawn node 不经 cmd /c（避免重定向串误解析）+ 异步抽干日志。tray.vbs 隐藏无窗启动（★必须无 BOM，否则 wscript 报 Invalid character）。gen-icon.ps1 纯 System.Drawing 画 7 尺寸 .ico。

**56. 8e7706c · chore(deploy/windows)**
清理 tray.ps1 分块写入残留的占位注释（微自伤，见问题链 8）。

**57. 17b024a · chore(release): v3.2.7**
第 2 版。系统托盘。

**58. 744d99f · docs(landing)**
落地页新增 Windows 一键 EXE 部署 tab + 更新 FAQ（v3.2.7）。

**59. f3fcc50 ★ · feat(deploy/windows)**
托盘双模式启 exe + CI 打解压即用 zip 分发包。逻辑：托盘可托管 exe 或源码 node 两种模式；CI 产 zip（exe + 脚本 + README），解压即用。

**60. b991004 · chore(release): v3.2.8**
第 3 版。托盘双模式 + CI zip。

**61. 1c2f688 ★ · fix(devin-connect)（问题链 6）**
wire-01 跨帧 UTF-8 乱码 + rel-01 429 先于 CAPACITY 分类。①wire-01：流式逐帧 content.value.toString('utf8') 会把跨帧切断的多字节字符（中文/emoji）解成 U+FFFD；decodeFrame 增出 contentBytes/reasoningBytes 原始字节，消费循环用 StringDecoder 跨帧持有不完整序列，末尾 flush。②rel-01：HTTP 429 body 含 'try again later'/'capacity'/'overloaded' 会抢先匹配 CAPACITY 分支（可重试 + 60s 冷却）→ 重试打回真限流、放大负载欠冷却；改显式 status===429 / gRPC resource_exhausted 在 CAPACITY 前判 RATE_LIMITED（不可重试），硬 'Resets in:3h' 分支仍在其前。+9 测试，2613/0 绿。

**62. 62ee1a9 ★ · fix(api) proto-openai-03**
实现 OpenAI stop 序列。新文件 stop-sequences.js 105 行：stop 词表按「stop 序列命中即停流」语义接入 openai 流式出口；此前 stop 参数被忽略 → 客户端等不到终止 token 出现多余输出。测试 +148。

**63. 38fe255 ★ · feat(dashboard) K8**
每账号累计花费 + 区分「模型繁忙」vs「账号限流」。逻辑：池行此前只显示状态，限流/繁忙都笼统展示；拆两态并累计每账号花费（供 K8 排障判断压哪个号）。

**64. 9befb1d ★ · test(socks) tq-01**
补 SOCKS5 隧道测试覆盖。逻辑：SOCKS5 代理路径此前无测试，握手/认证/域名解析分支未受保护。

**65. f2a3f89 · chore(release): v3.2.9**
第 4 版。SOCKS5 覆盖 + 每账号花费。

**66. f1855e6 ★ · feat(dashboard)**
池事件通知：toast pub/sub + 状态跃迁批合并。逻辑：状态变化（限流/恢复/崩溃）逐条 toast 会刷屏 → 同账号连续跃迁合并为一条聚合通知。

**67. 2eb505e ★ · feat(dashboard)**
请求卫生层：in-flight GET 去重 + 陈旧响应守卫。逻辑：面板快速刷新/多个 tab 并发轮询时同一 GET 重复发 → 去重合并；响应到达时若已有更新的响应（序号旧）→ 丢弃，防旧数据覆盖新数据（竞态）。

**68. bdf269d ★ · feat(dashboard)**
配置保存 diff 门：危险写入改前预览。逻辑：直接写配置（账号/代理/开关）不可逆；保存前弹 diff 预览，确认才落盘。

**69. e4c31ed · chore(release): v3.3.0**
第 5 版。dashboard 池操作大改。

**70. 6b216ab ★ · feat(dashboard)**
打磨三件套：KPI count-up + 骨架屏 + reduced-motion。逻辑：数字滚动动画 + 加载骨架屏 + prefers-reduced-motion 尊重系统减弱动画设置（a11y 补课）。

**71. 8449c31 ★ · feat(dashboard)**
批量池操作：多选 + 批量启停/刷新/探测/删除。逻辑：此前单账号操作，几十个号逐点；多选后批量动作一次下发。

**72. 75a267b · chore(release): v3.3.1**
第 6 版。

**73. 655e74f ★ · feat(dashboard) —— tag v3.3.2 落点**
主题化裸 checkbox/radio（修原生蓝勾选框）。逻辑：原生 checkbox/radio 无法跟随暗色主题 → 自绘主题化控件。

### 07-15（v3.4.0）

**74. f79a420 ★ · fix(auth) cool-01**
internal-error 隔离不再缩短更长的已有冷却。逻辑：账号已有较长冷却（如 60s）时，internal-error 事件若用「取现有冷却与固定值的最小值」会把冷却缩短 → 刚被惩罚的号提前复出；改「隔离事件只做下限（不短于已有冷却）」。

**75. ed5aee3 ★ · fix(cache) cache-01**
嵌套 reasoning.effort 纳入缓存键。逻辑：请求带 reasoning.effort（嵌套对象）时其字段顺序/值此前不入缓存键 → 不同 effort 的响应共用缓存槽（串答案）；深序列化纳入键。

**76. 545d143 ★ · feat(cline)**
OpenAI-Compatible 接入验证工装 + 连通 smoke。逻辑：Cline 走 @ai-sdk/openai-compatible，先有验证工装才能证明兼容层行为。

**77. 4c3f61b ★ · feat(cline) —— 兼容层核心**
src/handlers/cline-compat.js：normalizeToolCallArgs（空/空白/不可解析 JSON 归一为 {}）/detectClineClient（UA）/resolveClineCompat/stripClineNamespace。**根因：@ai-sdk/openai-compatible 用 isParsableJson(args) 门控工具调用，Claude 对无参工具发 `arguments:""` → 不可解析 → 工具调用被静默丢弃（vercel/ai#6687），agent 卡死且无错误可见。** 两条激活路互不依赖：/v1/cline/* 命名空间（显式 opt-in，无视 master 开关）+ UA 识别（需 experimental.clineCompat 开关，默认关，标准 /v1 对其他客户端字节等价）。

**78. 268fa52 ★ · feat(cline)**
tool-call 参数归一垫片接入三处 emit 出口。逻辑：special-agent/devin-connect/chat 三处 tool_calls 发射点各自组装参数 → 统一过垫片归一。

**79. d52c9a8 ★ · fix(special-agent) cline#9622**
finish_reason 不再对纯文本响应误报 tool_calls。逻辑：special-agent 流结束把 finish_reason 设为 tool_calls（只要本请求开了工具）→ 纯文本响应被 Cline 当成工具调用等待 → 卡死；改为「实际 emit 过 tool_call 才报 tool_calls」。special-agent.js +14 / 测试 +54。

**80. 663003a ★ · feat(cline)**
面板三处 surfacing + API + i18n + 验证工装：面板暴露 cline 兼容开关/激活态/计数器，配 API 与 i18n。

**81. 15e9562 ★ · fix(grpc,langserver,config) #215（warelik cherry-pick）**
disable Happy Eyeballs + 本地 HTTP/2 走 127.0.0.1。根因：server.codeium.com DNS 先返回不可路由的 IPv6 ULA，Node 20+ autoSelectFamily（Happy Eyeballs）在 IPv6 connect 挂起时不回退 IPv4 → ~270ms ETIMEDOUT。修：config.js `net.setDefaultAutoSelectFamily(false)` 让 DNS 按默认序先 IPv4；连锁：autoSelectFamily=false 后 macOS 的 localhost→::1 不再回退 → grpc.js/langserver.js 的 localhost 改 127.0.0.1（LS 只监听 IPv4）。**作者 W ARELIK，原提交 32f02d0，+0300 时区（07-14 22:41 = +0900 07-15 02:41）。**

**82. 2047628 ★ · fix(devin-connect,tool-emulation,chat) #216（warelik cherry-pick）**
neutralize MCP-gate + inject native tool preamble。5 文件 +432：devin-connect/chat/tool-emulation 三路注入。**作者 W ARELIK，原提交 35fbae4，同样时区跨天。**（与 81 同源，见问题链 7）

**83. fac765a · docs(credits)**
致谢 warelik（#216 MCP-gate + #215 IPv6 ETIMEDOUT）——81/82 两笔 cherry-pick 的公开致谢。

**84. a9fba98 · chore(release): v3.4.0**
cline 可插拔兼容层 + identity-neutralize + content-policy 可观测 + MCP-gate neutralize + IPv6 修复。

**85. e4a3b5f ★ · fix(identity-neutralize)**
中和 Cline 身份能力宣言（上游 content-policy 拦截）。逻辑：转发给上游的请求里若带「我是 Cline，能做 X」类身份宣言会被上游 content-policy 拦截；identity-neutralize.js +14 中和宣言，默认开、env 可关。+3 回归测试（旧代码上失败）。

**86. b298898 ★ · feat(identity-neutralize)**
预备 Cline OBJECTIVE 夸张句中和规则（a6，默认关/SPECULATIVE）。逻辑：a6 规则默认关 + 标注 SPECULATIVE（未真号验证的预防性规则），符合「降级可观测」原则。

**87. 28897bd ★ · feat(stats)**
content-policy 拦截可观测 ring buffer（后端）。逻辑：上游 content-policy 拦截此前只记日志难量化；环形缓冲记拦截样本（时间/模型/片段），供面板展示。

**88. 6c1c26c ★ · feat(restart)**
一键重启 + 优雅 drain + supervisor 预检（后端）。逻辑：重启前 drain（停接新请求、排空在飞请求）→ 退出码 75 → supervisor 拉起；预检（配置/端口）失败则拒绝重启，避免重启即崩循环。

**89. b48ab60 ★ · feat(dashboard)**
一键重启按钮 + content-policy 拦截样本面板 + i18n。前端接 88/87 的 API。

**90. 24705b5 ★ · refactor(dashboard)**
仪表盘瘦身：移除请求趋势图、删模型饼图、模型统计表可展开。逻辑：v3.2.0 加的图在真实数据下价值低、拖慢首屏；删两图，统计表折叠为可展开。

### 07-16（v3.5.0）

**91. 81370f5 · chore(release): v3.5.0**
Claude Code 专属兼容层 /v1/cc/*（4a105fd 在其后收尾，版本内容以 4a105fd 为准）。

**92. 0b4ffbf · chore(credits)**
为 warelik 贡献记录补 githubId（#216/#215）——致谢数据补全。

**93. 4a105fd ★ · feat(cc-compat)**
Claude Code 专属可插拔兼容层 /v1/cc/*。逻辑：延续 cline 兼容层模式（4c3f61b 的命名空间激活路），为 Claude Code 建专属命名空间；stripClineNamespace 模式复用为 /v1/cc 路由改写。

---

## 三、问题链清单（8 条）

### 链 1 · gpt-5.6-sol 烧账号（本片最重事故；65240aa → d3f1f4c → 7a8d658）

- **07:51 引入（65240aa，v3.2.3）**：为修「snapshot 陈旧误拒」把 live catalog 接进 DEVIN_CONNECT 选择器。`setLiveCatalogSelectors` 在折入 canonical selector 的同时也折入每行 alias（家族形态：selector `gpt-5-6-sol-medium` → alias `gpt-5.6-sol`；且 opus-4-7 的 low/medium/high/max 五个档位**共享**一个 alias `claude-opus-4.7`），并专门写测试断言「live sync 也折叠 alias」——错误行为被测试固化。
- **09:05 引爆（d3f1f4c，v3.2.4）**：/v1/models 与 resolveConnectSelector 同源消费 snapshot ∪ live → 手维 SELECTOR_MAP 没兜的 family alias（gpt-5.6-sol）被列出、被请求 → resolver 返回 `mapped:true` + 原样 family 形态 → 写上游 GetChatMessageRequest #21（**只认全档位形态，帧证：只有 -medium 形态 200**）→ `UPSTREAM_INTERNAL` 烧 homecloud 单账号。真号坐实：gpt-5.6-sol/codex internal-error 的部分真凶（叠加 content policy）。
- **10:35 根治（7a8d658，v3.2.5）**：ultracode review 抓出 + 真号坐实。只折 canonical、不折 alias；alias 唯一入口是手维 SELECTOR_MAP（解析到真 selector）；map 没有的 family alias **fail closed**（降级/strict 400），绝不原样透传。改测试：原「folds alias」用例断言了错误行为 → 钉「canonical 识别 + family alias 不原样透传」+ SELECTOR_MAP 别名回归守卫。2547/0 绿。
- **教训**：审计修复轮里自己引入的 catalog 逻辑没等验证就发布；v3.2.3 → v3.2.5 两连版本、2 小时 44 分才收口，中间烧掉真实账号。根因是「alias 折叠」这个便利行为与上游「只认全档位」的契约冲突，且测试把错误行为钉死（测试诚实性链条的另一面）。

### 链 2 · Windows 热更新退出码致命 bug（d331b18 → 9afc1dd）

- **07-12 引入（d331b18，v3.2.2）**：Windows 脚本套件上线。run.ps1 监督循环用 `Start-Process -PassThru` + `-RedirectStandardOutput`。
- **暴露**：Windows PowerShell 下该组合的 `$proc.ExitCode` 恒为 `$null` → 退出码 75（面板重启/OTA）和 0（优雅停）永远匹配不上 → 全落 else 崩溃分支 → **热更新彻底失效**。v3.2.6 发布说明点名「热更新修复」。
- **07-12 修复（9afc1dd，v3.2.6 当天）**：换 `[System.Diagnostics.Process]` 可靠取 ExitCode + 异步抽干 stdout/stderr 到独立 node 日志（与 Write-Sup 分离，不再互相截断）；可控退出码替身进程 4 场景 8 断言模拟全绿。**副 bug 一并收掉**：stop.ps1 的 supervisor 匹配正则只匹配 run.ps1，而 start.ps1 用 `& run.ps1` 内联跑循环（进程命令行是 start.ps1）→ 杀了 node 杀不掉 supervisor → 立刻重拉停不掉；补匹配。优雅停超时 8s→3s（K7 起 /F 安全）。5 个 ps1 补 UTF-8 输出。
- **教训**：跨平台部署代码的 PowerShell 语义差异（-PassThru + 重定向的 ExitCode null 是已知缺陷）没在真实 Windows 上验证就发布；模拟替身进程验证法是后续脚本类改动的标配。

### 链 3 · devin-backend 假绿测试（审计批 S3 → 6a95fe5 删 423 行）

- **前史（本片外）**：devin-backend 的测试（devin-backend.test.js 308 行 + devin-backend-edge.test.js 115 行）长期「绿」，掩盖该后端真实状态。
- **07-12 揭穿 + 摘除（6a95fe5，v3.2.2）**：审计批 S3 判定为假绿（断言不贴真实行为/未连真后端）→ 删 423 行，devin-backend.js 保留 10 行作 DEVIN_REST stub。commit message 明写「代码留作 DEVIN_REST stub」。
- **教训**：假绿测试比没有测试更糟——绿到发亮的历史给了「devin-backend 可用」的错觉；审计轮把「测试是否真的测了代码」列为独立检查维度（与链 1 的「测试钉死错误行为」互为镜像：测试既要测真东西，也不能把错的钉对）。

### 链 4 · alias 折叠与 catalog 同步（65240aa 系列：live-sync 机制从引入到回归到根治）

- 单链完整因果：**snapshot 陈旧**（105 条快照 2026-06-30，上游新增 qwen-3/glm-5/kimi-k2.5/deepseek-v3/minimax 全在真账号 availableModels）→ 65240aa 上 live-sync（snapshot ∪ live 双源）→ 引入 alias 折叠 → d3f1f4c 把 /v1/models 拉进同一双源（暴露面扩大）→ 7a8d658 只折 canonical + fail closed。
- 配套：4f368d6（同一 catalog 时代的 devin-connect 可靠性拆分）、v3.2.6 后 429 缓解（ea1332e）缓解了烧号后的连带效应。
- 结构教训：**两套 catalog（Cascade 的 MODELS 与 DEVIN_CONNECT 的 CATALOG_SELECTORS）双轨制**是事故土壤；7a8d658 之后 alias 的唯一入口收敛到 SELECTOR_MAP，live 集合只认 canonical——单一真相源原则的落地。

### 链 5 · WebGL pool fire 泄漏链（5c526b0 → 877fbef → v3.1.3/v3.1.4 收口）

- 07-11 引入（5c526b0，v3.1.2）：池满行 WebGL 火焰动画 + trend clip 修复。
- 同日 review 修复（877fbef，v3.1.3）：cap fires + empty-state/navigate 时 dispose context——浏览器 context 上限约 16 个，不释放则多次进出页面后动画全黑。
- 07-11 再收口（v3.1.4「fire lifecycle recovery」）：fire 生命周期恢复（release 按 account id + systemd 非零退出随版带上）。
- 教训：动画类功能上线当天即发现泄漏、一天内两连版收口——前端资源生命周期（context/interval/listener）与后端连接同级别对待。

### 链 6 · 429 缓解链（ea1332e → 5714dca → 1c2f688 rel-01）

- **07-12 机制翻默认（ea1332e，v3.2.6）**：degradedServe/rlBurstMs/rlClientBackoffFloorMs 三招从默认关翻为默认开（机制早已实现，字节等价保守上线，拿 KiroStudio 生产数据换证据后翻）。
- **同日文档（5714dca）**：旋钮 + Docker 默认说明。
- **07-13 修正分类序（1c2f688 rel-01）**：429 显式状态先于文本 CAPACITY 启发式——否则 429 body 带 'try again later'/'capacity'/'overloaded' 会误判 CAPACITY（可重试 + 60s 冷却）→ 重试打回真限流放大负载欠冷却。
- 教训：缓解机制翻默认前用跨项目生产数据做证据（KiroStudio PLAN-RETRY-AMPLIFICATION-FIX-0708）；翻默认后又用 rel-01 修正启发式与显式信号之间的优先级——启发式分类必须让位于传输层显式信号。

### 链 7 · warelik 外部贡献链（#215/#216：cherry-pick → 致谢 → 补全）

- **07-14/15（+0900 07-15 凌晨）**：warelik 的 PR 以 cherry-pick 合入：15e9562（#215 IPv6 ETIMEDOUT，disable Happy Eyeballs + 127.0.0.1 连锁修正 9 个测试回归）、2047628（#216 MCP-gate neutralize + native tool preamble，5 文件 +432）。
- **07-15**：fac765a 致谢（公开署名）+ 随 v3.4.0 发布。
- **07-16**：0b4ffbf 补 githubId（贡献记录数据完整性）。
- 说明：两条 commit 作者是 W ARELIK（非 dwgx），原提交 32f02d0/35fbae4，cherry-pick 保留原作者时区（+0300）。这是本片仅有的两条非 dwgx 直提 commit。

### 链 8 · exe/托盘部署链（v3.2.2 → v3.3.2 的 Windows 主战场）

- 底稿：d331b18 脚本套件（v3.2.2）→ 9afc1dd 热更新修复（v3.2.6）。
- 打包线：c40ae89（rc4，ESM→CJS 单文件再 pkg）→ 7d6c8e8（node22-win-x64）→ 2901911（fallback-to-source + smoke）→ d6a476b（CI 随 Release 发布）。
- 体验线：5a76a71（rc5，Windsurf_data 数据目录）→ c725370（rc6，首跑自动生成凭证写 .env）→ e1d6632（托盘，零依赖 NotifyIcon + 自画 W 图标）→ 8e7706c（清理占位注释残留，微自伤：分块写入残留的占位注释次日清理）→ f3fcc50（托盘双模式 + CI zip 分发包）。
- 节奏特征：rc4→rc6 三连在 12/13 两天内滚完，全链路本地验证（无黑窗/图标加载/复制密码回读匹配/dashboard 200）后才定 tag v3.2.6。

---

## 四、勘误（相对 v1 采集 ledger-out-slice-7a-v3.md）

1. **「未发现本片有 PR 合入痕迹，全部直接提交」有误**：15e9562、2047628 是 warelik 的 cherry-pick（作者 W ARELIK，原提交 32f02d0/35fbae4），属外部 PR 贡献合入；本片其余 91 条为 dwgx 直接提交。两 commit 的日期素材标 07-14 系按作者 +0300 时区，本账统一 +0900 口径归 07-15。
2. **v3.2.6 tag 落点**：素材按 release commit 4851629（07-12）表述；实际 tag 落在 e1d6632（07-13 托盘 commit）——release 打出后又补了托盘才定 tag。版本轨迹精细表已按 tag 落点修正。
3. **v3.3.2 无独立 release commit**：素材已提（tag 直接打 655e74f），本账确认并补进版本表。
4. 素材 v1「07-13 一天发 8 版」口径按 commit 计；按 tag 落点计 07-13 共 9 个 tag（v3.2.6 + v3.2.7~v3.3.2 七版 + rc5/rc6）。

## 五、关联 issue/PR 索引

- #206 clarezoe 致谢（catalog-resync fix）→ 4fc3c39
- #215 IPv6 ETIMEDOUT → 15e9562（修）+ fac765a/0b4ffbf（致谢）
- #216 MCP-gate → 2047628（修）+ fac765a/0b4ffbf（致谢）
- cline#9622 finish_reason 误报 → d52c9a8
- vercel/ai#6687 isParsableJson 门控丢工具调用 → 4c3f61b（兼容层根因）
- 内部审计：#1 dashboard 本地判定、#7 lockout 告警（313bb8e）、#8 i18n gate（c41596c/39b58fe）、#9 CORS preflight（39794ec）、#10 cache 槽分裂（d29b246）、#11 dockerPull 恒真 + DNS-rebinding TOCTOU（9ad7c6c/211b657）、#31 diag-analyze（3e87736）
- 外部 ultracode 审计：H1/H2/M1/M3（7bb0eec）、M2（0af0f09）、T1/T3（a903341）、H-1/H-2/H-3（72955de）、S3 假绿测试（6a95fe5）、S4（29a843b）、S5（36c2095）、K7（68917b5）、K8（38fe255）、alias-fold（7a8d658）
- 协议标号：proto-openai-03（62ee1a9）、wire-01/rel-01（1c2f688）、tq-01（9befb1d）、cool-01（f79a420）、cache-01（ed5aee3）
