// WTJ-20260704-084 — 逐键机械键盘反馈音接线（window.WTJ_KEYSOUND）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function 声明式，不用箭头函数 / let /
// const / 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求、非 module（无 import/export），
// 以普通 <script src="keysound.js"> 标签加载，需排在 keyboard.js 与 audio.js 之后（订阅
// window.WTJ_KEYBOARD.onLetter/onFunctionKey，播放走 window.WTJ_AUDIO.playSfx）。
//
// 职责边界（084 卡音频侧，见卡片说明）：本文件只负责"键盘引擎已判定好的事件 → 选对应机械
// 键音 sfxKey → 调用 WTJ_AUDIO.playSfx() 播放"这一条接线，不做任何判定/渲染——按键分类
// （字母/数字 vs Space/Enter/修饰键/标点）、连打衰减 intensity 的计算都已经由 keyboard.js
// （008）完成，本文件只消费其事件 payload。086 卡负责非字母键的**视觉**反馈，与本文件
// （音频）平行、互不覆盖，本文件不做任何 DOM/Canvas 渲染。
//
// 本卡明确不做：不引入 speechSynthesis（TTS 红线 REQ-AST-07 全局适用，非仅 016 卡范围）；
// 不碰 audio/words/*.m4a 的 TTS 误读/发音审计（Ethan 指示等他给误读词清单后再做，见卡片
// 说明）；不做非字母键的视觉反馈（归 086）。
//
// -----------------------------------------------------------------------
// 机械键音映射（5 类，见 audio/sfx-manifest.json 'keySound' 分类 / audio.js DEFAULT_SFX_MAP /
// audio/SOURCE-LICENSES.md「WTJ-20260704-084 追加」一节）
// -----------------------------------------------------------------------
//   onLetter                        → 'key-letter'（普通字母/数字键，清脆 click；字母是被
//                                      鼓励的输入，永远给满反馈，不做 intensity 衰减——
//                                      onLetter 事件本身没有 intensity 字段，也没有"连打
//                                      惩罚"语义，keyboard.js 的同键 >3 暂停规则已经在"是否
//                                      触发 onLetter"这一层把过度连打过滤掉了，见该文件
//                                      handleAlnumKey()）。
//   onFunctionKey category='light' 且 key==='Space' → 'key-space'（低沉 thock）
//   onFunctionKey category='light' 且 key==='Enter' → 'key-enter'（确认感 click+短音）
//   onFunctionKey category='light' 且其余 key（防御式兜底，理论上不会发生——
//     manifest.keyboard.functionKeys.lightFeedback 当前只有 Space/Enter，见 keyboard.js
//     LIGHT_FEEDBACK_KEYS）→ 退回 'key-punct'
//   onFunctionKey category='weak'（Meta/Alt/Control/Shift）→ 'key-modifier'（最钝/最轻）
//   onFunctionKey category='other'（标点等未分类功能键）→ 'key-punct'（中性轻 click）
//
// -----------------------------------------------------------------------
// intensity → "递减不鼓励乱按"（REQ-KB-06，criterion 4）怎么落地
// -----------------------------------------------------------------------
// window.WTJ_AUDIO.playSfx()（audio.js）当前不支持音量/gain 参数——playFromPath() 里的
// BufferSource 直连 ctx.destination，没有 GainNode 可调（已读 app/web/audio.js 源码确认）。
// 给 audio.js 播放链路加一层 GainNode 属于该模块（016 卡）的改动，超出本卡范围（084 只做
// 音频侧的机械键音合成 + 接线，不改 016 卡交付的 audio.js 播放核心）。
//
// 因此本卡按 TL 指令改用"intensity 阈值"实现递减效果：intensity 低于
// INTENSITY_PLAY_THRESHOLD 时直接跳过播放（不调用 playSfx），而不是"越来越小声地播放"——
// 听感上仍然是"连续乱按同一个非字母键，反馈越来越少，最后完全没有声音"，达成"不过度鼓励
// 乱按"的验收意图，只是衰减曲线是阶梯式（"响几次然后消失"）而非连续渐弱。若未来 audio.js
// 加了 GainNode 支持，这里应改为按 intensity 连续调低音量，不再是阈值跳过——该已知限制已
// 记录在 audio/SOURCE-LICENSES.md「WTJ-20260704-084 追加」一节的主观验收提醒里。
//
// 阈值取值 0.15（本卡本地防御式占位值，非 manifest/文档精确数值，同款 keyboard.js
// FUNCTION_KEY_DECAY_SPAN 的"占位常量"处理方式，非文档给出的精确值）：结合 keyboard.js 的
// FUNCTION_KEY_BASE_INTENSITY = { light:1, weak:0.3, other:0.5 } 与
// FUNCTION_KEY_DECAY_SPAN=4 的衰减曲线（decayMultiplier = max(0, 1-(streak-1)/4)）反推：
//   - weak（修饰键）：连续同键 streak 1~3 次（intensity 0.3/0.225/0.15）仍播放，第 4 次起
//     （intensity 0.075）跳过——连续按同一个修饰键 3 次后安静下来。
//   - other（标点等）：streak 1~3 次（intensity 0.5/0.375/0.25）仍播放，第 4 次起
//     （intensity 0.125）跳过。
//   - light（Space/Enter）：streak 1~4 次仍播放（intensity 1/0.75/0.5/0.25 均 >= 0.15），
//     第 5 次起（intensity 0）才跳过——Space/Enter 本身是正常操作的一部分，容忍度更高，
//     与 keyboard.js 给 light 类更高 baseIntensity 的设计意图一致。
//
// -----------------------------------------------------------------------
// REQ-KB-01/02/05/06 落地位置索引（供 PM/QA 对照，音频侧）：
//   REQ-KB-01/02  onLetterHandler() 订阅 onLetter → playSfx('key-letter')。
//   REQ-KB-05     functionKeyToSfxKey()：category → sfxKey 映射。
//   REQ-KB-06     onFunctionKeyHandler() 的 intensity 阈值判定（INTENSITY_PLAY_THRESHOLD）。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 重复引入守卫（同款 pointer.js/audio.js/secretword.js 的教训）：本模块只应被引入一次。
  // 若脚本被重复引入，第二次执行 IIFE 若不短路，会再向 window.WTJ_KEYBOARD.onLetter/
  // onFunctionKey 各注册一个订阅回调——同一次按键会播两遍音效。
  // ---------------------------------------------------------------------
  if (window.WTJ_KEYSOUND) {
    return;
  }

  // 见文件头"intensity → 递减"一节的推导，本卡本地防御式占位阈值。
  var INTENSITY_PLAY_THRESHOLD = 0.15;

  // ---------------------------------------------------------------------
  // 防御式播放包装：WTJ_AUDIO 缺失/加载失败时静默跳过，不阻断键盘引擎；playSfx() 契约上
  // 永不 reject（见 audio.js 头注释），这里仍加一层 catch 防止未来契约被破坏时裸抛。
  // ---------------------------------------------------------------------
  function playSfxDefensive(sfxKey) {
    if (!window.WTJ_AUDIO || typeof window.WTJ_AUDIO.playSfx !== 'function') {
      console.warn('[WTJ_KEYSOUND] window.WTJ_AUDIO 未找到或 playSfx 不可用（audio.js 未加载或加载失败），机械键音跳过：' + sfxKey);
      return;
    }
    try {
      var result = window.WTJ_AUDIO.playSfx(sfxKey);
      if (result && typeof result.catch === 'function') {
        result.catch(function (err) {
          console.error('[WTJ_KEYSOUND] window.WTJ_AUDIO.playSfx 返回的 Promise 被 reject（不应发生，playSfx 契约上永不 reject），已捕获：', err);
        });
      }
    } catch (err) {
      console.error('[WTJ_KEYSOUND] 调用 window.WTJ_AUDIO.playSfx 失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // onLetter：字母/数字键永远满反馈，不做衰减（见文件头设计说明）。
  // ---------------------------------------------------------------------
  function onLetterHandler() {
    playSfxDefensive('key-letter');
  }

  // ---------------------------------------------------------------------
  // onFunctionKey：category → sfxKey 映射 + intensity 阈值判定。
  // ---------------------------------------------------------------------
  function functionKeyToSfxKey(payload) {
    var category = payload && payload.category;
    var key = payload && payload.key;
    if (category === 'light') {
      if (key === 'Space') return 'key-space';
      if (key === 'Enter') return 'key-enter';
      // 防御式兜底：manifest.keyboard.functionKeys.lightFeedback 目前只有 Space/Enter，
      // 理论上不会走到这一分支；若未来 manifest 扩充了 light 类别的其它键，退回中性音而
      // 不是让整个事件静默丢失。
      return 'key-punct';
    }
    if (category === 'weak') {
      return 'key-modifier';
    }
    // category === 'other'（含任何未来新增/未知分类的防御式兜底）。
    return 'key-punct';
  }

  function onFunctionKeyHandler(payload) {
    if (!payload) {
      return;
    }
    var intensity = typeof payload.intensity === 'number' ? payload.intensity : 0;
    if (intensity < INTENSITY_PLAY_THRESHOLD) {
      // REQ-KB-06：递减到阈值以下直接不播——"几乎没有反馈"，不鼓励连打非字母键
      // （见文件头"intensity → 递减"一节，playSfx 不支持音量时的既定实现方式）。
      return;
    }
    playSfxDefensive(functionKeyToSfxKey(payload));
  }

  // ---------------------------------------------------------------------
  // 订阅 keyboard.js（防御式：缺失/加载顺序错误时 console.warn，不阻断）。
  // ---------------------------------------------------------------------
  if (window.WTJ_KEYBOARD && typeof window.WTJ_KEYBOARD.onLetter === 'function') {
    window.WTJ_KEYBOARD.onLetter(onLetterHandler);
  } else {
    console.warn('[WTJ_KEYSOUND] window.WTJ_KEYBOARD.onLetter 不可用（keyboard.js 未加载或加载顺序在本文件之后），逐键字母音效不可用。');
  }

  if (window.WTJ_KEYBOARD && typeof window.WTJ_KEYBOARD.onFunctionKey === 'function') {
    window.WTJ_KEYBOARD.onFunctionKey(onFunctionKeyHandler);
  } else {
    console.warn('[WTJ_KEYSOUND] window.WTJ_KEYBOARD.onFunctionKey 不可用（keyboard.js 未加载或加载顺序在本文件之后），功能键音效不可用。');
  }

  // ---------------------------------------------------------------------
  // 对外冻结 API（供 QA/单测内省；非本卡运行时消费方必需，但与周边引擎风格一致——
  // functionKeyToSfxKey 单独暴露，方便单测直接断言映射表，不必逐个构造 payload 走完整链路）。
  // ---------------------------------------------------------------------
  var API = {
    CARD_ID: 'WTJ-20260704-084',
    INTENSITY_PLAY_THRESHOLD: INTENSITY_PLAY_THRESHOLD,
    functionKeyToSfxKey: functionKeyToSfxKey
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  // 绑定加固（与 task.js/secretword.js/audio.js/pointer.js 同款）：API 对象自身已
  // Object.freeze（属性不可增删改）；这里进一步把 window 上的 WTJ_KEYSOUND 绑定本身设为
  // 不可写、不可重配置，防止整体重赋值把接线换掉。重复引入已由 IIFE 顶部守卫短路，走不到
  // 这里，因此到达时 window.WTJ_KEYSOUND 必为未定义；下面判断只是二次保险（兼容无
  // defineProperty 环境）。
  if (!window.WTJ_KEYSOUND && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_KEYSOUND', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_KEYSOUND) {
    window.WTJ_KEYSOUND = API;
  }
})();
