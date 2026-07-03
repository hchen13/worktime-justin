# `window.WTJ_SECRET` — 秘密词识别 / 命中反馈 / 对象出现引擎 API

对应飞书卡：`WTJ-20260704-009`（实现秘密词识别、命中反馈与对象出现）。
实现文件：`app/web/secretword.js`（引擎）+ `app/web/secretword.css`（sprite 叠层样式）。
素材：`app/web/assets/sprites/`（8 个已验收 sprite，来源见该目录 `PROVENANCE.md`）。

**本卡边界（先读）**：本卡交付"字母流 → 秘密词匹配 → 命中反馈"这条完整链——rolling input
buffer、词池匹配引擎（规则从 `manifest.secretWords.matchRules` 读）、命中处理（`onHit` 事件 +
防御式音效 + sprite 对象一次性叠层出现 + 五槽**基础**联动 + 本轮同词去重的小反馈）。**不接管
完整的五槽轮次去重状态机**——跨"秘密词命中"与"键盘里程碑"两种来源的统一槽位分配 / 避免冲突 /
满槽开宝箱后清空重置，属于 `WTJ-20260704-010`（五槽引擎卡）。009 只做"命中即防御式点亮下一个
空槽 + 本轮同词不重复占槽"这一最小契约，`resetRound()` 供 010 在轮次重置时调用。

---

## 1. 加载方式

```html
<!-- 与 manifest.js / keyboard.js 同款：普通 script 标签，非 module。
     必须晚于 keyboard.js（本文件加载时订阅 window.WTJ_KEYBOARD.onLetter）；
     建议晚于 hud.js（命中时调用 window.WTJ_HUD.setSlot 点亮五槽）。
     顺序反了不会报错（见第 5 节降级契约），但对应能力会静默降级为空转。 -->
<link rel="stylesheet" href="secretword.css" />
<script src="secretword.js"></script>
```

`index.html` 当前顺序：`manifest.js` → `keyboard.js` → `app.js` → `hud.js` → `secretword.js`
（本文件最后，keyboard.js / hud.js 均已就绪）。

加载后暴露一个**已冻结**的全局对象 `window.WTJ_SECRET`（`Object.freeze`，且 `window.WTJ_SECRET`
这个绑定本身通过 `Object.defineProperty` 设为不可写 / 不可重配置，与 `audio.js` / `task.js`
同款加固）。语法基线 ES2020 以内（Safari 14 兼容）：全文 `var`/`function` 声明式，不用箭头函数 /
`let` / `const` / 模板字符串 / 可选链 `?.` / 空值合并 `??`，无 `import`/`export`，零外部请求。

**本模块只应被引入一次**。`secretword.js` IIFE 顶部有重复引入守卫
`if (window.WTJ_SECRET) { return; }`：第二次引入会在任何接线副作用之前直接短路返回，不会重复
订阅 `WTJ_KEYBOARD.onLetter`（否则字母流会被"实例 2"消费，而 `window.WTJ_SECRET` 仍指"实例 1"，
外部订阅永不触发、命中静默失效）。有了守卫，重复引入是真正的安全 no-op。

## 2. 红线：不建输入框、不回显字母流（REQ-SEC-01 / REQ-TASK-01）

`secretword.js` 全文**不出现** `input` / `textarea` / `contenteditable` 的创建，**不把 buffer
或任何字母流写进可见 DOM 文本**（无 `innerText` / `textContent` / `innerHTML` 对 buffer 的回显）。
系统"监听最近的普通英文字母流"是通过订阅 `window.WTJ_KEYBOARD.onLetter`（内存 rolling buffer）
实现的，不要求输入框、不要求回车。唯一创建的 DOM 是命中时的 **sprite 叠层**（`<div class=
"wtj-secret-overlay">` + `<img class="wtj-secret-sprite">`，`pointer-events:none`，一次性淡入
淡出后自动移除）——这是 REQ-SEC-03 / REQ-AST-04「出现对象」，不是文字回显。`getBuffer()` 只把
内存 buffer 返回给调用方（测试/调试用），从不写进页面。

## 3. 匹配引擎

**核心思路**：每来一个新字母，归一化后追加到 buffer 末尾，然后检查"这个新字母是否使 buffer
末尾恰好构成某个 pool 词"（`buffer.endsWith(word)`）。命中锚定"末尾/后缀"而非"整串包含"，一次
只对"刚刚形成的那个词"触发一次。

**重要（开关消费诚实说明）**：`manifest.secretWords.matchRules` 里的 7 个开关**并非都能在运行时
关掉**。引擎的匹配算法本身就以"末尾/后缀逐字母命中"为形态，其中若干规则是这个算法的**固有
行为**，不由某个 `if (switch)` 分支控制——把它们在 manifest 里置 `false` **不会改变引擎行为**。
下表明确区分两类，供 010/019 消费时不被误导：

**A. 引擎真正消费的开关（置 `false` 会改变行为，缺失时防御式回退到 `true`）**

| 规则 | REQ | manifest 开关 | 置 false 的效果 |
|---|---|---|---|
| 大小写等价 | REQ-SEC-09 | `caseInsensitive` | 新字母与 pool 词**不再** `toLowerCase`，退化为大小写敏感匹配（`DOG` 不再命中 `dog`）。 |
| 最长词优先 | REQ-SEC-11 | `longestMatchPriority` | 同位置多词同时结尾时**不再取最长**，改取遍历中最先命中的那个（顺序取决于 pool 数组顺序）。 |
| 同词重复只小反馈 | REQ-SEC-07 | `sameWordRepeatMinorFeedbackOnly` | 本轮同词重复命中**不再降级为小反馈**，每次都走完整大反馈（`onHit` + 音效 + sprite + 占槽）。 |

**B. 声明性 / 算法固有开关（置 `false` 无效果——引擎不读取，仅作需求可追溯标注）**

| 规则 | REQ | manifest 开关 | 为何不可关 |
|---|---|---|---|
| 子串/末尾命中 | REQ-SEC-04 | `substringMatch` | 引擎唯一的匹配形态就是"buffer 末尾出现完整词即命中"，这**是**子串命中本身，无"关掉子串命中"的另一套算法。 |
| 重叠触发 | REQ-SEC-05 | `overlapTrigger` | "每个新字母只查一次末尾匹配"天然产生重叠且不重复触发，无独立开关。 |
| 双写不惩罚 | REQ-SEC-06 | `doubleLetterNoPenalty` | 引擎压根没有"连续重复字母打断匹配"的逻辑，双写天然放行，无可关之物。 |
| 复合顺序独立触发 | REQ-SEC-10 | `sequentialCompoundIndependentTriggers` | 不同位置结尾的词各自逐字母独立命中，是算法固有形态，无独立开关。 |

> **B 组开关的意义**：仅供 QA/PM 沿 `manifest` 字段追溯到对应 REQ（单一事实来源），**不是**运行时
> 可控参数。若未来真要"关掉"其中某条行为（如做 A/B 测试），需要在引擎里新增对应分支，届时应把
> 该开关从 B 组升到 A 组并补测试——本卡（009）范围内它们不可关。
>
> **当前真实 pool 无 `hot`**，实际 `hotdog` 只命中 `dog`；引擎逻辑支持复合，单测用注入 pool
> 含 `hot`+`dog` 验证双触发（`longestMatchPriority` 同理用注入 pool 含 `car`+`scar` 验证）。

**rolling buffer**：只保留最近 `max(最长 pool 词长度 × 2, 8)` 个字符（避免无限增长）；对匹配
正确性无影响（后缀匹配只需要不短于最长词的尾部）。

## 4. API 一览

```js
WTJ_SECRET.onHit(fn)         // 注册"本轮首次命中某词"回调，fn({ word, spriteFile, audioFile })
WTJ_SECRET.onMinorHit(fn)    // 注册"本轮同词重复命中"回调，fn({ word, spriteFile, audioFile })
WTJ_SECRET.getRoundHits()    // 返回本轮已命中词数组（去重、按首次命中顺序）的快照（值拷贝）
WTJ_SECRET.resetRound()      // 重置本轮已命中集合 + 本卡内部五槽游标，开启新一轮
WTJ_SECRET.getBuffer()       // 返回当前 rolling buffer 快照字符串（仅测试/调试，从不写进 DOM）
```

- **`onHit` / `onMinorHit`**：多订阅者（可注册多个），回调数组内部逐个 `try/catch` 隔离——一个
  订阅者抛错不影响其余订阅者，也不打断引擎。payload 三字段直接取自 `manifest.secretWords.pool`
  条目：`word`（归一化小写词）、`spriteFile`（如 `'sprites/dog.png'`，manifest 原始值）、
  `audioFile`（如 `'audio/words/dog.m4a'`）。
- **`getRoundHits()`**：供 QA 断言 / 010 五槽引擎读取本轮已命中词。
- **`resetRound()`**：五槽满触发宝箱后由 010 调用以开启新一轮（`slots.onFull.resetsSlotsAfter`）；
  009 单独运行/自测时也可调用。重置后同词可再次触发大反馈。
- **`getBuffer()`**：内存 buffer 快照，**不是** DOM 回显（REQ-SEC-01）。

### 命中时引擎自身做的事（消费方无需重复实现）

本轮**首次**命中某词时，引擎按顺序执行：
1. `emit('hit', payload)` —— 通知所有 `onHit` 订阅者。
2. **音效**：防御式 `window.WTJ_AUDIO.playWord(entry)`（对象穿透式，用 `entry.audioFile`）。
   返回的 Promise 挂了 rejection handler，即使替身/未来实现违约 reject 也不会冒
   `unhandledrejection`（AUDIO-API 契约本承诺永不 reject）。`WTJ_AUDIO` 缺失时静默跳过。
3. **sprite 对象出现**（REQ-SEC-03 / REQ-AST-04）：在 `<div class="wtj-secret-overlay">` 里插入
   一个 `<img class="wtj-secret-sprite">`（`src` = `resolveSpritePath(spriteFile)`，见第 6 节），
   CSS 驱动一次性淡入 → 停留 → 淡出，动画结束或 1900ms 兜底定时器到时后移除节点（不永久堆积，
   画面回到干净）。`document` 缺失（如单测沙箱）时静默跳过，不影响其余反馈。
4. **五槽基础联动**（REQ-SLOT-01）：防御式 `window.WTJ_HUD.setSlot(下一个空槽 index,
   { spriteUrl: resolveSpritePath(spriteFile) })`。

本轮**同词重复**命中时（`sameWordRepeatMinorFeedbackOnly` 为 true），引擎只 `emit('minorHit',
payload)`——**不**放 sprite、**不**点新槽、**不**重复出声（REQ-SEC-07：只给小反馈，不再点亮新
的发现槽）。"小反馈"具体表现（如轻微光点/短促轻音）留给 `onMinorHit` 订阅者决定，引擎不越权。

## 5. 降级契约（所有消费方都可以依赖这一点）

- `secretword.js` 加载**不要求** `window.WTJ_KEYBOARD` / `window.WTJ_AUDIO` / `window.WTJ_HUD` /
  `document` 中任何一个存在：
  - `WTJ_KEYBOARD` 缺失/加载在本文件之后 → `console.warn` 一次，引擎降级为空转（不监听字母流），
    但 API 仍挂载，不抛错。
  - `WTJ_AUDIO` 缺失 → 命中时静默不出声。
  - `WTJ_HUD` 缺失 → 命中时不点亮五槽。
  - `document` 缺失（单测沙箱） → 命中时不创建 sprite 叠层。
  - 以上任一缺失都**不影响** `onHit`/`onMinorHit` 事件与本轮去重逻辑正常工作。
- 所有公开方法不抛出未捕获异常：对 `WTJ_AUDIO.playWord` / `WTJ_HUD.setSlot` / DOM 操作 /
  下游订阅者回调均包了 `try/catch`。

## 6. 素材路径解析（`resolveSpritePath`）——已知遗留，需 PM/TL 统一

`manifest.secretWords.pool[].spriteFile` 字面值形如 `'sprites/dog.png'`（对应 manifest
`assets.runtimeDirs.sprites = 'sprites/'` 约定），但本卡按 TL 指令把 sprite 实际复制到
`app/web/assets/sprites/`（与 007 卡 `assets/ui/` 先例一致）。二者差一层 `assets/` 前缀。
`resolveSpritePath()` 在**消费端**把 `'sprites/xxx.png'` 拼成 `'assets/sprites/xxx.png'` 再用于
DOM `<img src>` 与 `WTJ_HUD.setSlot({spriteUrl})`——**没有改 `manifest.js`**（它是本卡只读参考）。

这是"已验收素材落位路径"与"manifest 路径字面值"两条线索未对齐的既成情况（详见
`app/web/assets/sprites/PROVENANCE.md`）。**010 / 019 集成时需注意**：若你也要用 `spriteFile`
拼 DOM 路径，请复用 `resolveSpritePath()`（或等价逻辑），不要各自硬编码前缀。PM/TL 未来二选一
统一掉这层不一致（改 manifest 的 `runtimeDirs`/`spriteFile` 带上 `assets/`，或把 sprite 迁到
`app/web/sprites/`）后，应同步删除该映射。

## 7. 各消费卡怎么用（快速对照）

| 卡 | 用什么 API | 备注 |
|---|---|---|
| 010 五槽引擎卡 | 订阅 `onHit`/`onMinorHit` 观察命中；接管完整轮次去重状态机后，在满槽开宝箱清空时调用 `resetRound()` | 009 的内部五槽游标是最小占位，010 接管统一分配（含键盘里程碑来源），届时可能改由 010 全权 `setSlot`、009 退出直接点槽——接口不变 |
| 019 集成卡 | 把 `<link href="secretword.css">` + `<script src="secretword.js">` 接入 `index.html`（需晚于 `keyboard.js`，建议晚于 `hud.js`） | 加载顺序颠倒不会报错，但对应能力静默降级为空转，见第 5 节 |
| QA | `getRoundHits()` 断言本轮命中集合；`getBuffer()` 观察 buffer；订阅 `onHit`/`onMinorHit` 观察反馈 | `tests/unit/secretword-engine.test.mjs` 是本卡随附的持久化单测，覆盖全部规则/边界 |
