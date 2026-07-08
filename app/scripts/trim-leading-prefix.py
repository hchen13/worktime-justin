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


# Bridged-sustained-run onset. A real syllable (even a soft/choppy one like find.zh's 「找」,
# which dips below -40dB mid-syllable at 20ms resolution: 0.34* 0.36* [0.38 dip] 0.40*) is a
# CONTIGUOUS above-threshold run once short internal dips (<= BRIDGE) are bridged, and it spans
# >= MIN_RUN. Isolated blips (rule 1: 马 pre-spike; rule 2: the short noises that split
# sun/zucchini's leading silence into segments) are short (<= a couple frames) and separated by
# gaps > BRIDGE, so each bridged run stays < MIN_RUN and is skipped — the onset lands on the real
# word, not on a leading blip (which a plain density window would falsely accept). Verified:
# find.zh 「找」(80ms bridged) -> onset kept; sun's leading blips -> skipped, onset at the real
# word (~0.74).
BRIDGE_S = 0.04     # bridge above-threshold runs separated by dips up to this (within-syllable)
MIN_RUN_S = 0.06    # a bridged run this long counts as real speech (a syllable), not a blip


def _first_real_run_start(peaks, thr):
    n = len(peaks)
    bridge = max(1, int(BRIDGE_S / FRAME_S))
    need = max(1, int(MIN_RUN_S / FRAME_S))
    i = 0
    while i < n:
        if peaks[i] >= thr:
            run_start = i
            j = i
            gap = 0
            last_above = i
            while j < n:
                if peaks[j] >= thr:
                    last_above = j
                    gap = 0
                else:
                    gap += 1
                    if gap > bridge:
                        break
                j += 1
            if (last_above - run_start + 1) >= need:
                return run_start
            i = last_above + 1
        else:
            i += 1
    return None


def onset_frame(peaks, thr):
    return _first_real_run_start(peaks, thr)


def offset_frame(peaks, thr):
    """Mirror: index+1 of the last real-speech frame (run reversed)."""
    rev = list(reversed(peaks))
    r = _first_real_run_start(rev, thr)
    if r is None:
        return None
    return len(peaks) - r


# ---- RMS-12%-of-max red zones: EXACT replica of gen-design-review.py audio_waveform_summary,
#      so this trim's "leading red zone" == the red zone Ethan sees in the design-review waveform.
RMS_FRAME_S = 0.02
RED_MIN_S = 0.12          # a red (low-energy) zone must span >= 120ms
RED_MERGE_GAP_S = 0.05    # rule 2: bridge non-red gaps <= 50ms (blips that split a leading red zone)


def rms_frames(path: Path):
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
    frame = max(1, int(RATE * RMS_FRAME_S))
    vals = []
    for start in range(0, total, frame):
        chunk = s[start:start + frame]
        if not chunk:
            continue
        vals.append(math.sqrt(sum((v / 32768.0) ** 2 for v in chunk) / len(chunk)))
    return vals, dur


def red_zones(rms, dur):
    thr = max(0.006, min(0.035, (max(rms) if rms else 0.0) * 0.12))
    need = max(1, int(RED_MIN_S / RMS_FRAME_S))
    zones, gs = [], None
    for idx, v in enumerate(rms + [1.0]):
        low = v < thr
        if low and gs is None:
            gs = idx
        elif not low and gs is not None:
            if idx - gs >= need:
                zones.append((gs * RMS_FRAME_S, min(dur, idx * RMS_FRAME_S)))
            gs = None
    return zones


def leading_prefix_end(path: Path, peaks, dur):
    """End of the leading low-energy prefix per Ethan's waveform algorithm, or 0.0 if the clip
    starts with speech (rule 3). Merges rule-2 split noises; but if a distinct SOFT syllable
    (a -40dB run >= MIN_RUN followed by a real gap, e.g. find.zh 「找」) sits inside the leading
    red zone, stop there so that real syllable is preserved (rule 4)."""
    rms, _ = rms_frames(path)
    zones = red_zones(rms, dur)
    if not zones or zones[0][0] > 0.06:      # rule 3: starts with speech -> no leading prefix
        return 0.0
    end = zones[0][1]
    for s, e in zones[1:]:                     # rule 2: merge red zones split by <=50ms non-red blips
        if s - end <= RED_MERGE_GAP_S:
            end = e
        else:
            break
    # rule 4 guard: if a distinct real syllable (-40dB run >= MIN_RUN, then a >=80ms gap) begins
    # before `end`, keep from that syllable instead of trimming through it.
    thr = PEAK_THRESH
    bridge = max(1, int(BRIDGE_S / FRAME_S)); need = max(1, int(MIN_RUN_S / FRAME_S))
    n = len(peaks); i = 0
    while i < n and i * FRAME_S < end:
        if peaks[i] >= thr:
            j = i; last = i; gap = 0
            while j < n:
                if peaks[j] >= thr:
                    last = j; gap = 0
                else:
                    gap += 1
                    if gap > bridge:
                        break
                j += 1
            if (last - i + 1) >= need:
                # a real run; is it followed by a real gap (>=80ms below thr) before `end`?
                g = 0; k = last + 1
                while k < n and peaks[k] < thr:
                    g += 1; k += 1
                if g * FRAME_S >= 0.08:
                    return i * FRAME_S       # distinct soft syllable -> keep it
                # otherwise it's a continuous ramp into the loud word -> keep scanning
            i = last + 1
        else:
            i += 1
    return end


def trim_one(path: Path, do_trailing: bool) -> dict:
    peaks, dur = peak_frames(path)
    if peaks is None:
        return {"file": str(path), "error": "decode failed", "rewritten": False}
    thr = PEAK_THRESH
    lead_end = leading_prefix_end(path, peaks, dur)
    onf = int(lead_end / FRAME_S) if lead_end > 0 else 0
    off = offset_frame(peaks, thr)
    if off is None:
        off = len(peaks)
    r = {"file": str(path.relative_to(REPO)) if path.is_relative_to(REPO) else str(path),
         "duration_s": round(dur, 3), "onset_s": round(onf * FRAME_S, 3),
         "offset_s": round(off * FRAME_S, 3), "rewritten": False}
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
