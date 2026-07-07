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

// opts.honorReducedMotion: boolean 时挂一份最小 window.WTJ_MANIFEST = { performance:
// { honorReducedMotion: ... } } 桩（WTJ-20260706-013 kiosk 默认无视 OS 偏好开关，见
// letter-motion.js 的 prefersReducedMotion() 顶部守卫）。letter-motion.js 本身不消费
// manifest 的其它字段，最小桩不影响其余断言。缺省（不传该 opt）时 window.WTJ_MANIFEST 保持
// undefined，等价于真实 manifest.js 默认 honorReducedMotion=false 的防御式回退分支。
function createSandbox(opts) {
  var options = opts || {};
  var fakeWindow = {};
  if (options.matchMedia !== undefined) {
    fakeWindow.matchMedia = options.matchMedia;
  }
  if (options.honorReducedMotion !== undefined) {
    fakeWindow.WTJ_MANIFEST = { performance: { honorReducedMotion: options.honorReducedMotion } };
  }
  var sandbox = { window: fakeWindow, console: console };
  vm.createContext(sandbox);
  vm.runInContext(LM_SRC, sandbox, { filename: 'letter-motion.js' });
  assert.ok(fakeWindow.WTJ_LETTER_MOTION, 'letter-motion.js 必须挂载 window.WTJ_LETTER_MOTION');
  return fakeWindow.WTJ_LETTER_MOTION;
}

// WTJ-20260705-002 — 同 createSandbox()，但返回原始 sandbox（而不是直接返回 WTJ_LETTER_MOTION），
// 供需要在加载后再覆盖 Math.random 的确定性测试使用（见 setMathRandomSequence()）。
function createSandboxRaw(opts) {
  var options = opts || {};
  var fakeWindow = {};
  if (options.matchMedia !== undefined) {
    fakeWindow.matchMedia = options.matchMedia;
  }
  var sandbox = { window: fakeWindow, console: console };
  vm.createContext(sandbox);
  vm.runInContext(LM_SRC, sandbox, { filename: 'letter-motion.js' });
  assert.ok(fakeWindow.WTJ_LETTER_MOTION, 'letter-motion.js 必须挂载 window.WTJ_LETTER_MOTION');
  return sandbox;
}

// WTJ-20260705-002 — 用一串固定序列覆盖沙箱内的 Math.random()（vm 每个 context 有自己独立的
// Math 对象，覆盖只影响这一个沙箱，不污染本文件其余用例的真实随机性）。序列耗尽后重复最后一个
// 值，避免调用次数对不上时返回 undefined。这是 brief 要求的"确定性用 vm.runInContext 覆盖
// Math.random"手法，用于精确断言 randomizeLetterCase/randomizeDigitDisplay/randomSparkles 的
// 具体分支/公式，而不仅仅是统计意义上的"大体符合"。
function setMathRandomSequence(sandbox, sequence) {
  vm.runInContext(
    '(function () { var __seq = ' + JSON.stringify(sequence) + '; var __i = 0; ' +
    'Math.random = function () { var v = __seq[Math.min(__i, __seq.length - 1)]; __i += 1; return v; }; })();',
    sandbox
  );
}

// --- 1. API 冻结 + token 数值忠实抄录 081 --------------------------------------------------

test('API 冻结：window.WTJ_LETTER_MOTION 是 frozen 对象且方法齐全', function () {
  var LM = createSandbox();
  assert.equal(Object.isFrozen(LM), true);
  ['TOKENS', 'buildLetterFont', 'colorWithAlpha', 'randomLetterSize', 'randomRotationRad',
    'randomDrift', 'computeSafeArea', 'cubicBezier', 'popEase', 'settleEase',
    'computeLetterFrame', 'prefersReducedMotion',
    // WTJ-20260705-002 新增：
    'randomizeLetterCase', 'DIGIT_SHIFT_MAP', 'randomizeDigitDisplay', 'SPARKLE_PARAMS', 'randomSparkles'
  ].forEach(function (key) {
    assert.equal(typeof LM[key] !== 'undefined', true, 'API 应包含 ' + key);
  });
  assert.equal(Object.isFrozen(LM.TOKENS), true, 'TOKENS 应深冻结');
  assert.equal(Object.isFrozen(LM.TOKENS.letters), true, 'TOKENS.letters 应深冻结');
  assert.equal(Object.isFrozen(LM.DIGIT_SHIFT_MAP), true, 'DIGIT_SHIFT_MAP 应冻结');
  assert.equal(Object.isFrozen(LM.SPARKLE_PARAMS), true, 'SPARKLE_PARAMS 应深冻结');
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

test('prefersReducedMotion：honorReducedMotion=true 时委托 window.matchMedia，缺失/异常时安全回退 false', function () {
  // WTJ-20260706-013：kiosk 默认 honorReducedMotion=false 时本函数恒返回 false（见下方新增的
  // "默认无视 OS reduce-motion"正向用例）；这里测的是 honorReducedMotion 显式为 true（未来
  // 家长设置钩子）时委托 matchMedia 的既有回归行为，因此每个子用例都显式传 honorReducedMotion:true。
  var LMTrue = createSandbox({ matchMedia: function () { return { matches: true }; }, honorReducedMotion: true });
  assert.equal(LMTrue.prefersReducedMotion(), true);

  var LMFalse = createSandbox({ matchMedia: function () { return { matches: false }; }, honorReducedMotion: true });
  assert.equal(LMFalse.prefersReducedMotion(), false);

  var LMMissing = createSandbox({ honorReducedMotion: true });
  assert.equal(LMMissing.prefersReducedMotion(), false);

  var LMThrows = createSandbox({ matchMedia: function () { throw new Error('boom'); }, honorReducedMotion: true });
  assert.equal(LMThrows.prefersReducedMotion(), false);
});

// WTJ-20260706-013（本卡核心修复，正向断言）：manifest.performance.honorReducedMotion 缺省/
// false（本文件的 createSandbox 不传 honorReducedMotion 时 window.WTJ_MANIFEST 就是
// undefined，等价于真实 manifest.js 的默认值）时，即使 OS matchMedia 命中
// prefers-reduced-motion: reduce，prefersReducedMotion() 也应恒返回 false——kiosk 儿童 app
// 无视 OS「减弱动态」偏好，核心学习动画（字母诞生/pop/drift）照播。
test('prefersReducedMotion：默认（honorReducedMotion 缺省/false）无视 OS matchMedia reduce=true，恒返回 false', function () {
  var LM = createSandbox({ matchMedia: function () { return { matches: true }; } }); // 未传 honorReducedMotion
  assert.equal(LM.prefersReducedMotion(), false, 'kiosk 默认应无视 OS reduce-motion，动画照播');

  var LM2 = createSandbox({ matchMedia: function () { return { matches: true }; }, honorReducedMotion: false });
  assert.equal(LM2.prefersReducedMotion(), false, '显式 honorReducedMotion=false 同样应无视 OS reduce-motion');

  var LM3 = createSandbox({ matchMedia: function () { return { matches: true }; }, honorReducedMotion: 'true' });
  assert.equal(LM3.prefersReducedMotion(), false, 'honorReducedMotion 非严格 === true（例如字符串 "true"）也应当作不尊重处理，不做隐式类型转换');
});

// --- 8. randomizeLetterCase（WTJ-20260705-002：字母大小写 50/50） --------------------------------

test('randomizeLetterCase：防御式——非字母字符（数字/符号）原样返回，不受影响', function () {
  var LM = createSandbox();
  assert.equal(LM.randomizeLetterCase('5'), '5');
  assert.equal(LM.randomizeLetterCase(','), ',');
  assert.equal(LM.randomizeLetterCase('!'), '!');
});

test('randomizeLetterCase：确定性（vm 覆盖 Math.random）——<0.5 转大写、>=0.5 转小写', function () {
  // 为什么用 vm 覆盖而不是统计采样：这条用例要锁定"比较方向"本身（< 还是 <=，大写对应低半区
  // 还是高半区）——这类实现细节统计采样测不出来（无论方向哪种实现，长期占比都约 50/50），
  // 必须用确定性输入才能钉死具体分支，防止未来重构悄悄翻转方向而测试无感。
  var sandbox = createSandboxRaw();
  var LM = sandbox.window.WTJ_LETTER_MOTION;

  setMathRandomSequence(sandbox, [0.1]);
  assert.equal(LM.randomizeLetterCase('a'), 'A', 'random=0.1 (<0.5) 应转大写');
  assert.equal(LM.randomizeLetterCase('B'), 'B', '已是大写、random<0.5 应仍为大写');

  setMathRandomSequence(sandbox, [0.9]);
  assert.equal(LM.randomizeLetterCase('A'), 'a', 'random=0.9 (>=0.5) 应转小写');
  assert.equal(LM.randomizeLetterCase('b'), 'b', '已是小写、random>=0.5 应仍为小写');
});

test('randomizeLetterCase：统计~50/50——大量采样中大写/小写占比均落在合理区间', function () {
  var LM = createSandbox();
  var upper = 0, lower = 0, i, out;
  var N = 2000;
  for (i = 0; i < N; i++) {
    out = LM.randomizeLetterCase('a');
    if (out === out.toUpperCase()) {
      upper++;
    } else {
      lower++;
    }
  }
  assert.ok(upper > N * 0.4 && upper < N * 0.6, '大写占比应接近 50%，实际 upper=' + upper + '/' + N);
  assert.ok(lower > N * 0.4 && lower < N * 0.6, '小写占比应接近 50%，实际 lower=' + lower + '/' + N);
});

// --- 9. randomizeDigitDisplay（WTJ-20260705-002：数字 60/40，US-shift 映射） ---------------------

test('randomizeDigitDisplay：DIGIT_SHIFT_MAP 精确抄录 US 键盘 shift 层（1234567890 -> !@#$%^&*()）', function () {
  var LM = createSandbox();
  var expected = { '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '^', '7': '&', '8': '*', '9': '(', '0': ')' };
  Object.keys(expected).forEach(function (digit) {
    assert.equal(LM.DIGIT_SHIFT_MAP[digit], expected[digit], 'digit=' + digit);
  });
});

test('randomizeDigitDisplay：防御式——非 0-9 字符原样返回', function () {
  var LM = createSandbox();
  assert.equal(LM.randomizeDigitDisplay('a'), 'a');
  assert.equal(LM.randomizeDigitDisplay(','), ',');
});

test('randomizeDigitDisplay：确定性（vm 覆盖 Math.random）——<0.4 出 shift 符号、>=0.4 出原数字', function () {
  var sandbox = createSandboxRaw();
  var LM = sandbox.window.WTJ_LETTER_MOTION;

  setMathRandomSequence(sandbox, [0.1]);
  assert.equal(LM.randomizeDigitDisplay('1'), '!', 'random=0.1 (<0.4) 应替换为 shift 符号');

  setMathRandomSequence(sandbox, [0.9]);
  assert.equal(LM.randomizeDigitDisplay('1'), '1', 'random=0.9 (>=0.4) 应原样返回数字');
});

test('randomizeDigitDisplay：统计~60/40——大量采样中原数字/符号占比落在合理区间', function () {
  var LM = createSandbox();
  var digitCount = 0, symbolCount = 0, other = 0, i, out;
  var N = 3000;
  for (i = 0; i < N; i++) {
    out = LM.randomizeDigitDisplay('5');
    if (out === '5') {
      digitCount++;
    } else if (out === '%') {
      symbolCount++;
    } else {
      other++;
    }
  }
  assert.equal(other, 0, '只应产生原数字或对应 shift 符号两种结果之一');
  assert.ok(digitCount > N * 0.5 && digitCount < N * 0.7, '原数字占比应接近 60%，实际=' + digitCount + '/' + N);
  assert.ok(symbolCount > N * 0.3 && symbolCount < N * 0.5, '符号占比应接近 40%，实际=' + symbolCount + '/' + N);
});

// --- 10. randomSparkles（WTJ-20260705-002：拖尾星点/闪点纯参数生成器） --------------------------

// WTJ-20260705-019b（Ethan 截图反馈④「字母拖尾更像流星尾迹：周围星点更小、更自然」）：
// countRange 从 [2,4] 提到 [3,6]（略增颗粒数），sizeFracRange 从 [0.32,0.8] 大幅下移收窄到
// [0.12,0.32]（新上限恰好等于旧下限，星点明显缩小），新增 tBiasPower 控制"头密尾疏"的非均匀
// 分布，让拖尾读起来更像细碎的流星尘，而不是几个大光点。
test('randomSparkles：SPARKLE_PARAMS 边界值可读（测试与消费方共用同一份数值，不手工镜像）', function () {
  var LM = createSandbox();
  assert.deepEqual(Array.from(LM.SPARKLE_PARAMS.countRange), [3, 6]);
  assert.deepEqual(Array.from(LM.SPARKLE_PARAMS.sizeFracRange), [0.12, 0.32]);
  assert.deepEqual(Array.from(LM.SPARKLE_PARAMS.twinkleHzRange), [0.6, 1.6]);
  assert.equal(LM.SPARKLE_PARAMS.tBiasPower, 1.6, 'tBiasPower 应 > 1，让 t 分布向拖尾头部（贴近字母本体）偏置');
});

// 019b 新增：星点尺寸应明显小于 002 首版区间——新区间的上限（sizeFracRange[1]）不应超过旧区间
// 的下限（0.32），这是"星点更小"这条反馈的一个可回归的数值下界（防止未来又不小心调回大尺寸）。
test('randomSparkles：星点尺寸区间应明显小于 002 首版（Ethan 反馈④「星点更小」的量化回归门）', function () {
  var LM = createSandbox();
  assert.ok(LM.SPARKLE_PARAMS.sizeFracRange[1] <= 0.32, 'sizeFracRange 上限不应超过 002 首版的下限 0.32，确保星点整体比首版明显更小');
});

// 019b 新增：t 分布应"头密尾疏"（贴近字母本体的一端更密集），而不是沿整条拖尾等概率均匀分布。
// 用大样本统计均值——tBiasPower=1.6 时理论均值 E[t] = 1/(1+tBiasPower) ≈ 0.385；均匀分布
// （tBiasPower=1）理论均值是 0.5。断言样本均值明显低于 0.5，且落在理论值附近的合理区间内，
// 既验证"确实做了偏置"，又不会因为具体系数微调而过度锚定精确浮点数。
test('randomSparkles：t 分布"头密尾疏"（大样本均值应明显偏向拖尾头部，而不是均匀分布的 0.5）', function () {
  var LM = createSandbox();
  var i, j, list, sum = 0, n = 0;
  for (i = 0; i < 4000; i++) {
    list = LM.randomSparkles();
    for (j = 0; j < list.length; j++) {
      sum += list[j].t;
      n += 1;
    }
  }
  var mean = sum / n;
  assert.ok(mean < 0.45, 't 均值=' + mean + ' 应明显低于均匀分布的期望值 0.5（体现头密尾疏的非均匀分布）');
  assert.ok(mean > 0.25, 't 均值=' + mean + ' 不应过度偏置到几乎所有星点都贴在字母本体上（仍需要覆盖拖尾中后段）');
});

test('randomSparkles：统计——数量与各字段落在 SPARKLE_PARAMS 声明区间内（300 次采样）', function () {
  var LM = createSandbox();
  var i, j, list;
  for (i = 0; i < 300; i++) {
    list = LM.randomSparkles();
    assert.ok(
      list.length >= LM.SPARKLE_PARAMS.countRange[0] && list.length <= LM.SPARKLE_PARAMS.countRange[1],
      'count=' + list.length + ' 应落在声明区间内'
    );
    for (j = 0; j < list.length; j++) {
      var sp = list[j];
      assert.ok(sp.t >= 0 && sp.t <= 1, 't=' + sp.t + ' 应落在 [0,1]');
      assert.ok(sp.sizeFrac >= LM.SPARKLE_PARAMS.sizeFracRange[0] && sp.sizeFrac <= LM.SPARKLE_PARAMS.sizeFracRange[1]);
      assert.ok(sp.phaseRad >= 0 && sp.phaseRad <= Math.PI * 2 + 1e-9);
      assert.ok(sp.twinkleHz >= LM.SPARKLE_PARAMS.twinkleHzRange[0] && sp.twinkleHz <= LM.SPARKLE_PARAMS.twinkleHzRange[1]);
    }
  }
});

test('randomSparkles：确定性（vm 覆盖 Math.random 恒为 0）——count 取区间下限，字段精确落在区间下限', function () {
  var sandbox = createSandboxRaw();
  var LM = sandbox.window.WTJ_LETTER_MOTION;
  setMathRandomSequence(sandbox, [0]);

  var list = LM.randomSparkles();
  assert.equal(list.length, LM.SPARKLE_PARAMS.countRange[0], 'random 恒为 0 时 count 应取区间下限');
  list.forEach(function (sp) {
    assert.equal(sp.t, 0);
    assert.ok(Math.abs(sp.sizeFrac - LM.SPARKLE_PARAMS.sizeFracRange[0]) < 1e-9);
    assert.equal(sp.phaseRad, 0);
    assert.ok(Math.abs(sp.twinkleHz - LM.SPARKLE_PARAMS.twinkleHzRange[0]) < 1e-9);
  });
});

test('randomSparkles：确定性（vm 覆盖 Math.random 趋近 1）——count 取区间上限，字段趋近区间上限', function () {
  var sandbox = createSandboxRaw();
  var LM = sandbox.window.WTJ_LETTER_MOTION;
  var nearOne = 0.999999999;
  setMathRandomSequence(sandbox, [nearOne]);

  var list = LM.randomSparkles();
  assert.equal(list.length, LM.SPARKLE_PARAMS.countRange[1], 'random 趋近 1 时 count 应取区间上限');
  list.forEach(function (sp) {
    assert.ok(sp.t > 0.999, 't=' + sp.t);
    assert.ok(Math.abs(sp.sizeFrac - LM.SPARKLE_PARAMS.sizeFracRange[1]) < 1e-6);
    assert.ok(sp.phaseRad > Math.PI * 2 - 1e-4);
    assert.ok(Math.abs(sp.twinkleHz - LM.SPARKLE_PARAMS.twinkleHzRange[1]) < 1e-6);
  });
});
