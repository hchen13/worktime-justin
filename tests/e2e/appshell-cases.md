# APPSHELL 用例集：最小可运行壳集成测试（WTJ-20260704-002）

被测对象：`app/`（Swift/AppKit + WKWebView 极薄壳），分支 `tl/app-shell-v0`。
本卡是 targeted integration testing（PM 指定，不走 docs 那种完整长流程）。

## 测试分层与可验证边界

这个壳是「原生外壳 + web 画布」两层。集成测试必须区分**能在 CI/无头确定性验证的**和
**只能真机/单用户 GUI 手动验证的**，后者作为剩余风险交接，不能假装脚本覆盖了。

| 层 | 验证方式 | 资产 | 环境要求 |
|---|---|---|---|
| build.sh 全链路 + gate | 脚本，跑 `app/build.sh` 断言 exit 0 | build.sh 自带验证段 | macOS + swiftc |
| JS 桥（web→native postMessage） | 观察壳 NSLog `WTJ shell message {type=ping}` | 手动/日志 | 本机运行壳 |
| web 层输入→可视化契约 | **无头 Chromium 确定性脚本** | `appshell_web_smoke.py` | playwright |
| 窗口模式 native OS 事件→DOM 转发 | 合成 CGEvent + 截图（单用户机） | 一次性 | 单用户 GUI + TCC |
| kiosk 全屏接管 | 截图确认全屏/隐藏 Dock/菜单栏 | 一次性 | GUI |
| kiosk native 键盘→DOM 转发 | **本环境不可安全验证**（见下） | — | 单用户机/真机 |
| Esc 家长退出 NSAlert + 口令 | web 侧进度桥可验；native NSAlert 不可 | 手动 | 单用户机 |

## 为什么部分项不能在本环境脚本化

1. **合成 GUI 输入在多会话共享机上会泄漏**：本机同时运行多个 Claude Code 会话
   （PM/TL/DESIGN loop）。用 CGEvent 注入键盘/鼠标时，若被测窗口没抢到 key 焦点，
   按键会落进**其它会话的终端**。kiosk 模式实测出现过这种泄漏，已停止该手法。
   → 合成输入端到端验证仅在确认单用户、被测窗口确为 key window 时才可做，且不进 CI。
2. **无法从外部读 WKWebView 的 DOM**：壳把 web 加载进 WKWebView 私有 JS 上下文，
   外部进程读不到其 DOM 状态，只能靠屏幕像素或壳自身 NSLog 间接观察。
   → 因此把 web 层契约拆出来在**独立无头浏览器**里确定性验证（同一份 web 包），
   native→DOM 转发那一环只能靠壳的 responder 接线（代码审查）+ 窗口模式实测佐证。

## 可复用脚本资产：appshell_web_smoke.py

驱动 `app/web/`（壳加载的同一份 web 包）在无头 Chromium 里验证输入→可视化契约。
退出码 0 全过 / 1 有用例失败 / 2 基础设施错误。

| ID | 测什么 | 怎么算过 |
|---|---|---|
| APPSHELL-01-load | 页面自包含加载、canvas + debug 叠层在场 | 无外部请求、无 console error、canvas 与四个 dbg 元素存在 |
| APPSHELL-02-keyboard | 键盘进入 web 层 | 按 `a` 后 dbg-key='a'；按 Space 后 dbg-key='Space' |
| APPSHELL-03-mouse | 鼠标移动进入 web 层 | dbg-mouse 反映最后坐标（误差 ≤3px） |
| APPSHELL-04-click-audio-unlock | 点击进入 web 层且触发音频解锁 | dbg-audio 脱离初始 'locked'（证明 click handler 跑了 unlockAudio） |
| APPSHELL-05-esc-bridge | 壳→web 的 Esc 进度桥 | `window.wtjEscProgress(2.5)`→进度条 50% active；`(0)`→0% inactive |
| APPSHELL-06-idle-resume | 空闲自停渲染后输入能唤醒 | 300ms 空闲后按 `z`，dbg-key='z' 且无 console error |

注意：APPSHELL-02/03/04 验证的是 **web 层 DOM 事件处理**（app.js 正确响应），
不等于原生壳一定把 OS 事件转发进了 DOM——后者见「窗口模式实测」与剩余风险。

## 本次执行记录（tl/app-shell-v0@0b7d5f4）

- build.sh：exit 0，universal(x86_64+arm64)、x64 slice LC_BUILD_VERSION minos 11.0、
  两 slice 均无 libswift_Concurrency 链接与并发符号、codesign 通过、DMG 81K。**PASS**
- JS 桥：两次启动均观察到壳 NSLog `WTJ shell message {type=ping}`。**PASS**
- appshell_web_smoke.py：6/6 PASS。**PASS**（可复用）
- 窗口模式 native→DOM：点击聚焦后注入 A/S/3 与鼠标扫动，壳 debug 叠层实测
  `key:3 / mouse:540,384 / audio:running` 且画布渲染出点击圆环——OS 键盘+鼠标+点击
  确实进入 DOM。**PASS**（验证了 P0-1 responder 接线在窗口模式成立）
- kiosk 全屏：启动即接管 3440x1440 全屏、隐藏 Dock/菜单栏、window level 25。**PASS**
- kiosk native 键盘→DOM 端到端：**未能安全验证**（合成输入泄漏到兄弟会话，已停手）。
  KioskWindow.canBecomeKey/canBecomeMain 覆写在源码中在场（正是 code review 的 P0-1 修复），
  窗口模式已证明同一 makeFirstResponder 接线有效。**剩余风险 → 单用户机/真机手动冒烟**。
- Esc 家长退出：web 侧进度桥已验（APPSHELL-05）；native NSAlert 弹窗 + 口令 `worktime`
  校验 + 退出，**未能安全验证**。**剩余风险 → 单用户机手动冒烟**。
- 「不锁死」（工具/运维侧）：kiosk 的 disableProcessSwitching 不影响编程式 `pkill`，
  进程始终可杀，本次多次实测可干净终止。**PASS**（人操作侧的 Esc+口令退出仍需手动验）。

## 剩余风险（交 PM）

- **[P0 候选] kiosk 模式键盘端到端未验**：这正是 code review P0-1 的核心场景。本环境
  因多会话机合成输入泄漏无法安全验证；需在单用户机或 2014 MBA 上手动冒烟：kiosk 启动
  → 按字母 → 确认屏幕出现字母 → 长按 Esc 5s → 输入 `worktime` → 确认退出。
- **native NSAlert 退出流程未验**：进度条到 100% 后弹窗、口令正确退出/错误复位。
- **2014 MacBook Air / macOS 11 真机兼容性未验**：SDK 26 交叉编译产物在 Big Sur 上的
  WKWebView 行为、字体、presentationOptions 细节（TL 已在交接里列为已知边界）。
