// WTJ-20260704-084 — keysound.js 单元测试（durable QA asset，音频侧：机械键音 + 非字母键
// 音频反馈接线）
//
// 用 Node 内置 vm 模块搭一个沙箱 context，按 index.html 的真实加载顺序在同一 sandbox 里
// 依次加载真实的 app/web/manifest.js（挂 window.WTJ_MANIFEST）、真实的 app/web/keyboard.js
// （挂 window.WTJ_KEYBOARD，读取上面的 manifest）、再加载真实的 app/web/keysound.js（订阅
// window.WTJ_KEYBOARD.onLetter/onFunctionKey，挂 window.WTJ_KEYSOUND）。sandbox 里提供 stub
// 的 window.addEventListener（捕获 keydown 处理函数，同 keyboard-engine.test.mjs 同款手法）
// 与一个手写的「录音」window.WTJ_AUDIO stub（record playSfx 调用），然后通过手动调用捕获到
// 的 keydown 处理函数注入合成按键事件，断言 keysound.js 播放了正确的 sfxKey，以及 intensity
// 低于阈值时被跳过（"递减不鼓励乱按"，REQ-KB-06）。
//
// 覆盖范围（见下方分组）：
//   1. 动态 wiring：onLetter → playSfx('key-letter')；onFunctionKey 各 category → 对应
//      sfxKey；intensity 阈值判定（递减到阈值以下跳过播放）；WTJ_AUDIO/WTJ_KEYBOARD 缺失时
//      不崩；重复引入守卫。
//   2. 静态：新键音路径与 audio.js DEFAULT_SFX_MAP / audio/sfx-manifest.json /
//      audio/missing-audio.json 三处对齐；真实 .m4a 文件在盘（存在、非空、aac/24k/mono、
//      峰值 <= -1.5dB、时长合理 < 0.2s）；keysound.js 全文无 speechSynthesis 引用；
//      index.html 加载顺序正确（keyboard.js/audio.js 之后）。
//
// Run:  node --test tests/unit/keysound.test.mjs
//       （或整目录：node --test 'tests/unit/*.test.mjs'）
// Exit: 0 = all assertions passed, 1 = failure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
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
var KEYBOARD_SRC = readSrc('keyboard.js');
var KEYSOUND_SRC = readSrc('keysound.js');

// =====================================================================================
// 沙箱构造：同 keyboard-engine.test.mjs 的手法——同一 sandbox 内按真实加载顺序依次跑
// manifest.js -> keyboard.js -> keysound.js。
// =====================================================================================
function createSandbox(opts) {
  var options = opts || {};
  var keydownHandler = null;
  var playSfxCalls = [];

  var fakeWindow = {
    addEventListener: function (type, handler) {
      if (type === 'keydown') {
        keydownHandler = handler;
      }
    },
    removeEventListener: function () {},
    console: console
  };

  if (!options.omitAudio) {
    fakeWindow.WTJ_AUDIO = {
      playSfx: function (sfxKeyOrObj) {
        playSfxCalls.push(sfxKeyOrObj);
        return Promise.resolve({ ok: true, silent: false, type: 'sfx', key: sfxKeyOrObj, path: 'audio/sfx/' + sfxKeyOrObj + '.m4a' });
      }
    };
  }

  var sandbox = { window: fakeWindow, console: console };
  vm.createContext(sandbox);

  vm.runInContext(MANIFEST_SRC, sandbox, { filename: 'manifest.js' });
  assert.ok(fakeWindow.WTJ_MANIFEST, '加载真实 manifest.js 后 window.WTJ_MANIFEST 应存在');

  if (!options.omitKeyboard) {
    vm.runInContext(KEYBOARD_SRC, sandbox, { filename: 'keyboard.js' });
    assert.equal(typeof keydownHandler, 'function', 'keyboard.js 必须通过 window.addEventListener("keydown", ...) 注册处理函数');
    assert.ok(fakeWindow.WTJ_KEYBOARD, 'keyboard.js 必须挂载 window.WTJ_KEYBOARD');
  }

  vm.runInContext(KEYSOUND_SRC, sandbox, { filename: 'keysound.js' });

  function fire(key, extra) {
    assert.equal(typeof keydownHandler, 'function', 'fire() 需要 keyboard.js 已注册 keydown 处理函数');
    var evt = { key: key, repeat: false };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) evt[k] = extra[k];
      }
    }
    keydownHandler(evt);
  }

  return {
    window: fakeWindow,
    context: sandbox,
    manifest: fakeWindow.WTJ_MANIFEST,
    KEYBOARD: fakeWindow.WTJ_KEYBOARD,
    KEYSOUND: fakeWindow.WTJ_KEYSOUND,
    playSfxCalls: playSfxCalls,
    fire: fire
  };
}

// =====================================================================================
// 1. 动态 wiring
// =====================================================================================

test('1a. API 冻结：window.WTJ_KEYSOUND 是 frozen 对象且方法齐全', function () {
  var sb = createSandbox();
  assert.ok(sb.KEYSOUND, 'keysound.js 必须挂载 window.WTJ_KEYSOUND');
  assert.equal(Object.isFrozen(sb.KEYSOUND), true);
  assert.equal(typeof sb.KEYSOUND.functionKeyToSfxKey, 'function');
  assert.equal(typeof sb.KEYSOUND.INTENSITY_PLAY_THRESHOLD, 'number');
  try { sb.KEYSOUND.functionKeyToSfxKey = null; } catch (e) { /* 严格模式下抛错也算通过 */ }
  assert.equal(typeof sb.KEYSOUND.functionKeyToSfxKey, 'function');
});

test('1b. 字母/数字键：onLetter 触发 -> playSfx("key-letter")，永远满反馈（不因连打衰减/跳过）', function () {
  var sb = createSandbox();
  sb.fire('a');
  sb.fire('5');
  sb.fire('b');
  assert.deepEqual(sb.playSfxCalls, ['key-letter', 'key-letter', 'key-letter']);
});

test('1c. Space（category=light）首次按下 -> playSfx("key-space")', function () {
  var sb = createSandbox();
  sb.fire(' '); // KeyboardEvent.key 的空格键实际值是单个空格字符
  assert.deepEqual(sb.playSfxCalls, ['key-space']);
});

test('1d. Enter（category=light）首次按下 -> playSfx("key-enter")', function () {
  var sb = createSandbox();
  sb.fire('Enter');
  assert.deepEqual(sb.playSfxCalls, ['key-enter']);
});

test('1e. Shift/Meta（category=weak）首次按下 -> playSfx("key-modifier")', function () {
  var sb = createSandbox();
  sb.fire('Shift');
  sb.fire('Meta');
  assert.deepEqual(sb.playSfxCalls, ['key-modifier', 'key-modifier']);
});

test('1f. 未分类功能键（category=other，如方向键）首次按下 -> playSfx("key-punct")', function () {
  var sb = createSandbox();
  sb.fire('ArrowUp');
  assert.deepEqual(sb.playSfxCalls, ['key-punct']);
});

test('1f-2. WTJ-20260705-002 复核：标点符号键（真正会同时触发新增 onSymbol 的那类键）仍经 onFunctionKey 触发 key-punct，未被 onSymbol 分流/改变路由', function () {
  // 002 卡在 keyboard.js 给标点键新增了一条并行的 onSymbol(char, intensity) 通道（DUAL-EMIT，
  // 供 app.js 渲染视觉弹出），但明确要求"不改路由"——keysound.js 完全不知道 onSymbol 的存在，
  // 仍然只订阅 onLetter/onFunctionKey。本用例用真实标点字符（而不是 1f 用的方向键）驱动一次
  // 完整的 keyboard.js -> keysound.js 流程，确认这批"现在会额外触发 onSymbol"的按键，
  // key-punct 音效路径丝毫未受影响。
  var sb = createSandbox();
  [',', '[', ']', '=', '?', '/'].forEach(function (ch) { sb.fire(ch); });
  assert.deepEqual(
    sb.playSfxCalls,
    [',', '[', ']', '=', '?', '/'].map(function () { return 'key-punct'; }),
    '每个标点字符都应仍然各触发一次 playSfx("key-punct")，与 002 卡新增的 onSymbol 无关'
  );
});

test('1g. intensity 递减到阈值以下时跳过播放（"不鼓励乱按"，REQ-KB-06）—— weak 类连续同键第 4 次起静音', function () {
  var sb = createSandbox();
  // keyboard.js 衰减曲线：FUNCTION_KEY_BASE_INTENSITY.weak=0.3，FUNCTION_KEY_DECAY_SPAN=4，
  // decayMultiplier = max(0, 1-(streak-1)/4)：streak1..4 -> intensity 0.3/0.225/0.15/0.075。
  // keysound.js INTENSITY_PLAY_THRESHOLD=0.15（阈值判定用 < ，0.15 本身仍播放，0.075 跳过）。
  sb.fire('Shift');
  sb.fire('Shift');
  sb.fire('Shift');
  sb.fire('Shift'); // 第 4 次：intensity=0.075 < 0.15，应被跳过
  assert.deepEqual(sb.playSfxCalls, ['key-modifier', 'key-modifier', 'key-modifier'], '连续同一修饰键第 4 次起应静音（不调用 playSfx）');
});

test('1h. intensity 递减到阈值以下时跳过播放 —— other 类连续同键第 4 次起静音', function () {
  var sb = createSandbox();
  // FUNCTION_KEY_BASE_INTENSITY.other=0.5：streak1..4 -> intensity 0.5/0.375/0.25/0.125。
  sb.fire(';');
  sb.fire(';');
  sb.fire(';');
  sb.fire(';'); // 第 4 次：intensity=0.125 < 0.15，应被跳过
  assert.deepEqual(sb.playSfxCalls, ['key-punct', 'key-punct', 'key-punct']);
});

test('1i. intensity 递减到阈值以下时跳过播放 —— light 类（Space）容忍度更高，连续同键第 5 次起才静音', function () {
  var sb = createSandbox();
  // FUNCTION_KEY_BASE_INTENSITY.light=1：streak1..5 -> intensity 1/0.75/0.5/0.25/0。
  sb.fire(' ');
  sb.fire(' ');
  sb.fire(' ');
  sb.fire(' ');
  sb.fire(' '); // 第 5 次：intensity=0 < 0.15，应被跳过
  assert.deepEqual(sb.playSfxCalls, ['key-space', 'key-space', 'key-space', 'key-space']);
});

test('1j. 换键打断连打streak：修饰键连打 3 次后插入一次不同键，streak 重新计数，第 4 次不再是同一 streak 的"第 4 次"', function () {
  var sb = createSandbox();
  sb.fire('Shift');
  sb.fire('Shift');
  sb.fire('Shift');
  sb.fire('Meta'); // 换键：sameKeyStreak 重置为 1，intensity 回到 0.3
  assert.deepEqual(sb.playSfxCalls, ['key-modifier', 'key-modifier', 'key-modifier', 'key-modifier']);
});

test('1k. window.WTJ_AUDIO 缺失：不崩，静默跳过（console.warn 允许，但不抛异常）', function () {
  var sb = createSandbox({ omitAudio: true });
  assert.doesNotThrow(function () {
    sb.fire('a');
    sb.fire(' ');
    sb.fire('Shift');
  });
});

test('1l. window.WTJ_KEYBOARD 缺失（keyboard.js 未加载/加载顺序错误）：keysound.js 加载不抛异常，仍挂载 window.WTJ_KEYSOUND', function () {
  assert.doesNotThrow(function () {
    var sb = createSandbox({ omitKeyboard: true });
    assert.ok(sb.window.WTJ_KEYSOUND, '即使 WTJ_KEYBOARD 缺失，keysound.js 也应正常挂载 window.WTJ_KEYSOUND（只是订阅不到事件）');
  });
});

test('1m. 重复引入守卫：keysound.js 源码在同一 sandbox 里被重复执行时短路，不会重复订阅（同一次按键只播一次）', function () {
  var sb = createSandbox();
  // 在同一个 vm context（同一个 window 对象）里再跑一遍 keysound.js 源码——如果顶部
  // `if (window.WTJ_KEYSOUND) return;` 守卫失效，这里会再向 onLetter/onFunctionKey 各注册
  // 一个订阅回调。
  vm.runInContext(KEYSOUND_SRC, sb.context, { filename: 'keysound.js (second load)' });
  sb.fire('a');
  var letterCalls = sb.playSfxCalls.filter(function (k) { return k === 'key-letter'; });
  assert.equal(letterCalls.length, 1, 'keysound.js 重复执行后不应重复订阅 onLetter（否则同一次按键会播两遍）');
});

// =====================================================================================
// 2. functionKeyToSfxKey() 映射表直接断言（不必逐个构造完整 payload 走完整链路）
// =====================================================================================

test('2a. functionKeyToSfxKey() 映射表：light/Space -> key-space, light/Enter -> key-enter, weak -> key-modifier, other -> key-punct', function () {
  var sb = createSandbox();
  var f = sb.KEYSOUND.functionKeyToSfxKey;
  assert.equal(f({ key: 'Space', category: 'light', intensity: 1 }), 'key-space');
  assert.equal(f({ key: 'Enter', category: 'light', intensity: 1 }), 'key-enter');
  assert.equal(f({ key: 'Shift', category: 'weak', intensity: 0.3 }), 'key-modifier');
  assert.equal(f({ key: 'Meta', category: 'weak', intensity: 0.3 }), 'key-modifier');
  assert.equal(f({ key: 'ArrowUp', category: 'other', intensity: 0.5 }), 'key-punct');
  // 防御式兜底：未知 category、或 light 类但未知 key，均退回 key-punct，不静默丢失事件。
  assert.equal(f({ key: 'Whatever', category: 'light', intensity: 1 }), 'key-punct');
  assert.equal(f({ key: 'Whatever', category: 'unknown-future-category', intensity: 1 }), 'key-punct');
  assert.equal(f({}), 'key-punct');
});

// =====================================================================================
// 3. 静态：路径三处对齐 + 真实 .m4a 客观 QC + 红线扫描 + index.html 加载顺序
// =====================================================================================

var KEY_SFX_KEYS = ['key-letter', 'key-space', 'key-enter', 'key-punct', 'key-modifier'];

test('3a. audio.js DEFAULT_SFX_MAP 包含全部 5 个新键音 key，路径遵循 audio/sfx/<key>.m4a 约定', function () {
  var audioSrc = readSrc('audio.js');
  KEY_SFX_KEYS.forEach(function (key) {
    var re = new RegExp("'" + key + "':\\s*'audio/sfx/" + key + "\\.m4a'");
    assert.ok(re.test(audioSrc), 'audio.js DEFAULT_SFX_MAP 缺少或路径不匹配: ' + key);
  });
});

test('3b. audio/sfx-manifest.json 包含全部 5 个新键音条目，path 与 sfxKey 对齐、状态 delivered', function () {
  var manifest = JSON.parse(readSrc('audio/sfx-manifest.json'));
  KEY_SFX_KEYS.forEach(function (key) {
    var entry = manifest.sfx.filter(function (e) { return e.sfxKey === key; })[0];
    assert.ok(entry, 'sfx-manifest.json 缺少条目: ' + key);
    assert.equal(entry.path, 'audio/sfx/' + key + '.m4a');
    assert.equal(entry.status, 'delivered');
    assert.equal(entry.category, 'keySound');
  });
});

test('3c. audio/missing-audio.json 的 sfx 段包含全部 5 个新键音条目，状态 delivered', function () {
  var manifest = JSON.parse(readSrc('audio/missing-audio.json'));
  KEY_SFX_KEYS.forEach(function (key) {
    var entry = manifest.sfx.filter(function (e) { return e.sfxKey === key; })[0];
    assert.ok(entry, 'missing-audio.json sfx 段缺少条目: ' + key);
    assert.equal(entry.path, 'audio/sfx/' + key + '.m4a');
    assert.equal(entry.status, 'delivered');
  });
});

test('3d. 真实 .m4a 文件在盘：存在、非空', function () {
  KEY_SFX_KEYS.forEach(function (key) {
    var abs = path.join(APP_WEB, 'audio/sfx/' + key + '.m4a');
    assert.ok(existsSync(abs), '文件不存在: ' + abs);
    assert.ok(statSync(abs).size > 0, '文件为空: ' + abs);
  });
});

function ffprobeJson(absPath) {
  var out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels',
    '-of', 'json',
    absPath
  ], { encoding: 'utf8' });
  return JSON.parse(out);
}

// ffmpeg 的 volumedetect 结果打在 stderr 里；用 spawnSync 同时拿到 stdout/stderr（无论退出码）。
function ffmpegVolumeDetect(absPath) {
  var res = spawnSync('ffmpeg', ['-hide_banner', '-i', absPath, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  var text = (res.stderr || '') + (res.stdout || '');
  var m = text.match(/max_volume:\s*(-?\d+\.?\d*)\s*dB/);
  return m ? parseFloat(m[1]) : null;
}

var HAS_FFMPEG = (function () {
  try {
    var res = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
    return res.status === 0;
  } catch (err) {
    return false;
  }
})();

test('3e. 客观 QC：aac / 24000Hz / mono，时长 < 0.2s（"短促机械键音"）且 >= 0.15s（不与 e2e check_audio_assets.py 的 DUR_MIN 冲突），峰值 <= -1.5dBFS', { skip: !HAS_FFMPEG ? 'ffmpeg 不可用，跳过客观 QC（静态存在性检查见 3d）' : false }, function () {
  KEY_SFX_KEYS.forEach(function (key) {
    var abs = path.join(APP_WEB, 'audio/sfx/' + key + '.m4a');
    var info = ffprobeJson(abs);
    assert.equal(info.streams[0].codec_name, 'aac', key + ' 应为 aac 编码');
    assert.equal(String(info.streams[0].sample_rate), '24000', key + ' 采样率应为 24000');
    assert.equal(String(info.streams[0].channels), '1', key + ' 应为单声道');
    var dur = parseFloat(info.format.duration);
    assert.ok(dur >= 0.15 && dur < 0.2, key + ' 时长应在 [0.15, 0.2) 秒区间，实测 ' + dur);
    var peak = ffmpegVolumeDetect(abs);
    assert.ok(peak !== null, key + ' 未能读到 max_volume');
    assert.ok(peak <= -1.5, key + ' 峰值应 <= -1.5dBFS，实测 ' + peak + 'dB');
  });
});

test('3f. keysound.js 全文（剥掉行注释）不出现 speechSynthesis / SpeechSynthesisUtterance（REQ-AST-07 红线）', function () {
  var stripped = KEYSOUND_SRC
    .split('\n')
    .filter(function (line) { return line.trim().indexOf('//') !== 0; })
    .join('\n');
  assert.ok(stripped.indexOf('speechSynthesis') === -1, 'keysound.js 代码本体不应出现 speechSynthesis');
  assert.ok(stripped.indexOf('SpeechSynthesisUtterance') === -1, 'keysound.js 代码本体不应出现 SpeechSynthesisUtterance');
});

test('3g. index.html 加载 keysound.js，且顺序在 keyboard.js 与 audio.js 之后', function () {
  var indexHtml = readSrc('index.html');
  var scriptTags = [];
  var re = /<script\s+src="([^"]+)"/g;
  var m;
  while ((m = re.exec(indexHtml)) !== null) {
    scriptTags.push(m[1]);
  }
  var keysoundIdx = scriptTags.indexOf('keysound.js');
  var keyboardIdx = scriptTags.indexOf('keyboard.js');
  var audioIdx = scriptTags.indexOf('audio.js');
  assert.ok(keysoundIdx !== -1, 'index.html 必须加载 keysound.js');
  assert.ok(keyboardIdx !== -1 && keysoundIdx > keyboardIdx, 'keysound.js 必须在 keyboard.js 之后加载');
  assert.ok(audioIdx !== -1 && keysoundIdx > audioIdx, 'keysound.js 必须在 audio.js 之后加载');
});
