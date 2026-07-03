// WTJ-20260704-008 — keyboard.js 单元测试（durable QA asset）
//
// 用 Node 内置 vm 模块搭一个沙箱 context，按 index.html 的真实加载顺序在同一 sandbox 里
// 先加载真实的 app/web/manifest.js（其 IIFE 会 window.WTJ_MANIFEST = deepFreeze(...)），
// 再加载 app/web/keyboard.js（读取 window.WTJ_MANIFEST）——从而让引擎读到产品真实 manifest
// 数值，测试断言也直接取自真实 manifest，彻底消除"手工镜像 manifest 数值"的漂移风险。
// sandbox 里额外提供 stub 的 window.addEventListener（捕获 keydown 处理函数）与
// window.WTJ_HUD.setSlot 打桩，然后通过手动调用捕获到的 keydown 处理函数注入合成事件。
//
// Run:  node --test tests/unit/keyboard-engine.test.mjs
//       （或整目录：node --test tests/unit/）
// Exit: 0 = all assertions passed, 1 = failure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
// 从项目根 tests/unit/ 定位到 app/web/ 下的真实源码。
var MANIFEST_JS_PATH = path.resolve(__dirname, '../../app/web/manifest.js');
var KEYBOARD_JS_PATH = path.resolve(__dirname, '../../app/web/keyboard.js');
var MANIFEST_SRC = readFileSync(MANIFEST_JS_PATH, 'utf8');
var KEYBOARD_SRC = readFileSync(KEYBOARD_JS_PATH, 'utf8');

// 每个测试用例都要一个全新的沙箱（keyboard.js 是 IIFE，模块级状态只在首次执行时初始化一次，
// 不同测试间必须隔离，不能共享 effectiveKeyCount / sameKeyStreak 等闭包状态）。
// 同一 sandbox 内先跑真实 manifest.js（设置 window.WTJ_MANIFEST），再跑 keyboard.js。
function createSandbox(opts) {
  var options = opts || {};
  var keydownHandler = null;
  var hudCalls = [];

  var fakeWindow = {
    addEventListener: function (type, handler) {
      if (type === 'keydown') {
        keydownHandler = handler;
      }
    },
    removeEventListener: function () {}
  };
  if (!options.omitHud) {
    fakeWindow.WTJ_HUD = {
      setSlot: function (index, state) {
        hudCalls.push({ index: index, state: state });
      }
    };
  }

  var sandbox = { window: fakeWindow, console: console };
  vm.createContext(sandbox);

  // 1) 真实 manifest.js —— 挂 window.WTJ_MANIFEST（深冻结的真实产品数值）。
  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  assert.ok(fakeWindow.WTJ_MANIFEST, '加载真实 manifest.js 后 window.WTJ_MANIFEST 应存在');
  // 2) 真实 keyboard.js —— 读上面的 manifest，挂 window.WTJ_KEYBOARD。
  vm.runInContext(KEYBOARD_SRC, sandbox, { filename: 'keyboard.js' });

  assert.equal(typeof keydownHandler, 'function', 'keyboard.js 必须通过 window.addEventListener("keydown", ...) 注册处理函数');
  assert.ok(fakeWindow.WTJ_KEYBOARD, 'keyboard.js 必须挂载 window.WTJ_KEYBOARD');

  function fire(key, extra) {
    var evt = { key: key, repeat: false };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) evt[k] = extra[k];
      }
    }
    keydownHandler(evt);
  }

  return {
    window: fakeWindow,
    manifest: fakeWindow.WTJ_MANIFEST,
    KEYBOARD: fakeWindow.WTJ_KEYBOARD,
    hudCalls: hudCalls,
    fire: fire
  };
}

// 便捷读取真实 manifest 值（测试断言全部以真值为准，不手工镜像）。
function realPauseAfter(sb) { return sb.manifest.keyboard.repeatSameKey.pauseAfterCount; }
function realMilestones(sb) { return sb.manifest.keyboard.effectiveKeyMilestones; }

test('vm 直跑真实 manifest.js：引擎读到的是产品真实数值（pauseAfterCount / effectiveKeyMilestones）', function () {
  var sb = createSandbox();
  // 这条用例本身即证明"vm 直跑真 manifest"落实：sb.manifest 来自真实 manifest.js 执行结果。
  assert.equal(realPauseAfter(sb), 3, '真实 manifest.keyboard.repeatSameKey.pauseAfterCount 应为 3');
  // Array.from 把 vm 沙箱 realm 的数组拷进主 realm（否则 deepStrictEqual 会因 [[Prototype]] 不一致误判）。
  assert.deepEqual(Array.from(realMilestones(sb)), [100, 200], '真实 manifest.keyboard.effectiveKeyMilestones 应为 [100, 200]');
  // 真实 manifest 是深冻结的：确认引擎读的是不可变真值。
  assert.equal(Object.isFrozen(sb.manifest.keyboard.effectiveKeyMilestones), true);
});

test('API 冻结：window.WTJ_KEYBOARD 是 frozen 对象且方法齐全', function () {
  var sb = createSandbox();
  assert.equal(Object.isFrozen(sb.KEYBOARD), true);
  ['onLetter', 'onEffectiveKey', 'onMilestone', 'onFunctionKey', 'getEffectiveKeyCount', 'resetEffectiveKeyCount'].forEach(function (name) {
    assert.equal(typeof sb.KEYBOARD[name], 'function', 'API 缺少方法: ' + name);
  });
  try { sb.KEYBOARD.onLetter = null; } catch (e) { /* 严格模式下抛错也算通过 */ }
  assert.equal(typeof sb.KEYBOARD.onLetter, 'function');
});

test('普通字母：非 repeat 按下即计有效键并触发 onLetter（大写字符）', function () {
  var sb = createSandbox();
  var letters = [];
  var effCounts = [];
  sb.KEYBOARD.onLetter(function (ch) { letters.push(ch); });
  sb.KEYBOARD.onEffectiveKey(function (c) { effCounts.push(c); });

  sb.fire('a');
  sb.fire('5');

  assert.deepEqual(letters, ['A', '5']);
  assert.deepEqual(effCounts, [1, 2]);
  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), 2);
});

test('功能键：不计入有效键计数，不触发 onLetter，触发 onFunctionKey 分类正确（分类来自真实 manifest）', function () {
  var sb = createSandbox();
  var letters = [];
  var funcEvents = [];
  sb.KEYBOARD.onLetter(function (ch) { letters.push(ch); });
  sb.KEYBOARD.onFunctionKey(function (payload) { funcEvents.push(payload); });

  // 断言前置：真实 manifest 的功能键分类确实把 Space/Enter 归 light、Meta/Shift 归 weak。
  var fk = sb.manifest.keyboard.functionKeys;
  assert.ok(fk.lightFeedback.indexOf('Space') !== -1 && fk.lightFeedback.indexOf('Enter') !== -1);
  assert.ok(fk.weakOrNoReward.indexOf('Shift') !== -1 && fk.weakOrNoReward.indexOf('Meta') !== -1);

  sb.fire(' ');       // Space（KeyboardEvent.key 实际值是空格字符）
  sb.fire('Enter');
  sb.fire('Shift');
  sb.fire('Meta');
  sb.fire('ArrowUp'); // 未分类功能键 → 'other'

  assert.deepEqual(letters, []);
  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), 0);
  assert.equal(funcEvents.length, 5);
  assert.equal(funcEvents[0].key, 'Space');
  assert.equal(funcEvents[0].category, 'light');
  assert.equal(funcEvents[1].category, 'light'); // Enter
  assert.equal(funcEvents[2].category, 'weak');  // Shift
  assert.equal(funcEvents[3].category, 'weak');  // Meta
  assert.equal(funcEvents[4].category, 'other'); // ArrowUp
});

test('功能键连打快速衰减：同键连续按下 intensity 单调下降至趋近 0', function () {
  var sb = createSandbox();
  var intensities = [];
  sb.KEYBOARD.onFunctionKey(function (payload) { intensities.push(payload.intensity); });

  sb.fire('Shift');
  sb.fire('Shift');
  sb.fire('Shift');
  sb.fire('Shift');
  sb.fire('Shift');
  sb.fire('Shift');

  assert.equal(intensities.length, 6);
  for (var i = 1; i < intensities.length; i++) {
    assert.ok(intensities[i] <= intensities[i - 1], '强度应单调不增，第 ' + i + ' 次: ' + intensities[i] + ' vs 前一次 ' + intensities[i - 1]);
  }
  assert.ok(intensities[0] > 0);
  assert.equal(intensities[intensities.length - 1], 0, '连续多次同键后应衰减到 0（几乎没有）');
});

test('长按不持续计数（e.repeat=true）：不计数、不触发 onLetter/onFunctionKey', function () {
  var sb = createSandbox();
  var letters = [];
  var funcEvents = [];
  sb.KEYBOARD.onLetter(function (ch) { letters.push(ch); });
  sb.KEYBOARD.onFunctionKey(function (p) { funcEvents.push(p); });

  sb.fire('a', { repeat: true });
  sb.fire(' ', { repeat: true });

  assert.deepEqual(letters, []);
  assert.equal(funcEvents.length, 0);
  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), 0);
});

test('e.repeat 不污染连续同键 streak（强用例）：夹在真实键之间的 repeat 不推进 streak，真实键正确累加到暂停阈值', function () {
  // 阈值 3（真实 manifest）。序列刻意用"真实 a → 一批 a 的 repeat → 3 个真实 a → 第 4 个真实 a"：
  //   若 repeat 会推进 streak，则中间那批 repeat 早已把 streak 顶过阈值，后续真实键会被提前暂停，
  //   有效计数会小于预期；只有当 repeat 完全不推进 streak 时，4 个真实 a 里恰好前 3 个计数、
  //   第 4 个（streak=4 > 3）被暂停，计数停在 3。该序列能区分"repeat 推进 vs 不推进"两种实现。
  var sb = createSandbox();
  var pause = realPauseAfter(sb); // 3
  var letters = [];
  sb.KEYBOARD.onLetter(function (ch) { letters.push(ch); });

  sb.fire('a');                         // 真实 #1，streak=1，计数 → 1
  for (var i = 0; i < 10; i++) {        // 10 个 a 的 repeat：若污染 streak 会一路顶到 11
    sb.fire('a', { repeat: true });
  }
  // 若 repeat 未污染 streak，此刻 streak 仍是 1；接下来的真实 a 应从 streak=2 起继续。
  sb.fire('a');                         // 真实 #2，streak 应为 2（<=3）→ 计数 → 2
  sb.fire('a');                         // 真实 #3，streak 应为 3（<=3）→ 计数 → 3
  sb.fire('a');                         // 真实 #4，streak 应为 4（>3）→ 暂停，不计数

  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), pause, '有效计数应恰好停在阈值 ' + pause + '（证明 repeat 完全没推进 streak）');
  assert.deepEqual(letters, ['A', 'A', 'A'], '只有前 3 个真实键触发 onLetter，第 4 个被暂停；repeat 一个都不触发');
});

test('双写例外：连续 2 次同键（如 pp）正常计数，不被暂停规则误伤', function () {
  var sb = createSandbox();
  var letters = [];
  sb.KEYBOARD.onLetter(function (ch) { letters.push(ch); });

  sb.fire('p');
  sb.fire('p');

  assert.deepEqual(letters, ['P', 'P']);
  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), 2);
});

test('同键连续 >阈值 起暂停计数；换键后重置，切回原键可重新计数（阈值取自真实 manifest）', function () {
  var sb = createSandbox();
  var pause = realPauseAfter(sb); // 3
  var letters = [];
  sb.KEYBOARD.onLetter(function (ch) { letters.push(ch); });

  // 连续 (pause+2) 次同键 'b'：前 pause 次计数，其余暂停。
  for (var i = 0; i < pause + 2; i++) sb.fire('b');
  assert.equal(letters.length, pause, '连续第 ' + (pause + 1) + ' 次起同键应被暂停，不触发 onLetter');
  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), pause);

  // 换键（'c'）：立即重置连续计数，正常计数。
  sb.fire('c');
  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), pause + 1);

  // 切回原键 'b'：因为上一个键是 'c'，视为换键，重新开始计数。
  sb.fire('b');
  sb.fire('b');
  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), pause + 3);
});

test('里程碑精确性：第 99 个有效键时 onMilestone 未触发、HUD 未被调用；第 100 个才触发', function () {
  var sb = createSandbox();
  var milestones = realMilestones(sb); // [100, 200]
  var first = milestones[0];           // 100
  var fired = [];
  sb.KEYBOARD.onMilestone(function (m) { fired.push(m); });

  // 交替按两个不同字母，确保连续同键永远为 1，绝不触发暂停规则，从而干净累计。
  // 先按到 first-1（99）个有效键。
  for (var i = 0; i < first - 1; i++) {
    sb.fire(i % 2 === 0 ? 'a' : 's');
  }
  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), first - 1, '应恰好累计 ' + (first - 1) + ' 个有效键');
  assert.deepEqual(fired, [], '第 ' + (first - 1) + ' 个有效键时 onMilestone 绝不应触发（堵住提前触发实现）');
  assert.equal(sb.hudCalls.length, 0, '第 ' + (first - 1) + ' 个有效键时 WTJ_HUD.setSlot 绝不应被调用');

  // 再按第 first（100）个。
  sb.fire(first % 2 === 0 ? 'a' : 's'); // 第 100 个（索引 99，偶数 → 'a'），换不换键都行，此处保持交替
  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), first);
  assert.deepEqual(fired, [first], '恰好第 ' + first + ' 个有效键才触发里程碑 ' + first);
  assert.equal(sb.hudCalls.length, 1, '第 ' + first + ' 个有效键触发一次 WTJ_HUD.setSlot');
});

test('有效键里程碑：累计 100/200 触发 onMilestone 且调用 WTJ_HUD.setSlot({ milestone: true })', function () {
  var sb = createSandbox();
  var milestones = realMilestones(sb); // [100, 200]
  var fired = [];
  sb.KEYBOARD.onMilestone(function (m) { fired.push(m); });

  var top = milestones[milestones.length - 1]; // 200
  for (var i = 0; i < top; i++) {
    sb.fire(i % 2 === 0 ? 'a' : 's');
  }

  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), top);
  // Array.from：milestones 是 vm 沙箱 realm 数组，fired 是主 realm 数组，用主 realm 拷贝对比。
  assert.deepEqual(fired, Array.from(milestones)); // [100, 200]
  assert.equal(sb.hudCalls.length, milestones.length);
  // 注：sb.hudCalls[n].state 是 vm 沙箱 realm 内创建的对象，与本文件（主 realm）字面量原型不同，
  // deepStrictEqual 会因 [[Prototype]] 不一致误判失败，故逐字段比较。
  assert.equal(sb.hudCalls[0].index, 0);
  assert.equal(sb.hudCalls[0].state.milestone, true);
  assert.equal(sb.hudCalls[1].index, 1);
  assert.equal(sb.hudCalls[1].state.milestone, true);
});

test('里程碑不重复触发：达到 100 后继续按键（未到 200）不会再次触发 100', function () {
  var sb = createSandbox();
  var milestones = realMilestones(sb);
  var first = milestones[0]; // 100
  var fired = [];
  sb.KEYBOARD.onMilestone(function (m) { fired.push(m); });

  for (var i = 0; i < first + 5; i++) {
    sb.fire(i % 2 === 0 ? 'a' : 's');
  }

  assert.deepEqual(fired, [first]);
  assert.equal(sb.hudCalls.length, 1);
});

test('resetEffectiveKeyCount：清零计数与已触发里程碑，允许下一轮重新触发', function () {
  var sb = createSandbox();
  var milestones = realMilestones(sb);
  var first = milestones[0]; // 100
  var fired = [];
  sb.KEYBOARD.onMilestone(function (m) { fired.push(m); });

  for (var i = 0; i < first; i++) {
    sb.fire(i % 2 === 0 ? 'a' : 's');
  }
  assert.deepEqual(fired, [first]);
  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), first);

  sb.KEYBOARD.resetEffectiveKeyCount();
  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), 0);

  for (var j = 0; j < first; j++) {
    sb.fire(j % 2 === 0 ? 'a' : 's');
  }
  assert.deepEqual(fired, [first, first], '重置后应能在新一轮重新触发同一个里程碑');
  assert.equal(sb.hudCalls.length, 2);
});

test('onEffectiveKey：仅统计"有效"键（排除功能键、repeat、暂停期），回调值即累计计数', function () {
  var sb = createSandbox();
  var effCounts = [];
  sb.KEYBOARD.onEffectiveKey(function (c) { effCounts.push(c); });

  sb.fire('a');            // 有效，count=1
  sb.fire('Shift');        // 功能键，不触发 onEffectiveKey
  sb.fire('a', { repeat: true }); // repeat，不触发
  sb.fire('a');             // 有效（上一个键是 Shift，视为换键 → streak 从 1 起），count=2

  assert.deepEqual(effCounts, [1, 2]);
});

test('多订阅者支持：多个回调都会被调用，其中一个抛错不影响其余回调', function () {
  var sb = createSandbox();
  var calledA = false;
  var calledB = false;

  sb.KEYBOARD.onLetter(function () {
    calledA = true;
    throw new Error('订阅回调 A 故意抛错，验证 try/catch 隔离');
  });
  sb.KEYBOARD.onLetter(function () {
    calledB = true;
  });

  assert.doesNotThrow(function () {
    sb.fire('q');
  });
  assert.equal(calledA, true);
  assert.equal(calledB, true);
});

test('WTJ_HUD 缺失时（未加载/加载失败）不抛错：里程碑仍能正常触发 onMilestone', function () {
  var sb = createSandbox({ omitHud: true }); // 故意不提供 window.WTJ_HUD
  var milestones = realMilestones(sb);
  var first = milestones[0]; // 100
  var fired = [];
  sb.KEYBOARD.onMilestone(function (m) { fired.push(m); });

  assert.doesNotThrow(function () {
    for (var i = 0; i < first; i++) {
      sb.fire(i % 2 === 0 ? 'a' : 's');
    }
  });
  assert.deepEqual(fired, [first]);
});
