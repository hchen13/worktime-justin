#!/usr/bin/env python3
"""WTJ-20260706-008 + WTJ-20260706-011 — ASR-gated TTS generation wrapper.

WHY: Ethan has bounced CosyVoice3 audio twice (008 banana/press-m.zh misreads, 011's 85/100
ZH word batch) for reading the WRONG text. generate-tts-cosyvoice3.py's guardrails (no-silent,
duration band) catch *broken* audio but not *mispronounced/misread* audio — a perfectly clean,
non-silent clip that says the wrong word still passes those checks. This wrapper adds the
missing gate: every candidate clip is transcribed with Whisper and only shipped if the ASR
transcript actually matches the target text. If it doesn't, we reseed CosyVoice3 (sampling is
stochastic — same text+ref, different seed, different reading) and try again. Only a clip that
Whisper confirms as correct is ever encoded to the final .m4a; a target that never produces a
passing candidate within --max-attempts is recorded as FAIL and the run exits non-zero — same
no-silent-fallback discipline as generate-tts-cosyvoice3.py, extended to "no-misread-fallback".

REUSE (does not fork the master chain): this script does not redefine the encode chain, the
duration/RMS sanity band, the reference-trimming logic, or the worklist text sources — it
imports them from generate-tts-cosyvoice3.py (loaded by file path via importlib, since the
module's filename has hyphens and isn't a valid `import x` identifier; its top-level constants
and functions run fine on import because everything heavy lives inside main(), guarded by
`if __name__ == "__main__"`):
  AF, AF_SAFE, CLIP_CEIL_DB, SYS_PROMPT, DUR_MIN, DUR_MAX, RMS_FLOOR, peak_db(), trim_ref(),
  build_worklist() (secretWords EN words / EN tasks+phrases / ZH tasks+new).
This wrapper only ADDS: the ZH secretWordsZh "words" segment to the worklist (tag zhword:<k>,
ref="zh" — Chinese voice reading a Chinese word/label, per tts-text-manifest.zh.json "words"),
the ASR-gate loop itself, and an --audit mode for re-checking already-delivered files without
regenerating them.

Future reuse: 009/010/012 are expected to import/call this same script (same worklist tags,
same --only filtering) rather than fork it — keep changes here backward-compatible.

ASR MODEL CHOICE: whisper "small" (not "base"). Self-test (see PHASE 1 self-test evidence in
the WTJ-011 handoff card) showed "base" mis-transcribes isolated ASCII letters/digits embedded
in a Chinese carrier sentence (e.g. "按下字母 M！" -> base sometimes drops or garbles the "M"),
which is exactly the failure mode this gate exists to catch. "small" reliably keeps the letter/
digit in its ZH transcript. Overridable via --whisper-model for future faster/slower trade-offs.

MATCH RULE (match(target, asr, ref)):
  norm(s) = lowercase, keep only [a-z0-9] and CJK (\\u4e00-\\u9fff), strip everything else
  ratio   = difflib.SequenceMatcher(None, norm(target), norm(asr)).ratio()
  crit    = isolated ASCII letters/digits in target (not adjacent to another ASCII alnum char —
            i.e. embedded single chars like the "M" in "按下字母 M！", the misread-prone case);
            crit_ok = every crit char (lowercased) appears somewhere in norm(asr)
  ref=="words" (bare EN secret word) additionally requires the whole norm(target) to appear as
  a contiguous substring of norm(asr) (stronger than ratio alone — a partial-word ASR hit like
  "do" for "dog" must not pass just because the ratio happens to clear the floor)
  PASS iff ratio >= RATIO_MIN[ref] and crit_ok       RATIO_MIN: zh=0.5, en=0.6, words=0.6
  (thresholds picked via self-test against known-good/known-bad clips — see handoff card)

SELECTION among passing candidates (best-ratio; tie-break by pace; never ship a rushed ZH
clip when a better-paced passing candidate exists): ZH short utterances (task sentences AND
ZH word labels) target ~2.0-2.2s (background: Ethan rejected 1.28s ZH clips as "too rushed");
EN secret words target ~1.1-1.5s. See pick_best() below.

MUTEX: the CosyVoice3 env + model dir are shared across 008/009/010/011/012 coder worktrees.
Callers MUST hold /private/tmp/wtj-024/.cosy.lock (mkdir-as-lock) for the duration of any run
that touches the model — this script does not take the lock itself (kept a plain, composable
CLI tool); wrap invocations in the shell lock pattern documented in the WTJ-011 dispatch card.

RUN (from repo root / worktree root, using the shared CosyVoice3 python venv):
  /private/tmp/wtj-024/cosyvoice_env/bin/python app/scripts/generate-tts-asr-gated.py \\
    --model-dir /private/tmp/wtj-024/cosyvoice_models/Fun-CosyVoice3-0.5B \\
    --ref-dir /Users/claire/Documents/worktime-justin/dist-stage/024-cosyvoice3-reference \\
    --only word:dog,zhword:apple,zh-task:press-letter-a \\
    --out-web /tmp/asr-selftest --report /tmp/asr-selftest.json
  # audit already-delivered ZH words without regenerating passing ones:
  #   ... --only zhword: --audit --report /tmp/asr-audit.json
"""
import argparse
import difflib
import importlib.util
import json
import os
import re
import subprocess
import sys
import time

# Thresholds tuned against the PHASE 1 self-test batch (see WTJ-011 handoff card):
# with opencc Traditional->Simplified normalization in norm(), every *correct* ZH reading
# scores ~1.0, while a genuine misread of a 2-char word (observed: target 考拉 "koala"
# transcribed as 考了 "took a test", 1 of 2 chars matching) scores exactly 0.50. The original
# zh=0.5 shipped that misread; raising to 0.7 rejects it with margin while leaving correct
# multi-char readings (and the letter/digit task sentences, which score ~1.0) comfortably above.
RATIO_MIN = {"zh": 0.7, "en": 0.6, "words": 0.6}
# ZH short-utterance pace target: task sentences AND word labels alike (background: Ethan
# rejected a 1.28s ZH clip as too rushed; ~2.0-2.2s reads at a comfortable, unhurried pace).
TARGET_WINDOW = {"words": (1.1, 1.5), "zh": (2.0, 2.2)}
ZH_MIN_UNRUSHED = 1.5  # never ship a ZH clip faster than this if a slower passing candidate exists

_KEEP_RE = re.compile(r"[a-z0-9一-鿿]")
# isolated ASCII alnum char: not immediately adjacent (before/after) to another ASCII alnum
# char. Catches the embedded-letter/digit case ("按下字母 M！" -> "M") without flagging every
# letter of a whole EN word ("dog" -> d/o/g are each adjacent to another alnum, so none isolated).
_CRIT_RE = re.compile(r"(?<![A-Za-z0-9])[A-Za-z0-9](?![A-Za-z0-9])")


def _load_cosy3(script_dir):
    """Load generate-tts-cosyvoice3.py by path (its name has hyphens, not import-statement
    safe) to reuse its constants/functions without forking them. Safe: everything heavy in
    that module lives inside main(), guarded by `if __name__ == "__main__"`."""
    path = os.path.join(script_dir, "generate-tts-cosyvoice3.py")
    spec = importlib.util.spec_from_file_location("_cosy3_base", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


try:
    # Whisper's ZH transcription defaults to Traditional characters for plenty of common
    # words (e.g. our "苹果" target comes back as "蘋果" — same word, same pinyin, different
    # script) even though every ZH target text in this project is Simplified. Caught by PHASE 1
    # self-test: zhword:apple scored ratio=0.50 (right at the RATIO_MIN edge) purely because
    # "苹" != "蘋" as codepoints, despite the clip being a perfectly correct reading. Converting
    # both sides to Simplified before diffing removes this false-negative risk entirely.
    import opencc as _opencc
    _T2S = _opencc.OpenCC("t2s").convert
except Exception:
    _T2S = lambda s: s  # opencc not installed in this interpreter; the real ASR-gated run
                         # (cosyvoice_env) has opencc-python-reimplemented installed for this.

try:
    # Homophone rescue for ZH: Whisper routinely transcribes a correct reading with a WRONG but
    # identically-pronounced character — 牦牛(yak, máoniú) came back as "毛牛"(máoniú), 猫(māo) as
    # "毛"(máo). The clip's SOUND is correct (which is all a child hears); only the character
    # Whisper chose differs. Comparing toneless pinyin syllables catches this: 牦牛/毛牛 both ->
    # ['mao','niu'] (pass), while a genuine misread stays distinct — 考拉/考了 -> ['kao','la'] vs
    # ['kao','le'], 鹌鹑/安全 -> ['an','chun'] vs ['an','quan'] (both correctly rejected). Toneless
    # (not tone-aware) because Whisper's homophone substitution carries the wrong char's tone.
    from pypinyin import lazy_pinyin as _lazy_pinyin
    def _pinyin_syllables(s):
        return [p for p in _lazy_pinyin(_T2S(s)) if re.fullmatch(r"[a-z]+", p)]
except Exception:
    def _pinyin_syllables(s):  # pypinyin absent in this interpreter; the real ASR-gated run
        return []              # (cosyvoice_env) has pypinyin installed, so the rescue is active there.


def norm(s):
    return "".join(_KEEP_RE.findall(_T2S(s).lower()))


def crit_chars(target):
    return _CRIT_RE.findall(target)


def match(target, asr, ref):
    """Return (passed: bool, ratio: float)."""
    t, a = norm(target), norm(asr)
    if not a:
        return False, 0.0
    ratio = difflib.SequenceMatcher(None, t, a).ratio()
    crit_ok = all(c.lower() in a for c in crit_chars(target))
    if ref == "words":
        # Exact match, not substring: PHASE 1 self-test caught word:oven passing against ASR
        # text "Hoven" (norm "hoven") because the spec's original "whole word present in a"
        # rule was substring containment, and "oven" IS a substring of "hoven" — a clean miss
        # disguised as a hit. A bare single-word target has no room for legitimate extra
        # characters, so require the normalized ASR text to equal the normalized target exactly.
        crit_ok = crit_ok and (t == a)
    passed = ratio >= RATIO_MIN.get(ref, 0.6) and crit_ok
    # Toneless-pinyin homophone rescue (ZH only, and only when the critical ASCII letters/digits
    # are already present — so it can never paper over a wrong embedded "M"/"3"). An exact
    # toneless-syllable match means the clip sounds like the target even if Whisper spelled it
    # with a homophone character; that is a correct reading, so accept it at full confidence.
    if not passed and crit_ok and ref == "zh":
        tp = _pinyin_syllables(target)
        if tp and tp == _pinyin_syllables(asr):
            passed, ratio = True, 1.0
    return passed, ratio


def pick_best(passing, ref):
    """passing: list of dicts with at least 'ratio' and 'dur'. Priority:
    1) if ref is zh and some passing candidate is paced >= ZH_MIN_UNRUSHED, drop the rushed
       ones from consideration entirely (never ship a rushed clip when a better-paced one
       also passed ASR) — only fall back to the full pool if ALL passing candidates are rushed.
    2) highest ratio.
    3) tie -> duration closest to this ref's target-window center.
    """
    pool = passing
    if ref == "zh":
        slow_enough = [p for p in pool if p["dur"] >= ZH_MIN_UNRUSHED]
        if slow_enough:
            pool = slow_enough
    best_ratio = max(p["ratio"] for p in pool)
    top = [p for p in pool if p["ratio"] == best_ratio]
    if len(top) > 1:
        window = TARGET_WINDOW.get(ref)
        if window:
            center = sum(window) / 2
            top.sort(key=lambda p: abs(p["dur"] - center))
    return top[0]


def build_worklist_ext(cosy3, app_web, script_dir):
    """cosy3.build_worklist() + the ZH secretWordsZh "words" segment (not in the base script)
    + the ZH "phrases" segment (WTJ-20260707-003: the "找到" find-prefix phrase — the one
    sanctioned exception to the ZH no-runtime-concat red line, see tts-text-manifest.zh.json
    _note; still not in the base cosy3.build_worklist(), which only reads the base script's
    own EN phrases + ZH tasks/tasksPending)."""
    work = cosy3.build_worklist(app_web, script_dir)
    zt = json.load(open(os.path.join(script_dir, "tts-text-manifest.zh.json"), encoding="utf-8"))
    for k, v in zt.get("words", {}).items():
        work.append((v["text"], v["out"], "zh", f"zhword:{k}"))
    for k, v in zt.get("phrases", {}).items():
        work.append((v["text"], v["out"], "zh", f"zh-phrase:{k}"))
    return work


def probe_duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                           "-of", "default=noprint_wrappers=1:nokey=1", path],
                          capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return None


def encode(tmp_wav, out, cosy3):
    """Identical master chain to generate-tts-cosyvoice3.py: loudnorm->alimiter->AAC 24k mono
    64k, with the same peak self-heal re-encode on clip-ceiling breach. Not modified here."""
    subprocess.run(["ffmpeg", "-y", "-i", tmp_wav, "-af", cosy3.AF, "-ar", "24000", "-ac", "1",
                    "-c:a", "aac", "-b:a", "64k", out], check=True, capture_output=True)
    pk = cosy3.peak_db(out)
    if pk is not None and pk > cosy3.CLIP_CEIL_DB:
        subprocess.run(["ffmpeg", "-y", "-i", tmp_wav, "-af", cosy3.AF_SAFE, "-ar", "24000",
                        "-ac", "1", "-c:a", "aac", "-b:a", "64k", out], check=True, capture_output=True)


def gen_and_gate(cosy, whisper_model, ref, text, tag, rk, workdir, args, torch, torchaudio,
                 cosy3, set_seed_fn):
    """Run the reseed/ASR-gate loop for one work item. Returns (passing_list, attempts_log)."""
    lang = {"zh": "zh", "en": "en", "words": "en"}[rk]
    passing, attempts_log = [], []
    safe_tag = re.sub(r"[^A-Za-z0-9]+", "_", tag)
    for attempt in range(args.max_attempts):
        seed = args.seed_base + attempt
        set_seed_fn(seed)
        entry = {"seed": seed}
        try:
            chunks = [o["tts_speech"] for o in
                      cosy.inference_zero_shot(text, ref["prompt_text"], ref["wav"], stream=False)]
            if not chunks:
                raise RuntimeError("no audio chunks yielded")
            speech = torch.cat(chunks, dim=1)
        except Exception as e:
            entry["error"] = f"{type(e).__name__}: {e}"
            attempts_log.append(entry)
            print(f"  [{tag}] seed={seed} GEN-FAIL {entry['error']}", flush=True)
            continue
        dur = speech.shape[1] / cosy.sample_rate
        rms = float(speech.pow(2).mean().sqrt().item())
        entry["dur"] = round(dur, 3)
        entry["rms"] = round(rms, 5)
        if dur < cosy3.DUR_MIN or dur > cosy3.DUR_MAX:
            entry["rejected"] = "duration-out-of-band"
            attempts_log.append(entry)
            print(f"  [{tag}] seed={seed} REJECT duration={dur:.2f}s", flush=True)
            continue
        if rms <= cosy3.RMS_FLOOR:
            entry["rejected"] = "silent"
            attempts_log.append(entry)
            print(f"  [{tag}] seed={seed} REJECT silent rms={rms:.6f}", flush=True)
            continue
        cand_path = os.path.join(workdir, f"_cand_{safe_tag}_{seed}.wav")
        torchaudio.save(cand_path, speech, cosy.sample_rate)
        asr_text = whisper_model.transcribe(cand_path, language=lang, fp16=False)["text"].strip()
        ok, ratio = match(text, asr_text, rk)
        entry["asr"] = asr_text
        entry["ratio"] = round(ratio, 3)
        entry["match"] = ok
        attempts_log.append(entry)
        print(f"  [{tag}] seed={seed} dur={dur:.2f}s ratio={ratio:.2f} match={ok} asr={asr_text!r}", flush=True)
        if ok:
            passing.append({"seed": seed, "dur": dur, "wav": cand_path, "asr": asr_text, "ratio": ratio})
        else:
            try:
                os.remove(cand_path)
            except OSError:
                pass
        if len(passing) >= args.candidates:
            break
    return passing, attempts_log


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cosyvoice-repo", default="/private/tmp/wtj-024/CosyVoice")
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--ref-dir", required=True, help="dir with Ethan's <key>.wav + <key>.prompt.txt (read-only)")
    ap.add_argument("--app-web", default="app/web", help="READ dir (text sources)")
    ap.add_argument("--out-web", default=None, help="WRITE dir (defaults to --app-web; set a scratch dir to test)")
    ap.add_argument("--script-dir", default="app/scripts")
    ap.add_argument("--workdir", default="/private/tmp/wtj-011-asrwork",
                     help="scratch dir for trimmed refs + candidate wavs (NEVER inside the shared "
                          "main checkout, even though --ref-dir points there for read)")
    ap.add_argument("--report", default=None)
    ap.add_argument("--only", default="", help="comma-separated substrings on tag (testing subset)")
    ap.add_argument("--whisper-model", default="small", help="openai-whisper model size (default: small; "
                     "'base' unreliably transcribes isolated ASCII letters/digits embedded in ZH text)")
    ap.add_argument("--max-attempts", type=int, default=8)
    ap.add_argument("--candidates", type=int, default=3, help="stop reseeding once this many candidates pass ASR")
    ap.add_argument("--seed-base", type=int, default=42)
    ap.add_argument("--audit", action="store_true",
                     help="for items whose --out-web file already exists non-empty: ASR-check the EXISTING "
                          "file first; if it passes, skip (do not touch/regenerate); only regenerate if the "
                          "existing file fails ASR (confirmed misread)")
    args = ap.parse_args()
    out_web = args.out_web or args.app_web

    sys.path.insert(0, args.cosyvoice_repo)
    sys.path.insert(0, os.path.join(args.cosyvoice_repo, "third_party/Matcha-TTS"))
    import torch
    import torchaudio
    import whisper
    from cosyvoice.cli.cosyvoice import AutoModel
    from cosyvoice.utils.common import set_all_random_seed
    cosy3_common_seed = set_all_random_seed

    script_dir = os.path.abspath(args.script_dir)
    cosy3_mod = _load_cosy3(script_dir)

    work = build_worklist_ext(cosy3_mod, args.app_web, args.script_dir)
    if args.only:
        subs = [s.strip() for s in args.only.split(",") if s.strip()]
        work = [w for w in work if any(s in w[3] for s in subs)]
    if not work:
        print("no work items (check --only filter)"); sys.exit(1)

    os.makedirs(args.workdir, exist_ok=True)
    refs = {}
    for key in sorted(set(w[2] for w in work)):
        tpath = os.path.join(args.ref_dir, f"{key}.prompt.txt")
        wpath = os.path.join(args.ref_dir, f"{key}.wav")
        if not (os.path.exists(tpath) and os.path.exists(wpath)):
            print(f"FATAL: missing reference {key}.wav / {key}.prompt.txt in {args.ref_dir}"); sys.exit(2)
        refs[key] = {
            "wav": cosy3_mod.trim_ref(args.ref_dir, args.workdir, key),
            "prompt_text": cosy3_mod.SYS_PROMPT + open(tpath, encoding="utf-8").read().strip(),
        }
        print(f"ref[{key}] trimmed prompt_wav ready", flush=True)

    print(f"Loading whisper[{args.whisper_model}] ...", flush=True)
    whisper_model = whisper.load_model(args.whisper_model)

    print(f"Loading CosyVoice3 from {args.model_dir} ...", flush=True)
    t0 = time.time()
    cosy = AutoModel(model_dir=args.model_dir)
    print(f"loaded in {time.time()-t0:.1f}s  sample_rate={cosy.sample_rate}", flush=True)

    ok, audited_ok, fails = [], [], []
    t_run = time.time()
    for i, (text, rel, rk, tag) in enumerate(work, 1):
        out = os.path.join(out_web, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        lang = {"zh": "zh", "en": "en", "words": "en"}[rk]

        if args.audit and os.path.exists(out) and os.path.getsize(out) > 0:
            asr_text = whisper_model.transcribe(out, language=lang, fp16=False)["text"].strip()
            audit_ok, ratio = match(text, asr_text, rk)
            if audit_ok:
                dur = probe_duration(out)
                audited_ok.append({"tag": tag, "target": text, "asr_text": asr_text,
                                    "ratio": round(ratio, 3), "dur": dur})
                print(f"AUDIT-OK  {tag}: {text!r} asr={asr_text!r} ratio={ratio:.2f} (kept, not regenerated)", flush=True)
                continue
            print(f"AUDIT-FAIL {tag}: {text!r} asr={asr_text!r} ratio={ratio:.2f} -> regenerating (confirmed misread)", flush=True)

        passing, attempts_log = gen_and_gate(cosy, whisper_model, refs[rk], text, tag, rk,
                                              args.workdir, args, torch, torchaudio,
                                              cosy3_mod, cosy3_common_seed)
        if not passing:
            fails.append({"tag": tag, "text": text, "attempts": len(attempts_log),
                          "attempts_log": attempts_log, "error": "no ASR-passing candidate within max-attempts"})
            print(f"FAIL {tag} {text!r}: no ASR-passing candidate in {len(attempts_log)} attempts", flush=True)
            continue

        chosen = pick_best(passing, rk)
        encode(chosen["wav"], out, cosy3_mod)
        ok.append({"tag": tag, "text": text, "out": rel, "ref": rk,
                   "chosen_seed": chosen["seed"], "attempts": len(attempts_log),
                   "asr_text": chosen["asr"], "ratio": round(chosen["ratio"], 3),
                   "dur": round(chosen["dur"], 3), "target": text})
        print(f"OK {i}/{len(work)} {tag}: seed={chosen['seed']} dur={chosen['dur']:.2f}s "
              f"ratio={chosen['ratio']:.2f} asr={chosen['asr']!r}", flush=True)

        # clean up all candidate scratch wavs for this tag (chosen one already encoded to `out`)
        for p in passing:
            try:
                os.remove(p["wav"])
            except OSError:
                pass

    print(f"\nDONE {len(ok)} generated, {len(audited_ok)} audited-kept, {len(fails)} fail "
          f"({time.time()-t_run:.0f}s)")
    if args.report:
        json.dump({"ok": ok, "audited_ok": audited_ok, "fail": fails,
                   "model": args.model_dir, "whisper_model": args.whisper_model,
                   "seed_base": args.seed_base, "max_attempts": args.max_attempts,
                   "candidates": args.candidates},
                  open(args.report, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"report -> {args.report}")
    if fails:
        print("FAILURES (no-misread-fallback: these did NOT ship a file):")
        for f in fails:
            print(f"  {f['tag']}: {f['error']}")
        sys.exit(1)


if __name__ == "__main__":
    main()
