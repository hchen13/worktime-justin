#!/usr/bin/env python3
"""Task target visibility / spawn-bounds E2E (WTJ-20260705-014, P0).

Background: Ethan observed on real hardware (justin.local, 2014-MBA-class old
machine) that click-horse-run / click-faucet-on tasks spawned (voice prompt
played, task became ACTIVE) but their target prop never appeared on screen.
`app/web/assets/task-props/{horse,faucet}.png` exist and every per-module unit
test was green — TL's dispatch card for this P0 explicitly forbids treating
"asset exists + unit tests green" as clearance, because the bug lives in the
runtime/layout layer those unit tests stub out (node:vm sandboxes never lay
out real CSS, and never load real frame-anim.js image assets).

This file is the durable, real-browser regression lock for the two independent
root causes TL found + fixed while investigating this card:

  1. `frame-anim.js` gave up drawing a target's canvas after a single 16ms
     retry (single-frame idle states) or paused its tick loop via idle-stop
     before ever painting a first frame (looping idle states, e.g. horse) —
     on real hardware, image load/decode can easily outlast that one retry or
     outlast `idleStopSec` with zero pointer activity, leaving the canvas
     permanently transparent. Fixed in `frame-anim.js` (see its file header,
     "WTJ-20260705-014 根因修复"); durably covered at the unit level in
     `tests/unit/frame-anim.test.mjs`. This file re-proves it end-to-end: the
     real click examples (lamp/faucet/horse) must render *visible, non-empty*
     content in a real WebKit page, not just "the unit-level engine drew a
     frame in a vm sandbox".
  2. `task-templates.js`'s `POSITION_PRESETS` used percentages computed against
     stale assumptions (a 34px topbar that is actually 44px; `.wtj-tt-prop`'s
     `clamp(88px, 12vw, 160px)` reaching its 160px ceiling on wide-but-short
     viewports) — on real "旧机等价" resolutions (1366x768 is a real 2014 MBA
     11" native resolution and one of TL's own repro viewports) two of the six
     presets land the spawned prop's DOM rect *overlapping* the HUD topbar or
     the footer discovery tray. A target sitting half-behind the topbar/tray is
     exactly what "target not visible" looks like to a 3-year-old, even though
     the prop element itself rendered fine. Fixed in `task-templates.js` (see
     `POSITION_PRESETS`' inline comment for the exact geometry/derivation).

Scope: browser-driven visual/geometric layer only (real CSS layout + real
frame-anim canvas painting + real pointer hit-testing). Per-type completion
*logic* (drag/click/find/press judging) is exhaustively unit-covered by
`tests/unit/task-templates.test.mjs` and is NOT re-tested here.

Engine: WebKit by default (same engine family as the native shell's WKWebView
target; `--engine chromium` also runs for a second data point, same convention
as `drag_task_webkit.py`).

Run:  python3 tests/e2e/task_target_visibility_webkit.py [--app-web DIR] [--engine webkit|chromium] [--port N]
Exit: 0 all pass · 1 a case failed (target invisible / out of safe bounds) · 2 infra error.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import socketserver
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_APP_WEB = REPO_ROOT / "app" / "web"
DEFAULT_REPORT = REPO_ROOT / "tests" / "reports" / "task_target_visibility_webkit_report.json"

# The four viewports TL's dispatch card named explicitly: a real fullscreen-ish
# desktop size, a non-fullscreen dev window, and the two "旧机等价" (old-machine
# equivalent) resolutions — 1366x768 is a real 2014 MacBook Air 11" native
# resolution, 1440x900 a real 13" one.
VIEWPORTS = [
    ("fullscreen_1920x1080", 1920, 1080),
    ("windowed_1024x768", 1024, 768),
    ("old_mba_1440x900", 1440, 900),
    ("old_mba_1366x768", 1366, 768),
]

# One full rotation cycle of TASK_TYPES is 4 (drag/click/find/press); click has
# 5 examples (lamp/faucet/horse/door/bell — WTJ-20260705-025 added click-door-open/
# click-doorbell-ring, wiring in the door.png/bell.png task-props that shipped with
# Pack A but were never referenced by any manifest example). One full type-cycle is
# now 4*5=20 question-clicks; 24 gives a small margin, guaranteeing every click
# example (typeRotationIndex 0..4) is reached at least once — see task-templates.js
# handleQuestionClicked()'s rotation math.
CLICKS_PER_VIEWPORT = 24

# The five click examples that must be forced reachable + visible (original three
# TL named explicitly, plus WTJ-20260705-025's door/doorbell additions).
# WTJ-20260706-009: click-faucet-on renamed to click-faucet-off (task semantics flipped
# from "turn the water on" to "turn the water off" — see task-templates.js PROP_ANIM_STATE_MAP).
ALL_CLICK_EXAMPLE_IDS = {
    "click-lamp-on", "click-faucet-off", "click-horse-run",
    "click-door-open", "click-doorbell-ring"
}

EXTRACT_JS = """() => {
    function rectOf(sel) {
        var el = document.querySelector(sel);
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return {x: r.left, y: r.top, w: r.width, h: r.height};
    }
    var hud = {
        topbar: rectOf('.wtj-hud-topbar'),
        question: rectOf('.wtj-hud-question'),
        tray: rectOf('.wtj-hud-tray-wrap'),
        lights: rectOf('.wtj-hud-lights'),
        chestLane: rectOf('.wtj-hud-chest-lane')
    };
    var info = window.WTJ_TASK_TEMPLATES.getActiveTaskInfo();
    var root = document.querySelector('.wtj-tt-root');
    var props = root ? Array.from(root.querySelectorAll('.wtj-tt-prop')) : [];
    var out = [];
    props.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        var entry = {
            tag: el.tagName,
            rect: {x: rect.left, y: rect.top, w: rect.width, h: rect.height},
            spriteFile: el.getAttribute('data-wtj-sprite-file')
        };
        if (el.tagName === 'IMG') {
            entry.naturalWidth = el.naturalWidth;
            entry.complete = el.complete;
        } else if (el.tagName === 'CANVAS') {
            try {
                var ctx = el.getContext('2d');
                var data = ctx.getImageData(0, 0, el.width, el.height).data;
                var nz = 0;
                for (var i = 3; i < data.length; i += 4) { if (data[i] !== 0) nz++; }
                entry.nonZeroAlphaPixels = nz;
            } catch (e) {
                entry.canvasReadError = String(e);
            }
        }
        out.push(entry);
    });
    return {taskInfo: info, props: out, hud: hud, viewport: {w: window.innerWidth, h: window.innerHeight}};
}"""


class _ReusableTCPServer(socketserver.TCPServer):
    # Rapid successive test runs on the same --port would otherwise intermittently
    # hit "Address already in use" while the previous run's socket sits in
    # TIME_WAIT; SO_REUSEADDR (standard for short-lived dev/test HTTP servers)
    # avoids that flakiness.
    allow_reuse_address = True


def serve(app_web: Path, port: int):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(app_web))
    httpd = _ReusableTCPServer(("127.0.0.1", port), handler)
    httpd.RequestHandlerClass.log_message = lambda *a, **k: None
    import threading
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def rects_overlap(a, b):
    if not a or not b:
        return False
    return not (a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"]
                or a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"])


def within_viewport(rect, vw, vh, eps=0.5):
    return (rect["x"] >= -eps and rect["y"] >= -eps
            and (rect["x"] + rect["w"]) <= vw + eps
            and (rect["y"] + rect["h"]) <= vh + eps)


def content_loaded(prop):
    if prop["tag"] == "IMG":
        return bool(prop.get("complete")) and (prop.get("naturalWidth") or 0) > 0
    if prop["tag"] == "CANVAS":
        return (prop.get("nonZeroAlphaPixels") or 0) > 0
    return False


def drive_viewport(pw, engine, url, width, height, n_clicks):
    """Rotate through n_clicks question-mark clicks at one viewport, collecting
    every rendered prop's rect/content-loaded state + the HUD zone rects."""
    bt = getattr(pw, engine)
    launch_args = ["--autoplay-policy=no-user-gesture-required"] if engine == "chromium" else []
    browser = bt.launch(args=launch_args)
    page = browser.new_page(viewport={"width": width, "height": height})
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))
    page.goto(url, wait_until="load")
    page.wait_for_timeout(300)

    samples = []
    click_clickthrough_results = []  # real-pointer-click completion proof, click type only
    for _ in range(n_clicks):
        page.click(".wtj-hud-question")
        # Give frame-anim a couple of ticks (TICK_MS=16) to actually paint —
        # this is deliberately more than one retry cycle, the exact gap the
        # frame-anim.js bug (single-retry-then-abandon) used to fail under.
        page.wait_for_timeout(120)
        data = page.evaluate(EXTRACT_JS)
        if data["taskInfo"]:
            samples.append(data)
            # Strongest possible proof of "visible AND clickable exactly where
            # it visually appears": for click-type tasks, drive a REAL trusted
            # mouse click at the measured rect's center and confirm the task
            # completes. This subsumes "pointer target bounds == visual rect"
            # (pointer.js's resolveBounds() reads the same live
            # getBoundingClientRect(), see pointer.js) — if they ever diverged,
            # this click would miss and the task would still be active.
            if data["taskInfo"]["type"] == "click" and len(data["props"]) == 1:
                r = data["props"][0]["rect"]
                cx, cy = r["x"] + r["w"] / 2, r["y"] + r["h"] / 2
                task_id = data["taskInfo"]["taskId"]
                page.mouse.click(cx, cy)
                page.wait_for_timeout(950)  # >= COMPLETE_VISUAL_HOLD_MS(800)+buffer
                still_active = page.evaluate("() => window.WTJ_TASK_TEMPLATES.getActiveTaskInfo()")
                click_clickthrough_results.append({
                    "taskId": task_id, "clickedAt": {"x": cx, "y": cy},
                    "completedByRealClick": still_active is None,
                })
        page.evaluate("() => window.WTJ_TASK.dismiss('manual')")
        page.wait_for_timeout(30)

    browser.close()
    return samples, click_clickthrough_results, console_errors


def run_suite(pw, app_web: Path, engine: str, port: int):
    httpd = serve(app_web, port)
    url = f"http://127.0.0.1:{port}/index.html"
    cases: dict[str, dict] = {}

    def check(cid, ok, detail):
        cases[cid] = {"pass": bool(ok), "detail": detail}
        print(f"{'PASS' if ok else 'FAIL'} {cid}  {detail}")

    try:
        click_examples_seen_overall = set()
        for vp_name, width, height in VIEWPORTS:
            samples, clickthrough, console_errors = drive_viewport(
                pw, engine, url, width, height, CLICKS_PER_VIEWPORT)

            check(f"VIS-{vp_name}-no-console-errors", not console_errors,
                  f"console/page errors: {console_errors[:5]}")

            check(f"VIS-{vp_name}-task-rotation-produced-samples", len(samples) > 0,
                  f"{len(samples)} task instance(s) observed across {CLICKS_PER_VIEWPORT} question-clicks")

            # ----- rect safety: every rendered prop, every task type -----
            bounds_problems = []
            content_problems = []
            for s in samples:
                vw, vh = s["viewport"]["w"], s["viewport"]["h"]
                for prop in s["props"]:
                    r = prop["rect"]
                    label = f"{s['taskInfo']['type']}/{s['taskInfo']['taskId']}/{prop['spriteFile']}"
                    if r["w"] == 0 or r["h"] == 0:
                        bounds_problems.append(f"{label}: zero-size rect {r}")
                        continue
                    if not within_viewport(r, vw, vh):
                        bounds_problems.append(f"{label}: rect {r} out of viewport ({vw}x{vh})")
                    for zone_name, zone_rect in s["hud"].items():
                        if zone_rect and rects_overlap(r, zone_rect):
                            bounds_problems.append(f"{label}: rect {r} overlaps HUD zone '{zone_name}' {zone_rect}")
                    if not content_loaded(prop):
                        content_problems.append(f"{label}: {prop['tag']} has no visible content ({prop})")

            check(f"VIS-{vp_name}-props-within-safe-bounds", not bounds_problems,
                  "; ".join(bounds_problems) if bounds_problems else
                  f"all {sum(len(s['props']) for s in samples)} prop rect(s) within viewport and clear of all 5 HUD zones")
            check(f"VIS-{vp_name}-props-render-visible-content", not content_problems,
                  "; ".join(content_problems) if content_problems else
                  "every IMG loaded (naturalWidth>0) and every CANVAS has >=1 non-transparent pixel")

            # ----- the exact five click examples that must be forced (WTJ-20260705-025
            # added click-door-open/click-doorbell-ring to the original three TL forced) -----
            click_ids = {s["taskInfo"]["taskId"] for s in samples if s["taskInfo"]["type"] == "click"}
            click_examples_seen_overall |= click_ids
            check(f"VIS-{vp_name}-all-click-examples-reached",
                  ALL_CLICK_EXAMPLE_IDS <= click_ids,
                  f"click examples reached this viewport: {sorted(click_ids)}")

            # ----- real trusted click at the measured rect center completes -----
            ct_fail = [c for c in clickthrough if not c["completedByRealClick"]]
            check(f"VIS-{vp_name}-real-click-at-measured-rect-completes-task", not ct_fail,
                  f"{len(clickthrough) - len(ct_fail)}/{len(clickthrough)} real mouse clicks at the "
                  f"measured DOM rect center completed their task; failures={ct_fail}")

        check("VIS-all-viewports-click-examples-reached",
              ALL_CLICK_EXAMPLE_IDS <= click_examples_seen_overall,
              f"union across all viewports: {sorted(click_examples_seen_overall)}")
    finally:
        httpd.shutdown()

    return cases


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--app-web", default=str(DEFAULT_APP_WEB))
    ap.add_argument("--engine", default="webkit", choices=["webkit", "chromium"])
    ap.add_argument("--port", type=int, default=8974)
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

    with sync_playwright() as pw:
        cases = run_suite(pw, app_web, args.engine, args.port)

    passed = sum(1 for c in cases.values() if c["pass"])
    report = {"engine": args.engine, "app_web": str(app_web),
              "passed": passed, "total": len(cases), "cases": cases}
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{passed}/{len(cases)} passed  report: {report_path}")
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    sys.exit(main())
