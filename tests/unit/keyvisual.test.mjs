// WTJ-20260704-086 — keyvisual.js 单元测试（durable QA asset）
//
// 用 Node 内置 vm 模块搭一个沙箱：提供一个 stub 的 window.WTJ_KEYBOARD.onFunctionKey（捕获
// keyvisual.js 在加载时注册的订阅回调，模拟 keyboard.js 后续真实 emit 的 payload），再加载
// 真实的 app/web/keyvisual.js（其 IIFE 会挂 window.WTJ_KEYVISUAL）。用 _setClock 注入假时钟，
// 像 reward-chest.js/pointer.js 现有测试一样确定性地推进时间，断言：
//   1. category=light/weak/other 分别映射到 ring/glint/ripple，token 数值取自 081 规范。
//   2. intensity 低于阈值（0.02）时不产生反馈（081"decay to near-zero"）。
//   3. draw() 按时间推进让反馈项透明度衰减、过期后自动从内部列表移除。
//   4. getStageLightBoost() 只由 light 类（ring）贡献，140ms 窗口内线性衰减，过窗口后为 0。
//
// Run:  node --test tests/unit/keyvisual.test.mjs
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
var KEYVISUAL_JS_PATH = path.resolve(__dirname, '../../app/web/keyvisual.js');
var KEYVISUAL_SRC = readFileSync(KEYVISUAL_JS_PATH, 'utf8');

function createSandbox(opts) {
  var options = opts || {};
  var functionKeySubscribers = [];

  var fakeWindow = {
    matchMedia: options.matchMedia, // 缺省 undefined -> prefersReducedMotion() 走 false 分支
    WTJ_KEYBOARD: {
      onFunctionKey: function (fn) {
        functionKeySubscribers.push(fn);
      }
    }
  };
  if (options.omitPointer !== true) {
    fakeWindow.WTJ_POINTER = options.pointerStub || {
      getPointerState: function () { return { x: 0, y: 0 }; } // 默认"从未移动过"，触发中心底部回退
    };
  }
  fakeWindow.innerWidth = options.innerWidth || 1440;
  fakeWindow.innerHeight = options.innerHeight || 900;

  var sandbox = { window: fakeWindow, console: console, performance: { now: function () { return 0; } } };
  vm.createContext(sandbox);
  vm.runInContext(KEYVISUAL_SRC, sandbox, { filename: 'keyvisual.js' });

  assert.ok(fakeWindow.WTJ_KEYVISUAL, 'keyvisual.js 必须挂载 window.WTJ_KEYVISUAL');
  assert.equal(functionKeySubscribers.length, 1, 'keyvisual.js 加载时应恰好订阅一次 WTJ_KEYBOARD.onFunctionKey');

  function emit(payload) {
    functionKeySubscribers[0](payload);
  }

  return {
    KEYVISUAL: fakeWindow.WTJ_KEYVISUAL,
    emit: emit
  };
}

function makeRecordingCtx() {
  var strokeStyles = [];
  var fillStyles = [];
  return {
    save: function () {},
    restore: function () {},
    beginPath: function () {},
    arc: function () {},
    stroke: function () { strokeStyles.push(this.strokeStyle); },
    fill: function () { fillStyles.push(this.fillStyle); },
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    _strokeStyles: strokeStyles,
    _fillStyles: fillStyles
  };
}

// --- 1. API 冻结 -------------------------------------------------------------------------------

test('API 冻结：window.WTJ_KEYVISUAL 是 frozen 对象且方法齐全', function () {
  var sb = createSandbox();
  assert.equal(Object.isFrozen(sb.KEYVISUAL), true);
  ['computeFeedbackSpec', 'draw', 'getStageLightBoost', 'getActiveCount', '_setClock', 'TOKENS'].forEach(function (key) {
    assert.equal(typeof sb.KEYVISUAL[key] !== 'undefined', true, 'API 应包含 ' + key);
  });
});

// --- 2. computeFeedbackSpec：纯函数分类 + token 数值 -------------------------------------------

test('computeFeedbackSpec：category=light（Space/Enter）-> ring，081 token 数值', function () {
  var sb = createSandbox();
  var spec = sb.KEYVISUAL.computeFeedbackSpec({ key: 'Space', category: 'light', intensity: 1 });
  assert.equal(spec.kind, 'ring');
  assert.equal(spec.durationMs, 360);
  assert.equal(spec.startRadius, 18);
  assert.equal(spec.endRadius, 96);
  assert.equal(spec.stroke, 'rgba(94,231,255,0.42)');
  assert.equal(spec.stageLightBoost, 0.04);
  assert.equal(spec.intensity, 1);
});

test('computeFeedbackSpec：category=weak（修饰键）-> glint，081 token 数值', function () {
  var sb = createSandbox();
  var spec = sb.KEYVISUAL.computeFeedbackSpec({ key: 'Shift', category: 'weak', intensity: 0.3 });
  assert.equal(spec.kind, 'glint');
  assert.equal(spec.durationMs, 220);
  assert.equal(spec.maxOpacity, 0.22);
  assert.equal(spec.intensity, 0.3);
});

test('computeFeedbackSpec：category=other（标点等）-> ripple，081 token 数值', function () {
  var sb = createSandbox();
  var spec = sb.KEYVISUAL.computeFeedbackSpec({ key: ',', category: 'other', intensity: 0.5 });
  assert.equal(spec.kind, 'ripple');
  assert.equal(spec.durationMs, 260);
  assert.equal(spec.maxOpacity, 0.25);
  assert.equal(spec.maxGlowPx, 40);
});

test('computeFeedbackSpec：未知分类防御式兜底为 ripple（与 keysound.js 兜底哲学一致）', function () {
  var sb = createSandbox();
  var spec = sb.KEYVISUAL.computeFeedbackSpec({ key: 'F1', category: 'weird-future-category', intensity: 0.5 });
  assert.equal(spec.kind, 'ripple');
});

test('computeFeedbackSpec：intensity <= 0.02（081 衰减到接近于零）时返回 null，不产生反馈', function () {
  var sb = createSandbox();
  assert.equal(sb.KEYVISUAL.computeFeedbackSpec({ category: 'light', intensity: 0.02 }), null);
  assert.equal(sb.KEYVISUAL.computeFeedbackSpec({ category: 'weak', intensity: 0.01 }), null);
  assert.equal(sb.KEYVISUAL.computeFeedbackSpec({ category: 'other', intensity: 0 }), null);
  assert.equal(sb.KEYVISUAL.computeFeedbackSpec(null), null);
});

test('computeFeedbackSpec：intensity 略高于阈值时仍产生反馈（强度越低反馈越弱，而不是一刀切）', function () {
  var sb = createSandbox();
  var weak = sb.KEYVISUAL.computeFeedbackSpec({ category: 'light', intensity: 0.05 });
  assert.notEqual(weak, null);
  assert.equal(weak.intensity, 0.05);
});

// --- 3. onFunctionKey 订阅 -> 实际生成反馈项（getActiveCount 内省） --------------------------

test('onFunctionKey 触发：category=light 且 intensity 充足 -> 产生 1 个反馈项', function () {
  var sb = createSandbox();
  assert.equal(sb.KEYVISUAL.getActiveCount(), 0);
  sb.emit({ key: 'Space', category: 'light', intensity: 1 });
  assert.equal(sb.KEYVISUAL.getActiveCount(), 1);
});

test('onFunctionKey 触发：intensity 衰减到阈值以下 -> 不产生反馈（081"连续同键衰减到几乎没有"）', function () {
  var sb = createSandbox();
  sb.emit({ key: 'Shift', category: 'weak', intensity: 0.01 });
  assert.equal(sb.KEYVISUAL.getActiveCount(), 0, 'intensity 极低时不应产生反馈项');
});

test('onFunctionKey 触发：payload 缺失/异常不应抛错（防御式）', function () {
  var sb = createSandbox();
  assert.doesNotThrow(function () {
    sb.emit(null);
    sb.emit(undefined);
    sb.emit({});
  });
  assert.equal(sb.KEYVISUAL.getActiveCount(), 0);
});

// --- 4. draw()：随时间衰减、过期清除（clockRef 可测性） ---------------------------------------

test('draw()：ring 的描边透明度随时间推进而衰减，过期后从内部列表自动移除', function () {
  var sb = createSandbox();
  var now = 0;
  sb.KEYVISUAL._setClock(function () { return now; });

  now = 0;
  sb.emit({ key: 'Enter', category: 'light', intensity: 1 }); // born=0, life=360ms
  assert.equal(sb.KEYVISUAL.getActiveCount(), 1);

  var ctx1 = makeRecordingCtx();
  sb.KEYVISUAL.draw(ctx1, 50); // age=50, t=50/360，早期，alpha 较高
  assert.equal(ctx1._strokeStyles.length, 1, '存活期内 draw() 应画一次描边');
  var alpha1 = parseFloat(ctx1._strokeStyles[0].split(',')[3]);

  var ctx2 = makeRecordingCtx();
  sb.KEYVISUAL.draw(ctx2, 300); // age=300，接近生命尽头，alpha 应明显更低
  assert.equal(ctx2._strokeStyles.length, 1);
  var alpha2 = parseFloat(ctx2._strokeStyles[0].split(',')[3]);

  assert.ok(alpha2 < alpha1, '越接近反馈项生命尽头，描边透明度应越低（alpha1=' + alpha1 + ' alpha2=' + alpha2 + '）');
  assert.equal(sb.KEYVISUAL.getActiveCount(), 1, '尚未超过 360ms 生命周期，反馈项应仍存活');

  var ctx3 = makeRecordingCtx();
  sb.KEYVISUAL.draw(ctx3, 400); // age=400 > life=360 -> 过期
  assert.equal(sb.KEYVISUAL.getActiveCount(), 0, '超过生命周期后反馈项应被清除');
  assert.equal(ctx3._strokeStyles.length, 0, '过期反馈项不应再被画出');
});

test('draw()：weak（glint）与 other（ripple）也各自随时间衰减且不抛错', function () {
  var sb = createSandbox();
  var now = 0;
  sb.KEYVISUAL._setClock(function () { return now; });

  sb.emit({ key: 'Shift', category: 'weak', intensity: 0.3 });
  sb.emit({ key: ',', category: 'other', intensity: 0.5 });
  assert.equal(sb.KEYVISUAL.getActiveCount(), 2);

  var ctx = makeRecordingCtx();
  assert.doesNotThrow(function () {
    sb.KEYVISUAL.draw(ctx, 100);
  });
  // glint 用 ctx.fill()（fillStyle），ripple 用 ctx.stroke()（strokeStyle）：各画一次。
  assert.equal(ctx._fillStyles.length, 1, 'glint 应画一次（ctx.fill）');
  assert.equal(ctx._strokeStyles.length, 1, 'ripple 应画一次（ctx.stroke）');
});

// --- 5. getStageLightBoost：仅 light（ring）贡献，140ms 窗口线性衰减 --------------------------

test('getStageLightBoost：light 反馈在 140ms 窗口内产生衰减中的正向提亮量，窗口外为 0', function () {
  var sb = createSandbox();
  var now = 0;
  sb.KEYVISUAL._setClock(function () { return now; });
  sb.emit({ key: 'Space', category: 'light', intensity: 1 });

  var boostEarly = sb.KEYVISUAL.getStageLightBoost(10);
  var boostLater = sb.KEYVISUAL.getStageLightBoost(100);
  var boostAfterWindow = sb.KEYVISUAL.getStageLightBoost(200);

  assert.ok(boostEarly > 0 && boostEarly <= 0.04 + 1e-9, 'boostEarly=' + boostEarly + ' 应在 0~0.04 之间');
  assert.ok(boostLater < boostEarly, '140ms 窗口内应随时间递减');
  assert.equal(boostAfterWindow, 0, '超过 140ms 窗口后不应再提亮背景');
});

test('getStageLightBoost：weak/other 类反馈不贡献背景提亮（只有 Space/Enter 的 light 类别）', function () {
  var sb = createSandbox();
  var now = 0;
  sb.KEYVISUAL._setClock(function () { return now; });
  sb.emit({ key: 'Shift', category: 'weak', intensity: 1 });
  sb.emit({ key: ',', category: 'other', intensity: 1 });
  assert.equal(sb.KEYVISUAL.getStageLightBoost(10), 0);
});

// --- 6. 锚点：ring 优先用 WTJ_POINTER 位置，weak 固定左下角 -----------------------------------

test('draw() 不因 WTJ_POINTER 缺失而抛错（防御式回退到舞台默认位置）', function () {
  var sb = createSandbox({ omitPointer: true });
  sb.emit({ key: 'Enter', category: 'light', intensity: 1 });
  var ctx = makeRecordingCtx();
  assert.doesNotThrow(function () {
    sb.KEYVISUAL.draw(ctx, 10);
  });
});

test('draw() 在 WTJ_POINTER 提供真实坐标时使用该坐标作为 ring 锚点', function () {
  var sb = createSandbox({
    pointerStub: { getPointerState: function () { return { x: 321, y: 654 }; } }
  });
  var capturedArcArgs = null;
  sb.emit({ key: 'Enter', category: 'light', intensity: 1 });
  var ctx = makeRecordingCtx();
  ctx.arc = function (x, y) { capturedArcArgs = { x: x, y: y }; };
  sb.KEYVISUAL.draw(ctx, 10);
  assert.ok(capturedArcArgs, 'draw() 应调用 ctx.arc()');
  assert.equal(capturedArcArgs.x, 321);
  assert.equal(capturedArcArgs.y, 654);
});
