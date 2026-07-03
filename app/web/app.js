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
  // 画布与自适应
  // ---------------------------------------------------------------------

  var canvas = document.getElementById('stage');
  var ctx = canvas.getContext('2d');

  var dpr = 1;
  var width = 0;
  var height = 0;

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // idle 挂起期间窗口尺寸变化后也要恢复重绘（canvas 重设尺寸会清空内容）。
    // 注意：初始 resize() 调用被放在渲染循环状态变量声明之后（见文件底部）——
    // 若在 var running = false 执行前先跑一次 ensureRunning()，该后置初始化
    // 会把标志复位，底部再调 ensureRunning() 就会排出第二个 rAF 循环。
    ensureRunning();
  }

  // ---------------------------------------------------------------------
  // 事件可视化数据：字母淡出 / 鼠标尾迹 / 点击圆环
  // ---------------------------------------------------------------------

  var COLORS = ['#ffd95a', '#5ee7ff', '#ff7a77', '#8df27c', '#ff8df4', '#88a7ff', '#57e389'];

  var letters = []; // { ch, x, y, size, rot, color, born, life }
  var trail = [];   // { x, y, born, life }
  var rings = [];   // { x, y, born, life }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function spawnLetter(ch) {
    var pad = Math.min(60, Math.min(width, height) / 4);
    letters.push({
      ch: ch,
      x: rand(pad, Math.max(pad, width - pad)),
      y: rand(pad, Math.max(pad, height - pad)),
      size: rand(48, 140),
      rot: rand(-0.35, 0.35),
      color: pick(COLORS),
      born: performance.now(),
      life: rand(LETTER_FADE_MS_RANGE[0], LETTER_FADE_MS_RANGE[1]) // manifest: keyboard.letterFadeMsRange（REQ-KB-03）
    });
    if (letters.length > 40) letters.shift();
  }

  function spawnTrailDot(x, y) {
    trail.push({ x: x, y: y, born: performance.now(), life: 500 });
    if (trail.length > 80) trail.shift();
  }

  function spawnRing(x, y) {
    rings.push({ x: x, y: y, born: performance.now(), life: 600 });
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
  // AudioContext 解锁（首次 keydown/click 时创建并 resume）
  // ---------------------------------------------------------------------

  var audioCtx = null;
  var audioUnlockAttempted = false;

  function unlockAudio() {
    audioUnlockAttempted = true;
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

  // ---------------------------------------------------------------------
  // 输入事件
  // ---------------------------------------------------------------------

  var lastActivity = Date.now();

  function poke() {
    lastActivity = Date.now();
    ensureRunning();
  }

  window.addEventListener('keydown', function (e) {
    poke();
    if (!audioUnlockAttempted) unlockAudio();

    var key = e.key || '';
    dbgKey.textContent = key === ' ' ? 'Space' : key;

    if (key.length === 1) {
      spawnLetter(key.toUpperCase());
    }
  }, false);

  window.addEventListener('mousemove', function (e) {
    poke();
    dbgMouse.textContent = Math.round(e.clientX) + ', ' + Math.round(e.clientY);
    spawnTrailDot(e.clientX, e.clientY);
  }, false);

  window.addEventListener('click', function (e) {
    poke();
    if (!audioUnlockAttempted) unlockAudio();
    spawnRing(e.clientX, e.clientY);
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
      ctx.beginPath();
      ctx.fillStyle = 'rgba(94, 231, 255, ' + (t * 0.5) + ')';
      ctx.arc(p.x, p.y, 3 + t * 3, 0, Math.PI * 2);
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
      var radius = 10 + t * 70;
      ctx.beginPath();
      ctx.lineWidth = 2 + (1 - t) * 3;
      ctx.strokeStyle = 'rgba(255, 217, 90, ' + (1 - t) + ')';
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawLetters(now) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = letters.length - 1; i >= 0; i--) {
      var l = letters[i];
      var age = now - l.born;
      if (age > l.life) {
        letters.splice(i, 1);
        continue;
      }
      var t = Math.max(0, 1 - age / l.life);
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot);
      ctx.globalAlpha = t;
      ctx.font = '700 ' + Math.round(l.size) + 'px -apple-system, "Helvetica Neue", sans-serif';
      ctx.fillStyle = l.color;
      ctx.fillText(l.ch, 0, 0);
      ctx.restore();
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
    ctx.fillStyle = '#0e1117';
    ctx.fillRect(0, 0, width, height);

    drawTrail(now);
    drawRings(now);
    drawLetters(now);

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
