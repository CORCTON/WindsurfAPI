# WindsurfAPI 记账本 v2 · 精细账 · 2026-07-01 ~ 07-09（slice-7-early）

- 范围：126 条 commit，全部逐一 `git cat-file -e` 验证存在（126/126），hash 与输入片一致。
- 时间：统一用提交者时区 +09:00（JST）排序；4 条 +02:00 提交（d4c7259 / 0c77824 / 4905209 / baa8524）已换算，见注 1。
- 排序：自旧到新（与输入片 v1 的倒序相反），便于串联问题链。
- 深挖：表中标 `深` 的条目在第二节有逻辑级明细（48 条 ≥ 要求的 20 条）。
- 凭证纪律：涉及 key/host 的条目只描述类别与 redact 后的占位形式，不复述原始值。

---

## 一、逐条 commit 账（126 条）

### 2026-07-03（8 条）—— batch-7 兼容层 + 校准工具链起步

| # | hash | 时间 | 账目 | 规模 | 注 |
|---|---|---|---|---|---|
| 1 | d4c7259 | 07-03 07:52 | fix: retry cloud model catalog sync when first account becomes active（#190/#203，v2.0.147 打包，社区 PR #206 系其实现） | 1f +37/-2 | 深 |
| 2 | c63daa7 | 07-03 23:16 | chore(gitignore): whitelist devin-connect 脚本、track package-lock、ignore paid session env | 1f +6/-1 | 卫生 |
| 3 | 6cce2ae | 07-03 23:17 | feat(image): jimp 图像降采样 + image-tag 校准 harness | 6f +1967/-79 | 深（S1 自伤源） |
| 4 | ec7954d | 07-03 23:18 | feat(gemini): Google Gemini v1beta 前端（generateContent + streaming） | 3f +1546/-1 | batch-7 |
| 5 | c260e31 | 07-03 23:18 | feat(messages): Anthropic 原生错误枚举映射 + count_tokens + cache policy | 4f +1058/-69 | batch-7 |
| 6 | 07427c8 | 07-03 23:18 | feat(pool): 每账户健康窗口 + 加权选择 + 重登并发门 | 8f +995/-6 | 深 |
| 7 | 70f305d | 07-03 23:19 | feat(devin-connect): transient-first 错误分类 + 校准工具链（本片最大 commit） | 21f +4340/-65 | 深 |
| 8 | 575fa1c | 07-03 23:19 | feat(acp,tools): ACP escape-hatch 硬化 + tool-emulation/routing 精修 | 10f +986/-19 | 深 |

### 2026-07-04（22 条）—— 硬化日：batch-7 收口 + 安全批次 + jimp 自伤回收

| # | hash | 时间 | 账目 | 规模 | 注 |
|---|---|---|---|---|---|
| 9 | e8cbfa4 | 07-04 01:49 | feat(devin-connect): #28.2 billing decode 递归嵌套子消息 | 3f +115/-28 | 深 |
| 10 | 6888f1d | 07-04 05:20 | feat(anthropic): /v1/messages 翻译层硬化（22 个 review gap） | 3f +572/-89 | 深 |
| 11 | f19363e | 07-04 05:21 | test(anthropic): 22 硬化点补测（+44 测试） | 4f +789/-14 | 测试 |
| 12 | 69170a5 | 07-04 05:23 | feat(devin-connect): tool_call decode tags 静态反汇编定位（verified-from-binary） | 2f +20/-8 | 深 |
| 13 | 4cdabd2 | 07-04 11:24 | chore(gitignore): 屏蔽内部笔记、凭证文档、外部 ref 仓 | 1f +9 | S2 批次 |
| 14 | 2c68bdb | 07-04 11:24 | feat(pool): batch-7 R2 inflight stale-reset + R6 quota 维度一致性 | 4f +212/-11 | batch-7 |
| 15 | 0975edc | 07-04 11:25 | feat(openai): batch-7 兼容硬化（O1/O2/O3/O5/O9/O10/O11）+ chat failover（R1/R3） | 21f +1244/-52 | batch-7 |
| 16 | fe53fd5 | 07-04 11:25 | feat(anthropic,server): batch-7（F4/F6/G1/V1/S1）+ 请求卫生 | 7f +256/-23 | batch-7 |
| 17 | 2b2e0e0 | 07-04 11:45 | ci: 测试跑 Node 24（修 Node 20 --test-force-exit 假失败） | 2f +5/-5 | 深 |
| 18 | 2ab55ea | 07-04 11:55 | ci: 测试前装依赖（修 jimp ERR_MODULE_NOT_FOUND，S1 暴露点） | 2f +11/-0 | 深（S1） |
| 19 | 4243d93 | 07-04 12:05 | chore(gitignore): 屏蔽 AI 会话转录 / context dumps | 1f +6 | S2 批次 |
| 20 | 413106e | 07-04 12:31 | docs,test: redact 泄漏 host/key（13 文件）+ 修 dependency claim | 13f +21/-22 | 深（S2 主修复） |
| 21 | 6b8845a | 07-04 13:10 | feat(image): 移除 jimp，vendor 零依赖编解码器，恢复零 npm 依赖 | 12f +2356/-848 | 深（S1 修复） |
| 22 | e75d689 | 07-04 19:19 | fix(image,pdf): 解码器资源上限（PNG inflate/尺寸 cap + PDF BT/ET 线性扫描） | 5f +173/-6 | 深 |
| 23 | 1f68752 | 07-04 19:19 | fix(auth,server): 账户池安全——有界 lockout map、id 基 refcount、XFF 硬化 | 8f +352/-16 | 深（429 链起点） |
| 24 | d4dadf2 | 07-04 19:21 | fix(tool-emulation): 中和 tool_result 注入（TOOL-1）+ TR_PREFIX/缓冲上界（TOOL-2/3） | 2f +225/-4 | 深 |
| 25 | e9f8085 | 07-04 19:21 | fix(intent-extractor): NLU 扫描上限，抑制多项式爆炸（NLU-1） | 2f +96/-1 | 深 |
| 26 | 22fb534 | 07-04 19:21 | fix(connect,devin-connect): 帧解码守卫（FRAME-1）+ gunzip 上界（CONN-1） | 4f +252/-8 | 深 |
| 27 | 0639930 | 07-04 19:33 | feat(devin-connect): tool_call nativization stage-0——修 double-send、def-gate 默认 10、strict 字段、round-trip 测试 | 4f +163/-23 | 深 |
| 28 | 1722c59 | 07-04 20:15 | feat(devin-connect): ToolDef inner tags 1/2/3 付费 probe 验证 + SOLO probe 模式 | 2f +22/-8 | 深 |
| 29 | 6ffad0b | 07-04 20:26 | docs(contributing): commit 纪律文档化（type(scope)、trace tags、禁 debug/AI 署名）+ .gitmessage 模板 | 2f +33/-7 | 纪律 |
| 30 | 07c018f | 07-04 22:50 | feat(devin-connect): DEBUG 门控 raw frame/trailer dump（DEVIN_CONNECT_DUMP_RAW） | 1f +14 | 校准 |

### 2026-07-05（8 条）—— 认证硬化 + 工具仿真积压

| # | hash | 时间 | 账目 | 规模 | 注 |
|---|---|---|---|---|---|
| 31 | 7320754 | 07-05 00:55 | fix(dashboard): AUTH-1 特权端点硬化 + XFF-1 lockout 绕过 | 7f +488/-23 | 深（429 链） |
| 32 | 8bd38c7 | 07-05 00:55 | fix(devin-acp,grpc): 两处 uncaughtException 崩溃路径 | 4f +193/-3 | 深 |
| 33 | b8a1850 | 07-05 00:55 | fix(devin-connect): 流 abort/heartbeat/registry + 延迟 priming | 5f +612/-35 | 深 |
| 34 | 3b313f0 | 07-05 00:56 | fix(devin-connect-models): selector resolver 的 catalog-existence guard | 2f +105/-3 | 深 |
| 35 | fdbc605 | 07-05 00:56 | fix(caller-key,auth,stats,tool-emulation): 隔离与资源上限 | 8f +504/-37 | 深（429 链） |
| 36 | 0c77824 | 07-05 01:16 | fix(tool-emulation): text 解析器无果时从 thinking 抬 tool_calls（#178） | 2f +173/-6 | 深 |
| 37 | 4905209 | 07-05 07:29 | fix(tool-emulation): SSE 块序修复（"Content block not found"，#178） | 1f +43/-28 | 深 |
| 38 | baa8524 | 07-05 09:23 | fix(stream): tool-use 恢复前缓冲 reasoning（#178） | 6f +150/-40 | 深 |

### 2026-07-06（3 条）—— 模型目录校准

| # | hash | 时间 | 账目 | 规模 | 注 |
|---|---|---|---|---|---|
| 39 | 0604f0c | 07-06 19:54 | fix(devin-connect-models): 映射裸 opus-4-8 别名，防 DEVIN_CONNECT 降级免费档（#203，带回归测试） | 2f +86/-0 | 深 |
| 40 | 052131b | 07-06 20:20 | feat(devin-connect-models): 刷新 catalog 到线上付费 105 + 全可达 roster | 3f +559/-29 | 深 |
| 41 | ebb4d11 | 07-06 21:17 | feat(devin-connect): 帧级验证 actual_model #7.9 + 合并碎片化 tool_call args | 2f +75/-17 | 深 |

### 2026-07-07（15 条）—— 双发 v2.0.146/147 + 登录/账单/vision 并进

| # | hash | 时间 | 账目 | 规模 | 注 |
|---|---|---|---|---|---|
| 42 | a4d90da | 07-07 03:17 | docs: 删除公开仓内部 maintainer/reversing 笔记（10 文件 -1401 行） | 10f +5/-1401 | 深（S2 收尾） |
| 43 | af0cdab | 07-07 03:20 | release: v2.0.146 — audit hardening + live-verified model roster | 2f +57/-1 | 发布 |
| 44 | 190d13d | 07-07 04:56 | docs(env): 修正 dashboard fail-closed 默认 + 新 env vars 文档 | 1f +30/-3 | 文档 |
| 45 | 5f118e5 | 07-07 05:47 | docs: README 专业标题 + release notes 归位 docs/releases/ | 4f +6/-2 | 文档 |
| 46 | ea32403 | 07-07 05:52 | release: v2.0.147 — tool_calls-in-thinking + opus-4.8 tier ladder + catalog self-heal（合社区 PR #206） | 2f +37/-1 | 发布 |
| 47 | 365bbe0 | 07-07 06:21 | test(devin-acp): session/cancel-on-abort 确定性化（修 flaky） | 1f +25/-1 | 深 |
| 48 | f18b2ad | 07-07 07:08 | feat(login): email 验证码（OTP）登录 | 6f +1008/-86 | 深（S6 引入） |
| 49 | 517e5d8 | 07-07 08:10 | chore(login): seal email-OTP——Turnstile domain-lock 下封存 dormant | 2f +18/-3 | 深（S6） |
| 50 | 6aa3992 | 07-07 08:34 | feat(billing): 解码完整 GetUserStatus 台账——真实余额/周期/每模型额度 | 7f +443/-10 | 深 |
| 51 | 7808449 | 07-07 08:40 | feat(devin-connect): ImageData inner tags 可校准（vision 地基） | 1f +16/-4 | vision |
| 52 | 7527bb4 | 07-07 09:13 | feat(devin-connect): vision image tag #10 从 MITM 捕获定值（verified-from-wire） | 1f +18/-14 | vision |
| 53 | 78000e0 | 07-07 12:38 | feat(devin-connect): vision send-side——wire 忠实图像 tool_result（req022） | 2f +324/-40 | vision |
| 54 | 0a7285a | 07-07 20:24 | docs(site): GitHub Pages 改版为 DevinAPI 迁移故事 | 1f +77/-58 | 文档 |
| 55 | 84065d9 | 07-07 21:12 | fix(devin-connect): 补发 request_id #22 对齐真实 CLI wire | 2f +10/-2 | 深（#22 链） |
| 56 | 06fdd50 | 07-07 23:14 | feat(vision): 图像请求走 ACP 路径（全模型含 opus） | 5f +268/-15 | 深 |

### 2026-07-08（34 条）—— Dashboard 改版冲刺 + 空补全/身份门禁排查日

| # | hash | 时间 | 账目 | 规模 | 注 |
|---|---|---|---|---|---|
| 57 | 9989fe6 | 07-08 01:01 | fix(server): extractToken 接受 Gemini 原生认证（x-goog-api-key + ?key=） | 1f +11/-1 | 深 |
| 58 | 33f0698 | 07-08 01:01 | feat(chat): 图像请求改道 ACP vision path | 1f +17 | vision |
| 59 | ff36591 | 07-08 05:43 | feat(devin-connect): 概率性空补全有界重试自愈 | 2f +240/-3 | 深（空补全链） |
| 60 | e5dc30c | 07-08 05:43 | fix(auth): 池里最后一个可用账户永不熔断 | 5f +150/-3 | 深（429 链） |
| 61 | 5997e00 | 07-08 05:44 | feat(tools): tool schema 规范化 + 原生路径剥离孤儿 tool_results | 5f +205/-2 | 深（五根因前置） |
| 62 | 2523957 | 07-08 05:44 | style(dashboard): accent 转蓝、半径收紧、reduced-motion | 3f +49/-27 | UI |
| 63 | 31887f2 | 07-08 06:57 | fix(devin-connect): 空补全检测去掉 completion_tokens 门 | 2f +27/-4 | 深（空补全链） |
| 64 | 1e3412d | 07-08 08:09 | fix(devin-connect): 硬限流带 reset 归为非重试 RATE_LIMITED | 3f +124/-2 | 深（429 链） |
| 65 | fbb3379 | 07-08 08:09 | feat(devin-connect): 未映射模型直接 400 拒绝，不再静默降级免费档 | 5f +253/-9 | 深 |
| 66 | df09443 | 07-08 09:17 | feat(dashboard): 光标跟随 chart tooltip + token 分解条 + avg 降采样 | 3f +237/-12 | UI |
| 67 | 482b2cc | 07-08 09:20 | feat(dashboard): Overview 改造成运营驾驶舱 | 1f +211/-1 | UI |
| 68 | 1bb1cf2 | 07-08 09:24 | feat(dashboard): 账户行密化 + 设置搜索 + 危险确认 | 1f +46/-6 | UI |
| 69 | d0a9317 | 07-08 09:49 | feat(dashboard): 主题化 custom select + number stepper | 3f +273/-0 | UI |
| 70 | bcf0e6a | 07-08 09:53 | polish(dashboard): a11y focus rings、sticky headers、响应式 cockpit、dismissible toasts | 3f +41/-2 | a11y |
| 71 | e5e5ef8 | 07-08 10:06 | fix(dashboard): custom select——内滚不关闭、低处向上翻、popover 打磨 | 1f +30/-11 | UI |
| 72 | 75518d0 | 07-08 10:24 | feat(devin-connect): 弱模型（fable）智能裁 tool 数量 | 3f +170/-4 | 深（五根因前置） |
| 73 | 6c748aa | 07-08 10:56 | fix(messages): 中和 Claude Code 自我标识（上游指纹门禁） | 2f +80/-1 | 深（五根因前置） |
| 74 | 7e355e1 | 07-08 11:08 | polish(dashboard): 统一 color tokens + 修 .model-chip 选择器冲突 | 1f +30/-30 | UI |
| 75 | 859c1eb | 07-08 11:11 | feat(dashboard): confirm/prompt 弹窗 Esc/Enter 键盘处理 | 1f +29/-4 | a11y |
| 76 | 34a94dd | 07-08 11:12 | polish(dashboard): model/log 搜索框主题化 clear-X | 1f +12/-2 | UI |
| 77 | 9756441 | 07-08 11:14 | polish(dashboard): Health Status（bans）面板加说明 | 3f +8/-3 | UI |
| 78 | e711600 | 07-08 11:23 | polish(dashboard): indigo→blue 收官、focus rings、token/color 清理（audit batch 1） | 1f +25/-15 | a11y |
| 79 | f72ba7f | 07-08 11:27 | feat(dashboard): 错误可视化、日志流失败提示、更长错误 toast（audit batch 2） | 3f +28/-4 | a11y |
| 80 | 55f47b3 | 07-08 11:38 | feat(dashboard): Request Trend 重建为正规面积图 | 3f +153/-15 | UI |
| 81 | 9ca6dce | 07-08 11:45 | feat(dashboard): WebGL2 fire 状态筛选滑块 | 3f +209/-1 | 深（S4） |
| 82 | 430bffa | 07-08 11:48 | a11y(dashboard): 可点击 code/span 键盘访问 + chevron 展开（audit batch 3） | 3f +10/-4 | a11y |
| 83 | 3d21bd7 | 07-08 11:53 | fix(dashboard): KPI 卡片网格对齐 + 云路径隐藏退役 Language Server UI | 1f +38/-13 | UI |
| 84 | bd7376a | 07-08 11:59 | fix(dashboard): 合并重复 .card-value 规则 | 1f +1/-2 | UI |
| 85 | 25bc95e | 07-08 12:04 | fix(dashboard): Connection Self-Healing 与 Request Trend 等高 | 1f +21/-14 | UI |
| 86 | 9f648c3 | 07-08 12:12 | revert(dashboard): 移除 WebGL2 fire 滑块，Request Trend 加宽替代 | 3f +3/-211 | 深（S4 修复） |
| 87 | 3cce541 | 07-08 21:26 | fix(messages): 中和 Claude Code security-policy 前缀（401 滥用门禁） | 2f +48/-13 | 深（五根因前置） |
| 88 | f58e90c | 07-08 21:46 | fix(devin-connect): GetChatMessage 路由到账户自有 API host（self-serve/teams） | 2f +21/-2 | 深（host 链） |
| 89 | 1c65725 | 07-08 22:43 | fix(devin-connect): 停止伪造 #22/#15.2，对齐已验证 turn-1 wire | 2f +33/-16 | 深（#22 链） |
| 90 | 78acd1b | 07-08 22:43 | revert(devin-connect): 撤 DEVIN_CONNECT_ACCOUNT_HOST——host 理论被证伪 | 1f +6/-4 | 深（host 链） |

### 2026-07-09（27 条）—— v3.0.0 发布日（详见第四节解剖）

| # | hash | 时间 | 账目 | 规模 | 注 |
|---|---|---|---|---|---|
| 91 | a14c1ef | 06:07 | release: prepare v3.0.0（本片最大单体：dashboard 全量重写 + account-text-parser + 删 quiet-window-updater） | 33f +2959/-1484 | 深（发布） |
| 92 | da0bd6c | 08:24 | fix(devin-connect): catalog 快照移入 src/，Docker 镜像才能 boot（v3.0.1） | 6f +38/-10 | 深（S5） |
| 93 | e1c5d11 | 10:50 | feat(config): 运行时 UI 偏好 + lockout 可调项 | 1f +65/-3 | 深（429 链） |
| 94 | f8a6b95 | 10:50 | fix(auth,dashboard): lockout 可配置 + 停止 false-positive bans | 3f +67/-26 | 深（S3） |
| 95 | be15fc8 | 10:51 | fix(deploy): foolproof docker + bare-source 启动 | 5f +64/-9 | 深 |
| 96 | 3c7afdb | 10:51 | feat(dashboard): 公共远程 onboarding + 全局设置页 + OAuth chooser | 5f +545/-41 | 深 |
| 97 | 74295e1 | 10:51 | fix(dashboard): onboarding 端点 + ban/credential-gate 修复；release v3.0.2 | 5f +258/-13 | 深（发布） |
| 98 | 3615a8f | 11:01 | docs(readme): Devin pivot 的 SEO 关键词刷新 | 2f +12/-4 | 文档 |
| 99 | 3ba816d | 11:05 | fix(dashboard): 账户面板展示周配额 + 按需余额 | 2f +23/-9 | UI |
| 100 | a1ad49a | 11:12 | feat(dashboard): stats 模型分布饼图动画对齐 dashboard | 1f +49/-16 | UI |
| 101 | dd9ae04 | 11:58 | feat(dashboard): OAuth onboarding paste 硬化 + 前端 review 项清理 | 5f +163/-20 | 深 |
| 102 | 6cc81fc | 11:58 | fix(dashboard): oauth-sessions 真实过期时间 + 删死 lock 常量 | 2f +28/-6 | 深 |
| 103 | 67dd240 | 12:25 | fix(dashboard): 卡片 hover 下压而非上浮 | 1f +2/-2 | UI |
| 104 | 7620a92 | 13:05 | feat(dashboard): number-stepper 修复、空态占位、图表打磨 | 3f +153/-42 | UI |
| 105 | d6bd433 | 13:14 | feat(config): 实验 flag 白名单 + 系统提示词覆盖硬化 | 3f +123/-9 | 深 |
| 106 | aaf9701 | 13:19 | feat(dashboard): 设置页只读运行时后端状态卡 | 4f +94/-4 | 深 |
| 107 | f55ce9f | 13:39 | fix(dashboard): stepper 位置、dotted-key i18n、弃手绘字体 | 1f +26/-11 | UI |
| 108 | 0cb4bca | 14:20 | feat(config): 设置页热切换后端开关 | 14f +600/-44 | 深 |
| 109 | 93dff4e | 15:07 | fix(dashboard): 空态居中、停 trend 轮询重放、help tooltips | 3f +80/-11 | UI |
| 110 | 980a7d7 | 15:09 | feat(dashboard): 可编辑模型弹窗加搜索 + 打磨 | 3f +35/-5 | UI |
| 111 | 03e4add | 15:12 | refactor(dashboard): 凭证 + 系统提示词移入全局设置 | 1f +78/-75 | 深 |
| 112 | b4175ad | 15:21 | feat(config): 熔断/限流参数运行时热切换 | 7f +376/-43 | 深（429 链） |
| 113 | c1f9d4c | 15:55 | feat(dashboard): 池余额展示 + help tooltip 打磨 | 5f +128/-22 | UI |
| 114 | 1af865b | 16:04 | fix(dashboard): 调静调色板、灭发光状态点、可见 help '?' | 1f +33/-38 | UI |
| 115 | 8152524 | 16:28 | feat(devin-connect): 门控上游 wire-dump（离线 RE 用） | 1f +33 | 校准 |
| 116 | 0064047 | 17:01 | fix(routing): 未授权免费账户不暴露付费 connect 选择器 | 4f +141/-23 | 深（429 链） |
| 117 | 52e255f | 17:11 | fix(quota): 有按需余额的账户不再 quota-cool | 2f +44/-2 | 深（429 链） |

### 2026-07-10（9 条）—— 收尾双发 v3.1.0/3.1.1（本片边界，v1 归入下一片）

| # | hash | 时间 | 账目 | 规模 | 注 |
|---|---|---|---|---|---|
| 118 | 3584bac | 11:14 | fix(devin-connect): 恢复 Claude 系原生 tool_call（五独立根因） | 6f +332/-36 | 深（五根因主修复） |
| 119 | 839e6ee | 11:14 | feat(reliability): 429 lockout loop 缓解（tier-aware 豁免 + degraded serve） | 9f +970/-76 | 深（429 链主修复） |
| 120 | c3571a9 | 11:14 | fix(dashboard): 池视图默认改静默 StatusBars + 修熔断 tooltip 裁剪 | 4f +729/-135 | UI |
| 121 | 7ead731 | 11:15 | fix(security): writeJsonAtomic 配置落盘默认 0600 | 1f +7/-2 | 深 |
| 122 | 4564952 | 11:15 | chore(release): full-chain trace 工具链 + gitignore + bump 3.1.0 | 6f +400/-3 | 发布 |
| 123 | 1616b5e | 11:17 | docs: v3.1.0 release notes（五根因 + 429 链的官方叙述） | 1f +85 | 文档 |
| 124 | 661b649 | 13:58 | fix(chat): 弱模型跳过 env-lift，止 fable 空补全（#209） | 2f +69/-3 | 深（空补全链） |
| 125 | 815cf59 | 13:58 | feat(docker): 默认 DEVIN_CONNECT=1，原生 tool calling 开箱即用（#210） | 1f +9 | 深 |
| 126 | a31afd2 | 13:58 | chore(release): v3.1.1 — Docker native-by-default + fable env-lift fix | 3f +120/-15 | 发布 |

注 1：4 条 +02:00 提交已换算 JST——d4c7259（07-03 07:52）、0c77824（07-05 01:16）、4905209（07-05 07:29）、baa8524（07-05 09:23）；换算后 07-05 的 8 条在时间轴上不再与 v1 排序矛盾。
注 2：输入片含 07-10 尾部 9 条（v3.1.0/3.1.1 落点），与 v1 边界一致；4fc3c39（07-10 16:33，#206 credit）在仓中存在但不在本片清单内。

---

## 二、深挖明细（48 条，逻辑级）

### D1. 839e6ee — 429 lockout 死循环主修复（07-10，本片最大可靠性 commit）
- 规模：9 文件 +970/-76（auth.js +291 / chat.js +169 / runtime-config.js +119 / 测试 +428）。
- 失效链（commit body + v3.1.0 notes 双证）：单账户被限流 → 内部错误隔离（5min）+ 硬账户过滤把它剔除 → 池空 → 对客户端回 429 → 客户端自动重试 + 服务端 Retry-After 无上下界 → 每次重试都撞冷却、续命冷却 → 小池子整体黑屏且越打越黑。
- 修复五件套：①tier-aware 最后账户豁免（付费 selector 下只剩免费对端也视为 last-usable，不被隔离进池级黑屏）；②degraded-serve 兜底（整池瞬时限流时服务最不冷账户，`WINDSURFAPI_DEGRADED_SERVE` 默认关=字节等价旧行为）；③Retry-After 上下限 clamp（防客户端热循环）；④内部错误隔离 5min→2min；⑤裸 429 冷却时长可调（`WINDSURFAPI_RL_BURST_MS`）。设计明确借鉴 KiroStudio 的 cooldown 方案。
- 关联：与 e5dc30c（最后账户豁免）、1e3412d（限流分类）、b4175ad（热配）同属 429 缓解谱系，见链 1。

### D2. 3584bac — Claude 系原生 tool_call 五根因（07-10）
- 规模：6 文件 +332/-36；新增 `src/handlers/identity-neutralize.js`（+86，独立模块解循环依赖）。
- 五根因（release notes + body 明列，全部经真实 devin.exe 捕获活体验证）：
  1. 竞争者身份 content-policy：系统提示词 "You are Claude Code…"、`x-anthropic-billing-header`、Environment 品牌块（产品简介 + Claude 模型 ID 目录）触发上游内容策略 → `neutralizeClientIdentity` 统一改写为通用 assistant 身份，覆盖 /v1/responses 与 /v1/chat/completions（不止 /v1/messages）。
  2. permission_denied 误判死 token：内容策略拒绝被当成会话 token 失效，健康账户被 bench，连锁"全池耗尽" → 新增 CONTENT_BLOCKED 类（400 invalid_request_error，零账户惩罚）。
  3. 声明 tool 但 system 为空：上游拒绝 → 注入最小 system prompt。
  4. tool 描述过长超阈值：截断（`WINDSURFAPI_TOOL_DESC_MAX` 默认 500），只动描述不动名字/schema。
  5. 现象本身：gpt/swe 同编码能过、Claude 系被拒——五因叠加后由 1-4 解释。
- 前置铺垫链：6c748aa（self-ID 中和）→ 3cce541（security-policy 前缀）→ 5997e00（schema 规范化）→ 75518d0（fable 裁 tool）→ 31887f2/1e3412d/fbb3379（空补全判定链），见链 2。

### D3. f8a6b95 — 打开页面 ban 自己（07-09，v3.0.0 当日自伤修复）
- 根因：a14c1ef 重写的 dashboard 加载即发 ~12 个空密码认证调用，每个空密码 401 都计入失败次数 → 页面一开自己 IP 就被 ban（v3.0.2 notes 原文定性）。
- 修复：auth.js 读运行时 IP-lockout 阈值/时长；空密码预加载不计失败（仅提交的错误密码计）；阈值 0 即禁用并立即释放现行 ban；OAuth-only 账户的 no_password 结果不计入 email lockout（改抛清晰错误）；前端收到 429 停止轮询显示倒计时。
- 规模：3 文件 +67/-26（auth.js +53 / windsurf-login.js +27 / 测试 +13）。与 e1c5d11（lockout 可调项）同批落地，74295e1 以 v3.0.2 打包。

### D4. da0bd6c — v3.0.0 Docker 无法 boot（07-09，S5）
- 根因（v3.0.1 notes 原文）：运行时 `src/devin-connect-models.js` 从 `test/fixtures/` 读 catalog 快照，而 Dockerfile 只 COPY `src/` → `docker run`/`docker compose up` 启动即 `ENOENT .../test/fixtures/devin-catalog-snapshot.json`。
- 修复：快照 rename 到 `src/data/`（simialrity 100% 纯移动）；catalog-drift 测试改读同一 shipped 文件（单源）；v3.0.1 打出。裸机/systemd 部署不受影响——暴露面只在 Docker 路径。
- 性质：打包边界（test/ vs src/）与运行边界（镜像只含 src/）错位，发布后 2 小时 17 分即发现并修。

### D5. 6cce2ae — jimp 引入，违反零依赖铁律（07-03，S1 引入）
- 规模：6 文件 +1967/-79（image-resize 测试 +334、calibrate 测试 +153）。
- 自伤实锤：package.json description 从 "Zero npm deps" 直接改成 "Single runtime dependency (jimp, for image downscaling)"——把卖点改成了缺陷声明；新增 `jimp: 1.6.1` 依赖。
- 动机：vision 图像降采样（v1 结论：为图像链路铺路，7 条 vision commit 随后跟进）。

### D6. 2b2e0e0 / 2ab55ea — CI 双修（07-04，S1 暴露点）
- 2b2e0e0：Node 20 test runner 在 --test-force-exit 下对同步测试也报假 "pending promise"；全套在 Node 24 干净通过，CI 升 Node 24（engines 仍 >=20，只动测试侧）。
- 2ab55ea：CI 从 checkout → setup-node 直接跑 test:shard，没装依赖——唯一 import jimp 的 image-resize.test.js 以 ERR_MODULE_NOT_FOUND 把 shard 0 打红。补 `npm ci` + 缓存。
- 因果：2ab55ea 是 6cce2ae 的衍生债；当天 11:45→11:55 连修。

### D7. 413106e — redact 泄漏 host/key（07-04，S2 主修复）
- 交付审计发现历史值被烙进 tracked 文档：README ×2、DEVIN-CONNECT-CUTOVER、PROTOCOL_RE_PLAN、7 份旧 release notes（2.0.15/17/22/51/52/56/69）、2 个测试文件，共 13 文件 21+/22-。
- 泄漏物类别（只列类别与 redact 后占位，不复述原值）：下游网关 API key → `sk-REDACTED`；实验室 host → `<LAB_HOST>`；生产 VPS → `<PROD_VPS>`；上游 host → `<UPSTREAM_HOST>`；测试注释里的真实账户名 → 通用化。
- 同批配套：4243d93（AI 会话转录/context dumps 入 gitignore）、4cdabd2（内部笔记/凭证文档/外部 ref 仓入 gitignore）、a4d90da（07-07 删 10 文件 1401 行内部笔记，见 D10）、6ffad0b（commit 纪律文档化）。注意：git history 中仍存在原值（body 自述 "present in public history"），redact 是止血不是洗史。

### D8. 6b8845a — 去 jimp，vendor 零依赖编解码器（07-04，S1 修复）
- 规模：12 文件 +2356/-848（src/vendor 新增、test/helpers/png-encode.mjs +81）；package.json description 改回 "Zero npm runtime dependencies (image codecs vendored under src/vendor)"，jimp 依赖整体删除；package-lock 同步收缩。
- 回收耗时：6cce2ae（07-03 23:17）→ 6b8845a（07-04 13:10），不足 14 小时。同日稍晚 e75d689 顺势补解码器资源上限（PNG inflate/尺寸 cap、PDF BT/ET 线性扫描）——vendor 化的安全配套。

### D9. 1f68752 / 7320754 / fdbc605 — 认证与资源边界三连（07-04/05，429 链起点）
- 1f68752（8f +352/-16）：lockout map 有界化（防无限增长）+ id 基 refcount（防重登 refcount 泄漏）+ XFF 硬化。
- 7320754（7f +488/-23，含 263 行新测试）：dashboard AUTH-1 特权端点硬化 + XFF-1 lockout 绕过——攻击者可伪造 XFF 逃 lockout 或误伤他人。
- fdbc605（8f +504/-37）：caller-key/auth/stats/tool-emulation 四模块隔离与资源上限。
- 三者的共同主题：lockout/熔断机制自身的鲁棒性，是 429 链（链 1）的机制地基。

### D10. a4d90da — 删公开仓内部笔记（07-07，S2 收尾）
- 10 文件 +5/-1401：docs/HANDOFF.md、MAINTAINER_NOTES.md、PROTOCOL_RE_PLAN.md、analysis-v1.9.5.md、native-bridge-protocol-notes.md、docs/audits/ 整目录（2 份审计）删除；docs/README.md 重写为只链保留文档。
- 意义：与 413106e 同源——内部 reversing 工作产物反复混入公开仓，先 redact 值、再删整体、再 gitignore 屏蔽 + commit 纪律文档化（6ffad0b），四层处理。

### D11. 70f305d — transient-first 错误分类 + 校准工具链（07-03，本片最大 commit）
- 21 文件 +4340/-65：scripts/devin-connect-calibrate.mjs（+370）、paid-verify（+297）、login（+202）、devin-connect.js +697、CUTOVER 文档 +291、windsurf-login.js +147、catalog/credentials 扩展 + 5 个新测试文件。
- 逻辑：错误分类从"先按错误码"改为"transient-first"（先判是否瞬时可重试，再落具体类别）；校准/登录/付费验证三脚本构成线下 RE 工作台，后续所有 wire 验证 commit（69170a5/1722c59/07c018f 等）都挂在这套工具链上。

### D12. 07427c8 — 池健康窗口 + 加权选择 + 重登并发门（07-03）
- 8f +995/-6：auth.js +374；每账户健康窗口（状态不是瞬时值而是时间窗）、按健康度加权选择、同账户重登并发门（防多请求同时触发重登风暴）。测试 4 个新文件（account-health/breaker/relogin/trouble-selection）。429 链的"池选择"前身。

### D13. 1e3412d — 硬限流被误分类成可重试（07-08，429 链关键节点）
- 现场：上游回 "Reached message rate limit… Resets in: 3h0m0s"（Go duration 格式），CAPACITY 分支的 "try again later" 先命中 → 归 RETRYABLE + 60s 冷却 → 代理向 3 小时硬限流重试、放大负载——"单账户池自伤全池宕机"（body 明示 2026-07-08 实测观察到）。
- 修复：CAPACITY 之前加硬限流分支（限流短语 + 显式 reset 窗口双条件），归非重试 RATE_LIMITED，解析 reset 窗口（支持 3h0m0s/1m30s/45s，封顶 6h）→ chat 层按模型作用域冷却而非账户级 5min。

### D14. 31887f2 — 空补全误判面收窄（07-08）
- 现场：付费 probe（fable-5-medium + 11-14 tools）证实真实空回复 completion_tokens 是 3/5/8/9，旧 ct<=2 门把 15/15 个空回复全放行（"zero heals in production"）——门太严导致自愈机制失效。
- 修复：权威空签名 = 零可用输出（无 content/reasoning/tool_call）+ 干净 stop；completion_tokens 只进诊断日志。补 ct=9 空回复回归测试。

### D15. ff36591 — 空补全有界重试自愈（07-08）
- 2f +240/-3：概率性空补全（上游偶发返回空）用有界重试自愈，retry 基数可调。与 31887f2（判定门）配套：先有自愈机制、再发现门太严、再修门——机制先于校准的典型顺序。

### D16. e5dc30c — 最后可用账户豁免（07-08，429 链节点）
- 根因：reportError 的 status='error' 翻转和 reportInternalError 的 5min 隔离都不看池大小——单账户部署（自托管最常见形态）下，唯一可用账户一熔断 = 整个代理 529 全黑，一个畸形请求或错误模型选择器就能自我制造全池宕机。
- 修复：isLastUsableAccount()——是池中最后一个可选账户时跳过终局移除、留轮换取真实上游错误；streak 计数继续推进，健康对端出现即恢复正常熔断。`WINDSURFAPI_LAST_ACCOUNT_EXEMPT` 默认开。

### D17. fbb3379 — 拒未映射模型，止静默降级（07-08）
- 根因：DEVIN_CONNECT 路径上未知/拼错/未授权模型名静默落到免费档 selector（swe-1-6-slow）——客户端 opus/gpt 请求悄悄跑了另一个免费模型（输出错、计费错），乱名还能触发 UPSTREAM_INTERNAL 烧账户健康。/v1/models 广告的 143 个模型里只有 32 个真正映射到 selector，111 个在静默降级。
- 修复：从线上 GetCascadeModelConfigs 刷白名单（131 selector，排除 MODEL_PRIVATE_* 除 SELECTOR_MAP 引用的 3 个）；dash 形式经规范化命中真实 selector 的算 mapped；chat.js 在发上游前对 mapped:false 回 400 model_not_found。

### D18. 75518d0 — fable 裁 tool（07-08，五根因前置）
- 现场：2026-07-08 捕获证明 fable 后端在请求带 >~9 个 tool 时硬失败（UPSTREAM_INTERNAL/overloaded_error + trace ID），不是早先猜的空回复理论；Claude Code 发 30 个 tool，fable 每轮必败，还撞熔断 529。
- 修复：弱模型（claude-5-fable-*）tool 数量封顶（`WINDSURFAPI_WEAK_MODEL_TOOL_LIMIT` 默认 8），保留 tool_choice 强制 tool + 核心原语（read/edit/write/bash/grep…）+ 其余按原序；emulation 前奏与原生 #10 tools 字段都套。

### D19. 6c748aa — self-ID 中和（07-08，五根因第 1 个实证）
- 消融证据（body 原文级）：Devin 后端对 system 里 "You are Claude Code, Anthropic's official CLI for Claude." 硬拒（529 overloaded_error / 'an internal error occurred'）；翻一个词 529↔200；全模型触发（opus 也中，不只有 fable）；与 tools/thinking/beta/max_tokens/system 大小无关（5000 字符 filler → 200）。结论：客户端指纹 / 反竞争者门。
- 修复：neutralizeClientIdentity 只改写那一段自述（直/弯撇号都处理）为 'You are an AI coding assistant.'，用户真实指令不动；`WINDSURFAPI_NEUTRALIZE_CLIENT_ID=0` 可退。这就是"Claude Code 完全无法用"的总根因。

### D20. 3cce541 — security-policy 前缀中和（07-08，五根因第 2 个实证）
- 消融续集：self-ID 修完仍 401——Claude Code 的密集安全策略段（"authorized security testing / CTF / DoS / supply chain compromise / detection evasion / C2 / credential testing / exploit development"）命中上游滥用内容过滤。
- 修复：扩展 neutralizeClientIdentity 覆盖该前缀。两条消融证明上游存在两层独立内容门禁（身份层 529 + 内容层 401）。

### D21. 5997e00 — tool schema 规范化 + 剥孤儿 tool_results（07-08）
- 问题：真实客户端（OpenCode、MCP servers）发松封装 schema——缺 type/properties、required 非字符串、私有无 key（$schema）——严格上游回 UPSTREAM_INTERNAL。normalizeToolSchema 保证 object schema + properties 对象 + string[] required 只列真实属性、丢 meta key、不改真实内容。
- 第二个问题：role:'tool' 消息的 tool_call_id 对不上任何先前 assistant tool_call（没调用过的结果）→ 严格上游视为畸形。stripOrphanedToolResults 只删孤儿结果，绝不删待执行的 assistant tool_calls；`normalizeMessagesForCascade({stripOrphans})` 默认仅在原生 tool 路径开。

### D22. 84065d9 → 1c65725 — request_id #22 先补后停（07-07/08，方法论样本）
- 84065d9（+10/-2）：单捕获 req022 读出 GetChatMessageRequest #22 是 UUID，CLI 总发、我们没发 → 补发（还纠正了一个声称"#22 故意缺席"的错误注释）。
- 1c65725（+33/-16）：解码完整 9 请求捕获集（teams 会话 9501aa2c）推翻单捕获结论——#15.2 是轮次计数器（req009→022 是 1..8）不是常量 8；#22 在已验证的 turn-1 请求（req009）里缺席；网关无状态（每请求新 session_id），#15.2=1 本来就对、绝不能硬编码 8 → 停止伪造。
- 教训样本：单捕获推通则、再被全集捕获推翻——本片 wire 逆向的方法论自我修正，方向相反的一对 commit。

### D23. f58e90c → 78acd1b — host 理论提出又证伪（07-08，科研式回退）
- f58e90c：teams/self-serve 账户 token 打在非 codeium API 服务器（账户 apiServerUrl）→ GetChatMessage 401 而 GetUserStatus（全局席位服务）仍 200 → 活性正常但每聊必 401，刷 token 无效（token 没问题，是 host 错）。按账户 apiServerUrl 路由 GetChatMessage，`DEVIN_CONNECT_ACCOUNT_HOST=1` 门控。
- 78acd1b（同日 22:43，相隔 1 小时）：真实 teams CLI 捕获证明 GetChatMessage 也发 server.codeium.com（与 GetCliModelConfigs/GetUserStatus 同 host）——chat 401 从来不是 host 问题，理论证伪。flag 保留为 RE 逃生口但注释注明"NOT a fix / 生产禁用"。
- 性质：与 S 系列不同——这是假设验证过程的正常回退（±10 行），不算自伤。

### D24. a14c1ef — v3.0.0 发布单体（07-09 06:07）
- 33 文件 +2959/-1484：dashboard index.html +998、新增 account-text-parser.js +440、新增 stats.js/local-windsurf.js/check-i18n.js、删 quiet-window-updater.js -282、i18n 双语 +212、docs/index.html +740、release notes 3.0.0 新增。
- 单体化代价：把「页面加载即 ban 自己」（f8a6b95 修）和「Docker 起不来」（da0bd6c 修）两个缺陷一起发布了出去——同日两起修复即为证据，见第四节。

### D25. 3c7afdb / be15fc8 / 74295e1 — v3.0.2 三件套（07-09 10:50-10:51）
- 3c7afdb（5f +545/-41）：oauth-sessions.js 状态机（start/callback/status、state 白名单 + TTL），公共部署可自浏览器完成登录再回贴 callback URL；全局设置面板（共享偏好 + lockout 阈值，0=禁用）；OAuth chooser（开页面/复制 URL/不再询问）；前端 429 倒计时 + 轮询停；401 清 localStorage 存密码；local-import 按钮仅在显式 public-bind 信号下隐藏。
- be15fc8（5f +64/-9）：DEVIN_CONNECT/DEVIN_ONLY 部署跳过语言服务器启动与自动安装（省 ~100MB 下载 + 无 ENOENT 噪音）；install-ls.sh 加 180s 超时；DATA_DIR mkdir 失败显式报错；docker-compose env_file 可选；内置 nginx LB 补 TRUST_PROXY_*（让每调用方 lockout 在反代后仍成立）；凭证存储门禁从"loopback bind"收紧为"loopback 对端"。
- 74295e1（5f +258/-13）：api.js +168——devin-session-token$… 走 api-key 路径而非 Firebase RegisterUser（会话 token onboarding 才能成功）；release v3.0.2。

### D26. 0cb4bca / b4175ad / e1c5d11 — 运行时热配体系（07-09）
- 0cb4bca（14f +600/-44）：设置页热切换后端开关（backend switches），runtime-config-hardening 测试 +73。
- b4175ad（7f +376/-43）：熔断/限流参数热切换（breaker-tunable-hotswap 测试 +135）。
- e1c5d11（1f +65/-3）：UI 偏好 + lockout 可调项。
- 共同逻辑：所有 tunable 走 env → 运行时覆盖 → 历史默认 的三级解析，默认值全部字节等价旧行为（v3.1.0 notes 声明）——热配不改变升级行为，是安全的热改通道。

### D27. 6aa3992 — GetUserStatus 台账解码（07-07）
- 7f +443/-10：devin-connect-catalog.js +175、proto.js +5、测试 +244。把上游 GetUserStatus 的完整台账解出来——真实余额/计费周期/每模型额度，dashboard 由此展示（后由 3ba816d 露出 UI）。计费数据从"猜测"变"解码"。

### D28. 517e5d8 — email-OTP 封存（07-07，S6）
- 事实：OTP 的 Cloudflare Turnstile sitekey 域名绑定 windsurf.com，自托管 dashboard 无法渲染 widget 或取到合法 token（2026-07-07 验证）→ 面板永久不可用。f18b2ad 当天 07:08 写（6f +1008/-86），08:10 就 seal（隐藏面板、跳过注定失败的 initTurnstile 渲染循环、端点保留可触达带 seal 注释）。
- 定性：非自伤（外部平台限制），但 458 行 UI 当天封存是投入风险样本；"先验证平台可行性再写 UI"的反例。

### D29. 0639930 — tool_call nativization stage-0（07-04）
- 4f +163/-23：修 double-send（工具轮次发双份）、def-gate 默认 outer=10、strict 字段、round-trip 测试。工具仿真 → 原生 tool_call 的第一级台阶，后续 69170a5（静态反汇编定 tag）/1722c59（付费 probe 验 ToolDef tags 1/2/3）逐级钉死。

### D30. 8bd38c7 / b8a1850 / 365bbe0 — 崩溃与流生命周期（07-05/07）
- 8bd38c7（4f +193/-3）：devin-acp stdin EPIPE 与 grpc trailer 两处 uncaughtException 崩溃路径。
- b8a1850（5f +612/-35）：流 abort/heartbeat/registry + 延迟 priming（启动后延后预热，利于恢复）。
- 365bbe0（1f +25/-1）：flaky 根因——"abort 前发 session/cancel"测试用固定 300ms 定时器，全套并发下 ACP 子进程冷启动 + JSON-RPC 握手会超窗，abort 先于 session/new 解析，直接走 SIGTERM 分支没发 cancel、证据文件为空。改确定性驱动。

### D31. 9989fe6 — Gemini 原生认证（07-08）
- server.js +11/-1：extractToken 接受 x-goog-api-key 头与 ?key= 查询参数——Gemini 客户端无 Authorization: Bearer 也可用，三协议认证面补齐（OpenAI/Anthropic/Gemini 各带各的 header 习惯）。

### D32. 69170a5 / 1722c59 — wire tag 双路验证（07-04）
- 69170a5（+20/-8）：tool_call decode tags 从静态反汇编定位（verified-from-binary）——不动网先钉 tag。
- 1722c59（+22/-8）：ToolDef inner tags 1/2/3 用付费 probe 实测 + SOLO probe 模式（单账户探测，防污染）。
- 与 07c018f（DEBUG 门控 dump）、8152524（门控 wire-dump 离线 RE）构成"静态 → 捕获 → 付费实测"三阶验证。

### D33. 661b649 / 815cf59 — v3.1.1 双修（07-10，#209/#210）
- 661b649（2f +69/-3）：env-lift（工作目录/git 状态/平台）抬进 tool_calling_section 后 fable 回 0 text/0 thinking/0 tool_calls——弱模型不抬，`WINDSURFAPI_ENV_LIFT=0` 全局逃生口，非 fable 字节等价。
- 815cf59（1f +9）：docker-compose 默认 DEVIN_CONNECT=1——复现证据：emulation 路径 glm-5.2 约 1/3 轮次变"叙述代替 tool_call"，原生路径 50+ 连续 tool_call 零卡顿。裸机/systemd 默认保持 OFF。

### D34. 7ead731 — 配置落盘 0600（07-10）
- writeJsonAtomic 默认 0600（+7/-2）：账户/运行时配置/凭证库可能携带运行时 API key、dashboard 密码哈希、上游 token——共享主机上不再全世界可读。一行改动的安全边界修复。

### D35. 0c77824 / 4905209 / baa8524 — #178 tool_calls-in-thinking 三连修（07-05，v2.0.147 打包）
- 0c77824（2f +173/-6）：高推理模型把 tool_call 藏在 thinking 里、text 解析器一个都拿不到 → 从 thinking 抬 tool_calls（issue #178，客户端报 "no tool called"）。
- 4905209（1f +43/-28）：SSE 块序错误导致 "Content block not found"（上游按序交块，网关组装顺序错位）。
- baa8524（6f +150/-40）：tool-use 恢复前先缓冲 reasoning，防止恢复点之后的推理段丢失。
- 三连修同属"推理模型输出结构"适配，#178 从 07-05 修到 07-07 以 v2.0.147 打包。

### D36. d4c7259 — 云 catalog 只在启动时同步一次（07-03，v2.0.147 打包）
- fetchAndMergeModelCatalog() 只启动调一次；启动时无活跃账户则整个跳过、永不重试——新上游模型（如 Claude Fable 5）要等带活跃账户重启才出现在 /v1/models。
- 修复：_modelCatalogSynced 标志 + trySyncModelCatalog() fire-and-forget 包装（合并并发调用），挂到全部账户激活路径（addAccountByKey/Token/Email、setAccountStatus、resetAccountErrors、reportSuccess 等）。社区 PR #206（kosonen）系本实现，v2.0.147 notes 点名致谢。

### D37. 575fa1c — ACP escape-hatch 硬化（07-03）
- 10f +986/-19：devin-acp.js 的 arg 解析、JSON-line 分帧、RPC 错误映射、客户端生命周期与瞬态处理——Devin CLI 逃生通道的系统化；tool-emulation 的 preamble/tool_choice 解析精修；special-agent 路由精修；smoke 脚本加门控真实重登 round-trip 阶段。与 70f305d（分类）/07427c8（池）同夜连发，构成 07-03 夜的核心三连。

### D38. e8cbfa4 — #28.2 计费嵌套解码（07-04）
- #28 是 "Response Statistics" 容器，真实用量/计费计数在下一层 #28.2（PAID-1 捕获 2026-07-03 证实）→ decodeSubMessage 递归进嵌套非可打印消息，深度上限 SUB_DUMP_MAX_DEPTH=4，解码子节点挂 .fields；校准 harness 以点路径（28.2.3）遍历嵌套树。

### D39. 3b313f0 — selector resolver 的 catalog-existence guard（07-05）
- 根因：enum 形式透传对任何 /^MODEL_[A-Z0-9_]+$/ 原样放行且不查 catalog——伪造 MODEL_XYZ 被当 mapped:true 写进 #21 → UPSTREAM_INTERNAL；未映射名静默降级免费档。
- 修复：enum + dash 形式透传都以 CATALOG_SELECTORS（帧验证快照）为准；paid→free 降级发一次性 log.warn（不认 mapped:false 的调用方也有操作信号）；启动/测试自检断言 SELECTOR_MAP ⊆ catalog，未来地图编辑指向缺失 selector 时测试先红。

### D40. 06fdd50 — ACP vision 路由（07-07，vision 链的转折点）
- 发现：DEVIN_CONNECT 合成图像 tool_result 路径对扩展思考模型是死路——需每消息服务器签发的 Bedrock thinking 签名（#12，324B AEAD 加密、内容绑定），客户端无法伪造（2 次付费实弹 traces 7f23b3a3 / 4ae36efe + byte-diff：除 #12 外逐字段与真实捕获一致）。
- 转向：ACP 干净路径——真实 devin CLI 构造下游 wire、服务器自签 thinking 轮次，零伪造；initialize 广告 promptCapabilities.image=true。33f0698（chat 层改道）与 9989fe6（Gemini 认证）随后配套。

### D41. dd9ae04 / 6cc81fc — OAuth 硬化（07-09）
- dd9ae04（5f +163/-20）：extractOAuthToken 抛结构化错误——贴了过早的 /auth/*/callback ?code=（ERR_INTERMEDIATE_CALLBACK）与 provider error= 重定向（ERR_OAUTH_UPSTREAM），不再空返回；translateError 对冒号后缀码回退基键；stopAllPolls 关 logs SSE；OAuth chooser 防重入；401 分支恢复被 lockout 隐藏的 pw/btn。
- 6cc81fc（2f +28/-6）：过期 TTL 的 pending session 留短命 tombstone，getStatus 回 ERR_SESSION_EXPIRED 而非假 'ok'（慢浏览器登录不再看着像成功）；删死锁常量 EMAIL_LOCK_THRESHOLD/DURATION_MS（锁消息已改读实时阈值）。

### D42. aaf9701 / 03e4add — 全局设置页体系（07-09）
- aaf9701（4f +94/-4）：GET /runtime-env-status 只读回部署期 env 开关布尔（DEVIN_CONNECT/DEVIN_ONLY/cli-mode/allowClientTools/login-fallback/auto-relogin/remote-cred-store）+ credStoreEnabled 存在性标志——CRED_KEY 值本身绝不返回；设置页新增 'Runtime Backend' 只读卡 + 'needs restart' 提示。
- 03e4add（1f +78/-75）：凭证轮换与系统提示词编辑器从实验面板迁入全局设置页；loadSystemPrompts 从 loadExperimental 抽出，loadSettings 统一驱动。

### D43. 0064047 / 52e255f — entitlement 与配额收口（07-09）
- 0064047（4f +141/-23）：fable（付费 selector）请求可被路由到无 entitlement 的免费账户——选择路径调 getApiKey 时 modelKey=null，账户过滤整个被跳过（Cascade 命名空间过滤对 connect selector 会误伤全账户故置 null）→ 上游 permission_denied 以不透明 529 呈现。新增 connect 命名空间谓词 isConnectSelectorAllowedForAccount：免费可达 selector（FREE_REACHABLE_SELECTORS={swe-1-6-slow}）任意账户跑，付费 selector 需付费（或未探测 unknown）桶，operator 黑名单照常；RESOLVED selector 贯穿 getApiKey/acquireAccountByKey。
- 52e255f（2f +44/-2）：applyQuotaSnapshot 把周配额干涸（weekly% ≤ 阈值）的账户冷却 ~30min——但有正 on-demand 余额的付费/Teams 账户能继续吃预付池、按量计费；冷却既浪费已付费余额，又在小池里把模型整个打下线（正文实锤：pro 账户配额干涸被冷却 + 免费账户无 fable entitlement = pool_exhausted）。修复：干涸 + credits.balance > 0 不冷却（且清既有冷却）；零/未知余额照旧；真实按量耗尽仍走 QUOTA_EXHAUSTED 路径。

### D45. 6888f1d / f19363e — /v1/messages 22-gap 硬化（07-04）
- 6888f1d（3f +572/-89）：只做 Anthropic 兼容审查 + 对抗门确认过的、翻译层内零成本 gap：streaming message_start.usage 预填（input/cache）不再全零、finish 缺 usage 时回退本地估算（A1/G2）；document block 不再静默丢弃、image block 规范化为 OpenAI image_url、tool_result 图像子块不再拍扁为空（A2/A3/B2）。未测过的 PAID-1 常量明确留 TODO，不猜值。
- f19363e（4f +789/-14）：22 个硬化点补 +44 测试。与 0975edc/fe53fd5/2c68bdb（batch-7 四件套）同日合流。

### D46. d4dadf2 / e9f8085 / 22fb534 — 资源边界三件（07-04 19:21 同刻）
- d4dadf2（TOOL-1/2/3）：中和 tool_result 注入（伪造 tool_result 可劫持工具结果流）+ TR_PREFIX 与缓冲上界。
- e9f8085（NLU-1）：intent-extractor 的 NLU 扫描上界，抑制多项式爆炸（扫描组合随输入超线性增长）。
- 22fb534（FRAME-1/CONN-1）：decodeFrame 守卫（畸形帧不再打崩解码）+ gunzip 展开上界（压缩炸弹防护）。
- 共同逻辑：外部可控输入的资源上限——07-04 夜 19:19-19:22 五分钟内连发 5 个边界 commit（含 1f68752/e75d689），是集中硬化窗口。

### D47. 0604f0c / 052131b / ebb4d11 — 模型目录三连（07-06）
- 0604f0c（#203，2f +86/-0）：chat.js 把 RAW 请求模型名传给 resolveConnectSelector（不是 models.js 解析后的 key）——客户端用裸 `opus-4-8`/`opus-4.8` 别名时没进 SELECTOR_MAP，DEVIN_CONNECT 路径静默降级免费档：付费 opus 请求被免费服务。裸形式映射到帧验证的 claude-opus-4-8-medium，不改变既有映射值（catalog-guard 子集断言仍过）。
- 052131b（3f +559/-29）：抓线上付费（teams）GetCliModelConfigs 目录——104 模型（旧免费快照只有 24 条），direct-selector probe 证实旗舰全可达（opus-4-8 全 effort、sonnet-5、fable-5、gpt-5.4/5.3-codex/5.4-mini、gemini-3.5-flash/3.1-pro、deepseek-v4、glm-5-2、gpt-5-5 等）；快照并集覆盖双档。
- ebb4d11（2f +75/-17）：2026-07-05 付费 opus-4-8 捕获（.workflow-results/paid-live-2026-07-05/）修正两个解码路径——actual_model_uid 在 #7 元数据子消息的 #7.9（INNER tag 9），不是顶层字段（原顶层读取让 DEVIN_CONNECT_ACTUAL_MODEL_TAG=9 失效）；碎片化 tool_call args 合并。两处均 env 门控，默认行为不变。

### D48. d6bd433 — 实验 flag 白名单 + system-prompt 覆盖硬化（07-09）
- setExperimental 只收 DEFAULTS.experimental 白名单键（派生式白名单，新 flag 自动覆盖）；getExperimental 过滤到已知键——白名单前的客户端遗留孤儿脏键不再泄漏回读。
- setSystemPrompts：空/纯空白覆盖删除键（回落到内置默认）而非持久化一个空白 prompt；覆盖存 20000 字符上限（会乘进每请求 proto 字段）。
- dashboard 编辑器：textarea maxlength + 清空保存时报告 reset 并重载，恢复的默认值即时可见。

### D44. 9ca6dce / 9f648c3 — WebGL2 fire slider 27 分钟往返（07-08，S4）
- 9ca6dce（3f +209/-1，11:45）：把 ultracode fire-slider demo 移植成 Accounts 面板真实状态筛选器（All/Active/Disabled/Problem），最右 Problem 档点燃 WebGL2 ember 模拟（ping-pong FBO + 分离模糊 + tonemap），WebGL2 不可用降级为普通滑块，reduced-motion 跳过，RAF 空闲停；驱动真实客户端行过滤（data-acct-status），无 refetch。
- 9f648c3（3f +3/-211，12:12）："had issues in use"——整体移除（HTML 挂载/CSS .ff-*/FireFilter 脚本块/loadAccounts 过滤/i18n 键全清），Request Trend 加宽替代（Overview 行改 minmax(240,340px)+1fr，canvas 170→220px）。
- 定性：27 分钟做废返工，07-08 冲刺日 34 commit 高压环境下的炫技型功能；revert 干净（无残留、账户列表/分页/掩码键/reveal 重验未动）。

---

## 三、问题链清单（7 条完整链）

### 链 1：429 lockout 死循环（本片最重的问题链）
**现象**：小池子整体黑屏；单个限流账户能把整个代理打到 429，且越重试越黑。
**链节**（按时间）：
1. 1f68752（07-04）：lockout map 有界化 + refcount + XFF——机制地基。
2. 7320754（07-05）：XFF-1 lockout 绕过 + AUTH-1——攻击面收紧。
3. 07427c8（07-03）：池健康窗口/加权选择——选择机制成形。
4. 1e3412d（07-08）：硬限流被 CAPACITY 分支误收 → 可重试 → 60s 冷却 → 向 3h 硬限流反复重试放大负载（07-08 实测现场）。**放大节点**。
5. e5dc30c（07-08）：熔断不看池大小，单账户部署自我全宕。**脆弱节点**。
6. ff36591 / 31887f2（07-08）：空补全自愈机制先落地，门太严（ct<=2）导致 15/15 空回复零自愈。
7. fbb3379（07-08）：111/143 模型静默降级免费档 + 乱名烧健康。**火上浇油**。
8. b4175ad / e1c5d11（07-09）：熔断/限流/lockout 参数热配化——修前先给扳手。
9. 839e6ee（07-10）：**主修复**——tier-aware 最后账户豁免 + degraded-serve + Retry-After clamp + 隔离 5min→2min + 裸 429 冷却可调（+970）。
10. 52e255f / 0064047（07-09）：有按需余额不 quota-cool、免费账户不暴露付费选择器——配额侧收口。
**闭环机制**（839e6ee body 官方叙述）：单账户限流 → 硬过滤 → 池空 → 429 → 客户端自动重试 + 服务端无界 Retry-After → 冷却被续命 → 黑屏自持。修复点全部打在"续命"与"误伤"两个环节。
**残留**：degraded-serve 默认关（字节等价旧行为），意味着默认部署仍可能 429——缓解是可选逃生口，不是根治。

### 链 2：Claude 系 tool_call 五根因（现象 → 逐层消融 → 全修）
**现象**：Claude Code 等 agent 客户端连 DEVIN_CONNECT 原生路径要么 529、要么 401、要么 internal error；gpt/swe 同编码却正常。
**链节**：
1. 84065d9（07-07）：补 request_id #22（单捕获推得）。
2. 1c65725（07-08）：全捕获推翻单捕获——#22 turn-1 缺席、#15.2 是轮次计数器；停止伪造。**方法论修正**。
3. 6c748aa（07-08）：消融钉死第 1 因——"You are Claude Code…"身份指纹 → 上游 529（翻一词 529↔200，全模型命中）。中和 self-ID。
4. 3cce541（07-08）：消融钉死第 2 因——security-policy 前缀 → 401 滥用门禁。扩展中和。
5. 5997e00（07-08）：松封装 tool schema → UPSTREAM_INTERNAL；孤儿 tool_results → 畸形。规范化 + 剥离。
6. 75518d0（07-08）：fable >9 工具硬失败（非空回复，是硬上限）→ 裁到 8。
7. 31887f2 / 1e3412d / fbb3379（07-08）：空补全判定、限流分类、模型映射三件套——把"失败后被怎么对待"理顺。
8. 3584bac（07-10）：**五因全修**——身份中和独立成模块（identity-neutralize.js）、CONTENT_BLOCKED 分类不罚账户、空 system 补注、tool 描述截断 500。
**闭环机制**：上游有两层内容门禁（身份层 529 + 内容层 401），外加格式严格性（schema/描述长度/空 system）与弱模型容量天花板（tool 数）；任一不修，Claude 系必败，且误分类会把健康账户连带罚下。
**残留**：中和是白名单改写（精确短语替换），上游若改检测面需重做消融。

### 链 3：v3.0.0 打开页面 ban 自己（发布日自伤，S3）
**链节**：a14c1ef（07-09 06:07）dashboard 全量重写（预加载 ~12 个空密码认证调用）→ 每个空密码 401 都计失败 → 页面加载即自 ban（IP lockout）→ 同日 10:50 f8a6b95 修（空密码不计失败、仅提交的错误密码计、429 前端停轮询显倒计时、阈值 0 即释放）→ 10:51 74295e1 以 v3.0.2 打包。
**闭环机制**：失败计数口径与页面真实行为脱节——预加载探测型请求被当成登录失败。4 小时 44 分内从发布到收口。
**教训**：认证失败计数必须区分"探测请求"与"真实提交"。

### 链 4：S1 jimp 违反零依赖铁律（引入 → CI 红 → 14 小时回收）
**链节**：6cce2ae（07-03 23:17）引入 jimp 1.6.1，package.json 描述自改 "Single runtime dependency" → 2b2e0e0（07-04 11:45）CI 升 Node 24（无关的并发债）→ 2ab55ea（11:55）CI 不装依赖，image-resize.test.js 唯一 import jimp → shard 0 ERR_MODULE_NOT_FOUND → 413106e（12:31）顺带修 README dependency claim → 6b8845a（13:10）vendor jpeg/png 编解码器，去 jimp，描述改回 zero-dep（+2356/-848）→ e75d689（19:19）vendor 解码器补资源上限。
**闭环机制**：项目核心卖点"零 npm 运行时依赖"被功能需求（vision 降采样）突破，CI 缺失装依赖环节让问题以最显眼方式暴露，14 小时内以 vendor 化回收；package-lock 净收缩（v1 数据 -796 行）。
**教训**：铁律突破要以"先证明不可行再突破"为前提；依赖引入要同步 CI 基线。

### 链 5：S2 host/key 泄漏进公开仓（历史值 → redact → 整删 → 屏蔽 → 纪律）
**链节**：历史遗留（README、CUTOVER、RE_PLAN、7 份 release notes、2 个测试中烙有真实 host/key/账户名）→ 413106e（07-04 12:31）13 文件 redact 为占位符（key→sk-REDACTED、host→<LAB_HOST>/<PROD_VPS>/<UPSTREAM_HOST>，类别见 D7）→ 4243d93 + 4cdabd2（gitignore 屏蔽会话转录/凭证文档/ref 仓）→ a4d90da（07-07）删 1401 行内部笔记 → 6ffad0b（07-04）commit 纪律文档化（禁 debug/AI 署名、trace tags）。
**闭环机制**：泄漏四层处理——值 redact、文件整删、入口屏蔽（gitignore）、行为纪律（contributing 文档）。git history 仍含原值（"present in public history"），止血不等同洗史。
**教训**：内部 reversing 工作产物与公开文档混放是泄漏通道；凭证校验应进交付流程（后置 npm run secret-scan 脚本存在但本片内未见 CI 强制）。

### 链 6：v3.0.0 Docker 无法 boot（发布 → 2h17m → v3.0.1）
**链节**：a14c1ef（06:07）发布，catalog 快照仍在 test/fixtures/（运行时 src/devin-connect-models.js 用 readFileSync 读它）→ Dockerfile 只 COPY src/ → docker run / compose up 启动即 ENOENT 崩溃 → da0bd6c（08:24）快照 rename 到 src/data/、catalog-drift 测试改读同一文件、v3.0.1（2 小时 17 分）→ be15fc8（10:51）foolproof：.env 可选、TRUST_PROXY_*、LS 跳过、install 超时。
**闭环机制**：测试 fixture 目录被当作运行时资源目录——测试通过（本机有 test/）但镜像没有。修复把"运行时读取路径"与"测试断言路径"合一（单源）。
**残留**：v3.0.0 镜像（若有人留存）仍是坏的；文档要求 pull v3.0.1+。

### 链 7：空补全家族（检测 → 分类 → 容量 → env-lift，跨 4 天收敛）
**链节**：ff36591（07-08）自愈重试机制 → 31887f2 门太严零自愈（15/15）→ 1e3412d 限流误分类放大 → 75518d0 fable 工具数硬上限 → fbb3379 静默降级 → 661b649（07-10）fable env-lift 空补全（#209）→ 815cf59（07-10）默认原生路径规避 emulation 叙述化（#210）。
**闭环机制**：同一个"空/错输出"现象，先后发现 5 个独立成因（概率空、判定门、限流分类、工具数、env-lift），每个都经真实捕获定位；最终在 v3.1.1 双修收口，并把默认路径切到原生以绕开 emulation 层。

---

## 四、v3.0.0 发布日解剖（2026-07-09，JST +09:00）

### 时间线（27 条 commit，全部 +09:00）

| 时段 | commit | 阶段标注 |
|---|---|---|
| 06:07 | a14c1ef release: prepare v3.0.0 | **发布动作** |
| 08:24 | da0bd6c v3.0.1 Docker boot 修复 | **发布后修复 #1（+2h17m）** |
| 10:50 | e1c5d11 lockout/UI 热配 | 发布后修复 |
| 10:50 | f8a6b95 停止 false-positive bans | 发布后修复（S3） |
| 10:51 | be15fc8 foolproof docker | 发布后修复 |
| 10:51 | 3c7afdb 公共 onboarding + 全局设置 | 发布后补功能 |
| 10:51 | 74295e1 onboarding 端点 + v3.0.2 | **v3.0.2 落版（+4h44m）** |
| 11:01-11:12 | 3615a8f / 3ba816d / a1ad49a | 打磨 |
| 11:58-12:25 | dd9ae04 / 6cc81fc / 67dd240 | OAuth/会话硬化 |
| 13:05-13:39 | 7620a92 / d6bd433 / aaf9701 / f55ce9f | 设置页体系 |
| 14:20 | 0cb4bca 后端开关热切换 | 功能 |
| 15:07-15:21 | 93dff4e / 980a7d7 / 03e4add / b4175ad | 打磨 + 熔断热配 |
| 15:55-16:04 | c1f9d4c / 1af865b | 打磨 |
| 16:28 | 8152524 gated wire-dump | 校准工具 |
| 17:01-17:11 | 0064047 / 52e255f | 配额/entitlement 收口 |

### 解剖：v3.0.0 是怎么"发布当天就被打补丁"的

1. **发布形态**：a14c1ef 是 33 文件 +2959/-1484 的单体——dashboard 全量重写、新增 account-text-parser、删 quiet-window-updater、站点重写。单体发布 = 缺陷面一次性铺开。
2. **发布后 2h17m**：da0bd6c 打 v3.0.1——catalog 快照在 test/fixtures/ 而镜像只带 src/，容器 boot 即崩。**Docker 路径的打包边界错位**，裸机部署不受影响，说明发布前验证只覆盖了裸机路径。
3. **发布后 4h44m**：e1c5d11 + f8a6b95 + be15fc8 + 3c7afdb + 74295e1 五个 commit 一次落成 v3.0.2——其中 f8a6b95 是**当天引入当天暴露的自伤**（页面加载即自 ban，S3），be15fc8 是部署面修复（.env 缺失即 abort、反代后 lockout 失效），74295e1 是 onboarding 路由修复（会话 token 走错注册路径）。**v3.0.0 的生命期只有 4 小时 44 分**。
4. **v3.0.2 之后的 16 个 commit**：全部是打磨/功能/配额收口，无崩溃级修复——说明 v3.0.2 才真正把发布面稳住了。
5. **版本轨迹**：v3.0.0（06:07）→ v3.0.1（08:24，boot）→ v3.0.2（10:51，ban/onboarding/deploy）。同日三连版。
6. **前夜背景**：07-08 22:43 结束 devin-connect 收尾（78acd1b/1c65725），当晚 0 commit 直接进发布——发布前无冒烟缓冲。后两天 07-10 又两连版（v3.1.0/v3.1.1）承接 429 与五根因两座大山，v3.0.x 本身不含这两个修复。

---

## 五、统计与节奏

- 按日分布：07-03 共 8、07-04 共 22（硬化日）、07-05 共 8、07-06 共 3、07-07 共 15（双发布 + 登录/账单）、07-08 共 34（Dashboard 冲刺 + 排查日，本片单日最高）、07-09 共 27（发布日）、07-10 共 9（收尾）。
- 单体 TOP5：70f305d（+4340）、a14c1ef（+2959）、6cce2ae（+1967）、ec7954d（+1546）、0975edc（+1244）。
- 发布轨迹：v2.0.146 → v2.0.147 → v3.0.0 → v3.0.1 → v3.0.2 → v3.1.0 → v3.1.1，本片 8 天（07-03~07-10）7 个版本号，落在 3 个发布日（07-07 / 07-09 / 07-10）；07-09 单日 3 版。
- 自伤与 v1 对照：S1（jimp）链 4、S2（redact）链 5、S3（自 ban）链 3、S4（WebGL2 fire slider：9ca6dce 11:45 引入 → 9f648c3 12:12 revert，27 分钟做废返工）、S5（Docker boot）链 6、S6（OTP seal）D28——6 起全数落链。链 1/2/7 为本片新立的系统性故障链。
- 方法论样本：1c65725（多捕获推翻单捕获）、78acd1b（理论证伪回退）、6c748aa/3cce541（消融翻转词验证）——wire 逆向的证伪纪律贯穿本片。
