#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[5]
SOURCE = ROOT / "docs/assets/production-animations-v1/faucet"
OUT = SOURCE / "wtj-020-thicker-water"
SCALE_X = 1.48
FRAME_SIZE = 1024
RUNTIME_SIZE = 256
DARK_BG = (17, 20, 30, 255)


def is_water_pixel(r: int, g: int, b: int, a: int) -> bool:
    if a <= 20:
        return False
    return b > 90 and g > 55 and r < 125 and b > r + 35 and g > r + 18


def split_sheet(path: Path, frame_count: int) -> list[Image.Image]:
    sheet = Image.open(path).convert("RGBA")
    frame_w = sheet.width // frame_count
    return [
        sheet.crop((i * frame_w, 0, (i + 1) * frame_w, sheet.height))
        for i in range(frame_count)
    ]


def water_bbox(frame: Image.Image) -> tuple[int, int, int, int] | None:
    xs: list[int] = []
    ys: list[int] = []
    for y in range(560, frame.height):
        for x in range(140, 470):
            r, g, b, a = frame.getpixel((x, y))
            if is_water_pixel(r, g, b, a):
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    pad = 8
    return (
        max(0, min(xs) - pad),
        max(0, min(ys) - pad),
        min(frame.width, max(xs) + 1 + pad),
        min(frame.height, max(ys) + 1 + pad),
    )


def remove_water(frame: Image.Image) -> Image.Image:
    cleared = frame.copy()
    px = cleared.load()
    for y in range(560, cleared.height):
        for x in range(140, 470):
            r, g, b, a = px[x, y]
            if is_water_pixel(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
    return cleared


def thicken_water(frame: Image.Image) -> Image.Image:
    bbox = water_bbox(frame)
    if bbox is None:
        return frame.copy()
    water = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    water.alpha_composite(frame)
    mask = Image.new("L", frame.size, 0)
    mask_px = mask.load()
    for y in range(560, frame.height):
        for x in range(140, 470):
            r, g, b, a = frame.getpixel((x, y))
            if is_water_pixel(r, g, b, a):
                mask_px[x, y] = a
    isolated = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    isolated.paste(frame, (0, 0), mask)
    x0, y0, x1, y1 = bbox
    crop = isolated.crop(bbox)
    crop_px = crop.load()
    for y in range(crop.height):
        for x in range(crop.width):
            r, g, b, a = crop_px[x, y]
            if a and is_water_pixel(r, g, b, a):
                crop_px[x, y] = (
                    min(255, int(r * 1.05 + 8)),
                    min(255, int(g * 1.18 + 18)),
                    min(255, int(b * 1.10 + 14)),
                    a,
                )
    new_w = round(crop.width * SCALE_X)
    scaled = crop.resize((new_w, crop.height), Image.Resampling.BICUBIC)
    center_x = (x0 + x1) // 2
    nx = round(center_x - new_w / 2)
    base = remove_water(frame)
    base.alpha_composite(scaled, (nx, y0))
    return base


def save_sheet(frames: list[Image.Image], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (frames[0].width * len(frames), frames[0].height), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.alpha_composite(frame, (i * frame.width, 0))
    sheet.save(path)


def save_runtime_sheet(frames: list[Image.Image], path: Path) -> None:
    resized = [
        frame.resize((RUNTIME_SIZE, RUNTIME_SIZE), Image.Resampling.LANCZOS)
        for frame in frames
    ]
    save_sheet(resized, path)


def save_frames(label: str, frames: list[Image.Image]) -> None:
    folder = OUT / label
    folder.mkdir(parents=True, exist_ok=True)
    for i, frame in enumerate(frames):
        frame.save(folder / f"faucet_{label}_{i:03d}.png")


def contact_sheet(states: dict[str, list[Image.Image]]) -> None:
    rows = [("open", states["open"]), ("running", states["running"]), ("closing", states["closing"]), ("off", states["off"])]
    cell = 170
    label_h = 24
    margin = 14
    cols = 6
    canvas = Image.new(
        "RGBA",
        (margin * 2 + cols * cell, margin * 2 + len(rows) * (cell + label_h + margin)),
        DARK_BG,
    )
    draw = ImageDraw.Draw(canvas)
    y = margin
    for label, frames in rows:
        for i, frame in enumerate(frames):
            thumb = frame.copy()
            thumb.thumbnail((cell - 12, cell - 12), Image.Resampling.LANCZOS)
            x = margin + i * cell + (cell - thumb.width) // 2
            canvas.alpha_composite(thumb, (x, y + label_h + (cell - thumb.height) // 2))
            draw.text((margin + i * cell + 6, y), f"{label} {i}", fill=(225, 235, 255, 255))
        y += cell + label_h + margin
    canvas.save(OUT / "faucet-thicker-water-contact-sheet.png")


def runtime_contact_sheet(states: dict[str, list[Image.Image]]) -> None:
    runtime_states = {
        label: [frame.resize((RUNTIME_SIZE, RUNTIME_SIZE), Image.Resampling.LANCZOS) for frame in frames]
        for label, frames in states.items()
    }
    rows = [("open", runtime_states["open"]), ("running", runtime_states["running"]), ("closing", runtime_states["closing"]), ("off", runtime_states["off"])]
    cell = 170
    label_h = 24
    margin = 14
    cols = 6
    canvas = Image.new(
        "RGBA",
        (margin * 2 + cols * cell, margin * 2 + len(rows) * (cell + label_h + margin)),
        DARK_BG,
    )
    draw = ImageDraw.Draw(canvas)
    y = margin
    for label, frames in rows:
        for i, frame in enumerate(frames):
            thumb = frame.resize((128, 128), Image.Resampling.NEAREST)
            x = margin + i * cell + (cell - thumb.width) // 2
            canvas.alpha_composite(thumb, (x, y + label_h + (cell - thumb.height) // 2))
            draw.text((margin + i * cell + 6, y), f"{label} {i}", fill=(225, 235, 255, 255))
        y += cell + label_h + margin
    canvas.save(OUT / "faucet-thicker-water-runtime-256-contact-sheet.png")


def crop_inspection(frame: Image.Image) -> None:
    crop = frame.crop((120, 520, 520, 1024))
    bg = Image.new("RGBA", crop.size, DARK_BG)
    bg.alpha_composite(crop, (0, 0))
    bg = bg.resize((crop.width * 2, crop.height * 2), Image.Resampling.NEAREST)
    bg.save(OUT / "faucet-mouth-crop-thicker.png")


def before_after_runtime(running_frames: list[Image.Image]) -> None:
    old_sheet = Image.open(ROOT / "app/web/assets/anim/faucet/running-sheet.png").convert("RGBA")
    old_frames = [
        old_sheet.crop((i * RUNTIME_SIZE, 0, (i + 1) * RUNTIME_SIZE, RUNTIME_SIZE))
        for i in range(6)
    ]
    new_frames = [
        frame.resize((RUNTIME_SIZE, RUNTIME_SIZE), Image.Resampling.LANCZOS)
        for frame in running_frames
    ]
    rows = [
        ("before: current rejected app asset", old_frames),
        ("after: WTJ-020 thicker-water candidate", new_frames),
    ]
    cell = 170
    label_h = 30
    margin = 18
    canvas = Image.new("RGBA", (margin * 2 + 6 * cell, margin * 2 + len(rows) * (cell + label_h + margin)), DARK_BG)
    draw = ImageDraw.Draw(canvas)
    y = margin
    for label, frames in rows:
        draw.text((margin, y), label, fill=(245, 248, 255, 255))
        for i, frame in enumerate(frames):
            thumb = frame.resize((128, 128), Image.Resampling.NEAREST)
            x = margin + i * cell + (cell - thumb.width) // 2
            canvas.alpha_composite(thumb, (x, y + label_h + (cell - thumb.height) // 2))
            draw.text((margin + i * cell + 6, y + label_h + cell - 16), f"{i}", fill=(205, 215, 235, 255))
        y += cell + label_h + margin
    canvas.save(OUT / "faucet-water-before-after-runtime-256.png")


def dimensions_report(states: dict[str, list[Image.Image]]) -> dict[str, object]:
    report: dict[str, object] = {"scale_x": SCALE_X, "states": {}}
    for label, frames in states.items():
        state_report = []
        for i, frame in enumerate(frames):
            bbox = water_bbox(frame)
            state_report.append({"frame": i, "water_bbox": bbox, "water_width": None if bbox is None else bbox[2] - bbox[0]})
        report["states"][label] = state_report
    return report


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    open_frames = [thicken_water(Image.open(SOURCE / "open/faucet_open_000.png").convert("RGBA"))]
    running_frames = [thicken_water(frame) for frame in split_sheet(SOURCE / "sheets/running-sheet.png", 6)]
    closing_frames = [thicken_water(frame) for frame in split_sheet(SOURCE / "sheets/closing-sheet.png", 6)]
    closed_frames = [Image.open(SOURCE / "closed/faucet_closed_000.png").convert("RGBA")]
    off_frames = [Image.open(SOURCE / "off/faucet_off_000.png").convert("RGBA")]
    states = {
        "open": open_frames,
        "running": running_frames,
        "closing": closing_frames,
        "closed": closed_frames,
        "off": off_frames,
    }
    for label, frames in states.items():
        save_frames(label, frames)
        save_sheet(frames, OUT / "sheets" / f"{label}-sheet.png")
        save_runtime_sheet(frames, OUT / "runtime-256" / f"{label}-sheet.png")
    contact_sheet(states)
    runtime_contact_sheet(states)
    crop_inspection(running_frames[0])
    before_after_runtime(running_frames)
    (OUT / "dimension-report.json").write_text(json.dumps(dimensions_report(states), ensure_ascii=False, indent=2) + "\n")
    manifest = {
        "card": "WTJ-20260705-020",
        "asset": "faucet thicker water repair",
        "source": "docs/assets/production-animations-v1/faucet",
        "method": f"isolated existing water pixels, widened horizontally {SCALE_X}x, preserved faucet body and timing",
        "frame_size": [FRAME_SIZE, FRAME_SIZE],
        "runtime_target_size": [RUNTIME_SIZE, RUNTIME_SIZE],
        "states": {
            "open": {"frames": 1, "fps": 8, "loop": False},
            "running": {"frames": 6, "fps": 8, "loop": True},
            "closing": {"frames": 6, "fps": 10, "loop": False},
            "closed": {"frames": 1, "fps": 1, "loop": False},
            "off": {"frames": 1, "fps": 1, "loop": False},
        },
        "runtime_candidate_mapping": {
            "running": "app/web/assets/anim/faucet/running-sheet.png",
            "closing": "app/web/assets/anim/faucet/closing-sheet.png",
            "closed": "app/web/assets/anim/faucet/closed-sheet.png",
            "off": "app/web/assets/anim/faucet/off-sheet.png",
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
