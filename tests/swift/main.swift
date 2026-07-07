//
//  tests/swift/main.swift
//  WorkTime Justin — app/shell/DailyQuota.swift 独立编译测试（WTJ-20260707-004）
//
//  app/shell/main.swift 是 Swift 顶层语句入口（文件末尾直接跑 NSApplication.run()），
//  app/build.sh 用纯 swiftc 交叉编译两个 slice，没有 XCTest target，没法用常规
//  `swift test` 跑测试，也不能把 app/shell/main.swift 当库 import 后只调函数、不启动
//  GUI App（同一编译单元里的顶层语句总会执行）。本文件是这张卡新增的最小可复用测试壳：
//  只与 app/shell/DailyQuota.swift（纯声明、无顶层语句、无 Cocoa/WebKit 依赖）一起单独
//  swiftc 编译成一个独立可执行文件，不链接 app/shell/main.swift，跑起来不会启动任何
//  GUI，几秒内出结果。文件命名为 main.swift（而非更描述性的名字）是 Swift 语言规则的
//  硬要求——多文件编译时，顶层可执行语句只能出现在名为 main.swift 的文件里（与
//  app/shell/main.swift 是两个不同目录下的独立文件，分属两次不同的 swiftc 调用，不会
//  冲突）。
//
//  覆盖验收标准 #2/#3 的核心判定 wtjIsNewLocalDay()——app/shell/main.swift 里所有跨日
//  检查入口（启动 applicationDidFinishLaunching、每秒 tick、窗口恢复/系统唤醒/重新获得
//  焦点三个生命周期通知、reset 口令 handleResetPasscodeAttempt()）最终都收敛到这一个
//  判定函数，测试它即测试了"何时应该跨日重置"这条规则对全部调用点的共同保证；每个调用点
//  各自的副作用（persistUsageState/notifyLockout/notifyShellStateToWeb 等）依赖
//  UserDefaults/WKWebView，留给 app/build.sh 编译验证 + 真机/窗口化手动验证
//  （tests/manual/），不在本文件覆盖范围。
//
//  退出码约定与仓库里 Python/Node 测试套件一致：0 = 全部通过，非 0 = 有用例失败，方便接入
//  tests/run_all.py（见该文件 "swift-daily-quota-reset" 套件项，用
//  run_daily_quota_reset_test.sh 封装编译 + 运行两步）。
//
//  直接运行（不经 run_daily_quota_reset_test.sh 也可以）：
//    swiftc app/shell/DailyQuota.swift tests/swift/main.swift \
//      -o /tmp/wtj_daily_quota_reset_test && /tmp/wtj_daily_quota_reset_test
//

import Foundation

var failureCount = 0

func expect(_ condition: Bool, _ label: String) {
    if condition {
        print("PASS: \(label)")
    } else {
        print("FAIL: \(label)")
        failureCount += 1
    }
}

// --- 验收标准 #2/#3 核心判定：wtjIsNewLocalDay() ---

expect(
    wtjIsNewLocalDay(recordedDateString: "2026-07-07", currentDateString: "2026-07-07") == false,
    "同一天（日期字符串完全相同）不应判定为跨日——验收标准 #3：同日 reset 不得解锁"
)

expect(
    wtjIsNewLocalDay(recordedDateString: "2026-07-06", currentDateString: "2026-07-07") == true,
    "记录日期早于当前日期一天，应判定为跨日——验收标准 #3：跨日 reset 应放行"
)

expect(
    wtjIsNewLocalDay(recordedDateString: "2026-06-30", currentDateString: "2026-07-01") == true,
    "跨月边界（6月30 -> 7月1）也应正确判定为跨日"
)

expect(
    wtjIsNewLocalDay(recordedDateString: "2025-12-31", currentDateString: "2026-01-01") == true,
    "跨年边界（去年12月31 -> 今年1月1）也应正确判定为跨日"
)

// 记录日期字符串"晚于"当前日期（理论上不该发生：家长手动把系统时钟往回调等极端场景）也应
// 视为"不同 = 需要按新的一天处理"——函数只做相等性判断，不做方向大小比较，见
// DailyQuota.swift 里 wtjIsNewLocalDay() 的文档注释。
expect(
    wtjIsNewLocalDay(recordedDateString: "2026-07-08", currentDateString: "2026-07-07") == true,
    "记录日期字符串反常地晚于当前日期时，仍按不同日期处理（不假设时间只会前进）"
)

expect(
    wtjIsNewLocalDay(recordedDateString: "", currentDateString: "2026-07-07") == true,
    "首次启动、从未记录过日期（空字符串，main.swift loadUsageStateFromDefaults 的历史兜底路径）时，应判定为跨日"
)

let totalCases = 6
if failureCount == 0 {
    print("ALL PASS: daily_quota_reset_test（\(totalCases) 项用例全部通过）")
    exit(0)
} else {
    print("FAILURES: \(failureCount)/\(totalCases) 项用例失败")
    exit(1)
}
