// WTJ-20260704-013 — 问号任务框架与任务生命周期状态机（window.WTJ_TASK）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function，不用箭头函数 / let / const /
// 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求（不 fetch 任何东西）、非 module（无
// import/export），以普通 <script src="task.js"> 标签加载。当前**未被接入** index.html
// （不 wire 进运行时——见文件末尾「本卡边界」一节），接入属于 014（具体任务模板/视觉）/
// 019（整体集成）卡的工作。
//
// -----------------------------------------------------------------------
// 职责边界（TL 已定案，见卡 WTJ-20260704-013 说明）
// -----------------------------------------------------------------------
// 本文件只负责"问号任务"的框架层：入口接线、生命周期状态机（IDLE ↔ ACTIVE）、时序计时器
// （轻提示/目标增强/自动收起）、键盘转移淡出判定、事件广播。
// 本文件明确不做：不渲染任何具体任务的视觉（拖拽物体、点击目标、寻找场景等）、不创建任何
// DOM、不判定某个具体任务是否"完成"（拖对了/点对了/找到了这类业务判定由 014 任务模板卡
// 实现，通过 completeTask(result) 这个入口告知本状态机）。这条边界对应 REQ-TASK-02
// （不显示中文任务文字）——本文件从不调用 document.* 的任何 DOM 创建 API，从根源上不存在
// "创建中文文字 DOM" 的风险，不需要额外的文字过滤逻辑。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_TASK，Object.freeze 冻结，多订阅者，回调数组内部 try/catch 隔离）
// -----------------------------------------------------------------------
//   startTask(taskDef)      从 IDLE 启动一个任务。taskDef 是 014 提供的任务描述对象
//                            （含 type/voicePrompt 等字段，本卡不校验具体模板内容，只使用
//                            taskDef.voicePrompt 驱动语音、taskDef.type 用于 getState() 展示）。
//                            若调用时状态已是 ACTIVE，忽略本次调用（console.warn，见下方
//                            「重复点问号 / 重复 startTask」设计说明），返回 false；成功启动
//                            返回 true。
//   completeTask(result)    供 014 在判定某个具体任务"成功完成"时调用。清空所有计时器、
//                            回到 IDLE、emit 'complete' 事件（回调参数为原样透传的 result，
//                            本卡不约定 result 的形状，由 014 自行定义）。若调用时状态不是
//                            ACTIVE，忽略（console.warn），返回 false。
//   dismiss(reason)          收起当前任务：清空所有计时器、退出键盘计数（见下方机制说明）、
//                            回到 IDLE、emit 'dismiss' 事件 { reason: reason }。reason 缺省
//                            时回退为 'manual'；本文件内部只会以 'timeout'（REQ-TASK-05）与
//                            'keyboard-distraction'（REQ-TASK-06）两种 reason 触发它，但外部
//                            调用方可以传任意字符串 reason（比如未来 014/019 需要的其它收起
//                            场景）。**收起不算失败**（REQ-EXIT-04 / manifest.exit
//                            .keyboardDistractionCountsAsFailure = false）：dismiss 事件的
//                            payload 只有 { reason }，不带任何 failure/success 语义字段；
//                            getState() 也从不记录"失败"状态——这个约束是通过"从不产生
//                            failure 字段"这种结构性方式满足的，不依赖某个开关。若调用时
//                            状态已是 IDLE，静默忽略，返回 false。
//   getState()               返回当前状态快照（普通对象，非内部状态引用）：
//                            { state: 'IDLE'|'ACTIVE', activeTaskType: string|null,
//                              elapsedMs: number, effectiveKeysSinceStart: number }
//                            IDLE 时 activeTaskType 为 null、elapsedMs 为 0、
//                            effectiveKeysSinceStart 为 0。
//   onPhase(fn)               订阅生命周期阶段事件，fn({ phase: 'hint' | 'emphasize' })。
//                              'hint' 对应 REQ-TASK-03（15s 轻提示），'emphasize' 对应
//                              REQ-TASK-04（30s 目标增强）。具体"轻提示"/"目标增强"长什么样
//                              是 014 的事，本文件只负责按时序广播事件。
//   onDismiss(fn)             订阅收起事件，fn({ reason: string })。
//   onComplete(fn)            订阅完成事件，fn(result)（result 即 completeTask() 的入参）。
//   onQuestionClicked(fn)     订阅"问号被点击且当前允许开始新任务"事件，fn()。见下方
//                              「问号点击接线」一节——014 应该在这个回调里生成 taskDef 并
//                              调用 startTask(taskDef)，本文件不越权生成任务内容。
//   _setClock(clock)          **测试专用钩子**，不是给 014/019 生产代码调用的稳定契约
//                              （下划线前缀标识"内部/测试用"）。clock 形如
//                              { setTimeout, clearTimeout, now }，任意子字段缺失/非函数会
//                              被忽略、保留原值。供 harness 注入假时钟后用 advance(ms) 快进，
//                              不必真等 45~60 秒。见 tests/unit/task-lifecycle.test.mjs。
//
// -----------------------------------------------------------------------
// 问号点击接线（对应 MANIFEST.md「HUD API」预告的 013 接管点）
// -----------------------------------------------------------------------
// 选择"事件"而非 setTaskProvider(fn) 两种方案中的前者：本文件加载时若 window.WTJ_HUD 存在
// 且提供 onQuestionClick，会防御式调用 WTJ_HUD.onQuestionClick(...) 注册一个内部处理函数
// 接管问号点击（注意 WTJ_HUD.onQuestionClick 是"覆盖式"注册，见 hud.js——同一时刻只有一个
// 处理函数，013 加载后即成为唯一处理函数，这是预期行为，不是 bug）。点击发生时：
//   - 若当前状态是 IDLE：emit 'questionClicked' 事件（无参数），014 的订阅者应在回调里生成
//     一个 taskDef 并调用 WTJ_TASK.startTask(taskDef)。
//   - 若当前状态已是 ACTIVE（已有任务在进行）：**忽略**，不 emit 事件（TL 定案，倾向忽略而非
//     重置——重置会打断孩子已经听到一半的语音提示和已经进行到一半的任务视觉，体验割裂；
//     忽略则维持"同一时刻只有一个进行中任务"的不变式，且没有任何副作用，孩子继续跟当前任务
//     互动即可）。startTask() 自身也重复这条守卫（状态不是 IDLE 时忽略），双重保险：即使
//     未来某个消费方绕开 onQuestionClicked、直接手工调用 startTask()，这条不变式依然成立。
// 选事件而非 provider 回调的理由：本文件里 onPhase/onDismiss/onComplete 已经是"多订阅者 +
// emit"的事件风格，onQuestionClicked 延续同一种风格，API 心智模型统一；provider 风格
//（setTaskProvider(fn) 由本文件在点击时反过来调用 014 注册的函数拿 taskDef）会引入另一种
// "本文件反向调用外部函数"的控制流，与其它三个事件回调风格不一致，选前者更简单一致。
//
// -----------------------------------------------------------------------
// 键盘转移淡出的实现机制（REQ-TASK-06，无需 WTJ_KEYBOARD 提供"退订"能力）
// -----------------------------------------------------------------------
// window.WTJ_KEYBOARD.onEffectiveKey(fn) 本身不提供退订接口（见 keyboard.js 顶部注释，
// addSubscriber 只支持追加，数组只增不减）。本文件不需要真正的退订：加载时只注册一次
// 常驻的内部处理函数，该函数第一步就检查"当前状态是否 ACTIVE"——不是则直接返回，不做任何
// 事。这样：
//   - startTask() 时把 effectiveKeysSinceStart 清零，之后每次全局有效键事件触发都会让
//     这个"本任务期间"计数 +1（不关心 WTJ_KEYBOARD 自己维护的全局累计值，只用它的"有一次
//     有效键"这个事件时机）。
//   - 达到 keyboardDistractionKeyCount（默认 20，manifest.tasks.timing
//     .keyboardDistractionKeyCount）时调用 dismiss('keyboard-distraction')，状态回到
//     IDLE，effectiveKeysSinceStart 复位为 0。
//   - dismiss/completeTask 之后，状态不再是 ACTIVE，同一个常驻处理函数后续收到的有效键
//     事件会在第一步就短路返回，天然实现了"停止累计"，等价于退订，不需要 WTJ_KEYBOARD
//     暴露真正的退订 API。
//
// -----------------------------------------------------------------------
// REQ-TASK-01~06 / REQ-EXIT-04 逐条落地位置索引（供 PM/QA 对照，REQ-TASK-07~10 四类具体
// 任务模板不在本卡范围，见 014）：
//   REQ-TASK-01  不在本文件（问号入口的视觉是 007 HUD 卡的事，本文件只接管点击行为）。
//   REQ-TASK-02  startTask() 的语音播放走 window.WTJ_AUDIO.playTaskVoice(...)；本文件全文
//                不出现任何 document.createElement / innerHTML / textContent 赋值。
//   REQ-TASK-03  startTask() 内 hintTimerId，到期 emit({ phase: 'hint' })。
//   REQ-TASK-04  startTask() 内 emphasizeTimerId，到期 emit({ phase: 'emphasize' })。
//   REQ-TASK-05  startTask() 内 autoDismissTimerId（[45,60]s 随机一个时刻），到期调用
//                dismiss('timeout')。
//   REQ-TASK-06  handleEffectiveKey()：本任务期间累计有效键达阈值时调用
//                dismiss('keyboard-distraction')。
//   REQ-EXIT-04  dismiss() 的事件 payload 与 getState() 均不带 failure 语义字段，见上方
//                dismiss() API 说明。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 重复引入守卫（P1，Fable 对抗评审）：本模块只应被引入一次。若脚本被重复引入，第二次执行
  // IIFE 若不短路，会再次调用 window.WTJ_HUD.onQuestionClick(...)（hud.js 是「覆盖式」注册）
  // 把 HUD 问号点击接到「实例 2」的处理函数上，而 window.WTJ_TASK 绑定因下方 defineProperty
  // 不可写、仍指向「实例 1」——014 通过 window.WTJ_TASK.onQuestionClicked 注册的订阅者落在
  // 实例 1 的订阅数组里，点击驱动的却是实例 2，两者永不相遇 → 问号点击静默失效（无报错）。
  // 因此在任何接线副作用之前直接短路返回，保证「已接管的问号点击」「已注册的键盘监听」始终
  // 属于同一个（第一个）实例。
  // ---------------------------------------------------------------------
  if (window.WTJ_TASK) {
    return;
  }

  // ---------------------------------------------------------------------
  // manifest 访问器：与 keyboard.js / hud.js / app.js 同一模式（MANIFEST.md 建议后续模块
  // 变多时可提升为共享工具，本卡不做该重构，避免跨文件耦合超出卡片范围）。缺失字段一律
  // 防御式回退到下方最小默认值并 console.warn，不阻断任务框架初始化。
  // ---------------------------------------------------------------------
  var DEFAULT_MANIFEST = {
    tasks: {
      timing: {
        lightHintSec: 15,
        emphasizeSec: 30,
        autoDismissSecRange: [45, 60],
        keyboardDistractionKeyCount: 20
      }
    }
  };

  function getManifest() {
    if (window.WTJ_MANIFEST) {
      return window.WTJ_MANIFEST;
    }
    console.warn('[WTJ_TASK] window.WTJ_MANIFEST 未找到（manifest.js 未加载或加载失败），回退到内置最小默认值。');
    return DEFAULT_MANIFEST;
  }

  function isNum(v) {
    return typeof v === 'number' && !isNaN(v) && isFinite(v);
  }

  function numOrDefault(v, d) {
    return isNum(v) ? v : d;
  }

  function isValidRange(r) {
    return Array.isArray(r) && r.length === 2 && isNum(r[0]) && isNum(r[1]) && r[0] <= r[1];
  }

  var MANIFEST = getManifest();
  var TASK_TIMING_CFG = (MANIFEST.tasks && MANIFEST.tasks.timing) ? MANIFEST.tasks.timing : DEFAULT_MANIFEST.tasks.timing;

  var LIGHT_HINT_SEC = numOrDefault(TASK_TIMING_CFG.lightHintSec, DEFAULT_MANIFEST.tasks.timing.lightHintSec);
  var EMPHASIZE_SEC = numOrDefault(TASK_TIMING_CFG.emphasizeSec, DEFAULT_MANIFEST.tasks.timing.emphasizeSec);
  var KEYBOARD_DISTRACTION_KEY_COUNT = numOrDefault(
    TASK_TIMING_CFG.keyboardDistractionKeyCount,
    DEFAULT_MANIFEST.tasks.timing.keyboardDistractionKeyCount
  );
  var AUTO_DISMISS_SEC_RANGE = isValidRange(TASK_TIMING_CFG.autoDismissSecRange) ?
    TASK_TIMING_CFG.autoDismissSecRange :
    DEFAULT_MANIFEST.tasks.timing.autoDismissSecRange;

  // ---------------------------------------------------------------------
  // 订阅者管理：多订阅者数组 + 逐个 try/catch，防止下游回调抛错裸冒泡打断本引擎
  // （与 keyboard.js 完全同款模式）。
  // ---------------------------------------------------------------------
  var phaseSubscribers = [];
  var dismissSubscribers = [];
  var completeSubscribers = [];
  var questionClickedSubscribers = [];

  function addSubscriber(list, fn) {
    if (typeof fn !== 'function') {
      console.warn('[WTJ_TASK] 订阅回调必须是函数，已忽略此次注册。');
      return;
    }
    list.push(fn);
  }

  function emit(list, arg) {
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](arg);
      } catch (err) {
        console.error('[WTJ_TASK] 订阅回调抛出异常，已捕获：', err);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 可注入时钟（默认真实 setTimeout/clearTimeout/Date.now；测试用 _setClock 整体或部分替换）。
  // ---------------------------------------------------------------------
  var clockRef = {
    setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimeout: function (id) { clearTimeout(id); },
    now: function () { return Date.now(); }
  };

  function _setClock(clock) {
    if (!clock || typeof clock !== 'object') {
      console.warn('[WTJ_TASK] _setClock: 参数必须是对象，已忽略。');
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
  // 状态机
  // ---------------------------------------------------------------------
  var STATE_IDLE = 'IDLE';
  var STATE_ACTIVE = 'ACTIVE';

  var state = STATE_IDLE;
  var activeTaskDef = null;
  var startTimeMs = null;
  var effectiveKeysSinceStart = 0;

  var hintTimerId = null;
  var emphasizeTimerId = null;
  var autoDismissTimerId = null;

  function clearTimers() {
    if (hintTimerId !== null) {
      clockRef.clearTimeout(hintTimerId);
      hintTimerId = null;
    }
    if (emphasizeTimerId !== null) {
      clockRef.clearTimeout(emphasizeTimerId);
      emphasizeTimerId = null;
    }
    if (autoDismissTimerId !== null) {
      clockRef.clearTimeout(autoDismissTimerId);
      autoDismissTimerId = null;
    }
  }

  function randomAutoDismissMs() {
    var minSec = AUTO_DISMISS_SEC_RANGE[0];
    var maxSec = AUTO_DISMISS_SEC_RANGE[1];
    // P2 注记（Fable 对抗评审）：Math.random() 取值区间是 [0, 1)，因此实际收起时刻落在
    // 半开区间 [minSec, maxSec) 秒——即 [45s, 60s)，精确的 60s 上界不可达（概率为 0）。
    // 这完全满足需求「45-60 秒仍未完成自动收起」（REQ-TASK-05）：收起时刻严格 ≥45s、严格
    // <60s，孩子最迟在接近但不到 60s 时看到任务收起。单测里用 _setClock + 覆盖 Math.random
    // 注入边界值 0 / 1 来验证「公式在两端分别产出 45000ms / 60000ms」这一映射本身的正确性，
    // 其中 randomValue=1 是对公式上界的边界注入验证，真实 Math.random() 永远取不到 1。
    var sec = minSec + Math.random() * (maxSec - minSec);
    return sec * 1000;
  }

  function playTaskVoiceDefensive(taskDef) {
    try {
      if (window.WTJ_AUDIO && typeof window.WTJ_AUDIO.playTaskVoice === 'function') {
        var voiceArg = (taskDef && taskDef.voicePrompt) ? taskDef.voicePrompt : taskDef;
        // WTJ-20260705-018：语言/任务语音模式切换（设置面板，验收标准 #4）——若
        // voice-language.js 已加载，按家长选择的语言（或"跟随素材可用性"）重新解析出实际
        // 应播放的路径，覆盖上面按老约定取到的 taskDef.voicePrompt（该字段目前恒指向中文
        // .zh.m4a，是历史上 Phase B/004 卡接线时定下的默认值，不代表家长本次会话的语言选择）。
        // resolveTaskVoicePath() 返回 null 表示"no-silent-fallback 判定当前语言在这条任务上
        // 没有素材，明确不播放"——此时保持沉默，不再退回 voiceArg 播放另一种语言的语音
        // （那样会制造出一次新的静默语言顶替，正是验收标准 #4 明确禁止的行为）。
        // window.WTJ_VOICE_LANG 缺失（模块未加载/单独测试 task.js）时整段跳过，voiceArg 保持
        // 原值，行为与本卡改动前完全一致，不构成回归。
        if (window.WTJ_VOICE_LANG && typeof window.WTJ_VOICE_LANG.resolveTaskVoicePath === 'function') {
          var resolvedPath = window.WTJ_VOICE_LANG.resolveTaskVoicePath(taskDef);
          if (!resolvedPath) {
            return;
          }
          voiceArg = resolvedPath;
        }
        var p = window.WTJ_AUDIO.playTaskVoice(voiceArg);
        // P2 防御（Fable 对抗评审）：AUDIO-API 契约承诺 playTaskVoice 返回的 Promise「永不
        // reject」，但为了对不守约的替身/未来实现也稳健，给它挂一个 rejection handler，
        // 避免万一 reject 时冒出 unhandledrejection。用 then(null, fn) 而非 .catch()——
        // Safari 14 两者都支持，此处与本文件其余写法保持不引入额外语法特性的一致性。
        if (p && typeof p.then === 'function') {
          p.then(null, function (err) {
            console.error('[WTJ_TASK] window.WTJ_AUDIO.playTaskVoice 返回的 Promise 被 reject（AUDIO-API 契约本不应发生），已捕获：', err);
          });
        }
      }
    } catch (err) {
      console.error('[WTJ_TASK] 调用 window.WTJ_AUDIO.playTaskVoice 失败，已捕获：', err);
    }
  }

  function startTask(taskDef) {
    if (state !== STATE_IDLE) {
      console.warn('[WTJ_TASK] startTask() 被调用时已有任务处于 ACTIVE，已忽略（一次只允许一个进行中任务）。');
      return false;
    }

    activeTaskDef = (taskDef && typeof taskDef === 'object') ? taskDef : {};
    state = STATE_ACTIVE;
    startTimeMs = clockRef.now();
    effectiveKeysSinceStart = 0;

    // REQ-TASK-02：语音驱动、不显示中文任务文字——本文件从不创建 DOM，语音是唯一的任务提示手段。
    playTaskVoiceDefensive(activeTaskDef);

    hintTimerId = clockRef.setTimeout(function () {
      hintTimerId = null;
      emit(phaseSubscribers, { phase: 'hint' }); // REQ-TASK-03
    }, LIGHT_HINT_SEC * 1000);

    emphasizeTimerId = clockRef.setTimeout(function () {
      emphasizeTimerId = null;
      emit(phaseSubscribers, { phase: 'emphasize' }); // REQ-TASK-04
    }, EMPHASIZE_SEC * 1000);

    autoDismissTimerId = clockRef.setTimeout(function () {
      autoDismissTimerId = null;
      dismiss('timeout'); // REQ-TASK-05
    }, randomAutoDismissMs());

    return true;
  }

  function dismiss(reason) {
    if (state !== STATE_ACTIVE) {
      // 已经是 IDLE：静默忽略（例如重复调用、或与 completeTask 的竞态），不视为错误。
      return false;
    }
    clearTimers();
    state = STATE_IDLE;
    activeTaskDef = null;
    startTimeMs = null;
    effectiveKeysSinceStart = 0;
    var finalReason = (typeof reason === 'string' && reason) ? reason : 'manual';
    // REQ-EXIT-04：payload 只有 reason，不带任何 failure/success 语义字段。
    emit(dismissSubscribers, { reason: finalReason });
    return true;
  }

  function completeTask(result) {
    if (state !== STATE_ACTIVE) {
      console.warn('[WTJ_TASK] completeTask() 被调用时没有进行中的任务，已忽略。');
      return false;
    }
    clearTimers();
    state = STATE_IDLE;
    activeTaskDef = null;
    startTimeMs = null;
    effectiveKeysSinceStart = 0;
    emit(completeSubscribers, result);
    return true;
  }

  function getState() {
    var isActive = state === STATE_ACTIVE;
    return {
      state: state,
      activeTaskType: (isActive && activeTaskDef && typeof activeTaskDef.type !== 'undefined') ? activeTaskDef.type : null,
      elapsedMs: (isActive && startTimeMs !== null) ? Math.max(0, clockRef.now() - startTimeMs) : 0,
      effectiveKeysSinceStart: effectiveKeysSinceStart
    };
  }

  // ---------------------------------------------------------------------
  // 键盘转移判定（REQ-TASK-06）：常驻订阅，靠内部状态检查实现"退订"语义，见文件头设计说明。
  // ---------------------------------------------------------------------
  function handleEffectiveKey() {
    if (state !== STATE_ACTIVE) {
      return;
    }
    effectiveKeysSinceStart += 1;
    if (effectiveKeysSinceStart >= KEYBOARD_DISTRACTION_KEY_COUNT) {
      dismiss('keyboard-distraction');
    }
  }

  (function wireKeyboard() {
    try {
      if (window.WTJ_KEYBOARD && typeof window.WTJ_KEYBOARD.onEffectiveKey === 'function') {
        window.WTJ_KEYBOARD.onEffectiveKey(handleEffectiveKey);
      }
    } catch (err) {
      console.error('[WTJ_TASK] 订阅 window.WTJ_KEYBOARD.onEffectiveKey 失败，已捕获：', err);
    }
  })();

  // ---------------------------------------------------------------------
  // 问号点击接线：见文件头「问号点击接线」一节。
  // ---------------------------------------------------------------------
  (function wireQuestionClick() {
    try {
      if (window.WTJ_HUD && typeof window.WTJ_HUD.onQuestionClick === 'function') {
        window.WTJ_HUD.onQuestionClick(function () {
          if (state !== STATE_IDLE) {
            // 已有任务 ACTIVE 时再次点问号：忽略，不 emit，见文件头设计说明。
            return;
          }
          emit(questionClickedSubscribers, undefined);
        });
      }
    } catch (err) {
      console.error('[WTJ_TASK] 订阅 window.WTJ_HUD.onQuestionClick 失败，已捕获：', err);
    }
  })();

  // ---------------------------------------------------------------------
  // 对外冻结 API
  // ---------------------------------------------------------------------
  function onPhase(fn) { addSubscriber(phaseSubscribers, fn); }
  function onDismiss(fn) { addSubscriber(dismissSubscribers, fn); }
  function onComplete(fn) { addSubscriber(completeSubscribers, fn); }
  function onQuestionClicked(fn) { addSubscriber(questionClickedSubscribers, fn); }

  var API = {
    VERSION: '0.1.0',
    CARD_ID: 'WTJ-20260704-013',

    startTask: startTask,
    completeTask: completeTask,
    dismiss: dismiss,
    getState: getState,

    onPhase: onPhase,
    onDismiss: onDismiss,
    onComplete: onComplete,
    onQuestionClicked: onQuestionClicked,

    // 测试专用，见文件头 API 列表说明；不是给 014/019 生产代码调用的稳定契约。
    _setClock: _setClock
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  // 绑定加固：与 audio.js（WTJ-20260704-016）同款模式——API 对象自身已 Object.freeze
  // （属性不可增删改）；这里进一步把 window 上的 WTJ_TASK 这个"绑定"本身设为不可写、不可
  // 重配置，防止整体重赋值（window.WTJ_TASK = 伪造对象）把状态机换掉。重复引入已由 IIFE
  // 顶部的 `if (window.WTJ_TASK) { return; }` 守卫短路，走不到这里，因此此处到达时
  // window.WTJ_TASK 必为未定义；下面的 !window.WTJ_TASK 判断只是二次保险（同时兼容极老环境
  // 无 Object.defineProperty 的降级赋值）。
  if (!window.WTJ_TASK && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_TASK', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_TASK) {
    window.WTJ_TASK = API;
  }
})();

// -----------------------------------------------------------------------
// 本卡边界（013，写给 014/019）
// -----------------------------------------------------------------------
// 1. 不接入运行时：index.html 尚未加 <script src="task.js">，app.js 未调用任何
//    WTJ_TASK.*。接入属于 014（具体任务模板/视觉）/ 019（整体集成）卡。
// 2. 不实现任何具体任务：REQ-TASK-07~10（拖拽/点击/寻找/按键四类模板的交互与成功判定）
//    完全不在本卡范围，014 卡消费 manifest.js 的 tasks.templates.* 并调用本文件的
//    startTask(taskDef) / completeTask(result) 来驱动生命周期。
// 3. 不渲染任何"轻提示"/"目标增强"的具体视觉：onPhase(fn) 只广播时机，'hint'/'emphasize'
//    长什么样由 014 决定（呼吸光晕/闪烁/放大等）。
// 4. 依赖的三个外部 API（window.WTJ_HUD.onQuestionClick / window.WTJ_AUDIO.playTaskVoice /
//    window.WTJ_KEYBOARD.onEffectiveKey）均已在各自卡片（007/016/008）实现，但 016（audio.js）
//    本身也尚未接入 index.html——013/014/019 接入运行时时，三者需要按正确顺序加载
//    （manifest.js → keyboard.js/audio.js/hud.js → task.js，task.js 读取 window 上这些
//    全局对象时如果对应脚本还没加载，会走本文件的防御式降级路径，不报错但也不会真正接上）。
