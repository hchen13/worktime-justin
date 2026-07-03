// Unit test for app/web/task.js — WTJ-20260704-013 question-mark task framework
// and task lifecycle state machine (window.WTJ_TASK).
//
// Durable QA asset (AGENTS.md rule 10 / tests/README.md): logic-level test for
// window.WTJ_TASK. Loads the REAL app/web/manifest.js and app/web/task.js source
// via node:vm into an isolated sandbox per scenario (task.js holds module-level
// singleton state, so each scenario gets its own fresh context rather than
// sharing one global — this avoids cross-scenario leakage of ACTIVE/IDLE state,
// timers, and subscriber lists).
//
// window.WTJ_HUD / window.WTJ_AUDIO / window.WTJ_KEYBOARD are stubbed per the
// documented contracts (app/web/MANIFEST.md "HUD API", app/web/audio/AUDIO-API.md,
// app/web/keyboard.js header) — just enough surface for task.js's defensive
// wiring (onQuestionClick / playTaskVoice / onEffectiveKey) to exercise real
// code paths. task.js's own timers are swapped for a virtual/fake clock via its
// documented test hook WTJ_TASK._setClock({setTimeout, clearTimeout, now}), so
// the 45-60s auto-dismiss window is exercised by advancing virtual time, not by
// actually waiting.
//
// Run:  node tests/unit/task-lifecycle.test.mjs
// Run alongside 016 audio test (this machine's Node 25 needs a glob, not a bare
// directory name): node --test 'tests/unit/*.test.mjs'
// Exit: 0 = all assertions passed, 1 = failure.

import assert from 'node:assert';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var MANIFEST_JS_PATH = path.resolve(__dirname, '../../app/web/manifest.js');
var TASK_JS_PATH = path.resolve(__dirname, '../../app/web/task.js');

var manifestSrc = fs.readFileSync(MANIFEST_JS_PATH, 'utf8');
var taskSrc = fs.readFileSync(TASK_JS_PATH, 'utf8');

// --- fake/virtual clock --------------------------------------------------
// Deterministic replacement for setTimeout/clearTimeout/Date.now, driven by
// advance(ms) instead of wall-clock time. Fires timers strictly in fireAt
// order (supports several timers landing at different virtual instants within
// one advance() call, e.g. advancing straight past both the 15s hint and the
// 30s emphasize marks in one jump).
function makeFakeClock() {
  var virtualNow = 0;
  var timers = [];
  var nextId = 1;

  function fakeSetTimeout(fn, ms) {
    var id = nextId++;
    timers.push({ id: id, fireAt: virtualNow + ms, fn: fn, fired: false, cancelled: false });
    return id;
  }

  function fakeClearTimeout(id) {
    for (var i = 0; i < timers.length; i++) {
      if (timers[i].id === id) {
        timers[i].cancelled = true;
      }
    }
  }

  function fakeNow() {
    return virtualNow;
  }

  function advance(ms) {
    var target = virtualNow + ms;
    for (;;) {
      var next = null;
      var i;
      for (i = 0; i < timers.length; i++) {
        var t = timers[i];
        if (!t.cancelled && !t.fired && t.fireAt <= target) {
          if (next === null || t.fireAt < next.fireAt) {
            next = t;
          }
        }
      }
      if (!next) {
        break;
      }
      virtualNow = next.fireAt;
      next.fired = true;
      next.fn();
    }
    virtualNow = target;
  }

  function pendingCount() {
    var n = 0;
    for (var i = 0; i < timers.length; i++) {
      if (!timers[i].cancelled && !timers[i].fired) n++;
    }
    return n;
  }

  return {
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    now: fakeNow,
    advance: advance,
    pendingCount: pendingCount
  };
}

// --- stubs for window.WTJ_HUD / WTJ_AUDIO / WTJ_KEYBOARD -----------------
function makeStubs() {
  var hudQuestionHandler = null;
  var keyboardEffectiveKeyHandler = null;
  var playTaskVoiceCalls = [];

  var WTJ_HUD = {
    onQuestionClick: function (fn) {
      hudQuestionHandler = fn;
    }
  };
  var WTJ_AUDIO = {
    playTaskVoice: function (arg) {
      playTaskVoiceCalls.push(arg);
      return Promise.resolve({ ok: true, silent: false, type: 'task', key: null, path: null, startedAtSec: 0, durationSec: 1 });
    }
  };
  var WTJ_KEYBOARD = {
    onEffectiveKey: function (fn) {
      keyboardEffectiveKeyHandler = fn;
    }
  };

  return {
    WTJ_HUD: WTJ_HUD,
    WTJ_AUDIO: WTJ_AUDIO,
    WTJ_KEYBOARD: WTJ_KEYBOARD,
    clickQuestion: function () {
      if (typeof hudQuestionHandler === 'function') {
        hudQuestionHandler();
      }
    },
    hasQuestionHandler: function () {
      return typeof hudQuestionHandler === 'function';
    },
    pressEffectiveKey: function () {
      if (typeof keyboardEffectiveKeyHandler === 'function') {
        keyboardEffectiveKeyHandler(999); // arg value is irrelevant to task.js, see its header comment
      }
    },
    playTaskVoiceCalls: playTaskVoiceCalls
  };
}

// --- sandbox / env builder ------------------------------------------------
// opts:
//   includeHud / includeAudio / includeKeyboard (default true) — set false to
//     simulate that dependency not being loaded at all (silent-adapter scenario).
//   randomValue — if a number, overrides Math.random() inside the sandbox so
//     autoDismissSecRange's random pick is deterministic (0 -> exact min edge,
//     1 -> exact max edge).
function createTaskEnv(opts) {
  opts = opts || {};
  var warnCalls = [];
  var errorCalls = [];

  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = {
    log: function () {},
    warn: function () {
      warnCalls.push(Array.prototype.slice.call(arguments).join(' '));
    },
    error: function () {
      errorCalls.push(Array.prototype.slice.call(arguments).join(' '));
    }
  };

  vm.createContext(sandbox);

  // Real manifest.js, so timing thresholds (15 / 30 / [45,60] / 20) exercised
  // by this test are the actual product values, not hand-retyped constants.
  vm.runInContext(manifestSrc, sandbox, { filename: 'manifest.js' });

  if (typeof opts.randomValue === 'number') {
    // sandbox.Math is a V8 context intrinsic, not reliably visible as an own
    // property from the Node side until code has run inside the context; go
    // through runInContext so the assignment happens in-realm.
    vm.runInContext('Math.random = function () { return ' + JSON.stringify(opts.randomValue) + '; };', sandbox, { filename: 'fake-random.js' });
  }

  var stubs = makeStubs();
  if (opts.includeHud !== false) sandbox.window.WTJ_HUD = stubs.WTJ_HUD;
  if (opts.includeAudio !== false) sandbox.window.WTJ_AUDIO = stubs.WTJ_AUDIO;
  if (opts.includeKeyboard !== false) sandbox.window.WTJ_KEYBOARD = stubs.WTJ_KEYBOARD;

  vm.runInContext(taskSrc, sandbox, { filename: 'task.js' });

  var clock = makeFakeClock();
  sandbox.window.WTJ_TASK._setClock({ setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, now: clock.now });

  return {
    sandbox: sandbox,
    WTJ_TASK: sandbox.window.WTJ_TASK,
    clock: clock,
    stubs: stubs,
    warnCalls: warnCalls,
    errorCalls: errorCalls
  };
}

function section(name) {
  console.log('\n=== ' + name + ' ===');
}

function makeTaskDef(extra) {
  var base = { id: 'find-the-dog', type: 'find', voicePrompt: 'audio/tasks/find-the-dog.m4a' };
  if (extra) {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) base[k] = extra[k];
    }
  }
  return base;
}

function run() {
  section('0. static source check: no document.* usage anywhere (REQ-TASK-02 structural proof: task.js never touches the DOM)');
  (function () {
    var codeOnly = taskSrc.replace(/\/\/[^\n]*/g, ''); // strip // comments (Chinese dev-facing console.warn/error text lives only in comments/strings there, same convention as keyboard.js/hud.js/audio.js)
    assert.strictEqual(/\bdocument\s*[.[]/.test(codeOnly), false, 'task.js code must never reference document.* or document[...]');
    assert.strictEqual(/\.(innerHTML|textContent|innerText)\s*=/.test(codeOnly), false, 'task.js code must never assign innerHTML/textContent/innerText (no DOM text nodes of any kind, let alone Chinese task text)');
    assert.strictEqual(/createTextNode|createElement|insertAdjacentHTML|appendChild/.test(codeOnly), false, 'task.js code must never call DOM-node-creation APIs');
    console.log('PASS: task.js source contains zero document/DOM APIs — REQ-TASK-02 (no Chinese task text, no DOM at all) holds structurally, not just behaviorally.');
  })();

  section('0b. behavioral confirmation: full lifecycle runs with sandbox.document left undefined (any DOM touch would throw ReferenceError)');
  (function () {
    var env = createTaskEnv();
    assert.strictEqual(typeof env.sandbox.document, 'undefined', 'sandbox intentionally has no document global');
    env.WTJ_TASK.startTask(makeTaskDef());
    env.clock.advance(60000); // drive hint + emphasize + auto-dismiss to completion
    assert.strictEqual(env.WTJ_TASK.getState().state, 'IDLE', 'full lifecycle completed without ever needing document');
    console.log('PASS: full startTask -> hint -> emphasize -> auto-dismiss lifecycle ran to completion with no document global present at all.');
  })();

  section('1. API surface + frozen + non-writable binding (mirrors audio.js hardening)');
  (function () {
    var env = createTaskEnv();
    var WTJ_TASK = env.WTJ_TASK;
    assert.ok(WTJ_TASK, 'WTJ_TASK should exist on window');
    assert.strictEqual(Object.isFrozen(WTJ_TASK), true, 'WTJ_TASK must be frozen');
    var expectedMethods = ['startTask', 'completeTask', 'dismiss', 'getState', 'onPhase', 'onDismiss', 'onComplete', 'onQuestionClicked', '_setClock'];
    expectedMethods.forEach(function (m) {
      assert.strictEqual(typeof WTJ_TASK[m], 'function', 'WTJ_TASK.' + m + ' should be a function');
    });
    var before = WTJ_TASK.startTask;
    try { WTJ_TASK.startTask = null; } catch (e) { /* strict mode throw is fine */ }
    assert.strictEqual(WTJ_TASK.startTask, before, 'frozen API must reject method reassignment');
    try { WTJ_TASK.hacked = true; } catch (e) { /* ignore */ }
    assert.strictEqual(WTJ_TASK.hacked, undefined, 'frozen API must reject new properties');

    var desc = Object.getOwnPropertyDescriptor(env.sandbox.window, 'WTJ_TASK');
    assert.ok(desc, 'WTJ_TASK property descriptor should exist on window');
    assert.strictEqual(desc.writable, false, 'window.WTJ_TASK must be non-writable');
    assert.strictEqual(desc.configurable, false, 'window.WTJ_TASK must be non-configurable');
    console.log('PASS: WTJ_TASK is frozen, exposes all ' + expectedMethods.length + ' methods, and its window binding is non-writable/non-configurable.');
  })();

  section('2. startTask() -> ACTIVE, calls playTaskVoice(taskDef.voicePrompt), getState() reflects it');
  (function () {
    var env = createTaskEnv();
    var WTJ_TASK = env.WTJ_TASK;
    var taskDef = makeTaskDef();

    assert.strictEqual(WTJ_TASK.getState().state, 'IDLE', 'initial state must be IDLE');
    var started = WTJ_TASK.startTask(taskDef);
    assert.strictEqual(started, true, 'startTask() should return true on success');

    var st = WTJ_TASK.getState();
    assert.strictEqual(st.state, 'ACTIVE');
    assert.strictEqual(st.activeTaskType, 'find');
    assert.strictEqual(st.effectiveKeysSinceStart, 0);
    assert.strictEqual(typeof st.elapsedMs, 'number');

    assert.strictEqual(env.stubs.playTaskVoiceCalls.length, 1, 'playTaskVoice should be called exactly once on startTask');
    assert.strictEqual(env.stubs.playTaskVoiceCalls[0], 'audio/tasks/find-the-dog.m4a', 'playTaskVoice should be called with taskDef.voicePrompt');
    console.log('PASS: startTask() -> ACTIVE, playTaskVoice called with voicePrompt, getState() reflects type.');
  })();

  section('3. 15s -> phase "hint" fires exactly once, not before');
  (function () {
    var env = createTaskEnv();
    var WTJ_TASK = env.WTJ_TASK;
    var phases = [];
    WTJ_TASK.onPhase(function (p) { phases.push(p.phase); });
    WTJ_TASK.startTask(makeTaskDef());

    env.clock.advance(14999);
    assert.deepStrictEqual(phases, [], 'hint must not fire before 15s');

    env.clock.advance(1); // now at exactly 15000ms
    assert.deepStrictEqual(phases, ['hint'], 'hint must fire at exactly 15s');
    console.log('PASS: phase "hint" fires at t=15000ms, not a moment before.');
  })();

  section('4. 30s -> phase "emphasize" fires (after hint already fired)');
  (function () {
    var env = createTaskEnv();
    var WTJ_TASK = env.WTJ_TASK;
    var phases = [];
    WTJ_TASK.onPhase(function (p) { phases.push(p.phase); });
    WTJ_TASK.startTask(makeTaskDef());

    env.clock.advance(29999);
    assert.deepStrictEqual(phases, ['hint'], 'only hint should have fired just before 30s');
    env.clock.advance(1); // now at exactly 30000ms
    assert.deepStrictEqual(phases, ['hint', 'emphasize'], 'emphasize must fire at exactly 30s, after hint');
    console.log('PASS: phase sequence ["hint","emphasize"] fires at t=15000ms/30000ms.');
  })();

  section('5. [45,60)s auto-dismiss window: min edge (randomValue=0 -> exactly 45s) and formula upper-bound (randomValue=1 -> 60s, unreachable by real Math.random)');
  // NOTE (P2, Fable review): task.js uses minSec + Math.random()*(maxSec-minSec).
  // Math.random() is in [0, 1), so the REAL auto-dismiss instant lands in the
  // half-open interval [45s, 60s) — exactly 60000ms is never produced in
  // production (probability 0). The two sub-cases below inject randomValue via an
  // in-realm Math.random override to pin the FORMULA's two endpoints: 0 -> the
  // reachable min (45000ms), and 1 -> the formula's upper bound (60000ms), which
  // is a boundary-injection check of the mapping itself, not a claim that real
  // Math.random() can hit it.
  (function () {
    var envMin = createTaskEnv({ randomValue: 0 });
    var dismissedMin = [];
    envMin.WTJ_TASK.onDismiss(function (d) { dismissedMin.push(d); });
    envMin.WTJ_TASK.startTask(makeTaskDef());
    envMin.clock.advance(44999);
    assert.deepStrictEqual(dismissedMin, [], 'must not auto-dismiss before 45s even at the min edge of the random range');
    envMin.clock.advance(1); // t=45000ms
    assert.strictEqual(dismissedMin.length, 1);
    // dismissedMin[0] is a plain object constructed inside the vm sandbox realm, so it
    // does not share a prototype with an object literal written in this file (different
    // realm -> assert.deepStrictEqual's prototype check would fail on a structurally
    // identical object); compare fields/keys individually instead.
    assert.strictEqual(dismissedMin[0].reason, 'timeout');
    assert.deepStrictEqual(Object.keys(dismissedMin[0]), ['reason']);
    assert.strictEqual(envMin.WTJ_TASK.getState().state, 'IDLE');
    console.log('PASS: min-edge (randomValue=0) auto-dismisses at exactly t=45000ms with reason "timeout".');

    // randomValue=1 injects the formula's upper bound; real Math.random() in [0,1)
    // never reaches this, so 60000ms is the exclusive edge of the actual [45s,60s)
    // window, not a production-reachable dismiss instant.
    var envMax = createTaskEnv({ randomValue: 1 });
    var dismissedMax = [];
    envMax.WTJ_TASK.onDismiss(function (d) { dismissedMax.push(d); });
    envMax.WTJ_TASK.startTask(makeTaskDef());
    envMax.clock.advance(59999);
    assert.deepStrictEqual(dismissedMax, [], 'must not auto-dismiss before the 60s formula upper bound');
    envMax.clock.advance(1); // t=60000ms (formula upper bound with randomValue=1)
    assert.strictEqual(dismissedMax.length, 1);
    assert.strictEqual(dismissedMax[0].reason, 'timeout');
    assert.deepStrictEqual(Object.keys(dismissedMax[0]), ['reason']);
    console.log('PASS: formula upper-bound (randomValue=1) maps to t=60000ms with reason "timeout" (exclusive edge of the real [45s,60s) window).');
  })();

  section('6/6b. keyboard distraction: 19 effective keys do NOT trigger, the 20th does (precise boundary)');
  (function () {
    var env = createTaskEnv();
    var WTJ_TASK = env.WTJ_TASK;
    var dismissed = [];
    WTJ_TASK.onDismiss(function (d) { dismissed.push(d); });
    WTJ_TASK.startTask(makeTaskDef());

    for (var i = 0; i < 19; i++) {
      env.stubs.pressEffectiveKey();
    }
    assert.deepStrictEqual(dismissed, [], '19 effective keys must not trigger dismiss');
    assert.strictEqual(WTJ_TASK.getState().state, 'ACTIVE', 'still ACTIVE after 19 keys');
    assert.strictEqual(WTJ_TASK.getState().effectiveKeysSinceStart, 19);

    env.stubs.pressEffectiveKey(); // 20th
    assert.strictEqual(dismissed.length, 1, 'the 20th effective key must trigger exactly one dismiss');
    // cross-realm object (constructed inside the vm sandbox) — compare fields, not via
    // deepStrictEqual against a same-realm literal (see note in section 5).
    assert.strictEqual(dismissed[0].reason, 'keyboard-distraction');
    assert.deepStrictEqual(Object.keys(dismissed[0]), ['reason']);
    assert.strictEqual(WTJ_TASK.getState().state, 'IDLE');
    assert.strictEqual(WTJ_TASK.getState().effectiveKeysSinceStart, 0, 'counter resets once back to IDLE');
    console.log('PASS: exactly 19 keys -> no dismiss; 20th key -> dismiss(reason="keyboard-distraction").');
  })();

  section('7. dismiss carries no failure semantics (REQ-EXIT-04): payload keys, getState() keys');
  (function () {
    var env = createTaskEnv();
    var WTJ_TASK = env.WTJ_TASK;
    var payloads = [];
    WTJ_TASK.onDismiss(function (d) { payloads.push(d); });
    WTJ_TASK.startTask(makeTaskDef());
    WTJ_TASK.dismiss('timeout');

    assert.deepStrictEqual(Object.keys(payloads[0]).sort(), ['reason'], 'dismiss payload must only ever contain "reason"');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(payloads[0], 'failure'), false);

    var st = WTJ_TASK.getState();
    assert.deepStrictEqual(Object.keys(st).sort(), ['activeTaskType', 'effectiveKeysSinceStart', 'elapsedMs', 'state'].sort());
    assert.strictEqual(Object.prototype.hasOwnProperty.call(st, 'failure'), false, 'getState() must never expose a failure field');
    console.log('PASS: dismiss() payload = {reason} only; getState() never carries a failure field.');
  })();

  section('8. completeTask(result) -> complete event (result passthrough), back to IDLE');
  (function () {
    var env = createTaskEnv();
    var WTJ_TASK = env.WTJ_TASK;
    var completed = [];
    WTJ_TASK.onComplete(function (r) { completed.push(r); });
    WTJ_TASK.startTask(makeTaskDef());

    var ok = WTJ_TASK.completeTask({ success: true, taskId: 'find-the-dog' });
    assert.strictEqual(ok, true);
    assert.strictEqual(completed.length, 1);
    assert.deepStrictEqual(completed[0], { success: true, taskId: 'find-the-dog' }, 'completeTask result must be passed through as-is');
    assert.strictEqual(WTJ_TASK.getState().state, 'IDLE');

    var againOk = WTJ_TASK.completeTask({ success: true });
    assert.strictEqual(againOk, false, 'completeTask() while IDLE must be a no-op');
    assert.strictEqual(completed.length, 1, 'no extra complete event when called while IDLE');
    console.log('PASS: completeTask() emits complete(result) and returns to IDLE; no-op (returns false) when already IDLE.');
  })();

  section('9. dismiss()/completeTask() clear all timers: no further hint/emphasize/auto-dismiss fire afterward');
  (function () {
    var envDismiss = createTaskEnv();
    var phasesD = [];
    var dismissesD = [];
    envDismiss.WTJ_TASK.onPhase(function (p) { phasesD.push(p.phase); });
    envDismiss.WTJ_TASK.onDismiss(function (d) { dismissesD.push(d); });
    envDismiss.WTJ_TASK.startTask(makeTaskDef());
    envDismiss.clock.advance(5000); // well before hint(15s)
    envDismiss.WTJ_TASK.dismiss('manual');
    assert.strictEqual(dismissesD.length, 1, 'the manual dismiss itself should fire once');
    // symmetric with the completeTask branch below: dismiss() must clear ALL three
    // timers, leaving nothing pending on the clock (P2, Fable review).
    assert.strictEqual(envDismiss.clock.pendingCount(), 0, 'no pending timers should remain immediately after dismiss()');
    envDismiss.clock.advance(120000); // fast-forward past hint/emphasize/auto-dismiss windows
    assert.deepStrictEqual(phasesD, [], 'no hint/emphasize should fire after an early dismiss cleared the timers');
    assert.strictEqual(dismissesD.length, 1, 'no further (e.g. timeout) dismiss should fire after timers were cleared');
    console.log('PASS: after dismiss(), pendingCount()===0 and previously scheduled hint/emphasize/auto-dismiss timers never fire.');

    var envComplete = createTaskEnv();
    var phasesC = [];
    envComplete.WTJ_TASK.onPhase(function (p) { phasesC.push(p.phase); });
    envComplete.WTJ_TASK.startTask(makeTaskDef());
    envComplete.clock.advance(5000);
    envComplete.WTJ_TASK.completeTask({ success: true });
    envComplete.clock.advance(120000);
    assert.deepStrictEqual(phasesC, [], 'no hint/emphasize should fire after an early completeTask cleared the timers');
    assert.strictEqual(envComplete.clock.pendingCount(), 0, 'no pending timers should remain after completeTask');
    console.log('PASS: after completeTask(), previously scheduled hint/emphasize/auto-dismiss timers never fire.');
  })();

  section('10. multi-subscriber try/catch isolation: a throwing subscriber must not block the next one');
  (function () {
    var env = createTaskEnv();
    var WTJ_TASK = env.WTJ_TASK;
    var secondPhaseCalls = [];
    var secondDismissCalls = [];

    WTJ_TASK.onPhase(function () { throw new Error('boom-phase-subscriber-1'); });
    WTJ_TASK.onPhase(function (p) { secondPhaseCalls.push(p.phase); });
    WTJ_TASK.onDismiss(function () { throw new Error('boom-dismiss-subscriber-1'); });
    WTJ_TASK.onDismiss(function (d) { secondDismissCalls.push(d.reason); });

    WTJ_TASK.startTask(makeTaskDef());
    env.clock.advance(15000); // fires hint -> exercises both onPhase subscribers
    assert.deepStrictEqual(secondPhaseCalls, ['hint'], 'second onPhase subscriber must still run despite the first throwing');

    WTJ_TASK.dismiss('manual');
    assert.deepStrictEqual(secondDismissCalls, ['manual'], 'second onDismiss subscriber must still run despite the first throwing');
    assert.ok(env.errorCalls.length >= 2, 'thrown subscriber errors should be captured via console.error, not propagate');
    console.log('PASS: throwing subscribers are isolated via try/catch; later subscribers still run; errors logged via console.error (' + env.errorCalls.length + ' captured).');
  })();

  section('11. HUD/AUDIO/KEYBOARD all absent at load time: startTask() still works, fully silent, no throw');
  (function () {
    var env = createTaskEnv({ includeHud: false, includeAudio: false, includeKeyboard: false });
    var WTJ_TASK = env.WTJ_TASK;
    var threw = false;
    var started;
    try {
      started = WTJ_TASK.startTask(makeTaskDef());
    } catch (err) {
      threw = true;
    }
    assert.strictEqual(threw, false, 'startTask() must not throw even when WTJ_HUD/WTJ_AUDIO/WTJ_KEYBOARD are all missing');
    assert.strictEqual(started, true, 'startTask() should still succeed and enter ACTIVE');
    assert.strictEqual(WTJ_TASK.getState().state, 'ACTIVE');

    // full lifecycle should still run to completion with everything absent.
    env.clock.advance(15000);
    env.clock.advance(15000); // 30s total -> emphasize
    var dismissed = false;
    WTJ_TASK.onDismiss(function () { dismissed = true; });
    env.clock.advance(30000); // 60s total -> auto-dismiss guaranteed regardless of random draw
    assert.strictEqual(dismissed, true, 'auto-dismiss must still fire on schedule with all externals absent');
    console.log('PASS: with WTJ_HUD/WTJ_AUDIO/WTJ_KEYBOARD all missing, startTask() and the full lifecycle run silently without throwing.');
  })();

  section('12. onQuestionClicked wiring: fires when IDLE, ignored (not emitted) while ACTIVE, startTask() itself also guards');
  (function () {
    var env = createTaskEnv();
    var WTJ_TASK = env.WTJ_TASK;
    assert.strictEqual(env.stubs.hasQuestionHandler(), true, 'task.js should have registered a handler via WTJ_HUD.onQuestionClick at load time');

    var clicks = 0;
    WTJ_TASK.onQuestionClicked(function () { clicks += 1; });

    env.stubs.clickQuestion(); // IDLE -> should emit
    assert.strictEqual(clicks, 1, 'clicking the question mark while IDLE must emit questionClicked');

    WTJ_TASK.startTask(makeTaskDef());
    env.stubs.clickQuestion(); // ACTIVE -> should be ignored
    assert.strictEqual(clicks, 1, 'clicking the question mark while ACTIVE must be ignored (no second questionClicked emit)');

    // direct startTask() call while ACTIVE must also be a guarded no-op (belt-and-suspenders).
    var secondStart = WTJ_TASK.startTask(makeTaskDef({ id: 'other-task' }));
    assert.strictEqual(secondStart, false, 'startTask() while ACTIVE must return false and not replace the running task');
    assert.strictEqual(WTJ_TASK.getState().activeTaskType, 'find', 'the original task must remain active, unreplaced');
    console.log('PASS: onQuestionClicked fires once while IDLE, is suppressed while ACTIVE; startTask() independently guards re-entry.');
  })();

  section('13. consecutive-task isolation: task A dismissed at t=10s leaves NO residual timer; task B\'s hint fires at B-start+15s (t=25s), never at A\'s original t=15s');
  (function () {
    var env = createTaskEnv();
    var WTJ_TASK = env.WTJ_TASK;
    // capture the virtual instant of each phase event so we can tell A's would-be
    // hint (t=15000) apart from B's real hint (t=25000): the fake clock's now()
    // equals the firing timer's fireAt while the subscriber runs synchronously.
    var phaseEvents = [];
    WTJ_TASK.onPhase(function (p) { phaseEvents.push({ phase: p.phase, at: env.clock.now() }); });

    WTJ_TASK.startTask(makeTaskDef({ id: 'task-A', type: 'find' })); // t=0; A hint would be t=15000
    env.clock.advance(10000); // t=10000, before A's 15s hint
    WTJ_TASK.dismiss('manual'); // cancels all of A's timers
    assert.strictEqual(env.clock.pendingCount(), 0, 'after dismissing A, no A timer may remain pending');
    assert.strictEqual(WTJ_TASK.getState().state, 'IDLE');

    WTJ_TASK.startTask(makeTaskDef({ id: 'task-B', type: 'press' })); // t=10000; B hint scheduled at t=25000
    assert.strictEqual(env.clock.pendingCount(), 3, 'task B should schedule exactly its own 3 timers');
    env.clock.advance(14999); // reach t=24999 -> PAST A's original 15000 mark
    assert.deepStrictEqual(phaseEvents, [], 'no phase may fire before t=25000: proves A left no residual hint timer at t=15000');
    env.clock.advance(1); // t=25000 -> B's hint
    assert.strictEqual(phaseEvents.length, 1);
    assert.strictEqual(phaseEvents[0].phase, 'hint');
    assert.strictEqual(phaseEvents[0].at, 25000, 'B\'s hint must fire at B-start(10000)+15000 = 25000, not at A\'s stale 15000');
    console.log('PASS: A\'s timers fully cleared on dismiss; B\'s hint fires at t=25000 (B-start+15s), zero cross-task timer leakage.');
  })();

  section('14. IDLE-period effective keys are no-ops: not counted, never dismiss, and never eat into the next task\'s fresh 20-key budget');
  (function () {
    var env = createTaskEnv();
    var WTJ_TASK = env.WTJ_TASK;
    var dismissed = [];
    WTJ_TASK.onDismiss(function (d) { dismissed.push(d.reason); });

    // (a) 30 effective keys while IDLE (before any task) must be completely ignored.
    var i;
    for (i = 0; i < 30; i++) { env.stubs.pressEffectiveKey(); }
    assert.strictEqual(WTJ_TASK.getState().state, 'IDLE', 'still IDLE after 30 keys pressed with no task active');
    assert.strictEqual(WTJ_TASK.getState().effectiveKeysSinceStart, 0, 'IDLE keys must not accumulate');
    assert.deepStrictEqual(dismissed, [], 'IDLE keys must never trigger a dismiss');

    // (b) first task still needs a FULL 20 keys of its own (IDLE presses did not pre-charge it).
    WTJ_TASK.startTask(makeTaskDef({ id: 'task-1' }));
    for (i = 0; i < 19; i++) { env.stubs.pressEffectiveKey(); }
    assert.strictEqual(WTJ_TASK.getState().state, 'ACTIVE', 'task 1 must still be ACTIVE at 19 keys despite prior IDLE presses');
    env.stubs.pressEffectiveKey(); // 20th
    assert.deepStrictEqual(dismissed, ['keyboard-distraction'], 'task 1 dismissed only on its own 20th key');
    assert.strictEqual(WTJ_TASK.getState().state, 'IDLE');

    // (c) between-task IDLE keys are again ignored, and the NEXT task gets a fresh full 20 budget.
    for (i = 0; i < 15; i++) { env.stubs.pressEffectiveKey(); }
    assert.strictEqual(WTJ_TASK.getState().effectiveKeysSinceStart, 0, 'between-task IDLE keys must not accumulate');
    assert.strictEqual(dismissed.length, 1, 'no extra dismiss from between-task IDLE keys');

    WTJ_TASK.startTask(makeTaskDef({ id: 'task-2' }));
    for (i = 0; i < 19; i++) { env.stubs.pressEffectiveKey(); }
    assert.strictEqual(WTJ_TASK.getState().state, 'ACTIVE', 'task 2 must have its own fresh 20-key budget (still ACTIVE at 19)');
    env.stubs.pressEffectiveKey(); // 20th of task 2
    assert.deepStrictEqual(dismissed, ['keyboard-distraction', 'keyboard-distraction'], 'task 2 dismissed on its own 20th key');
    console.log('PASS: IDLE-period effective keys are inert; each task independently requires a full 20 keys to fade out.');
  })();

  section('15. P1-1 duplicate-include guard: re-running task.js source in the same realm does NOT hijack the question-mark wiring away from instance 1');
  (function () {
    // Simulate <script src="task.js"> being included twice. task.js begins with
    // `if (window.WTJ_TASK) { return; }`. Without that guard, the second run would
    // re-call WTJ_HUD.onQuestionClick (overwrite-style, per hud.js) and route clicks
    // to a NEW instance's subscriber array, while window.WTJ_TASK (non-writable) still
    // points at instance 1 — so 014's onQuestionClicked subscription would silently
    // never fire. This test fails loudly if that guard is ever removed.
    var env = createTaskEnv();
    var instance1 = env.sandbox.window.WTJ_TASK;
    var clicks = 0;
    instance1.onQuestionClicked(function () { clicks += 1; });

    // second include: re-execute the real task.js source in the same context.
    vm.runInContext(taskSrc, env.sandbox, { filename: 'task.js (duplicate include)' });

    assert.strictEqual(env.sandbox.window.WTJ_TASK, instance1, 'window.WTJ_TASK must still be the FIRST instance after a duplicate include');
    // the question-mark handler registered on the HUD stub must still drive instance 1.
    env.stubs.clickQuestion(); // IDLE
    assert.strictEqual(clicks, 1, 'a question-mark click after duplicate include must still reach instance 1\'s onQuestionClicked subscriber');
    // and instance 1 must still be a working state machine end-to-end.
    var started = instance1.startTask(makeTaskDef());
    assert.strictEqual(started, true, 'instance 1 must still drive the lifecycle after a duplicate include');
    assert.strictEqual(instance1.getState().state, 'ACTIVE');
    console.log('PASS: duplicate include is a genuine no-op — window.WTJ_TASK stays instance 1 and its question-mark wiring is not hijacked.');
  })();

  console.log('\n=== ALL ASSERTIONS PASSED ===');
}

try {
  run();
  process.exit(0);
} catch (err) {
  console.error('\n=== TEST FAILURE ===');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
