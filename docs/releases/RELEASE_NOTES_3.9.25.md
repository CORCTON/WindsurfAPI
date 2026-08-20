# v3.9.25

非流式挂断现在会拆上游（messages / Gemini / Responses），以及
新安装默认模型与 fail-closed 文档对齐。无 API 破坏。升级不要求改配置。
ACU `^22` 仍默认关。

---

## 用户可感知

### 客户端中途挂断不再空烧上游（非流式）

`/v1/chat/completions` 和 `/v1/completions` 本来就会在 `res.close` 且
`!writableEnded` 时 abort。`/v1/messages`、Gemini `generateContent`、
`/v1/responses` 的非流式分支只 await，不绑 AbortSignal —— 客户端挂了，
上游还在跑。现在五条 POST 共用 `bindClientAbort`，signal 进
`handleChatCompletions`。流式仍走原来的 `captureRes._clientDisconnected`。

实测：`test/server-client-abort.test.js` 12/12（路由扫描 5 + 翻译层注入
5，含 messages 重建 `effectiveContext` 的路径）。

### 新安装默认模型不再是 Connect 解析不到的旧名

`setup.sh` 生成的 `DEFAULT_MODEL` 从 `claude-4.5-sonnet-thinking` 改成
`claude-sonnet-4.6`，与 `src/config.js` 未设 env 时的默认一致。旧 Cascade
别名在 DEVIN_CONNECT 上 `mapped:false`：默认 `WINDSURFAPI_STRICT_MODEL=1`
会 400，关掉则静默降到免费 selector。已有 `.env` 不被覆盖。

### 空密钥不是开放访问

运行时一直 fail-closed：空 `API_KEY` 即使本机 bind 也是 401，除非
`WINDSURFAPI_ALLOW_UNAUTHENTICATED=1`。README 表格和 `.env.example` 头注释
以前写成「留空就不验证」。Windows exe 首次运行本来就会自动生成密钥并写入
同目录 `.env`，部署说明不再说「内置没有认证」。

### 真实 ACU 仍默认关（#239）

和 v3.9.24 一样。要看 ACU：

```sh
DEVIN_CONNECT_BILLING_TAGS=cache_read_tokens=5,cache_write_tokens=4,committed_acu_cost=^22
```

`^22` 的上游身份还没有仓库内真帧钉死，所以默认不开。

---

## 工程

CHANGELOG 现在机械要求：包装版本必须有 `RELEASE_NOTES_*.md`；3.9.x 每一份
都要在索引里有链接；「**N** 份」等于磁盘上的文件数。这会挡住再跳过
3.9.22/23 那种「HEAD 有条目、中间版本消失」的漏记。

`src/server.js` 的突变规格在家里云隔离克隆 `44efc4f` 上跑过：
`retry-after-route-parity` 6/6 符合预期（4 CAUGHT + 2 已记录 SURVIVOR），
`self-update-hotfix` 78/78 CAUGHT、基线 164/164。生产树未动。

Windows `npm run test:release`：317 文件里 5 个加载 `git-fixture-env.js`
exit 1（本机没有 `/usr/bin/git`，机器门，不是产品回归）。其余绿。
