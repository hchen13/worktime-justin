// WTJ-20260704-010 — slots.js 单元测试（durable QA asset）
//
// 用 Node 内置 vm 模块搭一个沙箱 context，按 index.html 的真实加载顺序在同一 sandbox 里
// 先加载真实的 app/web/manifest.js（其 IIFE 会 window.WTJ_MANIFEST = deepFreeze(...)），
// 再加载真实的 app/web/slots.js（读取 window.WTJ_MANIFEST）——从而让引擎读到产品真实 manifest
// 数值（slots.count / slots.sources），断言也直接取自真实 manifest，消除"手工镜像"漂移风险。
//
// 本文件分两大部分：
//   第 1 部分（0~12）：slots.js 自身的状态机行为——fillSlot 去重/满槽/reset 契约、API 冻结、
//     防御式降级、重复引入守卫。
//   第 2 部分（13~16）：009（secretword.js）/ 008（keyboard.js）窄改后的"委托 WTJ_SLOTS.fillSlot
//     / fallback 直连 WTJ_HUD.setSlot"两条路径各自按预期工作——证明窄改落地正确，且 fallback
//     路径与两卡各自现有单测（keyboard-engine.test.mjs / secretword-engine.test.mjs）覆盖的
//     行为一致（那两个文件的沙箱不提供 window.WTJ_SLOTS，跑的正是 fallback 分支）。
//
// Run:  node --test tests/unit/slots-engine.test.mjs
//       （或整套件：node --test 'tests/unit/*.test.mjs'）
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
var SLOTS_JS_PATH = path.resolve(__dirname, '../../app/web/slots.js');
var SECRETWORD_JS_PATH = path.resolve(__dirname, '../../app/web/secretword.js');
var KEYBOARD_JS_PATH = path.resolve(__dirname, '../../app/web/keyboard.js');

var MANIFEST_SRC = readFileSync(MANIFEST_JS_PATH, 'utf8');
var SLOTS_SRC = readFileSync(SLOTS_JS_PATH, 'utf8');
var SECRETWORD_SRC = readFileSync(SECRETWORD_JS_PATH, 'utf8');
var KEYBOARD_SRC = readFileSync(KEYBOARD_JS_PATH, 'utf8');

// =====================================================================
// 第 1 部分：slots.js 自身状态机 —— 沙箱搭建
// =====================================================================

// 每个用例一个全新 sandbox（slots.js 是 IIFE，模块级状态只在首次执行时初始化一次，不同用例间
// 必须隔离，不能共享内部 slots[] / everFullEmittedForCurrentRound 等闭包状态）。
function createSlotsSandbox(opts) {
  var options = opts || {};
  var hudSetSlotCalls = [];
  var hudClearSlotsCalls = 0;
  var secretResetRoundCalls = 0;
  var keyboardResetCalls = 0;

  var fakeWindow = {};

  if (!options.omitHud) {
    fakeWindow.WTJ_HUD = {};
    if (!options.omitHudSetSlot) {
      fakeWindow.WTJ_HUD.setSlot = function (index, state) {
        hudSetSlotCalls.push({ index: index, state: state });
      };
    }
    if (!options.omitHudClearSlots) {
      fakeWindow.WTJ_HUD.clearSlots = function () {
        hudClearSlotsCalls += 1;
      };
    }
  }
  if (!options.omitSecret) {
    fakeWindow.WTJ_SECRET = {
      resetRound: function () { secretResetRoundCalls += 1; }
    };
  }
  if (!options.omitKeyboardApi) {
    fakeWindow.WTJ_KEYBOARD = {
      resetEffectiveKeyCount: function () { keyboardResetCalls += 1; }
    };
  }

  var sandbox = { window: fakeWindow, console: console };
  vm.createContext(sandbox);

  if (options.manifestObject) {
    fakeWindow.WTJ_MANIFEST = options.manifestObject;
  } else {
    vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
    assert.ok(fakeWindow.WTJ_MANIFEST, '加载真实 manifest.js 后 window.WTJ_MANIFEST 应存在');
  }

  vm.runInContext(SLOTS_SRC, sandbox, { filename: 'slots.js' });
  assert.ok(fakeWindow.WTJ_SLOTS, 'slots.js 必须挂载 window.WTJ_SLOTS');

  return {
    sandbox: sandbox,
    window: fakeWindow,
    manifest: fakeWindow.WTJ_MANIFEST,
    SLOTS: fakeWindow.WTJ_SLOTS,
    hudSetSlotCalls: hudSetSlotCalls,
    getHudClearSlotsCalls: function () { return hudClearSlotsCalls; },
    getSecretResetRoundCalls: function () { return secretResetRoundCalls; },
    getKeyboardResetCalls: function () { return keyboardResetCalls; },
    reloadSlots: function () {
      vm.runInContext(SLOTS_SRC, sandbox, { filename: 'slots.js' });
    }
  };
}

function realSlotCount(sb) { return sb.manifest.slots.count; }
function realSources(sb) { return sb.manifest.slots.sources; }

// =====================================================================
// 0. vm 直跑真实 manifest：引擎读到产品真实数值
// =====================================================================
test('0. vm 直跑真实 manifest.js：引擎读到的是产品真实数值（slots.count=5, sources=[secret-word, keyboard-milestone]）', function () {
  var sb = createSlotsSandbox();
  assert.equal(realSlotCount(sb), 5, '真实 manifest.slots.count 应为 5');
  assert.deepEqual(Array.from(realSources(sb)), ['secret-word', 'keyboard-milestone']);
  assert.equal(Object.isFrozen(sb.manifest.slots), true, '真实 manifest 是深冻结的');
  console.log('PASS 0: 真实 manifest.slots 数值核对通过。');
});

// =====================================================================
// 1. API 冻结 + 绑定加固 + 方法齐全
// =====================================================================
test('1. API 冻结 + 绑定不可写 + 方法齐全（fillSlot/clearSlots/reset/getSlots/onFull/getState）', function () {
  var sb = createSlotsSandbox();
  assert.equal(Object.isFrozen(sb.SLOTS), true, 'window.WTJ_SLOTS 必须 Object.freeze');
  ['fillSlot', 'clearSlots', 'reset', 'getSlots', 'onFull', 'getState'].forEach(function (name) {
    assert.equal(typeof sb.SLOTS[name], 'function', 'API 缺少方法: ' + name);
  });
  var desc = Object.getOwnPropertyDescriptor(sb.window, 'WTJ_SLOTS');
  assert.equal(desc.writable, false, 'window.WTJ_SLOTS 绑定必须 writable:false');
  assert.equal(desc.configurable, false, 'window.WTJ_SLOTS 绑定必须 configurable:false');
  var original = sb.SLOTS;
  try { sb.window.WTJ_SLOTS = { fake: true }; } catch (e) { /* 严格模式抛错也算通过 */ }
  assert.equal(sb.window.WTJ_SLOTS, original, '绑定不可被整体重赋值换掉');
  console.log('PASS 1: API 冻结、绑定不可写/不可重配置、方法齐全。');
});

// =====================================================================
// 2. 五槽数量固定（验收 1 / REQ-SLOT-01）
// =====================================================================
test('2. 五槽数量固定为 5（验收 1）：getState().slotCount / getSlots().length 均为真实 manifest 的 count', function () {
  var sb = createSlotsSandbox();
  var count = realSlotCount(sb);
  assert.equal(sb.SLOTS.getState().slotCount, count);
  assert.equal(sb.SLOTS.getSlots().length, count);
  console.log('PASS 2: 五槽数量固定为 ' + count + '。');
});

// =====================================================================
// 3. 两个来源均可点亮槽（验收 2）
// =====================================================================
test('3. 秘密词对象和键盘里程碑均可点亮槽（验收 2）：两种 source 各自 fillSlot 成功，各占一槽', function () {
  var sb = createSlotsSandbox();

  var r1 = sb.SLOTS.fillSlot('secret-word', { itemKey: 'dog', renderState: { spriteUrl: 'assets/sprites/dog.png' } });
  assert.equal(r1.filled, true);
  assert.equal(r1.slotIndex, 0);
  assert.equal(r1.duplicate, false);
  assert.equal(r1.full, false);

  var r2 = sb.SLOTS.fillSlot('keyboard-milestone', { itemKey: 100, renderState: { milestone: true } });
  assert.equal(r2.filled, true);
  assert.equal(r2.slotIndex, 1);
  assert.equal(r2.duplicate, false);
  assert.equal(r2.full, false);

  assert.equal(sb.hudSetSlotCalls.length, 2);
  assert.equal(sb.hudSetSlotCalls[0].index, 0);
  assert.equal(sb.hudSetSlotCalls[0].state.spriteUrl, 'assets/sprites/dog.png');
  assert.equal(sb.hudSetSlotCalls[1].index, 1);
  assert.equal(sb.hudSetSlotCalls[1].state.milestone, true);

  var slots = sb.SLOTS.getSlots();
  assert.equal(slots[0].source, 'secret-word');
  assert.equal(slots[0].itemKey, 'dog');
  assert.equal(slots[1].source, 'keyboard-milestone');
  assert.equal(slots[1].itemKey, 100);
  console.log('PASS 3: secret-word 与 keyboard-milestone 各自 fillSlot 成功，各占一槽，WTJ_HUD.setSlot 被相应调用。');
});

// =====================================================================
// 4. 当前五格内不重复（验收 3 / REQ-SLOT-01 / REQ-SEC-07）
// =====================================================================
test('4. 当前五格内不重复（验收 3）：同 source+itemKey 二次 fillSlot 返回 duplicate:true，不占新槽、不再调用 WTJ_HUD.setSlot', function () {
  var sb = createSlotsSandbox();

  var r1 = sb.SLOTS.fillSlot('secret-word', { itemKey: 'dog', renderState: { spriteUrl: 'assets/sprites/dog.png' } });
  assert.equal(r1.filled, true);
  assert.equal(sb.hudSetSlotCalls.length, 1);

  var r2 = sb.SLOTS.fillSlot('secret-word', { itemKey: 'dog', renderState: { spriteUrl: 'assets/sprites/dog.png' } });
  assert.equal(r2.filled, false, '同词重复不应新占槽');
  assert.equal(r2.slotIndex, null);
  assert.equal(r2.duplicate, true, '应识别为重复');
  assert.equal(sb.hudSetSlotCalls.length, 1, '重复命中不应再调用一次 WTJ_HUD.setSlot');

  // 不同 itemKey（cat）与不同 source 但相同 itemKey 名义字符串，均不算重复。
  var r3 = sb.SLOTS.fillSlot('secret-word', { itemKey: 'cat', renderState: { spriteUrl: 'assets/sprites/cat.png' } });
  assert.equal(r3.filled, true);
  assert.equal(r3.slotIndex, 1);

  assert.equal(sb.SLOTS.getSlots().filter(function (s) { return s !== null; }).length, 2);
  console.log('PASS 4: 同 source+itemKey 重复不占新槽、不重复调用 HUD；不同 itemKey 正常各占一槽。');
});

test('4b. 不同来源即使 itemKey 的字符串形式相同也不算重复（source 参与去重判断）', function () {
  var sb = createSlotsSandbox();
  var r1 = sb.SLOTS.fillSlot('secret-word', { itemKey: '100', renderState: { spriteUrl: 'x.png' } });
  var r2 = sb.SLOTS.fillSlot('keyboard-milestone', { itemKey: 100, renderState: { milestone: true } });
  assert.equal(r1.filled, true);
  assert.equal(r2.filled, true, '不同 source 即使 itemKey 字符串形式相同（"100" vs 100）也不是重复');
  assert.equal(r2.duplicate, false);
  console.log('PASS 4b: source 参与去重比较，不同来源不会被误判为同一发现。');
});

// =====================================================================
// 5. 满 5 槽触发 onFull（验收 5 / REQ-SLOT-02 / REQ-RWD-02），且五槽保持已点亮直到 reset()
// =====================================================================
test('5. 满 5 槽 emit onFull 恰好一次（验收 5）：五槽保持已点亮，继续 fillSlot 新发现返回 filled:false/full:true，不覆盖已有槽', function () {
  var sb = createSlotsSandbox();
  var fullEvents = [];
  sb.SLOTS.onFull(function (snapshot) { fullEvents.push(snapshot); });

  var items = [
    ['secret-word', 'dog'],
    ['secret-word', 'cat'],
    ['keyboard-milestone', 100],
    ['keyboard-milestone', 200],
    ['secret-word', 'apple']
  ];
  var results = [];
  items.forEach(function (pair) {
    results.push(sb.SLOTS.fillSlot(pair[0], { itemKey: pair[1], renderState: { spriteUrl: 'x' } }));
  });

  for (var i = 0; i < 4; i++) {
    assert.equal(results[i].filled, true, '第 ' + (i + 1) + ' 次应成功占槽');
    assert.equal(results[i].full, false, '前 4 次不应已满');
  }
  assert.equal(results[4].filled, true, '第 5 次应成功占槽');
  assert.equal(results[4].full, true, '第 5 次占满后 full 应为 true');

  assert.equal(fullEvents.length, 1, 'onFull 应恰好被 emit 一次');
  assert.equal(fullEvents[0].full, true);
  assert.equal(fullEvents[0].slots.filter(function (s) { return s !== null; }).length, 5);

  // 继续 fillSlot 一个全新发现：无处可放，不覆盖已有槽，也不重复 emit onFull。
  var overflow = sb.SLOTS.fillSlot('secret-word', { itemKey: 'ball', renderState: { spriteUrl: 'y' } });
  assert.equal(overflow.filled, false);
  assert.equal(overflow.slotIndex, null);
  assert.equal(overflow.duplicate, false);
  assert.equal(overflow.full, true);
  assert.equal(fullEvents.length, 1, '满槽后继续 fillSlot 新发现不应再次 emit onFull');

  var slotsSnapshot = sb.SLOTS.getSlots();
  assert.equal(slotsSnapshot[0].itemKey, 'dog', '五槽保持已点亮的内容，未被 overflow 覆盖');
  assert.equal(sb.hudSetSlotCalls.length, 5, 'WTJ_HUD.setSlot 只应被真正占槽的 5 次调用调用，overflow 不再调用');
  console.log('PASS 5: 满 5 槽时 onFull 恰好触发一次，五槽保持点亮直到 reset()，溢出的新发现不占位、不重复触发。');
});

test('5b. 满槽后传入 duplicate 项（非新项）也不重复 emit onFull（P2-4）', function () {
  var sb = createSlotsSandbox();
  var fullEvents = [];
  sb.SLOTS.onFull(function (snapshot) { fullEvents.push(snapshot); });

  ['dog', 'cat', 'apple', 'ball', 'star'].forEach(function (w) {
    sb.SLOTS.fillSlot('secret-word', { itemKey: w, renderState: { spriteUrl: w + '.png' } });
  });
  assert.equal(fullEvents.length, 1, '填满后 onFull 应恰好触发一次');

  // 满槽后再次传入一个"当前 5 格内已存在"的项（dog）：应识别为 duplicate，不占槽、不重复 emit。
  var dup = sb.SLOTS.fillSlot('secret-word', { itemKey: 'dog', renderState: { spriteUrl: 'dog.png' } });
  assert.equal(dup.filled, false);
  assert.equal(dup.duplicate, true, '满槽状态下的重复项应返回 duplicate:true');
  assert.equal(dup.full, true);
  assert.equal(fullEvents.length, 1, '满槽后传入 duplicate 项不应再次 emit onFull');
  assert.equal(sb.hudSetSlotCalls.length, 5, 'duplicate 项不应再调用 WTJ_HUD.setSlot');
  console.log('PASS 5b: 满槽后传入 duplicate 项（非溢出新项）同样不重复 emit onFull，不占槽（P2-4 补覆盖）。');
});

test('5c. 多个 onFull 订阅者：前一个抛错不阻断后一个（emit 的 try/catch 隔离，P2-4）', function () {
  var sb = createSlotsSandbox();
  var calledA = false;
  var calledB = false;
  sb.SLOTS.onFull(function () { calledA = true; throw new Error('onFull 订阅者 A 故意抛错，验证 try/catch 隔离'); });
  sb.SLOTS.onFull(function () { calledB = true; });

  assert.doesNotThrow(function () {
    ['dog', 'cat', 'apple', 'ball', 'star'].forEach(function (w) {
      sb.SLOTS.fillSlot('secret-word', { itemKey: w, renderState: { spriteUrl: w + '.png' } });
    });
  }, '某个 onFull 订阅者抛错不应让 fillSlot 抛出');
  assert.equal(calledA, true, '订阅者 A 应被调用');
  assert.equal(calledB, true, '前一个订阅者抛错后，后一个订阅者仍应被调用（try/catch 隔离）');
  console.log('PASS 5c: 多 onFull 订阅者逐个 try/catch 隔离，一个抛错不影响其余（P2-4 补覆盖 emit catch 分支）。');
});

// =====================================================================
// 6. reset()：满槽后清空 + 开新一轮（验收 5 契约 + REQ-SLOT-02 resetsSlotsAfter）
// =====================================================================
test('6. reset()：清空 5 槽 + 调用 WTJ_HUD.clearSlots() + 防御式通知 WTJ_SECRET.resetRound() / WTJ_KEYBOARD.resetEffectiveKeyCount()；重置后可再次填槽并再次 emit onFull', function () {
  var sb = createSlotsSandbox();
  var fullEvents = [];
  sb.SLOTS.onFull(function (snapshot) { fullEvents.push(snapshot); });

  ['dog', 'cat', 'apple', 'ball', 'star'].forEach(function (w, i) {
    sb.SLOTS.fillSlot('secret-word', { itemKey: w, renderState: { spriteUrl: w + '.png' } });
  });
  assert.equal(fullEvents.length, 1);
  assert.equal(sb.getHudClearSlotsCalls(), 0);

  sb.SLOTS.reset();

  assert.equal(sb.getHudClearSlotsCalls(), 1, 'reset() 应调用一次 WTJ_HUD.clearSlots()');
  assert.equal(sb.getSecretResetRoundCalls(), 1, 'reset() 应防御式调用一次 WTJ_SECRET.resetRound()');
  assert.equal(sb.getKeyboardResetCalls(), 1, 'reset() 应防御式调用一次 WTJ_KEYBOARD.resetEffectiveKeyCount()');
  // Array.from：getSlots() 返回 vm 沙箱 realm 的数组，与主 realm 字面量原型不同，deepStrictEqual
  // 会因 [[Prototype]] 不一致误判，先拷进主 realm 再比对（同 keyboard/secretword 测试手法）。
  assert.deepEqual(Array.from(sb.SLOTS.getSlots()), [null, null, null, null, null], 'reset() 后内部 5 槽应全部清空');
  assert.equal(sb.SLOTS.getState().full, false);

  // 新一轮：之前已经"用过"的 itemKey（dog）现在应能重新占槽（因为内部去重表已清空）。
  var r = sb.SLOTS.fillSlot('secret-word', { itemKey: 'dog', renderState: { spriteUrl: 'dog.png' } });
  assert.equal(r.filled, true);
  assert.equal(r.slotIndex, 0, '新一轮从槽 0 重新开始');
  assert.equal(r.duplicate, false, '清空后的新一轮，同一个词不再被判定为重复');

  // 再次填满 5 槽，应再次 emit onFull（第 2 次，不是被"用完"的一次性事件）。
  ['cat', 'apple', 'ball', 'star'].forEach(function (w) {
    sb.SLOTS.fillSlot('secret-word', { itemKey: w, renderState: { spriteUrl: w + '.png' } });
  });
  assert.equal(fullEvents.length, 2, 'reset() 开新一轮后再次填满应再次 emit onFull');
  console.log('PASS 6: reset() 清空槽位、防御式通知 009/008，且新一轮可重新触发 onFull。');
});

// =====================================================================
// 7. clearSlots()：只清视觉与内部占用状态，不触碰 009/008 轮次状态
// =====================================================================
test('7. clearSlots()：清空 5 槽 + 调 WTJ_HUD.clearSlots()，但不调用 WTJ_SECRET.resetRound() / WTJ_KEYBOARD.resetEffectiveKeyCount()', function () {
  var sb = createSlotsSandbox();
  sb.SLOTS.fillSlot('secret-word', { itemKey: 'dog', renderState: { spriteUrl: 'dog.png' } });

  sb.SLOTS.clearSlots();

  assert.equal(sb.getHudClearSlotsCalls(), 1);
  assert.equal(sb.getSecretResetRoundCalls(), 0, 'clearSlots() 不应触碰 009 的轮次状态');
  assert.equal(sb.getKeyboardResetCalls(), 0, 'clearSlots() 不应触碰 008 的轮次状态');
  assert.deepEqual(Array.from(sb.SLOTS.getSlots()), [null, null, null, null, null]);
  console.log('PASS 7: clearSlots() 只清视觉与内部状态，不通知 009/008（与 reset() 行为区分开）。');
});

// =====================================================================
// 8. WTJ_HUD 缺失/方法不全时防御式：不抛错，内部状态与 onFull 仍正常工作
// =====================================================================
test('8a. WTJ_HUD 整体缺失：fillSlot/reset 不抛错，内部状态与 onFull 仍正常', function () {
  var sb = createSlotsSandbox({ omitHud: true });
  var fired = [];
  sb.SLOTS.onFull(function (s) { fired.push(s); });

  assert.doesNotThrow(function () {
    ['dog', 'cat', 'apple', 'ball', 'star'].forEach(function (w) {
      sb.SLOTS.fillSlot('secret-word', { itemKey: w, renderState: { spriteUrl: w + '.png' } });
    });
  });
  assert.equal(fired.length, 1, 'WTJ_HUD 缺失不影响 onFull 判定');
  assert.doesNotThrow(function () { sb.SLOTS.reset(); });
  console.log('PASS 8a: WTJ_HUD 整体缺失时不抛错，内部去重/满槽判定/onFull 均正常。');
});

test('8b. WTJ_HUD 缺 clearSlots 但有 setSlot：reset()/clearSlots() 逐槽 setSlot(i, null) 兜底清空', function () {
  var sb = createSlotsSandbox({ omitHudClearSlots: true });
  sb.SLOTS.fillSlot('secret-word', { itemKey: 'dog', renderState: { spriteUrl: 'dog.png' } });
  sb.hudSetSlotCalls.length = 0; // 清空占槽阶段的调用记录，只看清空阶段

  sb.SLOTS.clearSlots();

  var count = realSlotCount(sb);
  assert.equal(sb.hudSetSlotCalls.length, count, 'clearSlots 缺失时应逐槽调用 setSlot(i, null) 兜底');
  for (var i = 0; i < count; i++) {
    assert.equal(sb.hudSetSlotCalls[i].index, i);
    assert.equal(sb.hudSetSlotCalls[i].state, null);
  }
  console.log('PASS 8b: WTJ_HUD.clearSlots 缺失时逐槽 setSlot(i, null) 兜底清空。');
});

test('8c. WTJ_SECRET / WTJ_KEYBOARD 缺失：reset() 不抛错，只跳过对应通知', function () {
  var sb = createSlotsSandbox({ omitSecret: true, omitKeyboardApi: true });
  sb.SLOTS.fillSlot('secret-word', { itemKey: 'dog', renderState: { spriteUrl: 'dog.png' } });
  assert.doesNotThrow(function () { sb.SLOTS.reset(); });
  assert.deepEqual(Array.from(sb.SLOTS.getSlots()), [null, null, null, null, null]);
  console.log('PASS 8c: WTJ_SECRET/WTJ_KEYBOARD 缺失时 reset() 仍能安全清空槽位，不抛错。');
});

// =====================================================================
// 9. 非法输入防御：未知 source / 缺失 itemKey
// =====================================================================
test('9a. 未知 source：console.warn 后忽略，不占槽、不抛错', function () {
  var sb = createSlotsSandbox();
  var r;
  assert.doesNotThrow(function () {
    r = sb.SLOTS.fillSlot('not-a-real-source', { itemKey: 'x', renderState: {} });
  });
  assert.equal(r.filled, false);
  assert.equal(r.duplicate, false);
  assert.equal(sb.hudSetSlotCalls.length, 0);
  console.log('PASS 9a: 未知 source 被忽略，不占槽、不抛错。');
});

test('9b. item.itemKey 缺失（undefined/null）：忽略，不占槽、不抛错', function () {
  var sb = createSlotsSandbox();
  assert.doesNotThrow(function () {
    var r1 = sb.SLOTS.fillSlot('secret-word', {});
    assert.equal(r1.filled, false);
    var r2 = sb.SLOTS.fillSlot('secret-word', { itemKey: null, renderState: {} });
    assert.equal(r2.filled, false);
    var r3 = sb.SLOTS.fillSlot('secret-word', null);
    assert.equal(r3.filled, false);
  });
  assert.equal(sb.hudSetSlotCalls.length, 0);
  console.log('PASS 9b: item 缺失/itemKey 缺失时安全忽略，不抛错。');
});

// =====================================================================
// 10. 不同源不同项各占一槽（补充：与验收 3 configuration 一致性）
// =====================================================================
test('10. 混合来源填槽顺序：source 与 itemKey 均不同的多个发现各自占用递增的槽位', function () {
  var sb = createSlotsSandbox();
  var seq = [
    ['secret-word', 'dog'],
    ['keyboard-milestone', 100],
    ['secret-word', 'cat'],
    ['keyboard-milestone', 200]
  ];
  seq.forEach(function (pair, i) {
    var r = sb.SLOTS.fillSlot(pair[0], { itemKey: pair[1], renderState: {} });
    assert.equal(r.filled, true);
    assert.equal(r.slotIndex, i);
  });
  console.log('PASS 10: 混合来源按调用顺序各自占用递增槽位。');
});

// =====================================================================
// 11. 重复引入守卫
// =====================================================================
test('11. 重复引入守卫：再次执行 slots.js 源码是安全 no-op，window.WTJ_SLOTS 仍是实例 1，内部状态不被重置', function () {
  var sb = createSlotsSandbox();
  var instance1 = sb.SLOTS;
  sb.SLOTS.fillSlot('secret-word', { itemKey: 'dog', renderState: { spriteUrl: 'dog.png' } });

  sb.reloadSlots(); // 第二次执行源码

  assert.equal(sb.window.WTJ_SLOTS, instance1, '重复引入后 window.WTJ_SLOTS 仍是实例 1');
  var slots = sb.window.WTJ_SLOTS.getSlots();
  assert.equal(slots[0].itemKey, 'dog', '重复引入不应重置已有内部状态（守卫在任何副作用之前短路）');
  console.log('PASS 11: 重复引入是安全 no-op —— 绑定不被换掉、内部状态未被重新初始化。');
});

// =====================================================================
// 12. getState() / getSlots() 是快照（值拷贝），外部修改不影响内部状态
//     含 P2-1 回归：renderState 也被浅拷贝——改写快照的 renderState.spriteUrl 不污染内部状态。
// =====================================================================
test('12. getState()/getSlots() 返回快照：外部修改返回值（含 renderState 字段）不影响引擎内部状态（P2-1）', function () {
  var sb = createSlotsSandbox();
  sb.SLOTS.fillSlot('secret-word', { itemKey: 'dog', renderState: { spriteUrl: 'dog.png' } });

  var slots1 = sb.SLOTS.getSlots();
  slots1[0] = null;
  slots1.push('garbage');
  var slots2 = sb.SLOTS.getSlots();
  assert.equal(slots2[0].itemKey, 'dog', '外部修改快照数组不应影响引擎内部状态');
  assert.equal(slots2.length, realSlotCount(sb), '引擎内部槽数不受外部 push 影响');

  // P2-1：改写快照里的 renderState 内层字段，绝不能污染引擎内部状态或后续快照。
  slots2[0].renderState.spriteUrl = 'HACKED';
  slots2[0].renderState.injected = true;
  var slots3 = sb.SLOTS.getSlots();
  assert.equal(slots3[0].renderState.spriteUrl, 'dog.png', '改写快照的 renderState.spriteUrl 不应污染内部状态（renderState 已浅拷贝隔离）');
  assert.equal(typeof slots3[0].renderState.injected, 'undefined', '往快照 renderState 注入的新字段不应出现在内部真实状态里');

  // onFull 快照同样隔离（011 消费路径）：填满 5 槽拿到 onFull 快照，改写它不污染引擎。
  var sb2 = createSlotsSandbox();
  var fullSnap = null;
  sb2.SLOTS.onFull(function (snap) { fullSnap = snap; });
  ['dog', 'cat', 'apple', 'ball', 'star'].forEach(function (w) {
    sb2.SLOTS.fillSlot('secret-word', { itemKey: w, renderState: { spriteUrl: w + '.png' } });
  });
  assert.ok(fullSnap, 'onFull 应回传快照');
  fullSnap.slots[0].renderState.spriteUrl = 'HACKED';
  assert.equal(sb2.SLOTS.getSlots()[0].renderState.spriteUrl, 'dog.png', '改写 onFull 快照的 renderState 不应污染引擎内部状态（防 011 踩坑）');
  console.log('PASS 12: getSlots()/getState()/onFull 快照均值拷贝（含 renderState 浅拷贝隔离，P2-1），外部修改不影响内部真实状态。');
});

// =====================================================================
// 第 2 部分：009/008 窄改后的委托 / fallback 集成验证
// =====================================================================

function makeNode(tag) {
  var node = {
    tagName: (typeof tag === 'string' ? tag : '').toUpperCase(),
    className: '',
    src: '',
    style: {},
    children: [],
    parentNode: null,
    setAttribute: function () {},
    addEventListener: function () {},
    appendChild: function (child) {
      child.parentNode = node;
      node.children.push(child);
      return child;
    },
    removeChild: function (child) {
      var idx = node.children.indexOf(child);
      if (idx >= 0) node.children.splice(idx, 1);
      child.parentNode = null;
      return child;
    }
  };
  return node;
}

// 009（secretword.js）沙箱：可选注入 window.WTJ_SLOTS stub（记录 fillSlot 调用）。
function createSecretwordDelegationSandbox(opts) {
  var options = opts || {};
  var letterHandlers = [];
  var hudSetSlotCalls = [];
  var slotsFillCalls = [];

  var fakeWindow = {
    WTJ_KEYBOARD: {
      onLetter: function (fn) { if (typeof fn === 'function') letterHandlers.push(fn); }
    },
    WTJ_AUDIO: {
      playWord: function () { return Promise.resolve({ ok: true }); }
    },
    WTJ_HUD: {
      setSlot: function (index, state) { hudSetSlotCalls.push({ index: index, state: state }); }
    }
  };

  if (options.withSlots) {
    fakeWindow.WTJ_SLOTS = {
      fillSlot: function (source, item) {
        slotsFillCalls.push({ source: source, item: item });
        return { filled: true, slotIndex: slotsFillCalls.length - 1, duplicate: false, full: false };
      }
    };
  }

  var body = makeNode('body');
  var fakeDocument = {
    createElement: function (tag) { return makeNode(tag); },
    getElementById: function () { return null; },
    body: body
  };

  var sandbox = {
    window: fakeWindow,
    document: fakeDocument,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Promise: Promise
  };
  vm.createContext(sandbox);

  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  vm.runInContext(SECRETWORD_SRC, sandbox, { filename: 'secretword.js' });
  assert.ok(fakeWindow.WTJ_SECRET, 'secretword.js 必须挂载 window.WTJ_SECRET');

  function feed(str) {
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      for (var h = 0; h < letterHandlers.length; h++) letterHandlers[h](ch);
    }
  }

  return {
    window: fakeWindow,
    SECRET: fakeWindow.WTJ_SECRET,
    hudSetSlotCalls: hudSetSlotCalls,
    slotsFillCalls: slotsFillCalls,
    feed: feed
  };
}

// 008（keyboard.js）沙箱：可选注入 window.WTJ_SLOTS stub（记录 fillSlot 调用）。
function createKeyboardDelegationSandbox(opts) {
  var options = opts || {};
  var keydownHandler = null;
  var hudSetSlotCalls = [];
  var slotsFillCalls = [];

  var fakeWindow = {
    addEventListener: function (type, handler) { if (type === 'keydown') keydownHandler = handler; },
    removeEventListener: function () {},
    WTJ_HUD: {
      setSlot: function (index, state) { hudSetSlotCalls.push({ index: index, state: state }); }
    }
  };

  if (options.withSlots) {
    fakeWindow.WTJ_SLOTS = {
      fillSlot: function (source, item) {
        slotsFillCalls.push({ source: source, item: item });
        return { filled: true, slotIndex: slotsFillCalls.length - 1, duplicate: false, full: false };
      }
    };
  }

  var sandbox = { window: fakeWindow, console: console };
  vm.createContext(sandbox);

  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  vm.runInContext(KEYBOARD_SRC, sandbox, { filename: 'keyboard.js' });
  assert.ok(fakeWindow.WTJ_KEYBOARD, 'keyboard.js 必须挂载 window.WTJ_KEYBOARD');
  assert.equal(typeof keydownHandler, 'function');

  function fire(key) { keydownHandler({ key: key, repeat: false }); }

  return {
    window: fakeWindow,
    KEYBOARD: fakeWindow.WTJ_KEYBOARD,
    hudSetSlotCalls: hudSetSlotCalls,
    slotsFillCalls: slotsFillCalls,
    fire: fire
  };
}

// =====================================================================
// 13. 009 委托路径：window.WTJ_SLOTS 存在时，秘密词命中调用 WTJ_SLOTS.fillSlot，不直连 WTJ_HUD.setSlot
// =====================================================================
test('13. 009 委托路径：WTJ_SLOTS 存在时，DOG 命中调用 WTJ_SLOTS.fillSlot("secret-word", {itemKey:"dog", renderState:{spriteUrl}})，不直接调用 WTJ_HUD.setSlot', function () {
  var sb = createSecretwordDelegationSandbox({ withSlots: true });
  sb.feed('DOG');

  assert.equal(sb.slotsFillCalls.length, 1, '应委托调用一次 WTJ_SLOTS.fillSlot');
  assert.equal(sb.slotsFillCalls[0].source, 'secret-word');
  assert.equal(sb.slotsFillCalls[0].item.itemKey, 'dog');
  assert.equal(sb.slotsFillCalls[0].item.renderState.spriteUrl, 'assets/sprites/dog.png');
  assert.equal(sb.hudSetSlotCalls.length, 0, 'WTJ_SLOTS 存在时不应绕过委托直接调用 WTJ_HUD.setSlot');
  console.log('PASS 13: 009 在 WTJ_SLOTS 存在时正确委托 fillSlot，未直连 WTJ_HUD.setSlot。');
});

// =====================================================================
// 14. 009 fallback 路径：window.WTJ_SLOTS 缺失时，退回直连 WTJ_HUD.setSlot（原有行为，不回归）
// =====================================================================
test('14. 009 fallback 路径：WTJ_SLOTS 缺失时，DOG 命中直接调用 WTJ_HUD.setSlot(0, {spriteUrl:"assets/sprites/dog.png"})（原有最小实现）', function () {
  var sb = createSecretwordDelegationSandbox({ withSlots: false });
  sb.feed('DOG');

  assert.equal(sb.hudSetSlotCalls.length, 1, 'WTJ_SLOTS 缺失时应退回直连 WTJ_HUD.setSlot');
  assert.equal(sb.hudSetSlotCalls[0].index, 0);
  assert.equal(sb.hudSetSlotCalls[0].state.spriteUrl, 'assets/sprites/dog.png');
  console.log('PASS 14: 009 在 WTJ_SLOTS 缺失时正确 fallback 到原有直连 WTJ_HUD.setSlot 实现，不回归。');
});

// =====================================================================
// 15. 008 委托路径：window.WTJ_SLOTS 存在时，里程碑触发调用 WTJ_SLOTS.fillSlot，不直连 WTJ_HUD.setSlot
// =====================================================================
test('15. 008 委托路径：WTJ_SLOTS 存在时，累计 100 有效键调用 WTJ_SLOTS.fillSlot("keyboard-milestone", {itemKey:100, renderState:{milestone:true}})，不直接调用 WTJ_HUD.setSlot', function () {
  var sb = createKeyboardDelegationSandbox({ withSlots: true });
  for (var i = 0; i < 100; i++) sb.fire(i % 2 === 0 ? 'a' : 's');

  assert.equal(sb.slotsFillCalls.length, 1, '应委托调用一次 WTJ_SLOTS.fillSlot');
  assert.equal(sb.slotsFillCalls[0].source, 'keyboard-milestone');
  assert.equal(sb.slotsFillCalls[0].item.itemKey, 100);
  assert.equal(sb.slotsFillCalls[0].item.renderState.milestone, true);
  assert.equal(sb.hudSetSlotCalls.length, 0, 'WTJ_SLOTS 存在时不应绕过委托直接调用 WTJ_HUD.setSlot');
  console.log('PASS 15: 008 在 WTJ_SLOTS 存在时正确委托 fillSlot，未直连 WTJ_HUD.setSlot。');
});

// =====================================================================
// 16. 008 fallback 路径：window.WTJ_SLOTS 缺失时，退回直连 WTJ_HUD.setSlot（原有行为，不回归）
// =====================================================================
test('16. 008 fallback 路径：WTJ_SLOTS 缺失时，累计 100/200 有效键直接调用 WTJ_HUD.setSlot(0/1, {milestone:true})（原有最小实现）', function () {
  var sb = createKeyboardDelegationSandbox({ withSlots: false });
  for (var i = 0; i < 200; i++) sb.fire(i % 2 === 0 ? 'a' : 's');

  assert.equal(sb.hudSetSlotCalls.length, 2, 'WTJ_SLOTS 缺失时应退回直连 WTJ_HUD.setSlot，100/200 各一次');
  assert.equal(sb.hudSetSlotCalls[0].index, 0);
  assert.equal(sb.hudSetSlotCalls[0].state.milestone, true);
  assert.equal(sb.hudSetSlotCalls[1].index, 1);
  assert.equal(sb.hudSetSlotCalls[1].state.milestone, true);
  console.log('PASS 16: 008 在 WTJ_SLOTS 缺失时正确 fallback 到原有直连 WTJ_HUD.setSlot 实现，不回归。');
});
