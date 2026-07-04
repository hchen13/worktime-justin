// WTJ-20260704-010 — 五个发现槽统一状态机（window.WTJ_SLOTS）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function 声明式，不用箭头函数 / let /
// const / 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求（不 fetch 任何东西）、非 module
// （无 import/export），以普通 <script src="slots.js"> 标签加载，需在 keyboard.js 与
// secretword.js **之前**（这样两者首次点槽时 window.WTJ_SLOTS 已存在，走委托路径而非各自
// fallback）。只需 manifest.js 先加载（读 manifest.slots）；与 hud.js 加载顺序无强依赖——
// 本文件对 WTJ_HUD 的调用全部发生在 fillSlot()/reset() 等运行时函数被调用之时（keydown /
// 秘密词命中等真实交互触发），而非本文件自身执行期间，届时 hud.js 早已加载完毕（脚本按顺序
// 同步执行，用户交互不可能早于全部 <script> 标签跑完）。
//
// -----------------------------------------------------------------------
// 职责边界（TL 已定案，PM 方案 a，见卡 WTJ-20260704-010 说明）
// -----------------------------------------------------------------------
// 本文件是"秘密词命中"（009 secretword.js）与"键盘探索里程碑"（008 keyboard.js）两个来源
// 共用的**唯一**五槽状态机：统一去重（REQ-SLOT-01/REQ-SEC-07）、统一槽位分配、统一满槽判定
// （REQ-SLOT-02/REQ-RWD-02）与轮次重置契约。009/008 分别只做"判定出一次该点亮的发现"这一步，
// 点槽这一步收敛到这里的 fillSlot()。
//
// 009/008 仍保留各自原有的 WTJ_HUD.setSlot 直连逻辑作为**fallback**（当 window.WTJ_SLOTS
// 不可用时，如本文件加载失败/被移除），不属于回归——见两文件里 "WTJ_SLOTS 委托 + fallback"
// 注释块。009 的 secretSlotCursor、008 的 milestoneSlotIndex/firedMilestones 各自的槽游标
// 在委托路径下不再决定真正点亮哪个槽（由本文件的内部状态决定），但保留在各自文件中供 fallback
// 路径使用，不做删除（窄改原则，不越权改动 008/009 其余逻辑）。
//
// -----------------------------------------------------------------------
// 满槽 → 011（宝箱奖励模块，未交付）契约设计（据实记录，供 011 卡对接 / PM 需要时可调整）
// -----------------------------------------------------------------------
// 选择："满 5 槽后不自动清空，等待显式 reset() 调用"（而非"满槽当场自动清空"）。理由：
// manifest.slots.onFull.resetsSlotsAfter 描述的顺序是"五格全部点亮后触发宝箱开启 …… 随后清空
// 五槽，进入下一轮"——宝箱开启表现（011）大概率需要在"五槽仍处于已点亮的视觉状态"下播放奖励，
// 若 onFull 触发的同一时刻就自动清空，011 拿到的 getState()/getSlots() 快照会与它开始播放动画
// 时 HUD 上实际展示的画面不一致（清空发生在它读到快照之后、动画播放之前的这段时间差里）。所以
// 本文件只在 fillSlot() 使第 5 格被填满的那一刻 emit 一次 onFull(snapshot)，五槽在 HUD 上保持
// 已点亮，直到某处显式调用 WTJ_SLOTS.reset()（预期由 011 在播放完宝箱奖励表现后调用；011 交付
// 前，QA / 手测也可直接调用 reset() 验证"清空 + 开新一轮"契约）。reset() 做的事：
//   1) 清空内部 5 槽状态 + 调 WTJ_HUD.clearSlots()（HUD 缺失/无该方法时防御式逐槽 setSlot 兜底）；
//   2) 防御式调用 window.WTJ_SECRET.resetRound()（009 已暴露、注释明确"供 010 在轮次重置时调用"）；
//   3) 防御式调用 window.WTJ_KEYBOARD.resetEffectiveKeyCount()（008 已暴露的有效键计数/里程碑
//      重置——不重置它不会清空槽位本身，但会导致键盘里程碑来源在同一次 App 运行内只能触发一轮
//      共两次，往后永远无法再点亮槽，这不符合"进入下一轮"的产品意图，故一并纳入新一轮重置）。
// 另提供更底层的 clearSlots()：只做上面第 1 步（清视觉 + 内部占用状态），不触碰 009/008 的
// 轮次状态——供需要"仅清空显示，不影响累计判定"的场景使用（如调试）；正常的"开新一轮"应调用
// reset()，而非单独调 clearSlots()。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_SLOTS，Object.freeze 冻结 + 绑定加固，多订阅者 onFull 内部 try/catch）
// -----------------------------------------------------------------------
//   fillSlot(source, item)   009/008 委托的统一点槽入口。
//                            source: 'secret-word' | 'keyboard-milestone'（来自
//                              manifest.slots.sources，缺失/非法时回退到这两个默认值）。
//                            item: { itemKey, renderState }
//                              itemKey：本次发现在该来源内的身份标识，用于"当前 5 格内不重复"
//                                判断（同 source + 同 itemKey 视为同一发现），如秘密词的
//                                词本身（'dog'）、里程碑的阈值数值（100）。任意可转字符串的值。
//                              renderState：直接透传给 WTJ_HUD.setSlot(idx, renderState) 的
//                                渲染态，如 { spriteUrl: '...' }（秘密词）或 { milestone: true }
//                                （键盘里程碑）。
//                            返回 { filled, slotIndex, duplicate, full }：
//                              filled    本次调用是否真的新占用了一个槽。
//                              slotIndex 新占用的槽下标（0..count-1），未占用时为 null。
//                              duplicate 当前 5 格内已存在同 source+itemKey 的发现（不占新槽，
//                                        调用方可用它来决定"只给小反馈"，如 009 的 onMinorHit）。
//                              full      调用返回时五槽是否已全部占满（无论是否本次调用促成）。
//   clearSlots()             仅清空 5 槽（内部状态 + HUD 视觉），不触碰 009/008 的轮次状态。
//   reset()                  开新一轮：clearSlots() + 防御式通知 009 resetRound() / 008
//                            resetEffectiveKeyCount()。
//   getSlots()               返回 5 槽内部状态快照（QA 用），每项为 null 或
//                            { source, itemKey, renderState }。
//   onFull(fn)               订阅"五槽刚好被填满"事件（仅在使第 5 格被占用的那次 fillSlot()
//                            调用触发一次），fn(snapshot)，snapshot 同 getState() 返回结构。
//                            多订阅 + 逐个 try/catch 隔离。
//   getState()               返回 { slotCount, slots, full }快照。
//
// -----------------------------------------------------------------------
// REQ-SLOT-01~04 逐条落地位置索引（供 PM/QA 对照）：
//   REQ-SLOT-01  五槽数量固定：SLOT_COUNT 从 manifest.slots.count 读（防御默认 5）；
//                秘密词/键盘里程碑均可点亮（fillSlot 的 source 分支）；当前五格内不重复
//                （isDuplicate()）。
//   REQ-SLOT-02  满 5 槽触发宝箱：fillSlot() 使第 5 格被占用时 emit onFull()；
//                resetsSlotsAfter 契约见上方「满槽 → 011 契约设计」一节。
//   REQ-SLOT-03  来源枚举 sources 从 manifest.slots.sources 读；'keyboard-milestone' 阈值
//                具体数值仍单一事实来源于 manifest.keyboard.effectiveKeyMilestones（本文件
//                不重复定义，008 侧读取后把阈值本身作为 itemKey 传入）。
//   REQ-SLOT-04  renderState 由调用方（009/008）按来源准备（秘密词 sprite / 里程碑星形），
//                本文件只透传给 WTJ_HUD.setSlot，不改渲染细节。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 重复引入守卫（与 009/其余引擎同款）：本模块只应被引入一次，避免第二次执行的 IIFE 产生
  // 第二份独立的槽位状态（window.WTJ_SLOTS 仍指向"实例 1"，但 009/008 委托调用若发生在
  // "实例 2"执行之后、之前注册的 onFull 订阅者挂在"实例 1"上——两者状态错位，满槽事件失效）。
  // ---------------------------------------------------------------------
  if (window.WTJ_SLOTS) {
    return;
  }

  // ---------------------------------------------------------------------
  // manifest 访问器：与 keyboard.js / secretword.js 同一模式。缺失字段一律防御式回退到最小
  // 默认值并 console.warn，不阻断。
  // ---------------------------------------------------------------------
  var DEFAULT_MANIFEST = {
    slots: {
      count: 5,
      sources: ['secret-word', 'keyboard-milestone']
    }
  };

  function getManifest() {
    if (window.WTJ_MANIFEST) {
      return window.WTJ_MANIFEST;
    }
    console.warn('[WTJ_SLOTS] window.WTJ_MANIFEST 未找到（manifest.js 未加载或加载失败），回退到内置最小默认值（5 槽，两默认来源）。');
    return DEFAULT_MANIFEST;
  }

  var MANIFEST = getManifest();
  var SLOT_CFG = (MANIFEST.slots) || DEFAULT_MANIFEST.slots;

  var SLOT_COUNT =
    (typeof SLOT_CFG.count === 'number' && SLOT_CFG.count > 0) ?
      SLOT_CFG.count :
      DEFAULT_MANIFEST.slots.count;

  var SOURCES =
    (SLOT_CFG.sources && SLOT_CFG.sources.length) ?
      SLOT_CFG.sources :
      DEFAULT_MANIFEST.slots.sources;

  function isKnownSource(source) {
    for (var i = 0; i < SOURCES.length; i++) {
      if (SOURCES[i] === source) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // 内部状态：slots[i] 为 null（空）或 { source, itemKey, renderState }（已占用）。
  // ---------------------------------------------------------------------
  var slots = [];
  (function initSlots() {
    for (var i = 0; i < SLOT_COUNT; i++) {
      slots.push(null);
    }
  })();

  var everFullEmittedForCurrentRound = false; // 本轮是否已 emit 过 onFull（防止重复 emit）

  // ---------------------------------------------------------------------
  // 订阅者管理：多订阅者数组 + 逐个 try/catch，防止下游回调抛错裸冒泡打断本引擎。
  // ---------------------------------------------------------------------
  var fullSubscribers = [];

  function addSubscriber(list, fn) {
    if (typeof fn !== 'function') {
      console.warn('[WTJ_SLOTS] 订阅回调必须是函数，已忽略此次注册。');
      return;
    }
    list.push(fn);
  }

  function emit(list, arg) {
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](arg);
      } catch (err) {
        console.error('[WTJ_SLOTS] 订阅回调抛出异常，已捕获：', err);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 小工具
  // ---------------------------------------------------------------------
  function keyToStr(itemKey) {
    return String(itemKey);
  }

  function isOccupiedCount() {
    var n = 0;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i] !== null) n++;
    }
    return n;
  }

  function isFullNow() {
    return isOccupiedCount() >= SLOT_COUNT;
  }

  function findDuplicateIndex(source, itemKeyStr) {
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (s !== null && s.source === source && keyToStr(s.itemKey) === itemKeyStr) {
        return i;
      }
    }
    return -1;
  }

  function findNextEmptyIndex() {
    for (var i = 0; i < slots.length; i++) {
      if (slots[i] === null) return i;
    }
    return -1;
  }

  function callHudSetSlot(index, renderState) {
    try {
      if (window.WTJ_HUD && typeof window.WTJ_HUD.setSlot === 'function') {
        window.WTJ_HUD.setSlot(index, renderState);
      }
    } catch (err) {
      console.error('[WTJ_SLOTS] 调用 window.WTJ_HUD.setSlot 失败，已捕获：', err);
    }
  }

  function callHudClearSlots() {
    try {
      if (window.WTJ_HUD && typeof window.WTJ_HUD.clearSlots === 'function') {
        window.WTJ_HUD.clearSlots();
        return;
      }
      // clearSlots 缺失但 setSlot 存在时，逐槽兜底清空（保持与 HUD 视觉一致）。
      if (window.WTJ_HUD && typeof window.WTJ_HUD.setSlot === 'function') {
        for (var i = 0; i < SLOT_COUNT; i++) {
          window.WTJ_HUD.setSlot(i, null);
        }
      }
    } catch (err) {
      console.error('[WTJ_SLOTS] 调用 window.WTJ_HUD.clearSlots/setSlot(清空) 失败，已捕获：', err);
    }
  }

  function callSecretResetRound() {
    try {
      if (window.WTJ_SECRET && typeof window.WTJ_SECRET.resetRound === 'function') {
        window.WTJ_SECRET.resetRound();
      }
    } catch (err) {
      console.error('[WTJ_SLOTS] 调用 window.WTJ_SECRET.resetRound 失败，已捕获：', err);
    }
  }

  function callKeyboardResetCount() {
    try {
      if (window.WTJ_KEYBOARD && typeof window.WTJ_KEYBOARD.resetEffectiveKeyCount === 'function') {
        window.WTJ_KEYBOARD.resetEffectiveKeyCount();
      }
    } catch (err) {
      console.error('[WTJ_SLOTS] 调用 window.WTJ_KEYBOARD.resetEffectiveKeyCount 失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // 快照（getSlots / getState 共用）：值拷贝，外部修改不影响内部状态。
  // renderState 也做一层浅拷贝——否则快照里的 renderState 会与内部条目共享同一个对象引用，
  // 消费方（尤其 011 拿 onFull 快照）改写 snapshot[i].renderState.spriteUrl 会污染引擎内部状态
  // 及后续所有快照（Fable 对抗评审 P2-1）。renderState 目前只含 spriteUrl / milestone 这类
  // 扁平原始值，浅拷贝即足以隔离；若未来 renderState 出现嵌套对象，需升级为深拷贝。
  // ---------------------------------------------------------------------
  function shallowCopyRenderState(rs) {
    if (!rs || typeof rs !== 'object') return {};
    var copy = {};
    for (var k in rs) {
      if (Object.prototype.hasOwnProperty.call(rs, k)) {
        copy[k] = rs[k];
      }
    }
    return copy;
  }

  function snapshotSlots() {
    var out = [];
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (s === null) {
        out.push(null);
      } else {
        out.push({ source: s.source, itemKey: s.itemKey, renderState: shallowCopyRenderState(s.renderState) });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // 对外 API
  // ---------------------------------------------------------------------
  function fillSlot(source, item) {
    if (!isKnownSource(source)) {
      console.warn('[WTJ_SLOTS] fillSlot: 未知来源 "' + source + '"（manifest.slots.sources 未声明），已忽略。');
      return { filled: false, slotIndex: null, duplicate: false, full: isFullNow() };
    }
    if (!item || (typeof item.itemKey === 'undefined' || item.itemKey === null)) {
      console.warn('[WTJ_SLOTS] fillSlot: item.itemKey 缺失，无法去重/占槽，已忽略。');
      return { filled: false, slotIndex: null, duplicate: false, full: isFullNow() };
    }
    var itemKeyStr = keyToStr(item.itemKey);
    var renderState = (item.renderState && typeof item.renderState === 'object') ? item.renderState : {};

    var dupIndex = findDuplicateIndex(source, itemKeyStr);
    if (dupIndex !== -1) {
      // REQ-SLOT-01 / REQ-SEC-07：当前 5 格内已有同 source+itemKey 的发现，不占新槽。
      return { filled: false, slotIndex: null, duplicate: true, full: isFullNow() };
    }

    var idx = findNextEmptyIndex();
    if (idx === -1) {
      // 5 槽已被其它发现占满，本次是不同的新发现也无处安放（等待 reset() 开新一轮）。
      return { filled: false, slotIndex: null, duplicate: false, full: true };
    }

    slots[idx] = { source: source, itemKey: item.itemKey, renderState: renderState };
    callHudSetSlot(idx, renderState);

    var nowFull = isFullNow();
    if (nowFull && !everFullEmittedForCurrentRound) {
      everFullEmittedForCurrentRound = true;
      emit(fullSubscribers, getState());
    }

    return { filled: true, slotIndex: idx, duplicate: false, full: nowFull };
  }

  function clearSlots() {
    for (var i = 0; i < SLOT_COUNT; i++) {
      slots[i] = null;
    }
    everFullEmittedForCurrentRound = false;
    callHudClearSlots();
  }

  function reset() {
    clearSlots();
    callSecretResetRound();
    callKeyboardResetCount();
  }

  function getSlots() {
    return snapshotSlots();
  }

  function onFull(fn) {
    addSubscriber(fullSubscribers, fn);
  }

  function getState() {
    return {
      slotCount: SLOT_COUNT,
      slots: snapshotSlots(),
      full: isFullNow()
    };
  }

  var API = {
    fillSlot: fillSlot,
    clearSlots: clearSlots,
    reset: reset,
    getSlots: getSlots,
    onFull: onFull,
    getState: getState
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  // 绑定加固（与 secretword.js / task.js / audio.js 同款）：API 对象自身已 Object.freeze
  // （属性不可增删改）；这里进一步把 window 上的 WTJ_SLOTS 绑定设为不可写、不可重配置，防止
  // 整体重赋值（window.WTJ_SLOTS = 伪造对象）把状态机换掉。重复引入已由 IIFE 顶部守卫短路，
  // 走不到这里，因此到达时 window.WTJ_SLOTS 必为未定义；下面判断只是二次保险（兼容无
  // defineProperty 环境）。
  if (!window.WTJ_SLOTS && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_SLOTS', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_SLOTS) {
    window.WTJ_SLOTS = API;
  }
})();
