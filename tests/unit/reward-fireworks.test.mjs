// WTJ-20260706-005 — reward-fireworks.js 单元测试（引擎 durable QA 资产）
//
// 用 Node 内置 vm 模块搭一个沙箱 context，按 index.html 的真实加载顺序在同一 sandbox 里先加载
// 真实的 app/web/manifest.js（其 IIFE 会 window.WTJ_MANIFEST = deepFreeze(...)，本文件读取
// performance.maxParticles=300 / particleTier='normal'），再加载真实的
// app/web/reward-fireworks.js（挂 window.WTJ_REWARD_FIREWORKS）。断言直接取自真实 manifest
// 数值，消除"手工镜像 manifest 数值"的漂移风险（与 reward-chest.test.mjs / status-rewards.test.mjs
// 同一手法）。
//
// 消费方（reward-chest.js / status-rewards.js）如何接线本引擎，由它们各自的单测用 stub 覆盖
// （reward-chest.test.mjs / status-rewards.test.mjs 只记录 play()/stop() 参数）；本文件反过来
// 只验引擎自己这一层的粒子物理/形态/性能红线/降级/reduced-motion 判定——这正是 D2「零两份锁」
// 的落地：逐时间点粒子数/3×3 计数矩阵/并发触顶 300/shadowBlur·gradient 陷阱/降级/静态帧 全部
// 只在本文件锁一次。
//
// 可注入依赖（照 docs/design-notes/WTJ-005-reward-fireworks-plan.md §6）：
//   _setClock(clock)  —— makeFakeClock（虚拟时间，advance(ms) 手动推进）驱动 tick 链；另有
//                        makeManualClock（逐 tick 手动喂任意 dt）供降级用例精确控制 tick dt。
//   _setRandom(fn)    —— mulberry32(seed) 确定性 PRNG，复现某触发瞬间的粒子分布/生命值。
//   _getParticles(h?) —— 省略 handle 返回全部并发 playback 的粒子快照拼接；传 handle 只返回该次。
//   getState()        —— { tier, particleCount, maxParticles, activeEffects, reducedMotion,
//                        degradeLevel }。
//
// 假 2D context（makeFakeCtx）：给 shadowBlur 装 Object.defineProperty setter 陷阱（任何一次
// 赋值都会累加共享计数器），并对 createRadialGradient/createLinearGradient 计数——用例⑤据此
// 断言"play 后整个 tick 期间 shadowBlur 赋值 0 次、渲染路径（overlay canvas 的 ctx）0 次
// gradient 调用"（构建期 buildSprite 在 28px 小 sprite canvas 上的 gradient 允许存在）。
//
// Run:  node --test tests/unit/reward-fireworks.test.mjs
//       （或整目录，本机 Node 用 glob）：node --test 'tests/unit/*.test.mjs'
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
var FW_JS_PATH = path.resolve(__dirname, '../../app/web/reward-fireworks.js');
var MANIFEST_SRC = readFileSync(MANIFEST_JS_PATH, 'utf8');
var FW_SRC = readFileSync(FW_JS_PATH, 'utf8');

// --- mulberry32 确定性 PRNG（种子固定，供 _setRandom 注入）------------------------------------
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- fake clock（advance(ms) 推进；带 pendingCount() 供"无未决 timer"断言）--------------------
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
      if (timers[i].id === id) { timers[i].cancelled = true; }
    }
  }
  function fakeNow() { return virtualNow; }
  function advance(ms) {
    var target = virtualNow + ms;
    for (;;) {
      var next = null;
      var i;
      for (i = 0; i < timers.length; i++) {
        var t = timers[i];
        if (!t.cancelled && !t.fired && t.fireAt <= target) {
          if (next === null || t.fireAt < next.fireAt) { next = t; }
        }
      }
      if (!next) { break; }
      virtualNow = next.fireAt;
      next.fired = true;
      next.fn();
    }
    virtualNow = target;
  }
  // 尚未触发、也未被取消的 timer 数（"序列播完后无未决定时器"断言用）。
  function pendingCount() {
    var n = 0;
    for (var i = 0; i < timers.length; i++) {
      if (!timers[i].fired && !timers[i].cancelled) { n++; }
    }
    return n;
  }

  return {
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    now: fakeNow,
    advance: advance,
    pendingCount: pendingCount
  };
}

// --- manual clock（逐 tick 手动喂任意 dt，供降级用例精确控制单个 tick 的 dt）------------------
// setTimeout 只记录回调（FIFO，忽略 ms——由测试用 fireNext(dt) 手动决定这一 tick 经过多少虚拟
// 时间）；单画布非 reduced 播放任意时刻只有一个待触发 tick 回调，FIFO 弹一个即可。
function makeManualClock() {
  var now = 0;
  var queue = [];
  var nextId = 1;
  return {
    setTimeout: function (fn, ms) { var id = nextId++; queue.push({ id: id, fn: fn }); return id; },
    clearTimeout: function (id) {
      for (var i = 0; i < queue.length; i++) { if (queue[i].id === id) { queue.splice(i, 1); return; } }
    },
    now: function () { return now; },
    // 让虚拟时间前进 dt，然后触发队列里最早的一个回调（tick）。回调内部读 now() 会看到已前进的
    // 时间，从而 rawDt = now - lastTickAt = dt。
    fireNext: function (dt) {
      now += dt;
      var t = queue.shift();
      if (t) { t.fn(); }
      return !!t;
    },
    pending: function () { return queue.length; }
  };
}

// --- fake 2D context ------------------------------------------------------------------------
// sharedCounters.shadowBlur：任何 ctx 的 shadowBlur setter 赋值都累加（全局 0 次断言）。
// 每个 ctx 自带 gradientCalls：createRadialGradient/createLinearGradient 计数（区分渲染路径 vs
// 构建期 buildSprite）。
function makeFakeCtx(sharedCounters) {
  var ctx = {
    gradientCalls: 0,
    drawImageCount: 0,
    clearRectCount: 0,
    _globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    save: function () {},
    restore: function () {},
    translate: function () {},
    rotate: function () {},
    scale: function () {},
    beginPath: function () {},
    arc: function () {},
    fill: function () {},
    stroke: function () {},
    clearRect: function () { ctx.clearRectCount++; },
    drawImage: function () { ctx.drawImageCount++; },
    createRadialGradient: function () {
      ctx.gradientCalls++;
      return { addColorStop: function () {} };
    },
    createLinearGradient: function () {
      ctx.gradientCalls++;
      return { addColorStop: function () {} };
    }
  };
  // globalAlpha 作为普通可读写属性（引擎每帧赋值做淡出，不是被禁止的 API）。
  Object.defineProperty(ctx, 'globalAlpha', {
    get: function () { return ctx._globalAlpha; },
    set: function (v) { ctx._globalAlpha = v; },
    enumerable: true,
    configurable: true
  });
  // shadowBlur 陷阱：性能红线 disallowShadowBlur——引擎绝不应该赋值它。任何一次赋值都累加共享
  // 计数器，用例⑤据此断言全程 0 次。
  Object.defineProperty(ctx, 'shadowBlur', {
    get: function () { return 0; },
    set: function () { sharedCounters.shadowBlur++; },
    enumerable: true,
    configurable: true
  });
  return ctx;
}

// --- fake document / DOM stub（canvas 有 width/height + getContext('2d') 返回缓存的 fakeCtx）--
function makeFakeDocument(sharedCounters, createdCtxs) {
  function makeElement(tag) {
    var el = {
      tagName: tag,
      children: [],
      parentNode: null,
      style: {},
      attributes: {},
      className: '',
      width: 0,
      height: 0,
      setAttribute: function (name, value) { this.attributes[name] = value; },
      getAttribute: function (name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; },
      appendChild: function (child) { child.parentNode = this; this.children.push(child); return child; },
      removeChild: function (child) {
        var idx = this.children.indexOf(child);
        if (idx !== -1) { this.children.splice(idx, 1); }
        child.parentNode = null;
        return child;
      },
      remove: function () { if (this.parentNode) { this.parentNode.removeChild(this); } }
    };
    if (tag === 'canvas') {
      var cachedCtx = null;
      el.getContext = function (type) {
        if (type !== '2d') { return null; }
        if (!cachedCtx) {
          cachedCtx = makeFakeCtx(sharedCounters);
          createdCtxs.push({ canvas: el, ctx: cachedCtx });
        }
        return cachedCtx;
      };
    }
    return el;
  }

  var body = makeElement('body');
  var doc = {
    createElement: function (tag) { return makeElement(tag); },
    body: body
  };
  return { document: doc, body: body };
}

// --- matchMedia stub -------------------------------------------------------------------------
function makeMatchMediaStub(initialReduced) {
  var reduced = !!initialReduced;
  return {
    fn: function (query) { return { matches: reduced, media: query }; },
    setReduced: function (v) { reduced = !!v; }
  };
}

// WTJ-20260706-013：真实 manifest.js 默认 performance.honorReducedMotion=false（kiosk 默认
// 无视 OS 减弱动态，prefersReducedMotion() 恒 false），要测"honorReducedMotion=true 时委托
// matchMedia"这条路径，需要在加载完真实 manifest.js 之后把 window.WTJ_MANIFEST 换成一份浅拷贝
// （覆盖 performance.honorReducedMotion 字段，其余字段原样保留）——reward-fireworks.js 的
// prefersReducedMotion() 每次调用都动态读 window.WTJ_MANIFEST（不是加载时缓存的引用），因此在
// 模块加载完之后再替换这个引用是安全的（与 frame-anim.test.mjs 同款手法）。
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

// --- sandbox builder -----------------------------------------------------------------------
// opts.clock: 'fake'（默认，makeFakeClock）| 'manual'（makeManualClock）。
// opts.reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches 返回值。
// opts.honorReducedMotion: boolean 时覆盖 window.WTJ_MANIFEST.performance.honorReducedMotion
// （WTJ-20260706-013 kiosk 默认无视 OS 偏好开关，见 applyHonorReducedMotion()）。
// opts.seed: 注入 mulberry32(seed) 作为 _setRandom（省略则用引擎默认 Math.random——计数类断言
//   不依赖随机源，但位置/生命值类断言需要固定种子）。
// opts.innerWidth/innerHeight: 默认 1000x800（好算的整数）。
// opts.omitManifest: 不加载 manifest.js（测防御式回退到内置默认值）。
function createSandbox(opts) {
  opts = opts || {};
  var warnCalls = [];
  var errorCalls = [];
  var sharedCounters = { shadowBlur: 0 };
  var createdCtxs = [];
  var docStub = makeFakeDocument(sharedCounters, createdCtxs);
  var matchMediaStub = makeMatchMediaStub(opts.reducedMotion);

  var fakeWindow = {
    innerWidth: (typeof opts.innerWidth === 'number') ? opts.innerWidth : 1000,
    innerHeight: (typeof opts.innerHeight === 'number') ? opts.innerHeight : 800
  };
  if (opts.includeMatchMedia !== false) { fakeWindow.matchMedia = matchMediaStub.fn; }

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
  if (typeof opts.honorReducedMotion === 'boolean') {
    applyHonorReducedMotion(fakeWindow, opts.honorReducedMotion);
  }
  vm.runInContext(FW_SRC, sandbox, { filename: 'reward-fireworks.js' });

  var FW = fakeWindow.WTJ_REWARD_FIREWORKS;
  var clock = (opts.clock === 'manual') ? makeManualClock() : makeFakeClock();
  if (FW && typeof FW._setClock === 'function') {
    FW._setClock({ setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, now: clock.now });
  }
  if (FW && typeof opts.seed === 'number' && typeof FW._setRandom === 'function') {
    FW._setRandom(mulberry32(opts.seed));
  }

  return {
    contextObject: sandbox,
    window: fakeWindow,
    FW: FW,
    clock: clock,
    matchMediaStub: matchMediaStub,
    sharedCounters: sharedCounters,
    createdCtxs: createdCtxs,
    warnCalls: warnCalls,
    errorCalls: errorCalls,
    // 找到引擎懒创建的默认全屏 overlay canvas（.wtj-fw-canvas），用于渲染路径的 ctx 内省。
    overlayCanvas: function () {
      return docStub.body.children.filter(function (el) { return el.className === 'wtj-fw-canvas'; })[0];
    }
  };
}

// 统计一组粒子快照里各 colorKey 的数量。
function countByColorKey(particles) {
  var m = {};
  for (var i = 0; i < particles.length; i++) {
    var k = particles[i].colorKey;
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

// ============================================================================================
// ① 固定 RNG 下 play('molten-fountain', {tier:'old_mac'}) 各 layer 时间点精确粒子数（120 档）。
//    old_mac 总数 120：base=round(120*0.62)=74（warm-gold）/ trail=round(120*0.30)=36
//    （ember-gold）/ accent=120-74-36=10（cyan-accent，次要层）。总数是算术公式（不掺随机），
//    因此与种子无关精确可断言；固定种子只是让位置/生命值也确定，顺带断言粒子带上了 dragScale/
//    fadePow 两个新字段。
// ============================================================================================
test('① molten-fountain old_mac：三层精确粒子数 base74/trail36/accent10（总120），带 dragScale/fadePow 字段', function () {
  var env = createSandbox({ seed: 12345 });
  var handle = env.FW.play('molten-fountain', { tier: 'old_mac', origin: { x: 500, y: 700 } });
  assert.ok(typeof handle === 'number', 'play() 应返回数字 handle');

  var particles = env.FW._getParticles(handle);
  assert.equal(particles.length, 120, 'old_mac 档 molten-fountain 总粒子数应精确为 120');

  var counts = countByColorKey(particles);
  assert.equal(counts['warm-gold'], 74, 'base 层（warm-gold）应精确 74 = round(120*0.62)');
  assert.equal(counts['ember-gold'], 36, 'trail 层（ember-gold）应精确 36 = round(120*0.30)');
  assert.equal(counts['cyan-accent'], 10, 'accent 次要层（cyan-accent）应精确 10 = 120-74-36（剩余量）');

  // trail 层带低阻高速拉尾字段：dragScale=0.55、fadePow=1.4（doc §2）。
  var trail = particles.filter(function (p) { return p.colorKey === 'ember-gold'; })[0];
  assert.equal(trail.dragScale, 0.55, 'trail 层粒子应带 dragScale=0.55（低阻拉长尾）');
  assert.equal(trail.fadePow, 1.4, 'trail 层粒子应带 fadePow=1.4');
  var base = particles.filter(function (p) { return p.colorKey === 'warm-gold'; })[0];
  assert.equal(base.dragScale, 1, 'base 层粒子 dragScale 默认 1');
  assert.equal(base.fadePow, 1, 'base 层粒子 fadePow 默认 1');

  // aim() 坐标系转换（向上为正 → canvas y 向下）：喷泉基础角 90°±35°，向上喷 → vy 应为负
  // （y 向上）。抽样断言绝大多数 base 粒子 vy<0，证明没有踩"喷泉朝下"的坑。
  var upward = particles.filter(function (p) { return p.vy < 0; }).length;
  assert.ok(upward >= 100, '90°±35° 上扬扇形：绝大多数粒子初速度应向上（vy<0），实际向上数=' + upward);
});

// ============================================================================================
// ② 3 style × 3 tier spawn 计数矩阵：每个形态每档的初始生成总数（play 同步 spawn 完，未经 tick）
//    应精确等于 STYLE_PARAMS.counts[tier]（都 ≤300，单独播放不触发预算裁剪）。
// ============================================================================================
test('② 3 style × 3 tier 计数矩阵：每格初始生成总数精确等于 counts[tier]', function () {
  var matrix = {
    'molten-fountain': { old_mac: 120, normal: 210, burst: 280 },
    'starburst': { old_mac: 70, normal: 120, burst: 160 },
    'round-bloom': { old_mac: 90, normal: 150, burst: 210 }
  };
  var styles = ['molten-fountain', 'starburst', 'round-bloom'];
  var tiers = ['old_mac', 'normal', 'burst'];
  var s, t;
  for (s = 0; s < styles.length; s++) {
    for (t = 0; t < tiers.length; t++) {
      var env = createSandbox({ seed: 777 });
      var handle = env.FW.play(styles[s], { tier: tiers[t], origin: { x: 500, y: 400 } });
      var n = env.FW._getParticles(handle).length;
      assert.equal(n, matrix[styles[s]][tiers[t]], styles[s] + ' @ ' + tiers[t] + ' 初始生成数应为 ' + matrix[styles[s]][tiers[t]] + '，实际=' + n);
      // 每格都 ≤ maxParticles（300）。
      assert.ok(n <= env.FW.getState().maxParticles, styles[s] + ' @ ' + tiers[t] + ' 不应超过 maxParticles');
    }
  }
});

// ============================================================================================
// ③ 并发两入口 play → 逐时间点存活 count ≤ 300，且叠加窗口恰触顶 300 后回落。
//    play A molten normal(210) → alive 210；紧接 play B molten normal 想再要 210 但共享预算只剩
//    90，被裁剪到 90 → alive 恰好触顶 300。随后 tick 推进，粒子按寿命死亡，count 单调回落到 0。
// ============================================================================================
test('③ 并发两入口共享 300 硬预算：叠加恰触顶 300、逐时间点 ≤300、随后回落到 0', function () {
  var env = createSandbox({ seed: 42 });

  var hA = env.FW.play('molten-fountain', { tier: 'normal', origin: { x: 400, y: 400 } });
  assert.equal(env.FW._getParticles(hA).length, 210, 'A 单独播放应生成 210');
  assert.equal(env.FW.getState().particleCount, 210, '此刻全局存活 210');

  var hB = env.FW.play('molten-fountain', { tier: 'normal', origin: { x: 600, y: 400 } });
  assert.equal(env.FW.getState().particleCount, 300, '并发叠加应恰好触顶到 maxParticles(300)，第二次被共享预算裁剪');
  assert.equal(env.FW._getParticles(hB).length, 90, 'B 请求 210 但共享预算只剩 90 → 被裁剪到 90（300-210）');
  assert.equal(env.FW.getState().activeEffects, 2, '两次 play 应各是一个 activeEffect');

  // 逐时间点推进：count 永远 ≤300，且从峰值 300 单调回落（并发时同一 canvas 单条 tick 链）。
  var checkpoints = [50, 150, 300, 500, 700, 900];
  var prevCount = 300;
  var i;
  for (i = 0; i < checkpoints.length; i++) {
    var prevNow = env.clock.now();
    env.clock.advance(checkpoints[i] - prevNow);
    var count = env.FW.getState().particleCount;
    assert.ok(count <= 300, 't=' + checkpoints[i] + 'ms 存活数应 ≤300，实际=' + count);
    assert.ok(count <= prevCount, 't=' + checkpoints[i] + 'ms 存活数应相对上一检查点回落（不再上升），实际=' + count + ' 上次=' + prevCount);
    prevCount = count;
  }

  // 两个 molten 形态 durationMs=950，冲过后应全部清零、无 activeEffect。
  env.clock.advance(1200);
  assert.equal(env.FW.getState().particleCount, 0, '冲过 duration 后全局存活应为 0');
  assert.equal(env.FW.getState().activeEffects, 0, '冲过 duration 后应无 activeEffect');
});

// ============================================================================================
// ④ advance(duration+ε) → particles 0 / activeEffects 0 / 无未决 timer（one-shot 自我清理，
//    不泄漏 tick 定时器）；onComplete 恰好触发一次。
// ============================================================================================
test('④ one-shot 自我清理：冲过 duration 后 particles 0 / activeEffects 0 / 无未决 timer；onComplete 触发一次', function () {
  var env = createSandbox({ seed: 9 });
  var completeCalls = 0;
  env.FW.play('starburst', { tier: 'normal', origin: { x: 500, y: 400 }, onComplete: function () { completeCalls++; } });

  assert.ok(env.FW.getState().particleCount > 0, '播放瞬间应有存活粒子');
  assert.ok(env.clock.pendingCount() >= 1, '播放后应有待触发的 tick 定时器');

  // starburst durationMs=720；冲过它 + 余量。
  env.clock.advance(720 + 200);

  assert.equal(env.FW.getState().particleCount, 0, '冲过 duration 后粒子应清零');
  assert.equal(env.FW.getState().activeEffects, 0, '冲过 duration 后 activeEffects 应为 0');
  assert.equal(env.clock.pendingCount(), 0, 'one-shot 播完后不应残留任何未决定时器（不泄漏 tick 链）');
  assert.equal(completeCalls, 1, 'onComplete 应恰好触发一次（自然播完）');
});

// ============================================================================================
// ⑤ 性能红线陷阱：fakeCtx 给 shadowBlur 装 setter 陷阱 + gradient 计数 → play 后整个 tick 期间
//    shadowBlur 赋值 0 次；渲染路径（overlay canvas 的 ctx）0 次 gradient 调用（构建期
//    buildSprite 在 28px sprite canvas 上的 gradient 允许存在）。starburst 含 streak 主射线，
//    覆盖 save/translate/rotate/drawImage 旋转贴图那条例外路径。
// ============================================================================================
test('⑤ 性能红线：全程 shadowBlur 赋值 0 次；渲染 ctx 0 次 gradient（buildSprite 的 gradient 只在 sprite canvas 上）', function () {
  var env = createSandbox({ seed: 5 });
  env.FW.play('starburst', { tier: 'normal', origin: { x: 500, y: 400 } });

  // 冲过整个 tick 生命周期。
  env.clock.advance(720 + 200);

  assert.equal(env.sharedCounters.shadowBlur, 0, '整个 play + tick 期间 ctx.shadowBlur 赋值次数应为 0（disallowShadowBlur 红线）');

  // 渲染路径的 ctx = 引擎懒创建的默认全屏 overlay canvas（.wtj-fw-canvas）的 2D context。
  var overlay = env.overlayCanvas();
  assert.ok(overlay, '引擎应懒创建默认 overlay canvas（.wtj-fw-canvas）');
  var renderCtx = overlay.getContext('2d');
  assert.equal(renderCtx.gradientCalls, 0, '渲染路径（overlay ctx）全程不应调用 createRadialGradient/createLinearGradient（每帧只 clearRect+drawImage+globalAlpha）');
  assert.ok(renderCtx.drawImageCount > 0, '渲染路径应通过 drawImage 画预渲染贴图（证明渲染确实发生过）');
  assert.ok(renderCtx.clearRectCount > 0, '渲染路径应每帧 clearRect 一次');

  // 构建期 buildSprite 的 gradient 允许存在，且只在 28px 的 sprite canvas ctx 上——把非 overlay
  // 的 ctx（即 sprite canvas 的 ctx）的 gradient 调用求和，应 >0（证明预渲染贴图确实用 gradient
  // 构建过，陷阱本身工作正常，不是"根本没画"的假绿）。
  var spriteGradientTotal = 0;
  for (var i = 0; i < env.createdCtxs.length; i++) {
    if (env.createdCtxs[i].canvas !== overlay) { spriteGradientTotal += env.createdCtxs[i].ctx.gradientCalls; }
  }
  assert.ok(spriteGradientTotal > 0, '构建期 buildSprite 应在 sprite canvas 上用 createRadialGradient 预渲染发光贴图（gradient 只出现在构建期，不进渲染路径）');
});

// ============================================================================================
// ⑥ 自适应单向降级：连续慢 tick（dt∈(25,40]）连续 3 次降一档，只升不降；单个离群 dt>100ms
//    不误降。用 manual clock 精确控制每个 tick 的 dt。
// ============================================================================================
test('⑥ 自适应降级：连续 3 次慢 tick 升一档、只升不降、离群 dt>100ms 不误降', function () {
  var env = createSandbox({ clock: 'manual', seed: 1 });
  // normal 档 210 粒子、寿命最长 950ms；本用例累计物理时间 < 400ms，足够多粒子存活让 tick 链
  // 一直重排（不会中途因粒子清零而停 tick）。
  env.FW.play('molten-fountain', { tier: 'normal', origin: { x: 400, y: 400 } });
  assert.equal(env.FW.getState().degradeLevel, 0, '初始 degradeLevel 应为 0');

  // 连续 2 次慢 tick（dt=30）尚不足阈值（需连续 3 次）。
  env.clock.fireNext(30);
  env.clock.fireNext(30);
  assert.equal(env.FW.getState().degradeLevel, 0, '连续 2 次慢 tick 还不应降级（阈值为连续 3 次）');

  // 第 3 次连续慢 tick → 降一档。
  env.clock.fireNext(30);
  assert.equal(env.FW.getState().degradeLevel, 1, '连续 3 次慢 tick 后应降一档（degradeLevel=1）');

  // 一次正常 tick（dt=16）打断连续计数（"连续"而非"累计"），但已降的档位不回升（只升不降）。
  env.clock.fireNext(16);
  assert.equal(env.FW.getState().degradeLevel, 1, '正常 tick 打断连续计数，但已降档位不回升（只升不降）');

  // 单个离群 dt>100ms（后台节流恢复的一次性巨大 dt）：豁免，不计入慢 tick、不误降。
  env.clock.fireNext(150);
  assert.equal(env.FW.getState().degradeLevel, 1, '单个离群 dt>100ms 应被豁免，不误降');

  // 再连续 3 次慢 tick → 再降一档到 2（MAX）。
  env.clock.fireNext(30);
  env.clock.fireNext(30);
  env.clock.fireNext(30);
  assert.equal(env.FW.getState().degradeLevel, 2, '再连续 3 次慢 tick 应降到第二档（degradeLevel=2）');

  // 继续喂慢 tick：封顶在 2，不再上升、也永不下降。
  env.clock.fireNext(30);
  env.clock.fireNext(30);
  env.clock.fireNext(30);
  assert.equal(env.FW.getState().degradeLevel, 2, 'degradeLevel 应封顶在 MAX(2)，不越界');
});

// ============================================================================================
// ⑦ prefers-reduced-motion：静态定格帧过同一 maxParticles 预算 / 无后续 tick / onComplete 仍按
//    duration 触发。
// ============================================================================================
test('⑦ reduced-motion：静态定格一帧、无 tick 循环、过同一 300 预算、onComplete 仍按 duration 触发', function () {
  // WTJ-20260706-013：kiosk 默认 honorReducedMotion=false 时 prefersReducedMotion() 恒 false
  // （见下方新增的"默认无视 OS reduce-motion"正向用例）；本用例测的是 honorReducedMotion=true
  // （家长设置钩子）时尊重 OS matchMedia 命中 reduce 的既有回归行为，因此显式打开。
  var env = createSandbox({ seed: 3, reducedMotion: true, honorReducedMotion: true });
  var completeCalls = 0;
  var handle = env.FW.play('molten-fountain', { tier: 'normal', origin: { x: 500, y: 400 }, onComplete: function () { completeCalls++; } });

  assert.equal(env.FW.getState().reducedMotion, true, 'getState().reducedMotion 应反映 matchMedia 命中');
  var atTrigger = env.FW._getParticles(handle);
  assert.equal(atTrigger.length, 210, 'reduced-motion 静态帧应生成主层全量 210（normal 档），不是完全不显示');
  // 静态帧粒子静止：vx=vy=0。
  assert.ok(atTrigger.every(function (p) { return p.vx === 0 && p.vy === 0; }), '静态帧粒子应静止（vx=vy=0，不进物理模拟）');

  // 无后续 tick 循环：reduced-motion 下只有一个 durationMs 的 finalize 定时器，没有 16ms tick 链。
  assert.equal(env.clock.pendingCount(), 1, 'reduced-motion 下应只有 1 个待触发定时器（durationMs 的 finalize），没有逐帧 tick 链');

  // 推进一段（< duration）：静态帧不动、数量不变（没有 tick 在推进/剔除它们）。
  var frozenX = atTrigger[0].x;
  env.clock.advance(500);
  var later = env.FW._getParticles(handle);
  assert.equal(later.length, 210, 'reduced-motion 下推进时间粒子数不变（无 tick 剔除）');
  assert.equal(later[0].x, frozenX, 'reduced-motion 下粒子位置保持静止');

  // 冲过 duration（950）：finalize 触发 → 清零 + onComplete 恰一次。
  env.clock.advance(600);
  assert.equal(env.FW.getState().particleCount, 0, 'reduced-motion 下冲过 duration 后应清零');
  assert.equal(env.FW.getState().activeEffects, 0, 'reduced-motion 下冲过 duration 后应无 activeEffect');
  assert.equal(completeCalls, 1, 'reduced-motion 下 onComplete 仍应按 duration 恰好触发一次');
});

// ⑦b（同一预算护栏）：reduced-motion 静态定格帧同样走共享 300 预算裁剪——不是性能红线的例外。
test('⑦b reduced-motion 静态帧遵守同一 300 共享预算：两次静态 play 叠加恰触顶 300 被裁剪', function () {
  // 见⑦同一说明：honorReducedMotion=true 才走 reduced-motion 静态帧路径。
  var env = createSandbox({ seed: 3, reducedMotion: true, honorReducedMotion: true });
  env.FW.play('molten-fountain', { tier: 'normal', origin: { x: 400, y: 400 } }); // 静态 210
  assert.equal(env.FW.getState().particleCount, 210, '第一次静态帧 210');
  env.FW.play('round-bloom', { tier: 'normal', origin: { x: 600, y: 400 } }); // 想要 150，预算只剩 90
  assert.equal(env.FW.getState().particleCount, 300, '第二次静态帧被共享预算裁剪，叠加恰触顶 300（证明静态帧不是红线例外）');
  assert.ok(env.FW.getState().particleCount <= env.FW.getState().maxParticles, '任意情况下静态帧总数不超过 maxParticles');
});

// WTJ-20260706-013（本卡核心修复，正向断言）：manifest.performance.honorReducedMotion 缺省/
// false（真实 manifest.js 默认值，本用例不传 opts.honorReducedMotion）时，即使 OS matchMedia
// 命中 prefers-reduced-motion: reduce，getState().reducedMotion 也应恒为 false，且引擎应走
// 正常物理模拟（有逐帧 tick、粒子会运动/衰减），不是静态定格一帧——与⑦（honorReducedMotion:
// true）的"静态定格"形成直接对照。
test('⑦c reduced-motion 默认（honorReducedMotion 缺省/false）：无视 OS matchMedia reduce=true，getState().reducedMotion=false 且走正常 tick 物理模拟', function () {
  var env = createSandbox({ seed: 3, reducedMotion: true }); // 未传 honorReducedMotion -> 真实 manifest 默认 false
  var handle = env.FW.play('molten-fountain', { tier: 'normal', origin: { x: 500, y: 400 } });

  assert.equal(env.FW.getState().reducedMotion, false, 'QA 复验关键信号：即使 OS matchMedia 命中 reduce，getState().reducedMotion 也应为 false（标志消失）');

  var atTrigger = env.FW._getParticles(handle);
  assert.equal(atTrigger.length, 210, '正常 tier=normal 档仍应生成 210 粒子（与静态帧数量相同，本用例区分点在于是否运动/是否有 tick）');
  var moving = atTrigger.some(function (p) { return p.vx !== 0 || p.vy !== 0; });
  assert.ok(moving, 'kiosk 默认无视 OS reduce-motion：粒子应有初速度、进入正常物理模拟，不是静态定格帧（静态帧粒子恒 vx=vy=0）');

  // 正常路径下应该有逐帧 tick 定时器在排队（与⑦"只有 1 个 durationMs 的 finalize 定时器，
  // 没有 tick 链"形成对照）。
  assert.ok(env.clock.pendingCount() >= 1, '正常路径应排队至少一个 tick 定时器');

  var frozen = atTrigger.map(function (p) { return { x: p.x, y: p.y }; });
  env.clock.advance(200);
  var later = env.FW._getParticles(handle);
  var anyMoved = later.some(function (p, i) { return p.x !== frozen[i].x || p.y !== frozen[i].y; });
  assert.ok(anyMoved, '正常路径下至少应有粒子位置随时间推进变化（reduced-motion 静态帧则全部保持不动，见⑦）');
});

// ============================================================================================
// ⑧ 基础契约（补充）：未知 style / 缺 origin 兜底 / stop 幂等 / tier 来源合成 / manifest 缺失回退。
// ============================================================================================
test('⑧ 基础契约：未知 style 返回 null；origin 缺失回退 canvas 中心（不在 (0,0) 炸开）；stop 幂等', function () {
  var env = createSandbox({ seed: 1 });

  // 未知 style。
  assert.equal(env.FW.play('no-such-style', { origin: { x: 1, y: 1 } }), null, '未知 style 应返回 null（防御式，不抛错）');

  // origin 完全缺失 → 回退 canvas 视觉中心（默认 overlay canvas = innerWidth/innerHeight =
  // 1000x800，中心 500/400）。starburst 主射线从 origin 发出，抽样粒子应聚在 (500,400) 附近，
  // 绝不在 (0,0)。
  var h = env.FW.play('round-bloom', {}); // 无 origin
  var ps = env.FW._getParticles(h);
  assert.ok(ps.length > 0, 'origin 缺失也应正常生成粒子');
  // round-bloom 从 r0 偏移半径生成，粒子在中心周围一圈；断言没有粒子落在 (0,0) 附近（回退生效）。
  var nearZero = ps.filter(function (p) { return Math.abs(p.x) < 50 && Math.abs(p.y) < 50; }).length;
  assert.equal(nearZero, 0, 'origin 缺失时应回退 canvas 中心，绝不在 (0,0)/NaN 炸开');

  // stop 幂等：对不存在的 handle 是安全 no-op；对真实 handle stop 后再 stop 也不抛错。
  assert.doesNotThrow(function () { env.FW.stop(999999); }, 'stop 不存在的 handle 应是安全 no-op');
  env.FW.stop(h);
  assert.equal(env.FW.getState().activeEffects, 0, 'stop(handle) 后该 playback 应移出注册表');
  assert.doesNotThrow(function () { env.FW.stop(h); }, '重复 stop 同一 handle 应幂等无害');
});

test('⑧b tier 来源合成：manifest 默认 normal；_setTier 覆盖；opts.tier 单次优先；manifest 缺失回退 normal', function () {
  var env = createSandbox({ seed: 1 });
  assert.equal(env.FW.getState().tier, 'normal', '真实 manifest.performance.particleTier 默认 normal');

  // _setTier 覆盖基线。
  env.FW._setTier('burst');
  assert.equal(env.FW.getState().tier, 'burst', '_setTier(burst) 应覆盖 manifest 基线');
  // 单次 play 用 opts.tier 精确指定，不受全局 tier 影响（②矩阵已依赖这一点）——这里验证 old_mac
  // 显式档在 burst 全局下仍生成 old_mac 的数量。
  var h = env.FW.play('starburst', { tier: 'old_mac', origin: { x: 500, y: 400 } });
  assert.equal(env.FW._getParticles(h).length, 70, 'opts.tier=old_mac 单次覆盖：应生成 starburst old_mac 的 70');
  env.FW._setTier('normal'); // 还原，避免影响其它（各 test 独立沙箱，其实无需，稳妥起见）。

  // manifest 缺失 → particleTier 读不到 → 回退内置默认 normal（不抛错）。
  var env2 = createSandbox({ omitManifest: true });
  assert.equal(env2.FW.getState().tier, 'normal', 'manifest 缺失时 tier 应回退内置默认 normal');
  assert.equal(env2.FW.getState().maxParticles, 300, 'manifest 缺失时 maxParticles 应回退内置默认 300');
});

// ============================================================================================
// ⑨ 冻结 API + 重复引入守卫（与本项目其余引擎同款）。
// ============================================================================================
test('⑨ API 冻结 + 重复引入守卫：window.WTJ_REWARD_FIREWORKS 冻结、二次加载不替换/不抛错', function () {
  var env = createSandbox();
  assert.ok(Object.isFrozen(env.window.WTJ_REWARD_FIREWORKS), 'API 对象应 Object.freeze 冻结');
  var firstRef = env.window.WTJ_REWARD_FIREWORKS;
  assert.doesNotThrow(function () {
    vm.runInContext(FW_SRC, env.contextObject, { filename: 'reward-fireworks.js#2' });
  }, '二次加载不应抛错（重复引入守卫）');
  assert.equal(env.window.WTJ_REWARD_FIREWORKS, firstRef, '二次加载后引用应保持不变（未被替换）');

  var d = Object.getOwnPropertyDescriptor(env.window, 'WTJ_REWARD_FIREWORKS');
  assert.equal(d.writable, false, 'window 绑定应不可写（绑定加固）');
  assert.equal(d.configurable, false, 'window 绑定应不可重配置（绑定加固）');
});
