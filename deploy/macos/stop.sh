#!/usr/bin/env bash
# WindsurfAPI — 停止后台进程
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/windsurfapi.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "未找到 PID 文件，WindsurfAPI 可能没有在运行。"
  exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  rm -f "$PID_FILE"
  echo "WindsurfAPI (PID $PID) 已停止。"
else
  echo "进程 $PID 已不存在，清理 PID 文件。"
  rm -f "$PID_FILE"
fi
