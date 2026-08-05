# v3.9.20

Gemini 客户端在上游返回**畸形工具参数**时,拿到的是一个参数全空的工具调用 —— 而日志里
什么都没有。这一版修掉它。

只影响 **`/v1beta/models/*` (Gemini) 路由 + 带工具的请求**。不用 Gemini 前端的部署行为
字节级不变;用 Gemini 但上游一直返回合法 JSON 的部署也不变 —— 这道路径只在解析失败时
才有分支。

门禁 **3473 pass / 0 fail**(266 个文件;v3.9.19 = 3449 / 264,新增 24)。

---

## 缺陷:一个声称"mirrors"另一个文件的文件,漏掉了那个文件的修复

`src/handlers/gemini.js` 的文件头第 9 行写着:

```
 * Mirrors src/handlers/messages.js (the Anthropic frontend):
```

而 Anthropic 前端有一条编号 **B4** 的修复没有被镜像过来。它修的是:`arguments` 字符串
解析失败时,静默塌成 `{}` —— 丢掉全部工具参数,且**两条通道都无痕**(没有日志、没有计数器)。
于是"上游把回复截断了"和"这个工具调用本来就不带参数"在客户端看来完全一样。

Gemini 侧有**两个**解析点(非流式的 `openAIToGemini`、流式的 `flushToolCalls`),两个都是
裸 `catch {}`。

同一份上游 payload,两条出口的实测对照:

| 出口 | 客户端拿到 | 日志 |
|---|---|---|
| Anthropic (`/v1/messages`) | `input = {"__raw_arguments":"{\"file_path\": \"/etc/passwd\", \"limit\": 10"}` | `log.warn` 一行,带工具名与原串 |
| **Gemini (`/v1beta`)** | **`args = {}`** | **零** |

上游那份 `arguments` 是 `{"file_path": "/etc/passwd", "limit": 10`(缺右括号,上游截断的
典型形态)。两个参数都在里面,而 Gemini 客户端一个都拿不到。

## 修法

抽一个 `parseToolArgs(rawArgs, toolName)`,两个解析点都调它 —— **两个站点各自维护正是当初
分叉的原因**。失败时记录工具名与原串,并把原串放在 `__raw_arguments` 下,与 Anthropic 出口
**同一个键名**,这样客户端只需要处理一种形状。

刻意**不**映射到 Gemini 的 `MALFORMED_FUNCTION_CALL` finishReason:那会改变这一轮的终止
状态,比恢复可观测性大得多,而且 malformed 的是上游、不是调用方。

## 一条既有测试把这个缺陷钉成了契约

`test/gemini.test.js` 里有:

```js
it('survives malformed tool-call argument JSON (args -> {})', () => {
  ...
  assert.deepEqual(fc.functionCall.args, {});
});
```

它**真正测的是"不抛异常"**。但把当时的返回值写进 `deepEqual` 之后,数据丢失在后来每个
读者眼里都像是刻意设计 —— 我改完代码,是它先红的。

判据:**"survives / 不崩"这类测试,断言只钉不崩那一条。** 把当前返回值顺手写进期望,等于把
当时的缺陷升级成契约。测试名里用括号解释返回值(`(args -> {})`)是这个毛病的显式征兆。

## 守卫

`gemini.js` 此前**零突变 spec** —— 71 条测试从未做过突变验证,这就是这条缺陷没被发现的原因。

新增 `test/mutations/gemini-egress-parity.json`,**7 条全部 CAUGHT、零声明漏网**:

- B4 parity 回退(塌成 `{}`)· 日志行被删 · 两个站点各自停用共享 helper(各一条)
- 合法 payload 也被包裹(防修复过度伸展)
- `content_filter` 丢掉独立映射、落进 `STOP` 兜底
- error 帧不再 latch `finished`(见下)

仓库突变总数 **67 → 74 条**,声明漏网 **4 → 4**(新 spec 一条都没有)。

断言 9 条,其中两条是关于**日志**的:失败时恰好一行、含工具名与原串;外加一条负对照
(合法 payload 零日志)。**保留数据与报告出来是两个独立性质,原缺陷两个都丢了。**

## 查证过但**没有**修的一条

`mapFinishReason` 的 `|| 'STOP'` 兜底,对 `finish_reason:'error'`(special-agent 在 headers
已发出后失败时发的)会翻成正常结束 —— 正是 `special-agent.js` 的 "H2" 注释要防的后果。

但它**不可达**:那条路径**先发 error 帧**,而 `error()` 会 latch `finished`,后面那个 finish
chunk 在翻译之前就被丢掉。给一个到不了的分支加映射,等于加一个评审者必须为之推理的假变化点
—— 所以改成把**让它无害的前提**写进注释,并用测试钉住那个前提(error 帧必须终止流)。

这条留在这里是因为判断本身可复用:**确认一条缺陷"可达"要走完整条链。** 第一版探针直接调
`openAIToGemini` 并"证明"了缺陷,而生产上那个值到不了它 —— 探针证明的是"函数会这样",不是
"系统会这样"。

---

## 顺带:四处文档过期,并把版本声明做成守卫

`docs/README.md` 首行把 master 声明成一个**不存在的 tag**,且与交接文档专门讨论那几个未发版
commit 的章节直接矛盾。另外 `docs/AUDIT-LEDGER.md` 第十一轮那张"仍未 exhaustive 扫描"表有
**两行过期**,而交接指路让读者"取最后一个命中" —— 第十二、十三轮都没有自己的表,所以读者
恰好落在这张过期的上面。**导航规则是对的,数据过期了,而规则的正确性掩盖了数据的过期。**

文档一致性守卫因此加了第 14 条:任何 md 文档里 `master == vX.Y.Z` 形式的声明,必须对上真实
tag。它写完**立刻抓到第二处** —— 人工只找到了一处。

守卫刻意只钉"那个 tag 是否存在",不钉"master 是否应该等于它",因为"未发版 commit 随下次
发布搭车"是合法且有文档的状态(见 [releases/README.md](README.md) 的「这到底该不该发版」)。
