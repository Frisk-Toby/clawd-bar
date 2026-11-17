# Clawd Bar:给 Claude 的安装说明

用户把这个仓库交给你，是想装好 **Clawd Bar**:Claude Code 输入框上方的一条窄带，左边是一队穿职业装的 Clawd 像素小人，右边是 prompt 缓存倒计时。这个插件不用画，也不用配置，直接装就行。

## 安装

Windows 和 macOS 一样装，插件是同一份代码。不需要 clone 仓库，直接从 GitHub 装：

1. 依次运行：
   ```bash
   claude plugin marketplace add Frisk-Toby/clawd-bar
   claude plugin install clawd-bar@clawd-bar
   claude plugin list
   ```
   `list` 的输出里应该有 `clawd-bar@clawd-bar`，状态是 `✔ enabled`。
2. 请用户**完全退出并重新打开 Claude 桌面版**：Windows 是右下角托盘里的 Claude 图标右键 → 退出；macOS 是 `⌘Q`。只关窗口不算。重新打开后，窄带会出现在输入框上方。

> 找不到 `claude` 命令的话，桌面版自带的 CLI 在 `%USERPROFILE%\.local\bin\claude.exe`(Windows)或 `~/.local/bin/claude`(macOS / Linux)。
>
> 用户已经把仓库 clone 到本地、想从本地装的话，把第一条换成 `claude plugin marketplace add "<本文件夹的绝对路径>"`，装好以后不要再挪动这个文件夹。

## 装好之后

可以告诉用户这几件事:

- 输入 `/clawd` 打开图鉴，可以放大看所有职业和动作。
- 点窄带右边的 ☾ 展开面板，里面有「续」(自动给缓存保活)和「夜班」。
- 点一下角色，它会打招呼;连点同一只 5 下，它会晕倒转圈。

## 更新

依次运行(从本地文件夹装的，先在那个文件夹里 `git pull`):

```bash
claude plugin marketplace update clawd-bar
claude plugin update clawd-bar@clawd-bar
```

最后重启桌面版。

## 出了问题

- **窄带不显示**:先运行 `claude plugin update clawd-bar@clawd-bar` 再重启桌面版。还是不显示的话，在本文件夹运行 `claude plugin test .`,看看测试有没有失败。
- **改了代码**:要先把 `.claude-plugin/plugin.json` 的 `version` 升一位，否则桌面版不会加载新代码。
