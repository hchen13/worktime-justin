// WTJ-20260705-018 — parent-controls.js 单元测试（durable QA asset）
// WTJ-20260705-027 在此基础上补充：二级设置页"关闭"必须回一级家长菜单，而不是直接掉回
// 主游戏界面（见文件末尾第 8 节）。
//
// 覆盖验收标准 #1（Cmd+Q 长按进度条）、#2/#6（隐藏家长菜单相关的 web 层配套：这里只测试
// web 层能正确响应 shell 下发的状态，家长菜单本身是原生 NSMenu，不在 web 层，不在本文件
// 覆盖范围——那部分留给真机手动验证，见 handoff 清单）、#3（设置面板保存每日额度）、
// #4（语言切换 + no-silent-fallback UI 落地）、#5（锁定状态驱动安静锁屏叠层 + 输入抑制标志）、
// 027 卡「设置页保存/取消后回一级菜单」（第 8/8b/8c/8d 节：postMessage({ type:
// 'wtjReturnToParentMenu' }) 是否正确、按序发出；shell 收到后是否真的重新弹出 NSMenu 是
// app/shell/main.swift 的职责，不在本文件覆盖范围，真机验证见 QA-055）。
//
// 用 Node 内置 vm 模块搭沙箱，按 index.html 真实加载顺序（manifest.js -> voice-language.js
// -> parent-controls.js）加载三个真实源码文件（与 hud.test.mjs / task-voice-path.test.mjs
// 同一手法），配一个支持 addEventListener 实际存储+可手动派发、classList add/remove/contains
// 的最小 DOM stub。
//
// Run:  node --test tests/unit/parent-controls.test.mjs
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
var VOICE_LANG_SRC = readFileSync(path.join(APP_WEB, 'voice-language.js'), 'utf8');
var PARENT_CONTROLS_SRC = readFileSync(path.join(APP_WEB, 'parent-controls.js'), 'utf8');

// --- 最小可用 DOM stub：createElement / appendChild / classList add+remove+contains /
//     setAttribute+getAttribute / addEventListener（真实存储 + 可手动派发）/ 普通属性
//     （value/checked/disabled/type/name/min/max/step/textContent 都是普通可读写字段，不需要
//     getter/setter，parent-controls.js 只做直接赋值/读取，不依赖 DOM 的隐式类型转换行为）。 ---
function makeElement(tag) {
  var listeners = {};
  var el = {
    tagName: tag,
    children: [],
    parentNode: null,
    style: {},
    attributes: {},
    value: '',
    checked: false,
    disabled: false,
    textContent: '',
    className: '',
    classList: {
      _list: [],
      add: function (cls) {
        if (this._list.indexOf(cls) === -1) this._list.push(cls);
      },
      remove: function (cls) {
        var idx = this._list.indexOf(cls);
        if (idx !== -1) this._list.splice(idx, 1);
      },
      contains: function (cls) {
        return this._list.indexOf(cls) !== -1;
      }
    },
    setAttribute: function (name, value) { this.attributes[name] = value; },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
    addEventListener: function (type, fn) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    appendChild: function (child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    dispatch: function (type) {
      (listeners[type] || []).forEach(function (fn) { fn({ target: el }); });
    }
  };
  return el;
}

function makeFakeDocument() {
  var body = makeElement('body');
  return {
    document: {
      createElement: function (tag) { return makeElement(tag); },
      body: body
    },
    body: body
  };
}

function findAll(root, predicate) {
  var out = [];
  function walk(node) {
    if (predicate(node)) out.push(node);
    (node.children || []).forEach(walk);
  }
  walk(root);
  return out;
}

function findById(root, id) {
  return findAll(root, function (n) { return n.id === id || n.getAttribute && false; })
    .concat(findAll(root, function (n) { return n.id === id; }))[0];
}

function findRadio(root, value) {
  return findAll(root, function (n) { return n.type === 'radio' && n.value === value; })[0];
}

function findButtonByText(root, text) {
  return findAll(root, function (n) { return n.tagName === 'button' && n.textContent === text; })[0];
}

function makeFakeLocalStorage(preset) {
  var store = {};
  if (preset) Object.keys(preset).forEach(function (k) { store[k] = preset[k]; });
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
}

function createSandbox(opts) {
  opts = opts || {};
  var docStub = makeFakeDocument();
  var shellMessages = [];
  var fakeWindow = {
    localStorage: makeFakeLocalStorage(opts.presetStorage),
    webkit: opts.omitWebkitBridge ? undefined : {
      messageHandlers: {
        shell: { postMessage: function (payload) { shellMessages.push(payload); } }
      }
    }
  };
  var sandbox = {
    window: fakeWindow,
    document: docStub.document,
    console: console
  };
  vm.createContext(sandbox);
  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  vm.runInContext(VOICE_LANG_SRC, sandbox, { filename: 'voice-language.js' });
  vm.runInContext(PARENT_CONTROLS_SRC, sandbox, { filename: 'parent-controls.js' });

  return {
    window: fakeWindow,
    body: docStub.body,
    PARENT_CONTROLS: fakeWindow.WTJ_PARENT_CONTROLS,
    VOICE_LANG: fakeWindow.WTJ_VOICE_LANG,
    shellMessages: shellMessages
  };
}

// =====================================================================================
// 1. 挂载：三个叠层 DOM（锁屏 / 进度条 / 设置面板）在模块加载时即挂到 document.body。
// =====================================================================================

test('1. 模块加载即挂载三个叠层：#wtj-parent-lockout / #wtj-parent-gate-progress-wrap / #wtj-parent-settings', function () {
  var sb = createSandbox();
  assert.ok(findById(sb.body, 'wtj-parent-lockout'), '应挂载安静锁屏叠层');
  assert.ok(findById(sb.body, 'wtj-parent-gate-progress-wrap'), '应挂载 Cmd+Q 长按进度条');
  assert.ok(findById(sb.body, 'wtj-parent-settings'), '应挂载设置面板');
  console.log('PASS 1: 三个叠层均已挂载。');
});

test('1b. API 冻结：window.WTJ_PARENT_CONTROLS 是 frozen 对象且方法齐全', function () {
  var sb = createSandbox();
  assert.equal(Object.isFrozen(sb.PARENT_CONTROLS), true);
  ['isLocked', 'isSettingsPanelOpen', 'isInputSuspended', 'getCachedState', 'showSettingsPanel', 'hideSettingsPanel'].forEach(function (name) {
    assert.equal(typeof sb.PARENT_CONTROLS[name], 'function', '缺少方法: ' + name);
  });
  console.log('PASS 1b: WTJ_PARENT_CONTROLS 冻结且方法齐全。');
});

// =====================================================================================
// 2. Cmd+Q 长按进度条：window.wtjParentGateProgress(seconds) 驱动宽度百分比与 is-active。
// =====================================================================================

test('2. window.wtjParentGateProgress(seconds) 按 manifest.parentControls.cmdQHoldSec(=5) 算百分比，>0 时 wrap 加 is-active，回到 0 移除', function () {
  var sb = createSandbox();
  var wrap = findById(sb.body, 'wtj-parent-gate-progress-wrap');
  var bar = findById(sb.body, 'wtj-parent-gate-progress-bar');

  sb.window.wtjParentGateProgress(2.5);
  assert.equal(wrap.classList.contains('is-active'), true);
  assert.equal(bar.style.width, '50%');

  sb.window.wtjParentGateProgress(5);
  assert.equal(bar.style.width, '100%');

  sb.window.wtjParentGateProgress(0);
  assert.equal(wrap.classList.contains('is-active'), false);
  assert.equal(bar.style.width, '0%');
  console.log('PASS 2: Cmd+Q 长按进度条百分比与 is-active 切换均正确。');
});

// =====================================================================================
// 3. 锁定状态：window.wtjSetLockout(locked, remaining) 驱动锁屏叠层 + isLocked()/isInputSuspended()。
// =====================================================================================

test('3. window.wtjSetLockout(true, ...) 令锁屏叠层可见、isLocked()/isInputSuspended() 为 true；(false, ...) 解除', function () {
  var sb = createSandbox();
  var lockout = findById(sb.body, 'wtj-parent-lockout');

  assert.equal(sb.PARENT_CONTROLS.isLocked(), false, '初始未锁定');
  assert.equal(sb.PARENT_CONTROLS.isInputSuspended(), false);

  sb.window.wtjSetLockout(true, 0);
  assert.equal(lockout.classList.contains('is-active'), true);
  assert.equal(sb.PARENT_CONTROLS.isLocked(), true);
  assert.equal(sb.PARENT_CONTROLS.isInputSuspended(), true, '锁定期间 isInputSuspended() 必须为 true（供 keyboard.js/pointer.js 早退）');

  sb.window.wtjSetLockout(false, 1800);
  assert.equal(lockout.classList.contains('is-active'), false);
  assert.equal(sb.PARENT_CONTROLS.isLocked(), false);
  assert.equal(sb.PARENT_CONTROLS.getCachedState().remainingSecondsToday, 1800);
  console.log('PASS 3: 锁定/解锁均正确驱动叠层可见性与 isLocked()/isInputSuspended()。');
});

// =====================================================================================
// 4. window.wtjApplyShellState(state)：hydrate 权威状态，不强制打开设置面板。
// =====================================================================================

test('4. window.wtjApplyShellState() 更新 getCachedState()，且不会自行弹出设置面板（静默同步）', function () {
  var sb = createSandbox();
  var settingsPanel = findById(sb.body, 'wtj-parent-settings');

  sb.window.wtjApplyShellState({
    dailyLimitMinutes: 45,
    usedSecondsToday: 120,
    remainingSecondsToday: 45 * 60 - 120,
    locked: false,
    dailyLimitMinMinutes: 5,
    dailyLimitMaxMinutes: 180
  });

  var cached = sb.PARENT_CONTROLS.getCachedState();
  assert.equal(cached.dailyLimitMinutes, 45);
  assert.equal(cached.usedSecondsToday, 120);
  assert.equal(settingsPanel.classList.contains('is-active'), false, 'wtjApplyShellState 不应自行打开设置面板');
  assert.equal(sb.PARENT_CONTROLS.isSettingsPanelOpen(), false);
  console.log('PASS 4: wtjApplyShellState() 静默同步权威状态，不弹出设置面板。');
});

test('4b. window.wtjApplyShellState({locked:true}) 也会驱动锁屏叠层（初始加载即锁定的场景）', function () {
  var sb = createSandbox();
  var lockout = findById(sb.body, 'wtj-parent-lockout');
  sb.window.wtjApplyShellState({ dailyLimitMinutes: 30, usedSecondsToday: 1800, remainingSecondsToday: 0, locked: true });
  assert.equal(lockout.classList.contains('is-active'), true, '冷启动即锁定的场景，首次 hydrate 也必须显示锁屏');
  console.log('PASS 4b: 冷启动即锁定场景下 wtjApplyShellState 正确显示锁屏叠层。');
});

// =====================================================================================
// 5. window.wtjShowSettingsPanel(state)：打开设置面板 + isSettingsPanelOpen()/isInputSuspended()。
// =====================================================================================

test('5. window.wtjShowSettingsPanel() 打开设置面板，isSettingsPanelOpen()/isInputSuspended() 为 true；hideSettingsPanel() 关闭', function () {
  var sb = createSandbox();
  var settingsPanel = findById(sb.body, 'wtj-parent-settings');

  sb.window.wtjShowSettingsPanel({ dailyLimitMinutes: 30, usedSecondsToday: 60, remainingSecondsToday: 1740, locked: false });
  assert.equal(settingsPanel.classList.contains('is-active'), true);
  assert.equal(sb.PARENT_CONTROLS.isSettingsPanelOpen(), true);
  assert.equal(sb.PARENT_CONTROLS.isInputSuspended(), true, '设置面板打开期间即便未锁定，也应抑制游戏输入（见文件顶部说明）');

  sb.PARENT_CONTROLS.hideSettingsPanel();
  assert.equal(settingsPanel.classList.contains('is-active'), false);
  assert.equal(sb.PARENT_CONTROLS.isSettingsPanelOpen(), false);
  assert.equal(sb.PARENT_CONTROLS.isInputSuspended(), false);
  console.log('PASS 5: 设置面板打开/关闭正确驱动 isSettingsPanelOpen()/isInputSuspended()。');
});

test('5b. 设置面板打开时会同步展示的每日额度/今日已用字段', function () {
  var sb = createSandbox();
  sb.window.wtjShowSettingsPanel({ dailyLimitMinutes: 20, usedSecondsToday: 600, remainingSecondsToday: 600, locked: false, dailyLimitMinMinutes: 5, dailyLimitMaxMinutes: 180 });
  var input = findById(sb.body, 'wtj-daily-limit-input');
  assert.equal(input.value, '20');
  assert.equal(input.min, '5');
  assert.equal(input.max, '180');
  console.log('PASS 5b: 设置面板打开时每日额度输入框正确回填当前权威值。');
});

// =====================================================================================
// 6. 设置面板"保存额度"：裁剪范围后经 postToShell 发出 { type: 'wtjSetDailyLimit', minutes }。
// =====================================================================================

test('6. 设置面板保存额度：输入超出上限会被裁剪，postMessage 发出裁剪后的值', function () {
  var sb = createSandbox();
  sb.window.wtjShowSettingsPanel({ dailyLimitMinutes: 30, usedSecondsToday: 0, remainingSecondsToday: 1800, locked: false, dailyLimitMinMinutes: 5, dailyLimitMaxMinutes: 180 });

  var input = findById(sb.body, 'wtj-daily-limit-input');
  input.value = '999'; // 超出上限 180
  var saveBtn = findButtonByText(sb.body, '保存额度');
  assert.ok(saveBtn, '应能找到"保存额度"按钮');
  saveBtn.dispatch('click');

  assert.equal(sb.shellMessages.length, 1);
  // JSON.stringify 比较（而非 assert.deepEqual）：shellMessages[0] 是 vm 沙箱（另一个 realm）
  // 里创建的普通对象字面量，其 Object.prototype 与本文件主 realm 的 Object.prototype 不是
  // 同一个对象——assert/strict 的 deepEqual 是 deepStrictEqual 的别名，会因"同构但不同 realm
  // 的原型"判定为不相等（Node "same structure but are not reference-equal"），与
  // voice-language.test.mjs 用例 9a/9c 遇到的同一个跨 realm 陷阱，同一手法绕开。
  assert.equal(JSON.stringify(sb.shellMessages[0]), JSON.stringify({ type: 'wtjSetDailyLimit', minutes: 180 }));
  assert.equal(input.value, '180', '输入框本身也应回显裁剪后的值');
  console.log('PASS 6: 超出上限的额度输入被裁剪到 180 并正确 postMessage。');
});

test('6b. 设置面板保存额度：非法输入（非数字）不发送消息', function () {
  var sb = createSandbox();
  sb.window.wtjShowSettingsPanel({ dailyLimitMinutes: 30, usedSecondsToday: 0, remainingSecondsToday: 1800, locked: false, dailyLimitMinMinutes: 5, dailyLimitMaxMinutes: 180 });
  var input = findById(sb.body, 'wtj-daily-limit-input');
  input.value = 'abc';
  findButtonByText(sb.body, '保存额度').dispatch('click');
  assert.equal(sb.shellMessages.length, 0, '非法输入不应发出任何 postMessage');
  console.log('PASS 6b: 非法额度输入不发送消息，安全短路。');
});

test('6c. 设置面板"重置今日额度"按钮：postMessage 发出 { type: "wtjResetUsageToday" }', function () {
  var sb = createSandbox();
  sb.window.wtjShowSettingsPanel({ dailyLimitMinutes: 30, usedSecondsToday: 600, remainingSecondsToday: 1200, locked: false });
  var resetBtn = findButtonByText(sb.body, '重置今日额度');
  assert.ok(resetBtn);
  resetBtn.dispatch('click');
  assert.equal(sb.shellMessages.length, 1);
  // 跨 realm 陷阱，同上一条注释：用 JSON.stringify 比较代替 assert.deepEqual。
  assert.equal(JSON.stringify(sb.shellMessages[0]), JSON.stringify({ type: 'wtjResetUsageToday' }));
  console.log('PASS 6c: "重置今日额度"按钮正确 postMessage。');
});

test('6d. window.webkit 桥缺失（非 WKWebView 环境）时不抛错，只是静默不发送', function () {
  var sb = createSandbox({ omitWebkitBridge: true });
  sb.window.wtjShowSettingsPanel({ dailyLimitMinutes: 30, usedSecondsToday: 0, remainingSecondsToday: 1800, locked: false, dailyLimitMinMinutes: 5, dailyLimitMaxMinutes: 180 });
  var input = findById(sb.body, 'wtj-daily-limit-input');
  input.value = '40';
  assert.doesNotThrow(function () {
    findButtonByText(sb.body, '保存额度').dispatch('click');
  });
  console.log('PASS 6d: webkit 桥缺失时保存操作不抛错（浏览器直接调试场景）。');
});

// =====================================================================================
// 7. 语言切换（验收标准 #4，no-silent-fallback UI 落地）：设置面板的语言单选组。
// =====================================================================================

test('7. 语言单选组初始状态：zh 被选中且可用，en 因素材不全被禁用（disabled + 所在 label 标 is-disabled）', function () {
  var sb = createSandbox();
  sb.window.wtjShowSettingsPanel({ dailyLimitMinutes: 30, usedSecondsToday: 0, remainingSecondsToday: 1800, locked: false, dailyLimitMinMinutes: 5, dailyLimitMaxMinutes: 180 });

  var zhRadio = findRadio(sb.body, 'zh');
  var enRadio = findRadio(sb.body, 'en');
  var autoRadio = findRadio(sb.body, 'auto');
  assert.ok(zhRadio && enRadio && autoRadio, '三个语言单选按钮都应存在');

  assert.equal(zhRadio.checked, true, '默认模式 zh 应被选中');
  assert.equal(enRadio.disabled, true, 'en 素材不全（8/24）应被禁用，no-silent-fallback UI 落地');
  assert.equal(enRadio.parentNode.classList.contains('is-disabled'), true, 'en 所在 label 应标 is-disabled 供样式弱化');
  assert.equal(autoRadio.disabled, false, 'auto（跟随素材可用性）恒可选');
  console.log('PASS 7: 语言单选组初始状态正确——zh 选中可用，en 禁用且有视觉标记，auto 恒可选。');
});

test('7b. 选中 en（素材不全）：setMode 被拒绝，UI 自我纠正回 zh，且提示文案明确说明原因（不静默）', function () {
  var sb = createSandbox();
  sb.window.wtjShowSettingsPanel({ dailyLimitMinutes: 30, usedSecondsToday: 0, remainingSecondsToday: 1800, locked: false, dailyLimitMinMinutes: 5, dailyLimitMaxMinutes: 180 });

  var enRadio = findRadio(sb.body, 'en');
  // 模拟浏览器原生行为：物理点击一个 radio 时，浏览器会先把它的 checked 置为 true，
  // 再触发 change 事件——这里手动复刻这一步，才能验证"onLanguageChange 内部又把它纠正回去"。
  enRadio.checked = true;
  enRadio.dispatch('change');

  assert.equal(sb.VOICE_LANG.getMode(), 'zh', 'setMode("en") 应被拒绝，模式仍为 zh');
  assert.equal(enRadio.checked, false, 'UI 应自我纠正：en 被拒绝后 checked 应恢复为 false');
  var zhRadio = findRadio(sb.body, 'zh');
  assert.equal(zhRadio.checked, true, 'zh 应重新显示为选中状态');

  var note = findAll(sb.body, function (n) { return n.className === 'wtj-parent-settings-lang-note'; })[0];
  assert.ok(note.textContent.indexOf('无法切换') !== -1, '应有明确文案说明切换失败原因，不能静默');
  console.log('PASS 7b: 选中素材不全的 en 被拒绝，UI 自我纠正回 zh，且有明确文案（no-silent-fallback UI 落地）。');
});

test('7c. 选中 auto：setMode 成功，语言提示区展示两种语言的可用性计数', function () {
  var sb = createSandbox();
  sb.window.wtjShowSettingsPanel({ dailyLimitMinutes: 30, usedSecondsToday: 0, remainingSecondsToday: 1800, locked: false, dailyLimitMinMinutes: 5, dailyLimitMaxMinutes: 180 });

  var autoRadio = findRadio(sb.body, 'auto');
  autoRadio.checked = true;
  autoRadio.dispatch('change');

  assert.equal(sb.VOICE_LANG.getMode(), 'auto');
  var note = findAll(sb.body, function (n) { return n.className === 'wtj-parent-settings-lang-note'; })[0];
  assert.ok(note.textContent.indexOf('24/24') !== -1, '应展示中文 24/24 完整的计数');
  assert.ok(note.textContent.indexOf('8/24') !== -1, '应展示英文 8/24 不完整的计数');
  console.log('PASS 7c: 选中 auto 成功，语言提示区正确展示两种语言的可用性计数：' + note.textContent);
});

// =====================================================================================
// 8. 关闭按钮 —— WTJ-20260705-027：二级设置页离开时必须回到一级隐藏家长菜单（原生
//    NSMenu：退出/设置…/重置），不能直接把家长丢回被面板遮住的主游戏界面。web 层能做到的
//    验证边界是：点击"关闭"时正确 postMessage({ type: 'wtjReturnToParentMenu' }) 通知
//    shell 重新弹出一级菜单——shell 收到后是否真的弹出 NSMenu，是 app/shell/main.swift
//    的职责（该文件 handleParentControlsMessage 的 "wtjReturnToParentMenu" 分支），不在
//    本文件（纯 web 沙箱）覆盖范围内，真机交互验证见 QA-055。
// =====================================================================================

test('8. 设置面板"关闭"按钮（取消路径，未改动任何设置项）：isSettingsPanelOpen() 恢复 false，且 postMessage 通知 shell 回一级菜单', function () {
  var sb = createSandbox();
  sb.window.wtjShowSettingsPanel({ dailyLimitMinutes: 30, usedSecondsToday: 0, remainingSecondsToday: 1800, locked: false, dailyLimitMinMinutes: 5, dailyLimitMaxMinutes: 180 });
  assert.equal(sb.PARENT_CONTROLS.isSettingsPanelOpen(), true);

  findButtonByText(sb.body, '关闭').dispatch('click');

  assert.equal(sb.PARENT_CONTROLS.isSettingsPanelOpen(), false, '面板应已隐藏');
  assert.equal(sb.shellMessages.length, 1, '"取消"（未做任何改动直接关闭）也必须通知 shell 回一级菜单');
  assert.equal(JSON.stringify(sb.shellMessages[0]), JSON.stringify({ type: 'wtjReturnToParentMenu' }));
  console.log('PASS 8: 取消路径——直接点"关闭"正确回一级家长菜单（未破坏 isSettingsPanelOpen() 语义）。');
});

test('8b. 先"保存额度"（保存路径），再点击"关闭"：两条消息按序发出，最终仍回一级菜单', function () {
  var sb = createSandbox();
  sb.window.wtjShowSettingsPanel({ dailyLimitMinutes: 30, usedSecondsToday: 0, remainingSecondsToday: 1800, locked: false, dailyLimitMinMinutes: 5, dailyLimitMaxMinutes: 180 });

  var input = findById(sb.body, 'wtj-daily-limit-input');
  input.value = '45';
  findButtonByText(sb.body, '保存额度').dispatch('click');
  assert.equal(sb.PARENT_CONTROLS.isSettingsPanelOpen(), true, '保存额度本身不应关闭面板（家长可能还要接着调语言/重置）');

  findButtonByText(sb.body, '关闭').dispatch('click');

  assert.equal(sb.PARENT_CONTROLS.isSettingsPanelOpen(), false);
  assert.equal(sb.shellMessages.length, 2, '保存 1 条 + 关闭时回菜单 1 条');
  assert.equal(JSON.stringify(sb.shellMessages[0]), JSON.stringify({ type: 'wtjSetDailyLimit', minutes: 45 }));
  assert.equal(JSON.stringify(sb.shellMessages[1]), JSON.stringify({ type: 'wtjReturnToParentMenu' }));
  console.log('PASS 8b: 保存路径——"保存额度"后再"关闭"，保存消息与回菜单消息按序都发出。');
});

test('8c. window.webkit 桥缺失时点击"关闭"不抛错（仅隐藏面板，postToShell 静默失败，同 6d 场景）', function () {
  var sb = createSandbox({ omitWebkitBridge: true });
  sb.window.wtjShowSettingsPanel({ dailyLimitMinutes: 30, usedSecondsToday: 0, remainingSecondsToday: 1800, locked: false, dailyLimitMinMinutes: 5, dailyLimitMaxMinutes: 180 });
  assert.doesNotThrow(function () {
    findButtonByText(sb.body, '关闭').dispatch('click');
  });
  assert.equal(sb.PARENT_CONTROLS.isSettingsPanelOpen(), false, '即使桥缺失，面板本身仍应正常隐藏');
  console.log('PASS 8c: webkit 桥缺失时点击"关闭"不抛错，面板仍正常隐藏。');
});

test('8d. 直接调用冻结 API 的 hideSettingsPanel()（非经"关闭"按钮）：只隐藏面板，不发 wtjReturnToParentMenu', function () {
  var sb = createSandbox();
  sb.window.wtjShowSettingsPanel({ dailyLimitMinutes: 30, usedSecondsToday: 0, remainingSecondsToday: 1800, locked: false, dailyLimitMinMinutes: 5, dailyLimitMaxMinutes: 180 });

  sb.PARENT_CONTROLS.hideSettingsPanel();

  assert.equal(sb.PARENT_CONTROLS.isSettingsPanelOpen(), false);
  assert.equal(sb.shellMessages.length, 0, 'hideSettingsPanel() 本身是纯隐藏语义，不应带上"回一级菜单"这个副作用（该副作用只挂在"关闭"按钮的点击处理上）');
  console.log('PASS 8d: hideSettingsPanel() API 保持纯隐藏语义，不越权触发返回一级菜单。');
});
