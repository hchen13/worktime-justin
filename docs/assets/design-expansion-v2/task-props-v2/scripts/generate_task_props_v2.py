from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[5]
OUT = ROOT / "docs/assets/design-expansion-v2/task-props-v2"
PACK_A = ROOT / "docs/assets/production-pack-a"
PACK_B = ROOT / "docs/assets/production-pack-b"
DARK_BG = (5, 26, 32)


PROPS = [
    {
        "id": "prop_apple_drag",
        "name": "apple",
        "source": "docs/assets/production-pack-b/sprites/apple.png",
        "interaction_type": "drag",
        "task_sentence": "Put the apple in the glowing spot.",
        "recommended_use": "Draggable food object for collect, sort, or place-on-target tasks.",
        "hit_area": {"x": 72, "y": 62, "width": 368, "height": 388},
    },
    {
        "id": "prop_ball_drag",
        "name": "ball",
        "source": "docs/assets/production-pack-b/sprites/ball.png",
        "interaction_type": "drag",
        "task_sentence": "Move the ball to the play spot.",
        "recommended_use": "Round draggable object with strong 72 px readability.",
        "hit_area": {"x": 70, "y": 70, "width": 372, "height": 372},
    },
    {
        "id": "prop_gift_drag",
        "name": "gift",
        "source": "docs/assets/production-pack-b/sprites/gift.png",
        "interaction_type": "drag",
        "task_sentence": "Carry the gift to the finish light.",
        "recommended_use": "Reward-adjacent draggable object for task completion moments.",
        "hit_area": {"x": 78, "y": 86, "width": 356, "height": 340},
    },
    {
        "id": "prop_flower_drag",
        "name": "flower",
        "source": "docs/assets/production-pack-b/sprites/flower.png",
        "interaction_type": "drag",
        "task_sentence": "Place the flower on the desk.",
        "recommended_use": "Gentle draggable prop for calmer desk/workbench tasks.",
        "hit_area": {"x": 92, "y": 58, "width": 328, "height": 392},
    },
    {
        "id": "prop_key_drag",
        "name": "key",
        "source": "docs/assets/production-pack-b/sprites/key.png",
        "interaction_type": "drag",
        "task_sentence": "Drag the key to the door.",
        "recommended_use": "Thin object with generous hit area for toddler-friendly dragging.",
        "hit_area": {"x": 68, "y": 96, "width": 376, "height": 314},
    },
    {
        "id": "prop_star_drag",
        "name": "star",
        "source": "docs/assets/production-pack-b/sprites/star.png",
        "interaction_type": "drag",
        "task_sentence": "Move the star into the tray.",
        "recommended_use": "Simple high-contrast draggable token.",
        "hit_area": {"x": 72, "y": 72, "width": 368, "height": 368},
    },
    {
        "id": "prop_bell_click",
        "name": "bell",
        "source": "docs/assets/production-pack-b/sprites/bell.png",
        "interaction_type": "click",
        "task_sentence": "Tap the bell.",
        "recommended_use": "Click/tap prompt with a later ring animation hook.",
        "hit_area": {"x": 72, "y": 66, "width": 368, "height": 378},
    },
    {
        "id": "prop_lamp_click",
        "name": "lamp",
        "source": "docs/assets/production-pack-b/sprites/lamp.png",
        "interaction_type": "click",
        "task_sentence": "Turn on the lamp.",
        "recommended_use": "Click/tap object that can connect to the accepted lamp animation.",
        "hit_area": {"x": 90, "y": 52, "width": 334, "height": 402},
    },
    {
        "id": "prop_faucet_click",
        "name": "faucet",
        "source": "docs/assets/production-pack-b/sprites/faucet.png",
        "interaction_type": "click",
        "task_sentence": "Turn off the faucet.",
        "recommended_use": "Click/tap object that can connect to the accepted faucet animation.",
        "hit_area": {"x": 54, "y": 116, "width": 404, "height": 280},
    },
    {
        "id": "prop_door_click",
        "name": "door",
        "source": "docs/assets/production-pack-b/sprites/door.png",
        "interaction_type": "click",
        "task_sentence": "Open the door.",
        "recommended_use": "Click/tap object that can connect to the accepted door animation.",
        "hit_area": {"x": 92, "y": 50, "width": 330, "height": 406},
    },
    {
        "id": "prop_drum_click",
        "name": "drum",
        "source": "docs/assets/production-pack-b/sprites/drum.png",
        "interaction_type": "click",
        "task_sentence": "Tap the drum.",
        "recommended_use": "Click/tap object with clear cause-effect sound/motion potential.",
        "hit_area": {"x": 70, "y": 76, "width": 372, "height": 360},
    },
    {
        "id": "prop_rocket_click",
        "name": "rocket",
        "source": "docs/assets/production-pack-b/sprites/rocket.png",
        "interaction_type": "click",
        "task_sentence": "Launch the rocket.",
        "recommended_use": "Click/tap object for celebratory task transitions.",
        "hit_area": {"x": 94, "y": 52, "width": 326, "height": 408},
    },
    {
        "id": "prop_train_click",
        "name": "train",
        "source": "docs/assets/production-pack-b/sprites/train.png",
        "interaction_type": "click",
        "task_sentence": "Start the train.",
        "recommended_use": "Click/tap object for short movement or sound feedback.",
        "hit_area": {"x": 40, "y": 98, "width": 432, "height": 314},
    },
    {
        "id": "prop_duck_find",
        "name": "duck",
        "source": "docs/assets/production-pack-b/sprites/duck.png",
        "interaction_type": "find",
        "task_sentence": "Find the duck.",
        "recommended_use": "Search target with a strong silhouette and warm color.",
        "hit_area": {"x": 72, "y": 84, "width": 368, "height": 344},
    },
    {
        "id": "prop_cup_find",
        "name": "cup",
        "source": "docs/assets/production-pack-b/sprites/cup.png",
        "interaction_type": "find",
        "task_sentence": "Find the cup.",
        "recommended_use": "Search target with a broad, readable shape.",
        "hit_area": {"x": 62, "y": 92, "width": 388, "height": 324},
    },
    {
        "id": "prop_cake_find",
        "name": "cake",
        "source": "docs/assets/production-pack-b/sprites/cake.png",
        "interaction_type": "find",
        "task_sentence": "Find the cake.",
        "recommended_use": "Search target with layered detail that still reads at small size.",
        "hit_area": {"x": 64, "y": 92, "width": 384, "height": 332},
    },
    {
        "id": "prop_hat_find",
        "name": "hat",
        "source": "docs/assets/production-pack-b/sprites/hat.png",
        "interaction_type": "find",
        "task_sentence": "Find the hat.",
        "recommended_use": "Search target with a distinct color cap and bow silhouette.",
        "hit_area": {"x": 62, "y": 104, "width": 388, "height": 300},
    },
    {
        "id": "prop_heart_find",
        "name": "heart",
        "source": "docs/assets/production-pack-b/sprites/heart.png",
        "interaction_type": "find",
        "task_sentence": "Find the heart.",
        "recommended_use": "Search target for reward or care-themed tasks.",
        "hit_area": {"x": 64, "y": 74, "width": 384, "height": 364},
    },
    {
        "id": "prop_rainbow_find",
        "name": "rainbow",
        "source": "docs/assets/production-pack-b/sprites/rainbow.png",
        "interaction_type": "find",
        "task_sentence": "Find the rainbow.",
        "recommended_use": "Search target with high color contrast and recognizable arch shape.",
        "hit_area": {"x": 36, "y": 126, "width": 440, "height": 254},
    },
    {
        "id": "prop_pencil_find",
        "name": "pencil",
        "source": "docs/assets/production-pack-b/sprites/pencil.png",
        "interaction_type": "find",
        "task_sentence": "Find the pencil.",
        "recommended_use": "Search target that supports desk/workbench semantics.",
        "hit_area": {"x": 100, "y": 54, "width": 312, "height": 404},
    },
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Helvetica.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def clear_out_dir() -> None:
    for child in ["props", "contact-sheets"]:
        path = OUT / child
        if path.exists():
            shutil.rmtree(path)
        path.mkdir(parents=True, exist_ok=True)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda p: 255 if p > 8 else 0).getbbox()
    if bbox is None:
        raise ValueError("source has no visible alpha")
    return bbox


def sanitize_chroma_pixels(image: Image.Image) -> int:
    pixels = image.load()
    changed = 0
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            if (r, g, b) == (255, 0, 255):
                pixels[x, y] = (235, 91, 220, a)
                changed += 1
            elif (r, g, b) == (0, 255, 0):
                pixels[x, y] = (72, 206, 107, a)
                changed += 1
    return changed


def normalize_source(source: Path) -> tuple[Image.Image, dict[str, int], int]:
    image = Image.open(source).convert("RGBA")
    chroma_changed = sanitize_chroma_pixels(image)
    bbox = alpha_bbox(image)
    crop = image.crop(bbox)
    target_max = 382
    scale = min(target_max / crop.width, target_max / crop.height)
    new_size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    resized = crop.resize(new_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((512 - new_size[0]) // 2, (512 - new_size[1]) // 2))
    chroma_changed += sanitize_chroma_pixels(canvas)
    out_bbox = alpha_bbox(canvas)
    margins = {
        "left": out_bbox[0],
        "top": out_bbox[1],
        "right": 512 - out_bbox[2],
        "bottom": 512 - out_bbox[3],
    }
    return canvas, margins, chroma_changed


def draw_label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, size: int, fill: tuple[int, int, int], bold: bool = False) -> None:
    draw.text(xy, text, font=font(size, bold), fill=fill)


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    max_width: int,
    size: int,
    fill: tuple[int, int, int],
) -> None:
    words = text.split()
    lines: list[str] = []
    current = ""
    face = font(size)
    for word in words:
        trial = (current + " " + word).strip()
        bbox = draw.textbbox((0, 0), trial, font=face)
        if bbox[2] - bbox[0] <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    y = xy[1]
    for line in lines[:3]:
        draw.text((xy[0], y), line, font=face, fill=fill)
        y += size + 6


def make_contact_sheet(records: list[dict]) -> None:
    cols = 5
    cell_w, cell_h = 300, 348
    margin = 32
    title_h = 92
    rows = (len(records) + cols - 1) // cols
    sheet = Image.new("RGB", (margin * 2 + cols * cell_w, title_h + margin + rows * cell_h), DARK_BG)
    draw = ImageDraw.Draw(sheet)

    draw_label(draw, (margin, 24), "WTJ-20260704-064 Task Props v2", 30, (245, 250, 246), True)
    draw_label(
        draw,
        (margin, 60),
        "20 transparent 512px props. Each tile shows 128px and 72px previews on the app dark canvas.",
        17,
        (159, 188, 185),
    )

    colors = {
        "drag": (247, 195, 72),
        "click": (93, 213, 230),
        "find": (141, 222, 143),
    }
    for idx, rec in enumerate(records):
        col, row = idx % cols, idx // cols
        x = margin + col * cell_w
        y = title_h + margin + row * cell_h
        tile = Image.new("RGB", (cell_w - 18, cell_h - 18), (8, 38, 45))
        td = ImageDraw.Draw(tile)
        td.rounded_rectangle((0, 0, cell_w - 19, cell_h - 19), radius=18, outline=(25, 83, 90), width=2)
        td.rounded_rectangle((16, 16, 98, 44), radius=14, fill=colors[rec["interaction_type"]])
        td.text((31, 22), rec["interaction_type"], font=font(15, True), fill=(4, 24, 29))

        prop = Image.open(ROOT / rec["file"]).convert("RGBA")
        preview128 = prop.resize((128, 128), Image.Resampling.LANCZOS)
        preview72 = prop.resize((72, 72), Image.Resampling.LANCZOS)
        tile.paste(preview128, (22, 58), preview128)
        tile.paste(preview72, (174, 86), preview72)

        td.rounded_rectangle((18, 52, 154, 192), radius=18, outline=(38, 102, 110), width=1)
        td.rounded_rectangle((168, 78, 250, 164), radius=14, outline=(38, 102, 110), width=1)
        draw_label(td, (18, 204), rec["name"], 25, (246, 251, 246), True)
        draw_wrapped(td, (18, 238), rec["task_sentence"], 246, 17, (190, 214, 211))
        draw_label(td, (18, 304), "source: production-pack-b", 13, (101, 143, 145))
        sheet.paste(tile, (x, y))

    sheet.save(OUT / "contact-sheets/task-props-v2-contact-sheet.png", optimize=True)


def make_readme(records: list[dict]) -> None:
    counts = {kind: sum(1 for r in records if r["interaction_type"] == kind) for kind in ["drag", "click", "find"]}
    lines = [
        "# Future Task Props v2",
        "",
        "Card: `WTJ-20260704-064`",
        "Owner session: `Designer 1 / Automation:worktime-justin-design-loop`",
        "",
        "This pack provides static future-task props for PM/Ethan review. It is a design candidate pack, not an automatic runtime handoff.",
        "",
        "## Contents",
        "",
        "- `props/`: 20 transparent task prop PNGs on 512 x 512 canvases.",
        "- `contact-sheets/task-props-v2-contact-sheet.png`: dark-canvas sheet with 128 px and 72 px previews.",
        "- `manifest.json`: source path, suggested task sentence, interaction type, hit area, anchor, bounds, and review notes for each prop.",
        "- `prompt-and-rationale.md`: source strategy, exclusion decisions, tradeoffs, and self-check results.",
        "",
        "## Coverage",
        "",
        f"- drag: {counts['drag']} props",
        f"- click: {counts['click']} props",
        f"- find: {counts['find']} props",
        "",
        "## Active Props",
        "",
    ]
    for rec in records:
        lines.append(f"- `{rec['name']}` / `{rec['interaction_type']}`: {rec['task_sentence']}")
    lines += [
        "",
        "## Review Notes",
        "",
        "- The active set deliberately excludes the earlier low-confidence basket, dog, and treasure directions.",
        "- Every prop is normalized from accepted production-pack-b sprites to keep the WorkTime Justin 2.5D soft-clay baseline.",
        "- Thin or small props such as `key` and `pencil` have generous recommended hit areas for toddler-friendly interaction.",
        "- Runtime placement, scale, and any animation hooks should be handled later through a PM-routed TL integration card if accepted.",
        "",
    ]
    (OUT / "README.md").write_text("\n".join(lines), encoding="utf-8")


def make_rationale(records: list[dict], validation: dict) -> None:
    lines = [
        "# Prompt And Rationale",
        "",
        "Card: `WTJ-20260704-064`",
        "Owner session: `Designer 1 / Automation:worktime-justin-design-loop`",
        "",
        "## Source Strategy",
        "",
        "The safest route for this card is not a fresh mixed AI batch. I reused accepted `production-pack-b` sprites and normalized them into task props so the materials, lighting, alpha, and dark-canvas readability stay aligned with the current WorkTime Justin production baseline.",
        "",
        "Selection rules:",
        "",
        "- polished 2.5D soft-plastic / soft-clay object style",
        "- simple silhouette that still reads at 72 px",
        "- no embedded text, watermark, background, or brand-like character",
        "- no old low-confidence basket, dog, or treasure directions",
        "- balanced drag, click, and find task coverage",
        "",
        "## Generation Rule",
        "",
        "```text",
        "Create WorkTime Justin future-task props in the accepted production sprite style. Use transparent PNGs, rounded soft-clay geometry, consistent 3/4-ish object language, top-left soft light, clean alpha, and dark-canvas readability at 72 px and 128 px. Cover draggable, clickable, and findable task objects. Avoid flat icon/vector art, rough mockups, emoji-like assets, copyrighted character imitation, text inside assets, dirty alpha, magenta/green chroma remnants, crop artifacts, and the previously rejected basket/dog/treasure directions.",
        "```",
        "",
        "## Tradeoffs",
        "",
        "- Reusing accepted sprites is less novel than generating 20 new images, but it directly addresses the current quality problem: consistency and production polish matter more than novelty.",
        "- These are static props. Some click props have obvious future animation hooks (`bell`, `lamp`, `faucet`, `door`, `rocket`, `train`), but this card does not create runtime animation.",
        "- `duck` is included as a toy-like search target, while the rejected dog direction stays out of this pack.",
        "",
        "## Self-Check",
        "",
        f"- Active prop PNG count: {validation['active_count']}.",
        f"- All active prop PNGs are 512 x 512 RGBA: {validation['all_rgba_512']}.",
        f"- Transparent corners are clean: {validation['transparent_corners']}.",
        f"- Minimum alpha margin: {validation['minimum_margin_px']} px.",
        f"- Pure magenta/green chroma-like active pixels after cleanup: {validation['pure_chroma_pixels']}.",
        f"- Missing manifest paths: {validation['missing_paths']}.",
        "- Contact sheet shows both 128 px and 72 px previews on the dark app canvas.",
        "",
    ]
    (OUT / "prompt-and-rationale.md").write_text("\n".join(lines), encoding="utf-8")


def validate(records: list[dict]) -> dict:
    pngs = sorted((OUT / "props").glob("*.png"))
    all_rgba_512 = True
    transparent_corners = True
    minimum_margin = 999
    pure_chroma_pixels = 0
    for path in pngs:
        image = Image.open(path).convert("RGBA")
        all_rgba_512 = all_rgba_512 and image.size == (512, 512)
        for xy in [(0, 0), (511, 0), (0, 511), (511, 511)]:
            transparent_corners = transparent_corners and image.getpixel(xy)[3] == 0
        bbox = alpha_bbox(image)
        minimum_margin = min(minimum_margin, bbox[0], bbox[1], 512 - bbox[2], 512 - bbox[3])
        data = image.tobytes()
        for idx in range(0, len(data), 4):
            r, g, b, a = data[idx], data[idx + 1], data[idx + 2], data[idx + 3]
            if a and ((r, g, b) == (255, 0, 255) or (r, g, b) == (0, 255, 0)):
                pure_chroma_pixels += 1
    missing_paths = [rec["file"] for rec in records if not (ROOT / rec["file"]).exists()]
    return {
        "active_count": len(pngs),
        "all_rgba_512": all_rgba_512,
        "transparent_corners": transparent_corners,
        "minimum_margin_px": minimum_margin,
        "pure_chroma_pixels": pure_chroma_pixels,
        "missing_paths": missing_paths,
    }


def main() -> None:
    clear_out_dir()
    records: list[dict] = []
    total_chroma_changed = 0
    for prop in PROPS:
        source = ROOT / prop["source"]
        if not source.exists():
            raise FileNotFoundError(source)
        image, margins, chroma_changed = normalize_source(source)
        total_chroma_changed += chroma_changed
        out_file = OUT / "props" / f"{prop['id']}.png"
        image.save(out_file, optimize=True)
        rec = {
            **prop,
            "file": str(out_file.relative_to(ROOT)),
            "size_px": [512, 512],
            "mode": "RGBA",
            "frame_count": 1,
            "fps": None,
            "loop": False,
            "anchor": {"x": 0.5, "y": 0.5},
            "bounds": margins,
            "source_reuse": "accepted production-pack-b sprite normalized to 512 px transparent prop",
        }
        records.append(rec)

    validation = validate(records)
    manifest = {
        "pack_id": "design-expansion-v2-task-props-v2",
        "card_id": "WTJ-20260704-064",
        "created_by": "Designer 1 / Automation:worktime-justin-design-loop",
        "status": "PM review candidate",
        "style_baseline": [
            "docs/assets/sprites/sprite-style-guide.md",
            "docs/assets/production-pack-a/manifest.json",
            "docs/assets/production-pack-b/manifest.json",
            "docs/assets/production-animations-v1/manifest.json",
        ],
        "contact_sheet": "docs/assets/design-expansion-v2/task-props-v2/contact-sheets/task-props-v2-contact-sheet.png",
        "excluded_due_to_recent_feedback": ["basket", "dog", "treasure"],
        "props": records,
        "validation": {
            **validation,
            "source_exact_chroma_pixels_recolored": total_chroma_changed,
            "small_preview_sizes_shown_px": [128, 72],
        },
        "handoff_note": "Design review only. PM should route a separate TL integration card if selected.",
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    make_contact_sheet(records)
    make_readme(records)
    make_rationale(records, validation)
    print(json.dumps(validation, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
