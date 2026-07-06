// WTJ-20260704-015 — status-rewards.js 单元测试（durable QA asset）
//
// 用 Node 内置 vm 模块搭一个沙箱 context，按 index.html 的真实加载顺序在同一 sandbox 里
// 先加载真实的 app/web/manifest.js（其 IIFE 会 window.WTJ_MANIFEST = deepFreeze(...)），
// 再加载真实的 app/web/status-rewards.js（读取 window.WTJ_MANIFEST.rewards.statusLights、
// 订阅 window.WTJ_TASK_TEMPLATES.onTaskComplete、调用 window.WTJ_HUD.setStatusLight /
// window.WTJ_AUDIO.playSfx，挂 window.WTJ_STATUS_REWARDS）——与 task-templates.test.mjs 同一
// 手法：断言直接取自真实 manifest 数值（rewards.statusLights.count=3 /
// streakThreshold=3），消除"手工镜像 manifest 数值"的漂移风险。
//
// window.WTJ_TASK_TEMPLATES / WTJ_HUD / WTJ_AUDIO 全部是本文件手写的可记录调用的 stub（015
// 消费它们暴露的 API，不需要加载 007/014/016 的真实源码——那些各自已有独立的 durable 测试覆盖
// 自己的判定逻辑）。WTJ_TASK_TEMPLATES stub 的 onTaskComplete 是多订阅者事件，本文件提供
// fireTaskComplete() 模拟 014 真实广播"某个任务判定完成"。
//
// 假时钟（与 task-templates.test.mjs 的 makeFakeClock() 同款实现）：status-rewards.js 的
// flashLightsSequence()/showRewardOverlay() 用 clockRef.setTimeout/clearTimeout 实现"三灯
// 连闪节拍"与"一次性大奖励叠层的可见窗口"，沙箱 global 不提供原生 setTimeout/clearTimeout，
// 因此本文件在加载完 status-rewards.js 之后立刻调用一次 env.SR._setClock(...) 换成假时钟，
// 虚拟时间由测试用 env.clock.advance(ms) 手动推进。
//
// 最小 document/DOM stub（createElement / appendChild / removeChild / remove）与
// window.matchMedia stub（可配置 prefers-reduced-motion 的 matches 返回值）均在本文件手写。
//
// 跨 realm 陷阱（与 task-templates.test.mjs 的既有注记同一原因）：status-rewards.js 内部构造
// 的 onWorkComplete payload 是在 vm 沙箱 realm 内创建的普通对象，逐字段比较，不用
// assert.deepEqual 对整个跨 realm 对象做深比较；本文件自己的 document stub 创建的 DOM 元素、
// hudStub/audioStub 的 calls 记录对象都在主 realm 创建，可以放心用 deepEqual。
//
// Run:  node --test tests/unit/status-rewards.test.mjs
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
var SR_JS_PATH = path.resolve(__dirname, '../../app/web/status-rewards.js');
var SR_CSS_PATH = path.resolve(__dirname, '../../app/web/status-rewards.css');
var MANIFEST_SRC = readFileSync(MANIFEST_JS_PATH, 'utf8');
var SR_SRC = readFileSync(SR_JS_PATH, 'utf8');

// WTJ-20260705-010：从真实 manifest.js 源码文本里"手术切除"一个 `<fieldName>: { ... }`
// 对象字段（用大括号计数定位其真正的结束位置，而不是脆弱的固定行数/固定结构正则），用于构造
// "manifest 存在但缺少这一个字段"的测试变体（防御式回退分支）。找不到字段名时返回 null 让
// 调用方前置断言失败，不会静默返回原始未修改的字符串掩盖测试没测到的问题。
function stripManifestObjectField(src, fieldName) {
  var keyToken = fieldName + ':';
  var keyIdx = src.indexOf(keyToken);
  if (keyIdx === -1) {
    return null;
  }
  var braceStart = src.indexOf('{', keyIdx);
  if (braceStart === -1) {
    return null;
  }
  var depth = 0;
  var i;
  var braceEnd = -1;
  for (i = braceStart; i < src.length; i++) {
    if (src[i] === '{') {
      depth++;
    } else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        braceEnd = i;
        break;
      }
    }
  }
  if (braceEnd === -1) {
    return null;
  }
  // 找到字段值起始的这一行行首（把该字段前面可能存在的说明性注释一并删掉，避免残留"孤儿注释"），
  // 但不越过前一个字段结尾的 `},`（用换行 + 非空白字符定位，保守起见只回退到上一个非空行首）。
  var lineStart = src.lastIndexOf('\n', keyIdx);
  var searchBack = lineStart;
  for (;;) {
    var prevLineStart = src.lastIndexOf('\n', searchBack - 1);
    var lineContent = src.slice(prevLineStart + 1, searchBack).trim();
    if (lineContent.indexOf('//') === 0 || lineContent === '') {
      searchBack = prevLineStart;
      lineStart = prevLineStart;
    } else {
      break;
    }
  }
  // 结尾：吞掉紧随 `}` 之后的逗号（如果有），避免留下多余的孤立逗号。
  var afterEnd = braceEnd + 1;
  if (src[afterEnd] === ',') {
    afterEnd++;
  }
  return src.slice(0, lineStart) + src.slice(afterEnd);
}

// --- fake clock (与 task-templates.test.mjs 的 makeFakeClock() 同款实现) ------------------
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

// --- 假 Canvas2D context（WTJ-20260705-015，与 tests/unit/frame-anim.test.mjs 的
// makeFakeCtx2D()/makeCanvas() 同款手法，只是记录 arc/stroke 而不是 drawImage）------------------
function makeFakeCtx2D() {
  var arcCalls = [];
  var strokeCallCount = 0;
  var clearRectCallCount = 0;
  return {
    arcCalls: arcCalls,
    strokeCallCount: function () { return strokeCallCount; },
    clearRectCallCount: function () { return clearRectCallCount; },
    save: function () {},
    restore: function () {},
    beginPath: function () {},
    arc: function (x, y, radius) { arcCalls.push({ x: x, y: y, radius: radius }); },
    stroke: function () { strokeCallCount++; },
    clearRect: function () { clearRectCallCount++; },
    globalAlpha: 1,
    strokeStyle: '',
    lineWidth: 1
  };
}

// --- fake document / DOM stub ------------------------------------------------------------
function makeFakeDocument() {
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
    // WTJ-20260705-015：canvas 元素额外挂一个可记录调用的假 2D 上下文（其余 tag 如 div/img
    // 不需要 getContext，保持原样——ensureFxCanvas() 只对 canvas 调用 getContext('2d')）。
    if (tag === 'canvas') {
      var ctx2d = makeFakeCtx2D();
      el.ctx2d = ctx2d;
      el.getContext = function (type) {
        return type === '2d' ? ctx2d : null;
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

// --- WTJ_SPARKLES stub（WTJ-20260705-015：记录 drawSparkles 调用，供断言方向数/alpha 序列）-----
function makeSparklesStub() {
  var calls = [];
  return {
    api: {
      drawSparkles: function (ctx, x, y, opts) {
        calls.push({ ctx: ctx, x: x, y: y, opts: opts });
      },
      getSparkleSprite: function () { return null; }
    },
    calls: calls
  };
}

// --- WTJ_REWARD_FIREWORKS stub（WTJ-20260706-005：任务成功即时视觉反馈改用可复用烟花引擎，
// 取代 015 首次交付的 sparkle burst + 成功环）------------------------------------------------
// status-rewards.js 现在每次 onTaskComplete 调 window.WTJ_REWARD_FIREWORKS.play(style, {origin})，
// 不再自己维护 taskfx canvas / drawSparkles。本文件只消费 play()，记录调用参数即可——引擎自身的
// 粒子物理/形态/降级/reduced-motion 由 tests/unit/reward-fireworks.test.mjs 独立覆盖。
function makeFireworksStub() {
  var playCalls = [];
  var stopAllCalls = 0;
  var nextHandle = 1;
  return {
    api: {
      play: function (styleId, opts) {
        var handle = nextHandle++;
        playCalls.push({ handle: handle, styleId: styleId, opts: opts });
        return handle;
      },
      stop: function () {},
      stopAll: function () { stopAllCalls++; },
      reset: function () { stopAllCalls++; },
      getState: function () { return { tier: 'normal', particleCount: 0, maxParticles: 300, activeEffects: 0, reducedMotion: false, degradeLevel: 0 }; }
    },
    playCalls: playCalls,
    getStopAllCalls: function () { return stopAllCalls; }
  };
}

// --- WTJ_TASK_TEMPLATES stub (onTaskComplete 是多订阅者，镜像 014 的 addSubscriber 模式) -----
function makeTaskTemplatesStub() {
  var completeHandlers = [];
  return {
    api: {
      onTaskComplete: function (fn) {
        completeHandlers.push(fn);
      }
    },
    fireTaskComplete: function (payload) {
      completeHandlers.forEach(function (fn) { fn(payload || { type: 'click', taskId: 'x', lightIndex: 0 }); });
    },
    hasHandler: function () {
      return completeHandlers.length > 0;
    }
  };
}

// --- WTJ_HUD stub ---------------------------------------------------------------------------
function makeHudStub() {
  var calls = [];
  return {
    api: {
      setStatusLight: function (index, on) {
        calls.push({ index: index, on: on }); // 本函数定义在主 realm，calls 里的对象也是主 realm。
      }
    },
    calls: calls
  };
}

// --- WTJ_KEYBOARD stub (onMilestone 是多订阅者，镜像 008 keyboard.js 的 addSubscriber 模式) ---
// WTJ-20260705-008：status-rewards.js 现在还订阅 WTJ_KEYBOARD.onMilestone，弹键盘里程碑奖励叠层。
function makeKeyboardStub() {
  var milestoneHandlers = [];
  return {
    api: {
      onMilestone: function (fn) { milestoneHandlers.push(fn); }
    },
    fireMilestone: function (value) {
      milestoneHandlers.forEach(function (fn) { fn(value); });
    },
    hasHandler: function () { return milestoneHandlers.length > 0; }
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
    setReduced: function (value) {
      reduced = !!value;
    }
  };
}

// --- sandbox builder -----------------------------------------------------------------------
// opts.omitManifest: true 时不加载 manifest.js。opts.includeTaskTemplates/includeHud/
// includeAudio/includeMatchMedia/includeSparkles/includeFireworks: false 时不把对应依赖挂到
// window 上（模拟缺失场景）。opts.reducedMotion: true 时
// window.matchMedia('(prefers-reduced-motion: reduce)').matches 返回 true。
// opts.innerWidth/innerHeight：任务成功反馈 anchor 为 null 时回退 viewportCenter() 用
// window.innerWidth/innerHeight，默认 1000x800（好算的整数，方便断言精确像素值）。
function createSandbox(opts) {
  opts = opts || {};
  var warnCalls = [];
  var errorCalls = [];

  var docStub = makeFakeDocument();
  var ttStub = makeTaskTemplatesStub();
  var hudStub = makeHudStub();
  var audioStub = makeAudioStub();
  var kbStub = makeKeyboardStub();
  var sparklesStub = makeSparklesStub();
  var fireworksStub = makeFireworksStub();
  var matchMediaStub = makeMatchMediaStub(opts.reducedMotion);

  var fakeWindow = {};
  if (opts.includeTaskTemplates !== false) fakeWindow.WTJ_TASK_TEMPLATES = ttStub.api;
  if (opts.includeHud !== false) fakeWindow.WTJ_HUD = hudStub.api;
  if (opts.includeAudio !== false) fakeWindow.WTJ_AUDIO = audioStub.api;
  if (opts.includeKeyboard !== false) fakeWindow.WTJ_KEYBOARD = kbStub.api;
  if (opts.includeMatchMedia !== false) fakeWindow.matchMedia = matchMediaStub.fn;
  // WTJ-20260705-015：status-rewards.js 的 `hasSparkles` 只在 IIFE 顶层判定一次（镜像 app.js
  // 同款写法），必须在 vm.runInContext(SR_SRC, ...) 执行之前就把 WTJ_SPARKLES 挂到 fakeWindow 上。
  // （WTJ-20260706-005 起任务成功反馈改用烟花引擎，不再依赖 WTJ_SPARKLES，但保留此挂载不影响。）
  if (opts.includeSparkles !== false) fakeWindow.WTJ_SPARKLES = sparklesStub.api;
  // WTJ-20260706-005：默认挂上烟花引擎 stub（与 index.html 里 reward-fireworks.js 排在
  // status-rewards.js 之前的真实加载顺序一致）。includeFireworks:false 测引擎缺失防御式降级。
  if (opts.includeFireworks !== false) fakeWindow.WTJ_REWARD_FIREWORKS = fireworksStub.api;
  fakeWindow.innerWidth = (typeof opts.innerWidth === 'number') ? opts.innerWidth : 1000;
  fakeWindow.innerHeight = (typeof opts.innerHeight === 'number') ? opts.innerHeight : 800;

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
  vm.runInContext(SR_SRC, sandbox, { filename: 'status-rewards.js' });

  var clock = makeFakeClock();
  if (fakeWindow.WTJ_STATUS_REWARDS && typeof fakeWindow.WTJ_STATUS_REWARDS._setClock === 'function') {
    fakeWindow.WTJ_STATUS_REWARDS._setClock({ setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, now: clock.now });
  }

  return {
    contextObject: sandbox,
    window: fakeWindow,
    SR: fakeWindow.WTJ_STATUS_REWARDS,
    ttStub: ttStub,
    hudStub: hudStub,
    audioStub: audioStub,
    kbStub: kbStub,
    sparklesStub: sparklesStub,
    fireworksStub: fireworksStub,
    matchMediaStub: matchMediaStub,
    clock: clock,
    warnCalls: warnCalls,
    errorCalls: errorCalls
  };
}

// 任务成功 FX burst 的总耗时上限（FX_BURST_STEP_MS * FX_BURST_STEP_COUNT，均为
// status-rewards.js 内部常量占位值），测试用一个足够大的前进量一次性冲过整个 burst。
var FULL_TASKFX_BURST_MS = 2000;

// WTJ-20260705-008：找到挂在 document.body 下的键盘里程碑奖励叠层 root（与「今日工作完成」的
// .wtj-sr-root 分开的一套容器，见 status-rewards.js）。
function milestoneRoot(env) {
  return env.contextObject.document.body.children.filter(function (el) {
    return el.className === 'wtj-sr-milestone-root';
  })[0];
}

// 三灯连闪 + 一次性大奖励叠层的总耗时上限（FLASH_STEP_MS * FLASH_STEP_COUNT +
// OVERLAY_TOTAL_MS，均为 status-rewards.js 内部常量的占位值），测试用一个足够大的前进量
// 一次性冲过整个庆祝流程，不需要逐字段对齐内部常量。
var FULL_CELEBRATION_MS = 5000;

// ============================================================================================
// 1. streak 累计：onTaskComplete 触发一次，streak +1；不足 streakThreshold 不触发奖励。
// ============================================================================================
test('onTaskComplete 累计 streak；连续 2 个不触发「今日工作完成」奖励', function () {
  var env = createSandbox();
  assert.equal(env.ttStub.hasHandler(), true, '015 应该订阅 014 的 onTaskComplete');

  assert.equal(env.SR.getStreak(), 0, '初始 streak 应为 0');

  env.ttStub.fireTaskComplete({ type: 'click', taskId: 'a', lightIndex: 0 });
  assert.equal(env.SR.getStreak(), 1, '第 1 次任务完成后 streak 应为 1');

  env.ttStub.fireTaskComplete({ type: 'drag', taskId: 'b', lightIndex: 1 });
  assert.equal(env.SR.getStreak(), 2, '第 2 次任务完成后 streak 应为 2（真实 manifest streakThreshold=3，此时不应触发）');

  var state = env.SR.getState();
  assert.equal(state.celebrating, false, '未达阈值时不应进入 celebrating 状态');
  assert.equal(state.streakThreshold, 3, '真实 manifest.rewards.statusLights.streakThreshold 应为 3');
  assert.equal(env.hudStub.calls.length, 0, '未达阈值时不应有任何 setStatusLight 调用（015 自己不重复点灯）');
  assert.equal(env.audioStub.calls.length, 0, '未达阈值时不应播放奖励音效');
});

// ============================================================================================
// 2. 第 3 个任务完成触发「今日工作完成」：onWorkComplete emit + 三灯连闪 + 奖励叠层出现。
// ============================================================================================
test('第 3 个任务完成触发「今日工作完成」：onWorkComplete emit + 三灯闪烁 + 奖励叠层出现', function () {
  var env = createSandbox();
  var workCompletePayloads = [];
  env.SR.onWorkComplete(function (payload) {
    workCompletePayloads.push(payload);
  });

  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete(); // 第 3 次，达到 streakThreshold=3

  assert.equal(workCompletePayloads.length, 1, 'onWorkComplete 应该被 emit 一次');
  // P2-2（Fable 对抗评审补测）：payload.streak 是订阅者/QA 判断"这一轮攒够了几个任务才触发"的
  // 唯一凭据，必须断言。触发瞬间 streak 尚未归零（归零发生在 finishCelebration()），因此 payload
  // 里携带的应该正是达标那一刻的 streak 值 === streakThreshold === 3。
  assert.equal(workCompletePayloads[0].streak, 3, 'payload.streak 应为达标瞬间的连续完成数（真实 manifest streakThreshold=3）');
  assert.equal(workCompletePayloads[0].streakThreshold, 3, 'payload.streakThreshold 应为真实 manifest 值 3');
  assert.equal(workCompletePayloads[0].reducedMotion, false, '默认（无 matchMedia 或不匹配）reducedMotion 应为 false');
  assert.ok(Array.isArray(workCompletePayloads[0].forms), 'payload.forms 应为数组');
  assert.ok(workCompletePayloads[0].forms.indexOf('lights-flash-together') !== -1, 'forms 应包含 lights-flash-together');
  // WTJ-20260705-010：'mini-rocket-launch'（纯 CSS 小火箭占位）已被 'desk-stamp'
  // （接入 completion-stamp-v3 素材）取代，见 status-rewards.js IMPLEMENTED_FORMS。
  assert.ok(workCompletePayloads[0].forms.indexOf('desk-stamp') !== -1, 'forms 应包含 desk-stamp（WTJ-20260705-010 接入 completion-stamp-v3 后的表现形式）');
  assert.equal(workCompletePayloads[0].forms.indexOf('mini-rocket-launch'), -1, 'forms 不应再包含已被替换的 mini-rocket-launch 占位表现形式');

  assert.equal(env.audioStub.calls.length, 1, '触发时应播放一次奖励音效');
  assert.equal(env.audioStub.calls[0], 'streak-reward-fanfare', '应使用 audio.js 已登记的 streak-reward-fanfare sfxKey');

  assert.equal(env.SR.getState().celebrating, true, '触发瞬间应进入 celebrating 状态');

  // 奖励叠层与三灯连闪同时发起（见 status-rewards.js flashLightsSequence() 文件头说明），
  // 叠层容器应该在触发的同一个事件循环 tick 内就已经创建，不需要等待任何定时器触发。
  var overlayRootAtTrigger = env.contextObject.document.body.children.filter(function (el) {
    return el.className === 'wtj-sr-root';
  })[0];
  assert.ok(overlayRootAtTrigger, '触发瞬间奖励叠层容器就应该已经创建（与三灯连闪并行播放，不是闪完才出现）');
  assert.ok(overlayRootAtTrigger.children.length > 0, '触发瞬间叠层应该已经有子元素（completion-stamp-v3 贴纸）');

  // WTJ-20260705-010：叠层内应该恰好是 1 张 completion-stamp-v3 贴图，src 取自真实
  // manifest.rewards.completionStamp.sprite（config 驱动，不在 status-rewards.js 硬编码
  // docs/ 设计目录路径），不再是此前的火箭 div + sparkle/star 两张图三个元素。
  var stampImgs = overlayRootAtTrigger.children.filter(function (el) { return el.tagName === 'img'; });
  assert.equal(stampImgs.length, 1, '叠层内应恰好有 1 张 <img>（completion-stamp-v3），不再是火箭 div + sparkle/star 两张图');
  var expectedStampSprite = env.window.WTJ_MANIFEST.rewards.completionStamp.sprite;
  assert.ok(typeof expectedStampSprite === 'string' && expectedStampSprite.indexOf('assets/rewards/completion-stamp-v3.png') !== -1, '前置检查：真实 manifest 应配置 completionStamp.sprite 指向接入的 runtime 素材');
  assert.equal(stampImgs[0].src, expectedStampSprite, 'completion-stamp-v3 贴纸 src 应恰好取自 manifest.rewards.completionStamp.sprite');
  assert.ok(stampImgs[0].className.indexOf('wtj-sr-stamp') !== -1, '贴纸应挂 .wtj-sr-stamp 样式类');

  // 快进足够长的虚拟时间，让三灯连闪的多个节拍都真正执行（快闪用可注入时钟的 setTimeout 链，
  // 触发瞬间只有第 1 步是同步执行的，后续节拍需要虚拟时间推进才会跑）。
  env.clock.advance(FULL_CELEBRATION_MS);

  // 三灯连闪：HUD 应该收到多次交替的 on/off 调用（不是只点亮一次），整个流程期间的调用历史
  // 里应该能看到至少一次 on:false（真正的"闪烁"）。
  assert.ok(env.hudStub.calls.length > 3, '三灯连闪 + 最终熄灯，setStatusLight 调用总次数应明显多于 3 次');
  var sawOff = env.hudStub.calls.some(function (c) { return c.on === false; });
  assert.equal(sawOff, true, '快闪序列 + 最终熄灯里应该出现 on:false（快闪本身的闪烁 + 收尾熄灯）');

  // 全部推进完成后：叠层应该已经被移除、状态灯全部熄灭、streak 归零、退出 celebrating 状态。
  assert.equal(env.SR.getState().celebrating, false, '整个庆祝流程结束后应退出 celebrating 状态');
});

// ============================================================================================
// 3. 触发后熄灭 3 个状态灯 + streak 归零；奖励叠层一次性（假时钟快进后移除，不堆积）。
// ============================================================================================
test('奖励播放完成后：3 个状态灯全部熄灭、streak 归零、叠层被移除且不堆积', function () {
  var env = createSandbox();

  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();

  // 触发瞬间：叠层子元素应该已经被创建（奖励叠层与三灯连闪同时发起，见 status-rewards.js
  // flashLightsSequence() 文件头说明，不需要等快闪先跑完）。
  var overlayRootDuringCelebration = env.contextObject.document.body.children.filter(function (el) {
    return el.className === 'wtj-sr-root';
  })[0];
  assert.ok(overlayRootDuringCelebration, '奖励叠层容器应该已经挂载到 document.body');

  env.clock.advance(FULL_CELEBRATION_MS);

  assert.equal(env.SR.getStreak(), 0, '奖励播放完成后 streak 应归零');
  assert.equal(env.SR.getState().celebrating, false, '奖励播放完成后应退出 celebrating 状态');

  var offCallsForAllLights = [0, 1, 2].every(function (idx) {
    return env.hudStub.calls.some(function (c) {
      return c.index === idx && c.on === false;
    });
  });
  assert.equal(offCallsForAllLights, true, '3 个状态灯（index 0/1/2）都应该收到过 setStatusLight(index, false) 熄灭调用');

  // 叠层不堆积：容器本身还在（懒创建、可复用），但子元素应该清空。
  var overlayRootAfter = env.contextObject.document.body.children.filter(function (el) {
    return el.className === 'wtj-sr-root';
  })[0];
  assert.ok(overlayRootAfter, '叠层容器本身应该继续存在（懒创建单例，不重复创建/移除根节点）');
  assert.equal(overlayRootAfter.children.length, 0, '奖励播放完成后叠层子元素应该被清空，不应残留堆积');

  // 再触发一轮（第 4/5/6 个任务），确认下一轮叠层子元素数量与上一轮一致（不会因为清理不干净
  // 而越来越多）。
  env.hudStub.calls.length = 0;
  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();

  // P2-1（Fable 对抗评审补强）：原先第二轮只在 advance 之后断言 children.length===0——但若回归
  // 导致"第 6 个任务根本没有再触发第二轮奖励"，children 同样会是 0（因为压根没创建过第二套），
  // 断言会空过、掩盖回归。这里在 advance 之前显式断言第二轮确实被触发：celebrating 必须为 true，
  // 且第二套叠层子元素必须已经存在。这样"第 6 个又触发了一次今日工作完成"这件事被正面证明，
  // 而不是靠一个对两种情况都成立的弱断言。
  assert.equal(env.SR.getState().celebrating, true, '第 4/5/6 个任务后应重新进入 celebrating 状态（证明第二轮确实被触发，而非空过）');
  assert.ok(overlayRootAfter.children.length > 0, '第二轮触发瞬间应该重新出现奖励叠层子元素（正面证明第二轮被触发）');

  env.clock.advance(FULL_CELEBRATION_MS);
  // 第二轮同样应该收到 3 个灯的熄灭调用（收尾熄灯真的跑了，而不是流程半途卡住）。
  var secondRoundOffAllLights = [0, 1, 2].every(function (idx) {
    return env.hudStub.calls.some(function (c) { return c.index === idx && c.on === false; });
  });
  assert.equal(secondRoundOffAllLights, true, '第二轮奖励播放完成后 3 个状态灯同样应该全部收到熄灭调用');
  assert.equal(env.SR.getStreak(), 0, '第二轮奖励播放完成后 streak 同样应该归零');
  assert.equal(overlayRootAfter.children.length, 0, '第二轮奖励播放完成后叠层子元素同样应该被清空，不会跨轮次累积');
});

// ============================================================================================
// 3b. 并发守卫（P2-3 关键）：celebrating 期间收到的任务完成事件被吞掉——不计入下一轮 streak、
//     不叠加第二套奖励叠层。这是 status-rewards.js:handleTaskComplete() 的 `if (celebrating)
//     return`，是验收 4「不污染主画面」的核心防线（防止庆祝动画播放中又被点出第二套 overlay
//     叠在一起），此前 8 个 test 无一覆盖。
// ============================================================================================
test('并发守卫：celebrating 期间的任务完成被吞掉——streak 不叠加、不出现第二套奖励叠层', function () {
  var env = createSandbox();

  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete(); // 第 3 次触发庆祝，此刻 celebrating === true

  assert.equal(env.SR.getState().celebrating, true, '第 3 次任务完成后应进入 celebrating 状态');
  var streakDuringCelebration = env.SR.getStreak();

  var overlayRoot = env.contextObject.document.body.children.filter(function (el) {
    return el.className === 'wtj-sr-root';
  })[0];
  assert.ok(overlayRoot, '庆祝期间奖励叠层容器应该已经创建');
  var childCountBefore = overlayRoot.children.length;
  assert.ok(childCountBefore > 0, '庆祝期间叠层应该已经有子元素（completion-stamp-v3 贴纸）');

  // 关键：在庆祝进行中（advance 之前）又完成一个任务——被 handleTaskComplete 的并发守卫拦下。
  env.ttStub.fireTaskComplete();

  assert.equal(env.SR.getStreak(), streakDuringCelebration, '庆祝期间的任务完成不应叠加 streak（并发守卫拦住，不计数）');
  assert.equal(overlayRoot.children.length, childCountBefore, '庆祝期间的任务完成不应叠加第二套奖励叠层子元素（不污染主画面）');

  // 再插几次也一样被吞，不应触发第二次 onWorkComplete / 第二套叠层。
  var extraWorkComplete = 0;
  env.SR.onWorkComplete(function () { extraWorkComplete++; });
  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();
  assert.equal(env.SR.getState().celebrating, true, '连续插入的任务完成期间仍应保持在同一次庆祝中');
  assert.equal(overlayRoot.children.length, childCountBefore, '连续插入的任务完成仍不应叠加叠层子元素');
  assert.equal(extraWorkComplete, 0, '庆祝期间不应再 emit 第二次 onWorkComplete');

  // 庆祝结束后，被吞掉的那几次不"补算"——streak 从 0 干净开始下一轮（不遗留脏计数）。
  env.clock.advance(FULL_CELEBRATION_MS);
  assert.equal(env.SR.getStreak(), 0, '庆祝结束后 streak 应干净归零，被吞掉的任务完成不补算到下一轮');
  assert.equal(env.SR.getState().celebrating, false, '庆祝结束后应退出 celebrating 状态');
});

// ============================================================================================
// 4. reset() 外部重置：清空 streak，中止进行中的奖励播放。
// ============================================================================================
test('reset() 清空 streak，并能中止进行中的奖励播放（家长退出/新会话场景）', function () {
  var env = createSandbox();

  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();
  assert.equal(env.SR.getStreak(), 2, '触发 reset 前 streak 应为 2');

  env.SR.reset();
  assert.equal(env.SR.getStreak(), 0, 'reset() 后 streak 应归零');
  assert.equal(env.SR.getState().celebrating, false, 'reset() 后应处于非 celebrating 状态');

  // 再验证 reset() 能中止一次进行中的庆祝（不会在 reset 之后因为遗留定时器又跑出一次熄灯/清零）。
  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();
  assert.equal(env.SR.getState().celebrating, true, '第 3 次任务完成后应重新进入 celebrating 状态');

  env.SR.reset();
  assert.equal(env.SR.getState().celebrating, false, 'reset() 应该能够中止进行中的庆祝');
  assert.equal(env.SR.getStreak(), 0, 'reset() 后 streak 应归零');

  var overlayRoot = env.contextObject.document.body.children.filter(function (el) {
    return el.className === 'wtj-sr-root';
  })[0];
  if (overlayRoot) {
    assert.equal(overlayRoot.children.length, 0, 'reset() 应该立即清空奖励叠层子元素');
  }

  // 快进一大段虚拟时间，确认 reset() 之前挂起的定时器不会在之后又触发一次熄灯/清零的副作用
  // （因为 reset() 内部已经 clearTimeout 了 flashTimerId/overlayTimerId）。
  env.hudStub.calls.length = 0;
  env.clock.advance(FULL_CELEBRATION_MS);
  assert.equal(env.hudStub.calls.length, 0, 'reset() 之后不应该再有遗留定时器触发的 setStatusLight 调用');
});

// ============================================================================================
// 5. 防御式：WTJ_TASK_TEMPLATES / WTJ_HUD / WTJ_AUDIO 缺失时加载都不应抛错。
// ============================================================================================
test('防御式：WTJ_TASK_TEMPLATES/WTJ_HUD/WTJ_AUDIO 任一或全部缺失时加载都不抛错，API 仍挂载', function () {
  assert.doesNotThrow(function () {
    var env = createSandbox({ includeTaskTemplates: false, includeHud: false, includeAudio: false });
    assert.ok(env.SR, 'window.WTJ_STATUS_REWARDS 即使依赖全缺失也应该挂载');
    assert.equal(typeof env.SR.getStreak, 'function', 'getStreak API 应该存在');
    assert.equal(typeof env.SR.onWorkComplete, 'function', 'onWorkComplete API 应该存在');
  }, '三个依赖全缺失时不应该抛出异常');

  assert.doesNotThrow(function () {
    var env = createSandbox({ includeTaskTemplates: false });
    // 没有 WTJ_TASK_TEMPLATES 时 streak 无法被外部驱动，但 getStreak/reset/getState 仍应可调用。
    assert.equal(env.SR.getStreak(), 0, '无法接收 onTaskComplete 时 streak 应保持 0');
    env.SR.reset();
    assert.equal(env.SR.getStreak(), 0, 'reset() 在依赖缺失时也不应抛错');
  }, 'WTJ_TASK_TEMPLATES 缺失时不应该抛出异常');

  assert.doesNotThrow(function () {
    var env = createSandbox({ includeHud: false, includeAudio: false });
    env.ttStub.fireTaskComplete();
    env.ttStub.fireTaskComplete();
    env.ttStub.fireTaskComplete();
    env.clock.advance(FULL_CELEBRATION_MS);
    assert.equal(env.SR.getStreak(), 0, 'WTJ_HUD/WTJ_AUDIO 缺失时，完整庆祝流程仍应正常走完（防御式降级）并归零 streak');
  }, 'WTJ_HUD/WTJ_AUDIO 缺失时完整触发流程不应该抛出异常');

  assert.doesNotThrow(function () {
    createSandbox({ omitManifest: true });
  }, 'window.WTJ_MANIFEST 缺失时不应该抛出异常（回退内置默认值）');
});

// ============================================================================================
// 6. 重复引入守卫：同一沙箱内重复执行源码不应该替换已有 API 或抛错。
// ============================================================================================
test('重复引入守卫：同一沙箱内二次加载 status-rewards.js 不应替换已有 API 或抛错', function () {
  var env = createSandbox();
  var firstApiRef = env.window.WTJ_STATUS_REWARDS;
  assert.ok(Object.isFrozen(firstApiRef), 'window.WTJ_STATUS_REWARDS 应该是 Object.freeze 冻结对象');

  assert.doesNotThrow(function () {
    vm.runInContext(SR_SRC, env.contextObject, { filename: 'status-rewards.js#2' });
  }, '二次加载不应该抛错（重复引入守卫应该让第二次执行直接 return）');

  assert.equal(env.window.WTJ_STATUS_REWARDS, firstApiRef, '二次加载后 window.WTJ_STATUS_REWARDS 引用应该保持不变（守卫生效，未被替换）');
});

// ============================================================================================
// 7. prefers-reduced-motion：奖励动画冻结为静态完成态（不闪不动）。
// ============================================================================================
test('prefers-reduced-motion 命中时：三灯不做快闪，直接一次性点亮；奖励叠层仍按计划展示与移除', function () {
  var env = createSandbox({ reducedMotion: true });
  var workCompletePayloads = [];
  env.SR.onWorkComplete(function (payload) {
    workCompletePayloads.push(payload);
  });

  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();

  assert.equal(workCompletePayloads.length, 1, 'reduced-motion 下 onWorkComplete 仍应该 emit 一次');
  assert.equal(workCompletePayloads[0].reducedMotion, true, 'payload.reducedMotion 应反映 matchMedia 命中结果');

  // 不闪：reduced-motion 下不应该出现"先 off 再 on"的交替调用，只应该有一次性把 3 个灯都设为 true。
  var offCalls = env.hudStub.calls.filter(function (c) { return c.on === false; });
  assert.equal(offCalls.length, 0, 'reduced-motion 触发瞬间不应该出现任何 on:false 的闪烁调用');
  var onIndexes = env.hudStub.calls.filter(function (c) { return c.on === true; }).map(function (c) { return c.index; });
  assert.ok(onIndexes.indexOf(0) !== -1 && onIndexes.indexOf(1) !== -1 && onIndexes.indexOf(2) !== -1, 'reduced-motion 下应该一次性点亮全部 3 个状态灯');

  // 奖励叠层仍然照常创建、并仍由 JS 定时移除（只是 CSS 不做动画，JS 侧行为不变）。
  var overlayRoot = env.contextObject.document.body.children.filter(function (el) {
    return el.className === 'wtj-sr-root';
  })[0];
  assert.ok(overlayRoot, 'reduced-motion 下奖励叠层容器仍应该被创建');
  assert.ok(overlayRoot.children.length > 0, 'reduced-motion 下奖励叠层仍应该有子元素（静态展示，不是完全不显示）');

  env.hudStub.calls.length = 0;
  env.clock.advance(FULL_CELEBRATION_MS);

  assert.equal(env.SR.getStreak(), 0, 'reduced-motion 下奖励播放完成后 streak 同样应该归零');
  assert.equal(overlayRoot.children.length, 0, 'reduced-motion 下奖励叠层同样应该被 JS 定时清空，不常驻主画面');
  var offCallsAfter = [0, 1, 2].every(function (idx) {
    return env.hudStub.calls.some(function (c) { return c.index === idx && c.on === false; });
  });
  assert.equal(offCallsAfter, true, 'reduced-motion 下奖励播放完成后 3 个状态灯同样应该全部熄灭');
});

// ============================================================================================
// 8. 播放奖励音效防御式调用：playSfx 抛错不应该影响其余流程。
// ============================================================================================
test('播放奖励音效是防御式调用：WTJ_AUDIO.playSfx 抛错不应该影响 streak/HUD/叠层逻辑', function () {
  var env = createSandbox();
  env.window.WTJ_AUDIO = {
    playSfx: function () {
      throw new Error('boom');
    }
  };

  assert.doesNotThrow(function () {
    env.ttStub.fireTaskComplete();
    env.ttStub.fireTaskComplete();
    env.ttStub.fireTaskComplete();
  }, 'playSfx 内部抛错不应该向上冒泡');

  assert.equal(env.SR.getState().celebrating, true, '即使 playSfx 抛错，三灯闪烁/奖励叠层流程仍应该正常触发');
  assert.ok(env.errorCalls.some(function (m) { return m.indexOf('playSfx') !== -1; }), '应该有一条包含 playSfx 的 console.error 记录（已捕获异常）');

  env.clock.advance(FULL_CELEBRATION_MS);
  assert.equal(env.SR.getStreak(), 0, 'playSfx 抛错不应该影响最终 streak 归零');
});

// ============================================================================================
// WTJ-20260705-008：键盘自由探索里程碑奖励叠层（接入 DESIGN-007 keyboard-spark 素材）。
// status-rewards.js 订阅 008 的 WTJ_KEYBOARD.onMilestone，达到里程碑时弹出一次性键盘主题奖励。
// ============================================================================================
test('008 里程碑奖励：WTJ_KEYBOARD.onMilestone 触发时弹出键盘主题奖励叠层，贴纸 src 取自真实 manifest.rewards.keyboardMilestone.rewardSticker（非星星占位）', function () {
  var env = createSandbox();
  assert.equal(env.kbStub.hasHandler(), true, 'status-rewards 应订阅 WTJ_KEYBOARD.onMilestone');

  var expectedSticker = env.window.WTJ_MANIFEST.rewards.keyboardMilestone.rewardSticker;
  assert.ok(
    typeof expectedSticker === 'string' && expectedSticker.indexOf('assets/discovery-icons/') !== -1,
    '前置检查：真实 manifest 应配置键盘里程碑奖励贴纸，指向接入的 DESIGN-007 discovery-icons 运行时素材'
  );

  assert.equal(milestoneRoot(env), undefined, '未触发前不应创建里程碑奖励叠层容器');

  env.kbStub.fireMilestone(100);

  var root = milestoneRoot(env);
  assert.ok(root, '里程碑触发后应创建 .wtj-sr-milestone-root 叠层容器');
  assert.ok(root.children.length > 0, '叠层应有子元素（键盘贴纸）');
  var img = root.children.filter(function (el) { return el.tagName === 'img'; })[0];
  assert.ok(img, '叠层内应有一个 <img> 键盘贴纸');
  assert.equal(img.src, expectedSticker, '贴纸 src 应恰好取自 manifest.rewards.keyboardMilestone.rewardSticker（config 驱动，不在 status-rewards.js 硬编码文件名）');
  assert.ok(img.className.indexOf('wtj-sr-milestone-sticker') !== -1, '贴纸应挂 .wtj-sr-milestone-sticker 样式类');

  // 里程碑奖励独立于「今日工作完成」连续奖励：不改任务连击 streak、不进入 celebrating。
  assert.equal(env.SR.getStreak(), 0, '里程碑奖励不应改变任务连击 streak（两条独立进度线）');
  assert.equal(env.SR.getState().celebrating, false, '里程碑奖励不应进入 celebrating（与工作完成奖励互不吞并）');
});

test('008 里程碑奖励叠层一次性：可见窗口后被 JS 定时清空不常驻；快速连达两个里程碑只保留最新一批（不堆积）', function () {
  var env = createSandbox();

  env.kbStub.fireMilestone(100);
  var root = milestoneRoot(env);
  assert.ok(root.children.length > 0, '第一个里程碑后应出现叠层子元素');

  env.clock.advance(200); // 尚在可见窗口内
  assert.ok(root.children.length > 0, '可见窗口内叠层仍应存在');

  env.kbStub.fireMilestone(200); // 紧接着第二个里程碑
  var imgs = root.children.filter(function (el) { return el.tagName === 'img'; });
  assert.equal(imgs.length, 1, '快速连达第二个里程碑时叠层内仍只有 1 张贴纸（先收尾旧的再放新的，不堆积成两套）');

  env.clock.advance(3000); // 冲过整个可见窗口
  assert.equal(root.children.length, 0, '可见窗口结束后叠层子元素应被 JS 定时清空，不常驻主画面（一次性表现）');
});

test('008 reset() 立即收起进行中的里程碑奖励叠层（家长退出/新会话），不留残影', function () {
  var env = createSandbox();
  env.kbStub.fireMilestone(100);
  var root = milestoneRoot(env);
  assert.ok(root.children.length > 0, '触发后叠层应有子元素');

  env.SR.reset();
  assert.equal(root.children.length, 0, 'reset() 后里程碑叠层子元素应被立即清空');
});

test('008 防御式：WTJ_KEYBOARD 缺失时加载不抛错，里程碑订阅降级为 console.warn（其余 API 仍挂载）', function () {
  assert.doesNotThrow(function () {
    var env = createSandbox({ includeKeyboard: false });
    assert.ok(env.SR, 'WTJ_KEYBOARD 缺失时 status-rewards 仍应挂载');
    assert.ok(
      env.warnCalls.some(function (m) { return m.indexOf('WTJ_KEYBOARD') !== -1; }),
      '应有一条关于 WTJ_KEYBOARD.onMilestone 缺失的 console.warn（防御式降级）'
    );
  }, 'WTJ_KEYBOARD 缺失不应抛错');
});

test('008 status-rewards.css 静态契约：里程碑叠层 root z-index:7（低于秘密词命中 8/工作完成 9，不遮挡它们），贴纸样式 + 一次性关键帧 + reduced-motion 覆盖齐全', function () {
  var css = readFileSync(SR_CSS_PATH, 'utf8');
  var rootBlock = css.match(/\.wtj-sr-milestone-root\s*\{[^}]*\}/);
  assert.ok(rootBlock, 'status-rewards.css 应定义 .wtj-sr-milestone-root 规则块');
  assert.ok(/z-index:\s*7\b/.test(rootBlock[0]), '.wtj-sr-milestone-root 应为 z-index:7（低于秘密词命中叠层 8 / 今日工作完成 9，保证不遮挡它们）');
  assert.ok(/\.wtj-sr-milestone-sticker\s*\{/.test(css), '应定义 .wtj-sr-milestone-sticker 贴纸样式');
  assert.ok(/@keyframes\s+wtj-sr-milestone-pop\s*\{/.test(css), '应定义 @keyframes wtj-sr-milestone-pop（一次性淡入→停留→淡出）');
  var reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/);
  assert.ok(reduced && reduced[1].indexOf('.wtj-sr-milestone-sticker') !== -1, 'reduced-motion 媒体查询块应覆盖 .wtj-sr-milestone-sticker（冻结为静态完成态）');
});

// ============================================================================================
// WTJ-20260705-010：completion-stamp-v3 接入（替换「今日工作完成」奖励此前的粗糙火箭/星星占位）。
// ============================================================================================
test('010 status-rewards.css 静态契约：.wtj-sr-stamp 存在 + 一次性关键帧 + reduced-motion 覆盖；旧的 .wtj-sr-rocket/.wtj-sr-sparkle/.wtj-sr-star 规则已被移除（回归护栏，防止火箭/星星占位复活）', function () {
  var css = readFileSync(SR_CSS_PATH, 'utf8');

  assert.ok(/\.wtj-sr-stamp\s*\{/.test(css), '应定义 .wtj-sr-stamp 贴纸样式');
  assert.ok(/@keyframes\s+wtj-sr-stamp-pop\s*\{/.test(css), '应定义 @keyframes wtj-sr-stamp-pop（一次性 pop/scale/fade）');
  assert.ok(/@-webkit-keyframes\s+wtj-sr-stamp-pop\s*\{/.test(css), '应定义 -webkit- 前缀版本（Safari 14 兼容基线）');

  var reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/);
  assert.ok(reduced && reduced[1].indexOf('.wtj-sr-stamp') !== -1, 'reduced-motion 媒体查询块应覆盖 .wtj-sr-stamp（冻结为静态完成态）');

  // 回归护栏：验收标准 1 明确要求"不再用粗糙火箭/星星占位"，用规则选择器名（带前导 .）而非
  // 裸单词匹配，避免误伤本文件里作为历史说明保留的中文注释文本（注释里会提到这些类名字符串）。
  assert.ok(!/\.wtj-sr-rocket\s*[.{,:]/.test(css), '不应再存在 .wtj-sr-rocket 规则（火箭占位已移除）');
  assert.ok(!/\.wtj-sr-sparkle\s*[.{,:]/.test(css), '不应再存在 .wtj-sr-sparkle 规则（sparkle-burst 占位已移除）');
  assert.ok(!/\.wtj-sr-star\s*[.{,:]/.test(css), '不应再存在 .wtj-sr-star 规则（star-sticker 占位已移除）');
  // 要求紧跟 `{`，只匹配真正的规则声明，不误伤本文件里作为历史说明保留的中文注释
  // （注释文本里会提到这些 @keyframes 名字用于交代"被谁替换掉了"）。
  assert.ok(!/@keyframes\s+wtj-sr-rocket-rise\s*\{/.test(css), '不应再存在 @keyframes wtj-sr-rocket-rise 规则');
  assert.ok(!/@keyframes\s+wtj-sr-sparkle-pop\s*\{/.test(css), '不应再存在 @keyframes wtj-sr-sparkle-pop 规则');
  assert.ok(!/@keyframes\s+wtj-sr-star-pop\s*\{/.test(css), '不应再存在 @keyframes wtj-sr-star-pop 规则');
});

test('010 非遮挡契约：.wtj-sr-stamp 定位不落在屏幕正中心（避开 .wtj-secret-sprite 的 top:50%/left:50%），且不禁用每帧 gradient/shadowBlur（纯 transform/opacity）', function () {
  var css = readFileSync(SR_CSS_PATH, 'utf8');
  var stampBlock = css.match(/\.wtj-sr-stamp\s*\{[^}]*\}/);
  assert.ok(stampBlock, 'status-rewards.css 应定义 .wtj-sr-stamp 规则块');

  // 秘密词命中叠层用 top:50%（见 secretword.css .wtj-secret-sprite），.wtj-sr-stamp 不应该
  // 同样使用 top:50% 精确坐标——本卡用 bottom 百分比定位，天然避开屏幕正中心那一点。
  assert.ok(!/top:\s*50%/.test(stampBlock[0]), '.wtj-sr-stamp 不应使用 top:50%（避免与秘密词命中叠层争抢屏幕正中心那一点）');
  assert.ok(/bottom:\s*\d/.test(stampBlock[0]), '.wtj-sr-stamp 应使用 bottom 定位（偏下方，不遮挡中心）');

  // app/PERFORMANCE.md 红线：禁止每帧 gradient/shadowBlur；.wtj-sr-stamp 是纯 transform/opacity
  // 的一次性 CSS 动画（GPU 合成，非逐帧 JS canvas 重绘），不应该出现 shadowBlur（canvas API，
  // CSS 里本就不存在这个属性，此处断言是防止未来误引入 JS canvas 版本时忘记这条红线）与
  // linear-gradient/radial-gradient 背景（此前的火箭形状用了 linear-gradient 背景，本卡改用
  // 图片贴图，不应该再需要渐变背景）。
  assert.ok(stampBlock[0].indexOf('shadowBlur') === -1, '.wtj-sr-stamp 不应涉及 shadowBlur（canvas API 概念，CSS 动画不应引入）');
  assert.ok(!/gradient\(/.test(stampBlock[0]), '.wtj-sr-stamp 规则块不应使用 gradient 背景（图片贴图 + filter:drop-shadow 即可，不需要渐变）');
});

test('010 reduced-motion 命中时：completion-stamp-v3 贴纸仍然创建并展示，但 img 本身不依赖动画类即可判定（叠层内容契约与非 reduced-motion 场景一致）', function () {
  var env = createSandbox({ reducedMotion: true });

  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();

  var overlayRoot = env.contextObject.document.body.children.filter(function (el) {
    return el.className === 'wtj-sr-root';
  })[0];
  assert.ok(overlayRoot, 'reduced-motion 下奖励叠层容器仍应该被创建');

  var stampImgs = overlayRoot.children.filter(function (el) { return el.tagName === 'img'; });
  assert.equal(stampImgs.length, 1, 'reduced-motion 下叠层内仍应恰好有 1 张 completion-stamp-v3 贴图（静态展示，不是完全不显示）');
  var expectedStampSprite = env.window.WTJ_MANIFEST.rewards.completionStamp.sprite;
  assert.equal(stampImgs[0].src, expectedStampSprite, 'reduced-motion 下贴纸 src 仍应取自 manifest.rewards.completionStamp.sprite');
  assert.ok(stampImgs[0].className.indexOf('wtj-sr-anim') !== -1, 'JS 侧仍然挂上 wtj-sr-anim 类（是否播放动画由 CSS 的 reduced-motion 媒体查询覆盖决定，JS 逻辑不因 reduced-motion 分叉）');

  env.clock.advance(FULL_CELEBRATION_MS);
  assert.equal(overlayRoot.children.length, 0, 'reduced-motion 下奖励播放完成后叠层同样应该被清空，不常驻主画面');
});

test('010 防御式：manifest.rewards.completionStamp 缺失时回退到内置默认 runtime 路径（不是 docs/ 设计目录路径），叠层仍正常展示', function () {
  // 构造一份缺少 rewards.completionStamp 字段的 manifest（保留 rewards.statusLights 等其余
  // 字段，只删掉本卡新增的这一个 config block，见 stripManifestObjectField() 的大括号计数摘除
  // 实现），验证 getCompletionStampSpritePath() 的防御式回退分支：manifest 存在但该字段缺失时，
  // 不应该抛错、也不应该退化成空叠层，而是回退到与 manifest 里同一个 runtime 相对路径的内置
  // 默认值。
  var manifestWithoutCompletionStamp = stripManifestObjectField(MANIFEST_SRC, 'completionStamp');
  assert.ok(manifestWithoutCompletionStamp, '前置检查：stripManifestObjectField 应该能在真实 manifest.js 里定位到 completionStamp 字段');
  assert.notEqual(manifestWithoutCompletionStamp, MANIFEST_SRC, '前置检查：字符串替换应确实生效（否则测试没有测到防御分支）');
  assert.ok(manifestWithoutCompletionStamp.indexOf('completionStamp:') === -1, '前置检查：构造的 manifest 变体不应再包含 completionStamp 字段');

  var env = createSandbox({ manifestOverrideSrc: manifestWithoutCompletionStamp });
  assert.equal(env.window.WTJ_MANIFEST.rewards.completionStamp, undefined, '前置检查：本次沙箱加载的 manifest 变体确实没有 rewards.completionStamp');

  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();
  env.ttStub.fireTaskComplete();

  var overlayRoot = env.contextObject.document.body.children.filter(function (el) {
    return el.className === 'wtj-sr-root';
  })[0];
  var stampImgs = overlayRoot.children.filter(function (el) { return el.tagName === 'img'; });
  assert.equal(stampImgs.length, 1, 'manifest.rewards.completionStamp 缺失时仍应展示 1 张贴纸（防御式回退，不是空叠层）');
  assert.equal(stampImgs[0].src, 'assets/rewards/completion-stamp-v3.png', '缺配置时应回退到内置默认 runtime 相对路径（与 manifest 正常配置值相同，不是 docs/ 设计目录路径）');
});

// ============================================================================================
// WTJ-20260706-005：任务成功即时视觉反馈改用可复用烟花引擎（取代 015 首次交付的 sparkle burst +
// 成功环）。每次 onTaskComplete 都调 window.WTJ_REWARD_FIREWORKS.play(style, {origin})，独立于
// streak/celebrating 状态机——不因为正在庆祝三连奖励而跳过，也不因为不足 3 个而不播放。
// starburst ⇄ round-bloom 严格交替；anchor 直接透传给引擎（引擎自己支持百分比 origin），press
// 类 anchor=null 时回退 viewportCenter()。粒子物理/分步动画/reduced-motion 静态帧等引擎内部行为
// 由 tests/unit/reward-fireworks.test.mjs 覆盖，本文件不重复锁（D1「单一系统」）。
// ============================================================================================

test('005：每次 onTaskComplete 都调用一次 WTJ_REWARD_FIREWORKS.play()（不再懒创建自己的 taskfx canvas）', function () {
  var env = createSandbox();
  assert.equal(env.fireworksStub.playCalls.length, 0, '触发前不应有任何 play() 调用');

  env.ttStub.fireTaskComplete({ type: 'click', taskId: 'a', lightIndex: 0, anchor: { leftPercent: 50, topPercent: 50 } });
  assert.equal(env.fireworksStub.playCalls.length, 1, '一次任务完成应调用一次 play()');

  env.ttStub.fireTaskComplete({ type: 'click', taskId: 'b', lightIndex: 1, anchor: { leftPercent: 20, topPercent: 30 } });
  assert.equal(env.fireworksStub.playCalls.length, 2, '第二次任务完成再调一次 play()（每次一次）');

  // 不再创建 .wtj-sr-taskfx-canvas（渲染面已交给引擎自己的 .wtj-fw-canvas，见 005 迁移）。
  var stray = env.contextObject.document.body.children.filter(function (el) { return el.className === 'wtj-sr-taskfx-canvas'; });
  assert.equal(stray.length, 0, '005 起不应再创建 .wtj-sr-taskfx-canvas（渲染面归引擎的 .wtj-fw-canvas）');
});

test('005：starburst ⇄ round-bloom 严格交替（每次任务完成切换一次形态）', function () {
  var env = createSandbox();
  var styles = [];
  var i;
  for (i = 0; i < 5; i++) {
    env.ttStub.fireTaskComplete({ type: 'click', taskId: 't' + i, lightIndex: 0, anchor: { leftPercent: 50, topPercent: 50 } });
    styles.push(env.fireworksStub.playCalls[i].styleId);
  }
  assert.deepEqual(styles, ['starburst', 'round-bloom', 'starburst', 'round-bloom', 'starburst'], '连续任务完成应 starburst/round-bloom 严格交替');
});

test('005：anchor 为 {leftPercent, topPercent} 时，直接透传给引擎 opts.origin（引擎自己做百分比→像素换算）', function () {
  var env = createSandbox({ innerWidth: 1000, innerHeight: 800 });
  var anchor = { leftPercent: 38, topPercent: 16 };
  env.ttStub.fireTaskComplete({ type: 'click', taskId: 'a', lightIndex: 0, anchor: anchor });

  var call = env.fireworksStub.playCalls[0];
  assert.equal(call.opts.origin.leftPercent, 38, 'anchor 的 leftPercent 应原样透传给 play() 的 opts.origin');
  assert.equal(call.opts.origin.topPercent, 16, 'anchor 的 topPercent 应原样透传给 play() 的 opts.origin');
});

test('005：press 类任务没有 DOM，anchor 为 null 时回退 viewportCenter()（像素坐标 {x,y}）', function () {
  var env = createSandbox({ innerWidth: 1000, innerHeight: 800 });
  env.ttStub.fireTaskComplete({ type: 'press', taskId: 'press-letter-a', lightIndex: 0, anchor: null });

  var call = env.fireworksStub.playCalls[0];
  // viewportCenter() = { x: innerWidth/2, y: innerHeight/2 } = { x:500, y:400 }。
  assert.equal(call.opts.origin.x, 500, 'anchor 缺失应回退 viewportCenter().x = innerWidth/2 = 500');
  assert.equal(call.opts.origin.y, 400, 'anchor 缺失应回退 viewportCenter().y = innerHeight/2 = 400');
});

test('005：无条件触发——即使 celebrating 期间（第 3 个任务同时触发三灯庆祝），任务成功烟花仍照常 play()，不受并发守卫影响', function () {
  var env = createSandbox();

  env.ttStub.fireTaskComplete({ type: 'click', taskId: 'a', lightIndex: 0, anchor: { leftPercent: 10, topPercent: 10 } });
  env.ttStub.fireTaskComplete({ type: 'click', taskId: 'b', lightIndex: 1, anchor: { leftPercent: 20, topPercent: 20 } });
  var callsBeforeThird = env.fireworksStub.playCalls.length;

  // 第 3 次：既触发「今日工作完成」三灯庆祝，也应照常触发这一次任务自己的烟花。
  env.ttStub.fireTaskComplete({ type: 'click', taskId: 'c', lightIndex: 2, anchor: { leftPercent: 30, topPercent: 30 } });
  assert.equal(env.SR.getState().celebrating, true, '第 3 次应进入 celebrating 状态（010 三灯庆祝）');
  assert.ok(env.fireworksStub.playCalls.length > callsBeforeThird, '即使同时触发三灯庆祝，任务成功烟花也应照常 play()（不受 celebrating 并发守卫影响）');

  // celebrating 期间被吞掉的第 4 次任务完成（不计入 streak），烟花仍应照常 play()。
  var callsBeforeFourth = env.fireworksStub.playCalls.length;
  env.ttStub.fireTaskComplete({ type: 'click', taskId: 'd', lightIndex: 0, anchor: { leftPercent: 40, topPercent: 40 } });
  assert.ok(env.fireworksStub.playCalls.length > callsBeforeFourth, 'celebrating 期间被并发守卫吞掉 streak 计数的任务完成，烟花仍应照常 play()');
});

test('005：reset() 不调用 WTJ_REWARD_FIREWORKS.stopAll()（避免误停 reward-chest 可能正在并发播放的宝箱高潮，见 status-rewards.js reset() 注释）', function () {
  var env = createSandbox();
  env.ttStub.fireTaskComplete({ type: 'click', taskId: 'a', lightIndex: 0, anchor: { leftPercent: 50, topPercent: 50 } });
  assert.equal(env.fireworksStub.playCalls.length, 1, '前置：任务完成已 play() 一次');

  assert.doesNotThrow(function () { env.SR.reset(); }, 'reset() 不应抛错');
  assert.equal(env.fireworksStub.getStopAllCalls(), 0, 'reset() 刻意不调用 stopAll()（任务成功烟花是 <1s one-shot 自我清理，且引擎实例与宝箱高潮共用，不应误停）');
});

test('005：WTJ_REWARD_FIREWORKS 缺失时，任务成功烟花降级为 console.warn，streak/三灯庆祝等其余流程不受影响', function () {
  var env = createSandbox({ includeFireworks: false });

  assert.doesNotThrow(function () {
    env.ttStub.fireTaskComplete({ type: 'click', taskId: 'a', lightIndex: 0, anchor: { leftPercent: 50, topPercent: 50 } });
  }, '烟花引擎缺失时任务完成不应抛错');
  assert.ok(env.warnCalls.some(function (m) { return m.indexOf('WTJ_REWARD_FIREWORKS') !== -1; }), '应有一条关于 WTJ_REWARD_FIREWORKS 缺失的 console.warn（防御式降级）');
  assert.equal(env.SR.getStreak(), 1, '烟花引擎缺失不应影响 streak 累计（第 1 个任务 streak=1）');

  // 三灯庆祝流程照常（再来两次达阈值）。
  env.ttStub.fireTaskComplete({ type: 'click', taskId: 'b', lightIndex: 1, anchor: { leftPercent: 50, topPercent: 50 } });
  env.ttStub.fireTaskComplete({ type: 'click', taskId: 'c', lightIndex: 2, anchor: { leftPercent: 50, topPercent: 50 } });
  assert.equal(env.SR.getState().celebrating, true, '烟花引擎缺失不应影响「今日工作完成」三灯庆祝正常触发');
});

test('005：无 document（非浏览器测试沙箱）时不抛错——烟花 play() 走引擎自己的防御式，status-rewards 侧不额外创建 canvas', function () {
  assert.doesNotThrow(function () {
    var warnCalls = [];
    var ttStub = makeTaskTemplatesStub();
    var fireworksStub = makeFireworksStub();
    var fakeWindow = { WTJ_TASK_TEMPLATES: ttStub.api, WTJ_REWARD_FIREWORKS: fireworksStub.api, innerWidth: 1000, innerHeight: 800 };
    var sandbox = {
      window: fakeWindow,
      console: { log: function () {}, warn: function () { warnCalls.push(1); }, error: function () {} }
    };
    vm.createContext(sandbox);
    vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
    vm.runInContext(SR_SRC, sandbox, { filename: 'status-rewards.js' });
    ttStub.fireTaskComplete({ type: 'click', taskId: 'a', lightIndex: 0, anchor: { leftPercent: 50, topPercent: 50 } });
    assert.equal(fireworksStub.playCalls.length, 1, 'document 缺失时 status-rewards 仍会调用一次 play()（不自己碰 document）');
  }, 'document 完全缺失时任务成功烟花不应抛错');
});

test('005 status-rewards.css 回归护栏：.wtj-sr-taskfx-canvas 规则已移除（渲染面迁到 reward-fireworks.css 的 .wtj-fw-canvas，防止旧 sparkle canvas 复活）', function () {
  var css = readFileSync(SR_CSS_PATH, 'utf8');
  assert.ok(!/\.wtj-sr-taskfx-canvas\s*\{/.test(css), 'status-rewards.css 不应再定义 .wtj-sr-taskfx-canvas 规则块（005 起渲染面归引擎的 .wtj-fw-canvas）');
});
