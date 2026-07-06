// WTJ-20260704-019（第二批：秘密词 pool 扩展到 Pack B 100 词 + 素材集成）—— pool 完整性单测。
//
// 本文件只断言 app/web/manifest.js 的 secretWords.pool 数据本身的结构完整性与素材落地情况，
// 不重复测试 009（secretword.js）引擎的匹配算法行为（那些覆盖在 tests/unit/secretword-engine
// .test.mjs 里，本文件不重复）。刻意不依赖 docs/assets/production-pack-b/*.json（那是 DESIGN
// 侧持续变动的活数据源，运行时不消费它）——本文件只验证「已经同步进 app/web/manifest.js 的这份
// 快照」内部自洽、且引用的 sprite 文件在 app/web/assets/ 下真实存在，这样即使 Pack B 后续继续
// 补齐/变动，也不会让这份已落地的回归测试无端 flaky。
//
// Run:  node --test tests/unit/secretword-pool-integrity.test.mjs
//       （或整套件：node --test 'tests/unit/*.test.mjs'）
// Exit: 0 = all assertions passed, 1 = failure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var REPO_ROOT = path.resolve(__dirname, '../..');
var MANIFEST_JS_PATH = path.resolve(REPO_ROOT, 'app/web/manifest.js');
var SECRETWORD_JS_PATH = path.resolve(REPO_ROOT, 'app/web/secretword.js');
var ASSETS_ROOT = path.resolve(REPO_ROOT, 'app/web/assets');

function loadManifest() {
  var src = readFileSync(MANIFEST_JS_PATH, 'utf8');
  var sandbox = { window: {}, console: console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'manifest.js' });
  assert.ok(sandbox.window.WTJ_MANIFEST, '加载真实 manifest.js 后 window.WTJ_MANIFEST 应存在');
  return sandbox.window.WTJ_MANIFEST;
}

// 与 secretword.js 的 resolveSpritePath() 保持一致的最小重实现（本文件不 vm 跑 secretword.js
// 主流程，仅需要同款路径解析规则来定位磁盘文件；009 引擎自身的 resolveSpritePath 行为已由
// secretword-engine.test.mjs 覆盖，这里不重复断言其行为，只借用同规则定位文件）。
function resolveSpritePathForFs(spriteFile) {
  if (typeof spriteFile !== 'string' || spriteFile.length === 0) return null;
  if (spriteFile.indexOf('assets/') === 0) return spriteFile;
  if (spriteFile.indexOf('sprites/') === 0) return 'assets/' + spriteFile;
  return spriteFile;
}

test('1. pool 是合法数组，长度为 100（Pack B 99 词 + 1 条遗留 treasurechest，xylophone/xray 已由 fox 替换，WTJ-20260706-011/015）', function () {
  var manifest = loadManifest();
  var pool = manifest.secretWords.pool;
  assert.ok(Array.isArray(pool), 'secretWords.pool 必须是数组');
  assert.equal(pool.length, 100, 'pool 长度应为 100（Pack B 99 + 遗留 treasurechest 1 条，xylophone/xray 已由 fox 替换）');
  assert.equal(manifest.secretWords.poolTargetSize, 100, 'poolTargetSize 应仍标注 Pack B 的 100 词目标');
  var words1 = pool.map(function (e) { return e.word; });
  assert.equal(words1.indexOf('xylophone'), -1, 'pool 不应再包含已删除的 xylophone（教错 X 发音，WTJ-20260706-011 删除）');
  assert.equal(words1.indexOf('xray'), -1, 'pool 不应再包含 xray；X 改用结尾 x 词 fox（WTJ-20260706-015）');
  assert.notEqual(words1.indexOf('fox'), -1, 'pool 应包含 fox，作为结尾 x 教学词（WTJ-20260706-015）');
  console.log('PASS 1: pool 是数组，长度 100，poolTargetSize=100，pool 不含 xylophone/xray，且包含 fox。');
});

test('2. 每条词池条目字段合法：word 为纯小写字母、spriteFile/audioFile 均为非空字符串、audioFile 遵循 audio/words/<word>.m4a 约定', function () {
  var manifest = loadManifest();
  var pool = manifest.secretWords.pool;
  var badWord = [];
  var badSprite = [];
  var badAudio = [];
  pool.forEach(function (entry) {
    if (typeof entry.word !== 'string' || entry.word.length === 0 || !/^[a-z]+$/.test(entry.word)) {
      badWord.push(entry.word);
    }
    if (typeof entry.spriteFile !== 'string' || entry.spriteFile.length === 0) {
      badSprite.push(entry.word);
    }
    var expectedAudio = 'audio/words/' + entry.word + '.m4a';
    if (entry.audioFile !== expectedAudio) {
      badAudio.push(entry.word + ' (got ' + entry.audioFile + ', expected ' + expectedAudio + ')');
    }
  });
  assert.deepEqual(badWord, [], 'word 必须是纯小写字母（a-z），非法条目：' + badWord.join(', '));
  assert.deepEqual(badSprite, [], 'spriteFile 必须是非空字符串，非法条目：' + badSprite.join(', '));
  assert.deepEqual(badAudio, [], 'audioFile 必须遵循 audio/words/<word>.m4a 约定，偏离条目：' + badAudio.join(', '));
  console.log('PASS 2: 全部 100 条词池条目 word/spriteFile/audioFile 字段格式合法。');
});

test('3. 词池内无重复词（normalize 前字面值即唯一，避免同词重复条目导致匹配歧义）', function () {
  var manifest = loadManifest();
  var pool = manifest.secretWords.pool;
  var words = pool.map(function (e) { return e.word; });
  var seen = Object.create(null);
  var dupes = [];
  words.forEach(function (w) {
    if (seen[w]) dupes.push(w);
    seen[w] = true;
  });
  assert.deepEqual(dupes, [], '词池不应含重复词，发现重复：' + dupes.join(', '));
  console.log('PASS 3: 100 条词池条目无重复 word。');
});

test('4. ready 词（非 spriteStub）的 spriteFile 经路径解析后，对应文件在 app/web/assets/ 下真实存在', function () {
  var manifest = loadManifest();
  var pool = manifest.secretWords.pool;
  var missing = [];
  var readyCount = 0;
  pool.forEach(function (entry) {
    if (entry.spriteStub === true) return;
    readyCount++;
    var resolved = resolveSpritePathForFs(entry.spriteFile);
    var full = path.resolve(REPO_ROOT, 'app/web', resolved);
    if (!existsSync(full)) missing.push(entry.word + ' -> ' + full);
  });
  assert.deepEqual(missing, [], 'ready 词的 sprite 文件应真实存在，缺失：' + missing.join(', '));
  // 精确断言：本测试读的是已冻结进 manifest.js 的快照（非 Pack B 活数据源），故 ready 数是确定值。
  // fox 替换后，词池 100 条全部有真实 sprite（活跃 Pack B 99 + 遗留 treasurechest 1），无任何 stub。
  // 这个精确耦合是刻意的：将来若词池
  // 结构变化（增删词），编辑者需同步改此断言，用来提醒"改 pool 必须同步改断言"。
  // WTJ-20260706-011/015：删除 xylophone 并用 fox 替换 xray 后，Pack B 仍是 99 + 遗留 treasurechest。
  assert.equal(readyCount, 100, 'ready 词数量应精确为 100（Pack B 99 全 ready + 遗留 treasurechest 1，xylophone/xray 已由 fox 替换），实际 ' + readyCount);
  console.log('PASS 4: ' + readyCount + ' 条 ready 词的 sprite 文件均在 app/web/assets/ 下真实存在。');
});

test('5. 词池内已无 stub 词（活跃 Pack B sprite 已 ready 后 spriteStub 已清零）；且无任何词条仍指向共享占位图', function () {
  var manifest = loadManifest();
  var pool = manifest.secretWords.pool;
  // fox 替换后，活跃 Pack B sprite 均已产出完毕，词池内不应再有任何 spriteStub。
  // 若将来引入新词包又出现 stub 词，此断言会失败，提醒编辑者恢复 stub 校验逻辑（原历史版本断言
  // stub 集合为 [zebra,zipper,zucchini] 并校验其指向共享占位图，见 git 历史）。
  var stubEntries = pool.filter(function (e) { return e.spriteStub === true; });
  // Array.from：stubEntries 来自 vm 沙箱 realm，跨 realm 数组原型与主 realm 字面量不同，先拷回主 realm。
  var stubWords = Array.from(stubEntries.map(function (e) { return e.word; }));
  assert.deepEqual(stubWords, [], '词池内不应再有任何 stub 词（Pack B 已 100% ready），实际残留 spriteStub 词：' + stubWords.join(', '));

  // 同时确认：既然无 stub，也不应有任何词条的 spriteFile 仍指向共享占位图 secret-word-placeholder.png
  // （占位图本身作为备用素材保留在磁盘，但不得被任何 pool 条目引用）。
  var pointingToPlaceholder = pool.filter(function (e) {
    return path.basename(e.spriteFile) === 'secret-word-placeholder.png';
  }).map(function (e) { return e.word; });
  assert.deepEqual(Array.from(pointingToPlaceholder), [],
    '不应有任何词条 spriteFile 仍指向共享占位图，实际：' + pointingToPlaceholder.join(', '));
  console.log('PASS 5: 词池内 0 个 stub 词、0 个词条指向共享占位图 —— 活跃 Pack B sprite 已落地。');
});

test('6. ready 词与 stub 词数量互斥且合计等于 pool 总长度（无遗漏、无重复计数）', function () {
  var manifest = loadManifest();
  var pool = manifest.secretWords.pool;
  var readyCount = pool.filter(function (e) { return e.spriteStub !== true; }).length;
  var stubCount = pool.filter(function (e) { return e.spriteStub === true; }).length;
  assert.equal(readyCount + stubCount, pool.length, 'ready + stub 应等于 pool 总长度');
  console.log('PASS 6: ready=' + readyCount + '，stub=' + stubCount + '，合计=' + pool.length + '。');
});

test('7. 音频缺口标记保持一致：secretWords.audioNotDelivered=true，audioSupplyCard 指向 016 音频卡（本卡不产出音频，只同步 pool 数据）', function () {
  var manifest = loadManifest();
  assert.equal(manifest.secretWords.audioNotDelivered, true, 'audioNotDelivered 应仍为 true（137 条音频均未交付）');
  assert.equal(manifest.secretWords.audioSupplyCard, 'WTJ-20260704-016', 'audioSupplyCard 应仍指向 016 音频供给卡');
  console.log('PASS 7: audioNotDelivered=true，audioSupplyCard=WTJ-20260704-016，未被本卡误改。');
});

test('8. 关键既有词仍在池中且未被误删（dog/cat/apple/ball/star/car/basket/treasurechest，回归 004/009 首批基线）', function () {
  var manifest = loadManifest();
  var pool = manifest.secretWords.pool;
  var words = pool.map(function (e) { return e.word; });
  var legacyEight = ['dog', 'cat', 'apple', 'ball', 'star', 'car', 'basket', 'treasurechest'];
  var missing = legacyEight.filter(function (w) { return words.indexOf(w) === -1; });
  assert.deepEqual(missing, [], '首批 8 词基线不应被误删，缺失：' + missing.join(', '));
  console.log('PASS 8: 首批 8 词基线（dog/cat/apple/ball/star/car/basket/treasurechest）全部仍在扩展后的词池中。');
});

test('9. 首批 8 词基线中与 Pack B 重名的 7 词（dog/cat/apple/ball/star/car/basket）继续指向已验收 v3 baseline sprite 文件名，未被替换为 Pack B 重生成版（避免重复/冲突）', function () {
  var manifest = loadManifest();
  var pool = manifest.secretWords.pool;
  var expected = {
    dog: 'sprites/dog.png',
    cat: 'sprites/cat.png',
    apple: 'sprites/apple.png',
    ball: 'sprites/ball.png',
    star: 'sprites/star.png',
    car: 'sprites/car.png',
    basket: 'sprites/basket.png'
  };
  var byWord = {};
  pool.forEach(function (e) { byWord[e.word] = e; });
  Object.keys(expected).forEach(function (w) {
    assert.equal(byWord[w].spriteFile, expected[w], w + ' 的 spriteFile 应保持 v3 baseline 命名 ' + expected[w]);
  });
  console.log('PASS 9: 7 个重名词（dog/cat/apple/ball/star/car/basket）均沿用已验收 v3 baseline sprite 文件。');
});

test('10. app/web/assets/sprites/ 目录 PNG 与 pool 引用文件名双向一致（既无缺失、也无未被引用的孤儿）', function () {
  var manifest = loadManifest();
  var pool = manifest.secretWords.pool;
  var referencedBasenames = new Set();
  pool.forEach(function (entry) {
    referencedBasenames.add(path.basename(entry.spriteFile));
  });

  // 方向 A（引用 -> 文件）：pool 引用的每个文件名都必须在目录里真实存在（无悬空引用）。
  var missing = [];
  referencedBasenames.forEach(function (base) {
    var full = path.join(ASSETS_ROOT, 'sprites', base);
    if (!existsSync(full)) missing.push(base);
  });
  assert.deepEqual(missing, [], 'pool 引用的 sprite 文件名应在 app/web/assets/sprites/ 下全部存在，缺失：' + missing.join(', '));

  // 已知白名单孤儿：活跃 Pack B sprite ready 后，共享占位图 secret-word-placeholder.png 不再被任何 pool
  // 条目引用（0 stub），但作为"未来若有新 stub 词可复用"的备用素材保留在目录里，因此它是一个
  // 刻意保留、可接受的孤儿。若将来目录里放入被别的模块引用的文件，同样在此白名单显式登记，而不是
  // 放任未知孤儿。见 app/web/assets/sprites/PROVENANCE.md 占位图行注释。
  var KNOWN_ORPHAN_WHITELIST = ['secret-word-placeholder.png'];

  // 方向 B（文件 -> 引用）：目录里每个 .png（白名单除外）都必须被 pool 引用到，不允许存在未被任何
  // 词条引用的未知"孤儿" sprite（原用例只做了方向 A 的单向验证，名字却写"总数一致"，实际不能发现
  // 孤儿——对抗评审 P2-2 补齐反方向断言）。
  var pngFiles = readdirSync(path.join(ASSETS_ROOT, 'sprites')).filter(function (f) {
    return /\.png$/i.test(f);
  });
  var orphans = pngFiles.filter(function (f) {
    return !referencedBasenames.has(f) && KNOWN_ORPHAN_WHITELIST.indexOf(f) === -1;
  });
  assert.deepEqual(orphans, [], '目录里不应存在未被 pool 引用、且不在白名单内的孤儿 sprite，孤儿：' + orphans.join(', '));

  // 白名单孤儿确实真实存在于磁盘（保留素材不应缺失）。
  var whitelistMissing = KNOWN_ORPHAN_WHITELIST.filter(function (f) {
    return !existsSync(path.join(ASSETS_ROOT, 'sprites', f));
  });
  assert.deepEqual(whitelistMissing, [], '白名单保留素材应真实存在于磁盘，缺失：' + whitelistMissing.join(', '));

  // 严格相等：目录 PNG 总数 = pool 去重引用数 + 白名单孤儿数（互为完备划分，无未知文件）。
  assert.equal(pngFiles.length, referencedBasenames.size + KNOWN_ORPHAN_WHITELIST.length,
    '目录 PNG 数（' + pngFiles.length + '）应等于 pool 去重引用数（' + referencedBasenames.size + '）+ 白名单孤儿数（' + KNOWN_ORPHAN_WHITELIST.length + '）');
  console.log('PASS 10: 目录 ' + pngFiles.length + ' 个 PNG = pool 去重引用 ' + referencedBasenames.size + ' + 白名单孤儿 ' + KNOWN_ORPHAN_WHITELIST.length + '（双向一致，无缺失、无未知孤儿）。');
});

test('11. 009 引擎（secretword.js）加载扩展后的真实 pool 不抛错，且能正确挂载 window.WTJ_SECRET（防止本卡数据改动导致 009 装载期回归）', function () {
  var manifestSrc = readFileSync(MANIFEST_JS_PATH, 'utf8');
  var secretwordSrc = readFileSync(SECRETWORD_JS_PATH, 'utf8');
  var sandbox = {
    window: {
      WTJ_KEYBOARD: { onLetter: function () {} },
      WTJ_AUDIO: { playWord: function () { return Promise.resolve({ ok: true, silent: false }); } },
      WTJ_HUD: { setSlot: function () {} }
    },
    document: {
      createElement: function (tag) {
        return { tagName: String(tag).toUpperCase(), className: '', src: '', style: {}, children: [], setAttribute: function () {}, addEventListener: function () {}, appendChild: function () {}, removeChild: function () {} };
      },
      getElementById: function () { return null; },
      body: { appendChild: function () {}, removeChild: function () {} }
    },
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Promise: Promise
  };
  vm.createContext(sandbox);
  assert.doesNotThrow(function () {
    vm.runInContext(manifestSrc, sandbox, { filename: 'manifest.js' });
    vm.runInContext(secretwordSrc, sandbox, { filename: 'secretword.js' });
  }, '009 引擎加载 100 词扩展后的 pool 不应抛错');
  assert.ok(sandbox.window.WTJ_SECRET, 'window.WTJ_SECRET 应正常挂载');
  assert.equal(typeof sandbox.window.WTJ_SECRET.onHit, 'function');
  console.log('PASS 11: 009 引擎正常加载扩展后的 100 词 pool，无抛错，API 正常挂载。');
});

test('12. 命中冒烟：固定样本 Pack B 新增词（覆盖不同 batch，narrow refresh 后全部 ready），逐词单独喂入均能命中且 spriteUrl 指向真实专属 sprite', function () {
  var manifestSrc = readFileSync(MANIFEST_JS_PATH, 'utf8');
  var secretwordSrc = readFileSync(SECRETWORD_JS_PATH, 'utf8');

  function feedWordAndGetLastSlot(word) {
    var slots = [];
    var sandbox = {
      window: {
        WTJ_KEYBOARD: { onLetter: function (fn) { sandbox.window.__handler = fn; } },
        WTJ_AUDIO: { playWord: function () { return Promise.resolve({ ok: true, silent: false }); } },
        WTJ_HUD: { setSlot: function (i, s) { slots.push({ index: i, state: s }); } }
      },
      document: {
        createElement: function (tag) {
          return { tagName: String(tag).toUpperCase(), className: '', src: '', style: {}, children: [], setAttribute: function () {}, addEventListener: function () {}, appendChild: function () {}, removeChild: function () {} };
        },
        getElementById: function () { return null; },
        body: { appendChild: function () {}, removeChild: function () {} }
      },
      console: console,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      Promise: Promise
    };
    vm.createContext(sandbox);
    vm.runInContext(manifestSrc, sandbox, { filename: 'manifest.js' });
    vm.runInContext(secretwordSrc, sandbox, { filename: 'secretword.js' });
    var upper = word.toUpperCase();
    for (var i = 0; i < upper.length; i++) {
      sandbox.window.__handler(upper.charAt(i));
    }
    return slots;
  }

  // 固定样本（不是随机抽取——刻意挑覆盖不同 batch 的代表词，保证每次运行确定可复现）：
  // alligator（batch-02）/ umbrella（batch-03）/ wagon（batch-04 W 组）
  // + 结尾 x 教学词 fox（WTJ-20260706-015；xray/xylophone 不再作为样本）/ yoyo（Y 组，batch-04）
  // + narrow refresh 补齐的最后 Z 组 zebra（卡 054，现为 ready，下方单独断言其指向专属 sprite）。
  var samples = ['alligator', 'umbrella', 'wagon', 'fox', 'yoyo', 'zebra'];
  samples.forEach(function (word) {
    var slots = feedWordAndGetLastSlot(word);
    assert.ok(slots.length >= 1, word + ' 应至少触发一次点槽');
    var last = slots[slots.length - 1];
    assert.equal(last.state.spriteUrl.indexOf('assets/sprites/'), 0, word + ' 的 spriteUrl 应以 assets/sprites/ 开头');
    // narrow refresh 后全部 ready：spriteUrl 应指向各自专属 sprite，绝不再指向共享占位图。
    assert.notEqual(last.state.spriteUrl, 'assets/sprites/secret-word-placeholder.png',
      word + ' 已是 ready 词，spriteUrl 不应指向共享占位图');
  });
  // zebra 是本次 narrow refresh 补齐的 Z 组词（卡 054），现为 ready，spriteUrl 应指向专属 zebra.png。
  var zebraSlots = feedWordAndGetLastSlot('zebra');
  assert.equal(zebraSlots[zebraSlots.length - 1].state.spriteUrl, 'assets/sprites/zebra.png',
    'ready 词 zebra 的 spriteUrl 应指向专属 assets/sprites/zebra.png（不再是占位图）');
  console.log('PASS 12: 固定样本词（alligator/umbrella/wagon/fox/yoyo/zebra）均正确命中并解析到各自专属 sprite；zebra → assets/sprites/zebra.png（已转 ready）。');
});
