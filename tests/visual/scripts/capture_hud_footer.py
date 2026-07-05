#!/usr/bin/env python3
"""Before/after screenshot capture for the HUD footer/terminal/chest visual
integration (WTJ-20260705-019).

Purpose: this card's job is to bring the PM-accepted footer/terminal visual
design (docs/design/wtj-20260705-011-terminal-prompt-decoration-spec.md +
docs/assets/style/wtj-082) from "design asset only" into the actual runtime
(app/web/index.html), and prove it with screenshots — not just unit-test
assertions on CSS text. This script renders the REAL index.html with
Playwright (WebKit by default, same engine family as the native shell's
WKWebView) and captures a fixed sequence of states so a reviewer can diff
before/after byte images side by side, not just trust a diff of CSS source.

States captured (same sequence for before/after so the diff is meaningful):
  01-first-screen   : cold load, default state (3 empty slots, chest disabled,
                       terminal idle) — this is what most children see most of
                       the time, and where the "footer is a tiny pill in the
                       middle" regression would be most visible.
  02-slots-partial  : one filled slot + one milestone slot (dog sticker +
                       keyboard-star medallion), chest still disabled — shows
                       slot state contrast (empty/filled/milestone) inside the
                       footer.
  03-chest-active   : all slots filled, chest indicator flips to Active
                       (footer right lane) — proves the persistent chest
                       indicator lives at the footer's right edge, not center.
  04-chest-open-pop : reward-chest.js's one-time big "open" sequence mid-flight
                       (WTJ-20260705-001 req4: opens beside the footer/slots,
                       not dead-center over the canvas where letters/props
                       pop up).

Run:
  python3 tests/visual/scripts/capture_hud_footer.py --out-dir DIR [--engine webkit|chromium]

Exit: 0 on success, 1 if index.html fails to load / a required global is
missing (WTJ_HUD not exposed, etc — treated as a hard capture failure, not a
silent partial screenshot set).
"""
from __future__ import annotations

import argparse
import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_APP_WEB = REPO_ROOT / "app" / "web"

FREEZE_CSS = """
* , *::before, *::after {
  animation-play-state: paused !important;
  transition: none !important;
}
"""


def serve(app_web: Path, port: int):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(app_web))
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    httpd.RequestHandlerClass.log_message = lambda *a, **k: None
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-web", default=str(DEFAULT_APP_WEB))
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--engine", default="webkit", choices=["webkit", "chromium"])
    parser.add_argument("--port", type=int, default=8935)
    args = parser.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed; pip install playwright && playwright install", file=sys.stderr)
        return 1

    app_web = Path(args.app_web).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    httpd = serve(app_web, args.port)
    try:
        with sync_playwright() as p:
            engine = getattr(p, args.engine)
            browser = engine.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))

            page.goto(f"http://127.0.0.1:{args.port}/index.html")
            page.wait_for_timeout(500)

            if not page.evaluate("() => !!window.WTJ_HUD"):
                print("HARD FAIL: window.WTJ_HUD not present after load", file=sys.stderr)
                browser.close()
                return 1

            page.add_style_tag(content=FREEZE_CSS)

            # 01: cold default first screen.
            page.screenshot(path=str(out_dir / "01-first-screen.png"))

            # 02: one filled slot (sprite) + one milestone slot.
            page.evaluate(
                "() => { window.WTJ_HUD.setSlot(0, { spriteUrl: 'assets/sprites/dog.png' }); "
                "window.WTJ_HUD.setSlot(1, { milestone: true }); }"
            )
            page.wait_for_timeout(200)
            page.screenshot(path=str(out_dir / "02-slots-partial.png"))

            # 03: all slots filled -> chest indicator flips to Active.
            page.evaluate("() => { window.WTJ_HUD.setSlot(2, { spriteUrl: 'assets/sprites/cat.png' }); }")
            page.wait_for_timeout(200)
            page.screenshot(path=str(out_dir / "03-chest-active.png"))

            # 04: drive reward-chest.js's real one-time open sequence through the actual
            # WTJ_SLOTS.fillSlot() -> onFull -> reward-chest.js chain (the same path the app
            # itself uses when a child fills the last slot), not a hand-rolled mock state.
            # manifest.slots.sources allows 'secret-word' / 'keyboard-milestone'; itemKey just
            # needs to be distinct per call so findDuplicateIndex() doesn't dedupe them away.
            has_slots = page.evaluate("() => !!window.WTJ_SLOTS")
            if has_slots:
                page.evaluate(
                    "() => { window.WTJ_SLOTS.fillSlot('secret-word', { itemKey: 'cap-dog', "
                    "renderState: { spriteUrl: 'assets/sprites/dog.png' } });"
                    " window.WTJ_SLOTS.fillSlot('secret-word', { itemKey: 'cap-cat', "
                    "renderState: { spriteUrl: 'assets/sprites/cat.png' } }); }"
                )
                page.wait_for_timeout(150)
                # Third fill is the one that crosses the full threshold and fires onFull(),
                # which reward-chest.js is subscribed to at load time -> starts its ~2.6s pop.
                page.evaluate(
                    "() => { window.WTJ_SLOTS.fillSlot('secret-word', { itemKey: 'cap-star', "
                    "renderState: { spriteUrl: 'assets/sprites/star.png' } }); }"
                )
                # Sample mid-animation (pop keyframe settles well before the ~2.6s forwards
                # animation + later fade), matching the timing other e2e specs in this repo use.
                page.wait_for_timeout(700)
            page.screenshot(path=str(out_dir / "04-chest-open-pop.png"))

            if errors:
                print("HARD FAIL: pageerror occurred: " + " | ".join(errors), file=sys.stderr)
                browser.close()
                return 1

            browser.close()
    finally:
        httpd.shutdown()

    print("OK: screenshots written to " + str(out_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
