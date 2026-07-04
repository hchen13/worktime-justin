// WTJ-20260704-009 — secretword.js 单元测试（durable QA asset）
//
// 用 Node 内置 vm 模块搭一个沙箱 context，按 index.html 的真实加载顺序在同一 sandbox 里
// 先加载真实的 app/web/manifest.js（其 IIFE 会 window.WTJ_MANIFEST = deepFreeze(...)），
// 再加载 app/web/secretword.js（读取 window.WTJ_MANIFEST）——从而让引擎读到产品真实 manifest
// 数值/词池，断言也直接取自真实 manifest，消除"手工镜像"漂移风险。少数需要特制词池的用例
// （最长优先 car/scar、复合 hot/dog）改为在跑 secretword.js 前注入一个合成 manifest。
// sandbox 额外提供 stub 的 window.WTJ_KEYBOARD.onLetter（捕获字母处理函数）、window.WTJ_AUDIO
// .playWord、window.WTJ_HUD.setSlot、以及一个记录 createElement 标签的 document 打桩，然后通过
// 手动调用捕获到的字母处理函数注入合成字母序列驱动引擎。
//
// Run:  node --test tests/unit/secretword-engine.test.mjs
//       （或整套件：node --test 'tests/unit/*.test.mjs'——本机 Node 25 下 `node --test
//        tests/unit/` 目录形式不再自动展开为测试文件，须用带 glob 的引号形式）
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
var SECRETWORD_JS_PATH = path.resolve(__dirname, '../../app/web/secretword.js');
var MANIFEST_SRC = readFileSync(MANIFEST_JS_PATH, 'utf8');
var SECRETWORD_SRC = readFileSync(SECRETWORD_JS_PATH, 'utf8');

// ---------------------------------------------------------------------
// document 打桩：记录每次 createElement 的标签，供"从不创建 input/textarea"断言使用。
// 节点足够"能用"：支持 className/src/setAttribute/addEventListener/appendChild/removeChild。
// ---------------------------------------------------------------------
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

// 合成 manifest（供最长优先 / 复合触发 / 开关 false 分支等用例注入特制词池）。
// matchRules 默认全开（与真实一致）；ruleOverrides 可覆盖个别开关以测试 false 分支。
function injectedManifest(pool, ruleOverrides) {
  var rules = {
    caseInsensitive: true,
    substringMatch: true,
    overlapTrigger: true,
    doubleLetterNoPenalty: true,
    sameWordRepeatMinorFeedbackOnly: true,
    longestMatchPriority: true,
    sequentialCompoundIndependentTriggers: true
  };
  if (ruleOverrides) {
    Object.keys(ruleOverrides).forEach(function (k) { rules[k] = ruleOverrides[k]; });
  }
  return {
    secretWords: { matchRules: rules, pool: pool },
    slots: { count: 5 }
  };
}

// 每个用例一个全新 sandbox（secretword.js 是 IIFE，模块级状态只在首次执行时初始化一次，
// 不同用例间必须隔离，不能共享 buffer / roundHitSet / slotCursor 等闭包状态）。
function createSandbox(opts) {
  var options = opts || {};
  var letterHandlers = [];
  var audioCalls = [];
  var slotCalls = [];
  var createdTags = [];

  var fakeWindow = {};

  if (!options.omitKeyboard) {
    fakeWindow.WTJ_KEYBOARD = {
      onLetter: function (fn) {
        if (typeof fn === 'function') letterHandlers.push(fn);
      }
    };
  }
  if (!options.omitAudio) {
    fakeWindow.WTJ_AUDIO = {
      playWord: function (arg) {
        audioCalls.push(arg);
        if (options.rejectAudio) {
          return Promise.reject(new Error('synthetic playWord rejection'));
        }
        return Promise.resolve({ ok: true, silent: false });
      }
    };
  }
  if (!options.omitHud) {
    fakeWindow.WTJ_HUD = {
      setSlot: function (index, state) {
        slotCalls.push({ index: index, state: state });
      }
    };
  }

  var fakeDocument = null;
  if (!options.omitDocument) {
    var body = makeNode('body');
    fakeDocument = {
      createElement: function (tag) {
        createdTags.push(String(tag));
        return makeNode(tag);
      },
      getElementById: function () { return null; },
      body: body
    };
  }

  var sandbox = {
    window: fakeWindow,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Promise: Promise
  };
  if (fakeDocument) sandbox.document = fakeDocument;

  vm.createContext(sandbox);

  if (options.manifestObject) {
    fakeWindow.WTJ_MANIFEST = options.manifestObject;
  } else {
    vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
    assert.ok(fakeWindow.WTJ_MANIFEST, '加载真实 manifest.js 后 window.WTJ_MANIFEST 应存在');
  }

  vm.runInContext(SECRETWORD_SRC, sandbox, { filename: 'secretword.js' });
  assert.ok(fakeWindow.WTJ_SECRET, 'secretword.js 必须挂载 window.WTJ_SECRET');

  // feed：把字符逐个送给引擎注册的字母处理函数（模拟 keyboard.js 逐键 emit onLetter）。
  // keyboard.js 实际送来的是大写字符，这里默认原样送（用例自行决定大小写以覆盖 case 等价）。
  function feed(str) {
    var i, h;
    for (i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      for (h = 0; h < letterHandlers.length; h++) {
        letterHandlers[h](ch);
      }
    }
  }

  return {
    sandbox: sandbox,
    window: fakeWindow,
    manifest: fakeWindow.WTJ_MANIFEST,
    SECRET: fakeWindow.WTJ_SECRET,
    audioCalls: audioCalls,
    slotCalls: slotCalls,
    createdTags: createdTags,
    letterHandlers: letterHandlers,
    feed: feed,
    reloadSecret: function () {
      vm.runInContext(SECRETWORD_SRC, sandbox, { filename: 'secretword.js' });
    }
  };
}

// =====================================================================
// 0. 静态源码红线：secretword.js 不创建 input/textarea/contenteditable，不回显 buffer
// =====================================================================
test('0. 静态源码红线（REQ-SEC-01）：无 createElement("input"/"textarea")、无 contenteditable、无 buffer 文本回显', function () {
  // 剥掉注释行后再扫描，避免注释里的 "input"/"textarea" 字样误判。
  var codeOnly = SECRETWORD_SRC.split('\n').filter(function (line) {
    return line.indexOf('//') !== 0 && line.trim().indexOf('//') !== 0;
  }).join('\n');

  assert.equal(/createElement\s*\(\s*['"]input['"]/.test(codeOnly), false, '不得 createElement("input")');
  assert.equal(/createElement\s*\(\s*['"]textarea['"]/.test(codeOnly), false, '不得 createElement("textarea")');
  assert.equal(/contenteditable/i.test(codeOnly), false, '不得使用 contenteditable');
  // 不得把 buffer 写进 DOM 文本（innerText/textContent/innerHTML 赋值均视为回显红线）。
  assert.equal(/\.(innerText|textContent|innerHTML)\s*=/.test(codeOnly), false, '不得向 DOM 写入文本（回显 buffer）');
  console.log('PASS 0: secretword.js 源码不含 input/textarea/contenteditable 创建，也不向 DOM 写文本 —— REQ-SEC-01 结构性成立。');
});

// =====================================================================
// 1. API 冻结 / 绑定加固 / 方法齐全
// =====================================================================
test('1. API 冻结 + 绑定不可写 + 方法齐全（onHit/onMinorHit/getRoundHits/resetRound/getBuffer）', function () {
  var sb = createSandbox();
  assert.equal(Object.isFrozen(sb.SECRET), true, 'window.WTJ_SECRET 必须 Object.freeze');
  ['onHit', 'onMinorHit', 'getRoundHits', 'resetRound', 'getBuffer'].forEach(function (name) {
    assert.equal(typeof sb.SECRET[name], 'function', 'API 缺少方法: ' + name);
  });
  var desc = Object.getOwnPropertyDescriptor(sb.window, 'WTJ_SECRET');
  assert.equal(desc.writable, false, 'window.WTJ_SECRET 绑定必须 writable:false');
  assert.equal(desc.configurable, false, 'window.WTJ_SECRET 绑定必须 configurable:false');
  var original = sb.SECRET;
  try { sb.window.WTJ_SECRET = { fake: true }; } catch (e) { /* 严格模式抛错也算通过 */ }
  assert.equal(sb.window.WTJ_SECRET, original, '绑定不可被整体重赋值换掉');
  console.log('PASS 1: API 冻结、绑定不可写/不可重配置、方法齐全。');
});

// =====================================================================
// 2. 子串/末尾命中：xxdogxx → dog
// =====================================================================
test('2. 子串命中（REQ-SEC-04）：XXDOGXX → 命中 dog（buffer 末尾出现完整暗语即触发）', function () {
  var sb = createSandbox();
  var hits = [];
  sb.SECRET.onHit(function (p) { hits.push(p.word); });
  sb.feed('XXDOGXX');
  assert.deepEqual(hits, ['dog'], 'XXDOGXX 应恰好命中一次 dog');
  // Array.from：getRoundHits() 返回 vm 沙箱 realm 的数组，与主 realm 字面量原型不同，
  // deepStrictEqual 会因 [[Prototype]] 不一致误判，先拷进主 realm 再比对（同 keyboard 测试手法）。
  assert.deepEqual(Array.from(sb.SECRET.getRoundHits()), ['dog']);
  console.log('PASS 2: XXDOGXX → dog（子串/末尾命中）。');
});

// =====================================================================
// 3. 大小写等价：DOG / Dog / dog 均命中 dog
// =====================================================================
test('3. 大小写等价（REQ-SEC-09）：DOG、Dog、dog 均命中同一暗语 dog', function () {
  ['DOG', 'Dog', 'dog', 'dOg'].forEach(function (variant) {
    var sb = createSandbox();
    var hits = [];
    sb.SECRET.onHit(function (p) { hits.push(p.word); });
    sb.feed(variant);
    assert.deepEqual(hits, ['dog'], variant + ' 应命中 dog');
  });
  console.log('PASS 3: DOG/Dog/dog/dOg 全部命中 dog（大小写等价）。');
});

// =====================================================================
// 4. 重叠触发：dogg 第 3 字母触发 dog、第 4 字母不重复触发
// =====================================================================
test('4. 重叠触发（REQ-SEC-05）：DOGG 第 3 个字母 G 触发 dog；第 4 个字母 G 不重复触发', function () {
  var sb = createSandbox();
  var hits = [];
  sb.SECRET.onHit(function (p) { hits.push(p.word); });

  sb.feed('D'); sb.feed('O'); sb.feed('G');
  assert.deepEqual(hits, ['dog'], '输入到第 3 个字母 G 时应触发 dog');
  assert.equal(sb.SECRET.getBuffer(), 'dog');

  sb.feed('G'); // 第 4 个字母
  assert.deepEqual(hits, ['dog'], '第 4 个字母 G 后 buffer 末尾为 ogg，不构成词，不重复触发');
  assert.equal(sb.SECRET.getBuffer(), 'dogg');
  console.log('PASS 4: DOGG 在第 3 字母触发 dog、第 4 字母不重复触发（重叠但不重复）。');
});

// =====================================================================
// 5. 最长词优先：注入 pool 含 car + scar，输入 ...scar → 命中 scar，非 car
// =====================================================================
test('5. 最长词优先（REQ-SEC-11）：pool 含 car+scar，输入 SCAR → 只命中最长的 scar', function () {
  var sb = createSandbox({
    manifestObject: injectedManifest([
      { word: 'car', spriteFile: 'sprites/car.png', audioFile: 'audio/words/car.m4a' },
      { word: 'scar', spriteFile: 'sprites/star.png', audioFile: 'audio/words/scar.m4a' }
    ])
  });
  var hits = [];
  sb.SECRET.onHit(function (p) { hits.push(p.word); });
  sb.feed('SCAR');
  assert.deepEqual(hits, ['scar'], '同位置 scar/car 同时结尾时应只触发最长的 scar，不触发 car');
  console.log('PASS 5: SCAR → 只命中 scar（最长优先，同位置不并发 car）。');
});

// =====================================================================
// 6. 复合顺序独立触发：注入 pool 含 hot + dog，输入 hotdog → hot 与 dog 各触发一次
// =====================================================================
test('6. 复合顺序独立触发（REQ-SEC-10）：pool 含 hot+dog，输入 HOTDOG → hot、dog 各独立触发一次', function () {
  var sb = createSandbox({
    manifestObject: injectedManifest([
      { word: 'hot', spriteFile: 'sprites/star.png', audioFile: 'audio/words/hot.m4a' },
      { word: 'dog', spriteFile: 'sprites/dog.png', audioFile: 'audio/words/dog.m4a' }
    ])
  });
  var hits = [];
  sb.SECRET.onHit(function (p) { hits.push(p.word); });
  sb.feed('HOTDOG');
  assert.deepEqual(hits, ['hot', 'dog'], 'hot（t 后）与 dog（g 后）应在不同位置各触发一次');
  assert.equal(sb.slotCalls.length, 2, '两次首次命中应点亮两个槽');
  assert.equal(sb.slotCalls[0].index, 0);
  assert.equal(sb.slotCalls[1].index, 1);
  console.log('PASS 6: HOTDOG → hot + dog 各触发一次（复合顺序独立触发），点亮两个槽。');
});

// =====================================================================
// 7. 双写不惩罚：apple（含 pp）正常命中
// =====================================================================
test('7. 双写不惩罚（REQ-SEC-06）：APPLE（含双写 pp）正常命中 apple', function () {
  var sb = createSandbox();
  var hits = [];
  sb.SECRET.onHit(function (p) { hits.push(p.word); });
  sb.feed('APPLE');
  assert.deepEqual(hits, ['apple'], 'APPLE 应命中 apple，双写 pp 不打断匹配');
  console.log('PASS 7: APPLE → apple（双写 pp 不惩罚）。');
});

// =====================================================================
// 8. 同轮重复只小反馈 + resetRound 后可再大反馈
// =====================================================================
test('8. 同轮重复只小反馈（REQ-SEC-07）：dog 两次 → 第 1 次 onHit+setSlot，第 2 次 onMinorHit 且 setSlot 未再调用；resetRound 后再 dog → 又 onHit', function () {
  var sb = createSandbox();
  var hits = [];
  var minors = [];
  sb.SECRET.onHit(function (p) { hits.push(p.word); });
  sb.SECRET.onMinorHit(function (p) { minors.push(p.word); });

  function imgCount() {
    var n = 0, i;
    for (i = 0; i < sb.createdTags.length; i++) { if (sb.createdTags[i] === 'img') n++; }
    return n;
  }

  sb.feed('DOG'); // 第一段 DOG → 首次命中（大反馈）
  assert.deepEqual(hits, ['dog'], '第一次命中触发 onHit');
  var audioAfterFirst = sb.audioCalls.length;
  var imgAfterFirst = imgCount();
  assert.equal(audioAfterFirst, 1, '首次命中调用 playWord 一次');
  assert.equal(imgAfterFirst, 1, '首次命中创建 1 张 sprite img');

  sb.feed('DOG'); // 第二段 DOG → 同轮重复（小反馈）
  assert.deepEqual(hits, ['dog'], '同轮重复不再触发 onHit');
  assert.deepEqual(minors, ['dog'], '同轮第二次命中触发 onMinorHit');
  assert.equal(sb.slotCalls.length, 1, '同轮重复命中不再点亮新槽（setSlot 仍只调用过 1 次）');
  // API doc 承诺"不重复出声/不重复 sprite"——断言小反馈期间 playWord 与 sprite img 均不增。
  assert.equal(sb.audioCalls.length, audioAfterFirst, '同轮重复命中不重复调用 playWord（不重复出声）');
  assert.equal(imgCount(), imgAfterFirst, '同轮重复命中不再创建 sprite img（不重复出对象）');
  // Array.from：见测试 2 同款跨 realm 说明。
  assert.deepEqual(Array.from(sb.SECRET.getRoundHits()), ['dog'], '本轮已命中集合去重后只有 dog');

  sb.SECRET.resetRound();
  sb.feed('DOG'); // 新一轮
  assert.deepEqual(hits, ['dog', 'dog'], 'resetRound 后同词可再次触发 onHit');
  assert.equal(sb.slotCalls.length, 2, 'resetRound 后再命中会再点亮一个槽');
  assert.equal(sb.slotCalls[1].index, 0, 'resetRound 重置了内部槽游标，从 0 重新开始');
  console.log('PASS 8: 同轮重复只 onMinorHit 不占槽；resetRound 后再命中恢复 onHit + 点槽。');
});

// =====================================================================
// 9. 命中调用 playWord 与 setSlot（含 resolveSpritePath 的 assets/ 前缀）
// =====================================================================
test('9. 命中反馈落地（REQ-SEC-03/REQ-AST-04 + 五槽联动）：调用 WTJ_AUDIO.playWord 与 WTJ_HUD.setSlot，spriteUrl 带 assets/ 前缀', function () {
  var sb = createSandbox();
  sb.SECRET.onHit(function () {});
  sb.feed('DOG');

  assert.equal(sb.audioCalls.length, 1, 'playWord 应被调用一次');
  assert.equal(sb.audioCalls[0].word, 'dog', 'playWord 收到 pool 条目（对象穿透式），word=dog');
  assert.equal(sb.audioCalls[0].audioFile, 'audio/words/dog.m4a', 'playWord 条目携带 audioFile');

  assert.equal(sb.slotCalls.length, 1, 'setSlot 应被调用一次');
  assert.equal(sb.slotCalls[0].index, 0, '首个命中点亮第 0 槽');
  assert.equal(sb.slotCalls[0].state.spriteUrl, 'assets/sprites/dog.png',
    'spriteUrl 应由 resolveSpritePath 把 sprites/ 拼成 assets/sprites/');

  // sprite 叠层：document 存在时应创建 div 容器 + img，且绝不创建 input/textarea。
  assert.ok(sb.createdTags.indexOf('div') !== -1, '应创建 sprite 叠层容器 div');
  assert.ok(sb.createdTags.indexOf('img') !== -1, '应创建 sprite img');
  assert.equal(sb.createdTags.indexOf('input'), -1, '绝不创建 input');
  assert.equal(sb.createdTags.indexOf('textarea'), -1, '绝不创建 textarea');
  console.log('PASS 9: 命中调用 playWord(dog 条目) + setSlot(0, spriteUrl=assets/sprites/dog.png)；sprite 叠层创建 div+img，无 input/textarea。');
});

// =====================================================================
// 10. playWord reject 不抛、不产生 unhandledRejection
// =====================================================================
test('10. 音效防御（吸取 013 P2）：playWord 返回被 reject 的 Promise 时不抛错、不冒 unhandledRejection', function () {
  var unhandled = [];
  function onUnhandled(reason) { unhandled.push(reason); }
  process.on('unhandledRejection', onUnhandled);

  var sb = createSandbox({ rejectAudio: true });
  sb.SECRET.onHit(function () {});
  assert.doesNotThrow(function () { sb.feed('DOG'); }, '命中处理不应因 playWord reject 而抛错');
  assert.equal(sb.audioCalls.length, 1, 'playWord 仍被调用');

  return new Promise(function (resolve) {
    // 给微任务/事件循环一拍，让潜在的 unhandledRejection 有机会冒出来。
    setTimeout(function () {
      process.removeListener('unhandledRejection', onUnhandled);
      assert.equal(unhandled.length, 0, 'playWord 的 rejection 应被引擎的 then(null, handler) 吞掉，不冒 unhandledRejection');
      console.log('PASS 10: playWord reject 被 rejection handler 捕获，无未处理拒绝、无抛错。');
      resolve();
    }, 20);
  });
});

// =====================================================================
// 11. 多订阅者 try/catch 隔离
// =====================================================================
test('11. 多订阅者隔离：多个 onHit 回调都被调用，其中一个抛错不影响其余', function () {
  var sb = createSandbox();
  var calledA = false;
  var calledB = false;
  sb.SECRET.onHit(function () { calledA = true; throw new Error('订阅者 A 故意抛错，验证 try/catch 隔离'); });
  sb.SECRET.onHit(function () { calledB = true; });
  assert.doesNotThrow(function () { sb.feed('DOG'); });
  assert.equal(calledA, true);
  assert.equal(calledB, true, '前一个订阅者抛错后，后一个订阅者仍应被调用');
  console.log('PASS 11: onHit 多订阅者逐个 try/catch 隔离，一个抛错不影响其余。');
});

// =====================================================================
// 12. 重复引入守卫
// =====================================================================
test('12. 重复引入守卫（吸取 013 P1）：再次执行 secretword.js 源码是安全 no-op，不重复订阅 onLetter、window.WTJ_SECRET 仍是实例 1', function () {
  var sb = createSandbox();
  var instance1 = sb.SECRET;
  assert.equal(sb.letterHandlers.length, 1, '首次加载应恰好订阅一次 onLetter');

  sb.reloadSecret(); // 第二次执行源码

  assert.equal(sb.window.WTJ_SECRET, instance1, '重复引入后 window.WTJ_SECRET 仍是实例 1');
  assert.equal(sb.letterHandlers.length, 1, '重复引入不应再次订阅 onLetter（守卫短路在接线副作用之前）');

  // 实例 1 仍正常工作：注册订阅、喂字母、命中触发。
  var hits = [];
  sb.window.WTJ_SECRET.onHit(function (p) { hits.push(p.word); });
  sb.feed('DOG');
  assert.deepEqual(hits, ['dog'], '实例 1 的字母流与订阅仍连通');
  console.log('PASS 12: 重复引入是安全 no-op —— 不重复订阅、绑定不被换掉、实例 1 仍连通。');
});

// =====================================================================
// 13. 防御式：KEYBOARD/AUDIO/HUD/document 缺失均不报错
// =====================================================================
test('13a. 防御式：WTJ_KEYBOARD 缺失（或加载顺序在后）时不抛错，API 仍挂载、buffer 为空', function () {
  var sb = createSandbox({ omitKeyboard: true });
  assert.ok(sb.SECRET, '缺 WTJ_KEYBOARD 时 window.WTJ_SECRET 仍应挂载');
  assert.equal(typeof sb.SECRET.onHit, 'function');
  assert.equal(sb.SECRET.getBuffer(), '', '没有字母源，buffer 应为空');
  console.log('PASS 13a: 缺 WTJ_KEYBOARD 时降级空转，不抛错，API 仍在。');
});

test('13b. 防御式：WTJ_AUDIO / WTJ_HUD / document 全部缺失时，命中仍触发 onHit、不抛错（无声、无点槽、无 sprite）', function () {
  var sb = createSandbox({ omitAudio: true, omitHud: true, omitDocument: true });
  var hits = [];
  sb.SECRET.onHit(function (p) { hits.push(p.word); });
  assert.doesNotThrow(function () { sb.feed('DOG'); });
  assert.deepEqual(hits, ['dog'], '即使 AUDIO/HUD/document 全缺，onHit 事件与去重逻辑照常工作');
  console.log('PASS 13b: 缺 AUDIO/HUD/document 时命中仍 onHit，不抛错（反馈优雅降级）。');
});

// =====================================================================
// 14. 真实 manifest 值对照（证明 vm 直跑真 manifest 落实）
// =====================================================================
test('14. vm 直跑真实 manifest.js：引擎读到的是产品真实词池（019 第二批扩展后 101 词：Pack B 100 + 遗留 treasurechest，matchRules 全开）', function () {
  var sb = createSandbox();
  var pool = sb.manifest.secretWords.pool;
  // 101 = Pack B 词池目标 100（见 manifest.secretWords.poolTargetSize）+ 1 条非 Pack B 遗留词
  // treasurechest（见 app/web/manifest.js secretWords 注释）。这个总数不随 DESIGN 后续把个别
  // 词从 stub 转 ready 而变化（那只改变某条目的 spriteStub 标记，不改变 pool 长度），
  // 只有 Pack B 目标词表本身变化（新增/移除词）才需要同步更新本断言。
  assert.equal(pool.length, 101, '019 第二批扩展后真实词池应为 101 条（Pack B 100 + 遗留 treasurechest 1 条）');
  assert.equal(sb.manifest.secretWords.poolTargetSize, 100, 'poolTargetSize 应仍标注 Pack B 的 100 词目标');
  var words = Array.prototype.map.call(pool, function (e) { return e.word; });
  assert.ok(words.indexOf('dog') !== -1 && words.indexOf('apple') !== -1 && words.indexOf('treasurechest') !== -1,
    '真实词池应含 dog / apple / treasurechest');
  var mr = sb.manifest.secretWords.matchRules;
  assert.equal(mr.caseInsensitive, true);
  assert.equal(mr.longestMatchPriority, true);
  assert.equal(mr.sameWordRepeatMinorFeedbackOnly, true);
  // treasurechest 对应文件名带连字符：验证引擎 resolveSpritePath 正确处理（命中后点槽 spriteUrl）。
  // 注意：Pack B 扩展后词池同时含 'treasure'（T 组正式 Pack B 词）与 'treasurechest'（遗留词），
  // 'treasurechest' 以 'treasure' 为真前缀 —— 输入 TREASURECHEST 时，缓冲区先在 treasure 结尾处
  // 独立命中一次 treasure（REQ-SEC-10 复合顺序独立触发，与 hotdog→hot+dog 同款行为，非引擎回归），
  // 再在 chest 结尾处命中完整的 treasurechest，因此应点亮两槽，而不是一槽。
  var slots = [];
  sb.window.WTJ_HUD.setSlot = function (i, s) { slots.push({ index: i, state: s }); };
  sb.SECRET.onHit(function () {});
  sb.feed('TREASURECHEST');
  assert.equal(slots.length, 2, 'treasure（前缀独立命中）与 treasurechest（完整词）应各自触发一次点槽');
  assert.equal(slots[0].state.spriteUrl, 'assets/sprites/treasure.png',
    '前缀独立命中的 treasure 是 Pack B 正式词，指向 assets/sprites/treasure.png');
  assert.equal(slots[1].state.spriteUrl, 'assets/sprites/treasure-chest.png',
    'treasurechest 词对应文件名 treasure-chest.png（带连字符），resolveSpritePath 拼成 assets/sprites/treasure-chest.png');
  console.log('PASS 14: 真实 manifest 101 词池（Pack B 100 + treasurechest）+ matchRules 全开；TREASURECHEST 先命中 treasure 再命中 treasurechest（复合顺序独立触发），后者 → assets/sprites/treasure-chest.png（连字符文件名正确）。');
});

// =====================================================================
// 15. 原型链安全（Fable P2-2）：pool 含与 Object.prototype 同名的纯字母词（constructor）时，
//     首次命中必须走大反馈（onHit + setSlot），绝不被误判为"同轮重复"而只小反馈。
// =====================================================================
test('15. 原型链安全（P2-2）：word="constructor" 首次命中走大反馈（onHit+setSlot），不被裸对象原型链误判为重复', function () {
  var sb = createSandbox({
    manifestObject: injectedManifest([
      { word: 'constructor', spriteFile: 'sprites/star.png', audioFile: 'audio/words/constructor.m4a' },
      { word: 'hasownproperty', spriteFile: 'sprites/ball.png', audioFile: 'audio/words/hop.m4a' }
    ])
  });
  var hits = [];
  var minors = [];
  sb.SECRET.onHit(function (p) { hits.push(p.word); });
  sb.SECRET.onMinorHit(function (p) { minors.push(p.word); });

  sb.feed('CONSTRUCTOR');
  assert.deepEqual(hits, ['constructor'], 'constructor 首次命中必须触发 onHit（大反馈），不得被原型链误判为重复');
  assert.deepEqual(minors, [], 'constructor 首次命中不得触发 onMinorHit');
  assert.equal(sb.slotCalls.length, 1, 'constructor 首次命中应点亮一槽（大反馈完整）');

  // 再验证同轮重复仍正确降级为小反馈（去重逻辑对同名词也正常工作）。
  sb.feed('CONSTRUCTOR');
  assert.deepEqual(hits, ['constructor'], '同轮重复 constructor 不再触发 onHit');
  assert.deepEqual(minors, ['constructor'], '同轮重复 constructor 触发 onMinorHit');
  assert.equal(sb.slotCalls.length, 1, '同轮重复不再点亮新槽');
  console.log('PASS 15: word="constructor" 首次大反馈、重复小反馈——无原型对象 + `=== true` 双保险生效，100 词池安全。');
});

// =====================================================================
// 16. buffer 限长（Fable P2-3）：喂 > BUFFER_MAX 个字符后，末尾的词仍能命中，且 getBuffer()
//     长度不超上限（BUFFER_MAX = max(最长词长度 × 2, 8)）。
// =====================================================================
test('16. buffer 限长（P2-3）：超长前缀 + 末尾词仍命中，getBuffer().length ≤ max(最长词×2, 8)', function () {
  var sb = createSandbox();
  // 从真实 manifest 推导上限，避免硬编码脆弱。
  var pool = sb.manifest.secretWords.pool;
  var maxWordLen = 0, i;
  for (i = 0; i < pool.length; i++) { if (pool[i].word.length > maxWordLen) maxWordLen = pool[i].word.length; }
  var cap = Math.max(maxWordLen * 2, 8); // 真实 treasurechest 长 13 → cap 26

  var hits = [];
  sb.SECRET.onHit(function (p) { hits.push(p.word); });

  // 喂远超 cap 的无害前缀（z 不构成任何词），再喂 dog。
  var junk = '';
  for (i = 0; i < cap + 20; i++) junk += 'Z';
  sb.feed(junk);
  assert.equal(hits.length, 0, '纯 Z 前缀不构成任何词，不应命中');
  assert.ok(sb.SECRET.getBuffer().length <= cap, 'buffer 应被截断到不超过上限 ' + cap + '，实际 ' + sb.SECRET.getBuffer().length);

  sb.feed('DOG');
  assert.deepEqual(hits, ['dog'], '超长前缀后，末尾 dog 仍能命中（截断不影响末尾匹配正确性）');
  assert.ok(sb.SECRET.getBuffer().length <= cap, '追加后 buffer 长度仍不超上限 ' + cap);
  console.log('PASS 16: 超长输入下 buffer 截断到 ≤ ' + cap + '，末尾词仍正确命中（限长不误伤匹配）。');
});

// =====================================================================
// 17. 开关 false 分支（Fable P2-3）：caseInsensitive:false → 大小写敏感；
//     longestMatchPriority:false → 非最长优先（取遍历中最先命中者）。
// =====================================================================
test('17a. caseInsensitive:false → 大小写敏感：DOG 不命中小写词 dog，dog 才命中', function () {
  var sb = createSandbox({
    manifestObject: injectedManifest(
      [{ word: 'dog', spriteFile: 'sprites/dog.png', audioFile: 'audio/words/dog.m4a' }],
      { caseInsensitive: false }
    )
  });
  var hits = [];
  sb.SECRET.onHit(function (p) { hits.push(p.word); });

  sb.feed('DOG'); // 大写：case-sensitive 下 buffer='DOG'，不匹配小写词 dog
  assert.deepEqual(hits, [], 'caseInsensitive:false 时 DOG（大写）不应命中小写词 dog');
  assert.equal(sb.SECRET.getBuffer(), 'DOG', 'buffer 未被 toLowerCase（大小写敏感分支）');

  sb.feed('dog'); // 小写：buffer 末尾 'dog' 命中
  assert.deepEqual(hits, ['dog'], 'caseInsensitive:false 时小写 dog 才命中');
  console.log('PASS 17a: caseInsensitive:false → 大小写敏感（DOG 不命中、dog 命中），覆盖 normalizeStr false 分支。');
});

test('17b. longestMatchPriority:false → 非最长优先：SCAR 命中遍历中最先命中的 car（pool 顺序 car 在前），不取最长 scar', function () {
  var sb = createSandbox({
    manifestObject: injectedManifest(
      [
        { word: 'car', spriteFile: 'sprites/car.png', audioFile: 'audio/words/car.m4a' },
        { word: 'scar', spriteFile: 'sprites/star.png', audioFile: 'audio/words/scar.m4a' }
      ],
      { longestMatchPriority: false }
    )
  });
  var hits = [];
  sb.SECRET.onHit(function (p) { hits.push(p.word); });
  sb.feed('SCAR');
  assert.deepEqual(hits, ['car'], 'longestMatchPriority:false 时同位置多词命中取遍历最先者 car（pool 中 car 在 scar 前），不取最长 scar');
  console.log('PASS 17b: longestMatchPriority:false → 取遍历最先命中者 car（非最长 scar），覆盖 best 保留分支。');
});
