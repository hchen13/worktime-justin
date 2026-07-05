// WTJ-20260704-015 — 工作状态灯「今日工作完成」连续奖励（window.WTJ_STATUS_REWARDS）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function 声明式，不用箭头函数 / let /
// const / 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求（不 fetch 任何东西，不访问任何
// 外部 URL）、非 module（无 import/export），以普通 <script src="status-rewards.js"> 标签
// 加载，需排在 014（task-templates.js）之后——本文件订阅它暴露的 onTaskComplete 事件。也需要
// manifest.js（读 rewards.statusLights / rewards.completionStamp 配置）之后加载；与 hud.js /
// audio.js 的加载顺序无强依赖（三者调用均走下方防御式包装，缺失时优雅降级为
// console.warn/console.error，不阻断）。
//
// -----------------------------------------------------------------------
// 职责边界（本卡 015，消费 014 的 onTaskComplete 事件，落地 REQ-RWD-04~06 的「连续奖励」半）
// -----------------------------------------------------------------------
// 014（task-templates.js）在每一次具体任务判定完成时，已经防御式调用了一次
// WTJ_HUD.setStatusLight(index, true) 点亮一个状态灯——这是 REQ-RWD-04「完成一个任务点亮一个
// 状态灯」的最小落地，本文件**不重复**这一步，也不再自己去点亮"这一次任务"对应的那一个灯。
// 本文件订阅 014 暴露的 onTaskComplete(fn)（fn 收到 { type, taskId, lightIndex }），每次收到
// 回调即代表"又有一个具体任务被判定完成"，本文件只关心这个事实本身，不关心 lightIndex 具体是
// 哪一个灯，用一个独立的 streak 计数器累计"连续完成了几个任务"。streak 达到
// manifest.rewards.statusLights.streakThreshold（默认 3）即触发 REQ-RWD-05「今日工作完成」奖励：
// 三个状态灯一起闪（REQ-RWD-06 的 lights-flash-together 表现形式，通过反复调用
// WTJ_HUD.setStatusLight 实现快闪，不新增 HUD 内部状态/样式）+ 一次性大奖励视觉叠层
// （WTJ-20260705-010：completion-stamp-v3 素材一次性 pop/scale/fade，对应 desk-stamp 表现
// 形式，见下方「WTJ-20260705-010」一节）+ 防御式播放奖励音效，随后清空叠层、熄灭三个状态灯、
// streak 归零，进入下一轮「工作」。
//
// 与 014 的协调说明（据实记录，供 PM/QA 核对）：014 的状态灯点亮顺序（statusLightIndex，
// 0→1→2→0→…循环）与本文件的 streak 计数器是两个完全独立的计数——manifest 当前配置下
// count===streakThreshold===3，因此"正常情况"下第 3 个任务完成时三个灯确实都已经被 014 点亮为
// on，本文件触发的三灯连闪视觉上是"在三个已经点亮的灯上面快闪"，效果自然；但这只是两个独立计数
// 器在当前配置下恰好同步，不是本文件对 014 状态的强依赖或断言——即使未来 count 与
// streakThreshold 配置成不同的数字，本文件的 streak 逻辑依然正确（连续第 N 个任务完成触发奖励），
// 只是"三灯是否恰好全亮"这一视觉细节会与当前不同，不影响 REQ-RWD-05 本身的判定。此外，本文件在
// 奖励播放结束后调用 WTJ_HUD.setStatusLight(i, false) 熄灭三个灯，这不会覆盖或扰乱 014 自己内部
// 的 statusLightIndex 轮转指针——014 完全不知道本文件的存在，下一次任务完成时依然按它自己的轮转
// 顺序点亮下一个灯，可能出现"本文件刚熄灭的灯，很快又被 014 按自己的顺序重新点亮"这种正常的、
// 预期内的交错，不是 bug。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_STATUS_REWARDS，Object.freeze 冻结 + 绑定加固）
// -----------------------------------------------------------------------
//   onWorkComplete(fn)   订阅"今日工作完成"奖励触发事件，fn({ streak, streakThreshold, forms,
//                        reducedMotion, ts })。多订阅 + 逐个 try/catch 隔离（与 013/012/014
//                        同款模式）。
//   getStreak()          返回当前连续完成计数快照（QA 用；奖励播放完成后归零）。
//   reset()              外部重置入口（如家长退出 / 新会话）：立即中止任何进行中的奖励播放、
//                        清空叠层、熄灭状态灯、streak 归零。
//   getState()           返回完整快照 { streak, streakThreshold, celebrating, lightCount,
//                        configuredForms, implementedForms }，供 QA 断言。
//   _setClock(clock)     测试专用（与 task.js/pointer.js/task-templates.js 同款模式），供
//                        单测把三灯连闪与一次性大奖励叠层的可见窗口快进掉，不是给其余生产代码
//                        调用的稳定契约。
//
// WTJ-20260705-015（任务成功即时视觉反馈 + 三灯 cheer/yay 音效加强，详见「三、任务成功即时
// 视觉反馈」一节代码前的大段说明）：Ethan 现场反馈 press 类任务完成时只有小提示音 + 状态灯，
// 缺视觉成功反馈。本卡新增第三路——每次 014 判定一个具体任务完成都触发一个短促（~450ms）的
// canvas sparkle burst + 成功环，复用 002（sparkles.js）的共享绘制层；三灯「今日工作完成」的
// streak-reward-fanfare 音效同步加强为合成琶音 + 真实人群欢呼采样分层混音（音频文件本身的
// 修订，见 audio/SOURCE-LICENSES.md，本文件调用点未变）。
//
// -----------------------------------------------------------------------
// REQ-RWD-04~06 逐条落地位置索引（供 PM/QA 对照）：
//   REQ-RWD-04（完成一个任务点亮一个灯）：由 014 落地，本文件不重复，仅在文件头注释与
//               「与 014 的协调说明」一节确认边界。
//   REQ-RWD-05（连续 3 个任务触发今日工作完成）：handleTaskComplete() 累计 streak，达到
//               getStreakThreshold() 时调用 triggerWorkComplete()。
//   REQ-RWD-06（奖励表现：三灯连闪 / 盖章 / 小火箭 / 宝箱小开一次）：本文件实现
//               'lights-flash-together'（flashLightsSequence()）+ 'desk-stamp'
//               （showRewardOverlay() 渲染的 completion-stamp-v3 一次性 pop/scale/fade 素材，
//               WTJ-20260705-010 接入，替换此前的 mini-rocket-launch 纯 CSS 小火箭占位）
//               两种组合表现，IMPLEMENTED_FORMS 常量声明实际落地的表现形式子集。
// -----------------------------------------------------------------------
//
// WTJ-20260705-010（接入 completion-stamp-v3，替换粗糙火箭/星星占位）：
// DESIGN 交付目录 docs/assets/design-expansion-v2/work-complete-reward/completion-stamp-v3/
// 实际只有 source/completion-stamp-cutout.png 这 1 张已抠像静态图（RGBA，四角透明），没有
// manifest.json / sheet / frames 序列 / preview gif（与卡片原文列出的资产清单有出入，据实记录
// 于 app/web/assets/rewards/PROVENANCE.md）。因此本卡不走 frame-anim.js 多帧 sheet 管线，改用
// 纯 CSS 一次性 pop/scale/fade（status-rewards.css 的 .wtj-sr-stamp / @keyframes
// wtj-sr-stamp-pop）：淡入放大 → 短暂停留 → 淡出，约 1.8s（与此前 mini-rocket-launch 同一
// 展示时长量级），由 showRewardOverlay() 里同一个 clockRef.setTimeout(...OVERLAY_TOTAL_MS)
// 统一调度移除，JS 侧调度逻辑完全不变，只是叠层内容从"CSS 小火箭 + sparkle-burst.png +
// star-sticker.png 三个元素"换成"completion-stamp-v3.png 一个元素"。素材路径读取见
// resolveCompletionStampPath()，config 驱动（manifest.rewards.completionStamp.sprite），不
// 硬编码 docs/ 设计目录路径；缺配置时回退到与 manifest 里相同的默认 runtime 相对路径（不同于
// keyboardMilestone 缺配置时选择空叠层，因为「今日工作完成」是本产品最大的一次性奖励，必须每次
// 都有视觉，不适合静默跳过）。sparkle-burst.png/star-sticker.png 两个文件本身未删除（保留在
// app/web/assets/rewards/，未来若需要恢复/复用 mini-rocket-launch 或做别的表现形式可直接取用），
// 只是不再被本文件引用。

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 重复引入守卫（吸取 009/012/013/014 的教训）：本模块只应被引入一次。
  // ---------------------------------------------------------------------
  if (window.WTJ_STATUS_REWARDS) {
    return;
  }

  // ---------------------------------------------------------------------
  // manifest 访问器：与 task.js/pointer.js/keyboard.js/hud.js/task-templates.js 同一模式。
  // 缺失字段一律防御式回退到下方最小默认值并 console.warn，不阻断初始化。
  // ---------------------------------------------------------------------
  function getManifest() {
    if (window.WTJ_MANIFEST) {
      return window.WTJ_MANIFEST;
    }
    console.warn('[WTJ_STATUS_REWARDS] window.WTJ_MANIFEST 未找到（manifest.js 未加载或加载失败），回退到内置最小默认值。');
    return null;
  }

  var MANIFEST = getManifest();
  var STATUS_LIGHTS_CFG = (MANIFEST && MANIFEST.rewards && MANIFEST.rewards.statusLights) ? MANIFEST.rewards.statusLights : null;

  var DEFAULT_STATUS_LIGHT_COUNT = 3; // 镜像 hud.js/task-templates.js 同款默认值。
  var DEFAULT_STREAK_THRESHOLD = 3;
  var DEFAULT_STREAK_REWARD_FORMS = ['lights-flash-together', 'desk-stamp', 'mini-rocket-launch', 'chest-partial-open'];

  function getStatusLightCount() {
    if (STATUS_LIGHTS_CFG && typeof STATUS_LIGHTS_CFG.count === 'number' && STATUS_LIGHTS_CFG.count > 0) {
      return STATUS_LIGHTS_CFG.count;
    }
    return DEFAULT_STATUS_LIGHT_COUNT;
  }

  function getStreakThreshold() {
    if (STATUS_LIGHTS_CFG && typeof STATUS_LIGHTS_CFG.streakThreshold === 'number' && STATUS_LIGHTS_CFG.streakThreshold > 0) {
      return STATUS_LIGHTS_CFG.streakThreshold;
    }
    return DEFAULT_STREAK_THRESHOLD;
  }

  function getConfiguredStreakRewardForms() {
    if (STATUS_LIGHTS_CFG && Array.isArray(STATUS_LIGHTS_CFG.streakRewardForms) && STATUS_LIGHTS_CFG.streakRewardForms.length > 0) {
      return STATUS_LIGHTS_CFG.streakRewardForms;
    }
    return DEFAULT_STREAK_REWARD_FORMS;
  }

  // 本文件实际落地的表现形式子集（见文件头 REQ-RWD-06 落地位置索引）。manifest 的
  // streakRewardForms 是"产品允许的表现形式菜单"，不要求每次全部实现；这里显式声明选用的两种。
  // WTJ-20260705-010：'mini-rocket-launch' → 'desk-stamp'（接入 completion-stamp-v3，见文件头
  // 「WTJ-20260705-010」一节）。
  var IMPLEMENTED_FORMS = ['lights-flash-together', 'desk-stamp'];

  // ---------------------------------------------------------------------
  // WTJ-20260705-010：completion-stamp-v3 素材路径解析（desk-stamp 表现形式，替换此前的
  // sparkle-burst.png/star-sticker.png + 纯 CSS 小火箭）。config 驱动：优先读
  // manifest.rewards.completionStamp.sprite；manifest 缺失/字段缺失时回退到下方默认值——
  // 默认值本身就是已经复制进 app/web/assets/rewards/ 的 runtime 相对路径（不是 docs/ 设计目录
  // 路径），因此"回退"不等于"硬编码临时 design 目录"，只是把同一份 config 值兜底了一份，保证
  // 「今日工作完成」这个本产品最大的一次性奖励在 manifest 加载失败时仍有视觉可展示（不同于
  // keyboardMilestone 缺配置时选择空叠层的取舍）。
  // ---------------------------------------------------------------------
  var COMPLETION_STAMP_CFG = (MANIFEST && MANIFEST.rewards && MANIFEST.rewards.completionStamp) ? MANIFEST.rewards.completionStamp : null;
  var DEFAULT_COMPLETION_STAMP_SPRITE = 'assets/rewards/completion-stamp-v3.png';

  function getCompletionStampSpritePath() {
    if (COMPLETION_STAMP_CFG && typeof COMPLETION_STAMP_CFG.sprite === 'string' && COMPLETION_STAMP_CFG.sprite) {
      return COMPLETION_STAMP_CFG.sprite;
    }
    return DEFAULT_COMPLETION_STAMP_SPRITE;
  }

  // ---------------------------------------------------------------------
  // WTJ-20260705-008：键盘自由探索里程碑奖励（REQ-SLOT-03 关联）。
  // 累计有效键达到 keyboard.effectiveKeyMilestones（[100, 200]）之一时，008（keyboard.js）
  // emit WTJ_KEYBOARD.onMilestone(milestoneValue) + 点亮一个发现槽（槽内贴纸 keyboard-star，由
  // hud.js 落地）。本文件订阅 onMilestone，额外弹出一次性「键盘主题奖励」叠层做正反馈——用
  // DESIGN-007 discovery-icons 的 keyboard-spark（键盘星火迸发 medallion）一次性淡入→停留→淡出，
  // 不常驻屏幕（与 rewards.chest.oneTimePresentation 同一「一次性表现，不长期占屏」原则）。
  // 素材路径 config 驱动：读 manifest.rewards.keyboardMilestone.rewardSticker（已是 app/web/
  // 相对完整路径 assets/discovery-icons/...，不走 REWARD_ASSET_BASE 前缀）。缺配置时降级为空叠层
  // 不抛错。此奖励**独立**于「今日工作完成」连续奖励：不改 streak、不与 celebrating 互斥
  // （键盘探索里程碑与任务连击是两条独立进度线，各自可触发，互不吞并）。
  //
  // 与 010（completion-stamp 接入）的边界：本段全部走**独立的** milestoneOverlay* 状态
  // （独立 root / children / timer），不复用「今日工作完成」的 overlayRoot/overlayChildren/
  // overlayTimerId，两套奖励叠层互不干扰——降低本卡与 010 在 status-rewards.js 上的合并冲突面。
  // ---------------------------------------------------------------------
  var KEYBOARD_MILESTONE_CFG = (MANIFEST && MANIFEST.rewards && MANIFEST.rewards.keyboardMilestone) ? MANIFEST.rewards.keyboardMilestone : null;

  function getMilestoneRewardSticker() {
    if (KEYBOARD_MILESTONE_CFG && typeof KEYBOARD_MILESTONE_CFG.rewardSticker === 'string' && KEYBOARD_MILESTONE_CFG.rewardSticker) {
      return KEYBOARD_MILESTONE_CFG.rewardSticker;
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // 订阅者管理（本文件对外的 onWorkComplete 事件）：与 task.js/pointer.js/keyboard.js/
  // task-templates.js 完全同款多订阅者 + 逐个 try/catch 模式。
  // ---------------------------------------------------------------------
  var workCompleteSubscribers = [];

  function addSubscriber(list, fn) {
    if (typeof fn !== 'function') {
      console.warn('[WTJ_STATUS_REWARDS] 订阅回调必须是函数，已忽略此次注册。');
      return;
    }
    list.push(fn);
  }

  function emit(list, arg) {
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](arg);
      } catch (err) {
        console.error('[WTJ_STATUS_REWARDS] 订阅回调抛出异常，已捕获：', err);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 可注入时钟（默认真实 setTimeout/clearTimeout/Date.now；测试用 _setClock 整体或部分替换，
  // 与 task.js/pointer.js/task-templates.js 的 _setClock 同款模式）。三灯连闪的快闪节拍与
  // 一次性大奖励叠层的可见窗口都需要单测能快进，不需要真的等待。
  // ---------------------------------------------------------------------
  var clockRef = {
    setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimeout: function (id) { clearTimeout(id); },
    now: function () { return Date.now(); }
  };

  function _setClock(clock) {
    if (!clock || typeof clock !== 'object') {
      console.warn('[WTJ_STATUS_REWARDS] _setClock: 参数必须是对象，已忽略。');
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
  // WTJ_HUD / WTJ_AUDIO 防御式调用包装（两者均可能缺失/未加载；本文件对每一次调用都单独
  // try/catch，一处失败不影响其余，与 014 的 setStatusLightDefensive()/playSuccessAudioDefensive()
  // 同款模式）。
  // ---------------------------------------------------------------------
  function setStatusLightDefensive(index, on) {
    try {
      if (window.WTJ_HUD && typeof window.WTJ_HUD.setStatusLight === 'function') {
        window.WTJ_HUD.setStatusLight(index, on);
      }
    } catch (err) {
      console.error('[WTJ_STATUS_REWARDS] window.WTJ_HUD.setStatusLight 调用失败，已捕获：', err);
    }
  }

  function setAllLightsDefensive(on) {
    var count = getStatusLightCount();
    var i;
    for (i = 0; i < count; i++) {
      setStatusLightDefensive(i, on);
    }
  }

  function playRewardSfxDefensive() {
    try {
      if (window.WTJ_AUDIO && typeof window.WTJ_AUDIO.playSfx === 'function') {
        var result = window.WTJ_AUDIO.playSfx('streak-reward-fanfare');
        if (result && typeof result.then === 'function') {
          result.then(null, function (err) {
            console.error('[WTJ_STATUS_REWARDS] window.WTJ_AUDIO.playSfx 返回的 Promise 被 reject，已捕获：', err);
          });
        }
      }
    } catch (err) {
      console.error('[WTJ_STATUS_REWARDS] window.WTJ_AUDIO.playSfx 调用失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // prefers-reduced-motion 检测：防御式（window.matchMedia 可能不存在，尤其在测试沙箱里）。
  // 命中时奖励动画冻结为静态完成态——不做三灯快闪（直接一次性点亮），叠层不做位移/淡入淡出动画
  // （由 status-rewards.css 的 @media (prefers-reduced-motion: reduce) 负责去掉动画声明），
  // 但 JS 侧的展示时长与移除时机保持不变，仍由可注入时钟统一调度（与 secretword.css/
  // task-templates.css 的既有约定一致：JS 定时不变，CSS 去动画）。
  // ---------------------------------------------------------------------
  function prefersReducedMotion() {
    try {
      if (typeof window.matchMedia === 'function') {
        var mql = window.matchMedia('(prefers-reduced-motion: reduce)');
        return !!(mql && mql.matches);
      }
    } catch (err) {
      console.warn('[WTJ_STATUS_REWARDS] matchMedia 检测失败，按不启用 reduced-motion 处理，已捕获：', err);
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // DOM 叠层：懒创建的单一 overlay root，挂在 document.body 下。document 不存在（如本文件
  // 被非浏览器环境的测试 harness 用 stub window 加载而不提供 document）时防御式跳过——与
  // task-templates.js 同款"DOM 缺失时优雅降级为不可视但不抛错"取舍，不是结构性禁止 DOM。
  // ---------------------------------------------------------------------
  var overlayRoot = null;
  var overlayChildren = []; // 当前这一轮奖励叠层的所有子元素，一次性移除用。

  function ensureOverlayRoot() {
    if (overlayRoot) {
      return overlayRoot;
    }
    if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function' || !document.body) {
      return null;
    }
    try {
      var root = document.createElement('div');
      root.className = 'wtj-sr-root';
      if (typeof root.setAttribute === 'function') {
        root.setAttribute('aria-hidden', 'true');
      }
      document.body.appendChild(root);
      overlayRoot = root;
      return overlayRoot;
    } catch (err) {
      console.error('[WTJ_STATUS_REWARDS] 创建奖励叠层容器失败，已捕获：', err);
      return null;
    }
  }

  function removeElementDefensive(el) {
    if (!el) {
      return;
    }
    try {
      if (typeof el.remove === 'function') {
        el.remove();
      } else if (el.parentNode && typeof el.parentNode.removeChild === 'function') {
        el.parentNode.removeChild(el);
      }
    } catch (err) {
      console.error('[WTJ_STATUS_REWARDS] 移除奖励叠层元素失败，已捕获：', err);
    }
  }

  // 清空上一轮（如果存在）叠层子元素，保证同一时刻只有一批叠层元素在 DOM 里，不堆积
  // （REQ-RWD-04「不污染主画面」的落地方式之一）。
  function clearOverlayChildren() {
    var i;
    for (i = 0; i < overlayChildren.length; i++) {
      removeElementDefensive(overlayChildren[i]);
    }
    overlayChildren = [];
  }

  function createOverlayChild(tag, className) {
    var root = ensureOverlayRoot();
    if (!root) {
      return null;
    }
    try {
      var el = document.createElement(tag);
      el.className = className;
      if (typeof el.setAttribute === 'function') {
        el.setAttribute('aria-hidden', 'true');
      }
      root.appendChild(el);
      overlayChildren.push(el);
      return el;
    } catch (err) {
      console.error('[WTJ_STATUS_REWARDS] 创建奖励叠层子元素失败，已捕获：', err);
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // 三灯连闪（lights-flash-together，REQ-RWD-06）：用 WTJ_HUD.setStatusLight 反复切换
  // on/off 实现快闪，不新增 HUD 内部状态。节拍数值（FLASH_STEP_MS/FLASH_STEP_COUNT）是本卡
  // 占位值（卡片原文未给出精确数值，与 keyboard.js FUNCTION_KEY_DECAY_SPAN、task-templates.js
  // COMPLETE_VISUAL_HOLD_MS 同一工程取舍）。快闪与一次性大奖励叠层（showRewardOverlay()）在
  // triggerWorkComplete() 里同时发起、并行播放（盖章 pop 出现的同时状态灯在快闪），不是"先闪完再
  // 出叠层"的串行等待——这样三岁小孩不需要等两段动画依次播完，观感也更像"一起爆发"的庆祝。
  // 快闪总时长（FLASH_STEP_MS * FLASH_STEP_COUNT = 1320ms）刻意小于 OVERLAY_TOTAL_MS
  // （1800ms），保证真正收尾熄灯（finishCelebration()，由 overlay 计时器驱动）发生时，快闪
  // 序列早已跑完并定格在"全亮"，不会出现"叠层已经淡出但灯还在闪"的错位。
  // ---------------------------------------------------------------------
  var FLASH_STEP_MS = 220;
  var FLASH_STEP_COUNT = 6; // 3 次亮灭循环
  var flashTimerId = null;

  function flashLightsSequence() {
    var i = 0;

    function step() {
      flashTimerId = null;
      if (i >= FLASH_STEP_COUNT) {
        setAllLightsDefensive(true); // 快闪收尾：统一定格为全亮，与大奖励叠层的展示窗口重叠。
        return;
      }
      var on = (i % 2 === 0);
      setAllLightsDefensive(on);
      i++;
      flashTimerId = clockRef.setTimeout(step, FLASH_STEP_MS);
    }

    step();
  }

  function cancelFlash() {
    if (flashTimerId !== null) {
      clockRef.clearTimeout(flashTimerId);
      flashTimerId = null;
    }
  }

  // ---------------------------------------------------------------------
  // 一次性大奖励视觉（desk-stamp，REQ-RWD-06 / REQ-AST-02，WTJ-20260705-010 接入
  // completion-stamp-v3，替换此前的 mini-rocket-launch 纯 CSS 小火箭 + sparkle-burst.png /
  // star-sticker.png 占位）：单张已抠像静态图（金色印章 + 三个打勾徽章 + 环形闪光，语义正好
  // 呼应"连续完成 3 个任务"），status-rewards.css 的 @keyframes wtj-sr-stamp-pop 做一次性
  // pop/scale/fade（淡入放大 → 短暂停留 → 淡出）。约 1.8s（落在 TL 架构指令给出的 1.5-2s
  // 区间内），由可注入时钟统一调度移除，不依赖 CSS animationend 事件（与
  // task-templates.js/secretword.js 的既有取舍一致：JS 定时移除，CSS 只管视觉）。素材路径见
  // getCompletionStampSpritePath()（config 驱动，见上方「WTJ-20260705-010」一节）。
  // ---------------------------------------------------------------------
  var OVERLAY_TOTAL_MS = 1800;
  var overlayTimerId = null;

  function showRewardOverlay() {
    clearOverlayChildren(); // 保险：正常不应该有上一轮残留（celebrating 标志已经防止重入）。

    var stampEl = createOverlayChild('img', 'wtj-sr-stamp wtj-sr-anim');
    if (stampEl) {
      stampEl.src = getCompletionStampSpritePath();
      stampEl.alt = '';
    }

    overlayTimerId = clockRef.setTimeout(function () {
      overlayTimerId = null;
      finishCelebration();
    }, OVERLAY_TOTAL_MS);
  }

  function cancelOverlayTimer() {
    if (overlayTimerId !== null) {
      clockRef.clearTimeout(overlayTimerId);
      overlayTimerId = null;
    }
  }

  // ---------------------------------------------------------------------
  // WTJ-20260705-008：键盘里程碑奖励叠层（独立于「今日工作完成」叠层的一套 root/children/timer，
  // 见上方 KEYBOARD_MILESTONE 段说明）。懒创建单一 root，一次性淡入→停留→淡出后由可注入时钟
  // 定时移除子元素（与 showRewardOverlay() 同款：JS 定时移除，CSS 只管视觉；reduced-motion 由
  // status-rewards.css 的媒体查询冻结为静态）。快速连达两个里程碑时，同一时刻只保留最新一批
  // 叠层子元素（不堆积）。
  // ---------------------------------------------------------------------
  var MILESTONE_OVERLAY_MS = 1600; // 一次性可见窗口，落在 secretword/宝箱一次性表现同量级（~1.5-2s）。
  var milestoneOverlayRoot = null;
  var milestoneOverlayChildren = [];
  var milestoneOverlayTimerId = null;

  function ensureMilestoneOverlayRoot() {
    if (milestoneOverlayRoot) {
      return milestoneOverlayRoot;
    }
    if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function' || !document.body) {
      return null;
    }
    try {
      var root = document.createElement('div');
      root.className = 'wtj-sr-milestone-root';
      if (typeof root.setAttribute === 'function') {
        root.setAttribute('aria-hidden', 'true');
      }
      document.body.appendChild(root);
      milestoneOverlayRoot = root;
      return milestoneOverlayRoot;
    } catch (err) {
      console.error('[WTJ_STATUS_REWARDS] 创建里程碑奖励叠层容器失败，已捕获：', err);
      return null;
    }
  }

  function clearMilestoneOverlayChildren() {
    var i;
    for (i = 0; i < milestoneOverlayChildren.length; i++) {
      removeElementDefensive(milestoneOverlayChildren[i]);
    }
    milestoneOverlayChildren = [];
  }

  function createMilestoneOverlayChild(tag, className) {
    var root = ensureMilestoneOverlayRoot();
    if (!root) {
      return null;
    }
    try {
      var el = document.createElement(tag);
      el.className = className;
      if (typeof el.setAttribute === 'function') {
        el.setAttribute('aria-hidden', 'true');
      }
      root.appendChild(el);
      milestoneOverlayChildren.push(el);
      return el;
    } catch (err) {
      console.error('[WTJ_STATUS_REWARDS] 创建里程碑奖励叠层子元素失败，已捕获：', err);
      return null;
    }
  }

  function cancelMilestoneOverlayTimer() {
    if (milestoneOverlayTimerId !== null) {
      clockRef.clearTimeout(milestoneOverlayTimerId);
      milestoneOverlayTimerId = null;
    }
  }

  function showMilestoneReward(milestoneValue) {
    var root = ensureMilestoneOverlayRoot();
    if (!root) {
      return; // 无 document（如非浏览器测试沙箱不提供 document）：静默跳过，不影响 onMilestone 其它下游。
    }
    // 同一时刻只保留最新一批里程碑叠层：先收尾上一批（若还在可见窗口内），再放新的。
    cancelMilestoneOverlayTimer();
    clearMilestoneOverlayChildren();

    var sticker = getMilestoneRewardSticker();
    var stickerEl = createMilestoneOverlayChild('img', 'wtj-sr-milestone-sticker wtj-sr-milestone-anim');
    if (stickerEl) {
      if (sticker) {
        stickerEl.src = sticker; // manifest.rewards.keyboardMilestone.rewardSticker，已是完整相对路径。
      } else {
        console.warn('[WTJ_STATUS_REWARDS] manifest.rewards.keyboardMilestone.rewardSticker 缺失，里程碑奖励叠层无贴纸可显示（降级为空叠层，不抛错）。');
      }
      stickerEl.alt = '';
    }

    milestoneOverlayTimerId = clockRef.setTimeout(function () {
      milestoneOverlayTimerId = null;
      clearMilestoneOverlayChildren();
    }, MILESTONE_OVERLAY_MS);
  }

  function handleKeyboardMilestone(milestoneValue) {
    showMilestoneReward(milestoneValue);
  }

  // ---------------------------------------------------------------------
  // WTJ-20260705-015：任务成功即时视觉反馈（第三路，与上方 008 里程碑弹层、010 completion-
  // stamp-v3 并列——014（task-templates.js）每次判定一个具体问号任务完成时 emit
  // onTaskComplete，本节独立消费同一个事件，只做"这一次任务本身"的即时视觉反馈，不碰 streak/
  // celebrating 状态机，与是否触发「今日工作完成」无关，每一次任务完成都会播放）。
  //
  // 背景（Ethan 现场验收反馈）：press 类任务（如"按下字母 A"）完成时此前只有一个很小的提示音 +
  // 左下角状态灯点亮，没有任何"视觉爆点"——三岁小孩容易错过这个反馈。本节新增一个短促
  // （约 450ms，明显但不会挡住画面太久）的 sparkle burst + 成功环，出现在"这次任务完成的地方"：
  // drag/click/find 三类任务用 014 传来的 anchor（{leftPercent, topPercent}，见 task-templates.js
  // presetAt()/anchorFromPos() 一节，与该任务道具渲染时实际使用的百分比位置完全一致）换算成像素
  // 锚点；press 类任务没有任何 DOM（anchor 恒为 null，任务本身就没有一个"在屏幕上的位置"），
  // 回退到 FALLBACK_ANCHOR_PCT 这个画布安全区（屏幕偏上方居中，避开顶栏/底部五槽托盘/左下角
  // 状态灯这几个 HUD 固定区域，与 task-templates.js POSITION_PRESETS 的避让逻辑同一思路，只是
  // 本节独立维护一份常量，不新增对 task-templates.js 内部实现细节的依赖）。
  //
  // 视觉构成 — 复用 002（sparkles.js）的共享绘制层，不新增粒子系统：
  //   1) 一个从小到大扩散、alpha 逐步淡出的成功环（纯 ctx.arc()+ctx.stroke()，同 app.js
  //      drawRings() 一样不使用渐变/shadowBlur）；
  //   2) 围绕锚点向 FX_SPARKLE_DIRECTIONS 个方向"炸开"的星点——每个方向调用一次
  //      window.WTJ_SPARKLES.drawSparkles()（002 卡的共享离屏贴图缓存 + drawImage 复用，
  //      本节不重新实现星点绘制本身），方向角度均匀分布 + 一次性随机整体旋转偏移
  //      （baseAngleOffset，只在 burst 开始时算一次，不逐帧重算），像烟花一样从锚点向四周炸开。
  // 金色（FX_COLOR）呼应 010 completion-stamp-v3 素材本身的"金色印章"配色，让"单次任务的小奖励"
  // 与"连续 3 次的大奖励"在色彩语言上是同一套体系的两个强度级别，不是各自随意选色。
  //
  // 渲染方式——与 flashLightsSequence() 同款"用 clockRef.setTimeout 驱动的分步动画"，不用
  // requestAnimationFrame：一是本节和文件其余部分一样需要被 _setClock() 注入的假时钟完整接管
  // （测试用 env.clock.advance() 快进，不需要真的等待或 mock rAF）；二是这个视觉本来就短促、
  // 步数不多（FX_BURST_STEP_COUNT 步），不需要真正 60fps 的连续性。渲染面是一个懒创建的单一全屏
  // <canvas>（.wtj-sr-taskfx-canvas，见 status-rewards.css），每次 burst 开始时清空重画，
  // 不常驻可见内容、也不与 008/010 的 DOM 叠层共享同一个 root（各自独立生命周期，互不干扰）。
  //
  // 与 010 completion-stamp 的协调：第 3 个任务完成时，本节的 sparkle burst 与 010 的三灯连闪 +
  // completion-stamp-v3 大奖励叠层是同一个 handleTaskComplete() 里先后发起的两件独立视觉——
  // 本节先播放"这一次任务本身"的小 burst（不因为 celebrating 而跳过，见 handleTaskComplete()
  // 改动），随后如果 streak 达标，triggerWorkComplete() 才会叠加播放三灯连闪与大奖励印章。
  // 两者色彩体系相关但不是同一个渲染对象，不会互相打断/覆盖（各自独立的 canvas / DOM root）。
  // ---------------------------------------------------------------------

  // 002（sparkles.js）在本文件加载时是否已就绪——只在文件加载时判定一次，不逐帧/逐次 burst
  // 重新判定（与 app.js 顶部 `hasSparkles` 变量完全同款写法，见 app/web/app.js 「hasSparkles」
  // 一节）。缺失时星点炸开效果不可用，但成功环本身（不依赖 sparkles.js）仍会正常绘制——"至少有
  // 一部分视觉反馈"优于"因为一个可选依赖缺失就整体跳过"。
  var hasSparkles = !!(window.WTJ_SPARKLES && typeof window.WTJ_SPARKLES.drawSparkles === 'function');
  if (!hasSparkles) {
    console.warn('[WTJ_STATUS_REWARDS] window.WTJ_SPARKLES 未找到（sparkles.js 未加载或加载失败），任务成功视觉反馈的星点炸开效果不可用（成功环本体仍会正常绘制）。');
  }

  var FX_COLOR = '#ffd76b'; // 暖金色，呼应 completion-stamp-v3「金色印章」配色（见文件头说明）。
  var FX_BURST_STEP_MS = 45;
  var FX_BURST_STEP_COUNT = 10; // 约 450ms（FX_BURST_STEP_MS * FX_BURST_STEP_COUNT），短促不过载。
  var FX_STATIC_HOLD_MS = 420; // reduced-motion 静态单帧展示时长，同一量级。
  var FX_RING_BASE_PX = 16;
  var FX_RING_GROWTH_PX = 64;
  var FX_RING_LINE_WIDTH_PX = 4;
  var FX_SPARKLE_DIRECTIONS = 8; // 均匀分布的炸开方向数（像烟花），见文件头说明。
  var FX_SPARKLE_LENGTH_PX = 58; // 每个方向星点分布的长度（drawSparkles 的 lengthPx）。
  var FX_SPARKLE_BASE_SIZE_PX = 26;
  var FX_SPARKLE_POINT_COUNT = 3; // 每个方向上的星点个数（drawSparkles 的 sparkles 数组长度）。

  // press 类任务没有任何 DOM（见 task-templates.js「四、按键任务」一节），anchor 恒为 null 时的
  // 画布安全区兜底位置：屏幕偏上方居中（避开顶栏、底部五槽托盘、左下角状态灯），与
  // task-templates.js POSITION_PRESETS 的避让思路一致，但本节独立维护，不引入对该文件内部实现
  // 细节的依赖（同一避让原则的两份独立数值，不是共享同一个常量）。
  var FALLBACK_ANCHOR_PCT = { leftPercent: 50, topPercent: 40 };

  // 环境没有真实 window.innerWidth/innerHeight（理论上不会在真实浏览器发生，纯防御式兜底，
  // 与本文件其余"缺失时不阻断"的取舍一致）时的画布尺寸兜底值。
  var FX_FALLBACK_CANVAS_WIDTH = 1024;
  var FX_FALLBACK_CANVAS_HEIGHT = 768;

  var fxCanvasEl = null; // 懒创建的单一全屏 canvas，与 overlayRoot/milestoneOverlayRoot 同款单例模式。
  var fxBurstTimerId = null;

  function ensureFxCanvas() {
    if (fxCanvasEl) {
      return fxCanvasEl;
    }
    if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function' || !document.body) {
      return null;
    }
    try {
      var canvas = document.createElement('canvas');
      canvas.className = 'wtj-sr-taskfx-canvas';
      if (typeof canvas.setAttribute === 'function') {
        canvas.setAttribute('aria-hidden', 'true');
      }
      document.body.appendChild(canvas);
      fxCanvasEl = canvas;
      return fxCanvasEl;
    } catch (err) {
      console.error('[WTJ_STATUS_REWARDS] 创建任务成功视觉反馈画布失败，已捕获：', err);
      return null;
    }
  }

  // 防御式取 2D 上下文：单测用的 fake DOM（无真实 canvas 支持时）没有 getContext，
  // 这里静默返回 null——调用方据此整体跳过绘制，不影响 streak/音效等其余流程。
  function getFxCtx(canvasEl) {
    if (!canvasEl || typeof canvasEl.getContext !== 'function') {
      return null;
    }
    try {
      return canvasEl.getContext('2d');
    } catch (err) {
      console.error('[WTJ_STATUS_REWARDS] 获取任务成功视觉反馈画布 2D 上下文失败，已捕获：', err);
      return null;
    }
  }

  function cancelFxBurst() {
    if (fxBurstTimerId !== null) {
      clockRef.clearTimeout(fxBurstTimerId);
      fxBurstTimerId = null;
    }
  }

  function clearFxCanvas(ctx, canvasEl) {
    try {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    } catch (err) {
      console.error('[WTJ_STATUS_REWARDS] 清空任务成功视觉反馈画布失败，已捕获：', err);
    }
  }

  // anchor 缺失（press 类任务，或字段类型不对的防御式兜底）时退化到 FALLBACK_ANCHOR_PCT。
  function resolveAnchorPct(anchor) {
    if (anchor && typeof anchor.leftPercent === 'number' && typeof anchor.topPercent === 'number') {
      return anchor;
    }
    return FALLBACK_ANCHOR_PCT;
  }

  // 每个方向上的星点参数——形状与 letter-motion.js randomSparkles() 完全一致（{t, sizeFrac,
  // phaseRad, twinkleHz}，drawSparkles() 的输入契约），但本节独立生成（不依赖 WTJ_LETTER_MOTION，
  // 与 sparkles.js 文件头"本文件不应该要求消费方必须先加载 letter-motion.js"一节的取舍一致）。
  // t 偏向线段外侧（0.55~1.0）：burst 是"向外炸开"，星点应该集中在锚点之外，不是贴着锚点本身。
  // 只在 burst 开始时生成一次，8 个方向共用同一组点（每个方向各自的角度不同，视觉上仍是向四面
  // 八方炸开），不逐帧/逐方向重新随机——短促的一次性效果，这样简化不影响观感，换来更少的计算。
  function genBurstSparklePoints() {
    var list = [];
    var i;
    for (i = 0; i < FX_SPARKLE_POINT_COUNT; i++) {
      list.push({
        t: 0.55 + Math.random() * 0.45,
        sizeFrac: 0.4 + Math.random() * 0.5,
        phaseRad: Math.random() * Math.PI * 2,
        twinkleHz: 0.8 + Math.random() * 1.4
      });
    }
    return list;
  }

  // 画一帧：成功环（半径随 progress 增长，alpha 随 alpha 参数淡出）+ 8 个方向的星点炸开
  // （仅当 hasSparkles 时；成功环本身不依赖 sparkles.js，缺失时仍有部分视觉反馈，见文件头）。
  function drawFxFrame(ctx, x, y, alpha, progress, sparklePoints, baseAngleOffset, now) {
    try {
      var radius = FX_RING_BASE_PX + progress * FX_RING_GROWTH_PX;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha * 0.9));
      ctx.strokeStyle = FX_COLOR;
      ctx.lineWidth = FX_RING_LINE_WIDTH_PX;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, radius), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } catch (err) {
      console.error('[WTJ_STATUS_REWARDS] 绘制任务成功环失败，已捕获：', err);
    }

    if (!hasSparkles || !sparklePoints || !sparklePoints.length) {
      return;
    }
    var i;
    for (i = 0; i < FX_SPARKLE_DIRECTIONS; i++) {
      var angle = baseAngleOffset + i * ((Math.PI * 2) / FX_SPARKLE_DIRECTIONS);
      try {
        window.WTJ_SPARKLES.drawSparkles(ctx, x, y, {
          color: FX_COLOR,
          sparkles: sparklePoints,
          angleRad: angle,
          lengthPx: FX_SPARKLE_LENGTH_PX,
          baseSizePx: FX_SPARKLE_BASE_SIZE_PX,
          alpha: alpha,
          now: now
        });
      } catch (err) {
        console.error('[WTJ_STATUS_REWARDS] window.WTJ_SPARKLES.drawSparkles 调用失败，已捕获：', err);
      }
    }
  }

  // 对外触发入口：014 每次 onTaskComplete 都调用一次（见 handleTaskComplete() 改动），与
  // streak/celebrating 完全无关——每一次任务完成都会播放，不因为正在庆祝三连奖励而跳过。
  function triggerTaskSuccessFx(payload) {
    var canvasEl = ensureFxCanvas();
    if (!canvasEl) {
      return; // 无 document（如非浏览器测试沙箱不提供 document）：静默跳过，不影响其余流程。
    }
    var ctx = getFxCtx(canvasEl);
    if (!ctx) {
      return; // 环境不支持 canvas 2D（如单测的最小 fake DOM 没有 getContext）：静默跳过绘制本身。
    }

    cancelFxBurst(); // 保险：理论上 013 保证同一时刻只有一个进行中任务，不应该有上一次 burst 还在播。

    var w = (typeof window !== 'undefined' && typeof window.innerWidth === 'number' && window.innerWidth > 0) ? window.innerWidth : FX_FALLBACK_CANVAS_WIDTH;
    var h = (typeof window !== 'undefined' && typeof window.innerHeight === 'number' && window.innerHeight > 0) ? window.innerHeight : FX_FALLBACK_CANVAS_HEIGHT;
    try {
      canvasEl.width = w;
      canvasEl.height = h; // 顺带清空上一次 burst 的残留内容（canvas 尺寸赋值本身会清空画布）。
    } catch (err) {
      console.error('[WTJ_STATUS_REWARDS] 设置任务成功视觉反馈画布尺寸失败，已捕获：', err);
    }

    var anchorPct = resolveAnchorPct(payload && payload.anchor);
    var x = (anchorPct.leftPercent / 100) * w;
    var y = (anchorPct.topPercent / 100) * h;

    var sparklePoints = genBurstSparklePoints();
    var baseAngleOffset = Math.random() * Math.PI * 2; // 一次性整体旋转偏移，见 genBurstSparklePoints() 说明。

    if (prefersReducedMotion()) {
      // 静态完成态：不做逐步位移/缩放动画，直接画一帧接近"炸开末段"的成功环+星点（progress 较大、
      // alpha 中等），短暂展示后一次性清空——JS 侧展示时长不变，只是不做分步动画（与 008/010 两路
      // CSS 动画在 reduced-motion 下的处理原则一致，只是这里是 canvas，没有 CSS 媒体查询可用，
      // 只能在 JS 侧直接分支）。
      drawFxFrame(ctx, x, y, 0.85, 0.7, sparklePoints, baseAngleOffset, clockRef.now());
      fxBurstTimerId = clockRef.setTimeout(function () {
        fxBurstTimerId = null;
        clearFxCanvas(ctx, canvasEl);
      }, FX_STATIC_HOLD_MS);
      return;
    }

    var step = 0;
    function tick() {
      fxBurstTimerId = null;
      clearFxCanvas(ctx, canvasEl);
      if (step >= FX_BURST_STEP_COUNT) {
        return; // 已清空，burst 结束。
      }
      var progress = step / (FX_BURST_STEP_COUNT - 1);
      var alpha = 1 - progress; // 线性淡出：第一步 alpha=1（最明显），最后一步 alpha=0（几乎消失）。
      drawFxFrame(ctx, x, y, alpha, progress, sparklePoints, baseAngleOffset, clockRef.now());
      step++;
      fxBurstTimerId = clockRef.setTimeout(tick, FX_BURST_STEP_MS);
    }
    tick();
  }

  // ---------------------------------------------------------------------
  // streak 状态机
  // ---------------------------------------------------------------------
  var streak = 0;
  var celebrating = false;
  var lastReducedMotion = false;

  function finishCelebration() {
    clearOverlayChildren();
    setAllLightsDefensive(false); // 熄灭三个状态灯，进入下一轮工作。
    streak = 0;
    celebrating = false;
  }

  function triggerWorkComplete() {
    celebrating = true;
    var reduced = prefersReducedMotion();
    lastReducedMotion = reduced;

    var payload = {
      streak: streak,
      streakThreshold: getStreakThreshold(),
      forms: IMPLEMENTED_FORMS.slice(),
      reducedMotion: reduced,
      ts: clockRef.now()
    };

    playRewardSfxDefensive();
    emit(workCompleteSubscribers, payload);

    if (reduced) {
      // 静态完成态：不闪不动，三个灯直接一次性点亮，叠层不做位移/淡入淡出（由 CSS 负责）。
      setAllLightsDefensive(true);
    } else {
      flashLightsSequence();
    }
    // 大奖励叠层与三灯连闪同时发起（见 flashLightsSequence() 文件头说明），不等快闪先跑完。
    showRewardOverlay();
  }

  function handleTaskComplete(payload) {
    // WTJ-20260705-015：第三路即时视觉反馈——无条件触发，不受下方 celebrating 并发守卫影响。
    // 每一次任务完成都应该有这个小 burst，即使这一次恰好是"正在庆祝三连奖励期间被吞掉的
    // streak"（见下方 if (celebrating) return），孩子这一次任务本身仍然真实完成了、仍然应该
    // 看到反馈——这与 streak 计数（服务于「今日工作完成」这个更高层的连续奖励判定）是两件独立
    // 的事，不应该共用同一个并发守卫。
    triggerTaskSuccessFx(payload);

    if (celebrating) {
      // 奖励播放期间收到的任务完成事件不计入下一轮 streak（避免奖励叠层/快闪与新一轮计数
      // 互相踩踏）。与 013/014 里"同一时刻只允许一个进行中任务"同一类并发保护思路。
      return;
    }
    streak++;
    if (streak >= getStreakThreshold()) {
      triggerWorkComplete();
    }
  }

  // ---------------------------------------------------------------------
  // 订阅 014（task-templates.js）的 onTaskComplete（防御式：缺失时降级为 console.warn，
  // streak 累计功能不可用，但本文件其余 API 仍然挂载）。
  // ---------------------------------------------------------------------
  (function wireTaskComplete() {
    try {
      if (window.WTJ_TASK_TEMPLATES && typeof window.WTJ_TASK_TEMPLATES.onTaskComplete === 'function') {
        window.WTJ_TASK_TEMPLATES.onTaskComplete(handleTaskComplete);
      } else {
        console.warn('[WTJ_STATUS_REWARDS] window.WTJ_TASK_TEMPLATES.onTaskComplete 未找到（014 未加载或加载失败），streak 累计功能不可用（防御式降级）。');
      }
    } catch (err) {
      console.error('[WTJ_STATUS_REWARDS] 订阅 window.WTJ_TASK_TEMPLATES.onTaskComplete 失败，已捕获：', err);
    }
  })();

  // WTJ-20260705-008：订阅 008（keyboard.js）的 onMilestone（防御式：缺失时降级为 console.warn，
  // 键盘里程碑奖励叠层不可用，但本文件其余 API 与「今日工作完成」奖励仍正常）。index.html 加载
  // 顺序中 keyboard.js 排在 status-rewards.js 之前，故此处订阅时 WTJ_KEYBOARD 通常已就绪。
  (function wireKeyboardMilestone() {
    try {
      if (window.WTJ_KEYBOARD && typeof window.WTJ_KEYBOARD.onMilestone === 'function') {
        window.WTJ_KEYBOARD.onMilestone(handleKeyboardMilestone);
      } else {
        console.warn('[WTJ_STATUS_REWARDS] window.WTJ_KEYBOARD.onMilestone 未找到（008 未加载或加载失败），键盘里程碑奖励叠层不可用（防御式降级）。');
      }
    } catch (err) {
      console.error('[WTJ_STATUS_REWARDS] 订阅 window.WTJ_KEYBOARD.onMilestone 失败，已捕获：', err);
    }
  })();

  // ---------------------------------------------------------------------
  // 对外 API
  // ---------------------------------------------------------------------
  function onWorkComplete(fn) {
    addSubscriber(workCompleteSubscribers, fn);
  }

  function getStreak() {
    return streak;
  }

  function reset() {
    cancelFlash();
    cancelOverlayTimer();
    clearOverlayChildren();
    // WTJ-20260705-008：外部重置（家长退出/新会话）也立即收起进行中的键盘里程碑奖励叠层，
    // 与「今日工作完成」叠层一并清空，不留残影。
    cancelMilestoneOverlayTimer();
    clearMilestoneOverlayChildren();
    // WTJ-20260705-015：同样立即中止进行中的任务成功即时视觉反馈 burst 并清空画布，不留下
    // 冻结在半途的 sparkle/成功环残影。
    cancelFxBurst();
    if (fxCanvasEl) {
      var fxCtx = getFxCtx(fxCanvasEl);
      if (fxCtx) {
        clearFxCanvas(fxCtx, fxCanvasEl);
      }
    }
    setAllLightsDefensive(false);
    streak = 0;
    celebrating = false;
  }

  function getState() {
    return {
      streak: streak,
      streakThreshold: getStreakThreshold(),
      celebrating: celebrating,
      lightCount: getStatusLightCount(),
      configuredForms: getConfiguredStreakRewardForms().slice(),
      implementedForms: IMPLEMENTED_FORMS.slice(),
      reducedMotion: lastReducedMotion
    };
  }

  var API = {
    VERSION: '0.1.0',
    CARD_ID: 'WTJ-20260704-015',

    onWorkComplete: onWorkComplete,
    getStreak: getStreak,
    reset: reset,
    getState: getState,

    // 测试专用，见文件头 API 列表说明；不是给其余生产代码调用的稳定契约（与 task.js/
    // pointer.js/task-templates.js 的 _setClock 同款模式）。
    _setClock: _setClock
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  // 绑定加固：与 task.js/pointer.js/audio.js/task-templates.js 同款——API 对象自身已
  // Object.freeze，这里进一步把 window 上的 WTJ_STATUS_REWARDS 绑定本身设为不可写、不可
  // 重配置，防止整体重赋值把状态换掉。重复引入已由 IIFE 顶部守卫短路，走不到这里，因此到达时
  // window.WTJ_STATUS_REWARDS 必为未定义；下面判断只是二次保险（兼容无 defineProperty 环境）。
  if (!window.WTJ_STATUS_REWARDS && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_STATUS_REWARDS', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_STATUS_REWARDS) {
    window.WTJ_STATUS_REWARDS = API;
  }
})();
