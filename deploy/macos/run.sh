#!/usr/bin/env bash
# WindsurfAPI — macOS 前台启动脚本（双击 Terminal 运行，日志直接打印）
# 适用于 arm64（Apple Silicon）和 x64（Intel）单文件可执行版本。
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 自动选择当前架构对应的可执行文件
ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
  EXE="$SCRIPT_DIR/windsurfapi-macos-arm64"
else
  EXE="$SCRIPT_DIR/windsurfapi-macos-x64"
fi

if [ ! -f "$EXE" ]; then
  # 回退：尝试另一种架构（Rosetta 2 下 arm64 二进制也能跑 x64）
  ALT_EXE="$SCRIPT_DIR/windsurfapi-macos-arm64"
  [ "$ARCH" = "arm64" ] && ALT_EXE="$SCRIPT_DIR/windsurfapi-macos-x64"
  if [ -f "$ALT_EXE" ]; then
    echo "提示: 未找到 $(basename "$EXE")，尝试 $(basename "$ALT_EXE")（通过 Rosetta 2 运行）"
    EXE="$ALT_EXE"
  else
    echo "错误: 未找到 windsurfapi-macos-arm64 或 windsurfapi-macos-x64。" >&2
    echo "请把对应架构的可执行文件放到 $SCRIPT_DIR" >&2
    exit 1
  fi
fi

# 移除 Gatekeeper 隔离属性（首次运行必须，否则提示"无法验证开发者"）
xattr -d com.apple.quarantine "$EXE" 2>/dev/null || true
chmod +x "$EXE"

exec "$EXE" "$@"
