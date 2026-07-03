// WTJ-20260704-012 — pointer.js 单元测试（durable QA asset）
//
// 用 Node 内置 vm 模块搭一个沙箱 context，按 index.html 的真实加载顺序在同一 sandbox 里
// 先加载真实的 app/web/manifest.js（其 IIFE 会 window.WTJ_MANIFEST = deepFreeze(...)），
// 再加载真实的 app/web/pointer.js（读取 window.WTJ_MANIFEST，挂 window.WTJ_POINTER）——
// 引擎读到的是产品真实 manifest 数值（pointer.move.idleDecayApproxSec=3 /
// pointer.drag.elastic.* / tasks.timing.findHoverSec=1），断言也直接取自真实 manifest，
// 消除"手工镜像 manifest 数值"的漂移风险（与 keyboard-engine.test.mjs 同一模式）。
//
// sandbox 里额外提供 stub 的 window.addEventListener（捕获 mousemove/mousedown/mouseup/
// click 四个处理函数），然后通过手动调用捕获到的处理函数注入合成指针事件；再用 pointer.js
// 文档化的测试专用钩子 window.WTJ_POINTER._setClock({setTimeout, clearTimeout, now}) 注入
// 一个假时钟（与 task-lifecycle.test.mjs 的 makeFakeClock 同款实现），用 advance(ms) 快进
// 时间，尾迹 3 秒衰减 / 悬停 1 秒判定都不需要真等待。
//
// Run:  node --test tests/unit/pointer-engine.test.mjs
//       （或整目录，本机 Node 25 用 glob 不能裸目录）：node --test 'tests/unit/*.test.mjs'
// Exit: 0 = all assertions passed, 1 = failure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var MANIFEST_JS_PATH = path.resolve(__dirname, '../../app/web/manifest.js');
var POINTER_JS_PATH = path.resolve(__dirname, '../../app/web/pointer.js');
var MANIFEST_SRC = readFileSync(MANIFEST_JS_PATH, 'utf8');
var POINTER_SRC = readFileSync(POINTER_JS_PATH, 'utf8');

// --- fake/virtual clock (与 task-lifecycle.test.mjs 的 makeFakeClock 同款实现) -----------
// 确定性替代 setTimeout/clearTimeout/Date.now，用 advance(ms) 驱动虚拟时间前进。pointer.js
// 的尾迹/点击强度结算也全部经由 clockRef.now() 取时间戳（不是散落的 Date.now() 调用），
// 因此注入假时钟后，尾迹 3 秒衰减、点击间隔判定、悬停 1 秒判定这三类计时逻辑都可以用
// advance(ms) 精确控制，不必真等待。
function makeFakeClock() {
  var virtualNow = 0;
  var timers = [];
  var nextId = 1;

  function fakeSetTimeout(fn, ms) {
    var id = nextId++;
    timers.push({ id: id, fireAt: virtualNow + ms, fn: fn, fired: false, cancelled: false });
    return id;
  }

  function fakeClearTimeout(id) {
    for (var i = 0; i < timers.length; i++) {
      if (timers[i].id === id) {
        timers[i].cancelled = true;
      }
    }
  }

  function fakeNow() {
    return virtualNow;
  }

  function advance(ms) {
    var target = virtualNow + ms;
    for (;;) {
      var next = null;
      for (var i = 0; i < timers.length; i++) {
        var t = timers[i];
        if (!t.cancelled && !t.fired && t.fireAt <= target) {
          if (next === null || t.fireAt < next.fireAt) {
            next = t;
          }
        }
      }
      if (!next) break;
      virtualNow = next.fireAt;
      next.fired = true;
      next.fn();
    }
    virtualNow = target;
  }

  return { setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout, now: fakeNow, advance: advance };
}

// --- sandbox builder -------------------------------------------------------------------
// opts.omitManifest: true 时不加载 manifest.js（模拟 manifest.js 未加载/加载失败场景）。
// opts.manifestOverrideSrc: 若提供，替换加载的 manifest.js 源码（用于"字段缺失但对象存在"场景）。
function createSandbox(opts) {
  var options = opts || {};
  var handlers = {};
  var warnCalls = [];
  var errorCalls = [];

  var fakeWindow = {
    addEventListener: function (type, handler) {
      handlers[type] = handler;
    },
    removeEventListener: function () {}
  };

  var sandbox = {
    window: fakeWindow,
    console: {
      log: function () {},
      warn: function () { warnCalls.push(Array.prototype.slice.call(arguments).join(' ')); },
      error: function () { errorCalls.push(Array.prototype.slice.call(arguments).join(' ')); }
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Date: Date
  };
  vm.createContext(sandbox);

  if (!options.omitManifest) {
    vm.runInContext(options.manifestOverrideSrc || MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  }
  vm.runInContext(POINTER_SRC, sandbox, { filename: 'pointer.js' });

  assert.equal(typeof handlers.mousemove, 'function', 'pointer.js 必须注册 mousemove 监听');
  assert.equal(typeof handlers.mousedown, 'function', 'pointer.js 必须注册 mousedown 监听');
  assert.equal(typeof handlers.mouseup, 'function', 'pointer.js 必须注册 mouseup 监听');
  assert.equal(typeof handlers.click, 'function', 'pointer.js 必须注册 click 监听');
  assert.ok(fakeWindow.WTJ_POINTER, 'pointer.js 必须挂载 window.WTJ_POINTER');

  var clock = makeFakeClock();
  fakeWindow.WTJ_POINTER._setClock({ setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, now: clock.now });

  function fireMove(x, y) {
    handlers.mousemove({ clientX: x, clientY: y });
  }
  function fireDown(x, y, extra) {
    var evt = { clientX: x, clientY: y };
    if (extra) {
      for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) evt[k] = extra[k]; }
    }
    handlers.mousedown(evt);
  }
  function fireUp(x, y, extra) {
    var evt = { clientX: x, clientY: y };
    if (extra) {
      for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) evt[k] = extra[k]; }
    }
    handlers.mouseup(evt);
  }
  function fireClick(x, y) {
    handlers.click({ clientX: x, clientY: y });
  }

  return {
    contextObject: sandbox, // vm.createContext 处理过的原始对象，重跑源码（如重复引入测试）需要它
    window: fakeWindow,
    manifest: fakeWindow.WTJ_MANIFEST,
    POINTER: fakeWindow.WTJ_POINTER,
    clock: clock,
    warnCalls: warnCalls,
    errorCalls: errorCalls,
    fireMove: fireMove,
    fireDown: fireDown,
    fireUp: fireUp,
    fireClick: fireClick
  };
}

// =========================================================================================
// 1. API 表面 / 冻结 / 绑定加固
// =========================================================================================

test('API 冻结：window.WTJ_POINTER 是 frozen 对象，方法齐全，绑定不可写', function () {
  var sb = createSandbox();
  assert.equal(Object.isFrozen(sb.POINTER), true);
  [
    'onMove', 'onClickFeedback', 'onDragStart', 'onDragMove', 'onDrop',
    'registerTarget', 'unregisterTarget',
    'getTrailIntensity', 'getClickIntensity', 'getPointerState', '_setClock'
  ].forEach(function (name) {
    assert.equal(typeof sb.POINTER[name], 'function', 'API 缺少方法: ' + name);
  });

  try { sb.POINTER.onMove = null; } catch (e) { /* 严格模式抛错也算通过 */ }
  assert.equal(typeof sb.POINTER.onMove, 'function', 'API 对象本身应不可篡改（Object.freeze）');

  var desc = Object.getOwnPropertyDescriptor(sb.window, 'WTJ_POINTER');
  assert.equal(desc.writable, false, 'window.WTJ_POINTER 绑定应不可写');
  assert.equal(desc.configurable, false, 'window.WTJ_POINTER 绑定应不可重配置');
});

test('重复引入守卫：再次执行 pointer.js 源码是安全 no-op，window.WTJ_POINTER 仍是实例 1，事件不重复派发', function () {
  var sb = createSandbox();
  var moveCalls = [];
  sb.POINTER.onMove(function (x, y) { moveCalls.push([x, y]); });

  // 第二次引入：在同一 contextified 对象上再跑一遍真实 pointer.js 源码（模拟 <script> 被
  // 意外插入两次）。IIFE 顶部的 `if (window.WTJ_POINTER) { return; }` 应让这次重跑变成
  // 安全 no-op：不重新注册 window 级监听器，也不替换 window.WTJ_POINTER 绑定。
  vm.runInContext(POINTER_SRC, sb.contextObject, { filename: 'pointer.js (dup)' });
  assert.equal(sb.window.WTJ_POINTER, sb.POINTER, 'window.WTJ_POINTER 重复引入后应仍是第一个实例');

  sb.fireMove(1, 1);
  assert.equal(moveCalls.length, 1, '重复引入不应导致同一次 mousemove 触发两次 onMove 回调（无重复监听器）');
});

test('防御式：window.WTJ_MANIFEST 缺失时不抛错，仍挂载 API 并使用内置默认值（悬停默认 1 秒生效）', function () {
  var sb = createSandbox({ omitManifest: true });
  assert.ok(sb.warnCalls.some(function (m) { return m.indexOf('WTJ_MANIFEST') !== -1; }), '应有 console.warn 提示 manifest 缺失');
  assert.ok(sb.POINTER, 'manifest 缺失时 WTJ_POINTER 仍应挂载');

  var hovered = [];
  sb.POINTER.registerTarget('dog', {
    getBounds: function () { return { x: 0, y: 0, w: 10, h: 10 }; },
    accepts: ['hover'],
    onHover: function (id) { hovered.push(id); }
  });
  assert.doesNotThrow(function () {
    sb.fireMove(5, 5);
    sb.clock.advance(999);
  });
  assert.deepEqual(hovered, [], '未到默认 1 秒阈值前不应触发');
  sb.clock.advance(1);
  assert.deepEqual(hovered, ['dog'], '默认 findHoverSec=1 秒到达后应触发（manifest 缺失时的内置默认值）');
});

test('防御式：window.WTJ_MANIFEST 存在但 pointer/tasks 字段残缺时不抛错，回退内置默认值', function () {
  var brokenManifestSrc = 'window.WTJ_MANIFEST = { meta: { version: "x" } };';
  var sb = createSandbox({ manifestOverrideSrc: brokenManifestSrc });
  assert.doesNotThrow(function () {
    sb.fireMove(0, 0);
    sb.fireDown(0, 0);
    sb.fireUp(0, 0);
    sb.fireClick(0, 0);
  });
  assert.ok(sb.POINTER.getPointerState());
});

// =========================================================================================
// 2. 尾迹强度衰减（REQ-PTR-01）
// =========================================================================================

test('尾迹衰减：连续高频快速移动约 3 秒（真实 manifest idleDecayApproxSec）后强度明显下降；停顿后强度恢复', function () {
  var sb = createSandbox();
  // 真实 manifest 数值前置断言：确认引擎读到的确实是产品真值 3 秒。
  assert.equal(sb.manifest.pointer.move.idleDecayApproxSec, 3);

  // 预热一次 move，建立 lastX/lastY/lastMoveTime 基线（第一次 move 因无前一个点，速度恒为 0，
  // 不计入下面"稳定速度基线"的读数）。
  sb.fireMove(0, 0);

  // 之后每 25ms 移动 50px（speed = 2 px/ms，明显快于饱和阈值），持续把虚拟时钟推进到远超过
  // 3000ms（idleDecayApproxSec*1000）+ 衰减坡道，确保读到"已经衰减到底"的强度。
  var x = 0;
  var earlyIntensity = null;
  var lateIntensity = null;
  var steps = 200; // 200 * 25ms = 5000ms，覆盖 3000ms 阈值 + 衰减坡道
  for (var i = 0; i < steps; i++) {
    sb.clock.advance(25);
    x += 50;
    sb.fireMove(x, 0);
    var intensity = sb.POINTER.getTrailIntensity();
    if (i === 0) {
      earlyIntensity = intensity; // 刚进入这段"晃动"，尚未过 3 秒阈值
    }
    if (i === steps - 1) {
      lateIntensity = intensity; // 已经持续晃动 ~5 秒，远超 3 秒阈值
    }
  }

  assert.ok(earlyIntensity > 0, '未衰减前尾迹强度应为正值（有反馈）');
  assert.ok(lateIntensity < earlyIntensity * 0.5, '持续晃动 ~5 秒后强度应明显低于起始强度（衰减到不足一半）：early=' + earlyIntensity + ' late=' + lateIntensity);
  assert.ok(lateIntensity <= 0.2, '衰减到底后强度应落在"很弱"区间（<=0.2）：late=' + lateIntensity);

  // 停顿：虚拟时钟前进 400ms（>本卡本地占位的"停一下"判定间隔），期间不产生任何 move。
  sb.clock.advance(400);
  // 停顿后再次快速移动（与最初同等速度量级），强度应恢复到接近起始基线，而非停在衰减地板值。
  x += 800; // 400ms 内移动 800px，speed = 2 px/ms，与前面稳定速度基线一致
  sb.fireMove(x, 0);
  var recoveredIntensity = sb.POINTER.getTrailIntensity();

  assert.ok(recoveredIntensity > lateIntensity * 1.5, '停顿后强度应明显高于衰减地板值（已恢复）：recovered=' + recoveredIntensity + ' late=' + lateIntensity);
  assert.ok(Math.abs(recoveredIntensity - earlyIntensity) < 0.05, '停顿恢复后的强度应接近最初的基线强度：recovered=' + recoveredIntensity + ' early=' + earlyIntensity);
});

test('onMove 回调收到的第三参数与 getTrailIntensity() 一致', function () {
  var sb = createSandbox();
  var received = [];
  sb.POINTER.onMove(function (x, y, intensity) { received.push(intensity); });
  sb.fireMove(10, 10);
  assert.equal(received.length, 1);
  assert.equal(received[0], sb.POINTER.getTrailIntensity());
});

// =========================================================================================
// 3. 点击强度衰减 / soundless（REQ-PTR-02）
// =========================================================================================

test('点击狂点：间隔 100ms 连续点击 6 次，强度逐次单调递减并在第 6 次到 0，全部标记 soundless（间隔过短）', function () {
  var sb = createSandbox();
  var feedbacks = [];
  sb.POINTER.onClickFeedback(function (x, y, fb) { feedbacks.push(fb); });

  sb.fireClick(0, 0); // 第 1 次：无上一次点击，intensity=1，soundless=false
  for (var i = 0; i < 5; i++) {
    sb.clock.advance(100);
    sb.fireClick(0, 0);
  }

  assert.equal(feedbacks.length, 6);
  assert.equal(feedbacks[0].intensity, 1);
  assert.equal(feedbacks[0].soundless, false, '第一下点击永远不应是 soundless');

  for (var j = 1; j < feedbacks.length; j++) {
    assert.ok(feedbacks[j].intensity <= feedbacks[j - 1].intensity, '强度应单调不增，第 ' + j + ' 次: ' + feedbacks[j].intensity + ' vs 前一次 ' + feedbacks[j - 1].intensity);
    assert.equal(feedbacks[j].soundless, true, '间隔 100ms 的连续点击第 ' + j + ' 次应标记 soundless（太快）');
  }
  assert.equal(feedbacks[5].intensity, 0, '连续狂点足够多次后强度应衰减到 0');
  assert.equal(sb.POINTER.getClickIntensity(), 0);
});

test('点击间隔正常（800ms）：每次都是新的一段，强度保持满值且有声（不 soundless）', function () {
  var sb = createSandbox();
  var feedbacks = [];
  sb.POINTER.onClickFeedback(function (x, y, fb) { feedbacks.push(fb); });

  sb.fireClick(0, 0);
  sb.clock.advance(800);
  sb.fireClick(0, 0);
  sb.clock.advance(800);
  sb.fireClick(0, 0);

  assert.equal(feedbacks.length, 3);
  feedbacks.forEach(function (fb, idx) {
    assert.equal(fb.intensity, 1, '正常间隔点击第 ' + idx + ' 次强度应保持满值');
    assert.equal(fb.soundless, false, '正常间隔点击第 ' + idx + ' 次不应 soundless');
  });
});

test('soundless 判定与"连续狂点衰减"判定使用独立阈值：300ms 间隔会延续衰减 streak 但不判 soundless', function () {
  var sb = createSandbox();
  var feedbacks = [];
  sb.POINTER.onClickFeedback(function (x, y, fb) { feedbacks.push(fb); });

  sb.fireClick(0, 0);           // streak=1, intensity=1, soundless=false
  sb.clock.advance(300);
  sb.fireClick(0, 0);           // 300ms：延续 streak（<=500）→ intensity 下降；但 300>=180 → soundless=false

  assert.equal(feedbacks[1].soundless, false, '300ms 间隔不应判定 soundless（未快到"太快"阈值）');
  assert.ok(feedbacks[1].intensity < feedbacks[0].intensity, '300ms 间隔仍应延续衰减 streak，强度低于第一下');
});

// =========================================================================================
// 4. 目标注册 / 点击命中（REQ-TASK-08）
// =========================================================================================

test('registerTarget + click 命中：点击落在 target 内触发 onClick，落在外部不触发', function () {
  var sb = createSandbox();
  var clicked = [];
  sb.POINTER.registerTarget('lamp', {
    getBounds: function () { return { x: 100, y: 100, w: 40, h: 40 }; },
    accepts: ['click'],
    onClick: function (id) { clicked.push(id); }
  });

  sb.fireClick(500, 500); // 命中外部
  assert.deepEqual(clicked, []);

  sb.fireClick(110, 110); // 命中内部
  assert.deepEqual(clicked, ['lamp']);
});

test('onClickFeedback payload 的 targetId：命中已注册的可点击 target 时带上其 id，未命中为 null', function () {
  var sb = createSandbox();
  sb.POINTER.registerTarget('lamp', {
    getBounds: function () { return { x: 100, y: 100, w: 40, h: 40 }; },
    accepts: ['click']
  });
  var feedbacks = [];
  sb.POINTER.onClickFeedback(function (x, y, fb) { feedbacks.push(fb); });

  sb.fireClick(500, 500);
  sb.fireClick(110, 110);

  assert.equal(feedbacks[0].targetId, null);
  assert.equal(feedbacks[1].targetId, 'lamp');
});

test('unregisterTarget：卸载后点击/悬停都不再触发对应回调', function () {
  var sb = createSandbox();
  var clicked = [];
  var hovered = [];
  sb.POINTER.registerTarget('lamp', {
    getBounds: function () { return { x: 100, y: 100, w: 40, h: 40 }; },
    accepts: ['click', 'hover'],
    onClick: function (id) { clicked.push(id); },
    onHover: function (id) { hovered.push(id); }
  });

  sb.fireMove(110, 110); // 进入 bounds，开始悬停计时
  sb.POINTER.unregisterTarget('lamp');

  sb.clock.advance(2000); // 远超 findHoverSec，若计时器未被清理会误触发
  assert.deepEqual(hovered, [], '卸载后不应再触发 onHover（悬停计时器应被一并清理）');

  sb.fireClick(110, 110);
  assert.deepEqual(clicked, [], '卸载后不应再触发 onClick');
});

// =========================================================================================
// 5. 悬停判定（REQ-TASK-09，findHoverSec=1，真实 manifest 数值）
// =========================================================================================

test('悬停 1 秒判定：停留满 1 秒触发 onHover，不足 1 秒时移出则不触发（移出重置计时）', function () {
  var sb = createSandbox();
  assert.equal(sb.manifest.tasks.timing.findHoverSec, 1);

  var hoveredA = [];
  var hoveredB = [];
  sb.POINTER.registerTarget('dogA', {
    getBounds: function () { return { x: 0, y: 0, w: 20, h: 20 }; },
    accepts: ['hover'],
    onHover: function (id) { hoveredA.push(id); }
  });
  sb.POINTER.registerTarget('dogB', {
    getBounds: function () { return { x: 100, y: 100, w: 20, h: 20 }; },
    accepts: ['hover'],
    onHover: function (id) { hoveredB.push(id); }
  });

  // A：停满 1 秒 → 触发。
  sb.fireMove(10, 10);
  sb.clock.advance(999);
  assert.deepEqual(hoveredA, [], '未满 1 秒不应触发');
  sb.clock.advance(1);
  assert.deepEqual(hoveredA, ['dogA'], '恰好满 1 秒应触发');

  // B：停 500ms 后移出，不应触发；移出后即使再等很久也不触发。
  sb.fireMove(110, 110);
  sb.clock.advance(500);
  sb.fireMove(9999, 9999); // 移出 B 的 bounds
  sb.clock.advance(600);   // 累计已超过 1 秒，但中途移出应已重置计时
  assert.deepEqual(hoveredB, [], '悬停期间移出应重置计时，不应触发 onHover');
});

test('悬停判定：移出后重新移入，重新计满 1 秒后仍能触发（不是"一辈子只有一次机会"）', function () {
  var sb = createSandbox();
  var hovered = [];
  sb.POINTER.registerTarget('dog', {
    getBounds: function () { return { x: 0, y: 0, w: 20, h: 20 }; },
    accepts: ['hover'],
    onHover: function (id) { hovered.push(id); }
  });

  sb.fireMove(10, 10);
  sb.clock.advance(400);
  sb.fireMove(9999, 9999); // 移出，重置
  sb.clock.advance(400);
  sb.fireMove(10, 10);     // 重新移入
  sb.clock.advance(1000);
  assert.deepEqual(hovered, ['dog'], '重新移入并停满 1 秒应能再次触发');
});

// =========================================================================================
// 6. 拖拽状态机（REQ-PTR-03 / REQ-TASK-07）
// =========================================================================================

function setupDragScenario(sb) {
  var dragStarts = [];
  var dragMoves = [];
  var drops = [];
  var basketDropCalls = [];

  sb.POINTER.registerTarget('apple', {
    getBounds: function () { return { x: 10, y: 10, w: 20, h: 20 }; },
    draggable: true
  });
  sb.POINTER.registerTarget('basket', {
    getBounds: function () { return { x: 200, y: 200, w: 50, h: 50 }; },
    accepts: ['drag'],
    onDrop: function (payload) { basketDropCalls.push(payload); }
  });

  sb.POINTER.onDragStart(function (p) { dragStarts.push(p); });
  sb.POINTER.onDragMove(function (p) { dragMoves.push(p); });
  sb.POINTER.onDrop(function (p) { drops.push(p); });

  return { dragStarts: dragStarts, dragMoves: dragMoves, drops: drops, basketDropCalls: basketDropCalls };
}

test('拖拽：mousedown 命中 draggable target 触发 dragStart，getPointerState 反映 dragging/activeDragId', function () {
  var sb = createSandbox();
  var s = setupDragScenario(sb);

  sb.fireDown(15, 15); // 命中 apple（bounds 10,10,20,20）

  assert.equal(s.dragStarts.length, 1);
  // 逐字段比较：dragStarts[0] 是 vm 沙箱 realm 内创建的对象，与本文件（主 realm）字面量
  // 原型不同，deepStrictEqual 会因 [[Prototype]] 不一致误判失败（与 keyboard-engine.test.mjs
  // 的既有注记同一原因），故逐字段比较，而非用 deepEqual。
  assert.equal(s.dragStarts[0].id, 'apple');
  assert.equal(s.dragStarts[0].x, 15);
  assert.equal(s.dragStarts[0].y, 15);

  var state = sb.POINTER.getPointerState();
  assert.equal(state.dragging, true);
  assert.equal(state.activeDragId, 'apple');
});

test('拖拽：mousedown 未命中任何 draggable target 时不进入 dragging 状态', function () {
  var sb = createSandbox();
  var s = setupDragScenario(sb);

  sb.fireDown(500, 500); // 空白处

  assert.deepEqual(s.dragStarts, []);
  assert.equal(sb.POINTER.getPointerState().dragging, false);
});

test('拖拽：dragging 期间 mousemove 触发 dragMove，followX/followY 弹性跟随（有延迟，不瞬间贴合）', function () {
  var sb = createSandbox();
  var s = setupDragScenario(sb);

  sb.fireDown(15, 15); // dragOffset = (15-10, 15-10) = (5,5)；followPos 初始 = (10,10)
  sb.fireMove(20, 20); // targetPos = (20-5, 20-5) = (15,15)

  assert.equal(s.dragMoves.length, 1);
  var m = s.dragMoves[0];
  assert.equal(m.id, 'apple');
  assert.equal(m.x, 20);
  assert.equal(m.y, 20);
  // 真实 manifest 弹性系数：stiffness=0.2 → 第一步 followPos 应该只移动了目标位移的一部分
  // （从 10 朝 15 移动，但不应该一步到位到 15，证明"弹性跟随"而非瞬间贴合）。
  assert.ok(m.followX > 10 && m.followX < 15, 'followX 应部分朝目标移动但未瞬间贴合: ' + m.followX);
  assert.ok(m.followY > 10 && m.followY < 15, 'followY 应部分朝目标移动但未瞬间贴合: ' + m.followY);

  // 继续在同一目标位置附近多次触发，followPos 应持续朝指针位置收敛。
  var prevDist = Math.abs(15 - m.followX);
  for (var i = 0; i < 20; i++) {
    sb.fireMove(20, 20);
  }
  var last = s.dragMoves[s.dragMoves.length - 1];
  var lastDist = Math.abs(15 - last.followX);
  assert.ok(lastDist < prevDist, '多次停留在同一目标位置后，followPos 应持续收敛，离目标更近: prevDist=' + prevDist + ' lastDist=' + lastDist);
  assert.ok(lastDist < 0.5, '充分收敛后 followPos 应非常接近目标位置');
});

test('拖拽：mouseup 命中有效落点（accepts drag）→ emit drop 成功事件 + 调用该 target 的 onDrop', function () {
  var sb = createSandbox();
  var s = setupDragScenario(sb);

  sb.fireDown(15, 15);
  sb.fireMove(220, 220); // 移到 basket 范围内（200,200,50,50）
  sb.fireUp(220, 220);

  assert.equal(s.drops.length, 1);
  // 逐字段比较（vm 沙箱 realm 对象，理由同上）。
  assert.equal(s.drops[0].success, true);
  assert.equal(s.drops[0].type, 'drop');
  assert.equal(s.drops[0].draggedId, 'apple');
  assert.equal(s.drops[0].targetId, 'basket');
  assert.equal(s.drops[0].x, 220);
  assert.equal(s.drops[0].y, 220);

  assert.equal(s.basketDropCalls.length, 1);
  assert.equal(s.basketDropCalls[0].draggedId, 'apple');
  assert.equal(s.basketDropCalls[0].x, 220);
  assert.equal(s.basketDropCalls[0].y, 220);

  var state = sb.POINTER.getPointerState();
  assert.equal(state.dragging, false);
  assert.equal(state.activeDragId, null);
});

test('拖拽：mouseup 落在错误位置（未命中任何 accepts-drag target）→ emit dropCancel，目标 onDrop 未被调用', function () {
  var sb = createSandbox();
  var s = setupDragScenario(sb);

  sb.fireDown(15, 15);
  sb.fireMove(500, 500); // 空白处，不在 basket 范围内
  sb.fireUp(500, 500);

  assert.equal(s.drops.length, 1);
  // 逐字段比较（vm 沙箱 realm 对象，理由同上）。
  assert.equal(s.drops[0].success, false);
  assert.equal(s.drops[0].type, 'dropCancel');
  assert.equal(s.drops[0].draggedId, 'apple');
  assert.equal(s.drops[0].targetId, null);
  assert.equal(s.drops[0].x, 500);
  assert.equal(s.drops[0].y, 500);
  assert.deepEqual(s.basketDropCalls, [], 'dropCancel 时不应调用任何 target 的 onDrop');

  var state = sb.POINTER.getPointerState();
  assert.equal(state.dragging, false);
  assert.equal(state.activeDragId, null);
});

test('拖拽：dropTargetIds 白名单——被拖 target 声明了白名单时，命中不在白名单内的 accepts-drag target 仍判定为 dropCancel', function () {
  var sb = createSandbox();
  var basketDrop = [];
  var decoyDrop = [];
  var drops = [];

  sb.POINTER.registerTarget('star', {
    getBounds: function () { return { x: 10, y: 10, w: 20, h: 20 }; },
    draggable: true,
    dropTargetIds: ['sky'] // 只有 id='sky' 算有效落点
  });
  sb.POINTER.registerTarget('basket', {
    getBounds: function () { return { x: 200, y: 200, w: 50, h: 50 }; },
    accepts: ['drag'],
    onDrop: function (p) { basketDrop.push(p); }
  });
  sb.POINTER.registerTarget('sky', {
    getBounds: function () { return { x: 300, y: 300, w: 50, h: 50 }; },
    accepts: ['drag'],
    onDrop: function (p) { decoyDrop.push(p); }
  });
  sb.POINTER.onDrop(function (p) { drops.push(p); });

  sb.fireDown(15, 15);
  sb.fireMove(220, 220);
  sb.fireUp(220, 220); // 落在 basket 上，但 basket 不在 star 的白名单里

  assert.deepEqual(basketDrop, [], 'basket 不在白名单内，不应收到 onDrop');
  assert.equal(drops[0].success, false, '未命中白名单内的落点应判定为 dropCancel');

  sb.fireDown(15, 15);
  sb.fireMove(320, 320);
  sb.fireUp(320, 320); // 落在白名单内的 sky 上

  assert.equal(decoyDrop.length, 1, 'sky 在白名单内，应收到 onDrop');
  assert.equal(drops[1].success, true);
  assert.equal(drops[1].targetId, 'sky');
});

test('拖拽后紧跟的原生 click 不会重复触发被命中 target 的 onClick（防双重触发工程决策）', function () {
  var sb = createSandbox();
  var basketClicked = [];
  sb.POINTER.registerTarget('apple', {
    getBounds: function () { return { x: 10, y: 10, w: 20, h: 20 }; },
    draggable: true
  });
  sb.POINTER.registerTarget('basket', {
    getBounds: function () { return { x: 200, y: 200, w: 50, h: 50 }; },
    accepts: ['drag', 'click'],
    onClick: function (id) { basketClicked.push(id); }
  });

  sb.fireDown(15, 15);
  sb.fireMove(220, 220);
  sb.fireUp(220, 220);   // 成功 drop 到 basket
  sb.fireClick(220, 220); // 浏览器紧随其后原生派发的 click

  assert.deepEqual(basketClicked, [], '紧跟在 drop 后的这一次 click 不应触发 basket 的 onClick');

  // 但下一次独立的点击（不是紧跟着一次拖拽）应恢复正常。
  sb.fireClick(220, 220);
  assert.deepEqual(basketClicked, ['basket']);
});

// =========================================================================================
// 7. 多订阅者隔离
// =========================================================================================

test('多订阅者隔离：onMove 的多个回调都会被调用，其中一个抛错不影响其余回调', function () {
  var sb = createSandbox();
  var calledA = false;
  var calledB = false;

  sb.POINTER.onMove(function () {
    calledA = true;
    throw new Error('订阅回调 A 故意抛错，验证 try/catch 隔离');
  });
  sb.POINTER.onMove(function () {
    calledB = true;
  });

  assert.doesNotThrow(function () {
    sb.fireMove(1, 1);
  });
  assert.equal(calledA, true);
  assert.equal(calledB, true);
});

test('target 回调抛错不冒泡：onClick 抛错不会打断 pointer.js 自身逻辑', function () {
  var sb = createSandbox();
  sb.POINTER.registerTarget('lamp', {
    getBounds: function () { return { x: 0, y: 0, w: 10, h: 10 }; },
    accepts: ['click'],
    onClick: function () { throw new Error('故意抛错'); }
  });

  assert.doesNotThrow(function () {
    sb.fireClick(5, 5);
  });
});

// =========================================================================================
// 8. getPointerState 快照
// =========================================================================================

test('getPointerState()：字段齐全，初始默认值合理', function () {
  var sb = createSandbox();
  var state = sb.POINTER.getPointerState();
  assert.equal(state.x, 0);
  assert.equal(state.y, 0);
  assert.equal(state.dragging, false);
  assert.equal(state.activeDragId, null);
  assert.equal(typeof state.trailIntensity, 'number');
});

// =========================================================================================
// 9. Fable 对抗评审修复回归（P1-1 + P2-1/2/3/4/5/6），适配幼儿多指乱按场景
// =========================================================================================

test('P1-1：拖拽中非主键 mouseup（button:2，幼儿右键/双指点按）被忽略、拖拽继续；随后主键 mouseup 才正常 drop', function () {
  var sb = createSandbox();
  var s = setupDragScenario(sb);

  sb.fireDown(15, 15); // 抓起 apple（主键，onMouseDown 的 button 守卫放行）
  assert.equal(sb.POINTER.getPointerState().dragging, true);

  sb.fireMove(220, 220);              // 拖到 basket 上方
  sb.fireUp(220, 220, { button: 2 }); // 非主键 mouseup（右键/双指点按）：必须被忽略
  assert.equal(s.drops.length, 0, '非主键 mouseup 不应终结拖拽或产生 drop 事件');
  assert.equal(sb.POINTER.getPointerState().dragging, true, '非主键 mouseup 后仍应处于 dragging（物体不脱手）');
  assert.deepEqual(s.basketDropCalls, [], '非主键 mouseup 不应触发落点 onDrop');

  sb.fireUp(220, 220, { button: 0 }); // 主键 mouseup：正常 drop
  assert.equal(s.drops.length, 1);
  assert.equal(s.drops[0].success, true);
  assert.equal(s.drops[0].targetId, 'basket');
  assert.equal(s.basketDropCalls.length, 1);
  assert.equal(sb.POINTER.getPointerState().dragging, false);
});

test('P2-5②：非主键 mousedown（button:2）被忽略，不进入 dragging（onMouseDown 的 button 守卫）', function () {
  var sb = createSandbox();
  var s = setupDragScenario(sb);

  sb.fireDown(15, 15, { button: 2 }); // 命中 apple 但是非主键
  assert.deepEqual(s.dragStarts, [], '非主键 mousedown 不应触发 dragStart');
  assert.equal(sb.POINTER.getPointerState().dragging, false, '非主键 mousedown 不应进入 dragging');
});

test('P2-1：上一次 mouseup 丢失（dragging 残留）时，新 mousedown 先补发 dropCancel 收尾旧拖拽再换绑，不静默换绑', function () {
  var sb = createSandbox();
  var drops = [];
  var starts = [];
  sb.POINTER.registerTarget('apple', {
    getBounds: function () { return { x: 10, y: 10, w: 20, h: 20 }; },
    draggable: true
  });
  sb.POINTER.registerTarget('star', {
    getBounds: function () { return { x: 100, y: 100, w: 20, h: 20 }; },
    draggable: true
  });
  sb.POINTER.onDrop(function (p) { drops.push(p); });
  sb.POINTER.onDragStart(function (p) { starts.push(p); });

  sb.fireDown(15, 15); // 抓起 apple
  assert.equal(sb.POINTER.getPointerState().activeDragId, 'apple');

  // 模拟 mouseup 丢失（窗口外释放/手势打断）：不 fireUp，直接又一次 mousedown 命中 star。
  sb.fireDown(110, 110);

  assert.equal(drops.length, 1, '换绑前应补发恰一次 dropCancel 收尾旧拖拽');
  assert.equal(drops[0].success, false);
  assert.equal(drops[0].type, 'dropCancel');
  assert.equal(drops[0].draggedId, 'apple', 'dropCancel 的 draggedId 应是旧拖拽 apple，避免 014 的旧拖拽视觉悬空');
  assert.equal(starts.length, 2, 'apple、star 各一次 dragStart');
  assert.equal(starts[1].id, 'star');
  assert.equal(sb.POINTER.getPointerState().activeDragId, 'star', '收尾旧拖拽后正常换绑到 star');

  // 补充：残留拖拽时新 mousedown 落在空白处也要收尾旧拖拽（虽不产生新 grab）。
  sb.fireDown(500, 500);
  assert.equal(drops.length, 2, '空白处 mousedown 也应先补发 dropCancel 收尾 star');
  assert.equal(drops[1].draggedId, 'star');
  assert.equal(sb.POINTER.getPointerState().dragging, false, '空白处 mousedown 收尾后不进入新拖拽');
});

test('P2-2：动态 getBounds 目标在指针静止期间"自己移走"，悬停定时器到期复测 bounds → 不误触发 onHover', function () {
  var sb = createSandbox();
  var hovered = [];
  var boundsX = 0; // 可变——模拟目标漂移
  sb.POINTER.registerTarget('dog', {
    getBounds: function () { return { x: boundsX, y: 0, w: 20, h: 20 }; },
    accepts: ['hover'],
    onHover: function (id) { hovered.push(id); }
  });

  sb.fireMove(10, 10); // 指针 (10,10)，此刻 bounds=(0,0,20,20) 内 → 起计时
  sb.clock.advance(500);
  boundsX = 100;       // 目标漂移走：bounds→(100,0,20,20)；指针仍静止在 (10,10)，无新 mousemove
  sb.clock.advance(600); // 定时器到期（累计 1100ms > 1000ms）
  assert.deepEqual(hovered, [], '目标已漂移出指针位置，到期复测 bounds 不在内 → 不应触发 onHover');

  // 反证：目标不漂走（仍在指针下），同样时序应正常触发（证明复测不是一刀切全吞）。
  sb.POINTER.unregisterTarget('dog'); // 先卸载 dog，避免它干扰下面 fireMove 的读数
  var hovered2 = [];
  sb.POINTER.registerTarget('dog2', {
    getBounds: function () { return { x: 0, y: 0, w: 20, h: 20 }; },
    accepts: ['hover'],
    onHover: function (id) { hovered2.push(id); }
  });
  sb.fireMove(10, 10);
  sb.clock.advance(1000);
  assert.deepEqual(hovered2, ['dog2'], '目标未漂移时同样时序应正常触发');
});

test('P2-3：拖拽期间路过 hover 目标停满 1s 仍触发 onHover（引擎"只播事实"不屏蔽）；此刻 getPointerState().dragging=true 供 014 自行判别', function () {
  var sb = createSandbox();
  var hovered = [];
  var draggingAtHover = null;
  sb.POINTER.registerTarget('apple', {
    getBounds: function () { return { x: 10, y: 10, w: 20, h: 20 }; },
    draggable: true
  });
  sb.POINTER.registerTarget('dog', {
    getBounds: function () { return { x: 100, y: 100, w: 20, h: 20 }; },
    accepts: ['hover'],
    onHover: function (id) {
      hovered.push(id);
      draggingAtHover = sb.POINTER.getPointerState().dragging;
    }
  });

  sb.fireDown(15, 15);    // 抓起 apple
  sb.fireMove(110, 110);  // 拖着 apple 路过 dog
  sb.clock.advance(1000); // 停满 1 秒
  assert.deepEqual(hovered, ['dog'], '拖拽期间悬停满 1 秒仍触发 onHover（引擎不屏蔽，行为文档化于 POINTER-API §5）');
  assert.equal(draggingAtHover, true, 'onHover 触发时 getPointerState().dragging=true，014 可据此判"拖拽路过不算寻找完成"');
});

test('P2-4：drop 后 onClick 抑制带时效——窗内（≤100ms）的 click 被吞，超时（>100ms）的真实 click 恢复正常 onClick', function () {
  function makeDragClickEnv() {
    var sb = createSandbox();
    var basketClicked = [];
    sb.POINTER.registerTarget('apple', {
      getBounds: function () { return { x: 10, y: 10, w: 20, h: 20 }; },
      draggable: true
    });
    sb.POINTER.registerTarget('basket', {
      getBounds: function () { return { x: 200, y: 200, w: 50, h: 50 }; },
      accepts: ['drag', 'click'],
      onClick: function (id) { basketClicked.push(id); }
    });
    return { sb: sb, basketClicked: basketClicked };
  }

  // 场景一：窗内（advance 50ms < 100ms）的紧随 click 仍被抑制。
  var e1 = makeDragClickEnv();
  e1.sb.fireDown(15, 15);
  e1.sb.fireMove(220, 220);
  e1.sb.fireUp(220, 220);      // suppressClickSetAt = now
  e1.sb.clock.advance(50);     // < 100ms 窗口
  e1.sb.fireClick(220, 220);
  assert.deepEqual(e1.basketClicked, [], '窗内紧随 drop 的 click 应被抑制，不触发 basket.onClick');

  // 场景二：drop 后浏览器没派 click，很久之后（500ms > 100ms）来一次真实独立 click → 恢复正常。
  var e2 = makeDragClickEnv();
  e2.sb.fireDown(15, 15);
  e2.sb.fireMove(220, 220);
  e2.sb.fireUp(220, 220);      // suppressClickSetAt = now
  e2.sb.clock.advance(500);    // 超过 100ms 窗口，标志视为残留应被清除
  e2.sb.fireClick(220, 220);
  assert.deepEqual(e2.basketClicked, ['basket'], '超过抑制窗口的真实 click 应恢复正常触发 onClick（标志不残留吞掉）');
});

test('P2-5①：持续晃动到 ~2.5s（< 3s 阈值）时强度仍≈基础强度、未开始衰减（钉住衰减起点=3s，防回归到更早）', function () {
  var sb = createSandbox();
  assert.equal(sb.manifest.pointer.move.idleDecayApproxSec, 3);

  sb.fireMove(0, 0); // 预热基线（第一步速度恒为 0，不作数）
  var x = 0;
  // 稳定速度 2px/ms（每 25ms 移动 50px），先读一步"刚起步的基础强度"。
  sb.clock.advance(25); x += 50; sb.fireMove(x, 0);
  var baseIntensity = sb.POINTER.getTrailIntensity();

  // 推进到累计约 2500ms（仍 < 3000ms 阈值）。
  var steps = 99; // 25 + 99*25 = 2500ms
  for (var i = 0; i < steps; i++) { sb.clock.advance(25); x += 50; sb.fireMove(x, 0); }
  var midIntensity = sb.POINTER.getTrailIntensity();

  assert.ok(baseIntensity > 0, '基础强度应为正值');
  assert.ok(Math.abs(midIntensity - baseIntensity) < 1e-9,
    '3 秒阈值前强度应恒等于基础强度（未衰减）；若衰减起点被误改到更早，这里会明显偏低：mid=' + midIntensity + ' base=' + baseIntensity);
});

test('P2-5③：拖拽中途 unregisterTarget(被拖 target) → 静默复位拖拽状态，后续 mousemove 不再 emit dragMove、mouseup 不 emit drop', function () {
  var sb = createSandbox();
  var s = setupDragScenario(sb);

  sb.fireDown(15, 15); // 抓起 apple
  assert.equal(sb.POINTER.getPointerState().dragging, true);

  sb.POINTER.unregisterTarget('apple'); // 拖拽中途卸载被拖 target
  assert.equal(sb.POINTER.getPointerState().dragging, false, '卸载被拖 target 应静默复位 dragging');
  assert.equal(sb.POINTER.getPointerState().activeDragId, null);

  var movesBefore = s.dragMoves.length;
  sb.fireMove(220, 220);
  assert.equal(s.dragMoves.length, movesBefore, '复位后 mousemove 不应再 emit dragMove');

  sb.fireUp(220, 220);
  assert.deepEqual(s.drops, [], '复位后 mouseup 不应 emit drop（已无进行中的拖拽）');
});

test('P2-5④：soundless 阈值边界——间隔恰 180ms 不判 soundless（gap < 180 严格小于），179ms 才判', function () {
  // 恰 180ms：gap===180，180<180 为 false → 不 soundless。
  var sb = createSandbox();
  var fb = [];
  sb.POINTER.onClickFeedback(function (x, y, f) { fb.push(f); });
  sb.fireClick(0, 0);
  sb.clock.advance(180);
  sb.fireClick(0, 0);
  assert.equal(fb[1].soundless, false, '间隔恰 180ms 不应判 soundless（严格小于阈值的正确侧）');

  // 179ms（< 180）→ soundless。
  var sb2 = createSandbox();
  var fb2 = [];
  sb2.POINTER.onClickFeedback(function (x, y, f) { fb2.push(f); });
  sb2.fireClick(0, 0);
  sb2.clock.advance(179);
  sb2.fireClick(0, 0);
  assert.equal(fb2[1].soundless, true, '间隔 179ms（< 180）应判 soundless');
});

test('P2-6：app.js 侧 spawnRing 前的 intensity 下限跳过属 app.js 覆盖范围——此处校验引擎在狂点到底时确实产出 intensity≈0 供其判定', function () {
  // pointer.js 只负责"算出 intensity"，"intensity≈0 不 spawnRing"是 app.js 的渲染策略；此用例
  // 锁定引擎侧的前提事实：连续狂点足够多次后 onClickFeedback 的 intensity 会到 0（app.js 的
  // `if (intensity <= 0.02) return;` 才有意义）。app.js 渲染跳过本身由浏览器冒烟另行确认。
  var sb = createSandbox();
  var feedbacks = [];
  sb.POINTER.onClickFeedback(function (x, y, fb) { feedbacks.push(fb); });
  sb.fireClick(0, 0);
  for (var i = 0; i < 8; i++) { sb.clock.advance(50); sb.fireClick(0, 0); }
  assert.equal(feedbacks[feedbacks.length - 1].intensity, 0, '狂点到底时引擎应产出 intensity=0（app.js 据此跳过 spawnRing）');
});
