#!/usr/bin/env python3
"""Consolidated QA regression runner (WTJ-20260704-024, acceptance criterion 2).

Runs every durable scriptable QA asset against a given app/web tree and reports a
single pass/fail roll-up. This is the "跑完可脚本化测试" half of final acceptance;
the 66-REQ coverage mapping and the release Go/No-Go verdict live in the 024
report (they also depend on the still-open animation-runtime / rework cards).

Suites run:
  - TL unit suite            node --test tests/unit/*.test.mjs      (module logic)
  - KBD/SECRET/SLOTS regr.   tests/e2e/kbd_secret_slots_regression.py
  - task/reward integration  tests/e2e/task_reward_integration.py
  - app/web input smoke      tests/e2e/appshell_web_smoke.py
  - sprite asset scan        tests/visual/scripts/check_sprite_assets.py
  - swift daily quota reset  tests/swift/run_daily_quota_reset_test.sh (WTJ-20260707-004)

The deprecated docs-QA suites (docqc_*) are intentionally excluded (WTJ-003
deprecated). Visual agentic passes (capture_docs / sprite montages / canvas
cleanliness) are not scriptable roll-ups and are reported in their own cases.

Run:  python3 tests/run_all.py [--app-web DIR] [--tests-root DIR]
Exit: 0 all suites passed · 1 a suite failed · 2 infra (a suite could not run).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_APP_WEB = REPO_ROOT / "app" / "web"
DEFAULT_TESTS = REPO_ROOT / "tests"
DEFAULT_REPORT = REPO_ROOT / "tests" / "reports" / "run_all_report.json"


def run(cmd: list[str], cwd: Path, timeout: int = 300):
    try:
        p = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired:
        return 124, "", f"timeout after {timeout}s"
    except FileNotFoundError as e:
        return 127, "", str(e)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--app-web", default=str(DEFAULT_APP_WEB))
    ap.add_argument("--tests-root", default=str(DEFAULT_TESTS))
    ap.add_argument("--report", default=str(DEFAULT_REPORT))
    args = ap.parse_args()

    app_web = Path(args.app_web).resolve()
    tests = Path(args.tests_root).resolve()
    report_path = Path(args.report).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    assets = app_web / "assets"

    suites = [
        ("tl-unit",
         ["node", "--test", str(tests / "unit" / "*.test.mjs")],
         REPO_ROOT, 180),
        ("kbd-secret-slots",
         ["python3", str(tests / "e2e" / "kbd_secret_slots_regression.py"),
          "--app-web", str(app_web), "--report", str(report_path.parent / "kbd_secret_slots_report.json")],
         REPO_ROOT, 180),
        ("task-reward-integration",
         ["python3", str(tests / "e2e" / "task_reward_integration.py"),
          "--app-web", str(app_web), "--report", str(report_path.parent / "task_reward_integration_report.json")],
         REPO_ROOT, 180),
        ("appweb-input-smoke",
         ["python3", str(tests / "e2e" / "appshell_web_smoke.py"),
          "--web", str(app_web / "index.html"), "--report", str(report_path.parent / "appshell_web_smoke_report.json")],
         REPO_ROOT, 120),
        ("sprite-asset-scan",
         ["python3", str(tests / "visual" / "scripts" / "check_sprite_assets.py"),
          "--assets", str(assets), "--report", str(report_path.parent / "sprite_asset_scan.json")],
         REPO_ROOT, 120),
        ("audio-asset-scan",
         ["python3", str(tests / "e2e" / "check_audio_assets.py"),
          "--app-web", str(app_web), "--report", str(report_path.parent / "audio_asset_scan.json")],
         REPO_ROOT, 180),
        ("audio-runtime",
         ["python3", str(tests / "e2e" / "check_audio_runtime.py"),
          "--app-web", str(app_web), "--report", str(report_path.parent / "audio_runtime_report.json")],
         REPO_ROOT, 180),
        ("swift-daily-quota-reset",
         ["bash", str(tests / "swift" / "run_daily_quota_reset_test.sh")],
         REPO_ROOT, 60),
    ]

    # node uses a glob; expand it since shell isn't invoked.
    import glob
    results = {}
    overall = 0
    for name, cmd, cwd, timeout in suites:
        if name == "tl-unit":
            files = sorted(glob.glob(str(tests / "unit" / "*.test.mjs")))
            cmd = ["node", "--test", *files] if files else cmd
        rc, out, err = run(cmd, cwd, timeout)
        tail = (out + err).strip().splitlines()[-4:]
        status = "PASS" if rc == 0 else ("INFRA" if rc in (2, 124, 127) else "FAIL")
        results[name] = {"exit": rc, "status": status, "tail": tail}
        if rc != 0:
            overall = 2 if (rc in (2, 124, 127) and overall == 0) else 1
        print(f"[{status:5}] {name}  (exit {rc})")
        for line in tail:
            print(f"        {line}")

    passed = sum(1 for r in results.values() if r["status"] == "PASS")
    report = {"app_web": str(app_web), "suites": len(results), "passed": passed,
              "results": results}
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{passed}/{len(results)} suites passed  report: {report_path}")
    # overall: 1 if any real FAIL, 2 if only infra, 0 if all pass
    if any(r["status"] == "FAIL" for r in results.values()):
        return 1
    if any(r["status"] == "INFRA" for r in results.values()):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
