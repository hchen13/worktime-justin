// WTJ-20260704-086 — 非字母键 subtle 视觉反馈引擎（window.WTJ_KEYVISUAL）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function 声明式，不用箭头函数 / let /
// const / 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求、非 module（无 import/export），
// 以普通 <script src="keyvisual.js"> 标签加载，需排在 keyboard.js 之后（订阅
// window.WTJ_KEYBOARD.onFunctionKey）、app.js 之前（app.js 的 draw() 循环里调用本文件暴露的
// draw()/getStageLightBoost() 把反馈画到同一张 #stage canvas 上，见 app/web/app.js 顶部注释）。
//
// 职责边界（086 卡「视觉侧」，与 084 音频侧平行）：本文件只做"keyboard.js 已判定好的功能键
// 事件 → 计算一个 subtle 视觉反馈描述（环/微光/涟漪）→ 画到 canvas"，不做任何按键判定/衰减
// 计算——分类（light/weak/other）与 intensity 衰减曲线都已经由 keyboard.js（008）完成，本文件
// 只消费其事件 payload。字母/数字键的可视化（弹出/字形/motion）归 letter-motion.js + app.js，
// 与本文件是两条平行管线（091 分工：header/字母字形/字母动效/非字母键视觉反馈都是 086，但字母
// 与非字母各自独立实现，互不调用）。本文件不做任何音频（不改 audio.js/keysound.js，与 084 的
// onFunctionKey 订阅并存——keyboard.js 的 functionKeySubscribers 支持多订阅者，见该文件
// emit() 实现，两边互不干扰）。
//
// -----------------------------------------------------------------------
// 复用 app.js 的单一 canvas + rAF 循环（不新开 canvas/rAF）
// -----------------------------------------------------------------------
// app/PERFORMANCE.md 第 3.1 节明确建议"画布数量尽量单一，新增循环开销需要在既有帧成本基线
// 之上评估"。本文件不自建 canvas/rAF，而是把内部反馈项列表暴露为 draw(ctx, now)，由 app.js
// 现有 draw() 函数在每帧末尾调用（与 drawTrail/drawRings/drawLetters 同一节奏），这样"是否
// 继续渲染/何时暂停"仍然完全由 app.js 既有的 5 秒无输入自动停止规则统一控制，不会新增第二套
// 计时器/暂停逻辑。
//
// -----------------------------------------------------------------------
// clockRef 可测性（与 task.js/status-rewards.js/reward-chest.js/pointer.js 同款约定）
// -----------------------------------------------------------------------
// 反馈项的 born 时间戳通过内部 clock.now() 取得，可用 _setClock() 注入假时钟——单测因此可以
// 确定性地推进时间断言 draw() 在特定时刻画出的透明度/半径/是否已过期清除，不依赖真实
// performance.now()/setTimeout 的不确定调度。
//
// -----------------------------------------------------------------------
// 各分类的视觉反馈设计（对照 docs/design/wtj-081-main-ui-visual-motion-spec.md
// 「Non-Letter Key Feedback」一节 + docs/assets/style/wtj-081/non-letter-feedback-frames.svg）
// -----------------------------------------------------------------------
//   category='light'（Space/Enter）  -> 'ring'：360ms 低透明度扩张圆环，起始半径 18px 到
//                                      96px，描边 rgba(94,231,255,0.42)（随 intensity 与
//                                      (1-t) 衰减）。锚点优先用 WTJ_POINTER 最近指针位置
//                                      （"or current pointer location if available"），
//                                      否则退回舞台下方居中安全区。可选地在 140ms 内让
//                                      app.js 背景径向光轻微提亮 4%（getStageLightBoost()）。
//   category='weak'（修饰键）        -> 'glint'：220ms 微光，最大不透明度 0.22，锚点固定在
//                                      左下角状态灯附近（与 081"lower-left status area,
//                                      do not create a new object"呼应，不新增独立舞台物件，
//                                      只是一个很小的低调光点）。
//   category='other'（标点/方向键等）-> 'ripple'：260ms 极小涟漪，最大不透明度 0.25，最大
//                                      发光半径不超过 40px。
//   全部三类都不产生奖励槽/计数（081："No reward slot, no count increment"）——本文件从不
//   调用 WTJ_SLOTS/WTJ_HUD 的任何写入 API，天然满足这一条。
//   intensity 越低视觉越弱：三类反馈的透明度都乘以 keyboard.js 算出的 intensity（该值本身
//   已经随同键连打衰减到接近 0，见 keyboard.js FUNCTION_KEY_DECAY_SPAN），intensity 极低
//   （<=0.02）时直接跳过整个反馈，不产生 canvas 绘制，与 app.js 现有
//   "trailIntensity <= 0.02 跳过"同款 epsilon 约定保持一致。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_KEYVISUAL，Object.freeze 冻结）
// -----------------------------------------------------------------------
//   computeFeedbackSpec(payload)  纯函数：{key,category,intensity} -> 反馈描述对象，或
//                                 intensity 过低时返回 null（不产生反馈）。不依赖 canvas/
//                                 DOM，可直接单测。
//   draw(ctx, now, width, height) 供 app.js 每帧调用；按当前存活的反馈项画到 ctx 上，过期项
//                                 自动从内部列表移除。
//   getStageLightBoost(now)       返回当前应叠加到背景径向光上的额外不透明度（0 ~
//                                 spaceEnter.stageLightBoost），随 140ms 窗口线性衰减，
//                                 supply 给 app.js 的背景渲染。
//   getActiveCount()              当前存活反馈项数量（供单测/调试内省）。
//   _setClock(fn)                 测试注入时钟（同款 reward-chest.js/pointer.js 约定）。
//   TOKENS                        081 functionKeyFeedback token 只读镜像（与
//                                 letter-motion.js 的 TOKENS.functionKeyFeedback 一致）。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  // 重复引入守卫（同款 pointer.js/audio.js/keysound.js 的教训）。
  if (window.WTJ_KEYVISUAL) {
    return;
  }

  // ---------------------------------------------------------------------
  // token（与 letter-motion.js 的 TOKENS.functionKeyFeedback 逐字段一致；本文件不强依赖
  // letter-motion.js 是否已加载——两个模块都各自持有一份只读 token 抄本，避免加载顺序耦合）。
  // ---------------------------------------------------------------------
  var TOKENS = {
    spaceEnter: {
      category: 'light',
      durationMs: 360,
      ringRadiusPx: [18, 96],
      ringStroke: 'rgba(94,231,255,0.42)',
      stageLightBoost: 0.04
    },
    modifiers: {
      category: 'weak',
      durationMs: 220,
      maxOpacity: 0.22
    },
    punctuationArrowsOther: {
      category: 'other',
      durationMs: 260,
      maxOpacity: 0.25,
      maxGlowPx: 40
    }
  };

  if (Object.freeze) {
    Object.freeze(TOKENS.spaceEnter);
    Object.freeze(TOKENS.modifiers);
    Object.freeze(TOKENS.punctuationArrowsOther);
    Object.freeze(TOKENS);
  }

  var INTENSITY_EPSILON = 0.02; // 与 app.js 现有 pointer 尾迹/圆环的下限跳过约定一致

  // ---------------------------------------------------------------------
  // 可注入时钟
  // ---------------------------------------------------------------------
  var clock = {
    now: function () {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
      }
      return Date.now();
    }
  };

  function _setClock(fn) {
    if (typeof fn === 'function') {
      clock.now = fn;
    }
  }

  // ---------------------------------------------------------------------
  // reduced-motion 检测：与 frame-anim.js/reward-chest.js/letter-motion.js 同款实现。
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
      console.warn('[WTJ_KEYVISUAL] matchMedia 检测失败，按不启用 reduced-motion 处理，已捕获：', err);
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // 纯函数：payload -> 反馈描述（不产生任何副作用，供内部与单测共用）
  // ---------------------------------------------------------------------
  function computeFeedbackSpec(payload) {
    if (!payload) return null;
    var intensity = (typeof payload.intensity === 'number') ? payload.intensity : 0;
    if (intensity <= INTENSITY_EPSILON) {
      return null; // 081："consecutive same function key should visibly decay to near-zero"
    }
    var category = payload.category;
    if (category === 'light') {
      return {
        kind: 'ring',
        category: category,
        intensity: intensity,
        durationMs: TOKENS.spaceEnter.durationMs,
        startRadius: TOKENS.spaceEnter.ringRadiusPx[0],
        endRadius: TOKENS.spaceEnter.ringRadiusPx[1],
        stroke: TOKENS.spaceEnter.ringStroke,
        stageLightBoost: TOKENS.spaceEnter.stageLightBoost
      };
    }
    if (category === 'weak') {
      return {
        kind: 'glint',
        category: category,
        intensity: intensity,
        durationMs: TOKENS.modifiers.durationMs,
        maxOpacity: TOKENS.modifiers.maxOpacity
      };
    }
    // category === 'other'（含未来新增/未知分类的防御式兜底，与 keysound.js 同款兜底哲学）。
    return {
      kind: 'ripple',
      category: 'other',
      intensity: intensity,
      durationMs: TOKENS.punctuationArrowsOther.durationMs,
      maxOpacity: TOKENS.punctuationArrowsOther.maxOpacity,
      maxGlowPx: TOKENS.punctuationArrowsOther.maxGlowPx
    };
  }

  // ---------------------------------------------------------------------
  // 锚点：ring 优先用 WTJ_POINTER 最近指针位置，否则退回舞台下方居中安全区；
  // glint 固定在左下角状态灯附近（081："lower-left status area, do not create a new object"）；
  // ripple 与 ring 共用指针位置回退逻辑（081 未对 other 类别的位置做强约束）。
  // ---------------------------------------------------------------------
  function viewportSize() {
    var w = (typeof window.innerWidth === 'number') ? window.innerWidth : 800;
    var h = (typeof window.innerHeight === 'number') ? window.innerHeight : 600;
    return { w: w, h: h };
  }

  function pointerOrStagePos() {
    try {
      if (window.WTJ_POINTER && typeof window.WTJ_POINTER.getPointerState === 'function') {
        var st = window.WTJ_POINTER.getPointerState();
        if (st && (st.x || st.y)) {
          return { x: st.x, y: st.y };
        }
      }
    } catch (err) {
      console.warn('[WTJ_KEYVISUAL] window.WTJ_POINTER.getPointerState 调用失败，回退舞台默认位置，已捕获：', err);
    }
    var vp = viewportSize();
    return { x: vp.w / 2, y: Math.max(0, vp.h - 140) }; // 舞台下方居中安全区（footer 之上）
  }

  function lowerLeftStatusPos() {
    var vp = viewportSize();
    return { x: 50, y: Math.max(0, vp.h - 40) }; // 呼应 hud.css .wtj-hud-lights（left:16px, bottom:16px 起algo）附近
  }

  // ---------------------------------------------------------------------
  // 内部状态：存活反馈项列表（与 app.js 的 trail/rings/letters 同款"存活时间到期即 splice"
  // 天然限流，不设固定上限本身，但按键频率受人手速度约束，不存在无界增长风险）。
  // ---------------------------------------------------------------------
  var items = [];

  function spawnFromFunctionKey(payload) {
    var spec = computeFeedbackSpec(payload);
    if (!spec) return null;

    var pos = (spec.kind === 'glint') ? lowerLeftStatusPos() : pointerOrStagePos();
    var reduced = prefersReducedMotion();
    var life = reduced ? Math.min(spec.durationMs, 160) : spec.durationMs;

    var item = {
      kind: spec.kind,
      x: pos.x,
      y: pos.y,
      born: clock.now(),
      life: life,
      spec: spec
    };
    items.push(item);
    return item;
  }

  function onFunctionKeyHandler(payload) {
    try {
      spawnFromFunctionKey(payload);
    } catch (err) {
      console.error('[WTJ_KEYVISUAL] 处理 onFunctionKey 事件失败，已捕获：', err);
    }
  }

  if (window.WTJ_KEYBOARD && typeof window.WTJ_KEYBOARD.onFunctionKey === 'function') {
    window.WTJ_KEYBOARD.onFunctionKey(onFunctionKeyHandler);
  } else {
    console.warn('[WTJ_KEYVISUAL] window.WTJ_KEYBOARD.onFunctionKey 不可用（keyboard.js 未加载或加载顺序在本文件之后），非字母键视觉反馈不可用。');
  }

  // ---------------------------------------------------------------------
  // 绘制（app.js 每帧调用）
  // ---------------------------------------------------------------------
  function drawRing(ctx, item, t) {
    var spec = item.spec;
    var radius = spec.startRadius + (spec.endRadius - spec.startRadius) * t;
    var alpha = (1 - t) * spec.intensity;
    if (alpha <= 0.004 || radius <= 0) return;
    // spec.stroke 形如 'rgba(94,231,255,0.42)'：按 alpha 缩放其原始透明度分量，而不是整体覆盖，
    // 保持"随 intensity 与 (1-t) 双重衰减"的同时不丢失 token 给定的基础色值。
    var base = spec.stroke.match(/rgba?\(([^)]+)\)/);
    var parts = base ? base[1].split(',') : ['94', '231', '255', '0.42'];
    var baseAlpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(' + parts[0].trim() + ',' + parts[1].trim() + ',' + parts[2].trim() + ',' + (baseAlpha * alpha) + ')';
    ctx.arc(item.x, item.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawGlint(ctx, item, t) {
    var spec = item.spec;
    var alpha = (1 - t) * spec.maxOpacity * spec.intensity;
    if (alpha <= 0.004) return;
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(130,168,255,' + alpha + ')';
    ctx.arc(item.x, item.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRipple(ctx, item, t) {
    var spec = item.spec;
    var alpha = (1 - t) * spec.maxOpacity * spec.intensity;
    if (alpha <= 0.004) return;
    var radius = Math.min(spec.maxGlowPx, 12 + t * 26);
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,119,184,' + alpha + ')';
    ctx.arc(item.x, item.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function draw(ctx, now) {
    if (!ctx) return;
    var i;
    for (i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      var age = now - it.born;
      if (age > it.life) {
        items.splice(i, 1);
        continue;
      }
      var t = it.life > 0 ? age / it.life : 1;
      if (it.kind === 'ring') {
        drawRing(ctx, it, t);
      } else if (it.kind === 'glint') {
        drawGlint(ctx, it, t);
      } else {
        drawRipple(ctx, it, t);
      }
    }
  }

  // 081："Optional tiny stage lift: background radial light +4% for 140ms"（仅 light 类别）。
  var STAGE_LIGHT_BOOST_WINDOW_MS = 140;

  function getStageLightBoost(now) {
    var boost = 0;
    var i;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind !== 'ring') continue;
      var age = now - it.born;
      if (age < 0 || age >= STAGE_LIGHT_BOOST_WINDOW_MS) continue;
      var frac = 1 - age / STAGE_LIGHT_BOOST_WINDOW_MS;
      var candidate = it.spec.stageLightBoost * frac * it.spec.intensity;
      if (candidate > boost) boost = candidate;
    }
    return boost;
  }

  function getActiveCount() {
    return items.length;
  }

  // ---------------------------------------------------------------------
  // 对外冻结 API
  // ---------------------------------------------------------------------
  var API = {
    CARD_ID: 'WTJ-20260704-086',
    TOKENS: TOKENS,
    INTENSITY_EPSILON: INTENSITY_EPSILON,
    computeFeedbackSpec: computeFeedbackSpec,
    draw: draw,
    getStageLightBoost: getStageLightBoost,
    getActiveCount: getActiveCount,
    _setClock: _setClock
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  if (!window.WTJ_KEYVISUAL && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_KEYVISUAL', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_KEYVISUAL) {
    window.WTJ_KEYVISUAL = API;
  }
})();
