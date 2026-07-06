# WTJ-20260706-006 Faucet Outlet Alignment

Executor: Designer 1
Identity: CodexThread:019f2887-9de8-7b72-b53b-230a0857f710
Branch: codex/design-wtj-20260706-006-faucet-align
Base: stage

## Goal

Fix the WTJ-020 faucet water stream so the visible water column exits from the metal faucet mouth instead of reading as shifted to the right. Preserve the accepted WTJ-020 thicker-water look, transparent alpha, frame count, runtime sheet dimensions, and faucet body.

## Change

- Recentered the widened water crop to the measured metal outlet center at `x=280`, `y=760`.
- Kept the WTJ-020 water width treatment at `1.48x`; this is an alignment correction, not a new style direction.
- Regenerated high-resolution `open`, `running`, and `closing` frames.
- Regenerated source sheets and 256px runtime sheets.
- Copied regenerated runtime sheets into `app/web/assets/anim/faucet/` for the app-facing asset path.

## Evidence

- Mouth crop before/after: `faucet-mouth-crop-before-after-align.png`
- Centerline crop: `faucet-mouth-crop-aligned-centerline.png`
- High-resolution contact sheet: `faucet-alignment-before-after-contact-sheet.png`
- Runtime 256 before/after: `faucet-water-alignment-before-after-runtime-256.png`
- Validation JSON: `faucet-alignment-validation.json`
- Manifest: `manifest.json`
- Dimension report: `dimension-report.json`

## Validation

The previous water center was approximately `x=318`, about `38px` right of the measured metal outlet center. After regeneration:

- `open`: center delta from outlet is `-0.5px`.
- `running`: center deltas from outlet are `-0.5px, 0.0px, -0.5px, -1.0px, 0.0px, -0.5px`.
- `closing`: first closing frame starts at `-0.5px`; later frames taper naturally and keep the visible stream under the mouth as it shuts off.
- `running-sheet.png` and `closing-sheet.png` in both `runtime-256/` and `app/web/assets/anim/faucet/` are `1536x256`.

## Scope Boundary

This package only changes WTJ-20260706-006 faucet alignment assets:

- `docs/assets/production-animations-v1/faucet/wtj-020-thicker-water/`
- `app/web/assets/anim/faucet/running-sheet.png`
- `app/web/assets/anim/faucet/closing-sheet.png`

The app manifest already consumes `running` and `closing` faucet sheets from `app/web/assets/anim/faucet/`; no new app state was introduced.
