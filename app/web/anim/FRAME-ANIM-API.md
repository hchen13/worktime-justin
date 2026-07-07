# `window.WTJ_FRAME_ANIM` — 生产动效帧序列播放引擎 API

对应飞书卡：`WTJ-20260704-056`（接入生产动效帧序列播放引擎）。
实现文件：`app/web/frame-anim.js`（单文件）+ `app/web/anim-manifest.js`（构建期生成的
数据文件，由 `app/scripts/build-anim-assets.sh` 从 `docs/assets/production-animations-v1/`
的 v1 已验收道具生成，**请勿手工编辑 anim-manifest.js**，重新生成见第 6 节）。

**本卡边界（先读）**：三路技术评审（2 opus + 1 fable 共识）定案方案——**Canvas 逐帧
`drawImage` + 可注入 `clockRef` 时钟（绝对时间推帧号，非 `requestAnimationFrame`）+ 构建期
降采样 256px cell strip sheet**。本卡只接入 v1 已验收的四个道具：`faucet` / `horse` /
`lamp` / `treasure-chest`；`door` / `bell` 属于源 manifest 的 `v1_boundary.deferred_to_v2`
（DESIGN 素材质量未验收），本卡**不接入**，只在消费方（014/011）的映射表里留位并标注上游
依赖，见第 7 节。

已接入 `index.html`：`<script src="anim-manifest.js">` 与 `<script src="frame-anim.js">`
排在 `manifest.js`/`task.js` 之后、`task-templates.js`（014）与 `reward-chest.js`（011）
之前——两者都调用本引擎暴露的 API。

---

## 1. 加载方式

```html
<script src="manifest.js"></script>
<!-- ... slots/keyboard/pointer/app/hud/secretword/task ... -->
<script src="anim-manifest.js"></script>
<script src="frame-anim.js"></script>
<script src="task-templates.js"></script>
<!-- ... status-rewards ... -->
<script src="reward-chest.js"></script>
```

加载后暴露一个**已冻结**的全局对象 `window.WTJ_FRAME_ANIM`（`Object.freeze` + 绑定本身
`Object.defineProperty` 不可写/不可重配置，与 `task.js`/`pointer.js`/`reward-chest.js` 等
同款加固）。语法基线 ES2020 以内（Safari 14 兼容；实际只用到 Safari 11.1+ 的
`HTMLImageElement.prototype.decode()`，比语法基线更保守）：全文 `var`/`function` 声明式，
不使用箭头函数 / `let` / `const` / 模板字符串 / 可选链 `?.` / 空值合并 `??`，无
`import`/`export`，零外部请求。**本模块只应被引入一次**（IIFE 顶部 `if (window.WTJ_FRAME_ANIM)
{ return; }` 守卫）。

## 2. Safari 14 硬约束（红线，不可违反）

只使用 `HTMLImageElement + ctx.drawImage() + img.decode()`（11.1+）驱动帧内容；**禁止**：
- `createImageBitmap()`（Safari 15+ 才有）
- `OffscreenCanvas`
- CSS `animation-timing-function: steps()` 驱动帧切换
- `animationend`/`transitionend` 事件驱动播放状态机
- `requestAnimationFrame`（见第 3 节，改用可注入时钟）
- `ctx.shadowBlur`（`app/PERFORMANCE.md` 3.1 节红线，HD5000 上逐像素软件混合代价极高）

## 3. 计时驱动方式：可注入时钟，非 rAF

与 `task.js`/`task-templates.js`/`status-rewards.js`/`reward-chest.js` 完全一致的工程取舍：
真实 `requestAnimationFrame` 的时间戳不受注入时钟控制，单元测试无法确定性地"跳到某一时刻"
断言应该画第几帧。本引擎用固定节拍 `TICK_MS=16`（约 60Hz）的 `clockRef.setTimeout` 链采样，
但**帧号本身用绝对时间差计算**（`floor((now - startTime) / 1000 * fps)`），不是"每次 tick
递增一个计数器"——这就是"seek-safe"的准确含义：任何时刻问"现在该显示第几帧"，答案只取决于
经过的绝对时间与 `fps`，与中途 tick 了多少次、是否丢过 tick 完全无关。`loop` 用取模回绕；
非 `loop` 在到达最后一帧后 clamp 定住，不再前进，并触发一次 `onComplete`。

## 4. API

### `play(canvasEl, prop, state, opts)` → `boolean`

在 `canvasEl`（必须是 `<canvas>`，`typeof canvasEl.getContext === 'function'`）上播放
`anim-manifest.js` 里 `prop`/`state` 对应的帧序列。

- `opts.loop`（可选 boolean）：显式传入时**覆盖** anim-manifest 里该 state 的默认 `loop`
  值。这个覆盖能力是 014/011 复用同一份 state 数据表达不同语义的关键：例如 `horse.run`
  源数据 `loop:true`（马原地不停跑），014 的点击任务用它表达"完成态"时传 `{loop:false}`，让它
  播完一整轮后 clamp 在最后一帧定住，而不是无限跑下去（`bell.ring` 是同一模式的另一例）。
  WTJ-20260706-009：faucet 反过来利用了这个覆盖能力的"另一半"——`faucet.running` 源数据
  `loop:true`，被点击任务当作 **idle** 态复用（`createPropEl()` 对 idle 恒传 `{loop:true}`），
  持续流水；而它的 active 态换成了源数据本就 `loop:false` 的 `faucet.closing`（6 帧一次性
  关水过程），见 task-templates.js `PROP_ANIM_STATE_MAP`。
- `opts.onComplete`（可选 function）：仅在**非 loop**播放到达最后一帧时触发一次
  （`completeFired` 标记保证"恰一次"，即使后续还有别的 tick 落在同一 canvas 上）。loop
  播放永不触发 `onComplete`（循环没有"完成"这个概念）。**触发时机在两条代码路径下不完全
  一致（约 1/fps 的偏差，见下）**：
  - 常规逐帧路径（多帧、非 reduced-motion）：`onComplete` 在"首个采样到末帧的 tick"上触发，
    也就是约 `(frameCount-1)/fps` 秒（末帧的**起始**时刻），而不是整段 `frameCount/fps` 秒
    （末帧**播完**时刻）——因为帧号是 `floor(elapsed*fps)`，到达 `frameCount-1` 即判定完成，
    不会再等最后一帧显示满 `1/fps` 秒。
  - reduced-motion 路径与单帧（`frameCount<=1`）快路径：`onComplete` 在整段 `getDuration()`
    （= `frameCount/fps`，四舍五入到毫秒）对应的时刻触发。
  两条路径因此相差约 `1/fps` 秒（例如 fps=10 时约 100ms）。这是刻意的实现权衡而非 bug：常规
  路径的判定天然发生在"末帧已经画出"的那一 tick，reduced-motion/单帧路径没有逐帧 tick、只能
  按名义总时长安排一个定时器。**本卡所有消费方的 `onComplete` 都是 no-op 或对这点偏差不敏感**
  （011 宝箱的 `onComplete` 是预留 no-op；014 不直接用 `onComplete` 做时序，而是用
  `getDuration()` 显式算 `COMPLETE_VISUAL_HOLD`），因此这点偏差无实际影响。若未来某个消费方
  需要 `onComplete` 精确对齐"末帧播完"，应改为统一在 `getDuration()` 时刻触发（届时需同步更新
  本节与相关单测）。
- 同一个 `canvasEl` 上重复调用 `play()`：先隐式 `stop()` 掉这个 canvas 上前一次的播放，
  再开始新的一次（同一 canvas 同一时刻只应有一个播放态）。
- **防御式返回 `false`（不抛错）的情况**：`canvasEl` 缺失/不是 canvas；`prop` 在
  `anim-manifest.js` 里没有条目（`door`/`bell` 恒在此列，见第 7 节）；`prop` 存在但
  `state` 不存在。调用方应据此回退静态占位（014/011 均已实现，见各自源码）。
- 单帧 state（`frameCount<=1`，如 `faucet.off`/`faucet.closed`/`lamp.off`/`lamp.on`）走
  性能优化的快路径：画一次即返回，**不进入 tick 循环**（一张恒定不变的图没有必要每 16ms
  重绘一次）。

### `stop(canvasEl)`

停止该 canvas 上的播放（清 tick 定时器、移出内部注册表）。canvas 上最后一次 `drawImage`
的内容保留在画布上（本引擎不清空 canvas 本身，内容的生命周期由调用方决定——通常调用方会
紧接着把这个 canvas 元素本身从 DOM 里移除）。对未播放的 canvas 调用是安全的 no-op。

### `preload(prop, state)` → `boolean`

预热 `new Image()` + `img.decode()`，不等待其完成。`prop`/`state` 在 anim-manifest 里
存在返回 `true`（即便图片仍在加载/解码中），不存在返回 `false`。同一 `sheetPath` 全局
只会创建一次 `Image`（`play()` 与 `preload()` 共用同一份缓存），重复调用不会重复下载/解码。

### `getDuration(prop, state)` → `number`（毫秒）

`frameCount / fps * 1000` 四舍五入，**与该 state 的 `loop` 是否为 `true` 无关**——即使是
循环动画也返回"一个完整循环周期"的时长。`prop`/`state` 缺失返回 `0`。

用途：014 用它计算 `COMPLETE_VISUAL_HOLD`（完成态 DOM 延迟移除的可见窗口）不能小于 activeState
实际播放一轮所需的时间，防止未来素材加长后动画被腰斩（见 `task-templates.js` 文件头
`computeVisualHoldMs()` 一节）。

### `getState()` → `object`

```
{
  availableProps: string[],     // anim-manifest.js 里当前存在的 prop key（faucet/horse/lamp/treasure-chest）
  deferredProps: string[],      // ['door', 'bell']，纯提示性，不参与任何功能判断
  idleStopSec: number,          // 当前生效的 idle-stop 秒数（见第 5 节）
  activePlaybacks: [{ prop, state, loop, reducedMotion, idlePaused, completeFired }]
}
```

供 QA/单测内省引擎状态，不是渲染契约的一部分（字段可能随实现细节调整）。

### `_setClock(clock)`

测试专用（与 `task.js`/`pointer.js`/`task-templates.js`/`reward-chest.js` 同款模式）。
`clock` 可只提供 `setTimeout`/`clearTimeout`/`now` 的子集，未提供的部分保留默认真实实现。
**不是给其余生产代码调用的稳定契约。**

## 5. `prefers-reduced-motion`

命中时（`window.matchMedia('(prefers-reduced-motion: reduce)').matches`）：不跑 tick 循环
（零 CPU 占用），只画一次"终帧"：

- **loop 动画**（如常驻的道具 idle 态）→ 定格在**第 0 帧**（静息语义：没人操作时道具本来
  就该是静止的）。
- **非 loop 动画**（如点击任务的 active 态、宝箱的 `opening`）→ 定格在**最后一帧**（保留
  "孩子应该看到成功/宝箱已经打开"这个产品意图，不能因为关闭动效就让孩子什么反馈都看不到）。

**`onComplete` 仍会触发**：非 loop 动画仍然会触发一次 `onComplete`，只是中途不画任何中间帧
——这样调用方（如 014 的 `COMPLETE_VISUAL_HOLD` 计算）不需要为 reduced-motion 用户单独写
一套时序分支。**触发时刻是 `getDuration()`（= `frameCount/fps`）**，比常规逐帧路径（约
`(frameCount-1)/fps`）晚约 `1/fps`——这个两路径间的偏差见第 4 节 `onComplete` 条目的详细说明，
对本卡所有消费方无实际影响。

## 6. 降采样构建管线

`app/scripts/build-anim-assets.sh`：

```bash
cd app && ./scripts/build-anim-assets.sh
```

- 用 `sips` 把 `docs/assets/production-animations-v1/` 下 v1 已验收四道具（faucet/horse/
  lamp/treasure-chest）每个 state 的 1024px cell strip sheet，降采到 **256px cell 高**
  （宽度按同一比例缩放，cell 保持正方形不变形），输出到
  `app/web/assets/anim/<prop>/<state>-sheet.png`。
- 生成 `app/web/anim-manifest.js`（`window.WTJ_ANIM_MANIFEST = Object.freeze({...})`），
  每个 `[prop][state]` 一条 `{ sheetPath, frameCount, fps, loop, anchor, cellSize }`，数据
  直接来自源 `manifest.json` 的 `frame_sheet`/`frames`/`fps`/`loop`/`anchor` 字段（顶层
  `docs/assets/production-animations-v1/manifest.json` 取 faucet/horse/lamp；
  `docs/assets/production-animations-v1/treasure-chest/manifest.json` 取 treasure-chest，
  因为顶层 manifest 未收录它，见该文件 `scope_note`）。
- **只处理 v1_boundary.included**：`door`/`bell` 属于 `deferred_to_v2`，脚本读取顶层
  manifest 的 `v1_boundary.deferred_to_v2` 字段后主动跳过，不生成它们的任何降采资产或
  anim-manifest 条目。
- 幂等、全量重新生成（不做增量缓存），失败时非 0 退出。

**为什么是 256px**：`task-templates.css` 里道具的实际 CSS 显示尺寸上限是
`clamp(88px, 12vw, 160px)`，宝箱是 `clamp(150px, 20vw, 300px)`（`reward-chest.css`）——
256px 已经覆盖两者的显示尺寸上限（含 Retina 2x 场景），相比原样 1024px 解码内存降到
`(256/1024)^2 = 1/16`。实测：全部 15 个 `(prop, state)` 组合原始 sheet 解码后（RGBA 内存，
非磁盘 PNG 大小）合计约 232MB，降采后约 14.5MB；PNG 磁盘体积从约 18.4MB 降到约 2.9MB
（压缩比约 6.4x，PNG 压缩效率在不同分辨率下不同，disk 体积压缩比小于解码内存压缩比属预期
现象）。4GB 目标机（`app/PERFORMANCE.md` 3.6 节"约 2GB 应用可用预算"）下，原样 1024px 解码
内存必然引发内存压力甚至 OOM，降采后回到个位数 MB 量级，落在预算内。

## 7. `door`/`bell` 已接入（WTJ-20260705-025）

> 历史：056 卡交付时 `door`/`bell` 曾在 `v1_boundary.deferred_to_v2`，走静态 `<img>` 占位回退，
> 原因是当时 P0 先做 faucet/horse、且 door/bell 的 pose-specific 生成尚未验收。**WTJ-20260705-025
> 起两者的 v1 动画（卡 `WTJ-20260704-030` 门开 / `WTJ-20260704-031` 铃响，均已 DESIGN 验收 done）
> 已从 `deferred_to_v2` 移入 `included` 并接入运行时引擎。**

`docs/assets/production-animations-v1/manifest.json` 的 `v1_boundary` 字段现为：

```json
{
  "included": ["faucet off/running/closing/closed", "horse idle/run/stop_success", "lamp off/turning-on/on/turning-off", "door closed/opening/open", "bell idle/ring/settle"],
  "deferred_to_v2": [],
  "reason": "WTJ-20260705-025: door/bell v1 animations (cards -030/-031, DONE) integrated; nothing deferred at v1."
}
```

接入方式（正是本文档第 209 行起早就写明的「重跑即纳入」路径，未改脚本任何逻辑）：

- **顶层 manifest**：把 `door`/`bell` 从 `deferred_to_v2` 移入 `included`（数组门禁，脚本数据驱动）。
- **`app/scripts/build-anim-assets.sh`**：重跑即自动降采 `door`（closed/opening/open）与
  `bell`（idle/ring/settle）的 strip sheet 到 `app/web/assets/anim/{door,bell}/`，并写入
  `anim-manifest.js`（现含 6 个 prop）。door/bell 的源 `manifest.json` 早已就位于各自目录，
  结构与 treasure-chest 一致，被脚本的独立子目录发现逻辑识别。
- **`task-templates.js` 的 `PROP_ANIM_STATE_MAP`**：追加两行映射 —— `door: { idle:'closed',
  active:'opening' }`（click-door-open 点击开门，opening 为 5 帧一次性过程，播完定格）、
  `bell: { idle:'idle', active:'ring' }`（click-doorbell-ring 点击摇铃，ring 源 loop:true，
  onClick 传 `{loop:false}` 播一轮定格，与 `horse.run` 同构）。`resolvePropAnimInfo()`
  对二者不再返回 `null`，`createPropEl()` 用 `<canvas>` 承载真实帧动画（引擎缺失时仍回退静态
  `<img>`，防御式路径不变）。
- **未来若再暂缓某 prop**：把它加回 `deferred_to_v2` 重跑脚本即可，脚本逻辑无需改动。

## 8. idle-stop 与 `app/PERFORMANCE.md` 3.1 节的关系（据实记录）

`app.js` 现有的"无操作 5 秒后停止 rAF"机制（`IDLE_TIMEOUT_MS`/`lastActivity`/`poke()`）是
该文件函数作用域内的私有闭包状态，**没有通过任何 `window.WTJ_*` API 对外暴露**，本卡范围
明确不允许改动 `app.js`（"不碰 manifest.js/shell/其他引擎逻辑"）。因此本引擎无法直接复用
`app.js` 内部那一份"最近活动时间"状态，而是实现了一份**独立的**活动检测：

- 监听同一类活动信号（`pointermove`/`pointerdown`/`mousemove`/`keydown`），并把"新的一次
  `play()` 调用本身"也算作活动。
- 读取**同一个** `window.WTJ_MANIFEST.performance.idleStopSec` 配置值（默认 5 秒，与
  `app.js` 完全一致的红线数值来源，只是两份独立的运行时状态，不是共享同一个内部变量）。
- 仅对 **loop** 播放生效：无活动超过 `idleStopSec` 秒后暂停该 canvas 的 tick（画面定格在
  当前帧，停止消耗 CPU），下一次活动到来时自动恢复。非 loop 播放本身时长有限，播完自然
  收敛，不需要这层保护。
- **落地下限**（卡片原文"至少：引擎 stop 时清 tick"）：任何播放在 `stop()` 时都会立即清掉
  其 tick 定时器，这是无条件保证，不依赖上面的 idle-stop 逻辑。014/011 在移除承载 canvas
  的 DOM 元素之前都会调用 `stop()`：014 见 `removeElementDefensive()` 里的
  `stopPropAnimDefensive()`；011 同样在它自己的 `removeElementDefensive()` 里调
  `stopFrameAnimDefensive()`（Fable 对抗评审 P1-1 修复——此前 011 只摘 DOM 不调 `stop()`，
  导致引擎 `playbacks` 注册表 + detached 256×256 canvas 逐轮泄漏；现已修正，`reward-chest.test.mjs`
  有对应断言）。保证播放不会绑在一个已经从文档树摘除的 canvas 上、也不会有 playback 项永久
  滞留在引擎注册表里。
  - **为什么引擎不自动移除播完的 non-loop playback**：`tick()` 到末帧后只 `return`（停 tick）、
    不 `splice` 出注册表，是为了让 `getState()` 在播放完成后仍能被 QA/单测观察到那条 playback
    的终态（`completeFired:true`）。代价就是调用方**必须**显式 `stop()` 来回收——这个契约对
    014/011 都已落实。

若未来有更多模块需要共享同一份"全局最近活动时间"，建议的后续重构方向是让 `app.js` 显式
暴露一个 `window.WTJ_APP.onActivity(fn)`/`isIdle()` 之类的最小接口，由本引擎与其余模块统一
订阅，而不是像现在这样各自维护一份独立实现——这是本卡刻意记录、留给后续卡评估的技术债，不是
本卡范围内的缺陷。

## 9. 与 014 / 011 的分工

| | 内容 | 详见 |
|---|---|---|
| 014 `task-templates.js` | `PROP_ANIM_STATE_MAP`（faucet/horse/lamp 的 idle/active 映射）、道具级 `<canvas>` 挂载与静态 `<img>` 回退、`COMPLETE_VISUAL_HOLD` 用 `getDuration()` 校正 | 该文件头部注释「动效引擎接入」一节 |
| 011 `reward-chest.js` | 宝箱本体从静态 `<img>` 换成 `WTJ_FRAME_ANIM.play(canvas, 'treasure-chest', 'opening', {...})`，复用已有 `clockRef`/`_setClock`；烟花 `BURST_SCHEDULE` 的错峰时间线保持独立不变（据实记录的偏离，见该文件 `playChestOpeningAnimDefensive()` 注释：烟花时间点已被单测精确锁定，本卡不改） | 该文件头部注释「宝箱开箱动效接入」一节 |

## 10. 道具级独立 canvas（不是全局共享 overlay）

调用方各自为每个道具/宝箱创建一个专属 `<canvas>` 元素传给 `play()`，本引擎不维护一个"全屏
共享画布"集中绘制所有道具。原因：`app/web/pointer/POINTER-API.md` 的命中判定是对**每个注册
target 的 DOM 元素**分别调用 `getBoundingClientRect()` 算包围盒，如果所有道具共用同一张
铺满全屏的 canvas，这张 canvas 的包围盒永远是"整个屏幕"，会让 012 的点击/拖拽/悬停判定失去
意义。因此本引擎的设计前提是"canvas 元素的 DOM 包围盒 == 该道具的可点击区域"，与此前
`<img>` 占位的定位方式完全一致，只是内容来源从"一张静态 PNG"换成"引擎逐帧绘制的 cell"。
