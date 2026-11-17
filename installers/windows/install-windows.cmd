@echo off
chcp 65001 >nul
setlocal
title Clawd Bar 安装
set "CLAUDE=claude"
where claude >nul 2>nul
if errorlevel 1 set "CLAUDE=%USERPROFILE%\.local\bin\claude.exe"
if /I not "%CLAUDE%"=="claude" if not exist "%CLAUDE%" (
  echo 没找到 claude 命令。请先安装并打开一次 Claude 桌面版或 Claude Code，再运行本文件。
  pause
  exit /b 1
)
echo [1/3] 添加并刷新插件市场 Frisk-Toby/clawd-bar ...
"%CLAUDE%" plugin marketplace add Frisk-Toby/clawd-bar
"%CLAUDE%" plugin marketplace update clawd-bar
echo [2/3] 安装 / 更新 clawd-bar ...
"%CLAUDE%" plugin install clawd-bar@clawd-bar
"%CLAUDE%" plugin update clawd-bar@clawd-bar
echo [3/3] 检查 ...
"%CLAUDE%" plugin list | findstr /I clawd-bar
echo.
echo 装好了！请完全退出 Claude 桌面版（右下角托盘里的 Claude 图标右键 - 退出，只关窗口不算），再重新打开。
pause
