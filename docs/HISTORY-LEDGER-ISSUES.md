# WindsurfAPI 记账本 v2 · 全部 177 个 issue 逐条账

生成时间：2026-08-12 · 数据源：`/tmp/all-issues.txt`（177 条原始数据）+ 9 份时间片采集文件 + `git log --all` + `gh issue view` 关闭评论补证。

## 口径说明

- 分类：按 labels + 标题判定（bug / feature / 上游 / 其他，docs 归其他）。
- 结局：COMPLETED / NOT_PLANNED / DUPLICATE / OPEN（与 stateReason 一致）。
- 修复证据：优先时间片关联表的 commit hash；缺的用 `gh issue view` 关闭评论补（版本号/commit）；两者皆无记「无」。
- 修复证据列中括号内为版本号，hash 均为 git 实测存在（770ad7e 为 fork 侧 commit，以合入 commit 9dc019e 为准）。

## 逐条账（按编号排序，177 条全量）

| # | 报告日 | 标题（精简） | 分类 | 结局 | 修复证据 | 备注 |
|---|--------|------------|------|------|---------|------|
| 2 | 2026-04-17 | 大佬，这个非常厉害，calude code 不支持好像 | bug | COMPLETED | c3a4c82 | 04-20 落地 /v1/messages 端点回应 #2 |
| 3 | 2026-04-19 | Firebase 登入失敗: 信箱或密碼錯誤 | bug | COMPLETED | 3045ddb | Firebase 登录 actionable error + OAuth hint |
| 4 | 2026-04-19 | 无法操作文件系统？ | 其他 | COMPLETED | 4f9a767 | 收 #2-5 一批 |
| 5 | 2026-04-20 | prompt | bug | COMPLETED | 7c62147/b7937b0 | 超长 payload 友好错误 + 180s 冷滞动态重试 |
| 6 | 2026-04-20 | <(0o0)> | 其他(docs) | COMPLETED | 无 | 闲聊/帮助帖，06-02 关闭；无实质修复 |
| 7 | 2026-04-20 | language_server_linux_x64文件如何得到 | bug | COMPLETED | v2.0.40 (31578fd) | dashboard 一键更新 LS binary；install-ls.sh 线 5430b61 |
| 8 | 2026-04-20 | 调用模型时报错Error: neither PlanModel nor Requested… | bug | COMPLETED | fe4ddb1/6680906 | 双字段填充 + 手动 tier 覆盖 |
| 9 | 2026-04-21 | cursor 模型命名不一样好像用不了 | bug | COMPLETED | efcb713/98b308c | dated aliases + Cursor 友好别名 |
| 10 | 2026-04-21 | 这个 linux server 的下载链接是哪里？ | bug | COMPLETED | 5430b61 | install-ls.sh 一键拉 Exafunction/codeium release |
| 11 | 2026-04-21 | 当前项目似乎会瞬间触发速率限制？ | bug | COMPLETED | 无 | 上游 IP 检测限流；配置引导（每账号代理/RPM 20/reuse） |
| 12 | 2026-04-21 | 后续可以添加上传图片的功能吗 | feature | COMPLETED | fad32d3/1f98fff | OpenAI+Anthropic 双格式图片上传 + plannerMode vision |
| 14 | 2026-04-21 | claude调用的时候报错internal error | 上游 | COMPLETED | 无 | 上游 internal error，按上游行为关闭 |
| 15 | 2026-04-21 | opus 4.7 似乎访问不了？ | bug | COMPLETED | a6376f8 | opus-4-7 alias |
| 16 | 2026-04-21 | [Bug][不是BUG] 账号密码登陆不行 | 其他 | COMPLETED | 无 | not a bug（用户侧） |
| 17 | 2026-04-21 | [Feature] claude code速度很慢 | 上游 | COMPLETED | 无 | 上游限频/网络，按上游解释关闭 |
| 18 | 2026-04-21 | [Bug][Bushi] 请求了一下直接崩溃了，还没成功请求一次。 | bug | COMPLETED | e3271de | 启动自动装 LS binary 修崩溃 |
| 19 | 2026-04-21 | [Bug] Error: spawn ENOEXEC | bug | COMPLETED | d1d628c/e4fed17 | ENOEXEC 平台提示 + macOS 兼容 |
| 21 | 2026-04-21 | [Bug] 在控制台用google登录的时候报错 | 上游 | COMPLETED | 无 | Google 登录上游报错，按上游关闭 |
| 22 | 2026-04-21 | [Bug] Claude Code / Cline 工具调用兼容问题：Cascade 将 … | bug | COMPLETED | 3ef2061/4fce358/3b2a30c/18a3d81/72bd2ed | tool_code 流式实时解析 + 裸 JSON 兼容 + 三模块审计 |
| 23 | 2026-04-22 | [Bug] 文件 | 其他 | COMPLETED | 无 | not a bug |
| 24 | 2026-04-22 | [Bug] 聊天上下文丢失 | bug | COMPLETED | dfe0c43/16c1cda/b173f3d/d1687e1/78d3628/1e1d923/b8a2057 等 15+ | 头号问题，reuse 指纹/历史打包/redact 逐层修复 |
| 25 | 2026-04-22 | [Bug] SOCKS5无法代理 | bug | COMPLETED | ba53e92 | SOCKS5 修复 |
| 27 | 2026-04-22 | [Bug] 反代被识别导致限流 | 上游 | COMPLETED | dfb979a/9740ec2 | 反代指纹深度修复 6 项（OS/硬件/workspace/flag） |
| 28 | 2026-04-22 | [Bug] 客户端是Openclaw时报错 | bug | COMPLETED | 5a6e7be/79cd990/d6e816c | 账号间 backoff + 空 user 拒绝 + prompt 语气柔化 |
| 29 | 2026-04-22 | [Bug] Claude Code / Codex 接入时 Claude 系和 4.7 很… | 上游 | COMPLETED | dfb979a | trial global rate limit：指纹修复缓解 |
| 30 | 2026-04-22 | [Bug]Claude Code识别图片报错，提示无效的工具调用 | bug | COMPLETED | 0372c18 | 图片识别无效工具调用 |
| 32 | 2026-04-22 | [Bug] 使用claudecode没法读取本地工作目录 | bug | COMPLETED | cac0b8d | 工具仿真改 READ_ONLY |
| 33 | 2026-04-22 | [Feature] 批量代理+账号 | feature | COMPLETED | a1d4efc | 批量代理+账号导入 + update.sh |
| 34 | 2026-04-22 | [Feature] 余额建议显示每日限制、每周限制、提示词限制 | feature | COMPLETED | 621888e | 余额日/周/提示词三条进度条 |
| 35 | 2026-04-22 | [Bug] claude code里使用时，中文对话时经常回复英文 | bug | COMPLETED | 11629f1/0edf11e | communication_section 语言跟随 |
| 37 | 2026-04-22 | [Feature] 并发 | feature | COMPLETED | dea6758 | 并发支持 |
| 38 | 2026-04-23 | [Bug] claude code读取不到真实目录 | bug | COMPLETED | bef4b8a | workspace 路径全链路 sanitize + meta-tag strip |
| 39 | 2026-04-23 | [Bug] cline好像不能调用工具是吗 | bug | DUPLICATE | 无 | DUPLICATE，与 #40 同源 |
| 40 | 2026-04-23 | [Bug] 不支持cline插件的工具调用是吗 | 其他 | COMPLETED | 无 | not a bug（cline 插件侧） |
| 41 | 2026-04-23 | [Bug] 反代后在cc无法使用了，一直停止 | bug | COMPLETED | c504f1f/ab44d8f | sysText 包裹 <system_instructions> 避 injection 判定 |
| 42 | 2026-04-23 | [Feature] 针对free账号的模型ID的获取 | feature | COMPLETED | 101cd90 | 免费账号动态云候选探测 |
| 46 | 2026-04-24 | [Bug] 反代出来的模型上下文是多大 | 其他 | COMPLETED | 无 | not a bug（咨询） |
| 47 | 2026-04-24 | [Bug] Claude Code 工具调用失败 | bug | COMPLETED | 9351159 | 结构化输出 + 工具调用 bug 修 |
| 48 | 2026-04-24 | [Feature] PDF文档识别 | feature | COMPLETED | 58a80f1 | PDF 文本层提取 + OpenAI PDF 输入 |
| 49 | 2026-04-24 | [Bug] 按照README部署失败，LS启动失败 | 其他 | COMPLETED | 6ae7f79 | LS stderr warn 展示 + exit 1 诊断提示 |
| 52 | 2026-04-24 | [Bug] 为什么一直使用cascade，关闭了对话还在使用 | bug | COMPLETED | b3af74a | cascadeConversationReuse 文案纠正 + credits 加权 |
| 55 | 2026-04-25 | [Bug] 上下文截断问题严重 | 其他 | COMPLETED | 无 | not a bug（咨询/现象确认） |
| 56 | 2026-04-25 | Feature request: Add /v1/responses endpoint f… | feature | COMPLETED | 9c6b685 | 实现 /v1/responses 端点（476 LOC 新模块） |
| 57 | 2026-04-25 | [Feature] 思考超过30秒之后，没有输出会中断 | feature | COMPLETED | a434c40 | stream reuse 硬化 + 安全边缘 |
| 59 | 2026-04-25 | [Bug] Claude Code 通过 WindsurfAPI/Cascade 使用时，… | bug | COMPLETED | 875cf53/a434c40/fd34859/5824773 | CASCADE_MAX_WAIT_MS 600s + 审计驱动硬化 7 项 |
| 60 | 2026-04-25 | [Bug] docker-compose启动报错 | bug | COMPLETED | 9dc019e | PR #58 merge：join import + nginx zone（fork commit 770ad7e） |
| 63 | 2026-04-25 | [Bug]Codex 兼容性问题：/v1/responses 流式响应未正常结束 | bug | COMPLETED | 9c6b685/e968fbf/5824773 | responses 流式终止 + envelope 事件包 |
| 66 | 2026-04-26 | [Bug] 300秒限速 | bug | COMPLETED | 5824773 | 300s 限速误报：retry-after 精确解析 |
| 67 | 2026-04-26 | [Bug] docker-compose启动项目后账号丢失了 | bug | COMPLETED | 2e29724 | docker-compose 升级保留 accounts.json |
| 68 | 2026-04-26 | [Bug] 回复的模型和使用的模型不一致 | bug | COMPLETED | 2ed79ad | 裸 claude-4.6 路由 + 未知模型 400 |
| 69 | 2026-04-26 | [Bug] docker-compose多副本模式还支持粘性会话吗？ | bug | COMPLETED | v2.0.9 (cbe43fc) | REPLICA_ISOLATE=0 默认单副本 + cluster-shared accounts.json |
| 70 | 2026-04-26 | [Bug] Tool definitions are too large (97KB > … | bug | COMPLETED | 42d531f (v2.0.10) | tool-payload 先 compact 再硬上限 |
| 71 | 2026-04-26 | [Bug]  Read 缓存在读取被截断后返回不含正文的 stub，导致重复读取和多文件正… | bug | COMPLETED | c663001/7649f9f | 行号化 Read body 跳过 stub + 歧义标记 |
| 75 | 2026-04-27 | [Bug] | bug | COMPLETED | v2.0.10→v2.0.26 | compact fallback → schema-compact 两级压缩 |
| 76 | 2026-04-27 | [Feature] 请支持devin导入账号 | feature | COMPLETED | 无 | 关闭无解释（仅「嗯？」） |
| 77 | 2026-04-27 | [Bug] claude code返回的内容都变成json了 | bug | COMPLETED | 0cbecfd/a18661b | tiered tool preamble 压缩，修 opus 短回复 |
| 78 | 2026-04-27 | [Feature] 请增加gpt5.5模型 | feature | COMPLETED | 无 | 用户自解（模型名称写错） |
| 79 | 2026-04-27 | [Bug] | bug | COMPLETED | v2.0.32 | CodeBuddy 截断；升级复测（版本证据） |
| 81 | 2026-04-27 | [Feature] 开放更多free账号的模型 | feature | COMPLETED | 无 | 用户自解（自行调通后主动关） |
| 82 | 2026-04-27 | [Bug] cachePolicy is not defined | bug | COMPLETED | ea7ad69 | cachePolicy ReferenceError |
| 83 | 2026-04-27 | [Bug] | bug | COMPLETED | ea7ad69 | cachePolicy ReferenceError |
| 84 | 2026-04-28 | [Bug] 账号密码登陆又不行了 | bug | COMPLETED | bbc9746 + 2.0.39 (ef41682) | 空 password header 修复 + 恢复 email 登录模式 |
| 85 | 2026-04-28 | [Bug] 服务器是liunx  使用端是win  命令全是liunx的, 而且会丢上下文 | bug | COMPLETED | v2.0.25/v2.0.26 | KEY_VERSION=2 指纹重写 + extractCallerEnvironment CWD 注入 |
| 86 | 2026-04-28 | [Feature] free可以使用glm吗 | feature | COMPLETED | 9c2dc30/0984875/946a14f | GLM/Kimi tool-call 方言解析器 + 序列化回写 |
| 87 | 2026-04-28 | [Feature] | feature | COMPLETED | 1c40d46/6f20680 (v2.0.32) | docker self-update 优雅不可用状态 |
| 91 | 2026-04-29 | [Feature] 自动读取已安装windsurf的app凭证 | feature | COMPLETED | 7299d4a (2.0.28) | 本地 Windsurf 凭证导入 |
| 93 | 2026-04-29 | [Bug] 上下文会丢 | bug | COMPLETED | eeff104/599ddf0/1d5b61c | Sonnet 4.6 thinking 开 reuse + routingModelKey 修复 |
| 94 | 2026-04-29 | [Bug] opus-4-7  使用报错 | bug | COMPLETED | 3ebd658 | claude-opus-4-7 thinking auto-route 关闭 |
| 95 | 2026-04-29 | [Feature] 希望支持openai的代理 | feature | NOT_PLANNED | 无 | NOT_PLANNED（openai 代理方向不做） |
| 96 | 2026-04-29 | [Bug] 没办法取到项目路径 | bug | COMPLETED | 8539d2e | 取不到项目路径 |
| 97 | 2026-04-29 | [Feature] 适配Sub2api | feature | COMPLETED | ca96019 | Sub2api 适配 |
| 98 | 2026-04-29 | 运行cmd 命令报错 | bug | COMPLETED | 1d5b61c | cachePolicy ReferenceError |
| 99 | 2026-04-29 | [Bug] routingModelKey is not defined | bug | COMPLETED | 1d5b61c (v2.0.36) | routingModelKey ReferenceError；关闭 04-29 早于修复落地 04-30 |
| 100 | 2026-04-29 | [Bug] 部署到远程linux服务器无法返回正确的tool use | bug | COMPLETED | 4a96d92 | 远程部署 tool use 修复（cascade 超时轨迹失效） |
| 101 | 2026-04-29 | [Bug] 上下文丢了、 | bug | COMPLETED | 4a96d92 | cascade 超时后坏轨迹不再放回池 |
| 102 | 2026-04-29 | [Bug] The model produced an invalid tool call | bug | COMPLETED | 4a96d92 | invalid tool call（同批修复） |
| 103 | 2026-04-30 | [Bug]模型 xxx 不在允許清單中 | bug | COMPLETED | 4efd0e3 | 不在允许清单：fresh account 目录 |
| 104 | 2026-04-30 | [Bug] claude4.7opus固定返回 json格式出错 | bug | COMPLETED | 4efd0e3 | opus JSON 污染：结构化指令只注入 system |
| 105 | 2026-04-30 | [Bug] windows 运行命令报错。 | bug | COMPLETED | v2.0.44/v2.0.45 | Windows 命令错误：cwd 提取双侧补齐 |
| 106 | 2026-04-30 | [Bug] 为什么用云服务器搭建会使用Linux命令的原因 | bug | COMPLETED | b4a9ebf/222526b (v2.0.44/45) | 云服务器 Linux 命令问题：env 提取 |
| 107 | 2026-04-30 | [Bug] env NOT lifted (extractor returned empt… | bug | COMPLETED | b4a9ebf/222526b (v2.0.44/45) | env NOT lifted 修复 |
| 108 | 2026-04-30 | [Bug] 分析项目会出来从来没有见过的空目录 | bug | COMPLETED | 04bb2ad | 分析出不存在目录 |
| 109 | 2026-05-01 | [Feature] 这个没用5.5模型 | feature | COMPLETED | b7e5910/30657ab/5b952fa/455a9c6/80cffbb | gpt-5.5 等 SKU 系列 + salvage |
| 110 | 2026-05-02 | [Bug] DASHBOARD_PASSWORD 留空现在会始终弹出认证界面 | bug | COMPLETED | b8c0554 (2.0.61) | DASHBOARD_PASSWORD 空认证弹窗 |
| 111 | 2026-05-02 | [Bug] 一直在重复 重复 重复 都不停的,一直输出重复的内容 | bug | COMPLETED | b8c0554 (2.0.61) | 重复输出（reuse 家族） |
| 112 | 2026-05-02 | [Feature] | feature | COMPLETED | 9ae100b (2.0.67) | quiet-window 自动 docker self-update |
| 113 | 2026-05-02 | [Feature] | feature | COMPLETED | b8c0554 (2.0.61) | 空 feature 请求 |
| 114 | 2026-05-02 | [Bug] 登陆取号-邮箱密码登录失败 | bug | COMPLETED | b8c0554→fd031fd/a1eb82e (2.0.90) | 邮箱密码登录 OTT 端点紧急绕路 |
| 115 | 2026-05-02 | [Bug] codex中使用gpt模型，无tool call返回 | bug | COMPLETED | 1026cd3 起 48 条 + 6-05/06 native bridge | gpt_native 方言 → NLU 转换层 → native bridge 三稿 |
| 116 | 2026-05-02 | [Bug] 还是没有解决一直重复的问题  分析完的数据 还是会重新再分析 再总结 一直循环 | bug | COMPLETED | v2.0.90 修复链 | 重复输出；normalizeSystemPromptForHash 正则修复 |
| 117 | 2026-05-02 | [Feature] 作者好像之前的对话被关闭了，看看新的问题 | feature | COMPLETED | e82c065 (2.0.68) | 空 enhancement |
| 118 | 2026-05-02 | [Feature] | feature | COMPLETED | e82c065/ccc8b61 (2.0.68/84) | 限流功能 usage/fallback hint |
| 119 | 2026-05-02 | [Feature] 能不能让动态代理也一个ip一个 LS server？ | feature | COMPLETED | e82c065 (2.0.68) | 动态代理一 IP 一 LS server |
| 120 | 2026-05-02 | free账户增加工具调用 | feature | COMPLETED | v2.0.82 (c793899) | free 账户工具调用：NLU retry-with-correction |
| 121 | 2026-05-02 | [Feature]  可以新增支持CodeX 的 /v1/response 端点吗？ | feature | COMPLETED | 已有功能 (9c6b685) | /v1/responses 已支持，v2.0.71 确认 |
| 122 | 2026-05-02 | [Bug] 调用工具拉取代码或者下载东西的时候会有个25秒超时 | bug | COMPLETED | v2.0.77/v2.0.79 | 三档 stall 超时（工具 180s/思考 120s/文本 45s）+ toolActive 窗口 |
| 123 | 2026-05-03 | [Feature] | feature | COMPLETED | a1eb82e | 空 enhancement（audit 关联） |
| 124 | 2026-05-03 | [Bug]Claude 模型自动启用 native tool bridge 导致工具调用永… | bug | COMPLETED | v2.0.77 默认关 + v3.1.1 | native tool bridge 卡死：默认关闭；v3.1.1 走 DEVIN_CONNECT native |
| 125 | 2026-05-03 | [Bug] 工具调用一直不行，不知道为什么，看提交好像是支持的啊 | bug | COMPLETED | f6194f2/c793899 (2.0.81/82) | 中文 NLU + retry-with-correction |
| 126 | 2026-05-03 | [Feature] 增加账号轮询速度 | feature | COMPLETED | 9156063 (2.0.85) | 账号轮询速度：自动 fallback |
| 127 | 2026-05-03 | [Bug] Dashboard 一键更新后会残留旧的 language_server 进程 | bug | COMPLETED | 9156063 (2.0.85) | 旧 language_server 进程残留两层清理 + SIGKILL |
| 128 | 2026-05-03 | [Feature] 限流功能 | feature | COMPLETED | 9156063 (2.0.85) | 限流功能落地（fallback 默认开） |
| 129 | 2026-05-04 | Context continuity can break after Claude rat… | bug | COMPLETED | 80d6079/9a404a0 (2.0.86/87) | rate-limit fallback 上下文断裂：回归三连真修 |
| 130 | 2026-05-04 | [Bug] 在使用 win 环境的 Codex app 时，出现一些问题 | bug | COMPLETED | v2.0.91 (7e5ae0e) | Codex app content_policy：neutralizeIdentityForCascade |
| 131 | 2026-05-04 | [Bug] API Error: Content block not found | bug | COMPLETED | 无 | 悬空：关闭仅群发横幅，无任何修复证据；同报错串 07-05 (4905209) 才修 |
| 133 | 2026-05-04 | 任务执行一半的时候，会突然忘记之前的内容 | bug | COMPLETED | v2.0.95 (626f71b/549a775) | sticky session 绑定 + LS 自动重启 |
| 134 | 2026-05-05 | [Bug] 邮箱-密码登录失败 | bug | COMPLETED | a4b768a/04c1500 (PR #144) | PostAuth 加头 + 空 proto body 解析 |
| 135 | 2026-05-05 | [Bug] claude模型都报这个错误 | bug | COMPLETED | 5269f04 | streamResponse ReferenceError context |
| 136 | 2026-05-05 | [Bug] hermes报错 | bug | NOT_PLANNED | 无 | NOT_PLANNED（hermes 报错不复现） |
| 137 | 2026-05-05 | [Bug] 无法添加本地代理 | bug | COMPLETED | 7e5ae0e (2.0.91) | 无法添加本地代理：proxy parse |
| 138 | 2026-05-06 | [Feature] | feature | COMPLETED | dd5a4d1 (2.0.92) | /auth/login 支持 proxy 绑定 |
| 140 | 2026-05-06 | [Feature] 为啥没有构建包？ | feature | NOT_PLANNED | 无 | NOT_PLANNED（构建包） |
| 141 | 2026-05-06 | [Bug] 接入ClaudeCode中会自己不停的做事情，一个简单的任务都会触发 | 上游 | NOT_PLANNED | 无 | NOT_PLANNED（上游行为：自己不停做事） |
| 143 | 2026-05-07 | [Bug] | bug | COMPLETED | v2.0.38+ / v2.0.91 | 上游超时：timeout 后 cascade entry 标 dead + maxWait 600s |
| 145 | 2026-05-07 | [Bug] Newapi 打开透传以后缓存仍然无法命中 | bug | COMPLETED | v2.0.10+ / v2.0.35 | 缓存体系重做 + Cache-Control no-store |
| 146 | 2026-05-07 | Trial 账号无法使用 swe-1.6 模型（权限检测错误） | bug | COMPLETED | 无 | 权限检测族；无关闭评论，与 #166/#203 同源 |
| 147 | 2026-05-07 | [Bug] Claude Code 中 无法读取文件 | bug | COMPLETED | v2.0.91 (22578d2) | GLM/Kimi 默认开 NLU retry |
| 148 | 2026-05-07 | [Bug] 经常出现 Encountered retryable error from m… | bug | COMPLETED | 4a96d92 (v2.0.38+) | timeout 后 cascade entry 标 dead |
| 149 | 2026-05-08 | [Bug] 为什么添加的free账号token只有gemini-2.5-flash的模型 | 上游 | NOT_PLANNED | 无 | NOT_PLANNED（上游：free 只给 gemini-2.5-flash 权限） |
| 150 | 2026-05-08 | [Bug] 账号池里有10个账号，一个问题都回答不了这不对把 | bug | COMPLETED | 无 | 上游 IP 级限流；引导 v2.0.95 sticky（无直接修复） |
| 151 | 2026-05-08 | [Bug] | bug | COMPLETED | 无 | 诊断引导（reuse=false 讨论），无修复 |
| 152 | 2026-05-08 | [Bug] 不能并发吗，我和我朋友用只能一个人可以，另一个人就一直重连，账号十几个 | bug | COMPLETED | 无 | 用户侧 sub2api 连接限制；实测并发 OK |
| 153 | 2026-05-09 | [Bug] Sonnet无法调用工具 | bug | COMPLETED | 3f8a58d (2.0.94) | ToolSearch/WebFetch 入 TOOL_MAP |
| 154 | 2026-05-09 | [Bug] 使用opencode或者是claude code 请求过去接受不到请求的问题 | bug | NOT_PLANNED | 无 | NOT_PLANNED（请求收不到不复现） |
| 155 | 2026-05-09 | [Feature] free模型只显示1哥，实际上应该不止一个，希望增加批量导入功能 | feature | COMPLETED | v2.0.92 自动探测 | free 模型探测 + 批量导入 API 已有 |
| 156 | 2026-05-09 | [Bug] GLM/Claude模型工具执行问题 | bug | NOT_PLANNED | 无 | NOT_PLANNED（GLM/Claude 工具执行问题） |
| 157 | 2026-05-09 | [Bug] LanguageServer启动失败 | bug | COMPLETED | f08c0c8 (2.0.94) | LS 二进制源升级 + 30s 启动超时 |
| 158 | 2026-05-10 | [Bug] codex搭配ccswitch使用该api无法正常进行问答 | 上游 | COMPLETED | 无 | 排查引导（要 debug 日志未闭环），合理关闭 |
| 159 | 2026-05-10 | [Bug] | bug | NOT_PLANNED | 无 | NOT_PLANNED |
| 160 | 2026-05-10 | [Bug] | bug | NOT_PLANNED | 无 | NOT_PLANNED |
| 166 | 2026-05-10 | [Feature] 最新版的 还是只显示一个模型 free账号 | 上游 | COMPLETED | 无 | 上游：Cascade 权限与官网不一致 |
| 167 | 2026-05-11 | [Feature] 添加账号建议增加批量模式 | feature | COMPLETED | a1d4efc 已有功能 | 批量导入 API 已支持（POST /auth/login accounts 数组） |
| 168 | 2026-05-11 | [Feature] 建议增加翻页，不要一次加载，会卡 | feature | COMPLETED | 6ef7494 (06-06) | dashboard 账户分页 |
| 169 | 2026-05-11 | [Feature] 建议增加其他卡片类型模式切换 | feature | COMPLETED | 无 | 群发关闭；建议贡献 UI 未采纳 |
| 170 | 2026-05-11 | [Feature] 现在项目有定时刷新测活？ | feature | COMPLETED | faeee57/31578fd | probes 驻留化 + per-account probe 锁 |
| 172 | 2026-05-11 | [Bug] tool 工具无法调用 | bug | COMPLETED | 3f8a58d (2.0.94) | WebFetch/ToolSearch 工具映射 |
| 174 | 2026-05-12 | [Bug] 内存占用高 | bug | COMPLETED | 6b9e6d8 (2.0.96) | LS_MAX_INSTANCES=20 LRU 淘汰防内存爆炸 |
| 176 | 2026-05-12 | [Bug] 频繁触发限流 | 上游 | COMPLETED | 无 | 上游 IP 级 cooldown，引导换模型/多 IP |
| 177 | 2026-05-12 | [Bug] 模型降智问题，感觉比较严重的，无法调用工具 | bug | DUPLICATE | 无 | DUPLICATE → #178（明确声明） |
| 178 | 2026-05-14 | [Bug] No Tools get Called | bug | COMPLETED | 0c77824/4905209/baa8524 (v2.0.147) | 实质修复：thinking 抬 tool_calls + SSE 块序 + reasoning 缓冲；但关闭为 07-10 群发 |
| 179 | 2026-05-15 | [docs] Docker 部署与一键部署流程冲突，.env 生成逻辑断裂导致用户困惑 | 其他(docs) | COMPLETED | 无 | 群发关闭（docs 类） |
| 180 | 2026-05-15 | [Bug] 免费版1分钟1次请求？ | bug | NOT_PLANNED | 无 | NOT_PLANNED（免费版限频） |
| 183 | 2026-05-21 | [Bug]接入Claude Code后触发联网搜索时会丢失用户输入 | bug | COMPLETED | 3945c51/3a8d472 | WebFetch 完成步误标：丢答案丢文档真修 |
| 185 | 2026-05-22 | [Bug]  Cursor 中响应会被截断，且有时直接返回模型信息 JSON | bug | COMPLETED | 无 | 悬空：群发关闭；label 带 fixed/upstream 但无对应证据 |
| 186 | 2026-05-23 | [Feature] Gemini 3.5 Flash / DeepSeek V4 啥时候支… | 上游 | NOT_PLANNED | 无 | NOT_PLANNED（Gemini 3.5/DeepSeek V4 上游） |
| 187 | 2026-05-24 | [Bug] 经常上下文不能连接上，牛头不对马嘴， | bug | COMPLETED | 无 | 悬空：群发关闭，上下文族无点名修复 |
| 189 | 2026-05-25 | [Bug] Stream error after retries: All account… | bug | COMPLETED | 无 | 上游 IP cooldown；相关改进 736eefb 真实冷却透出 |
| 190 | 2026-05-27 | swe-1.6 model not accessible in WindsurfAPI d… | 上游 | COMPLETED | 3a8d472/d4c7259 (v2.0.147) | SWE-1.6 catalog self-heal + 诊断 |
| 191 | 2026-05-30 | [Bug] 报错Encountered retryable error from mode… | bug | NOT_PLANNED | 无 | NOT_PLANNED（context deadline 上游） |
| 193 | 2026-06-10 | Google OAuth login fails with Firebase auth/r… | bug | COMPLETED | 0a1ae91 | Firebase referer 拦截：repo 侧处理 + token 兜底登录 |
| 196 | 2026-06-14 | [Bug]: 在我问它有啥工具时，它在opencode会直接自爆 | bug | COMPLETED | b746f4d | NLU 从工具清单伪造工具调用：加参数线索守卫 |
| 197 | 2026-06-14 | [Feature] Devin 云模式下的模型能反代吗？ | 上游 | NOT_PLANNED | 无 | NOT_PLANNED（Devin 云模式反代） |
| 200 | 2026-06-18 | [Bug]: | bug | COMPLETED | f4df9fd | LS fallback 下载进度可见 |
| 202 | 2026-06-22 | Track maintained CI release source for langua… | feature | COMPLETED | a69d948/ec74d3f 线 | windsurf-ls-release 镜像 + checksum 校验 |
| 203 | 2026-06-24 | [Bug] 为什么devin软件上有claude-opus-4-8的模型，账号放到这里最高… | 上游 | COMPLETED | 0604f0c/d4c7259 (v2.0.147) | opus-4-8 裸别名 + catalog self-heal（上游权限） |
| 205 | 2026-07-01 | 怎么接入devin | bug | COMPLETED | 无 | 用户自解（「可以了」） |
| 207 | 2026-07-07 | I built an OpenAI-compatible DeepSeek API, lo… | bug | COMPLETED | 无 | 信息帖（DeepSeek 测试邀请），07-10 群发关闭 |
| 208 | 2026-07-08 | WindsurfAPI-Rebirth in Nirvāṇa | bug | OPEN | 无 | OPEN：Rebirth 公告帖，长期保留 |
| 209 | 2026-07-09 | [Bug] `claude-5-fable-*`（所有档位 low/medium/high… | bug | COMPLETED | 661b649 (v3.1.1) | fable 弱模型跳过 env-lift |
| 210 | 2026-07-09 | [Bug]  无法在 claude code 持续运行 | bug | COMPLETED | 815cf59 (v3.1.1) | Docker 默认 DEVIN_CONNECT=1 原生路径 |
| 212 | 2026-07-14 | [Bug] DEVIN_CONNECT 请求全部 ETIMEDOUT — DNS 返回不可… | bug | COMPLETED | 15e9562 (v3.4.0) | IPv6 ULA：disable Happy Eyeballs + 本地 HTTP/2 走 127.0.0.1 |
| 213 | 2026-07-14 | [Bug] Cursor / Claude Code 工具触发 upstream "MCP… | bug | COMPLETED | 2047628 (v3.4.0, PR #216) | MCP-gate neutralize + native tool preamble 注入 |
| 214 | 2026-07-14 | [Bug] 原生工具路径（nativeStructured）模型收到零工具描述 — 返回空… | bug | COMPLETED | 2047628 (v3.4.0, PR #216) | description-only preamble 注入 system prompt |
| 220 | 2026-07-23 | [Bug] DEVIN_CONNECT无状态会话字段可能导致缓存使用量与上游计量不一致DE… | 其他 | COMPLETED | bc0fd13 | cache_read_tokens 计量校准 pin=5 |
| 221 | 2026-07-24 | [Bug] DEVIN_CONNECT 流式路径丢失 429 reset window +… | bug | COMPLETED | 17cdbe5 + PR #224 (7d3bf3d) | 流式路径 honor 429 reset window，冷却落 account-wide |
| 222 | 2026-07-24 | [Feature] Stable DEVIN_CONNECT session_id fro… | feature | COMPLETED | b0f8330 | 客户端 pair-chain 稳定 session_id |
| 223 | 2026-07-24 | [Bug] Grok CLI "You are Grok ... released by … | bug | COMPLETED | 4fafb76 + PR #227 (7d3bf3d) | Grok/xAI 自述身份中和 |
| 231 | 2026-07-28 | [Feature] Filter model catalogs per upstream … | feature | COMPLETED | PR #232 (93b4965/d7a175d) | per-account 云目录过滤分层落地 |
| 234 | 2026-07-29 | [Bug] Make DEVIN_CONNECT model discovery and … | bug | COMPLETED | 6a664ae (v3.9.15) | 模型面板与 /v1/models 共享命名空间 parity |
| 235 | 2026-08-01 | [Feature] 如何快速配置只使用免费模型 | feature | COMPLETED | 1805ce9 | 面板显示每模型配额消耗 |
| 236 | 2026-08-01 | [Bug] 反代给chatgpt使用得时候，遇到浏览器得操作就报错 | bug | OPEN | 无 | OPEN：等报告者浏览器操作报错日志 |
| 237 | 2026-08-02 | [Bug] swe-1-7 reasoning-only finish в agentic… | bug | COMPLETED | 793ed79 (08-02) | swe-1-7 thinking-only：corrective nudge + 丢毒化空 turn |
| 239 | 2026-08-03 | [Feature] 支持 获取真实的ACUs 计费 | feature | OPEN | 6a954d7/d032386/d11ce66（部分） | OPEN：credit 费率表已接，等上游 ACU 口径 |
| 240 | 2026-08-03 | [Feature] Split retry-on-empty and thinking-o… | feature | COMPLETED | 087be35 | retry-on-empty 与 thinking-only rescue 预算拆分 |
| 244 | 2026-08-05 | [Bug] [同步模型数据] <(0o0)> 请同步一下最新模型 gpt5.6-luna … | bug | OPEN | 9e8080a (08-11) | 同步 gpt-5.6-luna/Claude 5 全系 + swe 图片明确报错 |
| 245 | 2026-08-05 | Claude Code via Enterprise account seeing deg… | bug | OPEN | 无 | OPEN：等报告者补充配置信息 |
| 250 | 2026-08-06 | reasoning leaks into the content channel on l… | bug | OPEN | LEAK_TRACE (#249) + 29b2215/97e0626/8e1faf1 | OPEN：边界追踪已上，等抓包定位泄漏路径 |

## 悬空 issue 专项（4 个：#131 / #178 / #185 / #187）

判定口径：关闭评论无修复说明（多为 07-08/07-10 Rebirth 群发横幅）+ `git log --all` 无对应编号引用 + 关闭时间点无同族修复可对应。

### #131 [Bug] API Error: Content block not found（05-04 报 · 05-06 关）

- 关闭评论只有 Rebirth 群发横幅 + 一句「新版对流式与工具边界的处理已大幅改写，请升级到最新版」；抽查（seed=42）确认无 commit/版本号可查。
- **判断悬空**：关闭时（05-06）无任何修复证据，`git log --grep` 无 #131 引用。
- 补充发现：同报错串「Content block not found」在 07-05 被 4905209（SSE 块序修复，v2.0.147 打包）真正修掉——即症状修复晚于 issue 关闭近两个月，关闭属于「等版本」而非「已验证」。

### #178 [Bug] No Tools get Called（05-14 报 · 07-10 关）

- v1 审计判定「无修复证据」——**该判定部分作废**。时间片 7-early 采集到实质修复：
  - 0c77824（07-04）text 解析器无果时从 thinking 里抬 tool_calls —— 正是「模型声明工具意图但不发 tool_call」的根因修复；
  - 4905209（07-05）SSE 块序修复；baa8524（07-05）tool-use 恢复前缓冲 reasoning；
  - 3a8d472（06-07）为 #177/#178/#183/#190 加固诊断与 canary 覆盖；v2.0.147（07-07）release notes 明示 issue #178。
- **判断悬空（半悬空）**：修复代码真实存在且点名 #178，但 07-10 关闭评论仍是群发横幅 +「Try new version」，无逐条验证、无用户回执；报告者从未确认修复生效。按「关闭质量」口径仍算悬空，按「修复证据」口径已闭环。

### #185 [Bug] Cursor 中响应会被截断，且有时直接返回模型信息 JSON（05-22 报 · 07-10 关）

- 关闭评论只有群发横幅；labels 带 `fixed,upstream` 但 git log 无 #185 引用、关闭评论无对应版本/commit。
- **判断悬空**：截断/流终止语义的系统治理（92946c5 退役 StopReason 猜测值、8fa5e97/161c88d 合成终止帧、2c85edb 异常中断判定，v3.9.x）直到 07-25 之后才落地，晚于关闭；「返回模型信息 JSON」侧的身份中和（42b278c 等）无点名。关闭时点无证据成立。

### #187 [Bug] 经常上下文不能连接上，牛头不对马嘴（05-24 报 · 07-08 关）

- 关闭评论只有群发横幅；无 labels 辅助（仅 bug）；git log 无 #187 引用。
- **判断悬空**：上下文族修复（#133 的 sticky session v2.0.95、#24 家族 reuse 指纹）客观覆盖同类症状，但无任何点名证据；07-08 关闭即群发。

## 开放 issue 专项（6 个：#208 / #236 / #239 / #244 / #245 / #250）

| # | 报告日 | 标题 | 当前状态 | 阻塞原因 |
|---|--------|------|---------|---------|
| 208 | 07-08 | WindsurfAPI-Rebirth 公告帖 | 公告帖，长期保留 | 无（公告性质，不阻塞） |
| 236 | 08-01 | 反代给 chatgpt 使用时报浏览器操作错误 | 工具停滞族末位成员 | 等报告者提供浏览器操作的具体报错日志（无复现样本）；nativeStructured 路径与上游 permission_denied 兼容面仍是易碎环节 |
| 239 | 08-03 | 支持获取真实 ACU 计费 | 计费侧 feature，主体已落地 | v3.9.8（6a954d7）已接 credit 费率表、d032386 接逐请求计费、d11ce66（08-10）支持顶层 credit_cost 读取；缺上游 ACU 换算口径（等抓包确认） |
| 244 | 08-05 | 同步 gpt-5.6-luna/claude-5 + swe 图片 400 | **已修复待验证** | commit 9e8080a（08-11）同步模型全系 + swe 图片改明确报错（含 195 行专项测试）；等报告者验证后可关 |
| 245 | 08-05 | Claude Code via Enterprise 账号降智/降级响应 | 配置疑问 | 等报告者补充账号配置与请求样本（无法从现信息判断是 tier 误判还是上游降级） |
| 250 | 08-06 | reasoning leaks into content channel（线上真实流量） | 活缺陷，不可强制复现 | LEAK_TRACE（PR #249，08861f7 08-10 合入）边界追踪已上；think 重路由防线（29b2215/97e0626/8e1faf1）已就位；阻塞在等线上抓包定位泄漏路径，修复前推理输出可能污染 content 通道（唯一确认的活数据泄露缺陷） |

## Label 使用统计（labels 字段有值的 166/177）

| label | 次数 | 说明 |
|-------|------|------|
| bug | 101 | 绝对主力，占 57% |
| fixed | 77 | 声称已修的标记（含部分群发关闭后补标） |
| enhancement | 44 | feature 类 |
| upstream | 23 | 上游行为/权限/限流 |
| not a bug | 8 | 用户侧或咨询 |
| question | 8 | 提问/求助 |
| help wanted | 4 | 求助社区 |
| needs-triage | 3 | 待分类 |
| release / documentation | 各 2 | 发布/docs 类 |
| duplicate / maintenance / idk | 各 1~2 | — |

要点：
- **bug(101) + enhancement(44) 占 label 总数 88%**，与按月统计的 bug 109 / feature 40 基本同构。
- **fixed(77) 是第二大 label**：但其中 #131/#185/#187 等带 fixed 的悬空 issue 无对应修复证据——「fixed」标签由群发关闭时补标，标签可信度低于 commit 证据。
- 11 个 issue 无任何 label（多为 4 月下旬早期报障），依赖标题判定分类。

## 三个发现

1. **#178 悬空判定需要修订，群发关闭掩盖了真修复**：v2.0.147（07-07）的 0c77824/4905209/baa8524 是点名 #178 的实质修复（thinking 抬 tool_calls 正是其根因），但 07-10 仍以群发横幅关闭、无验证回执——「关闭质量」与「修复存在」两件事被 v1 审计混为一谈；#131 的报错串也在 07-05 被 4905209 覆盖修复。真正「无任何修复迹象」的只剩 #185/#187。
2. **群发关闭（Rebirth 横幅）污染了至少 11 个 issue 的关闭记录**：07-08/07-10 两批（#131/#178/#185/#187/#169/#179/#189/#207 等）与 05-22、06-06 两批（#150/#151/#152/#155/#166/#167/#172 等）共用同一横幅关闭模式，其中约 1/3 无独立证据——这是「156 个 COMPLETED」里最需要打折的部分。
3. **429/账号池族修复证据滞后于症状**：#27/#29 有反代指纹修复（dfb979a），但 IP 级 cooldown 的 proxy 侧处理（736eefb 真实冷却透出、17cdbe5 流式 reset window、ac045ba selector 维度冷却）直到 6-7 月才陆续落地，而 #150/#152/#176/#189 等 5 月 issue 关闭时主要靠「换模型/换 IP」引导——上游限流与 proxy 冷却可见性长期脱节，是 5 月解决率 82% 里「合理关闭」占比高的主因。

