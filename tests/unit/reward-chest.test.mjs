// WTJ-20260704-011 — reward-chest.js 单元测试（durable QA asset）
//
// 用 Node 内置 vm 模块搭一个沙箱 context，按 index.html 的真实加载顺序在同一 sandbox 里先加载
// 真实的 app/web/manifest.js（其 IIFE 会 window.WTJ_MANIFEST = deepFreeze(...)），再加载真实的
// app/web/reward-chest.js（读取 window.WTJ_MANIFEST.rewards.chest / .performance、订阅
// window.WTJ_SLOTS.onFull、调用 window.WTJ_AUDIO.playSfx、挂 window.WTJ_REWARD_CHEST）——与
// status-rewards.test.mjs/task-templates.test.mjs 同一手法：断言直接取自真实 manifest 数值
// （rewards.chest.fireworks.maxParticles=300、presetTypes 四种、sprite 路径），消除"手工镜像
// manifest 数值"的漂移风险。
//
// window.WTJ_SLOTS / WTJ_AUDIO 全部是本文件手写的可记录调用的 stub（011 消费它们暴露的
// API，不需要加载 010/016 的真实源码——那些各自已有独立的 durable 测试覆盖自己的判定逻辑）。
// WTJ_SLOTS stub 的 onFull 是多订阅者事件，本文件提供 fireSlotsFull() 模拟 010 真实广播
// "五槽刚好被填满"。
//
// 假时钟（与 status-rewards.test.mjs 的 makeFakeClock() 同款实现）：reward-chest.js 的整段
// 奖励序列（宝箱弹出、四种烟花错峰迸发、逐帧粒子模拟 tick、收尾清空）全部经由 clockRef.
// setTimeout/clearTimeout 调度（见 reward-chest.js 文件头「计时驱动方式」一节：刻意不用真实
// requestAnimationFrame，为了让单测能确定性快进整段粒子模拟），沙箱 global 不提供原生
// setTimeout/clearTimeout，因此本文件在加载完 reward-chest.js 之后立刻调用一次
// env.RC._setClock(...) 换成假时钟，虚拟时间由测试用 env.clock.advance(ms) 手动推进。
//
// 最小 document/DOM stub（createElement / appendChild / removeChild / remove）扩展了对
// <canvas> 标签的支持：width/height 可写属性 + getContext('2d') 返回一个可记录调用、不含
// shadowBlur 属性的假 2D context（clearRect/beginPath/arc/moveTo/lineTo/closePath/fill）。
// window.matchMedia stub 可配置 prefers-reduced-motion 的 matches 返回值。
//
// 跨 realm 陷阱（与 status-rewards.test.mjs/task-templates.test.mjs 的既有注记同一原因）：
// reward-chest.js 内部构造的 onChestComplete payload、_getParticles() 快照都是在 vm 沙箱
// realm 内创建的普通对象，逐字段比较，不用 assert.deepEqual 对整个跨 realm 对象做深比较；
// 本文件自己的 document/canvas stub 创建的 DOM 元素、slotsStub/audioStub 的 calls 记录对象
// 都在主 realm 创建，可以放心用 deepEqual。
//
// Run:  node --test tests/unit/reward-chest.test.mjs
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
var RC_JS_PATH = path.resolve(__dirname, '../../app/web/reward-chest.js');
var MANIFEST_SRC = readFileSync(MANIFEST_JS_PATH, 'utf8');
var RC_SRC = readFileSync(RC_JS_PATH, 'utf8');

// --- fake clock (与 status-rewards.test.mjs 的 makeFakeClock() 同款实现) -------------------
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
      var i;
      for (i = 0; i < timers.length; i++) {
        var t = timers[i];
        if (!t.cancelled && !t.fired && t.fireAt <= target) {
          if (next === null || t.fireAt < next.fireAt) {
            next = t;
          }
        }
      }
      if (!next) {
        break;
      }
      virtualNow = next.fireAt;
      next.fired = true;
      next.fn();
    }
    virtualNow = target;
  }

  return {
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    now: fakeNow,
    advance: advance
  };
}

// --- fake 2D context (共享一份，记录所有 canvas 的绘制调用) ---------------------------------
function makeFakeCtx() {
  var calls = [];
  return {
    calls: calls,
    fillStyle: '',
    globalAlpha: 1,
    clearRect: function () { calls.push('clearRect'); },
    beginPath: function () { calls.push('beginPath'); },
    arc: function () { calls.push('arc'); },
    fill: function () { calls.push('fill'); },
    moveTo: function () { calls.push('moveTo'); },
    lineTo: function () { calls.push('lineTo'); },
    closePath: function () { calls.push('closePath'); },
    save: function () {},
    restore: function () {}
  };
}

// --- fake document / DOM stub (扩展了 <canvas> 的 width/height/getContext) -----------------
function makeFakeDocument(sharedCtx) {
  function makeElement(tag) {
    var el = {
      tagName: tag,
      children: [],
      parentNode: null,
      style: {},
      attributes: {},
      className: '',
      src: '',
      alt: '',
      width: 0,
      height: 0,
      setAttribute: function (name, value) {
        this.attributes[name] = value;
      },
      getAttribute: function (name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
      },
      appendChild: function (child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      removeChild: function (child) {
        var idx = this.children.indexOf(child);
        if (idx !== -1) {
          this.children.splice(idx, 1);
        }
        child.parentNode = null;
        return child;
      },
      remove: function () {
        if (this.parentNode) {
          this.parentNode.removeChild(this);
        }
      }
    };
    if (tag === 'canvas') {
      el.getContext = function (type) {
        if (type === '2d') return sharedCtx;
        return null;
      };
    }
    return el;
  }

  var body = makeElement('body');
  var doc = {
    createElement: function (tag) {
      return makeElement(tag);
    },
    body: body
  };

  return { document: doc, body: body };
}

// --- WTJ_SLOTS stub (onFull 是多订阅者，镜像 010 的 addSubscriber 模式) ---------------------
function makeSlotsStub() {
  var fullHandlers = [];
  var resetCalls = 0;
  return {
    api: {
      onFull: function (fn) { fullHandlers.push(fn); },
      reset: function () { resetCalls++; }
    },
    fireFull: function (snapshot) {
      fullHandlers.forEach(function (fn) { fn(snapshot || { slotCount: 5, slots: [], full: true }); });
    },
    hasHandler: function () { return fullHandlers.length > 0; },
    getResetCalls: function () { return resetCalls; }
  };
}

// --- WTJ_HUD stub（WTJ-20260704-083 返工，PM 打回①：footer 常驻宝箱三态指示器接线）----------
// reward-chest.js 通过 callHudSetChestOpenDefensive(isOpen) 防御式调用 window.WTJ_HUD.
// setChestOpen(isOpen)，本文件不需要加载 hud.js 真实源码（hud.js 自己的三态状态机/渲染逻辑由
// tests/unit/hud.test.mjs 独立覆盖），只需要一个能记录调用参数的 stub，验证"何时调用、传了
// 什么值"这一层接线契约。
function makeHudStub() {
  var calls = [];
  return {
    api: {
      setChestOpen: function (isOpen) { calls.push(isOpen); }
    },
    calls: calls
  };
}

// --- WTJ_AUDIO stub --------------------------------------------------------------------------
function makeAudioStub() {
  var calls = [];
  return {
    api: {
      playSfx: function (arg) {
        calls.push(arg);
        return { then: function () {} }; // 模拟 thenable，覆盖 rejection-handler 挂载分支。
      }
    },
    calls: calls
  };
}

// --- WTJ_FRAME_ANIM stub (056) ----------------------------------------------------------------
// reward-chest.js 只消费 play()（见 showChest()/playChestOpeningAnimDefensive()），不需要加载
// frame-anim.js 真实源码——引擎自身的帧号/loop/reduced-motion 判定由 tests/unit/
// frame-anim.test.mjs 独立覆盖，与本文件对 WTJ_SLOTS/WTJ_AUDIO 一贯的"消费方只测自己这一层
// 逻辑"策略一致。playReturnValue 可控制 play() 的返回值，用于测试"引擎存在但 play() 失败"
// 这个防御式回退分支（见 showChest() 里 removeOverlayChild() 那一段）。
function makeFrameAnimStub(playReturnValue) {
  var playCalls = [];
  var stopCalls = []; // 056 P1-1：记录 stop(canvasEl) 调用，供"移除宝箱 canvas 前必须 stop()"断言。
  var returnValue = (typeof playReturnValue === 'boolean') ? playReturnValue : true;
  return {
    api: {
      play: function (canvasEl, prop, state, opts) {
        playCalls.push({ canvasEl: canvasEl, prop: prop, state: state, opts: opts });
        if (returnValue && opts && typeof opts.onComplete === 'function') {
          // 本 stub 不模拟真实的帧播放时序，测试如需验证 onComplete 行为可直接调用
          // env.frameAnimStub.fireOnComplete()。
        }
        return returnValue;
      },
      stop: function (canvasEl) {
        stopCalls.push(canvasEl);
      },
      preload: function () { return true; },
      getDuration: function () { return 500; },
      getState: function () { return { availableProps: ['faucet', 'horse', 'lamp', 'treasure-chest'], deferredProps: ['door', 'bell'], idleStopSec: 5, activePlaybacks: [] }; }
    },
    playCalls: playCalls,
    stopCalls: stopCalls,
    fireOnComplete: function () {
      var i;
      for (i = 0; i < playCalls.length; i++) {
        if (playCalls[i].opts && typeof playCalls[i].opts.onComplete === 'function') {
          playCalls[i].opts.onComplete();
        }
      }
    }
  };
}

// --- matchMedia stub -------------------------------------------------------------------------
function makeMatchMediaStub(initialReduced) {
  var reduced = !!initialReduced;
  var calls = [];
  return {
    fn: function (query) {
      calls.push(query);
      return { matches: reduced, media: query };
    },
    calls: calls,
    setReduced: function (value) { reduced = !!value; }
  };
}

// --- sandbox builder -----------------------------------------------------------------------
// opts.omitManifest: true 时不加载 manifest.js。opts.includeSlots/includeAudio/
// includeMatchMedia/includeFrameAnim: false 时不把对应依赖挂到 window 上（模拟缺失场景）。
// opts.reducedMotion: true 时 window.matchMedia('(prefers-reduced-motion: reduce)').matches
// 返回 true。opts.frameAnimPlayReturns: 056 起，控制 WTJ_FRAME_ANIM.play() 的返回值
// （默认 true），用于测试"引擎存在但 play() 失败"这个防御式回退分支。includeFrameAnim
// 默认 true——与 index.html 里 frame-anim.js 排在 reward-chest.js 之前的真实加载顺序一致。
function createSandbox(opts) {
  opts = opts || {};
  var warnCalls = [];
  var errorCalls = [];

  var sharedCtx = makeFakeCtx();
  var docStub = makeFakeDocument(sharedCtx);
  var slotsStub = makeSlotsStub();
  var audioStub = makeAudioStub();
  var hudStub = makeHudStub();
  var matchMediaStub = makeMatchMediaStub(opts.reducedMotion);
  var frameAnimStub = makeFrameAnimStub(opts.frameAnimPlayReturns);

  var fakeWindow = { innerWidth: 1024, innerHeight: 768 };
  if (opts.includeSlots !== false) fakeWindow.WTJ_SLOTS = slotsStub.api;
  if (opts.includeAudio !== false) fakeWindow.WTJ_AUDIO = audioStub.api;
  if (opts.includeHud !== false) fakeWindow.WTJ_HUD = hudStub.api;
  if (opts.includeMatchMedia !== false) fakeWindow.matchMedia = matchMediaStub.fn;
  if (opts.includeFrameAnim !== false) fakeWindow.WTJ_FRAME_ANIM = frameAnimStub.api;

  var sandbox = {
    window: fakeWindow,
    document: docStub.document,
    console: {
      log: function () {},
      warn: function () { warnCalls.push(Array.prototype.slice.call(arguments).join(' ')); },
      error: function () { errorCalls.push(Array.prototype.slice.call(arguments).join(' ')); }
    }
  };
  vm.createContext(sandbox);

  if (!opts.omitManifest) {
    vm.runInContext(opts.manifestOverrideSrc || MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  }
  vm.runInContext(RC_SRC, sandbox, { filename: 'reward-chest.js' });

  var clock = makeFakeClock();
  if (fakeWindow.WTJ_REWARD_CHEST && typeof fakeWindow.WTJ_REWARD_CHEST._setClock === 'function') {
    fakeWindow.WTJ_REWARD_CHEST._setClock({ setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, now: clock.now });
  }

  return {
    contextObject: sandbox,
    window: fakeWindow,
    RC: fakeWindow.WTJ_REWARD_CHEST,
    ctx: sharedCtx,
    slotsStub: slotsStub,
    audioStub: audioStub,
    hudStub: hudStub,
    matchMediaStub: matchMediaStub,
    frameAnimStub: frameAnimStub,
    clock: clock,
    warnCalls: warnCalls,
    errorCalls: errorCalls
  };
}

// 整段奖励序列的耗时上限（TOTAL_SEQUENCE_MS=2600，reward-chest.js 内部常量的占位值），测试用
// 一个足够大的前进量一次性冲过整个序列，不需要逐字段对齐内部常量。
var FULL_SEQUENCE_MS = 4000;

// ============================================================================================
// 1. 加载 + 订阅：window.WTJ_SLOTS.onFull 应该被订阅；真实 manifest 数值可读。
// ============================================================================================
test('加载后订阅 WTJ_SLOTS.onFull；getState() 反映真实 manifest 配置', function () {
  var env = createSandbox();
  assert.equal(env.slotsStub.hasHandler(), true, '011 应该订阅 010 的 onFull');

  var state = env.RC.getState();
  assert.equal(state.playing, false, '初始状态不应处于播放中');
  assert.equal(state.maxParticles, 300, '真实 manifest rewards.chest.fireworks.maxParticles 应为 300');
  // state.configuredPresetTypes 是在 vm 沙箱 realm 内构造的数组（不同 Array 全局构造函数），
  // 用 assert.deepEqual 对跨 realm 数组做深比较会误判失败（见文件头「跨 realm 陷阱」一节），
  // 改用 join(',') 转成主 realm 字符串再比较。
  assert.equal(state.configuredPresetTypes.join(','), ['starfield', 'sparkler', 'circle', 'star', 'heart'].join(','), '真实 manifest 五种预设类型应原样读出（WTJ-20260704-083 新增 heart）');
  assert.equal(state.spriteResolved, 'assets/sprites/treasure-chest.png', 'sprite 路径应解析为 assets/ 前缀（见 resolveSpritePath）');
  assert.ok(state.implementedForms.indexOf('fireworks') !== -1, 'implementedForms 应包含 fireworks');
});

// ============================================================================================
// 2. 五槽满触发：宝箱 Canvas（056 起用 WTJ_FRAME_ANIM 播放 opening）+ 背景光晕 + 烟花 Canvas
//    全部创建；播放一次 chest-open 音效。
// ============================================================================================
test('WTJ_SLOTS.onFull 触发后：宝箱 Canvas（WTJ_FRAME_ANIM 播放 opening）+ 背景光晕 + 烟花 Canvas 创建，playSfx("chest-open") 播放一次', function () {
  var env = createSandbox();

  env.slotsStub.fireFull({ slotCount: 5, slots: [], full: true });

  assert.equal(env.RC.getState().playing, true, '触发后应进入 playing 状态');
  assert.equal(env.audioStub.calls.length, 1, '触发时应播放一次奖励音效');
  assert.equal(env.audioStub.calls[0], 'chest-open', '应使用 audio.js 已登记的 chest-open sfxKey');

  var root = env.contextObject.document.body.children.filter(function (el) { return el.className === 'wtj-rc-root'; })[0];
  assert.ok(root, '触发瞬间奖励叠层容器应该已经创建');

  var chestEl = root.children.filter(function (el) { return el.className.indexOf('wtj-rc-chest') !== -1; })[0];
  assert.ok(chestEl, '宝箱本体元素应该已经创建（short-animation 表现）');
  // 056：宝箱本体从静态 <img> 换成了 <canvas>，内容由 WTJ_FRAME_ANIM.play() 驱动，CSS 入场
  // 编排（wtj-rc-chest-pop）类名不变。
  assert.equal(String(chestEl.tagName).toLowerCase(), 'canvas', '宝箱本体应挂载为 <canvas>（引擎驱动分帧内容），而不是静态 <img>');

  assert.equal(env.frameAnimStub.playCalls.length, 1, '应该调用过一次 WTJ_FRAME_ANIM.play() 播放宝箱开箱动效');
  var chestPlay = env.frameAnimStub.playCalls[0];
  assert.equal(chestPlay.canvasEl, chestEl, 'play() 的 canvasEl 应该正是宝箱本体那个 <canvas>');
  assert.equal(chestPlay.prop, 'treasure-chest', '应该播放 prop "treasure-chest"');
  assert.equal(chestPlay.state, 'opening', '应该播放 state "opening"');
  assert.equal(chestPlay.opts.loop, false, 'opening 是一次性动画，应显式传 loop:false');
  assert.equal(typeof chestPlay.opts.onComplete, 'function', '应该传 onComplete（当前是预留 no-op，见 playChestOpeningAnimDefensive() 内联注释）');

  var flashEl = root.children.filter(function (el) { return el.className.indexOf('wtj-rc-flash') !== -1; })[0];
  assert.ok(flashEl, '背景光晕闪烁元素应该已经创建（temporary-background-change 表现）');

  var canvasEl = root.children.filter(function (el) { return el.className.indexOf('wtj-rc-canvas') !== -1; })[0];
  assert.ok(canvasEl, '烟花 Canvas 应该已经创建');
  assert.equal(canvasEl.width, 1024, 'canvas 宽度应取 window.innerWidth');
  assert.equal(canvasEl.height, 768, 'canvas 高度应取 window.innerHeight');
});

// ============================================================================================
// 2b（056 防御式回退）：WTJ_FRAME_ANIM 整体缺失时，宝箱回退静态 <img>，其余表现（音效/背景
//    光晕/烟花/一次性收尾）不受影响——与 014 的 door/bell 回退同一取舍。
// ============================================================================================
test('宝箱开箱动效（056 防御式回退 a）：WTJ_FRAME_ANIM 整体缺失时，宝箱回退静态 <img>，其余奖励表现不受影响', function () {
  var env = createSandbox({ includeFrameAnim: false });

  env.slotsStub.fireFull();

  var root = env.contextObject.document.body.children.filter(function (el) { return el.className === 'wtj-rc-root'; })[0];
  var chestEl = root.children.filter(function (el) { return el.className.indexOf('wtj-rc-chest') !== -1; })[0];
  assert.ok(chestEl, '宝箱本体元素应该已经创建');
  assert.equal(String(chestEl.tagName).toLowerCase(), 'img', '引擎缺失时应回退静态 <img>');
  assert.equal(chestEl.src, 'assets/sprites/treasure-chest.png', '回退路径的宝箱贴图 src 应解析为已验收的 treasure-chest.png');

  assert.equal(env.audioStub.calls.length, 1, '引擎缺失不应影响音效播放');
  env.clock.advance(FULL_SEQUENCE_MS);
  assert.equal(env.RC.getState().playing, false, '引擎缺失时序列仍应正常收尾');
  assert.equal(env.slotsStub.getResetCalls(), 1, '引擎缺失时仍应调用 WTJ_SLOTS.reset() 开新一轮');
});

// ============================================================================================
// 2c（056 防御式回退 b）：WTJ_FRAME_ANIM 存在但 play() 返回 false（如 anim-manifest 缺
//    treasure-chest 条目）时，同样应该回退静态 <img>，不留下一个空白的 canvas。
// ============================================================================================
test('宝箱开箱动效（056 防御式回退 b）：WTJ_FRAME_ANIM.play() 返回 false 时，应移除已创建的空 canvas 并回退静态 <img>', function () {
  var env = createSandbox({ frameAnimPlayReturns: false });

  env.slotsStub.fireFull();

  var root = env.contextObject.document.body.children.filter(function (el) { return el.className === 'wtj-rc-root'; })[0];
  var chestElements = root.children.filter(function (el) { return el.className.indexOf('wtj-rc-chest') !== -1; });
  assert.equal(chestElements.length, 1, 'play() 失败后应该只留下一个宝箱本体元素（不应该残留失败的空 canvas）');
  assert.equal(String(chestElements[0].tagName).toLowerCase(), 'img', 'play() 失败后应回退静态 <img>');
  assert.equal(chestElements[0].src, 'assets/sprites/treasure-chest.png');
});

// ============================================================================================
// 3a. 烟花：五种预设类型全部触发（超过验收 3 的"至少 2 种"，WTJ-20260704-083 新增 heart）；
//     粒子数任意时刻不超过 manifest maxParticles(300) 上限（这是 spawnBurst() 强制的硬
//     不变量，不依赖 Math.random 的具体取值，用默认随机源即可稳定断言，不会 flaky）；
//     Canvas 出现绘制调用；全程无 shadowBlur。
// ============================================================================================
test('烟花：五种预设类型全部触发；任意时刻粒子数不超过 maxParticles(300)；无 shadowBlur', function () {
  var env = createSandbox();
  env.slotsStub.fireFull();

  // 逐步推进：五次烟花错峰在 0/320/680/1040/1360ms 触发，逐段推进确保每次 spawn 后立刻检查
  // 粒子数上限（而不是一次性推到序列结束——那样中间的峰值超限瞬间会被后续的死亡/清理掩盖）。
  // 这里只断言"不超过上限"这一硬不变量（spawnBurst 内部用 getMaxParticles()-particles.length
  // 做裁剪，与 Math.random 取值无关，任何随机序列下都成立），不依赖具体粒子数值，因此用默认
  // （未固定）的 Math.random 也不会 flaky；粒子数确实触顶到 300 的确定性验证见 3b。
  var checkpoints = [50, 400, 750, 1100, 1400, 1800, 2200];
  var i;
  for (i = 0; i < checkpoints.length; i++) {
    var target = checkpoints[i];
    var prevNow = env.clock.now();
    env.clock.advance(target - prevNow);
    var count = env.RC._getParticles().length;
    assert.ok(count <= 300, '任意时刻粒子数不应超过 manifest maxParticles(300)（t=' + target + 'ms 时为 ' + count + '）');
  }

  var state = env.RC.getState();
  // 同上：跨 realm 数组不用 deepEqual，转 join(',') 比较。
  assert.equal(state.implementedPresetTypes.slice().sort().join(','), ['circle', 'heart', 'sparkler', 'star', 'starfield'].sort().join(','), '应实现全部五种预设类型（超过验收要求的至少 2 种，含 WTJ-20260704-083 新增的 heart）');

  env.clock.advance(FULL_SEQUENCE_MS);
  // Canvas/shadowBlur 断言：ctx 记录的调用里应该出现 clearRect/beginPath/arc/fill/moveTo，
  // 且从未出现任何 shadowBlur 属性赋值。
  assert.ok(env.ctx.calls.indexOf('clearRect') !== -1, '应该调用过 ctx.clearRect（逐帧清屏）');
  assert.ok(env.ctx.calls.indexOf('arc') !== -1, '应该调用过 ctx.arc（圆点/心形粒子渲染共用 arc）');
  assert.ok(env.ctx.calls.indexOf('moveTo') !== -1, '应该调用过 ctx.moveTo（星形粒子路径渲染）');
  assert.equal(Object.prototype.hasOwnProperty.call(env.ctx, 'shadowBlur'), false, '不应该出现 ctx.shadowBlur 属性赋值（性能红线 disallowShadowBlur）');
});

// ============================================================================================
// 3b. 粒子上限（确定性）：固定 Math.random=0.9（让五批烟花的生命周期都足够长，前四批在
//     t=1040~1100ms 附近确实同时存活重叠），精确推导出 spawnBurst() 的裁剪在第 4 批（star）
//     生成时被触发——存活数应恰好触顶到 manifest maxParticles(300)，而不是"碰巧没超过"。
//     随后按各预设不同的生命周期精确推导出粒子数逐步回落（含 WTJ-20260704-083 新增的第 5 批
//     heart：它在 t=1360 生成时，circle 已在 t=1260 死亡腾出预算，因此 heart 的 40 个请求
//     不会被裁剪，全部生成），证明死亡粒子确实被清理、不会无限堆积。
// ============================================================================================
test('粒子上限（确定性推导）：固定 Math.random=0.9 时，五批错峰烟花应恰好把存活数顶满 300 后再逐步回落（含 heart）', function () {
  var env = createSandbox();
  vm.runInContext('Math.random = function () { return 0.9; };', env.contextObject, { filename: 'fake-random.js' });

  env.slotsStub.fireFull();

  // circle   life=900+0.9*400=1260ms（spawn @0，死亡@1260）
  // starfield life=1200+0.9*800=1920ms（spawn @320，死亡@2240）
  // sparkler life=500+0.9*300=770ms（spawn @680，死亡@1450）
  // star     life=1000+0.9*500=1450ms（spawn @1040，死亡@2490）
  // heart    life=900+0.9*500=1350ms（spawn @1360，死亡@2710，但会被 t=2600 的
  //          finishSequence() 提前清空，本用例的检查点均早于 2600，不涉及这条自然死亡）
  //   t=50   circle 已生成（budget 300-0=300，请求 80 -> 全部生成）                总计 80
  //   t=400  + starfield（budget 300-80=220，请求 100 -> 全部生成）                总计 180
  //   t=750  + sparkler（budget 300-180=120，请求 80 -> 全部生成）                 总计 260
  //   t=1100 + star（budget 300-260=40，请求 70 -> 只生成 40，裁剪生效！）         总计 300（=上限）
  //   t=1300 circle 已在 1260ms 死亡（300-80）                                     总计 220
  //   t=1400 + heart（budget 300-220=80，请求 40 -> 全部生成，未被裁剪）           总计 260
  //   t=1500 sparkler 已在 680+770=1450ms 死亡（260-80）                           总计 180
  //   t=2300 starfield 已在 320+1920=2240ms 死亡（180-100）                        总计 80（star 40 + heart 40）
  //   t=2550 star 已在 1040+1450=2490ms 死亡（80-40）                              总计 40（仅剩 heart 的 40）
  var trace = [
    { at: 50, expect: 80 },
    { at: 400, expect: 180 },
    { at: 750, expect: 260 },
    { at: 1100, expect: 300 },
    { at: 1300, expect: 220 },
    { at: 1400, expect: 260 },
    { at: 1500, expect: 180 },
    { at: 2300, expect: 80 },
    { at: 2550, expect: 40 }
  ];
  var i;
  for (i = 0; i < trace.length; i++) {
    var prevNow = env.clock.now();
    env.clock.advance(trace[i].at - prevNow);
    var count = env.RC._getParticles().length;
    assert.equal(count, trace[i].expect, 't=' + trace[i].at + 'ms 时存活粒子数应精确为 ' + trace[i].expect + '，实际=' + count);
  }
  assert.equal(env.RC.getState().maxParticles, 300, 'manifest maxParticles 应为 300（本次触顶验证的上限值）');

  // t=2550 时应仅剩 heart 一种预设存活（circle/sparkler/starfield/star 均已按上面推导死亡）。
  var remaining = env.RC._getParticles();
  var distinctRemainingPresets = remaining.map(function (p) { return p.preset; }).filter(function (v, idx, arr) { return arr.indexOf(v) === idx; });
  assert.equal(distinctRemainingPresets.join(','), 'heart', 't=2550 时应仅剩 heart 预设存活（其余四种均已死亡清理）');
});

// ============================================================================================
// 3c（WTJ-20260704-083，新预设 heart）：形状/预设标记正确；具备与其余预设相同的重力 + 阻力
//     物理（vy 会随时间在重力作用下变化，不是静止不动的贴纸）；固定 Math.random=0.9 后能
//     确定性地推导出生成数量（复用 3b 的 clockRef 时间点断言风格）；序列自然播完后清空干净。
// ============================================================================================
test('新预设 heart：shape/preset 标记正确、具备物理衰减、生成数量可确定性推导、序列结束后清空干净', function () {
  var env = createSandbox();
  vm.runInContext('Math.random = function () { return 0.9; };', env.contextObject, { filename: 'fake-random-heart.js' });

  env.slotsStub.fireFull();

  // heart 是 BURST_SCHEDULE 第 5 批，在 t=1360 生成；此时 circle（80 个，life=1260ms）已经
  // 在 t=1260 死亡腾出预算，40 个请求不会被裁剪，全部生成（与 3b 的逐时间点推导一致）。
  env.clock.advance(1380); // 略晚于生成时刻，确保这一批已经生成完毕
  var justSpawned = env.RC._getParticles().filter(function (p) { return p.preset === 'heart'; });
  assert.equal(justSpawned.length, 40, 't=1380 时应恰好存活 40 个 heart 粒子（生成时未被裁剪，见 3b 推导）');
  justSpawned.forEach(function (p) {
    assert.equal(p.shape, 'heart', 'heart 预设粒子的 shape 字段应为 heart（供 renderFrame 走 drawHeart 分支）');
    assert.ok(p.life > 0 && p.life <= 1400, 'heart 粒子的初始生命值应落在 900~1400ms 区间内（900 + Math.random()*500）');
    assert.ok(typeof p.color.css === 'string' && p.color.css.indexOf('hsl(') === 0, 'heart 粒子应使用色板 HSL 颜色（非纯 RGB 随机）');
  });

  // 物理衰减：GRAVITY_PX_S2=240、gravityScale=0.9，200ms 后 vy 应该比生成时刻更大（更趋向于
  // 向下坠落），证明 heart 粒子确实和其余预设共用同一套 update() 物理引擎。
  var vyAtSpawn = justSpawned[0].vy;
  env.clock.advance(200);
  var afterGravity = env.RC._getParticles().filter(function (p) { return p.preset === 'heart'; })[0];
  assert.ok(afterGravity.vy > vyAtSpawn, 'heart 粒子应受重力影响，200ms 后 vy 应比生成时刻更大（更趋向下落）');

  // 序列自然播完（t=2600 起 finishSequence() 清空一切，含尚未自然死亡的 heart：其 life 死亡
  // 时刻是 1360+1350=2710ms，晚于 2600，验证的正是"结束画面必须干净"这条，而不是巧合死光）。
  env.clock.advance(FULL_SEQUENCE_MS);
  var afterSequence = env.RC._getParticles().filter(function (p) { return p.preset === 'heart'; });
  assert.equal(afterSequence.length, 0, '序列自然播完后不应残留任何 heart 粒子（结束画面应干净）');
});

// ============================================================================================
// 4. 颜色策略：HSL 色板 + 微调，不是纯 RGB 随机。
// ============================================================================================
test('颜色策略：来自少量高质量 HSL 色板 + 微调，格式为 hsl(...)，色相落在色板附近', function () {
  var env = createSandbox();
  env.slotsStub.fireFull();
  env.clock.advance(50); // 让第一批（circle）烟花生成

  var particles = env.RC._getParticles();
  assert.ok(particles.length > 0, '应该已经生成粒子');

  // 5 个手工色板基色（见 reward-chest.js COLOR_PALETTE），HUE_JITTER=9 度的微调容差。
  var PALETTE_HUES = [45, 352, 275, 189, 38];
  var HUE_TOLERANCE = 9 + 1; // 留 1 度浮点/取整误差余量

  function hueDistance(a, b) {
    var d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  var i;
  for (i = 0; i < particles.length; i++) {
    var color = particles[i].color;
    assert.match(color.css, /^hsl\(\d+,\d+%,\d+%\)$/, '颜色应为 hsl(...) 格式字符串，不是 rgb(...)：实际=' + color.css);
    assert.ok(color.s >= 0 && color.s <= 100, '饱和度应在 0-100 范围内');
    assert.ok(color.l >= 0 && color.l <= 100, '亮度应在 0-100 范围内');

    var nearPalette = PALETTE_HUES.some(function (h) {
      return hueDistance(color.h, h) <= HUE_TOLERANCE;
    });
    assert.ok(nearPalette, '色相 ' + color.h + ' 应该落在 5 个色板基色 ± 微调容差范围内，不是完全随机的 0-360 色相');
  }
});

// P2（确定性验证）：覆盖 Math.random 为固定值 0.5，验证"色板挑选 + HSL 微调"这条计算链路本身
// ——固定随机源下应产出可预测的确定色值，证明颜色不是脱离色板的自由 RGB 随机。
test('颜色策略（确定性）：固定 Math.random=0.5 时，应精确落在色板基色（微调偏移为 0）', function () {
  var env = createSandbox();
  vm.runInContext('Math.random = function () { return 0.5; };', env.contextObject, { filename: 'fake-random.js' });

  env.slotsStub.fireFull();
  env.clock.advance(50);

  var particles = env.RC._getParticles();
  assert.ok(particles.length > 0, '应该已经生成粒子');

  // Math.random() 恒为 0.5 时：pickPaletteColor 的 idx = floor(0.5 * 5) = 2 -> COLOR_PALETTE[2]
  // = violet { h:275, s:68, l:62 }；jitterColor 的三个偏移量 (0.5*2-1)=0，即微调偏移为 0，
  // 颜色应精确等于基色本身。
  var expected = { h: 275, s: 68, l: 62, css: 'hsl(275,68%,62%)' };
  var i;
  for (i = 0; i < particles.length; i++) {
    // particles[i].color 是在 vm 沙箱 realm 内构造的普通对象（见文件头「跨 realm 陷阱」一节），
    // 逐字段比较，不用 assert.deepEqual 对整个跨 realm 对象做深比较。
    var color = particles[i].color;
    assert.equal(color.h, expected.h, '固定随机源下色相应精确等于色板基色 violet 的 h=275，实际=' + color.h);
    assert.equal(color.s, expected.s, '固定随机源下饱和度应精确等于色板基色 violet 的 s=68，实际=' + color.s);
    assert.equal(color.l, expected.l, '固定随机源下亮度应精确等于色板基色 violet 的 l=62，实际=' + color.l);
    assert.equal(color.css, expected.css, '固定随机源下 css 字符串应精确等于 ' + expected.css + '，实际=' + color.css);
  }
});

// ============================================================================================
// 5. 一次性不占屏：序列结束后 Canvas 清空、DOM 叠层子元素移除，不堆积；调用 WTJ_SLOTS.reset()；
//    onChestComplete 携带正确 payload。
// ============================================================================================
test('序列自然播完后：Canvas 清空、DOM 子元素移除、WTJ_SLOTS.reset() 被调用、onChestComplete emit', function () {
  var env = createSandbox();
  var completePayloads = [];
  env.RC.onChestComplete(function (payload) { completePayloads.push(payload); });

  env.slotsStub.fireFull();

  var root = env.contextObject.document.body.children.filter(function (el) { return el.className === 'wtj-rc-root'; })[0];
  assert.ok(root.children.length > 0, '触发瞬间叠层应该已经有子元素');

  env.clock.advance(FULL_SEQUENCE_MS);

  assert.equal(env.RC.getState().playing, false, '序列播完后应退出 playing 状态');
  assert.equal(root.children.length, 0, '序列播完后叠层子元素应该被清空，不应残留堆积');
  assert.equal(env.slotsStub.getResetCalls(), 1, '序列播完后应该调用一次 WTJ_SLOTS.reset()（验收 1）');

  assert.equal(completePayloads.length, 1, 'onChestComplete 应该 emit 一次');
  assert.equal(completePayloads[0].reducedMotion, false, '默认（无 matchMedia 或不匹配）reducedMotion 应为 false');
  assert.ok(Array.isArray(completePayloads[0].forms), 'payload.forms 应为数组');
  assert.ok(completePayloads[0].forms.indexOf('fireworks') !== -1, 'forms 应包含 fireworks');
  assert.ok(completePayloads[0].forms.indexOf('short-animation') !== -1, 'forms 应包含 short-animation');
  assert.ok(completePayloads[0].forms.indexOf('temporary-background-change') !== -1, 'forms 应包含 temporary-background-change');
  assert.ok(completePayloads[0].presetTypesFired.length >= 2, 'presetTypesFired 应至少包含 2 种预设类型（验收 3）');
  var distinctPresets = completePayloads[0].presetTypesFired.filter(function (v, idx, arr) { return arr.indexOf(v) === idx; });
  assert.ok(distinctPresets.length >= 2, 'presetTypesFired 去重后应至少 2 种不同预设类型');
  // WTJ-20260704-083：BURST_SCHEDULE 的 5 个条目各自不同 preset，fireBurst() 无条件 push
  // entry.preset（与是否被 maxParticles 预算裁剪无关），因此一整轮播完后应该恰好观察到全部
  // 5 种预设都被触发过一次，其中包含新增的 heart。
  assert.equal(distinctPresets.length, 5, '一整轮应恰好触发全部 5 种预设类型');
  assert.ok(distinctPresets.indexOf('heart') !== -1, 'presetTypesFired 应包含新增的 heart 预设');

  // 再触发一轮，确认第二轮同样干净收尾，不会因为清理不彻底而越来越多。
  env.slotsStub.fireFull();
  assert.ok(root.children.length > 0, '第二轮触发瞬间应重新出现叠层子元素');
  env.clock.advance(FULL_SEQUENCE_MS);
  assert.equal(root.children.length, 0, '第二轮播完后同样应该清空，不跨轮次累积');
  assert.equal(env.slotsStub.getResetCalls(), 2, '第二轮播完后 WTJ_SLOTS.reset() 应该被再调用一次（累计 2 次）');
  assert.equal(env.RC._getParticles().length, 0, '第二轮播完后不应残留任何存活粒子');
});

// ============================================================================================
// 5b（056 Fable 对抗评审 P1-1，内存泄漏防护）：宝箱 canvas 在被移除前必须调用
//    WTJ_FRAME_ANIM.stop()——否则引擎侧 non-loop playback 播完只停 tick、不移出注册表，
//    detached canvas + ctx + 注册表项逐轮泄漏。多轮触发后，每一轮的宝箱 canvas 都应被 stop()。
// ============================================================================================
test('P1-1：宝箱 canvas 在移除前调用 WTJ_FRAME_ANIM.stop()（避免引擎 playbacks 注册表逐轮泄漏）；多轮触发时每轮的宝箱 canvas 都被 stop()', function () {
  var env = createSandbox();

  var ROUNDS = 3;
  var chestCanvases = [];
  var r;
  for (r = 0; r < ROUNDS; r++) {
    env.slotsStub.fireFull();
    var root = env.contextObject.document.body.children.filter(function (el) { return el.className === 'wtj-rc-root'; })[0];
    var chestEl = root.children.filter(function (el) { return el.className.indexOf('wtj-rc-chest') !== -1; })[0];
    assert.ok(chestEl, '第 ' + (r + 1) + ' 轮应创建宝箱本体元素');
    assert.equal(String(chestEl.tagName).toLowerCase(), 'canvas', '第 ' + (r + 1) + ' 轮宝箱本体应是引擎驱动的 <canvas>');
    chestCanvases.push(chestEl);
    env.clock.advance(FULL_SEQUENCE_MS); // 播完 -> finishSequence -> clearOverlayChildren -> removeElementDefensive -> stop()
  }

  // 每一轮那个具体的宝箱 canvas 都应该出现在 stopCalls 里（引擎注册表项被显式移除，不泄漏）。
  var i;
  for (i = 0; i < chestCanvases.length; i++) {
    assert.ok(env.frameAnimStub.stopCalls.indexOf(chestCanvases[i]) !== -1, '第 ' + (i + 1) + ' 轮的宝箱 canvas 应该被 WTJ_FRAME_ANIM.stop() 过');
  }
  // play 与 stop 次数应对称（每轮各一次），不是"只 play 不 stop"逐轮堆积。
  var chestPlayCount = env.frameAnimStub.playCalls.filter(function (c) { return c.prop === 'treasure-chest'; }).length;
  assert.equal(chestPlayCount, ROUNDS, '每轮应 play 一次宝箱开箱动效');
  var chestStopCount = env.frameAnimStub.stopCalls.filter(function (el) { return chestCanvases.indexOf(el) !== -1; }).length;
  assert.equal(chestStopCount, ROUNDS, '每轮的宝箱 canvas 都应被 stop 一次（play/stop 对称，无泄漏）');
});

// ============================================================================================
// 5c（P1-1 补充）：reset() 外部中止路径同样应 stop() 宝箱 canvas（不只是自然播完路径）。
// ============================================================================================
test('P1-1：reset() 外部中止播放时，进行中的宝箱 canvas 也应被 WTJ_FRAME_ANIM.stop()', function () {
  var env = createSandbox();
  env.slotsStub.fireFull();
  var root = env.contextObject.document.body.children.filter(function (el) { return el.className === 'wtj-rc-root'; })[0];
  var chestEl = root.children.filter(function (el) { return el.className.indexOf('wtj-rc-chest') !== -1; })[0];
  assert.equal(String(chestEl.tagName).toLowerCase(), 'canvas');

  env.RC.reset(); // 家长退出等外部中止：立即清空叠层，路径也走 clearOverlayChildren -> removeElementDefensive。

  assert.ok(env.frameAnimStub.stopCalls.indexOf(chestEl) !== -1, 'reset() 中止时进行中的宝箱 canvas 也应被 stop()，不留下引擎注册表泄漏');
});

// ============================================================================================
// 6. 并发守卫：播放期间再次收到 onFull 应被忽略，不叠加第二套序列。
// ============================================================================================
test('并发守卫：播放期间再次收到 WTJ_SLOTS.onFull 应被忽略，不叠加第二套叠层/不重复 reset()', function () {
  var env = createSandbox();
  env.slotsStub.fireFull();

  var root = env.contextObject.document.body.children.filter(function (el) { return el.className === 'wtj-rc-root'; })[0];
  var childCountBefore = root.children.length;
  assert.ok(childCountBefore > 0, '播放中叠层应该已经有子元素');

  // 播放期间再次触发（理论上 010 不会这样做，但加一层防御）。
  env.slotsStub.fireFull();
  env.slotsStub.fireFull();

  assert.equal(root.children.length, childCountBefore, '播放期间重复触发不应叠加第二套叠层子元素');
  assert.ok(env.warnCalls.some(function (m) { return m.indexOf('已忽略') !== -1 || m.indexOf('并发守卫') !== -1; }), '应该有一条 console.warn 记录并发守卫生效');

  env.clock.advance(FULL_SEQUENCE_MS);
  assert.equal(env.slotsStub.getResetCalls(), 1, '重复触发被忽略后，整段序列仍只应该自然完成一次，WTJ_SLOTS.reset() 只调用一次');
});

// ============================================================================================
// 7. prefers-reduced-motion：烟花冻结为静态完成态，仍照常调用 WTJ_SLOTS.reset()。
// ============================================================================================
test('prefers-reduced-motion 命中时：烟花不逐帧运动，静态定格一帧；仍照常展示与移除、调用 reset()', function () {
  var env = createSandbox({ reducedMotion: true });
  var completePayloads = [];
  env.RC.onChestComplete(function (payload) { completePayloads.push(payload); });

  env.slotsStub.fireFull();

  var particlesAtTrigger = env.RC._getParticles();
  assert.ok(particlesAtTrigger.length > 0, 'reduced-motion 下仍应该生成一帧静态粒子（不是完全不显示）');
  var frozenSample = particlesAtTrigger[0];

  // 推进一段时间（远小于总时长），静态帧不应该发生位置变化（没有 tick 循环在跑）。
  env.clock.advance(500);
  var particlesLater = env.RC._getParticles();
  assert.equal(particlesLater.length, particlesAtTrigger.length, 'reduced-motion 下粒子数量不应该因为时间推进而改变（无 tick 循环）');
  assert.equal(particlesLater[0].x, frozenSample.x, 'reduced-motion 下粒子位置应该保持静止（x 不变）');
  assert.equal(particlesLater[0].y, frozenSample.y, 'reduced-motion 下粒子位置应该保持静止（y 不变）');

  env.clock.advance(FULL_SEQUENCE_MS);

  assert.equal(env.RC.getState().playing, false, 'reduced-motion 下序列同样应该正常收尾');
  assert.equal(env.slotsStub.getResetCalls(), 1, 'reduced-motion 下同样应该调用 WTJ_SLOTS.reset()');
  assert.equal(env.RC._getParticles().length, 0, 'reduced-motion 下收尾后同样应该清空粒子');
  assert.equal(completePayloads.length, 1, 'reduced-motion 下 onChestComplete 仍应该 emit 一次');
  assert.equal(completePayloads[0].reducedMotion, true, 'payload.reducedMotion 应反映 matchMedia 命中结果');
});

// ============================================================================================
// 8. reset() 外部中止：立即停止播放、清空叠层，不会级联调用 WTJ_SLOTS.reset()。
// ============================================================================================
test('reset() 外部中止播放（家长退出场景）：立即清空叠层，且不会级联调用 WTJ_SLOTS.reset()', function () {
  var env = createSandbox();
  env.slotsStub.fireFull();

  assert.equal(env.RC.getState().playing, true, '触发后应处于播放中');
  var root = env.contextObject.document.body.children.filter(function (el) { return el.className === 'wtj-rc-root'; })[0];
  assert.ok(root.children.length > 0, '中止前叠层应该有子元素');

  env.RC.reset();

  assert.equal(env.RC.getState().playing, false, 'reset() 后应退出播放状态');
  assert.equal(root.children.length, 0, 'reset() 应该立即清空叠层子元素');
  assert.equal(env.RC._getParticles().length, 0, 'reset() 应该立即清空粒子');
  assert.equal(env.slotsStub.getResetCalls(), 0, 'reset() 是外部中止，不应该级联调用 WTJ_SLOTS.reset()（与自然播完的语义不同）');

  // 中止之后遗留的定时器不应该在之后又触发一次收尾副作用。
  env.audioStub.calls.length = 0;
  env.clock.advance(FULL_SEQUENCE_MS);
  assert.equal(env.slotsStub.getResetCalls(), 0, 'reset() 之后不应该有遗留定时器触发 WTJ_SLOTS.reset()');

  // 中止之后应该能够正常开始新一轮。
  env.slotsStub.fireFull();
  assert.equal(env.RC.getState().playing, true, 'reset() 之后应该能重新被 onFull 触发');
  env.clock.advance(FULL_SEQUENCE_MS);
  assert.equal(env.slotsStub.getResetCalls(), 1, '新一轮自然播完后应该正常调用 WTJ_SLOTS.reset()');
});

// ============================================================================================
// 9. 防御式：WTJ_SLOTS / WTJ_AUDIO 缺失时加载都不应抛错；manifest 缺失时回退默认值。
// ============================================================================================
test('防御式：WTJ_SLOTS/WTJ_AUDIO/manifest 任一或全部缺失时加载都不抛错，API 仍挂载', function () {
  assert.doesNotThrow(function () {
    var env = createSandbox({ includeSlots: false, includeAudio: false });
    assert.ok(env.RC, 'window.WTJ_REWARD_CHEST 即使依赖缺失也应该挂载');
    assert.equal(typeof env.RC.getState, 'function', 'getState API 应该存在');
    assert.equal(typeof env.RC.onChestComplete, 'function', 'onChestComplete API 应该存在');
    assert.equal(typeof env.RC.reset, 'function', 'reset API 应该存在');
  }, 'WTJ_SLOTS/WTJ_AUDIO 缺失时不应该抛出异常');

  assert.doesNotThrow(function () {
    createSandbox({ omitManifest: true });
  }, 'window.WTJ_MANIFEST 缺失时不应该抛出异常（回退内置默认值）');

  assert.doesNotThrow(function () {
    var env = createSandbox({ includeSlots: false });
    // 没有 WTJ_SLOTS 时，没有触发入口，但其余 API 仍应可调用且不抛错。
    assert.equal(env.RC.getState().playing, false, '无法接收 onFull 时应该保持非播放状态');
    env.RC.reset();
  }, 'WTJ_SLOTS 缺失时不应该抛出异常');

  assert.doesNotThrow(function () {
    var env = createSandbox({ includeAudio: false });
    env.slotsStub.fireFull();
    env.clock.advance(FULL_SEQUENCE_MS);
    assert.equal(env.slotsStub.getResetCalls(), 1, 'WTJ_AUDIO 缺失时，完整序列仍应正常走完（防御式降级）并调用 reset()');
  }, 'WTJ_AUDIO 缺失时完整触发流程不应该抛出异常');
});

// ============================================================================================
// 10. playSfx 抛错是防御式调用：不应该影响其余流程。
// ============================================================================================
test('播放奖励音效是防御式调用：WTJ_AUDIO.playSfx 抛错不应该影响播放流程', function () {
  var env = createSandbox();
  env.window.WTJ_AUDIO = {
    playSfx: function () { throw new Error('boom'); }
  };

  assert.doesNotThrow(function () {
    env.slotsStub.fireFull();
  }, 'playSfx 内部抛错不应该向上冒泡');

  assert.equal(env.RC.getState().playing, true, '即使 playSfx 抛错，播放流程仍应该正常触发');
  assert.ok(env.errorCalls.some(function (m) { return m.indexOf('playSfx') !== -1; }), '应该有一条包含 playSfx 的 console.error 记录（已捕获异常）');

  env.clock.advance(FULL_SEQUENCE_MS);
  assert.equal(env.slotsStub.getResetCalls(), 1, 'playSfx 抛错不应该影响最终 WTJ_SLOTS.reset() 调用');
});

// ============================================================================================
// 11. 重复引入守卫：同一沙箱内重复执行源码不应该替换已有 API 或抛错。
// ============================================================================================
test('重复引入守卫：同一沙箱内二次加载 reward-chest.js 不应替换已有 API 或抛错', function () {
  var env = createSandbox();
  var firstApiRef = env.window.WTJ_REWARD_CHEST;
  assert.ok(Object.isFrozen(firstApiRef), 'window.WTJ_REWARD_CHEST 应该是 Object.freeze 冻结对象');

  assert.doesNotThrow(function () {
    vm.runInContext(RC_SRC, env.contextObject, { filename: 'reward-chest.js#2' });
  }, '二次加载不应该抛错（重复引入守卫应该让第二次执行直接 return）');

  assert.equal(env.window.WTJ_REWARD_CHEST, firstApiRef, '二次加载后 window.WTJ_REWARD_CHEST 引用应该保持不变（守卫生效，未被替换）');

  // 绑定加固：整体重赋值应该被拒绝（非 strict mode 下静默失败，属性描述符 writable:false）。
  var descriptor = Object.getOwnPropertyDescriptor(env.window, 'WTJ_REWARD_CHEST');
  assert.equal(descriptor.writable, false, 'window.WTJ_REWARD_CHEST 绑定应该是不可写的（绑定加固）');
  assert.equal(descriptor.configurable, false, 'window.WTJ_REWARD_CHEST 绑定应该是不可重配置的（绑定加固）');
});

// ============================================================================================
// 12. P2-1（Fable 对抗评审，闭环健壮性兜底）：runSequence 启动过程中抛错时，playing 必须被
//     复位、WTJ_SLOTS.reset() 仍被调用，后续 onFull 能重新触发——绝不能让 playing 永久卡 true
//     导致"发现槽 → 宝箱 → 下一轮"游戏闭环死锁。
// ============================================================================================
test('P2-1 兜底：runSequence 启动抛错时 playing 复位 + WTJ_SLOTS.reset() 仍被调用（闭环不死锁）', function () {
  var env = createSandbox();
  var completePayloads = [];
  env.RC.onChestComplete(function (payload) { completePayloads.push(payload); });

  // 注入一个会抛错的 setTimeout（模拟序列启动中途某未被单独 try/catch 的调用抛错，如坏时钟），
  // 其余时钟能力（clearTimeout/now）保持可用——_setClock 只替换传入的字段。
  env.RC._setClock({ setTimeout: function () { throw new Error('boom-setTimeout'); } });

  assert.doesNotThrow(function () {
    env.slotsStub.fireFull();
  }, 'runSequence 启动抛错不应该向上冒泡到 onFull 处理器');

  // 关键断言：即使启动抛错，playing 必须被复位、reset() 必须被调用（否则五槽永久满、闭环死锁）。
  assert.equal(env.RC.getState().playing, false, '启动抛错后 playing 必须被复位为 false（不能永久卡 true）');
  assert.equal(env.slotsStub.getResetCalls(), 1, '启动抛错的兜底路径仍应调用 WTJ_SLOTS.reset()，恢复五槽（否则闭环死锁）');
  assert.ok(env.errorCalls.some(function (m) { return m.indexOf('闭环') !== -1 || m.indexOf('兜底') !== -1; }), '应有一条兜底 console.error 记录');

  // 兜底路径也应清空叠层子元素（不残留半套宝箱/光晕/canvas 在屏幕上）。
  var root = env.contextObject.document.body.children.filter(function (el) { return el.className === 'wtj-rc-root'; })[0];
  if (root) {
    assert.equal(root.children.length, 0, '兜底收尾后叠层子元素应被清空，不残留半套表现');
  }

  // 恢复正常时钟后，后续 onFull 应能重新触发一整轮并自然播完——正面证明没有死锁。
  env.RC._setClock({ setTimeout: env.clock.setTimeout });
  env.slotsStub.fireFull();
  assert.equal(env.RC.getState().playing, true, '恢复时钟后新一轮 onFull 应能重新触发（未死锁）');
  env.clock.advance(FULL_SEQUENCE_MS);
  assert.equal(env.RC.getState().playing, false, '新一轮应能自然播完');
  assert.equal(env.slotsStub.getResetCalls(), 2, '新一轮自然播完后 WTJ_SLOTS.reset() 累计应为 2 次');
});

// ============================================================================================
// 13. P2-2（Fable 对抗评审，顺手加固）：reduced-motion 的静态定格帧 spawnStaticFrame() 也应
//     遵守 manifest maxParticles 上限，不再是性能红线的例外。用一个 maxParticles 被调成 < 24
//     的 manifest override 验证：静态帧生成数被裁剪到上限，而非固定 24。
// ============================================================================================
test('P2-2 加固：reduced-motion 静态定格帧遵守 maxParticles 上限（不再固定 24 破红线）', function () {
  // 把真实 manifest 里的 maxParticles: 300 全部改成 12（< 24），其余不动。getMaxParticles()
  // 优先读 rewards.chest.fireworks.maxParticles，改后为 12。
  var smallManifest = MANIFEST_SRC.replace(/maxParticles: 300/g, 'maxParticles: 12');
  assert.ok(smallManifest.indexOf('maxParticles: 12') !== -1, '前置检查：manifest override 应成功注入 maxParticles: 12');

  var env = createSandbox({ reducedMotion: true, manifestOverrideSrc: smallManifest });
  assert.equal(env.RC.getState().maxParticles, 12, 'override 后 getMaxParticles() 应读到 12');

  env.slotsStub.fireFull();

  var particles = env.RC._getParticles();
  assert.equal(particles.length, 12, '静态定格帧生成数应被裁剪到 maxParticles(12)，而不是固定 24（否则破性能红线）');
  assert.ok(particles.length <= 12, '任意情况下静态帧粒子数都不应超过 maxParticles 上限');

  // 序列仍应正常收尾（clamp 不影响 reduced-motion 分支其余逻辑）。
  env.clock.advance(FULL_SEQUENCE_MS);
  assert.equal(env.slotsStub.getResetCalls(), 1, '静态帧裁剪后序列仍应正常调用 WTJ_SLOTS.reset()');
  assert.equal(env.RC._getParticles().length, 0, '收尾后粒子应被清空');
});

// ============================================================================================
// 14（WTJ-20260704-083，开发机验收反馈③）：宝箱 footer 固定区域布局，不与 secretword.css 的
//     中心词命中图重叠。这是一条纯 CSS 静态数值契约——Node 沙箱没有真实布局引擎，无法渲染整个
//     页面做像素级重叠检测，因此改用正则从两份 CSS 源文本里抠出关键数值，做"防止今后又改回去
//     顶到屏幕中段"的回归断言。
// ============================================================================================
test('布局：reward-chest.css 的宝箱 footer 区域（bottom + max-height）与 secretword.css 的中心词图之间应留有安全间距，不重叠', function () {
  var RC_CSS_PATH = path.resolve(__dirname, '../../app/web/reward-chest.css');
  var SECRET_CSS_PATH = path.resolve(__dirname, '../../app/web/secretword.css');
  var rcCss = readFileSync(RC_CSS_PATH, 'utf8');
  var secretCss = readFileSync(SECRET_CSS_PATH, 'utf8');

  // 1) 宝箱本体收在 footer 固定区域：bottom 用 vh（视口高度）表达，不是自身可用高度的
  //    百分比（那样在窄高比窗口下会失控地顶向中段）；max-height 同样用 vh 表达，收窄视觉
  //    尺寸上限（不再是 clamp(...,300px) 这种可能顶到很高的写法）。
  var chestBlockMatch = rcCss.match(/\.wtj-rc-chest\s*\{[^}]*\}/);
  assert.ok(chestBlockMatch, '应能在 reward-chest.css 中找到 .wtj-rc-chest 规则块');
  var chestBlock = chestBlockMatch[0];

  var bottomMatch = chestBlock.match(/bottom:\s*([\d.]+)vh/);
  var maxHeightMatch = chestBlock.match(/max-height:\s*([\d.]+)vh/);
  assert.ok(bottomMatch, '.wtj-rc-chest 应该用 vh 单位声明 bottom（footer 固定区域，不随自身尺寸浮动）');
  assert.ok(maxHeightMatch, '.wtj-rc-chest 应该用 vh 单位声明 max-height（收窄视觉尺寸，不再无上限地顶向屏幕中段）');

  var bottomVh = parseFloat(bottomMatch[1]);
  var maxHeightVh = parseFloat(maxHeightMatch[1]);
  var chestTopVh = 100 - bottomVh - maxHeightVh; // 宝箱静态顶边距离视口顶部的百分比（vh）

  // 2) 中心词命中图（.wtj-secret-sprite）固定 top:50%（屏幕正中心）。不同视口宽高比下它的
  //    半高换算成 vh 会不同，这里不逐像素精确换算，而是约束一个更直接、不依赖具体视口比例的
  //    契约："宝箱 footer 区域的总高度预算（bottom+max-height）不超过 30vh"，则宝箱顶边至少
  //    落在 70vh；再额外要求顶边 >= 65vh（比 70vh 门槛更保守一点），与屏幕正中心（50vh）之间
  //    留出 >= 15vh 的安全间距，覆盖本产品目标机型（2014 MacBook Air 全屏 800~900px 高）与
  //    常见桌面分辨率下 .wtj-secret-sprite 实际半高不会超过 15vh 的情形。
  var secretSpriteBlockMatch = secretCss.match(/\.wtj-secret-sprite\s*\{[^}]*\}/);
  assert.ok(secretSpriteBlockMatch, '应能在 secretword.css 中找到 .wtj-secret-sprite 规则块');
  assert.ok(/top:\s*50%/.test(secretSpriteBlockMatch[0]), '.wtj-secret-sprite 应固定 top:50%（屏幕正中心），这是本测试安全间距估算的前提');

  assert.ok(bottomVh + maxHeightVh <= 30, '宝箱 footer 区域高度预算（bottom+max-height）应 <= 30vh，防止今后又改回顶到屏幕中段（当前=' + (bottomVh + maxHeightVh) + 'vh）');
  assert.ok(chestTopVh >= 65, '宝箱静态顶边应落在至少 65vh 处，与屏幕正中心（50vh）留出 >= 15vh 安全间距，不与 .wtj-secret-sprite 重叠（当前顶边=' + chestTopVh + 'vh）');
});

// ============================================================================================
// 15.（WTJ-20260704-083 返工，PM 打回①：footer 常驻宝箱三态指示器接线）本文件的一次性开箱
//     Canvas 序列本身就是 hud.js 常驻指示器的"Open"态（082 明确"打开态不是第三张静态图"）。
//     验证接线契约：onFull 触发序列开始时调用 WTJ_HUD.setChestOpen(true)；序列自然播完
//     （finishSequence）后调用 WTJ_HUD.setChestOpen(false)，让指示器退出 Open。
// ============================================================================================
test('15. footer 常驻宝箱指示器接线：onFull 触发时 setChestOpen(true)；序列自然播完后 setChestOpen(false)', function () {
  var env = createSandbox();

  env.slotsStub.fireFull();
  assert.deepEqual(env.hudStub.calls, [true], '序列开始时应该调用一次 WTJ_HUD.setChestOpen(true)（footer 指示器切到 Open）');

  env.clock.advance(FULL_SEQUENCE_MS);
  assert.deepEqual(env.hudStub.calls, [true, false], '序列自然播完后应该再调用一次 WTJ_HUD.setChestOpen(false)（footer 指示器退出 Open）');

  // 再来一轮，确认接线在多轮触发下依然对称（每轮各一次 true/false，不累积/不错位）。
  env.slotsStub.fireFull();
  assert.deepEqual(env.hudStub.calls, [true, false, true], '第二轮触发应该再调用一次 setChestOpen(true)');
  env.clock.advance(FULL_SEQUENCE_MS);
  assert.deepEqual(env.hudStub.calls, [true, false, true, false], '第二轮播完后应该再调用一次 setChestOpen(false)');
});

// ============================================================================================
// 16.（WTJ-20260704-083 返工）reset() 外部中止播放（家长退出等场景）时，同样应该调用
//     WTJ_HUD.setChestOpen(false)——否则 footer 指示器会永久卡在"看起来在打开"的视觉，
//     而没有其它路径能把它带回正确的 Active/Disabled（reset() 不级联 WTJ_SLOTS.reset()，
//     不会触发 hud.js 的 clearSlots() 强制回落）。
// ============================================================================================
test('16. reset() 外部中止播放时，也应调用 WTJ_HUD.setChestOpen(false)（不遗留指示器卡在 Open）', function () {
  var env = createSandbox();
  env.slotsStub.fireFull();
  assert.deepEqual(env.hudStub.calls, [true], '前置检查：触发后应该已经调用过 setChestOpen(true)');

  env.RC.reset();
  assert.deepEqual(env.hudStub.calls, [true, false], 'reset() 外部中止后应该调用 setChestOpen(false)，让 footer 指示器退出 Open');
});

// ============================================================================================
// 17. 防御式：window.WTJ_HUD 缺失时，整段触发流程不应该抛错，其余奖励表现不受影响。
// ============================================================================================
test('17. 防御式：window.WTJ_HUD 缺失时不抛错，整段奖励序列仍正常播放/收尾', function () {
  var env = createSandbox({ includeHud: false });

  assert.doesNotThrow(function () {
    env.slotsStub.fireFull();
  }, 'window.WTJ_HUD 缺失时触发 onFull 不应该抛错');

  assert.equal(env.RC.getState().playing, true, 'WTJ_HUD 缺失不应该影响奖励序列正常触发');

  env.clock.advance(FULL_SEQUENCE_MS);
  assert.equal(env.RC.getState().playing, false, 'WTJ_HUD 缺失时序列仍应正常收尾');
  assert.equal(env.slotsStub.getResetCalls(), 1, 'WTJ_HUD 缺失时仍应正常调用 WTJ_SLOTS.reset()');
});
