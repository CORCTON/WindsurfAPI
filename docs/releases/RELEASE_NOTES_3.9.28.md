# v3.9.28

旱灾闸不再把 Pro 号上不吃周配额的模型（`swe-1-7` / `glm-5-2`）一起掐死
（#258）。无 API 破坏。升级不要求改配置。ACU `^22` 仍默认关。

---

## 用户可感知

### 周配额耗尽时，Pro 上不吃周配额的模型仍可跑（#258）

`droughtRestrictPremium` 默认开。以前旱灾只放行
`FREE_REACHABLE_SELECTORS`（`swe-1-6-slow`）。那个 Set 还管**未付费账号
能不能跑**。Pro 号 `weeklyPercent=0` 时，`swe-1-7` / `swe-1-7-medium` /
`glm-5-2` 上游仍 200（吃 `balance`，不吃周配额），闸却 503。

现在旱灾用单独的 `DROUGHT_SAFE_SELECTORS`：

- `swe-1-7`、`swe-1-7-medium`、`glm-5-2`
- `glm-5.1` 不写进 Set（解析后是 `glm-5-2`）
- **不**写进 `FREE_REACHABLE_SELECTORS`：`{tier:'free', swe-1-7}` 仍 false
- `FREE_TIER_SELECTOR` 仍是 `swe-1-6-slow`（活目录里它可能已消失，那是另一件事）

关掉旱灾（`DROUGHT_RESTRICT_PREMIUM=0`）的逃生口还在。

实测：`test/drought-connect-namespace.test.js` +
`test/connect-entitlement.test.js` 19/19。

### 真实 ACU 仍默认关（#239）

```sh
DEVIN_CONNECT_BILLING_TAGS=cache_read_tokens=5,cache_write_tokens=4,committed_acu_cost=^22
```

---

## 工程

`isConnectSelectorBlockedByDrought` 在 `isConnectSelectorCurrentlyFree` 之前
认 `DROUGHT_SAFE_SELECTORS`。`/dashboard/api/models` 的 `currentlyFree`
仍只看 `rate === 0` ∪ `FREE_REACHABLE`，不会把 9/14/1.5 credit 标成免费。

#258 未关：等报告者在旱灾开着时打 `swe-1-7` / `glm-5.2` 确认 200。
#257 报告者已关（COMPLETED）。

Windows `npm run test:release`：318 文件里 5 个 exit 1（`git-fixture-env.js`
/ mutate harness 要 `/usr/bin/git`，机器门）。家里云 SSH 本轮超时，突变未
在 scratch 重跑；旱灾闸没有对应 `test/mutations` 规格。生产树未覆盖。
