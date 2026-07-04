// Unit test for app/web/audio.js — WTJ-20260704-016 audio/TTS/SFX manager.
//
// Durable QA asset (AGENTS.md rule 10 / tests/README.md): logic-level test for
// window.WTJ_AUDIO. Runs under plain Node with no deps — it stubs
// window / fetch / AudioContext, then loads app/web/audio.js (a non-module
// script that assigns to window/global) via createRequire.
//
// Run:  node tests/unit/audio-manager.test.mjs
// Exit: 0 = all assertions passed, 1 = failure.
//
// audio.js only ever touches window.*, so stubbing global (which we alias to
// window) exercises the real code path unmodified.

import assert from 'node:assert';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

var require = createRequire(import.meta.url);
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var AUDIO_JS_PATH = path.resolve(__dirname, '../../app/web/audio.js');

// --- deterministic fakes ------------------------------------------------

var warnCalls = [];
var startCalls = []; // records every BufferSource.start(when) argument, in order.

var FAKE_BUFFER_DURATION = 2.0; // seconds; used to validate composite offsets.

function FakeAudioContext() {
  this.state = 'suspended';
  this.currentTime = 0; // held fixed so scheduled offsets are deterministic.
  this.destination = { fakeDestination: true };
}
FakeAudioContext.prototype.resume = function () {
  var self = this;
  return new Promise(function (resolve) {
    self.state = 'running';
    resolve();
  });
};
FakeAudioContext.prototype.decodeAudioData = function (arrayBuffer, resolve) {
  // callback-style success; tag the decoded buffer with a duration so the
  // sequential-scheduling math in playComposite can be asserted.
  resolve({ decoded: true, byteLength: arrayBuffer.byteLength, duration: FAKE_BUFFER_DURATION });
};
FakeAudioContext.prototype.createBufferSource = function () {
  return {
    buffer: null,
    connect: function () {},
    start: function (when) {
      startCalls.push(when);
    }
  };
};

// fetch stub: paths containing "exists" resolve ok with a 16-byte buffer;
// everything else resolves ok:false (a missing file — which audio.js treats
// identically to the real file:// CORS-failure case per its degrade contract).
function fakeFetch(requestPath) {
  if (requestPath.indexOf('exists') !== -1) {
    return Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: function () {
        return Promise.resolve(new ArrayBuffer(16));
      }
    });
  }
  return Promise.resolve({ ok: false, status: 404 });
}

global.window = global;
global.fetch = fakeFetch;
global.AudioContext = FakeAudioContext;
global.console.warn = function () {
  var args = Array.prototype.slice.call(arguments);
  warnCalls.push(args.join(' '));
};

require(AUDIO_JS_PATH);

var WTJ_AUDIO = global.WTJ_AUDIO;

function section(name) {
  console.log('\n=== ' + name + ' ===');
}

var EPS = 1e-9;

function run() {
  var pending = Promise.resolve();

  section('1. window.WTJ_AUDIO frozen + non-writable binding + method surface');
  assert.ok(WTJ_AUDIO, 'WTJ_AUDIO should exist on window/global');
  assert.strictEqual(Object.isFrozen(WTJ_AUDIO), true, 'WTJ_AUDIO must be frozen');
  var expectedMethods = [
    'unlock', 'isUnlocked', 'preload', 'preloadManifest',
    'playWord', 'playSfx', 'playTaskVoice', 'playComposite',
    'clearCache', 'getCacheStats', 'setMaxCacheEntries',
    'getMissingReport', 'getSfxKeys'
  ];
  expectedMethods.forEach(function (m) {
    assert.strictEqual(typeof WTJ_AUDIO[m], 'function', 'WTJ_AUDIO.' + m + ' should be a function');
  });
  var beforeMethod = WTJ_AUDIO.playWord;
  var threwOnMethodReassign = false;
  try { WTJ_AUDIO.playWord = null; } catch (e) { threwOnMethodReassign = true; }
  assert.strictEqual(WTJ_AUDIO.playWord, beforeMethod, 'frozen API must reject method reassignment');
  var threwOnNewProp = false;
  try { WTJ_AUDIO.newHackedMethod = function () {}; } catch (e) { threwOnNewProp = true; }
  assert.strictEqual(WTJ_AUDIO.newHackedMethod, undefined, 'frozen API must reject new properties');
  console.log('PASS: frozen (method-reassign threw=' + threwOnMethodReassign + ', new-prop threw=' + threwOnNewProp + '), all', expectedMethods.length, 'methods present.');

  section('1b. P2-6: window.WTJ_AUDIO binding is non-writable (cannot be swapped out wholesale)');
  var desc = Object.getOwnPropertyDescriptor(global, 'WTJ_AUDIO');
  assert.ok(desc, 'WTJ_AUDIO property descriptor should exist on window');
  assert.strictEqual(desc.writable, false, 'window.WTJ_AUDIO must be non-writable');
  assert.strictEqual(desc.configurable, false, 'window.WTJ_AUDIO must be non-configurable');
  var original = global.WTJ_AUDIO;
  var threwOnBindingReassign = false;
  try {
    global.WTJ_AUDIO = { impostor: true };
  } catch (e) {
    threwOnBindingReassign = true; // strict-mode ESM throws; that is the point.
  }
  assert.strictEqual(global.WTJ_AUDIO, original, 'window.WTJ_AUDIO binding must survive reassignment attempt');
  console.log('PASS: window binding is non-writable/non-configurable (reassign threw=' + threwOnBindingReassign + ') and unchanged.');

  section('2. playWord(missing) degrades to silent + is recorded in getMissingReport()');
  pending = pending.then(function () {
    return WTJ_AUDIO.playWord('nonexistent-xyz').then(function (result) {
      console.log('playWord result:', JSON.stringify(result));
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.silent, true);
      assert.strictEqual(result.path, 'audio/words/nonexistent-xyz.m4a');
      var report = WTJ_AUDIO.getMissingReport();
      var found = report.filter(function (e) { return e.type === 'word' && e.key === 'nonexistent-xyz'; });
      assert.strictEqual(found.length, 1, 'missing report should contain exactly one entry for nonexistent-xyz');
      console.log('PASS: playWord(missing) resolved silently and recorded in getMissingReport().');
    });
  });

  section('3. preload(missing) degrades gracefully (array of loaded:false, no throw)');
  pending = pending.then(function () {
    return WTJ_AUDIO.preload(['audio/sfx/does-not-exist-1.m4a', 'audio/sfx/does-not-exist-2.m4a']).then(function (results) {
      assert.strictEqual(results.length, 2);
      results.forEach(function (r) { assert.strictEqual(r.loaded, false); });
      console.log('PASS: preload(missing) resolved with loaded:false entries, no throw.');
    });
  });

  section('4. playSfx(unregistered key) falls back to conventional path + records gap');
  pending = pending.then(function () {
    return WTJ_AUDIO.playSfx('totally-unregistered-sfx').then(function (result) {
      assert.strictEqual(result.silent, true);
      assert.strictEqual(result.path, 'audio/sfx/totally-unregistered-sfx.m4a');
      console.log('PASS: playSfx(unregistered) resolves silently via fallback convention.');
    });
  });

  section('5. playSfx(known key) resolves the documented DEFAULT_SFX_MAP path');
  pending = pending.then(function () {
    return WTJ_AUDIO.playSfx('chest-open').then(function (result) {
      assert.strictEqual(result.path, 'audio/sfx/chest-open.m4a');
      console.log('PASS: playSfx("chest-open") -> audio/sfx/chest-open.m4a.');
    });
  });

  section('6. LRU eviction: max=3, load 5 distinct existing files, oldest 2 evicted; re-touch -> MRU');
  pending = pending.then(function () {
    WTJ_AUDIO.clearCache();
    assert.strictEqual(WTJ_AUDIO.setMaxCacheEntries(3), true);
    var items = [
      'audio/sfx/exists-1.m4a', 'audio/sfx/exists-2.m4a', 'audio/sfx/exists-3.m4a',
      'audio/sfx/exists-4.m4a', 'audio/sfx/exists-5.m4a'
    ];
    var chain = Promise.resolve();
    items.forEach(function (item) {
      chain = chain.then(function () { return WTJ_AUDIO.preload([item]); });
    });
    return chain.then(function () {
      var stats = WTJ_AUDIO.getCacheStats();
      console.log('cache stats (max=3, loaded 5):', JSON.stringify(stats));
      assert.strictEqual(stats.maxEntries, 3);
      assert.strictEqual(stats.size, 3);
      assert.deepStrictEqual(stats.keys, ['audio/sfx/exists-3.m4a', 'audio/sfx/exists-4.m4a', 'audio/sfx/exists-5.m4a']);
      return WTJ_AUDIO.preload(['audio/sfx/exists-3.m4a']).then(function () {
        var stats2 = WTJ_AUDIO.getCacheStats();
        assert.deepStrictEqual(stats2.keys, ['audio/sfx/exists-4.m4a', 'audio/sfx/exists-5.m4a', 'audio/sfx/exists-3.m4a']);
        console.log('PASS: LRU keeps 3 newest; re-access moves entry to most-recently-used.');
        WTJ_AUDIO.setMaxCacheEntries(64);
        WTJ_AUDIO.clearCache();
      });
    });
  });

  section('7. P1-1: playComposite schedules parts SEQUENTIALLY on the audio clock (no overlap)');
  pending = pending.then(function () {
    WTJ_AUDIO.clearCache();
    startCalls.length = 0;
    // three present parts -> should be scheduled at 0, D, 2D (D = FAKE_BUFFER_DURATION).
    return WTJ_AUDIO.playComposite([
      'audio/phrases/exists-find.m4a',
      'audio/words/exists-dog.m4a',
      'audio/sfx/exists-tail.m4a'
    ]).then(function (result) {
      console.log('composite parts startedAtSec:', JSON.stringify(result.parts.map(function (p) { return p.startedAtSec; })));
      console.log('composite parts durationSec:', JSON.stringify(result.parts.map(function (p) { return p.durationSec; })));
      console.log('recorded source.start(when) calls, in order:', JSON.stringify(startCalls));
      assert.strictEqual(result.parts.length, 3);
      // all three present -> all ok, none silent.
      result.parts.forEach(function (p) {
        assert.strictEqual(p.ok, true);
        assert.strictEqual(p.silent, false);
      });
      // (a) start times strictly increasing.
      assert.ok(result.parts[1].startedAtSec > result.parts[0].startedAtSec, 'part2 must start after part1');
      assert.ok(result.parts[2].startedAtSec > result.parts[1].startedAtSec, 'part3 must start after part2');
      // (b) each part starts at (previous start + previous duration): no overlap, no gap.
      assert.ok(Math.abs(result.parts[1].startedAtSec - (result.parts[0].startedAtSec + result.parts[0].durationSec)) < EPS,
        'part2 must start exactly when part1 ends');
      assert.ok(Math.abs(result.parts[2].startedAtSec - (result.parts[1].startedAtSec + result.parts[1].durationSec)) < EPS,
        'part3 must start exactly when part2 ends');
      // (c) the actual source.start(when) calls recorded on the fake context match the cumulative offsets.
      assert.deepStrictEqual(startCalls, [0, FAKE_BUFFER_DURATION, 2 * FAKE_BUFFER_DURATION],
        'source.start() must be called with cumulative offsets [0, D, 2D], proving sequential no-overlap scheduling');
      assert.strictEqual(result.silent, false);
      console.log('PASS: playComposite scheduled parts at cumulative offsets [0, D, 2D] -> sequential, non-overlapping.');
    });
  });

  section('7b. playComposite skips missing parts on the timeline (missing contributes 0 duration)');
  pending = pending.then(function () {
    WTJ_AUDIO.clearCache();
    startCalls.length = 0;
    // middle part missing -> present parts still schedule sequentially at 0 then D.
    return WTJ_AUDIO.playComposite([
      'audio/phrases/exists-a.m4a',   // present -> start 0
      { type: 'word', key: 'ghostword' }, // missing -> silent, no start call, no time consumed
      'audio/sfx/exists-b.m4a'        // present -> start D (right after part1)
    ]).then(function (result) {
      console.log('mixed composite startedAtSec:', JSON.stringify(result.parts.map(function (p) { return p.startedAtSec; })));
      console.log('recorded start calls:', JSON.stringify(startCalls));
      assert.strictEqual(result.parts.length, 3);
      assert.strictEqual(result.parts[0].silent, false);
      assert.strictEqual(result.parts[1].silent, true);
      assert.strictEqual(result.parts[2].silent, false);
      assert.strictEqual(result.silent, false, 'not all-silent since two parts played');
      assert.deepStrictEqual(startCalls, [0, FAKE_BUFFER_DURATION],
        'only the two present parts should start, at [0, D]; the missing part consumes no timeline');
      console.log('PASS: missing composite parts are skipped without consuming timeline; present parts stay sequential.');
    });
  });

  section('8. playTaskVoice supports string convention AND manifest-object passthrough');
  pending = pending.then(function () {
    return WTJ_AUDIO.playTaskVoice('press-a').then(function (r1) {
      assert.strictEqual(r1.path, 'audio/tasks/press-a.m4a');
      return WTJ_AUDIO.playTaskVoice({ id: 'press-letter-a', voicePrompt: 'audio/tasks/press-a.m4a' }).then(function (r2) {
        assert.strictEqual(r2.path, 'audio/tasks/press-a.m4a');
        assert.strictEqual(r2.key, 'press-letter-a');
        console.log('PASS: playTaskVoice string + object passthrough both resolve (id != filename stem case).');
      });
    });
  });

  section('9. defensive argument validation: invalid inputs warn + resolve, never throw');
  pending = pending.then(function () {
    return WTJ_AUDIO.playWord(12345).then(function (r1) {
      assert.strictEqual(r1.silent, true);
      assert.strictEqual(r1.reason, 'invalid-arg');
      return WTJ_AUDIO.playSfx(null).then(function (r2) {
        assert.strictEqual(r2.silent, true);
        return WTJ_AUDIO.preload('not-an-array').then(function (r3) {
          assert.deepStrictEqual(r3, []);
          return WTJ_AUDIO.playComposite([]).then(function (r4) {
            assert.strictEqual(r4.silent, true);
            assert.strictEqual(r4.reason, 'invalid-arg');
            console.log('PASS: invalid args across playWord/playSfx/preload/playComposite degrade without throwing.');
          });
        });
      });
    });
  });

  section('10. warnOnce dedup: repeated missing lookups warn only once per message');
  pending = pending.then(function () {
    var before = warnCalls.length;
    return WTJ_AUDIO.playWord('dedup-test-word').then(function () {
      return WTJ_AUDIO.playWord('dedup-test-word').then(function () {
        var matching = warnCalls.slice(before).filter(function (w) { return w.indexOf('dedup-test-word') !== -1; });
        assert.strictEqual(matching.length, 1, 'identical missing-resource warning should only be logged once');
        console.log('PASS: warnOnce() dedups repeated warnings (' + matching.length + ' warn for 2 calls).');
      });
    });
  });

  section('11. unlock()/isUnlocked() lifecycle');
  pending = pending.then(function () {
    assert.strictEqual(WTJ_AUDIO.isUnlocked(), false);
    return WTJ_AUDIO.unlock().then(function (ok) {
      assert.strictEqual(ok, true);
      assert.strictEqual(WTJ_AUDIO.isUnlocked(), true);
      console.log('PASS: unlock() resumes the AudioContext; isUnlocked() reflects it.');
    });
  });

  section('12. getSfxKeys() mirrors the 25-key DEFAULT_SFX_MAP (ui/animal/bell/water/chest/keySound)');
  pending = pending.then(function () {
    // WTJ-20260704-084 追加了 5 个 keySound 类键位（key-letter/key-space/key-enter/
    // key-punct/key-modifier，逐键机械键盘反馈音），20 -> 25，见 audio/sfx-manifest.json
    // 'keySound' 分类与 audio/SOURCE-LICENSES.md「WTJ-20260704-084 追加」一节。
    var keys = WTJ_AUDIO.getSfxKeys();
    assert.strictEqual(keys.length, 25);
    ['task-success', 'chest-open', 'dog-bark', 'bell-ring', 'water-tap-flow', 'key-letter', 'key-space', 'key-enter', 'key-punct', 'key-modifier'].forEach(function (k) {
      assert.ok(keys.indexOf(k) !== -1, 'expected sfx key ' + k);
    });
    console.log('PASS: getSfxKeys() has 25 entries covering all six categories.');
  });

  return pending;
}

run()
  .then(function () {
    console.log('\n=== ALL ASSERTIONS PASSED ===');
    console.log('Total console.warn() calls captured during run:', warnCalls.length);
    process.exit(0);
  })
  .catch(function (err) {
    console.error('\n=== TEST FAILURE ===');
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
