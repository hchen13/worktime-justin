// WTJ-20260704-007 — 默认画布主 HUD：DOM overlay，独立于 app.js 的 canvas / rAF 循环。
// 语法基线：ES2020 以内（Safari 14 兼容）。非 module，普通 <script> 标签加载（须在
// manifest.js 之后、无需等待 app.js），暴露 window.WTJ_HUD（冻结对象）供后续卡片
// （010 槽位引擎 / 013 任务引擎 / 015 奖励引擎等）消费，文档见 app/web/MANIFEST.md「HUD API」节。
//
// 素材来源：app/web/assets/ui/（five-slot-tray.png / question-mark-token.png /
// working-status-light.png），复制自 docs/assets/production-pack-a/ui/（素材卡 WTJ-20260704-005），
// 详见 app/web/assets/PROVENANCE.md。
//
// 本卡范围：只负责 HUD 的 DOM 结构、样式与最小状态 API（setSlot / clearSlots / setStatusLight /
// onQuestionClick / getState）。不实现任何业务判定逻辑——秘密词命中、键盘里程碑、任务计时、
// 奖励触发条件等均由对应后续卡片实现，通过上述 API 驱动本文件渲染的 HUD 表现。
// 明确不做（REQ-SEC-01 / REQ-TASK-01 红线）：不渲染任何输入框、终端回显条、右侧图标列。

(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Manifest 访问：与 app.js 相同的防御式读取模式（见 app/web/manifest.js MANIFEST.md）。
  // -----------------------------------------------------------------------

  var DEFAULT_STATUS_LIGHT_COUNT = 3; // 镜像 manifest.js 的 rewards.statusLights.count 默认值；两处需同步维护。

  function getStatusLightCount() {
    var manifest = window.WTJ_MANIFEST;
    if (
      manifest &&
      manifest.rewards &&
      manifest.rewards.statusLights &&
      typeof manifest.rewards.statusLights.count === 'number' &&
      manifest.rewards.statusLights.count > 0
    ) {
      return manifest.rewards.statusLights.count;
    }
    console.warn('[WTJ_HUD] manifest.rewards.statusLights.count 未找到或非法，回退默认值 ' + DEFAULT_STATUS_LIGHT_COUNT + '。');
    return DEFAULT_STATUS_LIGHT_COUNT;
  }

  var SLOT_COUNT = 5; // REQ-SLOT-01：固定 5 个发现槽（HUD 结构常量，与 manifest.slots.count 镜像，非运行时可配）。
  var STATUS_LIGHT_COUNT = getStatusLightCount();
  var ASSET_BASE = 'assets/ui/';

  // 五个槽位在 five-slot-tray.png（1024x1024）中的水平中心百分比（像素采样近似值，
  // 采样方法与遗留事项见 app/web/assets/PROVENANCE.md）。
  var SLOT_LEFT_PERCENTS = [18, 34, 50, 66, 82];

  // -----------------------------------------------------------------------
  // 内部状态（不直接暴露给外部；外部只能通过 API 读写，getState() 返回快照而非引用）
  // -----------------------------------------------------------------------

  var slots = []; // index -> null | { spriteUrl: string } | { milestone: true }
  var statusLights = []; // index -> boolean
  var slotEls = [];
  var lightEls = [];
  var questionClickHandler = function () {
    console.log('[WTJ_HUD] question mark clicked（默认占位回调，尚未被后续卡片接管）。');
  };

  (function initState() {
    var i;
    for (i = 0; i < SLOT_COUNT; i++) {
      slots.push(null);
    }
    for (i = 0; i < STATUS_LIGHT_COUNT; i++) {
      statusLights.push(false);
    }
  })();

  // -----------------------------------------------------------------------
  // DOM 构建 helpers
  // -----------------------------------------------------------------------

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    return node;
  }

  function buildTopbar() {
    var bar = el('div', 'wtj-hud-topbar');
    bar.setAttribute('aria-hidden', 'true');

    var title = el('span', 'wtj-hud-title');
    title.textContent = 'Work Time, Justin! / 小小工作台';
    bar.appendChild(title);

    var lock = el('span', 'wtj-hud-lock');
    // 当前无 pointer-events，title 提示暂不会在悬停时出现；实际长按 Esc 退出判定
    // 与是否开放 pointer-events 由 017 卡接管，见 hud.css 顶部注释与 MANIFEST.md。
    lock.title = '长按 Esc 5 秒退出';
    lock.textContent = '🔒'; // 🔒
    bar.appendChild(lock);

    return bar;
  }

  function buildQuestion() {
    var btn = el('button', 'wtj-hud-question');
    btn.type = 'button';
    btn.setAttribute('aria-label', '问号任务入口');

    var img = el('img', 'wtj-hud-question-img');
    img.src = ASSET_BASE + 'question-mark-token.png';
    img.alt = '';
    btn.appendChild(img);

    btn.addEventListener(
      'click',
      function () {
        // try/catch：questionClickHandler 是后续卡片（013 任务引擎等）通过 onQuestionClick
        // 注册的外部回调，防止下游实现里的异常裸冒泡到这里，把 HUD 自身的点击处理链弄崩。
        try {
          questionClickHandler();
        } catch (err) {
          console.error('[WTJ_HUD] questionClickHandler 回调抛出异常，已捕获：', err);
        }
      },
      false
    );

    return btn;
  }

  function renderSlot(index) {
    var slotEl = slotEls[index];
    if (!slotEl) {
      return;
    }
    slotEl.className = 'wtj-hud-slot';
    slotEl.innerHTML = '';

    var value = slots[index];
    if (value === null) {
      slotEl.classList.add('is-empty');
      return;
    }
    if (value.milestone === true) {
      slotEl.classList.add('is-milestone');
      var star = el('span', 'wtj-hud-slot-star');
      star.setAttribute('aria-hidden', 'true');
      star.textContent = '★'; // ★，键盘里程碑星形占位（REQ-SLOT-04）
      slotEl.appendChild(star);
      return;
    }
    if (typeof value.spriteUrl === 'string' && value.spriteUrl) {
      slotEl.classList.add('is-filled');
      var img = el('img', 'wtj-hud-slot-sprite');
      img.src = value.spriteUrl;
      img.alt = '';
      slotEl.appendChild(img);
      return;
    }
    // 不应该到达这里（setSlot 已做形状校验），兜底渲染为空态，避免 DOM 处于无样式的中间态。
    slotEl.classList.add('is-empty');
  }

  function buildTray() {
    var wrap = el('div', 'wtj-hud-tray-wrap');
    wrap.setAttribute('aria-hidden', 'true');

    var bg = el('img', 'wtj-hud-tray-bg');
    bg.src = ASSET_BASE + 'five-slot-tray.png';
    bg.alt = '';
    wrap.appendChild(bg);

    var i;
    for (i = 0; i < SLOT_COUNT; i++) {
      var slotEl = el('div', 'wtj-hud-slot is-empty');
      slotEl.style.left = SLOT_LEFT_PERCENTS[i] + '%';
      slotEl.setAttribute('data-slot-index', String(i));
      wrap.appendChild(slotEl);
      slotEls.push(slotEl);
    }
    return wrap;
  }

  function buildStatusLights() {
    var wrap = el('div', 'wtj-hud-lights');
    wrap.setAttribute('aria-hidden', 'true');

    var i;
    for (i = 0; i < STATUS_LIGHT_COUNT; i++) {
      var img = el('img', 'wtj-hud-light is-off');
      img.src = ASSET_BASE + 'working-status-light.png';
      img.alt = '';
      img.setAttribute('data-light-index', String(i));
      wrap.appendChild(img);
      lightEls.push(img);
    }
    return wrap;
  }

  function mount() {
    var root = el('div', 'wtj-hud-root');
    root.id = 'wtj-hud-root';
    root.appendChild(buildTopbar());
    root.appendChild(buildQuestion());
    root.appendChild(buildTray());
    root.appendChild(buildStatusLights());
    document.body.appendChild(root);
  }

  // -----------------------------------------------------------------------
  // debug 面板可见性开关（P1-2）：index.html 里的 #debug 叠层（key/mouse/fps/audio
  // 四行回显）默认通过 style.css 的 `display: none` 隐藏——默认画布验收要求右侧只有
  // 一个低调问号，回显面板默认可见会被判为"终端回显条"变体（REQ-SEC-01/REQ-TASK-01
  // 红线）。这里用 URLSearchParams（Safari 14 支持）读取 `?debug=1`，命中时给 #debug
  // 加上 .is-debug-visible 类恢复显示，供 008 等后续卡片调试用；不改 manifest.js。
  // -----------------------------------------------------------------------

  function applyDebugQueryFlag() {
    var params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (err) {
      console.warn('[WTJ_HUD] 解析 URL query 失败，debug 面板保持默认隐藏。', err);
      return;
    }
    if (params.get('debug') !== '1') {
      return;
    }
    var debugEl = document.getElementById('debug');
    if (debugEl) {
      debugEl.classList.add('is-debug-visible');
    }
  }

  // 脚本标签位于 body 末尾（见 index.html），此时 body 与前置元素已解析完毕，
  // 与 app.js 现有做法一致，无需等待 DOMContentLoaded。
  mount();
  applyDebugQueryFlag();

  // -----------------------------------------------------------------------
  // 对外 API：window.WTJ_HUD（冻结对象）
  // -----------------------------------------------------------------------

  function isValidIndex(index, count) {
    return typeof index === 'number' && index >= 0 && index < count && Math.floor(index) === index;
  }

  function setSlot(index, newState) {
    if (!isValidIndex(index, SLOT_COUNT)) {
      console.warn('[WTJ_HUD] setSlot: index 越界或非法（' + index + '），已忽略。');
      return;
    }
    if (newState === null || newState === undefined) {
      slots[index] = null;
      renderSlot(index);
      return;
    }
    if (typeof newState !== 'object') {
      console.warn('[WTJ_HUD] setSlot: state 参数非法（需为 null 或对象），已忽略。');
      return;
    }
    if (newState.milestone === true) {
      slots[index] = { milestone: true };
      renderSlot(index);
      return;
    }
    if (typeof newState.spriteUrl === 'string' && newState.spriteUrl) {
      slots[index] = { spriteUrl: newState.spriteUrl };
      renderSlot(index);
      return;
    }
    console.warn('[WTJ_HUD] setSlot: state 对象缺少合法的 spriteUrl 或 milestone 字段，已忽略。');
  }

  function clearSlots() {
    var i;
    for (i = 0; i < SLOT_COUNT; i++) {
      slots[i] = null;
      renderSlot(i);
    }
  }

  function setStatusLight(index, on) {
    if (!isValidIndex(index, STATUS_LIGHT_COUNT)) {
      console.warn('[WTJ_HUD] setStatusLight: index 越界或非法（' + index + '），已忽略。');
      return;
    }
    var boolOn = !!on;
    statusLights[index] = boolOn;
    var lightEl = lightEls[index];
    if (!lightEl) {
      return;
    }
    if (boolOn) {
      lightEl.classList.remove('is-off');
      lightEl.classList.add('is-on');
    } else {
      lightEl.classList.remove('is-on');
      lightEl.classList.add('is-off');
    }
  }

  function onQuestionClick(fn) {
    if (typeof fn !== 'function') {
      console.warn('[WTJ_HUD] onQuestionClick: 参数必须是函数，已忽略（保留原有回调）。');
      return;
    }
    questionClickHandler = fn;
  }

  function getState() {
    var slotsSnapshot = [];
    var i;
    for (i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (s === null) {
        slotsSnapshot.push(null);
      } else if (s.milestone === true) {
        slotsSnapshot.push({ milestone: true });
      } else {
        slotsSnapshot.push({ spriteUrl: s.spriteUrl });
      }
    }
    return {
      slotCount: SLOT_COUNT,
      slots: slotsSnapshot,
      statusLightCount: STATUS_LIGHT_COUNT,
      statusLights: statusLights.slice()
    };
  }

  window.WTJ_HUD = Object.freeze({
    setSlot: setSlot,
    clearSlots: clearSlots,
    setStatusLight: setStatusLight,
    onQuestionClick: onQuestionClick,
    getState: getState
  });
})();
