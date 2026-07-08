#!/usr/bin/env python3
"""Trim leading-prefix (and optionally trailing) silence per Ethan's WTJ-20260708-004
waveform algorithm — aligned with the design-review waveform's red-zone detection.

Red-zone / low-energy detection matches docs/scripts/gen-design-review.py
audio_waveform_summary() so "what this trims" == "what Ethan sees red":
  decode 16kHz mono, RMS per 20ms frame, threshold = clamp(max_rms*0.12, 0.006, 0.035),
  a low-energy segment is a run of low frames >= 120ms.

Leading-prefix algorithm (Ethan 2026-07-08):
  Find the REAL speech onset = the start of the first SUSTAINED speech run
  (>= SUSTAINED_MS of above-threshold frames). Everything before it — leading silence
  PLUS short pre-onset blips (rule 1: 马) PLUS short noises that split the leading red
  zone into segments (rule 2: sun/zucchini, merged by ignoring sub-sustained runs) — is
  invalid prefix and is trimmed, keeping only MARGIN_MS of safety before the onset.
  Rule 3 (van): if the onset is already within MARGIN of 0 (speech starts immediately,
  no leading red zone), do NOT trim the start. Rule 4: never touch effective speech.

find.zh also trims trailing (--trailing): the big silence after "找到" speech is the
first half of the "找到 + 词卡" gap; trim it to MARGIN. Word cards keep their trailing.

Usage:
  python3 app/scripts/trim-leading-prefix.py FILE [FILE ...] [--trailing] [--json OUT]
Exit 0 ok, 2 infra.
"""
from __future__ import annotations
import argparse, json, math, os, subprocess, sys, tempfile
from array import array
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
RATE = 16000
FRAME_S = 0.02
SUSTAINED_MS = 0.08      # a >=80ms above-threshold run counts as real speech onset (not a blip)
MARGIN_S = 0.03          # safety margin kept before onset / after offset
VAN_EPS = 0.04           # onset within this of 0 => no leading red zone (rule 3: van), don't trim
# PEAK-based threshold, NOT the waveform's RMS-of-max: these recordings have room tone peaking
# ~-45dB while soft syllables (e.g. find.zh 的「找」~-25dB) sit well below the loud syllable.
# A relative RMS-12%-of-max threshold marks soft syllables as low-energy and would clip them
# (rule 4 violation). -40dB peak cleanly separates real speech (>=-40dB) from room tone (<-45dB)
# and captures soft onsets, so leading prefix = only the room-tone/blip silence before the first
# real syllable. (Verified: original find.zh 「找」@0.30 peaks -25dB > -40dB; onset lands on 找,
# not the loud 到 @0.62.)
PEAK_THRESH = 10 ** (-40.0 / 20.0)   # -40 dBFS in linear peak


def peak_frames(path: Path):
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE),
         "-f", "s16le", "pipe:1"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0 or not proc.stdout:
        return None, 0.0
    s = array("h"); s.frombytes(proc.stdout)
    total = len(s)
    if total == 0:
        return None, 0.0
    dur = total / RATE
    frame = max(1, int(RATE * FRAME_S))
    peaks = []
    for start in range(0, total, frame):
        chunk = s[start:start + frame]
        if not chunk:
            continue
        peaks.append(max(abs(v) for v in chunk) / 32768.0)
    return peaks, dur


# Density-based onset: a real syllable (even a soft/choppy one like find.zh's 「找」, which
# is brief and dips below -40dB mid-syllable at 20ms resolution) shows several above-threshold
# frames clustered within a short window; an isolated blip (rule 1: 马's pre-red-zone spike;
# rule 2: the short noise that splits sun/zucchini's leading silence) shows only 1-2. So the
# onset = first above-threshold frame that has >= ONSET_MIN_COUNT above-threshold frames within
# the following ONSET_WINDOW. This captures 「找」and rejects blips without a fragile
# sustained-run length that would either skip soft syllables or accept blips.
ONSET_WINDOW_S = 0.15
ONSET_MIN_COUNT = 3


def onset_frame(peaks, thr):
    win = max(1, int(ONSET_WINDOW_S / FRAME_S))
    n = len(peaks)
    for i in range(n):
        if peaks[i] >= thr:
            cnt = sum(1 for k in range(i, min(n, i + win)) if peaks[k] >= thr)
            if cnt >= ONSET_MIN_COUNT:
                return i
    return None


def offset_frame(peaks, thr):
    """Mirror of onset_frame from the end: index+1 of the last real-speech frame."""
    win = max(1, int(ONSET_WINDOW_S / FRAME_S))
    n = len(peaks)
    for i in range(n - 1, -1, -1):
        if peaks[i] >= thr:
            cnt = sum(1 for k in range(max(0, i - win + 1), i + 1) if peaks[k] >= thr)
            if cnt >= ONSET_MIN_COUNT:
                return i + 1
    return None


def trim_one(path: Path, do_trailing: bool) -> dict:
    peaks, dur = peak_frames(path)
    if peaks is None:
        return {"file": str(path), "error": "decode failed", "rewritten": False}
    thr = PEAK_THRESH
    onf = onset_frame(peaks, thr)
    off = offset_frame(peaks, thr)
    r = {"file": str(path.relative_to(REPO)) if path.is_relative_to(REPO) else str(path),
         "duration_s": round(dur, 3), "onset_s": round((onf or 0) * FRAME_S, 3),
         "offset_s": round((off or len(rms)) * FRAME_S, 3), "rewritten": False}
    if onf is None:
        r["error"] = "no sustained speech found"
        return r
    onset_s = onf * FRAME_S
    offset_s = off * FRAME_S
    new_start = 0.0
    if onset_s > VAN_EPS:                       # rule 3: only trim if there IS a leading red zone
        new_start = max(0.0, onset_s - MARGIN_S)
    new_end = dur
    if do_trailing and offset_s < dur - VAN_EPS:
        new_end = min(dur, offset_s + MARGIN_S)
    r.update({"new_start_s": round(new_start, 3), "new_end_s": round(new_end, 3),
              "lead_trimmed_s": round(new_start, 3), "trail_trimmed_s": round(dur - new_end, 3)})
    if new_start <= 0.001 and new_end >= dur - 0.001:
        return r                                # nothing to trim (van-type / already tight)
    fd, tmp = tempfile.mkstemp(suffix=".m4a", dir=str(path.parent)); os.close(fd)
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", str(path),
         "-af", f"atrim=start={new_start:.3f}:end={new_end:.3f},asetpts=PTS-STARTPTS",
         "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1", "-movflags", "+faststart", tmp],
        capture_output=True, text=True)
    if proc.returncode != 0:
        os.unlink(tmp); r["error"] = (proc.stderr or "ffmpeg failed").splitlines()[-1]; return r
    os.replace(tmp, path)
    r["rewritten"] = True
    r["after_duration_s"] = round(trim_dur(path), 3)
    return r


def trim_dur(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nk=1:nw=1", str(path)], capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--trailing", action="store_true", help="also trim trailing (find.zh)")
    ap.add_argument("--json", type=Path)
    args = ap.parse_args()
    rows = []
    for f in args.files:
        if not f.is_file():
            print(f"INFRA: missing {f}", file=sys.stderr); return 2
        r = trim_one(f, args.trailing)
        rows.append(r)
        nm = Path(r["file"]).name
        if r.get("rewritten"):
            print(f"TRIM {nm:26s} onset={r['onset_s']:.3f} lead-{r['lead_trimmed_s']:.3f}"
                  f" trail-{r['trail_trimmed_s']:.3f} {r['duration_s']:.3f}->{r['after_duration_s']:.3f}s")
        elif "error" in r:
            print(f"FAIL {nm:26s} {r['error']}")
        else:
            print(f"keep {nm:26s} onset={r['onset_s']:.3f} (van-type/already tight, no trim)")
    n = sum(1 for r in rows if r.get("rewritten"))
    print(f"\n{n}/{len(rows)} rewritten")
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps({"trims": rows}, ensure_ascii=False, indent=2))
    return 0 if not any("error" in r for r in rows) else 2


if __name__ == "__main__":
    sys.exit(main())
