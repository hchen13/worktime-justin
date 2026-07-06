#!/usr/bin/env python3
"""Audio runtime end-to-end playback regression (WTJ-20260704-076 / -077).

Verifies the shipped web layer ACTUALLY loads + decodes + schedules playback of the
production .m4a files through window.WTJ_AUDIO — i.e. that audio is wired (077) and
not silently falling back. Runs its own local HTTP server over app/web so that
audio.js's same-origin fetch() works exactly as it does under the native shell's
wtjres:// scheme (both are non-file:// same-origin; file:// blocks fetch, which is
why 019 added wtjres://). Headless Chromium with autoplay allowed unlocks the
AudioContext so decodeAudioData runs.

Cannot judge ACOUSTIC quality (does it sound right) — that needs a listen. This
asserts the load/decode/schedule contract per category and, critically, exercises
the REAL call form each engine uses (task.js passes taskDef.voicePrompt path string),
so an argument-type mismatch that silently drops audio is caught.

Run:  python3 tests/e2e/check_audio_runtime.py [--app-web DIR] [--port N]
Exit: 0 all sampled audio plays (non-silent) · 1 a category has silent failures · 2 infra.
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
DEFAULT_REPORT = REPO_ROOT / "tests" / "reports" / "audio_runtime_report.json"

WORDS = ["dog", "apple", "cat", "ball", "star", "zebra", "igloo", "queen"]
SFX = ["dog-bark", "cat-meow", "task-success", "chest-open", "water-splash", "bell-ring"]


class _ReusableTCPServer(socketserver.TCPServer):
    # SO_REUSEADDR so a recently-closed run's TIME_WAIT socket on this port doesn't block
    # a rebind (matches faucet_water_ratio_webkit.py / other e2e harnesses; fixes flaky
    # "Address already in use" when run_all cycles the http-server suites back-to-back).
    allow_reuse_address = True


def serve(app_web: Path, port: int):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(app_web))
    httpd = _ReusableTCPServer(("127.0.0.1", port), handler)
    httpd.RequestHandlerClass.log_message = lambda *a, **k: None  # quiet
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--app-web", default=str(DEFAULT_APP_WEB))
    ap.add_argument("--port", type=int, default=8971)
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
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
            pg = b.new_context().new_page()
            pg.goto(url, wait_until="load")
            pg.wait_for_timeout(300)
            res = pg.evaluate(
                """async (S) => {
              var api = window.WTJ_AUDIO;
              if (!api) return { error: 'WTJ_AUDIO undefined (audio.js not wired)' };
              await api.unlock();
              async function play(fn){ try { return await fn(); } catch(e){ return {ok:false,err:String(e)}; } }
              var out = { words: [], sfx: [], tasks: [] };
              for (var w of S.words) out.words.push([w, await play(function(){return api.playWord({word:w});})]);
              for (var s of S.sfx) out.sfx.push([s, await play(function(){return api.playSfx(s);})]);
              // task voices via the EXACT form task.js:279 uses: taskDef.voicePrompt (path string) OR the object
              var m = window.WTJ_MANIFEST, tpl = (m.tasks&&m.tasks.templates)||{}, defs=[];
              for (var k in tpl){ (tpl[k].examples||[]).forEach(function(e){ if(e.id) defs.push(e); }); }
              for (var d of defs){
                // WTJ-20260705-025：voicePrompt 为空=有意静音(door/bell/drag 新任务待 024/084
                // 补中文语音),与 task.js 一致——空 voicePrompt 时 task.js 直接跳过播放(不 fetch、
                // 不算 missing),测试也应跳过,不能拿"未交付的语音"当运行时缺陷。
                if (!(d && d.voicePrompt)) continue;
                var voiceArg = d.voicePrompt;  // mirrors task.js: 有 voicePrompt 就用路径字符串
                out.tasks.push([d.id, await play((function(v){return function(){return api.playTaskVoice(v);};})(voiceArg))]);
              }
              await new Promise(function(r){setTimeout(r,700);});
              out.cache = api.getCacheStats(); out.missing = api.getMissingReport();
              return out;
            }""",
                {"words": WORDS, "sfx": SFX},
            )
            b.close()
    finally:
        httpd.shutdown()

    if res.get("error"):
        print(f"FAIL {res['error']}")
        report_path.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
        return 1

    def summ(name, items):
        bad = [(k, r.get("reason") or r.get("path") or r.get("err")) for k, r in items
               if not (r.get("ok") and not r.get("silent"))]
        good = len(items) - len(bad)
        print(f"{name}: {good}/{len(items)} play ok (non-silent)")
        for k, why in bad:
            print(f"    FAIL {k}: {why}")
        return not bad

    ok = True
    ok &= summ("words", res["words"])
    ok &= summ("sfx", res["sfx"])
    ok &= summ("task-voice", res["tasks"])
    print(f"cache={res['cache']['size']} missing-report={len(res['missing'])}")
    report_path.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"report: {report_path}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
