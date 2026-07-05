#!/usr/bin/env python3
"""Faucet running-state water-column pixel gate (WTJ-20260705-020, P0).

Background: Ethan reported the shipped faucet's running-state water column reads as
a "thin water line" (细小水线) that doesn't match the outlet's visual scale. TL's
dispatch card for this P0 explicitly forbids treating the WTJ-20260704-023 visual
QA pass ("faucet 水柱与出水口匹配...已解决") as clearance — that pass predates this
fresh complaint and only inspected contact sheets / preview GIFs, never a real
running app frame. This script is the durable regression lock: it drives the REAL
app.web/index.html in WebKit, forces the click-faucet-on task into its 'running'
animation state via a real trusted mouse click (not a stubbed engine call), and
reads the ACTUAL <canvas> backing-store pixels (getImageData) to measure the water
column's bounding-box width against the outlet ring's width — the same ratio TL's
card asked to be quantified across three tiers (docs source frames / downsampled
runtime sheet / live rendered canvas). This file covers the third tier; the other
two are one-off measurements recorded in the WTJ-20260705-020 handoff notes (they
are static-asset facts, not something that needs a repeatable script — this file's
job is to catch a *runtime* regression: wrong sheet wired up, wrong cell/frame
index math, wrong canvas scaling, or the source asset silently getting swapped for
a thinner one on a future rebuild).

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

# Reasonable-thickness gate: the reworked docs source (WTJ-20260705-005) and the
# downsampled runtime sheet both measure the running-state water column at ~65-69%
# of the outlet ring's width (136/204px @1024 source-frame scale, 35/52px @256
# runtime-cell scale — see this card's handoff notes for the full three-tier
# measurement). A genuine "thin water line" regression (the exact defect this test
# exists to catch) would produce a ratio well under half that. 0.45 sits safely
# below the healthy ~0.67 measurement (comfortable margin for anti-aliasing/rounding
# noise across engines) while still failing hard on anything that reads as "a thin
# line, not a voluminous column."
MIN_WATER_TO_OUTLET_RATIO = 0.45

# Absolute floor in the 256px-cell backing store: guards the degenerate case where
# both numerator and denominator shrink together (e.g. the whole prop silently
# rendered at a fraction of cellSize) and would otherwise still clear the ratio gate.
MIN_WATER_WIDTH_PX = 15

OUTLET_ROW_OFFSET = -15  # rows above the anchor row: clean flat ring band.
WATER_ROW_OFFSET = 15    # rows below the anchor row: clean flat water-column band.
ROW_BAND_HALF_HEIGHT = 4  # sample a small band and average, to damp AA noise.


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
        if task_info and task_info.get("taskId") == "click-faucet-on":
            break
        page.evaluate("() => window.WTJ_TASK.dismiss('manual')")
        page.wait_for_timeout(30)

    if not task_info or task_info.get("taskId") != "click-faucet-on":
        browser.close()
        return None, console_errors, "never reached click-faucet-on task after 30 question-clicks"

    # Real trusted click at the canvas's live DOM rect center -- forces idle 'off'
    # -> active 'running' exactly the way a child's tap would (see PROP_ANIM_STATE_MAP
    # in task-templates.js). We measure while the canvas is still on-screen inside its
    # COMPLETE_VISUAL_HOLD_MS (800ms) window, well before removal.
    rect = page.evaluate("""() => {
        var root = document.querySelector('.wtj-tt-root');
        var canvas = root.querySelector('canvas[data-wtj-anim-prop="faucet"]');
        var r = canvas.getBoundingClientRect();
        return {x: r.left, y: r.top, w: r.width, h: r.height};
    }""")
    page.mouse.click(rect["x"] + rect["w"] / 2, rect["y"] + rect["h"] / 2)
    page.wait_for_timeout(150)  # a few animation ticks into 'running', well inside the hold window

    measurement = page.evaluate(MEASURE_JS, {
        "outlet": OUTLET_ROW_OFFSET,
        "water": WATER_ROW_OFFSET,
        "halfHeight": ROW_BAND_HALF_HEIGHT,
    })
    browser.close()
    return measurement, console_errors, None


def run_suite(pw, app_web: Path, engine: str, port: int):
    httpd = serve(app_web, port)
    url = f"http://127.0.0.1:{port}/index.html"
    cases: dict[str, dict] = {}

    def check(cid, ok, detail):
        cases[cid] = {"pass": bool(ok), "detail": detail}
        print(f"{'PASS' if ok else 'FAIL'} {cid}  {detail}")

    try:
        measurement, console_errors, infra_err = drive_and_measure(pw, engine, url)

        check("FAUCET-RATIO-no-console-errors", not console_errors,
              f"console/page errors: {console_errors[:5]}")
        check("FAUCET-RATIO-reached-click-faucet-on-task", infra_err is None,
              infra_err or "reached click-faucet-on and clicked it")

        if measurement is None or "error" in measurement:
            check("FAUCET-RATIO-measured-canvas-pixels", False,
                  (measurement or {}).get("error", "no measurement (task never reached)"))
            check("FAUCET-RATIO-water-to-outlet-ratio-gate", False, "skipped: no measurement")
            check("FAUCET-RATIO-water-absolute-width-gate", False, "skipped: no measurement")
        else:
            outlet_w = measurement["outletWidth"]
            water_w = measurement["waterWidth"]
            ratio = (water_w / outlet_w) if outlet_w > 0 else 0.0
            check("FAUCET-RATIO-measured-canvas-pixels", outlet_w > 0,
                  f"cellSize={measurement['cellSize']} anchorYPx={measurement['anchorYPx']} "
                  f"outletRow={measurement['outletRow']} waterRow={measurement['waterRow']} "
                  f"outletWidth={outlet_w:.1f}px waterWidth={water_w:.1f}px ratio={ratio:.3f}")
            check("FAUCET-RATIO-water-to-outlet-ratio-gate", ratio >= MIN_WATER_TO_OUTLET_RATIO,
                  f"ratio={ratio:.3f} (water={water_w:.1f}px / outlet={outlet_w:.1f}px), "
                  f"gate>={MIN_WATER_TO_OUTLET_RATIO} -- below this reads as a thin line, not a "
                  f"voluminous column matching the outlet's scale")
            check("FAUCET-RATIO-water-absolute-width-gate", water_w >= MIN_WATER_WIDTH_PX,
                  f"waterWidth={water_w:.1f}px, gate>={MIN_WATER_WIDTH_PX}px "
                  f"(guards against both dimensions shrinking together while ratio still passes)")
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
