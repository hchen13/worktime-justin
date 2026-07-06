from __future__ import annotations

import json
import math
import random
import textwrap
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
PREVIEWS = ROOT / "previews"
GIFS = ROOT / "gifs"
CONTACT = ROOT / "contact-sheets"
CARD_ID = "WTJ-20260706-007"
EXECUTOR = "Designer 1 / CodexThread:019f2887-9de8-7b72-b53b-230a0857f710"
DARK = "#10141f"


STYLES = [
    {
        "id": "molten-fountain",
        "name": "Molten Fountain",
        "reference": "da-tie-hua inspired upward fan",
        "palette": ["#FFF1A8", "#FFD35A", "#FF9D3D", "#FF6A2A", "#8EEBFF"],
        "particle_count": {"old_mac": 120, "normal": 210, "burst": 280},
        "layers": ["warm base spray", "long gold trails", "few cyan accent sparks"],
        "duration_ms": 950,
        "density": "high at base, medium at outer arc",
        "occlusion": "keep lower third open around reward object; fan outward from behind chest",
        "tl_notes": "Use gravity and drag; spawn from low center with angle spread 55-125deg upward. Good for chest-open climax.",
    },
    {
        "id": "starburst",
        "name": "Starburst",
        "reference": "five-point star rays",
        "palette": ["#FFF6A6", "#FF8EE8", "#8EEBFF", "#B7FF7A", "#FFFFFF"],
        "particle_count": {"old_mac": 70, "normal": 120, "burst": 160},
        "layers": ["five primary rays", "five short secondary rays", "small center flash"],
        "duration_ms": 720,
        "density": "medium, readable spokes",
        "occlusion": "place behind reward object; avoid full-screen white flash",
        "tl_notes": "Use deterministic star-angle presets plus small jitter. Good for task-complete feedback.",
    },
    {
        "id": "round-bloom",
        "name": "Round Bloom",
        "reference": "soft circular firework",
        "palette": ["#7AF7FF", "#A78BFA", "#FFE66D", "#FF7A90", "#FFFFFF"],
        "particle_count": {"old_mac": 90, "normal": 150, "burst": 210},
        "layers": ["outer ring", "inner ring", "late falling dots"],
        "duration_ms": 840,
        "density": "balanced ring, low center clutter",
        "occlusion": "reserve central 34% diameter for prize/sticker readability",
        "tl_notes": "Use ring radius easing and alpha fade; vary hue within palette, not random RGB.",
    },
]


def ensure_dirs() -> None:
    for folder in (PREVIEWS, GIFS, CONTACT):
        folder.mkdir(parents=True, exist_ok=True)


def hex_to_rgba(value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica.ttc",
        "/System/Library/Fonts/SFNS.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def draw_background(size: tuple[int, int]) -> Image.Image:
    w, h = size
    img = Image.new("RGBA", size, hex_to_rgba(DARK, 255))
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow, "RGBA")
    gd.ellipse((w * 0.18, h * 0.02, w * 0.82, h * 1.12), fill=(45, 64, 92, 58))
    gd.ellipse((w * 0.34, h * 0.20, w * 0.92, h * 1.12), fill=(19, 95, 120, 28))
    glow = glow.filter(ImageFilter.GaussianBlur(int(w * 0.10)))
    img.alpha_composite(glow)
    return img


def add_particle(
    glow: ImageDraw.ImageDraw,
    core: ImageDraw.ImageDraw,
    x: float,
    y: float,
    radius: float,
    color: str,
    alpha: float,
    trail: tuple[float, float] | None = None,
) -> None:
    rgba = hex_to_rgba(color, max(0, min(255, round(255 * alpha))))
    glow_alpha = max(0, min(160, round(150 * alpha)))
    if trail:
        tx, ty = trail
        glow.line((tx, ty, x, y), fill=rgba[:3] + (glow_alpha,), width=max(1, round(radius * 2.5)))
        core.line((tx, ty, x, y), fill=rgba[:3] + (max(40, round(160 * alpha)),), width=max(1, round(radius * 0.95)))
    glow.ellipse((x - radius * 4.0, y - radius * 4.0, x + radius * 4.0, y + radius * 4.0), fill=rgba[:3] + (glow_alpha,))
    core.ellipse((x - radius, y - radius, x + radius, y + radius), fill=rgba)
    core.ellipse((x - radius * 0.34, y - radius * 0.34, x + radius * 0.34, y + radius * 0.34), fill=(255, 255, 255, max(80, round(220 * alpha))))


def composite_particles(base: Image.Image, glow_layer: Image.Image, core_layer: Image.Image) -> Image.Image:
    base.alpha_composite(glow_layer.filter(ImageFilter.GaussianBlur(7)))
    base.alpha_composite(core_layer)
    return base


def render_molten_fountain(style: dict, size: tuple[int, int], progress: float, seed: int) -> Image.Image:
    rng = random.Random(seed)
    w, h = size
    img = draw_background(size)
    glow_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    core_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer, "RGBA")
    cd = ImageDraw.Draw(core_layer, "RGBA")
    base_x, base_y = w * 0.50, h * 0.78
    gd.ellipse((base_x - w * 0.12, base_y - h * 0.035, base_x + w * 0.12, base_y + h * 0.055), fill=(255, 164, 47, 120))
    n = 280
    for i in range(n):
        local = max(0.02, min(1.0, progress + rng.uniform(-0.18, 0.12)))
        angle = math.radians(rng.uniform(-158, -22))
        dist = rng.uniform(0.10, 0.78) * min(w, h) * local
        fall = (local**2) * rng.uniform(0.02, 0.13) * h
        x = base_x + math.cos(angle) * dist + rng.uniform(-0.012, 0.012) * w
        y = base_y + math.sin(angle) * dist + fall
        px = base_x + math.cos(angle) * dist * max(0.0, local - 0.14) / local
        py = base_y + math.sin(angle) * dist * max(0.0, local - 0.14) / local + fall * 0.65
        color = rng.choices(style["palette"], weights=[4, 5, 4, 2, 1])[0]
        alpha = (1.0 - 0.45 * max(0, progress - 0.72) / 0.28) * rng.uniform(0.62, 1.0)
        radius = rng.uniform(1.4, 3.4) * (1.0 - 0.18 * local)
        add_particle(gd, cd, x, y, radius, color, alpha, (px, py))
    return composite_particles(img, glow_layer, core_layer)


def render_starburst(style: dict, size: tuple[int, int], progress: float, seed: int) -> Image.Image:
    rng = random.Random(seed)
    w, h = size
    img = draw_background(size)
    glow_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    core_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer, "RGBA")
    cd = ImageDraw.Draw(core_layer, "RGBA")
    cx, cy = w * 0.50, h * 0.48
    cd.ellipse((cx - 16, cy - 16, cx + 16, cy + 16), fill=(255, 246, 166, min(255, round(230 * progress))))
    ray_angles = [math.radians(-90 + i * 36) for i in range(10)]
    n = 160
    for i in range(n):
        ray = i % 10
        major = ray % 2 == 0
        angle = ray_angles[ray] + rng.uniform(-0.06, 0.06)
        max_r = min(w, h) * (0.39 if major else 0.25)
        dist = max_r * progress * rng.uniform(0.36, 1.02)
        x = cx + math.cos(angle) * dist
        y = cy + math.sin(angle) * dist
        px = cx + math.cos(angle) * dist * 0.78
        py = cy + math.sin(angle) * dist * 0.78
        color = rng.choice(style["palette"])
        alpha = rng.uniform(0.62, 1.0) * (1.0 - 0.40 * max(0, progress - 0.76) / 0.24)
        radius = rng.uniform(1.7, 3.0) if major else rng.uniform(1.0, 2.0)
        add_particle(gd, cd, x, y, radius, color, alpha, (px, py))
    return composite_particles(img, glow_layer, core_layer)


def render_round_bloom(style: dict, size: tuple[int, int], progress: float, seed: int) -> Image.Image:
    rng = random.Random(seed)
    w, h = size
    img = draw_background(size)
    glow_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    core_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer, "RGBA")
    cd = ImageDraw.Draw(core_layer, "RGBA")
    cx, cy = w * 0.50, h * 0.48
    rings = [(0.34, 112), (0.22, 70), (0.12, 34)]
    for ring_i, (scale, count) in enumerate(rings):
        for j in range(count):
            angle = 2 * math.pi * j / count + rng.uniform(-0.018, 0.018)
            radius_ring = min(w, h) * scale * progress * rng.uniform(0.92, 1.05)
            fall = max(0, progress - 0.62) * (ring_i + 1) * rng.uniform(6, 22)
            x = cx + math.cos(angle) * radius_ring
            y = cy + math.sin(angle) * radius_ring + fall
            px = cx + math.cos(angle) * radius_ring * 0.82
            py = cy + math.sin(angle) * radius_ring * 0.82 + fall * 0.55
            color = style["palette"][(j + ring_i * 2) % len(style["palette"])]
            alpha = rng.uniform(0.58, 1.0) * (1.0 - 0.48 * max(0, progress - 0.78) / 0.22)
            dot = rng.uniform(1.2, 2.8) * (1.08 - ring_i * 0.12)
            add_particle(gd, cd, x, y, dot, color, alpha, (px, py))
    gd.ellipse((cx - w * 0.16, cy - h * 0.16, cx + w * 0.16, cy + h * 0.16), outline=(122, 247, 255, 55), width=2)
    return composite_particles(img, glow_layer, core_layer)


RENDERERS = {
    "molten-fountain": render_molten_fountain,
    "starburst": render_starburst,
    "round-bloom": render_round_bloom,
}


def render(style: dict, size: tuple[int, int], progress: float, seed: int) -> Image.Image:
    scale = 2
    large = RENDERERS[style["id"]](style, (size[0] * scale, size[1] * scale), progress, seed)
    return large.resize(size, Image.Resampling.LANCZOS)


def label_image(img: Image.Image, style: dict) -> Image.Image:
    out = img.copy()
    d = ImageDraw.Draw(out, "RGBA")
    w, h = out.size
    d.rectangle((0, h - 104, w, h), fill=(10, 13, 22, 188))
    d.text((24, h - 88), style["name"], font=font(28, True), fill=(255, 255, 255, 245))
    d.text((24, h - 52), style["reference"], font=font(17), fill=(202, 215, 235, 235))
    x = w - 230
    for color in style["palette"]:
        d.rounded_rectangle((x, h - 70, x + 28, h - 42), radius=6, fill=hex_to_rgba(color, 255))
        x += 36
    return out


def make_contact_sheet(preview_paths: list[Path]) -> None:
    card_w, card_h = 500, 760
    sheet = Image.new("RGBA", (card_w * 3 + 80, card_h + 110), hex_to_rgba(DARK, 255))
    d = ImageDraw.Draw(sheet, "RGBA")
    d.text((36, 28), "Reward Fireworks Style References", font=font(34, True), fill=(255, 255, 255, 245))
    d.text((38, 72), "Design reference only: code-generated runtime should vary particles each trigger.", font=font(18), fill=(184, 198, 220, 235))
    for idx, (style, path) in enumerate(zip(STYLES, preview_paths)):
        x = 36 + idx * (card_w + 20)
        y = 116
        d.rounded_rectangle((x, y, x + card_w, y + card_h), radius=10, fill=(21, 27, 40, 255), outline=(77, 89, 112, 255), width=1)
        preview = Image.open(path).convert("RGBA").resize((card_w - 36, 260), Image.Resampling.LANCZOS)
        sheet.alpha_composite(preview, (x + 18, y + 18))
        d.text((x + 22, y + 304), style["name"], font=font(24, True), fill=(255, 255, 255, 245))
        d.text((x + 22, y + 338), style["reference"], font=font(15), fill=(199, 213, 232, 235))
        lines = [
            f"duration: {style['duration_ms']}ms",
            f"particles: {style['particle_count']['old_mac']} old / {style['particle_count']['normal']} normal / {style['particle_count']['burst']} burst",
            f"density: {style['density']}",
            f"layers: {', '.join(style['layers'])}",
            f"occlusion: {style['occlusion']}",
        ]
        ty = y + 380
        for line in lines:
            for wrapped in textwrap.wrap(line, width=44):
                d.text((x + 22, ty), wrapped, font=font(14), fill=(223, 230, 242, 235))
                ty += 23
            ty += 4
        sx = x + 22
        for color in style["palette"]:
            d.rounded_rectangle((sx, y + card_h - 52, sx + 36, y + card_h - 20), radius=7, fill=hex_to_rgba(color, 255))
            sx += 44
    sheet.save(CONTACT / "reward-fireworks-style-contact-sheet.png")


def write_json_files() -> None:
    palette = {
        "card": CARD_ID,
        "executor": EXECUTOR,
        "background": DARK,
        "styles": [
            {
                "id": s["id"],
                "name": s["name"],
                "reference": s["reference"],
                "colors": s["palette"],
            }
            for s in STYLES
        ],
        "global_rule": "Choose from fixed palettes and apply small HSL/HSV jitter; do not use full random RGB.",
    }
    params = {
        "card": CARD_ID,
        "executor": EXECUTOR,
        "implementation_intent": "Visual reference for TL runtime particle system, not fixed production sprites.",
        "styles": [
            {
                "id": s["id"],
                "duration_ms": s["duration_ms"],
                "particle_count": s["particle_count"],
                "layers": s["layers"],
                "density": s["density"],
                "occlusion": s["occlusion"],
                "tl_notes": s["tl_notes"],
            }
            for s in STYLES
        ],
        "accessibility": {
            "max_fullscreen_flash_alpha": 0.35,
            "avoid_covering_task_target": True,
            "respect_reduce_motion": "halve particle count and skip secondary burst",
        },
    }
    manifest = {
        "card": CARD_ID,
        "asset_class": "design reference, not runtime implementation",
        "executor": EXECUTOR,
        "entrypoint": "docs/assets/reward-fireworks-style-v1/index.html",
        "contact_sheet": "docs/assets/reward-fireworks-style-v1/contact-sheets/reward-fireworks-style-contact-sheet.png",
        "styles": [
            {
                "id": s["id"],
                "preview": f"docs/assets/reward-fireworks-style-v1/previews/{s['id']}.png",
                "gif": f"docs/assets/reward-fireworks-style-v1/gifs/{s['id']}.gif",
                "palette": s["palette"],
                "duration_ms": s["duration_ms"],
                "particle_count": s["particle_count"],
            }
            for s in STYLES
        ],
        "notes": [
            "Do not ship these GIFs as fixed animation sprites.",
            "Use the palette and style params as runtime particle presets.",
            "Keep central reward object readable; particles should sit behind or around it.",
        ],
    }
    for name, data in [
        ("palette.json", palette),
        ("style-params.json", params),
        ("manifest.json", manifest),
    ]:
        (ROOT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def write_docs() -> None:
    readme = f"""# Reward Fireworks Style Reference v1

Card: {CARD_ID}
Executor: {EXECUTOR}

This package is a design reference for the runtime particle fireworks card. It is not a fixed production sprite package and should not be wired into the app as static animation sheets.

## Delivered Styles

1. `molten-fountain`: warm upward fan inspired by da-tie-hua. Use for the biggest chest-open reward.
2. `starburst`: readable five-point ray burst. Use for task-complete or short accent moments.
3. `round-bloom`: soft circular ring. Use when the reward object must remain centered and readable.

## Files

- `index.html`: local review page.
- `contact-sheets/reward-fireworks-style-contact-sheet.png`: one-page visual comparison.
- `previews/*.png`: static dark-canvas references.
- `gifs/*.gif`: short timing previews.
- `palette.json`: fixed color palettes for TL.
- `style-params.json`: particle count, layer, duration, density, and occlusion guidance.
- `manifest.json`: package inventory.
- `prompt-and-rationale.md`: prompt, rejected directions, and tradeoffs.

## Acceptance Notes

- Covers three distinguishable forms: molten fountain, starburst, and round bloom.
- Includes color palettes plus density, layer, duration, occlusion, and old-Mac reduction guidance.
- Keeps the center area readable so reward objects and task targets are not hidden.
- Does not add runtime code and does not block WTJ-20260706-005.
"""
    rationale = f"""# Prompt And Rationale

## Design Prompt

Create a non-shipping visual reference pack for WorkTime Justin reward fireworks. The visuals must feel celebratory on a dark child-facing canvas, avoid generic RGB noise, and give TL usable runtime parameters for a code-generated particle system.

## Selected Direction

- Use three distinct presets instead of one generic burst.
- Keep palettes fixed and curated, then allow small runtime hue/value jitter.
- Place particles behind or around rewards, never over the primary object or task target.
- Prefer fast bloom and fade timings under one second so the screen does not stay dirty.

## Rejected Directions

- Full random rainbow: too noisy and hard to control.
- Giant white flash: too aggressive for a toddler-facing app and can obscure the reward.
- Fixed GIF/sprite implementation: conflicts with Ethan's request for randomized runtime particles.
- Heavy full-screen particle storm: risks old Mac performance and hides task/reward objects.

## Tradeoffs

The preview images are generated locally from deterministic particle drawings rather than using a black-box image model. That makes the references less painterly, but much more useful for TL because every style maps directly to particle count, duration, density, gravity/drag, and palette choices.
"""
    (ROOT / "README.md").write_text(readme)
    (ROOT / "prompt-and-rationale.md").write_text(rationale)


def write_index() -> None:
    cards = []
    for style in STYLES:
        swatches = "".join(f'<span class="swatch" style="background:{c}"></span>' for c in style["palette"])
        cards.append(
            f"""
      <article class="card">
        <h2>{style['name']}</h2>
        <p class="sub">{style['reference']}</p>
        <img src="previews/{style['id']}.png" alt="{style['name']} static preview" />
        <img src="gifs/{style['id']}.gif" alt="{style['name']} timing preview" />
        <div class="swatches">{swatches}</div>
        <dl>
          <dt>Duration</dt><dd>{style['duration_ms']}ms</dd>
          <dt>Particles</dt><dd>{style['particle_count']['old_mac']} old Mac / {style['particle_count']['normal']} normal / {style['particle_count']['burst']} burst</dd>
          <dt>Density</dt><dd>{style['density']}</dd>
          <dt>Layers</dt><dd>{', '.join(style['layers'])}</dd>
          <dt>Occlusion</dt><dd>{style['occlusion']}</dd>
        </dl>
      </article>"""
        )
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reward Fireworks Style Reference v1</title>
  <style>
    :root {{ color-scheme: dark; --bg: #10141f; --panel: #171e2d; --line: rgba(255,255,255,.14); --ink: #f5f8ff; --muted: #b8c5d8; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }}
    main {{ width: min(1220px, calc(100% - 36px)); margin: 0 auto; padding: 34px 0 60px; }}
    header {{ margin-bottom: 24px; }}
    h1 {{ margin: 0 0 10px; font-size: 38px; letter-spacing: 0; }}
    p {{ color: var(--muted); line-height: 1.55; }}
    .notice {{ border: 1px solid rgba(255,211,90,.45); background: rgba(255,211,90,.08); border-radius: 8px; padding: 14px 16px; color: #f4dfab; }}
    .grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 22px; }}
    .card {{ border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 16px; }}
    .card h2 {{ margin: 0 0 4px; font-size: 24px; }}
    .sub {{ min-height: 48px; margin: 0 0 12px; }}
    img {{ width: 100%; display: block; border-radius: 6px; border: 1px solid rgba(255,255,255,.12); background: #0c1018; margin: 10px 0; }}
    .swatches {{ display: flex; gap: 8px; margin: 12px 0; }}
    .swatch {{ width: 30px; height: 30px; border-radius: 6px; border: 1px solid rgba(255,255,255,.18); }}
    dl {{ display: grid; grid-template-columns: 94px 1fr; gap: 7px 10px; color: #dfe8f8; }}
    dt {{ color: #93a6bf; }}
    dd {{ margin: 0; }}
    a {{ color: #8eebff; }}
    @media (max-width: 900px) {{ .grid {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Reward Fireworks Style Reference v1</h1>
      <p>Card {CARD_ID}. Visual reference only for runtime particles; do not ship these GIFs as fixed sprites.</p>
      <p class="notice">Use <a href="style-params.json">style-params.json</a> and <a href="palette.json">palette.json</a> as TL-facing parameters. The central reward object should remain readable.</p>
      <p><a href="contact-sheets/reward-fireworks-style-contact-sheet.png">Open contact sheet</a> · <a href="manifest.json">manifest</a> · <a href="README.md">README</a></p>
    </header>
    <section class="grid">
{''.join(cards)}
    </section>
  </main>
</body>
</html>
"""
    (ROOT / "index.html").write_text(html)


def main() -> None:
    ensure_dirs()
    preview_paths: list[Path] = []
    for idx, style in enumerate(STYLES):
        preview = label_image(render(style, (960, 540), 0.86, 1000 + idx), style)
        preview_path = PREVIEWS / f"{style['id']}.png"
        preview.save(preview_path)
        preview_paths.append(preview_path)

        frames = []
        for frame in range(18):
            progress = (frame + 1) / 18
            frames.append(render(style, (640, 360), progress, 2000 + idx * 100 + frame).convert("P", palette=Image.Palette.ADAPTIVE))
        frames[0].save(
            GIFS / f"{style['id']}.gif",
            save_all=True,
            append_images=frames[1:],
            duration=55,
            loop=0,
            optimize=True,
        )
    make_contact_sheet(preview_paths)
    write_json_files()
    write_docs()
    write_index()


if __name__ == "__main__":
    main()
