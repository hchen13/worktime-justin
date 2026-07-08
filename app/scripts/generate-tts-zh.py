#!/usr/bin/env python3
"""WTJ-20260704-084 — full generation of Chinese task-voice TTS (24 complete sentences).

PM-adopted default route (docs/spikes/tts-model-084/RECOMMENDATION.md, tl/tts-spike-084):
single-engine Kokoro-onnx for the whole app — EN af_heart (see generate-tts.py), ZH
zf_xiaoxiao. This script is the ZH half.

MODEL / LICENSE (verify before shipping; mirrors generate-tts.py's EN header):
  - Kokoro-82M ONNX (kokoro-v1.0.onnx + voices-v1.0.bin), Apache-2.0.
    https://github.com/thewh1teagle/kokoro-onnx (release model-files-v1.0)
    sha256 kokoro-v1.0.onnx  7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5
    sha256 voices-v1.0.bin   bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d
  - Voice: zf_xiaoxiao (zh female; from voices-v1.0.bin, Apache-2.0).
  - G2P: misaki[zh] 0.9.4 (MIT; jieba + pypinyin + cn2an for Arabic-digit -> Chinese-reading
    conversion, e.g. "3" -> 三 sān, verified in this card — see phoneme report).
    Kokoro has no native zh front-end, so misaki does text -> phoneme -> Kokoro(is_phonemes=True).
  - Determinism: fixed voice, no sampling/seed -> reproducible byte-for-byte re-runs (same as EN).
  Project is non-commercial (Ethan): personal/non-commercial licensing is acceptable.

RED LINE (CN-TASK-84-DRAFT / TL ruling, see docs/design-notes/CN-TASK-DRAFT.md #0): every taskId here is ONE
independent, pre-generated, COMPLETE Chinese sentence. There is NO phrases/composite table for
Chinese and this script must never be used to synthesize a fragment intended for runtime
playComposite() concatenation (that pattern is English-only, e.g. "Find the" + "dog"; Chinese
"找到" + "小狗" splicing is banned — see docs/design-notes/CN-TASK-DRAFT.md and tts-text-manifest.zh.json header).

Text source of truth: app/scripts/tts-text-manifest.zh.json  tasks{taskId:{text,out}}
(24 entries; out paths use the <id>.zh.m4a convention to avoid colliding with the EN
audio already delivered at audio/tasks/<id>.m4a — see that file's header note).

Encoding: IDENTICAL to generate-tts.py's EN pipeline — loudnorm I=-16 LUFS then
alimiter limit=0.794 level=false (level=false is REQUIRED; default level=true would
re-normalize back to 0 dB and reintroduce clipping). Output: 24 kHz mono AAC 64k .m4a.

no-silent-fallback guardrails (per spike RECOMMENDATION.md "Guardrails ... MUST keep"):
  1. every g2p()/create() call is wrapped in try/except — an exception is recorded as a
     FAIL entry, never silently skipped as if nothing were expected there;
  2. every rendered PCM buffer is validated non-silent (RMS > 1e-4) AND within a sane
     duration band (0.3s-6s for a short child-facing sentence) before ffmpeg encoding
     is even attempted;
  3. this is a single-engine pipeline (no second engine to fall back to) — a failing or
     rejected input aborts the run with a non-zero exit and prints every failure; it never
     ships a missing/silent/truncated .m4a. (Contrast: 004 Phase B's runtime side has its
     own independent no-silent-fallback behaviour in audio.js/task.js — this is the build-time
     guarantee that the input assets themselves are never defective.)

RUN (from repo root, after building the Kokoro-only env per ENV-BUILD.md-equivalent steps
recorded in this card's final report):
  PHONEMIZER_ESPEAK_LIBRARY=/opt/homebrew/lib/libespeak-ng.dylib \
  ttsenv/bin/python app/scripts/generate-tts-zh.py --model-dir kokoro_models --app-web app/web \
    --phoneme-report /tmp/zh-phoneme-report.json
"""
import argparse
import json
import os
import subprocess
import sys

VOICE = "zf_xiaoxiao"
# brew espeak-ng has a correct compiled-in data path; always point phonemizer at brew's lib
# (same rationale as generate-tts.py — the pip espeakng_loader wheel bakes a CI-only path).
BREWLIB = os.environ.get("PHONEMIZER_ESPEAK_LIBRARY", "/opt/homebrew/lib/libespeak-ng.dylib")
BREWDATA = os.environ.get("ESPEAK_DATA_PATH", "/opt/homebrew/share/espeak-ng-data")
AF = "loudnorm=I=-16:TP=-2.0:LRA=11,alimiter=limit=0.794:level=false"

DUR_MIN, DUR_MAX = 0.3, 6.0   # sane band for a short child-facing complete sentence
RMS_SILENCE_FLOOR = 1e-4      # spike RECOMMENDATION.md guardrail #2: RMS > 1e-4 => non-silent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", default="kokoro_models", help="dir holding kokoro-v1.0.onnx + voices-v1.0.bin")
    ap.add_argument("--app-web", default="app/web")
    ap.add_argument("--manifest", default=None, help="defaults to tts-text-manifest.zh.json next to this script")
    ap.add_argument("--phoneme-report", default=None, help="optional path to write a JSON phoneme/QC report")
    args = ap.parse_args()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    manifest_path = args.manifest or os.path.join(script_dir, "tts-text-manifest.zh.json")

    os.environ["PHONEMIZER_ESPEAK_LIBRARY"] = BREWLIB
    os.environ["ESPEAK_DATA_PATH"] = BREWDATA
    from phonemizer.backend.espeak.wrapper import EspeakWrapper
    EspeakWrapper.set_library(BREWLIB)
    from kokoro_onnx import Kokoro, EspeakConfig
    from misaki import zh as misaki_zh
    import numpy as np
    import soundfile as sf

    k = Kokoro(os.path.join(args.model_dir, "kokoro-v1.0.onnx"),
               os.path.join(args.model_dir, "voices-v1.0.bin"),
               espeak_config=EspeakConfig(lib_path=BREWLIB, data_path=BREWDATA))
    g2p = misaki_zh.ZHG2P()

    tm = json.load(open(manifest_path, encoding="utf-8"))
    tasks = tm["tasks"]
    assert "phrases" not in tm, "红线: 中文任务音频禁止 phrases 拼接表 (见文件头注)"

    tmp = os.path.join(args.model_dir, "_tts_zh_tmp.wav")
    ok_report = []
    fail_report = []
    for i, (task_id, v) in enumerate(tasks.items(), 1):
        text = v["text"]
        rel = v["out"]
        out = os.path.join(args.app_web, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        try:
            phonemes, _tokens = g2p(text)
            samples, sr = k.create(phonemes, voice=VOICE, is_phonemes=True)
        except Exception as e:  # guardrail 1: never let a crash ship a missing asset silently
            fail_report.append({"taskId": task_id, "text": text, "error": f"{type(e).__name__}: {e}"})
            print(f"FAIL {task_id} {text!r}: {type(e).__name__}: {e}", flush=True)
            continue

        dur = len(samples) / sr
        clip_rms = float(np.sqrt(np.mean(np.square(samples)))) if len(samples) else 0.0
        problems = []
        if clip_rms <= RMS_SILENCE_FLOOR:
            problems.append(f"silent (rms={clip_rms:.6f} <= {RMS_SILENCE_FLOOR})")
        if dur < DUR_MIN:
            problems.append(f"duration too short ({dur:.3f}s < {DUR_MIN}s)")
        if dur > DUR_MAX:
            problems.append(f"duration too long ({dur:.3f}s > {DUR_MAX}s)")
        if problems:
            # guardrail 2+3: reject before encoding, never write a defective file.
            fail_report.append({"taskId": task_id, "text": text, "phonemes": phonemes, "error": "; ".join(problems)})
            print(f"FAIL {task_id} {text!r}: {'; '.join(problems)} — NOT writing file (no-silent-fallback)", flush=True)
            continue

        sf.write(tmp, samples, sr)
        subprocess.run(["ffmpeg", "-y", "-i", tmp, "-af", AF,
                        "-ar", "24000", "-ac", "1", "-c:a", "aac", "-b:a", "64k", out],
                       check=True, capture_output=True)
        ok_report.append({
            "taskId": task_id, "text": text, "out": rel, "phonemes": phonemes,
            "durationSec": round(dur, 3), "rawRms": round(clip_rms, 6), "sr": sr,
        })
        print(f"OK {i}/{len(tasks)} {task_id}: {dur:.3f}s rms={clip_rms:.4f} phon={phonemes!r}", flush=True)

    os.path.exists(tmp) and os.remove(tmp)
    print(f"\nDONE {len(ok_report)}/{len(tasks)} ok, {len(fail_report)} fail (voice={VOICE})")

    if args.phoneme_report:
        with open(args.phoneme_report, "w", encoding="utf-8") as f:
            json.dump({"ok": ok_report, "fail": fail_report}, f, ensure_ascii=False, indent=2)
        print(f"phoneme/QC report -> {args.phoneme_report}")

    if fail_report:
        print("FAILURES (no-silent-fallback: these did NOT ship a file):")
        for entry in fail_report:
            print(f"  {entry['taskId']}: {entry['error']}")
        sys.exit(1)


if __name__ == "__main__":
    main()
