# v3.9.22

OTA 自更新三件套 + 工具族三个已知缺陷。无 API 破坏、无新功能面,所以是 patch 而非 minor。

## OTA 自更新:版本门禁 + 失败回滚(此前最大短板)

**版本门禁(tag gate)** —— OTA 现在只跟已发布的提交:

- `/self-update` pull 前校验目标必须是最近 release tag 的后代,未打 tag 的提交返回
  `ERR_UNRELEASED`(dashboard 显示「有更新,但尚未发布」);`forceUpdate` 可绕过但未暴露在 UI。
- 防降级:目标落后当前 HEAD 时 `ERR_DOWNGRADE` 拒绝。
- `update.sh` 同步同一门禁(`WINDSURFAPI_UPDATE_FORCE=1` 逃生)。
- 门禁在 forceReset 之前执行——门禁失败不破坏工作树。

**失败回滚** —— 更新失败不再裸奔:

- `/self-update` 更新前记录回滚点(`data/self-update-before.json`,含更新前后 commit)。
- 更新后 dashboard 轮询公共 `/health`(30s),服务未恢复 → 提示 + 一键回滚按钮
  (`POST /self-update/rollback`):dirty 保护(AUTH-1 同级)+ 更新后新提交拒绝回滚 +
  supervisor 预检,然后 `git reset --hard` + 重启。
- `update.sh`:健康检查失败自动 `git reset --hard` 回滚 + 重启 + 复检,回滚也失败才 exit 1。

**UI**:未发布状态提示、回滚按钮全部复用现有组件(btn-outline warn / confirm danger /
toast),中英 i18n 同步。强杀收窄:不再宽泛 pkill,只精确匹配 `src/index.js`。

## 工具仿真三个已知缺陷

- **超限 tool_call 防污染**:65KB 超限不再把原始 buffer 当文本吐出(污染对话),
  改为占位符 + 吞掉残余闭合标记(防 `</tool_call>` 裸泄漏)。
- **GPT-5.4+ chat 路径方言**:5.4/5.5/5.6 在 /v1/chat/completions 也切 gpt_native
  (此前只在 responses 路径,5.4 xhigh 实测拒绝 XML 协议);5.1-5.3 保持原行为。
- **FORCE_TOOL_DIALECT 非法值**:不再静默,加 warn。
- devin_connect 流式路径补 ToolGuard(审计盲点:emulated 调用过 allowlist,native 可信直通)。

## 测试

- 新增 `test/self-update-gate.test.js`(8 条:门禁 4 + published + 回滚 3)。
- 全量 3985 条通过;mutation 289 锚点完好;i18n 校验全绿。
