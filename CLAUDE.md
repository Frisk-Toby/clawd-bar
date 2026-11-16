# Clawd Bar:给 Claude 的安装说明

用户把这个仓库交给你，是想装好 **Clawd Bar**:Claude Code 输入框上方的一条窄带，左边是一队穿职业装的 Clawd 像素小人，右边是 prompt 缓存倒计时。这个插件不用画，也不用配置，直接装就行。

## 安装

1. 先确认仓库文件夹放在一个固定的位置，比如 `~/clawd-bar`。插件市场按路径读取，装好以后不要再挪动它。
2. 依次运行:
   ```bash
   claude plugin marketplace add "<本文件夹的绝对路径>"
   claude plugin install clawd-bar@clawd-bar
   claude plugin list
   ```
   `list` 的输出里应该有 `clawd-bar@clawd-bar`,状态是 `✔ enabled`。
3. 请用户**重启 Claude 桌面版**。重启后，窄带会出现在输入框上方。

> 找不到 `claude` 命令的话，桌面版自带的 CLI 在 `%USERPROFILE%\.local\bin\claude.exe`(Windows)或 `~/.local/bin/claude`(macOS / Linux)。

## 装好之后

可以告诉用户这几件事:

- 输入 `/clawd` 打开图鉴，可以放大看所有职业和动作。
- 点窄带右边的 ☾ 展开面板，里面有「续」(自动给缓存保活)和「夜班」。
- 点一下角色，它会打招呼;连点同一只 5 下，它会晕倒转圈。

## 更新

在本文件夹运行 `git pull`,然后依次运行:

```bash
claude plugin marketplace update clawd-bar
claude plugin update clawd-bar@clawd-bar
```

最后重启桌面版。

## 出了问题

- **窄带不显示**:先运行 `claude plugin update clawd-bar@clawd-bar` 再重启桌面版。还是不显示的话，在本文件夹运行 `claude plugin test .`,看看测试有没有失败。
- **改了代码**:要先把 `.claude-plugin/plugin.json` 的 `version` 升一位，否则桌面版不会加载新代码。
