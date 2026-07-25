# WindsurfAPI — macOS 免安装分发包

## 文件说明

| 文件 | 说明 |
|---|---|
| `windsurfapi-macos-arm64` | Apple Silicon (M1/M2/M3/M4) 版本 |
| `windsurfapi-macos-x64` | Intel Mac 版本 |
| `run.sh` | 前台启动（终端窗口显示日志） |
| `run-background.sh` | 后台启动（关闭终端仍运行） |
| `stop.sh` | 停止后台进程 |
| `install-launchd.sh` | 安装为开机自启（LaunchAgent） |
| `uninstall-launchd.sh` | 卸载开机自启 |

## 快速上手

### 1. 解除隔离（首次必须）

macOS 会隔离从网络下载的可执行文件。首次运行前执行：

```bash
xattr -d com.apple.quarantine windsurfapi-macos-arm64   # Apple Silicon
# 或
xattr -d com.apple.quarantine windsurfapi-macos-x64     # Intel Mac
```

脚本会自动处理这一步——直接运行脚本就行。

### 2. 启动方式

**前台（看日志）：**
```bash
chmod +x run.sh && ./run.sh
```

**后台（关终端继续跑）：**
```bash
chmod +x run-background.sh stop.sh && ./run-background.sh
```

**开机自启（LaunchAgent）：**
```bash
chmod +x install-launchd.sh && ./install-launchd.sh
```

### 3. 首次启动

首次运行会自动：
- 生成随机 `API_KEY` 和 `DASHBOARD_PASSWORD`，写入 `.env`
- 打开浏览器到 `http://127.0.0.1:3003/dashboard`
- 在面板里贴上 Devin session token 即可使用

`.env` 文件在可执行文件旁边，重启会沿用。

### 4. 日志

```bash
tail -f windsurfapi.log
```

## 注意事项

- **无代码签名**：本二进制未经苹果公证，Gatekeeper 会提示"无法验证开发者"。运行脚本时已自动处理（`xattr -d com.apple.quarantine`），或右键 → 打开。
- **数据目录**：`Windsurf_data/` 在可执行文件旁边，包含账号池和统计数据。
- **仅本机访问**：默认绑定 `127.0.0.1`，不对局域网暴露。若需对外，编辑 `.env` 改 `HOST=0.0.0.0` 并设置强 `API_KEY`。
