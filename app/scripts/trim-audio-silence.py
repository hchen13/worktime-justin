#!/usr/bin/env python3
"""Trim leading/trailing silence from audio files (WTJ-20260708-004).

Edge-silence trim ONLY — never alters text, pronunciation content, pitch, or
filename. For each input file it re-measures the silence profile (shared logic
with measure-audio-silence.py), then atrims to
  [ speech_start - lead_pad , speech_end + trail_pad ]
keeping a small natural pad so nothing sounds clipped, and re-encodes to AAC
24kHz mono (matched to source, 96k to avoid trim-generation loss). A file is
only rewritten when the trim removes more than --min-save seconds, so already-
tight clips are left byte-identical.

Usage:
  python3 app/scripts/trim-audio-silence.py FILE [FILE ...]
  python3 app/scripts/trim-audio-silence.py --from-json tests/reports/wtj-004-silence-before.json  # trim its flagged set
Exit 0 on success, 2 on infra error.
"""
from __future__ import annotations
import argparse, json, subprocess, sys, tempfile, os
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# measure-audio-silence.py has a hyphenated name; load it directly as a module.
import importlib.util
_spec = importlib.util.spec_from_file_location(
    "measure_audio_silence", str(Path(__file__).resolve().parent / "measure-audio-silence.py"))
mas = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mas)


def trim_one(path: Path, noise: str, min_d: float, lead_pad: float,
             trail_pad: float, min_save: float) -> dict:
    prof = mas.profile(path, noise, min_d)
    dur = prof["duration_s"]
    lead = prof["lead_silence_s"]
    trail = prof["trail_silence_s"]
    speech_start = lead
    speech_end = dur - trail
    new_start = max(0.0, speech_start - lead_pad)
    new_end = min(dur, speech_end + trail_pad)
    saved = (new_start - 0.0) + (dur - new_end)
    result = {**prof, "new_start_s": round(new_start, 3),
              "new_end_s": round(new_end, 3),
              "saved_s": round(saved, 3), "rewritten": False}
    if saved < min_save or new_end <= new_start:
        return result
    fd, tmp = tempfile.mkstemp(suffix=".m4a", dir=str(path.parent))
    os.close(fd)
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", str(path),
         "-af", f"atrim=start={new_start:.3f}:end={new_end:.3f},asetpts=PTS-STARTPTS",
         "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1",
         "-movflags", "+faststart", tmp],
        capture_output=True, text=True)
    if proc.returncode != 0:
        os.unlink(tmp)
        result["error"] = proc.stderr.strip().splitlines()[-1] if proc.stderr else "ffmpeg failed"
        return result
    os.replace(tmp, path)
    after = mas.profile(path, noise, min_d)
    result["after_duration_s"] = after["duration_s"]
    result["after_lead_s"] = after["lead_silence_s"]
    result["after_trail_s"] = after["trail_silence_s"]
    result["rewritten"] = True
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*", type=Path)
    ap.add_argument("--from-json", type=Path, help="trim the 'flagged' set from a measure JSON")
    ap.add_argument("--json", type=Path, help="write per-file trim report")
    ap.add_argument("--noise", default="-45dB")
    ap.add_argument("--min-d", type=float, default=0.08)
    ap.add_argument("--lead-pad", type=float, default=0.05)
    ap.add_argument("--trail-pad", type=float, default=0.10)
    ap.add_argument("--min-save", type=float, default=0.05)
    args = ap.parse_args()

    files = list(args.files)
    if args.from_json:
        d = json.loads(args.from_json.read_text())
        files += [REPO / f for f in d.get("flagged", [])]
    if not files:
        print("no files (pass files or --from-json)", file=sys.stderr)
        return 2
    for f in files:
        if not f.is_file():
            print(f"INFRA: missing {f}", file=sys.stderr)
            return 2

    rows = []
    for f in files:
        r = trim_one(f, args.noise, args.min_d, args.lead_pad, args.trail_pad, args.min_save)
        rows.append(r)
        name = Path(r["file"]).name
        if r["rewritten"]:
            print(f"TRIM {name:26s} {r['duration_s']:.3f}->{r['after_duration_s']:.3f}s "
                  f"(lead {r['lead_silence_s']:.3f}->{r['after_lead_s']:.3f}, "
                  f"trail {r['trail_silence_s']:.3f}->{r['after_trail_s']:.3f}, saved {r['saved_s']:.3f}s)")
        elif "error" in r:
            print(f"FAIL {name:26s} {r['error']}")
        else:
            print(f"skip {name:26s} (saved {r['saved_s']:.3f}s < min)")

    n_rewritten = sum(1 for r in rows if r["rewritten"])
    print(f"\n{n_rewritten}/{len(rows)} rewritten")
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps({"trims": rows}, ensure_ascii=False, indent=2))
        print(f"json -> {args.json}")
    return 0 if not any("error" in r for r in rows) else 2


if __name__ == "__main__":
    sys.exit(main())
