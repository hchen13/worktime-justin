//
//  main.swift
//  WorkTimeJustin — 极薄原生壳
//  基础壳：WTJ-20260704-002；家长退出/快捷键拦截/安全边界完整实现：WTJ-20260704-017
//
//  目标机：2014 MacBook Air（Intel x86_64，macOS Big Sur 11，4GB RAM，HD5000）
//  硬约束：
//   1) 禁用一切 Swift Concurrency（async/await/Task/actor）——Big Sur 缺 _Concurrency
//      回退库，编译能过但目标机启动即崩。全文件只用 Timer / 回调 / GCD 风格 API。
//   2) API 限定 macOS 11.0 可用集合；更新的 API 一律 `if #available` 守卫并提供
//      11.0 路径（本文件未使用任何 11.0 之后新增的 API，故无需守卫分支）。
//   3) 需兼容 -target x86_64-apple-macosx11.0 交叉编译，由 build.sh 验证。
//
//  无 storyboard / xib，纯代码 AppKit。文件名 main.swift，用顶层语句作为入口，
//  不使用 @main / @NSApplicationMain，避免不同 Swift 版本对入口属性处理的差异。
//
//  安全边界与快捷键拦截清单见 app/SECURITY.md（家长向 + 技术向）；本文件的
//  相关实现处均有对应注释指回该文档。
//

import Cocoa
import WebKit

// MARK: - 常量

/// Esc 需要长按的秒数才会弹出退出口令框。
private let kEscHoldSeconds: TimeInterval = 5.0

/// 窗口化调试模式判定：环境变量 WTJ_WINDOWED=1 或启动参数 --windowed。
private let kIsWindowedMode: Bool = {
    if CommandLine.arguments.contains("--windowed") { return true }
    if ProcessInfo.processInfo.environment["WTJ_WINDOWED"] == "1" { return true }
    return false
}()

// MARK: - 家长退出口令管理（REQ-EXIT-03 / REQ-EXIT-04，WTJ-20260704-017）
//
// 无后端、无网络：口令只落在本机 UserDefaults（明文字符串，非哈希）。这是 MVP 阶段
// 的有意简化——本机单用户场景下，口令的作用是"挡住不识字/不会用终端的幼儿"，不是抵御
// 有本机访问权限的攻击者；更强的存储方式（哈希、Keychain）留给后续卡片按需升级。

/// 口令写入 UserDefaults 时使用的 key。
private let kExitPasscodeDefaultsKey = "WTJExitPasscode"

/// 未通过 --set-passcode 设置过口令时的默认占位口令。刻意保留默认值（而不是强制
/// 家长必须设置），是为了避免家长忘记设置口令导致孩子被锁在 kiosk 里、家长自己也退不
/// 出去；默认口令是"worktime"，SECURITY.md 与首启日志会强烈建议家长改成专属口令。
private let kExitPasswordPlaceholder = "worktime"

/// 读取当前生效的家长退出口令。每次调用都实时读 UserDefaults（不做进程内缓存），
/// 因为 --set-passcode 是通过重新启动一次进程来完成设置的（见
/// handleSetPasscodeIfRequested），无需要求本函数支持"运行期热更新"。
private func resolveExitPasscode() -> String {
    if let stored = UserDefaults.standard.string(forKey: kExitPasscodeDefaultsKey), !stored.isEmpty {
        return stored
    }
    NSLog("WTJ: 未检测到家长自定义退出口令，当前使用默认占位口令。强烈建议用 " +
          "`--set-passcode <口令>` 启动一次以设置专属口令（用法见 app/SECURITY.md）。")
    return kExitPasswordPlaceholder
}

/// 处理一次性的口令设置命令：启动参数 `--set-passcode <value>` 或环境变量
/// `WTJ_SET_PASSCODE`。命中时把口令写入 UserDefaults 并立即 exit(0)——这是家长在
/// 终端里跑一次的设置动作，不应该顺带把孩子的全屏 kiosk 界面打开一次。
///
/// 用法（二选一，详见 app/SECURITY.md / app/README.md）：
///   dist/WorkTimeJustin.app/Contents/MacOS/WorkTimeJustin --set-passcode <新口令>
///   WTJ_SET_PASSCODE=<新口令> dist/WorkTimeJustin.app/Contents/MacOS/WorkTimeJustin
///
/// 必须在 NSApplication.shared.run() 之前调用（见文件末尾入口区）；同步阻塞的
/// UserDefaults 读写 + exit(0) 都不涉及 Swift Concurrency。
///
/// **fail-safe（P2-1）**：一旦检测到"设置口令的意图"（`--set-passcode` flag 存在，
/// 或 `WTJ_SET_PASSCODE` 环境变量被显式设置），但值缺失/非法/为空，一律打印用法并
/// `exit(1)`，**绝不静默 fall-through 进 kiosk 全屏**——因为家长很可能正是忘了口令
/// 来重置，若此时静默进全屏会把家长自己反锁在里面。
private func handleSetPasscodeIfRequested() {
    let args = CommandLine.arguments

    // --set-passcode <value>：flag 一旦出现就进入严格校验分支（不再是"有值才处理，
    // 没值就当没这回事"）。缺值 / 值以 "--" 开头（疑似漏写口令、把 --windowed 之类
    // 下一个选项误当口令）/ 值为空，都拒绝并 exit(1)。
    if let flagIndex = args.firstIndex(of: "--set-passcode") {
        let valueIndex = flagIndex + 1
        guard valueIndex < args.count else {
            failSetPasscode("`--set-passcode` 后缺少口令值。")
        }
        let value = args[valueIndex]
        guard !value.hasPrefix("--") else {
            failSetPasscode("`--set-passcode` 的口令值不能以 \"--\" 开头（\"\(value)\" 看起来是另一个选项，" +
                            "疑似漏写口令）。若口令本身确需以 -- 开头，请改用 WTJ_SET_PASSCODE 环境变量。")
        }
        guard !value.isEmpty else {
            failSetPasscode("`--set-passcode` 的口令值不能为空。")
        }
        commitPasscodeAndExit(value)
    }

    // WTJ_SET_PASSCODE：只要该环境变量被显式设置（哪怕是空串）就视为一次设置意图。
    // 空串同样拒绝并 exit(1)，不静默进 kiosk。未设置该变量则整个函数正常返回、继续启动。
    if let envValue = ProcessInfo.processInfo.environment["WTJ_SET_PASSCODE"] {
        guard !envValue.isEmpty else {
            failSetPasscode("环境变量 WTJ_SET_PASSCODE 为空串，无法作为口令。")
        }
        commitPasscodeAndExit(envValue)
    }
}

/// 口令设置用法错误的统一出口：向 stderr 打印原因 + 用法说明，NSLog 记一条，exit(1)。
/// 返回类型 Never，编译器据此知道调用点之后不可达（不会 fall-through 进 kiosk）。
private func failSetPasscode(_ reason: String) -> Never {
    let message = """
    WorkTime Justin: 设置退出口令失败——\(reason)
    用法（二选一）：
      WorkTimeJustin --set-passcode <口令>
      WTJ_SET_PASSCODE=<口令> WorkTimeJustin
    （已拒绝进入 kiosk 全屏。详见 app/SECURITY.md）

    """
    FileHandle.standardError.write(Data(message.utf8))
    NSLog("WTJ: --set-passcode 用法错误：%@（已拒绝进入 kiosk，exit 1）", reason)
    exit(1)
}

/// 把口令写入 UserDefaults 并 exit(0)。返回类型 Never，同上：设置动作是一次性的，
/// 不应该顺带打开 kiosk 界面。
private func commitPasscodeAndExit(_ passcode: String) -> Never {
    UserDefaults.standard.set(passcode, forKey: kExitPasscodeDefaultsKey)
    // 进程即将 exit(0)：显式 synchronize 促使立即落盘，不依赖系统的自动同步时机。
    // synchronize() 在新 API 里已标记 deprecated，但 macOS 11 仍可用、不会崩溃，
    // 这里是"确保写入生效"优先于"追新 API"的有意选择。
    UserDefaults.standard.synchronize()
    NSLog("WTJ: 已设置家长退出口令（写入 UserDefaults key=%@）。", kExitPasscodeDefaultsKey)
    print("WorkTime Justin: 退出口令已设置。请正常启动 App（不带 --set-passcode）进入 kiosk。")
    exit(0)
}

// MARK: - 弱引用消息代理

/// WKUserContentController 会强引用 handler；若 handler 直接是持有 webView 的
/// AppDelegate，会形成 controller -> handler -> webView -> configuration ->
/// userContentController 的循环引用。这里用一个不持有任何 webView 的轻量代理，
/// 对 AppDelegate 只做 weak 引用，避免循环。
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(target: WKScriptMessageHandler) {
        self.target = target
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController,
                                didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

// MARK: - Kiosk 窗口

/// borderless NSWindow 的 canBecomeKey / canBecomeMain 默认为 false：
/// makeKeyAndOrderFront 无法使其成为 key window，WKWebView 拿不到 first responder，
/// kiosk 模式下 DOM 将收不到任何键盘事件。覆写两个属性修复（P0-1）。
final class KioskWindow: NSWindow {
    override var canBecomeKey: Bool { return true }
    override var canBecomeMain: Bool { return true }
}

// MARK: - AppDelegate

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var keyMonitor: Any?

    // Esc 长按状态
    private var escTiming = false
    private var escStartDate: Date?
    private var escProgressTimer: Timer?
    private var alertShowing = false

    // MARK: NSApplicationDelegate

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 启动时就检查一次口令来源并按需打日志提醒（REQ-EXIT-03/04），不等到家长真的
        // 长按 Esc 触发口令框才提示——方便家长/开发者在 Console.app 里第一时间看到。
        // 丢弃返回值：这里只是为了触发 resolveExitPasscode() 内部的 NSLog 提醒分支。
        _ = resolveExitPasscode()
        setupMenu()
        setupWindow()
        setupWebView()
        if !kIsWindowedMode {
            setupKioskPresentation()
        }
        setupKeyMonitor()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        // 防御纵深（P2-5）：kiosk 生产模式恒返回 false，堵死"关掉最后一个窗口即退出"这条
        // 隐性退出通道。当前 kiosk 下并无可达的关窗路径（borderless 窗口无关闭按钮、
        // Cmd+W 被 handleKeyDown 吞掉、未设 WKUIDelegate 也就没有 web 触发的关窗/开新窗），
        // 但恒 true 是个隐患：万一后续卡片引入 WKUIDelegate 或新窗口逻辑、意外关掉了窗口，
        // 就会经这里触发退出、绕过"长按 Esc + 口令"的唯一合法退出路径。窗口化调试模式仍
        // 返回 true（关掉调试窗口即退出，保留开发者的逃生手段）。
        return kIsWindowedMode
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let monitor = keyMonitor {
            NSEvent.removeMonitor(monitor)
            keyMonitor = nil
        }
        escProgressTimer?.invalidate()
        escProgressTimer = nil
    }

    // MARK: 菜单 / 键盘

    private func setupMenu() {
        if kIsWindowedMode {
            // 窗口化调试模式：保留可用的 Cmd+Q，方便开发/验证时随时退出。
            let mainMenu = NSMenu()
            let appMenuItem = NSMenuItem()
            mainMenu.addItem(appMenuItem)
            let appMenu = NSMenu()
            appMenu.addItem(withTitle: "退出 WorkTime Justin",
                             action: #selector(NSApplication.terminate(_:)),
                             keyEquivalent: "q")
            appMenuItem.submenu = appMenu
            NSApp.mainMenu = mainMenu
        } else {
            // kiosk 模式：空主菜单，去掉默认 Cmd+Q/H/W 的 keyEquivalent 绑定。
            NSApp.mainMenu = NSMenu()
        }
    }

    private func setupKeyMonitor() {
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .keyUp]) { [weak self] event in
            guard let self = self else { return event }
            if event.type == .keyDown {
                return self.handleKeyDown(event)
            }
            self.handleKeyUp(event)
            return event
        }
    }

    /// 返回 nil 表示吞掉该事件（不再继续分发）；返回原 event 表示放行。
    ///
    /// REQ-EXIT-01 拦截清单（app 层本地 NSEvent monitor）：
    ///   Cmd+W  关闭窗口          Cmd+H  隐藏 App
    ///   Cmd+M  最小化窗口        Cmd+`  同 App 内切换窗口
    ///   Cmd+Q  退出 App（仅 kiosk 生产模式拦；窗口化调试模式特意放行，见下）
    /// 这几个是幼儿最容易连键盘一起误触的组合键（字母键都在主键盘区、位置显眼），拦下后
    /// 直接吞掉事件，不进入系统默认处理，因此既不会真的退出/关闭/隐藏/最小化。
    /// W/H/M/` 无论 kiosk 还是窗口化调试模式都拦截——这样 QA/开发可以直接用
    /// `WTJ_WINDOWED=1` 冒烟验证 REQ-EXIT-01，不必每次都切到会接管整个屏幕、隐藏
    /// Dock/菜单栏的真 kiosk 模式去测试。唯独 Cmd+Q 在窗口化模式下放行，配合
    /// setupMenu() 里绑定给菜单项的 terminate(_:)，保留"开发时随时能退出调试窗口"
    /// 的手段（README 已文档化的行为）；kiosk 生产模式下 Cmd+Q 同样被拦。
    /// Esc 键（keyCode 53）本身不在这个清单里处理——它有自己独立的长按状态机（见下），
    /// 不论是否按住 Cmd/Option，keyCode 53 都优先进入该状态机，见下方分支。
    ///
    /// **诚实边界（REQ-DESK-04/05，详见 app/SECURITY.md）**：Cmd+Space（Spotlight）、
    /// Cmd+Tab（App 切换）、Cmd+Option+Esc（强制退出面板）等系统级全局快捷键，是在
    /// WindowServer / Carbon 全局热键层被处理的，事件根本不会送达任何 app 的
    /// NSEvent 本地/全局 monitor——本文件无论怎么写 handleKeyDown 都拦不到它们，这
    /// 不是本实现的疏漏，是普通（非辅助功能特权）app 的固有限制，不在这里假装能拦。
    /// Cmd+Option+Esc 弹出的强制退出面板由 setupKioskPresentation() 里的
    /// `.disableForceQuit` presentationOption 做 best-effort 抑制（系统级标志位，
    /// 不经过这里的按键判断，同样不保证 100% 生效；且仅 kiosk 模式才调用
    /// setupKioskPresentation()，窗口化调试模式不设这个标志位）。
    private func handleKeyDown(_ event: NSEvent) -> NSEvent? {
        if event.keyCode == 53 { // Esc（REQ-EXIT-02：Esc 本身不直接触发退出）
            // 口令模态弹出期间：放行 Esc 事件（return event 交回系统默认处理），不进入
            // 下面的长按计时逻辑。
            //
            // 关于"Esc 能否取消口令框"（P2-2，准确描述现状）：NSAlert 只会给英文字面量
            // "Cancel" 按钮自动绑定 Esc 的 keyEquivalent；本弹窗的取消按钮标题是中文
            // "取消"、未显式设 keyEquivalent，所以 **Esc 在模态里实际是"无操作"**——取消
            // 要靠鼠标点击"取消"按钮。这对安全无影响：Esc 既不会误触发退出，也不会卡住
            // 模态。若日后想要"Esc 一键取消"体验，需给取消按钮设 keyEquivalent="\u{1b}"，
            // 且**必须同时在此处过滤 event.isARepeat（重复事件返回 nil 吞掉，不 return
            // event）**——否则弹窗弹出瞬间物理 Esc 往往还被按住，键重复连发会在几十毫秒内
            // 立刻取消弹窗，家长根本来不及输口令。这条是实现 Esc 取消的前提，勿删此警示。
            if alertShowing { return event }
            // 平时与 Cmd+W/H/M/` 一致：返回 nil 吞掉事件，不交给系统默认处理。
            // 「转发给退出计时逻辑」= 上一行已同步调用 handleEscKeyDown()；
            // 「转发给 web 层」= 由 checkEscProgress -> notifyEscProgress 经
            // evaluateJavaScript 调用 window.wtjEscProgress(seconds) 完成。
            // 只有长按满 kEscHoldSeconds 秒 + NSAlert 口令校验通过，才会走到唯一的
            // NSApp.terminate 调用点（showExitPasswordPrompt 内）；单击/短按 Esc
            // 在这里只会推进/复位计时状态机，绝不会退出。
            handleEscKeyDown()
            return nil
        }
        if event.modifierFlags.contains(.command) {
            let chars = event.charactersIgnoringModifiers?.lowercased() ?? ""
            if chars == "q" {
                // 窗口化调试模式特意放行 Cmd+Q（见上方函数注释）；kiosk 模式吞掉。
                return kIsWindowedMode ? event : nil
            }
            if chars == "w" || chars == "h" || chars == "m" || chars == "`" {
                return nil // 吞掉 Cmd+W / Cmd+H / Cmd+M / Cmd+`（kiosk 与窗口化模式均拦）
            }
        }
        return event
    }

    private func handleKeyUp(_ event: NSEvent) {
        if event.keyCode == 53 { // Esc
            handleEscKeyUp()
        }
    }

    // MARK: Esc 长按退出（家长口令，REQ-EXIT-03）
    //
    // 本文件里调用 NSApp.terminate 的生产路径只有一处：下面 showExitPasswordPrompt()
    // 内、口令校验通过之后（另有一处仅在 kIsWindowedMode 调试模式下绑定给 Cmd+Q 菜单
    // 项的 terminate(_:) selector，属于开发者自用的调试退出，与 kiosk 生产路径无关）。
    // REQ-EXIT-04：孩子侧任务系统（web 层 app.js 的 WTJ_TASK 相关逻辑，任务超时自动
    // 收起 / 转移键盘触发的任务淡出）完全在 web 层内部完成，不通过 `shell`
    // WKScriptMessageHandler 消息通道上行，本文件也没有任何代码把"任务收起/淡出"接到
    // 这条 terminate 调用链上——原生退出与 web 侧任务状态是完全解耦的两套机制，任务收起
    // 不会、也不能触发应用退出。

    private func handleEscKeyDown() {
        if alertShowing { return }
        // macOS 长按期间会连续发送 keyDown（键重复），已在计时则忽略，不重置不累加。
        if escTiming { return }
        escTiming = true
        escStartDate = Date()
        escProgressTimer?.invalidate()
        escProgressTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
            self?.checkEscProgress(timer)
        }
    }

    private func handleEscKeyUp() {
        escTiming = false
        escStartDate = nil
        escProgressTimer?.invalidate()
        escProgressTimer = nil
        notifyEscProgress(0)
    }

    private func checkEscProgress(_ timer: Timer) {
        guard let start = escStartDate else {
            timer.invalidate()
            return
        }
        let elapsed = Date().timeIntervalSince(start)
        notifyEscProgress(elapsed)
        if elapsed >= kEscHoldSeconds {
            timer.invalidate()
            escProgressTimer = nil
            escTiming = false
            escStartDate = nil
            showExitPasswordPrompt()
        }
    }

    private func notifyEscProgress(_ seconds: TimeInterval) {
        webView?.evaluateJavaScript(
            "window.wtjEscProgress && window.wtjEscProgress(\(seconds));",
            completionHandler: nil
        )
    }

    /// 弹窗弹出前计时器已失效并清零（NSAlert.runModal 是同步阻塞调用，非并发 API）；
    /// 关闭弹窗后需重新长按 Esc 满 5 秒才会再次弹出。
    private func showExitPasswordPrompt() {
        alertShowing = true
        let alert = NSAlert()
        alert.messageText = "家长退出"
        alert.informativeText = "请输入退出口令"
        alert.addButton(withTitle: "确定")
        // 取消按钮标题为中文，NSAlert 不会自动给它绑定 Esc 的 keyEquivalent（只对英文
        // "Cancel" 字面量自动绑定），因此 Esc 在本模态里不触发取消——这是有意接受的现状，
        // 取消靠鼠标点击；详见 handleKeyDown 里 alertShowing 分支的 P2-2 说明。
        alert.addButton(withTitle: "取消")
        let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 220, height: 24))
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        alert.window.level = window.level // 确保弹窗层级不被 kiosk 窗口（.mainMenu + 1）遮挡
        let response = alert.runModal()
        alertShowing = false

        // resolveExitPasscode() 实时读 UserDefaults：优先用家长 --set-passcode 设置过
        // 的口令，否则回退占位口令 kExitPasswordPlaceholder（同时打一条 NSLog 提醒）。
        if response == .alertFirstButtonReturn, field.stringValue == resolveExitPasscode() {
            NSApp.terminate(nil)
            return
        }
        // 口令错误或取消：复位 web 层进度条（避免卡在 100%，P2-1），
        // 回到全屏内容并把 first responder 还给 webView（弹窗曾夺走焦点）。
        notifyEscProgress(0)
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(webView)
    }

    // MARK: 窗口

    private func setupWindow() {
        if kIsWindowedMode {
            let rect = NSRect(x: 0, y: 0, width: 1200, height: 800)
            let w = NSWindow(contentRect: rect,
                              styleMask: [.titled, .closable, .miniaturizable, .resizable],
                              backing: .buffered,
                              defer: false)
            w.title = "WorkTime Justin（窗口化调试）"
            w.center()
            window = w
        } else {
            let frame = NSScreen.main?.frame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
            // 必须用 KioskWindow（覆写 canBecomeKey/canBecomeMain），见类定义注释（P0-1）。
            let w = KioskWindow(contentRect: frame,
                                 styleMask: [.borderless],
                                 backing: .buffered,
                                 defer: false)
            w.level = NSWindow.Level(rawValue: NSWindow.Level.mainMenu.rawValue + 1)
            w.collectionBehavior = [.fullScreenPrimary]
            w.isOpaque = true
            w.hasShadow = false
            w.backgroundColor = NSColor.black
            w.setFrame(frame, display: true)
            window = w
        }
    }

    // MARK: WebView

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        // 该设置只影响 HTMLMediaElement（<audio>/<video>）的自动播放策略，对 Web Audio API
        // 无效；Web Audio 的解锁靠 web 层在用户手势里 AudioContext.resume()（见 app.js）。
        // 保留此设置是为后续卡片的 <audio> 标签播放预留（P2-6 注释修正）。
        config.mediaTypesRequiringUserActionForPlayback = []

        let contentController = WKUserContentController()
        let proxy = WeakScriptMessageHandler(target: self)
        contentController.add(proxy, name: "shell")
        config.userContentController = contentController

        let view = WKWebView(frame: window.contentLayoutRect, configuration: config)
        view.autoresizingMask = [.width, .height]
        view.navigationDelegate = self
        window.contentView = view
        webView = view

        guard let resourceURL = Bundle.main.resourceURL else {
            NSLog("WTJ: Bundle.main.resourceURL 为空，无法加载 web 内容")
            return
        }
        let webDir = resourceURL.appendingPathComponent("web")
        let indexURL = webDir.appendingPathComponent("index.html")
        webView.loadFileURL(indexURL, allowingReadAccessTo: webDir)
    }

    // MARK: kiosk 屏蔽（best-effort，REQ-DESK-04/05：不承诺 100% 生效）
    //
    // presentationOptions 是系统级"给 WindowServer 的建议标志位"，不是本 app 拦截按键
    // 那种确定性的事件消费；它们能显著提高干扰门槛（隐藏 Dock/菜单栏、抑制强制退出面板/
    // 注销关机/隐藏窗口/大部分 App 切换手势），但不构成对 Cmd+Space/Cmd+Tab 等系统级
    // 全局快捷键的保证屏蔽——这些快捷键的处理点在事件送达 app 之前，任何普通（非辅助功能
    // 特权）app 都拦不住。诚实边界与家长可选的补强方式见 app/SECURITY.md。
    private func setupKioskPresentation() {
        NSApp.presentationOptions = [.hideDock, .hideMenuBar, .disableProcessSwitching,
                                      .disableForceQuit, .disableSessionTermination, .disableHideApplication]
    }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.evaluateJavaScript("window.__shellReady = true;", completionHandler: nil)
        // 确保 DOM 能收到键盘事件（P0-1；local monitor 仍是兜底通道）。
        window.makeFirstResponder(webView)
    }

    // MARK: WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController,
                                didReceive message: WKScriptMessage) {
        NSLog("WTJ shell message: %@", String(describing: message.body))
    }
}

// MARK: - 入口

// 文件名为 main.swift，顶层语句即程序入口；不使用 @main / NSApplicationMain 属性。
//
// --set-passcode / WTJ_SET_PASSCODE 必须在创建 NSApplication 之前处理并 exit(0)：
// 这是家长一次性设置口令的命令行动作，命中时直接返回，不应该顺带把 kiosk 全屏界面打开。
handleSetPasscodeIfRequested()

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let appDelegate = AppDelegate()
app.delegate = appDelegate
app.run()
