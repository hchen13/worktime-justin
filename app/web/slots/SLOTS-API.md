# `window.WTJ_SLOTS` — 五个发现槽统一状态机 API

对应飞书卡：`WTJ-20260704-010`（实现五个发现槽与探索里程碑）。
实现文件：`app/web/slots.js`（引擎，无独立 CSS——渲染仍由 `app/web/hud.js` / `hud.css` 负责）。

**本卡边界（先读）**：009（`secretword.js`）与 008（`keyboard.js`）各自只负责"判定出一次该点亮
的发现"这一步（秘密词命中 / 键盘有效键里程碑）；点槽这一步——统一去重、槽位分配、满槽判定与
轮次重置——收敛到本文件。009/008 通过 `fillSlot()` 委托给本文件；本文件不做任何"判定该不该
点亮"的业务逻辑，只做"点哪个槽、算不算重复、满没满、怎么清空"。

---

## 1. 加载方式

```html
<!-- 只需 manifest.js 先加载（读 manifest.slots）。必须排在 keyboard.js 与 secretword.js
     之前——这样两者首次点槽时 window.WTJ_SLOTS 已存在，走委托路径而非各自 fallback。
     与 hud.js 加载顺序无强依赖：本文件对 WTJ_HUD 的调用都发生在 fillSlot()/reset() 等运行时
     函数被调用之时（真实 keydown / 秘密词命中触发），而非本文件自身执行期间；届时 hud.js
     早已加载完毕（脚本按顺序同步执行，用户交互不可能早于全部 <script> 标签跑完）。 -->
<script src="manifest.js"></script>
<script src="slots.js"></script>
<script src="keyboard.js"></script>
<!-- ... -->
<script src="hud.js"></script>
<script src="secretword.js"></script>
```

`index.html` 当前顺序：`manifest.js` → `slots.js` → `keyboard.js` → `pointer.js` → `app.js` →
`hud.js` → `secretword.js` → `task.js` → `task-templates.js` → `status-rewards.js`。

加载后暴露一个**已冻结**的全局对象 `window.WTJ_SLOTS`（`Object.freeze`，且 `window.WTJ_SLOTS`
这个绑定本身通过 `Object.defineProperty` 设为不可写 / 不可重配置，与 `secretword.js` /
`task.js` / `audio.js` 同款加固）。语法基线 ES2020 以内（Safari 14 兼容）：全文 `var`/`function`
声明式，不用箭头函数 / `let` / `const` / 模板字符串 / 可选链 `?.` / 空值合并 `??`，无
`import`/`export`，零外部请求。

**本模块只应被引入一次**。`slots.js` IIFE 顶部有重复引入守卫 `if (window.WTJ_SLOTS) { return; }`：
第二次引入会在任何副作用之前直接短路返回，不会产生第二份独立的槽位状态。

## 2. 009/008 的委托 + fallback

009（`secretword.js`）秘密词命中、008（`keyboard.js`）键盘有效键里程碑，各自在"判定该点亮一
槽"之后，优先委托本文件：

```js
// 009 命中处理里（handleHit → lightNextSlot(word, spriteFile)）
if (window.WTJ_SLOTS && typeof window.WTJ_SLOTS.fillSlot === 'function') {
  window.WTJ_SLOTS.fillSlot('secret-word', { itemKey: word, renderState: { spriteUrl: resolvedPath } });
} else {
  lightNextSlotFallback(spriteFile); // 原 009 最小实现：内部游标 + 直连 WTJ_HUD.setSlot
}

// 008 里程碑判定里（checkMilestones → lightMilestoneSlot(m)）
if (window.WTJ_SLOTS && typeof window.WTJ_SLOTS.fillSlot === 'function') {
  window.WTJ_SLOTS.fillSlot('keyboard-milestone', { itemKey: m, renderState: { milestone: true } });
} else {
  lightMilestoneSlotFallback(m); // 原 008 最小实现：按里程碑顺序各占一槽 + 直连 WTJ_HUD.setSlot
}
```

- **委托路径**（`slots.js` 已加载，正常情况）：009/008 不再自己决定点亮哪个槽、不再自己判断
  "本轮是否重复"——完全交给 `WTJ_SLOTS.fillSlot()`。009 的 `secretSlotCursor`、008 的
  `milestoneSlotIndex()` 在委托路径下**不再决定实际点亮的槽**，但代码保留（供 fallback 分支
  使用），不做删除（窄改原则，不越权改动 009/008 其余逻辑）。
- **fallback 路径**（`slots.js` 未加载/被移除等异常情况，不视为回归）：009/008 各自退回本卡
  交付时的原有最小实现——直接调用 `window.WTJ_HUD.setSlot(idx, renderState)`，用各自内部的
  游标/顺序策略选择槽位。009/008 各自的现有单测（`secretword-engine.test.mjs` /
  `keyboard-engine.test.mjs`）跑的正是这条 fallback 路径（它们的沙箱不提供 `window.WTJ_SLOTS`），
  因此这两套单测无需改动、必须继续全绿——这是委托改动"不回归"的验证方式之一。

## 3. `fillSlot(source, item)` ——统一点槽入口

```js
var result = WTJ_SLOTS.fillSlot(source, item);
// result: { filled, slotIndex, duplicate, full }
```

**参数**

- `source`：`'secret-word'` | `'keyboard-milestone'`（取自 `manifest.slots.sources`；manifest
  缺失/非法时防御式回退到这两个默认值）。传入未在该枚举里的值会被 `console.warn` 并忽略
  （返回 `{ filled:false, slotIndex:null, duplicate:false, full:<当前是否已满> }`）。
- `item`：`{ itemKey, renderState }`
  - `itemKey`：本次发现在该来源**内**的身份标识，用于"当前 5 格内不重复"判断——**同一
    `source` + 同一 `itemKey`**（内部按 `String(itemKey)` 比较）视为同一个发现。秘密词用词本身
    （如 `'dog'`）；键盘里程碑用阈值数值本身（如 `100`）。缺失（`undefined`/`null`）会被
    `console.warn` 并忽略。
  - `renderState`：直接透传给 `WTJ_HUD.setSlot(idx, renderState)` 的渲染态，形状由
    `hud.js` 决定：秘密词 `{ spriteUrl: '...' }`、键盘里程碑 `{ milestone: true }`（对应
    `manifest.slots.sourceIconHint`）。非对象时防御式当作 `{}` 处理（`WTJ_HUD.setSlot` 自身
    还会再校验一次，形状不对会被它忽略、不会清空已有槽）。

**返回值**

| 字段 | 含义 |
|---|---|
| `filled` | 本次调用是否**真的**新占用了一个槽（`true` 时 `slotIndex` 非 `null`）。 |
| `slotIndex` | 新占用的槽下标（`0..count-1`），未占用时为 `null`。 |
| `duplicate` | 当前 5 格内已存在同 `source`+`itemKey` 的发现，本次不占新槽。调用方可用它决定 "只给小反馈"（如 009 的 `onMinorHit`；008 当前未消费该字段，里程碑天然不会重复触发——见第 5 节）。 |
| `full` | 调用返回时五槽是否**已经**全部占满（无论是不是本次调用促成的）。 |

**去重规则（REQ-SLOT-01 / REQ-SEC-07）**：只在当前占用的 5 格快照里查找同 `source`+`itemKey`；
一旦某格因 `reset()`/`clearSlots()` 被清空，之前占用过它的发现不再计入去重比较（即"当前五格内
不重复"，不是"整个 App 生命周期内不重复"）。

**满槽（REQ-SLOT-02 / REQ-RWD-02）**：当某次 `fillSlot()` 调用使第 5 个空格被填满时（即调用前
占用数为 `count - 1`，本次成功占用了最后一格），引擎会且仅会在**这一次**调用里 `emit`
`onFull(snapshot)` 一次（`snapshot` 结构同 `getState()`）。此后五槽保持"已点亮"的视觉状态，
**不会自动清空**——见第 4 节「满槽 → 011 契约」。若在已满状态下继续 `fillSlot()` 一个新的
（非重复）发现，会返回 `{ filled:false, slotIndex:null, duplicate:false, full:true }`（无处可放，
不会覆盖已有槽，也不会重复 `emit onFull`）。

## 4. 满槽 → 011（宝箱奖励模块，未交付）契约

**设计选择：满 5 槽后不自动清空，等待显式 `reset()` 调用**（而非"满槽当场自动清空"）。

理由：`manifest.slots.onFull` 描述的顺序是"五格全部点亮后触发宝箱开启 …… 随后清空五槽，进入
下一轮"——宝箱开启表现（011，卡片尚未交付）大概率需要在"五槽仍处于已点亮的视觉状态"下播放
奖励动画；若 `onFull` 触发的同一时刻就自动清空，011 拿到的 `onFull` 回调参数 / 随后读取的
`getState()`/`getSlots()` 会与它开始播放动画时 HUD 上实际展示的画面不一致（清空发生在它读到
快照之后、动画播放之前的时间差里）。

**契约**：

1. `fillSlot()` 使第 5 格被填满 → `emit onFull(snapshot)`（`snapshot` = `getState()` 结构，
   五槽在 HUD 上仍保持已点亮）。
2. 011（或 QA / 手测）在播放完宝箱奖励表现后，调用 `WTJ_SLOTS.reset()` 开启下一轮。
3. `reset()` 做的事（顺序如下，均防御式、缺失不报错）：
   1. `clearSlots()`：清空内部 5 槽状态 + 调 `WTJ_HUD.clearSlots()`（若该方法也缺失但
      `setSlot` 存在，逐槽 `setSlot(i, null)` 兜底）；
   2. 防御式调用 `window.WTJ_SECRET.resetRound()`（009 已暴露，其注释明确"供 010 在轮次重置
      时调用"）——清空 009 的本轮同词去重集合，允许同一秘密词在新一轮里再次触发大反馈；
   3. 防御式调用 `window.WTJ_KEYBOARD.resetEffectiveKeyCount()`（008 已暴露）——清空有效键
      累计计数与已触发里程碑记录。**若不重置这一步**：键盘里程碑来源在同一次 App 运行内只能
      触发一轮（100、200 各一次），此后 `effectiveKeyCount` 只增不减、`firedMilestones` 也
      不会清空，键盘里程碑这个来源就永远无法再点亮任何槽——不符合"进入下一轮"的产品意图，
      故本文件的 `reset()` 一并处理。
4. 另提供更底层的 `clearSlots()`（不做上面 2/3 两步）：只清空显示与内部占用状态，不触碰
   009/008 的轮次状态——供"仅清空显示、不影响已有累计判定"的调试场景使用。**正常的"开新
   一轮"应调用 `reset()`，而不是单独调 `clearSlots()`**：单独调 `clearSlots()` 后，`WTJ_SLOTS`
   自身的去重表虽然随槽位一起清空了（此时若真调到 `fillSlot('secret-word', ...)` 传入本轮
   已命中过的词，会返回 `duplicate:false`），但 009 自己的 `roundHitSet` 并未 `resetRound()`——
   该词仍不会重新占槽，因为**拦截发生在 009 的 `roundHitSet`**（同轮同词被降级为 `onMinorHit`，
   `handleHit` 大反馈路径根本不会走到调用 `fillSlot()` 这一步），而非 `WTJ_SLOTS` 的去重表。
   所以要真正"开新一轮让同词能重新占槽"，必须走 `reset()`（它会连带 `resetRound()`）。

011 卡交付前，`onFull`/`reset()` 契约可通过 QA / 手测直接调用验证（见
`tests/unit/slots-engine.test.mjs`）。若 011 卡实现后发现"满槽即清空"体验更好，属于 PM/TL 决策
调整项，需要同步修改本节文档与实现，而非默认假设当前选择是唯一正确答案。

## 5. API 一览

```js
WTJ_SLOTS.fillSlot(source, item)  // 见第 3 节；返回 { filled, slotIndex, duplicate, full }
WTJ_SLOTS.clearSlots()            // 仅清空 5 槽（内部状态 + HUD 视觉），不触碰 009/008 轮次状态
WTJ_SLOTS.reset()                 // 开新一轮：clearSlots() + 防御式通知 009 resetRound() /
                                   // 008 resetEffectiveKeyCount()（见第 4 节）
WTJ_SLOTS.getSlots()              // 返回 5 槽内部状态快照（QA 用）：
                                   // 每项 null 或 { source, itemKey, renderState }
WTJ_SLOTS.onFull(fn)              // 订阅"五槽刚好被填满"事件（仅在使第 5 格被占用的那次
                                   // fillSlot() 调用触发一次），fn(snapshot)，snapshot 同
                                   // getState() 返回结构。多订阅 + 逐个 try/catch 隔离
WTJ_SLOTS.getState()              // 返回 { slotCount, slots, full } 快照
```

**关于 008 里程碑没有 `duplicate` 判断的必要性**：008 的 `checkMilestones()` 本身已经用
`firedMilestones[m]` 保证每个里程碑阈值本轮只触发一次 `onMilestone` / 只调用一次
`lightMilestoneSlot(m)`——同一个 `m` 不会被第二次传给 `fillSlot()`。因此 `WTJ_SLOTS` 内部的
去重对键盘里程碑来源实际不会命中（属于纵深防御，而非依赖它去重），真正会触发
`duplicate:true` 的场景是 009 的秘密词同词重复命中。

## 6. 降级契约（所有消费方都可以依赖这一点）

- `slots.js` 加载**不要求** `window.WTJ_HUD` / `window.WTJ_SECRET` / `window.WTJ_KEYBOARD`
  中任何一个存在：
  - `WTJ_HUD` 缺失/`setSlot`、`clearSlots` 缺失 → `fillSlot()`/`clearSlots()` 内部状态仍正常
    更新（`getSlots()`/`getState()` 仍反映真实占用情况、`onFull` 仍正常触发），只是不会有任何
    视觉表现。
  - `WTJ_SECRET`/`WTJ_KEYBOARD` 缺失 → `reset()` 跳过对应的轮次重置调用，不抛错。
  - 以上任一缺失都**不影响** `fillSlot()` 的去重/满槽判定与 `onFull` 事件正常工作。
- 所有公开方法不抛出未捕获异常：对 `WTJ_HUD.setSlot`/`clearSlots`、`WTJ_SECRET.resetRound`、
  `WTJ_KEYBOARD.resetEffectiveKeyCount`、下游 `onFull` 订阅者回调均包了 `try/catch`。
- `manifest.slots.count`/`manifest.slots.sources` 缺失或非法时防御式回退到 `5` 与
  `['secret-word', 'keyboard-milestone']`，并 `console.warn` 一次。

## 7. QA / 单元测试

`tests/unit/slots-engine.test.mjs`：用 Node 内置 `vm` 模块加载真实 `app/web/manifest.js` +
`app/web/slots.js`，stub `window`/`WTJ_HUD`/`WTJ_SECRET`/`WTJ_KEYBOARD`，断言：

- `fillSlot` 两个来源都能填槽（验收 2）；
- 当前 5 格内同 `source`+`itemKey` 不重复占槽，返回 `duplicate:true`（验收 3 / REQ-SEC-07）；
- 填满第 5 格 `emit onFull`，五槽保持已点亮直到 `reset()`（验收 5 / REQ-SLOT-02）；
- `reset()`/`clearSlots()` 后开新一轮，`reset()` 额外防御式通知 009/008；
- 不同来源、不同 `itemKey` 各占一槽；
- `WTJ_HUD`/`WTJ_SECRET`/`WTJ_KEYBOARD` 缺失时不抛错；
- 冻结 + 绑定加固 + 重复引入守卫。

另有集成断言（同文件或配套用例）：`secretword.js`/`keyboard.js` 在 `window.WTJ_SLOTS` 存在时
走委托（stub 记录 `fillSlot` 调用）、缺失时走 fallback（stub 记录 `WTJ_HUD.setSlot` 调用）——
证明两条路径都对，且 009/008 各自原有单测（跑的正是 fallback 路径）保持全绿，不回归。
