# Find Targets + Hover Feedback v2

Card: `WTJ-20260704-059`
Owner session: `Designer 1 / Automation:worktime-justin-design-loop`

This pack provides a first PM/Ethan review set for "find the target" tasks. It is meant for visual selection and later TL integration planning, not an automatic code handoff.

## Contents

- `objects/`: 10 transparent target PNGs on 512 x 512 canvases.
- `feedback/ring-pulse/`: 8 transparent hover ring frames.
- `feedback/check-spark/`: 8 transparent one-shot success frames.
- `sheets/`: frame sheets for both feedback sets.
- `previews/`: GIF previews composited on the dark app canvas.
- `find-targets-contact-sheet.png`: dark-canvas review sheet with 72 px small previews and hit-area overlays.
- `manifest.json`: source paths, frame metadata, hit areas, fps, loop behavior, and review notes.
- `prompt-and-rationale.md`: visual decisions, prompt notes, and tradeoffs.

## Object Candidates

The candidate set is:

`apple`, `ball`, `bell`, `car`, `duck`, `flower`, `key`, `lamp`, `rocket`, `star`.

I intentionally did not include the old basket, treasure chest, or dog directions in this review pack. Those shapes were called out as too flat or low quality in earlier feedback, and this card is about finding higher-confidence small targets.

## Review Notes

- All target PNGs are transparent and normalized to 512 x 512.
- Each object has a padded rounded-rectangle hit area in `manifest.json`.
- The contact sheet shows both full-size review art and 72 px previews on the dark canvas.
- `ring-pulse` can loop briefly while the pointer stays on the target.
- `check-spark` should play once on successful hover or target confirmation, then disappear.

