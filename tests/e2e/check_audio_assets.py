#!/usr/bin/env python3
"""Production audio integrity / playability scan (WTJ-20260704-076, criteria 1/2/5).

Scriptable half of the audio acceptance. Reads the authoritative expected-audio
inventory (app/web/audio/missing-audio.json — secretWords / sfx / taskVoice /
compositePhrases, with each item's runtime path + delivery status) and, for every
expected file, verifies with ffprobe/ffmpeg:
  - file exists at its runtime path under app/web/
  - decodable container + audio stream (codec/duration readable)
  - duration within a sane band (not 0, not absurdly long)
  - RMS above a silence floor (not a blank/silent file)
  - peak below clipping (mean_volume/max_volume from ffmpeg volumedetect)

Also cross-checks that every runtime-referenced path (manifest.js pool audioFile
+ audio.js DEFAULT_SFX_MAP keys) appears in the inventory, so the checklist can't
silently omit something the app will try to load.

The aesthetic half — clear child-friendly English pronunciation, no misreads,
per-SFX character — is a human/agentic listening pass; this script emits the
sampling checklist for it (see --emit-checklist) but cannot judge it.

Current state: with 0 audio files delivered (074/075 pending) this reports
all-missing, which is the correct status. Re-run after delivery to validate.

Run:  python3 tests/e2e/check_audio_assets.py [--app-web DIR] [--emit-checklist]
Exit: 0 all expected present+valid · 1 missing/defective files · 2 infra error.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_APP_WEB = REPO_ROOT / "app" / "web"
DEFAULT_REPORT = REPO_ROOT / "tests" / "reports" / "audio_asset_scan.json"

# Sane bands (seconds). Words/SFX are short; task voice a bit longer.
DUR_MIN = 0.15
DUR_MAX = 12.0
SILENCE_RMS_DB = -50.0   # mean_volume below this => effectively silent
CLIP_PEAK_DB = -0.1      # max_volume above this => clipping risk


def ffprobe_duration(path: Path):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nk=1:nw=1", str(path)],
            capture_output=True, text=True, timeout=30)
        if out.returncode != 0:
            return None, out.stderr.strip()[:120]
        return float(out.stdout.strip()), None
    except (subprocess.TimeoutExpired, ValueError, FileNotFoundError) as e:
        return None, str(e)[:120]


def ffmpeg_volumedetect(path: Path):
    """Return (mean_db, max_db) via ffmpeg volumedetect, or (None, None)."""
    try:
        out = subprocess.run(
            ["ffmpeg", "-hide_banner", "-i", str(path), "-af", "volumedetect",
             "-f", "null", "-"], capture_output=True, text=True, timeout=45)
        text = out.stderr
        mean = re.search(r"mean_volume:\s*(-?\d+\.?\d*)\s*dB", text)
        peak = re.search(r"max_volume:\s*(-?\d+\.?\d*)\s*dB", text)
        return (float(mean.group(1)) if mean else None,
                float(peak.group(1)) if peak else None)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None, None


def scan_file(path: Path):
    problems = []
    if not path.is_file():
        return {"exists": False, "problems": ["文件不存在（未交付）"]}
    dur, err = ffprobe_duration(path)
    if dur is None:
        problems.append(f"不可解码/无 duration: {err}")
        return {"exists": True, "problems": problems}
    if dur < DUR_MIN:
        problems.append(f"时长过短 {dur:.2f}s (< {DUR_MIN}s)")
    if dur > DUR_MAX:
        problems.append(f"时长过长 {dur:.2f}s (> {DUR_MAX}s)")
    mean_db, max_db = ffmpeg_volumedetect(path)
    if mean_db is not None and mean_db < SILENCE_RMS_DB:
        problems.append(f"疑似静音 (mean_volume {mean_db}dB < {SILENCE_RMS_DB}dB)")
    if max_db is not None and max_db > CLIP_PEAK_DB:
        problems.append(f"峰值过载 (max_volume {max_db}dB > {CLIP_PEAK_DB}dB)")
    return {"exists": True, "durationSec": round(dur, 3),
            "meanDb": mean_db, "maxDb": max_db, "problems": problems}


def collect_inventory(missing_json: dict):
    """Flatten missing-audio.json into [{category, key, path, status}]."""
    items = []
    for cat, keyfield in [("secretWords", "word"), ("sfx", "sfxKey"),
                          ("taskVoice", "taskId"), ("compositePhrases", "phraseKey")]:
        for it in (missing_json.get(cat) or []):
            path = it.get("path") or it.get("voicePromptPath")
            if not path:
                continue
            items.append({"category": cat, "key": it.get(keyfield, "?"),
                          "path": path, "status": it.get("status", "?"),
                          "required": cat in ("secretWords", "sfx", "taskVoice")})
    return items


def _strip_line_comments(src: str) -> str:
    # Drop // line comments so a path merely *mentioned* in a comment (e.g. the
    # 078-fix note documenting the old mangled path) is not read as a real
    # runtime reference. Not a full JS parser — good enough for // comments,
    # which is where such illustrative paths live.
    out = []
    for line in src.splitlines():
        idx = line.find("//")
        out.append(line if idx == -1 else line[:idx])
    return "\n".join(out)


def runtime_referenced_paths(app_web: Path):
    """Paths the app will actually try to load: manifest pool audioFile + SFX map.

    Comments are stripped first — a path shown in a comment is documentation, not
    a load the app performs."""
    refs = set()
    mjs = (app_web / "manifest.js").read_text(encoding="utf-8") if (app_web / "manifest.js").is_file() else ""
    ajs = (app_web / "audio.js").read_text(encoding="utf-8") if (app_web / "audio.js").is_file() else ""
    code = _strip_line_comments(mjs) + "\n" + _strip_line_comments(ajs)
    for m in re.findall(r"audio/(?:words|sfx|tasks|phrases)/[\w.-]+\.m4a", code):
        refs.add(m)
    return refs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--app-web", default=str(DEFAULT_APP_WEB))
    ap.add_argument("--report", default=str(DEFAULT_REPORT))
    ap.add_argument("--emit-checklist", action="store_true",
                    help="also print the human/agentic sampling listen checklist")
    args = ap.parse_args()

    app_web = Path(args.app_web).resolve()
    report_path = Path(args.report).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)

    if subprocess.run(["which", "ffprobe"], capture_output=True).returncode != 0:
        print("INFRA-ERROR ffprobe 不可用")
        return 2
    missing_path = app_web / "audio" / "missing-audio.json"
    if not missing_path.is_file():
        print(f"INFRA-ERROR 缺预期清单: {missing_path}")
        return 2
    inv = collect_inventory(json.loads(missing_path.read_text(encoding="utf-8")))

    present, missing, defective = 0, 0, 0
    results = []
    for it in inv:
        r = scan_file(app_web / it["path"])
        rec = {**it, **r}
        results.append(rec)
        if not r["exists"]:
            missing += 1
        elif r["problems"]:
            defective += 1
        else:
            present += 1

    # inventory-vs-runtime cross-check
    inv_paths = {it["path"] for it in inv}
    rt = runtime_referenced_paths(app_web)
    uncovered = sorted(rt - inv_paths)

    total = len(inv)
    req = [r for r in results if r["required"]]
    req_ok = sum(1 for r in req if r["exists"] and not r["problems"])
    print(f"预期音频 {total} (必选 secretWords/sfx/taskVoice {len(req)}, 补充 compositePhrases {total-len(req)})")
    print(f"  present+valid {present} / missing {missing} / defective {defective}")
    print(f"  必选类目就绪: {req_ok}/{len(req)}")
    if uncovered:
        print(f"  ⚠ 运行时引用但清单未列 ({len(uncovered)}): {uncovered[:8]}")
    if defective:
        print("  缺陷文件:")
        for r in results:
            if r["exists"] and r["problems"]:
                print(f"    {r['path']}: {'; '.join(r['problems'])}")
    if missing and present == 0:
        print("  (当前全部未交付 — 074/075 交付后重跑本脚本验证)")

    report = {"app_web": str(app_web), "total": total, "present": present,
              "missing": missing, "defective": defective,
              "required_ok": req_ok, "required_total": len(req),
              "uncovered_runtime_refs": uncovered, "results": results}
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"report: {report_path}")

    if args.emit_checklist:
        print("\n=== 抽样听感 checklist (criterion 3, 人工/agentic 试听) ===")
        print("task voice (全部 8): " + ", ".join(r["key"] for r in results if r["category"] == "taskVoice"))
        print("SFX (每类 ≥1, 共 20): " + ", ".join(r["key"] for r in results if r["category"] == "sfx"))
        words = [r["key"] for r in results if r["category"] == "secretWords"]
        print(f"秘密词 (每首字母若干, 共 {len(words)}): 抽样 " + ", ".join(words[:12]) + " …")
        print("每条判定: 英文发音清楚 / 儿童友好 / 无误读 / 音量与其它一致 / 非 Chrome 内置语音(REQ-AST-07)")

    return 0 if (missing == 0 and defective == 0 and not uncovered) else 1


if __name__ == "__main__":
    sys.exit(main())
