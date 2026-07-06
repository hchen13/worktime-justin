# WTJ-20260704-055 · 2014 MacBook Air / Big Sur 11 真机 P0 验收清单

> **性质**：真机手动验收清单（QA tracked 资产，WTJ-20260706-001 恢复）。§6 十项 P0 全部要求
> **物理机 GUI 交互目视**（物理键盘按键计时、屏幕观察白屏/帧率、实体合盖），SSH shell 无法
> 驱动/观察，必须由**物理坐在 justin.local 前的操作者**（Ethan，或获授权单用户测试窗口的 QA）执行。
>
> - **口径依据**：`app/PERFORMANCE.md §6`（10 项 P0）、`app/SECURITY.md §1`（拦截/退出边界，诚实口径勿虚假承诺）、`app/build.sh`、`app/shell/main.swift`。

## ⚠ 验收面（唯一，硬约束）

Ethan **只**验收从**主项目目录 `/Users/claire/Documents/worktime-justin` 当前 stage 提交**构建/复制出的产物：

- **构建**：`cd /Users/claire/Documents/worktime-justin/app && ./build.sh` → 产出 `app/dist/WorkTimeJustin.app` + `app/dist/WorkTimeJustin.dmg`（universal x86_64+arm64、min macOS 11.0、ad-hoc 签名）。
- **被测产物**：`/Users/claire/Documents/worktime-justin/app/dist/WorkTimeJustin.dmg`（或安装态 `/Applications/WorkTimeJustin.app`）。
- **必须记录**：跑验收前记下所用 **stage commit**（`git -C /Users/claire/Documents/worktime-justin rev-parse --short HEAD`）与 DMG md5，写进 WTJ-055 证据，确保验收对象可追溯。

**禁止**把以下当验收路径（仅内部证据，不代表 Ethan 验收面）：`/Users/claire/Documents/wtj-stage`、`/private/tmp/*` 任意 worktree、`dist-stage/` 镜像、或任何临时 worktree 构建包。若这些与主目录产物 md5 不一致，一律以主目录构建为准。

## 安装

1. 挂载 `app/dist/WorkTimeJustin.dmg`，拖 `WorkTimeJustin.app` 到 /Applications（或直接在 DMG 内启动）。
2. ad-hoc 签名放行：首次双击若报“无法验证开发者”，改用 **右键 → 打开 → 打开**；或 `xattr -dr com.apple.quarantine /Applications/WorkTimeJustin.app`。
3. 默认（不带参数）启动即 kiosk 生产模式（孩子实际形态）。`--windowed`/`WTJ_WINDOWED=1` 是调试窗口、**不作真机验收形态**。

## P0 十项（PERFORMANCE.md §6）— 逐项 pass/fail，附证据

> 每项记：结果（Pass/Fail/N-A）+ 实际现象 + 证据（截图/录屏/日志/`console.log`）。
> #2/#3 的“系统级快捷键未必 100% 拦得住”是**已知诚实边界**（SECURITY.md §1）：如实记录压制程度，不要求绝对屏蔽。

| # | 项目 | 操作 | 期望 | 结果 | 证据 |
|---|---|---|---|---|---|
| 1 | Big Sur 加载 | 安装后双击启动 | App 起来、WKWebView 出 web 画面**非白屏/崩溃** | | |
| 2 | Cmd+Tab / 四指切换 压制 | kiosk 下反复按 Cmd+Tab、三指/四指手势 | 记录压制程度（无反应/闪一下/能切出）对照 SECURITY.md | | |
| 3 | Cmd+W/H/M/\` 拦截 | 单按+极快连按每个 | 均被吞掉，不关窗/隐藏/最小化/切窗 | | |
| 4 | HD5000 帧率 | 触发宝箱开启（粒子）+ 其它动画叠加最坏情况，看 `dbg-fps` | 不出现持续掉到个位数帧率 | | |
| 5 | 4GB RSS | 跑典型场景（秘密词多次命中、完成任务触发宝箱、词池扩展），`Activity Monitor`/`vmmap --summary` 采物理足迹 | 不逼近/超过 §3.6 的 ~2GB 应用预算 | | |
| 6 | 音频（含中文任务语音） | kiosk 下触发依赖音频交互（秘密词命中、按键音、**点问号做任务**），验证首次手势解锁 AudioContext | 真的听到声音、非静默降级；**任务提示为完整中文整句**（非英文、非“找到 dog”拼接） | | |
| 7 | 合盖 / 电源恢复 | kiosk 全屏时合盖等数秒~数分钟再开 | 窗口仍最前+全屏 kiosk，rAF 渲染恢复，无黑屏/花屏/键盘失灵 | | |
| 8 | WebKit 版本/特性 | 输出 `navigator.userAgent`；抽查 prefers-reduced-motion、ES2020 Array 方法、AudioContext/decodeAudioData | 实际版本记录 + 关键特性表现符合预期 | | |
| 9 | 老旧电池降频 | 低电量/长时间发热后持续满帧场景 | 可触发降频但 App 不崩溃/无响应 | | |
| 10 | file:// vs wtjres:// 资源加载 | 确认原生壳经 wtjres:// 加载（非 file://），音频/图片/JSON 子资源正常 | 所有资源加载正常、无 fetch 被拦静默 | | |

## 真机专属动画 P0（WTJ-20260705-017，Ethan 曾现场发现动画全不播）

> 逐一目视确认动画**真的在动**（不是静止占位）。若仍全静止 → 打回 017，附 justin.local 诊断日志/console 报错。

| 项 | 操作 | 期望 | 结果 |
|---|---|---|---|
| 灯开关 / 宝箱开启 | 点 click-lamp-on / 填满卡槽 | 点亮过渡、开盖+粒子在动 | |
| 马 / 水龙头任务 | click-horse-run / click-faucet-on | 奔跑帧、出水帧真的播放（水柱为最新加粗版） | |
| 字母拖尾 / 星光 / 火箭成功反馈 | 打字 / 完成任务 | 流星拖尾、pointer 星光、成功爆点在动 | |

## 退出机制（SECURITY.md §1.2/§1.3，018 更新后）

| 项 | 操作 | 期望 | 结果 |
|---|---|---|---|
| Cmd+Q 长按 <5s | kiosk 下按住不足 5 秒松开 | 无动作、不弹菜单、不退出；底部有独立长按进度条 | |
| Cmd+Q 长按 =5s | 按住满 5 秒 | 弹出隐藏家长 NSMenu（含「退出 WorkTime Justin」→ 直接退出，不再要口令） | |
| Esc 长按 =5s | 按住 Esc 满 5 秒 | 触发家长口令门（与 Cmd+Q 进度条两套独立），输正确口令方退出 | |

## PM 点名系统快捷键 + Big Sur TCC

| 项 | 操作 | 期望 | 结果 |
|---|---|---|---|
| Cmd+Space / Cmd+Option+Space | kiosk 下按 | 记录是否弹 Spotlight / Finder 搜索（初测失败点） | |
| Cmd+Option+Esc（强制退出） | kiosk 下按 | 记录强退窗口是否弹（系统级通常拦不住，如实记） | |
| Mission Control 家族 | 若用 kiosk-setup 脚本 | 记录调度中心是否被压制 | |
| **Big Sur TCC** | 观察 CGEventTap 是否生效 | 记录需**辅助功能(Accessibility)**、**输入监控(Input Monitoring)**、还是两者才让事件拦截生效；kiosk-setup/teardown 是否可逆 | |

## 收尾

- 全部 Pass → 在 WTJ-055 贴证据链接（含所用 stage commit + DMG md5）、置 QA结果=Pass、回 PM。
- 任一 Fail → 记录现象+证据，打回对应实现卡（如 017 动画 / 020 水柱），或记入残余风险。
- Ethan 决定**不做**真机验证 → 按 055 验收标准 6 在卡写明“接受残余旧机 P0 风险”的决定 + 签名。
