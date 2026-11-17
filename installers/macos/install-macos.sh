#!/bin/bash
# Clawd Bar 安装(macOS)。用法：打开「终端」，输入 bash 加一个空格，把本文件拖进终端窗口，按回车。
CLAUDE="$(command -v claude || echo "$HOME/.local/bin/claude")"
if [ ! -x "$CLAUDE" ]; then
  echo "没找到 claude 命令。请先安装并打开一次 Claude 桌面版或 Claude Code，再运行本文件。"
  exit 1
fi
echo "[1/3] 添加并刷新插件市场 Frisk-Toby/clawd-bar ..."
"$CLAUDE" plugin marketplace add Frisk-Toby/clawd-bar
"$CLAUDE" plugin marketplace update clawd-bar
echo "[2/3] 安装 / 更新 clawd-bar ..."
"$CLAUDE" plugin install clawd-bar@clawd-bar
"$CLAUDE" plugin update clawd-bar@clawd-bar
echo "[3/3] 检查 ..."
"$CLAUDE" plugin list | grep -i clawd-bar
echo
echo "装好了！请按 ⌘Q 完全退出 Claude 桌面版(只关窗口不算)，再重新打开。"
