# WorkTime Justin — app/ 极薄壳（WTJ-20260704-002）

## 技术栈

**Swift/AppKit + WKWebView 极薄原生壳**，画布内容用 HTML/CSS/Canvas2D 实现。选择这个组合是因为交付目标机是 **2014 款 MacBook Air（Intel x86_64，macOS Big Sur 11，4GB 内存，HD5000 核显）**：Electron/Chromium 类方案对 4GB 内存和老核显不友好，且 Big Sur 缺少 Swift Concurrency 的运行时回退库（`_Concurrency` fallback），用现代 Electron/Node 工具链风险更高；原生 AppKit 外壳启动快、内存占用低，WKWebView 复用系统自带的 WebKit，不需要额外打包一个浏览器内核。

## 产品参数与数据模型（manifest）

`web/manifest.js`（`window.WTJ_MANIFEST`）收敛了需求文档 `docs/index.html` 中散落的阈值、
秘密词词池、任务模板、素材与音频引用，作为应用可读的单一参照来源；`web/index.html` 在
`app.js` 之前加载它。改阈值、加词、换素材路径优先编辑这个文件，而不是散改各引擎代码里的
硬编码常量。各域字段含义、消费方（键盘/秘密词/槽位/任务/奖励/音频/退出桥各后续卡）如何读取、
新增词池条目的步骤，见 [`web/MANIFEST.md`](web/MANIFEST.md)。

## 本地开发

Web 层（`web/index.html`、`web/app.js`、`web/style.css`）零外部依赖、零构建步骤，两种方式均可直接调试：

```bash
# 方式一：直接用浏览器打开（file:// 也可）
open web/index.html

# 方式二：本地静态服务器（避免个别浏览器对 file:// 的限制）
cd web && python3 -m http.server 8080
# 然后访问 http://localhost:8080
```

原生壳窗口化调试（普通可关闭窗口，不锁屏，不吞 Cmd+Q，便于反复验证）：

```bash
./build.sh --run
```

也可以手动窗口化启动已构建的 app：

```bash
WTJ_WINDOWED=1 open dist/WorkTimeJustin.app
# 或命令行参数形式（需直接执行可执行文件）：
dist/WorkTimeJustin.app/Contents/MacOS/WorkTimeJustin --windowed
```

**默认（不带任何标志）启动 = kiosk 全屏模式**，会接管整个屏幕并屏蔽 Dock/菜单栏/应用切换等，请勿在自己正在使用的机器上直接双击启动 —— 仅在确认要做全屏冒烟测试时才这样做。

## 构建

```bash
./build.sh          # 构建 + 自动验证
./build.sh --run     # 构建 + 验证 + 窗口化启动一次（不会锁屏）
```

构建流程：

1. 用 `swiftc -O` 分别交叉编译 `x86_64-apple-macosx11.0` 与 `arm64-apple-macosx11.0` 两个 slice（x64 是交付目标机架构，arm64 供本机 Apple Silicon 做原生冒烟）。
2. `lipo -create` 合成 universal 可执行文件。
3. 组装 `dist/WorkTimeJustin.app`（`Contents/MacOS`、`Contents/Resources/web`、`Info.plist`、`PkgInfo`）。
4. `codesign --force --deep -s -` 做 ad-hoc 签名（无 Apple 开发者证书时的本地签名方式，避免 Gatekeeper 直接拒绝运行）。
5. `hdiutil create` 打包成 `dist/WorkTimeJustin.dmg`。
6. 自动验证：universal 二进制的 `lipo -archs`、x64 slice 的 `LC_BUILD_VERSION`（platform/minos 应为 macos/11.0）、`codesign -v`、bundle 文件清单、dmg 大小。任一项失败脚本即以非零状态退出。

### 构建产物

```
dist/
  WorkTimeJustin.app/
    Contents/
      MacOS/WorkTimeJustin      # universal (x86_64 + arm64) 可执行文件
      Resources/web/            # index.html / style.css / app.js
      Info.plist
      PkgInfo
  WorkTimeJustin.dmg            # 分发用磁盘映像
```

## 目标机安装步骤（2014 MacBook Air / Big Sur 11）

1. 通过 U 盘或 `scp` 把 `WorkTimeJustin.dmg`（或直接把 `.app`）拷贝到目标机——U 盘/scp 拷贝通常不会带 macOS 的 quarantine 隔离标记，这一步大概率不会触发 Gatekeeper 拦截。
2. 双击 `.dmg` 挂载后，把 `WorkTimeJustin.app` 拖入 `/Applications`。
3. 首次启动如被 Gatekeeper 拦截（提示"无法打开，因为无法验证开发者"），二选一：
   - **右键（或 Control+点击）App 图标 → 打开**，在弹出的对话框里再次点"打开"（仅首次需要，属于系统的一次性信任放行）；
   - 或者终端执行 `xattr -cr /Applications/WorkTimeJustin.app` 清除隔离属性后再正常双击打开。
4. 正常双击图标 = **kiosk 全屏模式**启动，会接管整个屏幕。

## Kiosk 模式行为、家长退出与安全边界

完整的拦截清单、口令管理细节、"拦得住/拦不住什么"的诚实边界说明，见
**[`SECURITY.md`](SECURITY.md)**（家长向 + 技术向）。这里只列摘要：

- 全屏 borderless 窗口覆盖整个屏幕，隐藏 Dock/菜单栏，尽力禁用应用切换、强制退出、注销/关机、隐藏窗口等系统交互（`NSApp.presentationOptions`，best-effort）。
- App 内拦截 Cmd+Q / Cmd+W / Cmd+H / Cmd+M / Cmd+\`（吞掉，不触发退出/关闭/隐藏/最小化/切窗口）；空主菜单去掉默认的快捷键绑定。窗口化调试模式下 Cmd+Q 特意放行（方便开发者关调试窗口），其余几个照样拦截，便于用 `WTJ_WINDOWED=1` 冒烟验证拦截效果而不必进真 kiosk。
- **家长退出**：长按 `Esc` 键 **≥ 5 秒**（画面底部会出现细进度条提示，由原生壳通过 `window.wtjEscProgress` 驱动 web 层展示），松开前不重置、不累加（键盘长按连发的 keyDown 会被去重），到时会弹出原生对话框要求输入退出口令（`NSSecureTextField`，输入内容不显示明文）。
- 口令正确 → 应用退出；口令错误或取消 → 对话框关闭，直接回到全屏内容，不做其他动作。注意：弹窗弹出时长按计时器已重置清零，关闭弹窗后需要**重新长按 Esc 满 5 秒**才会再次弹出口令框。
- **孩子侧没有主动退出入口**：任务系统的任务超时自动收起 / 转移键盘触发的任务淡出都只是 web 层内部状态变化，与原生退出完全解耦，不会触发应用退出。

### 设置家长退出口令（`--set-passcode`）

默认口令是 `worktime`（`shell/main.swift` 的 `kExitPasswordPlaceholder` 常量），**强烈
建议家长改成自己的专属口令**，避免使用众所周知的默认值：

```bash
# 方式一：启动参数（二选一）
dist/WorkTimeJustin.app/Contents/MacOS/WorkTimeJustin --set-passcode <你的新口令>

# 方式二：环境变量
WTJ_SET_PASSCODE=<你的新口令> dist/WorkTimeJustin.app/Contents/MacOS/WorkTimeJustin
```

执行后口令会写入本机 `UserDefaults`（key `WTJExitPasscode`，明文存储，无网络/后端），
打印确认信息后**直接退出进程，不会进入 kiosk 全屏**——这是一次性的设置动作。之后正常
（不带参数）启动即可，长按 Esc 5 秒后输入的就是新口令。忘记口令、存储细节、以及
"拦得住/拦不住什么"的完整边界说明见 [`SECURITY.md`](SECURITY.md)。

## 已知边界

- `Cmd+Space`（Spotlight）、`Cmd+Tab`（应用切换）、`Cmd+Option+Esc`（强制退出面板，仅 `.disableForceQuit` best-effort 抑制）等系统级全局快捷键**无法**在本 App（或任何普通、非辅助功能特权的 App）层面 100% 屏蔽——这些快捷键在到达 App 事件队列之前就已被系统全局热键机制处理掉，不是本实现的疏漏。完整说明与家长可选的系统层面补强方式见 [`SECURITY.md`](SECURITY.md)。
- 本次交付在 Apple Silicon + macOS 26.1（仅 CommandLineTools，无完整 Xcode）的环境下交叉编译，**尚未在真实的 2014 MacBook Air / Big Sur 11 上做过实机冒烟**——SDK 26 交叉编译产物在 Big Sur 上的实际兼容性（尤其 WKWebView 行为、字体渲染、presentationOptions 细节）待后续卡片上机验证。
- 若实机冒烟发现 AppKit/WebKit 交叉编译产物在 Big Sur 上无法正常运行，技术方案的备胎是切换到 **Electron 37**（三路评审时已讨论过的备选项）。
- 2014 MacBook Air 性能预算（动画/粒子数量上限、常驻 sprite 与内存预算、音频加载风险、Canvas2D 帧率红线、全屏稳定性）与必须真机验证的 P0 风险清单，见 [`PERFORMANCE.md`](PERFORMANCE.md)。
