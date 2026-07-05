// WTJ-20260705-003 — 鼠标尾迹星光化：app.js 实际渲染集成测试（durable QA asset）
//
// 与 tests/unit/app-visual-086.test.mjs 同一手法：用 Node vm 模块把真实的 manifest.js /
// letter-motion.js / sparkles.js / pointer-trail.js / pointer.js / app.js 按 index.html 的真实
// 加载顺序跑在同一个最小 window/document 沙箱里（canvas ctx 用一个可内省的 stub，记录
// drawImage/arc/fillStyle 的每一次调用参数），用捕获到的 window.addEventListener 处理函数注入
// 合成的 mousemove/mousedown/mouseup/click 指针事件（与 tests/unit/pointer-engine.test.mjs 同一
// 手法），驱动一次真实的"鼠标移动 -> pointer.js 判定 trailIntensity -> app.js
// onMove/spawnTrailDot -> 手动触发一帧 app.js.draw() -> drawTrail()"，断言实际产出的
// ctx.drawImage 调用确实发生（证明尾迹已经是星点渲染，不是旧版纯色 ctx.arc 圆点）——直接验证
// pointer-trail.js 提供的纯参数（已在 tests/unit/pointer-trail.test.mjs 独立覆盖）在 app.js 里
// 被正确消费，而不是停留在"存在但没被接上"的状态。
//
// 覆盖需求：
//   1) 鼠标移动尾迹用 Canvas 星点渲染（drawImage），不是旧版 ctx.arc 纯色圆点。
//   2) 点击命中已注册的有效 target（clickHit）比点击空白处（clickMiss）产生明显更多的星点；
//      拖拽成功放下（dragSuccess）在落点产生一次星点爆发，dropCancel 不产生额外爆发。
//   5) 拖拽中，若有一个 .wtj-tt-drag-target 元素覆盖尾迹点的位置，该点被完全避让（不渲染）；
//      同样位置若没有 drop target 元素，则正常渲染——证明避让判定确实在拖拽中生效、只影响
//      drop target 附近。
//
// 为了让 Math.random 驱动的星点数量/位置具备确定性（不使用真实随机数，做法与
// tests/unit/letter-motion.test.mjs / tests/unit/pointer-trail.test.mjs 同款），每个用例在
// 沙箱创建后立即用 setMathRandomSequence() 固定一个较低的常量值——这样：
//   - pointer.js 的尾迹强度衰减/点击强度衰减不依赖 Math.random（本就是纯时钟驱动，见
//     pointer.js updateTrailIntensity()/computeClickIntensity()），不受影响；
//   - app.js 的 `Math.random() > trailIntensity` 概率丢弃门槛（onMove 订阅内）在固定低值下
//     恒为 false，保证每次 mousemove 都真正 spawnTrailDot；
//   - app.js 的 pick(PALETTE) 恒选第一个颜色；
//   - pointer-trail.js 的 buildTrailSparkles() 各字段确定性落在区间下限。
//
// Run:  node --test tests/unit/pointer-visual-003.test.mjs
//       （或整目录）：node --test 'tests/unit/*.test.mjs'
// Exit: 0 = all assertions passed, 1 = failure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var APP_WEB = path.resolve(__dirname, '../../app/web');

function readSrc(rel) {
  return readFileSync(path.join(APP_WEB, rel), 'utf8');
}

var MANIFEST_SRC = readSrc('manifest.js');
var LETTER_MOTION_SRC = readSrc('letter-motion.js');
var SPARKLES_SRC = readSrc('sparkles.js');
var POINTER_TRAIL_SRC = readSrc('pointer-trail.js');
var POINTER_SRC = readSrc('pointer.js');
var APP_SRC = readSrc('app.js');

// --- canvas ctx / document stub（与 app-visual-086.test.mjs 同款，另加 fillStyle 历史记录与
//     document.querySelectorAll('.wtj-tt-drag-target') 的可配置桩） -------------------------

function makeFakeGradient() {
  return { addColorStop: function () {} };
}

function makeOffscreenCanvasElement() {
  var octx = {
    createRadialGradient: function () { return makeFakeGradient(); },
    beginPath: function () {},
    arc: function () {},
    fill: function () {},
    save: function () {},
    restore: function () {},
    moveTo: function () {},
    lineTo: function () {},
    stroke: function () {},
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 1
  };
  return {
    width: 0,
    height: 0,
    getContext: function () { return octx; }
  };
}

function makeStageCtx() {
  var rec = {
    drawImageCalls: [],  // 星点贴图 drawImage 调用——尾迹/爆发的星点渲染都走这里
    arcCalls: [],
    fillStyleHistory: [] // 每次赋值 ctx.fillStyle 都记录一次，用于断言"旧版扁平蓝点样式从未出现"
  };
  var _font = '10px sans-serif';
  var _fillStyle = '#000';
  var ctx = {
    setTransform: function () {},
    clearRect: function () {},
    fillRect: function () {},
    beginPath: function () {},
    arc: function (x, y, r) { rec.arcCalls.push({ x: x, y: y, r: r }); },
    moveTo: function () {},
    lineTo: function () {},
    closePath: function () {},
    fill: function () {},
    stroke: function () {},
    save: function () {},
    restore: function () {},
    translate: function () {},
    rotate: function () {},
    fillText: function () {},
    strokeText: function () {},
    drawImage: function (img, dx, dy, dw, dh) { rec.drawImageCalls.push({ dx: dx, dy: dy, dw: dw, dh: dh }); },
    measureText: function () { return { width: 10 }; },
    createLinearGradient: function () { return makeFakeGradient(); },
    createRadialGradient: function () { return makeFakeGradient(); },
    lineJoin: 'miter',
    lineWidth: 1,
    strokeStyle: '#000',
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    _rec: rec
  };
  Object.defineProperty(ctx, 'font', {
    get: function () { return _font; },
    set: function (v) { _font = v; }
  });
  Object.defineProperty(ctx, 'fillStyle', {
    get: function () { return _fillStyle; },
    set: function (v) { _fillStyle = v; rec.fillStyleHistory.push(v); }
  });
  Object.defineProperty(ctx, 'filter', {
    get: function () { return 'none'; },
    set: function () {}
  });
  return ctx;
}

function makeFakeElement(tag) {
  return {
    tagName: tag,
    style: {},
    textContent: '',
    width: 0,
    height: 0,
    classList: { add: function () {}, remove: function () {} },
    addEventListener: function () {}
  };
}

// 构造真实 manifest.js + letter-motion.js + sparkles.js + pointer-trail.js + pointer.js +
// app.js 的沙箱（真实加载顺序，与 index.html 一致）。dropTargetEls 是一个可变数组，测试用例可
// 随时 push/清空——document.querySelectorAll('.wtj-tt-drag-target') 恒返回它的当前内容，模拟
// task-templates.js（014）渲染出的放置目标 DOM（本文件不加载 task-templates.js 本身，只模拟它
// 留下的 class 名约定，见 app.js drawTrail() 里 queryDropTargetRects() 的注释）。
function makeSandbox(opts) {
  opts = opts || {};
  var stageCtx = makeStageCtx();
  var dropTargetEls = [];
  var elements = {
    stage: {
      tagName: 'canvas',
      style: {},
      width: 0,
      height: 0,
      getContext: function () { return stageCtx; }
    },
    'dbg-key': makeFakeElement('div'),
    'dbg-mouse': makeFakeElement('div'),
    'dbg-fps': makeFakeElement('div'),
    'dbg-audio': makeFakeElement('div'),
    'esc-progress-wrap': makeFakeElement('div'),
    'esc-progress-bar': makeFakeElement('div')
  };

  var fakeDocument = {
    getElementById: function (id) { return elements[id] || null; },
    createElement: function (tag) {
      if (tag === 'canvas') return makeOffscreenCanvasElement();
      return { style: {}, classList: { add: function () {}, remove: function () {} } };
    },
    querySelectorAll: function (selector) {
      if (selector === '.wtj-tt-drag-target') return dropTargetEls.slice();
      return [];
    }
  };

  var windowListeners = {};
  var fakeNow = 0;

  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.document = fakeDocument;
  sandbox.console = { warn: function () {}, error: function () {}, log: function () {} };
  sandbox.performance = { now: function () { return fakeNow; } };
  sandbox.devicePixelRatio = 1;
  sandbox.innerWidth = opts.innerWidth || 1920;
  sandbox.innerHeight = opts.innerHeight || 1080;
  var rafCallback = null;
  sandbox.requestAnimationFrame = function (fn) { rafCallback = fn; return 1; };
  // 支持同一 type 多个监听器（pointer.js 与 app.js 都各自挂了一套 mousemove/mousedown/
  // mouseup/click 监听），与 tests/unit/app-visual-086.test.mjs / pointer-engine.test.mjs
  // 的沙箱同款约定。
  sandbox.addEventListener = function (type, fn) {
    if (!windowListeners[type]) windowListeners[type] = [];
    windowListeners[type].push(fn);
  };

  vm.createContext(sandbox);
  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  vm.runInContext(LETTER_MOTION_SRC, sandbox, { filename: 'letter-motion.js' });
  vm.runInContext(SPARKLES_SRC, sandbox, { filename: 'sparkles.js' });
  vm.runInContext(POINTER_TRAIL_SRC, sandbox, { filename: 'pointer-trail.js' });
  vm.runInContext(POINTER_SRC, sandbox, { filename: 'pointer.js' });
  vm.runInContext(APP_SRC, sandbox, { filename: 'app.js' });

  // pointer.js 内部的尾迹/点击强度结算、悬停定时器默认走真实 Date.now()/setTimeout（见
  // pointer.js clockRef），与本文件用于 performance.now()/rAF 的 fakeNow 是两条独立的时间轴。
  // 用文档化的测试专用钩子 _setClock()（POINTER-API.md 第 3 节"测试专用"）把 pointer.js 的
  // 时钟也接到同一个 fakeNow 上——否则 setNow()/runFrame() 精确控制的时间点对 pointer.js 的
  // updateTrailIntensity() dt 计算不生效（两次 mousemove 之间的真实墙钟间隔可能是 0ms 或与
  // 测试意图不符），与 tests/unit/pointer-engine.test.mjs 的假时钟手法同款用途。
  if (sandbox.WTJ_POINTER && typeof sandbox.WTJ_POINTER._setClock === 'function') {
    sandbox.WTJ_POINTER._setClock({
      now: function () { return fakeNow; },
      setTimeout: function () { return 0; }, // 本文件不测试悬停判定，不需要真的排定时器
      clearTimeout: function () {}
    });
  }

  function fireWindowEvent(type, evt) {
    var handlers = (windowListeners[type] || []).slice();
    var e = evt || {};
    if (typeof e.button === 'undefined') e.button = 0;
    if (typeof e.preventDefault !== 'function') e.preventDefault = function () {};
    handlers.forEach(function (fn) { fn(e); });
  }

  function runFrame(now) {
    fakeNow = now;
    var fn = rafCallback;
    rafCallback = null;
    if (fn) fn(now);
  }

  function setNow(v) { fakeNow = v; }

  return {
    sandbox: sandbox,
    stageCtx: stageCtx,
    dropTargetEls: dropTargetEls,
    fireMouseMove: function (x, y) { fireWindowEvent('mousemove', { clientX: x, clientY: y }); },
    fireMouseDown: function (x, y, button) { fireWindowEvent('mousedown', { clientX: x, clientY: y, button: button }); },
    fireMouseUp: function (x, y, button) { fireWindowEvent('mouseup', { clientX: x, clientY: y, button: button }); },
    fireClick: function (x, y) { fireWindowEvent('click', { clientX: x, clientY: y }); },
    runFrame: runFrame,
    setNow: setNow
  };
}

// 同 letter-motion.test.mjs/pointer-trail.test.mjs 的 setMathRandomSequence()：覆盖沙箱内的
// Math.random() 为固定序列（耗尽后重复最后一个值），消除本文件所有随机分支的不确定性。
function setMathRandomSequence(sandbox, sequence) {
  vm.runInContext(
    '(function () { var __seq = ' + JSON.stringify(sequence) + '; var __i = 0; ' +
    'Math.random = function () { var v = __seq[Math.min(__i, __seq.length - 1)]; __i += 1; return v; }; })();',
    sandbox
  );
}

// --- 1. 鼠标移动尾迹：应产生 drawImage 星点渲染，且从未出现旧版扁平蓝点 fillStyle -------------

test('需求1：真实 mousemove 流程驱动 pointer.js -> app.js，尾迹用 ctx.drawImage 星点渲染，不是旧版 rgba(94,231,255,...) 圆点', function () {
  var env = makeSandbox({ innerWidth: 1920, innerHeight: 1080 });
  setMathRandomSequence(env.sandbox, [0.01]); // 恒低随机值：门槛必过 + pick(PALETTE) 第一色 + 星点参数落在下限附近

  env.setNow(0);
  env.runFrame(0);

  // 制造一段有速度的移动（dt>0 且 dx 明显），确保 pointer.js 结算出的 trailIntensity 明显 > 0.02。
  // 时间原点刻意取小值（而非 1000+）：sparkles.js drawSparkles() 的 twinkle 项是
  // sin((now/1000)*twinkleHz*2π + phaseRad)，now 越大这个正弦项越难手工推算/越容易在某个巧合
  // 取值下经过一个恰好接近 0 的相位（并非 bug，只是三角函数的自然特性）——用较小的 now 让相位
  // 项保持在可预测、明显为正的区间，避免测试本身因为选取的时间戳巧合撞上正弦低谷而变得脆弱。
  env.setNow(0);
  env.fireMouseMove(200, 200);
  env.setNow(50);
  env.fireMouseMove(260, 200); // 50ms 内移动 60px，速度 1.2px/ms，触发 pointer.js 的高速度分支

  env.setNow(60);
  env.runFrame(60);

  var rec = env.stageCtx._rec;
  assert.ok(rec.drawImageCalls.length > 0, '应至少发生一次 drawImage（星点渲染），实际=' + rec.drawImageCalls.length);

  var sawOldFlatDot = rec.fillStyleHistory.some(function (v) {
    return typeof v === 'string' && v.indexOf('94, 231, 255') !== -1;
  });
  assert.equal(sawOldFlatDot, false, '不应再出现旧版扁平蓝点 fillStyle（应已被星点渲染取代），实际 fillStyleHistory=' + JSON.stringify(rec.fillStyleHistory));
});

test('需求4（不重新实现，只消费）：pointer.js 的尾迹强度衰减/停顿恢复逻辑不受本卡改动影响——静止 3 秒以上 trailIntensity 应显著衰减', function () {
  var env = makeSandbox({ innerWidth: 1920, innerHeight: 1080 });
  setMathRandomSequence(env.sandbox, [0.01]);

  var WTJ_POINTER = env.sandbox.WTJ_POINTER;
  env.setNow(0);
  env.runFrame(0);

  env.setNow(0);
  env.fireMouseMove(100, 100);
  var earlyIntensity = WTJ_POINTER.getTrailIntensity();

  // 持续小幅晃动到 3.5 秒（同一段"晃动"，间隔均 <220ms，触发 idleDecayApproxSec=3s 后的衰减坡道）。
  var i;
  var t = 0;
  for (i = 0; i < 20; i++) {
    t += 180;
    env.setNow(t);
    env.fireMouseMove(100 + (i % 2), 100); // 极小幅度移动，避免高速度把 baseIntensity 顶到上限掩盖衰减
  }
  var lateIntensity = WTJ_POINTER.getTrailIntensity();

  assert.ok(lateIntensity < earlyIntensity, '持续晃动超过 3 秒后强度应明显低于早期，earlyIntensity=' + earlyIntensity + ' lateIntensity=' + lateIntensity);
});

// --- 2. 点击命中 vs 未命中；拖拽成功 vs 取消 ---------------------------------------------------

test('需求2：点击命中已注册的有效 target（clickHit）比点击空白处（clickMiss）产生明显更多的星点渲染', function () {
  function runClickScenario(hit) {
    var env = makeSandbox({ innerWidth: 1920, innerHeight: 1080 });
    setMathRandomSequence(env.sandbox, [0.01]);
    var WTJ_POINTER = env.sandbox.WTJ_POINTER;

    WTJ_POINTER.registerTarget('basket', {
      getBounds: function () { return { x: 300, y: 300, w: 100, h: 100 }; },
      accepts: ['click']
    });

    env.setNow(0);
    env.runFrame(0);

    var pt = hit ? { x: 340, y: 340 } : { x: 900, y: 900 };
    env.setNow(0);
    env.fireClick(pt.x, pt.y);

    env.setNow(10);
    env.runFrame(10);

    return env.stageCtx._rec.drawImageCalls.length;
  }

  var missCount = runClickScenario(false);
  var hitCount = runClickScenario(true);

  assert.equal(missCount, 0, '点击空白处不应叠加星点爆发（现状：只保留既有点击圆环），实际=' + missCount);
  assert.ok(hitCount > missCount, '点击命中有效 target 应比未命中产生更多星点渲染，miss=' + missCount + ' hit=' + hitCount);
});

test('需求2：拖拽成功放下（dragSuccess）在落点产生一次星点爆发；dropCancel（拖错）不产生额外爆发', function () {
  function runDragScenario(succeed) {
    var env = makeSandbox({ innerWidth: 1920, innerHeight: 1080 });
    setMathRandomSequence(env.sandbox, [0.01]);
    var WTJ_POINTER = env.sandbox.WTJ_POINTER;

    WTJ_POINTER.registerTarget('apple', {
      getBounds: function () { return { x: 100, y: 100, w: 60, h: 60 }; },
      draggable: true,
      dropTargetIds: ['basket']
    });
    WTJ_POINTER.registerTarget('basket', {
      getBounds: function () { return { x: 500, y: 500, w: 100, h: 100 }; },
      accepts: ['drag']
    });

    env.setNow(0);
    env.runFrame(0);

    env.setNow(0);
    env.fireMouseDown(120, 120, 0); // 命中 apple，开始拖拽

    var dropPoint = succeed ? { x: 540, y: 540 } : { x: 900, y: 900 }; // 成功落在 basket 内 / 拖到空白处
    env.setNow(50);
    env.fireMouseUp(dropPoint.x, dropPoint.y, 0);

    env.setNow(60);
    env.runFrame(60);

    return env.stageCtx._rec.drawImageCalls.length;
  }

  var cancelCount = runDragScenario(false);
  var successCount = runDragScenario(true);

  assert.equal(cancelCount, 0, 'dropCancel（拖错）不应叠加额外星点爆发（"拖错不惩罚"），实际=' + cancelCount);
  assert.ok(successCount > 0, '拖拽成功放下应在落点产生星点爆发，实际=' + successCount);
});

// --- 3. 拖拽中尾迹不得遮挡 drop target（需求5） -----------------------------------------------

test('需求5：拖拽中，若 .wtj-tt-drag-target 元素覆盖尾迹点位置，该点被完全避让（不渲染）', function () {
  var env = makeSandbox({ innerWidth: 1920, innerHeight: 1080 });
  setMathRandomSequence(env.sandbox, [0.01]);
  var WTJ_POINTER = env.sandbox.WTJ_POINTER;

  WTJ_POINTER.registerTarget('apple', {
    getBounds: function () { return { x: 100, y: 100, w: 60, h: 60 }; },
    draggable: true
  });
  WTJ_POINTER.registerTarget('basket', {
    getBounds: function () { return { x: 500, y: 500, w: 100, h: 100 }; },
    accepts: ['drag']
  });

  // 模拟 014 渲染出的放置目标 DOM：边界与 pointer.js 里的 basket 一致，class 名与
  // task-templates.js renderDragTask() 一致（'.wtj-tt-drag-target'，见 app.js
  // queryDropTargetRects() 注释）。
  env.dropTargetEls.push({ getBoundingClientRect: function () { return { left: 500, top: 500, width: 100, height: 100 }; } });

  env.setNow(0);
  env.runFrame(0);

  env.setNow(0);
  env.fireMouseDown(120, 120, 0); // 开始拖拽 apple
  assert.equal(WTJ_POINTER.getPointerState().dragging, true, '拖拽应已开始');

  // 指针移动到 drop target 内部（正在拖着苹果路过篮子上方）——这一次 move 会 spawnTrailDot(tier='move')。
  env.setNow(30);
  env.fireMouseMove(540, 540);

  env.setNow(40);
  env.runFrame(40);

  assert.equal(env.stageCtx._rec.drawImageCalls.length, 0, '拖拽中经过 drop target 内部的尾迹点应被完全避让（0 次 drawImage），实际=' + env.stageCtx._rec.drawImageCalls.length);
});

test('需求5（对照组）：同样的拖拽路径，若没有 .wtj-tt-drag-target 元素覆盖该位置，尾迹应正常渲染', function () {
  var env = makeSandbox({ innerWidth: 1920, innerHeight: 1080 });
  setMathRandomSequence(env.sandbox, [0.01]);
  var WTJ_POINTER = env.sandbox.WTJ_POINTER;

  WTJ_POINTER.registerTarget('apple', {
    getBounds: function () { return { x: 100, y: 100, w: 60, h: 60 }; },
    draggable: true
  });
  WTJ_POINTER.registerTarget('basket', {
    getBounds: function () { return { x: 500, y: 500, w: 100, h: 100 }; },
    accepts: ['drag']
  });
  // 故意不 push 任何 dropTargetEls——document.querySelectorAll('.wtj-tt-drag-target') 恒返回空。

  env.setNow(0);
  env.runFrame(0);

  env.setNow(0);
  env.fireMouseDown(120, 120, 0);

  env.setNow(30);
  env.fireMouseMove(540, 540); // 同一坐标，但这次没有对应的 DOM drop target 元素

  env.setNow(40);
  env.runFrame(40);

  assert.ok(env.stageCtx._rec.drawImageCalls.length > 0, '没有 .wtj-tt-drag-target 元素时，同一位置的尾迹应正常渲染（证明避让只在真的有 drop target 覆盖时生效），实际=' + env.stageCtx._rec.drawImageCalls.length);
});

test('需求5：不在拖拽状态时，即便鼠标经过与 basket 相同坐标，也不做避让判定（正常渲染）', function () {
  var env = makeSandbox({ innerWidth: 1920, innerHeight: 1080 });
  setMathRandomSequence(env.sandbox, [0.01]);

  env.dropTargetEls.push({ getBoundingClientRect: function () { return { left: 500, top: 500, width: 100, height: 100 }; } });

  env.setNow(0);
  env.runFrame(0);

  // 未发生任何 mousedown/拖拽，直接路过同一坐标。
  env.setNow(0);
  env.fireMouseMove(500, 500);
  env.setNow(30);
  env.fireMouseMove(540, 540);

  env.setNow(40);
  env.runFrame(40);

  assert.ok(env.stageCtx._rec.drawImageCalls.length > 0, '非拖拽状态下不应做避让判定，同一坐标应正常渲染尾迹，实际=' + env.stageCtx._rec.drawImageCalls.length);
});

test('window.WTJ_POINTER_TRAIL 缺失时 app.js 回退到旧版扁平圆点渲染，不抛错、尾迹仍可见', function () {
  var stageCtx = makeStageCtx();
  var elements = {
    stage: { tagName: 'canvas', style: {}, width: 0, height: 0, getContext: function () { return stageCtx; } },
    'dbg-key': makeFakeElement('div'),
    'dbg-mouse': makeFakeElement('div'),
    'dbg-fps': makeFakeElement('div'),
    'dbg-audio': makeFakeElement('div'),
    'esc-progress-wrap': makeFakeElement('div'),
    'esc-progress-bar': makeFakeElement('div')
  };
  var fakeDocument = {
    getElementById: function (id) { return elements[id] || null; },
    createElement: function (tag) {
      if (tag === 'canvas') return makeOffscreenCanvasElement();
      return { style: {}, classList: { add: function () {}, remove: function () {} } };
    },
    querySelectorAll: function () { return []; }
  };
  var windowListeners = {};
  var fakeNow = 0;
  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.document = fakeDocument;
  sandbox.console = { warn: function () {}, error: function () {}, log: function () {} };
  sandbox.performance = { now: function () { return fakeNow; } };
  sandbox.devicePixelRatio = 1;
  sandbox.innerWidth = 1920;
  sandbox.innerHeight = 1080;
  var rafCallback = null;
  sandbox.requestAnimationFrame = function (fn) { rafCallback = fn; return 1; };
  sandbox.addEventListener = function (type, fn) {
    if (!windowListeners[type]) windowListeners[type] = [];
    windowListeners[type].push(fn);
  };

  vm.createContext(sandbox);
  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  vm.runInContext(LETTER_MOTION_SRC, sandbox, { filename: 'letter-motion.js' });
  vm.runInContext(SPARKLES_SRC, sandbox, { filename: 'sparkles.js' });
  // 故意不加载 pointer-trail.js。
  vm.runInContext(POINTER_SRC, sandbox, { filename: 'pointer.js' });

  assert.doesNotThrow(function () {
    vm.runInContext(APP_SRC, sandbox, { filename: 'app.js' });
  }, 'app.js 在 pointer-trail.js 缺失时不应抛错（防御式回退）');

  vm.runInContext('Math.random = function () { return 0.01; };', sandbox, { filename: 'fake-random.js' });

  fakeNow = 0;
  var fn0 = rafCallback; rafCallback = null; if (fn0) fn0(0);

  fakeNow = 1000;
  (windowListeners.mousemove || []).forEach(function (h) { h({ clientX: 200, clientY: 200 }); });
  fakeNow = 1050;
  (windowListeners.mousemove || []).forEach(function (h) { h({ clientX: 260, clientY: 200 }); });

  fakeNow = 1060;
  var fn = rafCallback; rafCallback = null;
  assert.doesNotThrow(function () {
    if (fn) fn(1060);
  }, 'pointer-trail.js 缺失时 draw()/drawTrail() 仍应能正常跑完一帧');

  var rec = stageCtx._rec;
  var sawOldFlatDot = rec.fillStyleHistory.some(function (v) {
    return typeof v === 'string' && v.indexOf('94, 231, 255') !== -1;
  });
  assert.ok(sawOldFlatDot, '缺失 WTJ_POINTER_TRAIL 时应回退到旧版扁平蓝点渲染（保底不空白），实际 fillStyleHistory=' + JSON.stringify(rec.fillStyleHistory));
});
