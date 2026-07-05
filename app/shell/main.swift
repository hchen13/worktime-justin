//
//  main.swift
//  WorkTimeJustin — 极薄原生壳
//  基础壳：WTJ-20260704-002；家长退出/快捷键拦截/安全边界完整实现：WTJ-20260704-017
//  wtjres:// 自定义 scheme 资源加载层（修复 file:// 下音频 fetch() 被 CORS 拦截的
//  架构死穴）：WTJ-20260704-019
//  CGEventTap 系统级快捷键拦截（Cmd+Tab/Cmd+Space/Cmd+Option+Esc，需辅助功能授权，
//  no-silent-fallback）+ 全屏进入时序加固：WTJ-20260705-013（P0 真机返工卡）
//  隐藏家长菜单（长按 Cmd+Q 5 秒，取代 Esc 成为主入口）+ 每日使用时长额度/安静锁屏 +
//  语言/任务语音模式设置面板（web 层渲染，shell 经 UserDefaults 持有权威计时）：
//  WTJ-20260705-018（P0 家长控制卡）。Esc 长按口令退出（013/017）保留为兜底，不删除。
//
//  目标机：2014 MacBook Air（Intel x86_64，macOS Big Sur 11，4GB RAM，HD5000）
//  硬约束：
//   1) 禁用一切 Swift Concurrency（async/await/Task/actor）——Big Sur 缺 _Concurrency
//      回退库，编译能过但目标机启动即崩。全文件只用 Timer / 回调 / GCD 风格 API。
//      CGEventTap 的回调是 C 函数指针（`@convention(c)`），不是并发 API，符合约束。
//   2) API 限定 macOS 11.0 可用集合；更新的 API 一律 `if #available` 守卫并提供
//      11.0 路径（本文件未使用任何 11.0 之后新增的 API，故无需守卫分支；
//      `CGEvent.tapCreate`/`AXIsProcessTrusted`/`AXIsProcessTrustedWithOptions` 均为
//      远早于 11.0 就存在的 API，已用 arm64 + x86_64 双 target 交叉编译验证可编译、
//      不引入并发符号，见 013 卡交接记录）。
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
import ApplicationServices // AXIsProcessTrusted / AXIsProcessTrustedWithOptions（WTJ-20260705-013）

// MARK: - 常量

/// Esc 需要长按的秒数才会弹出退出口令框。
private let kEscHoldSeconds: TimeInterval = 5.0

// MARK: - 家长控制常量（WTJ-20260705-018）
//
// 验收标准 #1：家长入口主通道由 Esc 改为 Cmd+Q 长按（Esc 长按口令退出保留为兜底，见上方
// kEscHoldSeconds 与既有 handleEscKeyDown 状态机，本卡不删除、不改行为）。Cmd+Q 长按满
// kCmdQHoldSeconds 秒后弹出隐藏家长菜单（showParentMenu()），不再是"退出口令框"。

/// Cmd+Q 需要长按的秒数才会弹出隐藏家长菜单。与 kEscHoldSeconds 取同一数值（5 秒），
/// 两条长按状态机各自独立计时，互不干扰（一个是物理 Esc 键，一个是 Cmd+Q 组合键）。
private let kCmdQHoldSeconds: TimeInterval = 5.0

/// 每日允许使用时长默认值（分钟），验收标准 #3 明确要求默认 30 分钟。
private let kDailyLimitDefaultMinutes: Int = 30
/// 家长可调节额度的合理范围下限/上限（分钟）——防止家长误输入 0 或超大数值把 kiosk
/// 变成"永久锁死"或"形同虚设"。
private let kDailyLimitMinMinutes: Int = 5
private let kDailyLimitMaxMinutes: Int = 180

/// 使用时长/额度状态落盘用的 UserDefaults key（本机持久化，验收标准 #3）。
private let kDailyLimitMinutesDefaultsKey = "WTJDailyLimitMinutes"
private let kUsedSecondsTodayDefaultsKey = "WTJUsedSecondsToday"
private let kUsageDateStringDefaultsKey = "WTJUsageDateString"

/// 使用时长计时 tick 间隔（秒）。Timer 累计当日使用秒数，按本地日期跨日重置
/// （验收标准 #5：每日额度按系统本地日期计算）。
private let kUsageTickInterval: TimeInterval = 1.0

/// 计算"今天"的本地日期字符串（yyyy-MM-dd，固定 en_US_POSIX locale + 当前系统时区）。
/// 用固定 locale 而非系统 locale，避免不同语言环境下 DateFormatter 对 "yyyy-MM-dd" 这类
/// 纯数字模板产生的极小概率怪异行为（POSIX locale 是 Apple 文档推荐的"格式化用固定模板"
/// 惯例）；时区用 TimeZone.current（家长实际所在时区），这样"跨日"判定贴合真实生活作息，
/// 不是 UTC 日期。
private func wtjCurrentLocalDateString() -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone.current
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: Date())
}

/// 窗口化调试模式判定：环境变量 WTJ_WINDOWED=1 或启动参数 --windowed。
private let kIsWindowedMode: Bool = {
    if CommandLine.arguments.contains("--windowed") { return true }
    if ProcessInfo.processInfo.environment["WTJ_WINDOWED"] == "1" { return true }
    return false
}()

/// 自定义资源加载 scheme（WTJ-20260704-019）。页面与其全部相对路径子资源（css/js/img/
/// audio/json）统一经 `<scheme>://<host>/...` 加载，令二者视为同源，从而让 `fetch()`/XHR
/// 不再触发 file:// null origin 下的 CORS 拦截。详见 `WTJResourceSchemeHandler` 类注释与
/// `app/web/audio/AUDIO-API.md` §6.3。窗口化调试模式与 kiosk 生产模式共用同一 scheme
/// （不因模式不同而切换加载方式），避免两套加载路径分叉出不同的 bug 面。
private let kResourceScheme = "wtjres"
private let kResourceSchemeHost = "app"

// MARK: - CGEventTap 系统级快捷键拦截常量（WTJ-20260705-013）
//
// 背景：REQ-DESK-04/05 与 SECURITY.md 第 2 节记录的诚实边界——Cmd+Space/Cmd+Tab/
// Cmd+Option+Esc 是在 WindowServer/Carbon 全局热键层处理的，本地/全局 NSEvent monitor
// （见 handleKeyDown 顶部注释）架构上拦不到。CGEventTap（`.cgSessionEventTap` +
// `.headInsertEventTap`）是绕开这层限制的标准 kiosk 手法：在事件送达 WindowServer 自身
// 的全局热键处理逻辑*之前*、以会话级 tap 的身份先拿到事件并可选择吞掉。代价是必须获得
// 一次性辅助功能（Accessibility）系统级授权，未授权时 `CGEvent.tapCreate` 会返回 nil
// （这是本文件判断"是否已获得实际生效的拦截能力"的唯一真实信号，见
// `attemptEnableSystemHotkeyTap()`；不是仅凭 `AXIsProcessTrusted()` 的返回值就假设一定
// 能创建成功）。

/// 键盘扫描码（virtual keyCode，与 HID/AppKit 通用，和文件里已使用的 `event.keyCode == 53`
/// 是同一套编码）。Tab/Space 在 main.swift 其余位置未定义过常量，这里首次定义，供
/// CGEventTap 回调按数值比较使用（回调是无捕获的顶层函数，不适合引用局部变量，直接用
/// 具名的文件作用域常量）。
private let kKeyCodeTab: Int64 = 48
private let kKeyCodeSpace: Int64 = 49
private let kKeyCodeEscape: Int64 = 53 // 与 handleKeyDown 里的 53 是同一个键

/// 首次启动、且辅助功能未授权时，是否已经用 NSAlert 提示过家长——只提示一次，不在每次
/// kiosk 启动都弹一次打断家长（"首启提示"，13 卡需求原文）；此后每次仍未授权只在
/// NSLog/Console.app 里提醒（`resolveAndLogAccessibilityTrust()`），不再弹窗打断。
private let kAXPromptShownDefaultsKey = "WTJAccessibilityPromptShown"

/// 未获得辅助功能授权时，重试创建 CGEventTap 的轮询间隔——家长可能是在 App 已经跑起来
/// 之后才去系统偏好设置里勾选授权，这种情况下不要求家长必须重启 App 才能生效。
private let kAXTrustRetryInterval: TimeInterval = 5.0

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

// MARK: - wtjres:// 资源 scheme handler（WTJ-20260704-019）
//
// 背景（016 交接时列的架构死穴，019 卡明确要解决）：002 卡最初用
// WKWebView.loadFileURL(_:allowingReadAccessTo:) 以 file:// 方案加载 web/ 目录。file://
// 加载出的页面 origin 是 "null"，WebKit 对 file:// 资源的 fetch()/XHR 近乎必然按 CORS
// 规则拦截失败——loadFileURL(allowingReadAccessTo:) 只放开标签式子资源（<img>/<audio>/
// <script> 等）的读取，并不解除 fetch/XHR 的跨源限制。app/web/audio.js 的播放链路
// （loadArrayBuffer -> window.fetch(path) -> decodeAudioData）走的正是 fetch()，因此在
// file:// 运行时下即使真实 .m4a 素材到位也放不出声音（详见 app/web/audio/AUDIO-API.md
// §6.3，该节现已随本次改动更新为"已解决"）。
//
// 解决方案：实现 WKURLSchemeHandler，让页面改用自定义 scheme（kResourceScheme，即
// "wtjres"）加载。同一 scheme + 同一 host（kResourceSchemeHost，即 "app"）视为同源，
// 页面内全部相对路径资源请求（css/js/img/audio/json）都会被浏览器解析成
// "wtjres://app/..." 请求——与加载页面本身同源，fetch()/XHR 因此不再触发 CORS 拦截。
//
// API 可用性：WKURLSchemeHandler / WKURLSchemeTask 是 macOS 10.13+ API，目标机 Big Sur 11
// 满足最低版本要求，本类全文无需 `if #available` 守卫。
//
// Swift Concurrency 硬约束：本类完全同步实现——webView(_:start:) 内直接用
// Data(contentsOf:) 同步读取本地文件（web 资源体积小，同步读取足够快，不会造成明显可感知的
// 卡顿），随即同步调用 urlSchemeTask.didReceive(response) / didReceive(data) / didFinish()，
// 全程不使用 DispatchQueue.global 等异步派发，不使用 async/await/Task/actor/@MainActor——
// 回调在 WebKit 调用 webView(_:start:) 的同一线程（主线程）同步完成并返回，函数返回之时该
// 资源请求已经结束。
final class WTJResourceSchemeHandler: NSObject, WKURLSchemeHandler {

    /// 已解析符号链接、标准化过的 web 资源根目录（通常是 Bundle.main.resourceURL/web）。
    /// 任何请求路径标准化 + 解析符号链接之后，必须仍落在这个目录之内（含目录本身），
    /// 否则一律视为路径遍历尝试、拒绝服务——这是本 handler 唯一的安全边界，见
    /// `webView(_:start:)` 与 `isPath(_:containedIn:)`。
    private let rootURL: URL

    init(rootURL: URL) {
        // 根目录本身也做一次同样的标准化 + 符号链接解析，确保后续用同一套规则处理过的两个
        // 路径做前缀比较——如果只标准化请求路径、不标准化根目录，根目录自身若含未展开的
        // 符号链接（例如 /var 在 macOS 上是指向 /private/var 的符号链接），会让本来合法的
        // 请求被误判为"越界"（假阳性拒绝服务），或者反过来放过真正越界的请求（假阴性）。
        self.rootURL = rootURL.resolvingSymlinksInPath().standardizedFileURL
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let requestURL = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(WTJResourceSchemeHandler.makeError(code: 400, message: "请求缺少 URL"))
            return
        }

        // 空路径 / 根路径一律映射到 index.html。当前运行时里只有 setupWebView() 发起的
        // 首次导航（"wtjres://app/index.html"）会显式带上 "/index.html"；这个兜底分支是
        // 防御性的，覆盖"host 后面完全不带 path"这种理论上可能出现、但当前代码不会主动
        // 构造的请求形态。
        var requestPath = requestURL.path
        if requestPath.isEmpty || requestPath == "/" {
            requestPath = "/index.html"
        }

        // 防路径遍历（安全边界，P0）：分两步标准化再比较前缀。
        //   1) standardizedFileURL 按字符串规则折叠 "." / ".." 路径段；
        //   2) resolvingSymlinksInPath 展开符号链接（只在目标真实存在时生效）。
        // 两步缺一都可能被绕过（例如只做第 1 步，攻击者可以用一个指向 bundle 外的符号链接
        // 绕过；只做第 2 步，还没展开符号链接前的 ".." 段可能已经让路径在字符串层面就跳出了
        // rootURL 前缀判断的比较对象）。
        let relativePath = String(requestPath.dropFirst()) // 去掉开头的 "/"
        let candidateURL = rootURL.appendingPathComponent(relativePath).standardizedFileURL
        let resolvedCandidateURL = candidateURL.resolvingSymlinksInPath()

        guard WTJResourceSchemeHandler.isPath(resolvedCandidateURL, containedIn: rootURL) else {
            NSLog("WTJ: wtjres:// 请求被拒绝（越界路径遍历尝试）：%@", requestURL.absoluteString)
            urlSchemeTask.didFailWithError(WTJResourceSchemeHandler.makeError(code: 403, message: "路径越界"))
            return
        }

        var isDirectory: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: resolvedCandidateURL.path, isDirectory: &isDirectory)
        guard exists, !isDirectory.boolValue else {
            // 文件不存在或是目录（本 handler 不做目录索引）：对应 HTTP 404 语义。
            urlSchemeTask.didFailWithError(WTJResourceSchemeHandler.makeError(code: 404, message: "资源不存在: \(requestPath)"))
            return
        }

        do {
            let data = try Data(contentsOf: resolvedCandidateURL)
            let mimeType = WTJResourceSchemeHandler.mimeType(forPathExtension: resolvedCandidateURL.pathExtension)
            let headers = ["Content-Type": mimeType, "Content-Length": String(data.count)]
            guard let response = HTTPURLResponse(url: requestURL, statusCode: 200,
                                                  httpVersion: "HTTP/1.1", headerFields: headers) else {
                urlSchemeTask.didFailWithError(WTJResourceSchemeHandler.makeError(code: 500, message: "无法构造响应"))
                return
            }
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            urlSchemeTask.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // 本实现全同步：webView(_:start:) 在返回之前已经对该任务调用过
        // didFinish()/didFailWithError() 完成了请求，不存在"仍在进行中、需要被取消"的异步
        // 工作。此处留空即可（无状态可清理）。
    }

    /// 校验 `path` 是否仍在 `root` 目录之内（含 root 本身），防止 ".." 或符号链接跳出
    /// web 资源根目录、读到 bundle 外的任意文件。
    private static func isPath(_ path: URL, containedIn root: URL) -> Bool {
        let pathString = path.path
        let rootString = root.path
        return pathString == rootString || pathString.hasPrefix(rootString + "/")
    }

    private static func makeError(code: Int, message: String) -> NSError {
        return NSError(domain: "WTJResourceSchemeHandler", code: code,
                        userInfo: [NSLocalizedDescriptionKey: message])
    }

    /// 按扩展名返回 MIME type；未覆盖到的扩展名一律回退 `application/octet-stream`。
    private static func mimeType(forPathExtension pathExtension: String) -> String {
        switch pathExtension.lowercased() {
        case "html", "htm": return "text/html"
        case "js": return "application/javascript"
        case "css": return "text/css"
        case "json": return "application/json"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "svg": return "image/svg+xml"
        case "m4a", "aac": return "audio/mp4"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        case "md", "txt": return "text/plain"
        default: return "application/octet-stream"
        }
    }
}

// MARK: - CGEventTap C 回调（WTJ-20260705-013）
//
// `CGEventTapCallBack` 的类型是 `@convention(c) (CGEventTapProxy, CGEventType, CGEvent,
// UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>?`——必须是不捕获任何上下文的顶层函数
// （Swift 允许把无捕获的顶层/静态函数隐式转换成 C 函数指针，闭包若捕获了变量则不行）。
// 因此这里不能写成 AppDelegate 的实例方法或闭包，只能是这样一个自由函数，通过
// `userInfo`/`refcon` 这个不透明指针把 AppDelegate 实例传进来（对应
// `attemptEnableSystemHotkeyTap()` 里 `Unmanaged.passUnretained(self).toOpaque()` 那次
// 转换）；真正的按键判断逻辑都委托给 `AppDelegate.handleTappedSystemEvent`，本函数只做
// 指针解包与转发，保持这层"C ABI 边界"尽量薄。
//
// 内存所有权（fable 评审修正）：CGEventTap 回调对"放行原事件"这个动作的正确返回是
// `Unmanaged.passUnretained(event)`——系统把 event 以 +0（不转移所有权）传进回调，回调
// 透传时也不应改变其引用计数。之前误用 `passRetained` 会给每个放行的 keyDown 多加一个
// 永不释放的 retain，在 4GB 旧机、长时间打字的 kiosk 上是慢性内存泄漏。只有回调*自己新建*
// 一个 CGEvent（本实现没有这种情况）时才用 `passRetained` 把新建对象的所有权交还系统。
private func wtjSystemHotkeyTapCallback(
    proxy: CGEventTapProxy,
    type: CGEventType,
    event: CGEvent,
    refcon: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    guard let refcon = refcon else { return Unmanaged.passUnretained(event) }
    let appDelegate = Unmanaged<AppDelegate>.fromOpaque(refcon).takeUnretainedValue()
    return appDelegate.handleTappedSystemEvent(proxy: proxy, type: type, event: event)
}

// MARK: - AppDelegate

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var keyMonitor: Any?

    /// wtjres:// scheme handler 的强引用（WTJ-20260704-019）。即使
    /// WKWebViewConfiguration.setURLSchemeHandler(_:forURLScheme:) 本身是否强持有 handler
    /// 这件事在文档里未被显式保证，这里显式再持有一份，确保 handler 不会在 AppDelegate 存活
    /// 期间被提前释放（对照 WeakScriptMessageHandler 上方注释：那里是反过来、为了*避免*强引用
    /// 造成循环；这里是单向持有 handler、handler 不持有 AppDelegate/webView，不构成循环）。
    private var resourceSchemeHandler: WTJResourceSchemeHandler!

    // Esc 长按状态
    private var escTiming = false
    private var escStartDate: Date?
    private var escProgressTimer: Timer?
    private var alertShowing = false

    // MARK: 家长控制状态（WTJ-20260705-018）

    // Cmd+Q 长按状态（家长菜单主入口，独立于上面的 Esc 状态机）。
    private var cmdQTiming = false
    private var cmdQStartDate: Date?
    private var cmdQProgressTimer: Timer?
    /// 家长菜单（NSMenu）展示期间为 true：与 alertShowing 同理，抑制重复触发/新的长按计时。
    private var parentMenuShowing = false

    /// 每日使用时长额度 tick 计时器（1Hz，累计当日已用秒数，见 kUsageTickInterval）。
    private var usageTickTimer: Timer?
    /// 当前生效的每日额度（分钟），来自 UserDefaults，默认 kDailyLimitDefaultMinutes。
    private var dailyLimitMinutes: Int = kDailyLimitDefaultMinutes
    /// 今日已使用秒数（本地日期口径，跨日归零）。
    private var usedSecondsToday: Int = 0
    /// usedSecondsToday 所属的本地日期字符串（yyyy-MM-dd）；与 wtjCurrentLocalDateString() 不
    /// 一致即视为"新的一天"，触发归零 + 解锁。
    private var usageDateString: String = ""
    /// 当前是否处于"额度耗尽安静锁屏"状态（验收标准 #5/#6）。
    private var isLockedOut = false

    // MARK: CGEventTap 系统级快捷键拦截状态（WTJ-20260705-013）

    /// CGEventTap 句柄；非 nil 表示 tap 已创建（不代表一定仍 enabled，可能被系统因超时
    /// 暂停，见 `handleTappedSystemEvent` 里的 `.tapDisabledByTimeout` 分支）。
    private var systemHotkeyTap: CFMachPort?
    /// tap 挂到 run loop 上用的 source；`applicationWillTerminate` 释放时需要一并移除。
    private var systemHotkeyRunLoopSource: CFRunLoopSource?
    /// 未获得辅助功能授权时的轮询重试计时器；一旦成功创建 tap 就失效并置 nil。
    private var axTrustRetryTimer: Timer?
    /// 当前这次运行期间，CGEventTap 是否已经实际创建成功（而不仅仅是"尝试过"）。
    /// `SECURITY.md`/日志文案根据这个值决定说"已启用"还是"未生效，回退层 2"。
    private var systemHotkeyTapActive = false

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
            // CGEventTap 系统级快捷键拦截（WTJ-20260705-013）：只在 kiosk 生产模式启用，
            // 窗口化调试模式刻意不启用——道理与 setupKioskPresentation() 一致（见其注释），
            // 调试时不应该让 Cmd+Tab/Cmd+Space 也变得拦不住，否则开发者没法方便地切出去看
            // 文档/查日志。
            setupSystemHotkeyBlocker()
        }
        setupKeyMonitor()

        // 每日使用时长额度（WTJ-20260705-018，验收标准 #3/#5）：无论 kiosk 生产模式还是
        // WTJ_WINDOWED 窗口化调试模式都启用——调试时也应能观察/验证额度耗尽锁屏行为，与
        // W/H/M/` 快捷键拦截"两种模式都拦"的既有惯例一致（见 handleKeyDown 顶部注释）。
        loadUsageStateFromDefaults()
        _ = refreshUsageStateForNewDayIfNeeded()
        startUsageTickTimer()

        // 全屏进入可靠性加固（层 3，WTJ-20260705-013）：顺序调整为"先 activate 进程，再让
        // 窗口成为 key + front，kiosk 模式下最后再 orderFrontRegardless 兜底一次"。
        // 之前的顺序是 makeKeyAndOrderFront 在前、activate 在后；查阅 AppKit 行为，
        // `NSApp.activate` 负责把*进程*带到前台（激活菜单栏/输入焦点归属），
        // `makeKeyAndOrderFront` 负责把*这个窗口*设为 key + 排到最前——如果进程还没被
        // activate，"这个窗口"在系统眼里可能还不是"当前活跃 App 的窗口"，排序结果在不同
        // macOS 版本上可能不一致（这正是 Ethan 在 Big Sur 上可能观察到"偶发没进全屏/菜单栏
        // 短暂露出"的候选原因之一——构建机 macOS 26 上顺序颠倒不容易复现问题，不代表 Big
        // Sur 11 上时序行为完全一致，这也是本节改动**仍需真机验证**、不是"改了就一定解决"
        // 的原因）。调整后先 activate、再 makeKeyAndOrderFront，kiosk 模式再加一次
        // orderFrontRegardless（忽略"当前是否已是 front"这一判断，无条件把窗口排到最前，
        // 兜住"某些系统对话框/前一个进程的残留窗口在 activate 之后仍短暂盖在上面"这种情况）。
        // webView(_:didFinish:) 里 didFinish 后还会再交一次 first responder，覆盖"WKWebView
        // 首帧渲染完成时机早于/晚于这里的窗口排序"这一时序分支。
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        if !kIsWindowedMode {
            window.orderFrontRegardless()
        }
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
        cmdQProgressTimer?.invalidate()
        cmdQProgressTimer = nil
        usageTickTimer?.invalidate()
        usageTickTimer = nil
        tearDownSystemHotkeyBlocker()
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
        // WTJ-20260705-018：新增 .flagsChanged——Cmd+Q 长按状态机要求 Cmd 与 Q 全程同时按住，
        // 若计时期间 Cmd 先于 Q 被释放，keyUp 只会在 Q 真正抬起时触发，中途不会收到通知；
        // .flagsChanged 是 AppKit 里修饰键按下/释放的独立事件通道，用它监测"Cmd 提前释放"这一
        // 分支并及时复位计时（见 handleFlagsChanged）。.keyDown/.keyUp 行为不变。
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .keyUp, .flagsChanged]) { [weak self] event in
            guard let self = self else { return event }
            switch event.type {
            case .keyDown:
                return self.handleKeyDown(event)
            case .keyUp:
                self.handleKeyUp(event)
                return event
            case .flagsChanged:
                self.handleFlagsChanged(event)
                return event
            default:
                return event
            }
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
                // WTJ-20260705-018：Cmd+Q 从 013 的"直接吞掉"改为"长按 5 秒 -> 弹隐藏家长菜单"
                // 状态机（验收标准 #1），与下方 handleCmdQKeyDown/handleKeyUp/handleFlagsChanged
                // 三处配合。窗口化调试模式特意放行 Cmd+Q（不进入长按状态机，直接交给系统默认
                // 处理——配合 setupMenu() 里绑定给菜单项的 terminate(_:)，保留"开发时随时能退出
                // 调试窗口"的既有手段，与 013 行为一致，未受本卡改动）。
                if kIsWindowedMode {
                    return event
                }
                handleCmdQKeyDown()
                return nil
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
            return
        }
        // kIsWindowedMode 下 Cmd+Q 从未进入长按状态机（见 handleKeyDown），cmdQTiming 恒为
        // false，这里的调用是安全的 no-op（不会误触发 evaluateJavaScript 刷屏）；仍加判断只是
        // 避免窗口化调试模式下对每次 Q 键松开都做一次无意义的字符串比较。
        if !kIsWindowedMode {
            let chars = event.charactersIgnoringModifiers?.lowercased() ?? ""
            if chars == "q" {
                handleCmdQKeyUp()
            }
        }
    }

    /// Cmd 修饰键状态变化（按下/释放）时触发，与 keyDown/keyUp 是独立的事件通道（见
    /// setupKeyMonitor() 顶部注释）。Cmd+Q 长按判定要求 Cmd 与 Q 全程同时按住——若计时期间
    /// Cmd 先于 Q 被释放（物理上很常见：先松大拇指、Q 手指还没抬），必须在这里及时复位，
    /// 否则残留的 keyDown 重复事件不会再来、计时器会一直数到 5 秒后弹出菜单，但家长此刻已经
    /// 松开了 Cmd，体感上是"没有继续长按却仍然弹出了菜单"的错觉/时序 bug。
    private func handleFlagsChanged(_ event: NSEvent) {
        if cmdQTiming && !event.modifierFlags.contains(.command) {
            handleCmdQKeyUp()
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

    // MARK: Cmd+Q 长按 -> 隐藏家长菜单（WTJ-20260705-018，验收标准 #1/#2）
    //
    // 与上面的 Esc 长按状态机结构对称（handleEscKeyDown/handleEscKeyUp/checkEscProgress/
    // notifyEscProgress），但完全独立的一套状态（cmdQTiming/cmdQStartDate/cmdQProgressTimer），
    // 驱动的是家长菜单（showParentMenu()，NSMenu），不是退出口令框；进度条通知走独立的
    // web 钩子 window.wtjParentGateProgress（而非复用 wtjEscProgress，避免两条长按状态机共用
    // 同一进度条 DOM/回调时相互踩踏——web 层 app.js/parent-controls.js 各自订阅、各自的进度条
    // 元素，见 app/web/parent-controls.js）。

    private func handleCmdQKeyDown() {
        if parentMenuShowing || alertShowing { return }
        // 长按期间 macOS 键盘重复会连续发送 keyDown，已在计时则忽略（与 handleEscKeyDown 同）。
        if cmdQTiming { return }
        cmdQTiming = true
        cmdQStartDate = Date()
        cmdQProgressTimer?.invalidate()
        cmdQProgressTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
            self?.checkCmdQProgress(timer)
        }
    }

    private func handleCmdQKeyUp() {
        cmdQTiming = false
        cmdQStartDate = nil
        cmdQProgressTimer?.invalidate()
        cmdQProgressTimer = nil
        notifyCmdQProgress(0)
    }

    private func checkCmdQProgress(_ timer: Timer) {
        guard let start = cmdQStartDate else {
            timer.invalidate()
            return
        }
        let elapsed = Date().timeIntervalSince(start)
        notifyCmdQProgress(elapsed)
        if elapsed >= kCmdQHoldSeconds {
            timer.invalidate()
            cmdQProgressTimer = nil
            cmdQTiming = false
            cmdQStartDate = nil
            notifyCmdQProgress(0)
            showParentMenu()
        }
    }

    private func notifyCmdQProgress(_ seconds: TimeInterval) {
        webView?.evaluateJavaScript(
            "window.wtjParentGateProgress && window.wtjParentGateProgress(\(seconds));",
            completionHandler: nil
        )
    }

    /// 弹出隐藏家长菜单（原生 NSMenu——不依赖 web 层渲染，即使额度耗尽安静锁屏、web 内容被
    /// isInputSuspended() 冻结交互，本菜单仍能弹出，满足验收标准 #6"锁屏状态下仍可 Cmd+Q
    /// 长按打开家长菜单"）。menu.popUp(...) 与 alert.runModal() 一样是同步阻塞调用（有自己的
    /// 事件跟踪循环），不涉及 Swift Concurrency。
    private func showParentMenu() {
        parentMenuShowing = true

        let menu = NSMenu(title: "家长菜单")
        menu.autoenablesItems = false

        let exitItem = NSMenuItem(title: "退出 WorkTime Justin", action: #selector(parentMenuExit), keyEquivalent: "")
        exitItem.target = self
        menu.addItem(exitItem)

        let settingsItem = NSMenuItem(title: "设置…", action: #selector(parentMenuOpenSettings), keyEquivalent: "")
        settingsItem.target = self
        menu.addItem(settingsItem)

        menu.addItem(NSMenuItem.separator())

        let resetTitle = "重置今日使用时长（当前已用 \(usedSecondsToday / 60) 分钟 / 限额 \(dailyLimitMinutes) 分钟）"
        let resetItem = NSMenuItem(title: resetTitle, action: #selector(parentMenuResetUsage), keyEquivalent: "")
        resetItem.target = self
        menu.addItem(resetItem)

        // 弹出位置：内容视图（webView）的中心点，用视图本地坐标系（而非屏幕坐标），是
        // NSMenu.popUp(positioning:at:in:) 文档化的标准用法——borderless 全屏 kiosk 窗口没有
        // 菜单栏/固定锚点，屏幕中心保证家长无论此刻 web 内容渲染到哪都能看到菜单弹出。
        let view = window.contentView
        let location = NSPoint(x: (view?.bounds.midX) ?? 0, y: (view?.bounds.midY) ?? 0)
        menu.popUp(positioning: nil, at: location, in: view)

        parentMenuShowing = false
    }

    /// 家长菜单「退出」：与 handleEscKeyDown 那条"长按 Esc 满 5 秒 + 输入口令"的退出路径是
    /// 两条并存、互不替代的合法退出通道——这一条**不再要求输入口令**（验收标准 #2 原文：
    /// "点「退出」直接退出 app,不再要求输入口令"）。长按 Cmd+Q 满 5 秒这个物理动作本身已经是
    /// 对"家长意图"的确认，口令是 Esc 通道刻意保留的兜底强度，二者并存不冲突。
    @objc private func parentMenuExit() {
        NSApp.terminate(nil)
    }

    /// 家长菜单「设置…」：设置面板本身用 web 层渲染（更灵活的表单 UI，见
    /// app/web/parent-controls.js 的 showSettingsPanel()），这里只负责把当前权威状态
    /// （额度/已用/是否锁定）经 evaluateJavaScript 推给 web 并触发它显示面板。
    @objc private func parentMenuOpenSettings() {
        notifySettingsPanelOpen()
    }

    /// 家长菜单「重置今日使用时长」：验收标准 #6 的 reset 今日额度，菜单里可直接一键完成，
    /// 不需要先进设置面板（安静锁屏状态下家长最常见的诉求就是"立刻解锁"，菜单直达更快）。
    @objc private func parentMenuResetUsage() {
        resetUsageToday()
    }

    // MARK: 每日使用时长额度 / 安静锁屏（WTJ-20260705-018，验收标准 #3/#5/#6）
    //
    // 权威状态完全由 shell 持有（UserDefaults 持久化），web 层只是"被通知的展示层"——
    // web 从不自行判断是否锁定，只响应 window.wtjSetLockout(locked, remainingSeconds) /
    // window.wtjApplyShellState(json) 这两个 shell 下发的调用（见 app/web/parent-controls.js）。
    // 这样即使 web 页面被家长/开发者用浏览器 devtools 之类手段篡改，锁定判定本身不受影响
    // （web 侧最多是"看起来没锁"，但 shell 仍会在下一次 tick/menu 操作时以权威状态覆盖它）。

    /// 每日额度合法范围裁剪（kDailyLimitMinMinutes ~ kDailyLimitMaxMinutes）。
    private func clampDailyLimit(_ minutes: Int) -> Int {
        return max(kDailyLimitMinMinutes, min(kDailyLimitMaxMinutes, minutes))
    }

    /// 启动期从 UserDefaults 读取额度/已用秒数/所属日期；首次启动（无存档）则写一次默认值
    /// 落盘（家长/QA 可用 `defaults read com.worktime.justin` 核实当前生效值）。
    private func loadUsageStateFromDefaults() {
        let d = UserDefaults.standard
        let hasStoredLimit = d.object(forKey: kDailyLimitMinutesDefaultsKey) != nil
        let storedLimit = d.integer(forKey: kDailyLimitMinutesDefaultsKey)
        dailyLimitMinutes = hasStoredLimit ? clampDailyLimit(storedLimit) : kDailyLimitDefaultMinutes
        usedSecondsToday = max(0, d.integer(forKey: kUsedSecondsTodayDefaultsKey))
        usageDateString = d.string(forKey: kUsageDateStringDefaultsKey) ?? wtjCurrentLocalDateString()
        isLockedOut = usedSecondsToday >= dailyLimitMinutes * 60
        if !hasStoredLimit {
            persistUsageState()
        }
    }

    private func persistUsageState() {
        let d = UserDefaults.standard
        d.set(dailyLimitMinutes, forKey: kDailyLimitMinutesDefaultsKey)
        d.set(usedSecondsToday, forKey: kUsedSecondsTodayDefaultsKey)
        d.set(usageDateString, forKey: kUsageDateStringDefaultsKey)
    }

    /// 跨日检测（验收标准 #5："每日额度按系统本地日期计算"）：本地日期与存档不同即视为新的
    /// 一天——归零已用秒数、若此前处于锁定则解锁并通知 web。返回 true 表示确实发生了跨日
    /// （调用方可据此决定是否需要额外同步一次 web 状态）。
    @discardableResult
    private func refreshUsageStateForNewDayIfNeeded() -> Bool {
        let today = wtjCurrentLocalDateString()
        guard usageDateString != today else { return false }
        usageDateString = today
        usedSecondsToday = 0
        let wasLocked = isLockedOut
        isLockedOut = false
        persistUsageState()
        if wasLocked {
            notifyLockout(false)
        }
        NSLog("WTJ: 检测到本地日期变更（%@），今日使用时长已归零%@。", today, wasLocked ? "并自动解锁" : "")
        return true
    }

    private func startUsageTickTimer() {
        usageTickTimer?.invalidate()
        usageTickTimer = Timer.scheduledTimer(withTimeInterval: kUsageTickInterval, repeats: true) { [weak self] _ in
            self?.tickUsage()
        }
    }

    private func tickUsage() {
        let dayChanged = refreshUsageStateForNewDayIfNeeded()
        guard !isLockedOut else { return }
        usedSecondsToday += Int(kUsageTickInterval)
        if usedSecondsToday >= dailyLimitMinutes * 60 {
            enterLockout()
            return
        }
        persistUsageState()
        // 平时不需要每秒都 evaluateJavaScript 推送状态（web 层不展示倒计时 UI，避免在 4GB
        // 旧机上无意义地每秒唤醒 JS 引擎）；仅在刚发生跨日归零时补一次同步，确保 web 侧持有的
        // "已用/锁定"展示（若设置面板恰好开着）不会因为没收到 wtjSetLockout(false) 之外的字段
        // 更新而显得过期。
        if dayChanged {
            notifyShellStateToWeb()
        }
    }

    private func enterLockout() {
        guard !isLockedOut else { return }
        isLockedOut = true
        persistUsageState()
        notifyLockout(true)
        NSLog("WTJ: 今日使用时长额度已用完（限额 %d 分钟），已进入安静锁屏。", dailyLimitMinutes)
    }

    /// 家长菜单/设置面板触发的"立即重置今日额度"：归零已用秒数、若处于锁定则解锁。
    private func resetUsageToday() {
        usedSecondsToday = 0
        let wasLocked = isLockedOut
        isLockedOut = false
        persistUsageState()
        if wasLocked {
            notifyLockout(false)
        } else {
            notifyShellStateToWeb()
        }
        NSLog("WTJ: 家长已手动重置今日使用时长。")
    }

    private func remainingSecondsToday() -> Int {
        return max(0, dailyLimitMinutes * 60 - usedSecondsToday)
    }

    /// 通知 web 层锁定状态变化（进入/解除安静锁屏）。web 层 parent-controls.js 据此显示/隐藏
    /// 全屏锁屏叠层，并把 isInputSuspended() 置为 true/false（keyboard.js/pointer.js 据此
    /// 停止触发游戏奖励/音效，验收标准 #5）。
    private func notifyLockout(_ locked: Bool) {
        webView?.evaluateJavaScript(
            "window.wtjSetLockout && window.wtjSetLockout(\(locked ? "true" : "false"), \(remainingSecondsToday()));",
            completionHandler: nil
        )
    }

    /// 把当前权威状态整体推给 web（初次加载 hydrate、设置变更后的确认回显等场景）。
    private func notifyShellStateToWeb() {
        let json = buildShellStateJSON()
        webView?.evaluateJavaScript(
            "window.wtjApplyShellState && window.wtjApplyShellState(\(json));",
            completionHandler: nil
        )
    }

    /// 打开设置面板：与 notifyShellStateToWeb 内容相同，但调用的是 wtjShowSettingsPanel
    /// （会主动弹出/显示面板 DOM），而不是静默同步用的 wtjApplyShellState（不应该每次锁定状态
    /// tick 都意外弹出设置面板）。两者字段格式一致，web 层可共用同一份解析逻辑。
    private func notifySettingsPanelOpen() {
        let json = buildShellStateJSON()
        webView?.evaluateJavaScript(
            "window.wtjShowSettingsPanel && window.wtjShowSettingsPanel(\(json));",
            completionHandler: nil
        )
    }

    /// 构造推给 web 的状态 JSON 字面量。字段全部是数值/布尔，手工拼接足够安全，无需 JSONSerialization
    /// （没有字符串字段，不存在转义/注入问题）。
    private func buildShellStateJSON() -> String {
        return "{\"dailyLimitMinutes\":\(dailyLimitMinutes),\"usedSecondsToday\":\(usedSecondsToday)," +
            "\"remainingSecondsToday\":\(remainingSecondsToday()),\"locked\":\(isLockedOut ? "true" : "false")," +
            "\"dailyLimitMinMinutes\":\(kDailyLimitMinMinutes),\"dailyLimitMaxMinutes\":\(kDailyLimitMaxMinutes)}"
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
            // collectionBehavior 修正（层 3，WTJ-20260705-013）：原先是 `.fullScreenPrimary`，
            // 但那个标志位语义是"这个窗口可以参与系统原生全屏空间（NSWindow.toggleFullScreen
            // 那一套、配合 titled 窗口右上角的绿色按钮）"——本窗口从来不调用
            // `toggleFullScreen`，是纯手工用 borderless + 屏幕尺寸 frame + 高 window level
            // 模拟出来的"伪全屏"，`.fullScreenPrimary` 对这种窗口大概率是无效标志位，也可能是
            // 多余的干扰项（不同 macOS 版本对"borderless 窗口挂 fullScreenPrimary"的处理是否
            // 一致未经验证，是"偶发没进全屏/层级异常"的候选原因之一）。改为
            // `[.canJoinAllSpaces, .stationary]`：`.canJoinAllSpaces` 让这个窗口在任何
            // Space 切换后依然可见（不会被摁在原来那个 Space 里）；`.stationary` 让它在
            // Mission Control / Exposé 触发时不参与窗口重排动画、保持原地——这两个标志位才是
            // "伪全屏、恒驻顶层"这个真实架构需要的语义，`.fullScreenPrimary` 不是。
            w.collectionBehavior = [.canJoinAllSpaces, .stationary]
            w.isOpaque = true
            w.hasShadow = false
            w.backgroundColor = NSColor.black
            w.setFrame(frame, display: true)
            window = w
        }
    }

    // MARK: WebView

    private func setupWebView() {
        guard let resourceURL = Bundle.main.resourceURL else {
            NSLog("WTJ: Bundle.main.resourceURL 为空，无法加载 web 内容")
            return
        }
        let webDir = resourceURL.appendingPathComponent("web")

        let config = WKWebViewConfiguration()
        // 该设置只影响 HTMLMediaElement（<audio>/<video>）的自动播放策略，对 Web Audio API
        // 无效；Web Audio 的解锁靠 web 层在用户手势里 AudioContext.resume()（见 app.js）。
        // 保留此设置是为后续卡片的 <audio> 标签播放预留（P2-6 注释修正）。
        config.mediaTypesRequiringUserActionForPlayback = []

        // wtjres:// 自定义 scheme handler（WTJ-20260704-019）：用它取代原先的
        // loadFileURL(_:allowingReadAccessTo:) file:// 加载方式，解决 file:// 下
        // fetch()/XHR 被 CORS 拦截、导致 audio.js 无法加载音频的架构死穴。详见
        // WTJResourceSchemeHandler 类注释、app/web/audio/AUDIO-API.md §6.3。
        // 强引用存到 AppDelegate 属性（而不只是交给 config）：见 resourceSchemeHandler
        // 属性声明处的注释。
        let schemeHandler = WTJResourceSchemeHandler(rootURL: webDir)
        resourceSchemeHandler = schemeHandler
        config.setURLSchemeHandler(schemeHandler, forURLScheme: kResourceScheme)

        let contentController = WKUserContentController()
        let proxy = WeakScriptMessageHandler(target: self)
        contentController.add(proxy, name: "shell")
        config.userContentController = contentController

        let view = WKWebView(frame: window.contentLayoutRect, configuration: config)
        view.autoresizingMask = [.width, .height]
        view.navigationDelegate = self
        window.contentView = view
        webView = view

        // 页面经 "wtjres://app/index.html" 加载（而非 file:// 方案）：页面内全部相对路径
        // 子资源（css/js/img/audio/json）都会被浏览器解析为同一 scheme + 同一 host 下的
        // 请求，因而与页面本身同源——audio.js 里的 fetch() 不再是"file:// null origin 下
        // 的跨源请求"，不再被 CORS 拦截。kiosk 生产模式与 WTJ_WINDOWED 窗口化调试模式走的是
        // 同一套加载路径，不因模式不同而分叉。
        guard let indexURL = URL(string: "\(kResourceScheme)://\(kResourceSchemeHost)/index.html") else {
            NSLog("WTJ: 无法构造 wtjres:// index URL")
            return
        }
        webView.load(URLRequest(url: indexURL))
    }

    // MARK: kiosk 屏蔽（best-effort，REQ-DESK-04/05：不承诺 100% 生效）
    //
    // presentationOptions 是系统级"给 WindowServer 的建议标志位"，不是本 app 拦截按键
    // 那种确定性的事件消费；它们能显著提高干扰门槛（隐藏 Dock/菜单栏、抑制强制退出面板/
    // 注销关机/隐藏窗口/大部分 App 切换手势），但**本身**不构成对 Cmd+Space/Cmd+Tab 等
    // 系统级全局快捷键的保证屏蔽——这些快捷键的处理点在事件送达普通 app 之前，普通（未获
    // 辅助功能特权）app 都拦不住。13 卡新增的 `setupSystemHotkeyBlocker()`
    // （CGEventTap，见下方 MARK）是这一诚实边界的分层升级：拿到辅助功能授权后才能真正
    // 兜住 Cmd+Tab/Cmd+Space；未授权时仍然只有这里的 best-effort 标志位 + 层 2 机器级
    // `symbolichotkeys` 脚本（`app/scripts/kiosk-setup.sh`）兜底。诚实边界与家长可选的
    // 补强方式见 app/SECURITY.md。
    private func setupKioskPresentation() {
        NSApp.presentationOptions = [.hideDock, .hideMenuBar, .disableProcessSwitching,
                                      .disableForceQuit, .disableSessionTermination, .disableHideApplication]
    }

    // MARK: CGEventTap 系统级快捷键拦截（层 1，WTJ-20260705-013）
    //
    // 目标：吞掉 Cmd+Tab（App 切换）、Cmd+Space / Cmd+Option+Space（Spotlight / Finder
    // 搜索窗口）、Cmd+Option+Esc（强制退出面板）这几个 setupKeyMonitor() 的本地 NSEvent
    // monitor 架构上拦不到的系统级组合键（见该函数顶部"诚实边界"注释）。
    //
    // 原理：`.cgSessionEventTap` + `.headInsertEventTap` + `.defaultTap` 三个参数的组合
    // 意味着——在当前登录 session 范围内（不只是本 app 的事件流）、以"最先看到事件"的优先级
    // （headInsert）、以"可读可改可吞"的模式（defaultTap，相对的 `.listenOnly` 只能观察不能
    // 吞）插入一个事件 tap。回调里对匹配的组合键返回 nil 即可让事件到此为止，不再往下传给
    // WindowServer 自己的全局热键分发逻辑（也就不会触发 Cmd+Tab 切出去的界面）。
    //
    // 代价：`CGEvent.tapCreate` 需要本进程已获得"辅助功能"（Accessibility）系统级授权
    // （系统偏好设置 → 安全性与隐私 → 隐私 → 辅助功能），未授权时直接返回 nil、不会抛异常
    // 也不会崩溃，只是拿不到 tap。**no-silent-fallback 硬要求**：未拿到 tap 时必须显式
    // 让家长/维护者知道"系统快捷键拦截未生效"，绝不能因为拿不到就悄悄退化成"看起来和拦住了
    // 一样"——见 `attemptEnableSystemHotkeyTap()` 与 `promptAccessibilityTrustIfNeeded()`。
    private func setupSystemHotkeyBlocker() {
        if attemptEnableSystemHotkeyTap() {
            return
        }
        // 首次尝试即失败：说明还没有辅助功能授权（或授权判断与实际创建结果不一致——
        // 这里以 tapCreate 的真实返回值为准，而不是仅信 AXIsProcessTrusted() 的布尔值）。
        promptAccessibilityTrustIfNeeded()
        // 家长很可能是在 App 已经跑起来之后才去系统偏好设置里勾选授权；用一个不依赖并发的
        // 轮询 Timer（而非一次性判断）持续重试，一旦成功就自动切换到"已拦截"状态，不强制
        // 要求家长重启 App。
        axTrustRetryTimer?.invalidate()
        axTrustRetryTimer = Timer.scheduledTimer(withTimeInterval: kAXTrustRetryInterval, repeats: true) { [weak self] timer in
            guard let self = self else { timer.invalidate(); return }
            if self.attemptEnableSystemHotkeyTap() {
                timer.invalidate()
                self.axTrustRetryTimer = nil
                NSLog("WTJ: 辅助功能授权已在运行期间生效，CGEventTap 系统级快捷键拦截现已启用" +
                      "（Cmd+Tab/Cmd+Space/Cmd+Option+Esc）。")
            }
        }
    }

    /// 尝试创建并启用 CGEventTap；成功返回 true 并把状态记到 `systemHotkeyTapActive`，
    /// 失败（通常是未授权辅助功能）返回 false、不做任何静默假装成功的事。可重复调用
    /// （轮询重试场景），已启用时直接返回 true 不重复创建。
    @discardableResult
    private func attemptEnableSystemHotkeyTap() -> Bool {
        if systemHotkeyTapActive, let tap = systemHotkeyTap {
            CGEvent.tapEnable(tap: tap, enable: true)
            return true
        }

        let eventMask: CGEventMask = 1 << CGEventType.keyDown.rawValue
        let refcon = Unmanaged.passUnretained(self).toOpaque()
        guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap,
                                           place: .headInsertEventTap,
                                           options: .defaultTap,
                                           eventsOfInterest: eventMask,
                                           callback: wtjSystemHotkeyTapCallback,
                                           userInfo: refcon) else {
            // tapCreate 返回 nil：绝大多数情况就是辅助功能未授权。这里不重复弹窗（弹窗只在
            // promptAccessibilityTrustIfNeeded() 的首启逻辑里做一次），但每次尝试失败都要有
            // 客观可查的日志，供家长/QA 在 Console.app 里核实"现在到底有没有拦住"。
            NSLog("WTJ: CGEventTap 创建失败（通常因为辅助功能未授权）。Cmd+Tab/Cmd+Space/" +
                  "Cmd+Option+Esc 当前**未被**本层拦截；回退到层 2（机器级 symbolichotkeys，" +
                  "见 app/scripts/kiosk-setup.sh，若已运行则 Cmd+Space 仍会被系统层面挡住）" +
                  "与既有 presentationOptions best-effort 抑制。")
            systemHotkeyTapActive = false
            return false
        }

        systemHotkeyTap = tap
        systemHotkeyRunLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetCurrent(), systemHotkeyRunLoopSource, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        systemHotkeyTapActive = true
        NSLog("WTJ: CGEventTap 已创建并启用，Cmd+Tab/Cmd+Space/Cmd+Option+Space/" +
              "Cmd+Option+Esc 现由本层确定性拦截（辅助功能已授权）。")
        return true
    }

    /// CGEventTap 回调的实际处理逻辑（由文件顶层的 `wtjSystemHotkeyTapCallback` 转发过来）。
    /// 返回 nil 表示吞掉事件；返回 `Unmanaged.passUnretained(event)` 表示原样放行（不改变
    /// 引用计数，见 `wtjSystemHotkeyTapCallback` 上方的内存所有权注释）——语义上与
    /// `handleKeyDown` 的"放行/吞掉"一致，但这里操作的是 `CGEvent`（更底层），不是 `NSEvent`。
    fileprivate func handleTappedSystemEvent(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        // 系统在 tap 处理耗时过久或用户输入压力大时可能单方面关闭 tap（这两种情况都不是
        // 我们主动调用 tapEnable(false)），需要立刻重新启用，否则会静默永久失效而不自知。
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap = systemHotkeyTap {
                CGEvent.tapEnable(tap: tap, enable: true)
                NSLog("WTJ: CGEventTap 被系统暂停（type=%@），已重新启用。", String(describing: type))
            }
            return Unmanaged.passUnretained(event)
        }
        guard type == .keyDown else {
            return Unmanaged.passUnretained(event)
        }

        let flags = event.flags
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let cmd = flags.contains(.maskCommand)
        let opt = flags.contains(.maskAlternate)

        // Cmd+Tab（含 Cmd+Shift+Tab 反向循环，Shift 是否按下不影响判断——都属于 App 切换）。
        if cmd && keyCode == kKeyCodeTab {
            return nil
        }
        // Cmd+Space（Spotlight）与 Cmd+Option+Space（Finder 搜索窗口）：只要按住 Cmd 且是
        // 空格键就吞掉，不细分是否同时按了 Option，两者都属于 Spotlight 家族的逃逸入口。
        if cmd && keyCode == kKeyCodeSpace {
            return nil
        }
        // Cmd+Option+Esc（强制退出面板）：注意这里要求 Cmd**且**Option 同时按住才拦截，
        // 单纯的 Esc（无修饰键）必须原样放行——它要继续流向本 app 自己的 NSEvent 本地
        // monitor，走 handleKeyDown 里长按 5 秒 + 口令的既有状态机（REQ-EXIT-02/03）。
        // CGEventTap 只在这一个组合键分支上与长按 Esc 状态机产生"同一物理按键"的交集，且
        // 判断条件（要求同时有 Cmd+Option）与长按状态机（不要求任何修饰键）互斥，不会误吞
        // 家长长按退出用的那个 Esc。
        if cmd && opt && keyCode == kKeyCodeEscape {
            return nil
        }
        return Unmanaged.passUnretained(event)
    }

    /// no-silent-fallback：辅助功能未授权时，首次启动用 NSAlert 主动告知家长（而不是只写
    /// 一条 Console.app 才看得到的 NSLog），并调用 `AXIsProcessTrustedWithOptions` 触发
    /// 系统自带的"申请辅助功能权限"注册流程（把本 app 加进"辅助功能"列表，初始为未勾选，
    /// 家长手动勾选后即可生效，见 axTrustRetryTimer 的轮询逻辑）。只提示一次（用
    /// `kAXPromptShownDefaultsKey` 记录），避免家长每次开机都被打断；但每次未授权仍会有
    /// NSLog（见 `attemptEnableSystemHotkeyTap()`），不会彻底沉默。
    private func promptAccessibilityTrustIfNeeded() {
        // 调用一次 WithOptions(prompt: false)：只查询信任状态、不弹系统自己的授权对话框。
        // 注意（fable 评审 fix 5）：prompt:false 等价于 AXIsProcessTrusted，通常**不会**把本
        // app 注册进「辅助功能」列表——注册多半发生在 CGEventTap 实际创建失败时的 TCC 记录，
        // 或家长手动"+"添加；因此下面的 NSAlert 指引家长手动到列表里勾选/添加，不依赖此调用
        // 把 app 送进列表。另需真机核实 Big Sur 键盘事件 tap 归"辅助功能"还是"输入监控"面板
        // 管辖（见 app/SECURITY.md 的 QA-055 真机核查项）。
        let promptOptionKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([promptOptionKey: false] as CFDictionary)

        let alreadyPrompted = UserDefaults.standard.bool(forKey: kAXPromptShownDefaultsKey)
        if alreadyPrompted {
            return
        }
        UserDefaults.standard.set(true, forKey: kAXPromptShownDefaultsKey)
        UserDefaults.standard.synchronize()

        let alert = NSAlert()
        alert.messageText = "需要「辅助功能」权限才能锁住 Cmd+Tab / Cmd+Space"
        alert.informativeText = """
        WorkTime Justin 尚未获得「辅助功能」授权，Cmd+Tab（切换应用）和 Cmd+Space \
        （Spotlight 搜索）目前还**拦不住**，孩子可能借这两个组合键切出全屏界面。

        由于本 App 全屏 kiosk 运行会盖住系统设置窗口（本窗口层级在菜单栏之上），\
        请按以下顺序授权：① 长按 Esc 键 5 秒 → 输入家长口令退出 App；② 打开 系统偏好设置 \
        → 安全性与隐私 → 隐私 → 辅助功能 → 勾选（或用左下"+"添加）WorkTime Justin；\
        ③ 重新启动 App，Cmd+Tab / Cmd+Space 即被拦截。（若你在别的非全屏时机授权且 App 仍在\
        运行，勾选后本 App 也会在几秒内自动生效、无需重启——但全屏 kiosk 下通常需要先退出。）

        在授权之前，仍可运行 app/scripts/kiosk-setup.sh 在系统层面单独关闭 Spotlight（Cmd+Space）
        作为过渡兜底，但 Cmd+Tab 目前没有等效的系统设置可以关闭，只能靠这里的辅助功能授权。
        """
        // fable 评审 fix 4：kiosk 窗口在 mainMenu+1 层且置顶，NSWorkspace.open 打开的系统设置窗
        // 会被本窗口完全盖死、家长看不到反应，故不再提供"打开系统设置"按钮误导；改为单一确认，
        // 由上面的文案明确指引"先长按 Esc + 口令退出 App 再授权"（退出走既有合法路径）。
        alert.addButton(withTitle: "知道了（先退出 App 再授权）")
        alert.window.level = window.level
        _ = alert.runModal()
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(webView)
    }

    /// 释放 CGEventTap 相关资源；在 `applicationWillTerminate` 里调用。
    private func tearDownSystemHotkeyBlocker() {
        axTrustRetryTimer?.invalidate()
        axTrustRetryTimer = nil
        if let tap = systemHotkeyTap {
            CGEvent.tapEnable(tap: tap, enable: false)
        }
        if let source = systemHotkeyRunLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetCurrent(), source, .commonModes)
        }
        systemHotkeyRunLoopSource = nil
        systemHotkeyTap = nil
        systemHotkeyTapActive = false
    }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.evaluateJavaScript("window.__shellReady = true;", completionHandler: nil)
        // 确保 DOM 能收到键盘事件（P0-1；local monitor 仍是兜底通道）。
        window.makeFirstResponder(webView)
        // WTJ-20260705-018：首次加载即把当前权威额度/锁定状态推给 web——覆盖"app 上次运行
        // 时已锁定，本次冷启动直接就应该显示安静锁屏，而不是先短暂闪一下游戏画面"的时序。
        notifyShellStateToWeb()
    }

    // MARK: WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController,
                                didReceive message: WKScriptMessage) {
        NSLog("WTJ shell message: %@", String(describing: message.body))
        handleParentControlsMessage(message.body)
    }

    /// 解析 web -> shell 的家长控制消息（设置面板发起）。message.body 是 WKScriptMessage 对
    /// JS 端 postMessage(obj) 传来的普通对象/数组/标量值的桥接结果——JS 对象字面量会桥接成
    /// [String: Any]（数值经 NSNumber）。未知/畸形消息一律安全忽略，不抛错、不影响其余
    /// shell<->web 通道（本卡新增消息与既有的 NSLog 诊断打印并存，不替代它）。
    private func handleParentControlsMessage(_ body: Any) {
        guard let dict = body as? [String: Any], let type = dict["type"] as? String else { return }
        switch type {
        case "wtjSetDailyLimit":
            if let minutes = dict["minutes"] as? Int {
                applyDailyLimitChange(minutes)
            } else if let minutesNumber = dict["minutes"] as? NSNumber {
                applyDailyLimitChange(minutesNumber.intValue)
            }
        case "wtjResetUsageToday":
            resetUsageToday()
        default:
            break // 未识别的 type：忽略，不当作错误处理（前向兼容未来卡片新增的消息类型）。
        }
    }

    /// 设置面板调整每日额度：裁剪到合法范围后落盘，并按新额度重新判定锁定状态——新额度可能
    /// 已经覆盖今日已用秒数（应解锁），也可能比已用秒数还小（应立即锁定），两个方向都要处理，
    /// 不能假设"调整额度"只会发生在未锁定场景下（家长完全可能在锁屏状态里把额度调大以解锁）。
    private func applyDailyLimitChange(_ minutes: Int) {
        dailyLimitMinutes = clampDailyLimit(minutes)
        let shouldBeLocked = usedSecondsToday >= dailyLimitMinutes * 60
        if shouldBeLocked {
            if isLockedOut {
                persistUsageState()
                notifyShellStateToWeb()
            } else {
                enterLockout()
            }
        } else {
            let wasLocked = isLockedOut
            isLockedOut = false
            persistUsageState()
            if wasLocked {
                notifyLockout(false)
            } else {
                notifyShellStateToWeb()
            }
        }
        NSLog("WTJ: 家长已通过设置面板将每日额度调整为 %d 分钟。", dailyLimitMinutes)
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
