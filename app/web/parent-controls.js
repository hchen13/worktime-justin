// WTJ-20260705-018 — 隐藏家长菜单 web 层配套（window.WTJ_PARENT_CONTROLS）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function，不用箭头函数 / let / const /
// 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求、非 module（无 import/export），以普通
// <script src="parent-controls.js"> 标签加载。建议放在 manifest.js 之后（读取
// MANIFEST.parentControls 的默认值）、keyboard.js/pointer.js 之前——本文件暴露的
// isInputSuspended() 需要在两者的 window 级事件监听里被消费（见该两文件顶部各自新增的
// "WTJ-20260705-018" 注释段），加载顺序上"提供方先于消费方"是既有惯例。
//
// -----------------------------------------------------------------------
// 职责边界（WTJ-20260705-018 卡定案）
// -----------------------------------------------------------------------
// shell（app/shell/main.swift）持有全部权威状态（每日额度/今日已用秒数/是否锁定，见该文件
// "MARK: 每日使用时长额度 / 安静锁屏"一节）；本文件只是"被动展示 + 转发家长操作"的薄层：
//   - shell -> web（评估执行以下三个全局函数，命名与既有 013 卡的 window.wtjEscProgress
//     同一惯例——全局裸函数，不是挂在某个对象下的方法，方便 evaluateJavaScript 直接调用）：
//       window.wtjParentGateProgress(seconds)       Cmd+Q 长按进度（驱动进度条）
//       window.wtjApplyShellState(state)            hydrate/静默同步权威状态（不强制弹面板）
//       window.wtjSetLockout(locked, remainingSecs)  锁定状态翻转（驱动安静锁屏叠层）
//       window.wtjShowSettingsPanel(state)           打开设置面板并同步最新状态
//   - web -> shell（window.webkit.messageHandlers.shell.postMessage(...)，见 postToShell()）：
//       { type: 'wtjSetDailyLimit', minutes: N }     设置面板"保存额度"
//       { type: 'wtjResetUsageToday' }               设置面板"重置今日额度"
// 本文件自己**不**判断"是否应该锁定"——只是如实展示 shell 告知的状态；也不做额度计时——计时
// 完全在 shell 侧的 Timer（Big Sur 无 Swift Concurrency，纯 Timer/回调风格，见 main.swift）。
//
// -----------------------------------------------------------------------
// isInputSuspended()：keyboard.js / pointer.js 的输入抑制判定（验收标准 #5/#6）
// -----------------------------------------------------------------------
// 锁定（额度耗尽）或设置面板处于打开状态时，"普通键盘鼠标不再触发游戏奖励或声音"——但两者
// 触发抑制的原因不同、需要合并成一个统一的布尔判断：
//   - locked=true：安静锁屏本身要求禁用一切游戏交互（验收标准 #5）。
//   - settingsPanelOpen=true：即便当前并未锁定（家长只是主动打开设置面板查看/调整），也必须
//     暂停 keyboard.js/pointer.js 的自定义 window 级事件处理——否则 pointer.js 对设置面板按钮
//     click 事件的坐标做几何 hit-test 时，可能误命中面板背后被遮挡的任务/拖拽目标（面板是
//     纯坐标不感知 DOM 遮挡关系的绝对定位覆盖层，pointer.js 的 hitTestTargets() 只按坐标算，
//     不查 elementFromPoint）。设置面板自身的原生 <input>/<button>/radio 走浏览器标准 DOM
//     事件分发（addEventListener 直接绑在该元素上），不经过 keyboard.js/pointer.js 的
//     window 级监听，因此抑制两者不会影响面板自己的可用性。
(function () {
  'use strict';

  var VERSION = '0.1.0';
  var CARD_ID = 'WTJ-20260705-018';

  // ---------------------------------------------------------------------
  // manifest 防御式读取（同 app.js 的 DEFAULT_MANIFEST 兜底手法：manifest.js 未加载/被移除
  // 时不应该让本文件整个抛错，退回内置默认值）。
  // ---------------------------------------------------------------------
  var DEFAULT_PARENT_CONTROLS_CFG = {
    cmdQHoldSec: 5,
    dailyLimitMinutesDefault: 30,
    dailyLimitMinutesRange: { min: 5, max: 180 }
  };
  var MANIFEST = window.WTJ_MANIFEST;
  var CFG = (MANIFEST && MANIFEST.parentControls) ? MANIFEST.parentControls : DEFAULT_PARENT_CONTROLS_CFG;
  var CMD_Q_HOLD_SECONDS = (typeof CFG.cmdQHoldSec === 'number') ? CFG.cmdQHoldSec : DEFAULT_PARENT_CONTROLS_CFG.cmdQHoldSec;
  var DEFAULT_LIMIT_MINUTES = (typeof CFG.dailyLimitMinutesDefault === 'number') ? CFG.dailyLimitMinutesDefault : DEFAULT_PARENT_CONTROLS_CFG.dailyLimitMinutesDefault;
  var DEFAULT_LIMIT_RANGE = CFG.dailyLimitMinutesRange || DEFAULT_PARENT_CONTROLS_CFG.dailyLimitMinutesRange;

  // ---------------------------------------------------------------------
  // 状态缓存（在 shell 第一次 hydrate 之前也要有合理默认值，供 UI/测试直接读取）。
  // ---------------------------------------------------------------------
  var shellState = {
    dailyLimitMinutes: DEFAULT_LIMIT_MINUTES,
    usedSecondsToday: 0,
    remainingSecondsToday: DEFAULT_LIMIT_MINUTES * 60,
    locked: false,
    dailyLimitMinMinutes: (DEFAULT_LIMIT_RANGE && DEFAULT_LIMIT_RANGE.min) || 5,
    dailyLimitMaxMinutes: (DEFAULT_LIMIT_RANGE && DEFAULT_LIMIT_RANGE.max) || 180
  };
  var settingsPanelOpen = false;

  function clampInt(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  // ---------------------------------------------------------------------
  // DOM 小工具（与 hud.js 的 el() 同一手法，各模块各自维护一份，不引入共享 util 依赖）。
  // ---------------------------------------------------------------------
  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    return node;
  }

  // ---------------------------------------------------------------------
  // shell 通道
  // ---------------------------------------------------------------------
  function postToShell(payload) {
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.shell) {
        window.webkit.messageHandlers.shell.postMessage(payload);
        return true;
      }
    } catch (err) {
      console.error('[WTJ_PARENT_CONTROLS] postToShell 失败，已捕获：', err);
    }
    return false; // 非 WKWebView 环境（浏览器直接打开调试/单元测试）：静默失败，调用方自行提示。
  }

  // ---------------------------------------------------------------------
  // Cmd+Q 长按进度条
  // ---------------------------------------------------------------------
  var gateProgressWrap = null;
  var gateProgressBar = null;

  function buildGateProgress() {
    var wrap = el('div', 'wtj-parent-gate-progress-wrap');
    wrap.id = 'wtj-parent-gate-progress-wrap';
    wrap.setAttribute('aria-hidden', 'true');
    var bar = el('div', 'wtj-parent-gate-progress-bar');
    bar.id = 'wtj-parent-gate-progress-bar';
    wrap.appendChild(bar);
    gateProgressBar = bar;
    return wrap;
  }

  function applyGateProgress(seconds) {
    var s = (typeof seconds === 'number' && seconds > 0) ? seconds : 0;
    var pct = Math.max(0, Math.min(1, s / CMD_Q_HOLD_SECONDS)) * 100;
    if (gateProgressWrap) {
      if (s > 0) {
        gateProgressWrap.classList.add('is-active');
      } else {
        gateProgressWrap.classList.remove('is-active');
      }
    }
    if (gateProgressBar) {
      gateProgressBar.style.width = pct + '%';
    }
  }

  // ---------------------------------------------------------------------
  // 安静锁屏叠层
  // ---------------------------------------------------------------------
  var lockoutOverlay = null;

  function buildLockoutOverlay() {
    var wrap = el('div', 'wtj-parent-lockout');
    wrap.id = 'wtj-parent-lockout';
    wrap.setAttribute('aria-hidden', 'true');

    var card = el('div', 'wtj-parent-lockout-card');
    var title = el('div', 'wtj-parent-lockout-title');
    title.textContent = '今天的时间用完啦';
    var sub = el('div', 'wtj-parent-lockout-sub');
    sub.textContent = '明天再来玩吧！';
    card.appendChild(title);
    card.appendChild(sub);
    wrap.appendChild(card);
    return wrap;
  }

  function setLockoutVisible(visible) {
    if (!lockoutOverlay) return;
    if (visible) {
      lockoutOverlay.classList.add('is-active');
      lockoutOverlay.setAttribute('aria-hidden', 'false');
    } else {
      lockoutOverlay.classList.remove('is-active');
      lockoutOverlay.setAttribute('aria-hidden', 'true');
    }
  }

  // ---------------------------------------------------------------------
  // 设置面板
  // ---------------------------------------------------------------------
  var settingsPanel = null;
  var dailyLimitInput = null;
  var dailyLimitStatus = null;
  var usageTodayLabel = null;
  var langRadios = {}; // mode -> <input type="radio">
  var langNote = null;

  function refreshLanguageSection() {
    var voiceLang = window.WTJ_VOICE_LANG;
    var mode = (voiceLang && typeof voiceLang.getMode === 'function') ? voiceLang.getMode() : 'zh';
    var availability = (voiceLang && typeof voiceLang.getAvailability === 'function') ? voiceLang.getAvailability() : null;

    var modes = ['zh', 'en', 'auto'];
    var i;
    for (i = 0; i < modes.length; i++) {
      var m = modes[i];
      var input = langRadios[m];
      if (!input) continue;
      input.checked = (m === mode);
      if (m === 'zh' || m === 'en') {
        var avail = availability && availability[m];
        var disabled = !!(avail && !avail.complete);
        input.disabled = disabled;
        var labelNode = input.parentNode;
        if (labelNode && labelNode.classList) {
          if (disabled) {
            labelNode.classList.add('is-disabled');
          } else {
            labelNode.classList.remove('is-disabled');
          }
        }
      }
    }

    if (langNote) {
      if (availability) {
        var zhInfo = availability.zh;
        var enInfo = availability.en;
        // no-silent-fallback 的 UI 侧落地：明确列出两种语言各自的交付完整度，缺口不完整时
        // 直接写清楚"已禁用"，不让家长以为选了英文之后每个任务都会有声音。
        langNote.textContent =
          '中文语音 ' + zhInfo.deliveredCount + '/' + zhInfo.totalCount + (zhInfo.complete ? '（完整）' : '（不完整，已禁用）') +
          ' · 英文语音 ' + enInfo.deliveredCount + '/' + enInfo.totalCount + (enInfo.complete ? '（完整）' : '（不完整，已禁用，不会静默改播中文）');
      } else {
        langNote.textContent = '语言模块未加载，暂无法切换任务语音语言。';
      }
    }
  }

  function refreshSettingsPanelFields() {
    if (dailyLimitInput) {
      dailyLimitInput.value = String(shellState.dailyLimitMinutes);
      dailyLimitInput.min = String(shellState.dailyLimitMinMinutes);
      dailyLimitInput.max = String(shellState.dailyLimitMaxMinutes);
    }
    if (usageTodayLabel) {
      var usedMinutes = Math.floor(shellState.usedSecondsToday / 60);
      usageTodayLabel.textContent = '今日已用约 ' + usedMinutes + ' 分钟（限额 ' +
        shellState.dailyLimitMinutes + ' 分钟）' + (shellState.locked ? ' —— 已锁定' : '');
    }
    refreshLanguageSection();
  }

  function onSaveDailyLimit() {
    if (!dailyLimitInput) return;
    var parsed = parseInt(dailyLimitInput.value, 10);
    if (isNaN(parsed)) {
      if (dailyLimitStatus) {
        dailyLimitStatus.textContent = '请输入有效的分钟数。';
      }
      return;
    }
    var clamped = clampInt(parsed, shellState.dailyLimitMinMinutes, shellState.dailyLimitMaxMinutes);
    dailyLimitInput.value = String(clamped);
    var sent = postToShell({ type: 'wtjSetDailyLimit', minutes: clamped });
    if (dailyLimitStatus) {
      dailyLimitStatus.textContent = sent
        ? ('已保存：每日 ' + clamped + ' 分钟。')
        : '未连接到原生壳，保存未生效（仅浏览器直接调试环境下会出现）。';
    }
  }

  function onResetUsage() {
    var sent = postToShell({ type: 'wtjResetUsageToday' });
    if (dailyLimitStatus) {
      dailyLimitStatus.textContent = sent
        ? '已重置今日使用时长。'
        : '未连接到原生壳，重置未生效（仅浏览器直接调试环境下会出现）。';
    }
  }

  function onLanguageChange(mode) {
    var voiceLang = window.WTJ_VOICE_LANG;
    if (!voiceLang || typeof voiceLang.setMode !== 'function') {
      return;
    }
    var result = voiceLang.setMode(mode);
    if (!result.ok && langNote) {
      langNote.textContent = '无法切换：素材不完整（' +
        (result.availability ? (result.availability.deliveredCount + '/' + result.availability.totalCount) : '?') +
        '），已保持原语言设置，不会静默切换。';
    }
    refreshLanguageSection();
  }

  function buildSettingsPanel() {
    var wrap = el('div', 'wtj-parent-settings');
    wrap.id = 'wtj-parent-settings';
    wrap.setAttribute('aria-hidden', 'true');

    var card = el('div', 'wtj-parent-settings-card');

    var heading = el('h2', 'wtj-parent-settings-title');
    heading.textContent = '家长设置';
    card.appendChild(heading);

    // --- 每日额度 ---
    var limitSection = el('section', 'wtj-parent-settings-section');
    var limitLabel = el('label', 'wtj-parent-settings-label');
    limitLabel.textContent = '每日允许使用时长（分钟）';
    limitSection.appendChild(limitLabel);

    var limitRow = el('div', 'wtj-parent-settings-row');
    var input = document.createElement('input');
    input.type = 'number';
    input.id = 'wtj-daily-limit-input';
    input.className = 'wtj-parent-settings-input';
    input.step = '5';
    dailyLimitInput = input;
    limitRow.appendChild(input);

    var saveBtn = el('button', 'wtj-parent-settings-btn');
    saveBtn.type = 'button';
    saveBtn.textContent = '保存额度';
    saveBtn.addEventListener('click', onSaveDailyLimit, false);
    limitRow.appendChild(saveBtn);
    limitSection.appendChild(limitRow);

    var status = el('div', 'wtj-parent-settings-status');
    dailyLimitStatus = status;
    limitSection.appendChild(status);
    card.appendChild(limitSection);

    // --- 今日使用 / 重置 ---
    var usageSection = el('section', 'wtj-parent-settings-section');
    var usageLabel = el('div', 'wtj-parent-settings-usage');
    usageTodayLabel = usageLabel;
    usageSection.appendChild(usageLabel);

    var resetBtn = el('button', 'wtj-parent-settings-btn wtj-parent-settings-btn-secondary');
    resetBtn.type = 'button';
    resetBtn.textContent = '重置今日额度';
    resetBtn.addEventListener('click', onResetUsage, false);
    usageSection.appendChild(resetBtn);
    card.appendChild(usageSection);

    // --- 语言 ---
    var langSection = el('section', 'wtj-parent-settings-section');
    var langLabel = el('label', 'wtj-parent-settings-label');
    langLabel.textContent = '任务语音语言';
    langSection.appendChild(langLabel);

    var langOptions = [
      { mode: 'zh', text: '中文' },
      { mode: 'en', text: '英文' },
      { mode: 'auto', text: '跟随素材可用性' }
    ];
    var oi;
    for (oi = 0; oi < langOptions.length; oi++) {
      (function (opt) {
        var optLabel = el('label', 'wtj-parent-settings-radio-label');
        var radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'wtj-parent-lang';
        radio.value = opt.mode;
        radio.addEventListener('change', function () {
          onLanguageChange(opt.mode);
        }, false);
        langRadios[opt.mode] = radio;
        optLabel.appendChild(radio);
        var span = document.createElement('span');
        span.textContent = ' ' + opt.text;
        optLabel.appendChild(span);
        langSection.appendChild(optLabel);
      })(langOptions[oi]);
    }

    var note = el('div', 'wtj-parent-settings-lang-note');
    langNote = note;
    langSection.appendChild(note);
    card.appendChild(langSection);

    var closeBtn = el('button', 'wtj-parent-settings-btn wtj-parent-settings-close');
    closeBtn.type = 'button';
    closeBtn.textContent = '关闭';
    closeBtn.addEventListener('click', function () {
      hideSettingsPanel();
    }, false);
    card.appendChild(closeBtn);

    wrap.appendChild(card);
    return wrap;
  }

  function showSettingsPanel(state) {
    applyState(state);
    settingsPanelOpen = true;
    refreshSettingsPanelFields();
    if (settingsPanel) {
      settingsPanel.classList.add('is-active');
      settingsPanel.setAttribute('aria-hidden', 'false');
    }
  }

  function hideSettingsPanel() {
    settingsPanelOpen = false;
    if (settingsPanel) {
      settingsPanel.classList.remove('is-active');
      settingsPanel.setAttribute('aria-hidden', 'true');
    }
  }

  // ---------------------------------------------------------------------
  // 状态应用（shell -> web）
  // ---------------------------------------------------------------------
  function applyState(state) {
    if (!state || typeof state !== 'object') return;
    if (typeof state.dailyLimitMinutes === 'number') shellState.dailyLimitMinutes = state.dailyLimitMinutes;
    if (typeof state.usedSecondsToday === 'number') shellState.usedSecondsToday = state.usedSecondsToday;
    if (typeof state.remainingSecondsToday === 'number') shellState.remainingSecondsToday = state.remainingSecondsToday;
    if (typeof state.locked === 'boolean') shellState.locked = state.locked;
    if (typeof state.dailyLimitMinMinutes === 'number') shellState.dailyLimitMinMinutes = state.dailyLimitMinMinutes;
    if (typeof state.dailyLimitMaxMinutes === 'number') shellState.dailyLimitMaxMinutes = state.dailyLimitMaxMinutes;
    setLockoutVisible(shellState.locked);
    if (settingsPanelOpen) {
      refreshSettingsPanelFields();
    }
  }

  function setLockout(locked, remainingSeconds) {
    shellState.locked = !!locked;
    if (typeof remainingSeconds === 'number') {
      shellState.remainingSecondsToday = remainingSeconds;
    }
    setLockoutVisible(shellState.locked);
    if (settingsPanelOpen) {
      refreshSettingsPanelFields();
    }
  }

  function isLocked() {
    return !!shellState.locked;
  }

  function isSettingsPanelOpen() {
    return !!settingsPanelOpen;
  }

  // keyboard.js / pointer.js 消费的统一抑制判定，见文件顶部注释。
  function isInputSuspended() {
    return isLocked() || isSettingsPanelOpen();
  }

  function getCachedState() {
    return {
      dailyLimitMinutes: shellState.dailyLimitMinutes,
      usedSecondsToday: shellState.usedSecondsToday,
      remainingSecondsToday: shellState.remainingSecondsToday,
      locked: shellState.locked,
      dailyLimitMinMinutes: shellState.dailyLimitMinMinutes,
      dailyLimitMaxMinutes: shellState.dailyLimitMaxMinutes
    };
  }

  // ---------------------------------------------------------------------
  // 挂载（与 hud.js 同一手法：模块加载时立即构建 DOM 并挂到 document.body）。
  // ---------------------------------------------------------------------
  function mount() {
    lockoutOverlay = buildLockoutOverlay();
    document.body.appendChild(lockoutOverlay);

    gateProgressWrap = buildGateProgress();
    document.body.appendChild(gateProgressWrap);

    settingsPanel = buildSettingsPanel();
    document.body.appendChild(settingsPanel);

    refreshSettingsPanelFields();
  }

  mount();

  // ---------------------------------------------------------------------
  // 全局钩子（shell 经 evaluateJavaScript 调用；命名沿用 013 卡 window.wtjEscProgress 的
  // "裸全局函数"惯例，不是挂在某个 namespace 对象下的方法）。
  // ---------------------------------------------------------------------
  window.wtjParentGateProgress = applyGateProgress;
  window.wtjApplyShellState = applyState;
  window.wtjSetLockout = setLockout;
  window.wtjShowSettingsPanel = showSettingsPanel;

  // ---------------------------------------------------------------------
  // 冻结导出
  // ---------------------------------------------------------------------
  var API = {
    VERSION: VERSION,
    CARD_ID: CARD_ID,

    isLocked: isLocked,
    isSettingsPanelOpen: isSettingsPanelOpen,
    isInputSuspended: isInputSuspended,
    getCachedState: getCachedState,

    showSettingsPanel: showSettingsPanel,
    hideSettingsPanel: hideSettingsPanel
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  if (!window.WTJ_PARENT_CONTROLS && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_PARENT_CONTROLS', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_PARENT_CONTROLS) {
    window.WTJ_PARENT_CONTROLS = API;
  }
})();
