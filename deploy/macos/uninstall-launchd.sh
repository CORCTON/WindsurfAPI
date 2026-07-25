#!/usr/bin/env bash
# WindsurfAPI — 卸载 macOS LaunchAgent（停止自启并移除 plist）
PLIST_ID="com.dwgx.windsurfapi"
PLIST_FILE="$HOME/Library/LaunchAgents/$PLIST_ID.plist"

if [ ! -f "$PLIST_FILE" ]; then
  echo "未找到 LaunchAgent plist，可能已卸载。"
  exit 0
fi

launchctl unload "$PLIST_FILE" 2>/dev/null || true
rm -f "$PLIST_FILE"
echo "✅ LaunchAgent 已停止并卸载: $PLIST_ID"
