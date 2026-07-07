// WTJ-20260704-078 — P1 fix: task voice runtime silence (all 8 task voice prompts silent).
//
// Root cause (TL-confirmed via QA076 triple repro): app/web/task.js's
// playTaskVoiceDefensive(taskDef) (~line 276) passes
//   voiceArg = taskDef.voicePrompt   // e.g. "audio/tasks/press-a.m4a" — a PATH STRING
// straight into window.WTJ_AUDIO.playTaskVoice(voiceArg). Before this fix,
// app/web/audio.js's playTaskVoice() (~line 684) treated EVERY string argument as a bare
// taskKey — resolveDescriptor({ type: 'task', key: taskKeyOrObj }) — so the whole path
// string got fed through conventionalPath('task', key). conventionalPath() calls
// sanitizeToken(), which strips every character outside [a-z0-9-] (including '/' and '.'),
// so:
//   "audio/tasks/press-a.m4a"  --sanitizeToken-->  "audiotaskspress-am4a"
//   conventionalPath -> AUDIO_DIRS.tasks + "audiotaskspress-am4a" + ".m4a"
//                     = "audio/tasks/audiotaskspress-am4a.m4a"   (mangled, 404, silent)
// This hit all 8 task voice prompts identically — every task voice was silent at runtime
// despite 074/075 having delivered the real .m4a files and 077 having wired audio.js into
// index.html.
//
// Fix (app/web/audio.js, playTaskVoice() string branch + new isTaskVoiceArgPathLike()
// helper directly above it): a string argument containing '/' or ending in '.m4a' is now
// treated as a path-like raw path — resolveDescriptor(taskKeyOrObj) is called directly on
// the raw string, reusing resolveDescriptor()'s own pre-existing "bare string -> raw path"
// semantics (the same semantics playComposite()/preload() already rely on; see the
// resolveDescriptor doc comment "字符串 -> 视为原始 path"), bypassing conventionalPath()
// entirely. A bare taskKey with no '/' (e.g. "press-a") still goes through the old
// conventional-path branch unchanged. Object-argument form ({id, voicePrompt}) was already
// correct and is untouched. playWord()/playSfx() are untouched — their callers never pass a
// path string through the bare-string shortcut, so they were never affected.
//
// This file is the durable regression test for that fix. Related pre-existing coverage
// that intentionally does NOT catch this bug (which is exactly how it slipped past QA076):
//   - audio-manager.test.mjs section 8 exercises playTaskVoice('press-a') (a bare key, no
//     '/') and playTaskVoice({id, voicePrompt}) (object form) — never the broken
//     string-PATH shape.
//   - audio-runtime-integration.test.mjs section 4 stubs out window.WTJ_AUDIO.playTaskVoice
//     entirely (records the call, never resolves it against the real manager); section 6
//     exercises the real manager's playTaskVoice but only via object-form input.
// Neither combination — real manager + string-shaped path argument — existed before this
// file, which is precisely the gap that let all 8 task voices ship silent.
//
// Run:  node --test tests/unit/task-voice-path.test.mjs
//       (or the whole suite; this machine's Node needs a glob, not a bare directory name):
//       node --test 'tests/unit/*.test.mjs'
// Exit: 0 = all assertions passed, 1 = failure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var APP_WEB = path.resolve(__dirname, '../../app/web');

function readSrc(rel) {
  return readFileSync(path.join(APP_WEB, rel), 'utf8');
}

var AUDIO_SRC = readSrc('audio.js');
var MANIFEST_SRC = readSrc('manifest.js');
var TASK_SRC = readSrc('task.js');

// =====================================================================================
// Shared fakes.
//
// fetch: reads real on-disk .m4a files via fs (no network — preserves audio.js's own
// "zero external request" constraint; same technique as
// audio-runtime-integration.test.mjs's makeRealFileFetch()). Missing files resolve
// {ok:false, status:404}, exactly like a real fetch() 404 would, so the silent/diagnostic
// path is exercised for real, not simulated.
//
// AudioContext.decodeAudioData: deterministic stand-in (Node has no real audio decode
// pipeline). This only proves audio.js's own "file found -> decode -> BufferSource.start()"
// control flow runs to completion without throwing; it does not re-verify that the .m4a
// bytes themselves are valid audio (that is a 074/075 delivery concern, not this card's).
// =====================================================================================

function makeRealFileFetch(fetchCallLog) {
  return function (requestPath) {
    if (fetchCallLog) {
      fetchCallLog.push(requestPath);
    }
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
  return new Promise(function (resolve) {
    self.state = 'running';
    resolve();
  });
};
FakeAudioContext.prototype.decodeAudioData = function (arrayBuffer, resolve) {
  resolve({ decoded: true, byteLength: arrayBuffer.byteLength, duration: 1 });
};
FakeAudioContext.prototype.createBufferSource = function () {
  return {
    buffer: null,
    connect: function () {},
    start: function () {}
  };
};

// Fresh audio.js-only sandbox: real audio.js loaded against real on-disk files, with
// fetch-call and console.warn recording for diagnostic assertions.
function makeAudioSandbox() {
  var warnCalls = [];
  var fetchCalls = [];
  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = {
    warn: function () {
      warnCalls.push(Array.prototype.slice.call(arguments).join(' '));
    },
    error: function () {},
    log: function () {}
  };
  sandbox.fetch = makeRealFileFetch(fetchCalls);
  sandbox.AudioContext = FakeAudioContext;
  vm.createContext(sandbox);
  vm.runInContext(AUDIO_SRC, sandbox, { filename: 'audio.js' });
  return { sandbox: sandbox, WTJ_AUDIO: sandbox.window.WTJ_AUDIO, warnCalls: warnCalls, fetchCalls: fetchCalls };
}

// =====================================================================================
// 1. path 字符串直接播：playTaskVoice('audio/tasks/press-a.m4a') 解析出的最终路径
//    恰是 'audio/tasks/press-a.m4a'（不是被 mangle 的 'audio/tasks/audiotaskspress-am4a.m4a'），
//    真实磁盘文件命中 -> silent:false。
// =====================================================================================

test('1. playTaskVoice(路径字符串) 恰好解析出该路径本身（不被 conventionalPath 拼接 mangle），真实文件命中 silent:false', function () {
  var env = makeAudioSandbox();
  return env.WTJ_AUDIO.playTaskVoice('audio/tasks/press-a.m4a').then(function (r) {
    assert.equal(r.path, 'audio/tasks/press-a.m4a', 'path 必须原样透传');
    assert.notEqual(r.path, 'audio/tasks/audiotaskspress-am4a.m4a', 'path 绝不能是 WTJ-20260704-078 描述的 mangled 形态');
    assert.equal(existsSync(path.join(APP_WEB, r.path)), true, '断言用的路径本身必须对应磁盘上真实存在的文件');
    assert.equal(r.silent, false, '真实文件命中，不应 silent');
    assert.equal(r.ok, true);
    console.log('PASS 1: playTaskVoice("audio/tasks/press-a.m4a") -> path 原样透传，silent:false。');
  });
});

// =====================================================================================
// 2. 复刻 task.js 真实调用形态：真实 manifest.js + 真实 task.js + 真实 audio.js 装进同一个
//    vm 沙箱，走 WTJ_TASK.startTask(真实 press-letter-a 任务定义)（其 voicePrompt 与 id 的
//    文件名 stem 本就不同，是 078 报告里点名的两个刁钻样本之一——WTJ-20260705-004 Phase B
//    接线中文语音后这个"id 与文件名 stem 不同"的特性依旧保留：press-letter-a 现在指向
//    audio/tasks/press-a.zh.m4a，见 manifest.js 该 example 行内注释与
//    app/scripts/tts-text-manifest.zh.json）。断言：
//    (a) task.js 内部同步触发的 window.fetch 请求路径就是真实路径，不是 mangled 路径
//        （fetch 调用本身是同步发起的，即便返回值是 Promise，因此 startTask() 一返回就能断言）；
//    (b) 用 taskDef.voicePrompt 复刻同款字符串入参直接调 playTaskVoice，resolve silent:false。
// =====================================================================================

test('2. 复刻 task.js 真实调用形态：真实 startTask(press-letter-a) 通过真实 audio.js 请求到未 mangle 的路径，且 playTaskVoice(该 voicePrompt) resolve silent:false', function () {
  var fetchCalls = [];
  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = { warn: function () {}, error: function () {}, log: function () {} };
  sandbox.fetch = makeRealFileFetch(fetchCalls);
  sandbox.AudioContext = FakeAudioContext;

  vm.createContext(sandbox);
  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  vm.runInContext(AUDIO_SRC, sandbox, { filename: 'audio.js' });
  vm.runInContext(TASK_SRC, sandbox, { filename: 'task.js' });

  assert.ok(sandbox.window.WTJ_AUDIO, 'audio.js 应挂载真实 WTJ_AUDIO');
  assert.ok(sandbox.window.WTJ_TASK, 'task.js 应挂载真实 WTJ_TASK');

  // task.js 默认时钟捕获宿主 setTimeout/clearTimeout/Date.now；vm 沙箱 global 不提供这些。
  // 本用例只关心 startTask() 同步触发的 playTaskVoice 调用链，不需要真的推进计时器
  // （与 audio-runtime-integration.test.mjs 用例 4 同一手法）。
  sandbox.window.WTJ_TASK._setClock({
    setTimeout: function () { return 0; },
    clearTimeout: function () {},
    now: function () { return 0; }
  });

  var taskDef = sandbox.window.WTJ_MANIFEST.tasks.templates.press.examples[0];
  assert.equal(taskDef.id, 'press-letter-a');
  // WTJ-20260705-004 Phase B：voicePrompt 已从 EN audio/tasks/press-a.m4a 改接 084 交付的中文
  // 完整句 audio/tasks/press-a.zh.m4a（见 manifest.js 行内注释 + tts-text-manifest.zh.json）。
  assert.equal(taskDef.voicePrompt, 'audio/tasks/press-a.zh.m4a');
  assert.notEqual(taskDef.id, 'press-a', 'id 与 voicePrompt 文件名 stem 本就不一致——正是 078 根因描述点名的刁钻样本，Phase B 接线中文语音后依旧保留');

  var started = sandbox.window.WTJ_TASK.startTask(taskDef);
  assert.equal(started, true, 'startTask() 应返回 true');

  assert.equal(fetchCalls.length, 1, 'startTask() 应经由真实 task.js -> 真实 audio.js 触发恰好一次 fetch');
  assert.equal(fetchCalls[0], 'audio/tasks/press-a.zh.m4a', 'task.js 触发的真实 fetch 请求路径必须是未被 mangle 的真实路径（现指向 084 交付的 ZH 文件）');
  assert.notEqual(fetchCalls[0], 'audio/tasks/audiotaskspress-azh.m4a4a.m4a');

  // 复刻同款字符串入参（taskDef.voicePrompt）直接调用，拿到可断言的 Promise。
  return sandbox.window.WTJ_AUDIO.playTaskVoice(taskDef.voicePrompt).then(function (r) {
    assert.equal(r.path, 'audio/tasks/press-a.zh.m4a');
    assert.equal(r.silent, false, '复刻 task.js 的真实调用形态应 resolve silent:false');
    assert.equal(r.ok, true);
    console.log('PASS 2: 真实 task.js startTask(press-letter-a) -> 真实 audio.js fetch("audio/tasks/press-a.zh.m4a")，未 mangle；playTaskVoice(voicePrompt) resolve silent:false。');
  });
});

// =====================================================================================
// 3. 全部 8 个任务语音路径：对 audio/missing-audio.json 的 taskVoice 段落逐一
//    playTaskVoice(voicePromptPath) -> 解析路径恰好等于该路径 + 真实文件在磁盘上 +
//    silent:false。特别覆盖 press-letter-a -> press-a.m4a / press-digit-3 -> press-3.m4a
//    这两条 id 与文件名 stem 不同的样本。
// =====================================================================================

test('3. missing-audio.json 全部 8 条 taskVoice.voicePromptPath 逐一 playTaskVoice -> 路径正确 + 真实文件在 + silent:false', function () {
  var missingAudio = JSON.parse(readFileSync(path.join(APP_WEB, 'audio/missing-audio.json'), 'utf8'));
  var taskVoiceEntries = missingAudio.taskVoice;
  assert.ok(Array.isArray(taskVoiceEntries) && taskVoiceEntries.length === 8, 'missing-audio.json taskVoice 段落应恰好有 8 条（本卡验收基线）');

  var env = makeAudioSandbox();
  var chain = Promise.resolve();
  var checkedCount = 0;

  taskVoiceEntries.forEach(function (entry) {
    chain = chain.then(function () {
      assert.equal(typeof entry.voicePromptPath, 'string', entry.taskId + ' 应有 voicePromptPath 字符串');
      assert.equal(existsSync(path.join(APP_WEB, entry.voicePromptPath)), true, entry.taskId + ' 的 voicePromptPath 对应文件应真实存在于磁盘（074/075 已交付）');
      return env.WTJ_AUDIO.playTaskVoice(entry.voicePromptPath).then(function (r) {
        assert.equal(r.path, entry.voicePromptPath, entry.taskId + ': 解析路径必须恰好等于 voicePromptPath 本身，不能被 mangle');
        assert.equal(r.silent, false, entry.taskId + '(' + entry.voicePromptPath + ') 真实文件命中，不应 silent');
        assert.equal(r.ok, true);
        checkedCount += 1;
      });
    });
  });

  return chain.then(function () {
    assert.equal(checkedCount, 8, '8 条 taskVoice 应全部逐一断言通过');
    console.log('PASS 3: missing-audio.json 全部 8 条 taskVoice.voicePromptPath 均 playTaskVoice 成功、路径未 mangle、silent:false。');
  });
});

// =====================================================================================
// 4. 错误路径不误报成功：playTaskVoice('audio/tasks/nonexistent-xyz.m4a') -> silent:true
//    且有诊断（recordMissing/warnOnce 被触发、getMissingReport() 能查到），不是 ok:true。
// =====================================================================================

test('4. playTaskVoice(不存在的路径字符串) -> silent:true + 有诊断记录，不误报成功', function () {
  var env = makeAudioSandbox();
  var missingPath = 'audio/tasks/nonexistent-xyz.m4a';
  assert.equal(existsSync(path.join(APP_WEB, missingPath)), false, '断言前置条件：该路径在磁盘上确实不存在');

  return env.WTJ_AUDIO.playTaskVoice(missingPath).then(function (r) {
    assert.equal(r.ok, false, '文件缺失绝不能误报 ok:true');
    assert.equal(r.silent, true, '文件缺失应 silent:true');
    assert.equal(typeof r.reason, 'string', 'silent 结果应带诊断 reason 字符串');
    assert.notEqual(r.reason, '', 'reason 不应为空');

    var missingReport = env.WTJ_AUDIO.getMissingReport();
    var found = missingReport.some(function (e) {
      return e.path === missingPath;
    });
    assert.equal(found, true, 'getMissingReport() 应能查到该缺失路径（recordMissing 被触发）');
    assert.ok(env.warnCalls.length > 0, 'warnOnce 应至少 console.warn 过一次可诊断文案');
    console.log('PASS 4: 不存在的路径 -> silent:true、ok:false、reason="' + r.reason + '"、getMissingReport()/warnOnce 均有记录，未误报成功。');
  });
});

// =====================================================================================
// 5. taskKey 非 path 仍工作：playTaskVoice('press-a')（不含 '/'，裸 key）-> 路径
//    audio/tasks/press-a.m4a（走既有约定拼接分支，未受本次 path-like 分支改动影响）。
// =====================================================================================

test('5. playTaskVoice(裸 taskKey，不含 "/") 仍走既有约定拼接 -> audio/tasks/<key>.m4a', function () {
  var env = makeAudioSandbox();
  return env.WTJ_AUDIO.playTaskVoice('press-a').then(function (r) {
    assert.equal(r.path, 'audio/tasks/press-a.m4a', '裸 key 仍应走 conventionalPath 约定拼接');
    assert.equal(r.silent, false, '该约定路径真实文件存在，不应 silent');
    console.log('PASS 5: playTaskVoice("press-a")（裸 key）-> "audio/tasks/press-a.m4a"，未回归。');
  });
});

// =====================================================================================
// 6. 回归：playWord(字符串/对象)、playSfx(key/对象) 行为不变（均未被本次改动触及，仅改了
//    playTaskVoice 的 string 分支）。
// =====================================================================================

test('6a. 回归 - playWord: 字符串形态与对象形态均不受影响，真实文件 silent:false', function () {
  var env = makeAudioSandbox();
  return env.WTJ_AUDIO.playWord('dog').then(function (r1) {
    assert.equal(r1.path, 'audio/words/dog.m4a');
    assert.equal(r1.silent, false);
    return env.WTJ_AUDIO.playWord({ word: 'dog', audioFile: 'audio/words/dog.m4a' }).then(function (r2) {
      assert.equal(r2.path, 'audio/words/dog.m4a');
      assert.equal(r2.silent, false);
      console.log('PASS 6a: playWord 字符串/对象形态均未回归。');
    });
  });
});

test('6b. 回归 - playSfx: sfxKey 字符串与对象形态均不受影响，真实文件 silent:false', function () {
  var env = makeAudioSandbox();
  return env.WTJ_AUDIO.playSfx('task-success').then(function (r1) {
    assert.equal(r1.path, 'audio/sfx/task-success.m4a');
    assert.equal(r1.silent, false);
    return env.WTJ_AUDIO.playSfx({ sfxKey: 'chest-open', path: 'audio/sfx/chest-open.m4a' }).then(function (r2) {
      assert.equal(r2.path, 'audio/sfx/chest-open.m4a');
      assert.equal(r2.silent, false);
      console.log('PASS 6b: playSfx key/对象形态均未回归。');
    });
  });
});

test('6c. 回归 - playWord/playSfx 对不存在的文件仍 silent:true（防止本次改动误伤缺失文件语义）', function () {
  var env = makeAudioSandbox();
  return env.WTJ_AUDIO.playWord('no-such-word-xyz').then(function (r1) {
    assert.equal(r1.silent, true);
    return env.WTJ_AUDIO.playSfx('no-such-sfx-xyz').then(function (r2) {
      assert.equal(r2.silent, true);
      console.log('PASS 6c: playWord/playSfx 对缺失文件仍 silent:true，未被本次改动影响。');
    });
  });
});

// =====================================================================================
// 7. WTJ-20260705-004 Phase B — 中文任务语音 runtime 接线全量验收：
//    真实 manifest.js 的 drag/click/find/press 四类模板，按 voicePrompt 是否为空分两组：
//
//    A) 已交付的 24 条（Phase B 004/084 范围，voicePrompt 非空），逐一断言：
//      (a) voicePrompt 恰好等于 app/scripts/tts-text-manifest.zh.json 里该 taskId 对应的
//          out 字段（084 的权威文件路径来源，禁止凭 id 猜文件名）；
//      (b) voicePrompt 以 '.zh.m4a' 结尾（中文完整句，绝不是运行时拼接的片段路径）；
//      (c) 该路径对应的文件在磁盘上真实存在且非空（no-silent-fallback：路径必须解析到
//          真实存在的音频，而不是又一次静默指向一个不存在的文件）；
//      (d) 真实 playTaskVoice(voicePrompt) resolve silent:false（走完整的 audio.js 解析
//          + fetch 链路，不是只查文件系统）。
//    这组断言同时覆盖验收标准 #4（中文任务用完整句）与 REQ-TASK-04（禁止运行时拼接
//    "找到"+词条这类中英混拼）——manifest.js 里每条 voicePrompt 都是整句预生成文件路径，
//    没有任何一条是运行时片段拼接的产物。
//
//    B)（WTJ-20260705-025 新增）8 条待交付 example（drag 池扩容 6 条 + door/doorbell 点击
//    任务 2 条，voicePrompt 均为空字符串 ''）：024/084 尚未生成对应中文语音，本卡刻意让
//    voicePrompt 留空而不是指向一个语义不匹配的现成文件（no-silent-fallback，见 manifest.js
//    对应 example 行内注释）。这组只断言"确实留空 + 在 tts-text-manifest.zh.json 的
//    tasksPending 段落有拟定文案草稿"，不对它们做 (a)~(d) 的"必须已交付"全量校验——那样会
//    要求这里去伪造并不存在的音频文件，正是本卡明确要避免的"静默指向不存在文件"反模式。
// =====================================================================================

test('7. Phase B 全量：manifest.js 四类模板已交付的 32 条 example 的 voicePrompt 均接线到交付的 .zh.m4a（与 tts-text-manifest.zh.json out 字段一致），文件存在非空，playTaskVoice 均 silent:false；WTJ-20260706-010 按键池扩容新增的 40 条 example 待 ASR-gated 生成交付，voicePrompt 暂留空（no-silent-fallback）', function () {
  var ZH_MANIFEST_PATH = path.resolve(__dirname, '../../app/scripts/tts-text-manifest.zh.json');
  var zhManifest = JSON.parse(readFileSync(ZH_MANIFEST_PATH, 'utf8'));
  var zhTasks = zhManifest.tasks;

  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = { warn: function () {}, error: function () {}, log: function () {} };
  sandbox.fetch = makeRealFileFetch();
  sandbox.AudioContext = FakeAudioContext;
  vm.createContext(sandbox);
  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  vm.runInContext(AUDIO_SRC, sandbox, { filename: 'audio.js' });

  var templates = sandbox.window.WTJ_MANIFEST.tasks.templates;
  var deliveredExamples = [];
  var pendingExamples = [];
  ['drag', 'click', 'find', 'press'].forEach(function (type) {
    (templates[type].examples || []).forEach(function (ex) {
      if (ex.voicePrompt) {
        deliveredExamples.push(ex);
      } else {
        pendingExamples.push(ex);
      }
    });
  });

  assert.equal(deliveredExamples.length, 32, 'WTJ-20260705-024 全量重生成后已交付覆盖范围为 32 条 example（原 24 + 025 新增 8），WTJ-20260706-010 新增的 40 条按键池扩容 example 尚待生成，不计入本数');
  // WTJ-20260706-010：按键池扩容新增 40 条 press example（全字母/全数字/符号/Space/Enter/方向键），
  // voicePrompt 暂为空字符串——TL 已暂停裸 generate-tts-cosyvoice3.py 生成，改走共享 ASR-gated
  // wrapper（whisper 自证目标文本，字母 C/G/J/K/Q/W/Y 与符号名是已知误读高发区），音频生成 +
  // manifest.js 接线是本卡的后续 commit。40 是本次的临时中间态数字，接线完成后应回落到 0
  // （与 025→024 那次"先扩池、voicePrompt 留空，音频到位后再接线"的既有先例同一模式）。
  assert.equal(pendingExamples.length, 40, 'WTJ-20260706-010 按键池扩容新增的 40 条 example 待 ASR-gated 生成交付，voicePrompt 暂留空');

  var chain = Promise.resolve();
  var checkedCount = 0;

  deliveredExamples.forEach(function (ex) {
    chain = chain.then(function () {
      var zhEntry = zhTasks[ex.id];
      assert.ok(zhEntry, ex.id + ' 应在 tts-text-manifest.zh.json.tasks 里有对应条目');
      assert.equal(ex.voicePrompt, zhEntry.out, ex.id + ': manifest.js 的 voicePrompt 必须恰好等于 zh.json 该 taskId 的 out 字段（权威路径，不能凭 id 猜命名）');
      assert.match(ex.voicePrompt, /\.zh\.m4a$/, ex.id + ': voicePrompt 必须是 .zh.m4a 中文完整句，不是 EN .m4a 或任何拼接片段路径');

      var abs = path.join(APP_WEB, ex.voicePrompt);
      assert.equal(existsSync(abs), true, ex.id + ' 的 voicePrompt 对应文件必须在磁盘上真实存在（084 已交付，no-silent-fallback：不能指向不存在的文件）');
      assert.ok(statSync(abs).size > 0, ex.id + ' 的 .zh.m4a 文件不应是 0 字节空文件');

      return sandbox.window.WTJ_AUDIO.playTaskVoice(ex.voicePrompt).then(function (r) {
        assert.equal(r.path, ex.voicePrompt, ex.id + ': playTaskVoice 解析路径必须恰好等于 voicePrompt 本身');
        assert.equal(r.silent, false, ex.id + '(' + ex.voicePrompt + ') 真实文件命中，不应 silent');
        assert.equal(r.ok, true);
        checkedCount += 1;
      });
    });
  });

  return chain.then(function () {
    assert.equal(checkedCount, 32, '四类模板已交付的 32 条 example 都应逐一断言通过');
    console.log('PASS 7: manifest.js 全部 32 条 task example 的 voicePrompt 均接线到交付的 .zh.m4a，与 zh.json out 字段一致，文件存在非空，playTaskVoice 全部 silent:false（024 交付后 8 条新任务也已接线）。');
  });
});
