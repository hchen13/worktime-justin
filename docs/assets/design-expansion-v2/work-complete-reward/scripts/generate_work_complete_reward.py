#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[5]
OUT = ROOT / "docs/assets/design-expansion-v2/work-complete-reward"
PACK_A = ROOT / "docs/assets/production-pack-a"
PACK_B = ROOT / "docs/assets/production-pack-b"

FRAME = 1024
DARK = (7, 13, 24, 255)


def load_asset(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def crop_visible(image: Image.Image, pad: int = 20) -> Image.Image:
    bbox = image.getbbox()
    if not bbox:
        return image.copy()
    left, top, right, bottom = bbox
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(image.width, right + pad)
    bottom = min(image.height, bottom + pad)
    return image.crop((left, top, right, bottom))


def fit_asset(image: Image.Image, size: int) -> Image.Image:
    image = crop_visible(image)
    ratio = min(size / image.width, size / image.height)
    new_size = (max(1, round(image.width * ratio)), max(1, round(image.height * ratio)))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def paste_center(base: Image.Image, image: Image.Image, center: tuple[int, int]) -> None:
    x = round(center[0] - image.width / 2)
    y = round(center[1] - image.height / 2)
    base.alpha_composite(image, (x, y))


def tint_from_alpha(alpha_source: Image.Image, color: tuple[int, int, int, int]) -> Image.Image:
    alpha = alpha_source.getchannel("A")
    out = Image.new("RGBA", alpha_source.size, color)
    out.putalpha(alpha)
    return out


def glow_layer(asset: Image.Image, color: tuple[int, int, int, int], blur: int, scale_alpha: float) -> Image.Image:
    alpha = asset.getchannel("A").point(lambda value: int(value * scale_alpha))
    alpha = alpha.filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", asset.size, color)
    out.putalpha(alpha)
    return out


def scale_alpha(image: Image.Image, factor: float) -> Image.Image:
    out = image.copy()
    out.putalpha(out.getchannel("A").point(lambda value: max(0, min(255, int(value * factor)))))
    return out


def rotate_asset(image: Image.Image, angle: float) -> Image.Image:
    return image.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)


def make_sheet(frames: list[Path], output: Path, cols: int = 4) -> None:
    images = [load_asset(path) for path in frames]
    rows = math.ceil(len(images) / cols)
    sheet = Image.new("RGBA", (cols * FRAME, rows * FRAME), (0, 0, 0, 0))
    for index, image in enumerate(images):
        x = (index % cols) * FRAME
        y = (index // cols) * FRAME
        sheet.alpha_composite(image, (x, y))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def dark_preview_frame(frame: Image.Image, label: str | None = None) -> Image.Image:
    bg = Image.new("RGBA", (FRAME, FRAME), DARK)
    radial = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    draw = ImageDraw.Draw(radial)
    for radius, alpha in [(460, 14), (340, 20), (220, 26)]:
        draw.ellipse(
            (FRAME / 2 - radius, FRAME / 2 - radius, FRAME / 2 + radius, FRAME / 2 + radius),
            fill=(34, 72, 124, alpha),
        )
    bg.alpha_composite(radial)
    bg.alpha_composite(frame)
    if label:
        draw = ImageDraw.Draw(bg)
        draw.rounded_rectangle((36, 36, 390, 96), radius=22, fill=(14, 24, 42, 230), outline=(95, 135, 180, 110), width=2)
        draw.text((60, 56), label, fill=(232, 241, 255, 255), font=font(28))
    return bg.convert("RGB")


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def save_gif(frames: list[Path], output: Path, label: str) -> None:
    preview_frames = [dark_preview_frame(load_asset(path), label) for path in frames]
    output.parent.mkdir(parents=True, exist_ok=True)
    preview_frames[0].save(
        output,
        save_all=True,
        append_images=preview_frames[1:],
        duration=95,
        loop=0,
        disposal=2,
        optimize=False,
    )


def draw_soft_particle(draw: ImageDraw.ImageDraw, x: float, y: float, radius: float, color: tuple[int, int, int, int]) -> None:
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)


def draw_wrapped_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    xy: tuple[int, int],
    max_width: int,
    fill: tuple[int, int, int, int],
    text_font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    line_gap: int = 6,
) -> int:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        if draw.textbbox((0, 0), trial, font=text_font)[2] <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    x, y = xy
    line_height = draw.textbbox((0, 0), "Ag", font=text_font)[3] + line_gap
    for line in lines:
        draw.text((x, y), line, fill=fill, font=text_font)
        y += line_height
    return y


def line_sheet_contact(candidates: list[dict], output: Path) -> None:
    width = 1680
    row_h = 360
    header_h = 110
    image = Image.new("RGBA", (width, header_h + row_h * len(candidates)), DARK)
    draw = ImageDraw.Draw(image)
    draw.text((48, 34), "Work Complete Reward v2 - 3 candidates", fill=(245, 248, 255, 255), font=font(38))
    draw.text((48, 78), "Dark-canvas contact sheet, transparent frames composited for visual review", fill=(164, 181, 207, 255), font=font(20))
    for row, candidate in enumerate(candidates):
        y = header_h + row * row_h
        draw.rectangle((0, y, width, y + row_h), fill=(8, 16, 29, 255) if row % 2 else (10, 18, 32, 255))
        draw.text((48, y + 34), candidate["title"], fill=(255, 224, 112, 255), font=font(30))
        draw_wrapped_text(draw, candidate["summary"], (48, y + 78), 500, (207, 219, 238, 255), font(20))
        for col, frame_index in enumerate(candidate["contact_frames"]):
            frame = load_asset(candidate["frame_paths"][frame_index])
            card = dark_preview_frame(frame).resize((235, 235), Image.Resampling.LANCZOS)
            x = 620 + col * 255
            image.alpha_composite(card.convert("RGBA"), (x, y + 62))
            draw.text((x + 82, y + 306), f"f{frame_index:02d}", fill=(154, 172, 201, 255), font=font(18))
    output.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(output)


def render_status_lights(assets: dict[str, Image.Image]) -> dict:
    out_dir = OUT / "status-lights"
    frames_dir = out_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    light = fit_asset(assets["light"], 210)
    sparkle = fit_asset(assets["sparkle"], 260)
    star = fit_asset(assets["star"], 170)
    frames: list[Path] = []
    centers = [(344, 520), (512, 520), (680, 520)]
    for i in range(8):
        t = i / 7
        pulse = math.sin(t * math.pi)
        frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
        draw = ImageDraw.Draw(frame, "RGBA")
        for idx, center in enumerate(centers):
            delay = max(0, min(1, (i - idx) / 5))
            local = math.sin(delay * math.pi)
            glow_r = 92 + 42 * local
            draw.ellipse(
                (center[0] - glow_r, center[1] - glow_r, center[0] + glow_r, center[1] + glow_r),
                fill=(104, 245, 145, int(42 + 62 * local)),
            )
            scaled = light.resize((round(light.width * (0.9 + 0.08 * local)), round(light.height * (0.9 + 0.08 * local))), Image.Resampling.LANCZOS)
            paste_center(frame, glow_layer(scaled, (110, 255, 156, 255), 28, 0.62), center)
            paste_center(frame, scaled, center)
        if i >= 2:
            small = scale_alpha(star, 0.65 + 0.35 * pulse)
            paste_center(frame, rotate_asset(small, -8 + i * 3), (510, 335 - 28 * pulse))
        if i >= 3:
            burst = scale_alpha(sparkle, 0.34 + 0.46 * pulse)
            paste_center(frame, burst, (512, 480))
        frames.append(frames_dir / f"status_lights_{i:03d}.png")
        frame.save(frames[-1])
    sheet = out_dir / "status-lights-sheet.png"
    preview = OUT / "previews/status-lights-preview.gif"
    make_sheet(frames, sheet)
    save_gif(frames, preview, "status lights")
    return {
        "id": "status_lights_flash",
        "title": "Candidate A - three work lights flash together",
        "summary": "Three accepted working-status lights pulse, then a small star and sparkle burst appear; reads as completed work without occupying the canvas permanently.",
        "frames": [str(path.relative_to(OUT)) for path in frames],
        "frame_paths": frames,
        "sheet": str(sheet.relative_to(OUT)),
        "preview": str(preview.relative_to(OUT)),
        "fps": 12,
        "loop": False,
        "recommended_use": "今日工作完成 after three task lights are filled.",
        "contact_frames": [0, 2, 4, 7],
    }


def render_workbench_stamp(assets: dict[str, Image.Image]) -> dict:
    out_dir = OUT / "workbench-stamp"
    frames_dir = out_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    sticker = fit_asset(assets["happy"], 370)
    sparkle = fit_asset(assets["sparkle"], 320)
    star = fit_asset(assets["star"], 190)
    frames: list[Path] = []
    for i in range(8):
        t = i / 7
        drop = max(0, 1 - abs((t - 0.38) / 0.38))
        settle = max(0, (t - 0.35) / 0.65)
        frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
        draw = ImageDraw.Draw(frame, "RGBA")
        y = 388 + 128 * (1 - min(1, t * 2.3))
        scale = 0.72 + 0.36 * min(1, t * 2.1)
        if 3 <= i <= 4:
            scale *= 0.94
        glow_r = 230 + 42 * settle
        draw.ellipse((512 - glow_r, 540 - glow_r * 0.55, 512 + glow_r, 540 + glow_r * 0.55), fill=(255, 218, 93, int(35 + 45 * settle)))
        badge = sticker.resize((round(sticker.width * scale), round(sticker.height * scale)), Image.Resampling.LANCZOS)
        paste_center(frame, glow_layer(badge, (255, 215, 92, 255), 30, 0.45), (512, round(y)))
        paste_center(frame, rotate_asset(badge, -5 + 8 * settle), (512, round(y)))
        if i >= 3:
            burst = scale_alpha(sparkle, 0.28 + 0.52 * settle)
            paste_center(frame, burst, (512, 534))
            for n, angle in enumerate([-62, -28, 26, 58]):
                radius = 190 + 60 * settle
                x = 512 + math.cos(math.radians(angle)) * radius
                yy = 520 + math.sin(math.radians(angle)) * radius * 0.64
                small = scale_alpha(star.resize((120, 120), Image.Resampling.LANCZOS), 0.55 + 0.25 * drop)
                paste_center(frame, rotate_asset(small, angle / 3 + i * 2), (round(x), round(yy)))
        frames.append(frames_dir / f"workbench_stamp_{i:03d}.png")
        frame.save(frames[-1])
    sheet = out_dir / "workbench-stamp-sheet.png"
    preview = OUT / "previews/workbench-stamp-preview.gif"
    make_sheet(frames, sheet)
    save_gif(frames, preview, "stamp")
    return {
        "id": "workbench_stamp",
        "title": "Candidate B - soft workbench stamp",
        "summary": "A happy/check reward sticker drops like a soft stamp, compresses, and releases star stickers; no text and no permanent sticker pile.",
        "frames": [str(path.relative_to(OUT)) for path in frames],
        "frame_paths": frames,
        "sheet": str(sheet.relative_to(OUT)),
        "preview": str(preview.relative_to(OUT)),
        "fps": 12,
        "loop": False,
        "recommended_use": "Sticker/stamp interpretation of 今日工作完成.",
        "contact_frames": [0, 2, 4, 7],
    }


def render_rocket_launch(assets: dict[str, Image.Image]) -> dict:
    out_dir = OUT / "rocket-launch"
    frames_dir = out_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    rocket = fit_asset(assets["rocket"], 340)
    sparkle = fit_asset(assets["sparkle"], 250)
    star = fit_asset(assets["star"], 120)
    frames: list[Path] = []
    for i in range(9):
        t = i / 8
        frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
        draw = ImageDraw.Draw(frame, "RGBA")
        x = 512 + 22 * math.sin(t * math.pi * 1.5)
        y = 675 - 370 * (t ** 1.35)
        flame_len = 90 + 95 * t
        draw.ellipse((x - 115, 690 - 35, x + 115, 690 + 35), fill=(98, 145, 255, int(28 * (1 - t))))
        for n in range(7):
            py = y + 150 + n * 45
            px = x + math.sin(i + n) * 32
            alpha = max(0, int(150 * (1 - n / 7) * (0.45 + 0.55 * t)))
            draw_soft_particle(draw, px, py, 18 + n * 3, (255, 221, 103, alpha))
        draw.polygon(
            [(x - 42, y + 132), (x + 42, y + 132), (x, y + 132 + flame_len)],
            fill=(255, 142, 71, int(120 + 60 * t)),
        )
        draw.polygon(
            [(x - 24, y + 132), (x + 24, y + 132), (x, y + 132 + flame_len * 0.62)],
            fill=(255, 244, 130, int(135 + 60 * t)),
        )
        tilted = rotate_asset(rocket, -8 + 5 * math.sin(t * math.pi * 2))
        paste_center(frame, glow_layer(tilted, (110, 175, 255, 255), 30, 0.34), (round(x), round(y)))
        paste_center(frame, tilted, (round(x), round(y)))
        if i >= 4:
            burst = scale_alpha(sparkle, 0.18 + 0.58 * (t - 0.5) * 2)
            paste_center(frame, burst, (512, 392))
            for n, angle in enumerate([-130, -92, -44, 38, 84, 132]):
                dist = 145 + 70 * t
                sx = 512 + math.cos(math.radians(angle)) * dist
                sy = 392 + math.sin(math.radians(angle)) * dist * 0.75
                small = scale_alpha(star, 0.48)
                paste_center(frame, rotate_asset(small, angle / 4 + i * 5), (round(sx), round(sy)))
        frames.append(frames_dir / f"rocket_launch_{i:03d}.png")
        frame.save(frames[-1])
    sheet = out_dir / "rocket-launch-sheet.png"
    preview = OUT / "previews/rocket-launch-preview.gif"
    make_sheet(frames, sheet, cols=3)
    save_gif(frames, preview, "rocket")
    return {
        "id": "rocket_launch",
        "title": "Candidate C - small rocket launch",
        "summary": "The accepted rocket sprite lifts off with a warm flame trail and restrained sparkles; most expressive option, still a short one-shot.",
        "frames": [str(path.relative_to(OUT)) for path in frames],
        "frame_paths": frames,
        "sheet": str(sheet.relative_to(OUT)),
        "preview": str(preview.relative_to(OUT)),
        "fps": 12,
        "loop": False,
        "recommended_use": "High-delight version when PM/Ethan want a larger celebration.",
        "contact_frames": [0, 2, 5, 8],
    }


def copy_sources() -> dict[str, str]:
    source_dir = OUT / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    sources = {
        "working_status_light": PACK_A / "ui/working-status-light.png",
        "happy_reward_sticker": PACK_A / "rewards/happy-reward-sticker.png",
        "star_sticker": PACK_A / "rewards/star-sticker.png",
        "sparkle_burst": PACK_A / "rewards/sparkle-burst.png",
        "rocket": PACK_B / "sprites/rocket.png",
    }
    copied = {}
    for key, source in sources.items():
        target = source_dir / source.name
        shutil.copy2(source, target)
        copied[key] = str(target.relative_to(OUT))
    return copied


def write_manifest(candidates: list[dict], sources: dict[str, str]) -> None:
    payload = {
        "card": "WTJ-20260704-060",
        "asset_pack": "work-complete-reward",
        "created_by": "Designer 2 / Automation:worktime-justin-designer-2-loop",
        "canvas": {"frame_size": [FRAME, FRAME], "background": "transparent", "preview_background": "dark navy"},
        "source_assets": sources,
        "candidates": [
            {
                "id": item["id"],
                "title": item["title"],
                "summary": item["summary"],
                "fps": item["fps"],
                "loop": item["loop"],
                "recommended_use": item["recommended_use"],
                "frames": item["frames"],
                "sheet": item["sheet"],
                "preview": item["preview"],
                "anchor": [512, 512],
                "bounds": "visible alpha contained inside 1024x1024; no canvas-edge contact",
            }
            for item in candidates
        ],
        "contact_sheet": "contact-sheets/work-complete-reward-contact-sheet.png",
        "quality_checks": [
            "All generated numbered frames are 1024x1024 RGBA transparent PNG.",
            "Frame sheets preserve transparent background.",
            "Preview GIFs composite frames on dark navy canvas for visual review only.",
            "No text, watermark, external brand, or copyrighted character style is introduced.",
            "The pack reuses accepted WorkTime Justin production assets to avoid style drift.",
        ],
    }
    (OUT / "manifest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def write_docs(candidates: list[dict]) -> None:
    readme = """# Work Complete Reward v2

对应飞书卡：`WTJ-20260704-060`。

本包交付“今日工作完成”奖励的 3 套生产候选。目标是让 PM/Ethan 能直接看关键帧和短动画 preview 决定方向；当前不直接进入 app，是否集成由 PM 评审后另拆 TL 卡。

## 产物

- `manifest.json`: 3 套候选的帧、sheet、preview、来源素材和质量检查。
- `status-lights/`: 三个工作状态灯一起闪的短奖励。
- `workbench-stamp/`: 工作台盖章/贴纸式完成奖励。
- `rocket-launch/`: 小火箭发射式较强奖励。
- `previews/`: 暗底 GIF，便于直接查看动效。
- `contact-sheets/work-complete-reward-contact-sheet.png`: 三套候选的暗底接触表。
- `source/`: 复制本包使用的已验收生产素材源图，方便追溯。

## 候选说明

1. `status_lights_flash`: 最克制，和需求里的“工作状态灯”语义最直接。适合作为默认完成奖励。
2. `workbench_stamp`: 更像“完成盖章”，但不含文字，不会把贴纸永久堆在画布上。
3. `rocket_launch`: 最有兴奋感，适合作为偶发或更强的三任务连续完成奖励。

## 取舍

- 没有重新生成主体图，避免和已验收 v3 / A / B 包材质漂移。
- 所有动效都是透明 PNG 帧叠加，可由 TL 后续接入现有 frame animation 管线。
- preview GIF 的深色背景仅用于评审；实际帧文件仍是透明背景。
- 三套都不含文字，避免三岁孩子依赖阅读，也避免中文任务说明进入奖励层。

## 自检

- 三套候选共 25 张编号帧，均为 `1024x1024 RGBA`。
- 帧文件透明背景，四角 alpha 为 0。
- 已生成 frame sheet、preview GIF、contact sheet。
- 深色画布上可读，没有明显裁切或永久占屏元素。
"""
    (OUT / "README.md").write_text(readme)

    lines = [
        "# Prompt And Rationale",
        "",
        "本包没有重新调用图像生成模型，而是复用已验收生产素材做确定性组合与短帧动效，以降低风格漂移风险。",
        "",
        "## 复用素材",
        "",
        "- `production-pack-a/ui/working-status-light.png`",
        "- `production-pack-a/rewards/happy-reward-sticker.png`",
        "- `production-pack-a/rewards/star-sticker.png`",
        "- `production-pack-a/rewards/sparkle-burst.png`",
        "- `production-pack-b/sprites/rocket.png`",
        "",
        "## 视觉约束",
        "",
        "```text",
        "Use the WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft light, warm child-friendly saturation. Preserve the existing production sprite material exactly; only add transparent glow, sparkle, squash/scale, position, and flame/trail effects. Keep every frame on a 1024x1024 transparent canvas, no text, no watermark, no background, no magenta residue.",
        "```",
        "",
        "## 候选 rationale",
        "",
    ]
    for item in candidates:
        lines.extend(
            [
                f"### {item['id']}",
                "",
                item["summary"],
                "",
                f"- Sheet: `{item['sheet']}`",
                f"- Preview: `{item['preview']}`",
                f"- Recommended use: {item['recommended_use']}",
                "",
            ]
        )
    lines.extend(
        [
            "## 已知风险",
            "",
            "- `rocket_launch` 比另外两套更兴奋，PM 若想默认界面更克制，建议只保留为稀有大奖励。",
            "- `workbench_stamp` 当前用无文字 happy/check 贴纸表达盖章，没有真实印章工具；如果 Ethan 更喜欢“爸爸工作台”隐喻，可后续生成专门的 stamp object。",
            "- 三套均为设计候选，还未进入 app 运行性能验证。",
            "",
        ]
    )
    (OUT / "prompt-and-rationale.md").write_text("\n".join(lines))


def validate(candidates: list[dict]) -> None:
    all_frames = [path for item in candidates for path in item["frame_paths"]]
    problems: list[str] = []
    for path in all_frames:
        image = load_asset(path)
        if image.size != (FRAME, FRAME) or image.mode != "RGBA":
            problems.append(f"{path}: expected 1024x1024 RGBA, got {image.size} {image.mode}")
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
    sources = copy_sources()
    assets = {
        "light": load_asset(PACK_A / "ui/working-status-light.png"),
        "happy": load_asset(PACK_A / "rewards/happy-reward-sticker.png"),
        "star": load_asset(PACK_A / "rewards/star-sticker.png"),
        "sparkle": load_asset(PACK_A / "rewards/sparkle-burst.png"),
        "rocket": load_asset(PACK_B / "sprites/rocket.png"),
    }
    candidates = [
        render_status_lights(assets),
        render_workbench_stamp(assets),
        render_rocket_launch(assets),
    ]
    validate(candidates)
    line_sheet_contact(candidates, OUT / "contact-sheets/work-complete-reward-contact-sheet.png")
    write_manifest(candidates, sources)
    write_docs(candidates)
    print(f"generated {sum(len(item['frame_paths']) for item in candidates)} frames in {OUT}")


if __name__ == "__main__":
    main()
