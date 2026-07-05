#!/usr/bin/env python3
"""Capture Ethan's reference-voice samples for CosyVoice 3 zero-shot TTS (WTJ-20260705-024).

WHY THIS EXISTS
---------------
Ethan/PM chose CosyVoice 3 (Fun-CosyVoice3-0.5B) as the production TTS route. Unlike
Kokoro (baked-in voices), CosyVoice 3 is *zero-shot / cross-lingual*: the voice identity
comes from a reference clip (`prompt_wav`) plus its transcript (`prompt_text`). To keep
the voice production-legal for this personal, non-commercial kiosk, Ethan records his OWN
voice here (self-consent — the cleanest possible provenance) instead of cloning any
third-party/demo recording.

LENGTH MATTERS (the reason for multiple profiles)
-------------------------------------------------
CosyVoice's own frontend warns when the *target* text is much shorter than the
`prompt_text`  ("synthesis text is much shorter than prompt text, ... this may lead to
bad performance"). Our targets span 1-letter probes ("A", "P") up to full Chinese task
sentences. One long reference clip therefore can't serve every target well. So this
script offers several length/language profiles; Ethan records a few short clips AND a few
medium clips, and at regeneration time the TL picks a reference whose length roughly
matches each target (letters-clip -> single letters, words-clip -> short words,
sentence-clip -> task sentences).

IMPORTANT: the warning compares the prompt_text *character length*, not audio duration.
So a multi-item `words` clip (transcript ~55 chars) still trips it for a 3-char target
like "cat"/"tea". For the hardest short targets — cat, tea, and the single letters A / P —
the only truly length-matched reference is a per-item MICRO-CLIP whose transcript is just
that one item:  --profile custom --text "Cat." --duration 4 --name cat-ref  (single
letters A/P are CosyVoice's inherent short-text corner; if the warning still shows at
regen it is a soft quality note, not a failure — the TL can also synthesize letters via a
short carrier phrase). The `words`/`letters` profiles still give a good short-utterance
voice reference for the bulk of short words.

WHAT IT DOES
------------
Prints the exact text Ethan should read, counts down, records from the mic, and writes
per-clip:  <name>.wav  +  <name>.prompt.txt (the transcript)  +  appends to manifest.json.
Recording backend defaults to ffmpeg + AVFoundation (macOS-native, no pip install needed —
ffmpeg already drives this project's audio pipeline). `--backend sounddevice` is available
if preferred (needs `pip install sounddevice soundfile`).

Personal voice samples MUST NOT be committed: the default out dir gets a `.gitignore`
that excludes everything but itself.

USAGE (see also --help)
-----------------------
  # 1. see which mic to use (note the audio-device index)
  python3 app/scripts/capture-cosyvoice3-reference.py --list-devices

  # 2. record the recommended reference set (run each once; re-run to re-take)
  python3 app/scripts/capture-cosyvoice3-reference.py --profile zh          # 中文句子参考
  python3 app/scripts/capture-cosyvoice3-reference.py --profile en          # English sentence
  python3 app/scripts/capture-cosyvoice3-reference.py --profile mixed       # 中英混合
  python3 app/scripts/capture-cosyvoice3-reference.py --profile words       # 短词(含 cat/tea/A/P)
  python3 app/scripts/capture-cosyvoice3-reference.py --profile letters     # 单字母
  python3 app/scripts/capture-cosyvoice3-reference.py --profile custom --text "任意要读的内容"

  # options: --device N   --duration SEC   --out-dir DIR   --sample-rate HZ
  #          --backend {ffmpeg,sounddevice}   --name LABEL

Exit: 0 recorded ok · 1 usage/record error · 2 backend/tooling unavailable.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT_DIR = REPO_ROOT / "dist-stage" / "024-cosyvoice3-reference"

# The mic capture is STARTED before the "开始朗读" cue and given this many seconds of
# lead-in, so AVFoundation's device warm-up (~0.5-1.5s) never eats the opening syllable
# (worst case: the bare "A"/"P"/"Cat." onsets the card cares about). The lead-in is silent
# head padding; CosyVoice trims prompt_wav silence, and it does no harm as reference audio.
LEAD_IN_SEC = 3.0
# mean_volume below this (dBFS, via ffmpeg volumedetect) => almost certainly silence, i.e.
# the mic never delivered audio (mic-permission denied / wrong device). We warn, not fail.
SILENCE_MEAN_DB = -50.0

# Suggested read-scripts per profile. Each is chosen to be phonetically varied and
# LENGTH-APPROPRIATE for the targets it will later serve as a CosyVoice prompt_wav for.
# `lang` is the dominant language tag recorded into the manifest (CosyVoice 3 is
# cross-lingual, so this is descriptive, not a hard switch). `target_hint` documents
# which regen targets this clip is meant to be the reference for.
PROFILES = {
    "letters": {
        "lang": "en",
        "duration": 12,   # generous: clear letter-by-letter articulation + gaps needs room, don't get -t clipped
        "target_hint": "single letters / digits (A, P, the bare-letter probes)",
        "text": "A. B. C. D. E. P. Q. R. S. One. Two. Three.",
    },
    "words": {
        "lang": "en",
        "duration": 14,   # generous: 11 crisply-articulated words + gaps
        "target_hint": "short English secret words (cat, tea, dog, key, ... incl. the hard cat/tea/A/P set)",
        "text": "Cat. Tea. Dog. Key. Apple. Ball. Star. Fish. Cake. A. P.",
    },
    "en": {
        "lang": "en",
        "duration": 9,
        "target_hint": "English task voices / composite phrases (full sentences)",
        "text": "Hello Justin! It is time to work and play. Let us find the words and put "
                "each one in its place today.",
    },
    "zh": {
        "lang": "zh",
        "duration": 9,
        "target_hint": "Chinese task sentences (the 24 existing + 8 new door/bell/drag prompts)",
        "text": "小朋友你好！我们一起来玩游戏。找一找小动物，把它们放到正确的地方，"
                "打开门，按一按铃铛，真棒！",
    },
    "mixed": {
        "lang": "mixed",
        "duration": 9,
        "target_hint": "cross-lingual robustness (mixed zh+en, code-switching)",
        "text": "你好 Justin！我们来玩游戏。找到 the dog 和 the cat，"
                "一起数 one, two, three，把 apple 放进篮子里。",
    },
    "custom": {
        "lang": "custom",
        "duration": 8,
        "target_hint": "whatever --text you pass",
        "text": None,  # requires --text
    },
}


def die(msg: str, code: int = 1):
    print(f"\n错误：{msg}", file=sys.stderr)
    sys.exit(code)


def have(cmd: str) -> bool:
    return shutil.which(cmd) is not None


# ---------------------------------------------------------------------------
# Device enumeration
# ---------------------------------------------------------------------------
def ffmpeg_audio_devices():
    """Return list of (index, name) AVFoundation audio devices (macOS)."""
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""],
        capture_output=True, text=True)
    text = out.stderr
    devices, in_audio = [], False
    for line in text.splitlines():
        if "AVFoundation audio devices" in line:
            in_audio = True
            continue
        if "AVFoundation video devices" in line:
            in_audio = False
            continue
        if in_audio:
            m = re.search(r"\[(\d+)\]\s+(.*)$", line)
            if m:
                devices.append((int(m.group(1)), m.group(2).strip()))
    return devices


def list_devices(backend: str):
    print("可用录音设备（audio devices）：")
    if backend == "sounddevice":
        try:
            import sounddevice as sd  # noqa
        except ImportError:
            die("--backend sounddevice 需要 `pip install sounddevice soundfile`", 2)
        import sounddevice as sd
        for i, d in enumerate(sd.query_devices()):
            if d["max_input_channels"] > 0:
                print(f"  [{i}] {d['name']}  (in-ch={d['max_input_channels']})")
        return
    if sys.platform != "darwin":
        die("ffmpeg backend 的设备枚举目前只实现了 macOS/AVFoundation；非 mac 请用 --backend sounddevice", 2)
    if not have("ffmpeg"):
        die("找不到 ffmpeg（本项目音频管线依赖它，应已安装：brew install ffmpeg）", 2)
    devs = ffmpeg_audio_devices()
    if not devs:
        print("  （未解析到音频设备。若终端无麦克风权限，macOS 会在首次录音时弹窗——请允许；"
              "或到 系统设置 > 隐私与安全性 > 麦克风 里勾选你的终端 App。）")
    for idx, name in devs:
        print(f"  [{idx}] {name}")
    print("\n用 --device <索引> 选择；默认 0 = 上面枚举到的第一个音频输入设备"
          "（不一定是内建麦克风，请以本列表显示的名字为准）。")


# ---------------------------------------------------------------------------
# Recording
# ---------------------------------------------------------------------------
def _countdown_then_go():
    """Runs DURING mic warm-up: the 3-2-1 doubles as the lead-in window, so capture is
    already live (and past its warm-up) by the time we tell the reader to start."""
    print("\n倒计时（麦克风已在预热录音，看到『开始朗读』再出声）：")
    for n in range(3, 0, -1):
        print(f"  {n} …", flush=True)
        time.sleep(1.0)
    print("  ▶ 开始朗读！（录音中）\n", flush=True)


def _mic_permission_hint(err: str, returncode: int) -> str:
    low = (err or "").lower()
    if ("operation not permitted" in low or "denied" in low or returncode < 0
            or "avfoundation" in low or "input/output error" in low):
        return ("\n提示：这多半是麦克风权限问题。到 系统设置 > 隐私与安全性 > 麦克风，"
                "勾选你运行本脚本的终端 App，然后重试。")
    return ""


def record_ffmpeg(out_wav: Path, device: str, duration: int, sample_rate: int):
    """Start AVFoundation capture FIRST (Popen), run the countdown while it warms up
    (that head is silent lead-in), cue the reader only once truly capturing, then finish.
    Records LEAD_IN_SEC + duration seconds total."""
    total = LEAD_IN_SEC + duration
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
           "-f", "avfoundation", "-i", f":{device}",
           "-t", f"{total:.2f}", "-ar", str(sample_rate), "-ac", "1", str(out_wav)]
    try:
        proc = subprocess.Popen(cmd, stderr=subprocess.PIPE, text=True)
    except FileNotFoundError:
        die("找不到 ffmpeg（brew install ffmpeg）", 2)
    _countdown_then_go()  # ~3s ≈ LEAD_IN_SEC: ffmpeg warms up + records the lead silence
    try:
        _, err = proc.communicate(timeout=total + 20)
    except subprocess.TimeoutExpired:
        proc.kill()
        _, err = proc.communicate()
        die("ffmpeg 录音超时未自行结束（设备异常？）")
    if proc.returncode != 0 or not out_wav.is_file():
        die(f"ffmpeg 录音失败（returncode={proc.returncode}）：{(err or '').strip()}"
            + _mic_permission_hint(err, proc.returncode))


def record_sounddevice(out_wav: Path, device, duration: int, sample_rate: int):
    try:
        import sounddevice as sd
        import soundfile as sf
    except ImportError:
        die("--backend sounddevice 需要 `pip install sounddevice soundfile`", 2)
    import sounddevice as sd
    import soundfile as sf
    dev = int(device) if str(device).isdigit() else None
    total = LEAD_IN_SEC + duration
    frames = int(total * sample_rate)
    audio = sd.rec(frames, samplerate=sample_rate, channels=1, dtype="float32", device=dev)
    _countdown_then_go()  # sd.rec is already capturing in the background during the count
    sd.wait()
    sf.write(str(out_wav), audio, sample_rate, subtype="PCM_16")
    if not out_wav.is_file():
        die("sounddevice 录音未产出文件")


def mean_volume_db(path: Path):
    """mean_volume (dBFS) via ffmpeg volumedetect, or None if unmeasurable."""
    if not have("ffmpeg"):
        return None
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "volumedetect",
                          "-f", "null", "-"], capture_output=True, text=True)
    m = re.search(r"mean_volume:\s*(-?\d+\.?\d*)\s*dB", out.stderr)
    return float(m.group(1)) if m else None


def probe_duration(path: Path):
    if not have("ffprobe"):
        return None
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nk=1:nw=1", str(path)], capture_output=True, text=True)
    try:
        return round(float(out.stdout.strip()), 3)
    except ValueError:
        return None


def ensure_gitignore(out_dir: Path):
    """Personal voice samples must never be committed — ignore everything but this file.
    Idempotent: if a .gitignore already exists (e.g. a custom --out-dir inside the repo)
    but lacks the ignore-all rule, append it rather than leaving samples committable."""
    gi = out_dir / ".gitignore"
    existing = gi.read_text(encoding="utf-8") if gi.exists() else ""
    if any(line.strip() == "*" for line in existing.splitlines()):
        return
    body = "# WTJ-20260705-024: 个人声音参考样本，禁止入库。\n*\n!.gitignore\n"
    gi.write_text((existing.rstrip() + "\n" + body) if existing.strip() else body, encoding="utf-8")


def append_manifest(out_dir: Path, entry: dict):
    mpath = out_dir / "manifest.json"
    data = {"card": "WTJ-20260705-024", "purpose": "CosyVoice3 reference voice (Ethan self-recorded)",
            "clips": []}
    if mpath.is_file():
        try:
            data = json.loads(mpath.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    data.setdefault("clips", [])
    # replace any existing clip with the same path (a re-take), else append
    data["clips"] = [c for c in data["clips"] if c.get("path") != entry["path"]]
    data["clips"].append(entry)
    mpath.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__.split("\n")[0],
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="profiles: " + ", ".join(PROFILES.keys()))
    ap.add_argument("--profile", choices=list(PROFILES.keys()),
                    help="预设朗读脚本（zh/en/mixed/words/letters/custom）")
    ap.add_argument("--text", help="自定义朗读文本（--profile custom 必填；也可覆盖任何 profile 的文本）")
    ap.add_argument("--duration", type=int, help="录音时长（秒）；不填用 profile 默认")
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help=f"输出目录（默认 {DEFAULT_OUT_DIR}）")
    ap.add_argument("--sample-rate", type=int, default=24000, help="采样率 Hz（默认 24000，单声道；CosyVoice 会自行重采样）")
    ap.add_argument("--device", default="0", help="录音设备索引（见 --list-devices；默认 0=第一个枚举到的音频输入，不一定是内建麦克风）")
    ap.add_argument("--list-devices", action="store_true", help="列出录音设备后退出")
    ap.add_argument("--backend", choices=["ffmpeg", "sounddevice"], default="ffmpeg",
                    help="录音后端（默认 ffmpeg/AVFoundation，macOS 免安装）")
    ap.add_argument("--name", help="输出文件名标签（默认用 profile 名 + 时间戳）")
    ap.add_argument("--yes", action="store_true", help="跳过开录前的回车确认（用于脚本化）")
    args = ap.parse_args()

    if args.list_devices:
        list_devices(args.backend)
        return 0

    if not args.profile:
        ap.error("必须指定 --profile（或 --list-devices）。可选：" + ", ".join(PROFILES.keys()))

    prof = PROFILES[args.profile]
    prompt_text = args.text if args.text is not None else prof["text"]
    if not prompt_text:
        ap.error("--profile custom 需要同时给 --text \"要读的内容\"")
    duration = args.duration or prof["duration"]
    lang = prof["lang"] if args.text is None else "custom"

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    ensure_gitignore(out_dir)

    # Stable default label = profile name, so re-recording the SAME profile overwrites the
    # prior take (matches the documented "覆盖重录" — manifest dedup keys on this filename).
    # For multiple clips under one profile (e.g. per-word micro-clips of `custom`), pass --name.
    label = args.name or args.profile
    out_wav = out_dir / f"{label}.wav"

    # --- brief the reader ---
    print("=" * 70)
    print(f"CosyVoice3 参考声采集 · profile = {args.profile}  （语言：{lang}）")
    print(f"用途：{prof['target_hint']}")
    print("=" * 70)
    print("\n请清晰、自然、以正常语速朗读下面这段（读完在时长内即可，不必填满）：\n")
    print("  ┌" + "─" * 66)
    for line in _wrap(prompt_text, 62):
        print("  │  " + line)
    print("  └" + "─" * 66)
    print(f"\n录音时长：{duration}s   设备：{args.device}   采样率：{args.sample_rate}Hz   后端：{args.backend}")
    print(f"输出：{out_wav.name}")
    if not args.yes:
        try:
            input("\n准备好后按回车开始（Ctrl+C 取消）… ")
        except (KeyboardInterrupt, EOFError):
            print("\n已取消。")
            return 1

    if args.backend == "sounddevice":
        record_sounddevice(out_wav, args.device, duration, args.sample_rate)
    else:
        if sys.platform != "darwin":
            die("ffmpeg/AVFoundation 后端仅支持 macOS；非 mac 请用 --backend sounddevice", 2)
        if not have("ffmpeg"):
            die("找不到 ffmpeg（brew install ffmpeg）", 2)
        record_ffmpeg(out_wav, args.device, duration, args.sample_rate)

    actual = probe_duration(out_wav)
    mean_db = mean_volume_db(out_wav)
    silent = mean_db is not None and mean_db < SILENCE_MEAN_DB
    (out_dir / f"{label}.prompt.txt").write_text(prompt_text + "\n", encoding="utf-8")
    append_manifest(out_dir, {
        "label": label,
        "profile": args.profile,
        "language": lang,
        "target_hint": prof["target_hint"],
        "prompt_text": prompt_text,
        "path": out_wav.name,
        "prompt_txt": f"{label}.prompt.txt",
        "requested_duration_sec": duration,
        "actual_duration_sec": actual,
        "sample_rate": args.sample_rate,
        "channels": 1,
        "lead_in_sec": LEAD_IN_SEC,   # 前 ~LEAD_IN_SEC 秒是预热静音，真正朗读从其后开始
        "mean_volume_db": mean_db,
        "backend": args.backend,
        "device": args.device,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    print("\n✔ 录音完成")
    print(f"  wav        : {out_wav}")
    print(f"  transcript : {out_dir / (label + '.prompt.txt')}")
    print(f"  manifest   : {out_dir / 'manifest.json'}")
    print(f"  实际时长   : {actual}s（前 ~{LEAD_IN_SEC:.0f}s 是预热静音，之后才是朗读）"
          + (f"   平均响度 {mean_db:.1f} dBFS" if mean_db is not None else ""))
    if silent:
        print("\n⚠ 疑似几乎没采到声音（可能麦克风权限未开、或选错了 --device）！")
        print("  请：系统设置 > 隐私与安全性 > 麦克风 勾选你的终端；用 --list-devices 选对 --device；然后重录本条。")
    print("\n请回放确认：整段读全了、开头没被切、声音清晰。不满意就重跑同一 profile 覆盖重录。")
    print("建议至少各录一条 zh / en / words / letters（mixed 可选）。")
    print("对最难的短目标（cat / tea / A / P），另各录一条 micro 参考（transcript 只放这一项），例如：")
    print(f"  python3 {Path(__file__).name} --profile custom --text \"Cat.\" --duration 4 --name cat-ref")
    print("录完把目录 dist-stage/024-cosyvoice3-reference/ 告诉 TL（无需自己入库，目录已 .gitignore），"
          "TL 会用它们做 CosyVoice3 全量重生成。")
    return 0


def _wrap(text: str, width: int):
    """Very small wrapper that respects CJK width roughly (CJK counts as 2)."""
    lines, cur, w = [], "", 0
    for ch in text:
        cw = 2 if ord(ch) > 0x2E7F else 1
        if w + cw > width and cur:
            lines.append(cur)
            cur, w = "", 0
        cur += ch
        w += cw
    if cur:
        lines.append(cur)
    return lines


if __name__ == "__main__":
    sys.exit(main())
