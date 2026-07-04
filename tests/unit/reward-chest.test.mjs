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
// includeMatchMedia: false 时不把对应依赖挂到 window 上（模拟缺失场景）。
// opts.reducedMotion: true 时 window.matchMedia('(prefers-reduced-motion: reduce)').matches
// 返回 true。
function createSandbox(opts) {
  opts = opts || {};
  var warnCalls = [];
  var errorCalls = [];

  var sharedCtx = makeFakeCtx();
  var docStub = makeFakeDocument(sharedCtx);
  var slotsStub = makeSlotsStub();
  var audioStub = makeAudioStub();
  var matchMediaStub = makeMatchMediaStub(opts.reducedMotion);

  var fakeWindow = { innerWidth: 1024, innerHeight: 768 };
  if (opts.includeSlots !== false) fakeWindow.WTJ_SLOTS = slotsStub.api;
  if (opts.includeAudio !== false) fakeWindow.WTJ_AUDIO = audioStub.api;
  if (opts.includeMatchMedia !== false) fakeWindow.matchMedia = matchMediaStub.fn;

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
    matchMediaStub: matchMediaStub,
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
  assert.equal(state.configuredPresetTypes.join(','), ['starfield', 'sparkler', 'circle', 'star'].join(','), '真实 manifest 四种预设类型应原样读出');
  assert.equal(state.spriteResolved, 'assets/sprites/treasure-chest.png', 'sprite 路径应解析为 assets/ 前缀（见 resolveSpritePath）');
  assert.ok(state.implementedForms.indexOf('fireworks') !== -1, 'implementedForms 应包含 fireworks');
});

// ============================================================================================
// 2. 五槽满触发：宝箱 DOM + 背景光晕 + Canvas 全部创建；播放一次 chest-open 音效。
// ============================================================================================
test('WTJ_SLOTS.onFull 触发后：宝箱图 + 背景光晕 + Canvas 创建，playSfx("chest-open") 播放一次', function () {
  var env = createSandbox();

  env.slotsStub.fireFull({ slotCount: 5, slots: [], full: true });

  assert.equal(env.RC.getState().playing, true, '触发后应进入 playing 状态');
  assert.equal(env.audioStub.calls.length, 1, '触发时应播放一次奖励音效');
  assert.equal(env.audioStub.calls[0], 'chest-open', '应使用 audio.js 已登记的 chest-open sfxKey');

  var root = env.contextObject.document.body.children.filter(function (el) { return el.className === 'wtj-rc-root'; })[0];
  assert.ok(root, '触发瞬间奖励叠层容器应该已经创建');

  var chestImg = root.children.filter(function (el) { return el.className.indexOf('wtj-rc-chest') !== -1; })[0];
  assert.ok(chestImg, '宝箱本体 <img> 应该已经创建（short-animation 表现）');
  assert.equal(chestImg.src, 'assets/sprites/treasure-chest.png', '宝箱贴图 src 应该解析为已验收的 treasure-chest.png');

  var flashEl = root.children.filter(function (el) { return el.className.indexOf('wtj-rc-flash') !== -1; })[0];
  assert.ok(flashEl, '背景光晕闪烁元素应该已经创建（temporary-background-change 表现）');

  var canvasEl = root.children.filter(function (el) { return el.className.indexOf('wtj-rc-canvas') !== -1; })[0];
  assert.ok(canvasEl, '烟花 Canvas 应该已经创建');
  assert.equal(canvasEl.width, 1024, 'canvas 宽度应取 window.innerWidth');
  assert.equal(canvasEl.height, 768, 'canvas 高度应取 window.innerHeight');
});

// ============================================================================================
// 3a. 烟花：四种预设类型全部触发（超过验收 3 的"至少 2 种"）；粒子数任意时刻不超过 manifest
//     maxParticles(300) 上限（这是 spawnBurst() 强制的硬不变量，不依赖 Math.random 的具体取值，
//     用默认随机源即可稳定断言，不会 flaky）；Canvas 出现绘制调用；全程无 shadowBlur。
// ============================================================================================
test('烟花：四种预设类型全部触发；任意时刻粒子数不超过 maxParticles(300)；无 shadowBlur', function () {
  var env = createSandbox();
  env.slotsStub.fireFull();

  // 逐步推进：四次烟花错峰在 0/320/680/1040ms 触发，逐段推进确保每次 spawn 后立刻检查
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
  assert.equal(state.implementedPresetTypes.slice().sort().join(','), ['circle', 'sparkler', 'star', 'starfield'].sort().join(','), '应实现全部四种预设类型（超过验收要求的至少 2 种）');

  env.clock.advance(FULL_SEQUENCE_MS);
  // Canvas/shadowBlur 断言：ctx 记录的调用里应该出现 clearRect/beginPath/arc/fill/moveTo，
  // 且从未出现任何 shadowBlur 属性赋值。
  assert.ok(env.ctx.calls.indexOf('clearRect') !== -1, '应该调用过 ctx.clearRect（逐帧清屏）');
  assert.ok(env.ctx.calls.indexOf('arc') !== -1, '应该调用过 ctx.arc（圆点粒子渲染）');
  assert.ok(env.ctx.calls.indexOf('moveTo') !== -1, '应该调用过 ctx.moveTo（星形粒子路径渲染）');
  assert.equal(Object.prototype.hasOwnProperty.call(env.ctx, 'shadowBlur'), false, '不应该出现 ctx.shadowBlur 属性赋值（性能红线 disallowShadowBlur）');
});

// ============================================================================================
// 3b. 粒子上限（确定性）：固定 Math.random=0.9（让四批烟花的生命周期都足够长，四批在
//     t=1040~1100ms 附近确实同时存活重叠），精确推导出 spawnBurst() 的裁剪在第 4 批（star）
//     生成时被触发——存活数应恰好触顶到 manifest maxParticles(300)，而不是"碰巧没超过"。
//     随后按各预设不同的生命周期精确推导出粒子数逐步回落，证明死亡粒子确实被清理、不会无限堆积。
// ============================================================================================
test('粒子上限（确定性推导）：固定 Math.random=0.9 时，四批错峰烟花应恰好把存活数顶满 300 后再逐步回落', function () {
  var env = createSandbox();
  vm.runInContext('Math.random = function () { return 0.9; };', env.contextObject, { filename: 'fake-random.js' });

  env.slotsStub.fireFull();

  // circle life=900+0.9*400=1260ms（spawn @0）   starfield life=1200+0.9*800=1920ms（spawn @320）
  // sparkler life=500+0.9*300=770ms（spawn @680）  star life=1000+0.9*500=1450ms（spawn @1040）
  //   t=50   circle 已生成（budget 300-0=300，请求 80 -> 全部生成）                总计 80
  //   t=400  + starfield（budget 300-80=220，请求 100 -> 全部生成）                总计 180
  //   t=750  + sparkler（budget 300-180=120，请求 80 -> 全部生成）                 总计 260
  //   t=1100 + star（budget 300-260=40，请求 70 -> 只生成 40，裁剪生效！）         总计 300（=上限）
  //   t=1300 circle 已在 1260ms 死亡（300-80）                                     总计 220
  //   t=1500 sparkler 已在 680+770=1450ms 死亡（220-80）                           总计 140
  //   t=2300 starfield 已在 320+1920=2240ms 死亡（140-100）                        总计 40（仅剩 star 的 40）
  var trace = [
    { at: 50, expect: 80 },
    { at: 400, expect: 180 },
    { at: 750, expect: 260 },
    { at: 1100, expect: 300 },
    { at: 1300, expect: 220 },
    { at: 1500, expect: 140 },
    { at: 2300, expect: 40 }
  ];
  var i;
  for (i = 0; i < trace.length; i++) {
    var prevNow = env.clock.now();
    env.clock.advance(trace[i].at - prevNow);
    var count = env.RC._getParticles().length;
    assert.equal(count, trace[i].expect, 't=' + trace[i].at + 'ms 时存活粒子数应精确为 ' + trace[i].expect + '，实际=' + count);
  }
  assert.equal(env.RC.getState().maxParticles, 300, 'manifest maxParticles 应为 300（本次触顶验证的上限值）');
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

  // 再触发一轮，确认第二轮同样干净收尾，不会因为清理不彻底而越来越多。
  env.slotsStub.fireFull();
  assert.ok(root.children.length > 0, '第二轮触发瞬间应重新出现叠层子元素');
  env.clock.advance(FULL_SEQUENCE_MS);
  assert.equal(root.children.length, 0, '第二轮播完后同样应该清空，不跨轮次累积');
  assert.equal(env.slotsStub.getResetCalls(), 2, '第二轮播完后 WTJ_SLOTS.reset() 应该被再调用一次（累计 2 次）');
  assert.equal(env.RC._getParticles().length, 0, '第二轮播完后不应残留任何存活粒子');
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
