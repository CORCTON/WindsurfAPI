# v3.9.5

两个外部 PR 合并 + 检索端点的一批契约修复。另外修掉一个**我们自己漏了四个版本**的
发布链缺口:`macOS x64` 二进制其实从 v3.9.1 起就没有产出过。

升级无需改配置。用 `GET`/`DELETE /v1/responses/{id}` 的部署请看下面的调用方式变更。

---

## 用户可感知

### 按账号隔离上游模型目录(#232,首贡 @andya1lan)

静态模型表此前被 `/v1/models`、Dashboard、路由三条路径各自独立暴露,受限上游目录的
部署会宣传自己账号用不了的模型 —— 用户点了就报错。

现在:**池级列表是活跃账号目录的并集,路由校验所选账号自己的目录**。这个分层是整个
改动最值钱的部分 —— 手工白名单会与上游漂移、只用第一个活跃账号会把一个账号的目录套到
别人身上、取交集会隐藏至少一个账号能用的模型,三种替代方案都被论证否决过。

- 账号被停用、移除或换 key 时,其目录状态失效
- 目录缺失 / 为空 / 拉取失败 → fail-open,启动兼容性不变
- special-agent 仍由其独立后端目录治理;`DEVIN_CONNECT` 走独立 selector 命名空间,
  不受这层过滤影响
- 上游返回**部分但非空**的目录时,不再直接当权威:少于上次已采纳唯一 UID 数一半的
  快照会保留 last-known-good,单轮 30 秒延迟确认,只有返回完全相同的 UID 集合才采纳
- 低配额(干旱)保护与账号目录的交集为空时,只让干旱限制 fail-open,账号目录继续
  负责拦截 —— Dashboard 会显式提示这个状态,而不是静默显示普通干旱文案
- 兼容开关 `WINDSURFAPI_IGNORE_CLOUD_FILTER=1` 恢复完整静态目录

### `GET`/`DELETE /v1/responses/{id}`:身份参数改走 header

v3.9.4 让这两个端点可用的办法是把身份信号放进 query。**那个做法会泄漏 PII** ——
`user` 按本仓库自己的说法(`caller-key.js:107`)"常是终端用户邮箱或稳定账号 id",
而随包的 TLS 前端 `https-proxy.js` 原样打印整个 URL,反向代理 / CDN / 浏览器历史同理。
等于把一个模块明确拒绝落日志的值,放进了最容易落日志的地方。

现在走 header,query 保留为降级通道(供无法设置 header 的客户端,风险已在 README 标注):

```
GET    /v1/responses/{id}   -H 'x-response-prompt-cache-key: <你 POST 时用的值>'
DELETE /v1/responses/{id}   -H 'x-response-user: <你 POST 时用的值>'
```

同时补齐了作用域词汇:v3.9.4 只支持 `user` / `prompt_cache_key` /
`safety_identifier` 三种,而 POST 侧还认 `conversation` /
`metadata.conversation_id` / `metadata.session_id` —— 用后三种的客户端此前仍取不回
自己的响应。现在六种全支持(header 名把下划线换成连字符,如
`x-response-conversation-id`)。

### 检索不再洗白截断状态,也不再把网关内部文本当模型输出

- **状态一致**:此前 `GET` 硬编码 `status:'completed'`,于是同一个 id,`POST` 报
  `incomplete` + `max_output_tokens`,`GET` 报 `completed`。现在 store 记录创建时的
  真实状态,流式与非流式两条路径都记,检索报的与创建时报给客户端的一致。
- **不外泄内部文本**:v3.9.2 加的"丢弃留痕"标记是前置到第一条存活消息的 content,
  当那条恰好是 assistant 时,网关运维说明经 `GET` 变成了假装是模型答案的内容。
  现在返回前剥离(它仍留在链式上下文里 —— 那儿是有用信号)。
- **响应体合法**:store 里合法存在**数组形态**的 content(Responses `input` 会被
  规范化成 parts 数组),此前原样塞进 `output_text`,产出的 `text` 字段是个数组。
  现在扁平化取 text parts。
- **`usage` 改为省略**而非全 0:两个官方 SDK 都声明它 optional,而全 0 与"这轮真的
  用了 0 token"无法区分,会被计费中继当真。

### macOS x64 二进制恢复产出(#233,@andya1lan)

GitHub 已于 2025-12-04 下线 `macos-13` runner 镜像,而 `release.yml` 的 x64 job
一直写着 `runs-on: macos-13`。

**v3.9.1 / v3.9.2 / v3.9.3 / v3.9.4 的 x64 job 终态全部是 `cancelled`,不是排队** ——
连续四个版本都没有 macOS x64 二进制。我们这边一直把 GitHub UI 上的 `queued` 按
workflow 注释里"x64 可能排几小时"的说法解释,没去看终态,四次都判断成"非阻塞、
不用管"。这是外部贡献者替我们发现的自身发布链缺口。

---

## 工程

这一轮的 5 条修复来自发版后对抗复核的 16 条候选(验证阶段全部因网关 429 挂掉,
所以逐条自验)。**其中 2 条是 v3.9.4 自己引入的** —— 包括上面那条 PII:我在两小时前
才引用过 `caller-key.js` 的那段注释,然后亲手违反了它。

新增 `test/responses-retrieve-contract.test.js`(12 条),突变验证 3 种。其中两条是
**源码级守卫**:检索必须能从 header 读身份,且必须覆盖 POST 侧全部六种作用域词汇 ——
后者正是 v3.9.4 那个"只覆盖部分情况"失效模式的小型复发,守卫化之后不会再犯。

**测试 3072 → 3108**,全量绿(`npm run test:release`,逐文件进程隔离)。

---

## 致谢

- **@andya1lan** — #232(按账号隔离上游模型目录)与 #233(CI x64 runner)。首次贡献
  就交了一个跨三条暴露路径的架构级修复,方案取舍论证扎实,被指出问题后两轮修复都精准
  命中,还主动做了 Dashboard fail-open 告警和 out-of-scope 划分。#233 更是替我们发现
  了自己漏了四个版本的构建缺口。另开 #234 记录 `DEVIN_CONNECT` 侧模型发现与干旱门禁
  的 backend 错配,下一轮处理。

---

**升级**:`git pull && 重启`,或换用新版二进制 / 镜像。
