#!/usr/bin/env python3
"""Generate "找到 + 中文词卡" combined preview clips (WTJ-20260708-004).

Docs zero-JS constraint means the design-review audio preview cannot chain two
<audio> clips in JS. To let Ethan hear the REAL "找到 + <word>" concatenation the
find-object task plays at runtime (task-templates.js playComposite: find.zh then
words/<word>.zh.m4a, sequentially), this pre-concatenates the EXACT WTJ-20260708-004
trimmed assets into one clip per ZH-delivered word, written under
docs/assets/audio-preview/find-<word>.zh.m4a.

No new/placeholder audio: inputs are strictly audio/phrases/find.zh.m4a +
audio/words/<word>.zh.m4a (both already committed/trimmed). The natural gap comes
from find.zh's 0.12s trail pad + the word's 0.08s lead pad — same spacing the app
gives, so the preview matches the runtime combo.

Usage: python3 app/scripts/gen-find-combo-preview.py [--only word1,word2]
Exit 0 on success, 2 on infra error.
"""
from __future__ import annotations
import argparse, json, subprocess, sys, tempfile, os
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FIND_ZH = REPO / "app/web/audio/phrases/find.zh.m4a"
WORDS_DIR = REPO / "app/web/audio/words"
OUT_DIR = REPO / "docs/assets/audio-preview"
MISSING = REPO / "app/web/audio/missing-audio.json"

# WTJ-20260708-004 返工（Ethan 拒收组合中间停顿）：组合的中间空隙 = 运行时空隙 = find.zh 尾静音 +
# 词卡首静音。修法在**源文件**收紧这两处（find.zh 尾 + 词卡首留白 → ~0.05s，见本卡返工 trim 步骤），
# 使 app 运行时与本预览的「找到X」衔接都变自然（~0.10s 自然短语间隔），本脚本只做忠实的顺序拼接。


def zh_delivered_words() -> list[str]:
    data = json.loads(MISSING.read_text(encoding="utf-8"))
    return sorted(e["word"] for e in data.get("secretWordsZh", []) if e.get("status") == "delivered")


def concat(find_zh: Path, word_zh: Path, out: Path) -> bool:
    # Plain sequential concat of the EXACT runtime clips (find.zh then word.zh) — the combo
    # preview is a faithful reproduction of what task-templates.js playComposite plays at
    # runtime. The natural mid-combo gap therefore equals the runtime gap = find.zh's trailing
    # silence + the word's leading silence; both are trimmed at the source (WTJ-20260708-004
    # 返工: find.zh trail and word-card leads re-tightened to ~0.05s so this join is ~0.10s,
    # not the ~0.30s Ethan rejected). Re-encode AAC 24k mono 96k (matches source family).
    fd, tmp = tempfile.mkstemp(suffix=".m4a", dir=str(out.parent)); os.close(fd)
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", str(find_zh), "-i", str(word_zh),
         "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[a]", "-map", "[a]",
         "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1", "-movflags", "+faststart", tmp],
        capture_output=True, text=True)
    if proc.returncode != 0:
        os.unlink(tmp)
        sys.stderr.write((proc.stderr or "ffmpeg failed").splitlines()[-1] + "\n")
        return False
    os.replace(tmp, out)
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated word subset")
    args = ap.parse_args()
    if not FIND_ZH.is_file():
        print(f"INFRA: missing {FIND_ZH}", file=sys.stderr); return 2
    words = zh_delivered_words()
    if args.only:
        want = set(w.strip() for w in args.only.split(","))
        words = [w for w in words if w in want]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ok = skipped = 0
    for w in words:
        wz = WORDS_DIR / f"{w}.zh.m4a"
        if not wz.is_file():
            print(f"skip {w}: no {wz.name}", file=sys.stderr); skipped += 1; continue
        out = OUT_DIR / f"find-{w}.zh.m4a"
        if concat(FIND_ZH, wz, out):
            ok += 1
        else:
            skipped += 1
    print(f"generated {ok} combined clips -> {OUT_DIR.relative_to(REPO)} ({skipped} skipped)")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
