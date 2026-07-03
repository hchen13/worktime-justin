# WorkTime Justin — app/ 极薄壳（WTJ-20260704-002）

## 技术栈

**Swift/AppKit + WKWebView 极薄原生壳**，画布内容用 HTML/CSS/Canvas2D 实现。选择这个组合是因为交付目标机是 **2014 款 MacBook Air（Intel x86_64，macOS Big Sur 11，4GB 内存，HD5000 核显）**：Electron/Chromium 类方案对 4GB 内存和老核显不友好，且 Big Sur 缺少 Swift Concurrency 的运行时回退库（`_Concurrency` fallback），用现代 Electron/Node 工具链风险更高；原生 AppKit 外壳启动快、内存占用低，WKWebView 复用系统自带的 WebKit，不需要额外打包一个浏览器内核。

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

## Kiosk 模式行为与家长退出

- 全屏 borderless 窗口覆盖整个屏幕，隐藏 Dock/菜单栏，尽力禁用应用切换、强制退出、注销/关机、隐藏窗口等系统交互（`NSApp.presentationOptions`）。
- Cmd+Q / Cmd+W / Cmd+H 被拦截吞掉；空主菜单去掉默认的退出/隐藏/关闭快捷键绑定。
- **家长退出**：长按 `Esc` 键 **≥ 5 秒**（画面底部会出现细进度条占位提示），松开前不重置、不累加（键盘长按连发的 keyDown 会被去重），到时会弹出原生对话框要求输入退出口令。
- 占位口令为 **`worktime`**（硬编码在 `shell/main.swift` 的 `kExitPasswordPlaceholder` 常量中，并有注释说明）。这只是本卡（最小可运行壳）的临时实现，正式的口令管理（可修改、加密存储等）留给后续卡片。
- 口令正确 → 应用退出；口令错误或取消 → 对话框关闭，直接回到全屏内容，不做其他动作。注意：弹窗弹出时长按计时器已重置清零，关闭弹窗后需要**重新长按 Esc 满 5 秒**才会再次弹出口令框。

## 已知边界

- `Cmd+Space`（Spotlight）、`Cmd+Tab`（应用切换）等系统级全局快捷键仅是 **best-effort** 屏蔽（依赖 `disableProcessSwitching` 等 presentation option），不保证 100% 拦截，属于 macOS 沙盒外应用的固有限制。
- 本次交付在 Apple Silicon + macOS 26.1（仅 CommandLineTools，无完整 Xcode）的环境下交叉编译，**尚未在真实的 2014 MacBook Air / Big Sur 11 上做过实机冒烟**——SDK 26 交叉编译产物在 Big Sur 上的实际兼容性（尤其 WKWebView 行为、字体渲染、presentationOptions 细节）待后续卡片上机验证。
- 若实机冒烟发现 AppKit/WebKit 交叉编译产物在 Big Sur 上无法正常运行，技术方案的备胎是切换到 **Electron 37**（三路评审时已讨论过的备选项）。
