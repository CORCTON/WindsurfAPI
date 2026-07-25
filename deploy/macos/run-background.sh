#!/usr/bin/env bash
# WindsurfAPI — macOS 后台启动脚本（nohup，关闭终端仍继续运行）
# 日志写到可执行文件旁的 windsurfapi.log。
# 停止: ./stop.sh 或 kill $(cat windsurfapi.pid)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
  EXE="$SCRIPT_DIR/windsurfapi-macos-arm64"
else
  EXE="$SCRIPT_DIR/windsurfapi-macos-x64"
fi
[ -f "$EXE" ] || EXE="$SCRIPT_DIR/windsurfapi-macos-arm64"
[ -f "$EXE" ] || { echo "找不到可执行文件，请先放置 windsurfapi-macos-* 到 $SCRIPT_DIR" >&2; exit 1; }

xattr -d com.apple.quarantine "$EXE" 2>/dev/null || true
chmod +x "$EXE"

PID_FILE="$SCRIPT_DIR/windsurfapi.pid"
LOG_FILE="$SCRIPT_DIR/windsurfapi.log"

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "WindsurfAPI 已在运行（PID $OLD_PID）。若要重启，先运行 ./stop.sh。"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

echo "启动 WindsurfAPI ($(basename "$EXE")) ..."
nohup "$EXE" >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "已后台启动 PID $(cat "$PID_FILE")，日志: $LOG_FILE"
echo "Dashboard: http://127.0.0.1:3003/dashboard"
