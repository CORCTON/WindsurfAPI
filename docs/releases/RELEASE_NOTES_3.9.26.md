# v3.9.26

升级后贴 auth-token「Add failed」、账号列表看起来空，是加号路径和
面板 401 的旧坑，不是 v3.9.25 把 `accounts.json` 删了。无 API 破坏。
升级不要求改配置。ACU `^22` 仍默认关。

---

## 用户可感知

### 贴 auth-token / session 不再走错 RegisterUser（#257）

账号管理默认框、`POST /accounts`、`POST /auth/login`、批量导入、
`CODEIUM_AUTH_TOKEN` 以前一律 `RegisterUser`（只收 Firebase idToken）。
`devin-session-token$…` **本身就是**上游 apiKey。OAuth 回调早就按前缀
分类，表单没有。

现在同一条 helper `addAccountByPastedSecret`：

- `devin-session-token$…` → 当 apiKey 入库，不打 RegisterUser
- 整段 `https://windsurf.com/show-auth-token?token=…` → 抽出 query/hash
  再分类（以前把整段 URL 送给上游）
- `sk-…` 误贴到 Auth Token 框 → 当 apiKey
- `auth1_…` **不当** apiKey 存。那是 `WindsurfPostAuth` 中间票，存进去会
  显示添加成功、随后聊天全 401
- Firebase JWT 仍走 RegisterUser（该失败就失败）

实测（本机 + 家里云 scratch `3709aba`/`914d5df`）：
`test/dashboard-account-add-token.test.js` 9/9；
`test/account-text-parser.test.js` unwrap 4/4。

### 「Add failed」四个字不再吞掉原因

面板 `_apiRaw` 遇到 401 / 429 / 断网以前 `return {}`。
`addAccount` / `submitOAuthToken` 看到 `r.error === undefined`，i18n
兜底就是 **Add failed / 添加失败**。升级后 exe 生成了新
`DASHBOARD_PASSWORD`、浏览器还记着旧 `localStorage dp` 时，正好打出
#257 的报告。

现在返回 `{ success: false, error }`。GET 账号列表 401 **不把表刷空**
（池还在磁盘上）。RegisterUser 报错正文里的 JWT / session 串会脱敏，
不再进 toast。

### 升级不会删 `accounts.json`

v3.9.24 → v3.9.25 的 `src/` 只有非流式 `bindClientAbort`。OTA / `git pull`
不删 gitignore 的池文件。空池几乎都是：**新目录里的 exe** 读
`<exe>/Windsurf_data/`，或面板 401 把表刷空。同目录覆盖升级，文件还在。

### 真实 ACU 仍默认关（#239）

```sh
DEVIN_CONNECT_BILLING_TAGS=cache_read_tokens=5,cache_write_tokens=4,committed_acu_cost=^22
```

---

## 工程

`addAccountByToken` 仍调用 `registerWithCodeium`。分类只发生在
`addAccountByPastedSecret`。

家里云完整克隆 `914d5df` 突变（浅克隆会 `shallow update not allowed`）：
`retry-after-route-parity` 6/6（4 CAUGHT + 2 已记录 SURVIVOR）、
`gap-getuserjwt` 2/2、`rate-limit-history` 2/2、
`dashboard-connect-parity` 23/23、`self-update-hotfix` 78/78 CAUGHT
基线 164/164。生产树未动。

Windows `npm run test:release`：318 文件里 5 个 exit 1（`git-fixture-env.js`
/ mutate harness 要 `/usr/bin/git`，机器门，不是产品回归）。其余绿。
