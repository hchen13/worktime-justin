# WTJ-20260706-005 — 奖励烟花运行时粒子系统：方案汇总（TL 综合 3 视角技术评审）

评审：方案/架构（opus）· 粒子物理（opus）· 旧 Mac 性能+可测试性（fable）。三视角强收敛，结论如下。

## 1. 架构决定
- **渲染 = Canvas 2D**。明确否决 SVG/CSS/DOM（2014 MBA/HD5000 WKWebView 上 300 级 DOM 节点 layout/composite 崩）与"复用 WTJ_FRAME_ANIM"（它是 sprite-sheet drawImage 定帧播放器，不能做动态粒子物理；继续只管宝箱本体贴图）。
- **新模块 `window.WTJ_REWARD_FIREWORKS`，新文件 `app/web/reward-fireworks.js`**。加载顺序：manifest.js 之后、消费方（status-rewards.js / reward-chest.js）之前。只依赖 manifest.performance。
- **canvas-agnostic 引擎 + `playbacks[]` 注册表**（照搬 frame-anim.js 的 findPlayback/isActive/stop 模式），支持 chest 与 task-complete 并发、连续 task-complete 叠放。per-playback 状态 `{canvas,ctx,particles[],style,origin,startTime,tickTimerId,burstTimerIds,onComplete,reducedMotion}`。
- **最大化复用 reward-chest.js 已验收内核**：makeParticle / updateParticles(重力+阻力+life) / spawnBurst(预算裁剪) / 双层圆柔光(无 shadowBlur) / renderFrame / clockRef+_setClock / TICK_MS=16 tick 链 / jitterColor / spawnStaticFrame(reduced-motion)。留在 reward-chest.js 的：overlay root、宝箱本体、背景光晕、sfx、WTJ_HUD.setChestOpen、WTJ_SLOTS.reset。
- **API**：`play(styleId, opts)->handle` · `stop(handle)` · `stopAll()/reset()` · `getState()` · `_setClock(clock)` · `_setRandom(fn)` · `_setTier(tier)` · `_getParticles(handle?)`。opts=`{canvas?(缺省用模块单例全屏 overlay canvas), origin:{x,y}|{leftPercent,topPercent}, tier?, onComplete?}`。

## 2. 三形态（007 style-params 固化进模块 STYLE_PARAMS）
每粒子结构在现有基础上**只加 2 个可选字段** `dragScale`(默认1)、`fadePow`(默认1)。重力/阻力**改 per-style**。
- **molten-fountain**（chest-open 高潮）：950ms，gravity260/drag0.9，counts 120/210/280。3 层：warm base(0.62) / long gold-trail(0.30,低阻高速拉尾) / cyan accent(0.08,#8EEBFF,secondary)。origin 在奖励物下方、上扬 90°±35° 扇形 → 天然清空下 1/3 可读区。
- **starburst**（task-complete 主）：720ms，gravity120/drag1.3，counts 70/120/160。5 主射线(-90°+i·72°+每触发整体旋转 rotationBase+jitter±7°) + 5 短次射线(+36°) + 中心 flash（~8 粒白，单粒 alpha 硬封顶 0.35 = 007 max_fullscreen_flash_alpha，避免全屏白闪）。
- **round-bloom**（task-complete 次/贴纸场景）：840ms，gravity40/drag2.0，counts 90/150/210。双环从 **r0≥0.17·min(w,h)** 偏移半径生成（落地"保留中心 34% 直径"占位）+ 380ms 迟落点(真重力)。
- **角度必备 helper `aim(deg,speed){r=deg·π/180; return {vx:cos(r)·speed, vy:-sin(r)·speed}}`**（007 用"水平轴起、向上为正"度数，canvas y 向下——不转换喷泉会朝下喷，高危踩坑）。
- **每次触发有变化**：所有 `Math.random()`→`fxRandom()`（`_setRandom` 可注入，默认 Math.random 生产真随机）+ per-trigger 专属量（molten accent 数 / starburst rotationBase / round-bloom 环相位）。

## 3. 性能红线落地（PERFORMANCE.md / 2014 MBA）
- **预渲染发光贴图**：init/首次 play 时构建缓存——每色×2-3 HSL jitter 变体×{dot,streak}，24-32px `document.createElement('canvas')`（禁 OffscreenCanvas/ImageBitmap，Safari 14）；"发光"= 构建期画一次 `createRadialGradient` 柔光+实心核（**createRadialGradient 只在构建期出现，永不进 tick**）。**每帧仅 = 1×clearRect + N×drawImage + globalAlpha**；**零 shadowBlur / 零逐帧 gradient / 零 getImageData**。星爆射线用 streak 贴图沿速度方向 rotate 拉伸（save/translate/rotate 仅限少量 ray 粒子）。颜色 jitter 量化为"预烘焙变体池里挑索引"（免每帧 fillStyle 切换）。
- **单张持久化全屏 overlay canvas**（pointer-events:none，不参与 012 命中；跨轮 clearRect 复用不销毁——修正 reward-chest 现"每轮新建 canvas"）。
- **tier**：不做 UA/机型嗅探（WKWebView 不可靠/不可测）。三来源：① manifest.performance 新增 `particleTier`（'old_mac'|'normal'|'burst'，默认 normal，与 idleStopSec/maxParticles 同处收拢）；② 模块内**自适应单向降级**：tick dt 走 EMA，连续慢 tick(dt>25ms) 降一档、dt>40ms 直落 old_mac 并砍 secondary layer，只降不升、本 session 粘滞（离群 dt>100ms 视为暂停恢复剔除，不误降）——dt 来自注入时钟故可确定性单测；③ `_setTier()` 钩子。burst 档仅 chest-open 用。
- **全局硬预算**：任意时刻存活粒子总数 ≤ `manifest.performance.maxParticles`(300)，**跨所有并发 effect 共享**（spawnLayer count = min(想要, 300-当前存活)）；tier 计数只是"目标值"，最终上限由共享预算 + 存活裁剪守住。
- **one-shot 清理**：粒子清零或到 durationMs 后 playback 自我出注册表 + 触发 onComplete（显式规避 frame-anim P1-1 泄漏）。updateParticles 的 dt 上限钳制（cap 100ms）防后台节流恢复时物理穿越。贴图缓存有界(≤~30 张 32px)构建一次永续。
- **Safari 14 语法基线**：全模块 var/function、无箭头/模板串/?./??、非 module、禁 OffscreenCanvas/ImageBitmap/fetch。

## 4. 两入口接线
- **chest-open**：reward-chest.js `runSequence()` 把 `scheduleFireworkBursts()+startTicking()+spawn*` 换成一次 `WTJ_REWARD_FIREWORKS.play('molten-fountain',{canvas:现有.wtj-rc-canvas, origin:chestOrigin(), onComplete})`；收尾仍由 reward-chest 的 sequenceTimerId 管；`reset()/clearOverlayChildren()` 摘 canvas 前先 `stop(handle)`（照抄 stopFrameAnimDefensive 防泄漏）。canvas 生命周期仍归 reward-chest（引擎只借 ctx 画 + stop tick）。
- **task-complete**：复用 task-templates.js 已 emit 的 `onTaskComplete({type,taskId,lightIndex,anchor})`（行 ~1023）。在 status-rewards.js 的 handleTaskComplete（已有 anchor 换算/reduced-motion/clock 管线）里调 `play(nextStyle, {origin: e.anchor || viewportCenter(), tier})`；starburst⇄round-bloom 严格交替。anchor 为空必须 viewportCenter() 兜底（否则在 (0,0)/NaN 炸开）。

## 5. 两个产品决策（TL 建议 + 需 Ethan/PM 目视确认，均触及已验收行为）
- **D1 task-complete 视觉**：status-rewards.js 现有一套 onTaskComplete 的金色 sparkle burst+成功环(~450ms)。**TL 建议：新 starburst 取代它**（单一系统、贴 007 新 DESIGN 方向）。属改动已验收视觉，交 Ethan 目视定。
- **D2 chest-open 时间线**：reward-chest.test.mjs 用逐时间点粒子数 + 预设名把现有 BURST_SCHEDULE(0/320/680/1040/1360ms=80/100/80/70/40)锁成验收标准。chest→molten-fountain 会改这套 → **该单测须整体搬迁到新 reward-fireworks.test.mjs 并声明；reward-chest.test 改用 FIREWORKS stub**（与它对 WTJ_FRAME_ANIM stub 同策略，不两份重复锁同一时间线）。**TL 建议：按卡片意图 chest→molten-fountain + 迁移测试**（零"两份锁"）。
- **D3 reduced-motion**：现宝箱=静态定格一帧（不进 tick）；007=减半+跳 secondary（仍动）。**TL 建议：两入口统一沿用"静态定格"**（更保守可测，吸收 007 skip-secondary 进构图），据实注记留 PM 确认。

## 6. 可测试性（新增 tests/unit/reward-fireworks.test.mjs）
照搬 reward-chest.test.mjs 的 vm 沙箱 + makeFakeClock + makeFakeCtx。`_setClock` + `_setRandom(mulberry32(seed))` + `_getParticles` + `getState()->{tier,particleCount,maxParticles,activeEffects,reducedMotion,degradeLevel}`。用例：① 固定 RNG 下 play('molten-fountain',{tier:'old_mac'}) 各 layer 时间点精确粒子数(120)；② 3 style×3 tier spawn 计数矩阵；③ RNG=0.9 并发两入口 play → 逐时间点 count≤300 且叠加窗口恰触顶 300 后回落；④ advance(duration+ε)→particles 0/activeEffects 0/无未决 timer；⑤ **fakeCtx 给 shadowBlur 装 setter 陷阱 + createRadialGradient 计数 → 断言 tick 全程 shadowBlur 0 次、gradient 只构建期出现**（比 grep 更强）；⑥ 假时钟喂慢 tick→degradeLevel 升档且不回升、离群 dt 不误降；⑦ matchMedia reduce→静态帧过同一预算/无后续 tick/onComplete 仍按 duration 触发。
