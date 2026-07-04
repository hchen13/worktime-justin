#!/usr/bin/env python3
"""Real-pointer drag-task E2E — the coverage that the WTJ-080 P0 escaped (WTJ-085 asset).

Background: 080 was a P0 where drag tasks (apple->basket, dog->doghouse) never
completed — a default-draggable <img> let the engine (WKWebView/Safari, and in
fact Chromium too) start a NATIVE HTML5 drag on mousedown, which preempts the
mousemove/mouseup stream so pointer.js's onMouseUp never fires and onDrop never
completes. It escaped QA because every prior drag test drove the engine with
JS-synthesized events (dispatchEvent), which do NOT initiate native DnD, so the
whole suite was green while the shipped app was broken.

This test closes that gap: it drives the REAL app through Playwright's trusted
mouse input (which DOES initiate native drag, exactly like a real child's finger),
so it reproduces the P0 on unfixed code and passes only on the fix.

Default engine is WebKit (same engine family as the native shell's WKWebView, and
it validates the Safari-only -webkit-user-drag:none defense); --engine chromium
also reproduces the core native-drag preemption.

Scenario (one spawned drag task, two phases):
  A. drop-outside  -> drag object to empty canvas, release: expect NO completion,
                      object springs back (dropCancel reset), task still active.
  B. drop-on-target-> drag object onto its target, release: expect completion event
                      + task cleared. THIS is the P0 discriminator.

Run:  python3 tests/e2e/drag_task_webkit.py [--app-web DIR] [--engine webkit|chromium] [--port N]
Exit: 0 both phases pass · 1 a phase failed (drag broken) · 2 infra.
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
DEFAULT_REPORT = REPO_ROOT / "tests" / "reports" / "drag_task_webkit_report.json"


def serve(app_web: Path, port: int):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(app_web))
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    httpd.RequestHandlerClass.log_message = lambda *a, **k: None
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def center(page, selector):
    return page.eval_on_selector(
        selector,
        "el => { var r = el.getBoundingClientRect();"
        " return { x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height }; }",
    )


def drag(page, frm, to, steps=12):
    page.mouse.move(frm["x"], frm["y"])
    page.mouse.down()
    for i in range(1, steps + 1):
        page.mouse.move(frm["x"] + (to["x"] - frm["x"]) * i / steps,
                        frm["y"] + (to["y"] - frm["y"]) * i / steps, steps=1)
    page.mouse.up()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--app-web", default=str(DEFAULT_APP_WEB))
    ap.add_argument("--engine", default="webkit", choices=["webkit", "chromium"])
    ap.add_argument("--port", type=int, default=8973)
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
        print(f"INFRA-ERROR playwright: {e}")
        return 2
    try:
        httpd = serve(app_web, args.port)
    except OSError as e:
        print(f"INFRA-ERROR http server: {e}")
        return 2

    url = f"http://127.0.0.1:{args.port}/index.html"
    out = {"engine": args.engine, "app_web": str(app_web)}
    try:
        with sync_playwright() as pw:
            bt = getattr(pw, args.engine)
            launch_args = ["--autoplay-policy=no-user-gesture-required"] if args.engine == "chromium" else []
            b = bt.launch(args=launch_args)
            pg = b.new_context(viewport={"width": 1280, "height": 800}).new_page()
            perr = []
            pg.on("pageerror", lambda e: perr.append(str(e)))
            pg.goto(url, wait_until="load")
            pg.wait_for_timeout(400)

            # engines present?
            ready = pg.evaluate("() => !!(window.WTJ_TASK && window.WTJ_TASK_TEMPLATES && window.WTJ_POINTER)")
            if not ready:
                out["error"] = "engines not present (WTJ_TASK/TEMPLATES/POINTER)"
                print("FAIL", out["error"]); report_path.write_text(json.dumps(out, ensure_ascii=False, indent=2)); return 1

            # instrument: completion sink + native-drag counter + find question button
            pg.evaluate("""() => {
              window.__done = [];
              if (window.WTJ_TASK_TEMPLATES && WTJ_TASK_TEMPLATES.onTaskComplete)
                WTJ_TASK_TEMPLATES.onTaskComplete(function(e){ window.__done.push(e); });
              window.__dragstart = 0;
              window.addEventListener('dragstart', function(){ window.__dragstart++; }, true);
            }""")

            qbtn = pg.query_selector(".wtj-hud-question")
            if not qbtn:
                out["error"] = "question button .wtj-hud-question not found"
                print("FAIL", out["error"]); report_path.write_text(json.dumps(out, ensure_ascii=False, indent=2)); return 1
            qbtn.click()
            pg.wait_for_timeout(250)

            info = pg.evaluate("() => (window.WTJ_TASK_TEMPLATES.getActiveTaskInfo && WTJ_TASK_TEMPLATES.getActiveTaskInfo()) || null")
            out["spawned"] = info
            if not info or info.get("type") != "drag":
                out["error"] = f"expected a drag task on first question click, got {info}"
                print("FAIL", out["error"]); report_path.write_text(json.dumps(out, ensure_ascii=False, indent=2)); return 1

            obj_sel, tgt_sel = ".wtj-tt-drag-object", ".wtj-tt-drag-target"
            if not pg.query_selector(obj_sel) or not pg.query_selector(tgt_sel):
                out["error"] = "drag object/target element missing"
                print("FAIL", out["error"]); report_path.write_text(json.dumps(out, ensure_ascii=False, indent=2)); return 1

            obj0 = center(pg, obj_sel)
            tgt = center(pg, tgt_sel)

            # ---- Phase A: drop OUTSIDE (empty area far from target) ----
            empty = {"x": min(obj0["x"], tgt["x"]) * 0.5 + 20, "y": 60}  # top-left-ish empty band
            drag(pg, obj0, empty)
            pg.wait_for_timeout(300)
            a_done = len(pg.evaluate("() => window.__done"))
            a_active = pg.evaluate("() => (WTJ_TASK_TEMPLATES.getActiveTaskInfo()||{}).type || null")
            a_dragging = pg.evaluate("() => (WTJ_POINTER.getPointerState && WTJ_POINTER.getPointerState().dragging) || false")
            out["phaseA_dropOutside"] = {"completions": a_done, "activeType": a_active, "stuckDragging": a_dragging}
            phaseA_ok = (a_done == 0 and a_active == "drag" and a_dragging is False)

            # object should have sprung back near its initial preset (dropCancel reset)
            objA = center(pg, obj_sel) if pg.query_selector(obj_sel) else None
            out["phaseA_objReset"] = objA

            # ---- Phase B: drop ON target ----
            objB0 = objA or obj0
            tgt = center(pg, tgt_sel)  # re-read in case layout shifted
            drag(pg, objB0, tgt)
            pg.wait_for_timeout(400)
            b_done = len(pg.evaluate("() => window.__done"))
            b_active = pg.evaluate("() => (WTJ_TASK_TEMPLATES.getActiveTaskInfo()||{}).type || null")
            b_dragging = pg.evaluate("() => (WTJ_POINTER.getPointerState && WTJ_POINTER.getPointerState().dragging) || false")
            dragstart = pg.evaluate("() => window.__dragstart")
            out["phaseB_dropOnTarget"] = {"completions": b_done, "activeTypeAfter": b_active,
                                           "stuckDragging": b_dragging, "nativeDragStarts": dragstart}
            phaseB_ok = (b_done >= 1 and b_active is None and b_dragging is False)

            out["pageErrors"] = perr[:5]
            b.close()
    finally:
        httpd.shutdown()

    okA = out.get("phaseA_dropOutside") and (
        out["phaseA_dropOutside"]["completions"] == 0
        and out["phaseA_dropOutside"]["activeType"] == "drag"
        and out["phaseA_dropOutside"]["stuckDragging"] is False)
    b = out.get("phaseB_dropOnTarget") or {}
    okB = (b.get("completions", 0) >= 1 and b.get("activeTypeAfter") is None and b.get("stuckDragging") is False)

    print(f"engine={args.engine}")
    print(f"  spawned: {out.get('spawned')}")
    print(f"  phase A (drop outside): {out.get('phaseA_dropOutside')}  -> {'PASS' if okA else 'FAIL'}")
    print(f"  phase B (drop on target): {out.get('phaseB_dropOnTarget')}  -> {'PASS' if okB else 'FAIL'}")
    if b.get("nativeDragStarts", 0) > 0:
        print(f"  ⚠ native HTML5 drag started {b['nativeDragStarts']}x (080 defense not holding)")
    if out.get("pageErrors"):
        print(f"  pageErrors: {out['pageErrors']}")
    report_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"report: {report_path}")
    return 0 if (okA and okB) else 1


if __name__ == "__main__":
    sys.exit(main())
