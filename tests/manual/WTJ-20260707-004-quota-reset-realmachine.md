# WTJ-20260707-004 · 每日额度跨日重置 + reset 口令：真机/准真机验收清单

> QA 手动清单（补脚本够不到的一层：native 壳 handler 行为 + 真机跨日）。脚本层已由
> `tests/run_all.py` 的 `swift-daily-quota-reset`（纯谓词 6 场景）与 `tl-unit` 的
> `parent-controls.test.mjs` 9/9b–9h（reset 口令识别/锁屏下生效/不自解锁/桥缺失）覆盖。
> **本清单只跑那两者覆盖不到的**：`main.swift` 里 handleResetPasscodeAttempt() /
> resetUsageToday() / 生命周期观察者的真实副作用，以及"睡眠过夜→次日自动放行"的端到端。
>
> **前置**：被测产物必须是**含 004 的构建**（stage ≥ a1f2ded；justin.local 现装的 1ab9f76 早于 004，需先重装）。
> 从主目录 `cd app && ./build.sh` 产物或 `/Applications/WorkTimeJustin.app`。记录所用 stage commit + DMG md5。

## 准真机（改本地日期，快，不必真等一夜）

> 用 `defaults` 直接改 App 的 UserDefaults 存档日期即可模拟跨日，无需真的过夜。Bundle id 见 Info.plist（`defaults read <id>`）。

| # | 步骤 | 期望 | 结果 |
|---|---|---|---|
| P1 | kiosk 玩到额度用完 → 进安静锁屏；记下此时 `usedSecondsToday`/`WTJUsageDateString` | 锁屏叠层出现、输入被抑制（键盘/指针不再触发游戏反馈） | |
| P2 | **同日**在锁屏界面连续键入 `reset` | **不解锁**（标准 #3）；壳日志 `收到 reset 口令，但本地日期未变化…同日不解锁` | |
| P3 | 把存档日期改成昨天：`defaults write <bundleid> WTJUsageDateString -string "<昨天yyyy-MM-dd>"`，再触发一次跨日检查入口（切走再切回 App / 合盖唤醒 / 或键入 reset） | 自动清锁 + 归零、恢复正常游玩；壳日志 `检测到本地日期变更…已自动解锁` 或 `收到 reset 口令，检测到本地日期已跨天` | |
| P4 | 跨日恢复后玩一会儿 → 任务/音频/动画/秘密词/奖励都正常 | 普通交互全部恢复（标准 #5） | |

## 真机生命周期（标准 #2 三入口，需物理操作）

| # | 步骤 | 期望 | 结果 |
|---|---|---|---|
| L1 | 额度用完锁屏 → 改存档日期为昨天 → **合盖睡眠**数秒后开盖唤醒（`NSWorkspace.didWakeNotification`） | 唤醒即检测跨日、自动解锁 | |
| L2 | 额度用完锁屏 → 改日期为昨天 → App 被系统对话框/Space 短暂夺焦后**重新获得焦点**（`didBecomeActive`）/ kiosk 窗口重成 key（`didBecomeKey`） | 重新获得焦点/窗口恢复时检测跨日、自动解锁 | |
| L3 | 改日期为昨天 → **完全退出并重启** App（`applicationDidFinishLaunching` 里的提前检查） | 启动即按新一天恢复额度，不停在昨日锁屏 | |

## 家长菜单同日通道 + Cmd+Q 无回归（标准 #4）

| # | 步骤 | 期望 | 结果 |
|---|---|---|---|
| M1 | 同日额度用完锁屏 → 长按 Q 5s 打开隐藏家长菜单 → 「重置今日使用时长」 | **同日也能**人工重置解锁（与口令路径刻意不同：菜单无条件放行） | |
| M2 | 长按 Q 打开隐藏家长菜单的既有表现 | 与 004 之前一致，无回归 | |

## 收尾
- 全 Pass → 贴证据（壳日志片段 `~/Library/Logs/…` 或 `Console.app` 过滤 `WTJ:`、所用 stage commit + DMG md5）、置 QA结果、回 PM。
- 任一 Fail → 记录现象 + 壳日志，打回 004。
- ⚠ 跑完请把改过的 `WTJUsageDateString` 复原为当天，避免污染 Ethan 真实使用状态。
