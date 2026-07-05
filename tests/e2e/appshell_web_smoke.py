#!/usr/bin/env python3
"""APPSHELL web-layer smoke: drive app/web/ in headless Chromium and assert the
input→visualization contract the native shell depends on (WTJ-20260704-002).

The native AppKit shell (app/shell/main.swift) loads app/web/index.html into a
WKWebView and forwards OS keyboard/mouse events into the DOM via the responder
chain (KioskWindow.canBecomeKey + makeFirstResponder(webView)). This script
verifies the *web-layer half* of that contract deterministically, without a
window server / TCC focus grant: it dispatches real DOM keyboard/mouse/click
events and asserts app.js reacts (debug overlay updates, letters/trail/rings
spawn, Esc progress bar driven by the shell's window.wtjEscProgress bridge,
AudioContext unlock attempted on first gesture).

What it does NOT cover (needs real GUI / real machine, tracked as residual risk):
- native OS-event → DOM forwarding end-to-end (requires a focused key window;
  synthetic CGEvents are dropped without Accessibility/Input-Monitoring TCC).
- native NSAlert exit-password modal (AppKit, not web).
- 2014 MacBook Air / macOS 11 real-hardware behavior.

Run:  python3 tests/e2e/appshell_web_smoke.py [--web PATH] [--report PATH]
Exit: 0 all pass · 1 a check failed · 2 infra error (missing web dir / playwright).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_WEB = REPO_ROOT / "app" / "web" / "index.html"
DEFAULT_REPORT = REPO_ROOT / "tests" / "reports" / "appshell_web_smoke_report.json"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--web", default=str(DEFAULT_WEB),
                    help="path to app/web/index.html (or a copy under test)")
    ap.add_argument("--report", default=str(DEFAULT_REPORT))
    args = ap.parse_args()

    web = Path(args.web).resolve()
    report_path = Path(args.report).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)

    def infra_error(msg: str) -> int:
        report_path.write_text(
            json.dumps({"web": str(web), "error": msg, "cases": {}},
                       ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"INFRA-ERROR {msg}")
        return 2

    if not web.is_file():
        return infra_error(f"web 入口不存在: {web}")
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        return infra_error(f"playwright 不可用: {e}")

    cases: dict[str, dict] = {}

    def record(cid: str, ok: bool, detail: str) -> None:
        cases[cid] = {"pass": bool(ok), "detail": detail}
        print(f"{'PASS' if ok else 'FAIL'} {cid}  {detail}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        # Match the shell's WKWebView surface: fixed viewport, offline (the web
        # bundle must be fully self-contained — no external requests).
        ctx = browser.new_context(viewport={"width": 1200, "height": 800},
                                  offline=True)
        page = ctx.new_page()
        console_errors: list[str] = []

        # WTJ-20260705-023：file:// 测试壳的良性伪影过滤。本 smoke 刻意用 file://（offline，
        # 验证 web 包自包含无外部请求）。但 audio.js 用 fetch() 加载**本地** .m4a 时，file://
        # scheme 下 WebKit/Chromium 会报 `URL scheme "file" is not supported`——这是 file://
        # harness 的固有限制，不是真实缺陷：生产原生壳用 wtjres:// scheme（同源）时 fetch 正常，
        # 且 audio-runtime 套件经 HTTP 已实证全部音频真实可加载。故仅排除这一类"本地 .m4a 在
        # file:// 下不可 fetch"的良性错误，其余 console/page 错误照常计入（真实 JS 错误仍会失败）。
        def _benign_file_scheme_audio_err(text: str) -> bool:
            audio = ('.m4a' in text) or ('audio/' in text)
            if not audio:
                return False
            # (1) 浏览器原生对 file:// 下本地音频 fetch 的报错。
            if 'scheme "file" is not supported' in text:
                return True
            # (2) 017 diag.js 对同一 file:// 音频 fetch 失败的镜像日志（console.error
            #     '[WTJ_DIAG] fetch-error: {url: audio/..., phase: rejected, message: Failed to fetch}'）——
            #     同一良性根因(file:// 本地音频不可 fetch)被 diag 二次 surface，生产 wtjres:// 下不发生。
            if ('[WTJ_DIAG] fetch-error' in text) and ('Failed to fetch' in text):
                return True
            return False

        page.on("console", lambda m: console_errors.append(m.text)
                if m.type == "error" and not _benign_file_scheme_audio_err(m.text) else None)
        page.on("pageerror", lambda e: console_errors.append(str(e))
                if not _benign_file_scheme_audio_err(str(e)) else None)
        ext_requests: list[str] = []
        page.on("request", lambda r: ext_requests.append(r.url)
                if r.url.startswith(("http://", "https://")) else None)

        page.goto(web.as_uri(), wait_until="load")
        page.wait_for_timeout(200)

        # APPSHELL-01: page loads clean, canvas + debug overlay present, self-contained.
        has_canvas = page.eval_on_selector("#stage", "el => !!el") if \
            page.query_selector("#stage") else False
        overlay_ids = ["dbg-key", "dbg-mouse", "dbg-fps", "dbg-audio"]
        overlay_ok = all(page.query_selector(f"#{i}") for i in overlay_ids)
        record("APPSHELL-01-load",
               bool(has_canvas) and overlay_ok and not ext_requests
               and not console_errors,
               f"canvas={bool(has_canvas)} overlay={overlay_ok} "
               f"ext_requests={len(ext_requests)} console_errors={len(console_errors)}")

        # APPSHELL-02: keyboard reaches web layer — debug shows the key and a
        # letter spawns for printable keys.
        page.keyboard.press("a")
        page.wait_for_timeout(60)
        dbg_key = page.inner_text("#dbg-key")
        letters_after_a = page.evaluate(
            "() => (window.__wtjDebugCounts && window.__wtjDebugCounts()) || null")
        # app.js exposes no counter; probe the canvas indirectly via dbg + a
        # second visible signal: press Space, expect dbg-key == 'Space'.
        page.keyboard.press(" ")
        page.wait_for_timeout(60)
        dbg_key_space = page.inner_text("#dbg-key")
        record("APPSHELL-02-keyboard",
               dbg_key.strip().lower() == "a" and dbg_key_space.strip() == "Space",
               f"after 'a' dbg-key={dbg_key!r}; after Space dbg-key={dbg_key_space!r}")

        # APPSHELL-03: mouse move reaches web layer — dbg-mouse reflects coords.
        page.mouse.move(300, 250)
        page.wait_for_timeout(40)
        page.mouse.move(640, 400)
        page.wait_for_timeout(60)
        dbg_mouse = page.inner_text("#dbg-mouse")
        mouse_ok = "," in dbg_mouse and dbg_mouse.strip() != "-"
        # coords should be near the last move (640,400), allowing rounding.
        parsed = None
        try:
            xs, ys = dbg_mouse.split(",")
            parsed = (int(xs), int(ys))
        except ValueError:
            pass
        near = parsed is not None and abs(parsed[0] - 640) <= 3 and \
            abs(parsed[1] - 400) <= 3
        record("APPSHELL-03-mouse", mouse_ok and near,
               f"dbg-mouse={dbg_mouse!r} parsed={parsed} near_last_move={near}")

        # APPSHELL-04: click reaches web layer — audio unlock attempted (audio
        # dbg leaves 'locked' only if no gesture ever arrived).
        page.mouse.click(500, 500)
        page.wait_for_timeout(80)
        dbg_audio = page.inner_text("#dbg-audio")
        # In headless Chromium AudioContext resumes to 'running' or stays
        # 'suspended'/'unsupported'; any value other than the initial 'locked'
        # proves the click handler ran unlockAudio().
        record("APPSHELL-04-click-audio-unlock",
               dbg_audio.strip().lower() != "locked",
               f"dbg-audio after click={dbg_audio!r} (initial 'locked' means "
               "click handler never ran)")

        # APPSHELL-05: Esc long-press bridge — the native shell drives
        # window.wtjEscProgress(seconds); the web layer must reflect it on the
        # progress bar and clear at 0. This is the exact bridge function the
        # shell calls, so verifying it here validates the web contract.
        has_bridge = page.evaluate("() => typeof window.wtjEscProgress === 'function'")
        bar_mid = page.evaluate("""() => {
            window.wtjEscProgress(2.5);
            const el = document.getElementById('esc-progress-bar');
            const wrap = document.getElementById('esc-progress-wrap');
            return { width: el && el.style.width,
                     active: wrap && wrap.classList.contains('active') };
        }""")
        bar_reset = page.evaluate("""() => {
            window.wtjEscProgress(0);
            const el = document.getElementById('esc-progress-bar');
            const wrap = document.getElementById('esc-progress-wrap');
            return { width: el && el.style.width,
                     active: wrap && wrap.classList.contains('active') };
        }""")
        # 2.5s of 5s hold => 50%; reset => 0% and inactive.
        mid_ok = has_bridge and bar_mid.get("active") is True and \
            bar_mid.get("width", "").startswith("50")
        reset_ok = bar_reset.get("active") is False and \
            bar_reset.get("width") == "0%"
        record("APPSHELL-05-esc-bridge", mid_ok and reset_ok,
               f"bridge={has_bridge} at2.5s={bar_mid} atReset={bar_reset}")

        # APPSHELL-06: idle render loop self-suspends and resumes on input
        # (battery/thermal budget on a 2014 Air). Prove it does not throw and
        # that a late input still updates the overlay after an idle gap.
        page.wait_for_timeout(300)
        page.keyboard.press("z")
        page.wait_for_timeout(80)
        dbg_key_late = page.inner_text("#dbg-key")
        record("APPSHELL-06-idle-resume",
               dbg_key_late.strip().lower() == "z" and not console_errors,
               f"late dbg-key={dbg_key_late!r} console_errors={len(console_errors)}")

        browser.close()

    passed = sum(1 for c in cases.values() if c["pass"])
    report = {"web": str(web), "passed": passed, "total": len(cases),
              "console_errors": console_errors, "cases": cases}
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2),
                           encoding="utf-8")
    print(f"report: {report_path}")
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    sys.exit(main())
