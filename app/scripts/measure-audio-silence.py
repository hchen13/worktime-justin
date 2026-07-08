#!/usr/bin/env python3
"""Measure leading/trailing silence of audio files (WTJ-20260708-004).

Repeatable silence profiler for the ZH find-phrase + word-card audio. Uses
ffmpeg's `silencedetect` filter to find silence intervals, then reports per file:
total duration, leading silence (silence starting at ~0), trailing silence
(silence ending at ~duration). No audio is modified — measurement only.

Trimming is done by trim-audio-silence.py which consumes the same detection.

Usage:
  python3 app/scripts/measure-audio-silence.py FILE [FILE ...] [--json OUT] [--noise -45dB] [--min-d 0.08]
  python3 app/scripts/measure-audio-silence.py --zh-set        # find.zh + all words/*.zh.m4a
Exit 0 always (measurement); 2 on infra error (no ffmpeg / missing file).
"""
from __future__ import annotations
import argparse, json, re, subprocess, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FIND_ZH = REPO / "app/web/audio/phrases/find.zh.m4a"
WORDS_DIR = REPO / "app/web/audio/words"

SIL_START = re.compile(r"silence_start:\s*(-?[\d.]+)")
SIL_END = re.compile(r"silence_end:\s*(-?[\d.]+)")


def duration_s(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nk=1:nw=1", str(path)],
        capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


def silence_intervals(path: Path, noise: str, min_d: float):
    """Return list of (start, end) silence intervals via ffmpeg silencedetect."""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
         "-af", f"silencedetect=noise={noise}:d={min_d}", "-f", "null", "-"],
        capture_output=True, text=True)
    log = proc.stderr
    starts, ends = [], []
    for line in log.splitlines():
        m = SIL_START.search(line)
        if m:
            starts.append(float(m.group(1)))
        m = SIL_END.search(line)
        if m:
            ends.append(float(m.group(1)))
    intervals = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else None
        intervals.append((s, e))
    return intervals


def profile(path: Path, noise: str, min_d: float, edge_tol: float = 0.05) -> dict:
    dur = duration_s(path)
    intervals = silence_intervals(path, noise, min_d)
    lead = 0.0
    trail = 0.0
    for s, e in intervals:
        if s <= edge_tol and e is not None:      # silence starting at/near file head
            lead = max(lead, e)
        if e is None or e >= dur - edge_tol:      # silence running to file end
            trail = max(trail, dur - s)
    speech = max(0.0, dur - lead - trail)
    return {
        "file": str(path.relative_to(REPO)) if path.is_relative_to(REPO) else str(path),
        "duration_s": round(dur, 3),
        "lead_silence_s": round(lead, 3),
        "trail_silence_s": round(trail, 3),
        "speech_span_s": round(speech, 3),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*", type=Path)
    ap.add_argument("--zh-set", action="store_true", help="find.zh + all words/*.zh.m4a")
    ap.add_argument("--json", type=Path)
    ap.add_argument("--noise", default="-45dB")
    ap.add_argument("--min-d", type=float, default=0.08)
    ap.add_argument("--lead-thresh", type=float, default=0.15,
                    help="flag files whose lead silence exceeds this (s)")
    ap.add_argument("--trail-thresh", type=float, default=0.20,
                    help="flag files whose trail silence exceeds this (s)")
    args = ap.parse_args()

    files = list(args.files)
    if args.zh_set:
        files = [FIND_ZH] + sorted(WORDS_DIR.glob("*.zh.m4a"))
    if not files:
        print("no files (pass files or --zh-set)", file=sys.stderr)
        return 2
    for f in files:
        if not f.is_file():
            print(f"INFRA: missing {f}", file=sys.stderr)
            return 2

    rows = [profile(f, args.noise, args.min_d) for f in files]
    flagged = [r for r in rows if r["lead_silence_s"] > args.lead_thresh
               or r["trail_silence_s"] > args.trail_thresh]

    print(f"# silence profile  noise={args.noise} min_d={args.min_d}s  "
          f"lead>{args.lead_thresh}s|trail>{args.trail_thresh}s flagged")
    print(f"{'file':45s} {'dur':>7s} {'lead':>7s} {'trail':>7s} {'speech':>7s}  flag")
    for r in rows:
        fl = "  <-- trim" if r in flagged else ""
        print(f"{r['file']:45s} {r['duration_s']:7.3f} {r['lead_silence_s']:7.3f} "
              f"{r['trail_silence_s']:7.3f} {r['speech_span_s']:7.3f}{fl}")
    print(f"\n{len(rows)} files, {len(flagged)} flagged for trim "
          f"(lead>{args.lead_thresh}s or trail>{args.trail_thresh}s)")

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(
            {"params": {"noise": args.noise, "min_d": args.min_d,
                        "lead_thresh": args.lead_thresh, "trail_thresh": args.trail_thresh},
             "files": rows,
             "flagged": [r["file"] for r in flagged]}, ensure_ascii=False, indent=2))
        print(f"json -> {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
