#!/usr/bin/env python3
"""WTJ-20260704-074 — pre-generate all product TTS audio (words / tasks / phrases).

Reproducible offline TTS generation. Runtime app plays only these pre-generated
.m4a files (REQ-AST-07 red line: no Chrome/system live TTS as product voice).

MODEL / LICENSE (verify before shipping):
  - Kokoro-82M ONNX  (kokoro-v1.0.onnx + voices-v1.0.bin), Apache-2.0.
    https://github.com/thewh1teagle/kokoro-onnx  (model release: model-files-v1.0)
  - Phonemization: espeak-ng (GPLv3 TOOL used only at build time to generate audio;
    it is NOT linked into or shipped with the app — only the produced .m4a ship).
  - Voice: af_heart (warm en-US female; from voices-v1.0.bin, Apache-2.0).
  Project is non-commercial (Ethan): personal/non-commercial licensing is acceptable.

SETUP (macOS; system python3.14's pip is broken here — use uv + python3.12):
  brew install espeak-ng ffmpeg
  uv venv --python 3.12 ttsenv
  uv pip install --python ttsenv/bin/python kokoro-onnx soundfile
  # download model files next to this run:
  curl -L -o kokoro-v1.0.onnx  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
  curl -L -o voices-v1.0.bin   https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

RUN (from repo root):
  PHONEMIZER_ESPEAK_LIBRARY=/opt/homebrew/lib/libespeak-ng.dylib \
  ttsenv/bin/python app/scripts/generate-tts.py --model-dir . --app-web app/web

Text source of truth:
  - words:   app/web/audio/missing-audio.json  secretWords[].word (spoken == the word)
  - tasks/phrases: app/scripts/tts-text-manifest.json (child-friendly wording, TL-authored)

Encoding: loudnorm I=-16 LUFS, then alimiter limit=0.794 level=false (hard ~-2 dBFS
ceiling; level=false is REQUIRED — default level=true re-normalizes back to 0 dB and
would reintroduce clipping). Output: 24 kHz mono AAC 64k .m4a.
"""
import argparse, os, json, subprocess

VOICE = "af_heart"; SPEED = 0.95; LANG = "en-us"
# brew espeak-ng has a correct compiled-in data path; the pip espeakng_loader wheel
# bakes a CI-only path and fails at runtime — always point phonemizer at brew's lib.
BREWLIB = os.environ.get("PHONEMIZER_ESPEAK_LIBRARY", "/opt/homebrew/lib/libespeak-ng.dylib")
BREWDATA = os.environ.get("ESPEAK_DATA_PATH", "/opt/homebrew/share/espeak-ng-data")
AF = "loudnorm=I=-16:TP=-2.0:LRA=11,alimiter=limit=0.794:level=false"


def build_worklist(app_web, script_dir):
    work = []
    mj = json.load(open(os.path.join(app_web, "audio", "missing-audio.json")))
    for it in mj["secretWords"]:
        work.append((it["word"], it["path"]))
    tm = json.load(open(os.path.join(script_dir, "tts-text-manifest.json")))
    for v in tm["tasks"].values():
        work.append((v["text"], v["out"]))
    for v in tm["phrases"].values():
        work.append((v["text"], v["out"]))
    return work


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", default=".", help="dir holding kokoro-v1.0.onnx + voices-v1.0.bin")
    ap.add_argument("--app-web", default="app/web")
    args = ap.parse_args()
    script_dir = os.path.dirname(os.path.abspath(__file__))

    os.environ["PHONEMIZER_ESPEAK_LIBRARY"] = BREWLIB
    os.environ["ESPEAK_DATA_PATH"] = BREWDATA
    from phonemizer.backend.espeak.wrapper import EspeakWrapper
    EspeakWrapper.set_library(BREWLIB)
    from kokoro_onnx import Kokoro, EspeakConfig
    import soundfile as sf

    k = Kokoro(os.path.join(args.model_dir, "kokoro-v1.0.onnx"),
               os.path.join(args.model_dir, "voices-v1.0.bin"),
               espeak_config=EspeakConfig(lib_path=BREWLIB, data_path=BREWDATA))
    work = build_worklist(args.app_web, script_dir)
    tmp = os.path.join(args.model_dir, "_tts_tmp.wav")
    ok = 0
    for i, (text, rel) in enumerate(work, 1):
        out = os.path.join(args.app_web, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        samples, sr = k.create(text, voice=VOICE, speed=SPEED, lang=LANG)
        sf.write(tmp, samples, sr)
        subprocess.run(["ffmpeg", "-y", "-i", tmp, "-af", AF,
                        "-ar", "24000", "-ac", "1", "-c:a", "aac", "-b:a", "64k", out],
                       check=True, capture_output=True)
        ok += 1
        if i % 20 == 0:
            print(f"  ...{i}/{len(work)}", flush=True)
    os.path.exists(tmp) and os.remove(tmp)
    print(f"DONE {ok}/{len(work)} files (voice={VOICE} speed={SPEED} lang={LANG})")


if __name__ == "__main__":
    main()
