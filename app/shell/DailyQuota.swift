//
//  DailyQuota.swift
//  WorkTimeJustin — 每日额度跨日重置纯逻辑（WTJ-20260707-004）
//
//  从 main.swift 抽出、不依赖 Cocoa/WebKit/AppDelegate 实例状态的纯函数，专门供
//  tests/swift/daily_quota_reset_test.swift 独立编译 + 运行做单元测试用。main.swift 是
//  Swift 顶层语句入口文件（文件末尾直接跑 `app.run()`），任何与它一起编译进同一个可执行
//  文件的目标都会在启动时跑到那些顶层语句，没法被安全地"当库 import 后只调函数、不启动
//  GUI App"——因此把真正需要被独立测试覆盖的纯判定逻辑搬到这个没有任何顶层可执行语句、
//  只含函数声明的文件里：main.swift 与测试二进制分别把它加进各自的 swiftc 编译命令即可
//  复用同一份实现，不会出现"两处日期比较逻辑各写一份、逐渐不同步"的隐患。
//
//  app/build.sh 编译正式产物时会把本文件与 shell/main.swift 一起传给 swiftc（多文件编译，
//  Swift 允许除 main.swift 外的其余文件只含类型/函数声明、不含顶层语句），因此本文件的
//  函数对 main.swift 全部可见，main.swift 不需要任何 import 本文件的语句（同一模块）。
//
//  Swift Concurrency 硬约束：本文件只用 Foundation 的 String 相等比较，不引入任何新依赖，
//  不含 async/await/Task/actor/@MainActor，符合 app/build.sh 的并发符号硬门禁（nm/otool
//  检查见该脚本"并发硬门禁"一节）。
//

import Foundation

/// 判断"记录的使用日期字符串"与"当前本地日期字符串"是否构成跨日（验收标准 #2/#3 的核心
/// 判定：只要两者不同就视为新的一天）。字符串按 main.swift 的 `wtjCurrentLocalDateString()`
/// 产出的 "yyyy-MM-dd" 格式比较，本函数本身不关心格式来源，只做字符串相等性判断——保持
/// 判定逻辑足够简单纯粹，便于独立编写测试用例覆盖，也让调用点（main.swift 里启动/tick/
/// 窗口恢复/系统唤醒/重新获得焦点/reset 口令等全部路径）语义自解释，不必各自重复写 `!=`
/// 比较、也不会出现"某个调用点判断条件写岔了"的分叉风险。
///
/// 注意：本函数只做相等性判断，不做"谁更晚"的大小比较——即便 `recordedDateString` 因为
/// 极端场景（例如家长手动把系统时钟往回调）反常地"晚于"当前日期，也一律视为"不同 = 需要
/// 按新的一天重新处理"，这是刻意保守的选择：宁可多重置一次，也不会因为方向判断出错而卡进
/// "永远判定不是新的一天、锁屏再也解不开"的死局。
func wtjIsNewLocalDay(recordedDateString: String, currentDateString: String) -> Bool {
    return recordedDateString != currentDateString
}
