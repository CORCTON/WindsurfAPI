#!/usr/bin/env bash
# WindsurfAPI — 安装 macOS LaunchAgent（用户级开机自启）
# 运行后关机重启均会自动后台启动 WindsurfAPI。
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_ID="com.dwgx.windsurfapi"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/$PLIST_ID.plist"

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
mkdir -p "$PLIST_DIR"

cat > "$PLIST_FILE" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_ID</string>
  <key>ProgramArguments</key>
  <array>
    <string>$EXE</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$SCRIPT_DIR</string>
  <key>StandardOutPath</key>
  <string>$SCRIPT_DIR/windsurfapi.log</string>
  <key>StandardErrorPath</key>
  <string>$SCRIPT_DIR/windsurfapi.log</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>Crashed</key>
    <true/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
PLISTEOF

launchctl load "$PLIST_FILE"
echo "✅ LaunchAgent 已安装并启动: $PLIST_ID"
echo "   日志: $SCRIPT_DIR/windsurfapi.log"
echo "   Dashboard: http://127.0.0.1:3003/dashboard"
echo ""
echo "管理命令:"
echo "  停止:     launchctl stop $PLIST_ID"
echo "  启动:     launchctl start $PLIST_ID"
echo "  卸载:     ./uninstall-launchd.sh"
