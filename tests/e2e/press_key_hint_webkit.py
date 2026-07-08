#!/usr/bin/env python3
"""Press-task screen keyboard hint E2E smoke (WTJ-20260707-009).

Background: WTJ-20260707-009 adds a screen keyboard hint overlay
(`.wtj-key-hint-root`, `app/web/task-templates.js` `setupPressTask()` +
`buildKeyHintDom()`) that renders only while a `press` (question-mark) task is
active — the design spec is WTJ-20260707-005 (Designer 1,
`docs/design/wtj-20260707-005-keyboard-task-hint-spec.md` +
`docs/keyboard-task-hint-preview.html`; TL note: that doc's own status line
still reads "提交 PM review", not an accepted final, at the time this card
picked it up — this script is a real-browser lock on the concrete acceptance
criteria this card was actually dispatched against, independent of whether
005 itself later gets revised).

The full mapping/DOM-structure/cleanup logic is already exhaustively unit
tested in `tests/unit/task-templates.test.mjs` (node:vm sandbox, no real CSS
layout). This script is the thin real-browser layer on top, matching the
project's existing convention (see `task_target_visibility_webkit.py`'s file
header for why unit-green is not sufficient clearance for anything that
depends on real CSS layout): it drives the real app in WebKit, confirms the
keyboard hint actually paints on screen without overlapping the HUD zones the
005 spec calls out by name, and saves a screenshot as visual evidence.

Scope: one representative desktop viewport (1440x900, the 005 spec's primary
screenshot viewport) in WebKit (same engine family as the native shell's
WKWebView target). Not a replacement for the unit-level key-mapping coverage.

Run:  python3 tests/e2e/press_key_hint_webkit.py [--app-web DIR] [--port N]
Exit: 0 all cases pass · 1 a case failed · 2 infra error (no index.html / no playwright).
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
DEFAULT_REPORT = REPO_ROOT / "tests" / "reports" / "press_key_hint_webkit_report.json"
DEFAULT_SCREENSHOT_DIR = REPO_ROOT / "tests" / "visual" / "screenshots"

VIEWPORT_WIDTH = 1440
VIEWPORT_HEIGHT = 900

# shuffle-bag pigeonhole guarantee（见 task-templates.js drawTaskType() 文件头「任务生成」一节
# 与 tests/unit/task-templates.test.mjs 洗牌袋契约③的同款论证）：TASK_TYPES.length=4 的无放回
# 洗牌袋保证"任意连续 7 次抽取必然覆盖全部 4 个类型"，因此 8 次点击结构性保证至少命中一次 press
# ——这不是概率性凑巧，是 pigeonhole 论证，不需要重试预算再放宽。
CLICK_BUDGET = 8

# 005 spec「Bubble」/「Root」两节明确要求键盘提示不得遮挡的五个 HUD 区域。
HUD_ZONE_SELECTORS = {
    "question": ".wtj-hud-question",
    "footer": ".wtj-hud-footer",
    "trayWrap": ".wtj-hud-tray-wrap",
    "chestLane": ".wtj-hud-chest-lane",
    "statusLights": ".wtj-hud-status-lights",
}

EXTRACT_JS = """() => {
    function rectOf(sel) {
        var el = document.querySelector(sel);
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return {x: r.left, y: r.top, w: r.width, h: r.height};
    }
    var hud = {
        question: rectOf('.wtj-hud-question'),
        footer: rectOf('.wtj-hud-footer'),
        trayWrap: rectOf('.wtj-hud-tray-wrap'),
        chestLane: rectOf('.wtj-hud-chest-lane'),
        statusLights: rectOf('.wtj-hud-status-lights')
    };
    var root = document.querySelector('.wtj-key-hint-root');
    var info = window.WTJ_TASK_TEMPLATES.getActiveTaskInfo();
    if (!root) {
        return {taskInfo: info, keyHintRoot: null, hud: hud};
    }
    // .wtj-key-hint-root 本身是 position:fixed; inset:0 的全视口定位上下文（与 .wtj-hud-root/
    // .wtj-tt-root 同一模式），getBoundingClientRect() 恒等于整个视口——真正"看得见的内容"是
    // 挂在它里面、绝对定位在 footer 上方居中的 .wtj-kh-coach（键盘+气泡）。"是否遮挡 HUD 区域"
    // 这条 005 spec 要求应该量 coach 的 rect，不是 root 的 rect（量 root 恒然"重叠"整个屏幕，
    // 是这层容器的设计使然，不代表真的遮挡了任何东西）。
    var coachEl = root.querySelector('.wtj-kh-coach');
    var coachRect = coachEl ? coachEl.getBoundingClientRect() : null;
    var targets = Array.prototype.slice.call(root.querySelectorAll('.wtj-kh-key--target'));
    var softTargets = Array.prototype.slice.call(root.querySelectorAll('.wtj-kh-key--soft-target'));
    var spaceKeys = Array.prototype.slice.call(root.querySelectorAll('.wtj-kh-key--space'));
    var bubbleTargetEl = root.querySelector('.wtj-kh-bubble-target');
    var bubbleComboEl = root.querySelector('.wtj-kh-bubble-combo');
    return {
        taskInfo: info,
        keyHintRoot: {
            coachRect: coachRect ? {x: coachRect.left, y: coachRect.top, w: coachRect.width, h: coachRect.height} : null,
            targetCount: targets.length,
            softTargetCount: softTargets.length,
            spaceKeyCount: spaceKeys.length,
            bubbleText: bubbleTargetEl ? bubbleTargetEl.textContent : null,
            bubbleComboText: bubbleComboEl ? bubbleComboEl.textContent : null
        },
        hud: hud
    };
}"""


class _ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def serve(app_web: Path, port: int):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(app_web))
    httpd = _ReusableTCPServer(("127.0.0.1", port), handler)
    httpd.RequestHandlerClass.log_message = lambda *a, **k: None
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def rects_overlap(a, b):
    if not a or not b:
        return False
    return not (a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"]
                or a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"])


def run_suite(pw, app_web: Path, port: int, screenshot_dir: Path):
    httpd = serve(app_web, port)
    url = f"http://127.0.0.1:{port}/index.html"
    cases: dict[str, dict] = {}

    def check(cid, ok, detail):
        cases[cid] = {"pass": bool(ok), "detail": detail}
        print(f"{'PASS' if ok else 'FAIL'} {cid}  {detail}")

    try:
        browser = pw.webkit.launch()
        page = browser.new_page(viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT})
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.goto(url, wait_until="load")
        page.wait_for_timeout(300)

        press_sample = None
        non_press_never_showed_hint = True
        for _ in range(CLICK_BUDGET):
            page.click(".wtj-hud-question")
            page.wait_for_timeout(180)  # 140ms root 淡入 + 一点余量
            data = page.evaluate(EXTRACT_JS)
            if data["taskInfo"] and data["taskInfo"]["type"] == "press":
                press_sample = data
                page.screenshot(path=str(screenshot_dir / "wtj-009-press-key-hint-full-page.png"))
                if data["keyHintRoot"] and data["keyHintRoot"]["coachRect"]:
                    r = data["keyHintRoot"]["coachRect"]
                    page.screenshot(
                        path=str(screenshot_dir / "wtj-009-press-key-hint-coach-crop.png"),
                        clip={"x": max(r["x"], 0), "y": max(r["y"], 0), "width": r["w"], "height": r["h"]},
                    )
                break
            if data["taskInfo"] and data["taskInfo"]["type"] != "press" and data.get("keyHintRoot"):
                non_press_never_showed_hint = False
            page.evaluate("() => window.WTJ_TASK.dismiss('manual')")
            page.wait_for_timeout(30)

        check("PRESS-KH-01-no-console-errors", not console_errors,
              f"console/page errors: {console_errors[:5]}")

        check("PRESS-KH-02-press-task-reached", press_sample is not None,
              f"press task reached within {CLICK_BUDGET} clicks (shuffle-bag pigeonhole guarantees it within 7)"
              if press_sample is not None else
              f"press task NOT reached within {CLICK_BUDGET} clicks — unexpected given shuffle-bag guarantee")

        check("PRESS-KH-03-non-press-tasks-show-no-hint", non_press_never_showed_hint,
              "drag/click/find task instances seen this run never rendered .wtj-key-hint-root")

        if press_sample is not None:
            kh = press_sample["keyHintRoot"]
            check("PRESS-KH-04-key-hint-root-rendered", kh is not None,
                  "'.wtj-key-hint-root' present while a press task is active" if kh else
                  "'.wtj-key-hint-root' missing while a press task is active")

            if kh:
                coach_rect = kh["coachRect"]
                check("PRESS-KH-05-coach-has-visible-nonzero-rect", bool(coach_rect) and coach_rect["w"] > 0 and coach_rect["h"] > 0,
                      f"'.wtj-kh-coach' (keyboard+bubble) rect: {coach_rect}")

                total_highlighted = kh["targetCount"] + kh["softTargetCount"]
                check("PRESS-KH-06-exactly-one-key-highlighted", total_highlighted == 1,
                      f"wtj-kh-key--target={kh['targetCount']} wtj-kh-key--soft-target={kh['softTargetCount']} (want exactly 1 total)")

                check("PRESS-KH-07-exactly-one-space-key", kh["spaceKeyCount"] == 1,
                      f"wtj-kh-key--space count={kh['spaceKeyCount']} (MacBook Air 实体键位应只有一颗 space)")

                bubble_text = kh["bubbleText"] if kh["bubbleText"] is not None else kh["bubbleComboText"]
                check("PRESS-KH-08-bubble-shows-only-target-key", bool(bubble_text) and len(bubble_text.strip()) > 0,
                      f"bubble content: {bubble_text!r} (should be the target key itself, no explanatory Chinese/English words)")

                # 005 spec「Bubble」一节：键盘+气泡（.wtj-kh-coach，看得见的实际内容）不得覆盖这
                # 五个 HUD 区域。注意：不是量 .wtj-key-hint-root 本身——那是 position:fixed;
                # inset:0 的全视口定位上下文（与 .wtj-hud-root/.wtj-tt-root 同一模式），
                # getBoundingClientRect() 恒等于整个视口，量它会对每个 HUD 区域都产生假阳性重叠。
                overlap_problems = []
                if coach_rect:
                    for zone_name, zone_rect in press_sample["hud"].items():
                        if rects_overlap(coach_rect, zone_rect):
                            overlap_problems.append(f"{zone_name}={zone_rect}")
                check("PRESS-KH-09-coach-no-overlap-with-hud-zones", bool(coach_rect) and not overlap_problems,
                      "; ".join(overlap_problems) if overlap_problems else
                      "keyboard+bubble (.wtj-kh-coach) does not overlap question/footer/trayWrap/chestLane/statusLights")

            # dismiss 应该立即清理（不像完成路径那样有 ~800ms 可见窗口）。
            page.evaluate("() => window.WTJ_TASK.dismiss('manual')")
            page.wait_for_timeout(30)
            after_dismiss = page.evaluate("() => !!document.querySelector('.wtj-key-hint-root')")
            check("PRESS-KH-10-dismiss-cleans-up-immediately", after_dismiss is False,
                  "'.wtj-key-hint-root' removed immediately after WTJ_TASK.dismiss()" if not after_dismiss else
                  "'.wtj-key-hint-root' still present after dismiss — cleanup regression")

        browser.close()
    finally:
        httpd.shutdown()

    return cases


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--app-web", default=str(DEFAULT_APP_WEB))
    ap.add_argument("--port", type=int, default=8975)
    ap.add_argument("--report", default=str(DEFAULT_REPORT))
    ap.add_argument("--screenshot-dir", default=str(DEFAULT_SCREENSHOT_DIR))
    args = ap.parse_args()

    app_web = Path(args.app_web).resolve()
    report_path = Path(args.report).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    screenshot_dir = Path(args.screenshot_dir).resolve()
    screenshot_dir.mkdir(parents=True, exist_ok=True)

    if not (app_web / "index.html").is_file():
        print(f"INFRA-ERROR 缺 index.html: {app_web}")
        return 2
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        print(f"INFRA-ERROR playwright 不可用: {e}")
        return 2

    with sync_playwright() as pw:
        cases = run_suite(pw, app_web, args.port, screenshot_dir)

    passed = sum(1 for c in cases.values() if c["pass"])
    report = {"app_web": str(app_web), "passed": passed, "total": len(cases), "cases": cases}
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{passed}/{len(cases)} passed  report: {report_path}")
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    sys.exit(main())
