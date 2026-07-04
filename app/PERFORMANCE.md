# WorkTime Justin — 2014 MacBook Air 性能预算与打包确认（app/PERFORMANCE.md）

卡片：WTJ-20260704-018。本文档面向 TL / PM / QA，回答 `docs/index.html` `#open`
待确认项「2014 MacBook Air 上的性能预算：动画数量、分辨率、音频加载、全屏稳定性」
（该行紧邻「第一版技术壳：Electron、Swift/Objective-C，或其他轻量桌面方案」，两项均属
REQ-DESK-03 的 TL 性能验证职责），并落实 REQ-DESK-01（2014 MacBook Air 目标机全屏运行）
与 REQ-DESK-02（可打包安装/启动）两条需求的验收证据。

**核心结论先行**：打包链路本次实跑 exit 0，产物齐全（见第 2 节）；性能红线全部来自
`app/web/manifest.js` 的 `performance` 域与既有引擎注释，本文档只做收拢、量化与降级策略
补全，不改动任何红线数值；**最大未闭环风险是"SDK 26 交叉编译产物从未在真实 2014
MacBook Air / Big Sur 11 上跑过"**，第 6 节列出的 P0 项均需要真机才能关闭。

---

## 1. 目标机 vs 构建机

| | 交付目标机（2014 MacBook Air） | 本次构建机（本地开发环境） |
|---|---|---|
| CPU 架构 | Intel x86_64 | Apple Silicon arm64 |
| GPU | Intel HD5000（核显，无独显） | Apple Silicon 集成 GPU（性能级别远高于 HD5000） |
| 内存 | 4GB（典型配置） | 显著高于 4GB |
| 屏幕 | 1440×900 @1x（非视网膜） | Retina（`devicePixelRatio` ≥ 2） |
| 操作系统 | macOS Big Sur 11（`LSMinimumSystemVersion` 也定在 11.0） | macOS 26.1 |
| WebKit / WKWebView | 版本大致对应 Safari 14 | 现代 WebKit（版本远新于 Safari 14） |
| Xcode | 不适用（运行态） | 仅 CommandLineTools（`/Library/Developer/CommandLineTools`），**无完整 Xcode**，`xcodebuild` 不可用，只能用 `swiftc` 交叉编译 |

**关键推论**：目标机像素总数（1,296,000px @1x）反而少于构建机的 Retina 逻辑分辨率 ×
`devicePixelRatio²`，但目标机 GPU（2014 年集成显卡）性能远弱于构建机；两台机器在
"填充率 / 合成开销"这条轴上互相不能替代，**任何在构建机上跑出来的帧率数字都不能线性
外推到目标机**——这是第 6 节把帧率验证列为 P0 的直接原因。

---

## 2. 打包链路确认（验收标准 1）

### 2.1 实跑结果

命令：`cd app && ./build.sh`，**exit code 0**。构建机环境：Apple Silicon arm64 /
macOS 26.1 / 仅 CommandLineTools（无 Xcode）。关键输出摘录：

```
==> 定位 macOS SDK
    SDK=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk

--- lipo -archs（universal 可执行文件）---
x86_64 arm64

--- LC_BUILD_VERSION ---
[WorkTimeJustin-x86_64]  platform 1   minos 11.0   sdk 26.2
[WorkTimeJustin-arm64]   platform 1   minos 11.0   sdk 26.2

--- 并发硬门禁 ---
[WorkTimeJustin-x86_64] 未链接 libswift_Concurrency，无 swift_task/MainActor 符号引用
[WorkTimeJustin-arm64]  未链接 libswift_Concurrency，无 swift_task/MainActor 符号引用

--- codesign -v ---
codesign 验证通过

--- dmg 大小 ---
8.7M  dist/WorkTimeJustin.dmg
```

四项自动化门禁全部通过：universal 二进制同时含 `x86_64` + `arm64` slice；两个 slice
的 `LC_BUILD_VERSION` 均为 `platform=macos(1)` / `minos=11.0`（`build.sh` 第 16 行
`MIN_OS="11.0"`，第 56/60 行交叉编译目标）；两个 slice 均未链接
`libswift_Concurrency`、无 `swift_task`/`MainActor` 符号（`build.sh` 第 53 行注释：
钉死 `-swift-version 5` 是为了防止 Swift 6 语言模式下的隐式 `@MainActor` 并发，
因为 **Big Sur 缺少 `_Concurrency` 运行时回退库，一旦引入会直接启动崩溃**）；
ad-hoc 签名验证通过。

### 2.2 产物清单与体积

| 产物 | 大小 |
|---|---|
| x86_64 slice（`.build-tmp/WorkTimeJustin-x86_64`，交付目标架构） | 95K |
| arm64 slice（`.build-tmp/WorkTimeJustin-arm64`，本机冒烟用） | 119K |
| universal 可执行文件（`lipo` 合成后，两 slice + 对齐开销） | 280K |
| `.app` bundle 总体积 | 9.1M |
| `Contents/Resources/web/` 总体积 | 8.8M |
| 其中 `web/assets/`（16 张 1024×1024 PNG：8 张秘密词 sprite + 8 张 UI/任务物件） | 8.4M |
| 其中 `web/audio/`（仅 `AUDIO-API.md` / `README.md` / `sfx-manifest.json` / `missing-audio.json`，**尚无实际音频文件**） | 92K |
| 其中根目录 js/css 总和（`app.js`/`audio.js`/`hud.js`/`keyboard.js`/`manifest.js`/`pointer.js`/`secretword.js`/`task.js`/`task-templates.js` 等 + 对应 css） | 288K |
| `WorkTimeJustin.dmg` | 8.7M |
| bundle 内文件总数 | 48 个 |

Bundle 内文件清单核对：`task-templates.js/.css`、`hud.js/.css`、`pointer/`、
`secretword/`、`task/`、`audio/` 各子目录、`MANIFEST.md` 等**全部**已随
`Contents/Resources/web/` 打包进 `.app` 与 `.dmg`（`build.sh` 第 67-69 行用
`cp -R "$SCRIPT_DIR/web/"* "$RESOURCES_DIR/web/"` 整目录递归拷贝，不是按文件名单点
列举，因此新增 web 文件会自动被下一次构建纳入，**未发现遗漏打包的问题**）。

### 2.3 build.sh 是否需要改动

**结论：未发现缺陷，本次未修改 `build.sh`。** 逐项核对：

- 新 web 文件打包：`cp -R web/*` 整目录拷贝，`task-templates.*`/`hud.*`/`pointer/`
  等后续卡新增的文件全部被自动收纳，无需在 `build.sh` 里逐一列名维护。
- DMG 是否含最新资源：脚本每次执行开头 `rm -rf "$DIST_DIR" "$BUILD_DIR"` 全量清空后
  重新拷贝、重新打包，不存在"DMG 缓存旧资源"的可能。
- 双 slice / minos / 并发门禁 / codesign 均为脚本自带的构建后自动验证，本次实跑全部
  通过，无需新增检查项。

因此 `app/README.md` 的安装/运行/公证相关章节（本地开发、构建、目标机安装、Gatekeeper
绕过、已知边界）经核对**内容已完整**，同样未修改；本文档第 5 节仅做交叉引用汇总，不
重复维护一份说明。

### 2.4 `--run` 窗口化冒烟（本机 arm64，非目标机数据，仅供参考）

用 `WTJ_WINDOWED=1 open dist/WorkTimeJustin.app` 启动后，用 `vmmap --summary` 采样：

```
Physical footprint:         32.3M
Physical footprint (peak):  96.4M
```

（`ps` 报告的 RSS 约 93-100M，但 macOS 的 `Physical footprint` 排除了跨进程共享的
系统库/WebKit 共享缓存页，是更准确的"这个进程实际占用了多少物理内存"指标。）
**这是 Apple Silicon + macOS 26 上的数字，与目标机 x86_64 + Big Sur 11 上的实际
表现无必然对应关系**（不同架构、不同 WebKit 版本、不同内存管理策略），仅作为
"壳本身很轻"这一方向性判断的旁证，不能替代第 6 节要求的真机测量。

---

## 3. 性能预算表（验收标准 2 / 4）

以下数值全部来自 `app/web/manifest.js` 的 `performance` 域（第 476-493 行）与
`rewards.chest.fireworks`（第 340-361 行）等既有技术评审结论——**该域本身已明确注明
"非 `docs/index.html` 直接数值"**，是收拢自各卡技术评审的性能红线；本文档不新增/不
修改任何红线数值，只做汇总、量化依据补充与降级策略建议。

### 3.1 动画与粒子（烟花 / UI 动效）

| 项 | 预算值 | 依据 | 现状 | 超预算降级策略 |
|---|---|---|---|---|
| 烟花粒子数上限 | ≤300 / 次 | `manifest.js:358`（`rewards.chest.fireworks.maxParticles`）与 `manifest.js:484`（`performance.maxParticles`，全局引用值，两处一致） | 烟花引擎**尚未实现**（`grep` 全 `web/*.js` 无 fireworks/canvas 粒子代码），仅 manifest 有配置字段，属于后续卡的实现红线 | 引擎实现时按帧动态降级：检测到 `now-lastFrameTime` 持续 >20ms（<50fps）即降至 150 粒子/次；持续卡顿再降到 80 |
| `shadowBlur` | 禁用 | `manifest.js:359`（`disallowShadowBlur`）与 `:486`（同名全局字段） | 当前唯一 canvas 循环（`app.js` 的 `drawTrail`/`drawRings`/`drawLetters`）未使用 `shadowBlur`（`grep shadowBlur *.js` 零命中），未违反 | 烟花实现"发光"效果时用**预渲染 offscreen canvas 的柔光贴图 + `drawImage`**代替 `shadowBlur`（HD5000 上 `shadowBlur` 是逐像素软件混合，300 粒子/帧会直接掉到个位数 fps） |
| 空闲停止渲染 | 无输入 5 秒后停止 rAF | `manifest.js:485`（`idleStopSec: 5`） | **已实现且已消费**：`app.js:271` `IDLE_TIMEOUT_MS = IDLE_STOP_SEC * 1000`，`app.js:353-357` 的 `draw()` 在 `Date.now() - lastActivity >= 5000` 时不再排下一帧 `requestAnimationFrame` | 无需降级，已是最终态；若未来叠加烟花/常驻动画层，需确保新增循环同样接入这一停止条件，不能各自维护独立计时器 |
| `prefers-reduced-motion` 冻结 | 减弱动效下关闭动画 | 无对应 REQ ID，属工程自查项 | 已在 `secretword.css:66`、`hud.css:236`、`task-templates.css:110` 三处 `@media (prefers-reduced-motion: reduce)` 里落地（改为无动效静态展示） | 未来任何新增 CSS 动效模块，需同步补一段 `prefers-reduced-motion` 覆盖，作为工程 checklist 项 |
| 单帧全屏重绘 | 避免每帧全屏渐变 | 技术评审结论（HD5000 fill-rate 预算） | 当前 `app.js:draw()` 每帧对整个 canvas 做 `clearRect` + 纯色 `fillRect`（`app.js` 第 345-347 行，`'#0e1117'` 纯色，非渐变），这是当前实现的帧成本地板；未发现每帧重算的 `createLinearGradient`/`createRadialGradient` | 若未来加背景动效，禁止每帧调用 `createXxxGradient()`；渐变应预渲染成静态 `CanvasGradient` 对象复用，或用预渲染 offscreen 位图 |
| 画布数量 | 尽量单一 canvas | 技术评审结论（多 canvas = 多次合成层开销） | 当前仅一个 `<canvas id="stage">`（`index.html:18`），字母/尾迹/波纹全在同一 `ctx` 上按顺序绘制 | 烟花/粒子引擎优先复用同一 `#stage` canvas 或最多再加一层专用 overlay canvas，避免层数无限增长带来的合成开销 |

### 3.2 常驻 sprite / 图片资源

| 项 | 预算值 | 依据 | 现状（量化） | 超预算降级策略 |
|---|---|---|---|---|
| 常驻 sprite 上限 | ≤20 张同时解码驻留 | `manifest.js:483`（`performance.maxResidentSprites`） | 解码后每张 1024×1024 RGBA ≈ **4MB**（1024×1024×4 字节 = 4,194,304 字节，精确值）；20 张 ≈ 80MB 解码内存上限 | 超过上限时按 LRU 逐出最久未使用的解码位图；不做"全量常驻"，改为"当前任务/当前秘密词命中"按需解码 |
| 词池全量预载 | **禁止** | `manifest.js:132`（`secretWords.poolTargetSize: 100`，26 字母×约 4 词/字母，见 `docs/index.html:1167` 参数表「词池规模」一行） | 100 词若每词对应一张 1024×1024 sprite 全部预解码 = 100×4MB = **400MB**，远超 20 张常驻上限（80MB）5 倍，在 4GB 机器上是不可接受的常驻占用 | 必须懒加载：仅在秘密词命中/任务物件出现时才创建 `<img>`/解码；当前 `secretword.js:showSpriteOverlay()`（第 302 行起）**已经是按命中时才创建 `<img>` 元素、动画结束后 `removeImg()` 移除**（非预载全量词池），后续词池扩到 100 词时需保持这一模式不倒退 |
| 素材原始分辨率 vs 实际显示尺寸（**过度解码**，见下方量化说明） | 显示尺寸应与源图分辨率数量级匹配 | `app/web/assets/PROVENANCE.md`「性能优化留给 018 卡」条目——**本卡即该评估的落地文档** | 见下表 | 对显示尺寸远小于源图的素材，建议追加一版预降采样（如 256×256 或 128×128）供运行时使用，DESIGN 原始 1024×1024 仅作为源文件保留 |

**过度解码量化**（现状实测，源文件 100% 为 1024×1024 RGBA PNG）：

| 素材 | CSS 实际显示尺寸上限 | 源图/显示尺寸比（线性） | 解码内存 vs 有效显示面积浪费倍数（约） |
|---|---|---|---|
| 秘密词命中 sprite（`secretword.css:28`） | `clamp(96px, 16vw, 200px)`，最大 200px | 1024/200 ≈ 5.1× | ≈ 26× |
| 任务物件 prop（`task-templates.css:30`） | `clamp(88px, 12vw, 160px)`，最大 160px | 1024/160 = 6.4× | ≈ 41× |
| 五槽托盘背景（`assets/ui/five-slot-tray.png`） | 约 260–380px（`assets/PROVENANCE.md` 记录） | 1024/380 ≈ 2.7× | ≈ 7× |
| 工作状态灯（`assets/ui/working-status-light.png`） | 约 22–28px | 1024/28 ≈ 36.6× | ≈ 1340× |

工作状态灯这一项最极端：为了显示一个 ~25px 的小圆点，解码了一整张 4MB 的 1024×1024
位图，而且 `rewards.statusLights.count`（`manifest.js`，默认 3）意味着**同时存在 3
个这样的解码实例**。这不是当前实现的 bug（`assets/PROVENANCE.md` 已明确记录这是
"直接用 DESIGN 交付原图，未做降采样，留给 018 卡评估"），但建议 PM/DESIGN 后续为
展示尺寸 <400px 的素材出一版预降采样文件（如 128×128 或 256×256），从源头把解码内存
降到当前的 1/16～1/300，而不是依赖 WebKit 自身的解码期优化（是否会真正按 CSS 尺寸
降采样解码，属于 WebKit 实现细节，Safari 14 上的行为未验证，见第 6 节）。

### 3.3 分辨率与 `devicePixelRatio`

| 项 | 预算值 | 依据 | 说明 |
|---|---|---|---|
| 目标机分辨率 | 1440×900 @1x | TL 目标机事实（非视网膜 MacBook Air 13" 2014 款原生分辨率） | 非视网膜对 GPU 更省：`canvas.width = width * dpr` 在 `dpr=1` 时像素总数就是逻辑像素数，不像 Retina 需要渲染 4 倍（`dpr=2`）甚至更多像素 |
| `devicePixelRatio` 处理 | 已实现，无需改动 | `app.js:49` `dpr = Math.max(1, window.devicePixelRatio \|\| 1)`，`app.js` `resize()` 函数据此设置 `canvas.width/height` 与 `ctx.setTransform` | 目标机上 `dpr` 恒为 1，逻辑坐标系与物理像素 1:1；构建机为 Retina，`dpr≥2`，两边渲染的物理像素总量差异较大，构建机测的帧率**不能**直接当作目标机帧率的下限或上限参考（呼应第 1 节结论） |

### 3.4 音频加载

| 项 | 预算值 / 现状 | 依据 | 风险与降级策略 |
|---|---|---|---|
| AudioBuffer 缓存 LRU 上限 | 64 条（按条目数，非字节数） | `audio.js:53` `MAX_CACHE_ENTRIES = 64`，`audio.js:37` 注释确认按条目数计 | 若长音频（如组合任务的长句 TTS）体积较大，64 条的字节预算不确定，建议后续补充按字节数的第二道上限（当前只按条目数逐出，最坏情况 64 条超大音频仍可能占用较多内存），本卡不改代码，记录为待办 |
| `file://` 下加载方式 | **当前实现会在真机上失败**，需替换加载层 | `audio.js:391-401` 注释 + `audio/AUDIO-API.md` §6.3：`loadArrayBuffer()` 用 `window.fetch(path)`；但本项目既定运行时是 `WKWebView.loadFileURL`（`main.swift:458`），WebKit 对 `file:` scheme 的 `fetch()/XHR` 近乎必然拦截失败，`loadFileURL(_:allowingReadAccessTo:)` 只放开标签式子资源（`<img>`/`<audio>`/`<script>`），不解除 fetch 限制 | **019 集成卡必须替换 `loadArrayBuffer()` 这个唯一加载点**（推荐方案：自定义 `WKURLSchemeHandler`，或 `.m4a` 内联 `data:` URI，或本机 `localhost` 静态 server），decode/缓存逻辑不用动；本卡不越权实现，仅在此确认这一风险的存在与位置 |
| 首次用户手势解锁 AudioContext | 已有 `unlock()` 机制 | `audio.js:250-253` 注释 + `unlock()` 函数（约第 252 行起），`main.swift:439` `config.mediaTypesRequiringUserActionForPlayback = []` | WKWebView 层已放开媒体自动播放门控，但 Web Audio API 的 `AudioContext` 是否需要用户手势 `resume()` 仍取决于 WebKit 版本的自动播放策略；构建机现代 WebKit 与目标机 Safari 14 时代 WebKit 的门控行为可能不同，需真机验证（见第 6 节） |
| 双 `AudioContext` 实例遗留问题 | 已知技术债，非本卡范围 | `audio.js:216-225` 注释：`app.js` 里有一个仅用于 `dbg-audio` 展示的独立 `audioCtx`（007/002 遗留），与 `audio.js` 内部单例互不相同 | 019 集成卡接入 `audio.js` 时应按注释里的三步整改（删 `app.js` 里的解锁桩、统一走 `WTJ_AUDIO.unlock()`、`dbg-audio` 改读 `isUnlocked()`），本文档仅记录风险不重复展开 |
| 音频资源现状 | `web/audio/` 内**尚无实际音频文件** | 本次构建产物核对：`audio/` 目录仅含 `AUDIO-API.md`/`README.md`/`sfx-manifest.json`/`missing-audio.json`（92K，无 `.m4a`/`.mp3`） | 当前打包体积（8.7M DMG）里没有真实音频负载；音频接入后（019 卡）DMG 体积与内存曲线需要重新评估，本文档给出的 8.7M 不是最终交付体积 |

### 3.5 Canvas2D 帧率

| 项 | 预算值 | 依据 | 说明 |
|---|---|---|---|
| 目标帧率 | 60fps 可达，但是红线不是保证 | 技术评审结论（HD5000 核显 Canvas2D 软件/硬件混合加速能力） | HD5000（2014 年集成显卡）跑 Canvas2D 合成通常没问题，但叠加大量粒子/位图绘制、`shadowBlur`、频繁 `getImageData`/`putImageData` 等操作会迅速掉帧；"60fps 可达"是在遵守本节其余红线（单 canvas、禁 `shadowBlur`、禁每帧渐变、粒子封顶、控制 overdraw）前提下的判断，不是无条件保证 |
| 当前实现帧成本地板 | 已量化 | `app.js` `draw()`：每帧 `clearRect` + 纯色 `fillRect` 全屏、`drawTrail`（指针尾迹，数组随年龄 `splice` 自动收缩）、`drawRings`（点击波纹，同样自限）、`drawLetters`（按键字母，`life` 到期 `splice`） | 三个数组（`trail`/`rings`/`letters`）均无固定上限但靠"存活时间到期即移除"天然限流（键盘/鼠标操作再快，单个元素存活 ≤1.5s），不存在无界增长风险；这是未来叠加烟花引擎时的既有帧成本基线，新增开销需要在这个基线之上评估 |
| overdraw 控制 | 需要 | 技术评审结论 | 烟花/粒子实现时避免大量半透明图层互相叠加导致同一像素被反复混合（尤其满天星/打铁花预设类型，粒子密集区域容易过度混合），建议粒子透明度衰减到阈值以下即直接从数组移除，不留"看不见但仍在参与合成"的粒子 |

### 3.6 内存预算

| 项 | 预算值 | 依据 |
|---|---|---|
| 系统占用 | 约 2GB（4GB 机器） | TL 技术评审结论（Big Sur 11 + 系统后台进程的典型占用） |
| 应用可用总预算 | 约 2GB | 4GB 总量减去系统占用后的粗略上限，需要在这 2GB 里容纳 WKWebView 自身开销 + web 层素材/音频常驻 + 其余系统应用可能同时运行的余量 |
| 原生壳（Swift + 系统 WKWebView）RSS | 约 40-80MB 量级 | 技术评审结论（`app/README.md` 「技术栈」一节：选择 Swift/AppKit + 系统 WKWebView 而非 Electron 的核心理由之一） |
| 本机（Apple Silicon/macOS 26）实测方向性参考 | `vmmap --summary` 物理足迹 32.3M（峰值 96.4M） | 第 2.4 节实测；**架构/系统不同，不能直接当作目标机数值**，仅用于佐证"原生壳本身很轻"这一方向性判断 |
| Electron 对照（备胎方案，非本次实现） | 典型 RSS 300-500MB | 技术评审结论 + 三路评审已讨论的备选项（见第 4 节），仅作参照，不是本次交付方案 |
| web 层素材是内存大头 | 需懒加载 + 上限 | 见 3.2 节；20 张常驻 sprite ≈ 80MB，是当前唯一有具体数字的"素材内存"上限来源；音频 LRU 64 条无字节上限（见 3.4），暂无法给出精确数字，需 019 补充 |

### 3.7 全屏稳定性

| 项 | 现状 | 依据 | 风险 |
|---|---|---|---|
| Kiosk borderless 窗口 | 已实现 | `main.swift` `KioskWindow` 类（约第 163 行起，覆写 `canBecomeKey`/`canBecomeMain` 让 borderless 窗口仍可接收键盘事件） | 无 |
| `presentationOptions` | 已实现，best-effort | `main.swift:469-470`：`[.hideDock, .hideMenuBar, .disableProcessSwitching, .disableForceQuit, .disableSessionTermination, .disableHideApplication]` | 这些是"系统级建议标志位"而非确定性拦截，`SECURITY.md` 第 2 节已明确记录 `Cmd+Space`/`Cmd+Tab`/`Cmd+Option+Esc` 等无法 100% 屏蔽；实际压制效果在 Big Sur 11（目标机系统版本）上是否与构建/测试时预期一致，未经真机验证 |
| 合盖 / 电源事件恢复 | **未发现专门处理逻辑** | 逐行核对 `main.swift`：无 `NSWorkspace` 睡眠/唤醒通知监听、无屏幕睡眠/唤醒回调 | 依赖 AppKit 默认行为（一般应用合盖/唤醒后窗口状态应能自动恢复），但 kiosk borderless 全屏窗口在合盖重开后是否保持置顶层级、WKWebView 的 Canvas2D/rAF 渲染循环是否正常恢复，**没有针对性代码也没有真机验证**，是第 6 节 P0 项之一 |
| 老化电池持续满帧降频 | 无主动降频逻辑，依赖 `idleStopSec` 被动省电 | `manifest.js:485` | 2014 款机型使用 6+ 年后电池普遍老化，macOS 在低电量/高温下会主动降频（系统级节流，非本 App 可控）；本 App 唯一的"主动降负载"手段是无操作 5 秒后停止 rAF（3.1 节），没有针对"系统已进入低电量模式"的显式检测与进一步降级（如自动减少 `maxParticles`）。当前无 REQ 要求实现这一层，记录为可选后续优化项，非本卡缺陷 |

### 3.8 WebKit 基线

| 项 | 现状 | 依据 |
|---|---|---|
| 语法基线 | ES2020 以内，Safari 14 兼容 | `app.js` 文件头注释「语法基线：ES2020 以内（Safari 14 兼容），不用 `?.`/`??` 之外的新特性，无 `fetch`、无 `import`、无外部依赖」；`task-templates.css`/`secretword.css`/`hud.css` 等均有类似「避免 `:has()` 等新特性」「Safari 14 不支持 `:focus-visible`」的注释 | 
| Canvas2D / 无 WebGL2 依赖 | 符合 | 全项目仅使用 `canvas.getContext('2d')`（`app.js:42`），未发现任何 `getContext('webgl')`/`getContext('webgl2')` 调用 |
| 实际 WebKit 版本 | **未知，未验证** | 目标机运行的是系统自带 WKWebView，其 WebKit 版本随 Big Sur 11 的系统更新程度浮动（不同的 11.x 补丁版本可能对应不同 WebKit 小版本），本地无法安装 Big Sur 来复现，只能类比"macOS 11 大致对应 Safari 14"这一经验对应关系，具体到某个 CSS/JS 特性是否被支持，需真机验证（第 6 节） |

---

## 4. Swift/AppKit/WKWebView 方案兼容风险（验收标准 2，对应 REQ-DESK-01/02/03）

- **架构选择**：Swift/AppKit 极薄原生壳 + 系统 WKWebView，画布内容用 HTML/CSS/Canvas2D
  实现（`app/README.md`「技术栈」一节）。选择理由：4GB 内存 + HD5000 核显对 Electron/
  Chromium 类方案不友好；Big Sur 缺少 Swift Concurrency 运行时回退库，现代 Electron/
  Node 工具链链路更长、风险更高；原生壳启动快、内存占用低（第 3.6 节）；WKWebView 复用
  系统自带 WebKit，不需要额外打包一个浏览器内核（体积对照：本次 DMG 仅 8.7M，Electron
  同类应用打包体积通常是这个量级的十几倍以上）。
- **最大未闭环风险（P0，见第 6 节详述）**：本次交付在 **Apple Silicon + macOS 26.1
  （仅 CommandLineTools，无完整 Xcode）环境下交叉编译**（`swiftc -target
  x86_64-apple-macosx11.0`），静态验证（`lipo -archs`、`LC_BUILD_VERSION`、并发符号
  门禁、`codesign -v`）全部通过，**但从未在真实 2014 MacBook Air / Big Sur 11 上实际
  加载运行过**。SDK 26 交叉编译产物在 Big Sur 上的运行时行为（尤其 WKWebView 具体版本
  的特性支持、字体渲染、`presentationOptions` 各标志位的实际压制效果、`NSSecureTextField`
  等 AppKit 控件的外观/行为）目前只能通过阅读文档、类比经验判断，不能通过本地工具链
  static 验证覆盖——这是架构选择本身固有的验证缺口，不是实现质量问题。
- **备胎方案：Electron 37**（三路评审已讨论的备选项，REQ-DESK-03 允许"也可以评估更轻的
  原生方案"，隐含如果原生方案在真机验证中失败需要退路）：
  - 优势：Electron 有官方预编译的 `darwin-x64` 二进制，不存在本卡遇到的"在 arm64 机器
    上交叉编译 x86_64 产物、还要担心 Big Sur 运行时兼容性"这层风险；Chromium 内核版本
    是官方锁定值，行为可预测性比"系统自带 WKWebView 具体版本随 OS 补丁浮动"更高。
  - 代价：RSS 显著更重（典型 300-500MB vs 本方案约 40-80MB 量级，见 3.6 节），在 4GB
    机器上把可用内存预算从"约 2GB 富余"压缩到紧张区间；打包体积也会大幅增加。
  - 触发条件：若第 6 节 P0 真机验证发现 AppKit/WebKit 交叉编译产物在 Big Sur 上无法
    正常运行（例如 WKWebView 白屏、字体/渲染异常、`presentationOptions` 完全失效等
    阻断级问题），才启用这条退路；目前没有证据表明需要切换，本卡不建议在未验证问题
    存在之前提前迁移。

---

## 5. 本地运行 / 安装方式（验收标准 3）

完整步骤见 `app/README.md`，此处仅做索引，不重复维护第二份说明（README 内容已核对
完整，本卡未修改）：

| 场景 | 方式 | README 章节 |
|---|---|---|
| Web 层单独调试（不启动原生壳） | `open web/index.html`（`file://` 直开）或 `cd web && python3 -m http.server 8080` | 「本地开发」 |
| 原生壳窗口化调试（不锁屏、不吞 Cmd+Q，可反复验证） | `./build.sh --run`，或对已构建产物执行 `WTJ_WINDOWED=1 open dist/WorkTimeJustin.app` | 「本地开发」「构建」 |
| 正式构建 + 自检 | `./build.sh`（构建 + 自动验证，见第 2 节） | 「构建」 |
| 目标机安装（2014 MacBook Air / Big Sur 11） | U 盘或 `scp` 拷贝 `.dmg`（避开 quarantine 标记）→ 挂载拖入 `/Applications` → 首次启动如遇 Gatekeeper 拦截，右键「打开」二次确认或 `xattr -cr` 清除隔离属性 | 「目标机安装步骤」 |
| 设置家长退出口令 | `--set-passcode <口令>` 或 `WTJ_SET_PASSCODE=<口令>` 环境变量（默认口令 `worktime`，建议改掉） | 「设置家长退出口令」，安全细节见 `SECURITY.md` |
| 默认（无参数）启动行为 | **kiosk 全屏模式**，接管整个屏幕，请勿在自己正在使用的机器上直接双击 | README 开头提示 |

---

## 6. P0 真机 QA / 风险清单（验收标准 5，交 QA 022）

以下各项**在本地构建机（Apple Silicon / macOS 26，无 2014 MacBook Air 实机）上无法
闭环验证**，必须在真实 2014 MacBook Air / Big Sur 11 上测试，标记为 **P0**：

| # | 项目 | 为何本机测不了 | QA 022 怎么测 |
|---|---|---|---|
| 1 | SDK 26 交叉编译产物能否在 Big Sur 11 上加载运行 | 本机只有 Apple Silicon + macOS 26，无法运行 x86_64 Big Sur 系统；交叉编译产物的静态门禁（`lipo`/`LC_BUILD_VERSION`/`codesign`）全部通过不代表运行时一定正常 | 把 `dist/WorkTimeJustin.dmg` 通过 U 盘/scp 拷贝到真机，安装后双击启动，确认 App 能正常起来、WKWebView 能加载出 web 内容而非白屏/崩溃 |
| 2 | 全屏 kiosk 与 `presentationOptions` 对 `Cmd+Tab` 的实际屏蔽效果 | `presentationOptions` 是系统级标志位，效果依赖具体 macOS 版本实现，本机是 macOS 26，标志位含义/生效程度可能与 Big Sur 11 不同 | 真机 kiosk 模式下反复按 `Cmd+Tab`/做四指切换手势，记录是否真的被压制、压制到什么程度（完全无反应 / 短暂闪一下 / 能切出去），对照 `SECURITY.md` 第 2 节的诚实边界描述是否准确 |
| 3 | `Cmd+H`/`Cmd+W`/`Cmd+Q`/`Cmd+M` 拦截实效 | 本地窗口化冒烟只能验证"事件被吞掉、App 未退出/隐藏/最小化"这层逻辑本身没问题，但键盘硬件重复率、系统事件分发时序在真机 Intel 键盘上可能不同 | 真机 kiosk 模式下分别单按、连按每个组合键，确认均不触发退出/隐藏/最小化/切窗口；同时验证 `NSEvent` monitor 没有漏拦的边界情况（比如极快连按） |
| 4 | HD5000 上烟花/粒子帧率 | 本机 Apple Silicon GPU 性能远超 HD5000，任何帧率数字都不能反映 2014 年集成显卡的真实承受能力（第 1 节已说明两机不能互相外推） | 烟花引擎实现后，真机上触发宝箱开启（300 粒子）与其余动画同时叠加的最坏情况，用 `app.js` 已有的 `dbgFps` 面板或系统自带工具实测帧率，确认是否维持在可接受范围（不要求恒定 60fps，但不应出现持续性掉到个位数帧率） |
| 5 | 4GB 下实际 RSS 与内存压力 | 第 2.4 节测的 32.3M/96.4M 物理足迹是 Apple Silicon/macOS 26 上的数字，架构和系统都不同，不能作为 4GB Intel 机器上的真实占用依据 | 真机运行时用 `Activity Monitor` 或 `vmmap --summary` 采样物理足迹，跑满典型使用场景（秘密词命中若干次、完成任务触发宝箱烟花、词池扩展后模拟更多常驻 sprite）后确认是否逼近或超过第 3.6 节"约 2GB 应用可用预算" |
| 6 | `file://` 音频加载（019 卡替换加载层后） | 本机测试目前音频文件本身还未交付（第 3.4 节），且 `fetch()` 在本机浏览器直开模式下不会复现 `WKWebView.loadFileURL` 的 file scheme 限制 | 019 卡完成加载层替换后，真机 kiosk 模式下触发依赖音频的交互（秘密词命中、按键音效等），确认真的能听到声音而非静默降级；同时验证首次用户手势解锁 `AudioContext` 的门控在真机 WebKit 上的实际行为 |
| 7 | 长按 Esc ≥5 秒退出 | 本机键盘长按连发（key repeat）速率、去重逻辑在不同硬件/系统上可能有细微差异；且这是唯一的正式退出路径，必须在真实目标环境验证不会误触发也不会失效 | 真机 kiosk 模式下用不同长按时长测试（<5秒应不弹窗、恰好5秒左右应弹窗、松开后重新计时不累加），确认底部进度条提示与最终口令框弹出行为符合 `SECURITY.md` 描述 |
| 8 | 合盖 / 电源事件恢复 | `main.swift` 未发现专门的睡眠/唤醒事件处理代码（第 3.7 节），本机（笔记本或 Mac 主机环境）无法复现"2014 MacBook Air 实体合盖重开"这一具体交互 | 真机上 kiosk 全屏运行时合盖等待数秒/数分钟再打开，确认窗口仍在最前、仍是全屏 kiosk 状态、Canvas2D 渲染循环（rAF）恢复正常，未出现黑屏/花屏/焦点丢失导致键盘失灵等问题 |
| 9 | WebKit 实际版本与特性支持 | Big Sur 11 的系统 WKWebView 版本无法在本机复现，只能类比"约等于 Safari 14"，具体某个 CSS/JS 特性（如 `prefers-reduced-motion`、Canvas2D 具体渲染细节）是否被支持需要实证 | 真机上打开浏览器调试面板（或用 `console.log` 输出 `navigator.userAgent`/`navigator.appVersion`）确认实际 WebKit 版本；抽查项目里依赖的关键特性（`prefers-reduced-motion` media query、`Array.prototype` ES2020 方法、`AudioContext`/`decodeAudioData`）在真机上表现是否符合预期 |
| 10 | 老旧电池下持续满帧场景的系统级降频表现 | 本机电池状态/系统温控策略与 6+ 年老化电池的 2014 款机型完全不同，无法模拟"系统因电量/温度主动降频"这一状态 | 真机在低电量或长时间运行发热后，观察系统是否触发降频、App 是否在此状态下仍保持基本可用（不要求高帧率，但不应崩溃/无响应），为是否需要第 3.7 节提到的"主动降级"后续卡提供依据 |

---

## 7. 与需求文档的对照

| REQ ID | 内容 | 本文档覆盖情况 |
|---|---|---|
| REQ-DESK-01 | 目标机为 2014 款 MacBook Air，应用以 macOS 桌面全屏方式运行 | 第 1 节机型对照 + 第 3.7 节全屏稳定性现状 + 第 6 节 P0 #1/#2/#8 |
| REQ-DESK-02 | 应用需能打包成可安装/启动形式，例如 DMG 或等价分发方式 | 第 2 节打包链路确认（exit 0，产物齐全） |
| REQ-DESK-03 | Electron 是否可接受需 TL 做性能验证；也可评估更轻的原生方案 | 第 4 节方案兼容风险 + Electron 37 备胎评估；第 3 节性能预算表即"性能验证"的量化交付物 |
| REQ-DESK-04 | 系统级快捷键未必能 100% 禁掉 | 第 6 节 P0 #2/#3（真机验证实效），已有边界说明见 `SECURITY.md` 第 2 节，本文档不重复展开只做交叉引用 |
| REQ-DESK-05 | 更强控制需系统设置/辅助功能配合，不虚假承诺 | 同上，`SECURITY.md` 第 3 节已覆盖，本文档不重复 |
| `#open` 待确认项「2014 MacBook Air 上的性能预算：动画数量、分辨率、音频加载、全屏稳定性」 | 本文档第 3 节逐项给出预算值 + 依据 + 降级策略，直接落实该待确认项 |
| `#open` 待确认项「第一版技术壳：Electron、Swift/Objective-C，或其他轻量桌面方案」 | 第 4 节确认当前落地方案（Swift/AppKit + WKWebView）与备胎（Electron 37）的取舍依据 |

---

## 8. 引用来源一览

- `docs/index.html`：`#desktop`（REQ-DESK-01~05，第 1093-1112 行）、`#assets`（第
  1026-1091 行）、`#rewards`（第 1004-1024 行）、`#params`（参数与阈值总表，第
  1141-1171 行）、`#open`（待确认项，第 1174-1198 行）。
- `app/web/manifest.js`：`performance` 域（第 476-493 行）、`rewards.chest.fireworks`
  （第 340-361 行）、`secretWords.poolTargetSize`（第 132 行）、`assets.audioPolicy`
  （第 464-472 行）。
- `app/web/audio.js`：`MAX_CACHE_ENTRIES`（第 53 行）、`loadArrayBuffer`/file:// 风险
  注释（第 391-401 行）、双 `AudioContext` 已知问题注释（第 216-225 行）、`unlock()`
  （约第 250 行起）。
- `app/web/audio/AUDIO-API.md` §6.3（`loadFileURL` 的 file scheme fetch 限制）。
- `app/web/assets/PROVENANCE.md`（"性能优化留给 018 卡"条目，本文档 3.2 节即该评估）。
- `app/web/app.js`：`dpr` 处理（第 49 行）、`IDLE_TIMEOUT_MS`（第 271 行）、
  `draw()`/`drawTrail()`/`drawRings()`/`drawLetters()`（第 272-352 行）。
- `app/web/index.html`：单一 `<canvas id="stage">`（第 18 行）。
- `app/web/secretword.css`、`app/web/task-templates.css`：sprite 显示尺寸 `clamp()`
  规则，`prefers-reduced-motion` 覆盖。
- `app/shell/main.swift`：`KioskWindow`（约第 163 行）、
  `mediaTypesRequiringUserActionForPlayback`（第 439 行）、`loadFileURL`（第 458 行）、
  `presentationOptions`（第 469-470 行）。
- `app/build.sh`：`MIN_OS`（第 16 行）、`-swift-version 5` 理由注释（第 53 行）、
  交叉编译目标（第 56/60 行）、构建后自动验证（第 107-171 行）。
- `app/README.md`：技术栈、构建、目标机安装、已知边界各节。
- `app/SECURITY.md`：第 2 节「拦不住什么」、第 3 节「家长可以做的补强」。
- 本次实跑：`cd app && ./build.sh`（exit 0，见第 2 节）与 `--run` 窗口化冒烟内存采样
  （见第 2.4 节）。
