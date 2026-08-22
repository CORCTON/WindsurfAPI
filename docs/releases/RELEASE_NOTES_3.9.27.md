# v3.9.27

#257 在 v3.9.26 修了 Auth Token 框，API Key 框和 401 空表还在。
这一版把孪生路径收掉。无 API 破坏。升级不要求改配置。
ACU `^22` 仍默认关。

---

## 用户可感知

### API Key 框不再把 `auth1_` / 整段 URL 存成池密钥（#257）

v3.9.26 只让 Auth Token / `POST {token}` / `CODEIUM_AUTH_TOKEN` 走
`addAccountByPastedSecret`。Type=API Key、`POST {api_key}`、批量
`kind=api_key` 仍 `addAccountByKey` 原样入库。Sketch 面板默认就是
API Key。贴 `auth1_…` 或 show-auth-token URL：显示添加成功，随后聊天
全 401。

现在这几条也走同一条 helper，并带 `unknownAsKey`：短的 unclassified
真 key 仍当 key 存，避免误打 RegisterUser。`auth1_` 仍
`ERR_AUTH1_NOT_A_POOL_KEY`。Sketch 默认改成 Token，与主面板一致。

实测：`test/dashboard-account-add-token.test.js` 15/15；
`test/account-text-parser.test.js` 含 labeled URL / 无 token URL 可见失败。

### 401 / stale 不再把账号表画成空的

v3.9.26 已经让 GET `/accounts` 401 不删磁盘池。面板 `_apiRaw` 以前
`return {}`，`loadAccounts` 把缺 `accounts` 当成 `[]`，看起来像升级
清空了号。现在 401/429/断网/stale 返回 `{success:false,error}`，只有
`Array.isArray(d?.accounts)` 才画表。空的 `accounts:[]` 仍画。Sketch
401 会清 `localStorage dp` 并停轮询，避免坏密码打到锁号。

### RegisterUser 报错不再把 JWT 切进 toast

以前 `r.raw.slice(0,120)` 再脱敏。三节 JWT 在第 80 列附近切开只剩
一个点，JWT 正则认不出，`eyJ…` 进面板。现在先
`redactCredentialFragments` 再截断。

### 智能导入不再把坏 URL 吃成 0/0/0

无 `token=` 的 show-auth-token 行以前 `catch { continue }`，结果
added=0 skipped=0 failed=0。现在进 `failed`（`ERR_NO_TOKEN_IN_INPUT`）。
`Token: https://…` 会 unwrap。

### 真实 ACU 仍默认关（#239）

解码器和独立 `acuCost` 计数在 v3.9.24，来自 #256 已吸收的那一段
（@andya1lan）。默认 map 仍只有 cache tag。要看 ACU：

```sh
DEVIN_CONNECT_BILLING_TAGS=cache_read_tokens=5,cache_write_tokens=4,committed_acu_cost=^22
```

不要合 #256 整支。默认开仍等付费终帧 `#22` vs 官方 `billed_acus`。

---

## 工程

`CODEIUM_API_KEY`、OAuth/OTP 铸出来的 key 仍走 `addAccountByKey`。
分类只发生在粘贴路径。

#255 的 live-authoritative 诊断已在 v3.9.24（@andya1lan）；混池
snapshot fallback 仍留，整支 PR 不合。

Windows `npm run test:release`：318 文件里 5 个 exit 1（`git-fixture-env.js`
/ mutate harness 要 `/usr/bin/git`，机器门，不是产品回归）。
`test/secret-scan.test.js` 在夹具把 `Date.now()` 移出同一模板后绿。
定向 #257 + docs-consistency + reasoning-dedup：**175/175**。
突变规格未在本机跑（无 `/usr/bin/git`）。生产树未动。
