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
//
// -----------------------------------------------------------------------
// WTJ-20260705-019（视觉整装：把 001 的 footer/terminal 装饰接入 stage，阻断"设计稿存在但
// 运行版未接入"回归）。086 交付的 `.wtj-hud-footer-bar` 只是 tray-wrap 内一小块居中胶囊，
// 不满足验收①"从左到右全宽底栏/工作台区"。001 在两个独立分支上先返工出了正确视觉——
// tl/chest-footer-001（Phase A：全宽 footer 容器 + 宝箱移到 footer 右侧不居中）与
// tl/terminal-prompt-001b（Phase B：左下 `>_` terminal 装饰条，按 DESIGN 011 已验收规范
// docs/design/wtj-20260705-011-terminal-prompt-decoration-spec.md）——但那两个分支的 base
// 早于 stage（分叉自 9a455e6，缺 010/015/017 等后续卡），不能直接整分支合并，本卡把两边的
// 视觉/交互逻辑定向搬到 stage 的 hud.js/hud.css 上：
//   1) mount()：新增 `.wtj-hud-footer` 容器包住 buildTray()/buildChestIndicator()（Phase A），
//      两者的 CSS 定位从各自独立的 position:fixed 改为相对这个新父级的 position:absolute——
//      父容器本身 left:0/right:0/bottom:0/width:100%，是真正贴视口边到边的全宽底栏（见
//      hud.css `.wtj-hud-footer`），而不是此前 007/083/086 那种局部宽度的胶囊。
//   2) mount()：新增 buildTerminalPrompt()（Phase B），左下角纯装饰 `.wtj-hud-terminal`——
//      可见内容恒定只有 `>_`（arrow+cursor 两个静态文本节点）+ 一个不带文本的 activity pip，
//      不是输入框、不做任何按键/秘密词/用户名/路径/命令回显（诚实边界见该函数注释）。与
//      `.wtj-hud-lights` 同级挂在 root 下，不嵌套进 footer（footer 满槽后 111 宝箱一次性开箱
//      序列可能短暂遮挡右侧，terminal 是独立于 footer 内容变化的左下 status lane，位置不受
//      影响）。
//   3) wireTerminalKeyActivity()：订阅 keyboard.js 的 window.WTJ_KEYBOARD.onEffectiveKey（若
//      存在——可选依赖，未加载不报错），触发一次 140ms 边框微亮，只传一个累计计数数字，从不
//      回显具体按下的字符。
// reward-chest.js 的一次性开箱大奖励序列（此前居中弹出，与画布中央跳出的字母/秘密词物体
// 抢镜，验收④"不在画布正中遮挡跳出物体"不达标）同一批一起挪到 footer 右侧，与本文件的常驻
// 宝箱指示器共用同一组锚点数值——改动见 reward-chest.css/reward-chest.js 顶部对应注释。
// -----------------------------------------------------------------------

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
  // WTJ-20260705-008：键盘里程碑发现槽贴纸。里程碑点亮一个发现槽时（renderState.milestone===true，
  // 来自 008 keyboard.js → 010 slots.js），槽内渲染 DESIGN-007 交付的键盘 medallion 贴纸
  // （keyboard-star.png），替换早期的 ★ Unicode 星字占位（production-asset-quality rule 12：真实
  // 产品视觉必须达质量线，不留字符占位）。路径从 manifest.slots.milestoneStickerSprite 读取
  // （config 驱动，不硬编码文件名），与 getChestIndicatorAssets()/getSlotCount() 同一防御式回退
  // 模式；manifest 缺该字段时回退到 CSS 星形兜底（见 renderSlot()），保证不出现空槽。
  // -----------------------------------------------------------------------
  function getMilestoneStickerSprite() {
    var manifest = window.WTJ_MANIFEST;
    var v = manifest && manifest.slots && manifest.slots.milestoneStickerSprite;
    if (typeof v === 'string' && v) {
      return v;
    }
    console.warn('[WTJ_HUD] manifest.slots.milestoneStickerSprite 未找到或非法，里程碑槽回退到 CSS 星形占位。');
    return null;
  }

  var MILESTONE_STICKER_SPRITE = getMilestoneStickerSprite();

  // -----------------------------------------------------------------------
  // 内部状态（不直接暴露给外部；外部只能通过 API 读写，getState() 返回快照而非引用）
  // -----------------------------------------------------------------------

  var slots = []; // index -> null | { spriteUrl: string } | { milestone: true }
  var statusLights = []; // index -> boolean
  var slotEls = [];
  var lightEls = [];
  var chestEl = null; // footer 常驻宝箱指示器 <img>（见 buildChestIndicator()）
  var chestState = 'disabled'; // 'disabled' | 'active' | 'open'（见「footer 常驻宝箱指示器」一节）
  var terminalEl = null; // WTJ-20260705-019（移植 001 Phase B）：左下角 terminal prompt 装饰条根节点
  var terminalKeyPulseTimer = null; // pulseTerminalKeyActivity() 的一次性 140ms 定时器句柄
  var terminalWordEl = null; // WTJ-20260705-019b：秘密词完成态展示区根节点（.wtj-hud-terminal-word）
  var terminalWordClearTimer = null; // showTerminalSecretWord() 的一次性展示窗口定时器句柄
  var questionClickHandler = function () {
    console.log('[WTJ_HUD] question mark clicked（默认占位回调，尚未被后续卡片接管）。');
  };

  // -----------------------------------------------------------------------
  // WTJ-20260705-019b：可注入时钟（默认真实 setTimeout/clearTimeout；测试用 _setClock 整体或
  // 部分替换），与 task.js/pointer.js/task-templates.js/status-rewards.js 的 _setClock 同款
  // 模式。terminal 的两个一次性展示窗口（140ms 按键活跃微亮 / 秘密词完成态拼写展示）都改走
  // clockRef，供单测用假时钟 advance(ms) 快进虚拟时间断言"展示后会自动清空"，不需要真的等待。
  // 注意：hud.js 顶层执行时立即调用的 wireTerminalSecretWordDeferred() 里那个跨脚本加载顺序
  // 用的 setTimeout(fn, 0)（diag.js 同款宏任务延后手法）不走这条 clockRef——那是一次性的模块
  // 加载时序基础设施，不是"用户可见的展示时长"，测试只需要真的等一次 0ms 宏任务，不需要快进。
  // -----------------------------------------------------------------------
  var clockRef = {
    setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimeout: function (id) { clearTimeout(id); }
  };

  function _setClock(clock) {
    if (!clock || typeof clock !== 'object') {
      console.warn('[WTJ_HUD] _setClock: 参数必须是对象，已忽略。');
      return;
    }
    if (typeof clock.setTimeout === 'function') {
      clockRef.setTimeout = clock.setTimeout;
    }
    if (typeof clock.clearTimeout === 'function') {
      clockRef.clearTimeout = clock.clearTimeout;
    }
  }

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

  // WTJ-20260705-019b（Ethan 截图反馈①，双语标题居中 + 英文字体更接近参考图）：单行
  // "Work Time, Justin! / 小小工作台" 拆成两个独立文本节点——英文主标题 + 中文副标题各自一个
  // <span>，方便 hud.css 对二者分别应用不同字体栈/字号/字重（英文换成参考图同款的 ui-rounded/
  // SF Pro Rounded 圆体优先栈 + weight 900，中文降一档做真正的副标题层级）。整个标题组
  // （.wtj-hud-title-group）配合 hud.css 把 .wtj-hud-topbar 的 justify-content 从
  // space-between 改成 center，实现真正的水平居中（锁形 glyph 改用 position:absolute 钉住
  // 右侧，不再占用 flex 布局空间，见 hud.css 对应注释）。
  function buildTopbar() {
    var bar = el('div', 'wtj-hud-topbar');
    bar.setAttribute('aria-hidden', 'true');

    var titleGroup = el('div', 'wtj-hud-title-group');

    var titleEn = el('span', 'wtj-hud-title-en');
    titleEn.textContent = 'Work Time, Justin!';
    titleGroup.appendChild(titleEn);

    var titleZh = el('span', 'wtj-hud-title-zh');
    titleZh.textContent = '小小工作台';
    titleGroup.appendChild(titleZh);

    bar.appendChild(titleGroup);

    var lock = el('span', 'wtj-hud-lock');
    // 当前无 pointer-events，title 提示暂不会在悬停时出现；实际长按判定与是否开放
    // pointer-events 由后续卡片接管，见 hud.css 顶部注释与 MANIFEST.md。
    // WTJ-20260705-018：家长入口主通道由 Esc 改为 Cmd+Q 长按（隐藏家长菜单，内含
    // 退出/设置/重置今日额度）；Esc 长按 5 秒 + 口令退出保留为兜底通道，未删除。
    lock.title = '长按 Cmd+Q 5 秒打开家长菜单（Esc 长按仍可作为退出兜底）';
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
      // WTJ-20260705-008：里程碑槽内渲染 DESIGN-007 键盘贴纸（keyboard-star medallion），复用
      // .wtj-hud-slot-sprite 的尺寸/发光基样式（与 secret-word 命中缩略图同等对待，见 hud.css
      // 注释），并额外挂 .wtj-hud-slot-milestone-sprite 供 milestone 专属尺寸微调。REQ-SLOT-04
      // 「键盘里程碑显示为抽象键盘星星图标」由这张真实素材落地，取代早期的 ★ Unicode 字符占位。
      if (MILESTONE_STICKER_SPRITE) {
        var mimg = el('img', 'wtj-hud-slot-sprite wtj-hud-slot-milestone-sprite');
        mimg.src = MILESTONE_STICKER_SPRITE; // 已是 app/web/ 相对完整路径（assets/discovery-icons/...）
        mimg.alt = '';
        slotEl.appendChild(mimg);
        return;
      }
      // 防御式兜底：manifest 缺 milestoneStickerSprite 时退回 CSS 星形，不留空槽（不会走到
      // 生产路径——真实 manifest 恒有该字段；这里只是缺配置时的降级）。
      var star = el('span', 'wtj-hud-slot-star');
      star.setAttribute('aria-hidden', 'true');
      star.textContent = '★';
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
      // WTJ-20260707-011 验收反馈①：非 count===5 的默认（3 槽）路径不再画横向背景条。Ethan
      // 反馈底部发现卡槽的横向长条背景（旧 .wtj-hud-footer-bar 圆角面板）观感不佳，要求改成参考
      // 图二 keyboard-hint-preview 的三个独立圆圈（无长条底、间距更紧凑居中）。故这里删掉
      // .wtj-hud-footer-bar 节点，只保留 --generic 修饰类（仍供 hud.css 锁定槽径样式与容器几何，
      // 宽度已在 hud.css `.wtj-hud-tray-wrap--generic` 收窄以紧凑居中三圆圈）。槽位圆圈本身的
      // Empty 视觉（.wtj-hud-slot.is-empty::after）不变，本就与参考图二一致。
      wrap.classList.add('wtj-hud-tray-wrap--generic');
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

  // -----------------------------------------------------------------------
  // WTJ-20260705-019（移植 001 Phase B）：左下角 terminal prompt 装饰条——纯状态装饰，不是
  // 输入框，不做逐键回显。原始规范：docs/design/wtj-20260705-011-terminal-prompt-decoration-
  // spec.md（DESIGN 011，PM 已验收），当时只允许 `>_` 两字符 + 一个 activity pip。
  //
  // WTJ-20260705-019b（Ethan 截图反馈③，显式推翻 011 的"禁止 justin@worktime / 禁止秘密词"
  // 两条）：DOM 结构改为四个子节点：
  //   prefix「justin@worktime:」 —— 恒定文本，永不改变，不含任何真实用户名/路径/命令。
  //   word「」/「dog」等         —— idle 为空字符串；仅在 window.WTJ_SECRET.onHit（秘密词
  //                                完整拼出的"完成态"事件，不是逐键回显）触发时短暂写入命中
  //                                词文本，与 secretword.js 的 sprite 一次性叠层同步出现，
  //                                展示窗口结束后清空回空字符串（见 showTerminalSecretWord()）。
  //   cursor「_」                —— 恒定字符，只做 CSS opacity 呼吸动画，不是真实输入光标。
  //   pip                        —— 纯装饰 activity 圆点，无文本。
  // 仍然坚持的红线：不建输入框/textarea/contenteditable；word 节点只在"一个词已完整拼出"的
  // 完成事件里被整体写入/清空，绝不逐字符增量拼接（不是回显每次按键）。
  // -----------------------------------------------------------------------

  function buildTerminalPrompt() {
    var wrap = el('div', 'wtj-hud-terminal');
    wrap.setAttribute('aria-hidden', 'true');

    var glyph = el('span', 'wtj-hud-terminal-glyph');

    var prefix = el('span', 'wtj-hud-terminal-prefix');
    prefix.textContent = 'justin@worktime:'; // 静态字符串，永不改变，不含真实用户名/路径
    glyph.appendChild(prefix);

    var word = el('span', 'wtj-hud-terminal-word');
    word.textContent = ''; // idle 为空；showTerminalSecretWord() 在秘密词完成时短暂写入
    glyph.appendChild(word);
    terminalWordEl = word;

    var cursor = el('span', 'wtj-hud-terminal-cursor');
    cursor.textContent = '_'; // 静态字符（CSS 动画只改 opacity 做呼吸闪烁，不改文本，不是真实输入光标）
    glyph.appendChild(cursor);

    wrap.appendChild(glyph);

    var pip = el('span', 'wtj-hud-terminal-pip');
    // activity pip：纯装饰小圆点，没有 textContent，视觉完全交给 hud.css 的背景色 + 透明度。
    wrap.appendChild(pip);

    terminalEl = wrap;
    return wrap;
  }

  // 任意"有效键盘反馈"（window.WTJ_KEYBOARD.onEffectiveKey，只回传累计计数——一个数字，从不
  // 携带具体按下的字符）出现时，装饰条只做一次 140ms 的边框/背景微亮（切一个纯样式 class），
  // 不改变前缀/光标文本、不新增任何文本节点。
  var TERMINAL_KEY_PULSE_MS = 140; // 对齐 DESIGN 011 tokens.motion.keyActivityPulseMs

  function pulseTerminalKeyActivity() {
    if (!terminalEl) {
      return;
    }
    terminalEl.classList.add('is-key-pulse');
    if (terminalKeyPulseTimer) {
      clockRef.clearTimeout(terminalKeyPulseTimer);
    }
    terminalKeyPulseTimer = clockRef.setTimeout(function () {
      terminalEl.classList.remove('is-key-pulse');
      terminalKeyPulseTimer = null;
    }, TERMINAL_KEY_PULSE_MS);
  }

  // ---------------------------------------------------------------------
  // WTJ-20260705-019b（Ethan 截图反馈③）：秘密词完成态展示——word 素材来自
  // window.WTJ_SECRET.onHit(payload)（payload.word，见 secretword.js handleHit()）。该回调
  // 与 secretword.js 的 sprite 一次性叠层出现（showSpriteOverlay）在同一次同步的 handleHit()
  // 调用里触发，因此 terminal 文本与 sprite 天然"同步出现"，不需要额外的时间戳协调。
  // TERMINAL_WORD_DISPLAY_MS 与 secretword.js 内部的 SPRITE_TOTAL_MS（sprite 叠层总展示时长）
  // 数值上呼应，让两者在同一时间量级淡出——两个常量刻意保持独立（不做跨文件耦合读取），只是
  // 数值上对齐，避免"词已经消失但小狗贴纸还在"或反过来的观感割裂。
  // ---------------------------------------------------------------------
  var TERMINAL_WORD_DISPLAY_MS = 1900; // 呼应 secretword.js SPRITE_TOTAL_MS

  function showTerminalSecretWord(word) {
    if (!terminalWordEl || typeof word !== 'string' || !word) {
      return;
    }
    terminalWordEl.textContent = word;
    terminalWordEl.classList.remove('is-visible'); // 先移除再加：连续快速命中时让 pop 动画重新播放一次
    terminalWordEl.classList.add('is-visible');
    if (terminalEl) {
      terminalEl.classList.add('is-word-pulse');
    }
    if (terminalWordClearTimer) {
      clockRef.clearTimeout(terminalWordClearTimer);
    }
    terminalWordClearTimer = clockRef.setTimeout(function () {
      terminalWordEl.textContent = '';
      terminalWordEl.classList.remove('is-visible');
      if (terminalEl) {
        terminalEl.classList.remove('is-word-pulse');
      }
      terminalWordClearTimer = null;
    }, TERMINAL_WORD_DISPLAY_MS);
  }

  // secretword.js 在 index.html 里加载顺序晚于本文件（见该文件顶部注释："放在 hud.js 之后
  // 确保命中时 WTJ_HUD.setSlot 已就绪"）——本文件反过来要订阅它暴露的
  // window.WTJ_SECRET.onHit，若在本文件顶层同步执行时立即读取会读到 undefined。复用 diag.js
  // 已确立的 setTimeout(fn, 0) 宏任务延后手法（见该文件顶部"语法基线与加载位置"一节）：
  // 浏览器按文档顺序同步加载/执行非 async/defer 的 <script src>，0ms 宏任务触发时其后所有
  // 同步脚本（含 secretword.js）必已执行完毕。try/catch 防御 setTimeout 在极端沙箱环境
  // （如本文件的 Node vm 单测）里未定义的情况——与 secretword.js scheduleRemoval() 同款写法。
  function wireTerminalSecretWordDeferred() {
    try {
      setTimeout(function () {
        if (window.WTJ_SECRET && typeof window.WTJ_SECRET.onHit === 'function') {
          window.WTJ_SECRET.onHit(function (payload) {
            try {
              showTerminalSecretWord(payload && payload.word);
            } catch (err) {
              console.error('[WTJ_HUD] showTerminalSecretWord 执行异常，已捕获：', err);
            }
          });
        } else {
          console.warn('[WTJ_HUD] window.WTJ_SECRET.onHit 不可用（secretword.js 未加载或加载失败），terminal 秘密词拼写展示降级为不可用（不影响 sprite/音效等其它反馈）。');
        }
      }, 0);
    } catch (err) {
      console.warn('[WTJ_HUD] 延后订阅 window.WTJ_SECRET.onHit 失败（setTimeout 不可用），已捕获：', err);
    }
  }

  // keyboard.js 是可选依赖（与该文件里 window.WTJ_SLOTS 的可选接入方式一致）：未加载时静默跳过，
  // 不 console.warn——装饰条没有键盘反馈也能正常显示 Idle 态，不是功能性缺陷。
  function wireTerminalKeyActivity() {
    if (window.WTJ_KEYBOARD && typeof window.WTJ_KEYBOARD.onEffectiveKey === 'function') {
      window.WTJ_KEYBOARD.onEffectiveKey(function () {
        try {
          pulseTerminalKeyActivity();
        } catch (err) {
          console.error('[WTJ_HUD] pulseTerminalKeyActivity 执行异常，已捕获：', err);
        }
      });
    }
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

  // WTJ-20260705-019（移植 001 Phase A，req1/req3，全宽 footer 底栏，最小 diff 路径）：把
  // 发现槽托盘（buildTray()）与常驻宝箱指示器（buildChestIndicator()）的输出包进一个新的
  // `.wtj-hud-footer` 父容器，而不是像此前那样各自直接挂在 `#wtj-hud-root` 下——这个父容器
  // 才是"横跨屏幕全宽的底部栏"这个视觉本体（见 hud.css `.wtj-hud-footer`：position:fixed；
  // left:0；right:0；bottom:0；width:100%），槽位托盘与宝箱指示器各自的 position 相应从
  // fixed 改为 absolute，定位坐标系从"视口"变为"这个 footer"——两者数值不变（footer 本身
  // left:0/right:0/bottom:0，与视口边缘重合，所以子元素的 right/bottom 偏移量换算出来的屏幕
  // 位置与之前完全一致，纯粹是"挂在哪个容器下"的结构调整，不是视觉改动）。
  // 状态灯（buildStatusLights()）与新增的左下角 terminal 装饰条（buildTerminalPrompt()）不在
  // 这层 footer 容器范围内，继续直接挂在 root 下——两者都是独立于 footer 内容变化（满槽/宝箱
  // 开箱）的左下角固定元素，见 buildTerminalPrompt() 顶部注释。
  function mount() {
    var root = el('div', 'wtj-hud-root');
    root.id = 'wtj-hud-root';
    root.appendChild(buildTopbar());
    root.appendChild(buildQuestion());

    var footer = el('div', 'wtj-hud-footer');
    footer.setAttribute('aria-hidden', 'true');
    footer.appendChild(buildTray());
    footer.appendChild(buildChestIndicator());
    root.appendChild(footer);

    root.appendChild(buildStatusLights());
    root.appendChild(buildTerminalPrompt());
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
  wireTerminalKeyActivity(); // WTJ-20260705-019（移植 001 Phase B）：可选接入 keyboard.js 的 onEffectiveKey 节奏信号
  wireTerminalSecretWordDeferred(); // WTJ-20260705-019b：延后订阅 secretword.js 的 onHit，展示秘密词完成态拼写

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
    getState: getState,
    _setClock: _setClock // WTJ-20260705-019b：测试专用，注入假时钟以快进 terminal 两个一次性展示窗口
  });
})();
