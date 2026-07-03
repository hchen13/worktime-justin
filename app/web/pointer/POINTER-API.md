# `window.WTJ_POINTER` — 鼠标/触控板反馈与拖拽基础引擎 API

对应飞书卡：`WTJ-20260704-012`（实现鼠标/触控板反馈与拖拽基础）。
实现文件：`app/web/pointer.js`（单文件，无配套数据文件）。

**本卡边界（先读）**：本卡交付的是**指针输入的判定与事件层**——尾迹强度衰减、点击强度衰减、
拖拽状态机、可交互目标注册（hover/click/drag 三种判定）。**不画任何东西**：尾迹光点/点击圆环
的 Canvas 渲染仍是 `app.js` 的 `drawTrail`/`drawRings`（本文件只给强度数值，浓度由 `app.js`
按强度控制）；**不判定任何具体任务是否"完成"**（拖对了/点对了/找到了这类业务判定是
`WTJ-20260704-014` 任务模板卡的事，本文件只把"拖到了哪个目标""点中了哪个目标""在哪个目标上
停满了 1 秒"这些原始事实以事件形式广播出去）。已接入 `index.html`（`<script src="pointer.js">`
排在 `keyboard.js` 之后、`app.js` 之前）。

---

## 1. 加载方式

```html
<!-- 与 manifest.js/keyboard.js 同款：普通 script 标签，非 module。
     必须晚于 manifest.js（读取 manifest.pointer / manifest.tasks.timing）；
     必须早于 app.js（app.js 初始化时要订阅 onMove/onClickFeedback）。 -->
<script src="pointer.js">
```

加载后暴露一个**已冻结**的全局对象 `window.WTJ_POINTER`（`Object.freeze`，且
`window.WTJ_POINTER` 这个绑定本身通过 `Object.defineProperty` 设为不可写/不可重配置，与
`task.js`/`secretword.js`/`audio.js` 同款加固）。语法基线 ES2020 以内（Safari 14 兼容）：全文
`var`/`function` 声明式，不使用箭头函数 / `let` / `const` / 模板字符串 / 可选链 `?.` / 空值合并
`??`，无 `import`/`export`，零外部请求。

**本模块只应被引入一次**。`pointer.js` IIFE 顶部有重复引入守卫
`if (window.WTJ_POINTER) { return; }`：第二次引入会在任何接线副作用之前直接短路返回，不会
重新注册 `window` 级 `mousemove`/`mousedown`/`mouseup`/`click` 监听器，`window.WTJ_POINTER`
始终指向第一个实例。

## 2. 事件模型总览

- 本文件是**唯一权威**的指针输入监听方：一套 `window` 级 `mousemove`/`mousedown`/`mouseup`/
  `click` 监听器，其余任何模块都不应该再自己监听这四种原始事件去做判定（`app.js` 保留自己的
  `mousemove`/`click` 监听器，但只做 `poke()`/debug 文本/音频解锁这类**与指针判定无关**的事，
  不再自己 `spawnTrailDot`/`spawnRing`）。
- 纯事件驱动，**没有自己的 `requestAnimationFrame` 循环**：尾迹强度/点击强度只在对应事件触发
  时结算一次，存成快照（`getTrailIntensity()`/`getClickIntensity()`），两次事件之间不会自己
  慢慢变化。这对消费方是安全的，因为像 `app.js` 这样的消费方本来也只在事件触发时才可能画东西。
- 悬停判定（`REQ-TASK-09`）需要"没有新事件也要在 1 秒后触发"，因此**唯一**用到了定时器
  （`setTimeout`），见第 5 节。

## 3. API 一览

### 全局事件订阅（多订阅者，任意数量，回调数组内部 try/catch 隔离，一个订阅者抛错不影响其余）

```js
WTJ_POINTER.onMove(fn)            // fn(x, y, trailIntensity)
WTJ_POINTER.onClickFeedback(fn)   // fn(x, y, { intensity, soundless, targetId })
WTJ_POINTER.onDragStart(fn)       // fn({ id, x, y })
WTJ_POINTER.onDragMove(fn)        // fn({ id, x, y, followX, followY })
WTJ_POINTER.onDrop(fn)            // fn({ success, type, draggedId, targetId, x, y })
```

- `onMove`：每次 `mousemove` 触发一次。`trailIntensity ∈ [0,1]` 是这次 move 结算出的尾迹强度
  （REQ-PTR-01）。`app.js` 现有接线：强度 ≤0.02 时跳过、否则以 `Math.random() > trailIntensity`
  做概率丢弃，强度越低尾迹点越稀疏——这不是本文件的契约，是 `app.js` 自己的渲染策略，014/其余
  消费方可以按自己的需要用不同的策略消费同一个 `trailIntensity` 数值。
- `onClickFeedback`：每次 `click` 触发一次（REQ-PTR-02）。`intensity` 随连续快速点击衰减；
  `soundless` 为 `true` 时表示点击间隔太快，消费方应该跳过播放音效（当前 `app.js`/`audio.js`
  还没有接通用的"点击音效"入口，这个标志先预留，接线时在 `onClickFeedback` 回调里读它即可）；
  `targetId` 是命中的可点击 target 的 `id`（未命中任何 target 时为 `null`），供判断要不要按
  "点中任务目标/宝箱/有效对象时才有明显反应"（REQ-PTR-02 大反馈条件）渲染更明显的效果——具体
  多明显、什么形式，本文件不越权决定，只给事实。
- `onDragStart`/`onDragMove`：拖拽生命周期里"抓起来"与"拖拽中每一帧"两个时机，见第 4 节状态机。
- `onDrop`：**拖拽结束的唯一事件**，成功与取消都走这一个订阅列表，用 `success`/`type` 字段
  区分（`type` 是 `'drop'` 或 `'dropCancel'`，与 `success` 同义、多给一个字符串字段方便打日志/
  调试，二选一读都行）。**不要**假设有单独的 `onDropCancel` 方法——没有，冻结的 API 清单里只有
  `onDrop`。

### 可交互目标注册（给 014 任务模板卡用，REQ-TASK-07~09）

```js
WTJ_POINTER.registerTarget(id, config)
WTJ_POINTER.unregisterTarget(id)
```

`config` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `getBounds()` | function → `{x,y,w,h}` | 优先读取，viewport 坐标（px），每次命中测试都会重新调用一次（可以跟着物体的实际渲染位置实时变化，不需要每次移动物体后手动更新一份"缓存 bounds"）。 |
| `el` | DOM 元素 | `getBounds` 缺失时退化为 `el.getBoundingClientRect()`。两者都缺失时该 target 无法参与几何命中判定（仍会被注册，只是 hover/click/drag 判定时被跳过，不抛错）。 |
| `accepts` | `string[]` | 子集 of `['hover','click','drag']`。决定这个 target 参与哪些判定：`'hover'` 参与 1 秒悬停判定（REQ-TASK-09）；`'click'` 参与点击命中判定（REQ-TASK-08）；`'drag'` 表示这个 target 可以作为"拖拽的有效落点"（drop zone，不是"自己能被拖走"）。 |
| `draggable` | boolean | `true` 表示这个 target 本身可以被抓起拖动（REQ-TASK-07 里的苹果/狗狗/星星）。与 `accepts` 里的 `'drag'` 是两件独立的事——`'drag'` 描述"能不能接收别人拖过来"，`draggable` 描述"自己能不能被拖走"；一个 target 理论上可以两者都是（较少见），也可以只是其中一种。 |
| `dropTargetIds` | `string[]`（可选，仅对 `draggable:true` 的 target 有意义） | 限定"这次拖拽只有这些 id 的 target 算有效落点"。缺省时任何 `accepts` 含 `'drag'` 的 target 命中即算成功。014 如果需要"苹果只能放进篮子、放进狗窝不算"这类一对一正确性判定，**在这里声明**即可，不需要自己在 `onDrop` 回调里再比对一次 id。 |
| `onHover(id)` | function | 该 target 累计悬停满 `findHoverSec` 秒时调用一次。 |
| `onClick(id)` | function | 该 target 被点中时调用一次。 |
| `onDrop({draggedId,x,y})` | function | 该 target 作为有效落点、真的接住一次成功拖拽时调用一次。 |

同一个 `id` 重复调用 `registerTarget` 会先卸载旧的（清理悬停计时器/拖拽引用）再注册新的——
可以用同一个 `id` 更新一个 target 的配置（比如换一个新回合的 `getBounds`）。`unregisterTarget`
会顺带清掉该 target 未完成的悬停计时器；若该 target 正处于被拖拽状态，静默复位拖拽状态（不会
再触发后续 `onDragMove`/`onDrop`，因为它的 `config` 已经被删除）。

### 只读查询

```js
WTJ_POINTER.getTrailIntensity()   // number [0,1]，当前尾迹强度快照
WTJ_POINTER.getClickIntensity()   // number [0,1]，当前点击强度快照
WTJ_POINTER.getPointerState()     // { x, y, dragging, activeDragId, trailIntensity }
```

`getPointerState()` 是给 QA/调试用的一次性快照（普通对象，非内部状态引用）。

### 测试专用（非生产契约）

```js
WTJ_POINTER._setClock({ setTimeout, clearTimeout, now })
```

下划线前缀标识"内部/测试用"，与 `task.js._setClock` 同款模式，供
`tests/unit/pointer-engine.test.mjs` 用假时钟把尾迹 3 秒衰减、悬停 1 秒判定"快进"掉。014/019
的生产代码不应该调用它。

## 4. 拖拽状态机（REQ-PTR-03 / REQ-TASK-07）

```
         mousedown 命中 draggable target（仅主键 button===0）
       idle ─────────────────────────────────► dragging
        ▲                                          │
        │       mouseup（仅主键；命中→drop，未命中→dropCancel） │
        └──────────────────────────────────────────┘
```

只有 `idle`/`dragging` 两个状态——"抓取感"就是进入 `dragging` 的那一刻（`mousedown` 命中即刻
`emit dragStart`，不需要先移动一点才算开始抓取）。

1. `mousedown`（仅主键，见下方 P1-1）命中一个 `draggable:true` 的 target（多个重叠时取"最后
   注册的"，即约定为最上层）：记录指针相对该 target 左上角的偏移（抓取点，让物体不会跳到指针
   正下方，而是保持被抓的那一点跟着指针走），`emit dragStart({id,x,y})`。
2. `dragging` 期间每次 `mousemove`：目标跟随位置用弹性系数
   （`manifest.pointer.drag.elastic.followStiffnessPlaceholder`/`followDampingPlaceholder`，
   缺省 `0.2`/`0.6`）做一次弹簧-阻尼积分朝"指针位置－抓取偏移"逼近——不是瞬间贴过去，是
   "弹性跟随"。`emit dragMove({id,x,y,followX,followY})`，`followX`/`followY` 就是消费方应该把
   物体画在哪。
3. `mouseup`（仅主键，见下方 P1-1）结束拖拽：以指针当前坐标做点命中测试，候选是所有 `accepts`
   含 `'drag'`、不是被拖 target 自己、且（若被拖 target 声明了 `dropTargetIds`）在白名单内的
   target。
   - 命中：调用命中 target 的 `config.onDrop({draggedId,x,y})`，`emit onDrop({success:true,
     type:'drop',draggedId,targetId,x,y})`。
   - 未命中：不调用任何 target 的 `onDrop`，只 `emit onDrop({success:false,type:'dropCancel',
     draggedId,targetId:null,x,y})`（拖错不惩罚，弹回动画由消费方渲染，本文件只给"没成功"这个
     事实）。
   - 之后立即复位到 `idle`。

**主键守卫（P1-1，切目标用户）**：`mousedown` **和** `mouseup` 都只处理主键
（`event.button === 0`）。3 岁幼儿在拖拽过程中右键点按 / 触控板双指点按会派发
`mouseup(button!==0)`——这类非主键 `mouseup` 一律**被忽略，拖拽继续**，物体不会中途脱手；只有
主键 `mouseup` 才终结拖拽。非主键 `mousedown` 同样不会开始一次拖拽。

**残留拖拽收尾（P2-1）**：正常情况下 `dragging` 只会从 `idle` 经 `mousedown` 进入。但若上一次
拖拽的 `mouseup` 丢失（窗口外释放 / 系统手势打断 / 合成事件缺 `mouseup`），`dragging` 会残留为
`true`。此时再来一次 `mousedown`，引擎会**先把旧拖拽以 `dropCancel` 收尾**（`emit onDrop
({success:false,type:'dropCancel',draggedId: 旧 id,...})`）再处理新的 grab，**绝不静默换绑**——
否则旧拖拽既不 `drop` 也不 `dropCancel`，014 按旧 `id` 渲染的拖拽视觉会永久悬空。

**工程决策：drop 后抑制紧随的 `onClick`（TL 未明确规定，PM/TL 如认为不需要可要求移除，见
`pointer.js` 里 `suppressClickSetAt` 相关代码）**：一次 `dragging → mouseup` 结束后，浏览器仍会
照常再派发一次原生 `click`。若刚经历过一次拖拽，紧随其后的这一次 `click` 只算点击强度 / 触发
`onClickFeedback`（视觉上无害），但跳过对命中 target 的 `onClick` 调用一次——避免"拖苹果放进
篮子"这一次拖放同时又被当成一次对篮子的点击而触发篮子自己的 `onClick`（如果篮子恰好也注册了
`accepts:'click'`）。**该抑制带时效（P2-4）**：仅在 `mouseup` 后约 100ms 内生效；万一 drop 后
浏览器根本没派 `click`，标志也不会残留吞掉未来某次真实的 `onClick`。

## 5. 悬停判定（REQ-TASK-09，`manifest.tasks.timing.findHoverSec`，缺省 1 秒）

每次 `mousemove` 都会对所有 `accepts` 含 `'hover'` 的 target 做一次点在矩形内测试：

- **进入**（不在 → 在）：记录进入时刻，排一个 `findHoverSec` 秒后触发的定时器。
- **保持在内**：不做任何事，定时器已经在跑。
- **移出**（在 → 不在）：清掉定时器、复位状态（"移出重置计时"）。
- **定时器触发**：调用 `config.onHover(id)`。
- 同一段悬停只触发一次 `onHover`；移出再移入算新的一段，可以再次触发。

**定时器到期时复测 bounds（P2-2）**：指针"移出 → 清定时器"这条路径**只在 `mousemove` 时触发**。
但用 `getBounds()` 的动态目标可能在指针**静止不动**期间自己漂移走了（本节反复强调 `getBounds`
每次命中测试都实时重取——寻找类任务里目标可能就是会动的）；那种情况下没有 `mousemove` 来清
定时器。因此定时器到期时会**再用最近一次已知指针位置对当前 `bounds` 复测一次**，指针已不在其内
就不触发 `onHover`。你不会遇到"目标明明已经从指针下移开、却还是判定悬停完成"的假阳性。

**拖拽期间的悬停不被引擎屏蔽（P2-3）**：悬停判定**不看是否正在拖拽**——拖着苹果路过小狗、停满
1 秒，仍会触发小狗的 `onHover`。这是本引擎"只播事实、不替 014 做业务决策"的一贯立场（引擎无从
知道"拖拽路过"该不该算一次寻找完成，那是任务语义）。**判据交给 014**：`getPointerState()` 暴露
`dragging` 字段，寻找类任务的 `onHover` 回调里可以先读它——

```js
WTJ_POINTER.registerTarget('dog', {
  el: dogEl, accepts: ['hover'],
  onHover: function (id) {
    if (WTJ_POINTER.getPointerState().dragging) return; // 拖拽路过不算"找到"
    completeFindTask();
  }
});
```

**"点一下也算完成"**（`manifest.tasks.templates.find.schema.pressOrHoverAlsoCompletes`）由 014
任务模板层实现：同一个 target 若同时 `accepts` 了 `'hover'` 与 `'click'`，`onClick` 与
`onHover` 可以指向同一个"任务完成"回调，本文件不替 014 做这层业务耦合。

## 6. 尾迹强度算法（REQ-PTR-01）

- 连续移动（两次 `mousemove` 间隔 ≤ 220ms，本卡本地占位值）视为同一段"晃动"；间隔更大视为
  "停了一下"，这段晃动重新起算，强度弹回基础值（"停一下再恢复"）。
- 基础强度由本次移动速度（px/ms）插值得到（越快越接近上限，"快速移动时稍明显"），上限刻意
  保守（`0.55`），满足 subtle 要求，不做强烈常驻拖尾。
- 这段晃动持续到 `idleDecayApproxSec`（`manifest.pointer.move.idleDecayApproxSec`，缺省 3 秒）
  之前强度就是基础强度；超过之后用一段坡道线性衰减到地板值（`0.1`，"变弱"不是"消失"），并在
  继续晃动期间保持地板值，直到出现一次"停一下"才重新弹回。
- 具体的衰减坡道时长、地板值、速度饱和阈值都是本卡本地防御式占位常量（`docs/index.html` 与
  `manifest.js` 只给了"约 3 秒""变弱""稍明显"这类定性描述，没有给出精确曲线数值），做法与
  `keyboard.js` 的 `FUNCTION_KEY_DECAY_SPAN` 完全同款，未来若 PM/TL 明确具体曲线参数应回写进
  `manifest.js`。

**REQ-PTR-01 的"大反馈条件"（经过有效对象轻微躲开/旋转/发光）没有对应的专用事件**——冻结的
事件 API 清单里没有为它单开一个（TL 定案的清单如此）。消费方可以用 `getPointerState()` 的
`x`/`y` 结合 `registerTarget` 注册时提供的 `getBounds()` 自行判断"指针是否靠近某 target"来
实现这类纯视觉反应，不需要本文件额外广播。

## 7. 点击强度算法（REQ-PTR-02）

- 两次点击间隔 ≤ 500ms（本卡本地占位值）视为同一段"连续狂点"，streak 递增，强度按
  `1 - (streak-1)/5` 衰减到 0；间隔更大视为新的一段，streak 重置为 1（"第一下"永远拿满强度）。
- `soundless` 独立判定：只要与上一次点击的间隔 < 180ms（比一般连点更极端的"太快"）就标 `true`；
  第一次点击（不存在"上一次"）恒为 `soundless:false`。**这两条判定用的是不同阈值**——间隔
  300ms 会延续衰减 streak（因为 ≤500ms）但不会被标 `soundless`（因为 ≥180ms），详见
  `tests/unit/pointer-engine.test.mjs` 里专门覆盖这个边界的用例。

## 8. 降级契约（所有消费方都可以依赖这一点）

- `pointer.js` **不要求** `window.WTJ_MANIFEST` 存在——缺失时回退到内置最小默认值
  （`idleDecayApproxSec:3` / `followStiffnessPlaceholder:0.2` / `followDampingPlaceholder:0.6` /
  `findHoverSec:1`）并 `console.warn`，整个引擎（尾迹/点击/拖拽/悬停）依然正常工作。
- 所有公开方法都**不抛出未捕获异常**：内部对 target 回调（`onHover`/`onClick`/`onDrop`）与
  全局订阅者回调的调用均包了 `try/catch`，一个抛错不影响其余订阅者/后续事件处理。
- `app.js` 侧的降级：`window.WTJ_POINTER` 缺失/加载失败时，`app.js` 只 `console.warn` 并跳过
  尾迹/点击圆环订阅，不会抛错，也不会重新实现一套"直连兜底"逻辑（避免两条实现分叉、日后行为
  不一致）——此时鼠标尾迹与点击圆环视觉效果不可用，但键盘/任务等其余功能不受影响。

## 9. 各消费卡怎么用（快速对照）

| 卡 | 用什么 API | 备注 |
|---|---|---|
| `app.js`（本卡已接线） | `onMove(fn)` 按 `trailIntensity` 控制 `spawnTrailDot`；`onClickFeedback(fn)` 按 `intensity` 控制 `spawnRing` | 详见 `app.js` "指针引擎订阅" 一节注释 |
| 014 任务模板卡 | `registerTarget(id, config)` 注册拖拽物体/落点/点击目标/寻找目标；订阅 `onDragStart`/`onDragMove`/`onDrop` 渲染拖拽视觉 | `config` 形状见第 3 节表格；任务"是否完成"的业务判定仍由 014 自己在 `onHover`/`onClick`/`onDrop` 回调里做，本文件只给几何/时序事实 |
| QA | `getPointerState()` 断言当前指针/拖拽状态；`tests/unit/pointer-engine.test.mjs` 是本卡随附的持久化单测，覆盖尾迹衰减/点击衰减/拖拽状态机/悬停判定/防御式/冻结/多订阅者隔离 | |
