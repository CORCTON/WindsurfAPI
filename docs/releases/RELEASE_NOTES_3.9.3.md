# v3.9.3

v3.9.2 的补丁版。它修的那条 blocker **只修了 3 条内部路由里的 1 条** ——
`/v1/messages` 和 `/v1beta`(Gemini)上,中途断开的流照旧被报成正常完成。

用 Claude Code / Cline / Cursor(走 `/v1/messages`)或 Gemini SDK 的部署建议升级。
升级无需改配置。

---

## 用户可感知

### 中途断开的流在 `/v1/messages` 与 Gemini 路由上仍被报成完成

v3.9.2 的修法是:Cascade 流已发出内容后死掉时,代理补发的那个**合成**
`finish_reason:'stop'` 带一个内部标记,translator 不再把它当真实终止信号。

问题是**只有 `/v1/responses` 认这个标记**。另两条内部路由各自都有为同一场景写的
守卫(`messages.js` 的 BUG1、`gemini.js` 的同构守卫,注释明确写着"截断必须报 error
而不是伪造 stop_reason"),两者都被同一个合成帧骗过:

```
/v1/messages  : stop_reason = end_turn | 无 error 帧
/v1beta gemini: finishReason = STOP    | 无 error 帧
```

对 Claude Code 这类客户端,这意味着一个被网络中断截断的答案会被当作**完整回复**
接受,而不是触发 SDK 重试。

现在两条路由都会把它作为 `error` 事件报出(502 → 可重试的 529 / UNAVAILABLE),
正常流则完全不受影响(`end_turn` / `STOP` 照旧)。

### 根因比标记更深一层

修这条时发现,`finishPartialStreamAfterError` 除了合成 `finish_reason`,**还会写
`[DONE]`** —— 而 `messages.js` 与 `gemini.js` 都把裸 `[DONE]` 当权威终止信号。

所以这两条路由有**两个**入口被骗,只堵 `finish_reason` 那一个是无效的。第一次尝试
修复时我正是只堵了一个,验证"看起来没生效"因而一度误判并回滚 —— 直到把两个入口
一起折价才真正生效。(`/v1/responses` 没有这个问题:它对 `[DONE]` 是 `continue`,
本就不当终止信号。)

---

## 工程

**这是本仓库"修复只覆盖部分路由"陷阱的第 4 次 —— 而且这次的不完整修复就在
上一个修复本身里。** 前三次是 #188(sticky 漏 connect)、O1(`include_usage` 漏
gemini)、v3.9.2(store 门在流式/非流式上分叉)。

所以这次的守卫不只测行为,还加了一条**源码级元守卫**:任何内部 translator 若不
消费 `__synthetic_finish`,直接构建失败 —— 将来新增第 4 条内部路由时会被逼着处理
这个信号,而不是静默重犯。

`test/synthetic-finish-parity.test.js`(12 条)逐条覆盖 3 条路由 × 2 个入口,外加
正常流不受影响的对照。突变验证 2 种:退回 finish 帧检测抓 8 条;**只退回 `[DONE]`
守卫**(即第一次尝试的错误形态)抓 4 条。

**测试 3058 → 3070**,全量绿(`npm run test:release`,逐文件进程隔离)。

---

**升级**:`git pull && 重启`,或换用新版二进制 / 镜像。
