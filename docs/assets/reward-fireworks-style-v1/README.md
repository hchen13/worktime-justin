# Reward Fireworks Style Reference v1

Card: WTJ-20260706-007
Executor: Designer 1 / CodexThread:019f2887-9de8-7b72-b53b-230a0857f710

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
