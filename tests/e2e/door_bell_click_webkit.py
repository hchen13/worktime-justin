#!/usr/bin/env python3
"""door/bell click-task visibility + hit/complete chain E2E (WTJ-20260707-007, P0).

Background: Ethan reported that on Justin's old real machine, the door/doorbell
click tasks (click-door-open / click-doorbell-ring, wired by WTJ-20260705-025 —
see a10fca4/c872d9e) don't show up. Investigation for this card found the actual
runtime wiring already correct at this baseline (stage@a1f2ded): PROP_ANIM_STATE_MAP
in task-templates.js registers both `door` (idle:'closed'->active:'opening') and
`bell` (idle:'idle'->active:'ring'), routing them through the exact same
canvas + WTJ_FRAME_ANIM engine path already hardened for faucet/horse/lamp by the
WTJ-20260705-014 P0 fix (frame-anim.js's "never abandon a canvas before its first
successful paint" retry-until-ready logic, see that file's header). What WAS stale
was several inline comments in task-templates.js still asserting "door/bell
intentionally excluded from PROP_ANIM_STATE_MAP / always falls back to static
<img>" — a claim that contradicted the object literal two lines below it since
WTJ-20260705-025 landed; those comments have been corrected as part of this card
(see git log for the docs-only commit) and this file is the durable functional
regression lock this task-templates.js change didn't have a dedicated home for.

`tests/e2e/task_target_visibility_webkit.py` already asserts door/bell reach
visible+clickable state as part of its generic all-click-examples sweep across
four viewports. This file is narrower and deeper, specifically for door/bell:

  1. Idle-state visibility: the canvas paints non-transparent content the moment
     the task spawns (before any click) — this is the literal "门铃/门任务不显示"
     symptom, caught at the pixel level, not just "an element with this class
     exists in the DOM" (a transparent canvas would pass a naive DOM-presence
     check while still looking exactly like "not showing" to a 3-year-old).
  2. hit -> active-animation -> task-complete event pairing: a real trusted mouse
     click at the *measured* rect center (i.e. testing pointer.js's real
     getBoundingClientRect()-based hit test, not a synthetic DOM click) must (a)
     flip data-anim-state to 'active', (b) hand WTJ_FRAME_ANIM.play() the correct
     prop+activeState (door->opening, bell->ring — cross-checked against
     PROP_ANIM_STATE_MAP so a future edit to that table can't silently drift this
     test out of sync), and (c) emit exactly one onTaskComplete event carrying the
     matching {type:'click', taskId}, with getActiveTaskInfo() flipping to null in
     the same window — i.e. the "complete" half of the pair actually fires, it's
     not just the animation playing forever with the task stuck ACTIVE.
  3. Real-hardware race resilience: WTJ-20260705-014 was found via artificially
     delaying image load past idleStopSec(5s) with zero pointer activity after
     task spawn — on real old hardware, wtjres:// scheme handler disk reads +
     several props' sheets competing for the main thread can easily reproduce
     that delay. The generic fix (frame-anim.js's shouldKeepRetrying()) is shared
     code, so door/bell should already benefit — this case proves it, specifically
     for door/bell, rather than relying on faucet/horse/lamp's existing coverage
     to imply it by analogy. This is the closest this suite can get to
     reproducing "旧机" conditions without physical hardware — see
     tests/manual/WTJ-055-bigsur-realmachine.md's new door/bell row for the part
     that genuinely cannot be automated (real WKWebView, real disk I/O, real
     2014-MBA-class decode speed).

Run:  python3 tests/e2e/door_bell_click_webkit.py [--app-web DIR] [--engine webkit|chromium] [--port N]
Exit: 0 all pass · 1 a case failed · 2 infra error.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import socketserver
import sys
import threading
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_APP_WEB = REPO_ROOT / "app" / "web"
DEFAULT_REPORT = REPO_ROOT / "tests" / "reports" / "door_bell_click_webkit_report.json"

# Mirrors task-templates.js PROP_ANIM_STATE_MAP (door/bell rows) — kept here so a
# future edit to that table that silently breaks door/bell will fail this test's
# cross-check (CASE-*-active-state-matches-prop-map) instead of only showing up
# as a vague "wrong animation" complaint with no attribution.
EXPECTED_PROP_MAP = {
    "click-door-open": {"prop": "door", "activeState": "opening"},
    "click-doorbell-ring": {"prop": "bell", "activeState": "ring"},
}

COMPLETE_VISUAL_HOLD_MS = 800  # task-templates.js COMPLETE_VISUAL_HOLD_MS floor.


class _ReusableTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    # ThreadingMixIn is required here (unlike the plain TCPServer other e2e
    # scripts in this repo use): run_case_slow_load_race() injects a blocking
    # time.sleep() into do_GET() for door/bell asset paths only. A non-threading
    # TCPServer handles one request at a time on its single serve_forever()
    # thread, so that sleep would stall *every other* concurrent request the
    # page makes (other sprites/audio/manifest files) behind it — an artifact
    # of the test harness, not a real browser's concurrent-connection behavior,
    # and it produced a real observed flake (one delayed unrelated resource
    # transiently starving something the page needed before the canvas read).
    # Threading isolates the injected delay to the door/bell requests only.
    allow_reuse_address = True
    daemon_threads = True


def make_handler(app_web: Path, delay_substrings=None, delay_s=0.0):
    delay_substrings = delay_substrings or []

    class Handler(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            if delay_substrings and any(s in self.path for s in delay_substrings):
                time.sleep(delay_s)
            return super().do_GET()

        def log_message(self, *a, **k):
            pass

    return functools.partial(Handler, directory=str(app_web))


def serve(app_web: Path, port: int, delay_substrings=None, delay_s=0.0):
    handler = make_handler(app_web, delay_substrings, delay_s)
    httpd = _ReusableTCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


PROP_JS = """() => {
    var root = document.querySelector('.wtj-tt-root');
    var el = root ? root.querySelector('.wtj-tt-prop') : null;
    if (!el) return null;
    var rect = el.getBoundingClientRect();
    var out = {
        tag: el.tagName,
        rect: {x: rect.left, y: rect.top, w: rect.width, h: rect.height},
        animState: el.getAttribute('data-anim-state')
    };
    if (el.tagName === 'CANVAS') {
        try {
            var ctx = el.getContext('2d');
            var data = ctx.getImageData(0, 0, el.width, el.height).data;
            var nz = 0;
            for (var i = 3; i < data.length; i += 4) { if (data[i] !== 0) nz++; }
            out.nonZeroAlphaPixels = nz;
        } catch (e) {
            out.canvasReadError = String(e);
        }
    }
    var fa = (window.WTJ_FRAME_ANIM && window.WTJ_FRAME_ANIM.getState) ? window.WTJ_FRAME_ANIM.getState() : null;
    out.activePlaybacks = fa ? fa.activePlaybacks : null;
    return out;
}"""


def canvas_painted(snap):
    return bool(snap) and snap.get("tag") == "CANVAS" and (snap.get("nonZeroAlphaPixels") or 0) > 0


def poll_prop_painted(page, timeout_ms, poll_ms=100):
    """Poll the current task prop's canvas until it has painted non-transparent
    content (ground truth = actual backing-store pixels, NOT the possibly-stale
    hasDrawnOnce flag), or timeout. Returns the last snapshot either way.

    The product requirement is 'the prop EVENTUALLY becomes visible and stays
    visible'; a single fixed-time sample is the wrong assertion because the
    delayed door/bell sheet request doesn't always begin exactly at task spawn,
    so a fixed sample can land before the (deliberately delayed) load resolves.
    A regression that keeps the prop permanently blank (e.g. the IMG-fallback
    path when a prop is wrongly dropped from PROP_ANIM_STATE_MAP) never paints a
    canvas at all, so it correctly times out here and fails."""
    waited = 0
    snap = page.evaluate(PROP_JS)
    while not canvas_painted(snap) and waited < timeout_ms:
        page.wait_for_timeout(poll_ms)
        waited += poll_ms
        snap = page.evaluate(PROP_JS)
    return snap

INSTALL_LISTENER_JS = """() => {
    window.__wtjTestEvents = [];
    window.WTJ_TASK_TEMPLATES.onTaskComplete(function (payload) {
        window.__wtjTestEvents.push(payload);
    });
}"""


def find_and_drive(page, target_task_id, max_attempts=40):
    """Cycle question-clicks (dismissing anything that isn't the target click
    example) until the target task is active, then return its measured rect."""
    for _ in range(max_attempts):
        page.click(".wtj-hud-question")
        page.wait_for_timeout(120)
        info = page.evaluate("() => window.WTJ_TASK_TEMPLATES.getActiveTaskInfo()")
        if info and info.get("type") == "click" and info.get("taskId") == target_task_id:
            return info
        page.evaluate("() => window.WTJ_TASK.dismiss('manual')")
        page.wait_for_timeout(30)
    return None


def run_case_correctness(pw, engine, url, cases: dict):
    """CASE group 1: normal-speed idle visibility + click -> active anim ->
    task-complete event pairing, for both click-door-open and click-doorbell-ring."""
    bt = getattr(pw, engine)
    browser = bt.launch()
    page = browser.new_page(viewport={"width": 1366, "height": 768})  # old-MBA-equivalent
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))
    page.goto(url, wait_until="load")
    page.wait_for_timeout(300)
    page.evaluate(INSTALL_LISTENER_JS)

    for task_id, expect in EXPECTED_PROP_MAP.items():
        prefix = f"CORRECT-{task_id}"
        info = find_and_drive(page, task_id)
        if not info:
            cases[f"{prefix}-reached"] = {"pass": False, "detail": f"{task_id} not reached within attempt budget"}
            continue
        cases[f"{prefix}-reached"] = {"pass": True, "detail": f"active task info: {info}"}

        # ---- 1. idle-state visibility (the literal reported symptom) ----
        # Normal-speed load here (no injected delay), but still poll rather than
        # single-sample: on any host, one tick of image decode can outlast a
        # naive immediate read. 3s is a generous ceiling for a normal load.
        idle = poll_prop_painted(page, timeout_ms=3000)
        idle_ok = canvas_painted(idle)
        cases[f"{prefix}-idle-visible"] = {
            "pass": idle_ok,
            "detail": f"idle prop snapshot: {idle}",
        }
        if not idle_ok:
            page.evaluate("() => window.WTJ_TASK.dismiss('manual')")
            page.wait_for_timeout(30)
            continue

        # ---- 2a. real trusted click at the *measured* rect center ----
        r = idle["rect"]
        cx, cy = r["x"] + r["w"] / 2, r["y"] + r["h"] / 2
        page.mouse.click(cx, cy)
        page.wait_for_timeout(80)  # give play()/setAnimState a couple ticks

        # ---- 2b. active animation: data-anim-state flips + correct prop/state ----
        active = page.evaluate(PROP_JS)
        anim_state_ok = bool(active) and active.get("animState") == "active"
        cases[f"{prefix}-anim-state-flips-to-active"] = {
            "pass": anim_state_ok,
            "detail": f"post-click prop snapshot: {active}",
        }
        matching_playback = None
        if active and active.get("activePlaybacks"):
            for pb in active["activePlaybacks"]:
                if pb.get("prop") == expect["prop"] and pb.get("state") == expect["activeState"]:
                    matching_playback = pb
                    break
        cases[f"{prefix}-active-state-matches-prop-map"] = {
            "pass": matching_playback is not None,
            "detail": (f"expected prop={expect['prop']} state={expect['activeState']}; "
                       f"activePlaybacks={active.get('activePlaybacks') if active else None}"),
        }

        # ---- 2c. task-complete event pairing ----
        page.wait_for_timeout(COMPLETE_VISUAL_HOLD_MS + 400)
        still_active = page.evaluate("() => window.WTJ_TASK_TEMPLATES.getActiveTaskInfo()")
        events = page.evaluate("() => window.__wtjTestEvents")
        matching_events = [e for e in (events or []) if e.get("taskId") == task_id]
        pair_ok = (still_active is None) and len(matching_events) == 1 and matching_events[0].get("type") == "click"
        cases[f"{prefix}-hit-to-complete-event-pairs"] = {
            "pass": pair_ok,
            "detail": (f"getActiveTaskInfo()after={still_active}; "
                       f"onTaskComplete events for this taskId={matching_events}"),
        }

        page.wait_for_timeout(30)

    cases["CORRECT-no-console-errors"] = {"pass": not console_errors, "detail": f"errors: {console_errors[:5]}"}
    browser.close()


def run_case_slow_load_race(pw, engine, app_web: Path, port: int, cases: dict):
    """CASE group 2: door/bell survive the exact WTJ-20260705-014 failure class —
    sheet image load delayed past idleStopSec(5s) with zero pointer activity after
    the initiating question-click. Proves the shared frame-anim.js fix generalizes
    to door/bell specifically, not just by analogy to faucet/horse/lamp."""
    delay_s = 6.0  # > manifest.js performance.idleStopSec (5s)
    httpd = serve(app_web, port, delay_substrings=["assets/anim/door", "assets/anim/bell"], delay_s=delay_s)
    url = f"http://127.0.0.1:{port}/index.html"
    try:
        bt = getattr(pw, engine)
        browser = bt.launch()
        page = browser.new_page(viewport={"width": 1366, "height": 768})
        page.goto(url, wait_until="load")
        page.wait_for_timeout(200)

        remaining = set(EXPECTED_PROP_MAP.keys())
        attempts = 0
        while remaining and attempts < 40:
            attempts += 1
            page.click(".wtj-hud-question")
            info = page.evaluate("() => window.WTJ_TASK_TEMPLATES.getActiveTaskInfo()")
            if not info or info.get("type") != "click" or info.get("taskId") not in remaining:
                page.evaluate("() => window.WTJ_TASK.dismiss('manual')")
                page.wait_for_timeout(30)
                continue
            task_id = info["taskId"]
            remaining.discard(task_id)
            # Deliberately NO further pointer activity during this window — this is
            # the exact race: idle-stop(5s) firing before the delayed image resolves.
            # Poll (ground-truth pixels) up to well past the injected delay: the
            # assertion is "the delayed sheet EVENTUALLY paints and the frame-anim
            # retry-until-ready logic doesn't give up during the zero-activity
            # window", not "it's painted at one exact fixed instant" (the delayed
            # request doesn't always begin exactly at spawn, so a fixed sample was
            # measurement-flaky; see poll_prop_painted() docstring).
            snap = poll_prop_painted(page, timeout_ms=int((delay_s + 4) * 1000))
            painted = canvas_painted(snap)
            cases[f"RACE-{task_id}-survives-slow-load-plus-idle-stop"] = {
                "pass": painted,
                "detail": f"after delayed-load({delay_s}s) + zero-activity poll window: {snap}",
            }
            page.evaluate("() => window.WTJ_TASK.dismiss('manual')")
            page.wait_for_timeout(30)

        cases["RACE-both-props-reached"] = {
            "pass": not remaining,
            "detail": f"unreached: {sorted(remaining)}" if remaining else "door+bell both exercised",
        }
        browser.close()
    finally:
        httpd.shutdown()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--app-web", default=str(DEFAULT_APP_WEB))
    ap.add_argument("--engine", default="webkit", choices=["webkit", "chromium"])
    ap.add_argument("--port", type=int, default=8976)
    ap.add_argument("--report", default=str(DEFAULT_REPORT))
    args = ap.parse_args()

    app_web = Path(args.app_web).resolve()
    report_path = Path(args.report).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)

    if not (app_web / "index.html").is_file():
        print(f"INFRA-ERROR 缺 index.html: {app_web}")
        return 2
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        print(f"INFRA-ERROR playwright 不可用: {e}")
        return 2

    cases: dict[str, dict] = {}
    httpd = serve(app_web, args.port)
    url = f"http://127.0.0.1:{args.port}/index.html"
    try:
        with sync_playwright() as pw:
            run_case_correctness(pw, args.engine, url, cases)
    finally:
        httpd.shutdown()

    with sync_playwright() as pw:
        run_case_slow_load_race(pw, args.engine, app_web, args.port + 1, cases)

    for cid, c in cases.items():
        print(f"{'PASS' if c['pass'] else 'FAIL'} {cid}  {c['detail']}")

    passed = sum(1 for c in cases.values() if c["pass"])
    report = {"engine": args.engine, "app_web": str(app_web),
              "passed": passed, "total": len(cases), "cases": cases}
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{passed}/{len(cases)} passed  report: {report_path}")
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    sys.exit(main())
