# v3.9.24

Cascade 元数据泄漏门、Connect 目录按账号同步、OpenAI 兼容补全，
以及 ACU 解码改为 opt-in。无 API 破坏。升级不要求改配置。

---

## 用户可感知

### Cursor 截断 / Cascade JSON 泄漏（#185）

带 tools 的 Cascade 轮次里，上游会把 panel-state 一类元数据夹进内容通道。
代理现在在出口把门：这类帧不再当成模型正文发给 Cursor / OpenAI 客户端。
实测门禁：家里云隔离树 `test:release` 316 文件 exit 0。

### `/v1/models` 的 `created` 不再每秒跳

以前每次 GET 都 `Date.now()`，客户端轮询目录会以为整表在重建。
现在固定 unix 秒 `MODEL_CREATED = 1704067200`。

### 不支持的 logprobs 改为明确 400

`logprobs` / `top_logprobs` 上游没有。以前静默 200、choices[].logprobs 为空。
现在非默认值（包括 Completions 风格的整数 1–5）返回 `invalid_request_error`。
省略、`false`、`0` 仍放行。

### 成功的 chat.completion 带 `service_tier: "default"`

OpenAI 校验器会查这个字段。错误体不加。special-agent 路径同样盖章。

### `POST /v1/completions`

OpenAI 旧 Completions：`prompt` 收成一条 user turn，复用 chat 路径。
`stream:true` 明确 400，请走 `/v1/chat/completions`。

### 真实 ACU 仍默认关（#239）

解码器现在能读 varint / fixed64 / fixed32。`acuCost` 和 credit 分列，不会加在一起。
默认 map 只有已校准的 cache tag。要看 ACU：

```sh
DEVIN_CONNECT_BILLING_TAGS=cache_read_tokens=5,cache_write_tokens=4,committed_acu_cost=^22
```

`^22` 的上游身份还没有仓库内真帧钉死，所以默认不开。错开会把数写进 `accounts.json`。

---

## 工程

Connect 目录按账号 LKG + 混合池 snapshot fallback（#255 的 live-authoritative
诊断收下，全局关 snapshot 不合）。OTA 夹具：Linux 上 stub `ss` 失败而不是删除，
避免撞生产 `:3003`。`streamChat` 对已 abort 的 signal 在 mint JWT 之前就抛
`AbortError`。

家里云隔离树：`npm run test:release` exit 0（316 文件）。42 条 mutation spec
中产品相关均 CAUGHT；自指 harness lock 突变已从 ota spec 去掉（静态测试仍钉 `wx`）。
