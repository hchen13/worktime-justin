// WTJ-20260704-086 — letter-motion.js 单元测试（durable QA asset）
//
// 用 Node 内置 vm 模块搭一个最小沙箱（只需要 window + console，letter-motion.js 不依赖
// document/canvas——这是本卡刻意的分层设计，见 app/web/letter-motion.js 顶部注释：081 token
// 与逐帧状态机纯函数放在这个独立文件里，方便不搭 Canvas2D stub 就能直接单测断言 081 规范的
// 字体栈/尺寸区间/旋转区间/安全区/缓动曲线/motion 状态机，真正的 ctx 绘制留在 app.js
// （见 tests/unit/app-visual-086.test.mjs 对 app.js 实际 drawLetters() 产出的 font 字符串的
// 集成断言）。
//
// Run:  node --test tests/unit/letter-motion.test.mjs
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
var LM_JS_PATH = path.resolve(__dirname, '../../app/web/letter-motion.js');
var LM_SRC = readFileSync(LM_JS_PATH, 'utf8');

function createSandbox(opts) {
  var options = opts || {};
  var fakeWindow = {};
  if (options.matchMedia !== undefined) {
    fakeWindow.matchMedia = options.matchMedia;
  }
  var sandbox = { window: fakeWindow, console: console };
  vm.createContext(sandbox);
  vm.runInContext(LM_SRC, sandbox, { filename: 'letter-motion.js' });
  assert.ok(fakeWindow.WTJ_LETTER_MOTION, 'letter-motion.js 必须挂载 window.WTJ_LETTER_MOTION');
  return fakeWindow.WTJ_LETTER_MOTION;
}

// --- 1. API 冻结 + token 数值忠实抄录 081 --------------------------------------------------

test('API 冻结：window.WTJ_LETTER_MOTION 是 frozen 对象且方法齐全', function () {
  var LM = createSandbox();
  assert.equal(Object.isFrozen(LM), true);
  ['TOKENS', 'buildLetterFont', 'colorWithAlpha', 'randomLetterSize', 'randomRotationRad',
    'randomDrift', 'computeSafeArea', 'cubicBezier', 'popEase', 'settleEase',
    'computeLetterFrame', 'prefersReducedMotion'].forEach(function (key) {
    assert.equal(typeof LM[key] !== 'undefined', true, 'API 应包含 ' + key);
  });
  assert.equal(Object.isFrozen(LM.TOKENS), true, 'TOKENS 应深冻结');
  assert.equal(Object.isFrozen(LM.TOKENS.letters), true, 'TOKENS.letters 应深冻结');
});

test('081 token 忠实抄录：letters 域（字体栈/weight/尺寸区间/MacBook 上限/旋转区间/调色板）', function () {
  var LM = createSandbox();
  var L = LM.TOKENS.letters;
  assert.equal(
    L.fontStack,
    '"Arial Rounded MT Bold", "Arial Rounded Bold", "SF Pro Rounded", "SF Compact Rounded", "Avenir Next", -apple-system, BlinkMacSystemFont, sans-serif'
  );
  assert.equal(L.weight, 900);
  assert.deepEqual(Array.from(L.desktopSizeRangePx), [56, 148]);
  assert.equal(L.targetMacCapPx, 132);
  assert.deepEqual(Array.from(L.rotationDegRange), [-12, 12]);
  assert.deepEqual(Array.from(L.palette), ['#ffd84c', '#3ce7ff', '#ff675a', '#9cff38', '#ff77b8', '#82a8ff']);
  assert.equal(L.safeAreaPx.topBottom, 72);
  assert.equal(L.safeAreaPx.sides, 48);
});

test('081 token 忠实抄录：header/footer/letterMotion/functionKeyFeedback 域', function () {
  var LM = createSandbox();
  var T = LM.TOKENS;
  assert.equal(T.header.heightPx, 44);
  assert.equal(T.header.minHeightPx, 38);
  assert.equal(T.header.titleFontPx, 15);
  assert.equal(T.header.titleWeight, 800);
  assert.equal(T.header.lockSvgSizePx, 13);
  assert.equal(T.header.lockOpacity, 0.36);
  assert.equal(T.footer.heightPx, 92);
  assert.equal(T.footer.minHeightPx, 78);
  assert.equal(T.letterMotion.birthPopMs, 90);
  assert.equal(T.letterMotion.settleMs, 100);
  assert.deepEqual(Array.from(T.letterMotion.driftPxRange), [18, 42]);
  assert.deepEqual(Array.from(T.letterMotion.trailLengthPxRange), [58, 120]);
  assert.equal(T.letterMotion.trailMaxOpacity, 0.42);
  assert.equal(T.functionKeyFeedback.digits.maxSizePx, 118);
  assert.equal(T.functionKeyFeedback.digits.trailMultiplier, 0.75);
  assert.equal(T.functionKeyFeedback.spaceEnter.stageLightBoost, 0.04);
});

// --- 2. buildLetterFont / colorWithAlpha ----------------------------------------------------

test('buildLetterFont(size)：081 weight 900 + 081 字体栈，尺寸取整', function () {
  var LM = createSandbox();
  var font = LM.buildLetterFont(100.6);
  assert.equal(font, '900 101px ' + LM.TOKENS.letters.fontStack);
  assert.match(font, /^900 \d+px/);
  assert.ok(font.indexOf('Arial Rounded MT Bold') !== -1, 'font 字符串应含 081 字体栈首选字体');
});

test('colorWithAlpha：六位 hex 正确转换为 rgba 字符串', function () {
  var LM = createSandbox();
  assert.equal(LM.colorWithAlpha('#ffd84c', 0.5), 'rgba(255,216,76,0.5)');
  assert.equal(LM.colorWithAlpha('#000000', 1), 'rgba(0,0,0,1)');
});

// --- 3. 随机化：尺寸 / 旋转 / 漂移（统计采样断言边界） ---------------------------------------

test('randomLetterSize：桌面宽视口下落在 081 区间 [56,148]', function () {
  var LM = createSandbox();
  var i, size;
  for (i = 0; i < 300; i++) {
    size = LM.randomLetterSize(1920, false);
    assert.ok(size >= 56 && size <= 148, 'size=' + size + ' 应落在 [56,148]');
  }
});

test('randomLetterSize：2014 MacBook Air 目标机视口宽度（<=1440）下封顶 132px', function () {
  var LM = createSandbox();
  var i, size;
  for (i = 0; i < 300; i++) {
    size = LM.randomLetterSize(1440, false);
    assert.ok(size >= 56 && size <= 132, 'MacBook 目标机下 size=' + size + ' 应封顶 132px');
  }
  // 宽视口不应受该上限影响。
  var wideSizes = [];
  for (i = 0; i < 50; i++) wideSizes.push(LM.randomLetterSize(1920, false));
  assert.ok(wideSizes.some(function (s) { return s > 132; }), '宽视口下应能采样到超过 132px 的字母（否则说明上限被误用到了宽视口）');
});

test('randomLetterSize：数字键（isDigit=true）无论视口宽度都封顶 118px', function () {
  var LM = createSandbox();
  var i, size;
  for (i = 0; i < 300; i++) {
    size = LM.randomLetterSize(1920, true);
    assert.ok(size >= 56 && size <= 118, '数字 size=' + size + ' 应封顶 118px（081 functionKeyFeedback.digits.maxSizePx）');
  }
});

test('randomRotationRad：落在 081 旋转区间 [-12,12] 度（换算为弧度）', function () {
  var LM = createSandbox();
  var maxRad = 12 * Math.PI / 180;
  var i, rad;
  for (i = 0; i < 300; i++) {
    rad = LM.randomRotationRad();
    assert.ok(rad >= -maxRad - 1e-9 && rad <= maxRad + 1e-9, 'rad=' + rad + ' 应落在 ±12deg');
  }
});

test('randomDrift：漂移距离落在 081 区间 [18,42]px，dx/dy 与 angle/dist 一致', function () {
  var LM = createSandbox();
  var i, d, dist;
  for (i = 0; i < 300; i++) {
    d = LM.randomDrift();
    dist = Math.sqrt(d.dx * d.dx + d.dy * d.dy);
    assert.ok(dist >= 18 - 1e-6 && dist <= 42 + 1e-6, 'drift dist=' + dist + ' 应落在 [18,42]px');
    assert.ok(Math.abs(d.dx - Math.cos(d.angleRad) * dist) < 1e-6);
    assert.ok(Math.abs(d.dy - Math.sin(d.angleRad) * dist) < 1e-6);
  }
});

// --- 4. computeSafeArea -----------------------------------------------------------------------

test('computeSafeArea：常规视口按 081 安全区（距 header/footer 72px，距左右 48px）', function () {
  var LM = createSandbox();
  var area = LM.computeSafeArea(1440, 900);
  assert.equal(area.minX, 48);
  assert.equal(area.maxX, 1440 - 48);
  assert.equal(area.minY, 44 + 72); // header.heightPx + safeAreaPx.topBottom
  assert.equal(area.maxY, 900 - 92 - 72); // height - footer.heightPx - safeAreaPx.topBottom
});

test('computeSafeArea：极端矮视口下不产生 minY > maxY 的非法区间', function () {
  var LM = createSandbox();
  var area = LM.computeSafeArea(400, 120); // 44+72=116 起，120-92-72=-44，minY 本会 > maxY
  assert.ok(area.minY <= area.maxY, '退化区间也必须保持 minY <= maxY，否则 rand(min,max) 会产生反向区间');
});

// --- 5. 缓动曲线 -------------------------------------------------------------------------------

test('cubicBezier/popEase/settleEase：边界值 0/1，且中段单调不减', function () {
  var LM = createSandbox();
  assert.equal(LM.popEase(0), 0);
  assert.equal(LM.popEase(1), 1);
  assert.equal(LM.settleEase(0), 0);
  assert.equal(LM.settleEase(1), 1);
  var prev = 0, i, v;
  for (i = 1; i <= 10; i++) {
    v = LM.popEase(i / 10);
    assert.ok(v >= prev - 1e-6, 'popEase 应大体单调不减，t=' + i / 10 + ' v=' + v + ' prev=' + prev);
    prev = v;
  }
});

// --- 6. computeLetterFrame：081 Letter Motion Spec 四阶段状态机 ------------------------------

function makeLetter(overrides) {
  var base = {
    born: 0,
    life: 1000,
    rotStart: 0.1,
    rotFinal: 0.05,
    driftDx: 20,
    driftDy: 0,
    reducedMotion: false
  };
  var key;
  for (key in overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) base[key] = overrides[key];
  }
  return base;
}

test('computeLetterFrame：age > life 时 alive=false（字母应被移除）', function () {
  var LM = createSandbox();
  var letter = makeLetter({ life: 500 });
  var frame = LM.computeLetterFrame(600, letter);
  assert.equal(frame.alive, false);
});

test('computeLetterFrame：birth pop 阶段（0~90ms）scale 从 0.78 起、opacity 从 0 起、rot=rotStart', function () {
  var LM = createSandbox();
  var letter = makeLetter();
  var f0 = LM.computeLetterFrame(0, letter);
  assert.equal(f0.alive, true);
  assert.ok(Math.abs(f0.scale - 0.78) < 1e-6, 'pop 起点 scale 应为 0.78，实际 ' + f0.scale);
  assert.ok(Math.abs(f0.opacity - 0) < 1e-6);
  assert.equal(f0.rotRad, letter.rotStart);
  assert.equal(f0.dx, 0);

  var f90 = LM.computeLetterFrame(90, letter);
  assert.ok(Math.abs(f90.scale - 1.08) < 1e-6, 'pop 终点 scale 应达到 overshoot 1.08，实际 ' + f90.scale);
  assert.ok(Math.abs(f90.opacity - 1) < 1e-6);
});

test('computeLetterFrame：settle 阶段（90~190ms）scale 回落到 1.00，rot 由 rotStart 过渡到 rotFinal', function () {
  var LM = createSandbox();
  var letter = makeLetter();
  var f190 = LM.computeLetterFrame(190, letter);
  assert.ok(Math.abs(f190.scale - 1.0) < 1e-6, 'settle 终点 scale 应为 1.00，实际 ' + f190.scale);
  assert.ok(Math.abs(f190.rotRad - letter.rotFinal) < 1e-6, 'settle 终点 rot 应落到 rotFinal');
});

test('computeLetterFrame：drift 阶段字母沿 driftDx/driftDy 平移，drift 结束前不进入 fade', function () {
  var LM = createSandbox();
  var letter = makeLetter({ life: 1000 }); // fadeWindow=clamp(400,300,600)=400, fadeStart=max(190,600)=600
  var fMid = LM.computeLetterFrame(400, letter); // 190 < 400 < 600 -> drift 阶段
  assert.equal(fMid.opacity, 1, 'drift 阶段字母本体应保持不透明');
  assert.ok(fMid.dx > 0 && fMid.dx < letter.driftDx, 'drift 中途 dx 应部分推进，未到终值');
});

test('computeLetterFrame：fade 阶段 opacity 线性淡出、blur 随之增加到 1.5px、drift 定格在终值', function () {
  var LM = createSandbox();
  var letter = makeLetter({ life: 1000 }); // fadeStart=600
  var fFadeMid = LM.computeLetterFrame(800, letter); // (800-600)/(1000-600)=0.5
  assert.ok(Math.abs(fFadeMid.opacity - 0.5) < 1e-6, 'fade 中点 opacity 应约为 0.5，实际 ' + fFadeMid.opacity);
  assert.ok(Math.abs(fFadeMid.blurPx - 0.75) < 1e-6, 'fade 中点 blur 应约为 1.5px 的一半，实际 ' + fFadeMid.blurPx);
  assert.equal(fFadeMid.dx, letter.driftDx, 'fade 阶段 drift 应定格在终值，不再变化');

  var fEnd = LM.computeLetterFrame(999, letter);
  assert.ok(fEnd.opacity < 0.02, '临近生命终点 opacity 应趋近 0');
  assert.ok(fEnd.blurPx > 1.4 && fEnd.blurPx <= 1.5 + 1e-6, '临近生命终点 blur 应趋近 1.5px 上限');
});

test('computeLetterFrame：拖尾 trailAlpha 在诞生时最高（0.42），半生命时降到 0.10 以下', function () {
  var LM = createSandbox();
  var letter = makeLetter({ life: 1000 });
  var f0 = LM.computeLetterFrame(0, letter);
  assert.ok(Math.abs(f0.trailAlpha - 0.42) < 1e-6, '诞生时 trailAlpha 应为 081 token 的 trailMaxOpacity=0.42，实际 ' + f0.trailAlpha);
  var fHalf = LM.computeLetterFrame(500, letter);
  assert.ok(fHalf.trailAlpha < 0.10 + 1e-6, '半生命时 trailAlpha 应降到约 0.10 以下，实际 ' + fHalf.trailAlpha);
});

test('computeLetterFrame：reduced-motion 下跳过 pop overshoot/drift，scale 恒为 1，线性淡出', function () {
  var LM = createSandbox();
  var letter = makeLetter({ life: 800, reducedMotion: true, driftDx: 30, driftDy: 30 });
  var f0 = LM.computeLetterFrame(0, letter);
  assert.equal(f0.scale, 1);
  assert.equal(f0.opacity, 1);
  assert.equal(f0.dx, 0);
  assert.equal(f0.dy, 0);
  assert.equal(f0.trailAlpha, 0, 'reduced-motion 下不画拖尾');
  var fMid = LM.computeLetterFrame(400, letter);
  assert.ok(Math.abs(fMid.opacity - 0.5) < 1e-6, 'reduced-motion 下应线性淡出，半程 opacity≈0.5');
});

// --- 7. prefersReducedMotion --------------------------------------------------------------------

test('prefersReducedMotion：委托 window.matchMedia，缺失/异常时安全回退 false', function () {
  var LMTrue = createSandbox({ matchMedia: function () { return { matches: true }; } });
  assert.equal(LMTrue.prefersReducedMotion(), true);

  var LMFalse = createSandbox({ matchMedia: function () { return { matches: false }; } });
  assert.equal(LMFalse.prefersReducedMotion(), false);

  var LMMissing = createSandbox();
  assert.equal(LMMissing.prefersReducedMotion(), false);

  var LMThrows = createSandbox({ matchMedia: function () { throw new Error('boom'); } });
  assert.equal(LMThrows.prefersReducedMotion(), false);
});
