# Reward Stickers Rework v3

Card: `WTJ-20260704-063`
Owner session: `Designer 1 / Automation:worktime-justin-design-loop`

This is the PM rework pass for one-shot reward stickers and burst assets. The failed v2 flat/vector-style candidates were replaced or removed from the active candidate set.

## Contents

- `stickers/`: 18 active transparent PNG reward candidates on 512 x 512 canvases.
- `contact-sheets/reward-stickers-v3-contact-sheet.png`: dark-canvas review sheet with 128 px and 64 px previews.
- `manifest.json`: category, source paths, rework status, recommended use, and retained/reworked/removed summary.
- `prompt-and-rationale.md`: source strategy, rejection rationale, and tradeoffs.

## Coverage

- `star`: `star_gold_pop`, `star_teal_orbit`
- `sparkle`: `sparkle_gold_burst`, `sparkle_teal_burst`, `confetti_task_burst`
- `stamp/check`: `stamp_check_green`, `stamp_check_gold`
- `ribbon`: `ribbon_star_prize`, `ribbon_rocket_prize`, `ribbon_gift_prize`, `ribbon_rainbow_prize`
- `tiny_prize`: `tiny_prize_gift`, `tiny_prize_rocket`, `tiny_prize_star_token`, `tiny_prize_teal_token`, `heart_cheer_badge`, `rainbow_finish_badge`, `ball_bonus_token`

## Rework Summary

- Kept and refined: `star_gold_pop`, `star_teal_orbit`, `stamp_check_green`, `stamp_check_gold`, `ribbon_star_prize`, `ribbon_rocket_prize`, `tiny_prize_gift`, `tiny_prize_rocket`, `heart_cheer_badge`, `rainbow_finish_badge`.
- Redone from flat: `sparkle_gold_burst`, `sparkle_teal_burst`, `confetti_task_burst`, `tiny_prize_star_token`, `tiny_prize_teal_token`.
- Replaced: `ribbon_gold_badge` became `ribbon_gift_prize`; `ribbon_teal_badge` became `ribbon_rainbow_prize`.
- Added buffer: `ball_bonus_token`, so PM can drop two candidates and still keep the required 16 minimum.

## Review Notes

- These are transient reward assets: pop in, hold briefly, then disappear.
- The active set uses accepted production sprites or Pack A reward art as the visual center.
- Old v2 flat ribbon files and the v2 contact sheet were removed from the active candidate paths.
- No copyrighted characters, brand marks, visible text, or previously rejected low-quality basket/dog/treasure directions are used.

