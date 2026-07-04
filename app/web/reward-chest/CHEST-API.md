# `window.WTJ_REWARD_CHEST` — 宝箱开启 + 烟花 + 一次性大奖励 API

对应飞书卡：`WTJ-20260704-011`（实现宝箱、烟花与一次性大奖励）。
实现文件：`app/web/reward-chest.js`（引擎 + 渲染，独立 CSS `app/web/reward-chest.css`）。

**本卡边界（先读）**：010（`slots.js`）负责五槽的填充/去重/满槽判定，在第 5 格被填满时
`emit onFull(snapshot)` 一次，并**不自动清空五槽**——它把"播放宝箱奖励表现，播完后调用
`WTJ_SLOTS.reset()` 开新一轮"这件事留给本文件（见 `app/web/slots/SLOTS-API.md` 第 4 节
「满槽 → 011 契约」）。本文件只做这一件事：订阅 `onFull` → 播放一次性宝箱开启 + 烟花 + 补充
表现形式 → 约 2.6 秒后全部清空 → 调用 `WTJ_SLOTS.reset()`。本文件不参与五槽的填充/去重逻辑。

---

## 1. 加载方式

```html
<!-- reward-chest.js 需在 slots.js（010）之后——订阅它暴露的 WTJ_SLOTS.onFull 事件。也需要
     manifest.js（读 rewards.chest / performance 配置）之后加载；与 hud.js/audio.js 加载顺序
     无强依赖（调用均走防御式包装，缺失时降级为 console.warn/console.error，不阻断）。 -->
<script src="manifest.js"></script>
<script src="slots.js"></script>
<!-- ... -->
<script src="status-rewards.js"></script>
<script src="reward-chest.js"></script>
```

`index.html` 当前顺序：`manifest.js` → `slots.js` → `keyboard.js` → `pointer.js` → `app.js` →
`hud.js` → `secretword.js` → `task.js` → `task-templates.js` → `status-rewards.js` →
`reward-chest.js`。

加载后暴露一个**已冻结**的全局对象 `window.WTJ_REWARD_CHEST`（`Object.freeze`，且
`window.WTJ_REWARD_CHEST` 这个绑定本身通过 `Object.defineProperty` 设为不可写 / 不可重配置，
与 `slots.js`/`status-rewards.js` 等同款加固）。语法基线 ES2020 以内（Safari 14 兼容）：全文
`var`/`function` 声明式，不用箭头函数 / `let` / `const` / 模板字符串 / 可选链 `?.` / 空值合并
`??`，无 `import`/`export`，零外部请求。**本模块只应被引入一次**（IIFE 顶部重复引入守卫）。

## 2. 触发契约：010 满槽 → 011 播放 → 011 调用 `WTJ_SLOTS.reset()`

```js
// 本文件加载时立即执行（防御式）：
window.WTJ_SLOTS.onFull(handleSlotsFull);

// handleSlotsFull(snapshot) 做的事：
//   1. 若已在播放中（playing===true），忽略本次（并发守卫，理论上不该发生，见第 6 节）。
//   2. 播放一次性奖励序列（宝箱弹出 + 背景光晕闪烁 + 四种烟花错峰迸发 + chest-open 音效）。
//   3. 约 2.6 秒（TOTAL_SEQUENCE_MS）后：Canvas 清空、DOM 叠层子元素移除、
//      window.WTJ_SLOTS.reset() 被调用（清五槽 + 防御式通知 009/008 开新一轮）、
//      emit onChestComplete(payload)。
```

**重要**：`WTJ_REWARD_CHEST.reset()`（第 5 节的公开 API）与"序列自然播完触发的
`WTJ_SLOTS.reset()`"是两件不同的事——前者是外部中止本模块自身播放（如家长退出/新会话），
**不会**级联调用 `WTJ_SLOTS.reset()`；后者是序列自然播完的收尾动作。这一区分与
`status-rewards.js` 的 `reset()`（同样只清自己的状态，不反向通知 014）同一取舍。

## 3. 表现形式（REQ-RWD-01，`manifest.rewards.chest.formsAllowed` 是允许菜单，非强制全实现）

本文件落地的子集（`IMPLEMENTED_FORMS`）：

| 表现形式 | 落地方式 |
|---|---|
| `fireworks` | Canvas2D 粒子系统，见第 4 节 |
| `short-animation` | 宝箱本体 `treasure-chest.png` 的一次性"弹出开启"CSS 动画（`showChest()`） |
| `temporary-background-change` | 宝箱开启瞬间的暖金色全屏光晕闪烁，短暂后淡出（`showBackgroundFlash()`） |
| `new-sfx` | 防御式播放 `audio.js` 已登记的 `'chest-open'` 音效 |

未实现 `sticker-popup-fade`：与"宝箱本体的短动画"在视觉上高度重叠（都是同一张
`treasure-chest.png` 的弹出表现），实现两者是同一素材的重复包装，故用背景光晕闪烁替代，
做出真正不同的第二种表现（已超过验收 5「至少一种」的门槛）。

## 4. 烟花粒子系统（REQ-RWD-03 / REQ-AST-02）

单一物理引擎（重力 + 阻力 + 生命衰减），`manifest.rewards.chest.fireworks.presetTypes` 四种
全部落地（超过验收 3「至少 2 种」）：

| preset | 中文名 | 特征 |
|---|---|---|
| `circle` | 圆形 | 从宝箱位置向 360° 均匀爆发，经典烟花环 |
| `starfield` | 满天星 | 散布在画面上半部，缓慢上浮 + 明暗闪烁（twinkle），不来自单一爆发点 |
| `sparkler` | 打铁花 | 从宝箱位置向上方锥形高速迸发，重力大、衰减快 |
| `star` | 星形 | 沿五角星的 5 个主方向成束迸发，形成星形轮廓 |

四种预设按 `BURST_SCHEDULE` 错峰触发（延迟 0 / 320 / 680 / 1040ms，相对序列起点）。

**颜色策略（验收 4，`colorStrategy: 'small-curated-palette-hsl-hsv-jitter'`）**：`COLOR_PALETTE`
是 5 个手工挑选的高质量 HSL 基色（gold / ember-red / violet / cyan / warm-white）；每个粒子的
颜色 = 随机选一个基色，再对 h/s/l 三通道各做一次小范围随机偏移（`HUE_JITTER=±9°` /
`SAT_JITTER=±8` / `LIGHT_JITTER=±8`），**不是** `Math.random()` 直接生成 RGB 三分量。

**性能红线（`manifest.performance.maxParticles=300` / `disallowShadowBlur=true`）**：
`spawnBurst()` 在生成每一批粒子前，用 `getMaxParticles() - particles.length` 计算剩余预算，
裁剪本次实际生成数量——保证**任意时刻**存活粒子数不超过上限（不是"整段序列累计生成数"不超过
上限，早先批次死亡释放的名额允许后续批次使用）。全文件不出现 `ctx.shadowBlur`，"发光感"改用
同心双层圆（柔光晕 + 实心核）纯 `globalAlpha` 叠加实现。

## 5. API 一览

```js
WTJ_REWARD_CHEST.onChestComplete(fn)
  // 订阅"一次宝箱奖励序列自然播完"事件（已调用 WTJ_SLOTS.reset() 之后 emit），
  // fn({ ts, reducedMotion, forms, presetTypesFired })。多订阅 + 逐个 try/catch 隔离。
  // 外部调用 reset() 中止播放不会触发本事件。

WTJ_REWARD_CHEST.getState()
  // 返回 { playing, reducedMotion, particleCount, maxParticles, configuredForms,
  //        implementedForms, configuredPresetTypes, implementedPresetTypes,
  //        colorStrategy, spriteResolved }，供 QA 断言。

WTJ_REWARD_CHEST.reset()
  // 外部中止入口（如家长退出 / 新会话）：立即停止任何进行中的奖励播放、清空 Canvas 与 DOM
  // 叠层子元素、取消所有挂起的定时器。不会级联调用 WTJ_SLOTS.reset()（见第 2 节）。

WTJ_REWARD_CHEST._setClock(clock)
  // 测试专用（与 task.js/pointer.js/task-templates.js/status-rewards.js 同款模式），
  // 供单测把整段奖励序列 + 逐帧粒子模拟快进掉，不是稳定契约。

WTJ_REWARD_CHEST._getParticles()
  // 测试专用，返回当前存活粒子的浅拷贝快照数组，不是稳定契约。
```

## 6. 并发守卫

理论上五槽满后 010 在 `reset()` 之前不会再 `emit onFull`（见 `SLOTS-API.md` 第 3 节：已满时
`fillSlot()` 返回 `full:true` 但不重复 emit），但本文件仍加一层防御——`handleSlotsFull()` 播放
期间（`playing===true`）再次收到 `onFull` 一律 `console.warn` 后忽略，不叠加第二套奖励序列、
不重复调用 `WTJ_SLOTS.reset()`。

## 7. prefers-reduced-motion

宝箱本体 / 背景光晕两个 CSS 驱动的表现，沿用 `status-rewards.css` 同款手法：JS 始终添加
`"-anim"` 动画类，由 `reward-chest.css` 的 `@media (prefers-reduced-motion: reduce)` 统一
覆盖为无动画的静态终态，JS 不需要按 `reducedMotion` 分支切换类名。Canvas 烟花是 JS 逐帧驱动，
CSS 管不到，因此由 JS 显式判断：命中时不启动 tick 循环，改为一次性画出一帧「静态定格」的粒子
分布（`spawnStaticFrame()`），仍然照常经过完整的 `TOTAL_SEQUENCE_MS` 展示时长后调用
`WTJ_SLOTS.reset()`——展示时长与移除时机不变，只是烟花本身不再逐帧运动。

## 8. 计时驱动方式（工程取舍，非文档字面要求）

`manifest.rewards.chest.fireworks` 的落地建议是"rAF 驱动"的 Canvas 粒子系统。本文件改用与
013/014/015（`task.js`/`task-templates.js`/`status-rewards.js`）完全一致的「可注入时钟
（`clockRef.setTimeout` 链）+ `_setClock` 测试钩子」驱动整个粒子模拟的逐帧更新，而不是调用
浏览器原生 `requestAnimationFrame`。原因：真实 rAF 的回调时间戳不受 `_setClock` 这类可注入
时钟控制，单元测试（Node `vm` 沙箱，没有 rAF）没有办法确定性地"快进"一段粒子物理模拟并断言
其状态（存活数、颜色、预设类型分布、"不超过 `maxParticles` 上限"等）。用固定节拍
（`TICK_MS=16`，约 60fps）的 `setTimeout` 链在生产环境里视觉效果与 rAF 几乎无差异（本奖励
序列只播放一次、约 2.6 秒，不是常驻主循环），却能让整套粒子系统在测试沙箱里与其余奖励模块
用同一手法被确定性驱动。据实记录，供 PM/TL 需要时复核。

## 9. QA / 单元测试

`tests/unit/reward-chest.test.mjs`：用 Node 内置 `vm` 模块加载真实 `app/web/manifest.js` +
`app/web/reward-chest.js`，stub `window`/`document`（含 `<canvas>` + 假 2D context）/
`WTJ_SLOTS`/`WTJ_AUDIO`/`matchMedia` + 假时钟，断言：

- 加载后订阅 `WTJ_SLOTS.onFull`；`getState()` 读到真实 manifest 数值；
- 触发后宝箱图 / 背景光晕 / Canvas 全部创建，播放一次 `chest-open` 音效；
- 四种预设类型全部触发（验收 3）；任意时刻粒子数不超过 `maxParticles(300)`（性能红线）；
  另有固定 `Math.random` 的确定性推导测试，精确验证裁剪逻辑在四批错峰烟花叠加存活时确实
  把存活数顶满 300、随后按各预设生命周期逐步回落（证明死亡粒子被正确清理，不无限堆积）；
- 颜色走 HSL 色板 + 微调（验收 4）：结构性断言（格式为 `hsl(...)`、色相落在色板附近）+
  固定 `Math.random=0.5` 的确定性断言（精确落在色板基色，微调偏移为 0）；
- 序列自然播完后 Canvas 清空、DOM 子元素移除、不堆积、调用 `WTJ_SLOTS.reset()`、
  `onChestComplete` 携带正确 payload（验收 1/2）；
- 并发守卫：播放期间重复 `onFull` 被忽略；
- `prefers-reduced-motion` 命中时烟花冻结为静态定格帧，仍照常展示/移除/调用 `reset()`；
- `reset()` 外部中止：立即清空叠层，不级联调用 `WTJ_SLOTS.reset()`；
- 防御式：`WTJ_SLOTS`/`WTJ_AUDIO`/manifest 任一或全部缺失时不抛错；`playSfx` 抛错不影响流程；
- 重复引入守卫 + 冻结 + 绑定加固。

Run: `node --test tests/unit/reward-chest.test.mjs`（或整目录 `node --test 'tests/unit/*.test.mjs'`）。
