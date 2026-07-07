#!/usr/bin/env python3
"""WTJ-20260705-024 — full product TTS regeneration with CosyVoice 3 zero-shot, cloning
Ethan's self-recorded reference voice.

Replaces the Kokoro route (generate-tts.py EN / generate-tts-zh.py ZH). It REUSES the same
text sources, the same loudnorm->alimiter->AAC master chain, and the same output paths, so
the only thing that changes is the voice model + identity:
  - words:            app/web/audio/missing-audio.json  secretWords[].{word,path}
  - EN tasks/phrases: app/scripts/tts-text-manifest.json  tasks{}/phrases{}
  - ZH tasks:         app/scripts/tts-text-manifest.zh.json  tasks{}  (24)
  - ZH new (025):     app/scripts/tts-text-manifest.zh.json  tasksPending{}  (8 door/bell/drag)

Voice: CosyVoice 3 (Fun-CosyVoice3-0.5B, Apache-2.0) zero-shot, cloning Ethan's OWN reference
recordings (dist-stage/024-cosyvoice3-reference/, self-consent — production-legal for this
personal, non-commercial kiosk). Length-matched reference per target:
  EN words -> words.wav ; EN tasks/phrases -> en.wav ; ZH tasks(+new) -> zh.wav.
Each Ethan clip is silence-trimmed (its ~3s record lead-in is stripped) into a clean prompt_wav.

CosyVoice 3's LLM HARD-ASSERTS the <|endofprompt|> token in prompt_text (cosyvoice/llm/llm.py),
so prompt_text = "You are a helpful assistant.<|endofprompt|>" + the clip's transcript.
Determinism: set_all_random_seed(42) before each item (CosyVoice sampling is otherwise stochastic).

no-silent-fallback (mirrors generate-tts-zh.py guardrails): every item is validated non-silent
(rms > 1e-4) and in a sane duration band before encoding; a failure is recorded and the run
exits non-zero — it never ships a missing/silent/truncated .m4a.

Encoding: loudnorm I=-16 LUFS then alimiter limit=0.794 level=false (level=false REQUIRED),
24 kHz mono AAC 64k .m4a — byte-identical chain to the Kokoro scripts.

RUN (from repo root, using the CosyVoice3 python venv):
  /private/tmp/wtj-024/cosyvoice_env/bin/python app/scripts/generate-tts-cosyvoice3.py \
    --model-dir /private/tmp/wtj-024/cosyvoice_models/Fun-CosyVoice3-0.5B \
    --ref-dir dist-stage/024-cosyvoice3-reference \
    --report /tmp/cosyvoice3-regen-report.json
  # test a few first (writes to a scratch dir, does not touch app/web):
  #   ... --only word:dog,en-phrase:find,zh-new:click-door-open --out-web /tmp/cosyvoice3-test
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time

SEED = 42
AF = "loudnorm=I=-16:TP=-2.0:LRA=11,alimiter=limit=0.794:level=false"
# Extra-headroom fallback for the rare clip whose AAC inter-sample overshoot breaches the
# clip ceiling (documented artifact, see SOURCE-LICENSES.md SFX note). Same chain, tighter limit.
AF_SAFE = "loudnorm=I=-16:TP=-2.0:LRA=11,alimiter=limit=0.75:level=false"
CLIP_CEIL_DB = -0.1            # check_audio_assets flags max_volume > this as 峰值过载
SYS_PROMPT = "You are a helpful assistant.<|endofprompt|>"
DUR_MIN, DUR_MAX = 0.2, 12.0   # sane band for a short child-facing word/sentence
RMS_FLOOR = 1e-4               # rms <= this => silent (mic/model failure), never ship


def peak_db(path):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "volumedetect",
                          "-f", "null", "-"], capture_output=True, text=True)
    m = re.search(r"max_volume:\s*(-?\d+\.?\d*)\s*dB", out.stderr)
    return float(m.group(1)) if m else None


def trim_ref(ref_dir, workdir, key):
    """Strip lead/tail silence from Ethan's clip -> clean 16 kHz mono prompt_wav.
    (The capture script records a ~3s silent lead-in; the transcript has no silence, so an
    untrimmed prompt_wav would be longer than its prompt_text and degrade the clone.)"""
    src = os.path.join(ref_dir, f"{key}.wav")
    dst = os.path.join(workdir, f"{key}.trimmed.wav")
    sr = ("silenceremove=start_periods=1:start_silence=0.08:start_threshold=-45dB")
    af = f"{sr},areverse,{sr},areverse"
    subprocess.run(["ffmpeg", "-y", "-i", src, "-af", af, "-ar", "16000", "-ac", "1", dst],
                   check=True, capture_output=True)
    return dst


def build_worklist(app_web, script_dir):
    """(text, out_rel, ref_key, tag) — reuses the exact Kokoro-script text sources."""
    work = []
    mj = json.load(open(os.path.join(app_web, "audio", "missing-audio.json"), encoding="utf-8"))
    for it in mj["secretWords"]:
        work.append((it["word"], it["path"], "words", f"word:{it['word']}"))
    tm = json.load(open(os.path.join(script_dir, "tts-text-manifest.json"), encoding="utf-8"))
    for k, v in tm["tasks"].items():
        work.append((v["text"], v["out"], "en", f"en-task:{k}"))
    for k, v in tm["phrases"].items():
        work.append((v["text"], v["out"], "en", f"en-phrase:{k}"))
    zt = json.load(open(os.path.join(script_dir, "tts-text-manifest.zh.json"), encoding="utf-8"))
    for k, v in zt["tasks"].items():
        work.append((v["text"], v["out"], "zh", f"zh-task:{k}"))
    for k, v in zt.get("tasksPending", {}).items():
        work.append((v["text"], v["out"], "zh", f"zh-new:{k}"))
    return work


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cosyvoice-repo", default="/private/tmp/wtj-024/CosyVoice")
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--ref-dir", required=True, help="dir with Ethan's <key>.wav + <key>.prompt.txt")
    ap.add_argument("--app-web", default="app/web", help="READ dir (text sources)")
    ap.add_argument("--out-web", default=None, help="WRITE dir (defaults to --app-web; set a scratch dir to test)")
    ap.add_argument("--script-dir", default="app/scripts")
    ap.add_argument("--report", default=None)
    ap.add_argument("--only", default="", help="comma-separated substrings on tag (testing subset)")
    args = ap.parse_args()
    out_web = args.out_web or args.app_web

    sys.path.insert(0, args.cosyvoice_repo)
    sys.path.insert(0, os.path.join(args.cosyvoice_repo, "third_party/Matcha-TTS"))
    import torch
    import torchaudio
    from cosyvoice.cli.cosyvoice import AutoModel
    from cosyvoice.utils.common import set_all_random_seed

    work = build_worklist(args.app_web, args.script_dir)
    if args.only:
        subs = [s.strip() for s in args.only.split(",") if s.strip()]
        work = [w for w in work if any(s in w[3] for s in subs)]
    if not work:
        print("no work items (check --only filter)"); sys.exit(1)

    workdir = os.path.join(args.ref_dir, "_prompt_work")
    os.makedirs(workdir, exist_ok=True)
    refs = {}
    for key in sorted(set(w[2] for w in work)):
        tpath = os.path.join(args.ref_dir, f"{key}.prompt.txt")
        wpath = os.path.join(args.ref_dir, f"{key}.wav")
        if not (os.path.exists(tpath) and os.path.exists(wpath)):
            print(f"FATAL: missing reference {key}.wav / {key}.prompt.txt in {args.ref_dir}"); sys.exit(2)
        refs[key] = {
            "wav": trim_ref(args.ref_dir, workdir, key),
            "prompt_text": SYS_PROMPT + open(tpath, encoding="utf-8").read().strip(),
        }
        print(f"ref[{key}] trimmed prompt_wav ready", flush=True)

    print(f"Loading CosyVoice3 from {args.model_dir} ...", flush=True)
    t0 = time.time()
    cosy = AutoModel(model_dir=args.model_dir)
    print(f"loaded in {time.time()-t0:.1f}s  sample_rate={cosy.sample_rate}", flush=True)

    tmp = os.path.join(workdir, "_gen_tmp.wav")
    ok, fails = [], []
    t_run = time.time()
    for i, (text, rel, rk, tag) in enumerate(work, 1):
        out = os.path.join(out_web, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        try:
            set_all_random_seed(SEED)
            chunks = [o["tts_speech"] for o in
                      cosy.inference_zero_shot(text, refs[rk]["prompt_text"], refs[rk]["wav"], stream=False)]
            if not chunks:
                raise RuntimeError("no audio chunks yielded")
            speech = torch.cat(chunks, dim=1)
            dur = speech.shape[1] / cosy.sample_rate
            rms = float(speech.pow(2).mean().sqrt().item())
            if dur < DUR_MIN or dur > DUR_MAX:
                raise RuntimeError(f"duration {dur:.2f}s out of {DUR_MIN}-{DUR_MAX}s band")
            if rms <= RMS_FLOOR:
                raise RuntimeError(f"silent (rms={rms:.6f})")
            torchaudio.save(tmp, speech, cosy.sample_rate)
            subprocess.run(["ffmpeg", "-y", "-i", tmp, "-af", AF, "-ar", "24000", "-ac", "1",
                            "-c:a", "aac", "-b:a", "64k", out], check=True, capture_output=True)
            # AAC inter-sample overshoot guard: if the encoded peak breaches the clip ceiling,
            # re-encode with more limiter headroom (AF_SAFE) — reproducible, no manual post-fix.
            pk = peak_db(out)
            if pk is not None and pk > CLIP_CEIL_DB:
                subprocess.run(["ffmpeg", "-y", "-i", tmp, "-af", AF_SAFE, "-ar", "24000", "-ac", "1",
                                "-c:a", "aac", "-b:a", "64k", out], check=True, capture_output=True)
            ok.append({"tag": tag, "text": text, "out": rel, "ref": rk,
                       "dur": round(dur, 3), "rms": round(rms, 5)})
            if i % 10 == 0 or i == len(work):
                print(f"  ...{i}/{len(work)} ({tag})  elapsed={time.time()-t_run:.0f}s", flush=True)
        except Exception as e:
            fails.append({"tag": tag, "text": text, "error": f"{type(e).__name__}: {e}"})
            print(f"FAIL {tag} {text!r}: {type(e).__name__}: {e}", flush=True)
    os.path.exists(tmp) and os.remove(tmp)

    print(f"\nDONE {len(ok)}/{len(work)} ok, {len(fails)} fail "
          f"(CosyVoice3 zero-shot, seed={SEED}, {time.time()-t_run:.0f}s)")
    if args.report:
        json.dump({"ok": ok, "fail": fails, "model": args.model_dir, "seed": SEED},
                  open(args.report, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"report -> {args.report}")
    if fails:
        print("FAILURES (no-silent-fallback: these did NOT ship a file):")
        for f in fails:
            print(f"  {f['tag']}: {f['error']}")
        sys.exit(1)


if __name__ == "__main__":
    main()
