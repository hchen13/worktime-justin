// WTJ-20260704-002 — web 层：事件可视化 + 基础设施
// 语法基线：ES2020 以内（Safari 14 兼容），不用 ?. / ?? 之外的新特性，
// 无 fetch、无 import、无外部依赖。单文件，非 module（无 import/export）。

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Manifest 访问器：读取 window.WTJ_MANIFEST（由 manifest.js 在本文件之前加载提供，
  // 见 index.html 的 <script> 顺序）。若缺失（例如单独打开旧版 index.html，或
  // manifest.js 加载失败/被跳过），回退到下方内置的最小默认值，并 console.warn 提示，
  // 不阻断渲染。manifest 完整域结构见 app/web/manifest.js，消费说明见 app/web/MANIFEST.md。
  // ---------------------------------------------------------------------

  // 注意：以下 3 个默认值（[800,1500] / 5 / 5）镜像 manifest.js 的对应字段
  // （keyboard.letterFadeMsRange / performance.idleStopSec / exit.escHoldSec），
  // 修改 manifest.js 中这些字段时需同步更新此处，避免回退路径与 manifest 口径漂移。
  var DEFAULT_MANIFEST = {
    keyboard: { letterFadeMsRange: [800, 1500] },
    performance: { idleStopSec: 5 },
    exit: { escHoldSec: 5 }
  };

  function getManifest() {
    if (window.WTJ_MANIFEST) {
      return window.WTJ_MANIFEST;
    }
    console.warn('[WTJ] window.WTJ_MANIFEST 未找到（manifest.js 未加载或加载失败），app.js 回退到内置最小默认值。');
    return DEFAULT_MANIFEST;
  }

  var MANIFEST = getManifest();
  var LETTER_FADE_MS_RANGE = (MANIFEST.keyboard && MANIFEST.keyboard.letterFadeMsRange) || DEFAULT_MANIFEST.keyboard.letterFadeMsRange;
  var IDLE_STOP_SEC = (MANIFEST.performance && MANIFEST.performance.idleStopSec) || DEFAULT_MANIFEST.performance.idleStopSec;
  var ESC_HOLD_SEC = (MANIFEST.exit && MANIFEST.exit.escHoldSec) || DEFAULT_MANIFEST.exit.escHoldSec;

  // ---------------------------------------------------------------------
  // WTJ-20260704-086 — letter-motion.js 访问器：字母字形/motion 的 081 token + 纯函数
  // （字体串拼接/尺寸区间/旋转/漂移/安全区/缓动/逐帧状态机）改由 window.WTJ_LETTER_MOTION
  // （letter-motion.js，index.html 中在本文件之前加载）提供，本文件不再在 spawnLetter/
  // drawLetters 里硬编码这些数值——原因与好处见 app/web/letter-motion.js 顶部注释（该文件
  // 不依赖 document/canvas，可独立单测）。防御式：letter-motion.js 未加载/加载失败时
  // console.warn 并回退到下方最小内置默认值——字母仍会渲染（保留 002 卡最初的朴素观感），
  // 只是没有 081 的字形层次/motion 曲线，不阻断整体渲染循环。
  // ---------------------------------------------------------------------
  var LETTER_MOTION_FALLBACK = {
    TOKENS: {
      header: { heightPx: 44 },
      footer: { heightPx: 92 },
      letters: {
        fontStack: '-apple-system, "Helvetica Neue", sans-serif',
        weight: 700,
        desktopSizeRangePx: [48, 140],
        safeAreaPx: { topBottom: 60, sides: 60 },
        palette: ['#ffd95a', '#5ee7ff', '#ff7a77', '#8df27c', '#ff8df4', '#88a7ff', '#57e389']
      },
      letterMotion: { driftPxRange: [0, 0], trailLengthPxRange: [0, 0], trailMaxOpacity: 0 },
      functionKeyFeedback: { digits: { maxSizePx: 140, trailMultiplier: 1 } },
      canvas: { top: '#0e1117', mid: '#0e1117', bottom: '#0e1117', radialLight: 'rgba(0,0,0,0)', radialLightBoosted: 'rgba(0,0,0,0)', radialLightRadiusRatio: 0.38 }
    },
    buildLetterFont: function (size) { return '700 ' + Math.round(size) + 'px -apple-system, "Helvetica Neue", sans-serif'; },
    // 与 letter-motion.js 的 colorWithAlpha() 同款最小实现（六位 hex -> rgba 字符串）——
    // 若只是简单地把 hex 原样返回（忽略 alpha），getGlowSprite() 的径向渐变四个 color stop
    // 会全部变成同一个不透明色，画出一个实心色块而不是柔光晕，是本回退桩必须自行修的 bug，
    // 不能依赖 letter-motion.js（此时已确认未加载/加载失败）。
    colorWithAlpha: function (hex, alpha) {
      var h = String(hex).replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var num = parseInt(h, 16) || 0;
      var r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    },
    randomLetterSize: function () { return 48 + Math.random() * (140 - 48); },
    randomRotationRad: function () { return -0.35 + Math.random() * 0.7; },
    randomDrift: function () { return { angleRad: 0, dx: 0, dy: 0 }; },
    computeSafeArea: function (width, height) {
      var pad = Math.min(60, Math.min(width, height) / 4);
      return { minX: pad, maxX: Math.max(pad, width - pad), minY: pad, maxY: Math.max(pad, height - pad) };
    },
    computeLetterFrame: function (now, letter) {
      var age = now - letter.born;
      if (age > letter.life) return { alive: false };
      var t = Math.max(0, 1 - age / letter.life);
      return { alive: true, scale: 1, rotRad: letter.rotFinal, dx: 0, dy: 0, opacity: t, blurPx: 0, trailAlpha: 0, trailGrowth: 0 };
    },
    prefersReducedMotion: function () { return false; }
  };

  function getLetterMotion() {
    if (window.WTJ_LETTER_MOTION) {
      return window.WTJ_LETTER_MOTION;
    }
    console.warn('[WTJ] window.WTJ_LETTER_MOTION 未找到（letter-motion.js 未加载或加载失败），字母渲染回退到内置最小默认值（无 081 字形/motion 层次）。');
    return LETTER_MOTION_FALLBACK;
  }

  var LM = getLetterMotion();
  var LM_TOKENS = LM.TOKENS;

  // ---------------------------------------------------------------------
  // 画布与自适应
  // ---------------------------------------------------------------------

  var canvas = document.getElementById('stage');
  var ctx = canvas.getContext('2d');

  var dpr = 1;
  var width = 0;
  var height = 0;

  // ---------------------------------------------------------------------
  // WTJ-20260704-086 — 背景渐变缓存：081 Layout Spec「Canvas」一节要求纵向渐变
  // （canvasTop→canvasMid→canvasBottom）+ 一个居中的柔和径向光。app/PERFORMANCE.md 第 3.1 节
  // 明确要求"渐变应预渲染成静态 CanvasGradient 对象复用，禁止每帧调用
  // createXxxGradient()"——这里只在 resize() 里（窗口尺寸变化时）重建，draw() 每帧只是复用
  // 已缓存的 CanvasGradient 对象做 fillRect，不重新计算。stageLightBoost（功能键 light 类
  // 反馈的背景轻微提亮，见 keyvisual.js）额外缓存一份"提亮版"径向光，用 globalAlpha 插值叠加，
  // 同样不在每帧重新创建渐变，见 draw() 里的用法。
  // ---------------------------------------------------------------------
  var bgGradient = null;
  var radialGradient = null;
  var radialGradientBoosted = null;

  function rebuildBackgroundGradients() {
    if (width <= 0 || height <= 0) return;
    try {
      bgGradient = ctx.createLinearGradient(0, 0, 0, height);
      bgGradient.addColorStop(0, LM_TOKENS.canvas.top);
      bgGradient.addColorStop(0.5, LM_TOKENS.canvas.mid);
      bgGradient.addColorStop(1, LM_TOKENS.canvas.bottom);

      var cx = width / 2;
      var cy = height / 2;
      var r = Math.max(1, Math.min(width, height) * LM_TOKENS.canvas.radialLightRadiusRatio);
      radialGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      radialGradient.addColorStop(0, LM_TOKENS.canvas.radialLight);
      radialGradient.addColorStop(1, 'rgba(74, 128, 214, 0)');

      radialGradientBoosted = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      radialGradientBoosted.addColorStop(0, LM_TOKENS.canvas.radialLightBoosted);
      radialGradientBoosted.addColorStop(1, 'rgba(74, 128, 214, 0)');
    } catch (e) {
      // 极端环境（如测试沙箱的 ctx stub 不支持渐变 API）下静默跳过，draw() 里的回退纯色
      // fillRect 仍会执行，不阻断渲染循环。
      bgGradient = null;
      radialGradient = null;
      radialGradientBoosted = null;
    }
  }

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildBackgroundGradients();
    // idle 挂起期间窗口尺寸变化后也要恢复重绘（canvas 重设尺寸会清空内容）。
    // 注意：初始 resize() 调用被放在渲染循环状态变量声明之后（见文件底部）——
    // 若在 var running = false 执行前先跑一次 ensureRunning()，该后置初始化
    // 会把标志复位，底部再调 ensureRunning() 就会排出第二个 rAF 循环。
    ensureRunning();
  }

  // ---------------------------------------------------------------------
  // 事件可视化数据：字母淡出 / 鼠标尾迹 / 点击圆环
  // ---------------------------------------------------------------------

  // WTJ-20260704-086：字母配色改用 081 Palette（motion-token-sheet.json letters.palette，
  // 六色：letterYellow/letterCyan/letterCoral/letterGreen/letterPink/letterBlue），取代 002 卡
  // 最初的七色占位数组。经由 LM_TOKENS 读取（letter-motion.js 未加载时回退到旧七色，见上方
  // LETTER_MOTION_FALLBACK），不在本文件重复硬编码一份数值。
  var PALETTE = LM_TOKENS.letters.palette;

  var DIGIT_RE = /^[0-9]$/;

  // letters: { ch, x, y, size, color, rotFinal, rotStart, driftAngle, driftDx, driftDy,
  //            trailLenPx, born, life, reducedMotion }（081 字形 + motion 字段，见
  //            letter-motion.js computeLetterFrame() 消费方式）。
  var letters = [];
  var trail = [];   // { x, y, born, life }（鼠标尾迹，WTJ_POINTER 驱动，与字母无关，见下方订阅）
  var rings = [];   // { x, y, born, life }（鼠标点击圆环，同上）

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function spawnLetter(ch) {
    var isDigit = DIGIT_RE.test(ch);
    var area = LM.computeSafeArea(width, height);
    var size = LM.randomLetterSize(width, isDigit);
    var rotFinal = LM.randomRotationRad();
    var overshootSign = rotFinal >= 0 ? 1 : -1;
    var rotStart = rotFinal + overshootSign * (2 * Math.PI / 180); // 081 settle 阶段"rotate settles by 2deg"
    var drift = LM.randomDrift();
    var reducedMotion = LM.prefersReducedMotion();

    var life = reducedMotion ?
      rand(LM_TOKENS.letterMotion.reducedMotion ? LM_TOKENS.letterMotion.reducedMotion.fadeMsRange[0] : 600,
           LM_TOKENS.letterMotion.reducedMotion ? LM_TOKENS.letterMotion.reducedMotion.fadeMsRange[1] : 900) :
      rand(LETTER_FADE_MS_RANGE[0], LETTER_FADE_MS_RANGE[1]); // manifest: keyboard.letterFadeMsRange（REQ-KB-03）

    var trailRange = LM_TOKENS.letterMotion.trailLengthPxRange;
    var sizeRange = LM_TOKENS.letters.desktopSizeRangePx;
    var sizeFrac = sizeRange[1] > sizeRange[0] ? (size - sizeRange[0]) / (sizeRange[1] - sizeRange[0]) : 0;
    var trailLenPx = trailRange[0] + Math.max(0, Math.min(1, sizeFrac)) * (trailRange[1] - trailRange[0]);
    if (isDigit) {
      // 081："Digits...size capped at 118px and 0.75 trail length"（functionKeyFeedback.digits）。
      var digitCfg = LM_TOKENS.functionKeyFeedback.digits;
      trailLenPx *= (digitCfg && typeof digitCfg.trailMultiplier === 'number') ? digitCfg.trailMultiplier : 1;
    }

    letters.push({
      ch: ch,
      x: rand(area.minX, area.maxX),
      y: rand(area.minY, area.maxY),
      size: size,
      color: pick(PALETTE),
      rotFinal: rotFinal,
      rotStart: rotStart,
      driftAngle: drift.angleRad,
      driftDx: drift.dx,
      driftDy: drift.dy,
      trailLenPx: trailLenPx,
      born: performance.now(),
      life: life,
      reducedMotion: reducedMotion
    });
    if (letters.length > 40) letters.shift();
  }

  // -----------------------------------------------------------------------
  // WTJ-20260704-086 — 字母发光贴图缓存（按「颜色 + 尺寸分桶」离屏预渲染一次，此后逐帧只是
  // 廉价的 ctx.drawImage()，不逐帧调用 ctx.shadowBlur——理由与性能红线出处见
  // letter-motion.js 顶部「已知的性能红线冲突与本卡的工程取舍」一节）。
  // -----------------------------------------------------------------------
  var GLOW_CACHE = {};
  var GLOW_BUCKET_PX = 16; // 尺寸分桶粒度：56~148px 区间内约 6~7 个桶，缓存条目数有界。

  function buildGlowSprite(color, bucket) {
    var pad = bucket * 0.9;
    var dim = Math.max(2, Math.ceil(pad * 2));
    var off = document.createElement('canvas');
    off.width = dim;
    off.height = dim;
    var octx = off.getContext('2d');
    if (!octx || typeof octx.createRadialGradient !== 'function') return null;
    var cx = dim / 2;
    var cy = dim / 2;
    var grad = octx.createRadialGradient(cx, cy, 0, cx, cy, pad);
    var farAlpha = (LM_TOKENS.letters.farGlowAlpha || 0.38) * 0.55;
    grad.addColorStop(0, LM.colorWithAlpha(color, 0.55));
    grad.addColorStop(0.28, LM.colorWithAlpha(color, 0.4));
    grad.addColorStop(0.6, LM.colorWithAlpha(color, farAlpha));
    grad.addColorStop(1, LM.colorWithAlpha(color, 0));
    octx.fillStyle = grad;
    octx.beginPath();
    octx.arc(cx, cy, pad, 0, Math.PI * 2);
    octx.fill();
    return { canvas: off, size: dim };
  }

  function getGlowSprite(color, size) {
    if (typeof document.createElement !== 'function') return null;
    var bucket = Math.max(24, Math.round(size / GLOW_BUCKET_PX) * GLOW_BUCKET_PX);
    var key = color + '|' + bucket;
    if (GLOW_CACHE[key]) return GLOW_CACHE[key];
    var sprite = null;
    try {
      sprite = buildGlowSprite(color, bucket);
    } catch (e) {
      console.error('[WTJ] 字母发光贴图预渲染失败，已捕获，本次跳过发光效果：', e);
      sprite = null;
    }
    GLOW_CACHE[key] = sprite; // 即便失败也缓存 null，避免同一 key 反复重试制造额外开销
    return sprite;
  }

  // intensity ∈ [0,1]（可选，缺省 1）：WTJ-20260704-012 起，鼠标尾迹/点击圆环的浓度由
  // window.WTJ_POINTER（pointer.js）算出的强度驱动，详见下方"指针引擎订阅"一节。intensity
  // 存在每个 dot/ring 自己身上（而不是全局一个值），因为衰减中的尾迹和刚触发的尾迹可能同时
  // 共存在 trail 数组里，各自要按各自诞生时的强度淡出，不能共用一个正在变化的全局值。
  function spawnTrailDot(x, y, intensity) {
    var inten = (typeof intensity === 'number') ? intensity : 1;
    trail.push({ x: x, y: y, born: performance.now(), life: 500, intensity: inten });
    if (trail.length > 80) trail.shift();
  }

  function spawnRing(x, y, intensity) {
    var inten = (typeof intensity === 'number') ? intensity : 1;
    rings.push({ x: x, y: y, born: performance.now(), life: 600, intensity: inten });
    if (rings.length > 20) rings.shift();
  }

  // ---------------------------------------------------------------------
  // debug 叠层
  // ---------------------------------------------------------------------

  var dbgKey = document.getElementById('dbg-key');
  var dbgMouse = document.getElementById('dbg-mouse');
  var dbgFps = document.getElementById('dbg-fps');
  var dbgAudio = document.getElementById('dbg-audio');

  // ---------------------------------------------------------------------
  // Esc 长按进度条占位（原生壳通过 window.wtjEscProgress 驱动）
  // ---------------------------------------------------------------------

  var escWrap = document.getElementById('esc-progress-wrap');
  var escBar = document.getElementById('esc-progress-bar');
  var ESC_HOLD_SECONDS = ESC_HOLD_SEC; // manifest: exit.escHoldSec（REQ-EXIT-03，与 shell/main.swift 镜像）

  window.wtjEscProgress = function (seconds) {
    var s = seconds || 0;
    var pct = Math.max(0, Math.min(1, s / ESC_HOLD_SECONDS)) * 100;
    if (s > 0) {
      escWrap.classList.add('active');
    } else {
      escWrap.classList.remove('active');
    }
    escBar.style.width = pct + '%';
  };

  // ---------------------------------------------------------------------
  // AudioContext 解锁（首次 keydown/click 时触发）
  //
  // WTJ-20260704-077 接入注记：audio.js（016）头注「AudioContext 生命周期」一节明确要求——
  // 全应用只保留 audio.js 内部的单例 AudioContext，本文件不再自建一个独立的 AudioContext。
  // 统一改为优先委托 window.WTJ_AUDIO.unlock()（resume 那一个单例 AudioContext），
  // dbg-audio 展示的诊断文本改读它的返回结果 / isUnlocked()。
  //
  // 防御回退：若 window.WTJ_AUDIO 缺失（audio.js 未加载/加载失败，例如单独打开旧版
  // index.html，或 app.js 被单独拿去跑测试），保留 007/002 遗留的独立 AudioContext 解锁桩
  // 作兜底——仅用于让 dbg-audio 仍有可诊断状态，不做任何真正的音频解码/播放，app.js 单独
  // 加载/测试时也不会因为访问不存在的 WTJ_AUDIO 而崩。
  // ---------------------------------------------------------------------

  var audioCtx = null; // 仅供下方 unlockAudioFallback() 使用，WTJ_AUDIO 存在时不会创建
  var audioUnlockAttempted = false;

  // 把 unlock() 之后拿到的"是否已解锁"布尔值，翻成 dbg-audio 可读的诊断文本。
  // ok=false 时进一步区分 unsupported（环境没有 AudioContext 构造器）与 suspended
  // （有构造器但还没进入 running，例如 resume() 本身失败/被拒），与旧版兜底桩的文案一致。
  function reportAudioState(ok) {
    if (ok) {
      dbgAudio.textContent = 'running';
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    dbgAudio.textContent = AC ? 'suspended' : 'unsupported';
  }

  // 兜底桩：window.WTJ_AUDIO 缺失时的独立 AudioContext 解锁逻辑（007/002 遗留实现，原样保留，
  // 只改了函数名以区分"统一委托"与"独立兜底"这两条路径）。
  function unlockAudioFallback() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        dbgAudio.textContent = 'unsupported';
        return;
      }
      if (!audioCtx) {
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        audioCtx.resume().then(function () {
          dbgAudio.textContent = audioCtx.state;
        }).catch(function () {
          dbgAudio.textContent = audioCtx.state;
        });
      }
      dbgAudio.textContent = audioCtx.state;
    } catch (e) {
      dbgAudio.textContent = 'error';
    }
  }

  function unlockAudio() {
    audioUnlockAttempted = true;

    if (window.WTJ_AUDIO && typeof window.WTJ_AUDIO.unlock === 'function') {
      try {
        var result = window.WTJ_AUDIO.unlock();
        if (result && typeof result.then === 'function') {
          result.then(
            function (ok) {
              reportAudioState(!!ok);
            },
            function (err) {
              // AUDIO-API 契约承诺 unlock() 永不 reject，这里只是对不守约的替身/未来实现
              // 也稳健，避免万一 reject 时冒出 unhandledrejection（与本项目其余消费方对
              // WTJ_AUDIO 返回 Promise 的防御式写法一致，见 secretword.js/task.js 等）。
              console.error('[WTJ] window.WTJ_AUDIO.unlock 返回的 Promise 被 reject（AUDIO-API 契约本不应发生），已捕获：', err);
              dbgAudio.textContent = 'error';
            }
          );
        } else {
          reportAudioState(typeof window.WTJ_AUDIO.isUnlocked === 'function' && window.WTJ_AUDIO.isUnlocked());
        }
      } catch (e) {
        dbgAudio.textContent = 'error';
      }
      return;
    }

    console.warn('[WTJ] window.WTJ_AUDIO 未找到（audio.js 未加载或加载失败），音频解锁回退到 app.js 独立 AudioContext 兜底桩（无真实播放能力）。');
    unlockAudioFallback();
  }

  // ---------------------------------------------------------------------
  // 键盘引擎订阅（WTJ-20260704-008）：字母/数字弹出渲染改由 window.WTJ_KEYBOARD
  // （keyboard.js，index.html 中在 app.js 之前加载）的 onLetter 事件驱动——keyboard.js
  // 是唯一权威的 keydown 逻辑监听方（判定普通字母/功能键/长按/连续同键暂停/里程碑），
  // app.js 不再自行判定"是否弹字母"，只负责订阅后调用 spawnLetter 做 Canvas 渲染，
  // 避免与 keyboard.js 的 keydown 监听重复触发弹字母。防御式：keyboard.js 未加载/加载
  // 失败时 console.warn 并跳过订阅，不阻断鼠标尾迹/点击圆环等其余渲染。
  // ---------------------------------------------------------------------
  if (window.WTJ_KEYBOARD && typeof window.WTJ_KEYBOARD.onLetter === 'function') {
    window.WTJ_KEYBOARD.onLetter(function (ch) {
      spawnLetter(ch);
      poke();
    });
  } else {
    console.warn('[WTJ] window.WTJ_KEYBOARD 未找到（keyboard.js 未加载或加载失败），字母弹出功能不可用。');
  }

  // ---------------------------------------------------------------------
  // WTJ-20260704-086 — 非字母键视觉反馈引擎（keyvisual.js）接入：只读一次是否可用
  // （而不是每帧都判断+warn，避免 draw() 60fps 下控制台被刷屏），draw() 里按 hasKeyVisual
  // 决定是否调用。keyvisual.js 自己订阅 window.WTJ_KEYBOARD.onFunctionKey（见该文件），
  // 本文件不重复订阅，只负责每帧把它已经算好的反馈项画出来。
  // ---------------------------------------------------------------------
  var hasKeyVisual = !!(window.WTJ_KEYVISUAL && typeof window.WTJ_KEYVISUAL.draw === 'function');
  if (!hasKeyVisual) {
    console.warn('[WTJ] window.WTJ_KEYVISUAL 未找到（keyvisual.js 未加载或加载失败），非字母键视觉反馈不可用。');
  }

  // ---------------------------------------------------------------------
  // 指针引擎订阅（WTJ-20260704-012）：鼠标尾迹/点击圆环的"要不要出、出多浓"改由
  // window.WTJ_POINTER（pointer.js，index.html 中在 app.js 之前加载）算出的强度驱动——
  // pointer.js 是唯一权威的 mousemove/mousedown/mouseup/click 逻辑监听方（判定尾迹强度/
  // 点击强度/拖拽状态机/悬停判定），app.js 不再在自己的原始 mousemove/click 监听器里无条件
  // spawnTrailDot/spawnRing，只负责订阅引擎事件后按强度渲染到 Canvas（drawTrail/drawRings
  // 仍是 app.js 领域，只是浓度受传入强度控制），避免"引擎驱动"与"直连"两条路径同时给同一次
  // 输入各画一份，出现尾迹/圆环重复渲染。防御式：pointer.js 未加载/加载失败时只 console.warn
  // 并跳过订阅（不重新实现一套直连兜底逻辑，避免两条实现分叉、日后不一致），与 WTJ_KEYBOARD
  // 缺失时的降级方式保持同一约定；此时鼠标尾迹/点击圆环功能不可用，但 poke()/dbgMouse/
  // unlockAudio 等 app.js 自身逻辑（见下方原始监听器）不受影响。
  // ---------------------------------------------------------------------
  if (window.WTJ_POINTER && typeof window.WTJ_POINTER.onMove === 'function') {
    window.WTJ_POINTER.onMove(function (x, y, trailIntensity) {
      // REQ-PTR-01：subtle 尾迹，强度趋近 0（衰减到底）时基本不再新增点；强度越低命中概率
      // 越低，尾迹点越稀疏——避免"衰减"只体现在透明度、频率却不变导致观感仍然很满的问题。
      if (trailIntensity <= 0.02) return;
      if (Math.random() > trailIntensity) return;
      spawnTrailDot(x, y, trailIntensity);
    });
  } else {
    console.warn('[WTJ] window.WTJ_POINTER 未找到（pointer.js 未加载或加载失败），鼠标尾迹功能不可用。');
  }

  if (window.WTJ_POINTER && typeof window.WTJ_POINTER.onClickFeedback === 'function') {
    window.WTJ_POINTER.onClickFeedback(function (x, y, feedback) {
      // REQ-PTR-02：浓度随引擎给出的点击强度变化；soundless 预留——当前 app.js/audio.js
      // 还没有接通用的"点击音效"播放入口，先不出声，等音效接线时在此处按该标志跳过播放即可。
      var intensity = (feedback && typeof feedback.intensity === 'number') ? feedback.intensity : 1;
      // P2-6：与上方 onMove 的下限跳过对齐——狂点衰减到 intensity≈0 时不再新增几乎全透明的空圆环
      // （既是无意义的绘制开销，也避免 rings 数组被一堆隐形环占满挤掉真正可见的环）。
      if (intensity <= 0.02) return;
      spawnRing(x, y, intensity);
    });
  } else {
    console.warn('[WTJ] window.WTJ_POINTER 未找到（pointer.js 未加载或加载失败），点击圆环功能不可用。');
  }

  // ---------------------------------------------------------------------
  // 输入事件
  // ---------------------------------------------------------------------

  var lastActivity = Date.now();

  function poke() {
    lastActivity = Date.now();
    ensureRunning();
  }

  window.addEventListener('keydown', function (e) {
    // 本监听器只负责：节能唤醒（poke）、首次手势音频解锁、debug 叠层文本。
    // 字母弹出逻辑已移交 window.WTJ_KEYBOARD（见上方订阅），此处不再直接调用 spawnLetter，
    // 避免两个 keydown 监听器（本文件 + keyboard.js）重复弹字母。
    poke();
    if (!audioUnlockAttempted) unlockAudio();

    var key = e.key || '';
    dbgKey.textContent = key === ' ' ? 'Space' : key;
  }, false);

  window.addEventListener('mousemove', function (e) {
    // 尾迹渲染已移交上方 window.WTJ_POINTER.onMove 订阅（按引擎强度 spawnTrailDot），此处
    // 只保留 app.js 自身职责：节能唤醒、debug 叠层坐标文本，不再无条件 spawnTrailDot，
    // 避免与引擎驱动路径重复渲染。
    poke();
    dbgMouse.textContent = Math.round(e.clientX) + ', ' + Math.round(e.clientY);
  }, false);

  window.addEventListener('click', function (e) {
    // 点击圆环渲染已移交上方 window.WTJ_POINTER.onClickFeedback 订阅（按引擎强度
    // spawnRing），此处只保留 app.js 自身职责：节能唤醒、首次手势音频解锁，不再无条件
    // spawnRing，避免与引擎驱动路径重复渲染。
    poke();
    if (!audioUnlockAttempted) unlockAudio();
  }, false);

  // ---------------------------------------------------------------------
  // 渲染循环：rAF + 5 秒无输入自动停止（节能），有输入立即恢复
  // ---------------------------------------------------------------------

  var running = false;
  var lastFrameTime = performance.now();
  var fps = 0;
  var IDLE_TIMEOUT_MS = IDLE_STOP_SEC * 1000; // manifest: performance.idleStopSec

  function drawTrail(now) {
    for (var i = trail.length - 1; i >= 0; i--) {
      var p = trail[i];
      var age = now - p.born;
      if (age > p.life) {
        trail.splice(i, 1);
        continue;
      }
      var t = 1 - age / p.life;
      // REQ-PTR-01：浓度受 pointer.js 给出的强度控制（p.intensity，衰减期间明显更淡），
      // 半径也随强度轻微收缩，subtle 上限本身已经由引擎强度封顶，这里只是再乘一层。
      var trailAlpha = t * 0.5 * p.intensity;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(94, 231, 255, ' + trailAlpha + ')';
      ctx.arc(p.x, p.y, 3 + t * 3 * Math.max(0.4, p.intensity), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRings(now) {
    for (var i = rings.length - 1; i >= 0; i--) {
      var r = rings[i];
      var age = now - r.born;
      if (age > r.life) {
        rings.splice(i, 1);
        continue;
      }
      var t = age / r.life;
      // 陈旧 rAF 时间戳可能导致 age（进而 t）为负，radius 若为负会让 ctx.arc 抛
      // IndexSizeError（Safari/Chrome 均如此）。Math.max(0, ...) 兜底，drawTrail 的
      // `3 + t*3` 因公式不同（1 - age/life）天然不会出现同类负值，故不动。
      var radius = Math.max(0, 10 + t * 70);
      // REQ-PTR-02：浓度受 pointer.js 给出的点击强度控制（r.intensity，连续狂点时明显更淡）。
      var ringAlpha = (1 - t) * r.intensity;
      ctx.beginPath();
      ctx.lineWidth = 2 + (1 - t) * 3;
      ctx.strokeStyle = 'rgba(255, 217, 90, ' + ringAlpha + ')';
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // WTJ-20260704-086 — 拖尾"smear"：081 要求"a horizontal trailing smear behind moving
  // letters, never in front of the glyph"。用单层纯 alpha 矩形（沿字母漂移反方向），不用
  // ctx.createLinearGradient()（同样是为了避免逐帧渐变重建，见 rebuildBackgroundGradients()
  // 顶部注释引用的 PERFORMANCE.md 红线；小矩形本身面积很小，用纯色 alpha 已经足够表达"拖尾"
  // 观感，不需要渐变过渡）。"clipped to canvas only, not to a square sprite box"——本实现
  // 直接画在主 canvas 上、不调用 ctx.clip()，天然满足。
  function drawLetterTrail(l, cx, cy, size, frame) {
    var length = l.trailLenPx * frame.trailGrowth;
    if (length < 1 || frame.trailAlpha <= 0.004) return;
    var halfWidth = Math.max(2, size * 0.08);
    var backAngle = l.driftAngle + Math.PI;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(backAngle);
    ctx.globalAlpha = frame.trailAlpha;
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.moveTo(0, -halfWidth);
    ctx.lineTo(length, -halfWidth);
    ctx.lineTo(length, halfWidth);
    ctx.lineTo(0, halfWidth);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 081 Letter Rendering Spec 逐层顺序：发光（贴图预渲染，见 getGlowSprite） → 深色描边
  // 下层 → 左上高光偏移 → 主体填充。fade 阶段的 1.5px blur 用 ctx.filter（Safari 14 支持
  // CanvasRenderingContext2D.filter，特性检测见 CTX_FILTER_SUPPORTED），随 ctx.save/restore
  // 自动限定作用域，不需要手工重置。
  var CTX_FILTER_SUPPORTED = (function () {
    try {
      return typeof ctx.filter !== 'undefined';
    } catch (e) {
      return false;
    }
  })();

  function drawLetterGlyph(l, cx, cy, size, rotRad, opacity, blurPx) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotRad);
    ctx.globalAlpha = opacity;
    if (CTX_FILTER_SUPPORTED && blurPx > 0.05) {
      ctx.filter = 'blur(' + blurPx.toFixed(2) + 'px)';
    }

    var glow = getGlowSprite(l.color, size);
    if (glow) {
      ctx.drawImage(glow.canvas, -glow.size / 2, -glow.size / 2, glow.size, glow.size);
    }

    ctx.font = LM.buildLetterFont(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 深色描边下层。
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * (LM_TOKENS.letters.darkStrokeWidthRatio || 0.055));
    ctx.strokeStyle = 'rgba(8, 12, 20, ' + (LM_TOKENS.letters.darkStrokeAlpha || 0.58) + ')';
    ctx.strokeText(l.ch, 0, 0);

    // 左上高光偏移。
    var offsetRatio = LM_TOKENS.letters.highlightOffsetRatio || [-0.025, -0.035];
    ctx.fillStyle = 'rgba(255, 255, 255, ' + (LM_TOKENS.letters.highlightAlpha || 0.2) + ')';
    ctx.fillText(l.ch, size * offsetRatio[0], size * offsetRatio[1]);

    // 主体填充（放在最后，盖住描边/高光的重叠部分，露出干净的字形轮廓+高光边缘）。
    ctx.fillStyle = l.color;
    ctx.fillText(l.ch, 0, 0);

    ctx.restore();
  }

  function drawLetters(now) {
    for (var i = letters.length - 1; i >= 0; i--) {
      var l = letters[i];
      var frame = LM.computeLetterFrame(now, l);
      if (!frame.alive) {
        letters.splice(i, 1);
        continue;
      }
      var cx = l.x + frame.dx;
      var cy = l.y + frame.dy;
      var renderSize = l.size * frame.scale;

      if (frame.trailAlpha > 0) {
        drawLetterTrail(l, cx, cy, renderSize, frame);
      }
      drawLetterGlyph(l, cx, cy, renderSize, frame.rotRad, frame.opacity, frame.blurPx);
    }
  }

  function draw(now) {
    var dt = now - lastFrameTime;
    lastFrameTime = now;
    if (dt > 0) {
      fps = fps * 0.9 + (1000 / dt) * 0.1;
    }
    dbgFps.textContent = String(Math.round(fps));

    ctx.clearRect(0, 0, width, height);
    // WTJ-20260704-086：081 Layout Spec「Canvas」纵向渐变 + 居中柔和径向光，取代 002 卡的纯色
    // fillStyle('#0e1117')。bgGradient/radialGradient 只在 resize() 里重建（见
    // rebuildBackgroundGradients()），这里每帧只是复用缓存对象 fillRect，不重新创建渐变。
    if (bgGradient) {
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = LM_TOKENS.canvas.top;
      ctx.fillRect(0, 0, width, height);
    }
    if (radialGradient) {
      ctx.fillStyle = radialGradient;
      ctx.fillRect(0, 0, width, height);
      // 081 非字母键 light 反馈（Space/Enter）的"Optional tiny stage lift"：keyvisual.js 算出
      // 0~stageLightBoost 的额外提亮量，这里用 globalAlpha 插值叠加一份预缓存的"提亮版"径向光，
      // 不重新创建渐变对象。
      if (hasKeyVisual && radialGradientBoosted) {
        var boost = window.WTJ_KEYVISUAL.getStageLightBoost(now);
        if (boost > 0) {
          var maxBoost = (LM_TOKENS.functionKeyFeedback && LM_TOKENS.functionKeyFeedback.spaceEnter && LM_TOKENS.functionKeyFeedback.spaceEnter.stageLightBoost) || 0.04;
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, boost / maxBoost));
          ctx.fillStyle = radialGradientBoosted;
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }
      }
    }

    drawTrail(now);
    drawRings(now);
    drawLetters(now);
    if (hasKeyVisual) {
      try {
        window.WTJ_KEYVISUAL.draw(ctx, now);
      } catch (e) {
        console.error('[WTJ] window.WTJ_KEYVISUAL.draw 调用失败，已捕获：', e);
      }
    }

    if (Date.now() - lastActivity < IDLE_TIMEOUT_MS) {
      requestAnimationFrame(draw);
    } else {
      running = false; // 停止重绘，等待下一次输入唤醒
    }
  }

  function ensureRunning() {
    if (running) return;
    running = true;
    lastFrameTime = performance.now();
    requestAnimationFrame(draw);
  }

  // 初始画布尺寸 + resize 监听（此时渲染循环状态变量已初始化完毕，
  // resize() 内部的 ensureRunning() 可以安全启动循环，见 resize() 注释）。
  window.addEventListener('resize', resize, false);
  resize();

  // 首帧启动（resize() 已启动时为幂等 no-op），绘制底色，随后按 5 秒无输入规则自动挂起。
  ensureRunning();

  // ---------------------------------------------------------------------
  // JS 桥通道验证：启动时向原生壳发一条 ping（通道尚未建立/纯浏览器打开时静默失败）
  // ---------------------------------------------------------------------

  try {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.shell) {
      window.webkit.messageHandlers.shell.postMessage({ type: 'ping' });
    }
  } catch (e) {
    // 非 WKWebView 环境（如直接用浏览器打开调试），忽略即可。
  }
})();
