#!/usr/bin/env python3
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[5]
OUT = ROOT / "docs/assets/design-expansion-v2/backgrounds"
W, H = 1440, 900


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


def lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def blend(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return (lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t))


def base_gradient(top: tuple[int, int, int], middle: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    image = Image.new("RGB", (W, H))
    pix = image.load()
    for y in range(H):
        t = y / (H - 1)
        if t < 0.58:
            color = blend(top, middle, t / 0.58)
        else:
            color = blend(middle, bottom, (t - 0.58) / 0.42)
        for x in range(W):
            pix[x, y] = color
    return image.convert("RGBA")


def add_shadowed_polygon(
    image: Image.Image,
    points: list[tuple[int, int]],
    fill: tuple[int, int, int, int],
    shadow_offset: tuple[int, int] = (0, 10),
    shadow_alpha: int = 55,
    shadow_blur: int = 18,
) -> None:
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow, "RGBA")
    ox, oy = shadow_offset
    sd.polygon([(x + ox, y + oy) for x, y in points], fill=(0, 0, 0, shadow_alpha))
    image.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(shadow_blur)))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(layer, "RGBA").polygon(points, fill=fill)
    image.alpha_composite(layer)


def add_shadowed_rect(
    image: Image.Image,
    box: tuple[int, int, int, int],
    radius: int,
    fill: tuple[int, int, int, int],
    outline: tuple[int, int, int, int] | None = None,
    width: int = 1,
    shadow_offset: tuple[int, int] = (0, 8),
    shadow_alpha: int = 40,
    shadow_blur: int = 12,
) -> None:
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow, "RGBA")
    ox, oy = shadow_offset
    x0, y0, x1, y1 = box
    sd.rounded_rectangle((x0 + ox, y0 + oy, x1 + ox, y1 + oy), radius=radius, fill=(0, 0, 0, shadow_alpha))
    image.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(shadow_blur)))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
    image.alpha_composite(layer)


def add_bevel_line(image: Image.Image, points: list[tuple[int, int]], color: tuple[int, int, int], alpha: int, width: int) -> None:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    draw.line(points, fill=(*color, alpha), width=width, joint="curve")
    image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(0.4)))


def add_grain(image: Image.Image, alpha: int = 7) -> None:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pix = layer.load()
    for y in range(0, H, 4):
        for x in range(0, W, 4):
            value = ((x * 13 + y * 23 + x // 7) % 37) - 18
            if value > 11:
                pix[x, y] = (255, 255, 255, alpha)
            elif value < -12:
                pix[x, y] = (0, 0, 0, alpha)
    image.alpha_composite(layer)


def add_workbench_shell(image: Image.Image, spec: dict) -> None:
    horizon = spec["horizon"]
    wall = spec["wall"]
    desk = spec["desk"]
    accent = spec["accent"]

    # Wall and desktop are deliberately planar. No circular light blobs are used.
    add_shadowed_rect(
        image,
        (86, 96, W - 86, horizon + 44),
        28,
        (*wall, 46),
        outline=(*accent, 28),
        width=2,
        shadow_offset=(0, 14),
        shadow_alpha=35,
        shadow_blur=24,
    )
    add_shadowed_polygon(
        image,
        [(0, horizon - 12), (W, horizon - 44), (W, H), (0, H)],
        (*desk, 154),
        shadow_offset=(0, 22),
        shadow_alpha=44,
        shadow_blur=20,
    )
    add_bevel_line(image, [(0, horizon - 12), (W, horizon - 44)], accent, 74, 3)
    add_bevel_line(image, [(120, H - 132), (W - 110, H - 160)], (255, 255, 255), 20, 2)

    for i, x in enumerate([210, 420, 690, 965, 1205]):
        h = 160 + ((i * 41 + spec["seed"] * 9) % 120)
        y0 = horizon - h - 62
        y1 = horizon - 82
        alpha = 12 + i % 3 * 5
        add_shadowed_rect(
            image,
            (x - 54, y0, x + 54, y1),
            12,
            (*accent, alpha),
            outline=(*accent, alpha + 16),
            width=1,
            shadow_alpha=16,
            shadow_blur=10,
        )


def add_workbench_details(image: Image.Image, spec: dict) -> None:
    accent = spec["accent"]
    muted = spec["muted"]
    horizon = spec["horizon"]
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")

    # Left shelf: small, explainable storage shapes, kept out of the central letter area.
    shelf_y = 170 + (spec["seed"] % 3) * 18
    draw.rounded_rectangle((118, shelf_y, 382, shelf_y + 18), radius=7, fill=(*accent, 68))
    draw.rounded_rectangle((132, shelf_y - 54, 188, shelf_y - 8), radius=10, fill=(*muted, 36), outline=(*accent, 36), width=1)
    draw.rounded_rectangle((204, shelf_y - 74, 250, shelf_y - 8), radius=10, fill=(*muted, 30), outline=(*accent, 32), width=1)
    draw.rounded_rectangle((269, shelf_y - 42, 360, shelf_y - 8), radius=10, fill=(*muted, 28), outline=(*accent, 28), width=1)

    # Right rail: task atmosphere without extra icon buttons.
    rail_x = W - 318
    draw.rounded_rectangle((rail_x, 150, rail_x + 218, 164), radius=7, fill=(*accent, 56))
    for i in range(4):
        x = rail_x + 16 + i * 50
        draw.rounded_rectangle((x, 190 + i % 2 * 12, x + 34, 250 + i % 2 * 18), radius=8, fill=(*muted, 30), outline=(*accent, 34), width=1)

    # Desk lip and work pads. They create scale but stay low in the frame.
    draw.rounded_rectangle((78, horizon + 74, 316, horizon + 112), radius=13, fill=(*muted, 44), outline=(*accent, 30), width=1)
    draw.rounded_rectangle((W - 356, horizon + 64, W - 106, horizon + 108), radius=13, fill=(*muted, 34), outline=(*accent, 26), width=1)
    for i in range(6):
        x = 120 + i * 30
        draw.rounded_rectangle((x, horizon + 86, x + 18, horizon + 96), radius=3, fill=(*accent, 44))

    image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(0.25)))


def add_scene_variant(image: Image.Image, spec: dict) -> None:
    accent = spec["accent"]
    muted = spec["muted"]
    horizon = spec["horizon"]
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    variant = spec["variant"]

    if variant == "keyboard":
        for i, (x, y) in enumerate([(512, horizon + 72), (564, horizon + 62), (616, horizon + 76), (668, horizon + 66), (720, horizon + 78)]):
            draw.rounded_rectangle((x, y, x + 40, y + 24), radius=7, fill=(*muted, 44), outline=(*accent, 40), width=1)
    elif variant == "task":
        draw.rounded_rectangle((W - 302, horizon - 248, W - 152, horizon - 92), radius=18, fill=(*muted, 44), outline=(*accent, 52), width=2)
        draw.line((W - 274, horizon - 202, W - 180, horizon - 202), fill=(*accent, 42), width=3)
        draw.line((W - 274, horizon - 168, W - 206, horizon - 168), fill=(*accent, 34), width=3)
    elif variant == "reward":
        draw.rounded_rectangle((152, horizon - 130, 242, horizon - 70), radius=16, fill=(*muted, 48), outline=(*accent, 58), width=2)
        draw.polygon([(152, horizon - 130), (242, horizon - 130), (224, horizon - 166), (170, horizon - 166)], fill=(*muted, 34))
        draw.line((154, horizon - 130, 240, horizon - 130), fill=(*accent, 70), width=3)
    elif variant == "rest":
        draw.rounded_rectangle((178, horizon - 108, 380, horizon - 76), radius=14, fill=(*muted, 32), outline=(*accent, 36), width=1)
        draw.rounded_rectangle((204, horizon - 150, 340, horizon - 112), radius=15, fill=(*muted, 28), outline=(*accent, 30), width=1)
    elif variant == "night":
        for x in [420, 546, 812, 996]:
            draw.rounded_rectangle((x, 142 + x % 4 * 8, x + 9, 154 + x % 5 * 6), radius=2, fill=(*accent, 62))
    else:
        draw.rounded_rectangle((W - 514, horizon + 78, W - 440, horizon + 116), radius=11, fill=(*muted, 36), outline=(*accent, 30), width=1)
        draw.rounded_rectangle((W - 428, horizon + 70, W - 354, horizon + 112), radius=11, fill=(*muted, 30), outline=(*accent, 28), width=1)

    image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(0.35)))


def add_edge_vignette(image: Image.Image) -> None:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    for i in range(11):
        alpha = int(9 + i * 4.2)
        inset_x = i * 22
        inset_y = i * 14
        draw.rectangle((0, 0, W, inset_y), fill=(0, 0, 0, alpha))
        draw.rectangle((0, H - inset_y - 2, W, H), fill=(0, 0, 0, alpha))
        draw.rectangle((0, 0, inset_x, H), fill=(0, 0, 0, alpha))
        draw.rectangle((W - inset_x - 2, 0, W, H), fill=(0, 0, 0, alpha))
    image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(18)))


def make_background(spec: dict) -> Image.Image:
    image = base_gradient(spec["top"], spec["middle"], spec["bottom"])
    add_workbench_shell(image, spec)
    add_workbench_details(image, spec)
    add_scene_variant(image, spec)
    add_edge_vignette(image)
    add_grain(image, spec.get("grain", 7))
    return image.convert("RGB")


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def wrap_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    fnt: ImageFont.ImageFont,
    max_width: int,
    max_lines: int,
) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if text_size(draw, candidate, fnt)[0] <= max_width:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word
        if len(lines) == max_lines:
            break
    if current and len(lines) < max_lines:
        lines.append(current)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
    if len(lines) == max_lines and words:
        consumed = " ".join(lines).split()
        if len(consumed) < len(words):
            while lines[-1] and text_size(draw, lines[-1] + "...", fnt)[0] > max_width:
                lines[-1] = lines[-1].rsplit(" ", 1)[0] if " " in lines[-1] else lines[-1][:-1]
            lines[-1] = lines[-1] + "..."
    return lines


def draw_mock_ui(background: Image.Image, title: str) -> Image.Image:
    image = background.convert("RGBA")
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    draw.rectangle((0, 0, W, 78), fill=(4, 8, 15, 88))
    draw.text((42, 28), "Work Time, Justin!", fill=(226, 236, 250, 220), font=font(28))

    draw.ellipse((1310, 28, 1354, 72), fill=(255, 217, 90, 62), outline=(255, 230, 138, 148), width=3)
    qf = font(36)
    qw, qh = text_size(draw, "?", qf)
    draw.text((1332 - qw / 2, 50 - qh / 2), "?", fill=(255, 240, 178, 232), font=qf)

    for letter, color, pos, size, rot in [
        ("A", (255, 217, 90, 255), (205, 285), 112, -8),
        ("D", (94, 231, 255, 255), (555, 385), 138, 6),
        ("G", (255, 122, 119, 255), (930, 292), 116, 9),
        ("T", (141, 242, 124, 255), (1110, 525), 104, -5),
    ]:
        tile = Image.new("RGBA", (240, 240), (0, 0, 0, 0))
        glow = Image.new("RGBA", (240, 240), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow, "RGBA")
        fnt = font(size)
        tw, th = text_size(gd, letter, fnt)
        gd.text(((240 - tw) / 2, (240 - th) / 2 - 10), letter, fill=(*color[:3], 150), font=fnt)
        blur = glow.getchannel("A").filter(ImageFilter.GaussianBlur(14))
        glow_col = Image.new("RGBA", tile.size, color)
        glow_col.putalpha(blur.point(lambda v: int(v * 0.52)))
        tile.alpha_composite(glow_col)
        td = ImageDraw.Draw(tile, "RGBA")
        td.text(((240 - tw) / 2, (240 - th) / 2 - 10), letter, fill=color, font=fnt)
        rotated = tile.rotate(rot, resample=Image.Resampling.BICUBIC, expand=True)
        image.alpha_composite(rotated, (pos[0] - rotated.width // 2, pos[1] - rotated.height // 2))

    tray_y = H - 92
    draw.rounded_rectangle((W / 2 - 222, tray_y, W / 2 + 222, tray_y + 58), radius=29, fill=(5, 10, 18, 152), outline=(122, 150, 192, 100), width=2)
    for i in range(5):
        x = W / 2 - 172 + i * 86
        fill = (255, 217, 90, 92) if i < 2 else (255, 255, 255, 24)
        outline = (255, 229, 132, 185) if i < 2 else (140, 158, 188, 120)
        draw.ellipse((x, tray_y + 9, x + 40, tray_y + 49), fill=fill, outline=outline, width=2)
    for i in range(3):
        x = 42 + i * 28
        fill = (87, 227, 137, 210) if i < 2 else (72, 86, 111, 180)
        draw.ellipse((x, H - 134, x + 14, H - 120), fill=fill, outline=(255, 255, 255, 80), width=1)

    draw.text((42, H - 42), title, fill=(174, 190, 214, 230), font=font(22))
    image.alpha_composite(overlay)
    return image.convert("RGB")


def relative_luminance(rgb: tuple[int, int, int]) -> float:
    def channel(v: int) -> float:
        x = v / 255
        return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    la, lb = relative_luminance(a), relative_luminance(b)
    high, low = max(la, lb), min(la, lb)
    return (high + 0.05) / (low + 0.05)


def sample_contrast(image: Image.Image) -> dict:
    colors = {
        "yellow": (255, 217, 90),
        "cyan": (94, 231, 255),
        "coral": (255, 122, 119),
        "green": (141, 242, 124),
    }
    points = [(205, 285), (555, 385), (930, 292), (1110, 525), (720, 450)]
    results = {}
    for name, color in colors.items():
        ratios = []
        for x, y in points:
            bg = image.getpixel((x, y))[:3]
            ratios.append(round(contrast_ratio(color, bg), 2))
        results[name] = {"min": min(ratios), "samples": ratios}
    return results


def build_contact_sheet(specs: list[dict]) -> None:
    thumb_w, thumb_h = 500, 312
    raw_w, raw_h = 160, 100
    margin = 34
    label_h = 118
    cols = 2
    rows = math.ceil(len(specs) / cols)
    sheet = Image.new("RGB", (cols * (thumb_w + margin) + margin, rows * (thumb_h + label_h + margin) + margin + 84), (7, 13, 24))
    draw = ImageDraw.Draw(sheet)
    draw.text((margin, 24), "Backgrounds v2 rework - WorkTime Justin workbench scenes", fill=(245, 248, 255), font=font(30))
    draw.text((margin, 60), "No abstract orbs/bokeh: each mock shows letters, single question mark, five slots, and status lights.", fill=(168, 184, 207), font=font(18))
    for i, spec in enumerate(specs):
        row, col = divmod(i, cols)
        x = margin + col * (thumb_w + margin)
        y = margin + 84 + row * (thumb_h + label_h + margin)
        mock = Image.open(OUT / "mocks" / f"{spec['id']}-desktop-mock.png").convert("RGB")
        raw = Image.open(OUT / "backgrounds" / f"{spec['id']}.png").convert("RGB")
        sheet.paste(mock.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS), (x, y))
        sheet.paste(raw.resize((raw_w, raw_h), Image.Resampling.LANCZOS), (x + thumb_w - raw_w - 12, y + 12))
        draw.rounded_rectangle((x, y, x + thumb_w, y + thumb_h), radius=8, outline=(95, 122, 160), width=2)
        draw.rounded_rectangle((x + thumb_w - raw_w - 12, y + 12, x + thumb_w - 12, y + 12 + raw_h), radius=6, outline=(176, 204, 236), width=1)
        title_font = font(17)
        body_font = font(15)
        draw.text((x, y + thumb_h + 8), f"{spec['id']} - {spec['mode']}", fill=(255, 225, 121), font=title_font)
        line_y = y + thumb_h + 32
        for line in wrap_text(draw, f"min contrast {spec['min_contrast']:.2f} | {spec['recommended_use']}", body_font, thumb_w - 8, 2):
            draw.text((x, line_y), line, fill=(180, 198, 224), font=body_font)
            line_y += 20
        for line in wrap_text(draw, spec["cleanliness_note"], body_font, thumb_w - 8, 2):
            draw.text((x, line_y), line, fill=(146, 164, 191), font=body_font)
            line_y += 20
    out = OUT / "contact-sheets/backgrounds-contact-sheet.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)


SPECS = [
    {
        "id": "default-workbench",
        "mode": "normal",
        "recommended_use": "Default canvas, broadest safe option.",
        "cleanliness_note": "Desk/wall planes stay at edges; center remains empty for letters.",
        "variant": "default",
        "top": (6, 11, 20),
        "middle": (10, 19, 30),
        "bottom": (9, 23, 35),
        "wall": (22, 40, 58),
        "desk": (17, 36, 49),
        "accent": (91, 189, 219),
        "muted": (94, 122, 150),
        "horizon": 646,
        "seed": 3,
    },
    {
        "id": "keyboard-exploration-desk",
        "mode": "normal",
        "recommended_use": "Keyboard exploration with subtle key shapes near the desk.",
        "cleanliness_note": "Small keycaps are low on the desk, not a second UI.",
        "variant": "keyboard",
        "top": (6, 14, 21),
        "middle": (8, 25, 34),
        "bottom": (8, 33, 39),
        "wall": (20, 52, 61),
        "desk": (14, 53, 57),
        "accent": (82, 224, 203),
        "muted": (72, 134, 134),
        "horizon": 648,
        "seed": 8,
    },
    {
        "id": "task-focus-workbench",
        "mode": "task",
        "recommended_use": "Question-mark task mode, with one quiet task card at the right edge.",
        "cleanliness_note": "Task card is peripheral and does not mimic a clickable default icon stack.",
        "variant": "task",
        "top": (6, 10, 20),
        "middle": (11, 17, 31),
        "bottom": (13, 20, 36),
        "wall": (29, 37, 70),
        "desk": (23, 34, 61),
        "accent": (135, 167, 255),
        "muted": (86, 99, 144),
        "horizon": 640,
        "seed": 14,
    },
    {
        "id": "reward-warm-shelf",
        "mode": "reward",
        "recommended_use": "Short reward tint after a meaningful event.",
        "cleanliness_note": "Warm shelf/chest hint is small and temporary, not a permanent sticker wall.",
        "variant": "reward",
        "top": (12, 11, 21),
        "middle": (27, 20, 27),
        "bottom": (34, 23, 26),
        "wall": (62, 42, 45),
        "desk": (68, 45, 34),
        "accent": (255, 190, 91),
        "muted": (146, 88, 66),
        "horizon": 650,
        "seed": 17,
    },
    {
        "id": "quiet-rest-bench",
        "mode": "rest",
        "recommended_use": "Rest/reset state after a larger reward or busy task.",
        "cleanliness_note": "Bench shapes are horizontal and quiet, helping the canvas settle back down.",
        "variant": "rest",
        "top": (6, 13, 18),
        "middle": (9, 23, 24),
        "bottom": (9, 30, 27),
        "wall": (21, 49, 46),
        "desk": (17, 52, 43),
        "accent": (135, 218, 132),
        "muted": (83, 128, 100),
        "horizon": 650,
        "seed": 22,
    },
    {
        "id": "night-clean-stage",
        "mode": "normal",
        "recommended_use": "Very quiet night/default alternate for lower stimulation.",
        "cleanliness_note": "Only tiny rectangular wall marks; no star field or decorative dots.",
        "variant": "night",
        "top": (4, 8, 17),
        "middle": (8, 15, 27),
        "bottom": (10, 18, 31),
        "wall": (22, 34, 55),
        "desk": (18, 31, 50),
        "accent": (226, 206, 118),
        "muted": (84, 93, 123),
        "horizon": 654,
        "seed": 27,
    },
]


def write_docs(specs: list[dict], contrasts: dict[str, dict]) -> None:
    readme = """# Backgrounds v2 Rework

对应飞书卡：`WTJ-20260704-062`。

本次为 PM 2026-07-04 15:31 CST 打回后的返工版：删除上一版依赖大光斑、渐变圆块、泛化 bokeh 的视觉方向，改为更克制的 WorkTime Justin 工作台轻背景。背景使用暗色干净舞台、淡桌面/墙面层次、少量可解释的工作台元素，避免抢字母、五槽、单问号和 sprite。

## 产物

- `backgrounds/`: 6 张 `1440x900 RGB` 背景 PNG。
- `mocks/`: 6 张叠加桌面 UI 后的 canvas mock。
- `contact-sheets/backgrounds-contact-sheet.png`: PM/Ethan 评审用接触表，含 desktop mock 与 raw background 小预览。
- `manifest.json`: 用途、路径、对比度抽样、返工自检。
- `prompt-and-rationale.md`: 生成方式、取舍和风险。

## 候选

- `default-workbench`: 默认工作台，最稳妥的常态背景。
- `keyboard-exploration-desk`: 普通键盘探索，桌面低位有少量 keycap 语义。
- `task-focus-workbench`: 问号任务状态，右缘有一张非常淡的任务卡。
- `reward-warm-shelf`: 有意义奖励后的短暂暖色变体。
- `quiet-rest-bench`: 大反馈后回到安静状态的休息/重置背景。
- `night-clean-stage`: 更低刺激的夜间/安静默认备选。

## 自检

- 6 张背景均为 `1440x900 RGB`。
- 6 张 mock 均包含高对比字母、默认单问号、五个发现槽、角落状态灯；无输入回显条、无右侧图标竖排。
- 背景图本身未使用圆形光斑、装饰 orb、bokeh 圆点或泛化渐变圆块；场景元素均为桌面、墙面、架子、轨道、工作垫、任务卡等可解释工作台语义。
- 字母颜色在代表性点位的最小对比度已写入 manifest。
- 本包是设计候选；进入 app runtime 仍需 PM 另拆 TL 集成卡，并可能走 QA 视觉验收。
"""
    (OUT / "README.md").write_text(readme)

    rationale = """# Prompt And Rationale

本包采用确定性本地绘制，不调用图像生成模型。原因是 PM 已明确拒绝抽象大光斑/渐变圆块/bokeh 方向；代码绘制可以强制把视觉控制在 WorkTime Justin 工作台语义内，并避免随机贴图碎片、水印、文本、脏 alpha、版权风格模仿。

## 设计提示

```text
Create restrained dark WorkTime Justin workbench backgrounds for a toddler-safe fullscreen desktop app. The scene should feel like a quiet soft-plastic / soft-clay workbench stage: matte wall plane, subtle desktop plane, tiny shelves or rails, peripheral task atmosphere, top-left soft light implied by bevels. Keep the center clean for bright random letters. Show only one low-key question mark and five discovery slots in mocks. Do not use abstract light orbs, bokeh circles, decorative blobs, terminal input echoes, right-side icon stacks, wallpaper patterns, text inside assets, watermarks, or brand-like characters.
```

## 取舍

- 背景是 `RGB` 画布底层候选，不是透明 sprite；因此不做 alpha 角检查。
- 场景细节被限制在边缘和桌面低位，中间留给 A/D/G/T 等大字母。
- `reward-warm-shelf` 只建议作为短暂奖励 tint；不建议默认常驻。
- `task-focus-workbench` 的任务卡在右缘，语义上支持问号任务，但不构成第二套默认入口。
- 当前包用于 PM/Ethan 视觉筛选；是否进入 runtime 应由 PM 另拆 TL 集成卡决定。

## 对比度摘要

"""
    for spec in specs:
        c = contrasts[spec["id"]]
        rationale += f"- `{spec['id']}`: min sampled letter contrast {c['min_contrast']:.2f}; {spec['recommended_use']}\n"
    (OUT / "prompt-and-rationale.md").write_text(rationale)


def write_manifest(specs: list[dict], contrasts: dict[str, dict]) -> None:
    payload = {
        "card": "WTJ-20260704-062",
        "asset_pack": "backgrounds-v2-rework",
        "created_by": "Designer 2 / Automation:worktime-justin-designer-2-loop",
        "format": {
            "canvas_size": [W, H],
            "background_mode": "RGB PNG",
            "mock_overlay": "requirements-correct overlay: high-contrast letters + one question mark + five discovery slots + status lights",
        },
        "rework_reason": "PM rejected prior generic glow/orb/bokeh direction at 2026-07-04 15:31 CST; this version is workbench-grounded and restrained.",
        "backgrounds": [
            {
                "id": spec["id"],
                "mode": spec["mode"],
                "background": f"backgrounds/{spec['id']}.png",
                "desktop_mock": f"mocks/{spec['id']}-desktop-mock.png",
                "recommended_use": spec["recommended_use"],
                "why_it_keeps_canvas_clean": spec["cleanliness_note"],
                "min_sampled_letter_contrast": contrasts[spec["id"]]["min_contrast"],
                "contrast_samples": contrasts[spec["id"]]["samples"],
                "scene_elements": ["wall plane", "desktop plane", "subtle shelf/rail", "peripheral workbench detail"],
            }
            for spec in specs
        ],
        "contact_sheet": "contact-sheets/backgrounds-contact-sheet.png",
        "quality_checks": [
            "Six 1440x900 dark-friendly background candidates were regenerated.",
            "Every desktop mock keeps one question mark, five discovery slots, tiny status lights, and no input echo.",
            "Raw backgrounds avoid circular light blobs, decorative orbs, bokeh dots, wallpaper patterns, right-side icon stacks, and text.",
            "Workbench semantics are explicit: dark stage, wall/desk planes, shelf/rail/task/rest details.",
            "Letter contrast was sampled at five representative canvas points for yellow/cyan/coral/green letters.",
            "This is a design candidate pack only; runtime integration requires PM routing.",
        ],
    }
    (OUT / "manifest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def validate(specs: list[dict]) -> None:
    problems = []
    for spec in specs:
        for folder, suffix in [("backgrounds", ".png"), ("mocks", "-desktop-mock.png")]:
            path = OUT / folder / f"{spec['id']}{suffix}"
            if not path.exists():
                problems.append(f"missing {path}")
                continue
            image = Image.open(path)
            if image.size != (W, H) or image.mode != "RGB":
                problems.append(f"{path}: expected {W}x{H} RGB, got {image.size} {image.mode}")
    manifest = json.loads((OUT / "manifest.json").read_text())
    for item in manifest["backgrounds"]:
        for key in ["background", "desktop_mock"]:
            if not (OUT / item[key]).exists():
                problems.append(f"manifest path missing: {item[key]}")
    if not (OUT / manifest["contact_sheet"]).exists():
        problems.append(f"manifest path missing: {manifest['contact_sheet']}")
    if problems:
        raise SystemExit("\n".join(problems))


def clean_previous_outputs() -> None:
    for folder in [OUT / "backgrounds", OUT / "mocks", OUT / "contact-sheets"]:
        folder.mkdir(parents=True, exist_ok=True)
        for path in folder.glob("*.png"):
            path.unlink()


def main() -> None:
    clean_previous_outputs()
    contrasts: dict[str, dict] = {}
    for spec in SPECS:
        bg = make_background(spec)
        bg_path = OUT / "backgrounds" / f"{spec['id']}.png"
        mock_path = OUT / "mocks" / f"{spec['id']}-desktop-mock.png"
        bg.save(bg_path)
        mock = draw_mock_ui(bg, spec["mode"])
        mock.save(mock_path)
        sampled = sample_contrast(bg)
        min_contrast = min(item["min"] for item in sampled.values())
        contrasts[spec["id"]] = {"min_contrast": min_contrast, "samples": sampled}
        spec["min_contrast"] = min_contrast
    build_contact_sheet(SPECS)
    write_manifest(SPECS, contrasts)
    write_docs(SPECS, contrasts)
    validate(SPECS)
    print(f"generated {len(SPECS)} reworked backgrounds in {OUT}")


if __name__ == "__main__":
    main()
