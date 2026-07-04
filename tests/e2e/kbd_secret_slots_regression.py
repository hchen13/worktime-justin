#!/usr/bin/env python3
"""KBD/SECRET/SLOTS scripted regression (WTJ-20260704-020).

Drives the three shipped web-layer engines — keyboard.js (window.WTJ_KEYBOARD),
secretword.js (window.WTJ_SECRET), slots.js (window.WTJ_SLOTS) — in headless
Chromium and asserts their frozen-API behaviour against docs REQ-KB-*/SEC-*/
SLOT-* and card 020's acceptance criteria.

Why headless-browser and not pure unit: all three modules attach to `window`,
listen on `window keydown`, and wire to each other through `window.WTJ_*`
globals in a fixed load order (slots → keyboard → secret). The only faithful
way to exercise "a real keydown flows keyboard → secret → slots" is a real DOM
+ dispatched KeyboardEvent (with a settable `.repeat`). This is deterministic
and safe (headless; no synthetic OS input, no shared-machine focus risk).

Robustness: tests inject a CONTROLLED manifest pool (dog/apple/car/scar/hot/
star) so they do NOT depend on which production words ship — the real pool is
being expanded 8→100 (Pack B) and a regression of the *engine* must not break
when the *word list* grows. One extra case loads the REAL manifest.js and
asserts a known-real word ('dog') still wires end-to-end, catching wiring/load
-order breakage in the shipped config.

Run:  python3 tests/e2e/kbd_secret_slots_regression.py [--app-web DIR]
Exit: 0 all pass · 1 a case failed · 2 infra error.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_APP_WEB = REPO_ROOT / "app" / "web"
DEFAULT_REPORT = REPO_ROOT / "tests" / "reports" / "kbd_secret_slots_report.json"

# Controlled test pool: robust to production pool expansion. Chosen to exercise
# every match rule: dog (basic/case/substring/overlap), apple (double letter),
# car+scar (longest-match priority), hot+dog (compound independent triggers).
TEST_MANIFEST = {
    "keyboard": {
        "repeatSameKey": {"pauseAfterCount": 3},
        # Real production thresholds. Deliberately NOT tiny: small thresholds get
        # crossed by incidental word-typing and pollute the secret/slot cases with
        # spurious keyboard-milestone slots. Milestone cases type exactly to 100.
        "effectiveKeyMilestones": [100, 200],
        "functionKeys": {
            "lightFeedback": ["Space", "Enter"],
            "weakOrNoReward": ["Meta", "Alt", "Control", "Shift"],
        },
    },
    "secretWords": {
        "matchRules": {
            "caseInsensitive": True,
            "substringMatch": True,
            "overlapTrigger": True,
            "doubleLetterNoPenalty": True,
            "sameWordRepeatMinorFeedbackOnly": True,
            "longestMatchPriority": True,
            "sequentialCompoundIndependentTriggers": True,
        },
        "pool": [
            {"word": "dog", "spriteFile": "sprites/dog.png", "audioFile": "dog.mp3"},
            {"word": "apple", "spriteFile": "sprites/apple.png", "audioFile": "apple.mp3"},
            {"word": "car", "spriteFile": "sprites/car.png", "audioFile": "car.mp3"},
            {"word": "scar", "spriteFile": "sprites/scar.png", "audioFile": "scar.mp3"},
            {"word": "hot", "spriteFile": "sprites/hot.png", "audioFile": "hot.mp3"},
            {"word": "star", "spriteFile": "sprites/star.png", "audioFile": "star.mp3"},
        ],
    },
    "slots": {"count": 5, "sources": ["secret-word", "keyboard-milestone"]},
}

# JS installed once per page: spies on every engine event + a key-dispatch helper.
HARNESS_JS = r"""
(function () {
  window.__spy = { letters: [], effective: [], milestones: [], funcKeys: [],
                   hits: [], minorHits: [], fulls: [], audio: [], hitsFull: [] };
  if (window.WTJ_KEYBOARD) {
    window.WTJ_KEYBOARD.onLetter(function (c) { window.__spy.letters.push(c); });
    window.WTJ_KEYBOARD.onEffectiveKey(function (n) { window.__spy.effective.push(n); });
    window.WTJ_KEYBOARD.onMilestone(function (m) { window.__spy.milestones.push(m); });
    window.WTJ_KEYBOARD.onFunctionKey(function (o) { window.__spy.funcKeys.push(o); });
  }
  if (window.WTJ_SECRET) {
    window.WTJ_SECRET.onHit(function (p) { window.__spy.hits.push(p.word); window.__spy.hitsFull.push(p); });
    window.WTJ_SECRET.onMinorHit(function (p) { window.__spy.minorHits.push(p.word); });
  }
  if (window.WTJ_SLOTS) {
    window.WTJ_SLOTS.onFull(function (s) { window.__spy.fulls.push(s); });
  }
  // Dispatch a keydown with full control over key + repeat.
  window.__key = function (key, repeat) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: key, repeat: !!repeat, bubbles: true }));
  };
  // Type a string as a sequence of non-repeat alnum keydowns.
  window.__type = function (s) {
    for (var i = 0; i < s.length; i++) { window.__key(s[i], false); }
  };
  // Type n effective keys by rotating digits 1..5 (never two consecutive same,
  // so the same-key-streak rule never pauses; digits never form a letter pool
  // word, so no spurious secret hits). Used to reach the 100-key milestone.
  window.__typeN = function (n) {
    var digs = '12345';
    for (var i = 0; i < n; i++) { window.__key(digs[i % 5], false); }
  };
  window.__resetSpy = function () {
    window.__spy = { letters: [], effective: [], milestones: [], funcKeys: [],
                     hits: [], minorHits: [], fulls: [], audio: [], hitsFull: [] };
  };
  // REAL product round reset: exactly the 011 contract (WTJ_SLOTS.reset()),
  // WITHOUT the '0' filler. Used by characterization cases that must observe the
  // engines' true cross-round behaviour (buffer / streak NOT cleared by reset).
  window.__realReset = function () { window.WTJ_SLOTS.reset(); window.__resetSpy(); };
  // Isolate the same-key-streak state between cases. resetEffectiveKeyCount()
  // deliberately does NOT clear lastKeyId/sameKeyStreak (they are round-agnostic
  // by design), so a leftover streak from the previous case would bleed in.
  // Dispatch a fixed filler '0' (sets lastKeyId='0', streak=1), then re-zero the
  // count. '0' also enters the secret rolling buffer as a separator, preventing
  // the previous case's buffer tail from combining with the next case's head.
  // No streak/secret test uses '0' as a real key, so this is inert to assertions.
  window.__normalizeStreak = function () {
    window.__key('0', false);
    window.WTJ_KEYBOARD.resetEffectiveKeyCount();
  };
})();
"""


def build_page(pw, app_web: Path, manifest: dict):
    """Fresh page with manifest injected BEFORE the three engines load."""
    browser = pw.chromium.launch()
    ctx = browser.new_context(offline=True)
    page = ctx.new_page()
    console_errors: list[str] = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))
    page.set_content("<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>")
    page.evaluate("(m) => { window.WTJ_MANIFEST = m; }", manifest)
    # Stub WTJ_AUDIO so we can observe that a hit really drives playWord(entry)
    # (REQ-SEC-03/AST-04 sound feedback). playWordDefensive reads window.WTJ_AUDIO
    # at hit time, so installing it now is sufficient.
    page.evaluate("""() => {
      window.WTJ_AUDIO = { playWord: function (entry) {
        (window.__spy && window.__spy.audio || []).push(entry && entry.audioFile);
        return Promise.resolve();
      } };
    }""")
    # Load order matters: slots → keyboard → secret (per slots.js header).
    for name in ("slots.js", "keyboard.js", "secretword.js"):
        src = (app_web / name).read_text(encoding="utf-8")
        page.add_script_tag(content=src)
    page.add_script_tag(content=HARNESS_JS)
    return browser, ctx, page, console_errors


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--app-web", default=str(DEFAULT_APP_WEB))
    ap.add_argument("--report", default=str(DEFAULT_REPORT))
    args = ap.parse_args()

    app_web = Path(args.app_web).resolve()
    report_path = Path(args.report).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)

    def infra(msg: str) -> int:
        report_path.write_text(json.dumps({"error": msg, "cases": {}}, ensure_ascii=False, indent=2),
                               encoding="utf-8")
        print(f"INFRA-ERROR {msg}")
        return 2

    for f in ("slots.js", "keyboard.js", "secretword.js"):
        if not (app_web / f).is_file():
            return infra(f"缺少被测模块: {app_web / f}")
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        return infra(f"playwright 不可用: {e}")

    cases: dict[str, dict] = {}

    def check(cid: str, ok: bool, detail: str) -> None:
        cases[cid] = {"pass": bool(ok), "detail": detail}
        print(f"{'PASS' if ok else 'FAIL'} {cid}  {detail}")

    with sync_playwright() as pw:
        browser, ctx, page, console_errors = build_page(pw, app_web, TEST_MANIFEST)

        def reset():
            # reset() clears slots + 008 count + 009 round; __normalizeStreak()
            # isolates the same-key rhythm + separates the secret buffer; then
            # clear spies (after the filler so its events are not observed).
            page.evaluate("() => { window.WTJ_SLOTS.reset(); window.__normalizeStreak(); window.__resetSpy(); }")

        def spy():
            return page.evaluate("() => window.__spy")

        # ---- KEYBOARD ----
        # KBD-01 normal letter: one onLetter (uppercased), effectiveKeyCount++.
        reset()
        page.evaluate("() => window.__key('a', false)")
        s = spy()
        check("KBD-01-normal-letter",
              s["letters"] == ["A"] and s["effective"] == [1],
              f"letters={s['letters']} effective={s['effective']}")

        # KBD-02 key-hold (e.repeat) does not count or spawn (REQ-KB-07).
        reset()
        page.evaluate("() => { window.__key('b', false); for (var i=0;i<10;i++) window.__key('b', true); }")
        s = spy()
        cnt = page.evaluate("() => window.WTJ_KEYBOARD.getEffectiveKeyCount()")
        check("KBD-02-keyhold-no-count",
              s["letters"] == ["B"] and cnt == 1,
              f"letters={s['letters']} count={cnt} (10 repeat events must be ignored)")

        # KBD-03 repeat-same-key threshold: >3 consecutive same key pauses (REQ-KB-08).
        reset()
        page.evaluate("() => { for (var i=0;i<6;i++) window.__key('c', false); }")
        cnt = page.evaluate("() => window.WTJ_KEYBOARD.getEffectiveKeyCount()")
        check("KBD-03-repeat-threshold",
              cnt == 3,
              f"6x consecutive 'c' -> counted={cnt} (expect 3: 1st/2nd/3rd count, 4th+ paused)")

        # KBD-04 switching keys resets streak (REQ-KB-08 '换键后重新计数').
        reset()
        # c c c c (4th paused) then d resets, d d d d (4th paused) -> 3 + 3 = 6
        page.evaluate("() => { for (var i=0;i<4;i++) window.__key('c', false); for (var j=0;j<4;j++) window.__key('d', false); }")
        cnt = page.evaluate("() => window.WTJ_KEYBOARD.getEffectiveKeyCount()")
        check("KBD-04-switch-resets-streak",
              cnt == 6,
              f"cccc dddd -> counted={cnt} (expect 6: 3 per key, switch resets streak)")

        # KBD-05 function keys never count; decay with mashing (REQ-KB-05/06).
        reset()
        page.evaluate("() => { window.__key(' ', false); window.__key(' ', false); window.__key(' ', false); }")
        s = spy()
        cnt = page.evaluate("() => window.WTJ_KEYBOARD.getEffectiveKeyCount()")
        fk = s["funcKeys"]
        decays = [round(x["intensity"], 4) for x in fk]
        monotone = all(decays[i] >= decays[i + 1] for i in range(len(decays) - 1)) and decays[0] > decays[-1]
        check("KBD-05-funckey-no-count-decay",
              cnt == 0 and len(fk) == 3 and all(x["category"] == "light" for x in fk) and monotone,
              f"count={cnt} funcKeys={len(fk)} intensities={decays} (must not count; must decay)")

        # KBD-06 weak-category modifier keys (REQ-KB-05): Shift/Alt/Control/Meta -> 'weak',
        # base intensity 0.3, never counted. Distinct keys so streak stays 1 each.
        reset()
        page.evaluate("() => { window.__key('Shift',false); window.__key('Alt',false); window.__key('Control',false); window.__key('Meta',false); }")
        s = spy()
        cnt = page.evaluate("() => window.WTJ_KEYBOARD.getEffectiveKeyCount()")
        fk = s["funcKeys"]
        check("KBD-06-weak-modifiers",
              cnt == 0 and len(fk) == 4 and all(x["category"] == "weak" for x in fk)
              and all(abs(x["intensity"] - 0.3) < 1e-9 for x in fk),
              f"count={cnt} categories={[x['category'] for x in fk]} intensities={[round(x['intensity'],3) for x in fk]}")

        # KBD-07 'other' fallback category (REQ-KB-05): an unclassified function key (Tab).
        reset()
        page.evaluate("() => window.__key('Tab', false)")
        s = spy()
        cnt = page.evaluate("() => window.WTJ_KEYBOARD.getEffectiveKeyCount()")
        fk = s["funcKeys"]
        check("KBD-07-other-category",
              cnt == 0 and len(fk) == 1 and fk[0]["category"] == "other" and abs(fk[0]["intensity"] - 0.5) < 1e-9,
              f"count={cnt} Tab category={fk[0]['category'] if fk else None} intensity={round(fk[0]['intensity'],3) if fk else None}")

        # KBD-08 decay floor + non-negative clamp (REQ-KB-06 '衰减到几乎没有'): 6 mashes of
        # Space -> [1, 0.75, 0.5, 0.25, 0, 0]; must reach 0 and never go negative.
        reset()
        page.evaluate("() => { for (var i=0;i<6;i++) window.__key(' ', false); }")
        s = spy()
        decays = [round(x["intensity"], 4) for x in s["funcKeys"]]
        check("KBD-08-decay-floor-clamp",
              decays == [1, 0.75, 0.5, 0.25, 0, 0],
              f"6x Space intensities={decays} (expect [1,0.75,0.5,0.25,0,0]: reaches 0, clamps non-negative)")

        # KBD-09 same-key streak is case-insensitive (REQ-KB-08 归一化): A/a/A/a is the same
        # key -> streak accumulates -> 4th paused -> counted=3, only 3 letters spawned.
        reset()
        page.evaluate("() => { window.__key('A',false); window.__key('a',false); window.__key('A',false); window.__key('a',false); }")
        s = spy()
        cnt = page.evaluate("() => window.WTJ_KEYBOARD.getEffectiveKeyCount()")
        check("KBD-09-caseinsensitive-streak",
              cnt == 3 and s["letters"] == ["A", "A", "A"],
              f"A/a/A/a -> count={cnt} letters={s['letters']} (case-insensitive same-key; 4th paused, no ghost letter)")

        # KBD-10 digit keys route through onLetter (REQ-KB-02): '7' spawns letter '7', counts.
        reset()
        page.evaluate("() => window.__key('7', false)")
        s = spy()
        check("KBD-10-digit-onletter",
              s["letters"] == ["7"] and s["effective"] == [1],
              f"'7' -> letters={s['letters']} effective={s['effective']}")

        # ---- SECRET WORD (via real keyboard flow) ----
        # SEC-01 basic + case-insensitive: 'DOG' (uppercased letters) hits 'dog' once.
        reset()
        page.evaluate("() => window.__type('DOG')")
        s = spy()
        check("SEC-01-basic-caseinsensitive",
              s["hits"] == ["dog"],
              f"typed DOG -> hits={s['hits']} (expect ['dog'])")

        # SEC-02 substring mid-stream: 'xxdogxx' hits dog when tail becomes 'dog'.
        reset()
        page.evaluate("() => window.__type('xxdogxx')")
        s = spy()
        check("SEC-02-substring",
              s["hits"] == ["dog"],
              f"typed xxdogxx -> hits={s['hits']} (expect single ['dog'])")

        # SEC-03 overlap 'dogg' triggers dog once, not twice (REQ-SEC-05).
        reset()
        page.evaluate("() => window.__type('dogg')")
        s = spy()
        check("SEC-03-overlap-dogg-once",
              s["hits"] == ["dog"],
              f"typed dogg -> hits={s['hits']} (expect exactly one 'dog')")

        # SEC-04 double letter no penalty: 'apple' (pp) hits apple (REQ-SEC-06).
        reset()
        page.evaluate("() => window.__type('apple')")
        s = spy()
        check("SEC-04-double-letter-apple",
              s["hits"] == ["apple"],
              f"typed apple -> hits={s['hits']} (double 'pp' must not block match)")

        # SEC-05 longest-match priority: 'scar' hits scar only, not car (REQ-SEC-11).
        reset()
        page.evaluate("() => window.__type('scar')")
        s = spy()
        check("SEC-05-longest-scar-not-car",
              s["hits"] == ["scar"],
              f"typed scar -> hits={s['hits']} (expect ['scar'] only, not 'car')")

        # SEC-06 compound independent: 'hotdog' hits hot then dog (REQ-SEC-10).
        reset()
        page.evaluate("() => window.__type('hotdog')")
        s = spy()
        check("SEC-06-compound-hotdog",
              s["hits"] == ["hot", "dog"],
              f"typed hotdog -> hits={s['hits']} (expect ['hot','dog'] in order)")

        # SEC-07 same-word repeat in a round -> minorHit only (REQ-SEC-07).
        reset()
        page.evaluate("() => { window.__type('dog'); window.__type('xdog'); }")
        s = spy()
        check("SEC-07-repeat-minor",
              s["hits"] == ["dog"] and s["minorHits"] == ["dog"],
              f"dog then dog again -> hits={s['hits']} minor={s['minorHits']}")

        # SEC-07b resetRound restores full feedback for the same word (REQ-SEC-07 '新一轮同词可再大反馈').
        reset()
        page.evaluate("() => window.__type('dog')")  # round1 hit
        page.evaluate("() => { window.WTJ_SECRET.resetRound(); window.__resetSpy(); }")
        page.evaluate("() => window.__type('0dog')")  # separator + dog: new round -> full hit again
        s = spy()
        check("SEC-07b-resetround-restores-hit",
              s["hits"] == ["dog"] and s["minorHits"] == [],
              f"after resetRound, dog again -> hits={s['hits']} minor={s['minorHits']} (expect full hit, not minor)")

        # SEC-09 three-word compound (REQ-SEC-10 + REQ-SEC-11 interaction): hotdogcar -> hot,dog,car;
        # scarcar -> scar (longest) then car (independent next position).
        reset()
        page.evaluate("() => window.__type('hotdogcar')")
        s = spy()
        ok_a = s["hits"] == ["hot", "dog", "car"]
        reset()
        page.evaluate("() => window.__type('scarcar')")
        s2 = spy()
        ok_b = s2["hits"] == ["scar", "car"]
        check("SEC-09-compound-three-and-scarcar",
              ok_a and ok_b,
              f"hotdogcar->{s['hits']} (expect hot,dog,car); scarcar->{s2['hits']} (expect scar,car)")

        # SEC-10 buffer-cap does not break a tail match after a very long prefix (REQ-SEC-04).
        reset()
        page.evaluate("() => window.__type('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxdog')")  # 30 x's + dog
        s = spy()
        buflen = page.evaluate("() => window.WTJ_SECRET.getBuffer().length")
        check("SEC-10-buffer-cap-tail-match",
              s["hits"] == ["dog"] and buflen <= 10,
              f"long-prefix+dog -> hits={s['hits']} bufferLen={buflen} (<=BUFFER_MAX 10; tail still matches)")

        # SEC-08 buffer never echoed to DOM (REQ-SEC-01): no input/textarea/contenteditable,
        # and no visible text node containing the typed stream.
        reset()
        page.evaluate("() => window.__type('dog')")
        dom = page.evaluate("""() => {
          var bad = document.querySelectorAll('input,textarea,[contenteditable]').length;
          var body = document.body ? document.body.innerText : '';
          return { inputs: bad, echoesDog: body.toLowerCase().indexOf('dog') !== -1 };
        }""")
        buf = page.evaluate("() => window.WTJ_SECRET.getBuffer()")
        check("SEC-08-no-dom-echo",
              dom["inputs"] == 0 and not dom["echoesDog"] and "dog" in buf,
              f"inputs={dom['inputs']} echoesDog={dom['echoesDog']} buffer_has_dog={'dog' in buf}")

        # ---- SLOTS ----
        # SLOT-DEDUP-DIRECT slots.js dedup contract (REQ-SLOT-01) — exercised
        # DIRECTLY, not through secretword. (A prior version tested dedup only
        # end-to-end where secretword's roundHitSet swallowed the 2nd hit, so
        # slots.js dedup was never hit — disabling findDuplicateIndex still passed.
        # This calls fillSlot twice with the same source+itemKey.)
        reset()
        dd = page.evaluate("""() => {
          var a = window.WTJ_SLOTS.fillSlot('secret-word', { itemKey: 'dog', renderState: { spriteUrl: 'x' } });
          var b = window.WTJ_SLOTS.fillSlot('secret-word', { itemKey: 'dog', renderState: { spriteUrl: 'x' } });
          var c = window.WTJ_SLOTS.fillSlot('keyboard-milestone', { itemKey: 'dog', renderState: {} });
          return { a: a, b: b, c: c, occupied: window.WTJ_SLOTS.getSlots().filter(function (x){return x;}).length };
        }""")
        check("SLOT-DEDUP-DIRECT",
              dd["a"]["filled"] is True and dd["b"]["filled"] is False and dd["b"]["duplicate"] is True
              and dd["c"]["filled"] is True and dd["occupied"] == 2,
              f"1st fill={dd['a']['filled']} 2nd(dup)={dd['b']} diff-source(dog)={dd['c']['filled']} occupied={dd['occupied']} "
              f"(same source+itemKey dedups; different source with same itemKey is a distinct slot)")

        # SLOT-01 end-to-end secret-word round dedup + renderState/audio/sprite (REQ-SEC-07/SLOT-04/SEC-03).
        reset()
        page.evaluate("() => { window.__type('dog'); window.__type('xdog'); }")
        e2e = page.evaluate("""() => {
          var occ = window.WTJ_SLOTS.getSlots().filter(function (x){return x;});
          return { occupied: occ.length,
                   slot0: occ.length ? occ[0] : null,
                   audio: window.__spy.audio,
                   hitsFull: window.__spy.hitsFull,
                   overlay: !!document.querySelector('.wtj-secret-overlay') };
        }""")
        check("SLOT-01-e2e-secret-dedup-render",
              e2e["occupied"] == 1 and e2e["slot0"]["source"] == "secret-word"
              and str(e2e["slot0"]["itemKey"]) == "dog"
              and e2e["slot0"]["renderState"].get("spriteUrl") == "assets/sprites/dog.png"
              and e2e["audio"] == ["dog.mp3"]
              and e2e["hitsFull"] and e2e["hitsFull"][0].get("spriteFile") == "sprites/dog.png"
              and e2e["overlay"] is True,
              f"occupied={e2e['occupied']} spriteUrl={e2e['slot0']['renderState'].get('spriteUrl')} "
              f"audio={e2e['audio']} overlay={e2e['overlay']} (dog twice: 1 slot, real render/sound/sprite wired)")

        # SLOT-02 keyboard milestone lights a slot at the real 100 threshold + renderState (REQ-SLOT-03/04).
        reset()
        page.evaluate("() => window.__typeN(100)")
        s = spy()
        slots = page.evaluate("() => window.WTJ_SLOTS.getSlots()")
        km = [x for x in slots if x and x["source"] == "keyboard-milestone"]
        check("SLOT-02-milestone-fills-slot",
              s["milestones"] == [100] and len(km) == 1 and str(km[0]["itemKey"]) == "100"
              and km[0]["renderState"].get("milestone") is True,
              f"100 effective keys -> milestones={s['milestones']} kb-slots={len(km)} renderState={km[0]['renderState'] if km else None}")

        # SLOT-06 second milestone (200): both milestones fire, each its own slot (REQ-SLOT-03, 卡验收标准3 '100/200').
        reset()
        page.evaluate("() => window.__typeN(200)")
        s = spy()
        slots = page.evaluate("() => window.WTJ_SLOTS.getSlots()")
        km = [(i, x) for i, x in enumerate(slots) if x and x["source"] == "keyboard-milestone"]
        keys = sorted(str(x["itemKey"]) for _, x in km)
        distinct_idx = len({i for i, _ in km}) == 2
        check("SLOT-06-milestone-200-both",
              s["milestones"] == [100, 200] and len(km) == 2 and keys == ["100", "200"] and distinct_idx,
              f"200 keys -> milestones={s['milestones']} kb-slots={len(km)} keys={keys} distinct_slots={distinct_idx}")

        # SLOT-03 mixed sources fill to full -> onFull fires exactly once (REQ-SLOT-02/RWD-02).
        reset()
        # 2 secret words (dog, apple) + milestones 3 and 5 = 3 fills; need 5 total.
        # Use distinct secret words: dog, apple, car, star, plus we already have room.
        page.evaluate("""() => {
          window.__type('dog');   // slot: secret dog
          window.__type('apple'); // slot: secret apple
          window.__type('car');   // slot: secret car
          window.__type('star');  // slot: secret star
          window.__type('hot');   // slot: secret hot -> 5th -> full
          // Extra fillSlot attempts while already full must return filled:false and
          // NOT re-emit onFull. Note: the observable protection here is fillSlot's
          // early return at findNextEmptyIndex()===-1 (no fill => no emit); the
          // everFullEmittedForCurrentRound guard is redundant with it given there is
          // no slot-removal API (flagged to PM as a dead-defense code-hygiene note,
          // not a functional gap). This case verifies the CONTRACT (onFull exactly
          // once), which is what matters for 011.
          var x1 = window.WTJ_SLOTS.fillSlot('keyboard-milestone', { itemKey: 999, renderState: { milestone: true } });
          var x2 = window.WTJ_SLOTS.fillSlot('secret-word', { itemKey: 'extra', renderState: {} });
          window.__extraFills = [x1, x2];
        }""")
        s = spy()
        st = page.evaluate("() => window.WTJ_SLOTS.getState()")
        extra = page.evaluate("() => window.__extraFills")
        check("SLOT-03-full-fires-once",
              st["full"] is True and len(s["fulls"]) == 1
              and all(x["filled"] is False and x["full"] is True for x in extra),
              f"5 distinct secret words + 2 extra fills while full -> full={st['full']} onFull_count={len(s['fulls'])} extra_fills_rejected={[x['filled'] for x in extra]}")

        # SLOT-04 full then no more fills accepted until reset; reset clears + new round.
        # reset() FIRST for isolation (otherwise it inherits SLOT-03's full state and
        # its own typing is inert round-repeats — the assertion would pass on carryover).
        reset()
        reset_before = page.evaluate("""() => {
          // fill to full again (fresh round, so these are real hits, not minorHits)
          window.__type('dog'); window.__type('apple'); window.__type('car');
          window.__type('star'); window.__type('hot');
          var beforeExtra = window.WTJ_SLOTS.fillSlot('secret-word', { itemKey: 'zzz', renderState: {} });
          window.WTJ_SLOTS.reset();
          var afterReset = window.WTJ_SLOTS.getState();
          return { beforeExtra: beforeExtra, afterFull: afterReset.full,
                   occupied: afterReset.slots.filter(function (x){ return x; }).length };
        }""")
        check("SLOT-04-full-blocks-then-reset-clears",
              reset_before["beforeExtra"]["filled"] is False
              and reset_before["beforeExtra"]["full"] is True
              and reset_before["afterFull"] is False
              and reset_before["occupied"] == 0,
              f"extra-fill-when-full={reset_before['beforeExtra']} afterReset_full={reset_before['afterFull']} occupied={reset_before['occupied']}")

        # SLOT-05 reset re-enables keyboard milestones (008 count reset) — second round works.
        reset()
        page.evaluate("() => window.__typeN(100)")  # milestone 100
        page.evaluate("() => { window.WTJ_SLOTS.reset(); window.__normalizeStreak(); window.__resetSpy(); }")
        page.evaluate("() => window.__typeN(100)")  # milestone 100 again
        s = spy()
        check("SLOT-05-reset-reenables-milestone",
              s["milestones"] == [100],
              f"after reset, 100 keys -> milestones={s['milestones']} (expect [100] again; reset must clear 008 count)")

        # ---- PRODUCT CHARACTERIZATION (real reset contract; documents cross-round
        #      behaviour surfaced by adversarial review — flagged to PM as findings.
        #      Assertions that lock CURRENT behaviour flip when PM rules a finding a
        #      bug and TL fixes it. PROD-01 was ruled a bug and FIXED by
        #      WTJ-20260704-066 (its assert has flipped); PROD-02 still locks
        #      current within-round coupling. ----

        # PROD-01 (WTJ-20260704-066, FIXED — was: finding, major): WTJ_SLOTS.reset()
        # (the 011 'new round' contract) now clears secretword's rolling buffer via
        # resetRound(). A partial word typed just before a round reset no longer
        # spuriously completes after it. Here: type 'do', reset (real, no filler),
        # type only 'g' -> NO 'dog' hit (pre-066 this misfired 'dog').
        page.evaluate("() => window.__realReset()")
        page.evaluate("() => window.__type('do')")
        page.evaluate("() => window.__realReset()")   # 066: buffer 'do' cleared here
        page.evaluate("() => window.__type('g')")     # user typed one letter
        s = spy()
        check("PROD-01-crossround-buffer-cleared",
              s["hits"] == [],
              f"'do' | reset | 'g' -> hits={s['hits']} (FIXED WTJ-066: reset clears "
              f"buffer -> no spurious 'dog')")

        # PROD-02 (finding, minor): a keystroke paused by the same-key-streak rule
        # (REQ-KB-08) is dropped from the secret buffer too, because handleAlnumKey
        # returns before emit(onLetter). So a pool word with 4+ identical consecutive
        # letters could never match. Characterize via the buffer: 'zaaaa' -> the 4th
        # 'a' never reaches the buffer.
        reset()
        page.evaluate("() => window.__type('zaaaa')")
        buf = page.evaluate("() => window.WTJ_SECRET.getBuffer()")
        check("PROD-02-paused-letter-dropped-from-buffer",
              buf.endswith("zaaa") and "zaaaa" not in buf,
              f"typed 'zaaaa' -> buffer='{buf}' (CURRENT: 4th 'a' paused -> dropped from buffer; "
              f"flagged to PM: word with 4+ same consecutive letters is unmatchable — no such word in current pool)")

        console_before_real = list(console_errors)
        browser.close()

        # ---- REAL manifest wiring smoke: load shipped manifest.js, confirm a real word wires ----
        real_manifest = None
        mjs = app_web / "manifest.js"
        real_pool_words: list[str] = []
        if mjs.is_file():
            browser2, ctx2, page2, ce2 = None, None, None, []
            browser2 = pw.chromium.launch()
            ctx2 = browser2.new_context(offline=True)
            page2 = ctx2.new_page()
            page2.set_content("<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>")
            # manifest.js defines window.WTJ_MANIFEST itself.
            page2.add_script_tag(content=mjs.read_text(encoding="utf-8"))
            real_pool_words = page2.evaluate(
                "() => (window.WTJ_MANIFEST && window.WTJ_MANIFEST.secretWords && window.WTJ_MANIFEST.secretWords.pool || []).map(function(e){return (e&&e.word)?String(e.word).toLowerCase():'';})")
            for name in ("slots.js", "keyboard.js", "secretword.js"):
                page2.add_script_tag(content=(app_web / name).read_text(encoding="utf-8"))
            page2.add_script_tag(content=HARNESS_JS)
            # pick a known real word to type; prefer 'dog', else first pool word.
            target = "dog" if "dog" in real_pool_words else (real_pool_words[0] if real_pool_words else "")
            if target:
                page2.evaluate("(w) => window.__type(w)", target)
                hits = page2.evaluate("() => window.__spy.hits")
                check("REAL-01-shipped-pool-wires",
                      target in hits,
                      f"real manifest pool has {len(real_pool_words)} words; typed '{target}' -> hits={hits}")
            else:
                check("REAL-01-shipped-pool-wires", False, "real manifest pool is empty")
            browser2.close()
        else:
            check("REAL-01-shipped-pool-wires", False, f"manifest.js not found at {mjs}")

    passed = sum(1 for c in cases.values() if c["pass"])
    report = {"passed": passed, "total": len(cases),
              "real_pool_size": len(real_pool_words), "cases": cases}
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{passed}/{len(cases)} passed  report: {report_path}")
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    sys.exit(main())
