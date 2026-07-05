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

// --- WTJ_KEYBOARD stub (onLetter 是多订阅者，镜像 keyboard.js 的 addSubscriber 模式) --------
function makeKeyboardStub() {
  var letterHandlers = [];
  return {
    api: {
      onLetter: function (fn) {
        letterHandlers.push(fn);
      }
    },
    pressLetter: function (ch) {
      letterHandlers.forEach(function (fn) { fn(ch); });
    },
    hasHandler: function () {
      return letterHandlers.length > 0;
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
function makeAudioStub() {
  var calls = [];
  return {
    api: {
      playSfx: function (arg) {
        calls.push(arg);
      }
    },
    calls: calls
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

  var fakeWindow = {};
  if (opts.includePointer !== false) fakeWindow.WTJ_POINTER = pointerStub.api;
  if (opts.includeKeyboard !== false) fakeWindow.WTJ_KEYBOARD = keyboardStub.api;
  if (opts.includeHud !== false) fakeWindow.WTJ_HUD = hudStub.api;
  if (opts.includeAudio !== false) fakeWindow.WTJ_AUDIO = audioStub.api;
  if (opts.includeTask !== false) fakeWindow.WTJ_TASK = taskStub.api;
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
    clock: clock,
    warnCalls: warnCalls,
    errorCalls: errorCalls
  };
}

// 反复"点问号 + dismiss跳过"直到轮转命中目标类型（TASK_TYPES 固定顺序 drag/click/find/press，
// 见 task-templates.js 源码 `var TASK_TYPES = ['drag','click','find','press'];`）。返回值是
// sandbox 内构造的跨 realm 对象，调用方只应读取其 .type/.taskId 字段，不要整体 deepEqual。
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
// 用于在 click 类型现在有 lamp/faucet/horse 三个 example 的情况下，精确驱动到某一个具体
// example（而不是像 startTaskOfType 那样只要类型对就返回，拿到的可能是轮转到的第一个 lamp）。
// 轮转周期上限：TASK_TYPES.length(4) * click.examples.length(3) = 12，guard 给到 30 留足余量。
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
  ['getActiveTaskInfo', 'onTaskComplete', '_setClock'].forEach(function (name) {
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

test('问号点击接线：onQuestionClicked 触发 -> 生成 taskDef 并调用 WTJ_TASK.startTask，渲染目标 DOM 并注册 pointer target（首次点击 questionClickCounter=0 恒为 drag 类型）', function () {
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

  assert.equal(env.pointerStub.registerCalls.length, 2, '拖拽任务应注册物体 + 目标两个 pointer target');
  assert.equal(env.docStub.body.children.length, 1, '叠层容器（wtj-tt-root）应懒创建并挂到 document.body 下');
  assert.equal(getOverlayRoot(env).children.length, 2, '拖拽任务应渲染物体 + 目标两个 DOM 叠层元素（挂在 overlay root 下）');
});

// =============================================================================================
// 2b. 任务生成轮转（P1-1 对抗评审修复）：type 内 example 轮转不应该死锁
// =============================================================================================

test('P1-1：type 内 example 轮转不死锁——drag 的 apple-basket/dog-home、press 的 letter-a/digit-3 都应该轮到过（修复前 TASK_TYPES.length=4 与 examples.length=2 同奇偶，会让 drag 恒选 examples[0]、press 恒选 examples[1]，dog-home/press-letter-a 永不可达）', function () {
  var env = createSandbox();
  var seenByType = { drag: {}, click: {}, find: {}, press: {} };

  // TASK_TYPES.length=4，drag/press 的 examples.length=2：一个完整周期是 4*2=8 次点击就足够让
  // 每个类型的每个 example 下标都轮到至少一次（见 task-templates.js「任务生成」一节 P1-1 修法
  // 说明：example 下标 = Math.floor(questionClickCounter / TASK_TYPES.length) % examples.length）。
  // 跑 2 个周期（16 次）留出余量。
  for (var i = 0; i < 16; i++) {
    env.taskStub.clickQuestion();
    var info = env.TT.getActiveTaskInfo();
    assert.ok(info, '每次点击问号都应该生成一个进行中任务');
    seenByType[info.type][info.taskId] = true;
    env.taskStub.dismissActive();
  }

  assert.deepEqual(
    Object.keys(seenByType.drag).sort(),
    ['drag-apple-to-basket', 'drag-dog-home'],
    '拖拽类型应该轮到过 apple-to-basket 和 dog-home 两个 example（验收标准"狗回家"必须可达）'
  );
  assert.deepEqual(
    Object.keys(seenByType.press).sort(),
    ['press-digit-3', 'press-letter-a'],
    '按键类型应该轮到过 letter-a 和 digit-3 两个 example'
  );
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
  assert.equal(getOverlayRoot(env).children.length, 2, '完成瞬间叠层 DOM 应仍然存在（延迟移除，尚未到期）');

  // 迟到的重复 onDrop（例如残留的异步回调）不应二次触发 completeTask（activeRuntime 已清空的 guard）。
  targetCall.config.onDrop();
  assert.equal(env.taskStub.completeTaskCalls.length, 1, '重复 onDrop 不应二次触发 completeTask');

  // 快进假时钟约 800ms：延迟移除的定时器到期，DOM 叠层才真正被摘除。
  env.clock.advance(800);
  assert.equal(getOverlayRoot(env).children.length, 0, '快进 ~800ms 后叠层 DOM 才应被移除');
});

// =============================================================================================
// 3b. 拖拽跟随视觉（P1-2 对抗评审修复）：订阅 WTJ_POINTER.onDragMove/onDrop 渲染拖拽视觉
// =============================================================================================

test('P1-2：订阅 WTJ_POINTER.onDragMove/onDrop；拖拽中 followX/followY 更新被拖元素 style.left/top；dropCancel 把元素复位到初始位置', function () {
  var env = createSandbox();
  assert.equal(env.pointerStub.hasDragMoveHandler(), true, 'task-templates.js 应订阅 WTJ_POINTER.onDragMove（POINTER-API.md「9. 各消费卡怎么用」表格明确分派给 014）');
  assert.equal(env.pointerStub.hasDropHandler(), true, 'task-templates.js 应订阅 WTJ_POINTER.onDrop（用于渲染 dropCancel 拖错弹回视觉）');

  env.taskStub.clickQuestion(); // counter=0 -> drag
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
  assert.equal(activePlay.opts.loop, false, 'active 态应强制 loop:false（即使某个 prop 的源数据 loop 为 true 也不例外，如 faucet 的 running）');
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
  assert.equal(String(el.tagName).toLowerCase(), 'img', '引擎缺失时应回退静态 <img>（door/bell 恒定走这条路径，此处验证"引擎整体缺失"这个更极端的场景）');
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
  env.taskStub.clickQuestion(); // counter=0 -> drag（apple/basket）
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

test('072：click 类型三个 example（lamp/faucet/horse）在轮转中都应该被生成到过（修复前 manifest.js click.examples 只有 lamp 一条，faucet/horse 恒不可达）', function () {
  var env = createSandbox();
  var seenClickIds = {};

  // TASK_TYPES.length=4，click.examples.length=3：一个完整周期是 4*3=12 次点击就足够让三个
  // example 下标都轮到至少一次（与 P1-1 测试同一推导：example 下标 =
  // Math.floor(questionClickCounter / TASK_TYPES.length) % examples.length）。跑 2 个周期
  // （24 次）留出余量。
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
    ['click-faucet-on', 'click-horse-run', 'click-lamp-on'],
    '三个 click example 都应该被轮到过（faucet/horse 此前因 manifest 缺条目从未被生成，验收标准要求两者都可达）'
  );
});

test('072：faucet 点击任务端到端——轮转可达 click-faucet-on，渲染时播放 idle(off,loop:true)，onClick 命中后播放 active(running,loop:false) 并 completeTask', function () {
  var env = createSandbox();
  var info = startTaskWithId(env, 'click', 'click-faucet-on');

  var targetId = 'wtj-tt-click-target-' + info.taskId;
  var targetCall = findRegisterCallById(env, targetId);
  assertArrayEqual(targetCall.config.accepts, ['click']);

  var el = targetCall.config.el;
  assert.equal(String(el.tagName).toLowerCase(), 'canvas', 'faucet 是已接入引擎的三个道具之一，应挂载 <canvas> 而不是 <img>');
  assert.equal(el.getAttribute('data-anim-state'), 'idle', 'faucet 道具初始应为 idle');

  var idlePlay = env.frameAnimStub.lastPlayForCanvas(el);
  assert.ok(idlePlay, '创建时应该调用过一次 WTJ_FRAME_ANIM.play() 播放 idle 态');
  assert.equal(idlePlay.prop, 'faucet', 'faucet 应映射到 prop "faucet"（PROP_ANIM_STATE_MAP）');
  assert.equal(idlePlay.state, 'off', 'faucet 的 idle 态应映射到 anim-manifest 的 "off" state');
  assert.equal(idlePlay.opts.loop, true, 'idle 态应强制 loop:true');

  assert.equal(env.taskStub.completeTaskCalls.length, 0, '未点击前不应完成');
  targetCall.config.onClick();

  assert.equal(env.taskStub.completeTaskCalls.length, 1);
  assert.equal(env.taskStub.completeTaskCalls[0].type, 'click');
  assert.equal(env.taskStub.completeTaskCalls[0].taskId, 'click-faucet-on');

  assert.equal(el.getAttribute('data-anim-state'), 'active', '点击命中后应把 data-anim-state 切到 active');
  var activePlay = env.frameAnimStub.lastPlayForCanvas(el);
  assert.equal(activePlay.prop, 'faucet');
  assert.equal(activePlay.state, 'running', 'faucet 的 active 态应映射到 anim-manifest 的 "running" state');
  assert.equal(activePlay.opts.loop, false, 'active 态应强制 loop:false（即使 running 源数据本身 loop:true）');
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
  assert.equal(activePlay.opts.loop, false, 'active 态应强制 loop:false（即使 run 源数据本身 loop:true，与 faucet 的 running 同构）');
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

  // 真实 manifest find-the-dog 示例：1 个目标 + 2 个干扰项（cat/ball），干扰项不注册 pointer target。
  assert.equal(getOverlayRoot(env).children.length, 3, '应渲染 1 个目标 + 2 个干扰项');
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
  assert.ok(distractorEls.length > 0, '真实 manifest find-the-dog 示例应该有至少一个干扰项，本测试才有意义');

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

// =============================================================================================
// 7. 完成 -> WTJ_HUD.setStatusLight / WTJ_AUDIO.playSfx（REQ-RWD-04，防御式）
// =============================================================================================

test('完成任务后防御式点亮 WTJ_HUD 状态灯（真实 manifest count=3，按顺序轮转 0,1,2,0）并尝试播放 successAudio', function () {
  var env = createSandbox();
  assert.equal(env.manifest.rewards.statusLights.count, 3);

  var expectedLightSeq = [0, 1, 2, 0]; // drag/click/find/press 依次完成，四类任务恰好按 TASK_TYPES 顺序轮转一整圈
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
  var env = createSandbox();
  var received = [];
  env.TT.onTaskComplete(function (payload) { received.push(payload); });

  env.taskStub.clickQuestion(); // counter=0 -> drag
  completeCurrentTask(env);

  env.taskStub.clickQuestion(); // counter=1 -> click
  completeCurrentTask(env);

  env.taskStub.clickQuestion(); // counter=2 -> find
  completeCurrentTask(env);

  env.taskStub.clickQuestion(); // counter=3 -> press
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
