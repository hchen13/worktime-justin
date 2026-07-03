# `window.WTJ_TASK` — 问号任务框架 / 任务生命周期状态机 API

对应飞书卡：`WTJ-20260704-013`（实现问号任务框架与任务生命周期）。
实现文件：`app/web/task.js`（单文件，无配套数据文件）。

**本卡边界（先读）**：本卡只交付任务的**框架层**——入口接线、生命周期状态机
（`IDLE` ↔ `ACTIVE`）、时序计时器（轻提示/目标增强/自动收起）、键盘转移淡出判定、事件广播。
**不实现任何具体任务模板**（拖拽/点击/寻找/按键四类，REQ-TASK-07~10）——那些任务"长什么样"、
"怎么判定完成"完全是 `WTJ-20260704-014` 的工作，014 通过本文件暴露的 `startTask()` /
`completeTask()` 两个入口驱动生命周期，不需要也不应该重新实现一套状态机。**不接入
`index.html`**（`<script src="task.js">` 尚未被添加到运行时页面），接入属于 014/019 卡的工作。

---

## 1. 加载方式

```html
<!-- 与 manifest.js / audio.js 同款：普通 script 标签，非 module。
     必须晚于 manifest.js；若要让「问号点击接线」「键盘转移淡出」真正生效，
     还应晚于 hud.js（WTJ-20260704-007）与 keyboard.js（WTJ-20260704-008）——
     晚于与否不会报错（见第 5 节降级契约），但顺序反了这两条能力就是空转的静默降级。 -->
<script src="task.js">
```

加载后暴露一个**已冻结**的全局对象 `window.WTJ_TASK`（`Object.freeze`，且 `window.WTJ_TASK`
这个绑定本身通过 `Object.defineProperty` 设为不可写/不可重配置，与 `audio.js` 同款加固）。
语法基线 ES2020 以内（Safari 14 兼容）：全文 `var`/`function` 声明式，不使用箭头函数 /
`let` / `const` / 模板字符串 / 可选链 `?.` / 空值合并 `??`，无 `import`/`export`，零外部请求
（不 `fetch` 任何东西，纯本地状态机 + 定时器）。

**本模块只应被引入一次**（019 集成时注意别在 `index.html` 里重复放 `<script src="task.js">`）。
`task.js` IIFE 顶部已有重复引入守卫 `if (window.WTJ_TASK) { return; }`：第二次引入会在任何
接线副作用之前直接短路返回，不会重新注册键盘监听、也不会把 HUD 问号点击接管到另一个实例上
（`WTJ_HUD.onQuestionClick` 是覆盖式注册——若无此守卫，重复引入会让问号点击驱动「实例 2」而
`window.WTJ_TASK` 仍指「实例 1」，导致 014 的 `onQuestionClicked` 订阅永不触发、问号静默失效）。
有了守卫，重复引入是真正的安全 no-op，`window.WTJ_TASK` 始终是第一个实例。

## 2. 红线：不创建任何 DOM（REQ-TASK-02）

`task.js` 全文**不出现** `document.*`、`innerHTML`/`textContent`/`innerText` 赋值、
`createElement`/`createTextNode`/`appendChild`/`insertAdjacentHTML`。任务提示唯一的表现手段是
语音（`window.WTJ_AUDIO.playTaskVoice(...)`），"15 秒轻提示""30 秒目标增强"这两个时机只通过
`onPhase(fn)` 事件广播出去，**长什么样（呼吸光晕/闪烁/放大等）完全由 014 决定并自行创建 DOM**。
这条边界是结构性的（本文件压根不触碰 `document`），不是靠某个开关或校验逻辑维持的，见
`tests/unit/task-lifecycle.test.mjs` 第 0 组静态源码扫描断言。

## 3. 状态机

```
        startTask(taskDef)
  IDLE ───────────────────────► ACTIVE
   ▲                               │
   │   dismiss(reason)             │  completeTask(result)
   └───────────────────────────────┘
```

- 同一时刻只允许一个进行中任务：`state === 'ACTIVE'` 时再次调用 `startTask()`（无论是通过
  `onQuestionClicked` 间接触发还是 014 直接调用）会被忽略（`console.warn` + 返回 `false`），
  不会打断/替换正在进行的任务。
- `dismiss(reason)` / `completeTask(result)` 在 `state === 'IDLE'` 时调用是安全的空操作（不会
  抛错，`dismiss` 静默忽略，`completeTask` 会 `console.warn` 后忽略），均返回 `false`。

## 4. API 一览

### 生命周期

```js
WTJ_TASK.startTask(taskDef)     // boolean —— 从 IDLE 启动一个任务。
WTJ_TASK.completeTask(result)   // boolean —— 供 014 在判定任务成功时调用；result 原样透传给 onComplete 订阅者。
WTJ_TASK.dismiss(reason)        // boolean —— 收起当前任务；reason 缺省回退为 'manual'。
WTJ_TASK.getState()             // { state, activeTaskType, elapsedMs, effectiveKeysSinceStart }
```

`taskDef` 是 014 提供的任务描述对象（`manifest.js` `tasks.templates.*.examples` 里的条目形状，
如 `{ id, type, voicePrompt, ... }`）。本卡**不校验**具体模板字段，只使用其中两个：

- `taskDef.voicePrompt`（存在时）：传给 `window.WTJ_AUDIO.playTaskVoice(...)` 驱动语音
  （不存在时改用整个 `taskDef` 做对象穿透式调用，兼容 `AUDIO-API.md` 的两种入参形式）。
- `taskDef.type`（存在时）：原样出现在 `getState().activeTaskType`，供 QA / 014 内部判断当前
  任务类型；不存在时为 `null`。

`getState()` 返回一份快照（值拷贝，非内部状态引用）：

```js
{
  state: 'IDLE' | 'ACTIVE',
  activeTaskType: string | null,   // IDLE 时恒为 null
  elapsedMs: number,               // 距 startTask() 调用的毫秒数；IDLE 时恒为 0
  effectiveKeysSinceStart: number  // 本次任务期间累计的有效键数；IDLE 时恒为 0
}
```

**`getState()` 与所有事件 payload 都从不包含任何 `failure` 字段**——这是 REQ-EXIT-04 /
`manifest.exit.keyboardDistractionCountsAsFailure: false`（"任务超时自动收起"与"键盘转移触发的
任务淡出"均不判定为失败）在本卡的落地方式：不是某个开关，而是"这个状态机压根不产生失败语义"
这种结构性保证。

### 事件（多订阅者，回调数组内部 try/catch 隔离，一个订阅者抛错不影响其余订阅者）

```js
WTJ_TASK.onPhase(fn)            // fn({ phase: 'hint' | 'emphasize' })
WTJ_TASK.onDismiss(fn)          // fn({ reason: string })
WTJ_TASK.onComplete(fn)         // fn(result)  —— result 即 completeTask() 的入参，原样透传
WTJ_TASK.onQuestionClicked(fn)  // fn()  —— 见第 6 节「问号点击接线」
```

`onPhase` 的两个时机来自 `manifest.tasks.timing`（`lightHintSec: 15` / `emphasizeSec: 30`，
缺失/非法时防御式回退到这两个默认值并 `console.warn`）。`'hint'`/`'emphasize'` 具体渲染成什么
（呼吸光晕、闪烁、放大……）完全是 014 的事，本文件只按时序广播事件。

`onDismiss` 的 `reason` 目前只会由本文件内部产生两种值：

- `'timeout'`：`manifest.tasks.timing.autoDismissSecRange`（默认 `[45, 60]`）区间内随机选定的
  一个时刻到达（REQ-TASK-05）。实现用 `minSec + Math.random() * (maxSec - minSec)`，因
  `Math.random()` ∈ `[0, 1)`，实际收起时刻落在半开区间 **`[45s, 60s)`**——严格 ≥45s、严格
  <60s（精确 60s 概率为 0，不可达），满足需求「45-60 秒仍未完成自动收起」。
- `'keyboard-distraction'`：任务期间有效键**累计**达到
  `manifest.tasks.timing.keyboardDistractionKeyCount`（默认 20，REQ-TASK-06）。

**给 014 明示（P2-3 语义澄清）**：`'keyboard-distraction'` 的判定是「**本次任务期间累计** 20 个
有效键」——忠实 `manifest.keyboardDistractionKeyCount` 的口径，是一个**累计计数**，**不是**「某个
滑动时间窗内连续 20 键」那种带时间窗的口径。计数在 `startTask()` 时清零（见 `getState()
.effectiveKeysSinceStart`），在 `dismiss()`/`completeTask()` 回到 IDLE 时复位为 0；IDLE 期间
（任务前、两任务之间）按下的有效键**完全不计数**，也不会预支下一个任务的 20 键额度——每个任务
都从 0 开始独立累计满 20 才淡出。**当前没有「任务内发生有效交互就重置转移计数」的入口**（即孩子
如果一边正确做任务一边零星按键，这些按键仍计入累计）；若 014 认为需要「任务有进展就重置/放宽
转移计数」这类更宽容的行为，属于产品口径变更，应反馈 PM 而非在 014 侧绕过本状态机自行实现。

外部调用方直接调 `dismiss(someReason)` 时可以传任意字符串，不限于上述两种。

### 测试专用（非生产契约）

```js
WTJ_TASK._setClock({ setTimeout, clearTimeout, now })
```

下划线前缀标识"内部/测试用"，供 `tests/unit/task-lifecycle.test.mjs` 用假时钟替换真实
`setTimeout`/`clearTimeout`/`Date.now`，从而用 `advance(ms)` 快进验证 15s/30s/[45,60]s 的时序，
不必真等 45~60 秒。014/019 的生产代码**不应该调用它**。

## 5. 降级契约（所有消费方都可以依赖这一点）

- `startTask()` **不要求** `window.WTJ_HUD` / `window.WTJ_AUDIO` / `window.WTJ_KEYBOARD` 中
  任何一个存在——三者缺失时，`task.js` 加载与整个生命周期（`startTask` → 15s hint → 30s
  emphasize → 45~60s 自动 `dismiss('timeout')`）依然正常跑完，只是语音不会播放、问号点击不会
  被接管、键盘转移淡出不会触发（因为没有事件源）。这三个 API 各自的"文件不存在/未加载"降级见
  各自文档（`app/web/audio/AUDIO-API.md` 第 5 节、`app/web/MANIFEST.md` HUD API 一节、
  `app/web/keyboard.js` 顶部注释）。
- 所有公开方法（`startTask`/`completeTask`/`dismiss`）**不抛出未捕获异常**：内部对
  `window.WTJ_AUDIO.playTaskVoice`、`window.WTJ_HUD.onQuestionClick`、
  `window.WTJ_KEYBOARD.onEffectiveKey` 的调用均包了 `try/catch`，下游订阅者回调抛出的异常也
  会被逐个 `try/catch` 隔离（`console.error` 记录，不影响同一事件的其余订阅者）。

## 6. 问号点击接线（写给 014）

`task.js` 加载时会防御式调用 `window.WTJ_HUD.onQuestionClick(...)`（若存在）注册一个内部处理
函数，接管问号点击（注意 `WTJ_HUD.onQuestionClick` 是**覆盖式**注册——同一时刻只有一个处理
函数，`task.js` 加载后即成为唯一处理函数）。点击发生时：

- 若当前 `state === 'IDLE'`：`emit('questionClicked')`（无参数）。
- 若当前 `state === 'ACTIVE'`：**忽略**，不 emit（已有任务在进行中，忽略优于打断/重置——见
  `task.js` 文件头「问号点击接线」一节的完整设计说明）。

014 的接入方式：

```js
WTJ_TASK.onQuestionClicked(function () {
  var taskDef = myTaskProvider(); // 014 自己实现：随机挑一个任务模板/实例
  WTJ_TASK.startTask(taskDef);
});
```

选"事件"（`onQuestionClicked`）而非"provider 回调"（`setTaskProvider(fn)`，由 `task.js` 反过来
调用 014 注册的函数拿 `taskDef`）：`onPhase`/`onDismiss`/`onComplete` 已经是"多订阅者 + emit"
的事件风格，`onQuestionClicked` 延续同一种风格，API 心智模型统一，不需要额外学一种"本文件反向
调用外部函数"的控制流。

## 7. 各消费卡怎么用（快速对照）

| 卡 | 用什么 API | 备注 |
|---|---|---|
| 014 任务模板卡 | `onQuestionClicked(fn)` 里生成 `taskDef` 并 `startTask(taskDef)`；任务判定成功时 `completeTask(result)`；订阅 `onPhase(fn)` 渲染轻提示/目标增强视觉 | `taskDef` 形状参照 `manifest.js` `tasks.templates.{drag,click,find,press}.examples` |
| 019 集成卡 | 把 `<script src="task.js">` 接入 `index.html`（需晚于 `manifest.js`，建议晚于 `hud.js`/`keyboard.js`/`audio.js`） | 加载顺序颠倒不会报错，但对应能力会静默降级为空转，见第 5 节 |
| QA | `getState()` 断言当前任务状态；订阅 `onDismiss`/`onComplete` 观察生命周期收尾 | `tests/unit/task-lifecycle.test.mjs` 是本卡随附的持久化单测，覆盖全部时序/边界 |
