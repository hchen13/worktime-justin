// WTJ-20260704-008 — 键盘自由探索反馈引擎（window.WTJ_KEYBOARD）
//
// 语法基线：ES2020 以内（Safari 14 兼容），只用 var/function，不用箭头函数 / let / const /
// 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求、非 module（无 import/export），
// 以普通 <script src="keyboard.js"> 标签加载，需在 index.html 中排在 app.js 之前
// （app.js 初始化时要读 window.WTJ_KEYBOARD.onLetter 等 API 完成订阅）。
//
// 职责边界（TL 已定案，见卡 WTJ-20260704-008 说明）：本文件只负责"键盘输入 → 判定规则 →
// 事件"这条逻辑链，不做任何 DOM/Canvas 渲染——字母的可视化弹出仍由 app.js 的
// spawnLetter/drawLetters/rAF 完成，app.js 通过订阅 onLetter 事件来触发渲染。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_KEYBOARD，Object.freeze 冻结，多订阅者，回调数组内部 try/catch）
// -----------------------------------------------------------------------
//   onLetter(fn)              注册"有效字母/数字键"回调，fn(charUpper)。
//                              app.js 订阅它来 spawnLetter 渲染（普通字母/数字，REQ-KB-01/02）。
//   onEffectiveKey(fn)         每次有效键（含字母数字）回调，fn(currentEffectiveKeyCount)。
//                              供未来 013 任务卡消费（连续 20 有效键 → 任务淡出 REQ-TASK-06）。
//   onMilestone(fn)            有效键里程碑回调，fn(milestoneValue)。
//                              milestoneValue 取自 manifest.keyboard.effectiveKeyMilestones
//                              （当前 [100, 200]，REQ-SLOT-03）。触发时会防御式调用
//                              window.WTJ_HUD.setSlot(index, { milestone: true })。
//   onFunctionKey(fn)          功能键弱反馈事件（可选），fn({ key, category, intensity })。
//                              category: 'light' | 'weak' | 'other'；intensity: 0~1，
//                              随同键连打快速衰减（REQ-KB-06）。功能键永不计入有效键/里程碑。
//   getEffectiveKeyCount()     返回当前累计有效键计数。
//   resetEffectiveKeyCount()   重置有效键计数、已触发里程碑记录，**以及"连续同键"节奏状态
//                              （lastKeyId/sameKeyStreak）**（供五槽轮次重置等场景调用；
//                              WTJ-20260704-066 修复前这套节奏状态不随轮次重置，见下方
//                              「轮次边界」一节）。
//
// -----------------------------------------------------------------------
// 判定规则设计说明（对应 docs/index.html #keyboard REQ-KB-01~09 / #params / #slots REQ-SLOT-03）
// -----------------------------------------------------------------------
// 1. 分类：window keydown 单一权威监听。e.key 为单字符且匹配 /^[a-z0-9]$/i 判定为
//    "普通字母/数字"（REQ-KB-01/02，数字与字母一并按同一路径处理，供 app.js 统一渲染）；
//    其余一律走"功能键"路径（含 Space/Enter/方向键/修饰键/标点等），不计入有效键。
//
// 2. 长按不持续计数（REQ-KB-07）：用 e.repeat 过滤——只要 e.repeat 为 true（无论字母键还是
//    功能键），整个事件直接忽略：不更新"连续同键"状态、不计数、不触发 onLetter/onFunctionKey。
//    这样按住一个键不会疯狂刷字母或刷里程碑，也不会打断随后真实按键的连续同键统计。
//
// 3. 同键连续 >3 暂停计数 + 双写例外（REQ-KB-08 / REQ-KB-09，manifest.keyboard.repeatSameKey
//    .pauseAfterCount = 3）：维护一个"上一个按下的键（大小写不敏感归一化）"与"连续相同次数"，
//    每次非 repeat 的 keydown 都会更新——按下与上次不同的键（不论是另一个字母还是任意功能键）
//    立即把连续计数重置为 1（"换键后再切回来可以重新计数"）。判定阈值用严格大于
//    （sameKeyStreak > pauseAfterCount），阈值为 3 时第 1/2/3 次连续同键都正常计数，只有第 4
//    次起暂停——双写（如 apple 的 pp，连续 2 次）、甚至连续 3 次都天然落在阈值内，不需要额外的
//    "秘密词候选子串"白名单逻辑就能满足 REQ-KB-09；manifest 的 doubleLetterException 字段在本卡
//    按"阈值本身即满足例外"实现（该字段附带的"结合秘密词候选子串判断"是面向未来与 009 秘密词
//    引擎整合的说明，非本卡范围，008 卡按 TL 指令用纯阈值逻辑落地）。
//    该"连续同键"状态是字母键与功能键共享的一套状态机（见下条），不是分别维护两套。
//
// 4. 功能键快速衰减（REQ-KB-06）：功能键复用同一套"连续同键"状态做衰减强度计算——
//    intensity = 该功能键类别的基础强度 × decayMultiplier(连续同键次数)，decayMultiplier 随
//    连续次数线性衰减到 0（约 4~5 次后衰减到 0，"几乎没有"）。docs/index.html 与
//    manifest.keyboard.functionKeyMashDecay 均只给定性描述、无具体数值（manifest 字段本身
//    标注为占位结构），下方 FUNCTION_KEY_DECAY_SPAN / FUNCTION_KEY_BASE_INTENSITY 是本卡按
//    "快速衰减到几乎没有"选定的本地防御式默认值，不代表 manifest 给出的精确数值；未来若
//    PM/TL 明确了具体曲线参数，应把最终值回写进 manifest.js 的 functionKeyMashDecay 字段。
//    功能键分类（light/weak/other）来自 manifest.keyboard.functionKeys（lightFeedback:
//    Space/Enter；weakOrNoReward: Meta/Alt/Control/Shift；其余未分类功能键归入 'other'，
//    强度介于两者之间，防御式默认，非文档精确值）。
//
// 5. 有效键里程碑（REQ-SLOT-03，manifest.keyboard.effectiveKeyMilestones = [100, 200]）：
//    仅"有效"（非 repeat 且未被同键暂停规则拦截）的字母/数字键计入 effectiveKeyCount。累计值
//    达到某个里程碑阈值时（>= 且该阈值本轮尚未触发过）触发 onMilestone(milestoneValue)，并
//    防御式调用 window.WTJ_HUD && window.WTJ_HUD.setSlot(index, { milestone: true })。
//    index 选择策略：里程碑按其在 effectiveKeyMilestones 数组中的顺序各占一槽（100 → 槽 0，
//    200 → 槽 1）。这是本卡范围内的最小可行占位策略——真正跨"秘密词命中"与"键盘里程碑"两种
//    来源、避免槽位冲突/重复分配的统一状态机属于 010 槽位引擎卡（sources: ['secret-word',
//    'keyboard-milestone']，见 manifest.js slots 域），008 卡不越权实现该分配逻辑，只保证
//    "触发即防御式点亮一槽"这一最小契约成立，供 010 卡日后接管/改造。
//
// -----------------------------------------------------------------------
// 轮次边界（WTJ-20260704-066 缺陷修复：QA 020 对抗评审发现的"首键被上轮 streak 吞"）
// -----------------------------------------------------------------------
// 缺陷复现：五槽满 → 010 WTJ_SLOTS.reset() 开新一轮 → 调用本文件 resetEffectiveKeyCount()。
// 修复前该函数只清 effectiveKeyCount + firedMilestones，**没有清 lastKeyId / sameKeyStreak**
// ——这套"连续同键"节奏状态是跨轮持续存在的模块级闭包变量。若上一轮结束前恰好某键连打触发了
// "> 3 次暂停"（sameKeyStreak 已 > PAUSE_AFTER_COUNT），且新一轮开局第一次按键恰好是同一个键，
// handleAlnumKey() 会在 `normalized === lastKeyId` 分支继续累加 streak（而不是判定为"换键"
// 重新从 1 计数），导致新一轮首键直接被暂停规则吞掉——不计入 effectiveKeyCount、不触发
// onLetter，且用户完全无感知（无报错、无视觉差异）。
//
// 修复：resetEffectiveKeyCount() 增加清空 lastKeyId（置 null）与 sameKeyStreak（置 0），
// 而非新增一个独立的 resetInputGate() 方法——理由与 009 的 buffer 清空同款：语义上"新一轮"
// 就该让这套输入门控从一张白纸开始，010 已经调用 resetEffectiveKeyCount()，一并清理不需要
// App/010 侧新增调用点。已确认此改动不破坏 008 现有单测（现有 "resetEffectiveKeyCount：清零
// 计数与已触发里程碑" 用例前后两段均以交替按键 a/s 驱动，streak 始终为 1，不依赖 reset 前后
// streak 是否保留）。
//
// 与 009（秘密词 rolling buffer）的关系：两者是**两个独立机制**——sameKeyStreak 是"连续同键
// 防刷"计数（本轮内可衰减：连续按同键第 4 次起暂停触发，衰减/暂停行为在本轮内持续生效，防止
// 无脑连打刷屏；见设计说明第 3 条），009 的 buffer 是"字母流 → 秘密词匹配"的滚动窗口——互不
// 读写对方状态。但两者都属于"轮次内的瞬时输入流状态"：探索计数在本轮内可衰减（同键 > 3 暂停
// 是本轮内的防刷机制，不因这次修复而改变），reset 后 streak 清零、新一轮首键重新从 1 计数
// （"恢复"）——防刷与"reset 后恢复"两个目标不冲突，防刷只作用于"同一轮内的连续行为"，reset
// 代表新一轮的输入历史归零，理应重新给用户一次"从头计数"的机会。
//
// -----------------------------------------------------------------------
// REQ-KB-01~09 逐条落地位置索引（供 PM/QA 对照）：
//   REQ-KB-01/02  handleAlnumKey() 触发 onLetter，位置/颜色/大小/旋转随机化仍由 app.js 完成。
//   REQ-KB-03     不在本文件（letterFadeMsRange 由 app.js 的 spawnLetter 消费，未改动）。
//   REQ-KB-04     不在本文件（渲染方式，app.js 领域）。
//   REQ-KB-05     classifyFunctionKey()：Space/Enter → light；Meta/Alt/Control/Shift → weak。
//   REQ-KB-06     handleFunctionKey() 的 decayMultiplier 衰减曲线。
//   REQ-KB-07     onKeyDown() 顶部 e.repeat 短路。
//   REQ-KB-08     handleAlnumKey() 的 sameKeyStreak > PAUSE_AFTER_COUNT 判定。
//   REQ-KB-09     同上，阈值语义天然覆盖双写，见设计说明第 3 条。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // manifest 访问器：与 app.js 的 getManifest() 同一模式（独立实现——MANIFEST.md 建议
  // 后续模块变多时可提升为共享工具，本卡不做该重构，避免跨文件耦合超出卡片范围）。
  // 缺失字段一律防御式回退到下方最小默认值并 console.warn，不阻断键盘监听。
  // ---------------------------------------------------------------------
  var DEFAULT_MANIFEST = {
    keyboard: {
      repeatSameKey: { pauseAfterCount: 3 },
      effectiveKeyMilestones: [100, 200],
      functionKeys: {
        lightFeedback: ['Space', 'Enter'],
        weakOrNoReward: ['Meta', 'Alt', 'Control', 'Shift']
      }
    }
  };

  function getManifest() {
    if (window.WTJ_MANIFEST) {
      return window.WTJ_MANIFEST;
    }
    console.warn('[WTJ_KEYBOARD] window.WTJ_MANIFEST 未找到（manifest.js 未加载或加载失败），回退到内置最小默认值。');
    return DEFAULT_MANIFEST;
  }

  var MANIFEST = getManifest();
  var KB_CFG = MANIFEST.keyboard || DEFAULT_MANIFEST.keyboard;

  var PAUSE_AFTER_COUNT =
    (KB_CFG.repeatSameKey && typeof KB_CFG.repeatSameKey.pauseAfterCount === 'number') ?
      KB_CFG.repeatSameKey.pauseAfterCount :
      DEFAULT_MANIFEST.keyboard.repeatSameKey.pauseAfterCount;

  var EFFECTIVE_KEY_MILESTONES =
    (KB_CFG.effectiveKeyMilestones && KB_CFG.effectiveKeyMilestones.length) ?
      KB_CFG.effectiveKeyMilestones :
      DEFAULT_MANIFEST.keyboard.effectiveKeyMilestones;

  var LIGHT_FEEDBACK_KEYS =
    (KB_CFG.functionKeys && KB_CFG.functionKeys.lightFeedback) ||
    DEFAULT_MANIFEST.keyboard.functionKeys.lightFeedback;

  var WEAK_FEEDBACK_KEYS =
    (KB_CFG.functionKeys && KB_CFG.functionKeys.weakOrNoReward) ||
    DEFAULT_MANIFEST.keyboard.functionKeys.weakOrNoReward;

  // 功能键连打衰减常量：manifest.keyboard.functionKeyMashDecay 目前只是占位结构（无具体数值，
  // 见该字段内 note），以下为本卡（008）本地防御式默认值，详见文件顶部设计说明第 4 条。
  var FUNCTION_KEY_DECAY_SPAN = 4; // 约 4 次连续同键后衰减到 0（"快速衰减到几乎没有"，REQ-KB-06）
  var FUNCTION_KEY_BASE_INTENSITY = { light: 1, weak: 0.3, other: 0.5 };

  var ALNUM_RE = /^[a-z0-9]$/i;

  // ---------------------------------------------------------------------
  // 小工具
  // ---------------------------------------------------------------------
  function isAlnumKey(key) {
    return typeof key === 'string' && key.length === 1 && ALNUM_RE.test(key);
  }

  function normalizeFunctionKeyName(key) {
    // KeyboardEvent.key 的空格键实际值是单个空格字符 ' '，非 'Space'；与 app.js 现有
    // dbgKey 显示逻辑保持同一约定，统一归一化为 'Space' 便于对照 manifest.functionKeys 配置。
    return key === ' ' ? 'Space' : key;
  }

  function indexOfStr(arr, v) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === v) return i;
    }
    return -1;
  }

  // ---------------------------------------------------------------------
  // 订阅者管理：多订阅者数组 + 逐个 try/catch，防止下游回调抛错裸冒泡打断本引擎。
  // ---------------------------------------------------------------------
  var letterSubscribers = [];
  var effectiveKeySubscribers = [];
  var milestoneSubscribers = [];
  var functionKeySubscribers = [];

  function addSubscriber(list, fn) {
    if (typeof fn !== 'function') {
      console.warn('[WTJ_KEYBOARD] 订阅回调必须是函数，已忽略此次注册。');
      return;
    }
    list.push(fn);
  }

  function emit(list, arg) {
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](arg);
      } catch (err) {
        console.error('[WTJ_KEYBOARD] 订阅回调抛出异常，已捕获：', err);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 状态：有效键计数 / 已触发里程碑 / 连续同键节奏（字母键与功能键共享同一套，见设计说明第 3 条）
  // ---------------------------------------------------------------------
  var effectiveKeyCount = 0;
  var firedMilestones = {}; // { '100': true, '200': true, ... }，键为里程碑数值的字符串形式

  var lastKeyId = null;   // 上一次非 repeat keydown 的归一化键标识
  var sameKeyStreak = 0;  // 连续按下同一个键（非 repeat）的次数

  function getEffectiveKeyCount() {
    return effectiveKeyCount;
  }

  function resetEffectiveKeyCount() {
    effectiveKeyCount = 0;
    firedMilestones = {};
    // WTJ-20260704-066 修复：连续同键节奏状态也在轮次边界清空，新一轮首键不被上一轮遗留的
    // "同键 > 3 暂停"状态误吞。防刷计数本身仍是"本轮内可衰减"（同键连打第 4 次起暂停，行为
    // 不变），reset 后清零即为"新一轮恢复"——见文件顶部「轮次边界」一节的详细说明。
    lastKeyId = null;
    sameKeyStreak = 0;
  }

  function milestoneSlotIndex(milestoneValue) {
    var idx = indexOfStr(EFFECTIVE_KEY_MILESTONES, milestoneValue);
    return idx === -1 ? 0 : idx; // 里程碑各占一槽（fallback 专用策略，见下方 lightMilestoneSlot）
  }

  // ---------------------------------------------------------------------
  // 五槽联动（REQ-SLOT-03）：优先委托 010 的统一五槽状态机
  // window.WTJ_SLOTS.fillSlot('keyboard-milestone', { itemKey: m, renderState: { milestone: true } })
  // ——由它负责跨"键盘里程碑"与"009 秘密词命中"两种来源的统一去重、槽位分配与满槽事件
  // （见 app/web/slots/SLOTS-API.md）。010 接管分配逻辑后，milestoneSlotIndex()/
  // firedMilestones 仍用于判定"该里程碑是否本轮已触发过"（未变），但具体点亮哪个槽由 010 决定，
  // 不再是 milestoneSlotIndex() 的返回值。
  //
  // Fallback（WTJ_SLOTS 不可用时，如 slots.js 未加载/被移除，不视为回归）：退回本卡原有的
  // "按里程碑在数组中的顺序各占一槽（milestoneSlotIndex）直接点 WTJ_HUD.setSlot" 最小实现。
  // ---------------------------------------------------------------------
  function lightMilestoneSlotFallback(m) {
    try {
      if (window.WTJ_HUD && typeof window.WTJ_HUD.setSlot === 'function') {
        window.WTJ_HUD.setSlot(milestoneSlotIndex(m), { milestone: true });
      }
    } catch (err) {
      console.error('[WTJ_KEYBOARD] 调用 window.WTJ_HUD.setSlot 失败，已捕获：', err);
    }
  }

  function lightMilestoneSlot(m) {
    if (window.WTJ_SLOTS && typeof window.WTJ_SLOTS.fillSlot === 'function') {
      try {
        window.WTJ_SLOTS.fillSlot('keyboard-milestone', { itemKey: m, renderState: { milestone: true } });
      } catch (err) {
        console.error('[WTJ_KEYBOARD] 调用 window.WTJ_SLOTS.fillSlot 失败，已捕获：', err);
      }
      return;
    }
    lightMilestoneSlotFallback(m);
  }

  function checkMilestones() {
    for (var i = 0; i < EFFECTIVE_KEY_MILESTONES.length; i++) {
      var m = EFFECTIVE_KEY_MILESTONES[i];
      if (effectiveKeyCount >= m && !firedMilestones[m]) {
        firedMilestones[m] = true;
        emit(milestoneSubscribers, m);
        lightMilestoneSlot(m);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 按键处理
  // ---------------------------------------------------------------------
  function handleAlnumKey(e) {
    var rawKey = e.key;
    var normalized = rawKey.toLowerCase();

    if (e.repeat) {
      // REQ-KB-07：长按不持续计数——OS 自动重复的 keydown 完全忽略。
      return;
    }

    if (normalized === lastKeyId) {
      sameKeyStreak += 1;
    } else {
      lastKeyId = normalized;
      sameKeyStreak = 1;
    }

    // REQ-KB-08 / REQ-KB-09：严格大于阈值才暂停，双写（连续 2 次）、连续 3 次天然放行。
    if (sameKeyStreak > PAUSE_AFTER_COUNT) {
      return;
    }

    effectiveKeyCount += 1;
    emit(letterSubscribers, rawKey.toUpperCase());
    emit(effectiveKeySubscribers, effectiveKeyCount);
    checkMilestones();
  }

  function handleFunctionKey(e) {
    var normalized = normalizeFunctionKeyName(e.key);

    if (e.repeat) {
      // 长按功能键（如按住 Space）同样不重复刷反馈事件。
      return;
    }

    if (normalized === lastKeyId) {
      sameKeyStreak += 1;
    } else {
      lastKeyId = normalized;
      sameKeyStreak = 1;
    }

    var category = 'other';
    if (indexOfStr(LIGHT_FEEDBACK_KEYS, normalized) !== -1) {
      category = 'light';
    } else if (indexOfStr(WEAK_FEEDBACK_KEYS, normalized) !== -1) {
      category = 'weak';
    }

    // REQ-KB-06：连续乱按功能键，反馈快速衰减到几乎没有。
    var decayMultiplier = Math.max(0, 1 - (sameKeyStreak - 1) / FUNCTION_KEY_DECAY_SPAN);
    var baseIntensity = FUNCTION_KEY_BASE_INTENSITY[category];
    var intensity = baseIntensity * decayMultiplier;

    emit(functionKeySubscribers, { key: normalized, category: category, intensity: intensity });
    // 功能键永不计入有效键计数/里程碑（REQ-KB-05：修饰键"不计奖励"；本引擎对所有功能键一视同仁）。
  }

  function onKeyDown(e) {
    if (!e || typeof e.key !== 'string') return;
    if (isAlnumKey(e.key)) {
      handleAlnumKey(e);
    } else {
      handleFunctionKey(e);
    }
  }

  window.addEventListener('keydown', onKeyDown, false);

  // ---------------------------------------------------------------------
  // 对外冻结 API
  // ---------------------------------------------------------------------
  function onLetter(fn) { addSubscriber(letterSubscribers, fn); }
  function onEffectiveKey(fn) { addSubscriber(effectiveKeySubscribers, fn); }
  function onMilestone(fn) { addSubscriber(milestoneSubscribers, fn); }
  function onFunctionKey(fn) { addSubscriber(functionKeySubscribers, fn); }

  window.WTJ_KEYBOARD = Object.freeze({
    onLetter: onLetter,
    onEffectiveKey: onEffectiveKey,
    onMilestone: onMilestone,
    onFunctionKey: onFunctionKey,
    getEffectiveKeyCount: getEffectiveKeyCount,
    resetEffectiveKeyCount: resetEffectiveKeyCount
  });
})();
