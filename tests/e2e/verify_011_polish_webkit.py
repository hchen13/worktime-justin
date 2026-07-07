#!/usr/bin/env python3
"""WTJ-20260707-011 acceptance-feedback polish visual verification (webkit).

Drives the real app/web in WebKit over localhost http (same-origin, matching
production wtjres:// fidelity — never file://) and captures screenshots +
computed-style assertions for the four Ethan feedback fixes:
  1. bottom discovery slots = 3 bare circles, no long-bar background
  3. justin@worktime terminal hint enlarged
  4. chest reward: footer static chest hidden while open animation plays
(fix 2 is audio-only, covered by unit tests/secretword-engine.test.mjs.)

Run: python3 tests/e2e/verify_011_polish_webkit.py [--app-web DIR] [--port N]
Exit: 0 pass · 1 assertion failed · 2 infra (no index.html / no playwright).
"""
from __future__ import annotations
import argparse, functools, http.server, socketserver, sys, threading, time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_APP_WEB = REPO_ROOT / "app" / "web"
SHOT_DIR = REPO_ROOT / "tests" / "visual" / "screenshots"
VW, VH = 1440, 900


def serve(app_web: Path, port: int):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(app_web))
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    httpd.allow_reuse_address = True
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--app-web", type=Path, default=DEFAULT_APP_WEB)
    ap.add_argument("--port", type=int, default=8123)
    args = ap.parse_args()
    idx = args.app_web / "index.html"
    if not idx.is_file():
        print(f"INFRA: no index.html at {idx}", file=sys.stderr)
        return 2
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:  # pragma: no cover
        print(f"INFRA: playwright unavailable: {e}", file=sys.stderr)
        return 2

    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    httpd = serve(args.app_web, args.port)
    url = f"http://127.0.0.1:{args.port}/index.html"
    failures = []
    try:
        with sync_playwright() as p:
            br = p.webkit.launch()
            pg = br.new_page(viewport={"width": VW, "height": VH}, device_scale_factor=2)
            pg.goto(url, wait_until="networkidle")
            pg.wait_for_timeout(600)

            # ---- fix#1: no long-bar node; 3 slot circles present & clustered ----
            info = pg.evaluate("""() => {
                const bar = document.querySelector('.wtj-hud-footer-bar');
                const wrap = document.querySelector('.wtj-hud-tray-wrap');
                const slots = Array.from(document.querySelectorAll('.wtj-hud-slot'));
                const rects = slots.map(s => s.getBoundingClientRect()).map(r => ({x:r.left+r.width/2, w:r.width}));
                const wrapR = wrap ? wrap.getBoundingClientRect() : null;
                // terminal (fix#3)
                const term = document.querySelector('.wtj-hud-terminal');
                const glyph = document.querySelector('.wtj-hud-terminal-glyph');
                const tr = term ? term.getBoundingClientRect() : null;
                const cs = term ? getComputedStyle(term) : null;
                const gcs = glyph ? getComputedStyle(glyph) : null;
                return {
                    hasBar: !!bar,
                    slotCount: slots.length,
                    slotCenters: rects.map(r=>Math.round(r.x)),
                    slotW: rects.length?Math.round(rects[0].w):0,
                    wrapW: wrapR?Math.round(wrapR.width):0,
                    termH: tr?Math.round(tr.height):0,
                    termFont: gcs?gcs.fontSize:null,
                    termOpacity: cs?cs.opacity:null,
                    termRight: tr?Math.round(tr.right):0,
                };
            }""")
            pg.screenshot(path=str(SHOT_DIR / "011-idle-slots-terminal.png"))

            if info["hasBar"]:
                failures.append("fix1: .wtj-hud-footer-bar long bar still present")
            if info["slotCount"] != 3:
                failures.append(f"fix1: expected 3 slot circles, got {info['slotCount']}")
            # clustered: max center-to-center gap should be tight (< ~130px at 1440)
            centers = info["slotCenters"]
            if len(centers) == 3:
                spread = centers[-1] - centers[0]
                if spread > 260:
                    failures.append(f"fix1: slots too spread (edge-to-edge {spread}px, want tight cluster)")
            if info["wrapW"] > 400:
                failures.append(f"fix1: generic wrap too wide ({info['wrapW']}px)")
            # fix#3
            if info["termH"] < 30:
                failures.append(f"fix3: terminal height not enlarged ({info['termH']}px, want >=~34)")
            if info["termFont"] and float(info["termFont"].replace("px","")) < 15:
                failures.append(f"fix3: terminal font not enlarged ({info['termFont']})")
            # no overlap: terminal right edge must be left of leftmost slot circle
            if centers and info["termRight"] >= (centers[0] - info["slotW"]/2):
                failures.append(f"fix3: terminal right {info['termRight']} overlaps slot cluster start {centers[0]}")

            # ---- fix#4: fill 3 slots -> chest open sequence; static chest hidden ----
            pg.evaluate("""() => {
                // fill all 3 slots via the real state machine to fire onFull -> reward-chest
                if (window.WTJ_SLOTS) {
                    WTJ_SLOTS.fillSlot('keyboard-milestone', {itemKey:100, renderState:{milestone:true}});
                    WTJ_SLOTS.fillSlot('keyboard-milestone', {itemKey:200, renderState:{milestone:true}});
                    WTJ_SLOTS.fillSlot('keyboard-milestone', {itemKey:300, renderState:{milestone:true}});
                }
            }""")
            pg.wait_for_timeout(500)  # mid-open sequence
            chest = pg.evaluate("""() => {
                const c = document.querySelector('.wtj-hud-chest');
                const cs = c ? getComputedStyle(c) : null;
                const rc = document.querySelector('.wtj-rc-chest, .wtj-rc-canvas');
                return {
                    hasChest: !!c,
                    isOpen: c ? c.classList.contains('is-open') : false,
                    chestVisibility: cs ? cs.visibility : null,
                    rewardAnimPresent: !!rc,
                };
            }""")
            pg.screenshot(path=str(SHOT_DIR / "011-chest-open-sequence.png"))

            if chest["isOpen"] and chest["chestVisibility"] != "hidden":
                failures.append(f"fix4: footer static chest not hidden during open (visibility={chest['chestVisibility']})")
            if not chest["isOpen"]:
                failures.append("fix4: chest never entered is-open after filling 3 slots (could not verify)")

            br.close()
            print("INFO idle:", info)
            print("INFO chest:", chest)
    finally:
        httpd.shutdown()

    if failures:
        print("FAIL WTJ-011 polish verification:")
        for f in failures:
            print("  -", f)
        return 1
    print("PASS WTJ-011 polish visual verification (fix#1 slots, fix#3 terminal, fix#4 chest)")
    print(f"screenshots -> {SHOT_DIR}/011-idle-slots-terminal.png , 011-chest-open-sequence.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
