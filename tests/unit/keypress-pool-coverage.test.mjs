// WTJ-20260706-010 — 按键任务池全量覆盖单测（durable QA asset）。
//
// 卡片验收标准 #1/#2/#5：按键目标池必须全量覆盖 47 个目标（字母 A-Z 26 + 数字 0-9 10 + 符号
// comma/period/semicolon/minus/plus 5 + 特殊键 Space/Enter 2 + 方向键 up/down/left/right 4；
// Backspace 明确不纳入本轮），运行时随机池（app/web/manifest.js tasks.templates.press.examples，
// 即 task-templates.js getExamplesForType('press')/drawExampleIndex() 的洗牌袋数据源，详见
// task-templates.test.mjs「洗牌袋契约②」的抽取行为验证，本文件不重复跑洗牌袋机制本身）必须
// 实际使用这 47 个目标，且每条 manifest 音频引用要么已交付（文件真实存在于磁盘）要么明确留空
// （no-silent-fallback：绝不允许指向一个并不存在的文件）。
//
// 本文件只做静态数据完整性校验（manifest.js 数据 + tts-text-manifest(.zh).json 文案源 + 磁盘
// 音频文件三者的交叉核对），不重复跑 task-templates.js 的洗牌袋随机抽取机制本身（那部分已由
// task-templates.test.mjs 的「洗牌袋契约①②③④⑤」与「P1-1（扩展）」覆盖，本文件专注于"池子的
// 数据本身是否完整、是否自洽"这一层）。
//
// 现状（写这份测试时）：47 个目标里，7 个在本卡之前就已交付（press-a/b/m/s/3/5/7 的 ZH 完整句，
// 008/084 批准），40 个是本卡新增（voicePrompt 暂为空字符串——TL 暂停了裸 generate-tts-
// cosyvoice3.py 生成，改走共享 ASR-gated wrapper，音频生成是本卡的后续 commit）。本文件的断言
// 因此显式区分"已交付"与"待生成"两组，而不是要求全部 47 条都已经有音频——那样会跟当前真实交付
// 状态脱节，产生假失败。音频到位后只需要把对应 id 从 PENDING 挪到 DELIVERED 集合（或改用磁盘
// 现状动态判定，见下方 3./4. 号测试的实现方式），不需要重写整份文件。
//
// Run:  node --test tests/unit/keypress-pool-coverage.test.mjs
//       （或整套件：node --test 'tests/unit/*.test.mjs'）
// Exit: 0 = all assertions passed, 1 = failure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var REPO_ROOT = path.resolve(__dirname, '../..');
var APP_WEB = path.resolve(REPO_ROOT, 'app/web');
var MANIFEST_JS_PATH = path.resolve(APP_WEB, 'manifest.js');
var SCRIPT_DIR = path.resolve(REPO_ROOT, 'app/scripts');

function loadManifest() {
  var src = readFileSync(MANIFEST_JS_PATH, 'utf8');
  var sandbox = { window: {}, console: console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'manifest.js' });
  assert.ok(sandbox.window.WTJ_MANIFEST, '加载真实 manifest.js 后 window.WTJ_MANIFEST 应存在');
  return sandbox.window.WTJ_MANIFEST;
}

// ---------------------------------------------------------------------------
// 权威目标清单：47 = 26 字母 + 10 数字 + 5 符号 + 2 特殊键 + 4 方向键。Backspace 明确不纳入
// 本轮（卡片原文）。targetKey 值与 app/web/keyboard.js 的键身份归一化约定一致——字母/数字/
// 符号用原始字符（symbol 走 onSymbol(char) 原样透传），Space/Enter 用 normalizeFunctionKeyName()
// 归一化后的具名值，方向键用浏览器原生 e.key（keyboard.js 对方向键不做归一化）。
// ---------------------------------------------------------------------------
var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
var DIGITS = '0123456789'.split('');
var SYMBOLS = [',', '.', ';', '-', '+'];
var SPECIALS = ['Space', 'Enter'];
var ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

var CANONICAL_TARGET_KEYS = [].concat(LETTERS, DIGITS, SYMBOLS, SPECIALS, ARROWS);

// stem（语音文件名约定 press-<key>，与 id 的 letter/digit/symbol/key/arrow 前缀无关，见
// manifest.js press.examples 行内注释与 078/task-voice-path.test.mjs 记录的既有"id 与文件名
// stem 不一致"设计）。用于核对 tts-text-manifest(.zh).json 的 out 字段与磁盘文件名。
function stemForTargetKey(k) {
  if (k.length === 1 && /[A-Z]/.test(k)) return 'press-' + k.toLowerCase();
  if (k.length === 1 && /[0-9]/.test(k)) return 'press-' + k;
  if (k === ',') return 'press-comma';
  if (k === '.') return 'press-period';
  if (k === ';') return 'press-semicolon';
  if (k === '-') return 'press-minus';
  if (k === '+') return 'press-plus';
  if (k === 'Space') return 'press-space';
  if (k === 'Enter') return 'press-enter';
  if (k === 'ArrowUp') return 'press-up';
  if (k === 'ArrowDown') return 'press-down';
  if (k === 'ArrowLeft') return 'press-left';
  if (k === 'ArrowRight') return 'press-right';
  throw new Error('未知 targetKey，stemForTargetKey() 需要同步更新: ' + k);
}

// 本卡之前就已交付（008/084 批准，本卡不得触碰/重生成）的 7 个目标——用于断言"扩池没有误删/
// 误改已批准 example"。press-letter-m 的音频尤其是 008 专项修复过的干净版本，见卡片验收标准 #3。
var PRE_EXISTING_DELIVERED_KEYS = ['A', '3', 'B', 'S', 'M', '5', '7'];

test('1. 权威目标清单恰好 47 个（26 字母 + 10 数字 + 5 符号 + 2 特殊键 + 4 方向键），且互不重复', function () {
  assert.equal(CANONICAL_TARGET_KEYS.length, 47, '47 = 26 + 10 + 5 + 2 + 4');
  var uniq = new Set(CANONICAL_TARGET_KEYS);
  assert.equal(uniq.size, 47, '47 个目标 targetKey 不应有重复');
  assert.equal(CANONICAL_TARGET_KEYS.indexOf('Backspace'), -1, 'Backspace 明确不纳入本轮（卡片原文）');
});

test('2. manifest.js tasks.templates.press.examples 恰好 47 条，targetKey 集合与权威清单完全一致（无缺失、无多余、无重复）', function () {
  var manifest = loadManifest();
  var examples = manifest.tasks.templates.press.examples;
  assert.ok(Array.isArray(examples), 'press.examples 必须是数组');
  assert.equal(examples.length, 47, 'press.examples 应恰好 47 条——运行时随机池（getExamplesForType/drawExampleIndex 的洗牌袋数据源）必须实际使用全部 47 个目标，而不是本卡之前的 {A,B,M,S,3,5,7} 子集');

  // 跨 realm 陷阱（与本仓库其它 vm 沙箱测试同一说明，见 task-templates.test.mjs/voice-language
  // .test.mjs 文件头注释）：examples 是在 vm 沙箱 realm 里创建的数组，.map()/.sort() 产出的仍是
  // 沙箱 realm 的数组，其 Array.prototype 与本文件主 realm 不是同一个对象——assert.deepEqual
  // 会因 [[Prototype]] 不一致误判失败，即便内容逐项相同。这里改用 JSON.stringify 比较绕开陷阱
  // （数组元素都是原始字符串，序列化比较安全）。
  var seenKeys = [];
  for (var i = 0; i < examples.length; i++) {
    seenKeys.push(examples[i].targetKey);
  }
  assert.equal(new Set(seenKeys).size, 47, 'targetKey 不应有重复（否则洗牌袋会把两个不同 example 当同一个目标反复抽到，另一个目标永远不可达）');
  assert.equal(
    JSON.stringify(seenKeys.slice().sort()),
    JSON.stringify(CANONICAL_TARGET_KEYS.slice().sort()),
    'press.examples 的 targetKey 集合必须与权威 47 目标清单完全一致（无缺失、无多余）'
  );

  var seenIds = [];
  for (var j = 0; j < examples.length; j++) {
    seenIds.push(examples[j].id);
  }
  assert.equal(new Set(seenIds).size, 47, 'example id 不应有重复');
  console.log('PASS 2: press.examples 恰好 47 条，targetKey 与权威清单一一对应，id 无重复。');
});

test('3. 47 条 example 按 voicePrompt 是否为空分两组：7 条本卡之前已交付（未被本卡误删/误改），40 条本卡新增待生成（ASR-gated wrapper 就绪后接线）', function () {
  var manifest = loadManifest();
  var examples = manifest.tasks.templates.press.examples;
  var delivered = examples.filter(function (e) { return !!e.voicePrompt; });
  var pending = examples.filter(function (e) { return !e.voicePrompt; });

  assert.equal(delivered.length, 7, '本卡之前已交付的 7 条（press-a/b/m/s/3/5/7）应保持已交付，未被误清空');
  assert.equal(pending.length, 40, 'WTJ-20260706-010 新增的 40 条待生成 example 应保持 voicePrompt 为空字符串（no-silent-fallback），不应指向尚不存在的文件');

  // 跨 realm 陷阱（见测试 2 同款说明）：delivered 是从 vm 沙箱 realm 数组 .filter() 出来的，
  // 这里用手工循环搬运字符串（原始值不受 realm 影响）到主 realm 数组，再用 JSON.stringify 比较。
  var deliveredKeys = [];
  for (var k = 0; k < delivered.length; k++) {
    deliveredKeys.push(delivered[k].targetKey);
  }
  deliveredKeys.sort();
  assert.equal(
    JSON.stringify(deliveredKeys),
    JSON.stringify(PRE_EXISTING_DELIVERED_KEYS.slice().sort()),
    '已交付的 7 个 targetKey 必须恰好是本卡之前批准的 {A,3,B,S,M,5,7}，不多不少'
  );

  var m = delivered.find(function (e) { return e.targetKey === 'M'; });
  assert.ok(m, '按键 M 的 example 必须存在');
  assert.equal(m.voicePrompt, 'audio/tasks/press-m.zh.m4a', 'press-letter-m 必须沿用 008 已批准的干净 press-m.zh.m4a，本卡不得重新生成/替换');
  console.log('PASS 3: 7 条已交付（含 M 沿用 008 批准版本）、40 条待生成，无误删/误改。');
});

test('4. 全部 7 条已交付 example：voicePrompt 磁盘文件真实存在且非空、与 tts-text-manifest.zh.json 的 out 字段一致（不是凭 id 猜文件名）', function () {
  var manifest = loadManifest();
  var examples = manifest.tasks.templates.press.examples;
  var delivered = examples.filter(function (e) { return !!e.voicePrompt; });

  var zhManifest = JSON.parse(readFileSync(path.join(SCRIPT_DIR, 'tts-text-manifest.zh.json'), 'utf8'));

  delivered.forEach(function (ex) {
    var zhEntry = zhManifest.tasks[ex.id];
    assert.ok(zhEntry, ex.id + ' 应在 tts-text-manifest.zh.json.tasks 里有对应条目');
    assert.equal(ex.voicePrompt, zhEntry.out, ex.id + ': manifest.js voicePrompt 必须恰好等于 tts-text-manifest.zh.json 该 id 的 out 字段（权威路径来源，不能凭 id 猜文件名）');

    var abs = path.join(APP_WEB, ex.voicePrompt);
    assert.equal(existsSync(abs), true, ex.id + ' 的 voicePrompt 对应文件必须在磁盘上真实存在: ' + ex.voicePrompt);
    assert.ok(statSync(abs).size > 0, ex.id + ' 的音频文件不应是 0 字节空文件: ' + ex.voicePrompt);
  });
  console.log('PASS 4: 7 条已交付 example 的音频文件均真实存在、非空，且与 tts-text-manifest.zh.json 的 out 字段一致。');
});

test('5. 全部 40 条待生成 example：EN(tts-text-manifest.json) 与 ZH(tts-text-manifest.zh.json) 均已备好草稿文案，out 路径遵循 audio/tasks/press-<key>.[zh.]m4a 约定，命名 stem 与 targetKey 推导一致（生成脚本就绪后可直接 --only 命中，不需要再补文案）', function () {
  var manifest = loadManifest();
  var examples = manifest.tasks.templates.press.examples;
  var pending = examples.filter(function (e) { return !e.voicePrompt; });

  var enManifest = JSON.parse(readFileSync(path.join(SCRIPT_DIR, 'tts-text-manifest.json'), 'utf8'));
  var zhManifest = JSON.parse(readFileSync(path.join(SCRIPT_DIR, 'tts-text-manifest.zh.json'), 'utf8'));

  pending.forEach(function (ex) {
    var stem = stemForTargetKey(ex.targetKey);

    var enEntry = enManifest.tasks[ex.id];
    assert.ok(enEntry, ex.id + ' 应在 tts-text-manifest.json.tasks 里有 EN 草稿文案');
    assert.equal(enEntry.out, 'audio/tasks/' + stem + '.m4a', ex.id + ': EN out 路径应遵循 audio/tasks/' + stem + '.m4a 约定');
    assert.equal(typeof enEntry.text, 'string', ex.id + ': EN 文案应为字符串');
    assert.ok(enEntry.text.length > 0, ex.id + ': EN 文案不应为空');

    var zhEntry = zhManifest.tasks[ex.id];
    assert.ok(zhEntry, ex.id + ' 应在 tts-text-manifest.zh.json.tasks 里有 ZH 草稿文案');
    assert.equal(zhEntry.out, 'audio/tasks/' + stem + '.zh.m4a', ex.id + ': ZH out 路径应遵循 audio/tasks/' + stem + '.zh.m4a 约定');
    assert.equal(typeof zhEntry.text, 'string', ex.id + ': ZH 文案应为字符串');
    assert.ok(zhEntry.text.length > 0, ex.id + ': ZH 文案不应为空');

    // 待生成阶段：磁盘上不应该已经出现这个文件（no-silent-fallback 的另一面——不能悄悄用一个
    // 语义不匹配/提前占位的文件充数；真正生成后这条断言会自然需要更新，届时该 id 也会从
    // pending 移到 delivered，见上方测试 3/4）。
    assert.equal(existsSync(path.join(APP_WEB, 'audio/tasks/' + stem + '.m4a')), false, stem + '.m4a 待生成，此刻不应已存在于磁盘（如果存在，说明该目标其实已交付，manifest.js voicePrompt 应同步接线而不是留空）');
    assert.equal(existsSync(path.join(APP_WEB, 'audio/tasks/' + stem + '.zh.m4a')), false, stem + '.zh.m4a 待生成，此刻不应已存在于磁盘');
  });
  console.log('PASS 5: 40 条待生成 example 的 EN/ZH 草稿文案均就绪，out 路径约定正确，磁盘上确认尚未提前放置任何占位文件。');
});

// ---------------------------------------------------------------------------
// 6. no-silent-fallback 机制自证：缺音频必须让校验失败，而不是静默通过。
//
// 用与测试 4 同一套"voicePrompt 必须指向磁盘上真实存在的非空文件"校验逻辑，包成一个可复用的
// 断言函数，分别喂：(a) 一个真实已交付的 press example（应通过）；(b) 一个内存里构造的、
// voicePrompt 指向不存在路径的假 example（不触碰真实 manifest.js/磁盘，只是同构的普通对象）
// ——验证后者必定抛错（assert.throws），证明这套校验机制本身具备"缺音频就 FAIL"的能力，
// 不会把缺失文件误判成静默通过。
// ---------------------------------------------------------------------------
function assertVoiceDeliveredOrThrow(example) {
  assert.equal(typeof example.voicePrompt, 'string', example.id + ': voicePrompt 必须是字符串');
  assert.ok(example.voicePrompt.length > 0, example.id + ': voicePrompt 不应为空字符串（此函数只用于校验"应已交付"的 example）');
  var abs = path.join(APP_WEB, example.voicePrompt);
  assert.equal(existsSync(abs), true, example.id + ' 的 voicePrompt 对应文件必须在磁盘上真实存在: ' + example.voicePrompt);
  assert.ok(statSync(abs).size > 0, example.id + ' 的音频文件不应是 0 字节空文件: ' + example.voicePrompt);
}

test('6. 缺音频时校验必须 FAIL，不能静默通过：真实已交付 example 通过校验；voicePrompt 指向不存在文件的合成 example 必须抛错', function () {
  var manifest = loadManifest();
  var realDelivered = manifest.tasks.templates.press.examples.find(function (e) { return e.targetKey === 'A'; });
  assert.ok(realDelivered, '应能在真实 manifest 中找到 press-letter-a（targetKey A）');
  assert.doesNotThrow(function () {
    assertVoiceDeliveredOrThrow(realDelivered);
  }, '真实已交付的 press-letter-a 应通过校验，不应抛错');

  var fakeMissing = {
    id: 'press-letter-does-not-exist',
    targetKey: 'ZZ',
    voicePrompt: 'audio/tasks/press-does-not-exist.zh.m4a', // 刻意构造的不存在路径，不触碰真实磁盘/manifest
    successAudio: 'audio/sfx/task-success.m4a'
  };
  assert.equal(existsSync(path.join(APP_WEB, fakeMissing.voicePrompt)), false, '前置条件：该合成路径在磁盘上确实不存在');
  assert.throws(function () {
    assertVoiceDeliveredOrThrow(fakeMissing);
  }, /对应文件必须在磁盘上真实存在/, '缺音频的合成 example 必须让校验函数抛错（FAIL），不能静默判定为通过——这正是本卡验收标准 #5 "缺音频时测试 FAIL 而不是静默 fallback" 的字面体现');
  console.log('PASS 6: 校验函数对真实已交付 example 通过、对缺音频的合成 example 正确抛错，证明"缺音频必 FAIL"而非静默通过。');
});
