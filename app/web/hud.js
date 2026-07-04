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
//
// -----------------------------------------------------------------------
// WTJ-20260704-083（开发机验收反馈①②，槽数可配置 + footer 槽位 UI 不依赖单张固定槽图）
// -----------------------------------------------------------------------
// 007 首次交付时把 SLOT_COUNT 硬编码为字面量 5（"与 manifest.slots.count 镜像，非运行时
// 可配"），并用 five-slot-tray.png 这张按 5 个固定槽位构图出的底图 + 5 个硬编码的水平百分比
// （SLOT_LEFT_PERCENTS）渲染托盘——TL 初查以为 HUD 已经跟随 manifest 动态渲染，实际审计
// 发现并没有：manifest.slots.count 改成 3 后，若不改这里，HUD 仍会画出 5 个槽位点，且叠在
// 一张为 5 槽构图的底图上，视觉与实际游戏槽数不一致（验收②的缺陷本体）。
// 本卡改动：
//   1) getSlotCount()：与 getStatusLightCount() 同一模式，从 manifest.slots.count 动态读取
//      （防御默认值同步改为 3，镜像 manifest.js 新默认值）。
//   2) computeSlotLeftPercents(count)：不再是写死的 5 个数字，而是在 [SLOT_SPAN_MIN_PERCENT,
//      SLOT_SPAN_MAX_PERCENT]（沿用原 5 槽设计的 18%~82% 可用宽度）区间内按 count 均匀取点
//      （N=5 时退化为与原 [18,34,50,66,82] 完全相同的取值，不改变既有 5 槽视觉，纯粹的
//      泛化，无回归）。
//   3) resolveTrayBgFile(count)：five-slot-tray.png 是按 5 槽构图的最终视觉资产，槽数不是 5
//      时继续贴这张图会出现槽位圆点与底图凹槽错位。这里不臆造一张"3 槽底图"顶替最终资产
//      （避免把粗糙占位硬编码成最终交付），而是显式收窄映射表只覆盖 count=5 这一个已验收的
//      构图，其余槽数回退到 buildTrayBgFallback() 画的纯 CSS 占位胶囊（hud.css
//      .wtj-hud-tray-bg-fallback）。等 DESIGN 082 交付对应槽数的正式托盘美术后，只需要在
//      TRAY_BG_BY_COUNT 里补一行映射，不需要再改这里的渲染逻辑。
//
// -----------------------------------------------------------------------
// WTJ-20260704-083 返工（PM 打回，2026-07-04）：DESIGN 082 已验收，接入其 footer/chest 视觉
// 规范（docs/design/wtj-082-discovery-footer-sticker-system.md），替换掉上面①③留下的两处
// "非最终视觉"占位：
// -----------------------------------------------------------------------
//   a) footer 右侧**常驻**宝箱三态指示器（Disabled/Active/Open），与发现槽填充进度绑定——
//      不再是"宝箱视觉 deferred"。资产接入 manifest.rewards.chest.footerIndicator（见该文件
//      注释），只有 Disabled/Active 两张降采后的运行时图（app/web/assets/ui/chest-disabled.png
//      / chest-active.png）；Open 态不新画第三张图，直接复用既有 011（reward-chest.js）的
//      一次性开箱 Canvas 序列——本文件只在该序列播放期间把指示器切到 is-open 视觉（仍用
//      active 图 + 呼吸脉冲动画区分，见 hud.css `.wtj-hud-chest.is-open`），序列播完/reset
//      后指示器回落 Disabled。三态状态机与渲染集中在下方「footer 常驻宝箱指示器」一节，新增
//      对外 API `setChestOpen(isOpen)` 供 reward-chest.js 在序列开始/结束时调用（防御式，见
//      reward-chest.js 的 callHudSetChestOpenDefensive()）。
//   b) N 槽 footer 视觉从 buildTrayBgFallback() 的纯色占位胶囊，升级为 082 规则的可交付视觉：
//      Empty（暗色内芯 + 细蓝灰外圈）/ Filled（金色外圈 + 暖色发光 + sprite 缩略图占槽径
//      68%~76%）/ Ghost（count 配置为 4/5 时，超出 v1 主槽视觉上限——即索引 >= 3——的新增
//      槽位恒定渲染为低透暗色 + 低透加号，只表达"可扩展"，不参与真实空/满判定，见
//      MAIN_SLOT_VISUAL_LIMIT）。getSlotCount()/computeSlotLeftPercents(n) 两个既有动态布局
//      函数不变，只升级"背景/槽视觉"这一层渲染。

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

  var DEFAULT_SLOT_COUNT = 3; // 镜像 manifest.js 的 slots.count 默认值（WTJ-20260704-083 起默认 3）；两处需同步维护。

  function getSlotCount() {
    var manifest = window.WTJ_MANIFEST;
    if (
      manifest &&
      manifest.slots &&
      typeof manifest.slots.count === 'number' &&
      manifest.slots.count > 0
    ) {
      return manifest.slots.count;
    }
    console.warn('[WTJ_HUD] manifest.slots.count 未找到或非法，回退默认值 ' + DEFAULT_SLOT_COUNT + '。');
    return DEFAULT_SLOT_COUNT;
  }

  var SLOT_COUNT = getSlotCount(); // REQ-SLOT-01：发现槽数量按 manifest.slots.count 动态渲染 N 个（WTJ-20260704-083 起不再硬编码 5）。
  var STATUS_LIGHT_COUNT = getStatusLightCount();
  var ASSET_BASE = 'assets/ui/';

  // 槽位在托盘可用宽度内的水平取值区间（百分比，沿用 five-slot-tray.png 原 5 槽构图采样出的
  // 18%~82% 可用宽度，采样方法见 app/web/assets/PROVENANCE.md）。N 个槽位在这个区间内均匀
  // 分布；N=5 时与原硬编码的 [18, 34, 50, 66, 82] 完全一致（见 computeSlotLeftPercents()）。
  var SLOT_SPAN_MIN_PERCENT = 18;
  var SLOT_SPAN_MAX_PERCENT = 82;

  function computeSlotLeftPercents(count) {
    var percents = [];
    if (count <= 1) {
      percents.push((SLOT_SPAN_MIN_PERCENT + SLOT_SPAN_MAX_PERCENT) / 2);
      return percents;
    }
    var span = SLOT_SPAN_MAX_PERCENT - SLOT_SPAN_MIN_PERCENT;
    var step = span / (count - 1);
    var i;
    for (i = 0; i < count; i++) {
      percents.push(SLOT_SPAN_MIN_PERCENT + step * i);
    }
    return percents;
  }

  // five-slot-tray.png 是按 5 槽构图的已验收最终视觉资产（WTJ-20260704-005），只在
  // SLOT_COUNT 恰好为 5 时使用；其余槽数回退到 CSS 占位（见 buildTray() 与文件头「083」说明）。
  var TRAY_BG_BY_COUNT = {
    5: 'five-slot-tray.png'
  };

  function resolveTrayBgFile(count) {
    return Object.prototype.hasOwnProperty.call(TRAY_BG_BY_COUNT, count) ? TRAY_BG_BY_COUNT[count] : null;
  }

  // WTJ-20260704-083 返工：082 v1 边界——运行时只展示 3 个"主槽"的真实 Empty/Filled 视觉；
  // manifest.slots.count 配置为 4 或 5 时，索引 >= 本值的新增槽位恒定渲染为 Ghost（见
  // renderSlot()），不反映真实填充数据，只表达"可扩展"。这是纯展示层规则：内部 slots[] 状态、
  // fillSlot 委托、getState() 快照均不受影响，该索引依然可以被正常点亮/清空。
  var MAIN_SLOT_VISUAL_LIMIT = 3;

  // -----------------------------------------------------------------------
  // footer 常驻宝箱指示器：运行时资产路径解析（读 manifest.rewards.chest.footerIndicator，
  // 与 getSlotCount()/getStatusLightCount() 同一防御式回退模式）。
  // -----------------------------------------------------------------------
  var DEFAULT_CHEST_ASSETS = { disabled: 'chest-disabled.png', active: 'chest-active.png' };

  function getChestIndicatorAssets() {
    var manifest = window.WTJ_MANIFEST;
    var cfg = manifest && manifest.rewards && manifest.rewards.chest && manifest.rewards.chest.footerIndicator;
    if (
      cfg &&
      cfg.states &&
      typeof cfg.states.disabled === 'string' && cfg.states.disabled &&
      typeof cfg.states.active === 'string' && cfg.states.active
    ) {
      return { disabled: cfg.states.disabled, active: cfg.states.active };
    }
    console.warn('[WTJ_HUD] manifest.rewards.chest.footerIndicator.states 未找到或非法，回退默认宝箱资产文件名。');
    return DEFAULT_CHEST_ASSETS;
  }

  var CHEST_ASSETS = getChestIndicatorAssets();

  // -----------------------------------------------------------------------
  // 内部状态（不直接暴露给外部；外部只能通过 API 读写，getState() 返回快照而非引用）
  // -----------------------------------------------------------------------

  var slots = []; // index -> null | { spriteUrl: string } | { milestone: true }
  var statusLights = []; // index -> boolean
  var slotEls = [];
  var lightEls = [];
  var chestEl = null; // footer 常驻宝箱指示器 <img>（见 buildChestIndicator()）
  var chestState = 'disabled'; // 'disabled' | 'active' | 'open'（见「footer 常驻宝箱指示器」一节）
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

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    var key;
    for (key in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, key)) {
        node.setAttribute(key, attrs[key]);
      }
    }
    return node;
  }

  // QA 023 / WTJ-20260704-071：家长锁此前直接用 raw lock emoji 字符（U+1F512，通过
  // textContent 赋值），生产 UI 不接受 emoji 类素材做最终图标（跨平台字体渲染不一致、
  // 与 2.5D 暗色 HUD 美术风格不符）。改为内联 SVG 代码绘制挂锁（锁梁 U 形 path + 锁体
  // rect），单色描边、stroke 用 currentColor 跟随 .wtj-hud-lock 的文字色，透明度仍由
  // hud.css 的 opacity（沿用原 0.36 低干扰基线）控制，不依赖任何外部图标字体/库、
  // 不引入新依赖。
  function buildLockIcon() {
    var svg = svgEl('svg', {
      'class': 'wtj-hud-lock-icon',
      viewBox: '0 0 24 24',
      fill: 'none',
      'aria-hidden': 'true',
      focusable: 'false'
    });
    var shackle = svgEl('path', {
      d: 'M8 10V7.5a4 4 0 0 1 8 0V10',
      stroke: 'currentColor',
      'stroke-width': '1.6',
      'stroke-linecap': 'round'
    });
    var body = svgEl('rect', {
      x: '5.5',
      y: '10',
      width: '13',
      height: '9.5',
      rx: '1.8',
      stroke: 'currentColor',
      'stroke-width': '1.6'
    });
    svg.appendChild(shackle);
    svg.appendChild(body);
    return svg;
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
    lock.appendChild(buildLockIcon());
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

    // WTJ-20260704-083 返工（082 v1 边界）：超出主槽视觉上限的新增槽位（manifest.slots.count
    // 配置为 4/5 时的第 4/5 格）恒定渲染为 Ghost（低透暗色 + 低透加号），不反映 slots[index]
    // 的真实数据——082 doc 原文："运行时第一版只展示 3 个主槽；新增槽位先以 ghost slot 显示"。
    // 内部数据仍正常更新（getState() 快照不受影响），只是这个索引的视觉恒定是 Ghost，不参与
    // 正常的 Empty/Filled/Milestone 判定，避免 footer 变成"第二个游戏面板"抢中间画布注意力。
    if (index >= MAIN_SLOT_VISUAL_LIMIT) {
      slotEl.classList.add('is-ghost');
      var plus = el('span', 'wtj-hud-slot-ghost-plus');
      plus.setAttribute('aria-hidden', 'true');
      plus.textContent = '+';
      slotEl.appendChild(plus);
      return;
    }

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

    var bgFile = resolveTrayBgFile(SLOT_COUNT);
    if (bgFile) {
      // count===5：已验收的 five-slot-tray.png 构图路径，原样保留（不倒退）——加
      // --imaged 修饰类，供 hud.css 把槽位指示点尺寸锁定在这张已验收构图校准过的原始比例
      // （12%，见 hud.css），不受下面 --generic 分支的新槽径样式影响。
      wrap.classList.add('wtj-hud-tray-wrap--imaged');
      var bg = el('img', 'wtj-hud-tray-bg');
      bg.src = ASSET_BASE + bgFile;
      bg.alt = '';
      wrap.appendChild(bg);
    } else {
      // WTJ-20260704-083 返工（PM 打回②）：不再用纯色胶囊占位（旧 .wtj-hud-tray-bg-fallback，
      // PM 判定"粗糙占位"不可接受）。改用 DESIGN 082 规则的可交付 footer 背景条
      // （.wtj-hud-footer-bar：深蓝黑半透明 + 顶部低对比分界线，数值取自 082 doc「发现槽规则」
      // 布局一节），配合 --generic 修饰类把槽位指示点放大到接近 082 的桌面槽径目标
      // （82px~92px，见 hud.css `.wtj-hud-tray-wrap--generic .wtj-hud-slot`）。
      wrap.classList.add('wtj-hud-tray-wrap--generic');
      var bgBar = el('div', 'wtj-hud-footer-bar');
      wrap.appendChild(bgBar);
    }

    var percents = computeSlotLeftPercents(SLOT_COUNT);
    var i;
    for (i = 0; i < SLOT_COUNT; i++) {
      var slotEl = el('div', 'wtj-hud-slot');
      slotEl.style.left = percents[i] + '%';
      slotEl.setAttribute('data-slot-index', String(i));
      wrap.appendChild(slotEl);
      slotEls.push(slotEl);
      // WTJ-20260704-083 返工：初始视觉（Empty 或 Ghost，取决于 index 是否超出
      // MAIN_SLOT_VISUAL_LIMIT）统一交给 renderSlot() 决定，不在这里重复判断一遍 Ghost 逻辑。
      renderSlot(i);
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

  // -----------------------------------------------------------------------
  // footer 常驻宝箱指示器（WTJ-20260704-083 返工，PM 打回①）：与 011（reward-chest.js）的
  // 一次性开箱大奖励 Canvas 序列是两个独立的视觉——那个只在满槽瞬间短暂出现在屏幕中下方；
  // 本节这个是 footer 右侧 lane 里全程可见的小指示器，随发现槽填充进度在 Disabled/Active 间
  // 切换，并在 011 的开箱序列播放期间切到 Open（见对外 API setChestOpen()）。固定在 footer，
  // 与中心秘密词命中图（secretword.css .wtj-secret-sprite，top:50% 屏幕正中心）不重叠——见
  // hud.css `.wtj-hud-chest-lane` 的 bottom 定位；与槽位组保持 >= 20px 视觉间距（082 规则），
  // 见该规则 CSS 注释。
  // -----------------------------------------------------------------------

  function buildChestIndicator() {
    var wrap = el('div', 'wtj-hud-chest-lane');
    wrap.setAttribute('aria-hidden', 'true');

    var img = el('img', 'wtj-hud-chest is-disabled');
    img.src = ASSET_BASE + CHEST_ASSETS.disabled;
    img.alt = '';
    wrap.appendChild(img);
    chestEl = img;

    return wrap;
  }

  // 内部数据层的"是否全部填满"判定——与 010（slots.js）判定满槽的语义一致（本文件的 slots[]
  // 正是 010 fillSlot() 委托调用 setSlot() 之后落地的渲染层数据，两者天然同步，不需要另外
  // 订阅 window.WTJ_SLOTS.onFull/getState()）。Ghost 槽（index >= MAIN_SLOT_VISUAL_LIMIT）
  // 视觉上不显示填充状态，但仍计入这里的"是否全部填满"判断——因为 010 侧这些索引依然是真实
  // 需要被点亮才能触发 onFull 的功能槽位，只是 v1 展示层选择不展示它们的填充细节（见
  // MAIN_SLOT_VISUAL_LIMIT 顶部说明）。
  function isAllSlotsFilled() {
    if (SLOT_COUNT <= 0) {
      return false;
    }
    var i;
    for (i = 0; i < SLOT_COUNT; i++) {
      if (slots[i] === null) {
        return false;
      }
    }
    return true;
  }

  function renderChest() {
    if (!chestEl) {
      return;
    }
    chestEl.className = 'wtj-hud-chest is-' + chestState;
    // 082 明确"打开态不是第三张静态图"：Open 态复用 Active 的 chest-active.png，视觉区分
    // 完全交给 hud.css 的 .wtj-hud-chest.is-open（呼吸脉冲动画 + 更强发光），不新增图片资产。
    chestEl.src = ASSET_BASE + (chestState === 'disabled' ? CHEST_ASSETS.disabled : CHEST_ASSETS.active);
  }

  // 填槽/清槽引起的状态机推导：只在当前不处于 Open 态时才由填充进度自动决定 Disabled/Active——
  // Open 态由 011（reward-chest.js）通过 setChestOpen(true) 显式接管，这里不应该被"某次
  // setSlot 调用"意外打断（正常闭环里，五槽满 -> 011 onFull 处理器同步调用 setChestOpen(true)
  // 之后，不会再有新的 setSlot 调用发生，直到 reset()/clearSlots() 到来，届时会强制回落
  // Disabled，见 clearSlots()）。
  function updateChestStateFromFill() {
    if (chestState === 'open') {
      return;
    }
    chestState = isAllSlotsFilled() ? 'active' : 'disabled';
    renderChest();
  }

  // 对外 API：011（reward-chest.js）在其一次性开箱 Canvas 序列开始/结束时调用（防御式，见
  // reward-chest.js 的 callHudSetChestOpenDefensive()）。isOpen=true 时无条件切到 Open；
  // isOpen=false 时按"当前实际填槽情况"回落到 Active 或 Disabled（不是恒定回落 Disabled——
  // 覆盖"序列被 reset() 提前中止、槽位尚未被清空"这类极端时序，此时应该回到 Active 而不是
  // 误吞成 Disabled）。正常自然播完的闭环里，紧随其后的 WTJ_SLOTS.reset() 会级联触发本文件
  // 的 clearSlots()，无条件把指示器强制回落 Disabled（见该函数），两者共同保证"序列结束后
  // 指示器回 Disabled"这条验收要求。
  function setChestOpen(isOpen) {
    if (isOpen) {
      chestState = 'open';
      renderChest();
      return;
    }
    chestState = isAllSlotsFilled() ? 'active' : 'disabled';
    renderChest();
  }

  function mount() {
    var root = el('div', 'wtj-hud-root');
    root.id = 'wtj-hud-root';
    root.appendChild(buildTopbar());
    root.appendChild(buildQuestion());
    root.appendChild(buildTray());
    root.appendChild(buildStatusLights());
    root.appendChild(buildChestIndicator());
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
      updateChestStateFromFill(); // WTJ-20260704-083 返工：填/清一个槽都可能改变"是否已全部填满"
      return;
    }
    if (typeof newState !== 'object') {
      console.warn('[WTJ_HUD] setSlot: state 参数非法（需为 null 或对象），已忽略。');
      return;
    }
    if (newState.milestone === true) {
      slots[index] = { milestone: true };
      renderSlot(index);
      updateChestStateFromFill();
      return;
    }
    if (typeof newState.spriteUrl === 'string' && newState.spriteUrl) {
      slots[index] = { spriteUrl: newState.spriteUrl };
      renderSlot(index);
      updateChestStateFromFill();
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
    // WTJ-20260704-083 返工：清槽 = 开新一轮，footer 常驻宝箱指示器无条件强制回落 Disabled——
    // 不管清空之前是不是处于 Open（011 自然播完时序上先 setChestOpen(false) 再级联到这里，
    // 这里的强制回落是双保险，覆盖任何调用顺序）。
    chestState = 'disabled';
    renderChest();
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
      statusLights: statusLights.slice(),
      chestState: chestState // WTJ-20260704-083 返工：footer 常驻宝箱指示器当前三态，供 QA 断言
    };
  }

  window.WTJ_HUD = Object.freeze({
    setSlot: setSlot,
    clearSlots: clearSlots,
    setStatusLight: setStatusLight,
    onQuestionClick: onQuestionClick,
    setChestOpen: setChestOpen, // WTJ-20260704-083 返工：011（reward-chest.js）开箱序列开始/结束时调用
    getState: getState
  });
})();
