# WTJ-20260703-007 Sprite Samples

## Goal

Generate a small production-quality sprite sample pack to validate the visual language for secret-word objects before scaling to the full word pool.

Do not generate the full 100-word library yet.

These are not documentation placeholders. This card sets the quality bar for real in-app secret-word assets.

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
- Finished illustration quality, not emoji, rough sketch, quick icon, or screenshot placeholder.
- Unified style across every sample.
- Simple, readable silhouette with enough detail to feel polished.
- Works on a dark canvas.
- Child-friendly but not copied from any branded character.
- Consistent perspective, outline treatment, lighting, shadow, color saturation, and rendering detail.
- Enough transparent padding for animation.
- Prefer square source images, at least 1024x1024 before downscaling.
- Clean alpha edge; no visible background halo, watermark, generation artifact, cropped edge, or mismatched scale.
- A young child should recognize the object immediately at expected in-app size.

## Rejection Bar

PM should reject the sample pack if it looks like:

- emoji or emoji-derived art
- rough vector doodles
- inconsistent styles between objects
- low-detail placeholder art
- UI screenshot fragments instead of clean sprites
- assets that only work in the docs but would look cheap in the app

## Prompt Starter

```text
Use case: transparent PNG sprite for a children's desktop app.
Create a single original [OBJECT] sprite on transparent background.
Style: polished friendly 2D illustration for a premium children's software product, clean silhouette, refined details, consistent outline, soft highlight, subtle shadow, readable on a dark navy canvas.
Do not include text, watermark, background, scene, frame, or copyrighted character style.
Centered object, square canvas, generous transparent padding.
```

Replace `[OBJECT]` with each required sample.

## Acceptance Notes

The goal is to decide whether this art direction is good enough for production. If image generation cannot produce true alpha reliably, output clean cutout candidates and record that cleanup is needed, but do not mark the card ready for PM acceptance as final sprite samples.

Reference quality rules: `/Users/claire/Documents/worktime-justin/.agents/docs/production-asset-quality.md`.
