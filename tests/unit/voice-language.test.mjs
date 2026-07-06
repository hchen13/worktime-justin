// WTJ-20260705-018 — voice-language.js 单元测试（durable QA asset）
//
// 覆盖验收标准 #4："设置里可语言/任务语音模式切换：中文 / 英文 / 跟随素材可用性；某语言
// 素材缺失必须明确禁用或提示,不能 silent fallback"。
//
// 用 Node 内置 vm 模块搭沙箱（与 task-voice-path.test.mjs / hud.test.mjs 同一手法）加载真实
// app/web/voice-language.js，对照磁盘真实文件（app/web/audio/tasks/*.m4a）核对模块内置的
// ALL_TASK_IDS / EN_AVAILABLE_TASK_IDS / ZH_AVAILABLE_TASK_IDS 三份静态清单没有漂移——这三份
// 清单是本文件顶部注释里明确要求"随交付同步维护"的数据，任何后续卡片交付新素材却忘记同步
// 更新，这里的断言会当场失败。
//
// Run:  node --test tests/unit/voice-language.test.mjs
//       （或整目录，本机 Node 用 glob 不能裸目录）：node --test 'tests/unit/*.test.mjs'
// Exit: 0 = all assertions passed, 1 = failure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var APP_WEB = path.resolve(__dirname, '../../app/web');
var VOICE_LANG_SRC = readFileSync(path.join(APP_WEB, 'voice-language.js'), 'utf8');

// --- 最小 localStorage stub（进程内 Map，每次 makeSandbox() 都是全新一份，测试间不串扰）---
function makeFakeLocalStorage(preset) {
  var store = {};
  if (preset) {
    Object.keys(preset).forEach(function (k) { store[k] = preset[k]; });
  }
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    _dump: function () { return Object.assign({}, store); }
  };
}

function makeSandbox(opts) {
  opts = opts || {};
  var warnCalls = [];
  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.localStorage = makeFakeLocalStorage(opts.presetStorage);
  sandbox.console = {
    warn: function () { warnCalls.push(Array.prototype.slice.call(arguments).join(' ')); },
    error: function () {},
    log: function () {}
  };
  vm.createContext(sandbox);
  var src = opts.sourceOverride || VOICE_LANG_SRC;
  vm.runInContext(src, sandbox, { filename: 'voice-language.js' });
  return { sandbox: sandbox, api: sandbox.window.WTJ_VOICE_LANG, warnCalls: warnCalls };
}

// =====================================================================================
// 1. 默认模式 / 可用性快照：中文当前 24/24 完整，英文仅 8/24（与 audio/missing-audio.json
//    的 taskVoice(8)/taskVoiceZh(24) 两段、磁盘 app/web/audio/tasks/ 现存文件一致）。
// =====================================================================================

test('1. 默认模式为 zh；getAvailability() 如实反映 zh 32/32 完整、en 8/32 不完整（WTJ-20260705-024 交付 8 条新中文任务后）', function () {
  var env = makeSandbox();
  assert.equal(env.api.getMode(), 'zh', '未持久化过选择时默认模式应为 zh（与 manifest.js 当前 voicePrompt 默认值一致）');

  var avail = env.api.getAvailability();
  assert.equal(avail.zh.totalCount, 32);
  assert.equal(avail.zh.deliveredCount, 32);
  assert.equal(avail.zh.complete, true);
  assert.equal(avail.zh.missingIds.length, 0);

  assert.equal(avail.en.totalCount, 32);
  assert.equal(avail.en.deliveredCount, 8);
  assert.equal(avail.en.complete, false);
  assert.equal(avail.en.missingIds.length, 24);
  console.log('PASS 1: 默认 zh，可用性快照 zh=32/32（完整）/ en=8/32（不完整）与磁盘现状一致。');
});

// =====================================================================================
// 2. no-silent-fallback 核心：setMode('en') 在素材不全时必须被拒绝，且不改变当前模式。
// =====================================================================================

test('2. setMode("en") 素材不全 -> {ok:false, reason:"incomplete-assets"}，模式不变，且有 console.warn 诊断', function () {
  var env = makeSandbox();
  var result = env.api.setMode('en');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'incomplete-assets');
  assert.equal(env.api.getMode(), 'zh', 'setMode 失败不应改变当前生效模式');
  assert.ok(env.warnCalls.length > 0, '拒绝切换时应至少 warnOnce 一次可诊断文案');
  console.log('PASS 2: setMode("en") 在 8/32 不完整时被拒绝，模式仍为 zh，未静默切换。');
});

test('2b. setMode("zh") 素材完整 -> {ok:true}；setMode("auto") 恒可选 -> {ok:true}', function () {
  var env = makeSandbox();
  var r1 = env.api.setMode('zh');
  assert.equal(r1.ok, true);
  assert.equal(env.api.getMode(), 'zh');

  var r2 = env.api.setMode('auto');
  assert.equal(r2.ok, true);
  assert.equal(env.api.getMode(), 'auto');
  console.log('PASS 2b: setMode("zh")/setMode("auto") 均成功（zh 完整、auto 恒可选）。');
});

test('2c. setMode(非法值) -> {ok:false, reason:"invalid-mode"}，模式不变', function () {
  var env = makeSandbox();
  var result = env.api.setMode('fr');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid-mode');
  assert.equal(env.api.getMode(), 'zh');
  console.log('PASS 2c: setMode("fr") 非法模式被拒绝。');
});

// =====================================================================================
// 3. getEffectiveLanguage()："auto"（跟随素材可用性）在当前 zh 完整时应折算为 'zh'。
// =====================================================================================

test('3. mode="auto" 时 getEffectiveLanguage() 折算为 "zh"（zh 当前完整，优先于不完整的 en）', function () {
  var env = makeSandbox();
  env.api.setMode('auto');
  assert.equal(env.api.getEffectiveLanguage(), 'zh');
  console.log('PASS 3: auto 模式折算为 zh。');
});

test('3b. mode="zh" 时 getEffectiveLanguage() 恒为 "zh"', function () {
  var env = makeSandbox();
  assert.equal(env.api.getEffectiveLanguage(), 'zh');
  console.log('PASS 3b: zh 模式折算为 zh。');
});

// =====================================================================================
// 4. resolveTaskVoicePath()：zh 模式下，已知任务返回其 .zh.m4a 路径（真实磁盘文件存在）。
// =====================================================================================

test('4. resolveTaskVoicePath(taskDef) — zh 模式，已知任务 id 返回 .zh.m4a 路径，磁盘文件真实存在', function () {
  var env = makeSandbox();
  var taskDef = { id: 'press-a', voicePrompt: 'audio/tasks/press-a.zh.m4a' };
  var resolved = env.api.resolveTaskVoicePath(taskDef);
  assert.equal(resolved, 'audio/tasks/press-a.zh.m4a');
  assert.equal(existsSync(path.join(APP_WEB, resolved)), true);
  console.log('PASS 4: zh 模式 resolveTaskVoicePath(press-a) -> ' + resolved + '，磁盘文件存在。');
});

test('4b. resolveTaskVoicePath() 也接受裸路径字符串入参（与 audio.js.playTaskVoice 同一入参形状）', function () {
  var env = makeSandbox();
  var resolved = env.api.resolveTaskVoicePath('audio/tasks/find-the-dog.zh.m4a');
  assert.equal(resolved, 'audio/tasks/find-the-dog.zh.m4a');
  console.log('PASS 4b: 裸路径字符串入参正常解析。');
});

// =====================================================================================
// 5. no-silent-fallback 防御分支：resolveTaskVoicePath() 对"当前生效语言里查不到这条任务"
//    的情况必须返回 null（拒绝播放），不能悄悄改播另一种语言；zh 侧可直接用真实模块验证
//    （给一个不在 ZH_AVAILABLE_TASK_IDS 里的陌生 id）。
// =====================================================================================

test('5. resolveTaskVoicePath() 对未知任务 id（不在 zh 清单里）返回 null，不静默改播其它语言，且有诊断', function () {
  var env = makeSandbox();
  var taskDef = { id: 'totally-unknown-task-xyz', voicePrompt: 'audio/tasks/totally-unknown-task-xyz.zh.m4a' };
  var resolved = env.api.resolveTaskVoicePath(taskDef);
  assert.equal(resolved, null, '未知任务 id 应返回 null（拒绝播放），不是回退到任何路径');
  assert.ok(env.warnCalls.length > 0, '应有 warnOnce 诊断说明拒绝原因');
  console.log('PASS 5: 未知任务 id -> resolveTaskVoicePath 返回 null，未静默回退，有诊断。');
});

test('5b. resolveTaskVoicePath(缺 voicePrompt 字段的对象) -> null（无法解析，安全短路）', function () {
  var env = makeSandbox();
  assert.equal(env.api.resolveTaskVoicePath({ id: 'press-a' }), null);
  assert.equal(env.api.resolveTaskVoicePath(null), null);
  assert.equal(env.api.resolveTaskVoicePath(undefined), null);
  console.log('PASS 5b: 缺 voicePrompt / null / undefined 入参均安全返回 null，不抛错。');
});

// =====================================================================================
// 6. localStorage 持久化：setMode 成功后写入 localStorage；重新加载模块（新沙箱，模拟重启
//    app）能读回同一 mode。localStorage 缺失/抛错时静默退化为内存变量，不影响功能。
// =====================================================================================

test('6. setMode("auto") 持久化到 localStorage，新沙箱（模拟重启）读回 "auto"', function () {
  var env1 = makeSandbox();
  env1.api.setMode('auto');
  var stored = env1.sandbox.localStorage._dump();
  assert.equal(stored.wtjVoiceLanguageMode, 'auto');

  var env2 = makeSandbox({ presetStorage: stored });
  assert.equal(env2.api.getMode(), 'auto', '新沙箱（模拟重启）应从 localStorage 读回上次选择');
  console.log('PASS 6: setMode 的选择持久化到 localStorage，重启后（新沙箱）能读回。');
});

test('6b. localStorage 缺失时 setMode/getMode 仍工作（进程内内存兜底，不抛错）', function () {
  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = { warn: function () {}, error: function () {}, log: function () {} };
  // 故意不提供 sandbox.localStorage —— 模拟 localStorage 完全不可用的环境。
  vm.createContext(sandbox);
  vm.runInContext(VOICE_LANG_SRC, sandbox, { filename: 'voice-language.js' });
  var api = sandbox.window.WTJ_VOICE_LANG;
  var r = api.setMode('auto');
  assert.equal(r.ok, true);
  assert.equal(api.getMode(), 'auto');
  console.log('PASS 6b: localStorage 缺失时 setMode/getMode 仍正常工作（内存兜底）。');
});

test('6c. localStorage 存有非法值（不在 zh/en/auto 之列）时安全忽略，回退默认 zh', function () {
  var env = makeSandbox({ presetStorage: { wtjVoiceLanguageMode: 'fr' } });
  assert.equal(env.api.getMode(), 'zh', '存储的非法值应被忽略，回退默认 zh');
  console.log('PASS 6c: localStorage 里的非法历史值被安全忽略，回退默认 zh。');
});

// =====================================================================================
// 7. 防御双保险：即便 localStorage 里直接被写成不完整的 'en'（绕过 setMode 的守卫，模拟
//    篡改/历史遗留数据），getEffectiveLanguage() 仍应折算回 'zh'，不会真的用 en 语言。
// =====================================================================================

test('7. localStorage 被绕过 setMode 直接写成不完整的 "en" -> getEffectiveLanguage() 仍折算回 "zh"（双保险）', function () {
  var env = makeSandbox({ presetStorage: { wtjVoiceLanguageMode: 'en' } });
  assert.equal(env.api.getMode(), 'en', 'getMode() 如实反映存储值（即便不完整）');
  assert.equal(env.api.getEffectiveLanguage(), 'zh', 'getEffectiveLanguage() 的双保险应拒绝使用不完整的 en，折算回 zh');

  var taskDef = { id: 'press-a', voicePrompt: 'audio/tasks/press-a.zh.m4a' };
  assert.equal(env.api.resolveTaskVoicePath(taskDef), 'audio/tasks/press-a.zh.m4a',
    '折算回 zh 后，resolveTaskVoicePath 应正常返回 zh 路径，而不是因为 mode 字面值是 en 就尝试解析英文路径');
  console.log('PASS 7: 篡改 localStorage 为不完整的 en 也不会真正生效，双保险折算回 zh。');
});

// =====================================================================================
// 8. "英文全量交付后" 场景（源码字符串替换出一份假想沙箱，模拟 EN_AVAILABLE_TASK_IDS 未来
//    补全为 24/24）：验证一旦素材真的补全，setMode('en') 应该顺利放行、getEffectiveLanguage
//    返回 'en'、resolveTaskVoicePath 对已知任务能正确推导出英文 .m4a 路径（deriveVoicePaths
//    的 .zh.m4a -> .m4a 转换逻辑）；同时验证"清单里没有的陌生任务 id"在这份假想完整英文
//    环境下依然会被拒绝（不是"只要语言完整就来者不拒"）。
// =====================================================================================

test('8. 假想英文全量交付场景：setMode("en") 放行、getEffectiveLanguage="en"、已知任务解析出正确 .m4a 路径；陌生 id 仍被拒绝', function () {
  // 把 EN_AVAILABLE_TASK_IDS 的初始化替换成"与 ALL_TASK_IDS 相同"，模拟英文素材补齐到 24/24——
  // 只在这一份内存字符串上做替换，不触碰磁盘上的真实 voice-language.js。
  var patched = VOICE_LANG_SRC.replace(
    /var EN_AVAILABLE_TASK_IDS = \[[\s\S]*?\];/,
    'var EN_AVAILABLE_TASK_IDS = ALL_TASK_IDS.slice();'
  );
  assert.notEqual(patched, VOICE_LANG_SRC, '替换应当命中（否则说明源码结构变了，这条测试需要同步更新正则）');

  var env = makeSandbox({ sourceOverride: patched });
  var r = env.api.setMode('en');
  assert.equal(r.ok, true, '假想英文补齐到 24/24 后，setMode("en") 应该被放行');
  assert.equal(env.api.getEffectiveLanguage(), 'en');

  var taskDef = { id: 'find-the-cat', voicePrompt: 'audio/tasks/find-the-cat.zh.m4a' };
  assert.equal(env.api.resolveTaskVoicePath(taskDef), 'audio/tasks/find-the-cat.m4a',
    'deriveVoicePaths 应把 .zh.m4a 正确转换为对应的英文 .m4a 路径');

  // 陌生 id（不在 ALL_TASK_IDS 里）：即便整体语言"完整"，这条具体任务仍查不到，必须拒绝。
  var unknownDef = { id: 'brand-new-task-not-yet-registered', voicePrompt: 'audio/tasks/brand-new-task-not-yet-registered.zh.m4a' };
  assert.equal(env.api.resolveTaskVoicePath(unknownDef), null,
    '未登记进清单的陌生任务 id，即便语言整体判定为完整，也不应该被静默播放');
  console.log('PASS 8: 假想英文全量交付场景验证通过——放行/生效语言/路径推导/陌生 id 拒绝均符合预期。');
});

// =====================================================================================
// 9. 静态清单与磁盘现状 / manifest.js 一致性核对（防漂移）
// =====================================================================================

test('9a. ALL_TASK_IDS 恰好 32 条，与 manifest.js 四类模板 example 的 voicePrompt 文件 stem 并集一致（024 交付 8 条新中文任务后）', function () {
  var env = makeSandbox();
  var manifestSrc = readFileSync(path.join(APP_WEB, 'manifest.js'), 'utf8');
  var manifestSandbox = {};
  manifestSandbox.window = manifestSandbox;
  vm.createContext(manifestSandbox);
  vm.runInContext(manifestSrc, manifestSandbox, { filename: 'manifest.js' });
  var templates = manifestSandbox.window.WTJ_MANIFEST.tasks.templates;
  // 注意：这里必须按 voicePrompt 文件名 stem 归集，不能用 ex.id——manifest.js 的 press 类
  // 任务里 id（如 "press-letter-a"）与其语音文件 stem（"press-a"）历来就允许不一致（078 卡
  // 记录、task-voice-path.test.mjs 有专项断言），voice-language.js 的三份清单统一按"语音
  // 文件 stem"编目（见该文件 extractTaskId() 顶部的详细说明），这里的核对必须用同一套 key
  // 空间，否则会产生一次假阳性的"清单漂移"报告。
  //
  // WTJ-20260705-025：跳过 voicePrompt 为空字符串的 example——这些是本卡新增、024/084 尚未
  // 交付中文语音的任务（drag 池扩容的 6 条 + door/doorbell 点击任务 2 条，见 manifest.js
  // 对应 example 行内注释的 no-silent-fallback 说明）。它们的 voicePrompt 是空字符串这个
  // "falsy 短路"本身就是设计好的降级路径（task.js/voice-language.js 见到空 voicePrompt 会
  // 直接跳过播放，不会走到 ALL_TASK_IDS 查找这一步，见 voice-language.js resolveTaskVoicePath()
  // 的 `if (!voicePrompt) return null;` 首行短路），因此它们**刻意不参与**本文件 ALL_TASK_IDS
  // 的语言完整度台账——这既避免了把"个别新任务缺配音"错误折算成"中文这门语言本身不完整"从而
  // 意外禁用家长设置面板里已经稳定工作的"中文"选项，也不需要为它们编造一个从未真实交付的
  // stem 字符串。缺口台账另见 app/web/audio/missing-audio.json 的 taskVoiceZh 新增
  // not-delivered 条目与 app/scripts/tts-text-manifest.zh.json 的 tasksPending 段落。
  var stemIds = [];
  ['drag', 'click', 'find', 'press'].forEach(function (type) {
    (templates[type].examples || []).forEach(function (ex) {
      if (!ex.voicePrompt) {
        return;
      }
      var m = /([^\/]+?)(\.zh)?\.m4a$/i.exec(ex.voicePrompt);
      stemIds.push(m ? m[1] : ex.voicePrompt);
    });
  });

  var allTaskIds = env.api.getAllTaskIds();
  assert.equal(allTaskIds.length, 32);
  // JSON.stringify 比较（而非 assert.deepEqual/deepStrictEqual 直接比较数组）：allTaskIds 是
  // vm 沙箱（另一个 realm）里创建的数组，其 Array.prototype 与本文件主 realm 的 Array.prototype
  // 不是同一个对象——assert/strict 的 deepEqual 是 deepStrictEqual 的别名，会因"同构但不同
  // realm 的原型"判定为不相等（Node "same structure but are not reference-equal"），即便两个
  // 数组内容逐项相同。两侧数组元素都是原始字符串（无跨 realm 引用问题），序列化成字符串比较
  // 可以安全绕开这个陷阱。
  assert.equal(JSON.stringify(allTaskIds.slice().sort()), JSON.stringify(stemIds.slice().sort()),
    'voice-language.js 的 ALL_TASK_IDS 必须与 manifest.js 32 条 example 的 voicePrompt 文件 stem 集合完全一致，否则设置面板的可用性判断会脱离真实数据');
  console.log('PASS 9a: ALL_TASK_IDS 与 manifest.js 32 条 example 的 voicePrompt 文件 stem 集合完全一致。');
});

test('9b. ZH_AVAILABLE_TASK_IDS 的每一条在磁盘上都有对应 .zh.m4a 真实文件（32/32）', function () {
  var env = makeSandbox();
  var zhIds = env.api.getZhAvailableTaskIds();
  assert.equal(zhIds.length, 32);
  zhIds.forEach(function (id) {
    var p = path.join(APP_WEB, 'audio/tasks/' + id + '.zh.m4a');
    assert.equal(existsSync(p), true, id + '.zh.m4a 应在磁盘上真实存在');
  });
  console.log('PASS 9b: ZH_AVAILABLE_TASK_IDS 全部 24 条在磁盘上都有对应 .zh.m4a 文件。');
});

test('9c. EN_AVAILABLE_TASK_IDS 恰好等于磁盘上现存的英文 .m4a 文件集合（8 条，防止两个方向的漂移）', function () {
  var env = makeSandbox();
  var enIds = env.api.getEnAvailableTaskIds();

  var diskFiles = readdirSync(path.join(APP_WEB, 'audio/tasks'))
    .filter(function (f) { return f.endsWith('.m4a') && !f.endsWith('.zh.m4a'); })
    .map(function (f) { return f.slice(0, -'.m4a'.length); });

  assert.equal(enIds.length, 8);
  // 同上一条注释：JSON.stringify 比较绕开 vm 沙箱数组与主 realm 数组的原型不一致陷阱。
  assert.equal(JSON.stringify(enIds.slice().sort()), JSON.stringify(diskFiles.slice().sort()),
    'voice-language.js 的 EN_AVAILABLE_TASK_IDS 必须恰好等于磁盘上现存英文 .m4a 文件集合——多了会导致误报"可用"实则 404，' +
    '少了会导致明明已交付的素材被误判缺失、语言选项被不必要地禁用');
  console.log('PASS 9c: EN_AVAILABLE_TASK_IDS 与磁盘现存英文 .m4a 文件集合完全一致（无漂移）。');
});

// =====================================================================================
// 10. 秘密词（words）语言可用性台账——WTJ-20260706-011（ZH 秘密词二期：85/100 已交付，
//     15 条仍 not-delivered，见 app/web/audio/missing-audio.json secretWordsZh[]）
// =====================================================================================

test('10a. getAllWordIds() 恰好 100 条，与 app/web/manifest.js secretWords.pool 的 word 字段集合完全一致（顺序也一致）', function () {
  var env = makeSandbox();
  var manifestSrc = readFileSync(path.join(APP_WEB, 'manifest.js'), 'utf8');
  var manifestSandbox = {};
  manifestSandbox.window = manifestSandbox;
  vm.createContext(manifestSandbox);
  vm.runInContext(manifestSrc, manifestSandbox, { filename: 'manifest.js' });
  var poolWords = manifestSandbox.window.WTJ_MANIFEST.secretWords.pool.map(function (e) { return e.word; });

  var allWordIds = env.api.getAllWordIds();
  assert.equal(allWordIds.length, 100, 'WTJ-20260706-011 删除 xylophone 后真实词池应为 100 条');
  assert.equal(poolWords.length, 100);
  // JSON.stringify 比较：同上文 9a 的跨 vm-realm 数组原型不一致说明。
  assert.equal(JSON.stringify(allWordIds), JSON.stringify(poolWords),
    'voice-language.js 的 ALL_WORD_IDS 必须与 manifest.js secretWords.pool 的 word 顺序、内容完全一致，否则秘密词语言台账会脱离真实词池');
  console.log('PASS 10a: ALL_WORD_IDS 与 manifest.js secretWords.pool 100 词完全一致（顺序 + 内容）。');
});

// WTJ-20260706-011 交付了 85/100 ZH 秘密词音频（008 ASR-gated CosyVoice3 pipeline）；
// 剩余 15 词（single-char/超短标签，too-short 不稳）仍 not-delivered，见
// app/web/audio/missing-audio.json secretWordsZh[] 与本文件顶部大段注释。
var NOT_DELIVERED_ZH_WORDS = [
  'fish', 'horse', 'island', 'net', 'pear', 'pig', 'quail', 'treasurechest',
  'tree', 'ukulele', 'umbrella', 'unicorn', 'yak', 'zipper', 'zucchini'
];

test('10b. getZhAvailableWordIds() 当前应为 85 条（100 词池减去 15 条仍 not-delivered 的词，见 missing-audio.json secretWordsZh）', function () {
  var env = makeSandbox();
  var zhWordIds = env.api.getZhAvailableWordIds();
  var allWordIds = env.api.getAllWordIds();
  var expected = allWordIds.filter(function (w) { return NOT_DELIVERED_ZH_WORDS.indexOf(w) === -1; });
  assert.equal(zhWordIds.length, 85, 'ZH_AVAILABLE_WORD 台账应为 85 条（WTJ-20260706-011 交付 85/100 ZH 词音）');
  assert.equal(expected.length, 85, '100 词池减去 15 条 not-delivered 词应恰好剩 85');
  // JSON.stringify 比较：见 9a 注释——vm 沙箱数组与主 realm 数组原型不同，deepEqual 会误判。
  assert.equal(JSON.stringify(zhWordIds.slice().sort()), JSON.stringify(expected.slice().sort()),
    'ZH_AVAILABLE_WORD 台账必须恰好等于"全部词 - 15 条 not-delivered 词"，否则台账与 missing-audio.json 的交付状态脱节');
  NOT_DELIVERED_ZH_WORDS.forEach(function (w) {
    assert.equal(zhWordIds.indexOf(w) === -1, true, w + ' 仍 not-delivered，不应出现在 ZH_AVAILABLE_WORD 台账里');
  });
  console.log('PASS 10b: getZhAvailableWordIds() 为 85 条，与 15 条 not-delivered 词互补，秘密词 ZH 语音按真实交付状态登记。');
});

test('10c. isWordZhAvailable() 对已交付的 85 个词返回 true、对仍 not-delivered 的 15 个词与非法输入均返回 false（与 missing-audio.json secretWordsZh 状态一致）', function () {
  var env = makeSandbox();
  var allWordIds = env.api.getAllWordIds();
  allWordIds.forEach(function (word) {
    var expected = NOT_DELIVERED_ZH_WORDS.indexOf(word) === -1;
    assert.equal(env.api.isWordZhAvailable(word), expected,
      'isWordZhAvailable("' + word + '") 应为 ' + expected + '（' + (expected ? '已交付' : '仍 not-delivered') + '）');
  });
  assert.equal(env.api.isWordZhAvailable('not-a-real-word'), false, '未登记的陌生词也应返回 false（不是抛错或 undefined）');
  assert.equal(env.api.isWordZhAvailable(null), false, 'null 入参安全返回 false，不抛错');
  assert.equal(env.api.isWordZhAvailable(undefined), false, 'undefined 入参安全返回 false，不抛错');
  assert.equal(env.api.isWordZhAvailable(123), false, '非字符串入参安全返回 false，不抛错');
  console.log('PASS 10c: isWordZhAvailable() 对 85 个已交付词返回 true、15 个 not-delivered 词与各类非法输入均返回 false。');
});

test('10d. 假想未来场景：把当前仍 not-delivered 的一个词（net）临时补进 ZH_AVAILABLE_WORD 后，isWordZhAvailable() 应正确识别该词新交付、且不影响已交付/仍缺口的其它词', function () {
  // 与 8. 号用例同一手法：只在内存字符串上替换，不触碰磁盘上的真实 voice-language.js。
  // WTJ-20260706-011 交付后 ZH_AVAILABLE_WORD 已是 85 项的真实数组（不再是空数组字面量），
  // 用捕获组把 'net'（当前 15 条 not-delivered 之一）追加进数组末尾，模拟"下一批补齐 net"。
  var patched = VOICE_LANG_SRC.replace(
    /var ZH_AVAILABLE_WORD = \[([\s\S]*?)\];/,
    function (match, inner) {
      return "var ZH_AVAILABLE_WORD = [" + inner + ", 'net'];";
    }
  );
  assert.notEqual(patched, VOICE_LANG_SRC, '替换应当命中（否则说明源码结构变了，这条测试需要同步更新正则）');

  var env = makeSandbox({ sourceOverride: patched });
  assert.equal(env.api.isWordZhAvailable('net'), true, '假想补齐 net 后，该词应正确识别为已交付');
  assert.equal(env.api.isWordZhAvailable('apple'), true, '本已交付的词（apple）不受这次假想补齐影响，仍是已交付');
  assert.equal(env.api.isWordZhAvailable('fish'), false, '其余仍 not-delivered 的词（fish）不受影响，继续判定为未交付');
  assert.equal(env.api.getZhAvailableWordIds().length, 86, '假想补齐后台账应从 85 条变为 86 条');
  console.log('PASS 10d: 假想台账补齐一个此前 not-delivered 的词（net）后，isWordZhAvailable() 正确识别新交付、且不影响其它已交付/仍缺口的词。');
});
