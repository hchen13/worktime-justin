// WTJ-20260705-018 — task.js x voice-language.js 接线集成测试（durable QA asset）
//
// 覆盖验收标准 #4 的运行时接线：task.js 的 playTaskVoiceDefensive() 必须先问
// window.WTJ_VOICE_LANG.resolveTaskVoicePath()，再决定真正调用 window.WTJ_AUDIO.playTaskVoice
// 的路径（或完全不调用）。与 tests/unit/task-voice-path.test.mjs（未加载 voice-language.js，
// 验证"模块缺失时行为不变"这条回归线）互补，本文件专门验证"模块存在时"的接线是否正确。
//
// 背景（本卡开发过程中实际抓到的一个 P0 级 bug，记录在此防止再犯）：voice-language.js 最初
// 版本的 resolveTaskVoicePath() 用 taskDef.id 去查 EN_AVAILABLE_SET/ZH_AVAILABLE_SET，但
// manifest.js 的 press 类任务里 taskDef.id（如 "press-letter-a"）与其语音文件 stem
// （"press-a"）历来就不一致（078 卡记录、task-voice-path.test.mjs 有专项断言）——这会导致
// 全部 7 条 press 类任务在接上 voice-language.js 之后语音直接失声（resolveTaskVoicePath 把
// 它们全部误判成"未知任务"返回 null）。下面第 1 组用例就是复现这个具体场景的回归测试：真实
// startTask(press-letter-a) 必须仍能触发到磁盘上真实存在的 press-a.zh.m4a。
//
// Run:  node --test tests/unit/task-voice-language-switch.test.mjs
//       （或整目录，本机 Node 用 glob 不能裸目录）：node --test 'tests/unit/*.test.mjs'
// Exit: 0 = all assertions passed, 1 = failure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var APP_WEB = path.resolve(__dirname, '../../app/web');

function readSrc(rel) {
  return readFileSync(path.join(APP_WEB, rel), 'utf8');
}

var MANIFEST_SRC = readSrc('manifest.js');
var AUDIO_SRC = readSrc('audio.js');
var TASK_SRC = readSrc('task.js');
var VOICE_LANG_SRC = readSrc('voice-language.js');

// --- 同 task-voice-path.test.mjs 的 fetch/AudioContext 手法：真实读磁盘文件，不发真实网络请求 ---
function makeRealFileFetch(fetchCallLog) {
  return function (requestPath) {
    if (fetchCallLog) fetchCallLog.push(requestPath);
    var abs = path.join(APP_WEB, requestPath);
    if (!existsSync(abs)) {
      return Promise.resolve({ ok: false, status: 404 });
    }
    var buf = readFileSync(abs);
    return Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: function () {
        return Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      }
    });
  };
}

function FakeAudioContext() {
  this.state = 'suspended';
  this.currentTime = 0;
  this.destination = {};
}
FakeAudioContext.prototype.resume = function () {
  var self = this;
  return new Promise(function (resolve) { self.state = 'running'; resolve(); });
};
FakeAudioContext.prototype.decodeAudioData = function (arrayBuffer, resolve) {
  resolve({ decoded: true, byteLength: arrayBuffer.byteLength, duration: 1 });
};
FakeAudioContext.prototype.createBufferSource = function () {
  return { buffer: null, connect: function () {}, start: function () {} };
};

function makeFakeLocalStorage(preset) {
  var store = {};
  if (preset) Object.keys(preset).forEach(function (k) { store[k] = preset[k]; });
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
}

// 组装一个"真实 manifest + 真实 audio + 真实 task + 真实 voice-language"四件套沙箱，
// 与生产环境 index.html 的加载顺序（voice-language.js 在 task.js 之前）一致。
function makeFullSandbox(opts) {
  opts = opts || {};
  var fetchCalls = [];
  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = { warn: function () {}, error: function () {}, log: function () {} };
  sandbox.fetch = makeRealFileFetch(fetchCalls);
  sandbox.AudioContext = FakeAudioContext;
  sandbox.localStorage = makeFakeLocalStorage(opts.presetStorage);
  vm.createContext(sandbox);
  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  vm.runInContext(AUDIO_SRC, sandbox, { filename: 'audio.js' });
  vm.runInContext(opts.voiceLangSourceOverride || VOICE_LANG_SRC, sandbox, { filename: 'voice-language.js' });
  vm.runInContext(TASK_SRC, sandbox, { filename: 'task.js' });

  // task.js 默认时钟捕获宿主 setTimeout/clearTimeout/Date.now；vm 沙箱 global 不提供这些
  // （与 task-voice-path.test.mjs 用例 2 同一手法）——本文件只关心 startTask() 同步触发的
  // playTaskVoiceDefensive 调用链，不需要真的推进计时器。
  sandbox.window.WTJ_TASK._setClock({
    setTimeout: function () { return 0; },
    clearTimeout: function () {},
    now: function () { return 0; }
  });

  return { sandbox: sandbox, fetchCalls: fetchCalls };
}

// =====================================================================================
// 1. 回归核心：真实 startTask(press-letter-a) 在接上 voice-language.js 之后，仍必须触发到
//    磁盘上真实存在的 audio/tasks/press-a.zh.m4a（默认 zh 模式）——不能因为 taskDef.id
//    ("press-letter-a") 与语音文件 stem ("press-a") 不一致而被 voice-language.js 误判成
//    "未知任务"进而完全失声。
// =====================================================================================

test('1. 真实 startTask(press-letter-a)：接上 voice-language.js 后仍 fetch 到 press-a.zh.m4a（press 类 id/文件名 stem 不一致场景的回归防护）', function () {
  var env = makeFullSandbox();
  var taskDef = env.sandbox.window.WTJ_MANIFEST.tasks.templates.press.examples[0];
  assert.equal(taskDef.id, 'press-letter-a');
  assert.equal(taskDef.voicePrompt, 'audio/tasks/press-a.zh.m4a');

  var started = env.sandbox.window.WTJ_TASK.startTask(taskDef);
  assert.equal(started, true);

  assert.equal(env.fetchCalls.length, 1, 'startTask() 应恰好触发一次 fetch');
  assert.equal(env.fetchCalls[0], 'audio/tasks/press-a.zh.m4a',
    '接上 voice-language.js 之后，press-letter-a 的语音仍应正确解析到 press-a.zh.m4a，不能因 id/文件名 stem 不一致而失声');
  console.log('PASS 1: press-letter-a（id 与文件名 stem 不一致的样本）接上 voice-language.js 后仍正确 fetch 到 press-a.zh.m4a。');
});

test('1b. 全部 24 条 example 逐一 startTask，接上 voice-language.js 后均能 fetch 到各自的 .zh.m4a（默认 zh 模式下无一条因本次接线而失声）', function () {
  var checked = 0;
  ['drag', 'click', 'find', 'press'].forEach(function (type) {
    var env = makeFullSandbox();
    var examples = env.sandbox.window.WTJ_MANIFEST.tasks.templates[type].examples;
    examples.forEach(function (ex, idx) {
      // 每条 example 用独立沙箱，避免 task.js "一次只允许一个进行中任务" 的状态机相互干扰。
      var oneEnv = (idx === 0) ? env : makeFullSandbox();
      var started = oneEnv.sandbox.window.WTJ_TASK.startTask(ex);
      assert.equal(started, true, ex.id + ' startTask 应返回 true');
      assert.equal(oneEnv.fetchCalls.length, 1, ex.id + ' 应恰好触发一次 fetch');
      assert.equal(oneEnv.fetchCalls[0], ex.voicePrompt, ex.id + ' 应 fetch 到其 voicePrompt 本身（默认 zh 模式）');
      checked += 1;
    });
  });
  assert.equal(checked, 24, '四类模板全部 24 条 example 都应被逐一验证过');
  console.log('PASS 1b: 全部 24 条 example 在接上 voice-language.js 后，默认 zh 模式均正确 fetch 到各自 .zh.m4a，无一失声。');
});

// =====================================================================================
// 2. mode="auto" 场景（localStorage 预置）：zh 完整，auto 折算为 zh，行为与默认模式一致。
// =====================================================================================

test('2. localStorage 预置 mode="auto"：真实 startTask(press-letter-a) 仍 fetch 到 press-a.zh.m4a（auto 折算为 zh）', function () {
  var env = makeFullSandbox({ presetStorage: { wtjVoiceLanguageMode: 'auto' } });
  assert.equal(env.sandbox.window.WTJ_VOICE_LANG.getMode(), 'auto');
  assert.equal(env.sandbox.window.WTJ_VOICE_LANG.getEffectiveLanguage(), 'zh');

  var taskDef = env.sandbox.window.WTJ_MANIFEST.tasks.templates.press.examples[0];
  env.sandbox.window.WTJ_TASK.startTask(taskDef);
  assert.equal(env.fetchCalls.length, 1);
  assert.equal(env.fetchCalls[0], 'audio/tasks/press-a.zh.m4a');
  console.log('PASS 2: auto 模式（zh 完整）下 startTask(press-letter-a) 仍正确 fetch 到 press-a.zh.m4a。');
});

// =====================================================================================
// 3. no-silent-fallback 落地到 task.js 调用链：resolveTaskVoicePath 返回 null 时，
//    playTaskVoiceDefensive 必须直接沉默返回，绝不再退回 taskDef.voicePrompt 自行播放
//    ——用一个 voice-language.js 查不到的陌生任务（非真实 manifest 数据，模拟"清单未同步
//    更新的新任务"）验证：startTask() 状态机正常推进（不因语音解析失败而崩），但 0 次 fetch。
// =====================================================================================

test('3. 陌生任务（voice-language.js 清单查不到）：startTask 正常返回 true，但 0 次 fetch——no-silent-fallback 落地到 task.js 调用链，不会退回 taskDef.voicePrompt 自行播放', function () {
  var env = makeFullSandbox();
  var strangeTaskDef = {
    id: 'brand-new-task-not-in-any-list',
    type: 'press',
    targetKey: 'Z',
    voicePrompt: 'audio/tasks/brand-new-task-not-in-any-list.zh.m4a',
    successAudio: 'audio/sfx/task-success.m4a'
  };
  var started = env.sandbox.window.WTJ_TASK.startTask(strangeTaskDef);
  assert.equal(started, true, '语音解析失败不应阻断任务状态机本身的推进');
  assert.equal(env.fetchCalls.length, 0,
    'resolveTaskVoicePath 返回 null 时，playTaskVoiceDefensive 必须直接沉默，不能退回 voiceArg=taskDef.voicePrompt 自行调用 playTaskVoice');
  console.log('PASS 3: 陌生任务下 startTask 状态机正常推进，但语音调用被正确沉默（0 次 fetch），未静默退回播放。');
});

// =====================================================================================
// 4. 端到端验证"假想英文全量交付"场景：patch EN_AVAILABLE_TASK_IDS 为全量后，setMode('en')
//    放行，真实 startTask(drag-apple-to-basket) 触发到磁盘上**真实存在**的英文
//    audio/tasks/drag-apple-to-basket.m4a（这一条本就是 016/074 卡交付的 8 条英文素材之一，
//    不需要额外造假文件）——证明一旦语言真的补齐，整条 task.js -> voice-language.js -> audio.js
//    链路无需改代码即可正确切换。
// =====================================================================================

test('4. 假想英文全量交付：setMode("en") 放行后，真实 startTask(drag-apple-to-basket) 端到端 fetch 到磁盘真实存在的英文 .m4a', function () {
  var patched = VOICE_LANG_SRC.replace(
    /var EN_AVAILABLE_TASK_IDS = \[[\s\S]*?\];/,
    'var EN_AVAILABLE_TASK_IDS = ALL_TASK_IDS.slice();'
  );
  assert.notEqual(patched, VOICE_LANG_SRC, '替换应命中（否则源码结构变了，需要同步更新本测试的正则）');

  var env = makeFullSandbox({ voiceLangSourceOverride: patched });
  var setResult = env.sandbox.window.WTJ_VOICE_LANG.setMode('en');
  assert.equal(setResult.ok, true);

  var taskDef = env.sandbox.window.WTJ_MANIFEST.tasks.templates.drag.examples[0];
  assert.equal(taskDef.id, 'drag-apple-to-basket');
  assert.equal(taskDef.voicePrompt, 'audio/tasks/drag-apple-to-basket.zh.m4a');

  var started = env.sandbox.window.WTJ_TASK.startTask(taskDef);
  assert.equal(started, true);
  assert.equal(env.fetchCalls.length, 1);
  assert.equal(env.fetchCalls[0], 'audio/tasks/drag-apple-to-basket.m4a',
    '语言切到 en 后应 fetch 英文路径（该文件本就是 016/074 卡已交付的真实磁盘文件，非本测试伪造）');
  assert.equal(existsSync(path.join(APP_WEB, env.fetchCalls[0])), true, '断言用的英文路径必须对应磁盘上真实存在的文件');
  console.log('PASS 4: 假想英文全量交付场景下，task.js -> voice-language.js -> audio.js 端到端正确切换到真实存在的英文语音文件。');
});
