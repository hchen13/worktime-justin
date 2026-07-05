// WTJ-20260705-018 — keyboard.js / pointer.js 输入抑制门（durable QA asset）
//
// 覆盖验收标准 #5："额度用完 -> 全屏进入安静锁屏/下班状态,普通键盘鼠标不再触发游戏奖励或
// 声音（锁屏覆盖层 + 禁用 app 交互）"在引擎层的落地：keyboard.js 的 onKeyDown 与 pointer.js
// 的 onMouseDown/onMouseUp/onMouseMove/onClickEvent，在
// window.WTJ_PARENT_CONTROLS.isInputSuspended() 返回 true 时必须早退、不触发任何订阅者
// 回调（不计有效键、不生成尾迹/点击反馈、不判定拖拽/命中）。
//
// 与 keyboard-engine.test.mjs / pointer-engine.test.mjs 的关系：两份既有文件完全不提供
// window.WTJ_PARENT_CONTROLS（该 global 在两个引擎文件里都是防御式判断，缺失时短路为
// false），它们的全部既有用例本身就是"模块缺失时行为不变"这条回归线，继续全绿即证明本卡
// 改动没有破坏原有行为。本文件专门补"模块存在时抑制生效/解除后恢复"这条新增覆盖。
//
// Run:  node --test tests/unit/parent-controls-input-gate.test.mjs
//       （或整目录，本机 Node 用 glob 不能裸目录）：node --test 'tests/unit/*.test.mjs'
// Exit: 0 = all assertions passed, 1 = failure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var APP_WEB = path.resolve(__dirname, '../../app/web');
var MANIFEST_SRC = readFileSync(path.join(APP_WEB, 'manifest.js'), 'utf8');
var KEYBOARD_SRC = readFileSync(path.join(APP_WEB, 'keyboard.js'), 'utf8');
var POINTER_SRC = readFileSync(path.join(APP_WEB, 'pointer.js'), 'utf8');

// --- 制造一个可开关的 WTJ_PARENT_CONTROLS 桩：suspended.value 可随时翻转，模拟 shell
//     经 window.wtjSetLockout(true/false) 驱动锁定状态、或设置面板打开/关闭。---
function makeParentControlsStub(initialSuspended) {
  var suspended = !!initialSuspended;
  return {
    api: {
      isInputSuspended: function () { return suspended; },
      isLocked: function () { return suspended; },
      isSettingsPanelOpen: function () { return false; }
    },
    setSuspended: function (v) { suspended = v; }
  };
}

// =====================================================================================
// keyboard.js
// =====================================================================================

function createKeyboardSandbox(parentControlsStub) {
  var keydownHandler = null;
  var fakeWindow = {
    addEventListener: function (type, handler) {
      if (type === 'keydown') keydownHandler = handler;
    },
    removeEventListener: function () {}
  };
  if (parentControlsStub) {
    fakeWindow.WTJ_PARENT_CONTROLS = parentControlsStub.api;
  }
  var sandbox = { window: fakeWindow, console: console };
  vm.createContext(sandbox);
  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  vm.runInContext(KEYBOARD_SRC, sandbox, { filename: 'keyboard.js' });
  assert.equal(typeof keydownHandler, 'function');

  function fire(key) {
    keydownHandler({ key: key, repeat: false });
  }

  return { window: fakeWindow, KEYBOARD: fakeWindow.WTJ_KEYBOARD, fire: fire };
}

test('keyboard.js — isInputSuspended()=true 时，普通字母键完全不触发 onLetter/计有效键', function () {
  var stub = makeParentControlsStub(true);
  var sb = createKeyboardSandbox(stub);
  var letters = [];
  sb.KEYBOARD.onLetter(function (ch) { letters.push(ch); });

  sb.fire('a');
  sb.fire('b');

  assert.equal(letters.length, 0, '抑制期间不应触发任何 onLetter 回调');
  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), 0, '抑制期间不应累计有效键计数');
  console.log('PASS: keyboard.js 在 isInputSuspended()=true 时完全不触发 onLetter/不计有效键。');
});

test('keyboard.js — 抑制解除（isInputSuspended() 变回 false）后恢复正常触发', function () {
  var stub = makeParentControlsStub(true);
  var sb = createKeyboardSandbox(stub);
  var letters = [];
  sb.KEYBOARD.onLetter(function (ch) { letters.push(ch); });

  sb.fire('a'); // 抑制期间，不计入
  assert.equal(letters.length, 0);

  stub.setSuspended(false); // 模拟解锁 / 设置面板关闭
  sb.fire('b');
  assert.equal(letters.length, 1, '解除抑制后应恢复正常触发');
  assert.equal(letters[0], 'B');
  assert.equal(sb.KEYBOARD.getEffectiveKeyCount(), 1);
  console.log('PASS: keyboard.js 抑制解除后立即恢复正常触发（isInputSuspended() 是每次事件动态查询，非加载时快照）。');
});

test('keyboard.js — window.WTJ_PARENT_CONTROLS 缺失时行为不变（回归基线，等价于 keyboard-engine.test.mjs 既有覆盖）', function () {
  var sb = createKeyboardSandbox(null);
  var letters = [];
  sb.KEYBOARD.onLetter(function (ch) { letters.push(ch); });
  sb.fire('a');
  assert.equal(letters.length, 1, 'WTJ_PARENT_CONTROLS 缺失时应短路为「未抑制」，行为与本卡改动前一致');
  console.log('PASS: keyboard.js 在 WTJ_PARENT_CONTROLS 缺失时行为不变，无回归。');
});

// =====================================================================================
// pointer.js
// =====================================================================================

function createPointerSandbox(parentControlsStub) {
  var handlers = {};
  var fakeWindow = {
    addEventListener: function (type, handler) { handlers[type] = handler; },
    removeEventListener: function () {}
  };
  if (parentControlsStub) {
    fakeWindow.WTJ_PARENT_CONTROLS = parentControlsStub.api;
  }
  var sandbox = { window: fakeWindow, console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, Date: Date };
  vm.createContext(sandbox);
  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  vm.runInContext(POINTER_SRC, sandbox, { filename: 'pointer.js' });
  assert.equal(typeof handlers.mousemove, 'function');
  assert.equal(typeof handlers.mousedown, 'function');
  assert.equal(typeof handlers.mouseup, 'function');
  assert.equal(typeof handlers.click, 'function');

  return {
    window: fakeWindow,
    POINTER: fakeWindow.WTJ_POINTER,
    fireMove: function (x, y) { handlers.mousemove({ clientX: x, clientY: y }); },
    fireDown: function (x, y, extra) {
      var evt = { clientX: x, clientY: y, button: 0, preventDefault: function () {} };
      if (extra) for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) evt[k] = extra[k]; }
      handlers.mousedown(evt);
    },
    fireUp: function (x, y, extra) {
      var evt = { clientX: x, clientY: y, button: 0 };
      if (extra) for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) evt[k] = extra[k]; }
      handlers.mouseup(evt);
    },
    fireClick: function (x, y) { handlers.click({ clientX: x, clientY: y }); }
  };
}

test('pointer.js — isInputSuspended()=true 时，move/click 均不触发任何订阅者回调', function () {
  var stub = makeParentControlsStub(true);
  var sb = createPointerSandbox(stub);
  var moveCalls = [];
  var clickCalls = [];
  sb.POINTER.onMove(function (x, y, intensity) { moveCalls.push([x, y, intensity]); });
  sb.POINTER.onClickFeedback(function (x, y, fb) { clickCalls.push([x, y, fb]); });

  sb.fireMove(100, 100);
  sb.fireClick(100, 100);

  assert.equal(moveCalls.length, 0, '抑制期间 onMove 不应触发');
  assert.equal(clickCalls.length, 0, '抑制期间 onClickFeedback 不应触发');
  console.log('PASS: pointer.js 在 isInputSuspended()=true 时 move/click 均不触发任何回调。');
});

test('pointer.js — isInputSuspended()=true 时，拖拽相关（mousedown 命中 draggable target）也不触发 onDragStart', function () {
  var stub = makeParentControlsStub(true);
  var sb = createPointerSandbox(stub);
  var dragStarts = [];
  sb.POINTER.onDragStart(function (payload) { dragStarts.push(payload); });
  sb.POINTER.registerTarget('apple', {
    getBounds: function () { return { x: 0, y: 0, w: 50, h: 50 }; },
    accepts: ['drag'],
    draggable: true
  });

  sb.fireDown(10, 10); // 命中 apple 的 bounds

  assert.equal(dragStarts.length, 0, '抑制期间即便坐标命中 draggable target，也不应触发 onDragStart');
  console.log('PASS: pointer.js 在抑制期间即便命中可拖拽 target 也不会启动拖拽。');
});

test('pointer.js — 抑制解除后恢复正常触发（onMove/onClickFeedback）', function () {
  var stub = makeParentControlsStub(true);
  var sb = createPointerSandbox(stub);
  var moveCalls = [];
  sb.POINTER.onMove(function (x, y, intensity) { moveCalls.push([x, y, intensity]); });

  sb.fireMove(10, 10);
  assert.equal(moveCalls.length, 0);

  stub.setSuspended(false);
  sb.fireMove(20, 20);
  assert.equal(moveCalls.length, 1, '解除抑制后应恢复正常触发');
  console.log('PASS: pointer.js 抑制解除后 onMove 立即恢复正常触发。');
});

test('pointer.js — window.WTJ_PARENT_CONTROLS 缺失时行为不变（回归基线，等价于 pointer-engine.test.mjs 既有覆盖）', function () {
  var sb = createPointerSandbox(null);
  var moveCalls = [];
  sb.POINTER.onMove(function (x, y, intensity) { moveCalls.push([x, y, intensity]); });
  sb.fireMove(5, 5);
  assert.equal(moveCalls.length, 1, 'WTJ_PARENT_CONTROLS 缺失时应短路为「未抑制」，行为与本卡改动前一致');
  console.log('PASS: pointer.js 在 WTJ_PARENT_CONTROLS 缺失时行为不变，无回归。');
});
