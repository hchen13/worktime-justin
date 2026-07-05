// WTJ-20260704-007 / WTJ-20260704-083 — hud.js 单元测试（durable QA asset）
//
// 007（hud.js）首次交付时没有留下独立单测文件——本文件是它的第一份持久化单测，借 083
// （槽数可配置默认 3 / footer 槽位 UI 不依赖单张固定槽图 / 状态灯完成任务需明显变化）这次
// 定向改动的机会补上。
//
// 用 Node 内置 vm 模块搭一个沙箱 context，按 index.html 的真实加载顺序（manifest.js 之后、
// 无需等待 app.js）在同一 sandbox 里先加载真实的 app/web/manifest.js（其 IIFE 会
// window.WTJ_MANIFEST = deepFreeze(...)），再加载真实的 app/web/hud.js（读取
// window.WTJ_MANIFEST.slots.count / rewards.statusLights.count，挂载 window.WTJ_HUD）——
// 断言直接取自真实 manifest 数值（slots.count=3），消除"手工镜像 manifest 数值"的漂移风险。
//
// 最小 document/DOM stub：hud.js 在模块顶层立即执行 mount()（构建 DOM 并 appendChild 到
// document.body），因此本文件的 document stub 必须支持 createElement / createElementNS
// （buildLockIcon() 用到 SVG）/ appendChild / classList.add+remove / setAttribute+
// getAttribute / style，且不提供 window.location（applyDebugQueryFlag() 内部 try/catch
// 会在 window.location 不存在时安全早退，见 hud.js 该函数实现，不需要额外 stub
// document.getElementById）。
//
// Run:  node --test tests/unit/hud.test.mjs
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
var HUD_JS_PATH = path.resolve(__dirname, '../../app/web/hud.js');
var HUD_CSS_PATH = path.resolve(__dirname, '../../app/web/hud.css');
var MANIFEST_SRC = readFileSync(MANIFEST_JS_PATH, 'utf8');
var HUD_SRC = readFileSync(HUD_JS_PATH, 'utf8');

// --- 最小 document/DOM stub ------------------------------------------------------------------
// 与 task-templates.test.mjs 的 makeFakeDocument() 同一手法，扩展了 classList.remove()
// （setStatusLight() 需要 remove 再 add 两步切换 is-off/is-on）与 createElementNS()（SVG 锁
// 图标）、innerHTML setter（renderSlot() 用 innerHTML='' 清空旧内容后再 appendChild 新内容，
// 这里用一个 defineProperty 让赋值 '' 时同步清空 children，贴近真实 DOM 行为，供后续如需断言
// "旧内容被清空"时使用）。
// 真实 DOM 里 classList 是 className 字符串的一个"活视图"——往一边写，另一边读到的必须同步
// 变化（hud.js 里 el(tag, className) 走 node.className = '...' 整串赋值，setStatusLight()/
// renderSlot() 则走 classList.add()/remove() 增删单个 token，两种写法在同一个元素上混用，
// stub 必须双向同步，否则会出现"用 className 整串赋值设置的初始 class，classList.contains()
// 读不到"这种假失败（此前的实现版本就踩了这个坑）。
function makeElement(tag) {
  var classListValue = [];
  var classNameValue = '';

  function syncClassNameFromList() {
    classNameValue = classListValue.join(' ');
  }
  function syncListFromClassName(v) {
    classListValue = (typeof v === 'string' ? v : '').split(/\s+/).filter(function (s) { return s.length > 0; });
  }

  var el = {
    tagName: tag,
    children: [],
    parentNode: null,
    style: {},
    attributes: {},
    src: '',
    alt: '',
    textContent: '',
    classList: {
      add: function (cls) {
        if (classListValue.indexOf(cls) === -1) {
          classListValue.push(cls);
          syncClassNameFromList();
        }
      },
      remove: function (cls) {
        var idx = classListValue.indexOf(cls);
        if (idx !== -1) {
          classListValue.splice(idx, 1);
          syncClassNameFromList();
        }
      },
      contains: function (cls) {
        return classListValue.indexOf(cls) !== -1;
      }
    },
    setAttribute: function (name, value) {
      this.attributes[name] = value;
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
    addEventListener: function () {},
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
    }
  };

  Object.defineProperty(el, 'className', {
    get: function () { return classNameValue; },
    set: function (v) {
      classNameValue = typeof v === 'string' ? v : '';
      syncListFromClassName(classNameValue);
    }
  });

  var innerHTMLValue = '';
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return innerHTMLValue; },
    set: function (v) {
      innerHTMLValue = v;
      if (v === '') {
        el.children = [];
      }
    }
  });
  return el;
}

function makeFakeDocument() {
  var body = makeElement('body');
  return {
    document: {
      createElement: function (tag) { return makeElement(tag); },
      createElementNS: function (ns, tag) { return makeElement(tag); },
      body: body
    },
    body: body
  };
}

// --- sandbox builder -----------------------------------------------------------------------
// opts.manifestOverrideSrc：整段替换掉的 manifest.js 源码（用于测试非默认 slots.count 场景）。
function createSandbox(opts) {
  opts = opts || {};
  var docStub = makeFakeDocument();
  // window.location.search + 全局 URLSearchParams（Node 原生提供，直接透传）：
  // applyDebugQueryFlag() 会读取两者解析 ?debug=1，都不提供的话它内部 try/catch 会安全早退
  // 但每次都打一条 console.warn 噪音；这里给一个空 search，让它走"未命中 debug=1"的正常分支，
  // 不产生噪音也不影响本文件任何断言（本文件不测试 debug 面板）。
  var fakeWindow = { location: { search: '' } };

  var sandbox = {
    window: fakeWindow,
    document: docStub.document,
    console: console,
    URLSearchParams: URLSearchParams
  };
  vm.createContext(sandbox);

  vm.runInContext(opts.manifestOverrideSrc || MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  vm.runInContext(HUD_SRC, sandbox, { filename: 'hud.js' });

  return {
    window: fakeWindow,
    HUD: fakeWindow.WTJ_HUD,
    body: docStub.body,
    manifest: fakeWindow.WTJ_MANIFEST
  };
}

// 找到 mount() 挂在 body 下的 #wtj-hud-root 节点（本文件不断言 topbar/question 部分，只关注
// 槽位托盘与状态灯两块，与本卡 083 的改动范围一致）。
function hudRoot(sb) {
  return sb.body.children.filter(function (el) { return el.id === 'wtj-hud-root'; })[0];
}

// WTJ-20260705-019（移植 001 Phase A）：新增的 `.wtj-hud-footer` 全宽底栏容器（见 hud.js
// mount()），tray-wrap 与 chest-lane 都改成挂在这层新父级下面，不再是 #wtj-hud-root 的
// 直接子节点。footerEl() 是本文件后续查找二者的共同入口。
function footerEl(sb) {
  var root = hudRoot(sb);
  return root.children.filter(function (el) { return el.className === 'wtj-hud-footer'; })[0];
}

// WTJ-20260704-083 返工：tray-wrap 现在会额外挂 --imaged 或 --generic 修饰类（见 hud.js
// buildTray()），className 不再恒等于纯 'wtj-hud-tray-wrap'，改用 indexOf 匹配（与
// slotEls() 已有的匹配方式一致）。WTJ-20260705-019 起改为从 footerEl() 而不是 root 直接查找
// （穿过新增的 footer 父级，见上）。
function trayWrap(sb) {
  var footer = footerEl(sb);
  assert.ok(footer, '应该能找到新增的 .wtj-hud-footer 全宽底栏容器');
  return footer.children.filter(function (el) { return el.className.indexOf('wtj-hud-tray-wrap') !== -1; })[0];
}

function slotEls(sb) {
  var tray = trayWrap(sb);
  // 排除 .wtj-hud-footer-bar/.wtj-hud-tray-bg 等背景元素——它们的 className 不含
  // 'wtj-hud-slot' 子串，天然被下面的 filter 排除，这里维持原有匹配方式不变。
  return tray.children.filter(function (el) { return el.className.indexOf('wtj-hud-slot') !== -1; });
}

function lightsWrap(sb) {
  var root = hudRoot(sb);
  return root.children.filter(function (el) { return el.className === 'wtj-hud-lights'; })[0];
}

// WTJ-20260704-083 返工：footer 常驻宝箱指示器（persistent Disabled/Active/Open 三态）。
// WTJ-20260705-019（移植 001 Phase A）：同 trayWrap()，chest-lane 现在嵌套在 `.wtj-hud-footer`
// 里面，从 footerEl() 查找（穿透新增的 footer 父级）。
function chestLaneEl(sb) {
  var footer = footerEl(sb);
  assert.ok(footer, '应该能找到新增的 .wtj-hud-footer 全宽底栏容器');
  return footer.children.filter(function (el) { return el.className === 'wtj-hud-chest-lane'; })[0];
}

function chestImgEl(sb) {
  var lane = chestLaneEl(sb);
  return lane.children.filter(function (el) { return el.className.indexOf('wtj-hud-chest') !== -1; })[0];
}

// 用一个精确锚定 6 空格缩进的 replace（manifest.js 里 slots.count 与 rewards.statusLights.count
// 恰好都字面是 "count: 3,"，缩进层级不同——slots 块 6 空格，statusLights 块 8 空格，用换行+
// 缩进锚定只替换 slots 块那一处，不误伤 statusLights）。
function withSlotCount(n) {
  var needle = '\n      count: 3,\n';
  var replacement = '\n      count: ' + n + ',\n';
  var idx = MANIFEST_SRC.indexOf(needle);
  assert.ok(idx !== -1, '前置检查：应能在 manifest.js 源码中定位到 slots.count 的字面声明');
  return MANIFEST_SRC.slice(0, idx) + replacement + MANIFEST_SRC.slice(idx + needle.length);
}

// ============================================================================================
// 1. 真实 manifest 默认值：slots.count=3（WTJ-20260704-083 起），HUD 渲染恰好 3 个槽元素。
// ============================================================================================
test('1. 真实 manifest 默认 slots.count=3：HUD 渲染恰好 3 个 .wtj-hud-slot 元素，data-slot-index 为 0/1/2', function () {
  var sb = createSandbox();
  assert.equal(sb.manifest.slots.count, 3, '真实 manifest.slots.count 应为 3（WTJ-20260704-083 起默认值）');

  var slots = slotEls(sb);
  assert.equal(slots.length, 3, 'HUD 应恰好渲染 3 个槽元素（不是硬编码的 5 个）');

  var indices = slots.map(function (el) { return el.getAttribute('data-slot-index'); });
  assert.deepEqual(indices, ['0', '1', '2'], '槽元素的 data-slot-index 应为 0/1/2');

  assert.equal(sb.HUD.getState().slotCount, 3, 'getState().slotCount 应反映真实 manifest 的 count');
});

// ============================================================================================
// 2. 槽位不硬编码 5：manifest.slots.count 覆盖为其它数值时，HUD 应渲染对应数量的槽元素，
//    而不是恒定渲染 5 个或恒定复用 5 个写死的百分比。
// ============================================================================================
test('2. HUD 按 manifest.slots.count 动态渲染 N 个槽（覆盖为 4 验证真正动态，而非巧合等于默认值）', function () {
  var sb = createSandbox({ manifestOverrideSrc: withSlotCount(4) });
  assert.equal(sb.manifest.slots.count, 4, '前置检查：override 后 manifest.slots.count 应为 4');

  var slots = slotEls(sb);
  assert.equal(slots.length, 4, 'HUD 应恰好渲染 4 个槽元素，跟随 override 后的 manifest.slots.count');

  var indices = slots.map(function (el) { return el.getAttribute('data-slot-index'); });
  assert.deepEqual(indices, ['0', '1', '2', '3']);

  // 4 个槽在 [18%, 82%] 区间内均匀分布：18, 39.33..., 60.67..., 82（与 computeSlotLeftPercents()
  // 的实现同一公式）。只断言单调递增 + 首尾落在原设计的 18/82 边界，不逐位对比浮点小数，
  // 避免浮点精度导致的伪失败。
  var lefts = slots.map(function (el) { return parseFloat(el.style.left); });
  assert.equal(lefts[0], 18, '第一个槽应落在原 5 槽设计沿用的左边界 18%');
  assert.equal(lefts[lefts.length - 1], 82, '最后一个槽应落在原 5 槽设计沿用的右边界 82%');
  for (var i = 1; i < lefts.length; i++) {
    assert.ok(lefts[i] > lefts[i - 1], '槽位百分比应严格单调递增（不重叠、按顺序从左到右排布）');
  }
});

// ============================================================================================
// 3. N=5 时与原硬编码设计完全一致（无回归）：托盘使用已验收的 five-slot-tray.png，且槽位百分比
//    与原 [18, 34, 50, 66, 82] 完全相同。
// ============================================================================================
test('3. manifest.slots.count=5 时：托盘使用已验收的 five-slot-tray.png，槽位百分比与原硬编码设计完全一致（无回归）', function () {
  var sb = createSandbox({ manifestOverrideSrc: withSlotCount(5) });

  var tray = trayWrap(sb);
  assert.ok(tray.className.indexOf('wtj-hud-tray-wrap--imaged') !== -1, 'count=5 时 tray-wrap 应挂 --imaged 修饰类（已验收构图路径）');

  var bg = tray.children.filter(function (el) { return el.className === 'wtj-hud-tray-bg'; })[0];
  assert.ok(bg, 'count=5 时应该使用 five-slot-tray.png 背景（已验收构图）');
  assert.ok(bg.src.indexOf('five-slot-tray.png') !== -1, '背景图 src 应指向 five-slot-tray.png');

  // WTJ-20260704-083 返工：旧 .wtj-hud-tray-bg-fallback 占位胶囊已被 082 规则的
  // .wtj-hud-footer-bar 取代（见 hud.js buildTray()），count=5 走已验收图片路径时两者都不应出现。
  var oldFallback = tray.children.filter(function (el) { return el.className === 'wtj-hud-tray-bg-fallback'; })[0];
  assert.equal(oldFallback, undefined, 'count=5 时不应该出现旧的 CSS 占位背景（应该用已验收的真实素材）');
  var footerBar = tray.children.filter(function (el) { return el.className === 'wtj-hud-footer-bar'; })[0];
  assert.equal(footerBar, undefined, 'count=5 时不应该出现 082 的 generic footer-bar（走的是已验收图片路径，两者互斥）');

  var slots = slotEls(sb);
  var lefts = slots.map(function (el) { return parseFloat(el.style.left); });
  assert.deepEqual(lefts, [18, 34, 50, 66, 82], 'N=5 时槽位百分比应与 007 原硬编码设计完全一致，纯泛化不改变既有视觉');
});

// ============================================================================================
// 4.（WTJ-20260704-083 返工，PM 打回②）非 5 槽数（如默认的 3）：没有对应的已验收托盘底图
//    构图，不应该继续贴一张为 5 槽构图的图（那样会出现槽位圆点与底图凹槽错位——验收②反馈的
//    缺陷本体），也**不应该**再是上一版被 PM 打回的纯色占位胶囊（旧 .wtj-hud-tray-bg-fallback）
//    ——应该是 DESIGN 082 规则的可交付 footer 背景条（.wtj-hud-footer-bar）。
// ============================================================================================
test('4. manifest.slots.count=3（默认值）时：不使用 five-slot-tray.png，改用 082 规则的可交付 footer 背景条（不是旧的粗糙占位胶囊）', function () {
  var sb = createSandbox(); // 真实默认 manifest，count=3

  var tray = trayWrap(sb);
  assert.ok(tray.className.indexOf('wtj-hud-tray-wrap--generic') !== -1, 'count=3 时 tray-wrap 应挂 --generic 修饰类');

  var bg = tray.children.filter(function (el) { return el.className === 'wtj-hud-tray-bg'; })[0];
  assert.equal(bg, undefined, 'count=3 时不应该使用 five-slot-tray.png（那是按 5 槽构图的最终资产，套在 3 槽上会错位）');

  var oldFallback = tray.children.filter(function (el) { return el.className === 'wtj-hud-tray-bg-fallback'; })[0];
  assert.equal(oldFallback, undefined, 'PM 打回②：不能再是上一版的纯色占位胶囊（.wtj-hud-tray-bg-fallback 应已被移除/替换，不能用旧占位断言冒充完成）');

  var footerBar = tray.children.filter(function (el) { return el.className === 'wtj-hud-footer-bar'; })[0];
  assert.ok(footerBar, 'count=3 时应该渲染 082 规则的可交付 footer 背景条（.wtj-hud-footer-bar）');
});

// ============================================================================================
// 5. 槽位渲染 API（setSlot/clearSlots）在非 5 的 count 下依然正确工作：满槽发生在第 N 格
//    （默认 count=3 时即第 3 格，index=2），不越界、不崩溃。
// ============================================================================================
test('5. setSlot/clearSlots 在默认 count=3 下按 0..2 的合法下标工作；index=3 越界应被拒绝（防止越界写入第 4 格）', function () {
  var sb = createSandbox();

  sb.HUD.setSlot(0, { spriteUrl: 'assets/sprites/dog.png' });
  sb.HUD.setSlot(1, { milestone: true });
  sb.HUD.setSlot(2, { spriteUrl: 'assets/sprites/cat.png' }); // 第 3 格（index=2），"满槽"发生在这里

  var slots = slotEls(sb);
  assert.equal(slots[0].classList.contains('is-filled'), true, '槽 0 应渲染为 is-filled（sprite）');
  assert.equal(slots[1].classList.contains('is-milestone'), true, '槽 1 应渲染为 is-milestone（星形）');
  assert.equal(slots[2].classList.contains('is-filled'), true, '槽 2（第 3 格，count=3 时的最后一格）应渲染为 is-filled');

  var state = sb.HUD.getState();
  assert.equal(state.slots[2].spriteUrl, 'assets/sprites/cat.png', 'getState().slots[2] 应反映第 3 格（最后一格）的内容');

  // index=3 越界（count=3 时合法下标只有 0/1/2）：应被防御式拒绝，不抛错、不产生第 4 个槽状态。
  assert.doesNotThrow(function () { sb.HUD.setSlot(3, { spriteUrl: 'x.png' }); });
  assert.equal(sb.HUD.getState().slots.length, 3, 'getState().slots 长度应恒为 3，index=3 的越界调用不应扩展数组');

  sb.HUD.clearSlots();
  var clearedSlots = slotEls(sb);
  clearedSlots.forEach(function (el, i) {
    assert.equal(el.classList.contains('is-empty'), true, 'clearSlots() 后槽 ' + i + ' 应回到 is-empty');
  });
});

// ============================================================================================
// 5b.（WTJ-20260705-008，接入 DESIGN-007 键盘里程碑贴纸）里程碑点亮发现槽时，槽内应渲染真实
//     键盘贴纸 <img>（keyboard-star medallion），src 取自真实 manifest.slots.milestoneStickerSprite
//     （config 驱动，不硬编码），且**不再**是早期的 ★ Unicode 星字占位（production-asset-quality
//     rule 12：真实产品视觉必须达质量线，不留字符占位）。
// ============================================================================================
test('5b. 里程碑槽（setSlot({milestone:true})）内渲染 DESIGN-007 键盘贴纸 <img>（src 取自真实 manifest.slots.milestoneStickerSprite），不再是 ★ 字符占位', function () {
  var sb = createSandbox();

  var expectedSprite = sb.manifest.slots.milestoneStickerSprite;
  assert.ok(typeof expectedSprite === 'string' && expectedSprite.length > 0, '前置检查：真实 manifest 应有 slots.milestoneStickerSprite');
  assert.ok(expectedSprite.indexOf('assets/discovery-icons/') !== -1, 'milestoneStickerSprite 应指向已接入的 discovery-icons 运行时素材（DESIGN-007），而不是旧的 states/keyboard-star.png stub');

  sb.HUD.setSlot(1, { milestone: true });
  var slot = slotEls(sb)[1];
  assert.equal(slot.classList.contains('is-milestone'), true, '里程碑槽应挂 is-milestone 类');

  var img = slot.children.filter(function (el) { return el.tagName === 'img'; })[0];
  assert.ok(img, '里程碑槽内应渲染一个 <img>（键盘贴纸），不是纯字符占位');
  assert.equal(img.src, expectedSprite, '贴纸 <img> 的 src 应恰好等于 manifest.slots.milestoneStickerSprite（config 驱动，不在 hud.js 硬编码文件名）');
  assert.ok(img.className.indexOf('wtj-hud-slot-sprite') !== -1, '应复用 .wtj-hud-slot-sprite 基样式');
  assert.ok(img.className.indexOf('wtj-hud-slot-milestone-sprite') !== -1, '应挂 milestone 专属样式类 .wtj-hud-slot-milestone-sprite');

  var starSpan = slot.children.filter(function (el) { return el.className && el.className.indexOf('wtj-hud-slot-star') !== -1; })[0];
  assert.equal(starSpan, undefined, '里程碑槽不应再渲染 ★ Unicode 星字占位（已由真实 DESIGN-007 素材替换，rule 12）');

  // hud.css 静态契约：milestone 专属尺寸类应存在（medallion 略微填满槽位）。
  var css = readFileSync(HUD_CSS_PATH, 'utf8');
  assert.ok(/\.wtj-hud-slot-milestone-sprite\s*\{/.test(css), 'hud.css 应定义 .wtj-hud-slot-milestone-sprite 规则');
});

// ============================================================================================
// 6.（开发机验收反馈④）状态灯完成任务后应有明显的视觉变化：is-off -> is-on 切换 class 正确，
//    且 hud.css 里对应 .wtj-hud-light.is-on 应挂有一次性「点亮」关键帧动画（不再只是一次
//    250ms 的 opacity/filter 渐变——那在 22~28px 的小尺寸角落元素上不够醒目）。
// ============================================================================================
test('6. setStatusLight(index, true) 从 is-off 明确切到 is-on（class 断言）；hud.css 应存在对应的一次性点亮动画', function () {
  var sb = createSandbox();
  var lights = lightsWrap(sb).children;
  assert.ok(lights.length > 0, '应该渲染出至少 1 个状态灯');

  assert.equal(lights[0].classList.contains('is-off'), true, '初始态应为 is-off');
  assert.equal(lights[0].classList.contains('is-on'), false);

  sb.HUD.setStatusLight(0, true);
  assert.equal(lights[0].classList.contains('is-on'), true, '完成任务点亮后应切到 is-on');
  assert.equal(lights[0].classList.contains('is-off'), false, 'is-on 与 is-off 应互斥，不应同时存在');

  sb.HUD.setStatusLight(0, false);
  assert.equal(lights[0].classList.contains('is-off'), true, '熄灭后应切回 is-off');
  assert.equal(lights[0].classList.contains('is-on'), false);

  // hud.css 静态契约：.wtj-hud-light.is-on 应该挂一个具名的一次性关键帧动画（而不是只有
  // transition），且该关键帧应定义在同一份样式表里，同时 prefers-reduced-motion 媒体查询下
  // 应显式关闭它（保证可访问性红线不被这次增强破坏）。
  var css = readFileSync(HUD_CSS_PATH, 'utf8');
  var isOnBlockMatch = css.match(/\.wtj-hud-light\.is-on\s*\{[^}]*\}/);
  assert.ok(isOnBlockMatch, 'hud.css 应包含 .wtj-hud-light.is-on 规则块');
  var animNameMatch = isOnBlockMatch[0].match(/animation:\s*([a-zA-Z0-9_-]+)/);
  assert.ok(animNameMatch, '.wtj-hud-light.is-on 应声明一个具名 animation（一次性点亮反馈），不能只有 transition');
  var animName = animNameMatch[1];
  var keyframesRe = new RegExp('@keyframes\\s+' + animName + '\\s*\\{');
  assert.ok(keyframesRe.test(css), 'hud.css 应定义 @keyframes ' + animName + ' 对应的关键帧');

  var reducedMotionBlockMatch = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/);
  assert.ok(reducedMotionBlockMatch, 'hud.css 应包含 prefers-reduced-motion 的兜底块');
  assert.ok(reducedMotionBlockMatch[1].indexOf('.wtj-hud-light.is-on') !== -1, 'prefers-reduced-motion 块应显式覆盖 .wtj-hud-light.is-on，关闭一次性点亮动画');
});

// ============================================================================================
// 7. API 对象本身冻结、方法齐全。
//    据实记录：hud.js（007，早于引入"绑定加固"约定的 010/011/015 等卡）在文件末尾用的是
//    普通赋值 `window.WTJ_HUD = Object.freeze({...})`，不像后续模块那样额外用
//    Object.defineProperty 把 window 上的绑定本身也设为 writable:false/configurable:false。
//    本卡范围是槽数配置化/footer 布局/状态灯视觉/粒子预设，不涉及给 hud.js 补齐绑定加固这个
//    架构性改动，这里如实断言 hud.js 的真实现状，不构造一个它并不满足的契约。
// ============================================================================================
test('7. window.WTJ_HUD 是冻结对象，API 方法齐全（含 WTJ-20260704-083 返工新增的 setChestOpen）', function () {
  var sb = createSandbox();
  assert.equal(Object.isFrozen(sb.HUD), true, 'window.WTJ_HUD 指向的对象本身必须 Object.freeze');
  ['setSlot', 'clearSlots', 'setStatusLight', 'onQuestionClick', 'setChestOpen', 'getState'].forEach(function (name) {
    assert.equal(typeof sb.HUD[name], 'function', 'API 缺少方法: ' + name);
  });
});

// ============================================================================================
// 8.（WTJ-20260704-083 返工，PM 打回②：N 槽可交付视觉 Ghost 态）082 v1 边界：默认 count=3 时，
//    3 个槽全部是"主槽"，不应出现任何 Ghost；count=5 时，超出主槽视觉上限（索引 >= 3）的第
//    4/5 格应恒定渲染为 Ghost（低透 + 加号），不反映真实 Empty/Filled 数据。
// ============================================================================================
test('8. Ghost 槽结构：count=3 无 Ghost；count=5 时第 4/5 格（index 3/4）恒定渲染 Ghost（含 "+" 子元素），不受 setSlot 数据影响', function () {
  var sb3 = createSandbox(); // 默认 count=3
  var slots3 = slotEls(sb3);
  var ghosts3 = slots3.filter(function (el) { return el.classList.contains('is-ghost'); });
  assert.equal(ghosts3.length, 0, 'count=3（默认值）时不应该出现任何 Ghost 槽——3 个都是主槽');

  var sb5 = createSandbox({ manifestOverrideSrc: withSlotCount(5) });
  var slots5 = slotEls(sb5);
  var ghosts5 = slots5.filter(function (el) { return el.classList.contains('is-ghost'); });
  assert.equal(ghosts5.length, 2, 'count=5 时应该恰好有 2 个 Ghost 槽（第 4/5 格，索引 3/4）');

  var ghostIndices = ghosts5.map(function (el) { return el.getAttribute('data-slot-index'); }).sort();
  assert.deepEqual(ghostIndices, ['3', '4'], 'Ghost 槽应恰好是索引 3/4（超出 082 v1 主槽视觉上限 3）');

  ghosts5.forEach(function (el) {
    assert.equal(el.classList.contains('is-empty'), false, 'Ghost 槽不应该同时带 is-empty（Ghost 与 Empty/Filled 互斥）');
    assert.equal(el.classList.contains('is-filled'), false, 'Ghost 槽不应该同时带 is-filled');
    var plus = el.children.filter(function (c) { return c.className.indexOf('wtj-hud-slot-ghost-plus') !== -1; })[0];
    assert.ok(plus, 'Ghost 槽应该有一个加号子元素');
    assert.equal(plus.textContent, '+', 'Ghost 槽加号子元素文本应为 "+"');
  });

  // 即使真实向 index 3/4 写入数据（010 侧这两个索引仍是真实功能槽位），视觉上仍应恒定 Ghost，
  // 不会被数据"揭穿"变成 is-filled——082 v1 明确这是纯展示层规则。
  sb5.HUD.setSlot(3, { spriteUrl: 'assets/sprites/dog.png' });
  var slot3AfterWrite = slotEls(sb5)[3];
  assert.equal(slot3AfterWrite.classList.contains('is-ghost'), true, '写入数据后 index=3 仍应保持 Ghost 视觉（不反映真实填充数据）');
  assert.equal(slot3AfterWrite.classList.contains('is-filled'), false, 'index=3 不应该因为写入数据而变成 is-filled（082 v1 边界）');
  // 内部数据层仍应正确记录（getState() 快照不受视觉层影响）。
  assert.equal(sb5.HUD.getState().slots[3].spriteUrl, 'assets/sprites/dog.png', 'getState() 快照应反映真实写入的数据，不受 Ghost 视觉层影响');
});

// ============================================================================================
// 9.（WTJ-20260704-083 返工，PM 打回①：footer 持久宝箱三态指示器，criterion 1 核心）
//    宝箱指示器默认 Disabled；随槽位填充进度推进，只有在全部槽位填满的那一刻才切到 Active；
//    clearSlots() 后（开新一轮）应强制回落 Disabled。
// ============================================================================================
test('9. footer 常驻宝箱指示器：默认 Disabled，随 setSlot 填槽进度推进，全部填满才切到 Active；clearSlots() 后回落 Disabled', function () {
  var sb = createSandbox(); // 默认 count=3

  var chestImg = chestImgEl(sb);
  assert.ok(chestImg, '应该渲染出一个持久的 .wtj-hud-chest 指示器元素');
  assert.equal(chestImg.classList.contains('is-disabled'), true, '初始态应为 Disabled（槽位全空）');
  assert.ok(chestImg.src.indexOf('chest-disabled.png') !== -1, 'Disabled 态应使用 chest-disabled.png');
  assert.equal(sb.HUD.getState().chestState, 'disabled', 'getState().chestState 初始应为 disabled');

  sb.HUD.setSlot(0, { spriteUrl: 'assets/sprites/dog.png' });
  assert.equal(sb.HUD.getState().chestState, 'disabled', '只填了 1/3 槽，宝箱仍应是 Disabled（未全满）');
  assert.equal(chestImg.classList.contains('is-disabled'), true, '只填 1/3 槽时指示器元素仍应是 is-disabled');

  sb.HUD.setSlot(1, { milestone: true });
  assert.equal(sb.HUD.getState().chestState, 'disabled', '填了 2/3 槽，宝箱仍应是 Disabled（仍未全满）');

  sb.HUD.setSlot(2, { spriteUrl: 'assets/sprites/cat.png' }); // 第 3 格，恰好填满
  assert.equal(sb.HUD.getState().chestState, 'active', '3/3 槽全部填满的那一刻，宝箱应切到 Active');
  assert.equal(chestImg.classList.contains('is-active'), true, '指示器元素应切到 is-active');
  assert.equal(chestImg.classList.contains('is-disabled'), false, 'is-active 与 is-disabled 应互斥');
  assert.ok(chestImg.src.indexOf('chest-active.png') !== -1, 'Active 态应使用 chest-active.png');

  sb.HUD.clearSlots();
  assert.equal(sb.HUD.getState().chestState, 'disabled', 'clearSlots()（开新一轮）后宝箱应强制回落 Disabled');
  assert.equal(chestImg.classList.contains('is-disabled'), true, '指示器元素应回落 is-disabled');
  assert.ok(chestImg.src.indexOf('chest-disabled.png') !== -1, '回落后应重新使用 chest-disabled.png');
});

// ============================================================================================
// 10.（WTJ-20260704-083 返工，PM 打回①：Open 态由 011/reward-chest.js 显式接管）
//     setChestOpen(true) 应无条件切到 Open（不新增第三张图，复用 Active 的 chest-active.png，
//     视觉区分交给 CSS）；Open 态下不应被中途的 setSlot 调用意外打断；setChestOpen(false)
//     应按"当前实际填槽情况"回落 Active 或 Disabled，而不是恒定回落 Disabled。
// ============================================================================================
test('10. setChestOpen(true/false)：无条件切到 Open（复用 active 图，不新增第三张图）；Open 态不被 setSlot 打断；关闭后按实际填槽情况回落 Active/Disabled', function () {
  var sb = createSandbox();
  var chestImg = chestImgEl(sb);

  // 空槽位时打开：Open 态应该复用 chest-active.png（082 明确"不是第三张静态图"）。
  sb.HUD.setChestOpen(true);
  assert.equal(sb.HUD.getState().chestState, 'open', 'setChestOpen(true) 后 chestState 应为 open');
  assert.equal(chestImg.classList.contains('is-open'), true, '指示器元素应切到 is-open');
  assert.ok(chestImg.src.indexOf('chest-active.png') !== -1, 'Open 态应复用 chest-active.png（不是新的第三张图）');

  // Open 期间 setSlot 不应该把状态打断回 disabled/active（updateChestStateFromFill 的 Open 守卫）。
  sb.HUD.setSlot(0, { spriteUrl: 'assets/sprites/dog.png' });
  assert.equal(sb.HUD.getState().chestState, 'open', 'Open 态不应该被中途的 setSlot 调用打断');

  // 关闭 Open：此刻只填了 1/3 槽，应该回落 Disabled（不是恒定回落，是"按当前情况"）。
  sb.HUD.setChestOpen(false);
  assert.equal(sb.HUD.getState().chestState, 'disabled', '关闭 Open 后，未全满时应回落 Disabled');

  // 填满全部槽位后再次打开/关闭：这次关闭后应该回落 Active，而不是被错误地恒定清成 Disabled。
  sb.HUD.setSlot(1, { milestone: true });
  sb.HUD.setSlot(2, { spriteUrl: 'assets/sprites/cat.png' });
  assert.equal(sb.HUD.getState().chestState, 'active', '前置检查：3/3 已全满，应为 active');

  sb.HUD.setChestOpen(true);
  assert.equal(sb.HUD.getState().chestState, 'open');
  sb.HUD.setChestOpen(false);
  assert.equal(sb.HUD.getState().chestState, 'active', '全满时关闭 Open 应回落 Active（不是恒定回落 Disabled，防止把真实进度错误清空）');
});

// ============================================================================================
// 11. manifest 资产路径接入：chest 指示器的 src 应该来自 window.WTJ_MANIFEST.rewards.chest.
//     footerIndicator.states（真实 manifest 数值），不是硬编码在 hud.js 里与 manifest 脱节的值。
// ============================================================================================
test('11. footer 宝箱指示器资产路径应读自真实 manifest.rewards.chest.footerIndicator.states（082 资产接入）', function () {
  var sb = createSandbox();
  var cfg = sb.manifest.rewards.chest.footerIndicator;
  assert.ok(cfg, 'manifest.rewards.chest.footerIndicator 应该存在（082 资产登记）');
  assert.equal(cfg.states.disabled, 'chest-disabled.png');
  assert.equal(cfg.states.active, 'chest-active.png');
  assert.equal(cfg.card, 'WTJ-20260704-082', 'footerIndicator 应标注来源卡号 082');

  var chestImg = chestImgEl(sb);
  assert.equal(chestImg.src, 'assets/ui/' + cfg.states.disabled, 'chest img src 应该是 ASSET_BASE + manifest 登记的文件名（真实读自 manifest，非硬编码脱节值）');
});

// ============================================================================================
// 12.（WTJ-20260704-083 返工，CSS 静态契约）082 规则的关键数值应该真的落进 hud.css，而不是只在
//     JS 里加了几个 class 名字——footer 背景条颜色/分界线、宝箱三态视觉、Ghost 槽视觉、
//     reduced-motion 覆盖，逐条用正则核对，延续本文件既有测试 6 的"CSS 源码静态契约"手法。
// ============================================================================================
test('12. hud.css 静态契约：082 footer 背景条数值、宝箱三态视觉、Ghost 槽视觉、prefers-reduced-motion 覆盖均应存在', function () {
  var css = readFileSync(HUD_CSS_PATH, 'utf8');

  // a) footer 背景条：082 doc 建议的深色背景与分界线数值应该真的出现（不是随便选的颜色）。
  var footerBarMatch = css.match(/\.wtj-hud-footer-bar\s*\{[^}]*\}/);
  assert.ok(footerBarMatch, 'hud.css 应包含 .wtj-hud-footer-bar 规则块（082 可交付 footer 背景，取代旧占位胶囊）');
  assert.ok(/rgba\(5,\s*10,\s*18,\s*0\.78\)/.test(footerBarMatch[0]), 'footer-bar 背景应使用 082 doc 建议值 rgba(5, 10, 18, 0.78)');
  assert.ok(/rgba\(156,\s*180,\s*220,\s*0\.16\)/.test(footerBarMatch[0]), 'footer-bar 顶部分界线应使用 082 doc 建议值 rgba(156, 180, 220, 0.16)');

  // b) 旧占位胶囊的规则块不应该再出现在 CSS 里（防止"新增了 footer-bar 但没删旧的"两套并存）；
  //    只匹配实际的规则声明（选择器 + `{`），不匹配注释里提及这个旧类名的说明性文字。
  assert.equal(/\.wtj-hud-tray-bg-fallback\s*\{/.test(css), false, 'hud.css 不应该再包含旧的 .wtj-hud-tray-bg-fallback 规则块（应已被 .wtj-hud-footer-bar 取代）');

  // c) Empty / Filled / Ghost 三态视觉类均应存在。
  assert.ok(/\.wtj-hud-slot\.is-empty::after\s*\{/.test(css), '应包含 Empty 态规则');
  assert.ok(/\.wtj-hud-slot\.is-filled[\s\S]{0,80}\{/.test(css), '应包含 Filled 态规则（金色外圈 + 发光）');
  assert.ok(/\.wtj-hud-slot\.is-ghost\s*\{/.test(css), '应包含 Ghost 态规则');
  assert.ok(/\.wtj-hud-slot\.is-ghost::after\s*\{/.test(css), '应包含 Ghost 态的暗色底圈规则');
  assert.ok(/\.wtj-hud-slot-ghost-plus\s*\{/.test(css), '应包含 Ghost 态的加号子元素规则');

  // d) 宝箱三态（Disabled/Active/Open）CSS 均应存在，且 Open 态应有具名 animation（呼吸脉冲），
  //    对应的 @keyframes 也应定义（延续测试 6 的具名动画核对手法）。
  ['is-disabled', 'is-active', 'is-open'].forEach(function (stateClass) {
    var re = new RegExp('\\.wtj-hud-chest\\.' + stateClass + '\\s*\\{');
    assert.ok(re.test(css), 'hud.css 应包含 .wtj-hud-chest.' + stateClass + ' 规则块');
  });

  var chestOpenBlockMatch = css.match(/\.wtj-hud-chest\.is-open\s*\{[^}]*\}/);
  assert.ok(chestOpenBlockMatch, '应能定位到 .wtj-hud-chest.is-open 规则块');
  var chestAnimNameMatch = chestOpenBlockMatch[0].match(/animation:\s*([a-zA-Z0-9_-]+)/);
  assert.ok(chestAnimNameMatch, '.wtj-hud-chest.is-open 应声明一个具名 animation（打开态呼吸脉冲，与静止的 Active 区分）');
  var chestKeyframesRe = new RegExp('@keyframes\\s+' + chestAnimNameMatch[1] + '\\s*\\{');
  assert.ok(chestKeyframesRe.test(css), 'hud.css 应定义 @keyframes ' + chestAnimNameMatch[1] + ' 对应的关键帧');

  // e) prefers-reduced-motion 应同时覆盖状态灯（既有）与新增的宝箱 Open 呼吸脉冲。
  var reducedMotionBlockMatch = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/);
  assert.ok(reducedMotionBlockMatch, 'hud.css 应包含 prefers-reduced-motion 的兜底块');
  assert.ok(reducedMotionBlockMatch[1].indexOf('.wtj-hud-chest') !== -1, 'prefers-reduced-motion 块应覆盖 .wtj-hud-chest（关闭打开态呼吸脉冲）');
});

// ============================================================================================
// 13.（WTJ-20260705-019，验收①：全宽 footer 底栏）新增用例——验证 mount() 新增的
//     `.wtj-hud-footer` 容器：a) DOM 结构上真的包住了槽位托盘与宝箱指示器（不再各自直接挂在
//     #wtj-hud-root 下）；b) CSS 静态契约上真的是"全宽铺满视口"（left:0/right:0/width:100%），
//     不是又一个局部定位的胶囊；c) 宝箱指示器在这个新父级内部依然保持"右锚定"
//     （position:absolute + right 声明，不是 left:50% 那种居中写法）——这是验收①（footer 做成
//     全宽底栏）与验收④（宝箱在 footer/卡槽侧边，不在画布正中）两条需求在结构上同时成立的
//     直接证据。这是"防止设计稿存在但运行版未接入"的可复用视觉回归门之一（见卡片验收⑦）。
// ============================================================================================
test('13. footer 全宽底栏容器：DOM 上包住槽位托盘与宝箱指示器；CSS 上 left:0/right:0/width:100% 全宽契约成立；宝箱在其内保持右锚定', function () {
  var sb = createSandbox();

  // a) DOM 结构：footer 是 #wtj-hud-root 的直接子节点；tray-wrap / chest-lane 都嵌套在 footer
  //    内部，不再各自直接挂在 root 下（对照此前 007/083/086 的旧结构：两者都是 root 的直接
  //    子节点，导致 footer 只是 tray-wrap 内部一小块局部宽度的胶囊）。
  var root = hudRoot(sb);
  var footer = footerEl(sb);
  assert.ok(footer, '应该渲染出 .wtj-hud-footer 全宽底栏容器');
  assert.ok(root.children.indexOf(footer) !== -1, 'footer 应该是 #wtj-hud-root 的直接子节点');

  var tray = trayWrap(sb);
  var chestLane = chestLaneEl(sb);
  assert.ok(tray, '应该能在 footer 内找到槽位托盘');
  assert.ok(chestLane, '应该能在 footer 内找到宝箱指示器 lane');
  assert.ok(footer.children.indexOf(tray) !== -1, '槽位托盘应该挂在 footer 容器内');
  assert.ok(footer.children.indexOf(chestLane) !== -1, '宝箱指示器 lane 应该挂在 footer 容器内');
  assert.equal(root.children.indexOf(tray), -1, '槽位托盘不应该再直接挂在 root 下（结构上必须经过 footer 这层）');
  assert.equal(root.children.indexOf(chestLane), -1, '宝箱指示器 lane 不应该再直接挂在 root 下（结构上必须经过 footer 这层）');

  // b) CSS 静态契约：footer 容器真的全宽铺满视口——position:fixed + left:0 + right:0 +
  //    width:100%，贴底（bottom:0），而不是像旧的 .wtj-hud-tray-wrap 那样 left:50% 局部居中。
  var css = readFileSync(HUD_CSS_PATH, 'utf8');
  var footerBlockMatch = css.match(/\.wtj-hud-footer\s*\{[^}]*\}/);
  assert.ok(footerBlockMatch, 'hud.css 应包含 .wtj-hud-footer 规则块（全宽底栏容器，注意不要和 .wtj-hud-footer-bar 混淆——正则要求选择器后紧跟 { ，不会误匹配 -bar 变体）');
  var footerBlock = footerBlockMatch[0];
  assert.ok(/position:\s*fixed/.test(footerBlock), '.wtj-hud-footer 应 position:fixed（相对视口固定）');
  assert.ok(/left:\s*0/.test(footerBlock), '.wtj-hud-footer 应声明 left:0（全宽契约的一部分，不是局部居中）');
  assert.ok(/right:\s*0/.test(footerBlock), '.wtj-hud-footer 应声明 right:0');
  assert.ok(/bottom:\s*0/.test(footerBlock), '.wtj-hud-footer 应贴底（bottom:0）');
  assert.ok(/width:\s*100%/.test(footerBlock), '.wtj-hud-footer 应声明 width:100%（全宽契约的直接数值判据，防止今后又改回局部宽度）');

  // c) 宝箱 lane 挂到 footer 内部后，定位方式应从独立的 position:fixed 改为相对 footer 的
  //    position:absolute；同时仍然保持"右锚定"（right 声明），而不是变成居中（left:50%）——
  //    验收①"footer 全宽"与验收④"宝箱在 footer/卡槽侧边"两条需求必须同时成立，不能互相抵消。
  var chestLaneBlockMatch = css.match(/\.wtj-hud-chest-lane\s*\{[^}]*\}/);
  assert.ok(chestLaneBlockMatch, '应能找到 .wtj-hud-chest-lane 规则块');
  var chestLaneBlock = chestLaneBlockMatch[0];
  assert.ok(/position:\s*absolute/.test(chestLaneBlock), '.wtj-hud-chest-lane 挂到 footer 内部后应改为 position:absolute（不再是独立的 position:fixed）');
  assert.ok(/right:\s*clamp/.test(chestLaneBlock), '.wtj-hud-chest-lane 应继续保持 right 锚定（验收④：宝箱在 footer 右侧）');
  assert.equal(/left:\s*50%/.test(chestLaneBlock), false, '.wtj-hud-chest-lane 不应该出现水平居中的 left:50%（应保持右锚定，不是居中）');

  // 槽位托盘同理改为 position:absolute（相对 footer 定位），数值/百分比布局本身不变
  // （computeSlotLeftPercents() 与 resolveTrayBgFile() 两个既有动态布局函数完全不动）。
  var trayWrapBlockMatch = css.match(/\.wtj-hud-tray-wrap\s*\{[^}]*\}/);
  assert.ok(trayWrapBlockMatch, '应能找到 .wtj-hud-tray-wrap 规则块');
  assert.ok(/position:\s*absolute/.test(trayWrapBlockMatch[0]), '.wtj-hud-tray-wrap 挂到 footer 内部后应改为 position:absolute（不再是独立的 position:fixed）');
});
