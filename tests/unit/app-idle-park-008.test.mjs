// WTJ-20260707-008 — 主 rAF 空闲 park：单测覆盖 needsRender() + draw() 尾部 park/resume 决策
//
// 背景：app.js 自 004 卡起就有 lastActivity/IDLE_TIMEOUT_MS 那套"距上次原始输入事件超过
// idleStopSec（manifest 默认 5 秒）后完全停止 rAF"的机制，但原判据只看"原始输入事件多久前
// 发生过"，没有对"此刻画布上是否真的还有内容在变化"做显式核对。本卡新增 needsRender()
// （字母衰减/标点弹出/鼠标尾迹/点击圆环数组非空、window.WTJ_KEYVISUAL.getActiveCount()>0、
// window.WTJ_POINTER.getPointerState().dragging、window.WTJ_FRAME_ANIM.getState().
// activePlaybacks 里任一"未 idlePaused 且未 completeFired"），OR 进原有超时判定：
//   继续跑满帧 <=> (原始输入未超时) OR needsRender()
//   真正 park       <=> (原始输入已超时) AND !needsRender()
// 本文件验证：
//   1. 两者皆假时才真正 park（tickCount 停止增长），park 后新输入立即恢复（回归，行为不变）。
//   2. needsRender() 的四类信号（字母衰减 / 指针拖拽 / keyvisual 活动反馈 / frame-anim 活动
//      playback——covers 007 door/bell 等经 WTJ_FRAME_ANIM 播放的道具）任一为真时，即使原始
//      输入已超时，主循环也不会 park；信号转假后的下一帧立即可以 park。
//   3. window.WTJ_APP_DIAG 诊断 API 的形状 + tickCount 语义（旧机复验方法见文件尾说明）。
//
// 旧机复验方法（记录供 TL/QA 使用，非本文件自动化范围）：真机打开 app 后，在 Web Inspector
// console 里间隔调用两次 `window.WTJ_APP_DIAG.getState().tickCount` 并计算 delta——
// 完全空闲窗口 delta 应接近 0（park 生效），敲键/点击/任务动画窗口 delta 应接近
// "采样间隔 × 屏幕刷新率"（满帧恢复）。也可结合 window.WTJ_DIAG.getState()（017 心跳）里
// 的 activePlaybacks 快照交叉核对同一时刻 frame-anim 是否仍在播放。
//
// Run:  node --test tests/unit/app-idle-park-008.test.mjs

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

// --- 最小 canvas ctx / DOM stub（与 app-visual-086.test.mjs 同款手法，本文件不关心具体绘制
// 内容，只需要 app.js 能跑完整帧不抛错）------------------------------------------------------

function makeFakeGradient() {
  return { addColorStop: function () {} };
}

function makeOffscreenCanvasElement() {
  var octx = {
    createRadialGradient: function () { return makeFakeGradient(); },
    beginPath: function () {}, arc: function () {}, fill: function () {},
    save: function () {}, restore: function () {}, moveTo: function () {},
    lineTo: function () {}, stroke: function () {},
    fillStyle: null, strokeStyle: null, lineWidth: 1
  };
  return { width: 0, height: 0, getContext: function () { return octx; } };
}

function makeStageCtx() {
  var _font = '10px sans-serif';
  var _filter = 'none';
  var ctx = {
    setTransform: function () {}, clearRect: function () {}, fillRect: function () {},
    beginPath: function () {}, arc: function () {}, moveTo: function () {}, lineTo: function () {},
    closePath: function () {}, fill: function () {}, stroke: function () {},
    save: function () {}, restore: function () {}, translate: function () {}, rotate: function () {},
    fillText: function () {}, strokeText: function () {}, drawImage: function () {},
    measureText: function () { return { width: 10 }; },
    createLinearGradient: function () { return makeFakeGradient(); },
    createRadialGradient: function () { return makeFakeGradient(); },
    lineJoin: 'miter', lineWidth: 1, fillStyle: '#000', strokeStyle: '#000',
    globalAlpha: 1, textAlign: 'left', textBaseline: 'alphabetic'
  };
  Object.defineProperty(ctx, 'font', { get: function () { return _font; }, set: function (v) { _font = v; } });
  Object.defineProperty(ctx, 'filter', { get: function () { return _filter; }, set: function (v) { _filter = v; } });
  return ctx;
}

function makeFakeElement(tag) {
  return {
    tagName: tag, style: {}, textContent: '', width: 0, height: 0,
    classList: { add: function () {}, remove: function () {} },
    addEventListener: function () {}
  };
}

// 构造沙箱：真实 manifest.js/letter-motion.js/sparkles.js/keyboard.js/app.js（真实加载顺序）+
// 可选的 WTJ_POINTER/WTJ_KEYVISUAL/WTJ_FRAME_ANIM 最小 stub（app.js 只在启动时读一次
// window.WTJ_POINTER/WTJ_KEYVISUAL 是否可用——见 app.js 顶部「指针引擎订阅」「非字母键视觉
// 反馈引擎接入」两节——因此 stub 必须在 app.js 求值之前挂到 sandbox 上）。
// Date 被替换为可控 fake（原始输入超时判定 lastActivity/IDLE_TIMEOUT_MS 用的是 Date.now()，
// 与驱动字母衰减动画的 performance.now() 是两条独立时钟——app.js 全文件搜索确认只用
// Date.now()，不用 `new Date()`，替换成 { now: fn } 足够，不影响 keyboard.js/letter-motion.js/
// sparkles.js（均不触碰 Date）。
function makeSandbox(opts) {
  opts = opts || {};
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
  var fakeNow = 0;      // performance.now()：驱动字母/尾迹/圆环等衰减动画的时钟
  var fakeDateNow = 0;  // Date.now()：驱动 lastActivity/IDLE_TIMEOUT_MS 原始输入超时判定的时钟

  var pointerState = { dragging: false };
  var pointerStub = null;
  if (opts.withPointer) {
    pointerStub = {
      onMove: function () {}, onClickFeedback: function () {},
      onDragStart: function () {}, onDragMove: function () {}, onDrop: function () {},
      registerTarget: function () {}, unregisterTarget: function () {},
      getTrailIntensity: function () { return 0; }, getClickIntensity: function () { return 0; },
      getPointerState: function () { return pointerState; }
    };
  }

  var keyVisualState = { activeCount: 0 };
  var keyVisualStub = null;
  if (opts.withKeyVisual) {
    keyVisualStub = {
      draw: function () {},
      getStageLightBoost: function () { return 0; },
      getActiveCount: function () { return keyVisualState.activeCount; }
    };
  }

  var frameAnimState = { activePlaybacks: [] };
  var frameAnimStub = null;
  if (opts.withFrameAnim) {
    frameAnimStub = {
      getState: function () {
        return { availableProps: [], deferredProps: [], idleStopSec: 5, activePlaybacks: frameAnimState.activePlaybacks };
      }
    };
  }

  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.document = fakeDocument;
  sandbox.console = { warn: function () {}, error: function () {}, log: function () {}, info: function () {} };
  sandbox.performance = { now: function () { return fakeNow; } };
  sandbox.Date = { now: function () { return fakeDateNow; } };
  sandbox.devicePixelRatio = 1;
  sandbox.innerWidth = opts.innerWidth || 1920;
  sandbox.innerHeight = opts.innerHeight || 1080;
  var rafCallback = null;
  sandbox.requestAnimationFrame = function (fn) { rafCallback = fn; return 1; };
  sandbox.addEventListener = function (type, fn) {
    if (!windowListeners[type]) windowListeners[type] = [];
    windowListeners[type].push(fn);
  };
  if (pointerStub) sandbox.WTJ_POINTER = pointerStub;
  if (keyVisualStub) sandbox.WTJ_KEYVISUAL = keyVisualStub;
  if (frameAnimStub) sandbox.WTJ_FRAME_ANIM = frameAnimStub;

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
    return !!fn; // 是否真的有一帧被执行（供断言"park 后不再有帧可跑"）
  }

  return {
    sandbox: sandbox,
    fireKeydown: function (key) { fireWindowEvent('keydown', { key: key, repeat: false }); },
    runFrame: runFrame,
    hasPendingFrame: function () { return rafCallback !== null; },
    setNow: function (v) { fakeNow = v; },
    setDateNow: function (v) { fakeDateNow = v; },
    setDragging: function (v) { pointerState.dragging = v; },
    setKeyVisualActiveCount: function (v) { keyVisualState.activeCount = v; },
    setFrameAnimPlaybacks: function (arr) { frameAnimState.activePlaybacks = arr; },
    diagState: function () { return sandbox.WTJ_APP_DIAG.getState(); }
  };
}

var IDLE_TIMEOUT_MS = 5000; // manifest.js performance.idleStopSec=5，与 app.js IDLE_TIMEOUT_MS 同源

// --- 1. 回归：两者皆假才真正 park；park 后新输入立即恢复（行为与 008 卡之前一致）------------

test('真正空闲（无原始输入 + 无任何待渲染活动）时主循环停止：tickCount 不再增长', function () {
  var env = makeSandbox({});
  // 首帧（ensureRunning() 在 app.js 加载末尾已排好一帧）。
  env.runFrame(0);
  var afterFirst = env.diagState();
  assert.equal(afterFirst.running, true, '首帧后主循环应仍在跑（未超过 idleStopSec）');
  var tickAfterFirst = afterFirst.tickCount;

  // 推进"原始输入超时"时钟到远超 idleStopSec，但不产生任何新输入、不留任何待渲染活动。
  env.setDateNow(IDLE_TIMEOUT_MS + 1000);
  var ran = env.runFrame(50);
  assert.equal(ran, true, '超时判定发生在帧内部，这一帧本身应该正常跑完');
  var afterIdle = env.diagState();
  assert.equal(afterIdle.running, false, '原始输入超时且无待渲染活动时，应真正 park（running=false）');
  assert.equal(afterIdle.tickCount, tickAfterFirst + 1, 'park 判定帧本身仍计入 tickCount（它确实执行了一次 draw）');

  // park 之后不应再有任何帧被排队——再次 runFrame 应该是 no-op。
  var ranAgain = env.runFrame(100);
  assert.equal(ranAgain, false, 'park 后不应再有 rAF 帧被排队，runFrame 应为 no-op');
  assert.equal(env.diagState().tickCount, tickAfterFirst + 1, 'park 后 tickCount 不应继续增长');
});

test('park 后新的 keydown 立即恢复满帧（poke()/ensureRunning() 行为不变）', function () {
  var env = makeSandbox({});
  env.runFrame(0);
  env.setDateNow(IDLE_TIMEOUT_MS + 1000);
  env.runFrame(50);
  assert.equal(env.diagState().running, false, '前置条件：此刻应已 park');

  env.fireKeydown('a'); // 真实 keydown -> app.js 自身监听器 poke() -> ensureRunning()（同步执行）
  assert.equal(env.diagState().running, true, '新输入后应立即恢复 running=true（同步生效，不需要等下一帧）');
  assert.equal(env.hasPendingFrame(), true, '新输入后应已重新排队一帧 rAF');

  var tickBefore = env.diagState().tickCount;
  env.runFrame(60);
  assert.equal(env.diagState().tickCount, tickBefore + 1, '恢复后的帧应正常执行，tickCount 继续增长');
});

// --- 2. needsRender() 四类信号：任一为真时，即使原始输入已超时也不 park --------------------

test('字母仍在衰减（letters 非空）时不 park；衰减结束后的下一帧立即可以 park', function () {
  var env = makeSandbox({});
  env.runFrame(0);
  env.setDateNow(0);
  env.setNow(0);
  env.fireKeydown('a'); // spawnLetter：born=performance.now()=0，life∈[800,1500)

  // 原始输入早已"超时"（Date.now() 推到远超 idleStopSec），但字母仍在其寿命窗口内（age=500ms
  // < life 最小值 800ms，必然存活）。
  env.setDateNow(IDLE_TIMEOUT_MS + 1000);
  env.runFrame(500);
  assert.equal(env.diagState().running, true, '字母仍在衰减时不应 park，即使原始输入已超时');
  assert.equal(env.diagState().needsRender, true, 'needsRender() 应因 letters 非空返回 true');

  // 推进到字母生命周期上限（1500ms）之后，drawLetters() 会在这一帧内把它从数组移除，
  // 移除后同一帧尾部的 needsRender() 应重新评估为 false，从而在这一帧就直接 park。
  env.runFrame(2000);
  assert.equal(env.diagState().running, false, '字母衰减结束后，下一帧应立即 park（不需要再等一个额外的 idleStopSec 周期）');
});

test('指针拖拽中（WTJ_POINTER.getPointerState().dragging=true）时不 park；拖拽结束后可以 park', function () {
  var env = makeSandbox({ withPointer: true });
  env.runFrame(0);
  env.setDragging(true);

  env.setDateNow(IDLE_TIMEOUT_MS + 1000);
  env.runFrame(50);
  assert.equal(env.diagState().running, true, '指针拖拽中不应 park，即使原始输入已超时');

  env.setDragging(false);
  env.runFrame(60);
  assert.equal(env.diagState().running, false, '拖拽结束、无其余待渲染活动时，下一帧应可以 park');
});

test('非字母键视觉反馈仍在播放（WTJ_KEYVISUAL.getActiveCount()>0）时不 park', function () {
  var env = makeSandbox({ withKeyVisual: true });
  env.runFrame(0);
  env.setKeyVisualActiveCount(1);

  env.setDateNow(IDLE_TIMEOUT_MS + 1000);
  env.runFrame(50);
  assert.equal(env.diagState().running, true, 'keyvisual 仍有活动反馈项时不应 park');

  env.setKeyVisualActiveCount(0);
  env.runFrame(60);
  assert.equal(env.diagState().running, false, 'keyvisual 反馈结束后应可以 park');
});

test('WTJ_FRAME_ANIM 有活动 playback（模拟 007 door/bell 等道具正在播放）时不 park；播完后可以 park', function () {
  var env = makeSandbox({ withFrameAnim: true });
  env.runFrame(0);
  // 模拟 007 door 道具的 'opening' 一次性播放：既未被引擎自己 idle-stop，也未播完。
  env.setFrameAnimPlaybacks([
    { prop: 'door', state: 'opening', loop: false, reducedMotion: false, idlePaused: false, completeFired: false, hasDrawnOnce: true }
  ]);

  env.setDateNow(IDLE_TIMEOUT_MS + 1000);
  env.runFrame(50);
  assert.equal(env.diagState().running, true, '活动任务道具（含 door/bell）仍在播放帧动画时不应 park，避免 007 集成后被误 park');

  // 播完：completeFired 置真（door 'opening' 是一次性动画，播完 clamp 在末帧）。
  env.setFrameAnimPlaybacks([
    { prop: 'door', state: 'opening', loop: false, reducedMotion: false, idlePaused: false, completeFired: true, hasDrawnOnce: true }
  ]);
  env.runFrame(60);
  assert.equal(env.diagState().running, false, '道具播放完成（completeFired）后应可以 park');
});

test('WTJ_FRAME_ANIM 查询异常时保守当作"需要渲染"，不误 park', function () {
  var env = makeSandbox({ withFrameAnim: true });
  env.runFrame(0);
  // 用一个会抛错的 getState() 替换 stub，模拟引擎内部异常。
  env.sandbox.WTJ_FRAME_ANIM = { getState: function () { throw new Error('boom'); } };

  env.setDateNow(IDLE_TIMEOUT_MS + 1000);
  env.runFrame(50);
  assert.equal(env.diagState().running, true, 'getState() 抛错时应保守地继续跑，不能因为查询失败就误判成空闲并 park');
});

// --- 3. window.WTJ_APP_DIAG 诊断 API 形状 -----------------------------------------------------

test('window.WTJ_APP_DIAG：CARD_ID/getState() 形状正确，且对象已冻结', function () {
  var env = makeSandbox({});
  env.runFrame(0);
  var diag = env.sandbox.WTJ_APP_DIAG;
  assert.equal(diag.CARD_ID, 'WTJ-20260707-008');
  assert.equal(Object.isFrozen(diag), true, 'API 对象应被 Object.freeze 冻结（与其余引擎同款约定）');

  var state = diag.getState();
  assert.equal(typeof state.running, 'boolean');
  assert.equal(typeof state.tickCount, 'number');
  assert.equal(typeof state.lastTickAt, 'number');
  assert.equal(typeof state.idleTimeoutMs, 'number');
  assert.equal(state.idleTimeoutMs, IDLE_TIMEOUT_MS, 'idleTimeoutMs 应等于 manifest performance.idleStopSec × 1000（默认 5000）');
  assert.equal(typeof state.needsRender, 'boolean');
});
