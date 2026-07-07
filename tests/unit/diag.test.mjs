// WTJ-20260705-017 — diag.js 单元测试（durable QA asset）
//
// 用 Node 内置 vm 模块搭一个沙箱 context 加载真实的 app/web/diag.js（与
// frame-anim.test.mjs/reward-chest.test.mjs 同一手法）。diag.js 在模块加载的同一个 IIFE 内
// 就会自启动心跳链（clockRef.setTimeout）与 rAF 探测（window.requestAnimationFrame，若可用），
// 这与 frame-anim.js/reward-chest.js"只有调用方触发 play() 才会启动计时器"不同——因此本文件的
// 沙箱必须在**加载 diag.js 源码之前**就把假 setTimeout/clearTimeout（bare 全局，diag.js 内部
// 裸写 `setTimeout(...)`）与假 window.requestAnimationFrame 准备好，不能像 frame-anim 测试那样
// 等模块加载完毕后再用 _setClock() 补量（那时第一次 setTimeout/rAF 调用已经用真实全局跑掉了）。
//
// 假时钟不是"按 ms 到期自动触发"的队列，而是显式手动触发（与 frame-anim.test.mjs 的
// makeControlledClock 同一取舍：确定性、不依赖真实定时器）：
//   clock.runOne(ms)   触发队列里第一个"注册时 ms 参数等于该值"的定时器（diag.js 只用到两个
//                      固定 ms 值：HEARTBEAT_MS=5000 的心跳链、0 的 deferredInit 延迟初始化，
//                      按源码里固定写死的调用点区分即可，不需要真实到期判断）。
//   raf.tick()         执行 rAF 队列里最早的一个回调，模拟浏览器跑一帧。
//
// Run:  node --test tests/unit/diag.test.mjs
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
var DIAG_JS_PATH = path.resolve(__dirname, '../../app/web/diag.js');
var DIAG_SRC = readFileSync(DIAG_JS_PATH, 'utf8');

// --- 假 setTimeout/clearTimeout（bare 全局）-----------------------------------------------
function makeFakeTimerQueue() {
  var timers = []; // { id, fn, ms }
  var nextId = 1;

  function fakeSetTimeout(fn, ms) {
    var id = nextId++;
    timers.push({ id: id, fn: fn, ms: ms });
    return id;
  }

  function fakeClearTimeout(id) {
    var i;
    for (i = 0; i < timers.length; i++) {
      if (timers[i].id === id) {
        timers.splice(i, 1);
        return;
      }
    }
  }

  // 触发队列里第一个 ms 字段等于 targetMs 的定时器（FIFO），执行后从队列移除。
  // 返回 true 表示确实触发了一个；false 表示没有匹配项。
  function runOne(targetMs) {
    var i;
    for (i = 0; i < timers.length; i++) {
      if (timers[i].ms === targetMs) {
        var entry = timers.splice(i, 1)[0];
        entry.fn();
        return true;
      }
    }
    return false;
  }

  function pendingCount() {
    return timers.length;
  }

  return {
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    runOne: runOne,
    pendingCount: pendingCount
  };
}

// --- 假 requestAnimationFrame -------------------------------------------------------------
function makeFakeRaf() {
  var pending = []; // { id, cb }
  var nextId = 1;

  function fn(cb) {
    var id = nextId++;
    pending.push({ id: id, cb: cb });
    return id;
  }

  function cancel(id) {
    var i;
    for (i = 0; i < pending.length; i++) {
      if (pending[i].id === id) {
        pending.splice(i, 1);
        return;
      }
    }
  }

  // 执行队列里最早的一个回调（模拟浏览器跑一帧；diag.js 的 rafLoop 会在回调里重新排下一帧）。
  function tick() {
    if (!pending.length) {
      return false;
    }
    var entry = pending.shift();
    entry.cb(0);
    return true;
  }

  return { fn: fn, cancel: cancel, tick: tick };
}

// --- 假 MutationObserver（记录所有实例 + observe() 调用，供测试手动触发 callback）------------
function makeFakeMutationObserverCtor() {
  var instances = [];

  function FakeMutationObserver(callback) {
    this._callback = callback;
    this._observeCalls = [];
    instances.push(this);
  }
  FakeMutationObserver.prototype.observe = function (target, opts) {
    this._observeCalls.push({ target: target, options: opts });
  };
  FakeMutationObserver.prototype.disconnect = function () {};

  return { ctor: FakeMutationObserver, instances: instances };
}

// --- 假 window.addEventListener（按 type 记录 handler 列表，capture 参数忽略）----------------
function makeFakeEventBus() {
  var handlers = {}; // type -> [fn, ...]

  function addEventListener(type, fn) {
    if (!handlers[type]) {
      handlers[type] = [];
    }
    handlers[type].push(fn);
  }

  function fire(type, eventObj) {
    var list = handlers[type] || [];
    var i;
    for (i = 0; i < list.length; i++) {
      list[i](eventObj);
    }
  }

  return { addEventListener: addEventListener, fire: fire, handlers: handlers };
}

// --- 假 postMessage 通道（window.webkit.messageHandlers.diag）------------------------------
function makeFakeDiagChannel(opts) {
  opts = opts || {};
  var posted = [];
  return {
    posted: posted,
    postMessage: function (entry) {
      if (opts.throwOnPost) {
        throw new Error('模拟原生桥异常');
      }
      posted.push(entry);
    }
  };
}

function fakeCreateElement(tag) {
  if (tag === 'canvas') {
    return { getContext: function (t) { return t === '2d' ? { drawImage: function () {} } : null; } };
  }
  if (tag === 'div') {
    return { style: { animationName: '' } };
  }
  return { tagName: tag };
}

// --- sandbox builder -----------------------------------------------------------------------
// opts.withRaf/withMutationObserver/withDiagChannel/withFetch/withCSS: 控制是否提供对应能力，
// 用于覆盖"能力缺失时优雅降级、不抛错"的分支。
function createSandbox(opts) {
  opts = opts || {};
  var warnCalls = [];
  var errorCalls = [];
  var infoCalls = [];

  var timerQueue = makeFakeTimerQueue();
  var raf = opts.withRaf === false ? null : makeFakeRaf();
  var mo = opts.withMutationObserver === false ? null : makeFakeMutationObserverCtor();
  var eventBus = makeFakeEventBus();
  var diagChannel = opts.withDiagChannel === false ? null : makeFakeDiagChannel(opts.diagChannelOpts);

  var fakeWindow = {
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 2,
    addEventListener: eventBus.addEventListener,
    onerror: opts.previousOnError || null
  };
  if (raf) {
    fakeWindow.requestAnimationFrame = raf.fn;
    fakeWindow.cancelAnimationFrame = raf.cancel;
  }
  if (opts.withFetch !== false) {
    fakeWindow.fetch = opts.fetchImpl || function () { return { then: function () {} }; };
  }
  if (opts.withCSS !== false) {
    fakeWindow.CSS = { supports: function () { return true; } };
  }
  if (opts.withMatchMedia !== false) {
    fakeWindow.matchMedia = function (q) { return { matches: !!opts.reducedMotion, media: q }; };
  }
  if (diagChannel) {
    fakeWindow.webkit = { messageHandlers: { diag: diagChannel } };
  }
  if (opts.buildInfo !== undefined) {
    fakeWindow.__WTJ_BUILD_INFO = opts.buildInfo;
  }
  if (opts.manifest !== undefined) {
    fakeWindow.WTJ_MANIFEST = opts.manifest;
  }
  if (opts.taskTemplates !== undefined) {
    fakeWindow.WTJ_TASK_TEMPLATES = opts.taskTemplates;
  }
  if (opts.frameAnim !== undefined) {
    fakeWindow.WTJ_FRAME_ANIM = opts.frameAnim;
  }

  var sandbox = {
    window: fakeWindow,
    navigator: opts.navigator !== undefined ? opts.navigator : {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Safari/605.1.15',
      platform: 'MacIntel',
      hardwareConcurrency: 4
    },
    screen: { width: 1280, height: 800 },
    document: {
      createElement: fakeCreateElement,
      body: opts.withDocumentBody === false ? null : {}
    },
    setTimeout: timerQueue.setTimeout,
    clearTimeout: timerQueue.clearTimeout,
    console: {
      log: function () {},
      info: function () { infoCalls.push(Array.prototype.slice.call(arguments).join(' ')); },
      warn: function () { warnCalls.push(Array.prototype.slice.call(arguments).join(' ')); },
      error: function () { errorCalls.push(Array.prototype.slice.call(arguments).join(' ')); }
    }
  };
  if (mo) {
    sandbox.MutationObserver = mo.ctor;
  }

  vm.createContext(sandbox);
  vm.runInContext(DIAG_SRC, sandbox, { filename: 'diag.js' });

  return {
    contextObject: sandbox,
    window: fakeWindow,
    DIAG: fakeWindow.WTJ_DIAG,
    timerQueue: timerQueue,
    raf: raf,
    mo: mo,
    eventBus: eventBus,
    diagChannel: diagChannel,
    warnCalls: warnCalls,
    errorCalls: errorCalls,
    infoCalls: infoCalls
  };
}

function findRecordsByKind(list, kind) {
  return list.filter(function (r) { return r.kind === kind; });
}

// =============================================================================================
// 1. 加载 + API 冻结守卫 + 重复引入守卫
// =============================================================================================

test('加载：window.WTJ_DIAG 是 frozen 对象，方法齐全，绑定不可写/不可重配置', function () {
  var env = createSandbox();
  assert.ok(env.DIAG, 'window.WTJ_DIAG 应该已挂载');
  assert.equal(Object.isFrozen(env.DIAG), true);
  assert.equal(typeof env.DIAG.getState, 'function');
  assert.equal(typeof env.DIAG._setClock, 'function');
  assert.equal(env.DIAG.CARD_ID, 'WTJ-20260705-017');

  var before = env.DIAG.getState;
  try { env.DIAG.getState = null; } catch (e) { /* 严格模式抛错也算通过 */ }
  assert.equal(env.DIAG.getState, before, 'frozen API 应拒绝方法重赋值');

  var desc = Object.getOwnPropertyDescriptor(env.window, 'WTJ_DIAG');
  assert.equal(desc.writable, false, 'window.WTJ_DIAG 绑定应不可写');
  assert.equal(desc.configurable, false, 'window.WTJ_DIAG 绑定应不可重配置');
});

test('重复引入守卫：再次执行 diag.js 源码是安全 no-op，不会重复挂载/重复启动心跳', function () {
  var env = createSandbox();
  var instance1 = env.window.WTJ_DIAG;
  var pendingBefore = env.timerQueue.pendingCount();

  vm.runInContext(DIAG_SRC, env.contextObject, { filename: 'diag.js (dup)' });

  assert.equal(env.window.WTJ_DIAG, instance1, '重复引入后应仍是第一个实例');
  assert.equal(env.timerQueue.pendingCount(), pendingBefore, '重复引入不应新增定时器');
});

// =============================================================================================
// 2. window.onerror / unhandledrejection
// =============================================================================================

test('window.onerror 钩子：记录 window-error 且透传给原有 onerror', function () {
  var previousCalls = [];
  var previous = function (message, source, lineno, colno, error) {
    previousCalls.push({ message: message, source: source, lineno: lineno, colno: colno, error: error });
    return true;
  };
  var env = createSandbox({ previousOnError: previous });

  var err = new Error('boom');
  var ret = env.window.onerror('出错了', 'app.js', 10, 5, err);

  assert.equal(ret, true, '应透传原有 onerror 的返回值');
  assert.equal(previousCalls.length, 1, '原有 onerror 应被调用一次');

  var state = env.DIAG.getState();
  var records = findRecordsByKind(state.recent, 'window-error');
  assert.equal(records.length, 1);
  assert.equal(records[0].payload.message, '出错了');
  assert.equal(records[0].payload.source, 'app.js');
  assert.equal(records[0].payload.lineno, 10);
  assert.ok(records[0].payload.stack, 'Error 对象应被 sanitize 出 stack 字符串');
  assert.equal(state.counts['window-error'], 1);
});

test('unhandledrejection：记录 message/stack', function () {
  var env = createSandbox();
  var reason = new Error('promise 炸了');
  env.eventBus.fire('unhandledrejection', { reason: reason });

  var state = env.DIAG.getState();
  var records = findRecordsByKind(state.recent, 'unhandledrejection');
  assert.equal(records.length, 1);
  assert.equal(records[0].payload.message, 'promise 炸了');
  assert.ok(records[0].payload.stack);
});

// =============================================================================================
// 3. 资源加载失败 / sprite-load
// =============================================================================================

test('resource-error：捕获阶段 error 事件命中 img/script 目标时记录，忽略 window 自身目标', function () {
  var env = createSandbox();

  env.eventBus.fire('error', { target: { tagName: 'IMG', src: 'assets/faucet.png', id: '', className: 'wtj-tt-prop' } });
  env.eventBus.fire('error', { target: { tagName: 'SCRIPT', src: 'frame-anim.js' } });
  env.eventBus.fire('error', { target: env.window }); // 运行时错误已由 onerror 处理，这里应被忽略

  var state = env.DIAG.getState();
  var records = findRecordsByKind(state.recent, 'resource-error');
  assert.equal(records.length, 2, '应只记录两条资源级错误，忽略 target===window 的一条');
  assert.equal(records[0].payload.tag, 'img');
  assert.equal(records[0].payload.src, 'assets/faucet.png');
  assert.equal(records[1].payload.tag, 'script');
});

test('sprite-load：捕获阶段 load 事件命中 img 目标时记录 naturalWidth/naturalHeight，忽略非 img 标签与 window 自身', function () {
  var env = createSandbox();

  env.eventBus.fire('load', {
    target: { tagName: 'IMG', src: 'assets/horse-sheet.png', naturalWidth: 1536, naturalHeight: 256, complete: true }
  });
  env.eventBus.fire('load', { target: { tagName: 'SCRIPT', src: 'x.js' } }); // 非 img，应忽略
  env.eventBus.fire('load', { target: env.window }); // 页面整体 load，应忽略

  var state = env.DIAG.getState();
  var records = findRecordsByKind(state.recent, 'sprite-load');
  assert.equal(records.length, 1);
  assert.equal(records[0].payload.src, 'assets/horse-sheet.png');
  assert.equal(records[0].payload.naturalWidth, 1536);
  assert.equal(records[0].payload.naturalHeight, 256);
});

// =============================================================================================
// 4. fetch 非侵入包装
// =============================================================================================

function makeFakeThenable() {
  var fulfilledCb = null;
  var rejectedCb = null;
  var api = {
    then: function (onF, onR) {
      fulfilledCb = onF;
      rejectedCb = onR;
      return api;
    },
    resolveWith: function (v) { if (fulfilledCb) { fulfilledCb(v); } },
    rejectWith: function (e) { if (rejectedCb) { rejectedCb(e); } }
  };
  return api;
}

test('fetch 包装：HTTP 非 2xx（ok:false）记录 fetch-error，且返回值就是原始 promise（同一引用）', function () {
  var fakeResult = makeFakeThenable();
  var calledArgs = null;
  var env = createSandbox({
    fetchImpl: function (url, options) {
      calledArgs = { url: url, options: options };
      return fakeResult;
    }
  });

  var returned = env.window.fetch('wtjres://app/audio/tasks/x.m4a', { method: 'GET' });
  assert.equal(returned, fakeResult, '包装后的 fetch 应原样返回 originalFetch 的结果引用');
  assert.deepEqual(calledArgs, { url: 'wtjres://app/audio/tasks/x.m4a', options: { method: 'GET' } });

  fakeResult.resolveWith({ ok: false, status: 404 });

  var state = env.DIAG.getState();
  var records = findRecordsByKind(state.recent, 'fetch-error');
  assert.equal(records.length, 1);
  assert.equal(records[0].payload.phase, 'http-status');
  assert.equal(records[0].payload.status, 404);
  assert.equal(records[0].payload.url, 'wtjres://app/audio/tasks/x.m4a');
});

test('fetch 包装：rejected 记录 fetch-error phase=rejected', function () {
  var fakeResult = makeFakeThenable();
  var env = createSandbox({ fetchImpl: function () { return fakeResult; } });

  env.window.fetch('wtjres://app/missing.m4a');
  fakeResult.rejectWith(new Error('network down'));

  var state = env.DIAG.getState();
  var records = findRecordsByKind(state.recent, 'fetch-error');
  assert.equal(records.length, 1);
  assert.equal(records[0].payload.phase, 'rejected');
  assert.equal(records[0].payload.message, 'network down');
});

test('fetch 不可用时（window.fetch 非函数）：加载与调用均不抛错', function () {
  assert.doesNotThrow(function () {
    createSandbox({ withFetch: false });
  });
});

// =============================================================================================
// 5. 任务动画状态切换（MutationObserver）+ task-complete 订阅
// =============================================================================================

test('anim-state-change：MutationObserver 回调命中 data-anim-state 属性变化时记录', function () {
  var env = createSandbox();
  assert.ok(env.mo.instances.length >= 1, '应创建至少一个 MutationObserver 实例');
  var observerInstance = env.mo.instances[0];
  assert.ok(observerInstance._observeCalls.length >= 1, '应调用 observe()');
  var observeCall = observerInstance._observeCalls[0];
  // 注：不用 assert.deepEqual 比较该数组——它是在 vm 沙箱（另一个 realm）里创建的数组字面量，
  // 与本文件的 Array 不是同一个 realm 的构造函数/原型，deepStrictEqual 会因此判定"结构相同但
  // 不是同一引用"而失败，逐元素比较即可，不涉及 realm 问题。
  assert.equal(observeCall.options.attributeFilter.length, 1);
  assert.equal(observeCall.options.attributeFilter[0], 'data-anim-state');
  assert.equal(observeCall.options.subtree, true);

  var fakeEl = {
    tagName: 'CANVAS',
    getAttribute: function (name) {
      if (name === 'data-wtj-anim-prop') { return 'faucet'; }
      if (name === 'data-anim-state') { return 'active'; }
      return null;
    }
  };
  observerInstance._callback([
    { type: 'attributes', attributeName: 'data-anim-state', target: fakeEl, oldValue: 'idle' },
    { type: 'attributes', attributeName: 'data-other-attr', target: fakeEl, oldValue: null } // 应被忽略
  ]);

  var state = env.DIAG.getState();
  var records = findRecordsByKind(state.recent, 'anim-state-change');
  assert.equal(records.length, 1, '只应处理 data-anim-state 属性变化，忽略其它属性变化');
  assert.equal(records[0].payload.prop, 'faucet');
  assert.equal(records[0].payload.oldState, 'idle');
  assert.equal(records[0].payload.newState, 'active');
});

test('MutationObserver 不可用时：告警一次并优雅跳过，不抛错', function () {
  var env = createSandbox({ withMutationObserver: false });
  assert.ok(env.warnCalls.some(function (s) { return s.indexOf('MutationObserver') !== -1; }));
});

test('document.body 缺失时：告警一次并优雅跳过，不抛错', function () {
  var env = createSandbox({ withDocumentBody: false });
  assert.ok(env.warnCalls.some(function (s) { return s.indexOf('document.body') !== -1; }));
});

test('task-complete：deferredInit 触发后订阅 WTJ_TASK_TEMPLATES.onTaskComplete，事件到达时记录', function () {
  var subscribed = null;
  var taskTemplatesStub = {
    onTaskComplete: function (fn) { subscribed = fn; }
  };
  var env = createSandbox({ taskTemplates: taskTemplatesStub });

  env.timerQueue.runOne(0); // 触发 deferredInit()
  assert.equal(typeof subscribed, 'function', '应已订阅 onTaskComplete');

  subscribed({ type: 'click', taskId: 'faucet-on', lightIndex: 2 });

  var state = env.DIAG.getState();
  var records = findRecordsByKind(state.recent, 'task-complete');
  assert.equal(records.length, 1);
  assert.equal(records[0].payload.taskId, 'faucet-on');
});

test('WTJ_TASK_TEMPLATES 不可用时：deferredInit 不抛错，也不记录 task-complete', function () {
  var env = createSandbox();
  assert.doesNotThrow(function () { env.timerQueue.runOne(0); });
  var state = env.DIAG.getState();
  assert.equal(findRecordsByKind(state.recent, 'task-complete').length, 0);
});

// =============================================================================================
// 6. header（app 版本/commit、UA 解析、能力探测）
// =============================================================================================

test('header：优先读 window.__WTJ_BUILD_INFO（shell 注入），UA 解析出 WebKit/Safari/macOS 版本号', function () {
  var env = createSandbox({ buildInfo: { version: '0.1.0', commit: 'a389b88' } });
  env.timerQueue.runOne(0); // 触发 deferredInit -> emitHeader

  var state = env.DIAG.getState();
  var records = findRecordsByKind(state.recent, 'header');
  assert.equal(records.length, 1);
  var payload = records[0].payload;
  assert.equal(payload.buildVersion, '0.1.0');
  assert.equal(payload.buildCommit, 'a389b88');
  assert.equal(payload.buildInfoSource, 'shell-injected');
  assert.equal(payload.webkitVersion, '605.1.15');
  assert.equal(payload.safariVersion, '14.1.2');
  assert.equal(payload.macOSVersionFromUA, '11.6');
  assert.equal(payload.capabilities.canvas2dContext, true);
  assert.equal(payload.capabilities.requestAnimationFrameFn, true);
  assert.equal(payload.capabilities.offscreenCanvasSupported, false, '旧机预期不支持 OffscreenCanvas');

  var buildInfoState = env.DIAG.getState().buildInfo;
  assert.equal(buildInfoState.commit, 'a389b88');
});

test('header：__WTJ_BUILD_INFO 缺失时回退 window.WTJ_MANIFEST.meta.version，commit 为 null 且注明来源', function () {
  var env = createSandbox({ manifest: { meta: { version: '0.1.0', card: 'WTJ-20260704-004' } } });
  env.timerQueue.runOne(0);

  var state = env.DIAG.getState();
  var payload = findRecordsByKind(state.recent, 'header')[0].payload;
  assert.equal(payload.buildVersion, '0.1.0');
  assert.equal(payload.buildCommit, null);
  assert.match(payload.buildInfoSource, /manifest-fallback/);
});

test('header：两者都缺失时 buildInfo 全为 null，source=unavailable，不抛错', function () {
  var env = createSandbox();
  assert.doesNotThrow(function () { env.timerQueue.runOne(0); });
  var payload = findRecordsByKind(env.DIAG.getState().recent, 'header')[0].payload;
  assert.equal(payload.buildVersion, null);
  assert.equal(payload.buildCommit, null);
  assert.equal(payload.buildInfoSource, 'unavailable');
});

// =============================================================================================
// WTJ-20260706-013：honorReducedMotion 开关 + prefersReducedMotionEffective 派生字段。
// prefersReducedMotionProbe()（header.prefersReducedMotion 字段）是诊断专用的 OS 原始探针，
// 刻意不受 honorReducedMotion 影响——旧机诊断需要如实反映 OS 状态，不能被"app 侧无视 OS
// 偏好"这条产品决策污染。header.prefersReducedMotionEffective 才是"其余四个引擎的
// prefersReducedMotion() 实际会返回什么"这个问题的答案。
// =============================================================================================

test('header：manifest.performance.honorReducedMotion 缺省（未传 manifest）+ OS matchMedia 命中 reduce：原始探针仍报 true，effective 应为 false（标志消失）', function () {
  var env = createSandbox({ reducedMotion: true }); // 未传 opts.manifest -> window.WTJ_MANIFEST undefined
  env.timerQueue.runOne(0);
  var payload = findRecordsByKind(env.DIAG.getState().recent, 'header')[0].payload;
  assert.equal(payload.prefersReducedMotion, true, '原始 OS 探针不受 honorReducedMotion 开关影响，应如实报告 matchMedia 命中');
  assert.equal(payload.honorReducedMotion, false, 'manifest 缺失时 honorReducedMotion 应防御式回退为 false');
  assert.equal(payload.prefersReducedMotionEffective, false, 'kiosk 默认无视 OS 偏好：effective 字段应为 false，即使原始探针为 true');
});

test('header：manifest.performance.honorReducedMotion 显式 false + OS matchMedia 命中 reduce：effective 仍为 false', function () {
  var env = createSandbox({ reducedMotion: true, manifest: { performance: { honorReducedMotion: false } } });
  env.timerQueue.runOne(0);
  var payload = findRecordsByKind(env.DIAG.getState().recent, 'header')[0].payload;
  assert.equal(payload.prefersReducedMotion, true);
  assert.equal(payload.honorReducedMotion, false);
  assert.equal(payload.prefersReducedMotionEffective, false, '显式 honorReducedMotion=false 同样应无视 OS 偏好');
});

test('header：manifest.performance.honorReducedMotion=true（家长设置钩子）+ OS matchMedia 命中 reduce：effective 应为 true（尊重 OS）', function () {
  var env = createSandbox({ reducedMotion: true, manifest: { performance: { honorReducedMotion: true } } });
  env.timerQueue.runOne(0);
  var payload = findRecordsByKind(env.DIAG.getState().recent, 'header')[0].payload;
  assert.equal(payload.prefersReducedMotion, true);
  assert.equal(payload.honorReducedMotion, true);
  assert.equal(payload.prefersReducedMotionEffective, true, 'honorReducedMotion=true 时 effective 应恢复尊重 OS matchMedia 命中结果');
});

test('header：honorReducedMotion=true 但 OS matchMedia 未命中 reduce：effective 应为 false', function () {
  var env = createSandbox({ reducedMotion: false, manifest: { performance: { honorReducedMotion: true } } });
  env.timerQueue.runOne(0);
  var payload = findRecordsByKind(env.DIAG.getState().recent, 'header')[0].payload;
  assert.equal(payload.prefersReducedMotion, false);
  assert.equal(payload.prefersReducedMotionEffective, false, 'honorReducedMotion=true 但 OS 未命中 reduce 时 effective 应为 false');
});

// =============================================================================================
// 7. rAF ticking + 心跳（heartbeat）+ WTJ-20260707-010 idle/full 采样 gate
// =============================================================================================

test('WTJ-20260707-010 满频模式（manifest.performance.diagRafFullRate=true）：跑 3 帧后触发心跳，记录 rafTicksSinceLast=3 且 rafTicking=true；随后无新帧再触发心跳应为 false', function () {
  var frameAnimStub = {
    getState: function () {
      return { availableProps: ['faucet', 'horse', 'lamp'], idleStopSec: 5, activePlaybacks: [{ prop: 'faucet', state: 'idle', hasDrawnOnce: true }] };
    }
  };
  var env = createSandbox({ frameAnim: frameAnimStub, manifest: { performance: { diagRafFullRate: true } } });
  env.timerQueue.runOne(0); // 触发 deferredInit -> applyRafProbeMode('full')，恢复 017 原始持续自链行为
  assert.equal(env.DIAG.getState().rafMode, 'full');

  env.raf.tick();
  env.raf.tick();
  env.raf.tick();

  env.timerQueue.runOne(5000); // 第一次心跳

  var state = env.DIAG.getState();
  var heartbeats = findRecordsByKind(state.recent, 'heartbeat');
  assert.equal(heartbeats.length, 1);
  assert.equal(heartbeats[0].payload.rafTicksSinceLast, 3);
  assert.equal(heartbeats[0].payload.rafTicking, true);
  assert.equal(heartbeats[0].payload.rafTotalTicks, 3);
  assert.equal(heartbeats[0].payload.frameAnim.availableProps.length, 3);
  assert.equal(heartbeats[0].payload.frameAnim.activePlaybacks[0].hasDrawnOnce, true);

  // 两次心跳之间没有任何新的 rAF tick —— 这正是 014 那类"canvas 长期空白"bug 的可观测信号。
  env.timerQueue.runOne(5000);
  var heartbeats2 = findRecordsByKind(env.DIAG.getState().recent, 'heartbeat');
  assert.equal(heartbeats2.length, 2);
  assert.equal(heartbeats2[1].payload.rafTicksSinceLast, 0);
  assert.equal(heartbeats2[1].payload.rafTicking, false, 'rAF 未推进时应如实报告 false，不能掩盖问题');
  assert.equal(heartbeats2[1].payload.rafTotalTicks, 3, '总计数应保持累计不变');

  assert.equal(env.DIAG.getState().rafTicking, true, '曾经 tick 过，getState().rafTicking 应为 true');
});

test('requestAnimationFrame 不可用时：跳过探测并告警，不抛错，心跳仍能正常发出', function () {
  var env = createSandbox({ withRaf: false });
  assert.ok(env.warnCalls.some(function (s) { return s.indexOf('requestAnimationFrame') !== -1; }));

  assert.doesNotThrow(function () { env.timerQueue.runOne(5000); });
  var heartbeats = findRecordsByKind(env.DIAG.getState().recent, 'heartbeat');
  assert.equal(heartbeats.length, 1);
  assert.equal(heartbeats[0].payload.rafActive, false);
  assert.equal(heartbeats[0].payload.rafTicking, false);
});

// ---------------------------------------------------------------------------------------------
// WTJ-20260707-010：008 卡发现这个探针从 017 起就是永久 60Hz rAF 自链、无 idle 判定，且在
// 正常 App/WTJ_APP_DIAG/QA 真机诊断三条路径下都无条件加载同一份 diag.js（没有独立的"诊断模式"
// 开关），是比 app.js 主循环更可疑的旧机发热源。以下测试覆盖新增的默认低频基线 gate：不改变
// "浏览器能否推进 rAF"这个诊断问题本身，只把采样节奏从"每帧"降到"每心跳窗口 1 帧"。
// ---------------------------------------------------------------------------------------------

test('WTJ-20260707-010 默认低频基线（未配置 diagRafFullRate）：getState().rafMode 为 idle，rafLoop 触发后不自我重排', function () {
  var env = createSandbox(); // 无 manifest -> resolveDiagRafFullRate() 防御式回退为 false
  assert.equal(env.DIAG.getState().rafMode, 'idle', '未配置 manifest 时应默认低频基线，不是满频');

  // startRafProbe() 已在沙箱创建时武装了恰好一帧初始采样。
  var firstTick = env.raf.tick();
  assert.equal(firstTick, true, '应有且仅有一帧待采（启动基线）');
  assert.equal(env.DIAG.getState().rafTotalTicks, 1);

  // idle 模式下 rafLoop 触发后不重排——队列应已清空，再 tick 应无事发生。
  var secondTick = env.raf.tick();
  assert.equal(secondTick, false, 'idle 模式下不应自我重排下一帧，队列应为空');
  assert.equal(env.DIAG.getState().rafTotalTicks, 1, 'tick 总数不应因空转而增加');
});

test('WTJ-20260707-010 默认低频基线：manifest 显式设 diagRafFullRate=false 时行为与未配置一致（防御式回退同款）', function () {
  var env = createSandbox({ manifest: { performance: { diagRafFullRate: false } } });
  env.timerQueue.runOne(0); // 触发 deferredInit
  assert.equal(env.DIAG.getState().rafMode, 'idle');
});

test('WTJ-20260707-010 低频基线心跳节奏：每个心跳窗口只采 1 帧，如实报告 rafTicksSinceLast，且窗口尾部自动武装下一次采样', function () {
  var env = createSandbox();

  env.raf.tick(); // 消耗启动时的基线采样，totalTicks=1
  assert.equal(env.raf.tick(), false, '两次心跳之间不应有多余的待采帧');

  env.timerQueue.runOne(5000); // 第一次心跳
  var hb1 = findRecordsByKind(env.DIAG.getState().recent, 'heartbeat');
  assert.equal(hb1.length, 1);
  assert.equal(hb1[0].payload.rafTicksSinceLast, 1, '低频模式下一个心跳窗口应恰好采到 1 帧');
  assert.equal(hb1[0].payload.rafTicking, true);

  // heartbeatTick() 尾部应已重新武装下一次采样——队列里应恰好有 1 帧待采，供下一个窗口使用。
  assert.equal(env.raf.tick(), true, '心跳窗口尾部应已武装下一次采样');
  assert.equal(env.raf.tick(), false, '不应额外多武装第二帧');
  assert.equal(env.DIAG.getState().rafTotalTicks, 2);

  env.timerQueue.runOne(5000); // 第二次心跳
  var hb2 = findRecordsByKind(env.DIAG.getState().recent, 'heartbeat');
  assert.equal(hb2.length, 2);
  assert.equal(hb2[1].payload.rafTicksSinceLast, 1, '第二个窗口同样应只采到 1 帧，而不是像满频模式那样累积多帧');
});

test('WTJ-20260707-010 低频基线下浏览器真的无法推进 rAF（启动时武装的那一帧从未被回调）：心跳窗口连续报告 rafTicksSinceLast=0，不掩盖问题', function () {
  var env = createSandbox();
  // 刻意不调用 env.raf.tick()——模拟 startRafProbe() 武装的那一帧请求了但从未被浏览器真正
  // 回调（如实反映"引擎完全没跑"这类故障，而不是本测试自己人为消耗掉它）。

  env.timerQueue.runOne(5000);
  var hb1 = findRecordsByKind(env.DIAG.getState().recent, 'heartbeat')[0];
  assert.equal(hb1.payload.rafTicksSinceLast, 0);
  assert.equal(hb1.payload.rafTicking, false, '即使是低频采样，浏览器确实没推进时也必须如实报告 false');
  assert.equal(env.DIAG.getState().rafTotalTicks, 0);

  env.timerQueue.runOne(5000);
  var heartbeats = findRecordsByKind(env.DIAG.getState().recent, 'heartbeat');
  assert.equal(heartbeats[1].payload.rafTicksSinceLast, 0);
  assert.equal(heartbeats[1].payload.rafTicking, false);
});

test('WTJ-20260707-010 模式切换：deferredInit 读到 diagRafFullRate=true 后，后续心跳窗口按满频连续自链推进，不再是每窗口 1 帧', function () {
  var env = createSandbox({ manifest: { performance: { diagRafFullRate: true } } });

  // 启动时（deferredInit 尚未触发）沙箱已按默认 idle 武装了 1 帧基线采样。
  env.timerQueue.runOne(0); // deferredInit -> applyRafProbeMode('full')
  assert.equal(env.DIAG.getState().rafMode, 'full');

  // 切到 full 后，之前武装的那一帧仍然有效（scheduled 守卫不会把它撤销），tick 一次即可验证
  // 后续满频自链已经生效：每 tick 一次就应有下一帧立刻重新入队。
  env.raf.tick();
  assert.equal(env.raf.tick(), true, '满频模式下每次 tick 后都应立即有下一帧待采（自我重排）');
  assert.equal(env.raf.tick(), true);
  assert.equal(env.DIAG.getState().rafTotalTicks, 3);
});

// =============================================================================================
// 8. 上行通道（window.webkit.messageHandlers.diag）
// =============================================================================================

test('每条记录都会尝试经 window.webkit.messageHandlers.diag.postMessage 上行，形状为 {ts,kind,payload}', function () {
  var env = createSandbox();
  env.eventBus.fire('unhandledrejection', { reason: new Error('x') });

  assert.equal(env.diagChannel.posted.length, 1);
  var posted = env.diagChannel.posted[0];
  assert.equal(posted.kind, 'unhandledrejection');
  assert.equal(typeof posted.ts, 'number');
  assert.ok(posted.payload);
});

test('postMessage 抛错时：record() 吞掉异常，不影响页面/不丢失本地环形缓冲', function () {
  var env = createSandbox({ diagChannelOpts: { throwOnPost: true } });
  assert.doesNotThrow(function () {
    env.eventBus.fire('unhandledrejection', { reason: new Error('x') });
  });
  var state = env.DIAG.getState();
  assert.equal(findRecordsByKind(state.recent, 'unhandledrejection').length, 1, '即使上行失败，本地环形缓冲仍应保留这条记录');
});

test('无 window.webkit 通道（非 WKWebView 环境）时：不抛错，本地环形缓冲仍正常工作', function () {
  var env = createSandbox({ withDiagChannel: false });
  assert.doesNotThrow(function () {
    env.eventBus.fire('unhandledrejection', { reason: new Error('x') });
  });
  assert.equal(findRecordsByKind(env.DIAG.getState().recent, 'unhandledrejection').length, 1);
});

// =============================================================================================
// 9. 环形缓冲区上限 + 计数器
// =============================================================================================

test('环形缓冲区：超过 MAX_RECENT（200）条时丢弃最旧的，只保留最近 200 条', function () {
  var env = createSandbox();
  var i;
  for (i = 0; i < 250; i++) {
    env.eventBus.fire('unhandledrejection', { reason: { message: 'err-' + i } });
  }
  var state = env.DIAG.getState();
  var records = findRecordsByKind(state.recent, 'unhandledrejection');
  assert.equal(records.length, 200, '环形缓冲应恰好保留 200 条');
  assert.equal(records[0].payload.message, 'err-50', '应丢弃最旧的 50 条，第一条应是 err-50');
  assert.equal(records[199].payload.message, 'err-249', '最后一条应是最新的 err-249');
  assert.equal(state.counts['unhandledrejection'], 250, '计数器应统计全部 250 次，不受环形缓冲截断影响');
});
