//
//  main.swift
//  WorkTimeJustin — 极薄原生壳（WTJ-20260704-002）
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

import Cocoa
import WebKit

// MARK: - 常量

/// 家长退出占位口令。仅为本卡（最小可运行壳）演示用途，
/// 后续卡片将实现正式的口令管理（例如设置界面、哈希存储、可修改等）。
private let kExitPasswordPlaceholder = "worktime"

/// Esc 需要长按的秒数才会弹出退出口令框。
private let kEscHoldSeconds: TimeInterval = 5.0

/// 窗口化调试模式判定：环境变量 WTJ_WINDOWED=1 或启动参数 --windowed。
private let kIsWindowedMode: Bool = {
    if CommandLine.arguments.contains("--windowed") { return true }
    if ProcessInfo.processInfo.environment["WTJ_WINDOWED"] == "1" { return true }
    return false
}()

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
        return true
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
    private func handleKeyDown(_ event: NSEvent) -> NSEvent? {
        if event.keyCode == 53 { // Esc
            // 弹窗模态期间放行 Esc，允许其触发 NSAlert 的取消（P2-2）；
            // 字母键本就放行（家长需要在文本框里输入口令）。
            if alertShowing { return event }
            // 平时与 Cmd+Q/W/H 一致：返回 nil 吞掉事件，不交给系统默认处理。
            // 「转发给退出计时逻辑」= 上一行已同步调用 handleEscKeyDown()；
            // 「转发给 web 层」= 由 checkEscProgress -> notifyEscProgress 经
            // evaluateJavaScript 调用 window.wtjEscProgress(seconds) 完成。
            handleEscKeyDown()
            return nil
        }
        if !kIsWindowedMode, event.modifierFlags.contains(.command) {
            let chars = event.charactersIgnoringModifiers?.lowercased() ?? ""
            if chars == "q" || chars == "w" || chars == "h" {
                return nil // 吞掉 Cmd+Q / Cmd+W / Cmd+H
            }
        }
        return event
    }

    private func handleKeyUp(_ event: NSEvent) {
        if event.keyCode == 53 { // Esc
            handleEscKeyUp()
        }
    }

    // MARK: Esc 长按退出（家长口令占位实现）

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
        alert.addButton(withTitle: "取消")
        let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 220, height: 24))
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        alert.window.level = window.level // 确保弹窗层级不被 kiosk 窗口（.mainMenu + 1）遮挡
        let response = alert.runModal()
        alertShowing = false

        if response == .alertFirstButtonReturn, field.stringValue == kExitPasswordPlaceholder {
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

    // MARK: kiosk 屏蔽（best-effort）

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
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let appDelegate = AppDelegate()
app.delegate = appDelegate
app.run()
