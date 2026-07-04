# Prompt And Rationale

Card: `WTJ-20260704-063`
Owner session: `Designer 1 / Automation:worktime-justin-design-loop`

## Rework Goal

PM rejected v2 because several candidates still read as flat vector/icon decoration. This v3 pass replaces that weak subset with candidates built around accepted WorkTime Justin production sprites and Pack A reward art.

## Style Baseline

The active baseline is the accepted WorkTime Justin sprite style:

- polished 2.5D soft-plastic / soft-clay look
- rounded child-friendly silhouettes
- unified 3/4-ish object language
- top-left soft light
- soft outline, bevels, highlights, and internal shadows
- readable on the dark app canvas at 128 px and 64 px

Reference sources:

- `docs/assets/sprites/sprite-style-guide.md`
- `docs/assets/production-pack-a/rewards/`
- `docs/assets/production-pack-b/sprites/`

## Generation Rule

```text
Create original WorkTime Justin transient reward stickers in the accepted 2.5D soft-plastic / soft-clay production style. Use transparent PNGs, rounded forms, polished highlights and shadows, and accepted production sprites as the visual center. Cover star, sparkle, stamp/check, ribbon, and tiny prize directions. Avoid flat icon/vector-only marks, rough mockups, emoji-like art, copyrighted characters, brand imitation, text inside the asset, dirty alpha, magenta/green chroma remnants, and old rejected basket/dog/treasure directions.
```

## Rework Decisions

- `sparkle_gold_burst`, `sparkle_teal_burst`, and `confetti_task_burst` were rebuilt around production sprite centers instead of flat line bursts.
- `tiny_prize_star_token` and `tiny_prize_teal_token` were rebuilt as dimensional prize tokens with production star centers.
- `ribbon_gold_badge` and `ribbon_teal_badge` were removed from the active set because they were too plain and flat.
- `ribbon_gift_prize` and `ribbon_rainbow_prize` replace those ribbon directions with recognizable production sprite centers.
- `ball_bonus_token` was added as a buffer candidate.

## Tradeoffs

- Some badge bases and check marks are generated overlays, but every active candidate now has a production sprite or accepted reward art as the visual center.
- The pack includes 18 candidates so PM can reject weaker options while preserving the required minimum of 16.
- These are design candidates only. Runtime timing, scale, and disappearance behavior still need a separate PM-routed TL integration card if accepted.

## Self-Check

- All active sticker PNGs are 512 x 512 RGBA.
- Transparent corners are clean.
- No active sticker file sits outside `manifest.json`.
- Pure magenta and pure green chroma-like pixels were removed or recolored.
- Contact sheet shows both 128 px and 64 px previews on the dark app canvas.

