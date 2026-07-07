// WTJ-20260704-014 — task-templates.js 单元测试（durable QA asset）
//
// 用 Node 内置 vm 模块搭一个沙箱 context，按 index.html 的真实加载顺序在同一 sandbox 里
// 先加载真实的 app/web/manifest.js（其 IIFE 会 window.WTJ_MANIFEST = deepFreeze(...)），
// 再加载真实的 app/web/task-templates.js（读取 window.WTJ_MANIFEST，订阅 window.WTJ_TASK /
// window.WTJ_KEYBOARD，调用 window.WTJ_POINTER / window.WTJ_HUD / window.WTJ_AUDIO，挂
// window.WTJ_TASK_TEMPLATES）——与 pointer-engine.test.mjs / task-lifecycle.test.mjs 同一
// 手法：断言直接取自真实 manifest 数值（tasks.templates.*.examples / rewards.statusLights.
// count=3），消除"手工镜像 manifest 数值"的漂移风险。
//
// window.WTJ_TASK / WTJ_POINTER / WTJ_KEYBOARD / WTJ_HUD / WTJ_AUDIO 全部是本文件手写的
// 可记录调用的 stub（014 消费它们暴露的 API，不需要加载 013/012/011 的真实源码——那些各自
// 已有独立的 durable 测试覆盖自己的判定逻辑，例如"拖错地方"的 dropTargetIds 白名单过滤已经在
// pointer-engine.test.mjs 里覆盖，014 的 onDrop 回调按文件头注释明确"不需要再自己比对 id"，
// 本文件对"拖拽完成判定"的断言因此聚焦在"onDrop 回调触发 -> completeTask"这条 014 自己的
// 判定路径，不重新验证 012 的落点判定）。同时手写一个最小的 document/DOM stub（createElement /
// appendChild / removeChild / remove / classList.add / setAttribute/getAttribute），因为
// task-templates.js 明确"DOM 缺失时优雅降级，DOM 存在时会创建叠层元素"（不同于 013 结构性
// 禁止触碰 document）。
//
// 假时钟（P1-3 对抗评审修复引入）：task-templates.js 的 scheduleElementsRemoval() 用
// clockRef.setTimeout/clearTimeout 实现"完成态 DOM 延迟 ~800ms 移除"，clockRef 默认包一层真实
// setTimeout/clearTimeout。但本文件用 vm.createContext({...}) 搭的沙箱 global 对象只有
// window/document/console 三个属性，并不提供 setTimeout/clearTimeout 这两个宿主 API（它们不是
// ECMAScript 标准内建，V8 不会替一个新 context 自动补上）——若不预先用 _setClock 换成假时钟，
// 沙箱内调用裸的 setTimeout(...) 会直接 ReferenceError。因此与 task-lifecycle.test.mjs 的
// createTaskEnv() 同一手法：createSandbox() 里在加载完 task-templates.js 之后立刻调用一次
// env.TT._setClock(...)，把默认时钟换成本文件的 makeFakeClock()，虚拟时间由测试用
// env.clock.advance(ms) 手动推进，不依赖真实等待，也避免上述 ReferenceError。
//
// 可注入 RNG（WTJ-20260706-002：问号任务的 type/example 选择从确定性递增计数器轮转改为洗牌袋
// shuffle bag 真随机调度，见 task-templates.js 文件头「任务生成」一节）：task-templates.js 的
// drawTaskType()/drawExampleIndex() 消费一个可整体替换的 taskRandom（默认 Math.random()，
// 供单测通过 WTJ_TASK_TEMPLATES._setRandom(fn) 换成确定性 RNG，与上面 _setClock 同一套"测试
// 需要可复现，生产需要真随机"的取舍）。createSandbox() 默认注入 makeIdentityRandom()（见下方
// 实现）——一个恒定返回接近 1 的值的桩，代入 Fisher-Yates 洗牌公式后每次都不发生交换，等效于
// "不洗牌"，产出的 type/example 抽取顺序因此退化为 TASK_TYPES/examples 数组的**声明顺序**
// 依次轮转——这与 002 卡之前旧版确定性计数器轮转产出的序列逐字节一致（已用脚本验证），因此
// 绝大多数既有用例（本来就依赖"第 N 次点击产出某个具体 type/example"这一行为）不需要改动断言
// 本身，只需要更新其"为什么"注释（不再是计数器取模的产物，而是默认测试 RNG 让洗牌袋退化为
// 声明顺序轮转的产物）。真正测试洗牌袋契约本身（一整袋内每个候选恰好出现一次、跨袋边界不
// 相邻重复、同一 RNG 种子两次注入产生一致序列）的用例改用一个真正会洗牌的确定性 RNG——本文件
// 用 mulberry32()（标准公开算法的忠实移植）显式传入 createSandbox({ randomFn: ... })。
//
// 重要的跨 realm 陷阱（与 pointer-engine.test.mjs 的既有注记同一原因）：task-templates.js
// 内部构造的普通对象/数组（taskDef、completeTask 的入参、getActiveTaskInfo() 的返回值、
// onTaskComplete 的 payload、registerTarget 的 config.accepts/dropTargetIds 数组）都是在 vm
// 沙箱 realm 内创建的，其 [[Prototype]] 与本文件（主 realm）字面量不同，assert.deepEqual /
// deepStrictEqual 会因原型链不一致误判失败——因此这些地方一律逐字段 / 逐元素比较，而不是对
// 整个跨 realm 对象或数组做深比较。反之，本文件自己的 document stub 创建的 DOM 元素、以及本
// 文件 stub 函数自己内部构造的记录对象（如 hudStub.calls 里的 {index,on}），都是在函数"定义
// realm"（主 realm）里创建的（函数即便被跨 realm 代码调用，函数体执行仍然使用其定义 realm 的
// 内建对象/数组构造器），所以这些可以放心用 deepEqual。
//
// Run:  node --test tests/unit/task-templates.test.mjs
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
var TASK_TEMPLATES_JS_PATH = path.resolve(__dirname, '../../app/web/task-templates.js');
var TASK_TEMPLATES_CSS_PATH = path.resolve(__dirname, '../../app/web/task-templates.css');
var MANIFEST_SRC = readFileSync(MANIFEST_JS_PATH, 'utf8');
var TT_SRC = readFileSync(TASK_TEMPLATES_JS_PATH, 'utf8');

// --- small helpers ----------------------------------------------------------------------

// 逐元素比较（不用 deepEqual，见文件头「跨 realm 陷阱」一节）：适用于 accepts / dropTargetIds
// 这类由 sandbox 内代码构造的数组。
function assertArrayEqual(actual, expected, msg) {
  assert.equal(actual.length, expected.length, msg || '数组长度应一致');
  for (var i = 0; i < expected.length; i++) {
    assert.equal(actual[i], expected[i], (msg || '数组元素应一致') + ' [index=' + i + ']');
  }
}

// --- 可注入 RNG（WTJ-20260706-002，见文件头「可注入 RNG」一节）------------------------------

// "不洗牌"桩：代入 task-templates.js 的 fisherYatesShuffle()（j = Math.floor(taskRandom() *
// (i+1))）——对任意 i<=一百多量级的数组长度，0.9999*(i+1) 的 floor 恒等于 i（不发生交换），
// 洗牌因此退化为恒等排列。createSandbox() 默认用它注入，让洗牌袋的抽取顺序退化为 TASK_TYPES/
// examples 数组的声明顺序依次轮转——与 002 卡之前旧版确定性计数器轮转产出的序列逐字节一致
// （已用一次性验证脚本核实：drag→click→find→press→drag(dog-home)→... 与旧版 counter%4 /
// floor(counter/4)%len 公式产出完全相同），因此绝大多数既有用例不需要改断言，只需要更新其
// "为什么"注释。
function makeIdentityRandom() {
  return function () { return 0.9999; };
}

// mulberry32：公开的确定性 32 位 PRNG（种子相同 -> 序列相同），用于真正需要洗牌袋"洗牌"这个
// 行为本身发生的契约测试（见下方"11. 洗牌袋契约"一节）——不用 makeIdentityRandom() 是因为
// 恒定桩从不触发 Fisher-Yates 的交换分支，也从不触发跨袋边界的"防相邻重复"交换分支，无法
// 验证这两条真正的新增契约；mulberry32 的输出会真正打乱顺序，是这些契约测试需要的"变化的"
// 确定性随机源。
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

// --- fake clock (与 task-lifecycle.test.mjs 的 makeFakeClock() 同款实现) ------------------
// 供 createSandbox() 通过 WTJ_TASK_TEMPLATES._setClock() 注入，让 P1-3 的 ~800ms 完成态延迟
// 移除可以用 advance(ms) 手动快进虚拟时间，不需要真的等待，也绕开沙箱缺失原生 setTimeout 的问题
// （见文件头「假时钟」一节）。
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

// --- fake document / DOM stub ------------------------------------------------------------
// 最小可用 DOM：createElement / appendChild / removeChild / remove / classList.add /
// setAttribute/getAttribute / style。所有元素与容器都在本文件（主 realm）创建，见文件头
// 「跨 realm 陷阱」一节，可放心对它们做常规断言。
function makeFakeDocument() {
  var createdElements = [];

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
      classList: {
        _list: [],
        add: function (cls) {
          if (this._list.indexOf(cls) === -1) {
            this._list.push(cls);
          }
        }
      },
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
    return el;
  }

  var body = makeElement('body');
  var doc = {
    createElement: function (tag) {
      var el = makeElement(tag);
      createdElements.push(el);
      return el;
    },
    body: body
  };

  return { document: doc, body: body, createdElements: createdElements };
}

// --- WTJ_POINTER stub ---------------------------------------------------------------------
// onDragMove/onDrop（P1-2 对抗评审修复引入）：与 registerTarget 的 per-target config.onDrop
// 是两件不同的事——这两个是 WTJ_POINTER 的全局多订阅者事件（见 POINTER-API.md 第 3 节），本 stub
// 记录订阅者列表 + 提供 fireDragMove()/fireDrop() 供测试手动触发，模拟 012 真实广播这两个事件。
function makePointerStub() {
  var registerCalls = [];
  var unregisterCalls = [];
  var dragMoveHandlers = [];
  var dropHandlers = [];
  return {
    api: {
      registerTarget: function (id, config) {
        registerCalls.push({ id: id, config: config });
      },
      unregisterTarget: function (id) {
        unregisterCalls.push(id);
      },
      onDragMove: function (fn) {
        dragMoveHandlers.push(fn);
      },
      onDrop: function (fn) {
        dropHandlers.push(fn);
      }
    },
    registerCalls: registerCalls,
    unregisterCalls: unregisterCalls,
    fireDragMove: function (payload) {
      dragMoveHandlers.forEach(function (fn) { fn(payload); });
    },
    fireDrop: function (payload) {
      dropHandlers.forEach(function (fn) { fn(payload); });
    },
    hasDragMoveHandler: function () {
      return dragMoveHandlers.length > 0;
    },
    hasDropHandler: function () {
      return dropHandlers.length > 0;
    }
  };
}

// --- WTJ_KEYBOARD stub (onLetter/onSymbol/onFunctionKey 都是多订阅者，镜像 keyboard.js 的
// addSubscriber 模式) -------------------------------------------------------------------------
// WTJ-20260706-010：补齐 onSymbol/onFunctionKey 两路订阅 + emitSymbol/emitFunctionKey 两个驱动
// 方法，镜像真实 keyboard.js 的两个真实调用约定（见该文件文件头设计说明第 26~33 / 23~25 行）：
// onSymbol(fn) 是 fn(char, intensity) 两个位置参数；onFunctionKey(fn) 是 fn({key, category,
// intensity}) 单一 payload 对象，key 已经过 normalizeFunctionKeyName() 归一化（Space 统一是
// 'Space'，其余原样透传 e.key，如 'Enter'/'ArrowUp'）。
function makeKeyboardStub() {
  var letterHandlers = [];
  var symbolHandlers = [];
  var functionKeyHandlers = [];
  return {
    api: {
      onLetter: function (fn) {
        letterHandlers.push(fn);
      },
      onSymbol: function (fn) {
        symbolHandlers.push(fn);
      },
      onFunctionKey: function (fn) {
        functionKeyHandlers.push(fn);
      }
    },
    pressLetter: function (ch) {
      letterHandlers.forEach(function (fn) { fn(ch); });
    },
    emitSymbol: function (ch, intensity) {
      symbolHandlers.forEach(function (fn) { fn(ch, intensity); });
    },
    emitFunctionKey: function (payload) {
      functionKeyHandlers.forEach(function (fn) { fn(payload); });
    },
    hasHandler: function () {
      return letterHandlers.length > 0;
    },
    hasSymbolHandler: function () {
      return symbolHandlers.length > 0;
    },
    hasFunctionKeyHandler: function () {
      return functionKeyHandlers.length > 0;
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

// --- WTJ_AUDIO stub --------------------------------------------------------------------------
// wordCalls（WTJ-20260705-004 pt5 新增）：记录 playWord() 调用，供 learningWord 防御式播放
// 测试断言（见 playSuccessAudioDefensive()/playLearningWordDefensive() 消费方式）。
// bilingualCalls（WTJ-20260706-012 新增）：记录 playWordBilingual() 调用，供 renderFindTask()
// 任务开始时的双语词语播放断言（见 playFindWordBilingualDefensive() 消费方式）。EN 模式下仍走
// 这条路径（本卡未改动 EN 侧）。
// compositeCalls（WTJ-20260707-003 新增）：记录 playComposite() 调用（每次调用记录其 parts 数组
// 原样），供 ZH 模式"找到"引导语 + 词卡组合播放断言（见 playFindWordBilingualDefensive() 新增分支）。
function makeAudioStub() {
  var calls = [];
  var wordCalls = [];
  var bilingualCalls = [];
  var compositeCalls = [];
  return {
    api: {
      playSfx: function (arg) {
        calls.push(arg);
      },
      playWord: function (arg) {
        wordCalls.push(arg);
      },
      playWordBilingual: function (arg) {
        bilingualCalls.push(arg);
      },
      playComposite: function (parts) {
        compositeCalls.push(parts);
      }
    },
    calls: calls,
    wordCalls: wordCalls,
    bilingualCalls: bilingualCalls,
    compositeCalls: compositeCalls
  };
}

// --- WTJ_FRAME_ANIM stub (056) ----------------------------------------------------------------
// task-templates.js 只消费 play()/stop()/getDuration() 三个方法（见该文件
// playPropAnimDefensive()/stopPropAnimDefensive()/computeVisualHoldMs()），不需要加载
// frame-anim.js 真实源码——引擎自身的帧号/loop/reduced-motion 判定由 tests/unit/
// frame-anim.test.mjs 独立覆盖，与本文件对 WTJ_POINTER/WTJ_KEYBOARD/WTJ_HUD/WTJ_AUDIO/
// WTJ_TASK 一贯的"消费方只测自己这一层逻辑"策略一致。
// durationsByKey: { 'prop/state': durationMs }，未命中的 prop/state 组合默认返回 500
// （足够小，落在 COMPLETE_VISUAL_HOLD_MS=800 的既有下限内，不会意外触发 hold 延长分支；
// 需要验证"素材加长后 hold 会被相应拉长"的测试显式传入一个更大的值，见下方 P0 测试）。
function makeFrameAnimStub(durationsByKey) {
  var playCalls = [];
  var stopCalls = [];
  var durations = durationsByKey || {};
  return {
    api: {
      play: function (canvasEl, prop, state, opts) {
        playCalls.push({ canvasEl: canvasEl, prop: prop, state: state, opts: opts });
        return true;
      },
      stop: function (canvasEl) {
        stopCalls.push(canvasEl);
      },
      preload: function () {
        return true;
      },
      getDuration: function (prop, state) {
        var key = prop + '/' + state;
        return Object.prototype.hasOwnProperty.call(durations, key) ? durations[key] : 500;
      },
      getState: function () {
        return { availableProps: ['faucet', 'horse', 'lamp', 'treasure-chest'], deferredProps: ['door', 'bell'], idleStopSec: 5, activePlaybacks: [] };
      }
    },
    playCalls: playCalls,
    stopCalls: stopCalls,
    lastPlayForCanvas: function (canvasEl) {
      for (var i = playCalls.length - 1; i >= 0; i--) {
        if (playCalls[i].canvasEl === canvasEl) {
          return playCalls[i];
        }
      }
      return null;
    }
  };
}

// --- WTJ_VOICE_LANG stub（WTJ-20260706-012 第二阶段：ZH word-card 语言分支测试用）--------------
// 手写最小 stub（不加载真实 voice-language.js 源码——本文件对其它依赖一贯采用"消费方只测自己
// 这一层逻辑"策略，语言模块自身的 getEffectiveLanguage()/isWordZhAvailable() 契约已由
// tests/unit/voice-language.test.mjs 独立覆盖）。只暴露 task-templates.js 实际消费的两个方法。
// opts.lang：'zh' | 'en'，getEffectiveLanguage() 恒返回这个值。
// opts.zhWords：Array<string>，isWordZhAvailable(word) 对这个数组里的词返回 true，其余（含
// 拼写不在数组内的、null/undefined/非字符串）一律返回 false——与真实 voice-language.js
// isWordZhAvailable() 的防御式契约一致。
function makeVoiceLangStub(opts) {
  opts = opts || {};
  var lang = opts.lang || 'en';
  var zhWordSet = {};
  (opts.zhWords || []).forEach(function (w) { zhWordSet[w] = true; });
  var calls = { getEffectiveLanguage: 0, isWordZhAvailable: [] };
  return {
    api: {
      getEffectiveLanguage: function () {
        calls.getEffectiveLanguage += 1;
        return lang;
      },
      isWordZhAvailable: function (word) {
        calls.isWordZhAvailable.push(word);
        return typeof word === 'string' && zhWordSet[word] === true;
      }
    },
    calls: calls,
    setLang: function (newLang) { lang = newLang; } // 供"语言切换"测试在同一 sandbox 内动态改变生效语言。
  };
}

// --- WTJ_TASK stub (onQuestionClicked/onDismiss/onPhase 都是多订阅者，镜像 task.js) -----------
function makeTaskStub() {
  var questionHandlers = [];
  var dismissHandlers = [];
  var phaseHandlers = [];
  var startTaskCalls = [];
  var completeTaskCalls = [];

  return {
    api: {
      onQuestionClicked: function (fn) { questionHandlers.push(fn); },
      onDismiss: function (fn) { dismissHandlers.push(fn); },
      onPhase: function (fn) { phaseHandlers.push(fn); },
      startTask: function (taskDef) {
        startTaskCalls.push(taskDef);
        return true;
      },
      completeTask: function (result) {
        completeTaskCalls.push(result);
        return true;
      }
    },
    startTaskCalls: startTaskCalls,
    completeTaskCalls: completeTaskCalls,
    clickQuestion: function () {
      questionHandlers.forEach(function (fn) { fn(); });
    },
    dismissActive: function () {
      dismissHandlers.forEach(function (fn) { fn({ reason: 'test' }); });
    },
    firePhase: function (payload) {
      phaseHandlers.forEach(function (fn) { fn(payload); });
    },
    hasQuestionHandler: function () {
      return questionHandlers.length > 0;
    }
  };
}

// --- sandbox builder -----------------------------------------------------------------------
// opts.omitManifest: true 时不加载 manifest.js（模拟未加载/加载失败场景）。
// opts.includePointer / includeKeyboard / includeHud / includeAudio / includeTask /
// includeFrameAnim: false 时不把对应 stub 挂到 window 上（模拟该依赖完全缺失）；stub 对象
// 本身始终创建，测试代码可以安全读取其调用记录（应保持为空数组）。opts.frameAnimDurations
// 透传给 makeFrameAnimStub()，供需要精确控制 getDuration() 返回值的测试使用（见 056
// COMPLETE_VISUAL_HOLD 相关测试）。includeFrameAnim 默认 true——与 index.html 里
// frame-anim.js 排在 task-templates.js 之前的真实加载顺序一致，多数测试应该在"引擎可用"
// 这条更贴近生产的路径上运行；显式测试"引擎缺失回退静态 img"的用例会传 includeFrameAnim:false。
// opts.randomFn（WTJ-20260706-002，见文件头「可注入 RNG」一节）：不传时默认注入
// makeIdentityRandom()（洗牌退化为声明顺序轮转，与旧版计数器序列逐字节一致，绝大多数既有用例
// 因此不需要改动断言）；需要真正验证洗牌袋契约（乱序、防相邻重复、可复现）的测试显式传入
// mulberry32(seed) 之类会真正打乱顺序的确定性 RNG。
function createSandbox(opts) {
  opts = opts || {};
  var warnCalls = [];
  var errorCalls = [];

  var docStub = makeFakeDocument();
  var pointerStub = makePointerStub();
  var keyboardStub = makeKeyboardStub();
  var hudStub = makeHudStub();
  var audioStub = makeAudioStub();
  var taskStub = makeTaskStub();
  var frameAnimStub = makeFrameAnimStub(opts.frameAnimDurations);
  // opts.voiceLang：{ lang, zhWords } 时创建 WTJ_VOICE_LANG stub 并挂到 window（见
  // makeVoiceLangStub() 说明）；不传时 window.WTJ_VOICE_LANG 保持完全缺失——沿用本卡第一阶段
  // （1048c0e）"未接线语言模块 = 视为 en"的既有测试路径，绝大多数既有用例不需要改动。
  var voiceLangStub = opts.voiceLang ? makeVoiceLangStub(opts.voiceLang) : null;

  var fakeWindow = {};
  if (opts.includePointer !== false) fakeWindow.WTJ_POINTER = pointerStub.api;
  if (opts.includeKeyboard !== false) fakeWindow.WTJ_KEYBOARD = keyboardStub.api;
  if (opts.includeHud !== false) fakeWindow.WTJ_HUD = hudStub.api;
  if (opts.includeAudio !== false) fakeWindow.WTJ_AUDIO = audioStub.api;
  if (opts.includeTask !== false) fakeWindow.WTJ_TASK = taskStub.api;
  if (opts.includeFrameAnim !== false) fakeWindow.WTJ_FRAME_ANIM = frameAnimStub.api;
  if (voiceLangStub) fakeWindow.WTJ_VOICE_LANG = voiceLangStub.api;

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
  vm.runInContext(TT_SRC, sandbox, { filename: 'task-templates.js' });

  // 假时钟（见文件头「假时钟」一节）：沙箱 global 没有原生 setTimeout/clearTimeout，
  // task-templates.js 的 scheduleElementsRemoval() 又确实会调用 clockRef.setTimeout——不换成
  // 假时钟的话，任何一次 handleTemplateComplete() 都会在沙箱内 ReferenceError。与
  // task-lifecycle.test.mjs 的 createTaskEnv() 同一手法：加载完就立刻 _setClock()，测试用
  // env.clock.advance(ms) 手动推进虚拟时间快进 P1-3 的 ~800ms 完成态可见窗口。
  var clock = makeFakeClock();
  if (fakeWindow.WTJ_TASK_TEMPLATES && typeof fakeWindow.WTJ_TASK_TEMPLATES._setClock === 'function') {
    fakeWindow.WTJ_TASK_TEMPLATES._setClock({ setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, now: clock.now });
  }

  // 可注入 RNG（见文件头「可注入 RNG」一节 + 本函数 opts.randomFn 说明）：默认注入
  // makeIdentityRandom()，让洗牌袋退化为声明顺序轮转，逐字节复现 002 卡之前的确定性计数器序列。
  var randomFn = (typeof opts.randomFn === 'function') ? opts.randomFn : makeIdentityRandom();
  if (fakeWindow.WTJ_TASK_TEMPLATES && typeof fakeWindow.WTJ_TASK_TEMPLATES._setRandom === 'function') {
    fakeWindow.WTJ_TASK_TEMPLATES._setRandom(randomFn);
  }

  return {
    contextObject: sandbox,
    window: fakeWindow,
    manifest: fakeWindow.WTJ_MANIFEST,
    TT: fakeWindow.WTJ_TASK_TEMPLATES,
    docStub: docStub,
    pointerStub: pointerStub,
    keyboardStub: keyboardStub,
    hudStub: hudStub,
    audioStub: audioStub,
    taskStub: taskStub,
    frameAnimStub: frameAnimStub,
    voiceLangStub: voiceLangStub,
    clock: clock,
    warnCalls: warnCalls,
    errorCalls: errorCalls
  };
}

// 反复"点问号 + dismiss跳过"直到轮转命中目标类型。WTJ-20260706-002 起 type 由洗牌袋
// （drawTaskType()）无放回抽取产生，不再是固定的数组声明顺序轮转——但 guard=10 的上限依然
// 结构性够用且与具体 RNG 无关：TASK_TYPES.length=4 的洗牌袋保证"任意连续 7 次抽取必然覆盖全部
// 4 个类型"（标准鸽笼论证：袋子按 4 个一组切分，长度 >= 2*4-1 的窗口必然完整包含至少一组），
// 与 createSandbox() 默认注入的 RNG（makeIdentityRandom()，退化为声明顺序轮转）恰好一致只是
// 巧合，不是本函数依赖的前提。返回值是 sandbox 内构造的跨 realm 对象，调用方只应读取其
// .type/.taskId 字段，不要整体 deepEqual。
function startTaskOfType(env, targetType) {
  for (var guard = 0; guard < 10; guard++) {
    env.taskStub.clickQuestion();
    var info = env.TT.getActiveTaskInfo();
    assert.ok(info, 'startTaskOfType: 点击问号后应生成一个进行中任务');
    if (info.type === targetType) {
      return info;
    }
    env.taskStub.dismissActive();
  }
  throw new Error('startTaskOfType: 未能在合理次数内轮转到类型 ' + targetType);
}

// 072：与 startTaskOfType 同款反复"点问号 + dismiss跳过"手法，但额外要求 taskId 精确匹配——
// 用于在 click 类型现在有 lamp/faucet/horse/door/bell 五个 example 的情况下，精确驱动到某一个
// 具体 example（而不是像 startTaskOfType 那样只要类型对就返回，拿到的可能是轮转到的第一个
// lamp）。WTJ-20260706-002 起 example 由该 type 各自的洗牌袋（drawExampleIndex()）无放回抽取
// 产生：createSandbox() 默认注入的 makeIdentityRandom() 让这个抽取序列退化为 examples 数组的
// 声明顺序轮转（与 002 卡之前的确定性计数器行为逐字节一致），本文件目前用到本函数的 type 都是
// examples.length 较小的 click(5)/drag(8)，guard=30 留足充分余量（本文件不用它驱动
// examples.length=12 的 find 类型；若未来需要，应相应放宽 guard 或改用契约断言而非"跑到具体
// id"这种做法，见下方"11. 洗牌袋契约"一节）。
function startTaskWithId(env, targetType, targetTaskId) {
  for (var guard = 0; guard < 30; guard++) {
    env.taskStub.clickQuestion();
    var info = env.TT.getActiveTaskInfo();
    assert.ok(info, 'startTaskWithId: 点击问号后应生成一个进行中任务');
    if (info.type === targetType && info.taskId === targetTaskId) {
      return info;
    }
    env.taskStub.dismissActive();
  }
  throw new Error('startTaskWithId: 未能在合理次数内轮转到 ' + targetType + '/' + targetTaskId);
}

// task-templates.js 用一个懒创建的单一 overlay root（class="wtj-tt-root"）挂在 document.body
// 下（见源码 ensureOverlayRoot()），所有任务道具元素都是 appendChild 到这个 root 上，而不是
// 直接挂在 body 下——body 自身永远只有这一个子节点（root 一旦创建就不会被移除）。因此"渲染了
// 几个道具元素 / 完成后叠层是否清空"要看 root.children，而不是 body.children。
function getOverlayRoot(env) {
  return env.docStub.body.children[0] || null;
}

function findRegisterCallById(env, id) {
  var calls = env.pointerStub.registerCalls;
  for (var i = calls.length - 1; i >= 0; i--) {
    if (calls[i].id === id) {
      return calls[i];
    }
  }
  return null;
}

function findExampleById(manifest, type, id) {
  var examples = manifest.tasks.templates[type].examples;
  for (var i = 0; i < examples.length; i++) {
    if (examples[i].id === id) {
      return examples[i];
    }
  }
  return null;
}

// 按当前 activeRuntime 的类型，驱动该类型"正确"的完成路径（供多类型轮转测试复用）。
function completeCurrentTask(env) {
  var info = env.TT.getActiveTaskInfo();
  assert.ok(info, 'completeCurrentTask: 需要有进行中任务');
  if (info.type === 'drag') {
    var dragTarget = findRegisterCallById(env, 'wtj-tt-drag-target-' + info.taskId);
    dragTarget.config.onDrop();
  } else if (info.type === 'click') {
    var clickTarget = findRegisterCallById(env, 'wtj-tt-click-target-' + info.taskId);
    clickTarget.config.onClick();
  } else if (info.type === 'find') {
    var findTarget = findRegisterCallById(env, 'wtj-tt-find-target-' + info.taskId);
    findTarget.config.onHover();
  } else if (info.type === 'press') {
    var example = findExampleById(env.manifest, 'press', info.taskId);
    env.keyboardStub.pressLetter(example.targetKey.toUpperCase());
  } else {
    throw new Error('completeCurrentTask: 未知任务类型 ' + info.type);
  }
}

// =============================================================================================
// 1. API 表面 / 冻结 / 重复引入守卫
// =============================================================================================

test('API 冻结：window.WTJ_TASK_TEMPLATES 是 frozen 对象，方法齐全，绑定不可写', function () {
  var env = createSandbox();
  assert.equal(Object.isFrozen(env.TT), true);
  ['getActiveTaskInfo', 'onTaskComplete', '_setClock', '_setRandom'].forEach(function (name) {
    assert.equal(typeof env.TT[name], 'function', 'API 缺少方法: ' + name);
  });

  var before = env.TT.getActiveTaskInfo;
  try { env.TT.getActiveTaskInfo = null; } catch (e) { /* 严格模式抛错也算通过 */ }
  assert.equal(env.TT.getActiveTaskInfo, before, 'frozen API 应拒绝方法重赋值');

  var desc = Object.getOwnPropertyDescriptor(env.window, 'WTJ_TASK_TEMPLATES');
  assert.equal(desc.writable, false, 'window.WTJ_TASK_TEMPLATES 绑定应不可写');
  assert.equal(desc.configurable, false, 'window.WTJ_TASK_TEMPLATES 绑定应不可重配置');
});

test('重复引入守卫：再次执行 task-templates.js 源码是安全 no-op，window.WTJ_TASK_TEMPLATES 仍是实例 1，问号点击不会重复触发 startTask', function () {
  var env = createSandbox();
  var instance1 = env.window.WTJ_TASK_TEMPLATES;

  vm.runInContext(TT_SRC, env.contextObject, { filename: 'task-templates.js (dup)' });

  assert.equal(env.window.WTJ_TASK_TEMPLATES, instance1, 'window.WTJ_TASK_TEMPLATES 重复引入后应仍是第一个实例');

  env.taskStub.clickQuestion();
  assert.equal(env.taskStub.startTaskCalls.length, 1, '重复引入后一次问号点击只应触发一次 startTask（未被第二个实例劫持/叠加订阅）');
  assert.equal(env.TT.getActiveTaskInfo().type, 'drag', '实例 1 的状态机应仍正常工作');
});

// =============================================================================================
// 2. 问号点击接线（REQ-TASK-01/02 入口）：生成任务 + startTask + 渲染 + registerTarget
// =============================================================================================

test('问号点击接线：onQuestionClicked 触发 -> 生成 taskDef 并调用 WTJ_TASK.startTask，渲染目标 DOM 并注册 pointer target（createSandbox() 默认注入的确定性 RNG 下首次点击恒为 drag 类型）', function () {
  var env = createSandbox();
  assert.equal(env.taskStub.hasQuestionHandler(), true, 'task-templates.js 应订阅 WTJ_TASK.onQuestionClicked');
  assert.equal(env.TT.getActiveTaskInfo(), null, '点击前不应有进行中任务');

  env.taskStub.clickQuestion();

  assert.equal(env.taskStub.startTaskCalls.length, 1, '应调用且仅调用一次 WTJ_TASK.startTask');
  var taskDef = env.taskStub.startTaskCalls[0];
  assert.equal(taskDef.type, 'drag');
  assert.equal(taskDef.id, 'drag-apple-to-basket', '真实 manifest 首个 drag 示例');
  assert.equal(typeof taskDef.voicePrompt, 'string');

  var info = env.TT.getActiveTaskInfo();
  assert.equal(info.type, 'drag');
  assert.equal(info.taskId, 'drag-apple-to-basket');
  assert.deepEqual(Object.keys(info).sort(), ['taskId', 'type']);

  assert.equal(env.pointerStub.registerCalls.length, 2, '拖拽任务应注册物体 + 目标两个 pointer target（装饰性 distractorSprites 不注册，见下方断言）');
  assert.equal(env.docStub.body.children.length, 1, '叠层容器（wtj-tt-root）应懒创建并挂到 document.body 下');
  // WTJ-20260705-004 Phase A（pt1）：真实 manifest drag-apple-to-basket 示例现在带 2 个装饰性
  // distractorSprites（banana/orange），DOM 叠层因此是 物体+目标+2 干扰 = 4 个元素，但只有
  // 物体+目标两个注册为 pointer target（见上一条断言），干扰项纯视觉不参与判定。
  assert.equal(getOverlayRoot(env).children.length, 4, '拖拽任务应渲染物体 + 目标 + 2 个装饰性干扰项共 4 个 DOM 叠层元素（挂在 overlay root 下）');
});

// =============================================================================================
// 2b. 任务生成轮转（P1-1 对抗评审修复）：type 内 example 轮转不应该死锁
// =============================================================================================

test('P1-1：type 内 example 轮转不死锁——drag 的 apple-basket/dog-home、press 的 letter-a/digit-3 都应该轮到过（旧版修复前 TASK_TYPES.length=4 与 examples.length=2 同奇偶，会让 drag 恒选 examples[0]、press 恒选 examples[1]，dog-home/press-letter-a 永不可达；WTJ-20260706-002 起改用洗牌袋无放回抽取，本用例在 createSandbox() 默认注入的确定性 RNG 下继续验证这条历史回归线，真正的"任意 RNG 下都不会漏"契约验证见下方"11. 洗牌袋契约"一节）', function () {
  var env = createSandbox();
  var seenByType = { drag: {}, click: {}, find: {}, press: {} };

  // createSandbox() 默认注入 makeIdentityRandom()，让 WTJ-20260706-002 的洗牌袋退化为
  // examples 数组的声明顺序轮转，与 002 卡之前的确定性计数器序列逐字节一致：TASK_TYPES.length=4，
  // drag/press 的 examples.length=2：一个完整周期是 4*2=8 次点击就足够让每个类型的每个
  // example 下标都轮到至少一次。跑 2 个周期（16 次）留出余量。
  for (var i = 0; i < 16; i++) {
    env.taskStub.clickQuestion();
    var info = env.TT.getActiveTaskInfo();
    assert.ok(info, '每次点击问号都应该生成一个进行中任务');
    seenByType[info.type][info.taskId] = true;
    env.taskStub.dismissActive();
  }

  // WTJ-20260705-025：drag 目前有 8 条 example（此前 2 条，见 manifest.js tasks.templates.
  // drag.examples 行内注释——Ethan 反馈"drag-to-basket 太重复"后的扩容），16 次点击只够覆盖
  // examples 下标 0~3（同下方 press 的同一限制说明），不足以覆盖全部 8 个——这不是死锁回归，
  // 只是本用例固定 16 次的覆盖范围有限；下方独立的"全覆盖"用例用动态迭代次数验证全部 examples
  // 下标都可达。这里改成 indexOf 断言（与下方 press 同款），只钉住"最早两条历史上必须可达"这条
  // 最小回归线，不再对"这 16 次内恰好轮到哪几条"做穷举式 deepEqual（那样会随 examples.length
  // 变化而脆弱地跟着变，且不是本用例真正要保护的不变量）。
  var seenDragIds = Object.keys(seenByType.drag).sort();
  assert.ok(seenDragIds.indexOf('drag-apple-to-basket') !== -1, '拖拽类型应该轮到过 apple-to-basket（examples[0]）');
  assert.ok(seenDragIds.indexOf('drag-dog-home') !== -1, '拖拽类型应该轮到过 dog-home（examples[1]，验收标准"狗回家"必须可达）');
  // press 目前有 7 条 example（WTJ-20260705-004 pt3 追加 5 条，见 manifest.js），16 次点击只够
  // 覆盖 examples 下标 0~3（默认注入的确定性 RNG 下 press 的洗牌袋在 16 次内最多推进到下标 3），
  // 不足以覆盖全部 7 个——这不是死锁回归，只是本用例固定 16 次的覆盖范围有限；下方独立的"全覆盖"
  // 用例用动态迭代次数
  // 验证全部 examples 下标（含 press 的 7 个、find 的 12 个）都可达，本用例保留对"最早两个仍
  // 在合理次数内可达"的最小历史断言。
  var seenPressIds = Object.keys(seenByType.press).sort();
  assert.ok(seenPressIds.indexOf('press-letter-a') !== -1, '按键类型应该轮到过 letter-a（examples[0]）');
  assert.ok(seenPressIds.indexOf('press-digit-3') !== -1, '按键类型应该轮到过 digit-3（examples[1]）');
});

// =============================================================================================
// 2c.（WTJ-20260705-004 Phase A）P1-1 扩展：三类固定-example 任务型（drag/click/press）
// example 轮转在真实 manifest 下全覆盖，不因 examples.length 变化死锁——drag=8/click=5/
// press=7。用真实 manifest 的 examples.length（而不是硬编码的具体 id 列表）动态推导需要多少
// 次点击 + 动态推导期望覆盖到的完整 id 集合，这样以后任何一个类型的 examples 数组再次改变
// 长度，本用例都会自动跟着调整覆盖轮次，不需要每次手改断言数值——这正是"扩展 P1-1 覆盖所有
// examples.length 变化类型"的落地方式。
//
// find 类型自 WTJ-20260706-012 起改走随机 word-card 抽取（drawWordCardFind()，消费 manifest
// tasks.templates.find.randomPool 配置），不再从这 12 条固定 example 里轮转——12 条固定
// example 本身没有删除（继续作为 randomPool 缺失/禁用时的回退路径），只是真实 manifest 默认
// 启用 randomPool 后，本用例这种"覆盖固定 examples 全部 id"的断言方式对 find 类型不再适用。
// find 类型专属的"覆盖 secretWords.pool 全部词"契约见下方「12. WTJ-20260706-012」一节，本
// 用例仅对 find 类型做最小回归线检查（synthetic id 形状 + word 命中 pool），不做 examples-id
// 全覆盖断言。
// =============================================================================================

test('P1-1（扩展）：三类固定-example 任务型（drag/click/press）example 轮转在真实 manifest 下全覆盖，不因 examples.length 变化死锁；find 类型改走 WTJ-20260706-012 随机 word-card 抽取，仅做形状回归检查（全覆盖契约见「12.」一节）', function () {
  var env = createSandbox();
  var TASK_TYPES_LEN = 4; // 镜像 task-templates.js 源码 `TASK_TYPES = ['drag','click','find','press']`。
  var types = ['drag', 'click', 'press']; // find 改走随机 word-card 抽取，见上方说明，不纳入本断言。
  var seenByType = { drag: {}, click: {}, press: {} };
  var seenFindIds = {};
  var expectedIdsByType = {};
  var maxExamplesLen = 0;

  types.forEach(function (t) {
    var examples = env.manifest.tasks.templates[t].examples; // 跨 realm 数组（真实 manifest.js 在沙箱内加载）。
    // 跨 realm 陷阱（见文件头说明）：不对 examples 本身调用 .map()/.sort()——那样产出的仍是
    // 沙箱 realm 的数组，与下方 Object.keys()（主 realm 数组）deepEqual 会因 [[Prototype]]
    // 不一致误判失败。这里手工用主 realm 的 [] / push 逐个搬运 id（字符串是原始值，不受
    // realm 影响），产出一个主 realm 数组。
    var ids = [];
    var i;
    for (i = 0; i < examples.length; i++) {
      ids.push(examples[i].id);
    }
    ids.sort();
    expectedIdsByType[t] = ids;
    if (examples.length > maxExamplesLen) {
      maxExamplesLen = examples.length;
    }
  });

  // createSandbox() 默认注入 makeIdentityRandom()，让 example 洗牌袋的抽取序列退化为声明顺序
  // 轮转，等效于 example 下标 = Math.floor(questionClickCounter / TASK_TYPES_LEN) %
  // examples.length（002 卡之前的确定性计数器公式，退化情形下逐字节一致）；要让最长的那个
  // examples 数组（当前是 drag 的 8 条）的每个下标都至少轮到一次，需要点击次数至少推进到
  // TASK_TYPES_LEN*(maxExamplesLen-1)+3。乘 2 留双倍余量，覆盖所有类型（不止最长的那个）。
  var iterations = TASK_TYPES_LEN * maxExamplesLen * 2;

  for (var i = 0; i < iterations; i++) {
    env.taskStub.clickQuestion();
    var info = env.TT.getActiveTaskInfo();
    assert.ok(info, '每次点击问号都应该生成一个进行中任务');
    if (info.type === 'find') {
      seenFindIds[info.taskId] = true;
    } else {
      seenByType[info.type][info.taskId] = true;
    }
    env.taskStub.dismissActive();
  }

  types.forEach(function (t) {
    assert.deepEqual(
      Object.keys(seenByType[t]).sort(),
      expectedIdsByType[t],
      '类型 "' + t + '" 应该轮到过真实 manifest examples 里的每一个 id（examples.length=' + expectedIdsByType[t].length + '），不应因 examples.length 与 TASK_TYPES.length 的奇偶关系死锁'
    );
  });

  // find 类型最小回归线：synthetic id 应符合 'find-card-<pool word>' 形状，且 word 必须能在
  // secretWords.pool 命中——确认问号点击轮到 find 时不会跑飞/产出非法 id（全覆盖契约见下方
  // 「12. WTJ-20260706-012」一节的专属测试）。
  var poolWords = {};
  var pool = env.manifest.secretWords.pool;
  var pw;
  for (pw = 0; pw < pool.length; pw++) {
    poolWords[pool[pw].word] = true;
  }
  var findIds = Object.keys(seenFindIds);
  assert.ok(findIds.length > 0, 'find 类型在 iterations 次点击内应该被轮到过至少一次');
  findIds.forEach(function (id) {
    var m = /^find-card-([a-z]+)$/.exec(id);
    assert.ok(m, 'find 类型 synthetic id 应符合 find-card-<word> 形状，实际："' + id + '"');
    assert.ok(poolWords[m[1]], 'find synthetic id 里的 word "' + m[1] + '" 应该能在 secretWords.pool 命中');
  });
});

// =============================================================================================
// 3. 拖拽任务（REQ-TASK-07）
// =============================================================================================

test('拖拽任务：目标 onDrop 命中正确落点触发 completeTask；未触发前不完成；完成瞬间 pointer target 立即 unregister 但 DOM 延迟约 800ms 才移除（P1-3）；迟到的重复 onDrop 不二次完成', function () {
  var env = createSandbox();
  env.taskStub.clickQuestion();
  var info = env.TT.getActiveTaskInfo();
  assert.equal(info.type, 'drag');

  var objId = 'wtj-tt-drag-object-' + info.taskId;
  var targetId = 'wtj-tt-drag-target-' + info.taskId;
  var objCall = findRegisterCallById(env, objId);
  var targetCall = findRegisterCallById(env, targetId);
  assert.ok(objCall, '应注册可拖拽物体 target');
  assert.ok(targetCall, '应注册放置目标 target');

  assert.equal(objCall.config.draggable, true, '物体应注册为 draggable');
  assertArrayEqual(objCall.config.dropTargetIds, [targetId], '物体的 dropTargetIds 应指向放置目标');
  assertArrayEqual(targetCall.config.accepts, ['drag'], '放置目标应 accepts:["drag"]');
  assert.equal(typeof targetCall.config.onDrop, 'function');

  // WTJ-080 结构守卫：createPropEl() 造出的拖拽物体/放置目标元素都必须禁用原生 HTML5 拖拽
  // （<img> 默认 draggable=true 会让浏览器/WKWebView 启动原生 drag-and-drop，抢占 pointer.js
  // 的 mousedown/mousemove/mouseup 状态机，导致拖拽物体原地不动、ghost 跟手、松手不生效——
  // 见 WTJ-080 根因诊断）。这条断言钉住修复结构，日后若有人误删 draggable=false 会立刻变红。
  assert.equal(objCall.config.el.getAttribute('draggable'), 'false', 'WTJ-080：拖拽物体元素应设置 draggable="false"，防止原生拖拽抢占 pointer.js 状态机');
  assert.equal(targetCall.config.el.getAttribute('draggable'), 'false', 'WTJ-080：放置目标元素同样应设置 draggable="false"');

  assert.equal(env.taskStub.completeTaskCalls.length, 0, '未触发 onDrop 前不应完成');

  targetCall.config.onDrop();

  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].type, 'drag');
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, info.taskId);

  // P1-3：pointer target 立即 unregister（防止迟到事件重复判定完成）……
  assert.ok(env.pointerStub.unregisterCalls.indexOf(objId) !== -1, '完成后应立即 unregister 物体 target');
  assert.ok(env.pointerStub.unregisterCalls.indexOf(targetId) !== -1, '完成后应立即 unregister 放置目标 target');
  assert.equal(env.TT.getActiveTaskInfo(), null, '完成后不应再有进行中任务');
  // ……但 DOM 叠层完成瞬间还在（active 态视觉需要一个真实可见的窗口，不能同一 tick 内就被摘除）。
  // 真实 manifest drag-apple-to-basket 现带 2 个装饰性 distractorSprites（见 pt1），叠层是
  // 物体+目标+2 干扰 = 4 个元素。
  assert.equal(getOverlayRoot(env).children.length, 4, '完成瞬间叠层 DOM 应仍然存在（延迟移除，尚未到期）');

  // 迟到的重复 onDrop（例如残留的异步回调）不应二次触发 completeTask（activeRuntime 已清空的 guard）。
  targetCall.config.onDrop();
  assert.equal(env.taskStub.completeTaskCalls.length, 1, '重复 onDrop 不应二次触发 completeTask');

  // 快进假时钟约 800ms：延迟移除的定时器到期，DOM 叠层才真正被摘除。
  env.clock.advance(800);
  assert.equal(getOverlayRoot(env).children.length, 0, '快进 ~800ms 后叠层 DOM 才应被移除');
});

// =============================================================================================
// 3a.（WTJ-20260705-004 Phase A pt1）拖拽任务的装饰性 distractorSprites：仿 renderFindTask()
// 的干扰项循环，纯视觉、不注册 pointer target。
// =============================================================================================

test('拖拽任务（pt1）：distractorSprites 渲染为纯装饰元素——不注册 pointer target，不参与 draggable/dropTargetIds，emphasize 阶段不强调它们', function () {
  var env = createSandbox();
  var info = startTaskOfType(env, 'drag'); // 默认注入的确定性 RNG 下首次点击即为 drag，落到 examples[0]=apple-to-basket。
  assert.equal(info.taskId, 'drag-apple-to-basket');

  var objId = 'wtj-tt-drag-object-' + info.taskId;
  var targetId = 'wtj-tt-drag-target-' + info.taskId;
  var objCall = findRegisterCallById(env, objId);
  var targetCall = findRegisterCallById(env, targetId);

  // 真实 manifest drag-apple-to-basket 现带 2 个装饰性 distractorSprites（banana/orange，见 pt1）。
  var root = getOverlayRoot(env);
  assert.equal(root.children.length, 4, '应渲染 物体+目标+2 个装饰性干扰项共 4 个 DOM 叠层元素');

  var decorEls = [];
  for (var i = 0; i < root.children.length; i++) {
    var el = root.children[i];
    if (el !== objCall.config.el && el !== targetCall.config.el) {
      decorEls.push(el);
    }
  }
  assert.equal(decorEls.length, 2, '应该有恰好 2 个装饰性干扰元素（非物体、非目标）');

  // 干扰项不应该注册为 pointer target——只有物体 + 目标两个 registerTarget 调用。
  assert.equal(env.pointerStub.registerCalls.length, 2, '装饰性干扰项不应注册为 pointer target');
  var hasDistractorRegistration = env.pointerStub.registerCalls.some(function (c) {
    return c.id.indexOf('distractor') !== -1;
  });
  assert.equal(hasDistractorRegistration, false, '不应该有任何 id 含 "distractor" 的 pointer target 注册');

  // emphasize 阶段只强调物体 + 目标，不强调装饰性干扰项（与 find 任务 P2-4 同一设计意图）。
  env.taskStub.firePhase({ phase: 'emphasize' });
  assert.ok(objCall.config.el.classList._list.indexOf('wtj-tt-emphasize') !== -1, 'emphasize 阶段应该强调可拖拽物体');
  assert.ok(targetCall.config.el.classList._list.indexOf('wtj-tt-emphasize') !== -1, 'emphasize 阶段应该强调放置目标');
  decorEls.forEach(function (el) {
    assert.equal(el.classList._list.indexOf('wtj-tt-emphasize'), -1, 'emphasize 阶段不应该强调装饰性干扰项');
  });

  // 完成判定不受装饰性干扰项影响：onDrop 命中正常触发 completeTask。
  targetCall.config.onDrop();
  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, 'drag-apple-to-basket');
});

// =============================================================================================
// 3b. 拖拽跟随视觉（P1-2 对抗评审修复）：订阅 WTJ_POINTER.onDragMove/onDrop 渲染拖拽视觉
// =============================================================================================

test('P1-2：订阅 WTJ_POINTER.onDragMove/onDrop；拖拽中 followX/followY 更新被拖元素 style.left/top；dropCancel 把元素复位到初始位置', function () {
  var env = createSandbox();
  assert.equal(env.pointerStub.hasDragMoveHandler(), true, 'task-templates.js 应订阅 WTJ_POINTER.onDragMove（POINTER-API.md「9. 各消费卡怎么用」表格明确分派给 014）');
  assert.equal(env.pointerStub.hasDropHandler(), true, 'task-templates.js 应订阅 WTJ_POINTER.onDrop（用于渲染 dropCancel 拖错弹回视觉）');

  env.taskStub.clickQuestion(); // 默认注入的确定性 RNG 下首次点击 -> drag
  var info = env.TT.getActiveTaskInfo();
  assert.equal(info.type, 'drag');

  var objId = 'wtj-tt-drag-object-' + info.taskId;
  var objCall = findRegisterCallById(env, objId);
  var el = objCall.config.el;

  var initialLeft = el.style.left;
  var initialTop = el.style.top;
  assert.ok(initialLeft, '拖拽物体渲染时应该有初始 left（POSITION_PRESETS 预设位置）');

  // 不是当前可拖物 id 的 onDragMove 不应该影响位置（防御式忽略无关/迟到事件）。
  env.pointerStub.fireDragMove({ id: 'some-other-id', x: 0, y: 0, followX: 999, followY: 999 });
  assert.equal(el.style.left, initialLeft, '不匹配的 id 不应该更新位置');

  // 拖拽中：followX/followY 应该写回 style.left/top（fake DOM 元素没有 getBoundingClientRect，
  // 换算里的 halfW/halfH 按 handleDragMove() 的防御式判断退化为 0）。
  env.pointerStub.fireDragMove({ id: objId, x: 120, y: 80, followX: 40, followY: 60 });
  assert.equal(el.style.left, '40px', 'onDragMove 应该把 followX 写回 style.left');
  assert.equal(el.style.top, '60px', 'onDragMove 应该把 followY 写回 style.top');

  // 拖错（dropCancel）：应该复位到渲染时的初始 preset 位置，而不是停在半路悬空。
  env.pointerStub.fireDrop({ success: false, type: 'dropCancel', draggedId: objId, targetId: null, x: 120, y: 80 });
  assert.equal(el.style.left, initialLeft, 'dropCancel 应该把物体复位到初始 left');
  assert.equal(el.style.top, initialTop, 'dropCancel 应该把物体复位到初始 top');

  // 成功的 'drop'（非 dropCancel）不应该触发复位逻辑，也不应该抛错（本文件对该分支防御式 no-op）。
  assert.doesNotThrow(function () {
    env.pointerStub.fireDrop({ success: true, type: 'drop', draggedId: objId, targetId: 'wtj-tt-drag-target-' + info.taskId, x: 40, y: 60 });
  });
});

// =============================================================================================
// 4. 点击任务（REQ-TASK-08）
// =============================================================================================

test('点击任务（056）：onClick 触发 completeTask，用 WTJ_FRAME_ANIM 播放 idle/active 两态（真实 manifest click.examples[0]=lamp 直接引用 lamp.png，映射到 prop "lamp"；072 起 click.examples 还有 faucet/horse 两条，见下方「11. 072 faucet/horse 点击任务」一节，此处 startTaskOfType 拿到的是轮转到 click 类型时的第一个 example=lamp）；active 态在完成后仍可见约 800ms 才被移除（P1-3），移除时调用过 WTJ_FRAME_ANIM.stop()', function () {
  var env = createSandbox();
  var info = startTaskOfType(env, 'click');
  var targetId = 'wtj-tt-click-target-' + info.taskId;
  var targetCall = findRegisterCallById(env, targetId);
  assertArrayEqual(targetCall.config.accepts, ['click']);

  var el = targetCall.config.el;
  assert.equal(String(el.tagName).toLowerCase(), 'canvas', '灯具是已接入引擎的三个道具之一（faucet/horse/lamp），应挂载 <canvas> 而不是 <img>');
  assert.equal(el.getAttribute('data-anim-state'), 'idle', '灯具道具初始应为 idle（预留动画状态接口，见文件头一节）');

  var idlePlay = env.frameAnimStub.lastPlayForCanvas(el);
  assert.ok(idlePlay, '创建时应该调用过一次 WTJ_FRAME_ANIM.play() 播放 idle 态');
  assert.equal(idlePlay.prop, 'lamp', '灯具应映射到 prop "lamp"（PROP_ANIM_STATE_MAP）');
  assert.equal(idlePlay.state, 'off', 'lamp 的 idle 态应映射到 anim-manifest 的 "off" state');
  assert.equal(idlePlay.opts.loop, true, 'idle 态应强制 loop:true');

  assert.equal(env.taskStub.completeTaskCalls.length, 0);

  targetCall.config.onClick();

  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].type, 'click');
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, info.taskId);

  assert.equal(el.getAttribute('data-anim-state'), 'active', '点击命中后应把 data-anim-state 切到 active');
  var activePlay = env.frameAnimStub.lastPlayForCanvas(el);
  assert.equal(activePlay.prop, 'lamp');
  assert.equal(activePlay.state, 'turning-on', 'lamp 的 active 态应映射到 anim-manifest 的 "turning-on" state');
  assert.equal(activePlay.opts.loop, false, 'active 态应强制 loop:false（即使某个 prop 的源数据 loop 为 true 也不例外，如 horse 的 run）');
  assert.equal(typeof activePlay.opts.onComplete, 'function', 'active 态调用应传 onComplete（当前是预留 no-op，见文件头「五、动效引擎接入」一节）');

  // P1-3：pointer target 立即 unregister，但 DOM 完成瞬间仍在——active 态（灯亮动效）需要
  // 一个真实可见的窗口，不能和判定完成发生在同一个事件循环 tick 内（否则浏览器没机会 paint）。
  assert.ok(env.pointerStub.unregisterCalls.indexOf(targetId) !== -1, '完成后应立即 unregister');
  assert.equal(getOverlayRoot(env).children.length, 1, '完成瞬间叠层 DOM 应仍然存在（延迟移除，尚未到期）');
  assert.equal(el.getAttribute('data-anim-state'), 'active', '延迟移除窗口内 active 态应仍然可读（元素还没被摘除）');

  // 056：本测试用默认 frameAnimStub（未覆盖 getDuration 返回值，lamp/turning-on 走默认
  // 500ms），500+150（缓冲）=650 < 800，hold 应沿用既有 COMPLETE_VISUAL_HOLD_MS=800 下限，
  // 精确到毫秒验证（799ms 时仍未移除，800ms 时恰好移除）。
  env.clock.advance(799);
  assert.equal(getOverlayRoot(env).children.length, 1, '799ms 时叠层应仍未被移除（hold 仍是 800ms 下限）');
  env.clock.advance(1);
  assert.equal(getOverlayRoot(env).children.length, 0, '恰好 800ms 后叠层应被移除');
  assert.ok(env.frameAnimStub.stopCalls.indexOf(el) !== -1, '移除叠层元素时应该调用过 WTJ_FRAME_ANIM.stop()（见 removeElementDefensive() 的 stopPropAnimDefensive()）');
});

test('点击任务（056）：COMPLETE_VISUAL_HOLD 按 getDuration() 校正——activeState 实际时长 + 缓冲超过 800ms 下限时，hold 窗口应相应拉长，不会把动画腰斩', function () {
  // horse.run 的真实时长是 8 帧 @12fps ≈ 667ms（见 anim-manifest.js；072 返工后 PROP_ANIM_STATE_MAP
  // 的 horse.active 已从 stop_success 改回 run，二者巧合地同为 ≈667ms，本测试的数值论证不受影响），
  // 本测试直接控制 stub 的 getDuration 返回值为 700，700+150（缓冲）=850 > 800，验证 hold 确实被
  // 拉长到 850ms 而不是停留在 800ms 地板——这正是卡片原文要求修正的"现在 800ms 恰好 >= 唯一一种
  // 完成态视觉时长是巧合非契约"的具体验证。用自定义 manifest 让 click 任务的 targetSprite 指向
  // 'sprites/horse.png'（真实 manifest 自 072 起 click.examples 有 lamp/faucet/horse 三条，
  // 若走真实 manifest 需要轮转多圈才能精确落到 horse 这个 example；这里为了精确控制
  // getDuration 数值单独构造一份只含单条 horse example 的最小 manifest 覆盖，不依赖轮转次数，
  // 也不改变其余任务类型的示例数据）。
  var customManifestSrc =
    'window.WTJ_MANIFEST = {' +
    '  tasks: { templates: {' +
    '    drag: { examples: [{ id: "drag-x", objectSprite: "sprites/apple.png", targetSprite: "sprites/basket.png", voicePrompt: "", successAudio: "" }] },' +
    '    click: { examples: [{ id: "click-horse-test", targetSprite: "sprites/horse.png", targetSpriteActive: null, voicePrompt: "", successAudio: "" }] },' +
    '    find: { examples: [{ id: "find-x", targetSprite: "sprites/dog.png", distractorSprites: [], voicePrompt: "", successAudio: "" }] },' +
    '    press: { examples: [{ id: "press-x", targetKey: "A", voicePrompt: "", successAudio: "" }] }' +
    '  } },' +
    '  rewards: { statusLights: { count: 3 } }' +
    '};';

  var env = createSandbox({ manifestOverrideSrc: customManifestSrc, frameAnimDurations: { 'horse/run': 700 } });
  var info = startTaskOfType(env, 'click');
  var targetId = 'wtj-tt-click-target-' + info.taskId;
  var targetCall = findRegisterCallById(env, targetId);
  var el = targetCall.config.el;
  assert.equal(String(el.tagName).toLowerCase(), 'canvas', '马是已接入引擎的道具之一，应挂载 <canvas>');

  targetCall.config.onClick();
  var activePlay = env.frameAnimStub.lastPlayForCanvas(el);
  assert.equal(activePlay.prop, 'horse');
  assert.equal(activePlay.state, 'run', 'horse 的 active 态应映射到 "run"（072 返工后不再是 stop_success）');

  env.clock.advance(849);
  assert.equal(getOverlayRoot(env).children.length, 1, '849ms 时叠层应仍未被移除（hold 已被拉长到 850ms，不是原来的 800ms 地板）');
  env.clock.advance(1);
  assert.equal(getOverlayRoot(env).children.length, 0, '恰好 850ms（700 时长 + 150 缓冲）后叠层应被移除');
});

test('点击任务（056 防御式回退）：WTJ_FRAME_ANIM 整体缺失时，灯具道具回退静态 <img> + targetSpriteActive 切图（与 014 首次交付行为一致，不回归）', function () {
  var env = createSandbox({ includeFrameAnim: false });
  var info = startTaskOfType(env, 'click');
  var targetId = 'wtj-tt-click-target-' + info.taskId;
  var targetCall = findRegisterCallById(env, targetId);

  var el = targetCall.config.el;
  assert.equal(String(el.tagName).toLowerCase(), 'img', '引擎整体缺失时，任何动效道具（含已接入的 faucet/horse/lamp/door/bell）都应回退静态 <img>——此处验证"引擎整体缺失"这个防御式场景');
  assert.equal(el.getAttribute('data-anim-state'), 'idle', '即使回退 img，data-anim-state 预留属性仍应正常设置');
  assert.ok(el.src.indexOf('assets/task-props/lamp.png') !== -1, '灯具初始素材应解析到 task-props/lamp.png（别名解析不受引擎缺失影响）');

  targetCall.config.onClick();

  assert.equal(env.taskStub.completeTaskCalls.length, 1, '引擎缺失不应阻断任务判定完成');
  assert.equal(el.getAttribute('data-anim-state'), 'active', '点击命中后仍应把 data-anim-state 切到 active');
  assert.ok(el.src.indexOf('assets/task-props/lamp.png') !== -1, 'targetSpriteActive（真实 manifest 直接写 lamp.png，非 lamp-on stub）应解析到同一张 lamp.png，走原静态切图路径');

  // 引擎缺失时 animProp/animActiveState 均为 null，hold 应沿用既有 800ms 下限。
  env.clock.advance(800);
  assert.equal(getOverlayRoot(env).children.length, 0, '引擎缺失时 hold 行为应与 014 首次交付时完全一致（800ms）');
});

test('拖拽道具（apple/basket）不在 animation-state 预留清单内，渲染时不应带 data-anim-state 属性（只有 faucet/horse/door/bell/lamp 五个道具预留）', function () {
  var env = createSandbox();
  env.taskStub.clickQuestion(); // 默认注入的确定性 RNG 下首次点击 -> drag（apple/basket）
  var info = env.TT.getActiveTaskInfo();
  var objCall = findRegisterCallById(env, 'wtj-tt-drag-object-' + info.taskId);
  var targetCall = findRegisterCallById(env, 'wtj-tt-drag-target-' + info.taskId);
  assert.equal(objCall.config.el.getAttribute('data-anim-state'), null, 'apple 不在预留清单内，不应有 data-anim-state');
  assert.equal(targetCall.config.el.getAttribute('data-anim-state'), null, 'basket 不在预留清单内，不应有 data-anim-state');
});

// =============================================================================================
// 4b. WTJ-20260704-072：补齐 faucet/horse 点击任务入口（此前 manifest.js click.examples 只有
// lamp 一条，faucet/horse 从未被生成过；引擎/渲染/映射/轮转逻辑本卡未改动，纯粹是 manifest
// 数据补齐，这里验证补齐后 faucet/horse 确实可达且端到端播放正确的 idle/active 两态）
// =============================================================================================

test('072/025：click 类型五个 example（lamp/faucet/horse/door/bell）在轮转中都应该被生成到过（修复前 manifest.js click.examples 只有 lamp 一条，faucet/horse 恒不可达；WTJ-20260705-025 追加 door/doorbell 点击任务后扩到五条）', function () {
  var env = createSandbox();
  var seenClickIds = {};

  // TASK_TYPES.length=4，click.examples.length=5（WTJ-20260705-025 追加 click-door-open/
  // click-doorbell-ring 两条后从 3 条扩到 5 条）：createSandbox() 默认注入 makeIdentityRandom()
  // 让洗牌袋退化为声明顺序轮转（与 P1-1 测试同一推导），一个完整周期是 4*5=20 次点击就足够让
  // 五个 example 下标都轮到至少一次。24 次点击覆盖一个完整周期外加 4 次余量，足够验证全部 5 条。
  for (var i = 0; i < 24; i++) {
    env.taskStub.clickQuestion();
    var info = env.TT.getActiveTaskInfo();
    assert.ok(info, '每次点击问号都应该生成一个进行中任务');
    if (info.type === 'click') {
      seenClickIds[info.taskId] = true;
    }
    env.taskStub.dismissActive();
  }

  assert.deepEqual(
    Object.keys(seenClickIds).sort(),
    ['click-door-open', 'click-doorbell-ring', 'click-faucet-off', 'click-horse-run', 'click-lamp-on'],
    '五个 click example 都应该被轮到过（door/doorbell 此前因 manifest 缺条目从未被生成，本卡验收标准要求两者都可达）'
  );
});

test('WTJ-20260706-009：faucet 点击任务端到端——轮转可达 click-faucet-off，渲染时播放 idle(running,loop:true)（水一直流），onClick 命中后播放 active(closing,loop:false)（关水，播完 clamp 在关水末帧）并 completeTask——语义翻转：此前 idle=off/active=running 是"点一下把水打开"，与产品要求相反，本卡改正', function () {
  var env = createSandbox();
  var info = startTaskWithId(env, 'click', 'click-faucet-off');

  var targetId = 'wtj-tt-click-target-' + info.taskId;
  var targetCall = findRegisterCallById(env, targetId);
  assertArrayEqual(targetCall.config.accepts, ['click']);

  var el = targetCall.config.el;
  assert.equal(String(el.tagName).toLowerCase(), 'canvas', 'faucet 是已接入引擎的三个道具之一，应挂载 <canvas> 而不是 <img>');
  assert.equal(el.getAttribute('data-anim-state'), 'idle', 'faucet 道具初始应为 idle');

  var idlePlay = env.frameAnimStub.lastPlayForCanvas(el);
  assert.ok(idlePlay, '创建时应该调用过一次 WTJ_FRAME_ANIM.play() 播放 idle 态');
  assert.equal(idlePlay.prop, 'faucet', 'faucet 应映射到 prop "faucet"（PROP_ANIM_STATE_MAP）');
  assert.equal(idlePlay.state, 'running', 'faucet 的 idle 态应映射到 anim-manifest 的 "running" state（初始画面=水在流，验收标准 1）');
  assert.equal(idlePlay.opts.loop, true, 'idle 态应强制 loop:true（水持续流动）');

  assert.equal(env.taskStub.completeTaskCalls.length, 0, '未点击前不应完成');
  targetCall.config.onClick();

  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].type, 'click');
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, 'click-faucet-off');

  assert.equal(el.getAttribute('data-anim-state'), 'active', '点击命中后应把 data-anim-state 切到 active');
  var activePlay = env.frameAnimStub.lastPlayForCanvas(el);
  assert.equal(activePlay.prop, 'faucet');
  assert.equal(activePlay.state, 'closing', 'faucet 的 active 态应映射到 anim-manifest 的 "closing" state（点击后=关水，验收标准 1；closing 源数据本就 loop:false，播完定格在关水末帧）');
  assert.equal(activePlay.opts.loop, false, 'active 态应强制 loop:false（closing 源数据本身已是 loop:false，此处仍显式覆盖，保持与其余 prop 一致的调用约定）');
});

test('072：horse 点击任务端到端——轮转可达 click-horse-run，渲染时播放 idle(idle,loop:true)，onClick 命中后播放 active(run,loop:false) 并 completeTask', function () {
  var env = createSandbox();
  var info = startTaskWithId(env, 'click', 'click-horse-run');

  var targetId = 'wtj-tt-click-target-' + info.taskId;
  var targetCall = findRegisterCallById(env, targetId);
  assertArrayEqual(targetCall.config.accepts, ['click']);

  var el = targetCall.config.el;
  assert.equal(String(el.tagName).toLowerCase(), 'canvas', 'horse 是已接入引擎的三个道具之一，应挂载 <canvas> 而不是 <img>');
  assert.equal(el.getAttribute('data-anim-state'), 'idle', 'horse 道具初始应为 idle');

  var idlePlay = env.frameAnimStub.lastPlayForCanvas(el);
  assert.ok(idlePlay, '创建时应该调用过一次 WTJ_FRAME_ANIM.play() 播放 idle 态');
  assert.equal(idlePlay.prop, 'horse', 'horse 应映射到 prop "horse"（PROP_ANIM_STATE_MAP）');
  assert.equal(idlePlay.state, 'idle', 'horse 的 idle 态应映射到 anim-manifest 的 "idle" state');
  assert.equal(idlePlay.opts.loop, true, 'idle 态应强制 loop:true');

  assert.equal(env.taskStub.completeTaskCalls.length, 0, '未点击前不应完成');
  targetCall.config.onClick();

  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].type, 'click');
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, 'click-horse-run');

  assert.equal(el.getAttribute('data-anim-state'), 'active', '点击命中后应把 data-anim-state 切到 active');
  var activePlay = env.frameAnimStub.lastPlayForCanvas(el);
  assert.equal(activePlay.prop, 'horse');
  assert.equal(activePlay.state, 'run', '072 返工（PM 打回）：horse 的 active 态必须映射到 anim-manifest 的 "run" state 让马真的跑起来，不能只用 stop_success 冒充（否则 068 run-sheet 在运行态看不到）');
  assert.equal(activePlay.opts.loop, false, 'active 态应强制 loop:false（即使 run 源数据本身 loop:true，与 bell 的 ring 同构）');
});

// =============================================================================================
// 4c.（WTJ-20260705-025）接入 door/doorbell 点击任务：素材（sprites/door.png、sprites/bell.png）
// 早随 Pack A 交付并集成到 assets/task-props/，但此前没有任何 manifest.js example 引用它们。
// door/bell 均不在 056 的 PROP_ANIM_STATE_MAP 内（v1_boundary.deferred_to_v2，无分帧动效数据），
// 因此即便 WTJ_FRAME_ANIM 引擎存在，也应该走静态 <img> 回退——与 click-lamp-on 在"引擎缺失"时
// 的静态回退路径同构，只是触发条件不同（door/bell 是"引擎存在但该 prop 无映射条目"，而不是
// "引擎整体不存在"）。
// =============================================================================================

test('025：door 点击任务端到端——轮转可达 click-door-open，door v1 动画已接入（-030 验收），挂 <canvas> 播 closed→opening，onClick 命中后 data-anim-state 切 active 并 completeTask + 播 learningWord "door"', function () {
  var env = createSandbox();
  var info = startTaskWithId(env, 'click', 'click-door-open');

  var targetId = 'wtj-tt-click-target-' + info.taskId;
  var targetCall = findRegisterCallById(env, targetId);
  assertArrayEqual(targetCall.config.accepts, ['click']);

  var el = targetCall.config.el;
  // WTJ-20260705-025：door 已加入 PROP_ANIM_STATE_MAP 且降采进 anim-manifest.js，故与
  // faucet/horse/lamp 一样挂 <canvas> 走真实帧动画，不再回退静态 <img>。
  assert.equal(String(el.tagName).toLowerCase(), 'canvas', 'door 已接入引擎（025），应挂 <canvas> 而不是 <img>');
  assert.equal(el.getAttribute('data-anim-state'), 'idle', 'door 道具初始应为 idle');

  var idlePlay = env.frameAnimStub.lastPlayForCanvas(el);
  assert.ok(idlePlay, '创建时应调用 WTJ_FRAME_ANIM.play() 播放 idle 态');
  assert.equal(idlePlay.prop, 'door', 'door 应映射到 prop "door"（PROP_ANIM_STATE_MAP）');
  assert.equal(idlePlay.state, 'closed', 'door 的 idle 态应映射到 anim-manifest 的 "closed" state');
  assert.equal(idlePlay.opts.loop, true, 'idle 态应强制 loop:true');

  assert.equal(env.taskStub.completeTaskCalls.length, 0, '未点击前不应完成');
  targetCall.config.onClick();

  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].type, 'click');
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, 'click-door-open');
  assert.equal(el.getAttribute('data-anim-state'), 'active', '点击命中后应把 data-anim-state 切到 active');
  var activePlay = env.frameAnimStub.lastPlayForCanvas(el);
  assert.equal(activePlay.prop, 'door');
  assert.equal(activePlay.state, 'opening', 'door 的 active 态应映射到 "opening"（一次性开门过程）');
  assert.equal(activePlay.opts.loop, false, 'active 态应强制 loop:false（播完定格在开门末帧）');

  // learningWord: 'door' 命中 secretWords.pool 的 'door' 词条（D 组，已交付），完成后应重播这个词。
  assert.equal(env.audioStub.wordCalls.length, 1, 'click-door-open 带 learningWord，完成后应触发一次 playWord');
  assert.equal(env.audioStub.wordCalls[0].word, 'door');
  assert.equal(env.audioStub.wordCalls[0].audioFile, 'audio/words/door.m4a');
});

test('025：doorbell 点击任务端到端——轮转可达 click-doorbell-ring，bell v1 动画已接入（-031 验收），挂 <canvas> 播 idle→ring，onClick 命中后 completeTask + 播 learningWord "bell"', function () {
  var env = createSandbox();
  var info = startTaskWithId(env, 'click', 'click-doorbell-ring');

  var targetId = 'wtj-tt-click-target-' + info.taskId;
  var targetCall = findRegisterCallById(env, targetId);
  assertArrayEqual(targetCall.config.accepts, ['click']);

  var el = targetCall.config.el;
  assert.equal(String(el.tagName).toLowerCase(), 'canvas', 'bell 已接入引擎（025），应挂 <canvas> 而不是 <img>');
  assert.equal(el.getAttribute('data-anim-state'), 'idle');

  var idlePlay = env.frameAnimStub.lastPlayForCanvas(el);
  assert.ok(idlePlay, '创建时应调用 play() 播放 idle 态');
  assert.equal(idlePlay.prop, 'bell', 'bell 应映射到 prop "bell"');
  assert.equal(idlePlay.state, 'idle', 'bell 的 idle 态应映射到 "idle" state');
  assert.equal(idlePlay.opts.loop, true, 'idle 态应强制 loop:true');

  targetCall.config.onClick();

  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, 'click-doorbell-ring');
  assert.equal(el.getAttribute('data-anim-state'), 'active');
  var activePlay = env.frameAnimStub.lastPlayForCanvas(el);
  assert.equal(activePlay.prop, 'bell');
  assert.equal(activePlay.state, 'ring', 'bell 的 active 态应映射到 "ring"（摇铃）');
  assert.equal(activePlay.opts.loop, false, 'active 态应强制 loop:false（播一轮定格，与 horse.run 同构）');

  assert.equal(env.audioStub.wordCalls.length, 1, 'click-doorbell-ring 带 learningWord，完成后应触发一次 playWord');
  assert.equal(env.audioStub.wordCalls[0].word, 'bell');
  assert.equal(env.audioStub.wordCalls[0].audioFile, 'audio/words/bell.m4a');
});

test('024：door/doorbell 的中文语音已由 CosyVoice3 全量重生成交付，voicePrompt 接到各自 .zh.m4a（此前 025 为 no-silent-fallback 占位空字符串，本卡交付后接线）', function () {
  var env = createSandbox();
  var doorExample = findExampleById(env.manifest, 'click', 'click-door-open');
  var bellExample = findExampleById(env.manifest, 'click', 'click-doorbell-ring');
  assert.equal(doorExample.voicePrompt, 'audio/tasks/click-door-open.zh.m4a', 'click-door-open.voicePrompt 应接到 024 交付的中文语音');
  assert.equal(bellExample.voicePrompt, 'audio/tasks/click-doorbell-ring.zh.m4a', 'click-doorbell-ring.voicePrompt 应接到 024 交付的中文语音');
  assert.equal(doorExample.learningWord, 'door');
  assert.equal(bellExample.learningWord, 'bell');
});

// =============================================================================================
// 3c.（WTJ-20260705-025）drag 池扩容：新增 6 条 example（原 2 条太重复，Ethan 反馈），全部复用
// secretWords.pool 已交付 sprite，零新增美术。这里抽样验证其中两条端到端可达、渲染正确、
// 判定完成正常工作，其余新增 example 的数据形状由下方的批量断言覆盖。
// =============================================================================================

test('025：drag 池扩容——drag-egg-to-nest 端到端可达，物体/目标/干扰项均解析到 assets/sprites/ 下真实素材，onDrop 命中 completeTask 并防御式播放 learningWord "egg"', function () {
  var env = createSandbox();
  var info = startTaskWithId(env, 'drag', 'drag-egg-to-nest');

  var objId = 'wtj-tt-drag-object-' + info.taskId;
  var targetId = 'wtj-tt-drag-target-' + info.taskId;
  var objCall = findRegisterCallById(env, objId);
  var targetCall = findRegisterCallById(env, targetId);
  assert.ok(objCall, '应注册可拖拽物体 target');
  assert.ok(targetCall, '应注册放置目标 target');

  assert.ok(objCall.config.el.src.indexOf('assets/sprites/egg.png') !== -1, '物体应解析到 assets/sprites/egg.png（secretWords.pool 已交付 sprite，零新增美术）');
  assert.ok(targetCall.config.el.src.indexOf('assets/sprites/nest.png') !== -1, '目标应解析到 assets/sprites/nest.png');

  // 物体 + 目标 + 1 个装饰性干扰项（duck）共 3 个 DOM 叠层元素。
  assert.equal(getOverlayRoot(env).children.length, 3, '应渲染 物体+目标+1 个装饰性干扰项共 3 个 DOM 叠层元素');
  // startTaskWithId 为了轮转到这个具体 example，会先经过若干次"点问号+dismiss"（累积注册/
  // 注销记录），这里不能像"首次点击即命中"的用例那样断言 registerCalls 总数恰为 2——改用
  // "不存在任何 id 含 distractor 的注册"这个更稳健的判据（与 renderFindTask() 干扰项断言同款）。
  var hasDistractorRegistration = env.pointerStub.registerCalls.some(function (c) {
    return c.id.indexOf('distractor') !== -1;
  });
  assert.equal(hasDistractorRegistration, false, '装饰性干扰项不应注册为 pointer target');

  assert.equal(env.taskStub.completeTaskCalls.length, 0);
  targetCall.config.onDrop();
  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, 'drag-egg-to-nest');

  assert.equal(env.audioStub.wordCalls.length, 1, 'drag-egg-to-nest 带 learningWord，完成后应触发一次 playWord');
  assert.equal(env.audioStub.wordCalls[0].word, 'egg');
  assert.equal(env.audioStub.wordCalls[0].audioFile, 'audio/words/egg.m4a');
});

test('025：drag 池扩容——drag-treasure-to-chest 端到端可达，目标复用 treasure-chest.png（与 rewards.chest.sprite 同一文件，互不冲突），onDrop 命中 completeTask', function () {
  var env = createSandbox();
  var info = startTaskWithId(env, 'drag', 'drag-treasure-to-chest');

  var targetId = 'wtj-tt-drag-target-' + info.taskId;
  var targetCall = findRegisterCallById(env, targetId);
  assert.ok(targetCall.config.el.src.indexOf('assets/sprites/treasure-chest.png') !== -1);

  targetCall.config.onDrop();
  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, 'drag-treasure-to-chest');
});

test('025+024：drag 池扩容——manifest.tasks.templates.drag.examples 恰好 8 条（原 2 条 + 新增 6 条），新增 6 条的 id/学习词符合约定；voicePrompt 在 024 CosyVoice3 交付后接到各自 .zh.m4a；learningWord 均能在 secretWords.pool 命中', function () {
  var env = createSandbox();
  var examples = env.manifest.tasks.templates.drag.examples;
  assert.equal(examples.length, 8, 'drag.examples 应恰好 8 条');

  var newIds = ['drag-egg-to-nest', 'drag-flower-to-vase', 'drag-orange-to-basket', 'drag-fish-to-net', 'drag-jam-to-jar', 'drag-treasure-to-chest'];
  var actualNewIds = [];
  for (var i = 2; i < examples.length; i++) {
    actualNewIds.push(examples[i].id);
  }
  assert.deepEqual(actualNewIds, newIds, '新增的 6 条应追加在原有 2 条之后，不打乱既有下标（voice-language 相关测试与 task-voice-path.test.mjs 依赖 drag.examples[0] 恒为 drag-apple-to-basket）');

  newIds.forEach(function (id) {
    var ex = findExampleById(env.manifest, 'drag', id);
    assert.equal(ex.voicePrompt, 'audio/tasks/' + id + '.zh.m4a', id + '.voicePrompt 应接到 024 CosyVoice3 交付的中文语音');
    assert.equal(typeof ex.learningWord, 'string', id + ' 应带 learningWord');
    var poolHit = false;
    for (var j = 0; j < env.manifest.secretWords.pool.length; j++) {
      if (env.manifest.secretWords.pool[j].word === ex.learningWord) {
        poolHit = true;
        break;
      }
    }
    assert.ok(poolHit, id + '.learningWord ("' + ex.learningWord + '") 应能在 secretWords.pool 命中（零新增音频约束）');
  });
});

// =============================================================================================
// 5. 寻找任务（REQ-TASK-09）：onHover 与 onClick 共享同一完成回调
// =============================================================================================

test('寻找任务：onHover 命中触发 completeTask；干扰项渲染但不注册 pointer target', function () {
  var env = createSandbox();
  var info = startTaskOfType(env, 'find');
  var targetId = 'wtj-tt-find-target-' + info.taskId;
  var targetCall = findRegisterCallById(env, targetId);
  assertArrayEqual(targetCall.config.accepts, ['hover', 'click']);
  assert.equal(typeof targetCall.config.onHover, 'function');
  assert.equal(typeof targetCall.config.onClick, 'function');
  assert.equal(targetCall.config.onHover, targetCall.config.onClick, 'onHover 与 onClick 应共享同一个完成回调（pressOrHoverAlsoCompletes 的落地方式）');

  // WTJ-20260706-012 起 find 默认走随机 word-card 抽取（manifest.tasks.templates.find.
  // randomPool.sampleSize={min:2,max:4}，即目标+干扰项总数 N 随机落在 3~5——不再是固定 3，
  // 这里按配置范围校验而不是断言某个具体数字。
  var sampleCfg = env.manifest.tasks.templates.find.randomPool.sampleSize;
  var childCount = getOverlayRoot(env).children.length;
  assert.ok(childCount >= 1 + sampleCfg.min && childCount <= 1 + sampleCfg.max,
    '应渲染 1 个目标 + [' + sampleCfg.min + '~' + sampleCfg.max + '] 个干扰项，实际 ' + childCount);
  var hasDistractorRegistration = env.pointerStub.registerCalls.some(function (c) {
    return c.id.indexOf('distractor') !== -1;
  });
  assert.equal(hasDistractorRegistration, false, '干扰项不应注册为 pointer target（纯视觉，不参与命中判定）');

  assert.equal(env.taskStub.completeTaskCalls.length, 0);
  targetCall.config.onHover();
  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].type, 'find');
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, info.taskId);
});

test('寻找任务：不悬停，直接 onClick 也能完成（"点一下也算完成"）', function () {
  var env = createSandbox();
  var info = startTaskOfType(env, 'find');
  var targetCall = findRegisterCallById(env, 'wtj-tt-find-target-' + info.taskId);

  assert.equal(env.taskStub.completeTaskCalls.length, 0);
  targetCall.config.onClick();
  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].type, 'find');
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, info.taskId);
});

test('P2-4：emphasize 阶段只强调 find 任务的 targetEl，不强调 distractorSprites 干扰项；hint 阶段不受影响，仍作用于全部元素', function () {
  var env = createSandbox();
  var info = startTaskOfType(env, 'find');
  var targetCall = findRegisterCallById(env, 'wtj-tt-find-target-' + info.taskId);
  var targetEl = targetCall.config.el;

  var root = getOverlayRoot(env);
  var distractorEls = [];
  for (var i = 0; i < root.children.length; i++) {
    if (root.children[i] !== targetEl) {
      distractorEls.push(root.children[i]);
    }
  }
  assert.ok(distractorEls.length > 0, 'WTJ-20260706-012 随机 word-card 抽取（sampleSize=2）应该有至少一个干扰项，本测试才有意义');

  env.taskStub.firePhase({ phase: 'emphasize' });

  assert.ok(targetEl.classList._list.indexOf('wtj-tt-emphasize') !== -1, 'emphasize 阶段应该强调 find 目标本身');
  distractorEls.forEach(function (el) {
    assert.equal(el.classList._list.indexOf('wtj-tt-emphasize'), -1, 'emphasize 阶段不应该强调干扰项（否则等于泄漏正确答案）');
  });

  // hint 阶段维持原样（不在 P2-4 范围内）：一次性小弹跳仍然作用于全部元素，含干扰项。
  env.taskStub.firePhase({ phase: 'hint' });
  assert.ok(targetEl.classList._list.indexOf('wtj-tt-hint') !== -1, 'hint 阶段应该作用于目标');
  distractorEls.forEach(function (el) {
    assert.ok(el.classList._list.indexOf('wtj-tt-hint') !== -1, 'hint 阶段仍然应该作用于干扰项（不属于 P2-4 修复范围）');
  });
});

// =============================================================================================
// 6. 按键任务（REQ-TASK-10）：不渲染任何 DOM，纯键盘匹配判定
// =============================================================================================

test('按键任务：不渲染任何 DOM / 不注册任何 pointer target；WTJ_KEYBOARD.onLetter 命中 targetKey 才 completeTask，不命中不完成', function () {
  var env = createSandbox();
  var info = startTaskOfType(env, 'press');
  // 轮转到 press 前会依次经过 drag/click/find（各自渲染过 DOM、注册过 pointer target），
  // 每次都被 dismissActive() 清理干净；到达 press 时 overlay root 应该是空的（root 本身一旦
  // 创建就不会被移除，见 getOverlayRoot() 注释），且本次 press 任务自己不应再新增任何注册。
  var root = getOverlayRoot(env);
  assert.ok(root, '此前 drag 任务已经触发过 overlay root 的懒创建');
  assert.equal(root.children.length, 0, '按键任务不应渲染任何 DOM（root 下应无任何遗留/新增子节点）');
  var registerCallsBeforePress = env.pointerStub.registerCalls.length;

  var example = findExampleById(env.manifest, 'press', info.taskId);
  assert.ok(example, '应能在真实 manifest 中找到对应的 press 示例');
  var wrongKey = (example.targetKey.toUpperCase() === 'A') ? 'B' : 'A';

  env.keyboardStub.pressLetter(wrongKey);
  assert.equal(env.taskStub.completeTaskCalls.length, 0, '不匹配的按键不应完成任务');

  env.keyboardStub.pressLetter(example.targetKey.toUpperCase());
  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].type, 'press');
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, info.taskId);

  assert.equal(env.pointerStub.registerCalls.length, registerCallsBeforePress, '按键任务全程不应新增任何 pointer target 注册');
  assert.equal(root.children.length, 0, '按键任务完成后 overlay root 下仍不应有任何子节点');
});

// WTJ-20260706-010：缺口修复——此前按键任务只接线了 WTJ_KEYBOARD.onLetter，targetKey 是符号 /
// 'Space' / 'Enter' / 方向键时永远无法完成（onSymbol/onFunctionKey 从未接线）。下面用最小自定义
// manifest（单条 press example，targetKey 分别取符号/'Space'/'Enter'/'ArrowUp'）逐条验证新接线，
// 与上面「不命中不完成」的既有断言风格一致：先喂一个不匹配的键确认不完成，再喂匹配的键确认完成。
function makeSinglePressManifestSrc(targetKey) {
  return 'window.WTJ_MANIFEST = {' +
    '  tasks: { templates: {' +
    '    drag: { examples: [{ id: "drag-x", objectSprite: "sprites/apple.png", targetSprite: "sprites/basket.png", voicePrompt: "", successAudio: "" }] },' +
    '    click: { examples: [{ id: "click-x", targetSprite: "sprites/lamp.png", targetSpriteActive: null, voicePrompt: "", successAudio: "" }] },' +
    '    find: { examples: [{ id: "find-x", targetSprite: "sprites/dog.png", distractorSprites: [], voicePrompt: "", successAudio: "" }] },' +
    '    press: { examples: [{ id: "press-x", targetKey: "' + targetKey + '", voicePrompt: "", successAudio: "" }] }' +
    '  } },' +
    '  rewards: { statusLights: { count: 3 } }' +
    '};';
}

test('按键任务（010）：targetKey 为符号时，WTJ_KEYBOARD.onSymbol 命中该符号才 completeTask，不匹配的符号不完成', function () {
  var env = createSandbox({ manifestOverrideSrc: makeSinglePressManifestSrc(',') });
  var info = startTaskOfType(env, 'press');
  assert.equal(info.taskId, 'press-x');

  env.keyboardStub.emitSymbol('[', 0.6); // 不匹配的符号
  assert.equal(env.taskStub.completeTaskCalls.length, 0, '不匹配的符号不应完成任务');

  env.keyboardStub.emitSymbol(',', 0.6); // 匹配 targetKey
  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].type, 'press');
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, 'press-x');
});

test('按键任务（010）：targetKey 为 "Space" 时，WTJ_KEYBOARD.onFunctionKey({key:"Space",...}) 才 completeTask，其它功能键不完成', function () {
  var env = createSandbox({ manifestOverrideSrc: makeSinglePressManifestSrc('Space') });
  var info = startTaskOfType(env, 'press');
  assert.equal(info.taskId, 'press-x');

  env.keyboardStub.emitFunctionKey({ key: 'Enter', category: 'light', intensity: 1 });
  assert.equal(env.taskStub.completeTaskCalls.length, 0, '不匹配的功能键（Enter）不应完成 Space 任务');

  env.keyboardStub.emitFunctionKey({ key: 'Space', category: 'light', intensity: 1 });
  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].type, 'press');
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, 'press-x');
});

test('按键任务（010）：targetKey 为 "Enter" 时，WTJ_KEYBOARD.onFunctionKey({key:"Enter",...}) 才 completeTask，其它功能键不完成', function () {
  var env = createSandbox({ manifestOverrideSrc: makeSinglePressManifestSrc('Enter') });
  var info = startTaskOfType(env, 'press');
  assert.equal(info.taskId, 'press-x');

  env.keyboardStub.emitFunctionKey({ key: 'Tab', category: 'other', intensity: 0.5 });
  assert.equal(env.taskStub.completeTaskCalls.length, 0, '不匹配的功能键（Tab）不应完成 Enter 任务');

  env.keyboardStub.emitFunctionKey({ key: 'Enter', category: 'light', intensity: 1 });
  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].type, 'press');
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, 'press-x');
});

test('按键任务（010）：targetKey 为方向键 "ArrowUp" 时，WTJ_KEYBOARD.onFunctionKey({key:"ArrowUp",...}) 才 completeTask，其它方向键不完成', function () {
  var env = createSandbox({ manifestOverrideSrc: makeSinglePressManifestSrc('ArrowUp') });
  var info = startTaskOfType(env, 'press');
  assert.equal(info.taskId, 'press-x');

  env.keyboardStub.emitFunctionKey({ key: 'ArrowDown', category: 'other', intensity: 0.5 });
  assert.equal(env.taskStub.completeTaskCalls.length, 0, '不匹配的方向键（ArrowDown）不应完成 ArrowUp 任务');

  env.keyboardStub.emitFunctionKey({ key: 'ArrowUp', category: 'other', intensity: 0.5 });
  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].type, 'press');
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, 'press-x');
});

test('按键任务（010）门禁：进行中任务不是 press 类型时，杂散的 onSymbol/onFunctionKey/onLetter 事件不应误触发 completeTask（防止 Enter/方向键/符号误判其它三类任务完成）', function () {
  var env = createSandbox();
  var info = startTaskOfType(env, 'drag'); // 当前进行中任务类型是 drag，不是 press
  assert.equal(info.type, 'drag');

  env.keyboardStub.emitSymbol(',', 1);
  env.keyboardStub.emitFunctionKey({ key: 'Enter', category: 'light', intensity: 1 });
  env.keyboardStub.emitFunctionKey({ key: 'ArrowUp', category: 'other', intensity: 0.5 });
  env.keyboardStub.pressLetter('A');

  assert.equal(env.taskStub.completeTaskCalls.length, 0, 'activeRuntime.type !== "press" 时，任何键盘事件都不应触发 completeTask');
});

// =============================================================================================
// 7. 完成 -> WTJ_HUD.setStatusLight / WTJ_AUDIO.playSfx（REQ-RWD-04，防御式）
// =============================================================================================

test('完成任务后防御式点亮 WTJ_HUD 状态灯（真实 manifest count=3，按顺序轮转 0,1,2,0）并尝试播放 successAudio', function () {
  var env = createSandbox();
  assert.equal(env.manifest.rewards.statusLights.count, 3);

  // statusLightIndex 只按"完成次数"递增取模（见 handleTemplateComplete()），与本次完成的任务
  // 是哪个 type/example 无关——因此 [0,1,2,0] 这条断言与 type 选择用洗牌袋还是旧版计数器无关，
  // 4 次连续完成（completeCurrentTask() 会按当前 activeRuntime 的真实类型走对应完成路径，
  // 任意顺序皆可）恒产出这个序列。createSandbox() 默认注入的确定性 RNG 下这 4 次也恰好按
  // drag/click/find/press 顺序轮到（与 002 卡之前的确定性计数器序列一致），但这不是本断言
  // 成立的前提。
  var expectedLightSeq = [0, 1, 2, 0];
  for (var i = 0; i < 4; i++) {
    env.taskStub.clickQuestion();
    completeCurrentTask(env);
  }

  assert.deepEqual(env.hudStub.calls.map(function (c) { return c.index; }), expectedLightSeq);
  env.hudStub.calls.forEach(function (c) {
    assert.equal(c.on, true, 'setStatusLight 的第二个参数应恒为 true（点亮）');
  });
  assert.equal(env.taskStub.completeTaskCalls.length, 4);
  assert.equal(env.audioStub.calls.length, 4, '每次完成都应尝试播放 successAudio（真实 manifest 各示例都带 successAudio 字段）');

  // WTJ-20260705-004 Phase A（pt5）：drag-apple-to-basket/click-lamp-on 都带 learningWord
  // （'apple'/'lamp'），完成后应各自触发一次 playWord()；press-letter-a 未设置 learningWord
  // （字母任务不是词汇学习），不应触发。find 类型自 WTJ-20260706-012 起改走随机 word-card
  // 抽取（createSandbox() 默认 identity RNG 下，wordCardBagState 退化为 secretWords.pool 的
  // 声明顺序轮转，首次抽取恒为 pool[0]='apple'——与固定 example find-the-dog 的 'dog' 不同，
  // 见 task-templates.js drawWordCardFind()/sampleWordCardsFromPool() 说明），synthetic
  // example 的 learningWord 恒等于抽中的 target word，同样会触发一次 playWord()——因此 4 次
  // 完成仍然只应有 3 次 playWord（drag/click/find 各一次，press 没有 learningWord 不触发）。
  assert.equal(env.audioStub.wordCalls.length, 3, 'drag/click/find 三类各自的 learningWord 都应该触发 playWord；press-letter-a 没有 learningWord 不触发');
  var expectedWords = ['apple', 'lamp', 'apple'];
  var expectedAudioFiles = ['audio/words/apple.m4a', 'audio/words/lamp.m4a', 'audio/words/apple.m4a'];
  env.audioStub.wordCalls.forEach(function (call, idx) {
    assert.equal(call.word, expectedWords[idx], 'playWord 应传入 secretWords.pool 里对应的 word 字段');
    assert.equal(call.audioFile, expectedAudioFiles[idx], 'playWord 应传入 secretWords.pool 里对应的 audioFile 字段（零新增音频：直接复用已交付词条）');
  });
});

test('learningWord（pt5）防御式播放：未在 secretWords.pool 命中的 learningWord 静默跳过（不调用 playWord，不抛错）', function () {
  var customManifestSrc =
    'window.WTJ_MANIFEST = {' +
    '  secretWords: { pool: [ { word: "dog", spriteFile: "sprites/dog.png", audioFile: "audio/words/dog.m4a" } ] },' +
    '  tasks: { templates: {' +
    '    drag: { examples: [{ id: "drag-x", objectSprite: "sprites/apple.png", targetSprite: "sprites/basket.png", voicePrompt: "", successAudio: "audio/sfx/task-success.m4a", learningWord: "not-in-pool" }] },' +
    '    click: { examples: [{ id: "click-x", targetSprite: "sprites/lamp.png", targetSpriteActive: null, voicePrompt: "", successAudio: "" }] },' +
    '    find: { examples: [{ id: "find-x", targetSprite: "sprites/dog.png", distractorSprites: [], voicePrompt: "", successAudio: "" }] },' +
    '    press: { examples: [{ id: "press-x", targetKey: "A", voicePrompt: "", successAudio: "" }] }' +
    '  } },' +
    '  rewards: { statusLights: { count: 3 } }' +
    '};';
  var env = createSandbox({ manifestOverrideSrc: customManifestSrc });

  var info = startTaskOfType(env, 'drag');
  assert.equal(info.taskId, 'drag-x');
  var targetCall = findRegisterCallById(env, 'wtj-tt-drag-target-drag-x');

  targetCall.config.onDrop();

  assert.equal(env.taskStub.completeTaskCalls.length, 1, '找不到 learningWord 对应词条不应阻断任务判定完成');
  assert.equal(env.audioStub.wordCalls.length, 0, '学习词不在 pool 内时不应调用 playWord');
});

// =============================================================================================
// 8. onDismiss 清理（013 超时 / 键盘转移触发，REQ-EXIT-04：dismiss 不代表失败）
// =============================================================================================

test('onDismiss 触发：unregisterTarget 被调用、DOM 叠层被清理；dismiss 之后残留的 onDrop 迟到回调不应再完成任务', function () {
  var env = createSandbox();
  env.taskStub.clickQuestion(); // drag
  var info = env.TT.getActiveTaskInfo();
  assert.equal(info.type, 'drag');
  assert.ok(getOverlayRoot(env).children.length > 0);
  assert.ok(env.pointerStub.registerCalls.length > 0);

  var objId = 'wtj-tt-drag-object-' + info.taskId;
  var targetId = 'wtj-tt-drag-target-' + info.taskId;
  var targetCall = findRegisterCallById(env, targetId);

  env.taskStub.dismissActive();

  assert.equal(getOverlayRoot(env).children.length, 0, 'dismiss 后叠层 DOM（overlay root 的子节点）应清空');
  assert.ok(env.pointerStub.unregisterCalls.indexOf(objId) !== -1);
  assert.ok(env.pointerStub.unregisterCalls.indexOf(targetId) !== -1);
  assert.equal(env.TT.getActiveTaskInfo(), null, 'dismiss 后不应再有进行中任务');

  targetCall.config.onDrop();
  assert.equal(env.taskStub.completeTaskCalls.length, 0, 'dismiss 之后的迟到 onDrop 不应触发 completeTask');
});

test('onDismiss（056）：进行中的点击任务（灯具，canvas 承载）被 dismiss 时应调用 WTJ_FRAME_ANIM.stop()，不留下空转的 tick', function () {
  var env = createSandbox();
  var info = startTaskOfType(env, 'click');
  var targetId = 'wtj-tt-click-target-' + info.taskId;
  var targetCall = findRegisterCallById(env, targetId);
  var el = targetCall.config.el;
  assert.equal(String(el.tagName).toLowerCase(), 'canvas');

  env.taskStub.dismissActive();

  assert.equal(getOverlayRoot(env).children.length, 0, 'dismiss 后叠层 DOM 应立即清空（不像完成路径那样有 800ms 可见窗口）');
  assert.ok(env.frameAnimStub.stopCalls.indexOf(el) !== -1, 'dismiss 清理时应该调用过 WTJ_FRAME_ANIM.stop()，避免 canvas 从文档树摘除后引擎的 tick 定时器继续空转');
});

// =============================================================================================
// 9. onTaskComplete 订阅者 / 多订阅者隔离
// =============================================================================================

test('onTaskComplete 订阅者收到 {type, taskId, lightIndex}；某订阅者抛错不影响其他订阅者（try/catch 隔离，与 013/012 同款设计）', function () {
  var env = createSandbox();
  var received = [];
  var secondCalled = false;
  env.TT.onTaskComplete(function () { throw new Error('boom-subscriber-1'); });
  env.TT.onTaskComplete(function (payload) {
    received.push(payload);
    secondCalled = true;
  });

  env.taskStub.clickQuestion(); // drag
  completeCurrentTask(env);

  assert.equal(secondCalled, true, '第二个订阅者应仍然被调用，不受第一个抛错影响');
  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'drag');
  assert.equal(received[0].taskId, 'drag-apple-to-basket');
  assert.equal(received[0].lightIndex, 0);
  assert.ok(env.errorCalls.length >= 1, '订阅回调抛错应被 console.error 捕获，不应向外抛出');
});

// WTJ-20260705-015：onTaskComplete payload 新增 completionAnchor 字段（emit 时字段名为
// `anchor`），供 015（status-rewards.js）任务成功即时视觉反馈定位 sparkle burst——drag/click/
// find 三类应携带渲染时实际使用的 preset 位置（换算成 { leftPercent, topPercent } 两个数字），
// press 类没有任何 DOM 元素，anchor 应恒为 null（015 侧对 null 有自己的画布安全区兜底，不是
// 本文件职责，见 presetAt() 下方 anchorFromPos() 一节）。
test('WTJ-20260705-015：onTaskComplete payload 新增 anchor 字段——drag/click/find 为 {leftPercent, topPercent} 数字（0-100 范围），press 类型没有 DOM 恒为 null；不影响既有 type/taskId/lightIndex 字段', function () {
  // 依赖 createSandbox() 默认注入的确定性 RNG（makeIdentityRandom()）让 4 次连续点击恰好按
  // drag/click/find/press 顺序轮到一次（与 002 卡之前的确定性计数器序列一致）——这里只是借助
  // 这个可预测顺序方便逐类型断言 anchor 形状，不是在测试洗牌袋本身的调度顺序（那部分契约见
  // "11. 洗牌袋契约"一节）。
  var env = createSandbox();
  var received = [];
  env.TT.onTaskComplete(function (payload) { received.push(payload); });

  env.taskStub.clickQuestion(); // 默认 RNG 下第 1 次 -> drag
  completeCurrentTask(env);

  env.taskStub.clickQuestion(); // 默认 RNG 下第 2 次 -> click
  completeCurrentTask(env);

  env.taskStub.clickQuestion(); // 默认 RNG 下第 3 次 -> find
  completeCurrentTask(env);

  env.taskStub.clickQuestion(); // 默认 RNG 下第 4 次 -> press
  completeCurrentTask(env);

  assert.equal(received.length, 4, '四类任务各完成一次，应收到 4 次 onTaskComplete');

  ['drag', 'click', 'find'].forEach(function (expectedType, i) {
    var payload = received[i];
    assert.equal(payload.type, expectedType, 'onTaskComplete 顺序应与四类任务完成顺序一致，未受 anchor 新增字段影响');
    assert.ok(payload.anchor && typeof payload.anchor === 'object', expectedType + ' 任务完成时 payload.anchor 应为对象（非 null）');
    assert.equal(typeof payload.anchor.leftPercent, 'number', expectedType + ' payload.anchor.leftPercent 应为数字');
    assert.equal(typeof payload.anchor.topPercent, 'number', expectedType + ' payload.anchor.topPercent 应为数字');
    assert.ok(payload.anchor.leftPercent >= 0 && payload.anchor.leftPercent <= 100, expectedType + ' leftPercent 应落在 POSITION_PRESETS 的 0-100 百分比范围内');
    assert.ok(payload.anchor.topPercent >= 0 && payload.anchor.topPercent <= 100, expectedType + ' topPercent 应落在 POSITION_PRESETS 的 0-100 百分比范围内');
  });

  assert.equal(received[3].type, 'press');
  assert.equal(received[3].anchor, null, 'press 类型没有任何 DOM 元素，anchor 应恒为 null（015 侧兜底画布安全区，不是本文件职责）');
});

// =============================================================================================
// 10. 防御式降级
// =============================================================================================

test('防御式：WTJ_TASK/WTJ_POINTER/WTJ_KEYBOARD/WTJ_HUD/WTJ_AUDIO 任一单独缺失时加载都不抛错，API 仍挂载', function () {
  ['includeTask', 'includePointer', 'includeKeyboard', 'includeHud', 'includeAudio'].forEach(function (flag) {
    var opts = {};
    opts[flag] = false;
    var env;
    assert.doesNotThrow(function () {
      env = createSandbox(opts);
    }, flag + ' 缺失时加载不应抛错');
    assert.ok(env.window.WTJ_TASK_TEMPLATES, flag + ' 缺失时仍应挂载 window.WTJ_TASK_TEMPLATES');
  });

  // 全部缺失同时验证。
  var envAll;
  assert.doesNotThrow(function () {
    envAll = createSandbox({
      includeTask: false,
      includePointer: false,
      includeKeyboard: false,
      includeHud: false,
      includeAudio: false
    });
  }, '五个依赖全部缺失时加载不应抛错');
  assert.ok(envAll.window.WTJ_TASK_TEMPLATES, '五个依赖全部缺失时仍应挂载 API');
  assert.equal(envAll.TT.getActiveTaskInfo(), null);
});

test('防御式：WTJ_POINTER 缺失时四类任务依次渲染都不抛错（无法通过 pointer 完成拖拽/点击/寻找，但问号接线本身不应被阻断）', function () {
  var env = createSandbox({ includePointer: false });
  for (var i = 0; i < 4; i++) {
    assert.doesNotThrow(function () {
      env.taskStub.clickQuestion();
    }, '第 ' + (i + 1) + ' 次点击问号不应抛错');
    var info = env.TT.getActiveTaskInfo();
    assert.ok(info, '即使 WTJ_POINTER 缺失，任务仍应正常生成');
    env.taskStub.dismissActive();
  }
});

test('防御式：WTJ_POINTER/WTJ_HUD/WTJ_AUDIO 全缺失时，按键任务完整流程仍不抛错，completeTask 仍被正确调用', function () {
  var env = createSandbox({ includePointer: false, includeHud: false, includeAudio: false });
  var info;
  assert.doesNotThrow(function () {
    info = startTaskOfType(env, 'press');
  });
  assert.equal(info.type, 'press');

  var example = findExampleById(env.manifest, 'press', info.taskId);
  assert.doesNotThrow(function () {
    env.keyboardStub.pressLetter(example.targetKey.toUpperCase());
  });
  assert.equal(env.taskStub.completeTaskCalls.length, 1, 'POINTER/HUD/AUDIO 缺失不应阻断 completeTask 被正常调用');
});

test('防御式：window.WTJ_MANIFEST 缺失时回退内置默认示例，问号点击仍能生成任务且不抛错', function () {
  var env = createSandbox({ omitManifest: true });
  assert.ok(env.warnCalls.some(function (m) { return m.indexOf('WTJ_MANIFEST') !== -1; }), '应有 console.warn 提示 manifest 缺失');

  assert.doesNotThrow(function () {
    env.taskStub.clickQuestion();
  });
  var info = env.TT.getActiveTaskInfo();
  assert.equal(info.type, 'drag');
  assert.equal(info.taskId, 'drag-apple-to-basket', '应回退到内置默认示例（镜像 manifest 首个 drag 示例）');
});

// =============================================================================================
// 11. 洗牌袋契约（WTJ-20260706-002：问号任务 type/example 选择从确定性递增计数器改为洗牌袋
// shuffle bag 真随机调度，见 task-templates.js 文件头「任务生成」一节）。本节所有用例显式传入
// mulberry32(seed)（见文件头「可注入 RNG」一节），一个会真正打乱顺序的确定性 PRNG——不用
// createSandbox() 默认的 makeIdentityRandom()，因为那个"不洗牌"桩从不触发 Fisher-Yates 的
// 交换分支，也从不触发跨袋边界的"防相邻重复"交换分支，无法验证这两条真正的新增契约。断言目标
// 是契约本身（一整袋内每个候选恰好一次、跨袋边界不相邻重复、同种子可复现），不是某个具体种子
// 产出的具体顺序——这样即使未来 Fisher-Yates 的实现细节调整，只要契约不变，这些用例应该继续
// 通过。
// =============================================================================================

// 从一个 sandbox 连续点击问号 n 次（每次立即 dismissActive() 腾出空间给下一次点击），收集每次
// getActiveTaskInfo() 的 {type, taskId}。返回值用本文件（主 realm）的 [] / push 逐个搬运原始值
// 字段构造，不是跨 realm 对象，可以放心用 assert.deepEqual（同文件头「跨 realm 陷阱」一节）。
function collectDraws(env, n) {
  var out = [];
  for (var i = 0; i < n; i++) {
    env.taskStub.clickQuestion();
    var info = env.TT.getActiveTaskInfo();
    assert.ok(info, 'collectDraws: 点击问号后应生成一个进行中任务');
    out.push({ type: info.type, taskId: info.taskId });
    env.taskStub.dismissActive();
  }
  return out;
}

test('洗牌袋契约①：type 洗牌袋——连续 3 个完整周期（TASK_TYPES.length=4 次抽取为一周期）内，每个周期都是 TASK_TYPES 的一个排列（四类各恰好一次，无重复无遗漏）', function () {
  var env = createSandbox({ randomFn: mulberry32(42) });
  var draws = collectDraws(env, 12); // 3 个周期。
  for (var cycle = 0; cycle < 3; cycle++) {
    var chunk = draws.slice(cycle * 4, cycle * 4 + 4).map(function (d) { return d.type; });
    assert.deepEqual(chunk.slice().sort(), ['click', 'drag', 'find', 'press'], '第 ' + (cycle + 1) + ' 个周期应恰好是 TASK_TYPES 的一个排列（无重复、无遗漏）');
  }
});

test('洗牌袋契约②：example 洗牌袋——真实洗牌下 drag/click/press 各自完整覆盖 manifest 里全部 example id，显式验证 drag-dog-home、press-letter-a 均可达（P1-1 回归钉子：修复前的旧版计数器公式会让这两个 example 永不可达，见文件头「历史记录」一节；现在结构性保证可达，不依赖任何数论巧合）；find 类型改走 WTJ-20260706-012 随机 word-card 抽取，本用例只做形状回归检查（全覆盖契约见「12.」一节）', function () {
  var env = createSandbox({ randomFn: mulberry32(2024) });
  var seenByType = { drag: {}, click: {}, press: {} };
  var seenFindIds = {};
  // N=400（WTJ-20260706-010 上调，原为 200——见下方推导）：结构性上限（与具体种子无关的数学
  // 保证，不是针对 2024 这个种子调出来的运气值）。关键前提：本用例的 example 洗牌袋是从**全新
  // sandbox**（createSandbox() 刚创建，任何 type 都还没抽过）开始观察的，不是从任意历史时刻切入
  // 的连续窗口——因此不需要「防御 mid-bag 起点」那种更保守的 2*len-1 下限，只需要该 type 的**
  // 抽取次数**达到 examples.length 即可结构性保证第一整袋无重复覆盖全部 id（洗牌袋定义：满袋是
  // 一个不放回的排列，从头开始数 len 次必然覆盖全部 len 个候选）。
  // 又因为 TASK_TYPES.length=4 的 type 洗牌袋每满一袋就是 ['drag','click','find','press'] 的一个
  // 排列，N 取 4 的倍数时每个 type 的抽取次数**恰好**是 N/4（不是概率下限，是排列结构决定的确
  // 定值）——所以只需 N/4 >= examples.length 的最大值。
  // WTJ-20260706-010 按键池扩容后，examples.length 最大的固定-example 类型已从 drag（8 条）变为
  // press（47 条，字母 26 + 数字 10 + 符号 5 + 特殊键 2 + 方向键 4），需要 N/4 >= 47，即
  // N >= 188；取 400（N/4=100）留出一倍以上余量，drag(8)/click(5) 的需求远低于此，同时也给未来
  // press 池继续扩容留出缓冲，不必每次扩池都回来调整这个数字。find 类型自 WTJ-20260706-012 起
  // 改走随机 word-card 抽取，不再纳入本"覆盖固定 example id"断言（见下方说明与「12.」一节的专属
  // 全覆盖契约）。
  var N = 400;
  for (var i = 0; i < N; i++) {
    env.taskStub.clickQuestion();
    var info = env.TT.getActiveTaskInfo();
    if (info.type === 'find') {
      seenFindIds[info.taskId] = true;
    } else {
      seenByType[info.type][info.taskId] = true;
    }
    env.taskStub.dismissActive();
  }
  ['drag', 'click', 'press'].forEach(function (t) {
    var examples = env.manifest.tasks.templates[t].examples; // 跨 realm 数组，见文件头「跨 realm 陷阱」一节。
    var expectedIds = [];
    for (var i = 0; i < examples.length; i++) {
      expectedIds.push(examples[i].id);
    }
    expectedIds.sort();
    assert.deepEqual(Object.keys(seenByType[t]).sort(), expectedIds, '类型 "' + t + '" 在洗牌袋调度下应覆盖全部 ' + expectedIds.length + ' 个 example id（无遗漏）');
  });
  assert.ok(seenByType.drag['drag-dog-home'], '洗牌袋下 drag-dog-home 应可达（P1-1 硬要求："孩子应该能见到把狗狗带回家"）');
  assert.ok(seenByType.press['press-letter-a'], '洗牌袋下 press-letter-a 应可达（P1-1 硬要求）');

  // find（WTJ-20260706-012 新增 word-card 抽取）：验证产出的 id 均合法（形状 + word 命中
  // pool），且确实抽到了不止一个不同的词（不是死锁在同一个词上）——全覆盖 secretWords.pool
  // 契约（100 词恰好各当一次 target）见下方「12.」一节的专属测试。
  var poolWords = {};
  var pool = env.manifest.secretWords.pool;
  var pw;
  for (pw = 0; pw < pool.length; pw++) {
    poolWords[pool[pw].word] = true;
  }
  var findIds = Object.keys(seenFindIds);
  assert.ok(findIds.length > 1, 'find 类型 word-card 抽取应该产出不止一个不同的词（本用例 200 次点击内）');
  findIds.forEach(function (id) {
    var m = /^find-card-([a-z]+)$/.exec(id);
    assert.ok(m, 'find 类型 synthetic id 应符合 find-card-<word> 形状，实际："' + id + '"');
    assert.ok(poolWords[m[1]], 'find synthetic id 里的 word "' + m[1] + '" 应该能在 secretWords.pool 命中');
  });
});

test('洗牌袋契约③：跨袋边界不出现相邻两次同 type（回归钉子：mulberry32(0) 经验证——若移除"防相邻重复"交换逻辑，40 次点击内必然出现相邻同 type；当前实现下 200 次点击内不应出现）', function () {
  var env = createSandbox({ randomFn: mulberry32(0) });
  var draws = collectDraws(env, 200);
  for (var i = 1; i < draws.length; i++) {
    assert.notEqual(draws[i].type, draws[i - 1].type, '第 ' + i + ' 次点击不应该和第 ' + (i - 1) + ' 次点击产出相同的 type（跨 type 袋边界不应相邻重复）');
  }
});

test('洗牌袋契约④：同一 type 内不出现相邻两次同 example（回归钉子：mulberry32(1) 经验证——find 类型若移除"防相邻重复"交换逻辑，300 次点击内必然出现相邻同 example；当前实现下不应出现）', function () {
  var env = createSandbox({ randomFn: mulberry32(1) });
  var prevFindId = null;
  var findCount = 0;
  for (var i = 0; i < 300; i++) {
    env.taskStub.clickQuestion();
    var info = env.TT.getActiveTaskInfo();
    if (info.type === 'find') {
      if (prevFindId !== null) {
        assert.notEqual(info.taskId, prevFindId, 'find 类型连续两次被轮到时不应该抽到同一个 example id（第 ' + findCount + ' 次 find 型抽取附近）');
      }
      prevFindId = info.taskId;
      findCount += 1;
    }
    env.taskStub.dismissActive();
  }
  assert.ok(findCount > 20, '本用例应该产生足够多次 find 型抽取才有意义（实际 ' + findCount + ' 次）');
});

test('洗牌袋契约⑤：同一个 RNG 种子两次独立注入 -> 产生完全一致的抽取序列（可复现性：确定性单测能够断言洗牌袋行为的前提）', function () {
  var env1 = createSandbox({ randomFn: mulberry32(7) });
  var env2 = createSandbox({ randomFn: mulberry32(7) });
  var seq1 = collectDraws(env1, 30);
  var seq2 = collectDraws(env2, 30);
  assert.deepEqual(seq1, seq2, '相同 RNG 种子的两个独立 sandbox 应该产生完全一致的 type+taskId 抽取序列');
});

test('_setRandom：非法参数（非函数）应 console.warn 并忽略，不影响此前已注入的确定性 RNG 继续正常工作（与 _setClock 同款防御式约定）', function () {
  var env = createSandbox({ randomFn: mulberry32(99) });
  var warnCountBefore = env.warnCalls.length;

  assert.doesNotThrow(function () {
    env.TT._setRandom(123);
  }, '_setRandom 传非函数不应该抛错');
  assert.ok(env.warnCalls.length > warnCountBefore, '_setRandom 传非函数应该触发 console.warn');
  assert.ok(env.warnCalls[env.warnCalls.length - 1].indexOf('_setRandom') !== -1, 'warn 消息应该提及 _setRandom');

  // 非法调用不应该破坏此前已注入的确定性 RNG——继续点击问号应该正常工作、不抛错、产出合法任务。
  assert.doesNotThrow(function () {
    env.taskStub.clickQuestion();
  }, '非法 _setRandom 调用之后，问号点击不应该抛错');
  var info = env.TT.getActiveTaskInfo();
  assert.ok(info && typeof info.type === 'string' && typeof info.taskId === 'string', '非法 _setRandom 调用之后，问号点击仍应正常生成任务');
});

// =============================================================================================
// 12. WTJ-20260706-012：find 类型的 target/distractor 改从 secretWords.pool（现场核对 100 词，
// xylophone 已在 011 卡删除，不是 101）任意抽取，取代 12 条精选 example 作为主路径（那 12 条
// 继续作为 manifest 缺失 randomPool 配置/当前生效语言下候选池为空时的回退路径，见
// task-templates.js drawWordCardFind() 说明）。本节覆盖第一阶段 EN 半部分（EN-side 随机
// word-card find driver，commit 1048c0e）；ZH 半部分（word-card 音频、候选池语言交集、
// no-EN-fallback、语言切换）见下方「12b.」一节，两节合起来才是本卡（012）的完整覆盖。
// =============================================================================================

test('WTJ-20260706-012：find 随机 word-card 抽取——每次抽取的 target 与 distractor 均来自 secretWords.pool、互不重复，target+distractor 总数 N 随机落在 randomPool.sampleSize.{min,max}+1 范围内且确实出现不同取值（"扩大随机样本」，不是恒定 3）', function () {
  // 用会真正洗牌的确定性 RNG（而不是默认的 identity 桩），覆盖比"声明顺序退化"更多样的真实抽取组合。
  var env = createSandbox({ randomFn: mulberry32(777) });
  var pool = env.manifest.secretWords.pool;
  var poolSpriteFiles = {};
  var i;
  for (i = 0; i < pool.length; i++) {
    poolSpriteFiles[pool[i].spriteFile] = true;
  }
  var sampleCfg = env.manifest.tasks.templates.find.randomPool.sampleSize;
  var minN = 1 + sampleCfg.min;
  var maxN = 1 + sampleCfg.max;
  var seenNs = {};

  for (var round = 0; round < 30; round++) {
    var info = startTaskOfType(env, 'find');
    var root = getOverlayRoot(env);
    var spriteFiles = [];
    for (var c = 0; c < root.children.length; c++) {
      spriteFiles.push(root.children[c].getAttribute('data-wtj-sprite-file'));
    }
    seenNs[spriteFiles.length] = true;
    assert.ok(spriteFiles.length >= minN && spriteFiles.length <= maxN,
      '第 ' + round + ' 轮：N（target+distractor 总数）应落在 [' + minN + ',' + maxN + ']，实际 ' + spriteFiles.length);

    // 无重复：target 与 distractor 之间、distractor 相互之间都不应该指向同一个 sprite 文件。
    var uniq = {};
    spriteFiles.forEach(function (sf) { uniq[sf] = true; });
    assert.equal(Object.keys(uniq).length, spriteFiles.length, '第 ' + round + ' 轮：target/distractor 之间不应重复');

    // 均来自 pool：每个 sprite 文件都应该能在 secretWords.pool 里找到对应词条。
    spriteFiles.forEach(function (sf) {
      assert.ok(poolSpriteFiles[sf], '第 ' + round + ' 轮：sprite 文件 "' + sf + '" 应该来自 secretWords.pool 词条');
    });

    env.taskStub.dismissActive();
  }

  // "扩大随机样本"核心断言：30 轮里 N 应该确实出现过不止一个取值（不是伪装成 range 校验、实际
  // 恒定不变的固定值）——mulberry32(777) 是真实会变化的确定性 RNG，min~max 跨度为 3，30 轮内
  // 几乎必然覆盖到至少 2 个不同的 N 取值。
  assert.ok(Object.keys(seenNs).length > 1, 'N 应该在多轮抽取中出现不止一个取值，实际只出现过：' + Object.keys(seenNs).join(','));
});

test('WTJ-20260706-012：find 随机 word-card 抽取——identity RNG 下一整袋（100 词）target 抽取顺序应恰好是 secretWords.pool 的声明顺序，无重复无遗漏（whole-bag reachability，与 drawTaskType()/drawExampleIndex() 同一套洗牌袋契约）', function () {
  var env = createSandbox(); // 默认 identity RNG：洗牌退化为声明顺序轮转（见文件头「可注入 RNG」一节）。
  var pool = env.manifest.secretWords.pool;
  var poolLen = pool.length;
  var expectedWords = [];
  var i;
  for (i = 0; i < poolLen; i++) {
    expectedWords.push(pool[i].word);
  }

  var seenTargets = [];
  var guard = 0;
  while (seenTargets.length < poolLen && guard < poolLen * 8) {
    env.taskStub.clickQuestion();
    var info = env.TT.getActiveTaskInfo();
    assert.ok(info, '每次点击问号都应该生成一个进行中任务');
    if (info.type === 'find') {
      var m = /^find-card-([a-z]+)$/.exec(info.taskId);
      assert.ok(m, 'find 类型 synthetic id 应符合 find-card-<word> 形状，实际："' + info.taskId + '"');
      seenTargets.push(m[1]);
    }
    env.taskStub.dismissActive();
    guard += 1;
  }

  assert.equal(seenTargets.length, poolLen, '应该能在合理次数内收集到 ' + poolLen + ' 次 find 抽取');
  assert.deepEqual(seenTargets, expectedWords, 'identity RNG 下一整袋 word-card target 抽取顺序应恰好是 secretWords.pool 的声明顺序（无放回洗牌退化为声明顺序，与 002 卡 type/example 洗牌袋同一退化行为）');
});

test('WTJ-20260706-012：renderFindTask() 任务开始时应调用 WTJ_AUDIO.playWordBilingual()，播放目标词的 EN 语音路径（取自 secretWords.pool[].audioFile），ZH 路径恒传 null（门禁在 011/008，本卡未接线中文半部分）', function () {
  var env = createSandbox();
  var info = startTaskOfType(env, 'find');
  var m = /^find-card-([a-z]+)$/.exec(info.taskId);
  assert.ok(m, 'find synthetic id 应符合 find-card-<word> 形状');
  var word = m[1];
  var pool = env.manifest.secretWords.pool;
  var poolEntry = null;
  for (var i = 0; i < pool.length; i++) {
    if (pool[i].word === word) {
      poolEntry = pool[i];
      break;
    }
  }
  assert.ok(poolEntry, 'synthetic id 里的词应该能在 secretWords.pool 命中');

  assert.equal(env.audioStub.bilingualCalls.length, 1, '任务渲染开始时应恰好调用一次 playWordBilingual');
  var call = env.audioStub.bilingualCalls[0];
  assert.equal(call.word, word, 'playWordBilingual 的 word 应等于目标词');
  assert.equal(call.audioFile, poolEntry.audioFile, 'playWordBilingual 的 audioFile 应等于 secretWords.pool 里对应词条的 EN 路径');
  assert.equal(call.audioFileZh, null, 'ZH 半部分门禁在 011/008，本卡的 synthetic example 恒传 null');
});

test('WTJ-20260706-012：synthetic find example 的 voicePrompt 恒为空字符串（no-silent-fallback：随机词无法预生成"找到 xxx"任务提示句，走 wordCardBilingual 双语词语播放替代）', function () {
  var env = createSandbox();
  var info = startTaskOfType(env, 'find');
  assert.equal(info.taskId.indexOf('find-card-'), 0, '应该是随机 word-card 抽取产出的 synthetic id');
  var taskDef = env.taskStub.startTaskCalls[env.taskStub.startTaskCalls.length - 1];
  assert.equal(taskDef.voicePrompt, '', 'synthetic find example 的 voicePrompt 应恒为空字符串');
});

test('WTJ-20260706-012：manifest.tasks.templates.find.randomPool 缺失/禁用时（向后兼容回退场景），find 任务仍从固定 examples 里抽取，不受随机 word-card 抽取影响（12 条精选 example 保留作为回退路径）', function () {
  var customManifestSrc =
    'window.WTJ_MANIFEST = {' +
    '  secretWords: { pool: [' +
    '    { word: "dog", spriteFile: "sprites/dog.png", audioFile: "audio/words/dog.m4a" },' +
    '    { word: "cat", spriteFile: "sprites/cat.png", audioFile: "audio/words/cat.m4a" }' +
    '  ] },' +
    '  tasks: { templates: {' +
    '    drag: { examples: [{ id: "drag-x", objectSprite: "sprites/apple.png", targetSprite: "sprites/basket.png", voicePrompt: "", successAudio: "" }] },' +
    '    click: { examples: [{ id: "click-x", targetSprite: "sprites/lamp.png", targetSpriteActive: null, voicePrompt: "", successAudio: "" }] },' +
    // 注意：此处的 find 模板故意不带 randomPool 字段——模拟 manifest 缺失该配置的向后兼容场景。
    '    find: { examples: [{ id: "find-x", targetSprite: "sprites/dog.png", distractorSprites: ["sprites/cat.png"], voicePrompt: "", successAudio: "" }] },' +
    '    press: { examples: [{ id: "press-x", targetKey: "A", voicePrompt: "", successAudio: "" }] }' +
    '  } },' +
    '  rewards: { statusLights: { count: 3 } }' +
    '};';
  var env = createSandbox({ manifestOverrideSrc: customManifestSrc });

  var info = startTaskOfType(env, 'find');
  assert.equal(info.taskId, 'find-x', 'randomPool 配置缺失时应该回退到固定 examples 里的唯一一条，而不是随机 word-card 抽取');
  assert.equal(env.audioStub.bilingualCalls.length, 0, '固定 example 没有 wordAudioFile 字段，不应该调用 playWordBilingual');
});

test('WTJ-20260706-012：manifest.tasks.templates.find.randomPool.enabled 显式为 false 时同样回退到固定 examples（不是只看字段是否存在）', function () {
  var customManifestSrc =
    'window.WTJ_MANIFEST = {' +
    '  secretWords: { pool: [' +
    '    { word: "dog", spriteFile: "sprites/dog.png", audioFile: "audio/words/dog.m4a" }' +
    '  ] },' +
    '  tasks: { templates: {' +
    '    drag: { examples: [{ id: "drag-x", objectSprite: "sprites/apple.png", targetSprite: "sprites/basket.png", voicePrompt: "", successAudio: "" }] },' +
    '    click: { examples: [{ id: "click-x", targetSprite: "sprites/lamp.png", targetSpriteActive: null, voicePrompt: "", successAudio: "" }] },' +
    '    find: { examples: [{ id: "find-x", targetSprite: "sprites/dog.png", distractorSprites: [], voicePrompt: "", successAudio: "" }], randomPool: { enabled: false, sampleSize: 2, sourcePool: "secretWords" } },' +
    '    press: { examples: [{ id: "press-x", targetKey: "A", voicePrompt: "", successAudio: "" }] }' +
    '  } },' +
    '  rewards: { statusLights: { count: 3 } }' +
    '};';
  var env = createSandbox({ manifestOverrideSrc: customManifestSrc });

  var info = startTaskOfType(env, 'find');
  assert.equal(info.taskId, 'find-x', 'randomPool.enabled=false 时应该回退到固定 examples，不应该走随机 word-card 抽取');
});

// =============================================================================================
// 12b. WTJ-20260706-012 第二阶段（TL 定案 2026-07-07）：ZH word-card 语言分支。
// 推翻本卡最初"ZH 整句预生成"的口径——ZH 模型改为 word-card：目标词提示音频 = 该词自己已
// 交付的中文词卡音频（audio/words/<word>.zh.m4a，011 卡交付），候选池收窄为
// window.WTJ_VOICE_LANG.isWordZhAvailable() 为真的子集，缺中文音频的词直接排除、不做 EN
// fallback。本节覆盖：①ZH 池非空且随机路径被实际走到（不是静默落到 12 条固定 fallback）；
// ②多轮抽样非固定序列、覆盖多个词；③缺音频的词被排除、从不被选中、也从不落到 EN 音频；
// ④语言切换后同一次会话内使用对应语言的词卡音频。
//
// WTJ-20260707-003 更新：ZH 模式下任务开始播放的语音从"单独念词卡"改为"找到"引导语 + 词卡
// 两段组合（playComposite()，见 task-templates.js playFindWordBilingualDefensive()），下面
// 原有断言相应从 bilingualCalls 改读 compositeCalls（EN 模式不受影响，仍走 bilingualCalls，
// 见「12.」一节 WTJ-20260706-012 的 EN 专属测试与本节末尾语言切换测试的 EN 半段）。
// =============================================================================================

test('WTJ-20260707-003：ZH 模式下候选池收窄为 isWordZhAvailable() 子集，随机路径被实际走到（synthetic find-card- id，不是静默回退到 12 条固定 examples），任务开始播放"找到"引导语 + 该词中文词卡音频两段组合（顺序：引导语在前，词卡在后）；多轮抽样覆盖多个不同词（不是固定序列）', function () {
  // 真实 secretWords.pool（100 词）+ 一个 10 词的 ZH 可用子集（均为真实 pool 声明顺序里的前 10
  // 个词：A 组 4 个 + B 组 4 个 + C 组前 2 个），用会真正洗牌的确定性 RNG 覆盖更多样的组合。
  var zhWords = ['apple', 'ant', 'airplane', 'alligator', 'ball', 'basket', 'bell', 'banana', 'cat', 'car'];
  var env = createSandbox({ randomFn: mulberry32(2026), voiceLang: { lang: 'zh', zhWords: zhWords } });
  var zhWordSet = {};
  zhWords.forEach(function (w) { zhWordSet[w] = true; });

  var seenWords = {};
  for (var round = 0; round < 40; round++) {
    var info = startTaskOfType(env, 'find');
    var m = /^find-card-([a-z]+)$/.exec(info.taskId);
    assert.ok(m, '第 ' + round + ' 轮：ZH 模式下 find 仍应走随机 word-card 抽取（synthetic id），不应静默回退到 12 条固定 examples，实际 taskId="' + info.taskId + '"');
    var word = m[1];
    assert.ok(zhWordSet[word], '第 ' + round + ' 轮：目标词 "' + word + '" 应该来自 ZH 可用子集，不应该抽到子集外的词（no-EN-fallback 候选池收窄）');
    seenWords[word] = true;

    var parts = env.audioStub.compositeCalls[env.audioStub.compositeCalls.length - 1];
    assert.ok(Array.isArray(parts) && parts.length === 2, '第 ' + round + ' 轮：ZH 模式任务开始应恰好调用一次 playComposite，且恰好两段（引导语 + 词卡）');
    assert.equal(parts[0].type, 'phrase', '第 ' + round + ' 轮：第一段应是引导语（phrase）');
    assert.equal(parts[0].path, 'audio/phrases/find.zh.m4a', '第 ' + round + ' 轮：第一段路径应是新交付的"找到"引导语，不是英文 find.m4a');
    assert.equal(parts[1].type, 'word', '第 ' + round + ' 轮：第二段应是目标词词卡（word）');
    assert.equal(parts[1].path, 'audio/words/' + word + '.zh.m4a', '第 ' + round + ' 轮：第二段路径应指向该词自己的中文词卡音频（不是整句、不是英文）');

    assert.equal(env.audioStub.bilingualCalls.length, 0, '第 ' + round + ' 轮：ZH 模式不应该再调用 playWordBilingual（互斥分支，已改走 playComposite）');

    env.taskStub.dismissActive();
  }

  assert.ok(Object.keys(seenWords).length >= 3, '40 轮内应覆盖至少 3 个不同的 ZH 词（不是固定序列/固定一个词），实际覆盖：' + Object.keys(seenWords).join(','));
});

test('WTJ-20260706-012（ZH）：缺中文词卡音频的词被排除出候选池，多轮抽取从不被选中；WTJ-20260707-003：组合播放的词卡段落也从不落到英文音频顶替（no-EN-fallback）', function () {
  var customManifestSrc =
    'window.WTJ_MANIFEST = {' +
    '  secretWords: { pool: [' +
    '    { word: "dog", spriteFile: "sprites/dog.png", audioFile: "audio/words/dog.m4a" },' +
    '    { word: "cat", spriteFile: "sprites/cat.png", audioFile: "audio/words/cat.m4a" },' +
    '    { word: "apple", spriteFile: "sprites/apple.png", audioFile: "audio/words/apple.m4a" },' +
    '    { word: "star", spriteFile: "sprites/star.png", audioFile: "audio/words/star.m4a" }' +
    '  ] },' +
    '  tasks: { templates: {' +
    '    drag: { examples: [{ id: "drag-x", objectSprite: "sprites/apple.png", targetSprite: "sprites/basket.png", voicePrompt: "", successAudio: "" }] },' +
    '    click: { examples: [{ id: "click-x", targetSprite: "sprites/lamp.png", targetSpriteActive: null, voicePrompt: "", successAudio: "" }] },' +
    '    find: { examples: [{ id: "find-legacy", targetSprite: "sprites/dog.png", distractorSprites: ["sprites/cat.png"], voicePrompt: "", successAudio: "" }],' +
    '      randomPool: { enabled: true, sampleSize: 1, sourcePool: "secretWords" } },' +
    '    press: { examples: [{ id: "press-x", targetKey: "A", voicePrompt: "", successAudio: "" }] }' +
    '  } },' +
    '  rewards: { statusLights: { count: 3 } }' +
    '};';
  // 只有 dog/cat 有中文词卡音频；apple/star 没有——ZH 模式下候选池应收窄到只剩 dog/cat。
  var env = createSandbox({ manifestOverrideSrc: customManifestSrc, voiceLang: { lang: 'zh', zhWords: ['dog', 'cat'] } });

  for (var round = 0; round < 12; round++) {
    var info = startTaskOfType(env, 'find');
    var m = /^find-card-([a-z]+)$/.exec(info.taskId);
    assert.ok(m, '第 ' + round + ' 轮：应走随机 word-card 抽取');
    var word = m[1];
    assert.ok(word === 'dog' || word === 'cat', '第 ' + round + ' 轮：目标词应恒为 dog/cat 之一，实际="' + word + '"（apple/star 缺中文音频，绝不应该被选中）');

    var parts = env.audioStub.compositeCalls[env.audioStub.compositeCalls.length - 1];
    var wordPart = parts[1];
    assert.equal(wordPart.path.indexOf('.zh.m4a'), wordPart.path.length - '.zh.m4a'.length, '第 ' + round + ' 轮：词卡段落路径应恒以 .zh.m4a 结尾，绝不应该退化成英文 .m4a（no-EN-fallback）');

    env.taskStub.dismissActive();
  }
});

test('WTJ-20260706-012（ZH）：ZH 可用子集为空（理论边界）时 fail-fast——不静默回退英文，而是 console.error 并整体回退到固定 examples（那 12/N 条本身走语言感知的 voicePrompt，不会漏播成英文）', function () {
  var customManifestSrc =
    'window.WTJ_MANIFEST = {' +
    '  secretWords: { pool: [' +
    '    { word: "dog", spriteFile: "sprites/dog.png", audioFile: "audio/words/dog.m4a" },' +
    '    { word: "cat", spriteFile: "sprites/cat.png", audioFile: "audio/words/cat.m4a" }' +
    '  ] },' +
    '  tasks: { templates: {' +
    '    drag: { examples: [{ id: "drag-x", objectSprite: "sprites/apple.png", targetSprite: "sprites/basket.png", voicePrompt: "", successAudio: "" }] },' +
    '    click: { examples: [{ id: "click-x", targetSprite: "sprites/lamp.png", targetSpriteActive: null, voicePrompt: "", successAudio: "" }] },' +
    '    find: { examples: [{ id: "find-legacy", targetSprite: "sprites/dog.png", distractorSprites: ["sprites/cat.png"], voicePrompt: "", successAudio: "" }],' +
    '      randomPool: { enabled: true, sampleSize: 1, sourcePool: "secretWords" } },' +
    '    press: { examples: [{ id: "press-x", targetKey: "A", voicePrompt: "", successAudio: "" }] }' +
    '  } },' +
    '  rewards: { statusLights: { count: 3 } }' +
    '};';
  // zhWords 为空数组：pool 里的 dog/cat 均无中文词卡音频，ZH 合格候选池应为空集。
  var env = createSandbox({ manifestOverrideSrc: customManifestSrc, voiceLang: { lang: 'zh', zhWords: [] } });

  var info = startTaskOfType(env, 'find');
  assert.equal(info.taskId, 'find-legacy', 'ZH 候选池为空时应整体回退到固定 examples，而不是静默改用英文候选池');
  assert.equal(env.audioStub.bilingualCalls.length, 0, '固定 example 没有 wordAudioFile 字段，不应该调用 playWordBilingual');
  assert.equal(env.audioStub.compositeCalls.length, 0, '固定 example 没有 wordAudioFile/findPrefixAudio 字段，不应该调用 playComposite');
  var sawExpectedError = env.errorCalls.some(function (msg) { return msg.indexOf('no-EN-fallback') !== -1; });
  assert.ok(sawExpectedError, 'ZH 候选池为空应该 console.error 一条包含 no-EN-fallback 字样的诊断，实际 errorCalls：' + JSON.stringify(env.errorCalls));
});

test('WTJ-20260706-012/WTJ-20260707-003（语言切换）：同一次会话内从 en 切到 zh 之后，同一个词的任务开始播放从 EN 单词卡（playWordBilingual）切换为 ZH"找到"+词卡组合（playComposite）', function () {
  var zhWords = ['apple', 'ant', 'airplane', 'alligator', 'ball'];
  var env = createSandbox({ voiceLang: { lang: 'en', zhWords: zhWords } }); // 默认 identity RNG。

  // EN 模式：候选池是真实 secretWords.pool 全量 100 词，identity RNG 下首次抽取恒为 pool[0]
  // ='apple'（与既有"一整袋 100 词声明顺序"测试用例同一退化行为）。EN 模式本卡未改动，仍走
  // playWordBilingual，不应调用 playComposite。
  var infoEn = startTaskOfType(env, 'find');
  var mEn = /^find-card-([a-z]+)$/.exec(infoEn.taskId);
  assert.ok(mEn, 'EN 模式下应走随机 word-card 抽取');
  assert.equal(mEn[1], 'apple', 'identity RNG 下 EN 模式首次抽取应恰为 secretWords.pool[0]=apple');
  var callEn = env.audioStub.bilingualCalls[env.audioStub.bilingualCalls.length - 1];
  assert.equal(callEn.audioFile, 'audio/words/apple.m4a', 'EN 模式下 wordAudioFile 应为英文词卡路径');
  assert.equal(env.audioStub.compositeCalls.length, 0, 'EN 模式不应该调用 playComposite（找到引导语只在 ZH 模式播放）');
  env.taskStub.dismissActive();

  // 切到 zh：候选池收窄为 zhWords 子集，其声明顺序里的第一个同样是 'apple'（zhWords 数组第一项），
  // identity RNG 下 ZH 语言专属的持续洗牌袋（wordCardBagStates.zh，首次使用，从头装袋）同样恰好
  // 抽中 'apple'——同一个词，验证的是"音频路径随语言切换而变"，不是"换了一个不同的词"。
  env.voiceLangStub.setLang('zh');
  var infoZh = startTaskOfType(env, 'find');
  var mZh = /^find-card-([a-z]+)$/.exec(infoZh.taskId);
  assert.ok(mZh, '切到 ZH 模式后应仍走随机 word-card 抽取');
  assert.equal(mZh[1], 'apple', '切到 ZH 后 identity RNG 下应恰为 ZH 候选池声明顺序第一个词=apple（与 EN 模式抽到的是同一个词，突出音频路径随语言切换而变）');
  assert.equal(env.audioStub.bilingualCalls.length, 1, '切到 ZH 后不应再新增 playWordBilingual 调用（仍是 EN 那一次）');
  var partsZh = env.audioStub.compositeCalls[env.audioStub.compositeCalls.length - 1];
  assert.equal(partsZh[0].path, 'audio/phrases/find.zh.m4a', '切到 ZH 后应播放"找到"引导语');
  assert.equal(partsZh[1].path, 'audio/words/apple.zh.m4a', '切到 ZH 后词卡段落应变为对应的中文词卡路径，而不是继续沿用英文路径');
});

test('WTJ-20260707-003（验收标准 4）：ZH 模式下 find 任务完成后，learningWord 强化播放（playLearningWordDefensive）仍恒播英文 audioFile，不受中文设置影响——中文设置只影响任务开始的任务说明音频（找到引导语 + 词卡），不影响完成态反馈', function () {
  var zhWords = ['apple', 'ant', 'airplane', 'alligator', 'ball'];
  var env = createSandbox({ voiceLang: { lang: 'zh', zhWords: zhWords } }); // identity RNG 下首个 ZH 目标恰为 apple。

  var info = startTaskOfType(env, 'find');
  var m = /^find-card-([a-z]+)$/.exec(info.taskId);
  assert.ok(m, 'ZH 模式下应走随机 word-card 抽取');
  assert.equal(m[1], 'apple', 'identity RNG 下 ZH 候选池声明顺序第一个词应为 apple');

  // 任务开始：确认确实走了 ZH 组合分支（找到引导语 + 中文词卡），为下面"完成后仍播英文"的
  // 对比提供前提——如果任务开始阶段本身就没有中文化，完成后的断言就没有意义。
  var startParts = env.audioStub.compositeCalls[env.audioStub.compositeCalls.length - 1];
  assert.equal(startParts[1].path, 'audio/words/apple.zh.m4a', '前提检查：任务开始应播放中文词卡（find.zh + 词卡组合）');

  assert.equal(env.audioStub.wordCalls.length, 0, '完成前不应该有任何 playWord（learningWord）调用');
  completeCurrentTask(env);

  assert.equal(env.audioStub.wordCalls.length, 1, 'find 任务完成后应恰好触发一次 playWord（learningWord 强化播放）');
  var wordCall = env.audioStub.wordCalls[0];
  assert.equal(wordCall.word, 'apple', 'playWord 的 word 应等于目标词');
  assert.equal(wordCall.audioFile, 'audio/words/apple.m4a', 'ZH 设置下完成后 learningWord 播放应恒为英文 audioFile（不是 .zh.m4a），playLearningWordDefensive() 不读取语言设置，直接复用 secretWords.pool 条目的英文 audioFile 字段');
});

// ============================================================================================
// WTJ-20260706-013：task-templates.css 静态契约：prefers-reduced-motion 兜底块内每条规则的
// 选择器都应加 html:not([data-wtj-motion-forced]) 门——kiosk 默认（manifest.performance.
// honorReducedMotion=false）时 index.html 内联启动脚本会给 <html> 打上 data-wtj-motion-forced
// 属性，这条门使整段 reduced-motion 覆盖不生效，任务道具的 emphasize 强调过渡/动画照常播放；
// 只有家长设置把 honorReducedMotion 翻回 true（不打属性）时才恢复 OS reduced-motion 覆盖。
// task-templates.js 本身没有 JS 层的 prefersReducedMotion() 分支（纯 CSS 驱动），因此这是本
// 文件唯一需要为 013 新增的回归护栏。
// ============================================================================================
test('task-templates.css 静态契约：prefers-reduced-motion 兜底块内 .wtj-tt-prop 规则均应加 html:not([data-wtj-motion-forced]) 门', function () {
  var css = readFileSync(TASK_TEMPLATES_CSS_PATH, 'utf8');
  var reducedMotionBlockMatch = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/);
  assert.ok(reducedMotionBlockMatch, 'task-templates.css 应包含 prefers-reduced-motion 的兜底块');
  var blockBody = reducedMotionBlockMatch[1];

  ['.wtj-tt-prop', '.wtj-tt-prop.wtj-tt-emphasize'].forEach(function (selector) {
    var gatedSelector = 'html:not([data-wtj-motion-forced]) ' + selector;
    assert.ok(
      blockBody.indexOf(gatedSelector) !== -1,
      'reduced-motion 兜底块应给 ' + selector + ' 加 html:not([data-wtj-motion-forced]) 门，实际未找到 "' + gatedSelector + '"'
    );
  });

  var bareMatch = blockBody.match(/(^|[,{};]\s*)\.wtj-tt-prop\b/);
  assert.equal(bareMatch, null, '兜底块内不应该存在未加 html:not([data-wtj-motion-forced]) 门的裸 .wtj-tt-prop 选择器，命中：' + (bareMatch && bareMatch[0]));
});
