# WTJ-20260703-007 Sprite Samples

## Goal

Generate a small sprite sample pack to validate the visual language for secret-word objects before scaling to the full word pool.

Do not generate the full 100-word library yet.

## Outputs

Save transparent PNG samples under:

`/Users/claire/Documents/worktime-justin/docs/assets/sprites/`

Required samples:

- `dog.png`
- `cat.png`
- `apple.png`
- `ball.png`
- `star.png`
- `car.png`
- `basket.png`
- `treasure-chest.png`

## Sprite Requirements

- Transparent background.
- Simple, readable silhouette.
- Works on a dark canvas.
- Child-friendly but not copied from any branded character.
- Consistent perspective and lighting.
- Enough transparent padding for animation.
- Prefer square source images, at least 1024x1024 before downscaling.

## Prompt Starter

```text
Use case: transparent PNG sprite for a children's desktop app.
Create a single original [OBJECT] sprite on transparent background.
Style: simple friendly 2D illustration, clean silhouette, soft highlight, subtle shadow, readable on a dark navy canvas, premium children's software.
Do not include text, watermark, background, scene, frame, or copyrighted character style.
Centered object, square canvas, generous transparent padding.
```

Replace `[OBJECT]` with each required sample.

## Acceptance Notes

The goal is consistency and readability, not final game-ready animation. If image generation cannot produce true alpha reliably, output clean cutout candidates and record that cleanup is needed.
