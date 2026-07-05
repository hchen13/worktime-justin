// WTJ-20260705-003 — pointer-trail.js 纯逻辑单元测试（durable QA asset）
//
// 用 Node 内置 vm 模块搭一个最小沙箱（只需要 window + console，pointer-trail.js 不依赖
// document/canvas/window.WTJ_POINTER——这是本卡刻意的分层设计，见 app/web/pointer-trail.js
// 顶部注释：星点/爆发参数生成的纯函数放在这个独立文件里，方便不搭 Canvas2D stub、不搭真实
// pointer.js 指针状态机就能直接单测断言强度分级/星点参数区间/drop-target 避让几何。真正把这些
// 参数渲染成像素、真正驱动 mousemove/click/drag 事件的集成断言见
// tests/unit/pointer-visual-003.test.mjs。
//
// 确定性手法与 tests/unit/letter-motion.test.mjs 完全同款：用 vm.runInContext 在沙箱内覆盖
// Math.random() 为一个固定序列/固定值的函数（每个 vm context 有独立的 Math 对象，覆盖不污染
// 本文件其余用例或其它测试文件的真实随机性），精确断言 buildTrailSparkles() 的具体分支/公式，
// 而不仅仅是统计意义上的"大体符合"——不使用真实 Math.random()。
//
// Run:  node --test tests/unit/pointer-trail.test.mjs
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
var PT_JS_PATH = path.resolve(__dirname, '../../app/web/pointer-trail.js');
var PT_SRC = readFileSync(PT_JS_PATH, 'utf8');

function createSandboxRaw() {
  var fakeWindow = {};
  var sandbox = { window: fakeWindow, console: console };
  vm.createContext(sandbox);
  vm.runInContext(PT_SRC, sandbox, { filename: 'pointer-trail.js' });
  assert.ok(fakeWindow.WTJ_POINTER_TRAIL, 'pointer-trail.js 必须挂载 window.WTJ_POINTER_TRAIL');
  return sandbox;
}

function createSandbox() {
  return createSandboxRaw().window.WTJ_POINTER_TRAIL;
}

// 同 letter-motion.test.mjs 的 setMathRandomSequence()：序列耗尽后重复最后一个值。
function setMathRandomSequence(sandbox, sequence) {
  vm.runInContext(
    '(function () { var __seq = ' + JSON.stringify(sequence) + '; var __i = 0; ' +
    'Math.random = function () { var v = __seq[Math.min(__i, __seq.length - 1)]; __i += 1; return v; }; })();',
    sandbox
  );
}

// --- 1. API 冻结 + 结构 -------------------------------------------------------------------

test('API 冻结：window.WTJ_POINTER_TRAIL 是 frozen 对象，方法/常量齐全', function () {
  var PT = createSandbox();
  assert.equal(Object.isFrozen(PT), true);
  ['TIERS', 'BURST_PARAMS', 'classifyClickTier', 'classifyDropTier', 'buildTrailSparkles',
    'computeTierAlphaCap', 'computeDropAvoidanceFactor', 'DROP_AVOID_MARGIN_PX_DEFAULT'
  ].forEach(function (key) {
    assert.equal(typeof PT[key] !== 'undefined', true, 'API 应包含 ' + key);
  });
  assert.equal(Object.isFrozen(PT.TIERS), true, 'TIERS 应冻结');
  assert.equal(Object.isFrozen(PT.BURST_PARAMS), true, 'BURST_PARAMS 应深冻结');
  assert.equal(Object.isFrozen(PT.BURST_PARAMS.move), true, 'BURST_PARAMS.move 应深冻结');
});

test('重复引入守卫：再次执行源码是安全 no-op，window.WTJ_POINTER_TRAIL 仍是同一个实例', function () {
  var sandbox = createSandboxRaw();
  var first = sandbox.window.WTJ_POINTER_TRAIL;
  assert.doesNotThrow(function () {
    vm.runInContext(PT_SRC, sandbox, { filename: 'pointer-trail.js' });
  });
  assert.equal(sandbox.window.WTJ_POINTER_TRAIL, first, '重复引入不应替换掉已存在的实例');
});

// --- 2. 强度分级参数：move < clickHit < dragSuccess（需求2"移动轻、命中/成功更明显"） ---------

test('BURST_PARAMS：三档 alphaCap/countRange/spreadPxRange 严格递增（move 最低调，dragSuccess 最明显）', function () {
  var PT = createSandbox();
  var move = PT.BURST_PARAMS.move;
  var hit = PT.BURST_PARAMS.clickHit;
  var success = PT.BURST_PARAMS.dragSuccess;

  assert.ok(move.alphaCap < hit.alphaCap, 'move.alphaCap 应小于 clickHit.alphaCap');
  assert.ok(hit.alphaCap < success.alphaCap, 'clickHit.alphaCap 应小于 dragSuccess.alphaCap');

  assert.ok(move.countRange[1] < hit.countRange[0], 'move 星点数量区间应完全低于 clickHit（"更明显"是数量上的质变，不是区间轻微重叠）');
  assert.ok(hit.countRange[1] <= success.countRange[0] + 3, 'dragSuccess 星点数量应不低于 clickHit（拖拽成功是三档中最突出的反馈）');
  assert.ok(hit.countRange[0] <= success.countRange[0], 'dragSuccess 下限应不小于 clickHit 下限');

  // 需求3"不能抢中心奖励或任务目标视觉焦点"：三档 alphaCap 均需明显低于满不透明度。
  [move, hit, success].forEach(function (p) {
    assert.ok(p.alphaCap <= 0.65, 'alphaCap=' + p.alphaCap + ' 应保持低调（<=0.65），不与字母/奖励视觉抢焦点');
  });
});

test('computeTierAlphaCap：三档分别精确等于 BURST_PARAMS 对应的 alphaCap；未知 tier 回退到 move', function () {
  var PT = createSandbox();
  assert.equal(PT.computeTierAlphaCap(PT.TIERS.MOVE), PT.BURST_PARAMS.move.alphaCap);
  assert.equal(PT.computeTierAlphaCap(PT.TIERS.CLICK_HIT), PT.BURST_PARAMS.clickHit.alphaCap);
  assert.equal(PT.computeTierAlphaCap(PT.TIERS.DRAG_SUCCESS), PT.BURST_PARAMS.dragSuccess.alphaCap);
  assert.equal(PT.computeTierAlphaCap('clickMiss'), PT.BURST_PARAMS.move.alphaCap, 'clickMiss 现状不叠加爆发，参数回退到 move（最低调）');
  assert.equal(PT.computeTierAlphaCap('totally-unknown-tier'), PT.BURST_PARAMS.move.alphaCap, '未知 tier 防御式回退到 move，不抛错');
  assert.equal(PT.computeTierAlphaCap(undefined), PT.BURST_PARAMS.move.alphaCap);
});

// --- 3. classifyClickTier / classifyDropTier --------------------------------------------

test('classifyClickTier：targetId 非空 -> CLICK_HIT；targetId 为 null/undefined/空串 -> CLICK_MISS', function () {
  var PT = createSandbox();
  assert.equal(PT.classifyClickTier({ intensity: 1, soundless: false, targetId: 'basket' }), PT.TIERS.CLICK_HIT);
  assert.equal(PT.classifyClickTier({ intensity: 1, soundless: false, targetId: null }), PT.TIERS.CLICK_MISS);
  assert.equal(PT.classifyClickTier({ intensity: 1, soundless: false, targetId: undefined }), PT.TIERS.CLICK_MISS);
  assert.equal(PT.classifyClickTier({ intensity: 1, soundless: false, targetId: '' }), PT.TIERS.CLICK_MISS, '空字符串 targetId 视为未命中（falsy）');
});

test('classifyClickTier：防御式——feedback 缺失/非对象时不抛错，回退 CLICK_MISS', function () {
  var PT = createSandbox();
  assert.equal(PT.classifyClickTier(null), PT.TIERS.CLICK_MISS);
  assert.equal(PT.classifyClickTier(undefined), PT.TIERS.CLICK_MISS);
  assert.equal(PT.classifyClickTier('not-an-object'), PT.TIERS.CLICK_MISS);
});

test('classifyDropTier：success===true -> DRAG_SUCCESS；success===false（dropCancel）或缺失 -> null（"拖错不惩罚"，不叠加爆发）', function () {
  var PT = createSandbox();
  assert.equal(PT.classifyDropTier({ success: true, type: 'drop', draggedId: 'apple', targetId: 'basket', x: 1, y: 2 }), PT.TIERS.DRAG_SUCCESS);
  assert.equal(PT.classifyDropTier({ success: false, type: 'dropCancel', draggedId: 'apple', targetId: null, x: 1, y: 2 }), null);
  assert.equal(PT.classifyDropTier(null), null);
  assert.equal(PT.classifyDropTier(undefined), null);
  assert.equal(PT.classifyDropTier({ success: 'true' }), null, 'success 必须严格 === true（字符串"true"不算）');
});

// --- 4. buildTrailSparkles：确定性（vm 覆盖 Math.random） -------------------------------------

['move', 'clickHit', 'dragSuccess'].forEach(function (tier) {
  test('buildTrailSparkles(' + tier + ')：Math.random 恒为 0 时 count 取区间下限，字段精确落在区间下限', function () {
    var sandbox = createSandboxRaw();
    var PT = sandbox.window.WTJ_POINTER_TRAIL;
    var params = PT.BURST_PARAMS[tier];
    setMathRandomSequence(sandbox, [0]);

    var list = PT.buildTrailSparkles(tier);
    assert.equal(list.length, params.countRange[0], 'random 恒为 0 时 count 应取区间下限');
    list.forEach(function (sp) {
      assert.equal(sp.angleRad, 0, 'random=0 时 angleRad 应为 0');
      assert.equal(sp.t, 0);
      assert.ok(Math.abs(sp.sizeFrac - params.sizeFracRange[0]) < 1e-9);
      assert.equal(sp.phaseRad, 0);
      assert.ok(Math.abs(sp.twinkleHz - params.twinkleHzRange[0]) < 1e-9);
      assert.ok(Math.abs(sp.spreadPx - params.spreadPxRange[0]) < 1e-9);
    });
  });

  test('buildTrailSparkles(' + tier + ')：Math.random 趋近 1 时 count 取区间上限，字段趋近区间上限', function () {
    var sandbox = createSandboxRaw();
    var PT = sandbox.window.WTJ_POINTER_TRAIL;
    var params = PT.BURST_PARAMS[tier];
    var nearOne = 0.999999999;
    setMathRandomSequence(sandbox, [nearOne]);

    var list = PT.buildTrailSparkles(tier);
    assert.equal(list.length, params.countRange[1], 'random 趋近 1 时 count 应取区间上限');
    list.forEach(function (sp) {
      assert.ok(sp.angleRad > Math.PI * 2 - 1e-4);
      assert.ok(sp.t > 0.999);
      assert.ok(Math.abs(sp.sizeFrac - params.sizeFracRange[1]) < 1e-6);
      assert.ok(sp.phaseRad > Math.PI * 2 - 1e-4);
      assert.ok(Math.abs(sp.twinkleHz - params.twinkleHzRange[1]) < 1e-6);
      assert.ok(Math.abs(sp.spreadPx - params.spreadPxRange[1]) < 1e-6);
    });
  });
});

test('buildTrailSparkles：未知 tier 防御式回退到 move 参数，不抛错', function () {
  var sandbox = createSandboxRaw();
  var PT = sandbox.window.WTJ_POINTER_TRAIL;
  setMathRandomSequence(sandbox, [0]);
  var list = PT.buildTrailSparkles('nonexistent-tier');
  assert.equal(list.length, PT.BURST_PARAMS.move.countRange[0]);
});

test('buildTrailSparkles：每颗星点的 angleRad 各自独立随机（围绕锚点全向散开，区别于 letter-motion 的单一拖尾方向线）', function () {
  var sandbox = createSandboxRaw();
  var PT = sandbox.window.WTJ_POINTER_TRAIL;
  // 固定一串不同的值，确保 clickHit 上限 7 颗星点各自拿到不同的 angleRad（而不是共用同一个）。
  setMathRandomSequence(sandbox, [0.99, 0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6, 0.5]);
  var list = PT.buildTrailSparkles(PT.TIERS.CLICK_HIT);
  assert.ok(list.length >= 5, '至少应有 5 颗星点');
  var angles = list.map(function (sp) { return sp.angleRad; });
  var uniqueAngles = angles.filter(function (a, idx) { return angles.indexOf(a) === idx; });
  assert.ok(uniqueAngles.length > 1, '星点的 angleRad 应各自独立（非共用同一方向），实际=' + JSON.stringify(angles));
});

// --- 5. computeDropAvoidanceFactor：drop-target 避让几何判定（需求5） -------------------------

test('computeDropAvoidanceFactor：opts.dragging 为假时恒返回 1（只在拖拽中才避让）', function () {
  var PT = createSandbox();
  var rects = [{ x: 100, y: 100, w: 50, h: 50 }];
  assert.equal(PT.computeDropAvoidanceFactor(120, 120, rects, { dragging: false }), 1, '点在矩形内部，但 dragging:false 时不避让');
  assert.equal(PT.computeDropAvoidanceFactor(120, 120, rects, {}), 1, '缺省 opts.dragging 视为假');
  assert.equal(PT.computeDropAvoidanceFactor(120, 120, rects, null), 1, 'opts 缺失也不应抛错，按不避让处理');
});

test('computeDropAvoidanceFactor：dropTargetRects 为空/缺失时恒返回 1', function () {
  var PT = createSandbox();
  assert.equal(PT.computeDropAvoidanceFactor(0, 0, [], { dragging: true }), 1);
  assert.equal(PT.computeDropAvoidanceFactor(0, 0, null, { dragging: true }), 1);
  assert.equal(PT.computeDropAvoidanceFactor(0, 0, undefined, { dragging: true }), 1);
});

test('computeDropAvoidanceFactor：点落在矩形内部（含边界）时完全避让（0），拖拽时不遮挡 drop target 本体', function () {
  var PT = createSandbox();
  var rects = [{ x: 100, y: 100, w: 50, h: 50 }];
  assert.equal(PT.computeDropAvoidanceFactor(125, 125, rects, { dragging: true }), 0, '矩形中心应完全避让');
  assert.equal(PT.computeDropAvoidanceFactor(100, 100, rects, { dragging: true }), 0, '左上角边界上应完全避让');
  assert.equal(PT.computeDropAvoidanceFactor(150, 150, rects, { dragging: true }), 0, '右下角边界上应完全避让');
});

test('computeDropAvoidanceFactor：矩形外 margin 范围内线性回升，避免生硬的可见分界线', function () {
  var PT = createSandbox();
  var rects = [{ x: 100, y: 100, w: 50, h: 50 }];
  var margin = 40;
  // 右边界 x=150；(150+20, 125) 距边界水平距离 20px（y 在矩形纵向范围内，dy=0）。
  var factorAt20 = PT.computeDropAvoidanceFactor(170, 125, rects, { dragging: true, marginPx: margin });
  var factorAt10 = PT.computeDropAvoidanceFactor(160, 125, rects, { dragging: true, marginPx: margin });
  assert.ok(Math.abs(factorAt20 - 20 / margin) < 1e-9, '距边界 20px、margin=40 时因子应为 0.5，实际=' + factorAt20);
  assert.ok(Math.abs(factorAt10 - 10 / margin) < 1e-9, '距边界 10px、margin=40 时因子应为 0.25，实际=' + factorAt10);
  assert.ok(factorAt10 < factorAt20, '越靠近矩形，避让因子应越小（更暗）');
});

test('computeDropAvoidanceFactor：超出 margin 范围后恒为 1（不避让）', function () {
  var PT = createSandbox();
  var rects = [{ x: 100, y: 100, w: 50, h: 50 }];
  var margin = 40;
  assert.equal(PT.computeDropAvoidanceFactor(100 + 50 + margin, 125, rects, { dragging: true, marginPx: margin }), 1, '恰好在 margin 边界上应为 1');
  assert.equal(PT.computeDropAvoidanceFactor(1000, 1000, rects, { dragging: true, marginPx: margin }), 1, '远离矩形应为 1');
});

test('computeDropAvoidanceFactor：缺省 marginPx 时使用 DROP_AVOID_MARGIN_PX_DEFAULT', function () {
  var PT = createSandbox();
  var rects = [{ x: 0, y: 0, w: 10, h: 10 }];
  var d = PT.DROP_AVOID_MARGIN_PX_DEFAULT;
  var x = 10 + d / 2; // 距右边界 d/2
  var factor = PT.computeDropAvoidanceFactor(x, 5, rects, { dragging: true });
  assert.ok(Math.abs(factor - 0.5) < 1e-9, '缺省 margin 下距边界 margin/2 处因子应为 0.5，实际=' + factor);
});

test('computeDropAvoidanceFactor：多个矩形时取最小因子（离任意一个最近/落在其中任意一个内部都会避让）', function () {
  var PT = createSandbox();
  var rects = [
    { x: 0, y: 0, w: 10, h: 10 },     // 远处矩形
    { x: 100, y: 100, w: 50, h: 50 }  // 查询点在此矩形内部
  ];
  var factor = PT.computeDropAvoidanceFactor(125, 125, rects, { dragging: true });
  assert.equal(factor, 0, '落在第二个矩形内部时，即便第一个矩形很远，也应取最小因子 0（完全避让）');
});

test('computeDropAvoidanceFactor：非法矩形条目（null）被跳过，不抛错', function () {
  var PT = createSandbox();
  var rects = [null, { x: 100, y: 100, w: 50, h: 50 }];
  assert.doesNotThrow(function () {
    var factor = PT.computeDropAvoidanceFactor(125, 125, rects, { dragging: true });
    assert.equal(factor, 0);
  });
});
