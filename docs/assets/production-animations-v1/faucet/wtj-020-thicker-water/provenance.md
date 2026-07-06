# WTJ-20260705-020 Faucet Thicker Water Repair

Executor: Designer 1
Identity: Automation:worktime-justin-design-loop
Date: 2026-07-05 23:05 CST

## Design Prompt

Repair the WorkTime Justin faucet animation so the running water reads as a broad, child-friendly stream that visibly matches the faucet outlet. Preserve the accepted metallic faucet body, timing, transparent alpha, dark-canvas readability, and existing sprite scale. Do not replace the faucet with a new style. Increase the water width enough that Ethan will not read it as a thin line.

## Source Inputs

- Existing high-resolution source frames: `docs/assets/production-animations-v1/faucet/`
- Existing runtime sheets: `app/web/assets/anim/faucet/`
- Rejected baseline evidence: `tests/reports/faucet_water_ratio_webkit_report.json`

## Method

The generated repair is a local production edit, not a new faucet illustration:

- isolate the existing blue/cyan water pixels from the accepted faucet source frames
- remove only those water pixels from the source frame
- widen the water stream horizontally by `1.48x`
- lightly brighten the widened stream so it stays readable on the dark canvas
- preserve faucet body pixels, frame count, timing intent, transparent background, and closing-state progression

This avoids style drift while making the water visibly thicker than the rejected baseline.

## Delivered Assets

- Source frame folder: `docs/assets/production-animations-v1/faucet/wtj-020-thicker-water/`
- High-resolution sheets: `docs/assets/production-animations-v1/faucet/wtj-020-thicker-water/sheets/`
- Runtime-size candidate sheets: `docs/assets/production-animations-v1/faucet/wtj-020-thicker-water/runtime-256/`
- Dark-canvas high-resolution preview: `docs/assets/production-animations-v1/faucet/wtj-020-thicker-water/faucet-thicker-water-contact-sheet.png`
- Dark-canvas runtime preview: `docs/assets/production-animations-v1/faucet/wtj-020-thicker-water/faucet-thicker-water-runtime-256-contact-sheet.png`
- Runtime before/after preview: `docs/assets/production-animations-v1/faucet/wtj-020-thicker-water/faucet-water-before-after-runtime-256.png`
- Local crop inspection: `docs/assets/production-animations-v1/faucet/wtj-020-thicker-water/faucet-mouth-crop-thicker.png`
- Current rejected baseline previews: `docs/assets/production-animations-v1/faucet/wtj-020-current-faucet-contact-sheet.png`, `docs/assets/production-animations-v1/faucet/wtj-020-current-highres-contact-sheet.png`, `docs/assets/production-animations-v1/faucet/wtj-020-current-faucet-mouth-crop.png`
- Manifest: `docs/assets/production-animations-v1/faucet/wtj-020-thicker-water/manifest.json`
- Dimension report: `docs/assets/production-animations-v1/faucet/wtj-020-thicker-water/dimension-report.json`
- Rebuild script: `docs/assets/production-animations-v1/faucet/wtj-020-thicker-water/build_thicker_water_assets.py`

## Width Evidence

The high-resolution running water width changed from old `147-157px` to new `212-226px`.

The high-resolution closing sequence changed from old `153, 131, 105, 79, 53, none` to new `220, 188, 149, 111, 72, none`, preserving the visual closing taper.

## Tradeoffs

- Chose a source-frame repair over fresh image generation to keep the accepted faucet metal, lighting, and silhouette unchanged.
- Rejected `1.32x` after runtime preview because the difference was still too subtle for Ethan's "visibly thicker" feedback.
- Chose `1.48x` because the runtime-size before/after preview reads clearly thicker while the mouth crop still keeps the water attached below the metal outlet.
- Did not overwrite `app/web/assets/anim/faucet/*`; PM should review this DESIGN handoff first, then route TL to replace runtime assets and update the pixel gate target.

## Recommended TL Mapping After PM Acceptance

- `runtime-256/running-sheet.png` -> `app/web/assets/anim/faucet/running-sheet.png`
- `runtime-256/closing-sheet.png` -> `app/web/assets/anim/faucet/closing-sheet.png`
- `runtime-256/closed-sheet.png` -> `app/web/assets/anim/faucet/closed-sheet.png`
- `runtime-256/off-sheet.png` -> `app/web/assets/anim/faucet/off-sheet.png`

The app currently does not list an `open-sheet.png` in `app/web/assets/anim/faucet/`; the `open` state is included as source/reference so TL can decide whether it should remain source-only or become a runtime state.

---

## WTJ-20260706-006 Alignment Revision

Executor: Designer 1
Identity: CodexThread:019f2887-9de8-7b72-b53b-230a0857f710
Date: 2026-07-06 11:07 CST

### Reason

PM accepted WTJ-020's thicker-water style but the water column still read as exiting from the right side of the faucet mouth. This revision keeps the accepted thicker-water treatment and corrects only the outlet alignment.

### Method

- Measured the metal outlet center from the accepted faucet body at approximately `x=280`, `y=760`.
- Preserved the WTJ-020 `1.48x` widened water treatment.
- Rebuilt the water crop around `x=280` instead of the previous water center around `x=318`.
- Regenerated high-resolution source frames, sheets, runtime 256 sheets, manifest, dimension report, and alignment evidence.
- Updated `app/web/assets/anim/faucet/running-sheet.png` and `app/web/assets/anim/faucet/closing-sheet.png` from the regenerated runtime candidates.

### Evidence

- `faucet-mouth-crop-before-after-align.png`
- `faucet-mouth-crop-aligned-centerline.png`
- `faucet-alignment-before-after-contact-sheet.png`
- `faucet-water-alignment-before-after-runtime-256.png`
- `faucet-alignment-validation.json`
- `manifest.json`
- `README.md`

### Tradeoffs

- Did not generate a new faucet image; keeping the existing body avoids style drift.
- Did not change animation timing or frame counts.
- Did not add an app `open` state; the current app runtime manifest already uses `running`, `closing`, `closed`, and `off`.
- Closing frames retain a small rightward taper near shutoff because the visible stream is shrinking, but the open/running loop and first closing frame now align to the outlet center.
