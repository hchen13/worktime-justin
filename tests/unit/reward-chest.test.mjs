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

// --- WTJ_REWARD_FIREWORKS stub (WTJ-20260706-005) --------------------------------------------
// reward-chest.js 现在把烟花委托给 window.WTJ_REWARD_FIREWORKS.play('molten-fountain', {...})
// 而不是自己内联粒子（BURST_SCHEDULE 五预设那套已被整体替换）。本文件只消费 play()/stop()，
// 不需要加载 reward-fireworks.js 真实源码——引擎自身的粒子物理/形态/性能红线/降级判定由
// tests/unit/reward-fireworks.test.mjs 独立覆盖，与本文件对 WTJ_SLOTS/WTJ_AUDIO/WTJ_FRAME_ANIM
// 一贯的"消费方只测自己这一层逻辑"策略一致。stub 只记录 play()/stop() 的调用参数，play() 返回
// 一个递增的 handle id（供 reward-chest.js 在 reset()/收尾时 stop(handle) 时回传断言）。
function makeFireworksStub() {
  var playCalls = [];
  var stopCalls = [];
  var nextHandle = 1;
  return {
    api: {
      play: function (styleId, opts) {
        var handle = nextHandle++;
        playCalls.push({ handle: handle, styleId: styleId, opts: opts });
        return handle;
      },
      stop: function (handle) {
        stopCalls.push(handle);
      },
      stopAll: function () {},
      reset: function () {},
      getState: function () {
        return { tier: 'normal', particleCount: 0, maxParticles: 300, activeEffects: 0, reducedMotion: false, degradeLevel: 0 };
      }
    },
    playCalls: playCalls,
    stopCalls: stopCalls,
    // 触发某次 play() 传入的 onComplete（stub 不模拟真实的时序，测试如需可显式触发）。
    fireOnComplete: function (idx) {
      var i = (typeof idx === 'number') ? idx : 0;
      if (playCalls[i] && playCalls[i].opts && typeof playCalls[i].opts.onComplete === 'function') {
        playCalls[i].opts.onComplete();
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
// opts.includeFireworks: WTJ-20260706-005 起，false 时不挂 WTJ_REWARD_FIREWORKS（模拟引擎缺失
// 的防御式降级）；默认 true。
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
  var fireworksStub = makeFireworksStub();

  var fakeWindow = { innerWidth: 1024, innerHeight: 768 };
  if (opts.includeSlots !== false) fakeWindow.WTJ_SLOTS = slotsStub.api;
  if (opts.includeAudio !== false) fakeWindow.WTJ_AUDIO = audioStub.api;
  if (opts.includeHud !== false) fakeWindow.WTJ_HUD = hudStub.api;
  if (opts.includeMatchMedia !== false) fakeWindow.matchMedia = matchMediaStub.fn;
  if (opts.includeFrameAnim !== false) fakeWindow.WTJ_FRAME_ANIM = frameAnimStub.api;
  // WTJ-20260706-005：默认挂上烟花引擎 stub（与 index.html 里 reward-fireworks.js 排在
  // reward-chest.js 之前的真实加载顺序一致）。includeFireworks:false 用于测试引擎缺失时的
  // 防御式降级分支（烟花不可用，其余奖励表现不受影响）。
  if (opts.includeFireworks !== false) fakeWindow.WTJ_REWARD_FIREWORKS = fireworksStub.api;

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
    fireworksStub: fireworksStub,
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
  // WTJ-20260706-005：粒子物理已委托给 WTJ_REWARD_FIREWORKS，getState() 不再暴露
  // configuredPresetTypes/implementedPresetTypes/colorStrategy/particleCount 四个旧字段；
  // 改为暴露 fireworksStyle（本文件调用引擎的哪个形态）。
  assert.equal(state.fireworksStyle, 'molten-fountain', 'getState().fireworksStyle 应为 chest-open 采用的 molten-fountain 形态（TL 决策 D2）');
  assert.equal(state.spriteResolved, 'assets/sprites/treasure-chest.png', 'sprite 路径应解析为 assets/ 前缀（见 resolveSpritePath）');
  assert.ok(state.implementedForms.indexOf('fireworks') !== -1, 'implementedForms 应包含 fireworks');
});

// ============================================================================================
// 1b（WTJ-20260706-005 新契约）：五槽满触发时，reward-chest.js 应调用一次
//    WTJ_REWARD_FIREWORKS.play('molten-fountain', {canvas: 烟花 Canvas, origin: chestOrigin(),
//    onComplete}) —— 取代此前自己内联的 BURST_SCHEDULE 五预设粒子系统。逐时间点粒子数/预设名/
//    颜色策略/shadowBlur/300 触顶等粒子物理断言已整体迁移到 tests/unit/reward-fireworks.test.mjs，
//    本文件只验"这一层接线"：正确的 style / canvas / origin / onComplete。
// ============================================================================================
test('1b. 触发时调用 WTJ_REWARD_FIREWORKS.play("molten-fountain", {canvas, origin, onComplete})，origin 取宝箱右下角锚点', function () {
  var env = createSandbox();
  env.slotsStub.fireFull();

  assert.equal(env.fireworksStub.playCalls.length, 1, '应该调用过一次 WTJ_REWARD_FIREWORKS.play()');
  var call = env.fireworksStub.playCalls[0];
  assert.equal(call.styleId, 'molten-fountain', '应播放 molten-fountain 形态（TL 决策 D2）');

  var root = env.contextObject.document.body.children.filter(function (el) { return el.className === 'wtj-rc-root'; })[0];
  var canvasEl = root.children.filter(function (el) { return el.className.indexOf('wtj-rc-canvas') !== -1; })[0];
  assert.equal(call.opts.canvas, canvasEl, 'play() 的 opts.canvas 应正是 reward-chest 自己拥有的 .wtj-rc-canvas（引擎借用它画粒子，canvas 生命周期仍归 011）');

  // origin = chestOrigin() = { x: w - clamp(16,4vw,32), y: h - 14 }；w=1024/h=768 时
  // 4vw=40.96 被 clamp 到上限 32，故 x=1024-32=992，y=768-14=754。
  assert.ok(call.opts.origin && typeof call.opts.origin.x === 'number' && typeof call.opts.origin.y === 'number', 'play() 的 opts.origin 应为像素坐标 {x,y}');
  assert.equal(call.opts.origin.x, 992, 'origin.x 应为宝箱右侧锚点（1024 - clamp(16,4vw=40.96,32)=1024-32=992）');
  assert.equal(call.opts.origin.y, 754, 'origin.y 应为宝箱底部锚点（768 - 14 = 754）');
  assert.equal(typeof call.opts.onComplete, 'function', '应传 onComplete（引擎自然播完时回调，本文件用来把本地 handle 记账清零）');
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
// 3（WTJ-20260706-005 迁移说明）：烟花逐时间点粒子数 / 五预设名 / 颜色策略 HSL 微调 / 300 触顶
//    裁剪 / shadowBlur 零调用 / reduced-motion 静态帧过同一预算——这些**粒子物理**断言此前
//    在本文件（reward-chest.test）用 reward-chest.js 内联的 BURST_SCHEDULE 五预设实现来验证。
//    005 卡把粒子引擎整体抽到 window.WTJ_REWARD_FIREWORKS 后，这些断言全部迁移到
//    tests/unit/reward-fireworks.test.mjs（对象换成引擎的 molten-fountain/starburst/round-bloom
//    三形态的分层衰减时间线 + 3×3 计数矩阵 + 并发触顶 300 + shadowBlur/gradient 陷阱 + 降级 +
//    reduced-motion 七个用例，照 docs/design-notes/WTJ-005-reward-fireworks-plan.md §6）。本文件
//    不再重复锁同一条时间线（TL 决策 D2「零两份锁」），只在上方 1b 验证"这一层接线"（正确的
//    style/canvas/origin/onComplete），下方 3-migrated 验证"烟花与序列时序解耦、reset 时 stop"。
// ============================================================================================
test('3-migrated. 烟花与序列时序解耦：play 在触发瞬间就调用一次（不错峰重复调用）；序列自然播完时不重复触发', function () {
  var env = createSandbox();
  env.slotsStub.fireFull();

  // 引擎是一次性 play(molten-fountain)——不是本文件此前的 BURST_SCHEDULE 五批错峰各调一次，
  // 因此触发瞬间就应恰好 1 次 play()，随后推进整段虚拟时间也不应再有第 2 次 play()（错峰
  // 时间线现在是引擎自己的形态内部实现，不再由本文件逐批 setTimeout 驱动）。
  assert.equal(env.fireworksStub.playCalls.length, 1, '触发瞬间应恰好调用一次 play()');
  env.clock.advance(FULL_SEQUENCE_MS);
  assert.equal(env.fireworksStub.playCalls.length, 1, '整段序列期间不应重复调用 play()（一次性 one-shot，不再是逐批错峰）');
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
  // WTJ-20260706-005：本文件现在只调用引擎的 molten-fountain 一个形态，presetTypesFired 恒为
  // 单元素 ['molten-fountain']（保留字段名/形状不破坏既有订阅者，见 reward-chest.js
  // finishSequence()）。此前"一整轮恰好 5 种预设"的断言随 BURST_SCHEDULE 一并迁移到引擎测试。
  assert.equal(completePayloads[0].presetTypesFired.join(','), 'molten-fountain', 'presetTypesFired 应为单元素 [molten-fountain]（005 起本文件只用引擎的这一个形态）');

  // 再触发一轮，确认第二轮同样干净收尾，不会因为清理不彻底而越来越多。
  env.slotsStub.fireFull();
  assert.ok(root.children.length > 0, '第二轮触发瞬间应重新出现叠层子元素');
  env.clock.advance(FULL_SEQUENCE_MS);
  assert.equal(root.children.length, 0, '第二轮播完后同样应该清空，不跨轮次累积');
  assert.equal(env.slotsStub.getResetCalls(), 2, '第二轮播完后 WTJ_SLOTS.reset() 应该被再调用一次（累计 2 次）');
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
// 5d（WTJ-20260706-005 P1-1 同类防泄漏，烟花引擎侧）：摘除烟花 Canvas（clearOverlayChildren）
//    前必须先调用 WTJ_REWARD_FIREWORKS.stop(handle)，否则引擎侧 playbacks 注册表会因为
//    "Canvas 已从 DOM 摘除但引擎仍持有引用"而泄漏（与宝箱 canvas 的 WTJ_FRAME_ANIM.stop() 同一
//    手法）。自然播完路径与 reset() 外部中止路径都应触发 stop()。
// ============================================================================================
test('5d. P1-1（烟花引擎）：序列自然播完 + reset() 中止，两条路径摘除烟花 Canvas 前都调用 WTJ_REWARD_FIREWORKS.stop(handle)', function () {
  // 自然播完路径
  var env = createSandbox();
  env.slotsStub.fireFull();
  var handle = env.fireworksStub.playCalls[0].handle;
  assert.equal(env.fireworksStub.stopCalls.length, 0, '播放中还不应 stop（引擎尚在自然播放）');
  env.clock.advance(FULL_SEQUENCE_MS);
  assert.ok(env.fireworksStub.stopCalls.indexOf(handle) !== -1, '自然播完 finishSequence -> clearOverlayChildren 摘 Canvas 前应 stop(handle)');

  // reset() 中止路径
  var env2 = createSandbox();
  env2.slotsStub.fireFull();
  var handle2 = env2.fireworksStub.playCalls[0].handle;
  env2.RC.reset();
  assert.ok(env2.fireworksStub.stopCalls.indexOf(handle2) !== -1, 'reset() 外部中止时同样应 stop(handle)，不留引擎注册表泄漏');
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
// 7. prefers-reduced-motion：本文件不再为烟花做 reduced-motion 分支——引擎自己检测并切换到
//    "静态定格一帧"（TL 决策 D3，具体行为由 tests/unit/reward-fireworks.test.mjs 覆盖）。本文件
//    只验证：命中 reduced-motion 时仍照常调用一次 play()、序列照常收尾/调 WTJ_SLOTS.reset()、
//    onChestComplete payload 的 reducedMotion 字段反映命中结果（供 QA 断言）。
// ============================================================================================
test('prefers-reduced-motion 命中时：仍照常调一次 play()（引擎自己切静态帧）、序列照常收尾并调 reset()、payload.reducedMotion=true', function () {
  var env = createSandbox({ reducedMotion: true });
  var completePayloads = [];
  env.RC.onChestComplete(function (payload) { completePayloads.push(payload); });

  env.slotsStub.fireFull();

  // 本文件不再按 reducedMotion 分叉烟花——无论是否 reduced，都调用一次 play()（引擎内部判定
  // reduced-motion 并切换到静态定格帧，见 reward-fireworks.js「prefers-reduced-motion」一节）。
  assert.equal(env.fireworksStub.playCalls.length, 1, 'reduced-motion 下仍应照常调用一次 play()（是否静态由引擎内部决定）');
  assert.equal(env.fireworksStub.playCalls[0].styleId, 'molten-fountain', '仍是 molten-fountain 形态');

  env.clock.advance(FULL_SEQUENCE_MS);

  assert.equal(env.RC.getState().playing, false, 'reduced-motion 下序列同样应该正常收尾');
  assert.equal(env.slotsStub.getResetCalls(), 1, 'reduced-motion 下同样应该调用 WTJ_SLOTS.reset()');
  assert.equal(completePayloads.length, 1, 'reduced-motion 下 onChestComplete 仍应该 emit 一次');
  assert.equal(completePayloads[0].reducedMotion, true, 'payload.reducedMotion 应反映 matchMedia 命中结果');
});

// ============================================================================================
// 7b（WTJ-20260706-005 防御式回退）：WTJ_REWARD_FIREWORKS 整体缺失时，烟花静默降级为
//    console.warn，其余奖励表现（宝箱本体/背景光晕/音效/序列收尾/清槽）不受影响。
// ============================================================================================
test('7b. 防御式：WTJ_REWARD_FIREWORKS 缺失时，烟花降级为 console.warn，其余奖励表现与序列收尾不受影响', function () {
  var env = createSandbox({ includeFireworks: false });

  assert.doesNotThrow(function () {
    env.slotsStub.fireFull();
  }, '烟花引擎缺失时触发 onFull 不应抛错');

  assert.equal(env.RC.getState().playing, true, '烟花引擎缺失不应影响奖励序列正常触发');
  assert.equal(env.audioStub.calls.length, 1, '烟花引擎缺失不应影响音效播放');
  assert.ok(env.warnCalls.some(function (m) { return m.indexOf('WTJ_REWARD_FIREWORKS') !== -1; }), '应有一条关于 WTJ_REWARD_FIREWORKS 缺失的 console.warn（防御式降级）');

  env.clock.advance(FULL_SEQUENCE_MS);
  assert.equal(env.RC.getState().playing, false, '烟花引擎缺失时序列仍应正常收尾');
  assert.equal(env.slotsStub.getResetCalls(), 1, '烟花引擎缺失时仍应调用 WTJ_SLOTS.reset() 开新一轮');
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
  assert.equal(env.fireworksStub.stopCalls.length, 1, 'reset() 应该 stop() 掉进行中的烟花播放（不残留引擎注册表项）');
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
// 13（WTJ-20260706-005 迁移说明）：reduced-motion 静态定格帧遵守 maxParticles 上限这条性能红线
//    此前由本文件的 spawnStaticFrame() 落地（P2-2 加固）。005 起该逻辑随粒子引擎整体迁到
//    window.WTJ_REWARD_FIREWORKS（reduced-motion 静态帧同样走 spawnList() 的共享预算裁剪，见
//    reward-fireworks.js「prefers-reduced-motion」一节），对应断言迁到
//    tests/unit/reward-fireworks.test.mjs 的用例⑦（reduced-motion 静态帧过同一 maxParticles
//    预算）。本文件不再持有 spawnStaticFrame()，此用例删除、不重复锁。
// ============================================================================================

// --- CSS clamp() 静态解析 helper（供下方测试 14 使用）--------------------------------------
// Node 沙箱没有真实布局引擎，没法渲染整个页面做像素级重叠检测；这里只对 clamp(min, Nvw, max)
// 这个具体形状的值做静态数值换算（不支持嵌套 calc()/其它函数，reward-chest.css / hud.css /
// secretword.css 目前用到的相关声明都是这个简单形状，够用即可）。
function parseClampParts(clampText) {
  var inner = clampText.slice(clampText.indexOf('(') + 1, clampText.lastIndexOf(')'));
  var parts = inner.split(',').map(function (s) { return s.trim(); });
  return { min: parts[0], preferred: parts[1], max: parts[2] };
}

function resolveClampPx(clampText, viewportWidthPx) {
  var parts = parseClampParts(clampText);
  var minPx = parseFloat(parts.min);
  var maxPx = parseFloat(parts.max);
  var preferredPx = /vw\s*$/.test(parts.preferred)
    ? (parseFloat(parts.preferred) / 100) * viewportWidthPx
    : parseFloat(parts.preferred);
  if (preferredPx < minPx) return minPx;
  if (preferredPx > maxPx) return maxPx;
  return preferredPx;
}

// 只用于逐字比较两份 CSS 里的 clamp() 声明是否是"同一组数值"，抹平空格书写差异
// （"clamp(16px, 4vw, 32px)" 与 "clamp(16px,4vw,32px)" 应视为相同）。
function normalizeClampText(clampText) {
  return clampText.replace(/\s+/g, '');
}

// ============================================================================================
// 14（WTJ-20260705-019，验收④ —— 取代 083 那条"宝箱 footer 固定区域 + 垂直 vh 安全间距代理"的
//     旧契约）：宝箱本体这次从"水平居中的 footer 区域"挪到"footer 右侧"，与 hud.js 常驻的
//     footer 宝箱三态指示器（`.wtj-hud-chest-lane`）共用同一组锚点数值。重叠风险的来源也随之
//     改变——旧版宝箱水平居中、垂直方向可能顶向屏幕中段，所以旧测试断言的是"顶边距离屏幕正
//     中心 >= 15vh"这个垂直代理；新版宝箱固定在右侧，不再水平居中，与同样固定水平居中的
//     .wtj-secret-sprite（中心词命中图）之间的潜在重叠只可能发生在水平方向，因此本测试改为
//     核算两者的水平净空，不再论证 chestTopVh 这个已经不适用的垂直代理（bottom 也已经从 vh
//     改成 px，vh 代理的前提本身也不再成立）。这是"防止设计稿存在但运行版未接入"的可复用视觉
//     回归门之一（见卡片验收⑦），配合 tests/reports/hud-footer-019/before/04-chest-open-pop.png
//     的回归证据（旧版画布正中弹出）与 after/ 同名截图对比。
// ============================================================================================
test('14. 布局：reward-chest.css 的 .wtj-rc-chest 改为右/下锚定，数值复用 hud.css 的 .wtj-hud-chest-lane；与屏幕水平居中的 .wtj-secret-sprite 之间应留有水平净空，不重叠', function () {
  var RC_CSS_PATH = path.resolve(__dirname, '../../app/web/reward-chest.css');
  var HUD_CSS_PATH = path.resolve(__dirname, '../../app/web/hud.css');
  var SECRET_CSS_PATH = path.resolve(__dirname, '../../app/web/secretword.css');
  var rcCss = readFileSync(RC_CSS_PATH, 'utf8');
  var hudCss = readFileSync(HUD_CSS_PATH, 'utf8');
  var secretCss = readFileSync(SECRET_CSS_PATH, 'utf8');

  // 1) .wtj-rc-chest 不应该再是旧的水平居中写法（left:50%），应该是 right/bottom 右锚定。
  var chestBlockMatch = rcCss.match(/\.wtj-rc-chest\s*\{[^}]*\}/);
  assert.ok(chestBlockMatch, '应能在 reward-chest.css 中找到 .wtj-rc-chest 规则块');
  var chestBlock = chestBlockMatch[0];
  assert.equal(/left:\s*50%/.test(chestBlock), false, '.wtj-rc-chest 不应该再有水平居中的 left:50%（WTJ-20260705-019 起改为右锚定，不是居中）');

  var chestRightMatch = chestBlock.match(/right:\s*(clamp\([^)]*\))/);
  var chestBottomMatch = chestBlock.match(/bottom:\s*([\d.]+px)/);
  assert.ok(chestRightMatch, '.wtj-rc-chest 应该用 right 声明右锚定位置');
  assert.ok(chestBottomMatch, '.wtj-rc-chest 应该用 px 单位声明 bottom（与 hud.css 的 chest-lane 同源，不再是 vh）');

  // 2) 数值应与 hud.css `.wtj-hud-chest-lane` 完全一致——两个宝箱视觉（本文件这个一次性开箱
  //    大奖励序列 + hud.js 那个 footer 常驻小指示器）复用同一组锚点，出现在屏幕同一个位置，
  //    不是两处各写各的数字、恰好长得像。
  var hudChestLaneBlockMatch = hudCss.match(/\.wtj-hud-chest-lane\s*\{[^}]*\}/);
  assert.ok(hudChestLaneBlockMatch, '应能在 hud.css 中找到 .wtj-hud-chest-lane 规则块');
  var hudChestLaneBlock = hudChestLaneBlockMatch[0];
  var hudRightMatch = hudChestLaneBlock.match(/right:\s*(clamp\([^)]*\))/);
  var hudBottomMatch = hudChestLaneBlock.match(/bottom:\s*([\d.]+px)/);
  assert.ok(hudRightMatch, '.wtj-hud-chest-lane 应该用 right 声明右锚定位置');
  assert.ok(hudBottomMatch, '.wtj-hud-chest-lane 应该用 px 单位声明 bottom');

  assert.equal(normalizeClampText(chestRightMatch[1]), normalizeClampText(hudRightMatch[1]), '.wtj-rc-chest 的 right 值应与 .wtj-hud-chest-lane 一致（同一组锚点数值，见 019 卡实现 brief）');
  assert.equal(chestBottomMatch[1], hudBottomMatch[1], '.wtj-rc-chest 的 bottom 值应与 .wtj-hud-chest-lane 一致');

  // 3) 水平净空核算（取代旧的 bottom+max-height<=30vh 垂直代理）：.wtj-secret-sprite 固定
  //    left:50%（屏幕水平正中心），宽度上限 clamp(96px,16vw,200px)（见 secretword.css）；
  //    宝箱现在右锚定、不再水平居中，天然与中心词图分处屏幕左右两侧。用本产品既有的目标机型
  //    参考宽度（1440px——app/PERFORMANCE.md 第 3.3 节「目标机分辨率 1440x900@1x」这一既有
  //    事实，letter-motion.js 的 MAC_TARGET_MAX_WIDTH_PX 已经在用同一个数字，非本测试臆造）
  //    把两份 clamp() 换算成具体像素，断言中心词图右边缘与宝箱左边缘之间留有 >= 20px 净空
  //    （20px 复用 082 doc「宝箱与槽位组至少 20px 视觉间距」同一条既有间距惯例，manifest.js
  //    的 rewards.chest.footerIndicator.minGapFromSlotsPx 也是这个数字，不是另起的新数字）。
  var REFERENCE_VIEWPORT_PX = 1440;
  var MIN_HORIZONTAL_GAP_PX = 20;

  var secretSpriteBlockMatch = secretCss.match(/\.wtj-secret-sprite\s*\{[^}]*\}/);
  assert.ok(secretSpriteBlockMatch, '应能在 secretword.css 中找到 .wtj-secret-sprite 规则块');
  var secretBlock = secretSpriteBlockMatch[0];
  assert.ok(/left:\s*50%/.test(secretBlock), '.wtj-secret-sprite 应固定 left:50%（屏幕水平正中心），这是本测试水平净空核算的前提');
  var secretWidthMatch = secretBlock.match(/width:\s*(clamp\([^)]*\))/);
  assert.ok(secretWidthMatch, '.wtj-secret-sprite 应该用 clamp() 声明 width');

  var secretWidthPx = resolveClampPx(secretWidthMatch[1], REFERENCE_VIEWPORT_PX);
  var secretRightEdgePx = REFERENCE_VIEWPORT_PX / 2 + secretWidthPx / 2; // left:50% + 半宽

  var chestRightOffsetPx = resolveClampPx(chestRightMatch[1], REFERENCE_VIEWPORT_PX);
  var chestWidthMatch = chestBlock.match(/width:\s*(clamp\([^)]*\))/);
  assert.ok(chestWidthMatch, '.wtj-rc-chest 应该用 clamp() 声明 width');
  var chestWidthPx = resolveClampPx(chestWidthMatch[1], REFERENCE_VIEWPORT_PX);
  var chestLeftEdgePx = REFERENCE_VIEWPORT_PX - chestRightOffsetPx - chestWidthPx;

  var horizontalGapPx = chestLeftEdgePx - secretRightEdgePx;
  assert.ok(
    horizontalGapPx >= MIN_HORIZONTAL_GAP_PX,
    '参考视口宽度(' + REFERENCE_VIEWPORT_PX + 'px)下，中心词图右边缘(' + secretRightEdgePx +
      'px)与宝箱左边缘(' + chestLeftEdgePx + 'px)之间的水平净空应 >= ' + MIN_HORIZONTAL_GAP_PX +
      'px（当前=' + horizontalGapPx + 'px），不与 .wtj-secret-sprite 重叠'
  );
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
