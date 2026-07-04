// WTJ-20260704-012 — 鼠标/触控板反馈与拖拽基础引擎（window.WTJ_POINTER）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function 声明式，不用箭头函数 / let /
// const / 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求（不 fetch 任何东西）、非 module
// （无 import/export），以普通 <script src="pointer.js"> 标签加载，需排在 keyboard.js 之后、
// app.js 之前（app.js 初始化时要读 window.WTJ_POINTER.onMove 等 API 完成订阅）。
//
// -----------------------------------------------------------------------
// 职责边界（TL 已定案，见卡 WTJ-20260704-012 说明）
// -----------------------------------------------------------------------
// 本文件是"鼠标/触控板输入 → 判定规则（尾迹强度/点击强度/拖拽状态机/悬停判定）→ 事件"这条
// 逻辑链的唯一权威监听方（window 上单一套 mousemove/mousedown/mouseup/click 监听）。
// 本文件明确不做：不创建/操作任何 DOM、不在 Canvas 上画任何东西（尾迹光点/点击圆环的可视化
// 仍由 app.js 的 drawTrail/drawRings 完成，本文件只提供强度数值）、不判定某个具体任务"是否
// 完成"（拖对了/点对了/找到了这类业务判定是 014 任务模板卡的事，本文件只负责把"拖到了哪个
// 目标""点中了哪个目标""在哪个目标上停满了 1 秒"这些原始几何/时序事实以事件形式广播出去）。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_POINTER，Object.freeze 冻结 + 绑定加固，多订阅者，回调数组内部
// try/catch 隔离，与 keyboard.js / secretword.js / task.js 同款范式）
// -----------------------------------------------------------------------
// 【全局事件订阅（多订阅者，任意数量，抛错互相隔离）】
//   onMove(fn)                fn(x, y, trailIntensity)。每次 mousemove 触发一次，trailIntensity
//                              是本次 move 结算出的尾迹强度快照 [0,1]（REQ-PTR-01）。app.js 用它
//                              决定要不要 spawnTrailDot、浓度多少。
//   onClickFeedback(fn)       fn(x, y, { intensity, soundless, targetId })。每次 click 触发一次
//                              （REQ-PTR-02）。intensity∈[0,1] 随连续快速点击衰减；soundless 为
//                              true 时表示点击间隔太快，不应该出声音；targetId 是命中的可点击
//                              target 的 id（未命中任何 target 时为 null，供 app.js 判断是否要
//                              按"大反馈条件"渲染更明显的效果，具体渲染仍由 app.js/未来任务卡
//                              决定，本文件只给事实）。
//   onDragStart(fn)           fn({ id, x, y })。mousedown 命中一个 draggable target 时触发一次
//                              （"抓取感"起点，REQ-PTR-03）。
//   onDragMove(fn)             fn({ id, x, y, followX, followY })。拖拽期间每次 mousemove 触发，
//                              followX/followY 是引擎按弹性系数算出的"物体应该画在哪"（弹性跟随
//                              指针，见下方设计说明第 3 条），x/y 是当前指针原始坐标。
//   onDrop(fn)                 fn({ success, type, draggedId, targetId, x, y })。mouseup 结束一次
//                              拖拽时触发一次：命中有效落点 → { success:true, type:'drop',
//                              targetId: 命中的 target id }；未命中 → { success:false,
//                              type:'dropCancel', targetId:null }（REQ-PTR-03，拖错不惩罚，只是
//                              成功与否两种事实广播，具体"轻轻弹回"动画由消费方渲染）。
//
// 【可交互目标注册（给 014 任务模板卡用，REQ-TASK-07~09）】
//   registerTarget(id, config)
//     id      string，唯一标识（重复调用会先卸载旧的再注册新的，用于同一 id 更新配置）。
//     config.getBounds()  函数，返回 { x, y, w, h }（viewport 坐标，px）——优先读取。
//     config.el           DOM 元素，getBounds 缺失时退化为调用 el.getBoundingClientRect()。
//                          两者都缺失时该 target 无法参与任何几何命中判定（仍会被注册，只是
//                          hover/click/drag 命中判定时会被跳过，console.error 已在解析阶段捕获，
//                          不会抛出）。
//     config.accepts       string[]，子集 of ['hover','click','drag']。决定这个 target 参与哪些
//                          判定：'hover' → 参与 REQ-TASK-09 的 1 秒悬停判定；'click' → 参与点击
//                          命中判定；'drag' → 可以作为"拖拽的有效落点"（drop zone）。
//     config.draggable      boolean，true 表示这个 target 本身可以被抓起拖动（REQ-TASK-07 里的
//                          "苹果""狗狗""星星"这类物体）。与 accepts 里的 'drag' 是两件事：
//                          'drag' 描述"能不能接收别人拖过来"，draggable 描述"自己能不能被拖走"。
//     config.dropTargetIds  string[]（可选，仅对 draggable:true 的 target 有意义）。限定"这次
//                          拖拽只有这些 id 的 target 算有效落点"；缺省时任何 accepts 含 'drag'
//                          的 target 命中即算成功——014 若需要"苹果只能放进篮子、放进狗窝不算"
//                          这类一对一正确性判定，在这里声明即可，不需要在 onDrop 里自己再比对。
//     config.onHover(id)     该 target 累计悬停满 findHoverSec 秒时调用一次（REQ-TASK-09）。
//     config.onClick(id)     该 target 被点中时调用一次。
//     config.onDrop({draggedId, x, y})  该 target 作为有效落点、真的接住一次成功拖拽时调用。
//   unregisterTarget(id)      移除注册，顺带清掉该 target 未完成的悬停计时器；若该 target 正处于
//                          被拖拽状态，静默复位拖拽状态（不会再触发后续 onDragMove/onDrop）。
//
// 【只读查询】
//   getTrailIntensity()       number [0,1]，当前尾迹强度快照（等价于最近一次 onMove 回调收到的
//                          第三个参数，供不方便订阅事件、只想轮询的消费方使用）。
//   getClickIntensity()       number [0,1]，当前点击强度快照（最近一次点击结算的值）。
//   getPointerState()         { x, y, dragging, activeDragId, trailIntensity }。QA/调试快照。
//
// 【测试专用（非生产契约，下划线前缀，与 task.js._setClock 同款）】
//   _setClock({ setTimeout, clearTimeout, now })   替换悬停判定用的定时器与时钟源，供单测用
//                          假时钟把 1 秒悬停判定"快进"掉，不必真等待。生产代码不应调用它。
//
// -----------------------------------------------------------------------
// 设计说明（对应 docs/index.html #pointer REQ-PTR-01~03 / #tasks REQ-TASK-07~09 / #params）
// -----------------------------------------------------------------------
// 1. 尾迹强度算法（REQ-PTR-01，manifest.pointer.move.idleDecayApproxSec=3）：本文件是纯事件
//    驱动（没有自己的 rAF/tick 循环），强度只在每次 mousemove 时重新结算一次，存进
//    lastTrailIntensity，getTrailIntensity()/onMove 都读这个快照——这样足够，因为消费方
//    （app.js）本来就只在 mousemove 时才可能 spawnTrailDot，两次 move 之间没有新增尾迹点，
//    快照"过时"不影响任何观感。
//      - 连续移动（两次 move 间隔 ≤ PAUSE_RESET_MS）视为同一段"晃动"，从这段的起始时刻算已经
//        持续了多久（streakElapsedMs）；间隔 > PAUSE_RESET_MS 视为"停了一下"，重新开始计一段
//        （对应"停一下再恢复"）。
//      - 基础强度 baseIntensity 由本次移动速度（px/ms）在 [TRAIL_MIN_BASE, TRAIL_MAX_BASE] 间
//        插值得到，对应"很淡的光点尾迹，快速移动时稍明显"；上限刻意保守（0.55），满足"subtle"
//        要求，不做强烈常驻拖尾。
//      - streakElapsedMs 达到 idleDecayApproxSec（3000ms）之前强度就是 baseIntensity；达到之后
//        用 DECAY_RAMP_MS 做线性衰减坡道，降到 TRAIL_FLOOR（0.1，"变弱"不是"消失"，仍留一丝
//        反馈）并在继续晃动期间保持在地板值，直到出现一次"停一下"（间隔 > PAUSE_RESET_MS）才
//        重新计一段、强度弹回 baseIntensity。
//    PAUSE_RESET_MS / DECAY_RAMP_MS / TRAIL_MIN_BASE / TRAIL_MAX_BASE / TRAIL_FLOOR /
//    SPEED_SATURATE_PXPMS 均为本卡本地防御式占位常量——docs/index.html 与 manifest.js 只给了
//    "约 3 秒""变弱""稍明显"这类定性描述与 idleDecayApproxSec 这一个数值，没有给出衰减坡道/
//    速度映射的精确曲线，做法与 keyboard.js 的 FUNCTION_KEY_DECAY_SPAN 完全同款（局部占位、
//    不冒充文档精确值），未来若 PM/TL 明确具体曲线参数应回写进 manifest.js。
// 2. 点击强度算法（REQ-PTR-02）：同样纯事件驱动，只在 click 时结算一次。两次点击间隔
//    ≤ RAPID_CLICK_GAP_MS 视为同一段"连续狂点"，streak 递增；间隔更大则视为新的一段，streak
//    重置为 1（"第一下"永远拿满强度）。强度 = 1 - (streak-1)/CLICK_DECAY_SPAN，下限截到 0——
//    对应"连续狂点反馈越来越弱"。soundless 独立判定：只要与上一次点击的间隔 < SOUNDLESS_GAP_MS
//    （比一般连点更极端的"太快"）就标 true，供 app.js/未来音效接线跳过播放；第一次点击（不存在
//    "上一次"）恒为 soundless:false，对应"第一下有…短音效"。RAPID_CLICK_GAP_MS /
//    CLICK_DECAY_SPAN / SOUNDLESS_GAP_MS 同样是本卡本地占位常量（manifest.pointer.click
//    .rapidClickDecay 明确标注"未给出具体衰减曲线与频率阈值，由 009/012 引擎卡实现时补充"）。
//    "点中任务目标/宝箱/有效对象时才有明显反应"（REQ-PTR-02 大反馈条件）：本文件只把命中的
//    targetId 放进 onClickFeedback 的 payload，是否据此渲染更明显的效果、具体多明显，交给
//    app.js/未来任务卡决定（本文件不越权替消费方决定视觉表现）。
// 3. 拖拽状态机（REQ-PTR-03，验收 3/4）：只有 idle / dragging 两个状态（"grab"就是 dragging 的
//    起始时刻，mousedown 命中 draggable target 立刻 emit dragStart，不单独等一次 mousemove 才
//    算开始抓取——这样"抓取感"在按下的一瞬间就能被消费方感知到，不需要等用户先移动一点才有反应）：
//      - mousedown 命中已注册且 draggable:true 的 target（命中判定用 getBounds()/el 解析出的矩形
//        做点在矩形内测试，多个重叠 target 时取"最后注册的"，即约定为最上层）→ 记录指针相对该
//        target 左上角的偏移 dragOffset（"抓取点"，让物体不会跳到指针正下方，而是保持被抓的
//        那一点跟着指针走）→ activeDragId 置位，followPos 初始化为该 target 当前左上角（不产生
//        突兀跳变）→ emit dragStart。
//      - dragging 期间每次 mousemove：目标跟随位置 = 指针位置 - dragOffset；followPos 用弹性
//        系数（manifest.pointer.drag.elastic.followStiffnessPlaceholder / followDampingPlaceholder，
//        缺省 0.2 / 0.6）做一次弹簧-阻尼积分（加速度=位移差×stiffness，速度=速度×damping+加速度，
//        位置+=速度）朝目标跟随位置逼近——不是瞬间贴过去，是"弹性跟随"（REQ-PTR-03 正常反馈）。
//        emit dragMove({id,x,y,followX,followY})。
//      - mouseup（仅主键 button===0，见 P1-1）结束拖拽：以指针当前坐标做点命中测试，候选是所有
//        accepts 含 'drag' 且不是自己（不能拖到自己身上）、且若被拖 target 声明了 dropTargetIds
//        则必须在该白名单内的 target。命中 → 调用命中 target 的 config.onDrop({draggedId,x,y})，
//        并 emit onDrop({success:true,type:'drop',...})；未命中 → 不调用任何 target.onDrop，只 emit
//        onDrop({success:false,type:'dropCancel',...})（"拖错不惩罚，只轻轻弹回"——弹回动画本身
//        由消费方渲染，本文件只给"没成功"这个事实）。之后立即复位到 idle。
//      - P1-1（切目标用户）：非主键 mouseup（右键/触控板双指点按派发的 button!==0）在拖拽中一律
//        忽略，拖拽继续——3 岁幼儿拖拽中乱按不会让物体提前脱手。onMouseDown 早已有对称的 button 守卫。
//      - P2-1（换绑收尾）：正常情况下 dragging 只可能从 idle 经 mousedown 进入。但若上一次拖拽的
//        mouseup 丢失（窗口外释放/系统手势打断/合成事件缺 mouseup），dragging 会残留为 true；此时
//        又来一次 mousedown，会先把旧拖拽以 dropCancel 收尾（finalizeDragAsCancel）再处理新 grab，
//        绝不静默换绑——否则旧拖拽既无 drop 也无 dropCancel，014 按旧 id 渲染的拖拽视觉会永久悬空。
//      - 工程决策（TL 未明确规定，防止 drop 后紧跟意外的 onClick 双重触发）：一次 dragging→mouseup
//        结束后，浏览器仍会照常再派发一次原生 click 事件（mousedown+mouseup 天然配对触发）。若
//        刚经历过一次 dragging，紧随其后的这一次 click 只算点击强度/播 onClickFeedback（视觉上
//        无害），但跳过对 target.onClick 的调用一次——避免"放进篮子"这一次拖放同时又被当成一次
//        对篮子的点击而触发篮子自己的 onClick 语义（如果篮子恰好也注册了 accepts:'click'）。
//        P2-4：该抑制**带时效**（仅 mouseup 后 CLICK_SUPPRESS_WINDOW_MS 毫秒内生效，用 suppressClickSetAt
//        时间戳判定）——万一 drop 后浏览器根本没派 click，这个标志也不会残留吞掉未来某次真实 onClick。
//        非 TL 硬性要求，如 PM/TL 认为不需要这层保护可以移除（见 suppressClickSetAt 相关变量）。
// 4. 目标注册与命中测试：内部维护一个 id → 内部记录 的普通对象（Object.create(null) 建无原型
//    对象，避免未来 target id 撞上 'constructor'/'toString' 等原型链属性名时出现静默 bug，同款
//    secretword.js 的 roundHitSet 处理方式）+ 一个 registration-order 数组供命中测试遍历（倒序
//    遍历，"后注册的在上层"这一简单约定，本卡不引入真正的 z-index 概念）。
// 5. 悬停判定（REQ-TASK-09，manifest.tasks.timing.findHoverSec=1）：每次 mousemove 都会对所有
//    accepts 含 'hover' 的 target 做一次点在矩形内测试。从"不在→在"的那一刻起用 clockRef
//    .setTimeout 排一个 findHoverSec 秒后触发的定时器。"移出重置计时"就是"在→不在"（mousemove
//    时检测到）时 clearTimeout + 状态复位。同一段悬停只触发一次 onHover（触发后置 hoverFired，
//    防止长时间停留反复重触发；移出再移入算新的一段，hoverFired 复位）。
//    P2-2（动态目标复测）：定时器到期时会**再复测一次 bounds**——指针"移出→清 timer"这条路径只在
//    mousemove 时触发，但用 getBounds() 的动态目标可能在指针**静止不动**期间自己漂移走了（那种
//    情况下没有 mousemove 来清 timer）；因此 fireHoverIfStillTracking 到期时用最近一次已知指针
//    位置（lastX/lastY）对当前 bounds 复查，不在内则不触发 onHover。
//    P2-3（拖拽期间的悬停不被引擎屏蔽）：updateHoverTargets 不看 dragging，拖着苹果路过小狗停 1 秒
//    仍会触发小狗的 onHover——这是引擎"只播事实"的一致立场（不替 014 决定"拖拽路过算不算寻找完成"）。
//    getPointerState() 暴露 dragging 供 014 在寻找任务的 onHover 回调里自行判"若正在拖拽则忽略"。
//    这条已在 POINTER-API.md 明示。
//
// -----------------------------------------------------------------------
// REQ-PTR-01~03 / REQ-TASK-07~09 逐条落地位置索引（供 PM/QA 对照）：
//   REQ-PTR-01  updateTrailIntensity()：速度映射基础强度 + 3 秒衰减坡道 + 停顿恢复。
//               "经过有效对象轻微躲开/旋转/发光"：本文件通过 getPointerState()+
//               registerTarget 的 getBounds() 给消费方足够信息自行判定"指针是否靠近某 target"
//               来实现这类纯视觉反应；事件 API 冻结清单里没有为它单开一个事件（TL 定案的
//               清单如此），不是遗漏，是设计选择——见完成后自查报告里的说明。
//   REQ-PTR-02  computeClickIntensity()：连击衰减 + soundless 判定；onClickFeedback payload
//               的 targetId 供"大反馈条件"渲染判断。
//   REQ-PTR-03  onMouseDown/updateDragFollow/onMouseUp：抓取/弹性跟随/成功或取消两种结局。
//   REQ-TASK-07 registerTarget 的 draggable + accepts:'drag' + onDrop，对应拖拽类任务。
//   REQ-TASK-08 registerTarget 的 accepts:'click' + onClick，对应点击类任务。
//   REQ-TASK-09 updateHoverTargets()/fireHoverIfStillTracking()：1 秒悬停判定；"点一下也算
//               完成"由 014 任务模板层实现（同一个 target 若同时 accepts hover 与 click，
//               点击会走 config.onClick，014 可以让 onClick 和 onHover 指向同一个完成回调）。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 重复引入守卫（吸取 009/013 的教训）：本模块只应被引入一次。若脚本被重复引入，第二次执行
  // IIFE 若不短路，会再注册一整套 window 级 mousemove/mousedown/mouseup/click 监听——不仅会让
  // 尾迹/点击强度被计算两遍（数值互相打架），更严重的是 window.WTJ_POINTER 因下方 defineProperty
  // 不可写、仍指向"实例 1"，外部通过 registerTarget/onMove 等注册的订阅者都挂在"实例 1"上，却是
  // "实例 2"的监听器在真正处理原始事件——两者永不相遇，表现为尾迹/拖拽/悬停全部静默失效。
  // 因此在任何接线副作用之前直接短路返回。
  // ---------------------------------------------------------------------
  if (window.WTJ_POINTER) {
    return;
  }

  // ---------------------------------------------------------------------
  // manifest 访问器：与 keyboard.js / secretword.js / task.js 同一模式。缺失字段一律防御式
  // 回退到下方最小默认值并 console.warn，不阻断指针监听。
  // ---------------------------------------------------------------------
  var DEFAULT_MANIFEST = {
    pointer: {
      move: { idleDecayApproxSec: 3 },
      drag: { elastic: { followStiffnessPlaceholder: 0.2, followDampingPlaceholder: 0.6 } }
    },
    tasks: { timing: { findHoverSec: 1 } }
  };

  function getManifest() {
    if (window.WTJ_MANIFEST) {
      return window.WTJ_MANIFEST;
    }
    console.warn('[WTJ_POINTER] window.WTJ_MANIFEST 未找到（manifest.js 未加载或加载失败），回退到内置最小默认值。');
    return DEFAULT_MANIFEST;
  }

  function isNum(v) {
    return typeof v === 'number' && !isNaN(v) && isFinite(v);
  }

  function numOrDefault(v, d) {
    return isNum(v) ? v : d;
  }

  function clamp01(v) {
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  }

  var MANIFEST = getManifest();
  var PTR_CFG = MANIFEST.pointer || DEFAULT_MANIFEST.pointer;
  var MOVE_CFG = (PTR_CFG && PTR_CFG.move) || DEFAULT_MANIFEST.pointer.move;
  var DRAG_CFG = (PTR_CFG && PTR_CFG.drag) || DEFAULT_MANIFEST.pointer.drag;
  var DRAG_ELASTIC_CFG = (DRAG_CFG && DRAG_CFG.elastic) || DEFAULT_MANIFEST.pointer.drag.elastic;
  var TASKS_CFG = MANIFEST.tasks || DEFAULT_MANIFEST.tasks;
  var TASKS_TIMING_CFG = (TASKS_CFG && TASKS_CFG.timing) || DEFAULT_MANIFEST.tasks.timing;

  // REQ-PTR-01：manifest.pointer.move.idleDecayApproxSec（"约 3 秒"）。
  var IDLE_DECAY_MS = numOrDefault(MOVE_CFG.idleDecayApproxSec, DEFAULT_MANIFEST.pointer.move.idleDecayApproxSec) * 1000;
  // REQ-PTR-03：manifest.pointer.drag.elastic 的弹性系数占位值（文档未给精确数值，见文件头设计说明第 3 条）。
  var STIFFNESS = numOrDefault(DRAG_ELASTIC_CFG.followStiffnessPlaceholder, DEFAULT_MANIFEST.pointer.drag.elastic.followStiffnessPlaceholder);
  var DAMPING = numOrDefault(DRAG_ELASTIC_CFG.followDampingPlaceholder, DEFAULT_MANIFEST.pointer.drag.elastic.followDampingPlaceholder);
  // REQ-TASK-09：manifest.tasks.timing.findHoverSec（寻找类任务悬停判定阈值）。
  var FIND_HOVER_MS = numOrDefault(TASKS_TIMING_CFG.findHoverSec, DEFAULT_MANIFEST.tasks.timing.findHoverSec) * 1000;

  // 本卡本地防御式占位常量（文档/manifest 只给定性描述，无精确数值，见文件头设计说明第 1/2 条）。
  var PAUSE_RESET_MS = 220;        // 两次 move 间隔超过这个值视为"停了一下"，尾迹强度重新起算。
  var DECAY_RAMP_MS = 1200;        // 越过 3 秒阈值后，强度用多长时间线性坡到地板值。
  var TRAIL_MIN_BASE = 0.28;       // 慢速移动时的基础强度下限（subtle 上限保守）。
  var TRAIL_MAX_BASE = 0.55;       // 快速移动时的基础强度上限（依然 subtle，不做强烈拖尾）。
  var TRAIL_FLOOR = 0.1;           // 衰减到底后的地板值（"变弱"不是"消失"）。
  var SPEED_SATURATE_PXPMS = 1.2;  // 达到这个速度（px/ms）基础强度即封顶到 TRAIL_MAX_BASE。
  var RAPID_CLICK_GAP_MS = 500;    // 两次点击间隔在此之内视为同一段"连续狂点"。
  var CLICK_DECAY_SPAN = 5;        // 连续第几次点击强度衰减到 0（与 keyboard.js 的衰减跨度同款写法）。
  var SOUNDLESS_GAP_MS = 180;      // 点击间隔小于此值判定"太快"，标记 soundless。
  var CLICK_SUPPRESS_WINDOW_MS = 100; // P2-4：drop 后"抑制紧随 click 的 onClick"仅在此毫秒窗内有效，超时视为残留清除。

  // ---------------------------------------------------------------------
  // 可注入时钟（默认真实 setTimeout/clearTimeout/Date.now；测试用 _setClock 整体或部分替换，
  // 与 task.js 完全同款模式）。当前只有悬停判定（REQ-TASK-09）用到定时器；尾迹/点击强度是纯
  // 事件驱动即时结算，不需要定时器，只用 clockRef.now() 取时间戳。
  // ---------------------------------------------------------------------
  var clockRef = {
    setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimeout: function (id) { clearTimeout(id); },
    now: function () { return Date.now(); }
  };

  function _setClock(clock) {
    if (!clock || typeof clock !== 'object') {
      console.warn('[WTJ_POINTER] _setClock: 参数必须是对象，已忽略。');
      return;
    }
    if (typeof clock.setTimeout === 'function') {
      clockRef.setTimeout = clock.setTimeout;
    }
    if (typeof clock.clearTimeout === 'function') {
      clockRef.clearTimeout = clock.clearTimeout;
    }
    if (typeof clock.now === 'function') {
      clockRef.now = clock.now;
    }
  }

  // ---------------------------------------------------------------------
  // 订阅者管理：多订阅者数组 + 逐个 try/catch，防止下游回调抛错裸冒泡打断本引擎
  // （与 keyboard.js/secretword.js/task.js 完全同款模式）。
  // ---------------------------------------------------------------------
  var moveSubscribers = [];
  var clickFeedbackSubscribers = [];
  var dragStartSubscribers = [];
  var dragMoveSubscribers = [];
  var dropSubscribers = [];

  function addSubscriber(list, fn) {
    if (typeof fn !== 'function') {
      console.warn('[WTJ_POINTER] 订阅回调必须是函数，已忽略此次注册。');
      return;
    }
    list.push(fn);
  }

  // args 恒为数组，emit 内部用 apply 展开成多参数调用——尾迹/点击反馈/拖拽事件的参数个数不同，
  // 用统一的"参数数组"约定比每个事件单开一个 emit 变体更简单。
  function emit(list, args) {
    for (var i = 0; i < list.length; i++) {
      try {
        list[i].apply(null, args);
      } catch (err) {
        console.error('[WTJ_POINTER] 订阅回调抛出异常，已捕获：', err);
      }
    }
  }

  function callTargetCallback(fn, args) {
    if (typeof fn !== 'function') return;
    try {
      fn.apply(null, args);
    } catch (err) {
      console.error('[WTJ_POINTER] target 回调抛出异常，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // 指针位置状态
  // ---------------------------------------------------------------------
  var lastX = 0;
  var lastY = 0;

  // ---------------------------------------------------------------------
  // 尾迹强度状态（REQ-PTR-01）
  // ---------------------------------------------------------------------
  var lastMoveTime = null;     // 上一次 mousemove 的时间戳（clockRef.now()），null = 尚未有过 move
  var streakStartTime = 0;     // 当前这段"连续晃动"的起始时间戳
  var lastTrailIntensity = TRAIL_MIN_BASE; // 尚未有任何 move 时的默认快照

  function updateTrailIntensity(x, y, now) {
    var speed = 0;
    if (lastMoveTime !== null) {
      var dt = now - lastMoveTime;
      if (dt > PAUSE_RESET_MS || dt <= 0) {
        // 停了一下（或时钟异常回退）→ 这段晃动重新起算，强度弹回基础值。
        streakStartTime = now;
      }
      if (dt > 0) {
        var dx = x - lastX;
        var dy = y - lastY;
        speed = Math.sqrt(dx * dx + dy * dy) / dt; // px/ms
      }
    } else {
      streakStartTime = now;
    }
    lastMoveTime = now;

    var speedFactor = Math.min(1, speed / SPEED_SATURATE_PXPMS);
    var baseIntensity = TRAIL_MIN_BASE + (TRAIL_MAX_BASE - TRAIL_MIN_BASE) * speedFactor;

    var elapsed = now - streakStartTime;
    var intensity = baseIntensity;
    if (elapsed >= IDLE_DECAY_MS) {
      var rampT = Math.min(1, (elapsed - IDLE_DECAY_MS) / DECAY_RAMP_MS);
      intensity = baseIntensity - (baseIntensity - TRAIL_FLOOR) * rampT;
    }

    lastTrailIntensity = clamp01(intensity);
    return lastTrailIntensity;
  }

  function getTrailIntensity() {
    return lastTrailIntensity;
  }

  // ---------------------------------------------------------------------
  // 点击强度状态（REQ-PTR-02）
  // ---------------------------------------------------------------------
  var lastClickTime = null;
  var clickStreak = 0;
  var lastClickIntensity = 0;
  var lastClickSoundless = false;

  function computeClickIntensity(now) {
    var gap = (lastClickTime === null) ? null : now - lastClickTime;
    var soundless = (gap !== null && gap < SOUNDLESS_GAP_MS);

    if (gap === null || gap > RAPID_CLICK_GAP_MS) {
      clickStreak = 1;
    } else {
      clickStreak += 1;
    }
    lastClickTime = now;

    var decayMultiplier = Math.max(0, 1 - (clickStreak - 1) / CLICK_DECAY_SPAN);
    lastClickIntensity = clamp01(decayMultiplier);
    lastClickSoundless = soundless;

    return { intensity: lastClickIntensity, soundless: lastClickSoundless };
  }

  function getClickIntensity() {
    return lastClickIntensity;
  }

  // ---------------------------------------------------------------------
  // 可交互目标注册表（REQ-TASK-07~09）
  // ---------------------------------------------------------------------
  // Object.create(null)：无原型对象，避免 target id 撞上 'constructor'/'toString' 等原型链
  // 属性名导致静默 bug（同款 secretword.js 的 roundHitSet 处理方式）。
  var targets = Object.create(null);
  var targetOrder = []; // 注册顺序，命中测试时倒序遍历（"后注册的在上层"）

  function resolveBounds(config) {
    try {
      if (config && typeof config.getBounds === 'function') {
        var b = config.getBounds();
        if (b && isNum(b.x) && isNum(b.y) && isNum(b.w) && isNum(b.h)) {
          return b;
        }
        return null;
      }
      if (config && config.el && typeof config.el.getBoundingClientRect === 'function') {
        var r = config.el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      }
    } catch (err) {
      console.error('[WTJ_POINTER] 解析 target bounds 失败，已捕获：', err);
    }
    return null;
  }

  function pointInBounds(x, y, b) {
    return !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  function acceptsType(config, kind) {
    return !!config && Array.isArray(config.accepts) && config.accepts.indexOf(kind) !== -1;
  }

  // filterFn(config, id) -> boolean。倒序遍历 targetOrder，返回第一个通过 filterFn 且几何命中
  // (x,y) 的 target 记录（{id, config}），都不命中返回 null。
  function hitTestTargets(x, y, filterFn) {
    for (var i = targetOrder.length - 1; i >= 0; i--) {
      var id = targetOrder[i];
      var rec = targets[id];
      if (!rec) continue;
      if (!filterFn(rec.config, id)) continue;
      var b = resolveBounds(rec.config);
      if (pointInBounds(x, y, b)) {
        return rec;
      }
    }
    return null;
  }

  function clearHoverTracking(rec) {
    if (rec.hoverTimerId !== null) {
      clockRef.clearTimeout(rec.hoverTimerId);
      rec.hoverTimerId = null;
    }
    rec.hoverInsideSince = null;
    rec.hoverFired = false;
  }

  function registerTarget(id, config) {
    if (typeof id !== 'string' || id.length === 0) {
      console.warn('[WTJ_POINTER] registerTarget: id 必须是非空字符串，已忽略。', id);
      return;
    }
    if (!config || typeof config !== 'object') {
      console.warn('[WTJ_POINTER] registerTarget: config 必须是对象，已忽略。id=' + id);
      return;
    }

    // 同一个 id 重复注册：先卸载旧的（清理其悬停计时器/拖拽引用），再注册新的，
    // 允许 014 用同一个 id 更新一个 target 的配置（比如换一个新回合的 getBounds）。
    if (targets[id]) {
      unregisterTarget(id);
    }

    var normalized = {
      getBounds: (typeof config.getBounds === 'function') ? config.getBounds : null,
      el: config.el || null,
      accepts: Array.isArray(config.accepts) ? config.accepts : [],
      draggable: config.draggable === true,
      dropTargetIds: Array.isArray(config.dropTargetIds) ? config.dropTargetIds : null,
      onHover: (typeof config.onHover === 'function') ? config.onHover : null,
      onClick: (typeof config.onClick === 'function') ? config.onClick : null,
      onDrop: (typeof config.onDrop === 'function') ? config.onDrop : null
    };

    targets[id] = {
      id: id,
      config: normalized,
      hoverInsideSince: null,
      hoverTimerId: null,
      hoverFired: false
    };
    targetOrder.push(id);
  }

  function unregisterTarget(id) {
    var rec = targets[id];
    if (!rec) return;

    clearHoverTracking(rec);

    if (activeDragId === id) {
      // 正在被拖拽的 target 被卸载：静默复位拖拽状态，不再触发后续 dragMove/onDrop
      // （config 都要被删了，再调用它的回调没有意义）。
      dragging = false;
      activeDragId = null;
    }

    delete targets[id];
    var idx = targetOrder.indexOf(id);
    if (idx !== -1) {
      targetOrder.splice(idx, 1);
    }
  }

  function fireHoverIfStillTracking(id) {
    var rec = targets[id];
    if (!rec) return; // 期间被卸载
    rec.hoverTimerId = null;
    if (rec.hoverInsideSince === null) return; // 理论上不会走到这（移出即清 timer），防御式保留
    if (rec.hoverFired) return;
    // P2-2（Fable 对抗评审）：定时器到期时复测 bounds——指针"移出→清 timer"这条路径只在
    // mousemove 时触发，但用 getBounds() 的动态目标可能在指针**静止不动**期间自己移走了
    // （POINTER-API §3 宣传 getBounds 每次命中测试都实时重取，寻找任务的目标就可能这样漂移）；
    // 那种情况下不会有 mousemove 来清 timer，若不复测就会对"指针其实已不在其内"的目标误触发
    // onHover。用最近一次已知指针位置（lastX/lastY）对当前 bounds 复查一次，不在内则不触发。
    if (!pointInBounds(lastX, lastY, resolveBounds(rec.config))) {
      clearHoverTracking(rec);
      return;
    }
    rec.hoverFired = true;
    callTargetCallback(rec.config.onHover, [id]);
  }

  function updateHoverTargets(x, y, now) {
    for (var i = 0; i < targetOrder.length; i++) {
      var id = targetOrder[i];
      var rec = targets[id];
      if (!rec || !acceptsType(rec.config, 'hover')) continue;

      var b = resolveBounds(rec.config);
      var inside = pointInBounds(x, y, b);

      if (inside) {
        if (rec.hoverInsideSince === null) {
          rec.hoverInsideSince = now;
          rec.hoverFired = false;
          rec.hoverTimerId = clockRef.setTimeout(
            (function (targetId) {
              return function () { fireHoverIfStillTracking(targetId); };
            })(id),
            FIND_HOVER_MS
          );
        }
      } else if (rec.hoverInsideSince !== null) {
        clearHoverTracking(rec);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 拖拽状态机（REQ-PTR-03）
  // ---------------------------------------------------------------------
  var dragging = false;
  var activeDragId = null;
  var dragOffsetX = 0;
  var dragOffsetY = 0;
  var followPos = { x: 0, y: 0 };
  var velX = 0;
  var velY = 0;
  // P2-4（Fable 对抗评审）：drop 结束后要抑制浏览器紧随其后派发的那一次原生 click 的 onClick
  // （见文件头设计说明第 3 条最后一段）。改为记录"抑制被置位的时刻"而非一个裸布尔——只在其后
  // CLICK_SUPPRESS_WINDOW_MS 毫秒内生效；万一 drop 后浏览器根本没派 click（某些手势/合成事件
  // 路径），这个标志也不会一直残留吞掉未来某次真实的 onClick。null = 未置位。
  var suppressClickSetAt = null;

  function updateDragFollow(x, y) {
    var targetX = x - dragOffsetX;
    var targetY = y - dragOffsetY;
    var ax = (targetX - followPos.x) * STIFFNESS;
    var ay = (targetY - followPos.y) * STIFFNESS;
    velX = velX * DAMPING + ax;
    velY = velY * DAMPING + ay;
    followPos.x += velX;
    followPos.y += velY;
  }

  // P2-1（Fable 对抗评审）：把当前拖拽以 dropCancel 收尾（拖错不惩罚），复位拖拽状态。供两处调用：
  // 正常 onMouseUp 未命中落点时，以及 onMouseDown 发现"上一次拖拽的 mouseup 丢失、dragging 仍为
  // true"时——后者若不收尾就直接换绑到新目标，旧拖拽既无 drop 也无 dropCancel，014 按旧 id 渲染
  // 的拖拽视觉会永久悬空。
  function finalizeDragAsCancel(x, y) {
    var draggedId = activeDragId;
    dragging = false;
    activeDragId = null;
    emit(dropSubscribers, [{ success: false, type: 'dropCancel', draggedId: draggedId, targetId: null, x: x, y: y }]);
  }

  function onMouseDown(e) {
    if (e && typeof e.button === 'number' && e.button !== 0) {
      return; // 只处理主键（左键/触控板单指点按），忽略右键等。
    }
    var x = numOrDefault(e && e.clientX, 0);
    var y = numOrDefault(e && e.clientY, 0);

    // P2-1：若上一次拖拽的 mouseup 丢失（窗口外释放/系统手势打断/合成事件缺 mouseup），此刻
    // dragging 仍为 true。先把旧拖拽以 dropCancel 收尾再处理新的 grab，避免旧拖拽视觉悬空。
    // 用当前 mousedown 坐标做收尾坐标（旧拖拽真正的释放点不可知，用"此刻指针在哪"是最合理的近似）。
    if (dragging) {
      finalizeDragAsCancel(x, y);
    }

    var hit = hitTestTargets(x, y, function (config) {
      return config.draggable === true;
    });
    if (!hit) return;

    // WTJ-080：命中了 draggable target、确认要开始自定义拖拽时，preventDefault 这次 mousedown，
    // 阻止浏览器/WKWebView 由它启动原生 HTML5 drag-and-drop——原生拖拽一旦启动，mousemove/
    // mouseup 会被 drag 系事件取代不再派发，onMouseUp 永不触发，下面的拖拽状态机就会卡在
    // dragging=true 出不来，任务永远不完成（根因诊断的核心一环）。只在真的开始拖拽（hit 非空）
    // 时才 preventDefault，未命中的 mousedown 不受影响（避免误伤 focus 等原生默认行为）。
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }

    activeDragId = hit.id;
    dragging = true;

    var b = resolveBounds(hit.config) || { x: x, y: y, w: 0, h: 0 };
    dragOffsetX = x - b.x;
    dragOffsetY = y - b.y;
    followPos.x = b.x;
    followPos.y = b.y;
    velX = 0;
    velY = 0;

    emit(dragStartSubscribers, [{ id: activeDragId, x: x, y: y }]);
  }

  function onMouseUp(e) {
    // P1-1（Fable 对抗评审，切目标用户）：与 onMouseDown 对称的主键守卫——3 岁幼儿拖拽中右键/
    // 双指点按会派发 mouseup(button!==0)，若不过滤就会被当成"松手"提前判定 drop、物体脱手。
    // 只有主键（button===0）的 mouseup 才终结拖拽；非主键 mouseup 一律忽略，拖拽继续。
    if (e && typeof e.button === 'number' && e.button !== 0) {
      return;
    }
    if (!dragging) return;

    var x = numOrDefault(e && e.clientX, 0);
    var y = numOrDefault(e && e.clientY, 0);
    var draggedId = activeDragId;
    var draggedRec = targets[draggedId];
    var allowedIds = (draggedRec && draggedRec.config.dropTargetIds) ? draggedRec.config.dropTargetIds : null;

    var hit = hitTestTargets(x, y, function (config, id) {
      if (id === draggedId) return false; // 不能拖到自己身上
      if (!acceptsType(config, 'drag')) return false;
      if (allowedIds && allowedIds.indexOf(id) === -1) return false;
      return true;
    });

    dragging = false;
    activeDragId = null;
    suppressClickSetAt = clockRef.now(); // P2-4：记录置位时刻，仅在其后短暂窗内抑制紧随的 click.onClick

    if (hit) {
      callTargetCallback(hit.config.onDrop, [{ draggedId: draggedId, x: x, y: y }]);
      emit(dropSubscribers, [{ success: true, type: 'drop', draggedId: draggedId, targetId: hit.id, x: x, y: y }]);
    } else {
      emit(dropSubscribers, [{ success: false, type: 'dropCancel', draggedId: draggedId, targetId: null, x: x, y: y }]);
    }
  }

  // ---------------------------------------------------------------------
  // 事件监听（单一权威指针监听：window 上一套 mousemove/mousedown/mouseup/click）
  // ---------------------------------------------------------------------
  function onMouseMove(e) {
    var x = numOrDefault(e && e.clientX, 0);
    var y = numOrDefault(e && e.clientY, 0);
    var now = clockRef.now();

    var intensity = updateTrailIntensity(x, y, now);

    if (dragging) {
      updateDragFollow(x, y);
      emit(dragMoveSubscribers, [{ id: activeDragId, x: x, y: y, followX: followPos.x, followY: followPos.y }]);
    }

    updateHoverTargets(x, y, now);

    lastX = x;
    lastY = y;

    emit(moveSubscribers, [x, y, intensity]);
  }

  function onClickEvent(e) {
    var x = numOrDefault(e && e.clientX, 0);
    var y = numOrDefault(e && e.clientY, 0);
    var now = clockRef.now();

    var feedback = computeClickIntensity(now);

    var hit = hitTestTargets(x, y, function (config) {
      return acceptsType(config, 'click');
    });
    var targetId = hit ? hit.id : null;

    emit(clickFeedbackSubscribers, [x, y, { intensity: feedback.intensity, soundless: feedback.soundless, targetId: targetId }]);

    // P2-4：仅当抑制标志在 CLICK_SUPPRESS_WINDOW_MS 毫秒内被置位（即这确实是紧随一次 drop 的
    // 那次原生 click）才吞掉 onClick；无论是否命中窗口，读取后都一次性清除标志，避免残留。
    var suppressed = false;
    if (suppressClickSetAt !== null) {
      if (now - suppressClickSetAt <= CLICK_SUPPRESS_WINDOW_MS) {
        suppressed = true;
      }
      suppressClickSetAt = null;
    }

    if (!suppressed && hit) {
      callTargetCallback(hit.config.onClick, [hit.id]);
    }
  }

  window.addEventListener('mousemove', onMouseMove, false);
  window.addEventListener('mousedown', onMouseDown, false);
  window.addEventListener('mouseup', onMouseUp, false);
  window.addEventListener('click', onClickEvent, false);

  // ---------------------------------------------------------------------
  // QA / 调试快照
  // ---------------------------------------------------------------------
  function getPointerState() {
    return {
      x: lastX,
      y: lastY,
      dragging: dragging,
      activeDragId: activeDragId,
      trailIntensity: lastTrailIntensity
    };
  }

  // ---------------------------------------------------------------------
  // 对外冻结 API
  // ---------------------------------------------------------------------
  function onMove(fn) { addSubscriber(moveSubscribers, fn); }
  function onClickFeedback(fn) { addSubscriber(clickFeedbackSubscribers, fn); }
  function onDragStart(fn) { addSubscriber(dragStartSubscribers, fn); }
  function onDragMove(fn) { addSubscriber(dragMoveSubscribers, fn); }
  function onDrop(fn) { addSubscriber(dropSubscribers, fn); }

  var API = {
    onMove: onMove,
    onClickFeedback: onClickFeedback,
    onDragStart: onDragStart,
    onDragMove: onDragMove,
    onDrop: onDrop,
    registerTarget: registerTarget,
    unregisterTarget: unregisterTarget,
    getTrailIntensity: getTrailIntensity,
    getClickIntensity: getClickIntensity,
    getPointerState: getPointerState,
    _setClock: _setClock
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  // 绑定加固（与 task.js/secretword.js/audio.js 同款）：API 对象自身已 Object.freeze（属性
  // 不可增删改）；这里进一步把 window 上的 WTJ_POINTER 绑定设为不可写、不可重配置，防止整体
  // 重赋值（window.WTJ_POINTER = 伪造对象）把引擎换掉。重复引入已由 IIFE 顶部守卫短路，走不到
  // 这里，因此到达时 window.WTJ_POINTER 必为未定义；下面判断只是二次保险（兼容无 defineProperty
  // 环境）。
  if (!window.WTJ_POINTER && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_POINTER', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_POINTER) {
    window.WTJ_POINTER = API;
  }
})();
