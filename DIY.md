# 自己动手改 Clawd Bar

想加个职业、换个动作、做个新功能？这份说明写给想改插件的你，也写给替你改代码的 Claude。

> **先说清楚：** 下面的内容分两种。
>
> - **【官方】** 来自 Claude Code 插件 API 的官方说明，可以放心照着做。
> - **【经验·疑似】** 是我们开发时在 Claude 桌面版上一次次碰壁总结出来的。我们看到了现象，但原因没有得到官方确认，换个版本可能就不一样了。所以它只是"疑似"和"建议"，不是定论。遇到怪问题时可以先来这里对照一下，也许能少走点弯路。

<br>

## 一、改代码的基本流程

1. **先把仓库 clone 到本地**，从本地文件夹安装，改完才能马上看到效果：
   ```bash
   git clone https://github.com/Frisk-Toby/clawd-bar.git
   claude plugin marketplace add "<clone 下来的文件夹绝对路径>"
   claude plugin install clawd-bar@clawd-bar
   ```
   如果之前是从 GitHub 装的，先 `claude plugin uninstall clawd-bar@clawd-bar` 再按上面装，免得两个版本打架。
2. **改 `hooks/` 里的代码**(代码地图见下一节)。
3. **检查**：在仓库文件夹里运行
   ```bash
   claude plugin validate .
   claude plugin test .
   ```
   `validate` 会报告引擎可能拒绝的写法;`test` 跑 `tests/` 里的测试，其中 `size.test.ts` 专门守住图形总量(见第三节)。
4. **把 `.claude-plugin/plugin.json` 的 `version` 升一位。**【经验·疑似】版本号不变的话，桌面版好像不会加载新代码。
5. **更新并重启**：
   ```bash
   claude plugin marketplace update clawd-bar
   claude plugin update clawd-bar@clawd-bar
   ```
   然后完全退出 Claude 桌面版再打开(Windows:右下角托盘图标右键 → 退出;macOS:`⌘Q`)。【经验·疑似】只关窗口不够，换版本后要整个重启才生效。
6. **小步走**：一次只改一样东西，看到效果再改下一样。窄带突然不显示时，能马上知道是哪一步引起的。

<br>

## 二、代码地图

| 文件 | 管什么 |
|---|---|
| `hooks/register.tsx` | 入口：注册所有事件、画出整条窄带 |
| `hooks/state.ts` | 常量、颜色、共享状态、缓存计时、上下文占用 |
| `hooks/crew.ts` | 角色队伍：站几只、怎么排、图形预算 `SVG_BUDGET` |
| `hooks/costumes.ts` | 17 个职业的服装、道具和场景特效 |
| `hooks/clawd.ts` | 把像素帧画成 SVG(动作、皮肤换色、点击挥手、连点晕倒) |
| `hooks/sprites.ts` | Clawd 原画动作帧 |
| `hooks/bar.ts` | 缓存进度条和右上角的 Claude 星芒 |
| `hooks/keep.ts` | 「续」:缓存快过期时自动发 `1` 保活 |
| `hooks/night.ts` / `hooks/nightsky.ts` | 「夜班」逻辑和展开面板里的像素夜景 |
| `hooks/cost.ts` | 用你自己的实际消耗估算每条消息花多少额度 |
| `tests/` | 测试，改完一定要跑 |

想新增一个职业，从 `costumes.ts` 里照着现有的职业抄一个最省事。

<br>

## 三、画图的规矩

### 【官方】写在插件 API 里的限制

- **单个 `Svg` 的 `source` 最多 131,072 个字符**，超过的话整棵界面树都会被拒绝绘制。
- 一次绘制里的**文字最多画前 100,000 个字符**，后面的会被截掉。
- `Svg` 默认当成一张图片来画;加上 `isInteractive` 才会放进沙盒框里，SMIL 动画、CSS `:hover`、`<title>` 提示才能生效。**脚本永远不会执行**，`onclick` 这类事件属性会被直接剥掉。
- 界面被拒绝时，`claude --debug` 的调试日志里会有 `ui.render ... refused: <原因>` 这样的行，排查时先看这里。

### 【经验·疑似】桌面版窄带上踩过的坑

1. **整条窄带的 SVG 总量好像有上限。** 官方只限制单个 `Svg`，但我们观察到：一次绘制里所有 `Svg` 加起来约 47 万字符时还能正常显示，约 81 万字符时整条窄带直接不显示，也没有任何报错。所以我们把总量压在 `SVG_BUDGET = 260_000` 以内(在 `hooks/crew.ts`)，`tests/size.test.ts` 会检查收起和展开两种状态。**加角色、加动画之前，先算一下会不会超预算。**
2. **"熔断"：被拒一次以后，桌面版可能就不再画窄带了。** 窄带被拒绝过一次后，我们遇到过桌面版之后都不再请求绘制它，重启也没用;把插件卸载、重新安装、再重启桌面版才恢复。所以大改之前最好先打一个 git 标签当回退点。
3. **窄带里放 `Markdown` 好像会被拒绝并触发熔断**，哪怕只是一个普通链接。Markdown 图片链接 `[![]()]()` 会让整条窄带消失。**要做能点的东西，用原生的 `Button`。**
4. **`Svg` 里用 `clipPath` 疑似会导致整条被拒。** 需要裁切的话，改用别的画法(比如直接画出裁切后的形状)。
5. **点击动画用 SMIL**：我们用的是 `begin="r.click"`(根 `<svg>` 的 `id="r"`)，确认可以用。`<style>`、`tabindex`、`:focus` 这些写法我们没用，也没单独验证它们会不会被拒。
6. **桌面版里 `/clawd` 命令好像用不了**，终端版 Claude Code 里可以。

<br>

## 四、【经验】写代码时的小坑

- **共享状态的 `atom` 要在每个用到它的文件里各自声明一遍**，`key` 和 `shape` 要和 `state.ts` 里的一致。从别的文件 import 过来再 `read` / `update`，引擎好像不认。
- **改了某个状态的数据结构，就把它的 `shape` 名字换掉**(比如 `prefs-7` → `prefs-8`)，免得读到旧数据出错。
- **JSX 会被编译成全局函数 `h()`**，别把变量命名成 `h`。
- **插件自己用 `$.prompt.submit` 发出去的消息，不会经过它自己的 `prompt.submit` 钩子。** 想让模型对这类消息有特别的反应，要像 `keep.ts` 那样，用 `prompt.context` 在对话开头写好规矩。

<br>

## 五、出了问题怎么排查

1. 运行 `claude plugin validate .` 和 `claude plugin test .`，看有没有报错。
2. 用 `claude --debug` 启动，在日志里搜 `refused`，看引擎拒绝了什么、为什么。
3. **窄带不见了**：先退回上一个能显示的版本(git 标签或提交)，确认能显示后，再把改动一项一项加回去，每加一项看一次，就能找到是哪一样引起的。
4. **退回去也不显示**：可能是"熔断"了。卸载插件、重新安装、完全重启桌面版。
5. 还是不行，欢迎到 [Issues](https://github.com/Frisk-Toby/clawd-bar/issues) 说一声，附上 `--debug` 日志里相关的几行。

<br>

## 六、给 Claude 的话

用户让你改 Clawd Bar 时：

- 先读完这份文件和 `hooks/` 里相关的代码。Claude Code 自带 `plugin-authoring` 技能，里面有插件 API 的官方说明，拿不准的写法先查那里。
- 一次只改一样，改完跑 `claude plugin validate .` 和 `claude plugin test .`，把 `plugin.json` 的版本号升一位，再请用户完全重启桌面版看效果。
- 加图形之前先估算 SVG 的字符数，别超过 `SVG_BUDGET`。
- 窄带里不要用 `Markdown`,`Svg` 里不要用 `clipPath`，能点的东西用 `Button`。
- 改之前先打个 git 标签;改坏了就退回去，再一项项加回来。
- 本文件里标【经验·疑似】的内容只是我们观察到的现象，不一定准确。跟实际表现对不上时，以实际表现和官方说明为准，也欢迎更新这份文件。
