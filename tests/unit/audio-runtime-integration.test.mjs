// WTJ-20260704-077 — audio runtime integration test (durable QA asset)
//
// QA076 found: app/web/index.html never loaded app/web/audio.js, so window.WTJ_AUDIO was
// undefined at runtime and every already-defensive call site (secretword.js/task.js/
// task-templates.js/reward-chest.js/status-rewards.js) silently no-op'd — zero audio ever
// played inside the app, despite 074/075 having already delivered all the real .m4a files
// (audio/words 101, audio/tasks 8, audio/phrases 10, audio/sfx 20).
//
// This is the runtime-acceptance test for the 077 fix: (a) index.html now loads
// <script src="audio.js"> before its consumers, and (b) app.js's own independent
// AudioContext-unlock stub now delegates to window.WTJ_AUDIO.unlock() (audio.js's single
// AudioContext instance), falling back to the old independent stub only when WTJ_AUDIO is
// missing (see app/web/audio.js header "AudioContext 生命周期" integration note).
//
// Coverage (see numbered sections below):
//   1. static: index.html loads audio.js before its consumers; red-line scan for
//      speechSynthesis / SpeechSynthesisUtterance across the core runtime files (REQ-AST-07).
//   2. audio.js loads -> window.WTJ_AUDIO exists with the documented method surface.
//   3. secretword.js: real manifest.js + real secretword.js, a hand-written recording
//      WTJ_AUDIO stub (same pattern as secretword-engine.test.mjs) -> hitting the real word
//      pool's "dog" calls playWord(entry).
//   4. task.js: real manifest.js + real task.js, a recording WTJ_AUDIO stub + a no-op fake
//      clock (same pattern as task-lifecycle.test.mjs) -> startTask() calls playTaskVoice.
//   5. task-templates.js / reward-chest.js / status-rewards.js already have their own
//      dedicated durable tests asserting playSfx('task-success'/'chest-open'/
//      'streak-reward-fanfare') is called on the real completion/reward paths (see
//      tests/unit/task-templates.test.mjs "7. 完成 -> ... WTJ_AUDIO.playSfx",
//      tests/unit/reward-chest.test.mjs "WTJ_SLOTS.onFull 触发后：... playSfx('chest-open')",
//      tests/unit/status-rewards.test.mjs's assertion on 'streak-reward-fanfare'). Per this
//      card's scope note ("复用这些引擎现有测试的 sandbox setup，只加音频断言；若某引擎测试
//      已有音频 stub 断言，扩展即可"), this file does not rebuild their (fairly heavy) fake
//      clock / DOM / canvas sandboxes. Instead it adds a guard so that coverage can't quietly
//      regress, then closes the real gap those three tests can't cover on their own (they use
//      hand-written playSfx STUBS, never the real manager) in section 6.
//   6. happy-path "not silent" proof: the REAL audio.js loaded against the REAL on-disk .m4a
//      files for exactly the word/task/sfx paths sections 3-5 wire up, asserting none of them
//      resolve silent:true — i.e. the happy path genuinely produces sound, not just "a stub
//      recorded a call".
//   7. app.js: the real app.js loaded in a minimal DOM/canvas vm sandbox — first click/keydown
//      delegates unlock to window.WTJ_AUDIO.unlock() (no independent AudioContext created);
//      dbg-audio is filled with the diagnostic result; with WTJ_AUDIO missing, falls back to
//      the old independent-AudioContext stub without throwing.
//
// Run:  node --test tests/unit/audio-runtime-integration.test.mjs
//       (or the whole suite; this machine's Node 25 needs a glob, not a bare directory name):
//       node --test 'tests/unit/*.test.mjs'
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

var INDEX_HTML = readSrc('index.html');
var AUDIO_SRC = readSrc('audio.js');
var APP_SRC = readSrc('app.js');
var MANIFEST_SRC = readSrc('manifest.js');
var SECRETWORD_SRC = readSrc('secretword.js');
var TASK_SRC = readSrc('task.js');

// =====================================================================================
// 1. 静态：index.html 加载 audio.js 且在核心消费方之前；红线扫描无 speechSynthesis 引用。
// =====================================================================================

test('1a. index.html 含 <script src="audio.js">，且在 secretword.js/task.js/task-templates.js/reward-chest.js/status-rewards.js 之前', function () {
  var scriptTags = [];
  var re = /<script\s+src="([^"]+)"/g;
  var m;
  while ((m = re.exec(INDEX_HTML)) !== null) {
    scriptTags.push(m[1]);
  }
  var audioIdx = scriptTags.indexOf('audio.js');
  assert.ok(audioIdx !== -1, 'index.html 必须加载 audio.js（本卡消除 QA076 发现的缺口）');

  ['secretword.js', 'task.js', 'task-templates.js', 'reward-chest.js', 'status-rewards.js'].forEach(function (consumer) {
    var idx = scriptTags.indexOf(consumer);
    assert.ok(idx !== -1, 'index.html 应加载 ' + consumer);
    assert.ok(audioIdx < idx, 'audio.js 必须在 ' + consumer + ' 之前加载（否则该消费方运行时读到的 window.WTJ_AUDIO 仍是 undefined）');
  });
  console.log('PASS 1a: audio.js 在全部核心消费方之前加载。脚本加载顺序:', JSON.stringify(scriptTags));
});

// 剥掉整行注释（// 开头的 JS 行注释 / <!-- --> 包裹的 HTML 注释）后再扫描，避免"红线本身
// 在注释里点名禁用 API"被误判为违反红线（与 secretword-engine.test.mjs 第 0 组同一手法：
// 例如 audio.js 文件头就用注释明文写了"全文不得出现 speechSynthesis"这条红线本身）。
function stripLineComments(src) {
  return src
    .split('\n')
    .filter(function (line) {
      var t = line.trim();
      return t.indexOf('//') !== 0;
    })
    .join('\n');
}

function stripHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, '');
}

test('1b. 红线（REQ-AST-07）：核心运行时文件代码本体（剥掉注释后）均不出现 speechSynthesis / SpeechSynthesisUtterance', function () {
  var sources = {
    'index.html': stripHtmlComments(INDEX_HTML),
    'app.js': stripLineComments(APP_SRC),
    'audio.js': stripLineComments(AUDIO_SRC),
    'secretword.js': stripLineComments(SECRETWORD_SRC),
    'task.js': stripLineComments(TASK_SRC),
    'task-templates.js': stripLineComments(readSrc('task-templates.js')),
    'reward-chest.js': stripLineComments(readSrc('reward-chest.js')),
    'status-rewards.js': stripLineComments(readSrc('status-rewards.js'))
  };
  Object.keys(sources).forEach(function (name) {
    assert.equal(/speechSynthesis/i.test(sources[name]), false, name + ' 代码本体不得出现 speechSynthesis');
    assert.equal(/SpeechSynthesisUtterance/i.test(sources[name]), false, name + ' 代码本体不得出现 SpeechSynthesisUtterance');
  });
  console.log('PASS 1b: 8 个核心文件代码本体均无 speechSynthesis / SpeechSynthesisUtterance 引用——音频只走预生成 .m4a。');
});

// =====================================================================================
// 2. audio.js 加载后 window.WTJ_AUDIO 存在，方法齐全。
// =====================================================================================

function makeAudioJsSandbox(fetchImpl, ACImpl) {
  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = { warn: function () {}, error: function () {}, log: function () {} };
  sandbox.fetch = fetchImpl;
  if (ACImpl) {
    sandbox.AudioContext = ACImpl;
  }
  vm.createContext(sandbox);
  vm.runInContext(AUDIO_SRC, sandbox, { filename: 'audio.js' });
  return sandbox;
}

test('2. audio.js 加载后 window.WTJ_AUDIO 存在，方法齐全（unlock/isUnlocked/playWord/playSfx/playTaskVoice/playComposite/preload）', function () {
  var sandbox = makeAudioJsSandbox(function () {
    return Promise.resolve({ ok: false, status: 404 });
  }, null);
  var WTJ_AUDIO = sandbox.window.WTJ_AUDIO;
  assert.ok(WTJ_AUDIO, 'window.WTJ_AUDIO 应存在');
  ['unlock', 'isUnlocked', 'playWord', 'playSfx', 'playTaskVoice', 'playComposite', 'preload'].forEach(function (mName) {
    assert.equal(typeof WTJ_AUDIO[mName], 'function', 'WTJ_AUDIO.' + mName + ' 应是函数');
  });
  console.log('PASS 2: window.WTJ_AUDIO 加载完成，方法齐全。');
});

// =====================================================================================
// 3. secretword.js：真实 manifest + 真实 secretword.js，命中真实词池里的 "dog" ->
//    调用 window.WTJ_AUDIO.playWord(entry)。
// =====================================================================================

test('3. secretword.js 命中 "dog"（真实词池）-> window.WTJ_AUDIO.playWord 被调用', function () {
  var letterHandlers = [];
  var audioCalls = [];

  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = { warn: function () {}, error: function () {}, log: function () {} };
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;

  vm.createContext(sandbox);
  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  assert.ok(sandbox.window.WTJ_MANIFEST, '真实 manifest.js 应挂载 WTJ_MANIFEST');

  sandbox.window.WTJ_KEYBOARD = {
    onLetter: function (fn) {
      letterHandlers.push(fn);
    }
  };
  sandbox.window.WTJ_AUDIO = {
    playWord: function (arg) {
      audioCalls.push(arg);
      return Promise.resolve({ ok: true, silent: false });
    }
  };

  vm.runInContext(SECRETWORD_SRC, sandbox, { filename: 'secretword.js' });
  assert.ok(sandbox.window.WTJ_SECRET, 'secretword.js 应挂载 WTJ_SECRET');

  function feed(str) {
    var i, h;
    for (i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      for (h = 0; h < letterHandlers.length; h++) {
        letterHandlers[h](ch);
      }
    }
  }

  feed('DOG');

  assert.equal(audioCalls.length, 1, '命中 "dog" 应调用一次 playWord');
  assert.equal(audioCalls[0].word, 'dog');
  assert.equal(audioCalls[0].audioFile, 'audio/words/dog.m4a');
  console.log('PASS 3: secretword.js 命中 "dog" -> WTJ_AUDIO.playWord(entry)，audioFile=audio/words/dog.m4a。');
});

// =====================================================================================
// 4. task.js：真实 manifest + 真实 task.js，startTask() -> window.WTJ_AUDIO.playTaskVoice
//    被调用。
// =====================================================================================

test('4. task.js startTask()（真实 task.js）-> window.WTJ_AUDIO.playTaskVoice 被调用', function () {
  var voiceCalls = [];

  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = { warn: function () {}, error: function () {}, log: function () {} };

  vm.createContext(sandbox);
  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });

  sandbox.window.WTJ_AUDIO = {
    playTaskVoice: function (arg) {
      voiceCalls.push(arg);
      return Promise.resolve({ ok: true, silent: false });
    }
  };

  vm.runInContext(TASK_SRC, sandbox, { filename: 'task.js' });
  assert.ok(sandbox.window.WTJ_TASK, 'task.js 应挂载 WTJ_TASK');

  // task.js 默认时钟捕获宿主 setTimeout/clearTimeout/Date.now；vm 沙箱 global 不提供这些
  // （非 ECMAScript 内建）。本用例只关心 startTask() 同步触发的 playTaskVoice 调用，不需要
  //真的推进 15/30/45-60s 计时器，因此注入一个不触发任何回调的假时钟占位即可，避免
  // ReferenceError（与 task-lifecycle.test.mjs 的 _setClock 用法同一手法，但更简化）。
  sandbox.window.WTJ_TASK._setClock({
    setTimeout: function () {
      return 0;
    },
    clearTimeout: function () {},
    now: function () {
      return 0;
    }
  });

  var taskDef = { type: 'find', voicePrompt: 'audio/tasks/find-the-dog.m4a' };
  var started = sandbox.window.WTJ_TASK.startTask(taskDef);
  assert.equal(started, true, 'startTask() 应返回 true');
  assert.equal(voiceCalls.length, 1, 'startTask() 应调用一次 playTaskVoice');
  assert.equal(voiceCalls[0], 'audio/tasks/find-the-dog.m4a', 'playTaskVoice 应收到 taskDef.voicePrompt');
  console.log('PASS 4: task.js startTask() -> WTJ_AUDIO.playTaskVoice("audio/tasks/find-the-dog.m4a")。');
});

// =====================================================================================
// 5. task-templates.js / reward-chest.js / status-rewards.js 的 playSfx 调用断言已由各自
//    engine 现有的 durable 测试覆盖（详见文件头第 5 条说明）；这里只做一次"覆盖没有被悄悄
//    删掉"的守门断言，不重复搭建它们各自的假时钟/DOM/canvas sandbox。
// =====================================================================================

test('5. task-templates.js/reward-chest.js/status-rewards.js 各自现有测试仍然断言 playSfx(task-success/chest-open/streak-reward-fanfare) 被真实调用', function () {
  var ttSrc = readFileSync(path.join(__dirname, 'task-templates.test.mjs'), 'utf8');
  var rcSrc = readFileSync(path.join(__dirname, 'reward-chest.test.mjs'), 'utf8');
  var srSrc = readFileSync(path.join(__dirname, 'status-rewards.test.mjs'), 'utf8');

  assert.ok(
    /audioStub\.calls\.length,\s*4/.test(ttSrc),
    'task-templates.test.mjs 应仍断言四类任务各完成一次都尝试播放 successAudio（"7. 完成 -> ..." 用例）'
  );
  assert.ok(
    rcSrc.indexOf("env.audioStub.calls[0], 'chest-open'") !== -1,
    'reward-chest.test.mjs 应仍断言 playSfx 收到 chest-open sfxKey'
  );
  assert.ok(
    srSrc.indexOf("env.audioStub.calls[0], 'streak-reward-fanfare'") !== -1,
    'status-rewards.test.mjs 应仍断言 playSfx 收到 streak-reward-fanfare sfxKey'
  );
  console.log('PASS 5: 三个引擎既有测试仍覆盖 playSfx(task-success/chest-open/streak-reward-fanfare) 的真实调用断言。');
});

// =====================================================================================
// 6. happy path 不 silent：真实 audio.js + 真实磁盘上的 .m4a（074/075 已交付）—— unlock 后
//    playWord/playTaskVoice/playSfx 对本卡实际接线的 5 条路径都应 resolve silent:false。
//    fetch 用真实 fs.readFileSync 读盘（而非网络请求，遵守 audio.js"零外部请求"约束）；
//    AudioContext.decodeAudioData 用确定性假实现（真实解码依赖浏览器音频管线，Node 环境
//    没有——这里只验证 audio.js 自己"文件读到即播放成功"这条逻辑路径，不重新验证 m4a
//    编码本身可解码，编码正确性由人工 QA/074/075 的"文件非空"静态检查兜底）。这组断言同时
//    隐含验证了 word/task/sfx 三类路径与磁盘上已交付文件对齐——任一路径缺失或改名，
//    fetch 会返回 404，对应结果就会变成 silent:true，断言随之失败。
// =====================================================================================

function makeRealFileFetch() {
  return function (requestPath) {
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

function FakeAudioContextForDecode() {
  this.state = 'suspended';
  this.currentTime = 0;
  this.destination = {};
}
FakeAudioContextForDecode.prototype.resume = function () {
  var self = this;
  return new Promise(function (resolve) {
    self.state = 'running';
    resolve();
  });
};
FakeAudioContextForDecode.prototype.decodeAudioData = function (arrayBuffer, resolve) {
  resolve({ decoded: true, byteLength: arrayBuffer.byteLength, duration: 1 });
};
FakeAudioContextForDecode.prototype.createBufferSource = function () {
  return {
    buffer: null,
    connect: function () {},
    start: function () {}
  };
};

test('6. happy path 不 silent：真实 audio.js 对真实磁盘 .m4a 播放 playWord/playTaskVoice/playSfx 均 silent:false', function () {
  var sandbox = makeAudioJsSandbox(makeRealFileFetch(), FakeAudioContextForDecode);
  var WTJ_AUDIO = sandbox.window.WTJ_AUDIO;

  return WTJ_AUDIO.unlock().then(function (unlocked) {
    assert.equal(unlocked, true, 'unlock() 对假 AudioContext 应 resolve true');
    assert.equal(WTJ_AUDIO.isUnlocked(), true);

    return WTJ_AUDIO.playWord({ word: 'dog', audioFile: 'audio/words/dog.m4a' }).then(function (r1) {
      assert.equal(r1.silent, false, 'playWord("dog") 命中真实 audio/words/dog.m4a，不应 silent');
      assert.equal(r1.ok, true);

      return WTJ_AUDIO.playTaskVoice({ id: 'find-the-dog', voicePrompt: 'audio/tasks/find-the-dog.m4a' }).then(function (r2) {
        assert.equal(r2.silent, false, 'playTaskVoice(find-the-dog) 命中真实文件，不应 silent');

        return WTJ_AUDIO.playSfx({ sfxKey: 'task-success', path: 'audio/sfx/task-success.m4a' }).then(function (r3) {
          assert.equal(r3.silent, false, 'playSfx(task-success)（task-templates.js 任务完成态使用）不应 silent');

          return WTJ_AUDIO.playSfx('chest-open').then(function (r4) {
            assert.equal(r4.silent, false, 'playSfx(chest-open)（reward-chest.js 开箱使用）不应 silent');

            return WTJ_AUDIO.playSfx('streak-reward-fanfare').then(function (r5) {
              assert.equal(r5.silent, false, 'playSfx(streak-reward-fanfare)（status-rewards.js 连续完成奖励使用）不应 silent');
              console.log('PASS 6: unlock + 5 条核心真实路径 playWord/playTaskVoice/playSfx 全部 silent:false（真发声路径打通）。');
            });
          });
        });
      });
    });
  });
});

// =====================================================================================
// 7. app.js：真实 app.js 在最小 DOM/canvas vm 沙箱里加载——首次 click/keydown 应委托给
//    window.WTJ_AUDIO.unlock()（而非自建 AudioContext）；WTJ_AUDIO 缺失时走兜底桩不崩。
// =====================================================================================

function makeFakeCanvasCtx() {
  return {
    setTransform: function () {},
    clearRect: function () {},
    fillRect: function () {},
    beginPath: function () {},
    arc: function () {},
    fill: function () {},
    stroke: function () {},
    save: function () {},
    restore: function () {},
    translate: function () {},
    rotate: function () {},
    fillText: function () {}
  };
}

function makeFakeElement(tag) {
  return {
    tagName: tag,
    style: {},
    textContent: '',
    width: 0,
    height: 0,
    classList: {
      add: function () {},
      remove: function () {}
    },
    getContext: function () {
      return makeFakeCanvasCtx();
    },
    addEventListener: function () {}
  };
}

// 构造 app.js 需要的最小 window/document 沙箱。返回 { sandbox, elements, fireWindowEvent }，
// fireWindowEvent 用于模拟首次 keydown/click 手势（触发 app.js 的 unlockAudio()）。
function makeAppJsSandbox(opts) {
  opts = opts || {};
  var elements = {
    stage: makeFakeElement('canvas'),
    'dbg-key': makeFakeElement('div'),
    'dbg-mouse': makeFakeElement('div'),
    'dbg-fps': makeFakeElement('div'),
    'dbg-audio': makeFakeElement('div'),
    'esc-progress-wrap': makeFakeElement('div'),
    'esc-progress-bar': makeFakeElement('div')
  };

  var fakeDocument = {
    getElementById: function (id) {
      return elements[id] || null;
    }
  };

  var windowListeners = {};

  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.document = fakeDocument;
  sandbox.console = { warn: function () {}, error: function () {}, log: function () {} };
  sandbox.performance = { now: function () { return Date.now(); } };
  sandbox.devicePixelRatio = 1;
  sandbox.innerWidth = 1024;
  sandbox.innerHeight = 768;
  sandbox.requestAnimationFrame = function () { return 1; }; // no-op：本用例不需要真的跑渲染帧
  sandbox.addEventListener = function (type, fn) {
    if (!windowListeners[type]) windowListeners[type] = [];
    windowListeners[type].push(fn);
  };

  if (opts.audioStub) {
    sandbox.window.WTJ_AUDIO = opts.audioStub;
  }
  if (opts.AudioContextCtor) {
    sandbox.AudioContext = opts.AudioContextCtor;
  }

  vm.createContext(sandbox);
  vm.runInContext(APP_SRC, sandbox, { filename: 'app.js' });

  function fireWindowEvent(type, evt) {
    var handlers = windowListeners[type] || [];
    handlers.forEach(function (fn) {
      fn(evt || {});
    });
  }

  return {
    sandbox: sandbox,
    elements: elements,
    fireWindowEvent: fireWindowEvent
  };
}

test('7a. app.js 首次 keydown -> 委托 window.WTJ_AUDIO.unlock()，不自建 AudioContext', function () {
  var unlockCalls = 0;
  var acConstructCalls = 0;

  function FakeAC() {
    acConstructCalls++;
    this.state = 'running';
  }

  var audioStub = {
    unlock: function () {
      unlockCalls++;
      return Promise.resolve(true);
    },
    isUnlocked: function () {
      return true;
    }
  };

  var env = makeAppJsSandbox({ audioStub: audioStub, AudioContextCtor: FakeAC });
  env.fireWindowEvent('keydown', { key: 'a' });

  assert.equal(unlockCalls, 1, '首次 keydown 应调用一次 window.WTJ_AUDIO.unlock()');
  assert.equal(acConstructCalls, 0, 'WTJ_AUDIO 存在时 app.js 不应再自建 AudioContext');
  console.log('PASS 7a: 首次 keydown 委托 WTJ_AUDIO.unlock()，未创建独立 AudioContext。');
});

test('7b. app.js unlock 结果异步回填 dbg-audio（running 可诊断文本）', function () {
  var audioStub = {
    unlock: function () {
      return Promise.resolve(true);
    },
    isUnlocked: function () {
      return true;
    }
  };
  var env = makeAppJsSandbox({ audioStub: audioStub });
  env.fireWindowEvent('click', {});

  return Promise.resolve().then(function () {
    // unlock() 的 .then 回调是微任务，紧随其后再排一个微任务足够让 dbg-audio 回填完成
    // （二者共享同一个 Node 进程的微任务队列，先入先出）。
    assert.equal(env.elements['dbg-audio'].textContent, 'running', 'dbg-audio 应回填 unlock() 的诊断结果');
    console.log('PASS 7b: dbg-audio 回填为 "running"。');
  });
});

test('7c. app.js 防御回退：window.WTJ_AUDIO 缺失时走独立 AudioContext 兜底桩，不抛错', function () {
  var acConstructCalls = 0;
  function FakeAC() {
    acConstructCalls++;
    this.state = 'suspended';
    this.resume = function () {
      this.state = 'running';
      return Promise.resolve();
    };
  }

  var threw = false;
  var env = null;
  try {
    env = makeAppJsSandbox({ AudioContextCtor: FakeAC }); // 不设 audioStub -> WTJ_AUDIO 缺失
    env.fireWindowEvent('keydown', { key: 'a' });
  } catch (e) {
    threw = true;
  }

  assert.equal(threw, false, 'WTJ_AUDIO 缺失时 unlockAudio() 不应抛错');
  assert.equal(acConstructCalls, 1, '兜底桩应创建一个独立 AudioContext');
  assert.notEqual(env.elements['dbg-audio'].textContent, '', 'dbg-audio 兜底桩也应回填可诊断文本');
  console.log('PASS 7c: WTJ_AUDIO 缺失时兜底桩生效，独立创建 1 个 AudioContext，dbg-audio=' + env.elements['dbg-audio'].textContent + '，未抛错。');
});
