// WTJ-20260704-056 — frame-anim.js 单元测试（durable QA asset）
//
// 用 Node 内置 vm 模块搭一个沙箱 context，按 index.html 的真实加载顺序在同一 sandbox 里先加载
// 真实的 app/web/anim-manifest.js（构建产物，window.WTJ_ANIM_MANIFEST = deepFreeze(...)）与
// app/web/manifest.js（window.WTJ_MANIFEST，本文件只用它的 performance.idleStopSec=5），
// 再加载真实的 app/web/frame-anim.js（读取前两者、挂 window.WTJ_FRAME_ANIM）——与
// reward-chest.test.mjs/task-templates.test.mjs 同一手法：断言直接取自真实 anim-manifest
// 数值（faucet.running 的 frameCount=6/fps=10、lamp.turning-on 的 frameCount=6/fps=12 等），
// 消除"手工镜像 manifest 数值"的漂移风险。
//
// frame-anim.js 不触碰 document（canvas 元素由调用方创建后传入），本文件的沙箱因此不需要
// document stub，只需要：
//   - window.Image 的替身（frame-anim.js 内部裸写 `new Image()`，vm 沙箱按普通脚本执行，
//     裸标识符在这个 context 的全局对象上查找，因此 Image 构造函数必须直接挂在 sandbox
//     顶层，与 window.Image 指向同一个引用——两者都要设置）。
//   - window.matchMedia 的替身（prefers-reduced-motion 检测）。
//   - window.addEventListener 的替身（idle-stop 用它监听 pointermove/keydown 等全局活动
//     信号，本文件提供 fireWindowEvent() 供测试手动模拟"用户有新动作"）。
//   - 一个可记录 drawImage/clearRect 调用的假 Canvas2D context + 极简 canvas 元素替身。
//
// 精确时钟控制（与其余引擎测试的 makeFakeClock() 不同）：frame-anim.js 的 tick 循环用固定
// TICK_MS=16 节拍采样，但帧号本身由"当前时间 - 播放起点"的绝对差值算出（seek-safe，见
// frame-anim.js 文件头「计时驱动方式」一节）——若用与其余测试同款的"按 ms 累加、自动依次触发
// 所有到期定时器"的假时钟，很难精确落在"t=500ms 这一确切时刻"这种断言上（16ms 网格不一定
// 整除目标时刻）。本文件改用一个更底层的受控时钟 makeControlledClock()：setTimeout 只是把
// 回调入队，不自动触发；测试用 fireAt(t) 显式把"当前时间"设为 t 后手动触发**最早入队的一个
// 定时器**（不关心其注册时传入的 ms 参数），直接验证"tick 触发时 now() 返回什么，算出的帧号
// 就该是什么"——这正是"seek-safe"这个设计承诺的字面含义：帧号只取决于绝对时间差，与被
// tick 了多少次、tick 节拍是否精确对齐无关。
//
// 每个测试各自调用 createSandbox() 创建全新沙箱（全新 imageCache/playbacks 等模块级状态），
// 不共享任何跨测试状态，测试顺序无关。
//
// Run:  node --test tests/unit/frame-anim.test.mjs
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
var ANIM_MANIFEST_JS_PATH = path.resolve(__dirname, '../../app/web/anim-manifest.js');
var MANIFEST_JS_PATH = path.resolve(__dirname, '../../app/web/manifest.js');
var FRAME_ANIM_JS_PATH = path.resolve(__dirname, '../../app/web/frame-anim.js');
var ANIM_MANIFEST_SRC = readFileSync(ANIM_MANIFEST_JS_PATH, 'utf8');
var MANIFEST_SRC = readFileSync(MANIFEST_JS_PATH, 'utf8');
var FRAME_ANIM_SRC = readFileSync(FRAME_ANIM_JS_PATH, 'utf8');

// --- 受控时钟（见文件头说明）-----------------------------------------------------------------
function makeControlledClock() {
  var virtualNow = 0;
  var timers = []; // { id, fn, cancelled }
  var nextId = 1;

  function fakeSetTimeout(fn, ms) {
    var id = nextId++;
    timers.push({ id: id, fn: fn, cancelled: false });
    return id;
  }

  function fakeClearTimeout(id) {
    var i;
    for (i = 0; i < timers.length; i++) {
      if (timers[i].id === id) {
        timers[i].cancelled = true;
      }
    }
  }

  function fakeNow() {
    return virtualNow;
  }

  // 把"当前时间"设为 t，并触发最早入队且未取消的一个定时器（FIFO，忽略其注册时的 ms 参数）。
  // 返回 true 表示确实触发了一个；false 表示没有任何待触发定时器。
  function fireAt(t) {
    virtualNow = t;
    var i;
    for (i = 0; i < timers.length; i++) {
      if (!timers[i].cancelled) {
        var entry = timers[i];
        timers.splice(i, 1);
        entry.fn();
        return true;
      }
    }
    return false;
  }

  function pendingCount() {
    var n = 0;
    var i;
    for (i = 0; i < timers.length; i++) {
      if (!timers[i].cancelled) {
        n++;
      }
    }
    return n;
  }

  function setNow(t) {
    virtualNow = t;
  }

  return {
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    now: fakeNow,
    fireAt: fireAt,
    pendingCount: pendingCount,
    setNow: setNow
  };
}

// --- 假 Canvas2D context + 极简 canvas 元素替身 -----------------------------------------------
function makeFakeCtx2D() {
  var drawImageCalls = [];
  var clearRectCallCount = 0;
  return {
    drawImageCalls: drawImageCalls,
    clearRectCallCount: function () { return clearRectCallCount; },
    clearRect: function () { clearRectCallCount++; },
    drawImage: function (img, sx, sy, sw, sh, dx, dy, dw, dh) {
      drawImageCalls.push({ img: img, sx: sx, sy: sy, sw: sw, sh: sh, dx: dx, dy: dy, dw: dw, dh: dh });
    },
    lastDrawImage: function () {
      return drawImageCalls.length ? drawImageCalls[drawImageCalls.length - 1] : null;
    }
  };
}

function makeCanvas() {
  var ctx2d = makeFakeCtx2D();
  var el = {
    tagName: 'canvas',
    width: 0,
    height: 0,
    ctx2d: ctx2d,
    getContext: function (type) {
      return type === '2d' ? ctx2d : null;
    }
  };
  return el;
}

// --- 可手动控制就绪状态的假 Image ---------------------------------------------------------
// decode() 返回一个"故意不 resolve/reject"的假 thenable：真实 Safari 11.1+ 的 decode() 是
// Promise，本文件不依赖它的微任务时序来判定就绪（同步测试函数体内微任务不会被冲刷），就绪状态
// 完全靠 markReady() 直接设置 complete/naturalWidth 并调用 onload——与 frame-anim.js
// isEntryReady() 的同步兜底判据（`img.complete && img.naturalWidth > 0`）对齐。
function makeImageEnv() {
  var created = [];

  function FakeImage() {
    this.src = '';
    this.complete = false;
    this.naturalWidth = 0;
    this.onload = null;
    this.onerror = null;
    this.decode = function () {
      return { then: function () { /* 故意不 resolve/reject，见上方文件级说明 */ } };
    };
    created.push(this);
  }

  return {
    ctor: FakeImage,
    created: created,
    lastCreated: function () {
      return created.length ? created[created.length - 1] : null;
    },
    markReady: function (img) {
      img.complete = true;
      img.naturalWidth = 999;
      if (typeof img.onload === 'function') {
        img.onload();
      }
    },
    // WTJ-20260705-014 新增：模拟 img.onerror（sheet 加载失败，entry.failed=true），用于
    // 断言"确认加载失败后应放弃重试，不无限空转 tick"这条防御式收敛路径。
    markFailed: function (img) {
      if (typeof img.onerror === 'function') {
        img.onerror();
      }
    }
  };
}

// --- matchMedia 替身（与 reward-chest.test.mjs 同款实现）-------------------------------------
function makeMatchMediaStub(initialReduced) {
  var reduced = !!initialReduced;
  return {
    fn: function (query) {
      return { matches: reduced, media: query };
    },
    setReduced: function (value) { reduced = !!value; }
  };
}

// WTJ-20260706-013：真实 manifest.js 默认 performance.honorReducedMotion=false（kiosk 默认无视
// OS 减弱动态，prefersReducedMotion() 恒 false），要测"honorReducedMotion=true 时委托
// matchMedia"这条路径，需要在加载完真实 manifest.js 之后把 window.WTJ_MANIFEST 换成一份浅拷贝
// （覆盖 performance.honorReducedMotion 字段，其余字段原样保留）——frame-anim.js 的
// prefersReducedMotion() 每次调用都动态读 window.WTJ_MANIFEST（不是加载时缓存的引用），因此在
// 模块加载完之后再替换这个引用是安全的。
function applyHonorReducedMotion(fakeWindow, value) {
  var orig = fakeWindow.WTJ_MANIFEST || {};
  var origPerf = orig.performance || {};
  var perf = {};
  var k;
  for (k in origPerf) {
    if (Object.prototype.hasOwnProperty.call(origPerf, k)) { perf[k] = origPerf[k]; }
  }
  perf.honorReducedMotion = value;
  var patched = {};
  for (k in orig) {
    if (Object.prototype.hasOwnProperty.call(orig, k)) { patched[k] = orig[k]; }
  }
  patched.performance = perf;
  fakeWindow.WTJ_MANIFEST = patched;
}

// --- sandbox builder ---------------------------------------------------------------------
// opts.reducedMotion: true 时 matchMedia('(prefers-reduced-motion: reduce)').matches 恒为 true。
// opts.includeAnimManifest / includeManifest: false 时不加载对应真实源码（模拟未加载场景）。
// opts.honorReducedMotion: boolean 时覆盖 window.WTJ_MANIFEST.performance.honorReducedMotion
// （WTJ-20260706-013 kiosk 默认无视 OS 偏好开关，见 applyHonorReducedMotion()）。
function createSandbox(opts) {
  opts = opts || {};
  var warnCalls = [];
  var errorCalls = [];

  var imgEnv = makeImageEnv();
  var matchMediaStub = makeMatchMediaStub(opts.reducedMotion);
  var eventHandlers = {};

  var fakeWindow = {
    matchMedia: matchMediaStub.fn,
    addEventListener: function (type, fn) {
      if (!eventHandlers[type]) {
        eventHandlers[type] = [];
      }
      eventHandlers[type].push(fn);
    }
  };

  var sandbox = {
    window: fakeWindow,
    // frame-anim.js 内部裸写 `new Image()`（不是 `new window.Image()`），vm 沙箱按普通脚本
    // 执行时裸标识符在 context 顶层查找，因此 Image 构造函数必须直接挂在 sandbox 顶层。
    Image: imgEnv.ctor,
    console: {
      log: function () {},
      warn: function () { warnCalls.push(Array.prototype.slice.call(arguments).join(' ')); },
      error: function () { errorCalls.push(Array.prototype.slice.call(arguments).join(' ')); }
    }
  };
  vm.createContext(sandbox);

  if (opts.includeAnimManifest !== false) {
    vm.runInContext(ANIM_MANIFEST_SRC, sandbox, { filename: 'anim-manifest.js' });
  }
  if (opts.includeManifest !== false) {
    vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  }
  if (typeof opts.honorReducedMotion === 'boolean') {
    applyHonorReducedMotion(fakeWindow, opts.honorReducedMotion);
  }
  vm.runInContext(FRAME_ANIM_SRC, sandbox, { filename: 'frame-anim.js' });

  var clock = makeControlledClock();
  if (fakeWindow.WTJ_FRAME_ANIM && typeof fakeWindow.WTJ_FRAME_ANIM._setClock === 'function') {
    fakeWindow.WTJ_FRAME_ANIM._setClock({ setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, now: clock.now });
  }

  return {
    contextObject: sandbox,
    window: fakeWindow,
    FA: fakeWindow.WTJ_FRAME_ANIM,
    imgEnv: imgEnv,
    matchMediaStub: matchMediaStub,
    clock: clock,
    fireWindowEvent: function (type) {
      var list = eventHandlers[type] || [];
      list.forEach(function (fn) { fn(); });
    },
    warnCalls: warnCalls,
    errorCalls: errorCalls
  };
}

function anyContains(list, substr) {
  return list.some(function (s) { return s.indexOf(substr) !== -1; });
}

// =============================================================================================
// 1. 加载 + API 冻结守卫 + 重复引入守卫
// =============================================================================================

test('加载：window.WTJ_FRAME_ANIM 是 frozen 对象，方法齐全，绑定不可写/不可重配置', function () {
  var env = createSandbox();
  assert.ok(env.FA, 'window.WTJ_FRAME_ANIM 应该已挂载');
  assert.equal(Object.isFrozen(env.FA), true);
  ['play', 'stop', 'preload', 'getDuration', 'getState', '_setClock'].forEach(function (name) {
    assert.equal(typeof env.FA[name], 'function', 'API 缺少方法: ' + name);
  });

  var before = env.FA.play;
  try { env.FA.play = null; } catch (e) { /* 严格模式抛错也算通过 */ }
  assert.equal(env.FA.play, before, 'frozen API 应拒绝方法重赋值');

  var desc = Object.getOwnPropertyDescriptor(env.window, 'WTJ_FRAME_ANIM');
  assert.equal(desc.writable, false, 'window.WTJ_FRAME_ANIM 绑定应不可写');
  assert.equal(desc.configurable, false, 'window.WTJ_FRAME_ANIM 绑定应不可重配置');
});

test('重复引入守卫：再次执行 frame-anim.js 源码是安全 no-op，window.WTJ_FRAME_ANIM 仍是实例 1，不会重复注册全局活动监听', function () {
  var env = createSandbox();
  var instance1 = env.window.WTJ_FRAME_ANIM;

  vm.runInContext(FRAME_ANIM_SRC, env.contextObject, { filename: 'frame-anim.js (dup)' });

  assert.equal(env.window.WTJ_FRAME_ANIM, instance1, '重复引入后应仍是第一个实例');
});

// =============================================================================================
// 2. 帧号 seek-safe（绝对时间推帧号，与 tick 了多少次无关）
// =============================================================================================

test('帧号 seek-safe：faucet.running（真实 anim-manifest fps=10, frameCount=6, loop=true），t=500ms 时应精确画第 5 帧', function () {
  var env = createSandbox();
  var canvas = makeCanvas();
  var played = env.FA.play(canvas, 'faucet', 'running');
  assert.equal(played, true);

  env.imgEnv.markReady(env.imgEnv.lastCreated());
  var fired = env.clock.fireAt(500);
  assert.equal(fired, true, '应该有一个待触发的 tick');

  var draw = canvas.ctx2d.lastDrawImage();
  assert.ok(draw, '应该发生过一次 drawImage');
  assert.equal(draw.sx, 5 * 256, 'floor(500ms/1000*10fps)=5，源矩形 x 偏移应为 5*cellSize(256)=1280');
  assert.equal(draw.sw, 256, '源矩形宽度应等于 cellSize');
  assert.equal(draw.sh, 256, '源矩形高度应等于 cellSize');
});

test('loop 取模回绕：faucet.running 在 t=650ms（floor(6.5)=6, 6%6=0）应回绕到第 0 帧', function () {
  var env = createSandbox();
  var canvas = makeCanvas();
  env.FA.play(canvas, 'faucet', 'running');
  env.imgEnv.markReady(env.imgEnv.lastCreated());

  env.clock.fireAt(650);

  var draw = canvas.ctx2d.lastDrawImage();
  assert.equal(draw.sx, 0, '取模回绕后应回到第 0 帧（sx=0）');
});

test('非 loop clamp 末帧 + onComplete 恰一次：lamp.turning-on（真实 anim-manifest fps=12, frameCount=6, loop=false），远超时长后应 clamp 在第 5 帧且只触发一次 onComplete，随后自然停止 tick（无残留定时器）', function () {
  var env = createSandbox();
  var canvas = makeCanvas();
  var completeCount = 0;
  env.FA.play(canvas, 'lamp', 'turning-on', { onComplete: function () { completeCount++; } });
  env.imgEnv.markReady(env.imgEnv.lastCreated());

  env.clock.fireAt(2000); // 远超 500ms（6/12*1000）时长

  var draw = canvas.ctx2d.lastDrawImage();
  assert.equal(draw.sx, 5 * 256, '非 loop 应 clamp 在最后一帧（frameCount-1=5）');
  assert.equal(completeCount, 1, 'onComplete 应恰好触发一次');
  assert.equal(env.clock.pendingCount(), 0, '到达末帧后不应再排下一次 tick（自然收敛，不会反复触发 onComplete）');

  var state = env.FA.getState();
  assert.equal(state.activePlaybacks.length, 1, '播放完成但未 stop() 时，getState() 仍应该看到这条 playback');
  assert.equal(state.activePlaybacks[0].completeFired, true);
  assert.equal(state.activePlaybacks[0].loop, false);
});

test('opts.loop 覆盖 anim-manifest 默认值：faucet.running 源数据 loop=true，传 {loop:false} 后应像一次性动画一样 clamp 在末帧并触发 onComplete', function () {
  var env = createSandbox();
  var canvas = makeCanvas();
  var completeCount = 0;
  env.FA.play(canvas, 'faucet', 'running', { loop: false, onComplete: function () { completeCount++; } });
  env.imgEnv.markReady(env.imgEnv.lastCreated());

  env.clock.fireAt(1000); // 远超 600ms（6/10*1000）时长

  var draw = canvas.ctx2d.lastDrawImage();
  assert.equal(draw.sx, 5 * 256, '强制 loop:false 后应 clamp 在最后一帧');
  assert.equal(completeCount, 1, '强制 loop:false 后应触发 onComplete（源数据 loop:true 时永不触发）');
  assert.equal(env.clock.pendingCount(), 0);
});

// =============================================================================================
// 3. prefers-reduced-motion：loop 停第 0 帧，one-shot 停末帧，timing/onComplete 仍执行
// =============================================================================================

test('reduced-motion + loop（horse.idle）：只画第 0 帧一次，不进入 tick 循环，最终无残留定时器', function () {
  // WTJ-20260706-013：kiosk 默认 honorReducedMotion=false 时 prefersReducedMotion() 恒 false
  // （见下方新增的"默认无视 OS reduce-motion"正向用例）；这条用例要测的是 honorReducedMotion
  // 显式为 true（家长设置钩子）时仍应尊重 OS matchMedia 命中 reduce 的既有回归行为，因此显式
  // 传 honorReducedMotion:true。
  var env = createSandbox({ reducedMotion: true, honorReducedMotion: true });
  var canvas = makeCanvas();

  env.FA.play(canvas, 'horse', 'idle');
  // 图片这一刻尚未就绪：drawFrame() 内部静默跳过，reduced-motion 分支安排了一次轻量重试
  // （见 frame-anim.js runReducedMotionBranch()），不是常驻 tick 循环。
  assert.equal(canvas.ctx2d.drawImageCalls.length, 0, '未就绪时不应该发生 drawImage');
  assert.equal(env.clock.pendingCount(), 1, '未就绪时应该安排恰好一次重试重画');

  env.imgEnv.markReady(env.imgEnv.lastCreated());
  env.clock.fireAt(16); // 触发这次重试

  var draw = canvas.ctx2d.lastDrawImage();
  assert.ok(draw, 'reduced-motion 下也应该画出一帧（不是完全空白）');
  assert.equal(draw.sx, 0, 'loop 动画在 reduced-motion 下应定格在第 0 帧（静息语义）');
  assert.equal(env.clock.pendingCount(), 0, '重试完成后不应该再有残留定时器（loop 不触发 onComplete，也不需要二次重试）');
});

test('reduced-motion + one-shot（lamp.turning-on）：立即画最后一帧，timing 仍按 getDuration() 正常触发 onComplete', function () {
  // WTJ-20260706-013：同上——本用例测的是 honorReducedMotion=true（家长设置钩子）时尊重 OS
  // matchMedia 的既有回归行为，因此显式打开 honorReducedMotion。
  var env = createSandbox({ reducedMotion: true, honorReducedMotion: true });
  var canvas = makeCanvas();
  var completeCount = 0;

  env.FA.play(canvas, 'lamp', 'turning-on', { onComplete: function () { completeCount++; } });
  env.imgEnv.markReady(env.imgEnv.lastCreated());
  // 就绪发生在 play() 调用之后：手动再触发一次画面刷新不是本引擎职责——engine 的
  // reduced-motion 分支在未就绪时会自己安排一次轻量重试，这里直接触发它验证"最终确实画出
  // 终帧"，不依赖 play() 调用瞬间图片就已经就绪。
  var firedRetry = env.clock.fireAt(16);
  assert.equal(firedRetry, true, '未就绪时 reduced-motion 分支应该安排一次重试重画');

  var draw = canvas.ctx2d.lastDrawImage();
  assert.equal(draw.sx, 5 * 256, 'one-shot 在 reduced-motion 下应定格在最后一帧（保留"看到成功"的产品意图）');
  assert.equal(completeCount, 0, 'onComplete 时机未到，不应提前触发');

  var fired = env.clock.fireAt(500); // getDuration('lamp','turning-on') = 500ms
  assert.equal(fired, true);
  assert.equal(completeCount, 1, '到达 getDuration() 对应的时间点，onComplete 应该照常触发一次');
});

// WTJ-20260706-013（本卡核心修复，正向断言）：manifest.performance.honorReducedMotion 缺省/
// false（真实 manifest.js 的默认值，本用例不传 opts.honorReducedMotion，走真实默认）时，即使
// OS matchMedia 命中 prefers-reduced-motion: reduce，prefersReducedMotion() 也应恒返回
// false——horse.idle 应像完全没有 reduced-motion 这回事一样正常推进帧号（不再"只画第 0 帧就
// 停住"），且 getState().activePlaybacks[].reducedMotion 这个 QA 复验字段应为 false（标志
// 消失），playback 应持续排队 tick（不是 reduced-motion 分支那种"重试一次画完就清空定时器"）。
test('reduced-motion 默认（honorReducedMotion 缺省/false）：无视 OS matchMedia reduce=true，horse.idle 正常推进帧号、reducedMotion 标志消失', function () {
  var env = createSandbox({ reducedMotion: true }); // 未传 honorReducedMotion -> 真实 manifest 默认 false
  var canvas = makeCanvas();

  env.FA.play(canvas, 'horse', 'idle');
  env.imgEnv.markReady(env.imgEnv.lastCreated());
  env.clock.fireAt(16); // 首次 tick：就绪后立即画出（起点仍是第 0 帧，这本身不代表"卡住"）。

  var draw0 = canvas.ctx2d.lastDrawImage();
  assert.equal(draw0.sx, 0, '起点仍是第 0 帧');
  assert.equal(
    env.FA.getState().activePlaybacks[0].reducedMotion,
    false,
    'QA 复验关键信号：即使 OS matchMedia 命中 reduce，playback 日志的 reducedMotion 字段也应为 false（标志消失）'
  );

  // 持续推进 tick，跨过第 1 帧的时间点（fps=6 -> 每帧约 166.67ms），验证帧号真的在推进——
  // 与上面 reduced-motion（honorReducedMotion:true）用例"永远停在第 0 帧"形成直接对照。
  var t = 16;
  var advanced = false;
  while (t <= 400 && !advanced) {
    t += 16;
    env.clock.fireAt(t);
    if (canvas.ctx2d.lastDrawImage().sx !== 0) {
      advanced = true;
    }
  }
  assert.ok(advanced, 'kiosk 默认无视 OS reduce-motion：horse.idle 应正常推进帧号，不应该永远停在第 0 帧');
  assert.ok(
    env.clock.pendingCount() > 0,
    '非 reduced-motion 的 loop 播放应持续排队下一次 tick（与 reduced-motion 分支"重试完就清零定时器"形成对照）'
  );
});

// =============================================================================================
// 4. 帧未就绪：play 不抛错，静默跳过绘制，就绪后恢复正常
// =============================================================================================

test('帧未就绪（多帧 state）：play() 与 tick 都不应抛错；未就绪时不 drawImage，就绪后下一次 tick 正常画出', function () {
  var env = createSandbox();
  var canvas = makeCanvas();

  assert.doesNotThrow(function () {
    env.FA.play(canvas, 'faucet', 'running');
  });
  assert.doesNotThrow(function () {
    env.clock.fireAt(16);
  });
  assert.equal(canvas.ctx2d.drawImageCalls.length, 0, '图片未就绪时不应该发生任何 drawImage 调用');

  env.imgEnv.markReady(env.imgEnv.lastCreated());
  assert.doesNotThrow(function () {
    env.clock.fireAt(32);
  });
  assert.equal(canvas.ctx2d.drawImageCalls.length, 1, '就绪后下一次 tick 应该正常画出一帧');
});

// =============================================================================================
// 5. 单帧素材快路径（性能优化：frameCount<=1 不建立常驻 tick 循环）
// =============================================================================================

test('单帧素材（faucet.off，frameCount=1）：图片已就绪时 play() 立即画一次，不建立常驻 tick，只有一个 onComplete 定时器（loop:false）', function () {
  var env = createSandbox();
  var canvas = makeCanvas();

  // 提前创建并标记就绪：本测试想验证"已就绪"这一支路径，先手动 new 一次触发缓存创建再标记。
  env.FA.preload('faucet', 'off');
  env.imgEnv.markReady(env.imgEnv.lastCreated());

  env.FA.play(canvas, 'faucet', 'off');

  var draw = canvas.ctx2d.lastDrawImage();
  assert.ok(draw, '单帧素材应该立即画一次');
  assert.equal(draw.sx, 0);
  assert.equal(env.clock.pendingCount(), 1, '已就绪时不需要重试定时器，但 loop:false 仍需要一个 onComplete 定时器');

  var fired = env.clock.fireAt(1000); // getDuration('faucet','off') = 1帧/1fps*1000 = 1000ms
  assert.equal(fired, true);
});

test('单帧素材（faucet.off）：图片尚未就绪时 play() 不立即画出内容，但会各自安排一次重试重画 + 一个 onComplete 定时器；就绪后重试补画成功', function () {
  var env = createSandbox();
  var canvas = makeCanvas();

  env.FA.play(canvas, 'faucet', 'off');
  assert.equal(canvas.ctx2d.drawImageCalls.length, 0, '未就绪时不应该发生 drawImage');
  assert.equal(env.clock.pendingCount(), 2, '未就绪的单帧 loop:false 素材应该有两个独立定时器：重试重画 + onComplete');

  env.imgEnv.markReady(env.imgEnv.lastCreated());
  env.clock.fireAt(16); // 触发重试重画（FIFO 顺序：重试定时器先于 onComplete 定时器注册）

  assert.equal(canvas.ctx2d.drawImageCalls.length, 1, '就绪后重试应该成功画出第 0 帧');
  assert.equal(canvas.ctx2d.lastDrawImage().sx, 0);
});

// =============================================================================================
// 6. getDuration()：精确数值核对（来自真实 anim-manifest.js）+ 缺失防御式返回 0
// =============================================================================================

test('getDuration()：精确匹配 anim-manifest.js 的 frameCount/fps（与 loop 是否为 true 无关）', function () {
  var env = createSandbox();
  assert.equal(env.FA.getDuration('lamp', 'turning-on'), 500, '6帧/12fps*1000=500ms');
  assert.equal(env.FA.getDuration('faucet', 'running'), 600, '6帧/10fps*1000=600ms（源数据 loop:true，getDuration 仍返回一个完整周期时长）');
  assert.equal(env.FA.getDuration('horse', 'stop_success'), 667, '6帧/9fps*1000=666.67，四舍五入到 667ms');
  assert.equal(env.FA.getDuration('faucet', 'off'), 1000, '单帧素材：1帧/1fps*1000=1000ms');
});

test('getDuration()：prop/state 缺失时防御式返回 0，不抛错', function () {
  var env = createSandbox();
  assert.equal(env.FA.getDuration('faucet', 'no-such-state'), 0);
  assert.equal(env.FA.getDuration('no-such-prop', 'x'), 0);
});

test('getDuration()：door/bell（WTJ-20260705-025 已接入）返回真实时长', function () {
  var env = createSandbox();
  // door.opening: 5 帧 / 10fps * 1000 = 500ms；bell.ring: 6 帧 / 14fps * 1000 = 428.57 → 429ms。
  assert.equal(env.FA.getDuration('door', 'opening'), 500, 'door.opening 5帧/10fps=500ms');
  assert.equal(env.FA.getDuration('bell', 'ring'), 429, 'bell.ring 6帧/14fps=428.57→429ms');
});

// =============================================================================================
// 7. idle-stop：loop 动画在无全局活动 idleStopSec 秒后暂停 tick，新活动后恢复
// =============================================================================================

test('idle-stop：loop 动画（horse.idle）在无活动达到真实 manifest.performance.idleStopSec(=5)秒后暂停 tick；模拟一次全局 pointermove 活动后应立即恢复', function () {
  var env = createSandbox();
  var canvas = makeCanvas();
  env.FA.play(canvas, 'horse', 'idle'); // play() 本身也算一次活动，起点 lastActivityAt=0
  env.imgEnv.markReady(env.imgEnv.lastCreated());

  env.clock.fireAt(100);
  assert.equal(env.clock.pendingCount(), 1, '100ms（远小于 5000ms 阈值）时应该正常继续排 tick');
  assert.equal(env.FA.getState().activePlaybacks[0].idlePaused, false);

  env.clock.fireAt(5000); // 距离上次活动（t=0）整 5000ms，达到 idleStopSec 阈值
  assert.equal(env.clock.pendingCount(), 0, '达到 idle 阈值后应该暂停排 tick（不再消耗 CPU）');
  assert.equal(env.FA.getState().activePlaybacks[0].idlePaused, true);

  env.fireWindowEvent('pointermove'); // 模拟真实用户活动（app.js 场景下的 mousemove 等价物）
  assert.equal(env.FA.getState().activePlaybacks[0].idlePaused, false, '新活动应立即解除暂停');
  assert.equal(env.clock.pendingCount(), 1, '恢复后应该重新排上一次 tick');

  env.clock.fireAt(5016);
  assert.equal(env.clock.pendingCount(), 1, '恢复后应该继续正常排 tick（未再次触发 idle 判定）');
});

test('idle-stop：非 loop（一次性）动画不受 idle-stop 影响——本身时长有限，播完自然收敛', function () {
  var env = createSandbox();
  var canvas = makeCanvas();
  env.FA.play(canvas, 'lamp', 'turning-on');
  env.imgEnv.markReady(env.imgEnv.lastCreated());

  // 一次性动画的时长（500ms）远小于 idleStopSec 阈值（5000ms），正常播完即收敛，不会触发
  // idle-stop 分支（该分支的 `if (pb.loop && isGloballyIdle(now))` 对 loop:false 恒为 false）。
  env.clock.fireAt(2000);
  assert.equal(env.clock.pendingCount(), 0, '一次性动画播完后应自然收敛，不是因为 idle-stop 暂停');
  assert.equal(env.FA.getState().activePlaybacks[0].idlePaused, false, '一次性动画不应该被标记为 idlePaused');
});

// =============================================================================================
// 8. stop()：清 tick（无条件下限）
// =============================================================================================

test('stop()：多帧播放调用后应立即清掉其 tick 定时器，不再发生任何 drawImage', function () {
  var env = createSandbox();
  var canvas = makeCanvas();
  env.FA.play(canvas, 'lamp', 'turning-on');
  assert.equal(env.clock.pendingCount(), 1);

  env.FA.stop(canvas);

  assert.equal(env.clock.pendingCount(), 0, 'stop() 应该清掉这个 canvas 的 tick 定时器');
  assert.equal(env.FA.getState().activePlaybacks.length, 0, 'stop() 后应该从注册表里移除');
});

test('stop()：即使某个定时器未被显式追踪取消（单帧素材内部的 onComplete 定时器），触发它也不会调用 onComplete（isActivePlayback 兜底守卫）', function () {
  var env = createSandbox();
  var canvas = makeCanvas();
  var completeCount = 0;
  env.FA.preload('faucet', 'off');
  env.imgEnv.markReady(env.imgEnv.lastCreated());
  env.FA.play(canvas, 'faucet', 'off', { onComplete: function () { completeCount++; } });

  env.FA.stop(canvas);
  // 单帧+已就绪路径下，onComplete 定时器没有被记录进 pb.tickTimerId（stop() 因此清不掉它），
  // 但它触发时会检查 isActivePlayback(pb)——canvas 已经被 stop() 移出注册表，回调应为 no-op。
  var fired = env.clock.fireAt(1000);
  assert.equal(fired, true, '这个未被追踪的定时器仍然存在于时钟队列里');
  assert.equal(completeCount, 0, 'stop() 之后即使这个定时器被触发，onComplete 也不应该被调用');
});

test('对未播放/不存在的 canvas 调用 stop() 是安全的 no-op', function () {
  var env = createSandbox();
  var canvas = makeCanvas();
  assert.doesNotThrow(function () {
    env.FA.stop(canvas);
    env.FA.stop(null);
    env.FA.stop(undefined);
  });
});

// =============================================================================================
// 9. 防御式：anim-manifest 缺失 / canvas 缺失 / door-bell 已接入（025）
// =============================================================================================

test('防御式：window.WTJ_ANIM_MANIFEST 整体缺失时，play()/preload()/getDuration() 全部优雅降级，不抛错', function () {
  var env = createSandbox({ includeAnimManifest: false });
  var canvas = makeCanvas();

  var playResult;
  assert.doesNotThrow(function () {
    playResult = env.FA.play(canvas, 'faucet', 'off');
  });
  assert.equal(playResult, false);
  assert.equal(env.FA.preload('faucet', 'off'), false);
  assert.equal(env.FA.getDuration('faucet', 'off'), 0);
  assert.equal(env.FA.getState().availableProps.length, 0);
});

test('防御式：canvasEl 缺失/不是 canvas 时 play() 返回 false，不抛错', function () {
  var env = createSandbox();
  assert.doesNotThrow(function () {
    assert.equal(env.FA.play(null, 'faucet', 'off'), false);
    assert.equal(env.FA.play(undefined, 'faucet', 'off'), false);
    assert.equal(env.FA.play({}, 'faucet', 'off'), false, '没有 getContext 方法的对象不应该被当作 canvas');
  });
});

test('door/bell（WTJ-20260705-025 已接入 v1_boundary.included）：play() 成功、无 deferred 警告、deferredProps 为空', function () {
  var env = createSandbox();
  var canvas = makeCanvas();

  // door/bell 的 v1 动画（卡 -030/-031 已 DESIGN 验收）已移入 included 并降采进 anim-manifest.js，
  // play() 现应成功启动播放（返回 truthy），而不再是 deferred 回退。
  assert.ok(env.FA.play(canvas, 'door', 'opening'), 'door.opening 已接入，play() 应成功');
  var canvas2 = makeCanvas();
  assert.ok(env.FA.play(canvas2, 'bell', 'ring'), 'bell.ring 已接入，play() 应成功');
  assert.ok(!anyContains(env.warnCalls, 'deferred_to_v2'), 'door/bell 已接入，不应再出现 deferred_to_v2 警告');

  var state = env.FA.getState();
  assert.equal(state.deferredProps.length, 0, '当前无任何 deferred prop，deferredProps 应为空');
  assert.ok(state.availableProps.indexOf('door') !== -1 && state.availableProps.indexOf('bell') !== -1,
    'door/bell 应出现在 availableProps 里');
});

// =============================================================================================
// 10. preload() 与 play() 共享同一份 Image 缓存
// =============================================================================================

test('preload()：prop/state 存在时返回 true 并预热 Image；与 play() 共享同一份缓存，不会为同一个 sheetPath 重复 new Image()', function () {
  var env = createSandbox();
  assert.equal(env.FA.preload('faucet', 'running'), true);
  assert.equal(env.imgEnv.created.length, 1, 'preload() 应该创建了一个 Image 实例');

  var canvas = makeCanvas();
  env.FA.play(canvas, 'faucet', 'running');
  assert.equal(env.imgEnv.created.length, 1, 'play() 应该复用 preload() 已经创建的同一个 Image 实例，不重复 new');

  assert.equal(env.FA.preload('door', 'opening'), true, 'door 已接入引擎（025），preload() 应返回 true');
  assert.equal(env.FA.preload('no-such-prop', 'x'), false, '真正未知的 prop 才防御式返回 false');
});

// =============================================================================================
// 11. getState()：字段核对
// =============================================================================================

test('getState()：availableProps/deferredProps/idleStopSec/activePlaybacks 字段核对', function () {
  var env = createSandbox();
  var state = env.FA.getState();
  assert.equal(state.availableProps.slice().sort().join(','), ['bell', 'door', 'faucet', 'horse', 'lamp', 'treasure-chest'].sort().join(','));
  assert.equal(state.deferredProps.length, 0, 'WTJ-20260705-025 起 door/bell 已接入，无 deferred prop');
  assert.equal(state.idleStopSec, 5, '真实 manifest.performance.idleStopSec 应为 5');
  assert.equal(state.activePlaybacks.length, 0);

  var canvas = makeCanvas();
  env.FA.play(canvas, 'horse', 'run', { loop: true });
  state = env.FA.getState();
  assert.equal(state.activePlaybacks.length, 1);
  assert.equal(state.activePlaybacks[0].prop, 'horse');
  assert.equal(state.activePlaybacks[0].state, 'run');
  assert.equal(state.activePlaybacks[0].loop, true);
  assert.equal(state.activePlaybacks[0].hasDrawnOnce, false, '图片尚未标记就绪，不应该已经画出过');
});

// =============================================================================================
// 12. WTJ-20260705-014 根因修复（P0）：目标不可见 bug —— 首帧未画出前绝不放弃/暂停重试
// -----------------------------------------------------------------------------------------------
// 真机复现（justin.local）：click-faucet-on / click-horse-run 任务的目标道具整场不可见。
// 用 Playwright + WebKit 人工注入加载延迟复现出两条独立路径：
//   ① 单帧 idle 态（faucet.off / lamp.off，frameCount<=1）：图片加载耗时超过一次 TICK_MS
//      时，旧实现只重试一次就永久放弃，canvas 永久透明。
//   ② 多帧循环 idle 态（horse.idle）：图片加载耗时超过 idleStopSec 且期间无鼠标/键盘活动时，
//      旧实现的 idle-stop 会在"从未画出过第一帧"时就暂停 tick，效果等价：永久透明，直到用户
//      终于移动鼠标才被 markActivity() 唤醒。
// 以下用例分别复现这两条路径在旧实现下会失败、在修复后应该通过的行为，外加"确认加载失败后
// 应放弃重试、不无限空转 tick"的防御式收敛路径。
// =============================================================================================

test('① 单帧素材（faucet.off）：图片连续多轮仍未就绪时应持续重试（不是只重试一次就放弃），任意一轮就绪后立即补画成功', function () {
  var env = createSandbox();
  var canvas = makeCanvas();

  // 显式传 {loop:true}：避免单独一个各自独立触发的 onComplete 定时器混进本文件受控时钟
  // 的 FIFO 触发队列（fireAt() 触发"最早注册的一个定时器"，不区分它逻辑上是重试定时器还是
  // onComplete 定时器，见文件头 makeControlledClock() 说明）——本用例只关心"持续重试直到
  // 画出"这一件事，loop:true 让 play() 不再额外排一个 onComplete 定时器，队列里自始至终只有
  // "当前这一轮重试"一个定时器，可以干净地逐轮验证。
  env.FA.play(canvas, 'faucet', 'off', { loop: true });
  assert.equal(canvas.ctx2d.drawImageCalls.length, 0, '未就绪时不应该发生 drawImage');
  assert.equal(env.clock.pendingCount(), 1, '未就绪时应该恰好安排一个重试定时器');

  // 连续三轮触发重试定时器，图片全程仍未就绪——旧实现（只重试一次就放弃）在第二轮就会永久
  // 停止重试，这里断言修复后每一轮都会重新排下一次重试，不会提前放弃。
  env.clock.fireAt(16);
  assert.equal(canvas.ctx2d.drawImageCalls.length, 0, '第 1 轮重试：仍未就绪，不应该画出内容');
  assert.equal(env.clock.pendingCount(), 1, '第 1 轮重试后应该继续排下一轮重试');

  env.clock.fireAt(32);
  assert.equal(canvas.ctx2d.drawImageCalls.length, 0, '第 2 轮重试：仍未就绪，不应该画出内容（旧实现在这里已经放弃了）');
  assert.equal(env.clock.pendingCount(), 1, '第 2 轮重试后仍应该继续排下一轮重试——这是本卡修复的核心断言');

  env.clock.fireAt(48);
  assert.equal(canvas.ctx2d.drawImageCalls.length, 0, '第 3 轮重试：仍未就绪');
  assert.equal(env.clock.pendingCount(), 1, '第 3 轮重试后仍应该继续排下一轮重试');

  // 图片终于就绪：下一轮重试应该立即补画成功，并且从此停止排新的重试（单帧素材画出后不需要
  // 再进 tick 循环，性能优化保留）。
  env.imgEnv.markReady(env.imgEnv.lastCreated());
  env.clock.fireAt(64);
  assert.equal(canvas.ctx2d.drawImageCalls.length, 1, '就绪后应该立即补画出第 0 帧');
  assert.equal(canvas.ctx2d.lastDrawImage().sx, 0);
  assert.equal(env.clock.pendingCount(), 0, '画出过一次后不应该再排任何定时器（loop:true 也没有 onComplete 定时器）');
  assert.equal(env.FA.getState().activePlaybacks[0].hasDrawnOnce, true);
});

test('② 多帧循环素材（horse.idle）：图片加载耗时超过 idleStopSec 且期间零活动时，idle-stop 不应该在首帧画出之前就暂停 tick；图片就绪后应该立即补画，之后才恢复正常 idle-stop 语义', function () {
  var env = createSandbox();
  var canvas = makeCanvas();
  env.FA.play(canvas, 'horse', 'idle'); // play() 本身也算一次活动，起点 lastActivityAt=0

  // 100ms：远小于 idleStopSec(5000ms) 阈值，正常继续排 tick（本就该如此）。
  env.clock.fireAt(100);
  assert.equal(canvas.ctx2d.drawImageCalls.length, 0, '图片仍未就绪，不应该画出内容');
  assert.equal(env.clock.pendingCount(), 1, '未就绪时应该继续排下一次 tick');
  assert.equal(env.FA.getState().activePlaybacks[0].idlePaused, false);

  // 5000ms：达到 idleStopSec 阈值，期间用户零活动（没有任何 pointermove/keydown）——旧实现
  // 会在这里把 idlePaused 设为 true 并停止排 tick，即使图片从未成功画出过一帧；这正是本卡
  // 复现出的 horse 目标"永久不可见"根因。修复后应该继续重试，不应该被判定为可以暂停。
  env.clock.fireAt(5000);
  assert.equal(canvas.ctx2d.drawImageCalls.length, 0, '此刻图片仍未就绪，仍不应该画出内容');
  assert.equal(env.clock.pendingCount(), 1, '即使已达到 idleStopSec 阈值，只要还没画出过第一帧就必须继续排 tick，不能被 idle-stop 暂停');
  assert.equal(env.FA.getState().activePlaybacks[0].idlePaused, false, '首帧未画出前不应该被标记为 idlePaused');

  // 图片终于就绪（比如真机上磁盘/解码终于跟上了）：下一次 tick 应该立即补画出第一帧——孩子
  // 终于能看到小马了，即使此刻全局早已经处于"无活动"状态。
  env.imgEnv.markReady(env.imgEnv.lastCreated());
  env.clock.fireAt(5016);
  assert.equal(canvas.ctx2d.drawImageCalls.length, 1, '就绪后应该立即补画出第一帧，不应该继续无限期空白');
  assert.equal(env.FA.getState().activePlaybacks[0].hasDrawnOnce, true);
  // 画出过第一帧之后，idle-stop 的原有语义才生效：由于全局仍处于无活动状态（此刻距上次真实
  // 活动已经超过阈值），紧接着这一帧就会被判定为 idle 并暂停——这是合理的（已经把小马展示给
  // 孩子看了，只是先不继续播放循环动作，等孩子一动鼠标马上恢复），不是本卡要修复的问题。
  assert.equal(env.FA.getState().activePlaybacks[0].idlePaused, true, '画出首帧之后才允许 idle-stop 生效');
  assert.equal(env.clock.pendingCount(), 0);

  // 验证"一动鼠标立刻恢复"这条既有的 idle-stop 唤醒语义在修复后依然成立。
  env.fireWindowEvent('pointermove');
  assert.equal(env.FA.getState().activePlaybacks[0].idlePaused, false, '新活动应该立即解除暂停');
  assert.equal(env.clock.pendingCount(), 1);
});

test('③ 确认加载失败（img.onerror）且从未画出过任何一帧：应该放弃重试（不无限空转 tick），单帧的 onComplete 定时器仍按原定时长独立触发，不受影响', function () {
  var env = createSandbox();
  var canvas = makeCanvas();
  var completeCount = 0;

  env.FA.play(canvas, 'faucet', 'off', { onComplete: function () { completeCount++; } });
  assert.equal(env.clock.pendingCount(), 2, '未就绪的单帧 loop:false 素材：重试重画 + onComplete 两个定时器');

  env.imgEnv.markFailed(env.imgEnv.lastCreated());
  env.clock.fireAt(16); // 触发重试：drawFrame 仍然是 no-op（isEntryReady 恒为 false），但这次
  // 应该发现 imgEntry.failed 已确认，从而放弃继续重试。
  assert.equal(canvas.ctx2d.drawImageCalls.length, 0, '确认加载失败：永远不会画出任何内容');
  assert.equal(env.clock.pendingCount(), 1, '确认失败后不应该再排新的重试定时器，只剩独立的 onComplete 定时器');
  assert.equal(env.FA.getState().activePlaybacks[0].hasDrawnOnce, false);

  // onComplete 定时器本身不依赖绘制是否成功（既有语义，见文件头 onComplete 时序说明），到期
  // 仍应该正常触发一次——本卡的修复不应该意外改变这一点。
  env.clock.fireAt(1000); // getDuration('faucet','off') = 1000ms
  assert.equal(completeCount, 1);
});

test('③b 确认加载失败（img.onerror）且从未画出过任何一帧的多帧循环素材（horse.idle）：应该放弃重试，不无限空转 tick', function () {
  var env = createSandbox();
  var canvas = makeCanvas();
  env.FA.play(canvas, 'horse', 'idle');
  assert.equal(env.clock.pendingCount(), 1);

  env.imgEnv.markFailed(env.imgEnv.lastCreated());
  env.clock.fireAt(16);
  assert.equal(canvas.ctx2d.drawImageCalls.length, 0);
  assert.equal(env.clock.pendingCount(), 0, '多帧循环素材确认加载失败后应该彻底停止排 tick，不会无限空转');
  assert.equal(env.FA.getState().activePlaybacks[0].hasDrawnOnce, false);
  assert.equal(env.FA.getState().activePlaybacks[0].idlePaused, false, '这不是 idle-stop 暂停，是确认失败后的彻底放弃，两者是不同的终止原因');
});
