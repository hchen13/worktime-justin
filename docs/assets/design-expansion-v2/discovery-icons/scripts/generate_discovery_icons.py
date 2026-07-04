#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[5]
OUT = ROOT / "docs/assets/design-expansion-v2/discovery-icons"
PACK_A = ROOT / "docs/assets/production-pack-a"
PACK_B = ROOT / "docs/assets/production-pack-b"

FRAME = 1024
DARK = (7, 13, 24, 255)


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def load_asset(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def crop_visible(image: Image.Image, pad: int = 18) -> Image.Image:
    bbox = image.getbbox()
    if not bbox:
        return image.copy()
    left, top, right, bottom = bbox
    return image.crop((max(0, left - pad), max(0, top - pad), min(image.width, right + pad), min(image.height, bottom + pad)))


def fit_asset(image: Image.Image, max_size: int) -> Image.Image:
    image = crop_visible(image)
    ratio = min(max_size / image.width, max_size / image.height)
    return image.resize((max(1, round(image.width * ratio)), max(1, round(image.height * ratio))), Image.Resampling.LANCZOS)


def paste_center(base: Image.Image, image: Image.Image, center: tuple[int, int]) -> None:
    base.alpha_composite(image, (round(center[0] - image.width / 2), round(center[1] - image.height / 2)))


def glow_from_alpha(asset: Image.Image, color: tuple[int, int, int, int], blur: int = 28, alpha_scale: float = 0.55) -> Image.Image:
    alpha = asset.getchannel("A").point(lambda value: min(255, int(value * alpha_scale))).filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", asset.size, color)
    out.putalpha(alpha)
    return out


def scale_alpha(image: Image.Image, factor: float) -> Image.Image:
    out = image.copy()
    out.putalpha(out.getchannel("A").point(lambda value: max(0, min(255, int(value * factor)))))
    return out


def grayscale_icon(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    gray = ImageOps.grayscale(image.convert("RGB"))
    colorized = ImageOps.colorize(gray, black="#273248", white="#9eadc4").convert("RGBA")
    colorized.putalpha(alpha.point(lambda value: int(value * 0.74)))
    return colorized


def draw_medallion(draw: ImageDraw.ImageDraw, filled: bool, accent: tuple[int, int, int]) -> None:
    cx, cy = FRAME // 2, FRAME // 2
    radius = 346
    if filled:
        glow = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow, "RGBA")
        gd.ellipse((cx - radius - 28, cy - radius - 28, cx + radius + 28, cy + radius + 28), fill=(*accent, 48))
        glow = glow.filter(ImageFilter.GaussianBlur(42))
        draw.bitmap((0, 0), glow)
        outer = (*accent, 235)
        inner = (36, 54, 82, 245)
        stroke = (255, 238, 150, 210)
    else:
        outer = (72, 83, 106, 170)
        inner = (34, 42, 58, 210)
        stroke = (127, 143, 168, 120)
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=outer)
    draw.ellipse((cx - radius + 42, cy - radius + 42, cx + radius - 42, cy + radius - 42), fill=inner)
    draw.ellipse((cx - radius + 18, cy - radius + 18, cx + radius - 18, cy + radius - 18), outline=stroke, width=18)
    draw.arc((cx - radius + 70, cy - radius + 62, cx + radius - 70, cy + radius - 90), start=202, end=338, fill=(255, 255, 255, 52 if filled else 28), width=18)


def draw_keyboard_motif(accent: tuple[int, int, int]) -> Image.Image:
    layer = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    x0, y0, x1, y1 = 285, 410, 740, 648
    draw.rounded_rectangle((x0 + 18, y0 + 24, x1 + 18, y1 + 24), radius=54, fill=(0, 0, 0, 60))
    draw.rounded_rectangle((x0, y0, x1, y1), radius=54, fill=(52, 69, 91, 255), outline=(150, 184, 220, 180), width=10)
    key_w, key_h = 82, 58
    for row, count in enumerate([4, 3]):
        start_x = 338 + row * 42
        y = 456 + row * 74
        for col in range(count):
            x = start_x + col * 92
            fill = (*accent, 235) if row == 0 and col in (1, 2) else (151, 166, 187, 210)
            draw.rounded_rectangle((x, y, x + key_w, y + key_h), radius=18, fill=fill, outline=(255, 255, 255, 75), width=4)
            draw.arc((x + 12, y + 9, x + key_w - 12, y + key_h - 18), 205, 335, fill=(255, 255, 255, 82), width=3)
    return layer


def draw_check_motif(accent: tuple[int, int, int]) -> Image.Image:
    layer = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    draw.rounded_rectangle((315, 390, 710, 654), radius=76, fill=(48, 64, 86, 245), outline=(255, 255, 255, 80), width=10)
    points = [(390, 520), (475, 600), (650, 430)]
    draw.line(points, fill=(*accent, 255), width=54, joint="curve")
    draw.line(points, fill=(255, 255, 255, 118), width=17, joint="curve")
    return layer


def draw_milestone_dots(count: int, accent: tuple[int, int, int]) -> Image.Image:
    layer = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    positions = [(420, 448), (512, 390), (604, 448), (450, 565), (574, 565)]
    for idx, pos in enumerate(positions[:count]):
        r = 58 if idx == 1 else 48
        draw.ellipse((pos[0] - r, pos[1] - r, pos[0] + r, pos[1] + r), fill=(*accent, 235), outline=(255, 255, 255, 92), width=8)
        draw.ellipse((pos[0] - r + 16, pos[1] - r + 13, pos[0] + r - 18, pos[1] - 4), fill=(255, 255, 255, 58))
    return layer


def render_icon(slug: str, motif: Image.Image, accent: tuple[int, int, int], category: str) -> dict:
    filled = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    draw = ImageDraw.Draw(filled, "RGBA")
    draw_medallion(draw, True, accent)
    paste_center(filled, glow_from_alpha(motif, (*accent, 255), blur=25, alpha_scale=0.45), (512, 512))
    paste_center(filled, motif, (512, 512))

    muted = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    draw_muted = ImageDraw.Draw(muted, "RGBA")
    draw_medallion(draw_muted, False, accent)
    paste_center(muted, grayscale_icon(motif), (512, 512))

    filled_path = OUT / "filled" / f"{slug}.png"
    muted_path = OUT / "muted" / f"{slug}.png"
    filled_path.parent.mkdir(parents=True, exist_ok=True)
    muted_path.parent.mkdir(parents=True, exist_ok=True)
    filled.save(filled_path)
    muted.save(muted_path)
    return {
        "id": slug,
        "category": category,
        "filled": str(filled_path.relative_to(OUT)),
        "muted": str(muted_path.relative_to(OUT)),
        "recommended_slot_size": 72,
    }


def copy_sources(source_map: dict[str, Path]) -> dict[str, str]:
    source_dir = OUT / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    copied: dict[str, str] = {}
    for key, path in source_map.items():
        target = source_dir / path.name
        shutil.copy2(path, target)
        copied[key] = str(target.relative_to(OUT))
    return copied


def build_contact_sheet(icons: list[dict]) -> None:
    cols = 4
    cell_w = 360
    cell_h = 330
    header_h = 120
    width = cols * cell_w
    rows = math.ceil(len(icons) / cols)
    image = Image.new("RGBA", (width, header_h + rows * cell_h + 340), DARK)
    draw = ImageDraw.Draw(image, "RGBA")
    draw.text((42, 30), "Discovery Icons v2 - filled and muted states", fill=(245, 248, 255, 255), font=font(34))
    draw.text((42, 72), "12 candidates, shown at 1024 source and 72px five-slot target size", fill=(168, 184, 207, 255), font=font(20))
    for index, item in enumerate(icons):
        col = index % cols
        row = index // cols
        x = col * cell_w + 28
        y = header_h + row * cell_h + 20
        draw.rounded_rectangle((x, y, x + cell_w - 56, y + cell_h - 36), radius=18, fill=(10, 18, 32, 255), outline=(95, 122, 160, 80), width=2)
        filled = load_asset(OUT / item["filled"]).resize((150, 150), Image.Resampling.LANCZOS)
        muted = load_asset(OUT / item["muted"]).resize((150, 150), Image.Resampling.LANCZOS)
        image.alpha_composite(filled, (x + 36, y + 52))
        image.alpha_composite(muted, (x + 178, y + 52))
        small_filled = load_asset(OUT / item["filled"]).resize((72, 72), Image.Resampling.LANCZOS)
        small_muted = load_asset(OUT / item["muted"]).resize((72, 72), Image.Resampling.LANCZOS)
        image.alpha_composite(small_filled, (x + 72, y + 218))
        image.alpha_composite(small_muted, (x + 214, y + 218))
        draw.text((x + 28, y + 18), item["id"], fill=(255, 225, 121, 255), font=font(18))
        draw.text((x + 28, y + 292), item["category"], fill=(161, 178, 205, 255), font=font(16))
    tray_y = header_h + rows * cell_h + 76
    draw.text((42, tray_y - 45), "Five-slot scale examples", fill=(255, 225, 121, 255), font=font(26))
    for sample_row, start in enumerate([0, 4, 8]):
        y = tray_y + sample_row * 70
        draw.rounded_rectangle((42, y - 6, 42 + 5 * 86 + 34, y + 66), radius=34, fill=(11, 20, 35, 255), outline=(105, 130, 165, 105), width=2)
        for i in range(5):
            icon = icons[(start + i) % len(icons)]
            state = "filled" if i < 3 else "muted"
            thumb = load_asset(OUT / icon[state]).resize((58, 58), Image.Resampling.LANCZOS)
            image.alpha_composite(thumb, (66 + i * 86, y))
    contact_path = OUT / "contact-sheets/discovery-icons-contact-sheet.png"
    contact_path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(contact_path)


def write_manifest(icons: list[dict], sources: dict[str, str]) -> None:
    payload = {
        "card": "WTJ-20260704-061",
        "asset_pack": "discovery-icons",
        "created_by": "Designer 2 / Automation:worktime-justin-designer-2-loop",
        "source_assets": sources,
        "canvas": {"source_size": [FRAME, FRAME], "background": "transparent", "target_slot_preview_px": 72},
        "icons": icons,
        "contact_sheet": "contact-sheets/discovery-icons-contact-sheet.png",
        "quality_checks": [
            "12 icon candidates across keyboard exploration, secret-word discovery, and task-success semantics.",
            "Each icon has filled and muted transparent PNG states.",
            "Contact sheet shows both 150px review scale and 72px five-slot scale.",
            "All source icon PNGs are 1024x1024 RGBA with zero alpha at all corners.",
            "Existing accepted production sprites are reused where possible to avoid style drift.",
        ],
    }
    (OUT / "manifest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def write_docs() -> None:
    readme = """# Discovery Icons v2

对应飞书卡：`WTJ-20260704-061`。

本包交付五槽与探索里程碑图标候选。每个图标都有 `filled` 点亮态和 `muted` 灰态，源文件为 `1024x1024 RGBA` 透明 PNG，contact sheet 同时展示五槽实际小尺寸读感。

## 产物

- `filled/`: 12 个点亮态透明 PNG。
- `muted/`: 12 个灰态透明 PNG。
- `contact-sheets/discovery-icons-contact-sheet.png`: 暗底评审接触表，含 72px 五槽尺寸示例。
- `manifest.json`: 图标语义、状态路径、推荐槽位尺寸与质量检查。
- `source/`: 复用的已验收生产素材。

## 语义分组

- `keyboard_exploration`: 键盘探索、按键里程碑、键盘星星。
- `secret_word_discovery`: 秘密词命中后的对象类发现。
- `task_success`: 问号任务完成和工作状态灯类反馈。

## 取舍

- 没有新生成大批图像，而是把已验收 v3 / A / B 包素材装入统一 medallion 体系，保证小尺寸读感和风格一致。
- 键盘类图标中有少量本地绘制的 soft-clay 键帽和里程碑点，避免使用文字数字表达 100/200 次。
- 灰态不只是降透明度，而是整体去饱和并保留轮廓，便于五槽内看清“空槽/未点亮”。

## 自检

- 12 个候选，24 张状态 PNG。
- PNG 均为 `1024x1024 RGBA`，四角 alpha 均为 0。
- contact sheet 已包含 72px 五槽尺寸预览。
- 无文字、水印、外部品牌或版权角色风格。
"""
    (OUT / "README.md").write_text(readme)

    rationale = """# Prompt And Rationale

本包没有重新调用图像生成模型。视觉策略是复用已验收生产素材，并用统一的 soft-clay medallion 体系生成五槽尺寸图标，降低风格漂移风险。

## 视觉约束

```text
Use the WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft light, warm child-friendly saturation. Discovery icons must be readable inside a five-slot tray at about 58-72 px, with both filled and muted states. No text, no watermark, no background, no copyrighted character style.
```

## 设计说明

- 点亮态使用暖色描边和低强度光晕，适合作为五槽“已发现”状态。
- 灰态去饱和并降低 alpha，但保留 medallion 轮廓，避免空槽看起来像缺图。
- 键盘探索、秘密词发现、任务成功三类语义都各给了 4 个候选，PM 可按游戏节奏筛选。

## 已知风险

- 当前图标是候选集合，不代表 12 个都要进入 app；建议 PM/Ethan 先从每类各选 1-2 个。
- 键盘里程碑没有数字标记，儿童友好但对成人配置含义不够直白；manifest 中已保留语义 ID。
"""
    (OUT / "prompt-and-rationale.md").write_text(rationale)


def validate() -> None:
    problems: list[str] = []
    for folder in ["filled", "muted"]:
        for path in sorted((OUT / folder).glob("*.png")):
            image = load_asset(path)
            if image.size != (FRAME, FRAME) or image.mode != "RGBA":
                problems.append(f"{path}: expected 1024x1024 RGBA, got {image.size} {image.mode}")
                continue
            corners = [
                image.getpixel((0, 0))[3],
                image.getpixel((FRAME - 1, 0))[3],
                image.getpixel((0, FRAME - 1))[3],
                image.getpixel((FRAME - 1, FRAME - 1))[3],
            ]
            if any(corners):
                problems.append(f"{path}: corner alpha not zero: {corners}")
    if problems:
        raise SystemExit("\n".join(problems))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source_map = {
        "star": PACK_A / "rewards/star-sticker.png",
        "sparkle": PACK_A / "rewards/sparkle-burst.png",
        "working_status_light": PACK_A / "ui/working-status-light.png",
        "task_target_badge": PACK_A / "ui/task-target-badge.png",
        "dog": PACK_B / "sprites/dog.png",
        "apple": PACK_B / "sprites/apple.png",
        "rocket": PACK_B / "sprites/rocket.png",
        "treasure": PACK_B / "sprites/treasure.png",
        "bell": PACK_B / "sprites/bell.png",
    }
    sources = copy_sources(source_map)
    assets = {key: load_asset(path) for key, path in source_map.items()}

    motifs = [
        ("keyboard-star", "keyboard_exploration", draw_keyboard_motif((255, 218, 89)), (255, 218, 89)),
        ("keyboard-spark", "keyboard_exploration", fit_asset(assets["sparkle"], 440), (95, 231, 255)),
        ("milestone-three", "keyboard_exploration", draw_milestone_dots(3, (137, 242, 124)), (137, 242, 124)),
        ("milestone-five", "keyboard_exploration", draw_milestone_dots(5, (255, 123, 119)), (255, 123, 119)),
        ("word-dog", "secret_word_discovery", fit_asset(assets["dog"], 420), (255, 190, 96)),
        ("word-apple", "secret_word_discovery", fit_asset(assets["apple"], 410), (255, 122, 119)),
        ("word-star", "secret_word_discovery", fit_asset(assets["star"], 360), (255, 218, 89)),
        ("word-treasure", "secret_word_discovery", fit_asset(assets["treasure"], 410), (255, 198, 82)),
        ("task-check", "task_success", draw_check_motif((87, 227, 137)), (87, 227, 137)),
        ("task-target", "task_success", fit_asset(assets["task_target_badge"], 390), (94, 231, 255)),
        ("task-light", "task_success", fit_asset(assets["working_status_light"], 420), (137, 242, 124)),
        ("task-bell", "task_success", fit_asset(assets["bell"], 395), (255, 211, 110)),
    ]
    icons = [render_icon(slug, motif, accent, category) for slug, category, motif, accent in motifs]
    build_contact_sheet(icons)
    write_manifest(icons, sources)
    write_docs()
    validate()
    print(f"generated {len(icons)} icons / {len(icons) * 2} state PNGs in {OUT}")


if __name__ == "__main__":
    main()
