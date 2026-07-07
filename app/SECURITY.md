# WorkTime Justin — 安全边界说明（app/SECURITY.md）

这份文档写给两类读者：**家长**（想知道"这东西到底能不能锁住孩子"）和**技术维护者**
（想知道具体拦了什么、靠什么机制、还有哪些不能拦）。对应需求见 `docs/index.html` 的
`#exit`（REQ-EXIT-01 ~ 04）与 `#desktop`（REQ-DESK-04 / REQ-DESK-05）两章。

**核心原则：只说做到的，不做虚假承诺。** 下面明确分成"拦得住"和"拦不住"两部分。

---

## 1. 拦得住什么

### 1.1 App 内快捷键拦截（REQ-EXIT-01）

App 用一个本地 `NSEvent` monitor（`app/shell/main.swift` 的 `setupKeyMonitor` /
`handleKeyDown`）拦截以下组合键，拦下后直接吞掉事件（不进入系统默认处理）：

| 快捷键     | 系统默认行为   | 本 App 行为          |
|-----------|--------------|----------------------|
| Cmd+Q     | 退出 App      | **长按 5 秒弹出隐藏家长菜单**（kiosk 模式，WTJ-20260705-018，见 1.2 节）；窗口化调试模式特意放行，见下 |
| Cmd+W     | 关闭窗口      | 吞掉                  |
| Cmd+H     | 隐藏 App      | 吞掉                  |
| Cmd+M     | 最小化窗口    | 吞掉                  |
| Cmd+\`    | App 内切换窗口 | 吞掉                  |

这五个是幼儿最容易连键盘一起误触的组合键：字母都在主键盘区、位置显眼，误触概率高。

**窗口化调试模式的例外**：`WTJ_WINDOWED=1` 或 `--windowed` 启动的调试窗口里，Cmd+Q
故意不拦截（配合窗口化菜单绑定的退出项，方便开发者随时关掉调试窗口，见
`app/README.md`「本地开发」一节）。Cmd+W/H/M/\` 在窗口化模式下**同样被拦截**——这样
QA/开发可以直接用窗口化模式冒烟验证拦截效果，不必每次都切到会接管整个屏幕、隐藏
Dock/菜单栏的真 kiosk 模式。**只有默认（不带参数）启动的 kiosk 生产模式，才是孩子实际
使用的形态，此时 Cmd+Q 也会被拦（改为长按 5 秒的家长菜单入口，不再是简单吞掉）。**

### 1.2 Cmd+Q 长按 5 秒 → 隐藏家长菜单（WTJ-20260705-018，主退出入口）

kiosk 模式下按住 Cmd+Q：

- 未满 5 秒松开（Cmd 或 Q 任一先松开都算）：**没有任何动作**，不弹菜单、不退出。画面底部
  会出现一条独立的长按进度条（`window.wtjParentGateProgress` 桥给 web 层驱动，见
  `app/web/parent-controls.js`），与 1.3 节 Esc 长按的进度条是两套独立 DOM/状态，互不干扰。
- 满 **5 秒**（`kCmdQHoldSeconds`）：弹出原生 `NSMenu`（隐藏家长菜单），含三项：
  - **「退出 WorkTime Justin」**：直接 `NSApp.terminate`，**不再要求输入口令**——长按
    Cmd+Q 满 5 秒这个物理动作本身就是对家长身份的确认，与 1.3 节 Esc 那条需要口令的退出
    通道是两条并存、互不替代的合法退出路径。
  - **「设置…」**：打开 web 层渲染的设置面板（`app/web/parent-controls.js`），可调整
    每日允许使用时长（默认 30 分钟，见 3.2 节）、切换任务语音语言（中文/英文/跟随素材
    可用性，英文当前因素材不全 8/24 被禁用并明确提示，不会静默改播）。设置面板是**二级
    页面**：点面板里的「关闭」离开时会回到本节这个一级家长菜单（重新弹出同样三项），
    **不会**直接把家长丢回被面板遮住的主游戏界面（WTJ-20260705-027）。
  - **「重置今日使用时长」**：立即清零今日已用秒数并解锁（若当前处于 3.2 节的安静锁屏）。
- 家长菜单本身、以及「设置…」面板，**在安静锁屏状态下依然可以打开**——两者都不依赖 web
  游戏内容是否被抑制，家长永远有办法退出/调额度/解锁。

### 1.3 Esc 长按 + 口令才退出（REQ-EXIT-02 / REQ-EXIT-03，兜底通道，仍保留）

018 卡之前，Esc 长按是唯一的家长入口；018 卡之后它降级为**兜底通道**，行为未变：

- 单击/短按 Esc：**不会**退出、**不会**弹出任何对话框，只是被吞掉（不传给系统默认处理）。
- 长按 Esc **≥ 5 秒**（`kEscHoldSeconds`）：画面底部出现进度提示（`window.wtjEscProgress`
  桥给 web 层驱动），松开前不重置、不累加（键盘长按连发的 keyDown 会去重）。
- 满 5 秒后弹出原生 `NSAlert` 口令框（`NSSecureTextField`，输入内容以圆点遮挡，不会显示
  明文）。
- 口令正确 → `NSApp.terminate`，App 退出。
- 口令错误或取消 → 对话框关闭，直接回到全屏内容；进度条复位为 0。**必须重新长按满
  5 秒**才会再次弹出口令框，不能"攒进度"。

`NSApp.terminate` 在本文件里现在有两处生产触发路径：这里的 `showExitPasswordPrompt`
（口令校验通过之后）与 1.2 节家长菜单的「退出」菜单项（`parentMenuExit`，无需口令）。
两条路径都是家长可用的合法退出通道，互不替代、互不影响。窗口化调试模式下菜单绑定的
Cmd+Q 是第三处，但那只在开发者主动带 `--windowed` 启动时存在，不是孩子会接触到的 kiosk
生产路径。

### 1.4 每日使用时长额度 + 安静锁屏（WTJ-20260705-018）

- App 持有一个**每日允许使用时长**（默认 **30 分钟**，家长可在 1.2 节的设置面板里调整，
  合法范围 5~180 分钟），用 1Hz `Timer` 累计当日已用秒数，落盘到本机 `UserDefaults`
  （`WTJDailyLimitMinutes` / `WTJUsedSecondsToday` / `WTJUsageDateString`）。
- 判定"今天"用**系统本地日期**（不是 UTC），一旦跨到新的一天，已用秒数自动归零、若此前
  处于锁定也会自动解锁——不需要家长手动干预。
- 用完额度后，App 进入**安静锁屏**：web 层全屏覆盖层（`window.wtjSetLockout(true, ...)`
  驱动）显示"今天的时间用完啦"，同时 `keyboard.js`/`pointer.js` 的普通键盘/鼠标输入停止
  触发任何游戏奖励/音效（`window.WTJ_PARENT_CONTROLS.isInputSuspended()` 门禁，见
  `app/web/parent-controls.js`/`app/web/keyboard.js`/`app/web/pointer.js`）——孩子看到的
  是一个安静的"下班"画面，不是还能继续玩、只是暂时没声音。
- 解除安静锁屏的方式：① 等到本地日期跨天自动解锁（App 启动、窗口恢复/系统睡眠唤醒/
  重新获得焦点时都会主动检查一次本地日期，不需要等到下一次 1Hz tick，WTJ-20260707-004）；
  ② 家长经 1.2 节的家长菜单「重置今日使用时长」/设置面板调大额度手动解锁（**同一天**内
  即可用，不要求日期已跨天）；③ 在任意界面（含锁屏叠层本身）连续输入英文单词 "reset"
  （WTJ-20260707-004 新增）——但这**不是**孩子的解锁手段：该口令只在本地日期确实已经跨天
  时才会触发与①完全相同的自动解锁效果，同一天额度用完时输入 reset **不解除锁定**（判定
  逻辑见 `main.swift` 的 `handleResetPasscodeAttempt()`，与`refreshUsageStateForNewDayIfNeeded()`
  共用同一个 `wtjIsNewLocalDay()` 跨日判定，见 `app/shell/DailyQuota.swift`）。也就是说，
  孩子无论怎么输入 reset，都不能在额度用完的当天提前解锁——真正意义上的"孩子自己没有
  解锁手段"这一安全承诺不受影响。

### 1.5 孩子侧没有主动退出入口（REQ-EXIT-04）

孩子在任务系统（web 层 `app.js` 的任务模块）里的所有行为——任务超时自动收起、转移键盘
触发的任务淡出——都只是 web 层内部的 DOM/CSS 状态变化。这些行为：

- 不判定为"失败"；
- **不会、也不能触发应用退出**：web 层和原生退出之间没有任何代码连接。原生侧的
  `WKScriptMessageHandler`（`shell` 消息通道）除了一贯的日志打印外，018 卡新增识别两类
  消息——`wtjSetDailyLimit`（调整每日额度）与 `wtjResetUsageToday`（重置今日额度），均只
  在家长主动打开 1.2 节的设置面板、手动点按钮时才会发出，没有任何路径把"任务收起/超时/
  被键盘打断"这类孩子侧状态变化接到这两类消息或 `NSApp.terminate` 上。退出的入口只有
  1.2 节的"家长菜单 -> 退出"与 1.3 节的"长按 Esc + 口令"两条，跟孩子在界面上做什么完全
  无关。

---

## 2. 拦不住什么（诚实边界，REQ-DESK-04 / REQ-DESK-05）

**以下系统级全局快捷键，本 App（乃至任何没有特殊系统权限的普通 App）都无法在应用层
100% 屏蔽：**

- **Cmd+Space**（呼出 Spotlight 搜索）
- **Cmd+Tab / Cmd+\`（按住 Cmd 循环）**（切换到其他 App）
- **Cmd+Option+Esc**（强制退出面板）——本 App 用 `NSApp.presentationOptions` 里的
  `.disableForceQuit` 标志位做 **best-effort** 抑制，多数情况下能压住这个面板的弹出，
  但这是系统级标志位、不是按键层面的确定性拦截，**不保证 100% 生效**。
- 其他任何通过 macOS Carbon 全局热键机制注册的系统快捷键。

**为什么拦不住**：这些快捷键是在 WindowServer / 系统全局热键层被处理的，事件在到达
任何一个 App 的事件队列之前就已经被系统消费掉了。无论 App 内的 `NSEvent` 本地/全局
monitor 写得多完善，都**收不到**这些按键事件，因此从架构上就没有"在 App 代码里拦截"这
个选项。这不是本实现遗漏了什么，是普通（未开启辅助功能特权、非 MDM 托管）App 的固有
限制。产品需求文档（`docs/index.html` REQ-DESK-04/05）也明确要求不能在这里虚假承诺。

`NSApp.presentationOptions`（`hideDock` / `hideMenuBar` / `disableProcessSwitching` /
`disableForceQuit` / `disableSessionTermination` / `disableHideApplication`）整体也是
同一类"系统级建议标志位"，能显著提高干扰门槛（隐藏 Dock、菜单栏，抑制大部分应用切换
手势、注销/关机对话框、隐藏窗口手势），但同样不是保证性的拦截机制。

### 2.1 2014 MacBook Air 实体键盘/触控板上的"会干扰但不会退出"按键

目标机是 2014 款 MacBook Air，它的实体功能键和触控板手势孩子也可能乱按。要点是：
**这些都不会让孩子退出 App、逃出安全空间，最多只是把画面切走一下（干扰，不是逃逸）**——
真正的退出仍然只有"长按 Esc 5 秒 + 正确口令"这一条路。家长知情即可，不必紧张：

| 按键 / 手势                       | 系统默认行为          | 会退出 App 吗？ |
|----------------------------------|----------------------|----------------|
| **F3**（Mission Control，调度中心） | 展开所有窗口概览       | 否，只是临时切走画面 |
| **F4**（Launchpad，启动台）        | 弹出 App 网格          | 否，只是临时切走画面 |
| **电源键 / Touch ID 键**（短按）    | 睡眠 / 锁屏            | 否，唤醒后仍在 App 里 |
| **四指上滑 / 左右滑**（触控板手势）  | 调度中心 / 切换全屏空间  | 否，只是临时切走画面 |
| F1/F2 亮度、F10-F12 音量等媒体键    | 调亮度 / 音量          | 否，与退出无关     |

这些和第 2 节开头列的 Cmd+Space/Cmd+Tab 同理，都在系统层被处理、App 收不到，因此
App 层拦不住；但它们的后果只是"画面被切走"，孩子自己或家长按一下就能切回来，**没有一个
会触发应用退出**。若想连这类干扰也压掉，用第 3 节的系统层面补强（受限账号 / 屏幕使用
时间 / 键盘功能键改为标准 F 键等）。

---

## 3. 家长可以做的补强（超出本卡范围，供参考）

如果 1、2 节的默认防护还不够（比如孩子已经会用 Cmd+Tab 切出去玩别的 App），家长可以
在**系统层面**做进一步加固，这些都不需要改本 App 的代码：

1. **屏幕使用时间（Screen Time）「内容和隐私限制」**：macOS 的「设置」→「屏幕使用时间」
   里可以限制允许打开的 App、设置停用时间段，比单纯的应用内拦截更强，因为它在系统层面
   生效。
2. **创建一个受限的标准（非管理员）用户账号**，专门给孩子用，登录后自动启动 WorkTime
   Justin，减少孩子接触到 Finder、其他 App、系统设置的机会。
3. **辅助功能权限 + 更强的事件拦截（`CGEventTap`）**：如果需要在 App 层面拦截 Cmd+Tab/
   Cmd+Space 这类系统级快捷键，理论上可以申请辅助功能（Accessibility）权限、用
   `CGEventTap` 在系统事件分发的更底层做拦截。这是明显更大的改动（需要用户手动在
   「系统设置 → 隐私与安全性 → 辅助功能」里授权，涉及额外的权限申请流程与用户教育成本），
   **本卡不实现**，留作后续卡片按需评估。
4. 老旧机型（如本项目目标机 2014 MacBook Air）如果长期只给孩子用，也可以考虑直接锁定
   开机自启动到该受限账号，减少孩子接触到桌面环境的机会。

---

## 4. 口令管理

**本节的口令只用于 1.3 节的 Esc 长按退出通道。** 1.2 节的 Cmd+Q 长按 5 秒 -> 家长菜单
-> 「退出」不使用、也不需要这里的口令——长按 Cmd+Q 满 5 秒这个物理动作本身就是家长意图
的确认。两条通道并存，家长任选其一。

- **默认口令是 `worktime`**（明文常量 `kExitPasswordPlaceholder`，写在
  `app/shell/main.swift` 里）。这是有意保留的默认值——避免家长忘记设置口令导致孩子被
  锁在 kiosk 里、家长自己也退不出去。
- **强烈建议家长设置自己的专属口令**，不要一直用默认值。设置方法（二选一）：

  ```bash
  # 方式一：启动参数
  dist/WorkTimeJustin.app/Contents/MacOS/WorkTimeJustin --set-passcode <你的新口令>

  # 方式二：环境变量
  WTJ_SET_PASSCODE=<你的新口令> dist/WorkTimeJustin.app/Contents/MacOS/WorkTimeJustin
  ```

  执行后 App 会把口令写入本机 `UserDefaults`（key：`WTJExitPasscode`），打印一行确认
  信息，然后**直接退出进程，不会打开 kiosk 全屏界面**（这是家长一次性的设置动作，不是
  正常启动）。设置完之后，正常双击图标（不带任何参数）进入 kiosk，长按 Esc 5 秒后输入
  的就是刚设置的新口令。

- **存储方式**：本地 `UserDefaults`，明文字符串，**无网络请求、无后端、不上传到任何
  服务器**。这是 MVP 阶段的有意简化——本机单用户场景下，口令的作用是"挡住不识字/不会
  用终端的幼儿"，不是抵御有本机访问权限的成年攻击者；如果需要更强的存储方式（哈希、
  Keychain），留给后续卡片按需升级。
- **设置口令时的明文暴露（与"明文存储"同级的诚实提示）**：用**方式一**
  `--set-passcode <口令>` 设置时，口令会作为命令行参数出现——它会**留在 shell 历史记录**
  （如 `~/.zsh_history` / `~/.bash_history`），并在 App 设置那一瞬间**可被同机其他进程
  通过 `ps` 看到**。这同样只在"有人能物理访问/登录这台机器"时才有意义（和明文存储是同一
  威胁模型），但仍建议家长：设置后清一下历史记录（如 zsh 执行 `history -p` 或手动删掉
  对应行），或**优先用方式二环境变量** `WTJ_SET_PASSCODE=...`（环境变量不进 shell 历史，
  且进程一 `exit` 就消失，暴露窗口更小）。
- **忘记口令怎么办**：两种方式都能重置回默认口令 `worktime`：
  1. 重新跑一次 `--set-passcode` 设置一个你能记住的新口令；
  2. 或者直接删掉 UserDefaults 里的记录，让 App 回退到默认占位口令：

     ```bash
     defaults delete com.worktime.justin WTJExitPasscode
     ```

  3. **或者干脆不折腾口令**：长按 Cmd+Q 满 5 秒打开家长菜单、点「退出」（1.2 节），完全
     不需要任何口令。018 卡之后，"忘记 Esc 口令"不再是"退不出 App"的风险，只是"少一条
     可用通道"。

- 只要没有通过 `--set-passcode` 设置过专属口令，每次 App 启动、以及每次弹出退出口令框
  时，`app/shell/main.swift` 都会打一条 `NSLog` 提醒（可在 `Console.app` 里搜索
  `WorkTimeJustin` 查看），提示当前用的是默认占位口令。

---

## 5. 参考：本文档与代码的对应关系

| 需求 ID       | 说明                                   | 代码位置（`app/shell/main.swift`）                    |
|--------------|----------------------------------------|--------------------------------------------------------|
| REQ-EXIT-01  | 拦截 Cmd+H/W/Q 等常见快捷键             | `handleKeyDown` 的 Cmd 修饰键分支                       |
| REQ-EXIT-02  | Esc 不直接退出                          | `handleKeyDown` 的 Esc 分支 + `handleEscKeyDown`        |
| REQ-EXIT-03  | 长按 Esc ≥5 秒 + 口令才退出（兜底通道）  | `checkEscProgress` / `showExitPasswordPrompt` / `resolveExitPasscode` |
| REQ-EXIT-04  | 孩子侧无主动退出入口，任务收起不触发退出   | `userContentController` 附近的解耦说明注释               |
| REQ-DESK-04  | 系统级快捷键未必能 100% 禁掉             | 本文档第 2 节 + `handleKeyDown` 顶部注释                 |
| REQ-DESK-05  | 更强控制需系统设置/辅助功能配合，不虚假承诺 | 本文档第 2、3 节 + `setupKioskPresentation` 注释          |

以下为 WTJ-20260705-018（P0 家长控制卡）新增，验收标准编号见该卡任务描述（非
`docs/index.html` 既有 REQ ID 体系）：

| 验收标准 | 说明                                     | 代码位置                                                                 |
|---------|------------------------------------------|---------------------------------------------------------------------------|
| #1      | Cmd+Q 长按 5 秒主入口 + 进度条            | `main.swift` 的 `handleCmdQKeyDown`/`handleCmdQKeyUp`/`checkCmdQProgress`/`handleFlagsChanged`；`parent-controls.js` 的 `window.wtjParentGateProgress` |
| #2      | 满 5 秒弹隐藏家长菜单；「退出」免口令       | `main.swift` 的 `showParentMenu`/`parentMenuExit`                          |
| #3      | 每日额度可调、默认 30 分钟、持久化本机       | `main.swift` 的 `loadUsageStateFromDefaults`/`persistUsageState`/`applyDailyLimitChange`；`parent-controls.js` 设置面板 |
| #4      | 语言/任务语音模式切换，no-silent-fallback   | `app/web/voice-language.js`（`resolveTaskVoicePath`/`setMode`）+ `task.js` 的 `playTaskVoiceDefensive` 接线 |
| #5      | 额度耗尽 -> 安静锁屏，禁用 app 交互          | `main.swift` 的 `tickUsage`/`enterLockout`/`notifyLockout`；`parent-controls.js` 的 `wtjSetLockout`；`keyboard.js`/`pointer.js` 的 `isInputSuspended()` 门禁 |
| #6      | 锁屏下仍可开家长菜单，支持退出/调额度/reset  | `main.swift` 的 `showParentMenu`（不依赖 web 状态）+ `parentMenuResetUsage`/`resetUsageToday` |
