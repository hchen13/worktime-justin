#!/usr/bin/env python3
"""Production sprite/asset static-quality scan (WTJ-20260704-023, criteria 1/2).

Scriptable half of the "素材质量" visual acceptance: for every production PNG under
app/web/assets/, verify the mechanical requirements from
.agents/docs/production-asset-quality.md that a program can judge deterministically
(the aesthetic half — unified art direction, not-rough/emoji, child-recognizable —
is the agentic visual pass on the contact sheets, see tests/visual/cases/).

Per-file checks:
  - valid PNG, RGBA mode (clean alpha channel required for sprite art)
  - NOT fully opaque (sprite art must have a transparent background)
  - NOT (near-)blank (fully/near-transparent => empty/broken asset)
  - content padding: opaque content bbox must not touch the canvas edge
    (production bar: "enough padding for animation without cropping")
  - non-trivial size (flag placeholder-tiny)

FAIL (exit 1) on any hard defect (no alpha / opaque / blank / cropped-to-edge).
Dimension spread and outliers are reported for the agentic pass to eye-ball.

Run:  python3 tests/visual/scripts/check_sprite_assets.py [--assets DIR]
Exit: 0 clean · 1 defect found · 2 infra error.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ASSETS = REPO_ROOT / "app" / "web" / "assets"
DEFAULT_REPORT = REPO_ROOT / "tests" / "reports" / "sprite_asset_scan.json"

MIN_SIDE = 64           # below this a "sprite" is placeholder-sized
EDGE_PAD_MIN = 1        # opaque content must leave >=1px transparent border
NEAR_BLANK_OPAQUE = 0.005   # <0.5% opaque pixels => effectively blank
FULLY_OPAQUE = 0.999        # >99.9% opaque => no transparent background


def scan_png(path: Path):
    from PIL import Image
    with Image.open(path) as im:
        fmt = im.format
        mode = im.mode
        w, h = im.size
        problems = []
        warnings = []
        if fmt != "PNG":
            problems.append(f"不是 PNG (format={fmt})")
        if mode != "RGBA":
            problems.append(f"无 alpha 通道 (mode={mode}, 生产 sprite 需透明 PNG)")
            return {"w": w, "h": h, "mode": mode, "problems": problems, "warnings": warnings}
        alpha = im.getchannel("A")
        # opaque ratio + content bbox from alpha
        bbox = alpha.getbbox()  # bbox of non-zero (any non-transparent) pixels
        hist = alpha.histogram()
        total = w * h
        opaque_px = sum(hist[t] for t in range(200, 256))  # near-opaque
        any_visible = total - hist[0]
        opaque_ratio = opaque_px / total if total else 0
        visible_ratio = any_visible / total if total else 0

        if visible_ratio < NEAR_BLANK_OPAQUE:
            problems.append(f"near-blank (可见像素比 {visible_ratio:.4f})")
        if opaque_ratio > FULLY_OPAQUE:
            problems.append(f"几乎全不透明 (opaque {opaque_ratio:.3f}) — 没有透明背景")
        if min(w, h) < MIN_SIDE:
            warnings.append(f"尺寸偏小 {w}x{h} (< {MIN_SIDE})")
        if bbox:
            left, top, right, bottom = bbox
            touches = []
            if left < EDGE_PAD_MIN:
                touches.append("左")
            if top < EDGE_PAD_MIN:
                touches.append("上")
            if right > w - EDGE_PAD_MIN:
                touches.append("右")
            if bottom > h - EDGE_PAD_MIN:
                touches.append("下")
            if touches:
                problems.append(f"内容触碰画布边缘({'/'.join(touches)}) — padding 不足/被裁切")
        return {"w": w, "h": h, "mode": mode, "opaque_ratio": round(opaque_ratio, 4),
                "visible_ratio": round(visible_ratio, 4), "bbox": bbox,
                "problems": problems, "warnings": warnings}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--assets", default=str(DEFAULT_ASSETS))
    ap.add_argument("--report", default=str(DEFAULT_REPORT))
    args = ap.parse_args()

    assets = Path(args.assets).resolve()
    report_path = Path(args.report).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        from PIL import Image  # noqa: F401
    except ImportError as e:
        print(f"INFRA-ERROR PIL 不可用: {e}")
        return 2
    if not assets.is_dir():
        print(f"INFRA-ERROR 素材目录不存在: {assets}")
        return 2

    pngs = sorted(assets.rglob("*.png"))
    if not pngs:
        print(f"INFRA-ERROR 未找到 PNG: {assets}")
        return 2

    results = {}
    defects = []
    dims = []
    for p in pngs:
        rel = str(p.relative_to(assets))
        try:
            r = scan_png(p)
        except Exception as e:  # noqa: BLE001
            r = {"problems": [f"打开/解析失败: {e}"], "warnings": []}
        results[rel] = r
        if r.get("w"):
            dims.append((r["w"], r["h"]))
        if r["problems"]:
            defects.append((rel, r["problems"]))

    n = len(pngs)
    print(f"扫描 {n} 个 PNG (assets={assets})")
    if dims:
        ws = sorted(set(w for w, _ in dims))
        print(f"尺寸种类: {ws[:12]}{'...' if len(ws) > 12 else ''}")
    if defects:
        print(f"\n缺陷 {len(defects)} 个:")
        for rel, probs in defects[:40]:
            print(f"  FAIL {rel}: {'; '.join(probs)}")
    else:
        print("\n无硬缺陷: 全部 PNG 为 RGBA、有透明背景、非空、内容不触边。")

    warns = [(rel, r["warnings"]) for rel, r in results.items() if r.get("warnings")]
    if warns:
        print(f"\n警告 {len(warns)} 个 (交视觉层复核):")
        for rel, w in warns[:20]:
            print(f"  WARN {rel}: {'; '.join(w)}")

    report = {"total": n, "defects": len(defects), "warnings": len(warns),
              "results": results}
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nreport: {report_path}")
    return 0 if not defects else 1


if __name__ == "__main__":
    sys.exit(main())
