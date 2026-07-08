// WTJ-20260704-056 — 生产动效帧序列播放引擎（window.WTJ_FRAME_ANIM）
//
// 语法基线：ES2020 以内（Safari 14 兼容，实为 Safari 11.1+ 起可用的特性子集——本文件唯一用到
// 的"新"API 是 HTMLImageElement.prototype.decode()，11.1+ 支持）。只用 var/function 声明式，
// 不用箭头函数 / let / const / 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求（不 fetch 任何
// 东西，不访问任何外部 URL）、非 module（无 import/export），以普通
// <script src="frame-anim.js"> 标签加载，需排在 anim-manifest.js 之后（读取
// window.WTJ_ANIM_MANIFEST）、manifest.js 之后（读取 window.WTJ_MANIFEST.performance.
// idleStopSec）、task-templates.js（014）与 reward-chest.js（011）之前——两者都调用本文件
// 暴露的 API。见 app/web/anim/FRAME-ANIM-API.md 完整消费说明。
//
// -----------------------------------------------------------------------
// 职责边界（本卡 056，三路技术评审定案：Canvas 逐帧 drawImage + 可注入时钟 + 构建期降采样）
// -----------------------------------------------------------------------
// 本文件只做一件事：给一个调用方提供的 <canvas> 元素，按 anim-manifest.js 里某个
// prop/state 的帧配置（sheetPath/frameCount/fps/loop），逐帧把降采后的 strip sheet
// 对应的 cell 区域 drawImage 到该 canvas 上，驱动方式是**可注入时钟的 setTimeout 链**
// （非 requestAnimationFrame——见下方「计时驱动方式」一节），帧号完全由「当前时间 - 播放
// 起始时间」的绝对差值算出（seek-safe：跳过若干次 tick 也不会导致帧号漂移或跳帧顺序错乱，
// 只取决于经过的绝对时间与 fps，与本文件被调用了多少次 tick 无关）。
//
// 本文件不做的事：不生成/不下载降采资产（那是 app/scripts/build-anim-assets.sh 的构建期
// 职责，本文件只读构建产物 window.WTJ_ANIM_MANIFEST）、不决定"014 的点击任务该用哪个
// prop/state 播放"（那是 task-templates.js 的映射表职责）、不决定"011 的宝箱该在什么时机
// 播 opening"（那是 reward-chest.js 的职责）、不管 door/bell 的实际动效内容（v1_boundary.
// deferred_to_v2，DESIGN 验收未过，anim-manifest.js 里根本没有它们的条目——本文件对任何
// 未出现在 anim-manifest 里的 prop 一律走统一的防御式回退，不需要特判 door/bell 这两个
// 名字，调用方拿到 play() 的 false 返回值后自行回退静态占位）。
//
// -----------------------------------------------------------------------
// 计时驱动方式：可注入时钟（clockRef.setTimeout 链），非真实 requestAnimationFrame
// -----------------------------------------------------------------------
// 与 013/014/015/011（task.js/task-templates.js/status-rewards.js/reward-chest.js）完全
// 一致的工程取舍：真实 rAF 的回调时间戳不受 _setClock 这类可注入时钟控制，单元测试
// （Node vm 沙箱，没有 rAF）没有办法确定性地"快进"一段帧动画并断言某一时刻应该画的是第几帧。
// 用固定节拍（TICK_MS=16，约 60Hz，与 reward-chest.js 同一取舍）的 setTimeout 链采样，
// 帧号本身用绝对时间差算出（见下方 computeFrameIndex()），不是"每次 tick 递增一个帧计数
// 器"——后者在丢帧/暂停恢复后会产生播放速度漂移，前者不会（这也是"seek-safe"的准确含义：
// 任何时刻问"现在该显示第几帧"，答案只取决于经过的绝对时间，不取决于中途 tick 了多少次）。
//
// -----------------------------------------------------------------------
// 性能红线落地（app/PERFORMANCE.md 第 3.1/3.2 节）
// -----------------------------------------------------------------------
// 1. 降采样（P0 前置）：本文件只消费 app/scripts/build-anim-assets.sh 生成的 256px cell
//    sheet（window.WTJ_ANIM_MANIFEST 里的 sheetPath 已经指向降采后的资产，不是原始 1024px
//    源文件），不做任何"原样加载再靠 CSS 缩小"的过度解码。
// 2. 单帧素材零常驻循环：frameCount<=1 的 state（如 faucet 'off'/'closed'、lamp 'off'/'on'）
//    本质是静态图，一旦真正画出过一次就不再进入 tick 循环——避免为了"重绘一张永远不变的图"
//    每 16ms 空转一次 setTimeout（见 play() 内的单帧快路径，复用 retryDrawUntilReady()）。
//    **画出之前**会持续重试直到真正画出（或确认加载失败），不是"只重试一次就放弃"——见
//    「帧未就绪 / 防御式降级」一节的 WTJ-20260705-014 根因修复说明，这条性能优化只在"已经
//    画出过至少一次"之后才生效，不会以"目标永久不可见"为代价换取这点常驻循环的节省。
// 3. idle-stop：循环动画（loop）在**已经画出过至少一次**之后，无全局活动 idleStopSec 秒后
//    暂停 tick（画面定格在当前帧，不继续消耗 CPU），有新活动（本文件自己监听的
//    pointermove/keydown/pointerdown，或任何
//    新的 play() 调用本身）时立即恢复。这是"新增循环接同一停止条件"（PERFORMANCE.md 3.1）在
//    本卡的落地方式——注意 app.js 的 IDLE_STOP_SEC/lastActivity 是它自己函数作用域内的私有
//    闭包变量，没有通过任何 window.WTJ_* API 对外暴露（app.js 本身也不允许本卡改动），本文件
//    因此实现了一份自己的、同样读取 manifest.performance.idleStopSec 数值的独立活动检测，
//    两者共享同一条配置红线，但不是同一个内部状态实例——这是"不碰其他引擎逻辑"红线下唯一可行
//    的接入方式，据实记录（见 FRAME-ANIM-API.md「与 idleStopSec 的关系」一节）。一次性动画
//    （loop:false）不受 idle-stop 影响：它们本身时长有限，播完即自然停止 tick，不需要额外的
//    无活动检测。
// 4. 禁 shadowBlur/禁 ImageBitmap/禁 OffscreenCanvas/禁 CSS steps/禁 animationend：全文件
//    未出现这些 API（Safari 14 硬约束，见文件头「语法基线」一节与 FRAME-ANIM-API.md）。
//
// -----------------------------------------------------------------------
// 道具级独立 canvas（不是全局共享 overlay）
// -----------------------------------------------------------------------
// 调用方（014/011）各自为每个道具/宝箱创建一个专属 <canvas> 元素传给 play()，本文件不维护
// 一个"全屏共享画布"来集中绘制所有道具。原因：app/web/pointer/POINTER-API.md 的命中判定是
// 对**每个注册 target 的 DOM 元素**分别调用 getBoundingClientRect() 算包围盒（见 pointer.js
// resolveBounds()），如果所有道具共用同一张铺满全屏的 canvas，这张 canvas 的包围盒永远是
// "整个屏幕"，会让 012 的点击判定失去意义（分不清点在哪个道具上）。因此本文件的设计前提是
// "canvas 元素的 DOM 包围盒 == 该道具的可点击区域"，与之前 <img> 占位的定位方式完全一致，
// 只是把内容来源从"一张静态 PNG"换成"引擎逐帧绘制的 cell"。
//
// -----------------------------------------------------------------------
// 帧未就绪 / 防御式降级
// -----------------------------------------------------------------------
// new Image() 之后调用 img.decode()（Safari 11.1+ 支持，Promise 版本）预热解码；在 decode()
// resolve（或 onload 触发、或 complete && naturalWidth>0 的同步兜底判据）之前，任何一次
// drawImage 尝试都会被静默跳过（不抛错、不 console.error，只是这一帧什么都不画），下一次
// tick 再检查一次是否就绪——不会导致播放崩溃或抛出未捕获异常（单测覆盖此分支）。
//
// **WTJ-20260705-014 根因修复（P0）：图片未就绪时必须持续重试直到真正画出第一帧，不能只
// 重试有限次就放弃。** 056 首次交付时，两条路径都只给了"恰好一次"的补救重试：① 单帧 state
// （frameCount<=1，如 faucet/lamp 的 idle 态 'off'）的 play() 快路径；② reduced-motion 分支
// runReducedMotionBranch()。若图片加载/解码耗时超过一次 TICK_MS（16ms）——在真机
// （2014 MBA / `wtjres://` scheme handler 主线程同步读盘 + 多个道具首次加载互相竞争主线程）
// 上完全可能——这一次重试仍然会失败，而旧实现在那之后永久放弃、不再排任何后续尝试，canvas
// 从此彻底空白，对孩子而言目标"不显示"。③ 多帧循环 state（如 horse 的 idle 态）虽然本身有
// 持续的 tick 重试机制，但若加载耗时超过 idleStopSec（默认 5s）且用户在这期间没有任何鼠标/
// 键盘活动，旧实现的 idle-stop 判定会在"从未成功画出过第一帧"时就把 tick 暂停掉，效果等价：
// 永久空白，直到用户终于移动鼠标才会被 markActivity() 唤醒重新尝试。三条路径本质是同一个
// 缺陷——「未画出首帧」与「放弃/暂停重试」这两件事被允许同时发生。修复：新增
// `pb.hasDrawnOnce` 标记（drawFrame() 成功时置位）+ `shouldKeepRetrying()` 判据（未画出
// 首帧且 imgEntry 未被 img.onerror 确认 failed 就应该继续重试），tick()/
// retryDrawUntilReady() 都以此为准——只有真正画出过第一帧（或确认这个 sheet 加载失败、
// 不可能再成功）之后，才允许进入"单帧不再重绘"/"到达末帧触发 onComplete"/"idle-stop 暂停"
// 这几个原有的收敛分支。见 app/web/task-templates.js「五、动效引擎接入」一节与
// tests/unit/frame-anim.test.mjs 对应新增用例（人工注入加载延迟 + 零活动窗口，复现并验证
// 修复后两条路径均不再永久空白）。
//
// -----------------------------------------------------------------------
// WTJ-20260707-007：首帧透明不算画过（014 残留缺陷，door/bell 旧机不显示的真实根因）
// -----------------------------------------------------------------------
// 014 的 hasDrawnOnce 判据有一个未覆盖的窗口：它把「drawImage() 调用没抛错」等同于「画出了
// 一帧内容」。但 isEntryReady() 的同步兜底判据是 `img.complete && naturalWidth>0`——WebKit 在
// 图片字节已加载完（complete=true、naturalWidth 已知）、但位图**尚未解码**出来的那段窗口里，
// 这个判据就已经返回 true 了。此时 drawImage 会静默画出**全透明**（不抛任何错），旧 drawFrame()
// 却据此把 hasDrawnOnce 置真——于是单帧快路径（door 的 closed / bell 的 idle / lamp 的 off /
// faucet 的 off/closed）永久停止重试，canvas 从此彻底空白。旧机（2014 MBA + `wtjres://` 主线程
// 同步读盘 + 多道具首帧解码互相抢占解码线程）上这个「complete 早于 decode 完成」的窗口足够宽，
// 门/门铃恰好落在里面，就表现为 Ethan 报的「门铃/门任务不显示」——而资产、映射、命中链路其实
// 全是对的（用干净页面直接 play() door/bell 单帧态 100% 画得出，只有在满负载解码竞争下才复现）。
// 修复：drawFrame() 在把 hasDrawnOnce 置真之前，用 firstPaintDepositedContent() 采样这一帧是否
// 真的落下了非透明像素；透明则保持 hasDrawnOnce=false，让既有的 tick/retry 循环在下一拍（解码
// 完成后）重画，直到画出真内容为止（或到 FIRST_PAINT_CONFIRM_MAX_RETRIES 安全上限、或确认加载
// 失败才收敛）。采样只发生在 hasDrawnOnce 翻真之前，稳态零开销；环境无法采样（测试 stub ctx /
// 跨源污染）时按可信放行，不回归 014 行为。这条修复对全部单帧 idle 道具通用，不只 door/bell。
//
// -----------------------------------------------------------------------
// prefers-reduced-motion
// -----------------------------------------------------------------------
// 命中时不跑 tick 循环（不消耗 CPU），改为只画一次"终帧"：loop 动画定格在第 0 帧（呼应
// "静息"语义——门/铃/水龙头/灯在没人操作时本来就该是静止的），one-shot 动画（如点击任务的
// active 态、宝箱的 opening）定格在最后一帧（保留"孩子应该看到成功/宝箱已打开"这个产品
// 意图，不能因为关闭动效就让孩子什么反馈都看不到）。timing 与 onComplete 仍然按正常时长
// 执行（one-shot 会在 getDuration() 对应的时间点触发一次 onComplete，只是中途不画中间
// 帧）——这样调用方（如 014 的 COMPLETE_VISUAL_HOLD 计算）不需要为 reduced-motion 用户
// 单独分支处理时序。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_FRAME_ANIM，Object.freeze 冻结 + 绑定加固）
// -----------------------------------------------------------------------
//   play(canvasEl, prop, state, opts)
//       opts: { loop, onComplete }，均可选。loop 显式传入时覆盖 anim-manifest 里该 state
//       的默认 loop 值（014/011 依赖这个覆盖能力：同一个 state 数据可以按"idle 强制循环
//       播/active 强制播一次定格末帧"两种不同语义复用，见 FRAME-ANIM-API.md 表格）。
//       onComplete 只在非 loop 播放到达末帧时触发一次；loop 播放永不触发（循环没有"完成"
//       这个概念）。防御式：canvasEl 非 canvas / prop+state 在 anim-manifest 里缺失（含
//       door/bell 这类整体未接入的 prop）时返回 false，不抛错，调用方应自行回退静态占位。
//       同一个 canvasEl 上重复调用 play() 会先隐式 stop() 掉这个 canvas 上前一次的播放。
//   stop(canvasEl)
//       停止该 canvas 上的播放（清掉其 tick 定时器/从内部注册表移除），画面保留最后一次
//       drawImage 的内容（不清空 canvas 本身——canvas 内容的生命周期由调用方决定，例如
//       task-templates.js 会在移除 DOM 元素之前调用 stop()，元素本身被摘除后内容自然
//       随之消失）。对未播放的 canvas 调用是安全的 no-op。
//   preload(prop, state)
//       预热加载指定 state 的 sheet（new Image() + decode()），供调用方提前触发解码、
//       减少真正 play() 时的等待。返回 boolean：prop+state 在 anim-manifest 里存在则
//       true（即便图片仍在加载中），缺失则 false。
//   getDuration(prop, state)
//       返回该 state "播完一整轮"需要的毫秒数（frameCount / fps * 1000，四舍五入），
//       与该 state 的 loop 是否为 true 无关——即使是循环动画，也返回"一个完整循环周期"
//       的时长，供调用方做时序预算（如 014 的 COMPLETE_VISUAL_HOLD 计算）。prop+state
//       缺失时返回 0。
//   getState()
//       返回 { availableProps, deferredProps, idleStopSec, activePlaybacks }，供 QA/单测
//       内省当前引擎状态，不是渲染契约的一部分。
//   _setClock(clock)
//       测试专用（与 task.js/pointer.js/task-templates.js/reward-chest.js 同款模式），
//       不是给其余生产代码调用的稳定契约。
//
// -----------------------------------------------------------------------
// 与 014/011 的分工（详见各自文件头注释与 FRAME-ANIM-API.md）
// -----------------------------------------------------------------------
//   014（task-templates.js）：per-prop idle/active 映射表（faucet/horse/lamp），door/bell
//       不在映射表内、始终回退静态 img；COMPLETE_VISUAL_HOLD 用 getDuration() 校正。
//   011（reward-chest.js）：宝箱 'opening' 态播放，复用其已有的 clockRef/_setClock，
//       烟花的错峰时间线保持独立不变（详见该文件内注释，避免打破已被单测精确锁定的时间点）。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 重复引入守卫（吸取 009~015 的教训）：本模块只应被引入一次。
  // ---------------------------------------------------------------------
  if (window.WTJ_FRAME_ANIM) {
    return;
  }

  // ---------------------------------------------------------------------
  // anim-manifest 访问器：防御式——缺失时全部 API 优雅降级为"该 prop/state 不可用"，
  // 不阻断本文件加载，也不阻断调用方（door/bell 走的正是这条路径）。
  // ---------------------------------------------------------------------
  function getAnimManifest() {
    if (window.WTJ_ANIM_MANIFEST) {
      return window.WTJ_ANIM_MANIFEST;
    }
    console.warn('[WTJ_FRAME_ANIM] window.WTJ_ANIM_MANIFEST 未找到（anim-manifest.js 未加载或加载失败），所有 play()/preload()/getDuration() 调用将返回防御式默认值。');
    return null;
  }

  var ANIM_MANIFEST = getAnimManifest();

  // v1_boundary.deferred_to_v2（见 docs/assets/production-animations-v1/manifest.json）：
  // 被刻意暂缓、anim-manifest.js 里没有条目的 prop。这份列表纯粹用来让 console.warn 的措辞更
  // 有信息量（"这个 prop 是刻意暂缓，不是配置出错"），不参与任何功能判断——即使不维护这份
  // 列表，getStateConfig() 在 ANIM_MANIFEST 里查不到 prop 时同样返回 null，调用方的防御式回退
  // 不依赖它存在。**WTJ-20260705-025：door/bell 已接入（移入 v1_boundary.included），当前
  // 没有任何 deferred prop，故此列表为空；未来若再暂缓某 prop，把它加进来即可（纯提示用途）。**
  var DEFERRED_V2_PROPS = [];

  function inList(list, value) {
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] === value) {
        return true;
      }
    }
    return false;
  }

  function getStateConfig(prop, state) {
    if (!ANIM_MANIFEST) {
      return null;
    }
    if (typeof prop !== 'string' || !prop) {
      return null;
    }
    var propCfg = ANIM_MANIFEST[prop];
    if (!propCfg) {
      if (inList(DEFERRED_V2_PROPS, prop)) {
        console.warn('[WTJ_FRAME_ANIM] prop "' + prop + '" 属于 v1_boundary.deferred_to_v2（DESIGN 素材验收未通过，上游依赖 DESIGN 补齐 v2 版本后重跑 app/scripts/build-anim-assets.sh 即可自动纳入），本引擎未接入，调用方应回退静态占位。');
      } else {
        console.warn('[WTJ_FRAME_ANIM] 未知 prop "' + prop + '"，anim-manifest.js 无对应配置，已忽略。');
      }
      return null;
    }
    var stateCfg = propCfg[state];
    if (!stateCfg) {
      console.warn('[WTJ_FRAME_ANIM] prop "' + prop + '" 缺少 state "' + String(state) + '" 的配置，已忽略。');
      return null;
    }
    return stateCfg;
  }

  // ---------------------------------------------------------------------
  // manifest.js 访问器（仅用于 idleStopSec；与 app.js/task-templates.js 等同款防御式回退）。
  // ---------------------------------------------------------------------
  function getManifest() {
    if (window.WTJ_MANIFEST) {
      return window.WTJ_MANIFEST;
    }
    console.warn('[WTJ_FRAME_ANIM] window.WTJ_MANIFEST 未找到（manifest.js 未加载或加载失败），idle-stop 回退到内置默认值 5 秒。');
    return null;
  }

  var MANIFEST = getManifest();
  var DEFAULT_IDLE_STOP_SEC = 5; // 镜像 manifest.js performance.idleStopSec 的既有默认值。

  function getIdleStopSec() {
    if (MANIFEST && MANIFEST.performance && typeof MANIFEST.performance.idleStopSec === 'number' && MANIFEST.performance.idleStopSec > 0) {
      return MANIFEST.performance.idleStopSec;
    }
    return DEFAULT_IDLE_STOP_SEC;
  }

  // ---------------------------------------------------------------------
  // 可注入时钟（默认真实 setTimeout/clearTimeout/Date.now；测试用 _setClock 整体或部分
  // 替换，与 013/014/015/011 同款模式）。
  // ---------------------------------------------------------------------
  var clockRef = {
    setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimeout: function (id) { clearTimeout(id); },
    now: function () { return Date.now(); }
  };

  function _setClock(clock) {
    if (!clock || typeof clock !== 'object') {
      console.warn('[WTJ_FRAME_ANIM] _setClock: 参数必须是对象，已忽略。');
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
  // prefers-reduced-motion 检测：与 reward-chest.js/status-rewards.js 同款实现。
  // ---------------------------------------------------------------------
  function prefersReducedMotion() {
    // WTJ-20260706-013：kiosk 儿童 app 默认无视 OS「减弱动态」偏好，核心学习动画照播——
    // 旧 Mac（2014 MBA/Big Sur）等机型的系统「减弱动态」常默认开启，且并非 Justin 为这台
    // kiosk 主动选择的偏好。只有 manifest.js 的 performance.honorReducedMotion 显式为
    // true（未来家长设置钩子）时才回头尊重 OS matchMedia；缺省/非 true 一律当作"不尊重"。
    if (!(window.WTJ_MANIFEST && window.WTJ_MANIFEST.performance && window.WTJ_MANIFEST.performance.honorReducedMotion === true)) {
      return false;
    }
    try {
      if (typeof window.matchMedia === 'function') {
        var mql = window.matchMedia('(prefers-reduced-motion: reduce)');
        return !!(mql && mql.matches);
      }
    } catch (err) {
      console.warn('[WTJ_FRAME_ANIM] matchMedia 检测失败，按不启用 reduced-motion 处理，已捕获：', err);
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // sheet Image 缓存：按 sheetPath 去重，避免同一个 state 被多次 new Image()/重复下载解码。
  // preload()/play() 共用这份缓存。
  // ---------------------------------------------------------------------
  var imageCache = {}; // sheetPath -> { img, ready, failed }

  function getOrCreateImageEntry(sheetPath) {
    if (Object.prototype.hasOwnProperty.call(imageCache, sheetPath)) {
      return imageCache[sheetPath];
    }
    var entry = { img: null, ready: false, failed: false };
    imageCache[sheetPath] = entry;
    try {
      var img = new Image();
      entry.img = img;
      img.onload = function () {
        entry.ready = true;
      };
      img.onerror = function () {
        entry.failed = true;
        console.error('[WTJ_FRAME_ANIM] sheet 加载失败: ' + sheetPath);
      };
      img.src = sheetPath;
      // Safari 11.1+ 起可用：主动预热解码。decode() 失败（比如尚未挂进文档树的极少数实现）
      // 不算致命——onload/naturalWidth 的同步兜底判据（见 isEntryReady()）仍然可能就绪。
      if (typeof img.decode === 'function') {
        img.decode().then(
          function () { entry.ready = true; },
          function () { /* 静默：仍有 onload/naturalWidth 兜底，不重复报错。*/ }
        );
      }
    } catch (err) {
      entry.failed = true;
      console.error('[WTJ_FRAME_ANIM] 创建 Image 失败，已捕获：', err);
    }
    return entry;
  }

  function isEntryReady(entry) {
    if (!entry || !entry.img) {
      return false;
    }
    if (entry.ready) {
      return true;
    }
    try {
      if (entry.img.complete && entry.img.naturalWidth > 0) {
        entry.ready = true;
        return true;
      }
    } catch (err) {
      // 忽略：部分测试 stub 的 Image 对象可能不提供 complete/naturalWidth，按未就绪处理。
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // 播放注册表：数组 + 引用相等查找（与本项目其余引擎"小规模场景下用数组不用 Map"的既有
  // 风格一致，同一时刻并发播放的 canvas 数量很小，几个至十几个量级，线性扫描足够）。
  // ---------------------------------------------------------------------
  var playbacks = [];
  var TICK_MS = 16; // ~60Hz 采样节拍，与 reward-chest.js 的 TICK_MS 同一取舍，见文件头说明。

  function findPlaybackIndex(canvasEl) {
    var i;
    for (i = 0; i < playbacks.length; i++) {
      if (playbacks[i].canvasEl === canvasEl) {
        return i;
      }
    }
    return -1;
  }

  function isActivePlayback(pb) {
    return playbacks.indexOf(pb) !== -1;
  }

  function frameCountOf(cfg) {
    return (typeof cfg.frameCount === 'number' && cfg.frameCount > 0) ? cfg.frameCount : 1;
  }

  function fpsOf(cfg) {
    return (typeof cfg.fps === 'number' && cfg.fps > 0) ? cfg.fps : 1;
  }

  function cellSizeOf(cfg) {
    return (typeof cfg.cellSize === 'number' && cfg.cellSize > 0) ? cfg.cellSize : 256;
  }

  function getDurationMsFromCfg(cfg) {
    return Math.round((frameCountOf(cfg) / fpsOf(cfg)) * 1000);
  }

  // 绝对时间推帧号（seek-safe，见文件头「计时驱动方式」一节）：不依赖 tick 调用次数，只依赖
  // "现在" 与 "播放起点" 的时间差。loop 取模回绕；非 loop 到达末帧后 clamp 定住不再前进。
  function computeFrameIndex(pb, now) {
    var fps = fpsOf(pb.cfg);
    var frameCount = frameCountOf(pb.cfg);
    var elapsedSec = (now - pb.startTime) / 1000;
    var rawFrame = Math.floor(elapsedSec * fps);
    if (rawFrame < 0) {
      rawFrame = 0;
    }
    if (pb.loop) {
      return frameCount > 0 ? (rawFrame % frameCount) : 0;
    }
    if (rawFrame >= frameCount - 1) {
      return frameCount - 1;
    }
    return rawFrame;
  }

  // WTJ-20260707-007 根因修复：确认"刚画的这一帧真的落下了非透明像素"。isEntryReady() 的同步
  // 兜底判据（img.complete && naturalWidth>0）在 WebKit「已 complete、但位图尚未解码完成」的
  // 窗口里会返回 true——尤其在旧机（2014 MBA / `wtjres://` 主线程同步读盘 + 多道具首帧解码互相
  // 抢占解码线程）上，这个窗口足够宽，drawImage 会静默画出**全透明**（不抛错）。若据此把
  // hasDrawnOnce 置 true，单帧快路径（frameCount<=1，如 door 的 closed、bell 的 idle）就会永久
  // 停止重试，canvas 从此彻底空白——这正是 Justin 旧机上门/门铃任务「不显示」的根因。014 只修
  // 了「首帧真正 drawImage 之前不放弃/不 idle-stop」，但没覆盖「drawImage 调用成功、画的却是
  // 透明」这一步——drawFrame() 旧实现只要 drawImage 不抛错就无条件置位 hasDrawnOnce。
  //
  // 采样只在 hasDrawnOnce 翻真之前发生（正常只有开头一两拍，一旦确认落像素即永不再采），不是每帧
  // 常驻开销，不违反 PERFORMANCE.md「禁每帧 getImageData」的稳态红线。防御式：环境无法采样时
  // （单元测试的 fake ctx 无 getImageData / canvas 尚无尺寸 / 跨源污染 security 抛错）一律当作
  // 「可信」返回 true，绝不因为无法核验就把一个本来画好的帧误判为空白、陷入无谓重绘——即"宁可
  // 漏判空白（退回 014 既有行为），不可误判已画好的帧为空白"。见 tests/unit/frame-anim.test.mjs
  // 新增用例与 tests/e2e/door_bell_click_webkit.py。
  function firstPaintDepositedContent(pb) {
    try {
      if (!pb.ctx || typeof pb.ctx.getImageData !== 'function') {
        return true; // 无法采样（如测试 stub ctx）：不阻塞，退回 014 既有语义。
      }
      var w = pb.canvasEl.width;
      var h = pb.canvasEl.height;
      if (!(w > 0 && h > 0)) {
        return true; // canvas 尚无像素尺寸，无从采样：同样不阻塞。
      }
      var data = pb.ctx.getImageData(0, 0, w, h).data;
      var i;
      for (i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) {
          return true; // 找到任一非透明像素：这一帧确实画上了内容。
        }
      }
      return false; // 全透明：drawImage 画了个寂寞（位图多半尚未解码），本帧不算数。
    } catch (err) {
      // getImageData 因跨源污染/安全策略/stub 不完整抛错——无法核验，按可信处理（不回归、不空转）。
      return true;
    }
  }

  // 采样确认首帧的安全上限（~10s @16ms tick）：真实素材解码完成后必然落下非透明像素，远早于此；
  // 这个上限只是兜底防止「加载成功却解码成全透明」这种理论上不该出现的坏素材导致无限重绘 tick。
  // 到达上限即认定「画过一次」放行收敛（与 014「确认 img.onerror 失败后放弃」同属有界收敛，只是
  // 这条针对的是「加载成功但始终画不出像素」这条 014 未覆盖的退化路径）。
  var FIRST_PAINT_CONFIRM_MAX_RETRIES = 600;

  function drawFrame(pb, frameIndex) {
    if (!isEntryReady(pb.imgEntry)) {
      return; // 帧未就绪：静默跳过（不抛错），下次再试，见文件头「帧未就绪」一节。
    }
    var cell = cellSizeOf(pb.cfg);
    var sx = frameIndex * cell;
    try {
      pb.ctx.clearRect(0, 0, pb.canvasEl.width, pb.canvasEl.height);
      pb.ctx.drawImage(pb.imgEntry.img, sx, 0, cell, cell, 0, 0, pb.canvasEl.width, pb.canvasEl.height);
      // WTJ-20260705-014 + WTJ-20260707-007 根因修复：只有当这一帧**真的落下了非透明像素**（或
      // 环境无法采样、或已到安全上限）时，才标记"这个 canvas 至少真正画出过一次内容"。tick()/
      // retryDrawUntilReady() 用 hasDrawnOnce 决定是否还能安全地放弃/暂停重试——见两者内联注释、
      // firstPaintDepositedContent() 上方说明，与文件头「WTJ-20260707-007：首帧透明不算画过」一节。
      if (!pb.hasDrawnOnce) {
        if (firstPaintDepositedContent(pb) || pb.blankPaintRetries >= FIRST_PAINT_CONFIRM_MAX_RETRIES) {
          pb.hasDrawnOnce = true;
        } else {
          pb.blankPaintRetries++;
        }
      }
    } catch (err) {
      console.error('[WTJ_FRAME_ANIM] drawImage 失败，已捕获：', err);
    }
  }

  // 图片尚未就绪（或从未成功绘制过）时是否应该继续重试的统一判据：只要还没有真正画出过第一帧
  // 且没有被确认加载失败，就应该继续重试——见下方 retryDrawUntilReady()/tick() 两处消费方。
  function shouldKeepRetrying(pb) {
    return !pb.hasDrawnOnce && !(pb.imgEntry && pb.imgEntry.failed);
  }

  function fireOnCompleteOnce(pb) {
    if (pb.completeFired) {
      return;
    }
    pb.completeFired = true;
    if (pb.onComplete) {
      try {
        pb.onComplete();
      } catch (err) {
        console.error('[WTJ_FRAME_ANIM] onComplete 回调抛出异常，已捕获：', err);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 全局活动检测（idle-stop，仅对 loop 播放生效）：见文件头「性能红线落地」第 3 点。
  // 任意一次新的 play() 调用本身也算作一次活动（新任务/新宝箱出现，本来就意味着刚有交互），
  // 与真实 pointermove/keydown/pointerdown 事件共同驱动同一份"最近活动时间"。
  // ---------------------------------------------------------------------
  var lastActivityAt = null;

  function markActivity() {
    lastActivityAt = clockRef.now();
    var i;
    for (i = 0; i < playbacks.length; i++) {
      var pb = playbacks[i];
      if (pb.idlePaused) {
        pb.idlePaused = false;
        scheduleTick(pb);
      }
    }
  }

  function isGloballyIdle(now) {
    if (lastActivityAt === null) {
      return false; // 尚无活动基线，不判定为 idle（避免"从未有过任何活动"就被误判为空闲）。
    }
    return (now - lastActivityAt) >= (getIdleStopSec() * 1000);
  }

  (function wireActivityListeners() {
    try {
      if (typeof window.addEventListener === 'function') {
        window.addEventListener('pointermove', markActivity, false);
        window.addEventListener('pointerdown', markActivity, false);
        window.addEventListener('mousemove', markActivity, false);
        window.addEventListener('keydown', markActivity, false);
      }
    } catch (err) {
      console.error('[WTJ_FRAME_ANIM] 注册全局活动监听失败，已捕获：', err);
    }
  })();

  // ---------------------------------------------------------------------
  // tick 循环（多帧、非 reduced-motion 播放）
  // ---------------------------------------------------------------------
  function scheduleTick(pb) {
    pb.tickTimerId = clockRef.setTimeout(function () {
      tick(pb);
    }, TICK_MS);
  }

  function tick(pb) {
    pb.tickTimerId = null;
    if (!isActivePlayback(pb)) {
      return; // 已被 stop() 移出注册表（如任务 cleanup 提前摘除 canvas），不再继续。
    }

    var now = clockRef.now();
    var frameCount = frameCountOf(pb.cfg);
    var frameIndex = computeFrameIndex(pb, now);
    drawFrame(pb, frameIndex); // 成功时会把 pb.hasDrawnOnce 置 true，见 drawFrame() 内联注释。

    // WTJ-20260705-014 根因修复（P0，真机复现：justin.local 上 click-faucet-on/
    // click-horse-run 任务的目标道具整场不可见）：在"这个 canvas 从未真正画出过一帧"期间，
    // 不允许因为"到达末帧"或"全局 idle 超过 idleStopSec"这两个分支而放弃/暂停继续尝试——
    // 旧实现只要中途命中这两个分支之一就会永久停止排 tick，如果那一刻恰好图片仍未加载/解码
    // 完成（真机上完全可能：`wtjres://` scheme handler 在主线程同步读盘 + 多个道具首次加载
    // 互相竞争主线程 + 2014 MBA 级别硬件解码耗时更长），canvas 会永久保持完全透明，对孩子
    // 而言目标"不显示"——这正是本卡用 Playwright + WebKit 人工注入加载延迟复现出的两条实测
    // 路径：① faucet/lamp 的 idle 态是单帧 state（frameCount<=1），旧实现只重试一次就放弃；
    // ② horse 的 idle 态虽是多帧循环，但若加载耗时超过 idleStopSec（默认 5s）且用户在这
    // 期间没有任何鼠标/键盘活动（3 岁小孩盯着屏幕看、还没碰任何东西完全是常态），idle-stop
    // 会在"从未成功画出过第一帧"的情况下把 tick 暂停掉，同样导致永久空白直到用户终于移动
    // 鼠标才会被 markActivity() 唤醒——见 tests/unit/frame-anim.test.mjs 新增用例复现两条
    // 路径。只要图片还有可能变成功（未被 img.onerror 确认 failed）就应该持续重试；一旦确认
    // failed（不可能再成功），才允许放弃，避免对一个真正 404 的资源无限空转 tick。
    if (shouldKeepRetrying(pb)) {
      scheduleTick(pb);
      return;
    }
    if (!pb.hasDrawnOnce) {
      // 走到这里说明 shouldKeepRetrying() 返回 false 且 hasDrawnOnce 仍是 false，即
      // pb.imgEntry.failed 已确认——没有恢复可能，放弃重试（不追加 fireOnCompleteOnce，
      // 维持"onComplete 只在真正播放到位时触发"的既有语义，见文件头 onComplete 时序说明）。
      return;
    }

    if (frameCount <= 1) {
      // 单帧素材：已经成功画出过，不需要继续 tick（性能优化，见文件头「性能红线落地」
      // 第 2 点——一张恒定不变的图没有必要每 16ms 重绘一次）。
      return;
    }

    var isLastFrame = (!pb.loop) && (frameIndex >= frameCount - 1);
    if (isLastFrame) {
      fireOnCompleteOnce(pb);
      return; // 非循环且已到末帧：自然收敛，不再排下一次 tick。
    }

    if (pb.loop && isGloballyIdle(now)) {
      pb.idlePaused = true;
      return; // 暂停排新 tick，画面定格在当前帧，等待 markActivity() 唤醒。
    }

    scheduleTick(pb);
  }

  // ---------------------------------------------------------------------
  // reduced-motion 分支：只画一次终帧，一次性动画仍按正常时长安排 onComplete。
  // ---------------------------------------------------------------------
  function terminalFrameIndex(pb) {
    if (pb.loop) {
      return 0; // 循环/idle → 静息在首帧。
    }
    return frameCountOf(pb.cfg) - 1; // 一次性 → 定格末帧（保留"看到成功"的产品意图）。
  }

  // WTJ-20260705-014 根因修复：图片尚未就绪时持续重试直到真正画出第一帧（或确认加载失败）
  // 为止——旧实现只安排"恰好一次"轻量重试，重试时若仍未就绪就永久放弃，是 014 卡复现出的
  // 同一类"目标永久不可见"根因在 reduced-motion 路径下的等价版本。frameCount<=1 的常规
  // play() 快路径也复用本函数（见下方 play()），两处共享同一条"直到画出为止再停"的重试逻辑，
  // 不再各自维护一份"只重试一次"的特判代码。
  function retryDrawUntilReady(pb, frameIndex) {
    drawFrame(pb, frameIndex); // 成功时置 pb.hasDrawnOnce = true。
    if (!shouldKeepRetrying(pb)) {
      return; // 已经画出过，或已确认加载失败、不可能再成功——停止重试。
    }
    pb.tickTimerId = clockRef.setTimeout(function () {
      pb.tickTimerId = null;
      if (isActivePlayback(pb)) {
        retryDrawUntilReady(pb, frameIndex);
      }
    }, TICK_MS);
  }

  function runReducedMotionBranch(pb) {
    var idx = terminalFrameIndex(pb);
    retryDrawUntilReady(pb, idx);
    if (!pb.loop) {
      var durationMs = getDurationMsFromCfg(pb.cfg);
      clockRef.setTimeout(function () {
        if (isActivePlayback(pb)) {
          fireOnCompleteOnce(pb);
        }
      }, durationMs);
    }
  }

  // ---------------------------------------------------------------------
  // stop()：清 tick，移出注册表。对不存在/未播放的 canvas 是安全 no-op。
  // ---------------------------------------------------------------------
  function stop(canvasEl) {
    var idx = findPlaybackIndex(canvasEl);
    if (idx === -1) {
      return;
    }
    var pb = playbacks[idx];
    if (pb.tickTimerId !== null) {
      clockRef.clearTimeout(pb.tickTimerId);
      pb.tickTimerId = null;
    }
    playbacks.splice(idx, 1);
  }

  // ---------------------------------------------------------------------
  // play()：见文件头 API 说明。
  // ---------------------------------------------------------------------
  function play(canvasEl, prop, state, opts) {
    opts = (opts && typeof opts === 'object') ? opts : {};

    if (!canvasEl || typeof canvasEl.getContext !== 'function') {
      console.warn('[WTJ_FRAME_ANIM] play(): canvasEl 缺失或不是有效的 canvas 元素，已忽略。');
      return false;
    }

    var cfg = getStateConfig(prop, state);
    if (!cfg) {
      return false; // 防御式：调用方（如 014/011）应据此回退静态占位（door/bell 等走这条路径）。
    }

    var ctx2d;
    try {
      ctx2d = canvasEl.getContext('2d');
    } catch (err) {
      console.error('[WTJ_FRAME_ANIM] canvasEl.getContext("2d") 调用失败，已捕获：', err);
      return false;
    }
    if (!ctx2d) {
      console.warn('[WTJ_FRAME_ANIM] play(): canvasEl.getContext("2d") 返回空，已忽略。');
      return false;
    }

    markActivity(); // 一次新的 play() 调用本身也算作一次全局活动（见「全局活动检测」一节）。
    stop(canvasEl); // 同一个 canvas 上只应有一个播放态：先停掉旧的。

    var loop = (typeof opts.loop === 'boolean') ? opts.loop : !!cfg.loop;
    var onComplete = (typeof opts.onComplete === 'function') ? opts.onComplete : null;
    var cell = cellSizeOf(cfg);

    try {
      canvasEl.width = cell;
      canvasEl.height = cell;
    } catch (err) {
      console.error('[WTJ_FRAME_ANIM] 设置 canvas 像素尺寸失败，已捕获：', err);
    }

    var pb = {
      canvasEl: canvasEl,
      ctx: ctx2d,
      prop: prop,
      state: state,
      cfg: cfg,
      imgEntry: getOrCreateImageEntry(cfg.sheetPath),
      loop: loop,
      onComplete: onComplete,
      startTime: clockRef.now(),
      tickTimerId: null,
      completeFired: false,
      idlePaused: false,
      // WTJ-20260705-014：这个 canvas 是否已经真正成功 drawImage 过至少一次——见 drawFrame()/
      // tick()/retryDrawUntilReady() 三处的根因修复说明。图片已经就绪（例如复用 preload() 或
      // 上一次 play() 留下的缓存）时会在下面的首次 drawFrame() 调用里立即变 true。
      // WTJ-20260707-007：hasDrawnOnce 现在要求首帧真的落下非透明像素才置位（见 drawFrame()/
      // firstPaintDepositedContent()），blankPaintRetries 记录「isEntryReady 已 true、drawImage
      // 也调用了、却画出全透明」的次数，到达 FIRST_PAINT_CONFIRM_MAX_RETRIES 安全上限后放行收敛。
      hasDrawnOnce: false,
      blankPaintRetries: 0,
      reducedMotion: prefersReducedMotion()
    };
    playbacks.push(pb);

    var frameCount = frameCountOf(cfg);
    if (frameCount <= 1) {
      // 单帧素材：一旦画出过就永远不需要再进 tick 循环（性能优化，见文件头「性能红线落地」
      // 第 2 点）。但"画出过"之前不能只重试一次就放弃——见 retryDrawUntilReady() 与
      // WTJ-20260705-014 根因修复说明，这里复用同一份"持续重试直到画出/确认失败为止"的逻辑，
      // 不再是本函数独有的一次性重试特判。
      retryDrawUntilReady(pb, 0);
      if (!pb.loop) {
        var singleDur = getDurationMsFromCfg(cfg);
        clockRef.setTimeout(function () {
          if (isActivePlayback(pb)) {
            fireOnCompleteOnce(pb);
          }
        }, singleDur);
      }
      return true;
    }

    if (pb.reducedMotion) {
      runReducedMotionBranch(pb);
    } else {
      scheduleTick(pb);
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // preload() / getDuration() / getState()
  // ---------------------------------------------------------------------
  function preload(prop, state) {
    var cfg = getStateConfig(prop, state);
    if (!cfg) {
      return false;
    }
    getOrCreateImageEntry(cfg.sheetPath);
    return true;
  }

  function getDuration(prop, state) {
    var cfg = getStateConfig(prop, state);
    if (!cfg) {
      return 0;
    }
    return getDurationMsFromCfg(cfg);
  }

  function getState() {
    var availableProps = [];
    if (ANIM_MANIFEST) {
      var key;
      for (key in ANIM_MANIFEST) {
        if (Object.prototype.hasOwnProperty.call(ANIM_MANIFEST, key)) {
          availableProps.push(key);
        }
      }
    }
    var activePlaybacks = [];
    var i;
    for (i = 0; i < playbacks.length; i++) {
      var pb = playbacks[i];
      activePlaybacks.push({
        prop: pb.prop,
        state: pb.state,
        loop: pb.loop,
        reducedMotion: pb.reducedMotion,
        idlePaused: !!pb.idlePaused,
        completeFired: !!pb.completeFired,
        // WTJ-20260705-014：暴露给 QA/单测内省——"这个 canvas 是否已经真正画出过至少一帧"，
        // 用于诊断"目标不可见"类问题时区分"还在等图片就绪"与"其余原因导致的空白"。
        hasDrawnOnce: !!pb.hasDrawnOnce
      });
    }
    return {
      availableProps: availableProps,
      deferredProps: DEFERRED_V2_PROPS.slice(),
      idleStopSec: getIdleStopSec(),
      activePlaybacks: activePlaybacks
    };
  }

  // ---------------------------------------------------------------------
  // 对外冻结 API
  // ---------------------------------------------------------------------
  var API = {
    VERSION: '0.1.0',
    CARD_ID: 'WTJ-20260704-056',

    play: play,
    stop: stop,
    preload: preload,
    getDuration: getDuration,
    getState: getState,

    // 测试专用，见文件头 API 列表说明；不是给其余生产代码调用的稳定契约。
    _setClock: _setClock
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  // 绑定加固：与 009~015 同款——API 对象自身已 Object.freeze，这里进一步把 window 上的
  // WTJ_FRAME_ANIM 绑定本身设为不可写、不可重配置，防止整体重赋值把状态换掉。重复引入已由
  // IIFE 顶部守卫短路，走不到这里，因此到达时 window.WTJ_FRAME_ANIM 必为未定义；下面判断
  // 只是二次保险（兼容无 defineProperty 环境）。
  if (!window.WTJ_FRAME_ANIM && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_FRAME_ANIM', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_FRAME_ANIM) {
    window.WTJ_FRAME_ANIM = API;
  }
})();
