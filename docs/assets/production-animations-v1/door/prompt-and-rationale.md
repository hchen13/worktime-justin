# Door Opening Cleanup

Card: `WTJ-20260706-004`

Executor: Designer 1 / `CodexThread:019f2887-9de8-7b72-b53b-230a0857f710`

## Source

- Fixed body source: `docs/assets/production-animations-v1/door/closed/door_closed_000.png`
- Previous opening frames: `docs/assets/production-animations-v1/door/opening/door_opening_000.png..004.png`
- Output root: `docs/assets/production-animations-v1/door/`

## Prompt / Direction

Use the WorkTime Justin production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft light, warm child-friendly saturation. Preserve the existing door stone frame and wood-door material exactly; only clean the visible doorway interior by removing hard seams, blocky shadows, and generated residue. Keep every frame on a 1024x1024 transparent canvas, with stable anchor, no text, no watermark, no background, and no magenta residue.

## Decision

This pass does not regenerate the door from a prompt. It derives frames from the accepted closed door sprite, clears the doorway aperture, paints one continuous warm interior gradient, and compresses the accepted wood door toward the hinge side for the existing five opening frames.

The runtime opening sheet remains five 256px cells, matching `app/web/anim-manifest.js`. The open terminal frame was also synchronized with the cleaned final opening frame because the review contact sheet and preview GIF include the terminal state; leaving the old open frame would reintroduce the same dirty background artifact at the end of the preview.

## Evidence

- Updated opening frames: `docs/assets/production-animations-v1/door/opening/`
- Updated opening source sheet: `docs/assets/production-animations-v1/door/sheets/opening-sheet.png`
- Updated opening runtime sheet: `app/web/assets/anim/door/opening-sheet.png`
- Updated clean terminal open frame: `docs/assets/production-animations-v1/door/open/door_open_000.png`
- Updated clean terminal open runtime sheet: `app/web/assets/anim/door/open-sheet.png`
- Updated contact sheet: `docs/assets/production-animations-v1/door/door-contact-sheet.png`
- Updated preview: `docs/assets/production-animations-v1/previews/door-opening-preview.gif`
- Local preview copy: `docs/assets/production-animations-v1/door/previews/door-opening-preview.gif`
- Before/after evidence: `docs/assets/production-animations-v1/door/evidence/wtj-20260706-004/door-opening-before-after-contact-sheet.png`
- Aperture crop: `docs/assets/production-animations-v1/door/evidence/wtj-20260706-004/door-opening-aperture-crop-before-after.png`
- Small-size check: `docs/assets/production-animations-v1/door/evidence/wtj-20260706-004/door-opening-small-size-readability.png`
- Alpha checker: `docs/assets/production-animations-v1/door/evidence/wtj-20260706-004/door-opening-alpha-checker-preview.png`
- Validation JSON: `docs/assets/production-animations-v1/door/evidence/wtj-20260706-004/door-opening-validation.json`

## Residual Risk

This is still a flattened sprite opening approximation, not a true hinged 3D door rig. It is intentionally scoped to the PM-requested cleanup: remove unexplainable background artifacts while preserving the accepted production material and current runtime frame contract.
