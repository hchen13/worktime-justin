#!/usr/bin/env python3
"""Capture screenshots + layout probes for the requirements doc (docs/index.html).

Owned by QA visual track (WTJ-20260703-003). Screenshot precondition for the
visual cases DOCQC-008..012 (tests/visual/cases/), and scripted probe layer for
the hybrid cases DOCQC-009 (text_contrast_aa) / DOCQC-012 (all_images_load,
no_failed_requests, images_have_alt).

Two-tier gating (important — read before grading screenshots)
-------------------------------------------------------------
* HARD GATE (screenshot validity): horizontal overflow, broken images,
  failed requests, pageerror, segment truncation, title/viewport meta.
  Any hard-gate failure means the capture itself is unreliable:
  - exit code 1
  - `out/GATE_FAILED` marker file is written
  - all screenshots are moved to `out/quarantine/` so they cannot be graded
    by accident. Visual grading MUST first confirm GATE_FAILED does not exist.
* ADVISORY (per-case script layer, does NOT invalidate screenshots):
  - text_contrast_aa  -> owns DOCQC-009's script-layer verdict only
  - images_have_alt   -> owns DOCQC-012's script-layer verdict only
  - no_console_errors -> reference for DOCQC-012 (authoritative check lives in
    tests/e2e DOCQC-003)
  Advisory failures affect ONLY the owning case's conclusion; all other visual
  cases (008/010/011) proceed on the valid screenshots. Exit code 3 signals
  "screenshots valid, advisory red".

What it does
------------
1. Deletes and recreates the output dir (stale segments from a previous run
   must never be graded), records sha256 of the doc bytes in probes.json.
2. Opens docs/index.html via file:// in headless Chromium (playwright, already
   installed in this environment; zero extra deps).
3. Freezes CSS animations/transitions before capture so screenshots are
   deterministic (the doc's wireframe letters animate to opacity 0 — an
   unfrozen capture can randomly show an "empty" wireframe and produce
   false visual failures).
4. For each profile (desktop 1440x900, mobile 390x844):
   - screenshots: first screen (viewport), full page, and full-page
     *segments* of one viewport-height each (visual subagents cannot read
     a 20000px-tall image; feed them the segments in order instead).
     The authoritative segment set is `screenshots.segments` in probes.json —
     never glob the segments dir.
   - probes: horizontal overflow, broken images, image inventory,
     page title, console errors, pageerrors, text contrast
5. Contrast probing measures the REAL background: for every sampled text
   element it reads the median pixel color around/behind the element's bbox
   from the captured full-page PNG (pixels close to the normalized text color
   are excluded first). This natively supports gradients, images and any CSS
   color space as background. The foreground color is normalized inside the
   browser by rendering the computed color onto a 1x1 canvas and reading the
   pixel back, so oklch()/color(display-p3 ...) etc. are evaluated instead of
   silently skipped. text_contrast_aa only passes if at least 1 sample was
   actually evaluated; unmeasurable samples land in a `skipped` list and are
   printed as warnings.
6. Writes screenshots + probes.json to tests/reports/docs-qc/.

Exit codes: 0 = all green; 1 = hard gate failed (screenshots quarantined,
do not grade); 3 = hard gate passed but advisory checks failed (grade
visuals normally; only DOCQC-009/012 script layers are red).

Usage
-----
    python3 tests/visual/scripts/capture_docs.py [--doc PATH] [--out DIR]

Robustness contract (do NOT couple to the seed draft's DOM)
-----------------------------------------------------------
- Probes only rely on universal facts: <img> elements resolving, no
  horizontal scroll, measured pixel color of text vs its real background.
- No selector here assumes a specific class name; sampling is generic
  (text-bearing elements). Unmeasurable samples degrade to "skipped",
  never to a failure.
- Expected minimum image count comes from
  tests/fixtures/docqc_requirement_domains.json -> expectations.min_images
  (default 1). min_images: 0 means an image-free doc (e.g. TL switches the
  mocks to inline SVG) legitimately passes all_images_load with an empty set.

Fallback if playwright is ever unavailable
------------------------------------------
    "Google Chrome" --headless=new --window-size=1440,900 \
        --screenshot=out.png file:///.../docs/index.html
(then run image/overflow checks manually; probes.json will be absent).
"""

import argparse
import base64
import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DOC = REPO_ROOT / "docs" / "index.html"
DEFAULT_OUT = REPO_ROOT / "tests" / "reports" / "docs-qc"
FIXTURE = REPO_ROOT / "tests" / "fixtures" / "docqc_requirement_domains.json"

SEGMENT_CAP = 40  # hard sanity cap; exceeding it is a HARD GATE failure

PROFILES = [
    {"name": "desktop", "width": 1440, "height": 900},
    {"name": "mobile", "width": 390, "height": 844},
]

ADVISORY_OWNERS = {
    "text_contrast_aa": "DOCQC-009",
    "images_have_alt": "DOCQC-012",
    "no_console_errors": "DOCQC-012 (authoritative: e2e DOCQC-003)",
}

FREEZE_CSS = """
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
}
html { scroll-behavior: auto !important; }
"""

# Probe JS: only generic, refactor-safe facts about the document.
# Text samples carry document-coordinate rects (for pixel background
# measurement) and a canvas-normalized foreground color, so any CSS color
# space (oklch, color(display-p3 ...), lab, ...) is evaluated numerically.
PROBE_JS = """
() => {
  const de = document.documentElement;
  const imgs = [...document.querySelectorAll('img')].map(img => ({
    src: img.getAttribute('src'),
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    renderedWidth: Math.round(img.getBoundingClientRect().width),
    hasAlt: img.hasAttribute('alt'),
    alt: img.getAttribute('alt'),
  }));

  // Normalize any CSS color to numeric rgba by painting it on a 1x1 canvas
  // and reading the pixel back. Returns null for unparseable colors.
  const cv = document.createElement('canvas');
  cv.width = 1; cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  function normColor(css) {
    if (!css) return null;
    // invalid-color detection: an invalid fillStyle assignment is ignored,
    // so probe with two different presets and require agreement.
    const probe = (preset) => {
      cx.fillStyle = preset;
      cx.fillStyle = css;
      cx.clearRect(0, 0, 1, 1);
      cx.fillRect(0, 0, 1, 1);
      return [...cx.getImageData(0, 0, 1, 1).data];
    };
    const a = probe('#010203');
    const b = probe('#fdfeff');
    if (a.join(',') !== b.join(',')) return null;
    return [a[0], a[1], a[2], a[3] / 255];
  }

  // 有效背景签名：向上找最近的非透明 backgroundColor 或 backgroundImage 祖先。
  // 进入去重键后，同带同前景色但背景语境不同的元素不会互相遮蔽
  // （白底白字 vs 深底白字是不同 key），这是对"高对比元素遮蔽相邻低对比
  // 元素"逃逸路径的根治。
  function bgSig(el) {
    let n = el;
    while (n && n.nodeType === 1) {
      const c = getComputedStyle(n);
      if (c.backgroundImage && c.backgroundImage !== 'none') {
        return c.backgroundImage.slice(0, 60) + '|' + c.backgroundColor;
      }
      const bc = c.backgroundColor;
      if (bc && bc !== 'transparent' && !/rgba\([^)]*,\s*0\s*\)$/.test(bc)) {
        return bc;
      }
      n = n.parentElement;
    }
    return 'root';
  }

  const tags = ['p','li','td','th','h1','h2','h3','a','span','strong','div'];
  const samples = [];
  const seen = new Set();
  // 无全局采样硬顶：硬顶会被长文档前部耗尽，导致尾部新增的不可读文本完全
  // 漏采（文档是持续增长的移动目标，尾部恰是最新内容）。样本数由去重键
  // （前景样式 x 纵/横向带 x 背景签名）自然约束；SAMPLE_CEILING 只是防御
  // 恶意构造的安全阀，触顶不静默——sampleTruncated 会让探针 fail-safe 判红。
  const SAMPLE_CEILING = 800;
  let sampleTruncated = false;
  for (const el of document.querySelectorAll(tags.join(','))) {
    const direct = [...el.childNodes].some(
      n => n.nodeType === 3 && n.textContent.trim().length > 4);
    if (!direct) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (parseFloat(cs.opacity) < 0.15) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const yBand = Math.round((r.top + window.scrollY) / 700);
    const xBand = Math.round((r.left + window.scrollX) / 300);
    const key = cs.color + '|' + cs.fontSize + '|' + cs.fontWeight + '|'
      + yBand + '|' + xBand + '|' + bgSig(el);
    if (seen.has(key)) continue;
    if (samples.length >= SAMPLE_CEILING) { sampleTruncated = true; break; }
    seen.add(key);
    samples.push({
      text: el.textContent.trim().slice(0, 40),
      color: cs.color,
      colorRGBA: normColor(cs.color),
      fontSizePx: parseFloat(cs.fontSize),
      fontWeight: cs.fontWeight,
      rect: {
        x: r.left + window.scrollX,
        y: r.top + window.scrollY,
        w: r.width,
        h: r.height,
      },
    });
  }

  return {
    title: document.title,
    lang: de.getAttribute('lang'),
    hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
    scrollWidth: de.scrollWidth,
    clientWidth: de.clientWidth,
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body ? document.body.scrollWidth : null,
    pageCssWidth: de.clientWidth,
    pageCssHeight: de.scrollHeight,
    images: imgs,
    textSamples: samples,
    textSamplesTruncated: sampleTruncated,
  };
}
"""

# Background measurement JS: given the captured full-page PNG (data URL) and
# the sampled element rects, return the median pixel color around/behind each
# rect. Pixels close to the (known, normalized) text color are excluded so the
# median reflects the background even inside the glyph box.
BG_SAMPLE_JS = """
async (payload) => {
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('full-page png decode failed'));
    img.src = payload.png;
  });
  const sx = img.naturalWidth / payload.cssW;
  const sy = img.naturalHeight / payload.cssH;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const results = [];
  for (const s of payload.samples) {
    // 窗口向内收缩而不是外扩：外扩的 pad 会把相邻元素/父容器的像素混进
    // 窗口。白底白字这类 fg≈bg 的病例里，前景剔除会把文字和背景一起剔掉，
    // 只剩泄漏进来的邻居像素被当成"背景"——恰好把不可读判成高对比。
    const shrink = 2;
    let cx0 = s.x + shrink, cy0 = s.y + shrink;
    let cx1 = s.x + s.w - shrink, cy1 = s.y + s.h - shrink;
    if (cx1 - cx0 < 2 || cy1 - cy0 < 2) {           // 元素太小则不收缩
      cx0 = s.x; cy0 = s.y; cx1 = s.x + s.w; cy1 = s.y + s.h;
    }
    const x0 = Math.max(0, Math.floor(cx0 * sx));
    const y0 = Math.max(0, Math.floor(cy0 * sy));
    const x1 = Math.min(img.naturalWidth, Math.ceil(cx1 * sx));
    const y1 = Math.min(img.naturalHeight, Math.ceil(cy1 * sy));
    const w = x1 - x0, h = y1 - y0;
    if (w < 2 || h < 2) {
      results.push({ i: s.i, error: 'bbox outside captured image' });
      continue;
    }
    canvas.width = w; canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, x0, y0, w, h, 0, 0, w, h);
    let data;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch (e) {
      results.push({ i: s.i, error: 'getImageData failed: ' + e.message });
      continue;
    }
    const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 1600)));
    const rs = [], gs = [], bs = [];
    const rsAll = [], gsAll = [], bsAll = [];
    const fg = s.fg; // [r,g,b] or null
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const k = (y * w + x) * 4;
        const r = data[k], g = data[k + 1], b = data[k + 2];
        rsAll.push(r); gsAll.push(g); bsAll.push(b);
        if (fg) {
          const d2 = (r - fg[0]) ** 2 + (g - fg[1]) ** 2 + (b - fg[2]) ** 2;
          if (d2 < 3600) continue; // likely a text pixel; exclude
        }
        rs.push(r); gs.push(g); bs.push(b);
      }
    }
    const med = (arr) => {
      arr.sort((p, q) => p - q);
      return arr[Math.floor(arr.length / 2)];
    };
    if (rsAll.length === 0) {
      results.push({ i: s.i, error: 'no pixels sampled' });
      continue;
    }
    // 返回两个候选背景：剔除近前景像素后的中位色（正常文字块的真实底色）
    // 与全体像素中位色（fg≈bg 病例下由它暴露问题）。Python 侧取对比度
    // 更低的候选作为判定依据——对可读性检查这是 fail-safe 方向。
    const bgAll = [med(rsAll), med(gsAll), med(bsAll)];
    const bgFar = rs.length >= 8 ? [med(rs), med(gs), med(bs)] : null;
    results.push({ i: s.i, bgAll, bgFar,
                   pixels: rsAll.length, farPixels: rs.length });
  }
  return results;
}
"""


def rel_lum(rgb):
    def ch(c):
        c /= 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(fg_rgb, bg_rgb):
    l1, l2 = rel_lum(fg_rgb), rel_lum(bg_rgb)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def load_min_images():
    """expectations.min_images from the shared fixture; default 1.

    min_images == 0 declares an intentionally image-free doc (e.g. inline
    SVG mocks): an empty <img> set then passes all_images_load.
    """
    try:
        data = json.loads(FIXTURE.read_text(encoding="utf-8"))
        return max(0, int(data.get("expectations", {}).get("min_images", 1)))
    except Exception:
        return 1


def evaluate_contrast(samples, bg_results):
    """Combine normalized fg colors with measured pixel backgrounds."""
    by_i = {r["i"]: r for r in bg_results}
    low, evaluated, skipped = [], 0, []
    for i, s in enumerate(samples):
        r = by_i.get(i)
        fg = s.get("colorRGBA")
        if fg is None:
            skipped.append({"text": s["text"], "reason":
                            f"unparseable color: {s['color']}"})
            continue
        if r is None or "error" in r:
            skipped.append({"text": s["text"], "reason":
                            (r or {}).get("error", "no bg measurement")})
            continue
        # 双候选背景取更低对比度(fail-safe): bgFar 是正常文字块的真实底色,
        # bgAll 在 fg≈bg(白底白字)病例下暴露问题——该病例里近前景剔除会把
        # 背景一起剔掉, 只看 bgFar 会把不可读判成高对比。
        alpha = fg[3]
        candidates = [b for b in (r.get("bgFar"), r.get("bgAll")) if b]
        cr, bg = None, None
        for cand in candidates:
            fg_eff = [fg[c] * alpha + cand[c] * (1 - alpha) for c in range(3)]
            c = contrast_ratio(fg_eff, cand)
            if cr is None or c < cr:
                cr, bg = c, cand
        if cr is None:
            skipped.append({"text": s["text"], "reason": "no bg candidates"})
            continue
        evaluated += 1
        s["measuredBg"] = bg
        s["contrast"] = round(cr, 2)
        large = s["fontSizePx"] >= 24 or (
            s["fontSizePx"] >= 18.66 and int(s["fontWeight"] or 400) >= 700)
        threshold = 3.0 if large else 4.5
        if cr < threshold:
            low.append({"text": s["text"], "contrast": s["contrast"],
                        "fontSizePx": s["fontSizePx"], "color": s["color"],
                        "measuredBg": bg, "threshold": threshold})
    return low, evaluated, skipped


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--doc", default=str(DEFAULT_DOC))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()

    doc = Path(args.doc).resolve()
    out = Path(args.out)

    if not doc.exists():
        print(f"FAIL: doc not found: {doc}")
        sys.exit(2)

    # Stale-output guard: previous runs' segments/screenshots must never be
    # graded. Delete and recreate the whole output dir up front.
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    doc_sha = hashlib.sha256(doc.read_bytes()).hexdigest()
    min_images = load_min_images()

    gate_failures = []      # hard gate: screenshot validity
    advisory_failures = []  # per-case script layers (009/012)
    report = {
        "doc": str(doc),
        "docSha256": doc_sha,
        "minImages": min_images,
        "segmentCap": SEGMENT_CAP,
        "profiles": {},
    }

    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for prof in PROFILES:
            name = prof["name"]
            ctx = browser.new_context(
                viewport={"width": prof["width"], "height": prof["height"]},
                device_scale_factor=2,
            )
            page = ctx.new_page()
            console_errors = []
            page.on(
                "console",
                lambda msg: console_errors.append(msg.text)
                if msg.type == "error" else None,
            )
            page_errors = []
            page.on("pageerror", lambda err: page_errors.append(str(err)))
            failed_requests = []
            page.on(
                "requestfailed",
                lambda req: failed_requests.append(req.url),
            )
            page.goto(doc.as_uri(), wait_until="load")
            page.add_style_tag(content=FREEZE_CSS)
            # Determinism: fonts + every <img> fully decoded before any
            # screenshot (a tall full-page capture taken mid-decode produced
            # a one-off byte diff between otherwise identical runs).
            page.evaluate(
                """async () => {
                  await document.fonts.ready;
                  await Promise.all([...document.images].map(
                    img => img.decode().catch(() => {})));
                }"""
            )
            page.wait_for_timeout(300)

            probes = page.evaluate(PROBE_JS)
            probes["consoleErrors"] = console_errors
            probes["failedRequests"] = failed_requests
            probes["pageErrors"] = page_errors

            shot_first = out / f"{name}-first-screen.png"
            shot_full = out / f"{name}-full-page.png"
            page.screenshot(path=str(shot_first))
            page.screenshot(path=str(shot_full), full_page=True)

            # Viewport-height segments of the full page, for visual agents.
            # The authoritative segment set is screenshots.segments below.
            seg_dir = out / "segments"
            seg_dir.mkdir(exist_ok=True)
            page_h = page.evaluate(
                "() => document.documentElement.scrollHeight")
            seg_h = prof["height"]
            n_needed = math.ceil(page_h / seg_h)
            truncated = n_needed > SEGMENT_CAP
            n_seg = min(n_needed, SEGMENT_CAP)
            segments = []
            for i in range(n_seg):
                y = i * seg_h
                clip_h = min(seg_h, page_h - y)
                seg_path = seg_dir / f"{name}-seg-{i:02d}.png"
                page.screenshot(
                    path=str(seg_path), full_page=True,
                    clip={"x": 0, "y": y,
                          "width": prof["width"], "height": clip_h})
                segments.append(str(seg_path))

            # Measure real backgrounds from the captured full-page PNG.
            png_b64 = base64.b64encode(shot_full.read_bytes()).decode("ascii")
            bg_payload = {
                "png": "data:image/png;base64," + png_b64,
                "cssW": probes["pageCssWidth"],
                "cssH": probes["pageCssHeight"],
                "samples": [
                    {"i": i, "x": s["rect"]["x"], "y": s["rect"]["y"],
                     "w": s["rect"]["w"], "h": s["rect"]["h"],
                     "fg": (s["colorRGBA"][:3] if s.get("colorRGBA")
                            else None)}
                    for i, s in enumerate(probes["textSamples"])
                ],
            }
            bg_results = page.evaluate(BG_SAMPLE_JS, bg_payload)

            # ---- HARD GATE: screenshot validity ----
            gate = {}

            overflow = probes["scrollWidth"] - probes["clientWidth"]
            gate["no_horizontal_overflow"] = {
                "pass": overflow <= 1,
                "detail": f"scrollWidth-clientWidth={overflow}px",
            }

            broken = [i for i in probes["images"]
                      if not i["complete"] or i["naturalWidth"] == 0]
            gate["all_images_load"] = {
                "pass": len(broken) == 0
                        and len(probes["images"]) >= min_images,
                "detail": {"total": len(probes["images"]),
                           "minImages": min_images,
                           "broken": [b["src"] for b in broken]},
            }

            gate["no_failed_requests"] = {
                "pass": len(failed_requests) == 0,
                "detail": failed_requests,
            }
            gate["no_pageerror"] = {
                "pass": len(page_errors) == 0,
                "detail": page_errors,
            }
            gate["has_title_and_viewport_meta"] = {
                "pass": bool(probes["title"]) and probes["hasViewportMeta"],
                "detail": {"title": probes["title"],
                           "viewportMeta": probes["hasViewportMeta"]},
            }
            # Truncated segments break the "grade every segment" premise of
            # DOCQC-010/011, so hitting the cap is a hard failure, not a
            # silent cut.
            gate["segments_complete"] = {
                "pass": not truncated,
                "detail": {"needed": n_needed, "captured": n_seg,
                           "cap": SEGMENT_CAP, "truncated": truncated},
            }

            # ---- ADVISORY: per-case script layers (do NOT gate shots) ----
            advisory = {}

            low, evaluated, skipped = evaluate_contrast(
                probes["textSamples"], bg_results)
            sample_truncated = bool(probes.get("textSamplesTruncated"))
            advisory["text_contrast_aa"] = {
                "pass": (len(low) == 0 and evaluated >= 1
                         and not sample_truncated),
                "owner": ADVISORY_OWNERS["text_contrast_aa"],
                "detail": {"sampled": len(probes["textSamples"]),
                           "evaluated": evaluated,
                           "truncated": sample_truncated,
                           "skipped": skipped,
                           "belowAA": low},
            }
            for sk in skipped:
                print(f"WARNING [{name}] contrast sample skipped: "
                      f"{sk['reason']} ({sk['text']!r})")
            if evaluated == 0:
                print(f"WARNING [{name}] text_contrast_aa evaluated 0 "
                      "samples -> counted as advisory failure")
            if sample_truncated:
                print(f"WARNING [{name}] text sampling hit SAMPLE_CEILING "
                      "-> coverage incomplete, counted as advisory failure")

            # alt="" is legal (decorative image, WCAG); only a MISSING alt
            # attribute fails.
            missing_alt = [i["src"] for i in probes["images"]
                           if not i["hasAlt"]]
            advisory["images_have_alt"] = {
                "pass": len(missing_alt) == 0,
                "owner": ADVISORY_OWNERS["images_have_alt"],
                "detail": {"missingAltAttribute": missing_alt},
            }

            advisory["no_console_errors"] = {
                "pass": len(console_errors) == 0,
                "owner": ADVISORY_OWNERS["no_console_errors"],
                "detail": console_errors,
            }

            for cname, c in gate.items():
                if not c["pass"]:
                    gate_failures.append(f"[{name}] {cname}: {c['detail']}")
            for cname, c in advisory.items():
                if not c["pass"]:
                    advisory_failures.append(
                        f"[{name}] {cname} (owner {c['owner']}): "
                        f"{c['detail']}")

            report["profiles"][name] = {
                "viewport": prof,
                "screenshots": {"firstScreen": str(shot_first),
                                "fullPage": str(shot_full),
                                "segments": segments},
                "gate": gate,
                "advisory": advisory,
                "probes": probes,
            }
            ctx.close()
        browser.close()

    gate_pass = len(gate_failures) == 0
    advisory_pass = len(advisory_failures) == 0
    report["gate"] = {"pass": gate_pass, "failures": gate_failures}
    report["advisory"] = {"pass": advisory_pass,
                          "failures": advisory_failures,
                          "owners": ADVISORY_OWNERS}
    report["pass"] = gate_pass and advisory_pass
    report["quarantined"] = not gate_pass

    if not gate_pass:
        # FP-05: never leave gradable-looking screenshots next to a failed
        # gate. Quarantine everything and drop a marker file.
        qdir = out / "quarantine"
        qdir.mkdir(exist_ok=True)
        for p in sorted(out.glob("*.png")):
            shutil.move(str(p), str(qdir / p.name))
        if (out / "segments").exists():
            shutil.move(str(out / "segments"), str(qdir / "segments"))
        for prof_report in report["profiles"].values():
            shots = prof_report["screenshots"]
            shots["firstScreen"] = shots["firstScreen"].replace(
                str(out), str(qdir), 1)
            shots["fullPage"] = shots["fullPage"].replace(
                str(out), str(qdir), 1)
            shots["segments"] = [s.replace(str(out), str(qdir), 1)
                                 for s in shots["segments"]]
        (out / "GATE_FAILED").write_text(
            "HARD GATE FAILED — screenshots moved to quarantine/, "
            "do NOT grade them.\n" + "\n".join(gate_failures) + "\n",
            encoding="utf-8")

    (out / "probes.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"screenshots + probes written to {out}")
    if not gate_pass:
        print("HARD GATE FAILURES (screenshots quarantined, do not grade):")
        for f in gate_failures:
            print(" -", f)
    if not advisory_pass:
        print("ADVISORY FAILURES (only the owning case's script layer "
              "is red; screenshots remain gradable if the gate passed):")
        for f in advisory_failures:
            print(" -", f)
    if not gate_pass:
        sys.exit(1)
    if not advisory_pass:
        sys.exit(3)
    print("all scripted checks passed (gate + advisory)")


if __name__ == "__main__":
    main()
