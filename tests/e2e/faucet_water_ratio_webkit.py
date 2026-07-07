#!/usr/bin/env python3
"""Faucet running-state water-column pixel gate (WTJ-20260705-020, P0) +
WTJ-20260706-009 close-semantics regression lock.

Background: Ethan reported the shipped faucet's running-state water column reads as
a "thin water line" (细小水线) that doesn't match the outlet's visual scale. TL's
dispatch card for this P0 explicitly forbids treating the WTJ-20260704-023 visual
QA pass ("faucet 水柱与出水口匹配...已解决") as clearance — that pass predates this
fresh complaint and only inspected contact sheets / preview GIFs, never a real
running app frame. This script is the durable regression lock: it drives the REAL
app.web/index.html in WebKit, and reads the ACTUAL <canvas> backing-store pixels
(getImageData) to measure the water column's bounding-box width against the outlet
ring's width — the same ratio TL's card asked to be quantified across three tiers
(docs source frames / downsampled runtime sheet / live rendered canvas). This file
covers the third tier; the other two are one-off measurements recorded in the
WTJ-20260705-020 handoff notes (they are static-asset facts, not something that
needs a repeatable script — this file's job is to catch a *runtime* regression:
wrong sheet wired up, wrong cell/frame index math, wrong canvas scaling, or the
source asset silently getting swapped for a thinner one on a future rebuild).

WTJ-20260706-009 update (task semantics flip): the task previously started in a
static 'off' (no water) idle state and only showed the 'running' water column
*after* a click (idle='off'/active='running', i.e. click = "turn the water on").
Ethan's product call flips this: the task must now start showing water RUNNING
(idle='running') and a click must CLOSE it (active='closing', clamping on the
already-existing "关水" closing sequence DESIGN produced back with card 026 but
that was never wired up). Two consequences for this file:
  1. The water-column ratio gate below no longer needs a forced click to reach
     the 'running' state — it's the idle state now, visible the moment the task
     spawns. The driving code was simplified accordingly (no more "force idle ->
     active via a trusted click" step for this first measurement).
  2. A second, new gate was added: after a real trusted click, the water column
     must have visually disappeared (the 'closing' animation clamps on its last,
     no-water frame) — this is the pixel-level proof that criterion 1 of card 009
     ("点击后表现为关水/停止流水") actually holds at runtime, not just in the
     idle/active state names.

Why these specific sample rows (in the 256px-cell canvas backing-store space):
the faucet body is a fixed layer shared by every state (off/running/closing/closed
all draw the identical metal geometry; only the water overlay differs — see
docs/assets/production-animations-v1/faucet/README.md "自检" section and this
prop's `body_stability` field in the source manifest). The engine exposes the
state's normalized anchor point via window.WTJ_ANIM_MANIFEST.faucet.<state>.anchor
(currently [0.5, 0.78] for every faucet state) — anchor[1] * cellSize lands right at
the outlet lip in the source 1024 canvas (outlet_anchor_px [318,760], 760/1024 =
0.742, close enough to 0.78 that the ring sits squarely in a +/-20px band around
that row at every supported cellSize). Empirically (this file's own measurement,
re-derivable any time the asset is regenerated): the metal outlet ring presents a
clean, flat, single-run width a little *above* the anchor row, and the water
column (when present) presents a clean, flat, single-run width a little *below*
it — both bands avoid the ring's own curved top/bottom taper, which would
otherwise pollute either measurement. See OUTLET_ROW_OFFSET/WATER_ROW_OFFSET below.

Run:  python3 tests/e2e/faucet_water_ratio_webkit.py [--app-web DIR] [--engine webkit|chromium] [--port N]
Exit: 0 pass (ratio + absolute width both clear the gate) · 1 gate failed · 2 infra error.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import socketserver
import sys
import threading
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_APP_WEB = REPO_ROOT / "app" / "web"
DEFAULT_REPORT = REPO_ROOT / "tests" / "reports" / "faucet_water_ratio_webkit_report.json"

# Reasonable-thickness gate: after WTJ-20260705-020 swapped in the thicker-water
# runtime sheet (DESIGN scale_x 1.48 — running-state source water column widened to
# 212-226px @~1024 source-frame scale, up from the ~147-157px "thin line" Ethan
# rejected), the live 256px-cell canvas measures the running water column at ~0.70 of
# the outlet ring's width (water 36px / outlet 51px — this file's own before/after
# measurement; the old rejected sheet measured 34/51 = 0.662, the new one 36/51 =
# 0.703; see WTJ-020 handoff). A genuine "thin water line" regression (the defect
# this test exists to catch — a silent swap back to a truly thin pre-005 line, or
# wrong cell/frame index math / canvas scaling) would produce a ratio well under half
# that. 0.45 sits safely below the healthy ~0.70 measurement (comfortable margin for
# anti-aliasing/rounding noise across engines) while still failing hard on anything
# that reads as "a thin line, not a voluminous column."
# NOTE: 0.45 is deliberately a LOOSE floor. It is intentionally NOT tightened to e.g.
# 0.68 to distinguish the old-rejected 0.662 from the new-accepted 0.703 — that 0.02
# gap is within cross-engine AA/rounding noise and such a floor would flake. Whether
# the new water reads as "thick enough" vs the old is a subjective DESIGN/Ethan call
# (see dist-stage/020-faucet/before-after-runtime-256.png + after-live-running.png),
# not this runtime regression lock's job.
MIN_WATER_TO_OUTLET_RATIO = 0.45

# Absolute floor in the 256px-cell backing store: guards the degenerate case where
# both numerator and denominator shrink together (e.g. the whole prop silently
# rendered at a fraction of cellSize) and would otherwise still clear the ratio gate.
# WTJ-20260706-009 also reuses this same constant as an UPPER bound after a click
# closes the faucet (see MAX_CLOSED_WATER_WIDTH_PX below) — "at least this wide when
# running" / "less than this wide once closed" are two ends of the same yardstick.
MIN_WATER_WIDTH_PX = 15
MAX_CLOSED_WATER_WIDTH_PX = MIN_WATER_WIDTH_PX

OUTLET_ROW_OFFSET = -15  # rows above the anchor row: clean flat ring band.
WATER_ROW_OFFSET = 15    # rows below the anchor row: clean flat water-column band.
ROW_BAND_HALF_HEIGHT = 4  # sample a small band and average, to damp AA noise.

# WTJ-20260706-009: anim-manifest.js faucet.closing is frameCount=6/fps=8 -> a full,
# non-looping play-through is 750ms (see getDuration() semantics in frame-anim.js).
# Wait past that before taking the "closed" measurement so we sample the clamped
# final frame, not a mid-transition frame -- but task-templates.js's
# computeVisualHoldMs() also *removes* the completed task's DOM (canvas included)
# at Math.max(800, duration + COMPLETE_VISUAL_HOLD_BUFFER_MS(150)) = 900ms after
# completion, so this measurement has to land inside the (750, 900) window: late
# enough that closing has actually clamped on its no-water last frame, early enough
# that scheduleElementsRemoval() hasn't torn the canvas out of the DOM yet. 800ms
# (closing's 750ms + 50ms) leaves ~100ms of margin on both sides.
CLOSING_ANIM_DURATION_MS = 750
POST_CLICK_SETTLE_MS = CLOSING_ANIM_DURATION_MS + 50


class _ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def serve(app_web: Path, port: int):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(app_web))
    httpd = _ReusableTCPServer(("127.0.0.1", port), handler)
    httpd.RequestHandlerClass.log_message = lambda *a, **k: None
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


MEASURE_JS = """(rowOffsets) => {
    var root = document.querySelector('.wtj-tt-root');
    var canvas = root ? root.querySelector('canvas[data-wtj-anim-prop="faucet"]') : null;
    if (!canvas) return {error: 'no faucet canvas found'};
    var cfg = (window.WTJ_ANIM_MANIFEST && window.WTJ_ANIM_MANIFEST.faucet && window.WTJ_ANIM_MANIFEST.faucet.running) || null;
    if (!cfg) return {error: 'no faucet.running anim-manifest entry'};
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var data = ctx.getImageData(0, 0, w, h).data;
    function alphaAt(x, y) { return data[(y * w + x) * 4 + 3]; }
    function widestRunAt(y, thresh) {
        var best = 0, curStart = null;
        for (var x = 0; x < w; x++) {
            var a = alphaAt(x, y);
            if (a > thresh && curStart === null) { curStart = x; }
            else if (a <= thresh && curStart !== null) {
                best = Math.max(best, x - curStart);
                curStart = null;
            }
        }
        if (curStart !== null) best = Math.max(best, w - curStart);
        return best;
    }
    function bandAvgWidth(centerY, halfHeight, thresh) {
        var total = 0, n = 0;
        for (var y = Math.max(0, centerY - halfHeight); y <= Math.min(h - 1, centerY + halfHeight); y++) {
            total += widestRunAt(y, thresh);
            n++;
        }
        return n > 0 ? total / n : 0;
    }
    var anchorYFrac = cfg.anchor[1];
    var anchorYPx = Math.round(anchorYFrac * canvas.height);
    var outletRow = anchorYPx + rowOffsets.outlet;
    var waterRow = anchorYPx + rowOffsets.water;
    return {
        cellSize: canvas.width,
        anchorYPx: anchorYPx,
        outletRow: outletRow,
        waterRow: waterRow,
        outletWidth: bandAvgWidth(outletRow, rowOffsets.halfHeight, 20),
        waterWidth: bandAvgWidth(waterRow, rowOffsets.halfHeight, 20)
    };
}"""


def drive_and_measure(pw, engine, url):
    bt = getattr(pw, engine)
    launch_args = ["--autoplay-policy=no-user-gesture-required"] if engine == "chromium" else []
    browser = bt.launch(args=launch_args)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))
    page.goto(url, wait_until="load")
    page.wait_for_timeout(300)

    task_info = None
    for _ in range(30):
        page.click(".wtj-hud-question")
        page.wait_for_timeout(150)
        task_info = page.evaluate("() => window.WTJ_TASK_TEMPLATES.getActiveTaskInfo()")
        if task_info and task_info.get("taskId") == "click-faucet-off":
            break
        page.evaluate("() => window.WTJ_TASK.dismiss('manual')")
        page.wait_for_timeout(30)

    if not task_info or task_info.get("taskId") != "click-faucet-off":
        browser.close()
        return None, None, console_errors, "never reached click-faucet-off task after 30 question-clicks"

    # WTJ-20260706-009: idle IS 'running' now (no click needed to see water) — the
    # task just rendered, give frame-anim a couple of ticks to actually paint before
    # the first (idle, running-water) measurement.
    page.wait_for_timeout(150)
    idle_measurement = page.evaluate(MEASURE_JS, {
        "outlet": OUTLET_ROW_OFFSET,
        "water": WATER_ROW_OFFSET,
        "halfHeight": ROW_BAND_HALF_HEIGHT,
    })

    # Real trusted click at the canvas's live DOM rect center -- forces idle 'running'
    # -> active 'closing' exactly the way a child's tap would (see PROP_ANIM_STATE_MAP
    # in task-templates.js). Wait past the full non-looping closing animation so the
    # canvas has clamped onto its final, no-water frame before the second measurement.
    rect = page.evaluate("""() => {
        var root = document.querySelector('.wtj-tt-root');
        var canvas = root.querySelector('canvas[data-wtj-anim-prop="faucet"]');
        var r = canvas.getBoundingClientRect();
        return {x: r.left, y: r.top, w: r.width, h: r.height};
    }""")
    page.mouse.click(rect["x"] + rect["w"] / 2, rect["y"] + rect["h"] / 2)
    page.wait_for_timeout(POST_CLICK_SETTLE_MS)

    closed_measurement = page.evaluate(MEASURE_JS, {
        "outlet": OUTLET_ROW_OFFSET,
        "water": WATER_ROW_OFFSET,
        "halfHeight": ROW_BAND_HALF_HEIGHT,
    })
    browser.close()
    return idle_measurement, closed_measurement, console_errors, None


def run_suite(pw, app_web: Path, engine: str, port: int):
    httpd = serve(app_web, port)
    url = f"http://127.0.0.1:{port}/index.html"
    cases: dict[str, dict] = {}

    def check(cid, ok, detail):
        cases[cid] = {"pass": bool(ok), "detail": detail}
        print(f"{'PASS' if ok else 'FAIL'} {cid}  {detail}")

    try:
        idle_measurement, closed_measurement, console_errors, infra_err = drive_and_measure(pw, engine, url)

        check("FAUCET-RATIO-no-console-errors", not console_errors,
              f"console/page errors: {console_errors[:5]}")
        check("FAUCET-RATIO-reached-click-faucet-off-task", infra_err is None,
              infra_err or "reached click-faucet-off (idle already shows running water)")

        if idle_measurement is None or "error" in idle_measurement:
            check("FAUCET-RATIO-measured-canvas-pixels", False,
                  (idle_measurement or {}).get("error", "no measurement (task never reached)"))
            check("FAUCET-RATIO-water-to-outlet-ratio-gate", False, "skipped: no measurement")
            check("FAUCET-RATIO-water-absolute-width-gate", False, "skipped: no measurement")
            check("FAUCET-CLOSE-water-disappears-after-click", False, "skipped: no measurement")
        else:
            outlet_w = idle_measurement["outletWidth"]
            water_w = idle_measurement["waterWidth"]
            ratio = (water_w / outlet_w) if outlet_w > 0 else 0.0
            check("FAUCET-RATIO-measured-canvas-pixels", outlet_w > 0,
                  f"cellSize={idle_measurement['cellSize']} anchorYPx={idle_measurement['anchorYPx']} "
                  f"outletRow={idle_measurement['outletRow']} waterRow={idle_measurement['waterRow']} "
                  f"outletWidth={outlet_w:.1f}px waterWidth={water_w:.1f}px ratio={ratio:.3f}")
            check("FAUCET-RATIO-water-to-outlet-ratio-gate", ratio >= MIN_WATER_TO_OUTLET_RATIO,
                  f"ratio={ratio:.3f} (water={water_w:.1f}px / outlet={outlet_w:.1f}px), "
                  f"gate>={MIN_WATER_TO_OUTLET_RATIO} -- below this reads as a thin line, not a "
                  f"voluminous column matching the outlet's scale")
            check("FAUCET-RATIO-water-absolute-width-gate", water_w >= MIN_WATER_WIDTH_PX,
                  f"waterWidth={water_w:.1f}px, gate>={MIN_WATER_WIDTH_PX}px "
                  f"(guards against both dimensions shrinking together while ratio still passes)")

            if closed_measurement is None or "error" in closed_measurement:
                check("FAUCET-CLOSE-water-disappears-after-click", False,
                      (closed_measurement or {}).get("error", "no post-click measurement"))
            else:
                closed_water_w = closed_measurement["waterWidth"]
                check("FAUCET-CLOSE-water-disappears-after-click", closed_water_w < MAX_CLOSED_WATER_WIDTH_PX,
                      f"WTJ-20260706-009: post-click (after the 'closing' animation clamps on its final "
                      f"frame) waterWidth={closed_water_w:.1f}px, gate<{MAX_CLOSED_WATER_WIDTH_PX}px -- "
                      f"proves the task's click result is genuinely 'water off', not a residual stream "
                      f"(idle-state waterWidth was {water_w:.1f}px for comparison)")
    finally:
        httpd.shutdown()

    return cases


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--app-web", default=str(DEFAULT_APP_WEB))
    ap.add_argument("--engine", default="webkit", choices=["webkit", "chromium"])
    ap.add_argument("--port", type=int, default=8978)
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
