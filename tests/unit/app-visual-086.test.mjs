// WTJ-20260704-086 / WTJ-20260705-002 — app.js 视觉改动的集成测试 + header CSS 静态断言
// （durable QA asset）
//
// 与 tests/unit/audio-runtime-integration.test.mjs 第 7 节同一手法：用 Node vm 模块把真实的
// manifest.js / letter-motion.js / sparkles.js / keyboard.js / app.js 按 index.html 的真实加载
// 顺序跑在同一个最小 window/document 沙箱里（canvas ctx 用一个可内省的 stub，记录
// ctx.font/lineTo/drawImage 的每一次调用参数等），驱动一次真实 keydown -> keyboard.js 判定 ->
// app.js.spawnLetter() -> 手动触发一帧 app.js.draw() -> drawLetters()，断言实际产出的 ctx.font
// 字符串确实含 081 字体栈 + weight 900，且尺寧数值落在 081 区间内——直接验证 letter-motion.js
// 提供的 token/纯函数（已在 tests/unit/letter-motion.test.mjs 独立覆盖）在 app.js 里被正确消费，
// 而不是停留在"存在但没被接上"的状态。
//
// WTJ-20260705-002 新增覆盖：重写后的 drawLetterTrail()（锥形多段拖尾 + 星点）仍使用
// letter.color、且路径不再是旧版的 4 顶点扁平矩形；keyboard.js 新增的 onSymbol 通道在 app.js
// 侧确实弹出一个更小号、无拖尾的 fillText/strokeText token；字母大小写 50/50、数字 60/40 的
// 展示替换在实际渲染的 fillText 文本里可见（而不只是 letter-motion.js 单测里的纯函数断言）。
//
// 第二部分是 header CSS 的静态断言（读 app/web/hud.css 源文本），锁定 081 Layout Spec 的
// header 数值（heightPx:44/titleFontPx:15/titleWeight:800/lockSvgSizePx:13/lockOpacity:0.36）
// 确实落进了运行时样式表，防止未来改动悄悄漂移回 007 的占位值。
//
// Run:  node --test tests/unit/app-visual-086.test.mjs
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
var KEYBOARD_SRC = readSrc('keyboard.js');
var APP_SRC = readSrc('app.js');
var HUD_CSS_SRC = readSrc('hud.css');

// --- 最小 canvas ctx stub：支持 app.js 新增的绘制 API，并记录 font/arc 调用供断言 -------------

function makeFakeGradient() {
  return { addColorStop: function () {} };
}

// WTJ-20260705-002：sparkles.js 的 buildSparkleSprite() 除了既有 getGlowSprite() 用到的
// createRadialGradient/beginPath/arc/fill 之外，还会画一个十字高光描边（save/strokeStyle/
// lineWidth/moveTo/lineTo/stroke/restore），offscreen ctx stub 需要补齐这些方法，否则 002 卡
// 新增的星点贴图预渲染会直接抛 TypeError。
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
    fontHistory: [], strokeTextCalls: [], fillTextCalls: [], arcCalls: [],
    // WTJ-20260705-002 新增记录：
    lineToCalls: [],   // 拖尾锥形路径的分段点——用于断言"不再是旧版 4 顶点扁平矩形"
    fillCalls: [],      // 每次 ctx.fill() 时的 fillStyle/globalAlpha 快照（拖尾锥形本体用 l.color 填充）
    drawImageCalls: []  // 星点贴图 drawImage 调用——用于断言拖尾星点确实被画出
  };
  var _font = '10px sans-serif';
  var _filter = 'none';
  var ctx = {
    setTransform: function () {},
    clearRect: function () {},
    fillRect: function () {},
    beginPath: function () {},
    arc: function (x, y, r) { rec.arcCalls.push({ x: x, y: y, r: r }); },
    moveTo: function () {},
    lineTo: function (x, y) { rec.lineToCalls.push({ x: x, y: y }); },
    closePath: function () {},
    fill: function () { rec.fillCalls.push({ fillStyle: ctx.fillStyle, globalAlpha: ctx.globalAlpha }); },
    stroke: function () {},
    save: function () {},
    restore: function () {},
    translate: function () {},
    rotate: function () {},
    fillText: function (text) { rec.fillTextCalls.push({ text: text, font: _font }); },
    strokeText: function (text) { rec.strokeTextCalls.push({ text: text, font: _font }); },
    drawImage: function (img, dx, dy, dw, dh) { rec.drawImageCalls.push({ dx: dx, dy: dy, dw: dw, dh: dh }); },
    measureText: function () { return { width: 10 }; },
    createLinearGradient: function () { return makeFakeGradient(); },
    createRadialGradient: function () { return makeFakeGradient(); },
    lineJoin: 'miter',
    lineWidth: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    _rec: rec
  };
  Object.defineProperty(ctx, 'font', {
    get: function () { return _font; },
    set: function (v) { _font = v; rec.fontHistory.push(v); }
  });
  Object.defineProperty(ctx, 'filter', {
    get: function () { return _filter; },
    set: function (v) { _filter = v; }
  });
  return ctx;
}

// 用于 dbg-*/esc-progress-* 这些纯 <div> 占位元素——它们从不被 app.js 调用 getContext()
// （只有 #stage 与离屏 canvas 元素需要 2D context，两者都各自有专门的构造函数），这里不提供
// getContext 方法，若误用会直接暴露成 TypeError 而不是静默返回 undefined。
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

// 构造真实 manifest.js + letter-motion.js + keyboard.js + app.js 的沙箱（真实加载顺序，
// 与 index.html 一致）。返回 { fireKeydown, runFrame, setNow, stageCtxRec, sandbox }。
function makeSandbox(opts) {
  opts = opts || {};
  var stageCtx = makeStageCtx();
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
  sandbox.addEventListener = function (type, fn) {
    if (!windowListeners[type]) windowListeners[type] = [];
    windowListeners[type].push(fn);
  };

  vm.createContext(sandbox);
  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  vm.runInContext(LETTER_MOTION_SRC, sandbox, { filename: 'letter-motion.js' });
  vm.runInContext(SPARKLES_SRC, sandbox, { filename: 'sparkles.js' });
  vm.runInContext(KEYBOARD_SRC, sandbox, { filename: 'keyboard.js' });
  vm.runInContext(APP_SRC, sandbox, { filename: 'app.js' });

  function fireWindowEvent(type, evt) {
    var handlers = (windowListeners[type] || []).slice();
    handlers.forEach(function (fn) { fn(evt || {}); });
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
    fireKeydown: function (key) { fireWindowEvent('keydown', { key: key, repeat: false }); },
    runFrame: runFrame,
    setNow: setNow
  };
}

// --- 1. 字母渲染：spawnLetter/drawLetters 实际产出的 ctx.font 含 081 字体栈 + weight 900 -----

test('真实按键流程：字母 "A" 触发后，drawLetters() 实际写入 ctx.font 含 081 字体栈 + weight 900', function () {
  var env = makeSandbox({ innerWidth: 1920, innerHeight: 1080 }); // 宽视口，非 MacBook 目标机上限
  env.setNow(1000);
  env.runFrame(1000); // 消费初始排队的首帧（此时无字母，只是让 rAF 链路"跑起来"）

  env.setNow(1000);
  env.fireKeydown('a'); // keyboard.js 判定为字母 -> emit onLetter('A') -> app.js spawnLetter('A')

  // age=250ms：越过 081 birth pop（0~90ms）与 settle（90~190ms）两个阶段，scale 已回落到
  // 稳定态 1.0。若改在 pop 阶段内取样（如 age=50ms），渲染尺寸=l.size*frame.scale 会因
  // "081 Letter Motion Spec 明确要求的 0.78→1.08 短暂回弹"而可能短暂超出稳定态尺寸上限，
  // 那是 by-design 的动效表现，不是本用例要断言的"081 尺寸区间"本身，见下方 132px/118px
  // 两条同类用例的同款取样时机选择。
  env.setNow(1250);
  env.runFrame(1250);

  var fonts = env.stageCtx._rec.fontHistory;
  assert.ok(fonts.length > 0, 'drawLetters() 应至少设置一次 ctx.font');
  var matched = fonts.filter(function (f) { return f.indexOf('Arial Rounded MT Bold') !== -1; });
  assert.ok(matched.length > 0, 'ctx.font 应包含 081 字体栈首选字体 "Arial Rounded MT Bold"，实际 fontHistory=' + JSON.stringify(fonts));

  var m = matched[0].match(/^(\d+)\s+(\d+)px/);
  assert.ok(m, 'font 字符串应形如 "<weight> <size>px ..."，实际=' + matched[0]);
  assert.equal(m[1], '900', '081 要求 font-weight 900');
  var size = parseInt(m[2], 10);
  assert.ok(size >= 56 && size <= 148, '宽视口下字母尺寸应落在 081 区间 [56,148]，实际=' + size);
});

test('真实按键流程：2014 MacBook Air 目标机视口宽度（<=1440）下字母尺寸封顶 132px', function () {
  var env = makeSandbox({ innerWidth: 1440, innerHeight: 900 });
  env.setNow(0);
  env.runFrame(0);

  // 先把 20 个字母全部生成（spawnLetter 本身不依赖 rAF，直接推进 fakeNow 连续触发即可，
  // 不需要在每次按键之间都画一帧）。born 时间戳落在 1000~1190 之间。
  var i;
  for (i = 0; i < 20; i++) {
    env.setNow(1000 + i * 10);
    env.fireKeydown(String.fromCharCode(97 + (i % 26))); // a..z 循环，避开同键 >3 连打暂停规则
  }

  // 统一在 t=1400 画一帧：最晚出生的字母（born=1190）此时 age=210ms，已越过 081 settle
  // 窗口（90+100=190ms），scale 回落到稳定态 1.0；最早出生的字母（born=1000）age=400ms，
  // 仍在其 800~1500ms 的生命周期内、且早已过了 settle，同样是稳定态尺寸。这样断言的是
  // "081 尺寸区间/MacBook 封顶"这个尺寸恒等式本身，不会被 birth-pop 阶段"设计如此"的
  // 0.78→1.08 短暂回弹放大干扰（见 letter-motion.js computeLetterFrame() 的 birth pop 阶段
  // ——渲染尺寸 = l.size * frame.scale，pop 阶段 scale 可短暂超过 1，这是 081 Letter Motion
  // Spec 明确要求的"弹入"观感，不代表尺寸区间/封顶被违反）。
  env.setNow(1400);
  env.runFrame(1400);

  var sizes = [];
  env.stageCtx._rec.fontHistory.forEach(function (f) {
    var m = f.match(/^\d+\s+(\d+)px/);
    if (!m) return;
    sizes.push(parseInt(m[1], 10));
  });

  assert.ok(sizes.length > 0, '应记录到至少一次 font 尺寸');
  sizes.forEach(function (s) {
    assert.ok(s <= 132, '2014 MacBook Air 目标机（视口宽度<=1440）下字母稳定态尺寸应封顶 132px，实际=' + s);
  });
});

test('真实按键流程：数字键 "5" 触发后字母尺寸封顶 118px（081 functionKeyFeedback.digits）', function () {
  var env = makeSandbox({ innerWidth: 1920, innerHeight: 1080 });
  env.setNow(0);
  env.runFrame(0);

  env.setNow(1000);
  env.fireKeydown('5');
  env.setNow(1250); // 稳定态取样（越过 settle 窗口），理由同上一条用例
  env.runFrame(1250);

  var fonts = env.stageCtx._rec.fontHistory;
  var sizes = fonts.map(function (f) {
    var m = f.match(/^\d+\s+(\d+)px/);
    return m ? parseInt(m[1], 10) : null;
  }).filter(function (s) { return s !== null; });

  assert.ok(sizes.length > 0);
  sizes.forEach(function (s) {
    assert.ok(s <= 118, '数字键应封顶 118px（081 functionKeyFeedback.digits.maxSizePx），实际=' + s);
  });
});

test('letter-motion.js 缺失时 app.js 回退到内置默认值，不抛错、仍能画出字母', function () {
  // 通过在真实 app.js 之前不加载 letter-motion.js 来模拟"未加载/加载失败"场景（getLetterMotion()
  // 的 console.warn 回退分支，见 app.js 顶部注释）。
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
  // 故意不加载 letter-motion.js。
  vm.runInContext(KEYBOARD_SRC, sandbox, { filename: 'keyboard.js' });

  assert.doesNotThrow(function () {
    vm.runInContext(APP_SRC, sandbox, { filename: 'app.js' });
  }, 'app.js 在 letter-motion.js 缺失时不应抛错（防御式回退）');

  (windowListeners.keydown || []).forEach(function (fn) { fn({ key: 'a', repeat: false }); });
  fakeNow = 10;
  var fn = rafCallback;
  rafCallback = null;
  assert.doesNotThrow(function () {
    if (fn) fn(10);
  }, 'letter-motion.js 缺失时 draw()/drawLetters() 仍应能正常跑完一帧');
});

// --- 1b. WTJ-20260705-002：流星拖尾重写 + 拖尾星点 + 标点/符号弹出 + 大小写/数字展示替换 -----

test('WTJ-20260705-002：drawLetterTrail() 重写为锥形多段拖尾（非旧版 4 顶点扁平矩形），填充色仍是 letter.color', function () {
  var env = makeSandbox({ innerWidth: 1920, innerHeight: 1080 });
  env.setNow(0);
  env.runFrame(0);

  env.setNow(1000);
  env.fireKeydown('a');

  // age=250ms：越过 settle（90+100=190ms），letter-motion.js computeLetterFrame() 的 fadeStart
  // 至少为 480ms（life 最短 800ms 时：fadeWindow=clamp(320,300,600)=320，fadeStart=800-320=480），
  // 所以 250ms 时必然仍在 drift 阶段——trailAlpha/trailGrowth 均为正，drawLetterTrail 会真正
  // 执行绘制（不会因 length<1 或 trailAlpha<=0.004 提前 return）。
  env.setNow(1250);
  env.runFrame(1250);

  var rec = env.stageCtx._rec;
  // 旧版实现是 moveTo + 3 次 lineTo（矩形 4 个顶点）；002 卡重写为锥形多段拖尾，lineTo 调用数
  // 应明显更多——用 "> 3" 而不是硬编码具体分段数，避免与 app.js 内部实现细节（分段数）过耦合，
  // 只锁定"不再是扁平矩形"这一可观察事实。
  assert.ok(rec.lineToCalls.length > 3, '拖尾路径的 lineTo 调用数应多于旧版矩形的 3 次，实际=' + rec.lineToCalls.length);

  // 拖尾锥形本体是本帧唯一一次 ctx.fill() 调用（无指针尾迹/点击圆环——那些同样用 arc+fill 画
  // 圆点/圆环，但本用例未触发；星点走 ctx.drawImage，不调用 ctx.fill()），fillStyle 应是 081
  // 六色调色板之一（letter.color，见 letter-motion.js TOKENS.letters.palette）。
  var PALETTE_HEXES = ['#ffd84c', '#3ce7ff', '#ff675a', '#9cff38', '#ff77b8', '#82a8ff'];
  assert.equal(rec.fillCalls.length, 1, '本帧应恰好一次 ctx.fill()（拖尾锥形本体），实际=' + rec.fillCalls.length);
  assert.ok(
    PALETTE_HEXES.indexOf(rec.fillCalls[0].fillStyle) !== -1,
    'fill() 时的 fillStyle 应是 081 字母调色板颜色之一（letter.color），实际=' + rec.fillCalls[0].fillStyle
  );
  assert.ok(
    rec.fillCalls[0].globalAlpha > 0 && rec.fillCalls[0].globalAlpha <= 0.42 + 1e-6,
    'fill() 时的 globalAlpha 应是 computeLetterFrame() 算出的 trailAlpha（081 上限 0.42），实际=' + rec.fillCalls[0].globalAlpha
  );
});

test('WTJ-20260705-002：拖尾星点通过共享的 window.WTJ_SPARKLES.drawSparkles() 用 ctx.drawImage() 画出', function () {
  var env = makeSandbox({ innerWidth: 1920, innerHeight: 1080 });
  env.setNow(0);
  env.runFrame(0);

  env.setNow(1000);
  env.fireKeydown('a');

  env.setNow(1250); // 同上一条用例，越过 settle，仍在 drift 阶段，trailAlpha>0
  env.runFrame(1250);

  var rec = env.stageCtx._rec;
  assert.ok(rec.drawImageCalls.length > 0, '应至少绘制一个拖尾星点（ctx.drawImage 调用），实际=' + rec.drawImageCalls.length);
});

test('WTJ-20260705-002：onSymbol(char, intensity) 驱动 app.js 弹出一个更小号、无拖尾的 fillText/strokeText token', function () {
  var env = makeSandbox({ innerWidth: 1920, innerHeight: 1080 });
  env.setNow(0);
  env.runFrame(0);

  env.setNow(1000);
  env.fireKeydown(','); // 单个可打印非字母数字键 -> keyboard.js DUAL-EMIT 一份 onSymbol(',', intensity)

  env.setNow(1050); // age=50ms，远小于标点弹出寿命（明显短于字母最短寿命 800ms），仍应可见
  env.runFrame(1050);

  var rec = env.stageCtx._rec;
  var fillMatch = rec.fillTextCalls.filter(function (c) { return c.text === ','; });
  var strokeMatch = rec.strokeTextCalls.filter(function (c) { return c.text === ','; });
  assert.ok(fillMatch.length > 0, '应至少有一次 fillText(",") 调用');
  assert.ok(strokeMatch.length > 0, '应至少有一次 strokeText(",") 调用（复用 drawLetterGlyph 的深色描边下层）');

  var size = null;
  var m = fillMatch[0].font.match(/(\d+)px/);
  if (m) size = parseInt(m[1], 10);
  assert.ok(size !== null && size < 56, '标点弹出应明显小于字母尺寸下限 56px（081 desktopSizeRangePx[0]），实际=' + size);

  // 标点弹出无拖尾：本帧不应产生任何 lineTo 调用（drawLetterTrail 的锥形路径只服务于 letters，
  // symbolPops 走独立的 drawSymbolPops()，直接调用 drawLetterGlyph()，从不调用 drawLetterTrail）。
  assert.equal(rec.lineToCalls.length, 0, '标点弹出不应画拖尾（无 lineTo 调用），实际=' + rec.lineToCalls.length);
});

test('WTJ-20260705-002：字母大小写 50/50 在实际渲染的 fillText 文本中可见', function () {
  var env = makeSandbox({ innerWidth: 1920, innerHeight: 1080 });
  env.setNow(0);
  env.runFrame(0);

  var i;
  for (i = 0; i < 60; i++) {
    env.setNow(1000 + i * 5);
    env.fireKeydown(i % 2 === 0 ? 'a' : 's'); // 交替按键，避免同键连打 >3 暂停规则拦截
  }

  // letters 数组上限 40：此刻只剩最后 40 个（born 在 1100~1295 之间），age 均在 15~210ms，
  // 早已越过 pop/settle（190ms 内），必然存活且 opacity>0（life 最短 800ms）。
  env.setNow(1310);
  env.runFrame(1310);

  var aTexts = env.stageCtx._rec.fillTextCalls
    .map(function (c) { return c.text; })
    .filter(function (t) { return t === 'A' || t === 'a'; });

  assert.ok(aTexts.indexOf('A') !== -1, '应能观察到至少一次大写 "A" 渲染，实际=' + JSON.stringify(aTexts));
  assert.ok(aTexts.indexOf('a') !== -1, '应能观察到至少一次小写 "a" 渲染（证明大小写替换在渲染层可见），实际=' + JSON.stringify(aTexts));
});

test('WTJ-20260705-002：数字 60/40 展示替换在实际渲染的 fillText 文本中可见（原数字与 US-shift 符号都会出现）', function () {
  var env = makeSandbox({ innerWidth: 1920, innerHeight: 1080 });
  env.setNow(0);
  env.runFrame(0);

  var digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  var i;
  for (i = 0; i < 80; i++) {
    env.setNow(1000 + i * 5);
    env.fireKeydown(digits[i % digits.length]); // 循环遍历不同数字，避免同键连打暂停规则
  }

  env.setNow(1000 + 80 * 5 + 20);
  env.runFrame(1000 + 80 * 5 + 20);

  // DIGIT_SHIFT_MAP 精确性本身已在 letter-motion.test.mjs 独立断言；这里只关心"渲染层确实
  // 能同时看到两种展示形态"，不重复抄一遍映射断言。
  var shiftMap = { '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '^', '7': '&', '8': '*', '9': '(', '0': ')' };
  var texts = env.stageCtx._rec.fillTextCalls.map(function (c) { return c.text; });

  var sawDigitForm = false;
  var sawSymbolForm = false;
  Object.keys(shiftMap).forEach(function (d) {
    if (texts.indexOf(d) !== -1) sawDigitForm = true;
    if (texts.indexOf(shiftMap[d]) !== -1) sawSymbolForm = true;
  });

  assert.ok(sawDigitForm, '应观察到至少一个数字原样渲染，实际 texts=' + JSON.stringify(texts));
  assert.ok(sawSymbolForm, '应观察到至少一个 US-shift 符号渲染（证明 60/40 替换在渲染层可见），实际 texts=' + JSON.stringify(texts));
});

test('app.js：drawLetterTrail 调用点存在一个单行开关（ENABLE_LETTER_TRAIL），可整体降级为"只保留干净弹出"', function () {
  assert.match(APP_SRC, /ENABLE_LETTER_TRAIL\s*=\s*true/, 'app.js 应存在 ENABLE_LETTER_TRAIL 单行开关常量');
  assert.match(APP_SRC, /ENABLE_LETTER_TRAIL\s*&&\s*frame\.trailAlpha\s*>\s*0/, 'drawLetters() 里调用 drawLetterTrail 的地方应受 ENABLE_LETTER_TRAIL 开关控制');
});

// --- 2. header CSS 静态断言：081 token 落进 hud.css --------------------------------------------

test('hud.css：.wtj-hud-topbar 高度为 081 token 的 44px（取代 007 占位值 34px）', function () {
  assert.match(HUD_CSS_SRC, /\.wtj-hud-topbar\s*{[^}]*height:\s*44px/, 'topbar 高度应为 44px');
});

test('hud.css：.wtj-hud-title 字号 15px / 字重 800（081 token titleFontPx/titleWeight）', function () {
  var m = HUD_CSS_SRC.match(/\.wtj-hud-title\s*{([^}]*)}/);
  assert.ok(m, '应存在 .wtj-hud-title 规则');
  assert.match(m[1], /font-size:\s*15px/, '标题字号应为 15px');
  assert.match(m[1], /font-weight:\s*800/, '标题字重应为 800');
});

test('hud.css：.wtj-hud-lock-icon 尺寸 13px、.wtj-hud-lock opacity 0.36（081 token，071 已落地不变）', function () {
  var iconRule = HUD_CSS_SRC.match(/\.wtj-hud-lock-icon\s*{([^}]*)}/);
  assert.ok(iconRule, '应存在 .wtj-hud-lock-icon 规则');
  assert.match(iconRule[1], /width:\s*13px/);
  assert.match(iconRule[1], /height:\s*13px/);

  var lockRule = HUD_CSS_SRC.match(/\.wtj-hud-lock\s*{([^}]*)}/);
  assert.ok(lockRule, '应存在 .wtj-hud-lock 规则');
  assert.match(lockRule[1], /opacity:\s*0\.36/);
});

test('hud.css：矮屏（max-height:700px）下 topbar 降级到 081 token 的 minHeightPx 38px', function () {
  assert.match(HUD_CSS_SRC, /@media\s*\(max-height:\s*700px\)\s*{\s*\.wtj-hud-topbar\s*{[^}]*height:\s*38px/);
});
