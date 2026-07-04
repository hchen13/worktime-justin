# Faucet Rework Prompt And Rationale

Card: `WTJ-20260705-005`

Executor: `Designer 1`

Identity: `Automation:worktime-justin-design-loop`

## Goal

Fix the faucet animation so the water stream clearly matches the outlet size, has readable volume on the dark app canvas, and closes continuously without changing the faucet body.

PM/Ethan feedback for this card: the previous faucet water still felt too weak for the spout. The accepted metal faucet body should remain stable, but the running/open/closing water needs to read as a real falling column rather than a thin line or short capsule.

## Prompt / Generation Recipe

Use the accepted 2.5D polished silver faucet body as a fixed production layer. Redraw only the transparent water overlay: a broad falling cyan water column emerging from behind the outlet lip, matching the outlet scale, with rounded volume, darker side shading, a bright inner body, a narrow specular highlight, subtle loop shimmer, and a few readable droplets. Closing should taper smoothly from the same full stream to no water, without body drift, crop, yellow cue dots, dirty pixels, or placeholder marks.

Implementation choice: deterministic layer generation from the existing accepted body, not whole-image regeneration. This preserves the body shape, scale, lighting, and perspective exactly while allowing the water layer to be tuned at pixel level.

## Design Choices

- Preserved `off/faucet_off_000.png` as the canonical metal body layer.
- Added explicit `open/` state with the full water column for consumers that distinguish open from running.
- Rebuilt `running/` as 6 frames with widths around `140-150px`, longer falling length, subtle highlight drift, and small droplets.
- Rebuilt `closing/` as 6 frames with width sequence `146, 124, 98, 70, 40, 0`, sharing the same outlet anchor and ending on the closed body.
- Composited water behind the faucet lip so it exits from the spout rather than floating in front of it.
- Removed yellow cue dots and avoided random spray so the frame stays clean at small size.
- Rebuilt contact sheet and GIFs with full-frame fixed scaling on the dark canvas.

## Evidence

- Manifest: `docs/assets/production-animations-v1/faucet/manifest.json`
- Contact sheet: `docs/assets/production-animations-v1/faucet/faucet-contact-sheet.png`
- Running preview: `docs/assets/production-animations-v1/previews/faucet-running-preview.gif`
- Closing preview: `docs/assets/production-animations-v1/previews/faucet-closing-preview.gif`
- Frame sheets: `docs/assets/production-animations-v1/faucet/sheets/open-sheet.png`, `running-sheet.png`, `closing-sheet.png`, `off-sheet.png`, `closed-sheet.png`
- Frames: `docs/assets/production-animations-v1/faucet/open/`, `running/`, `closing/`, `off/`, `closed/`

## Risks / Notes

- The water is intentionally stylized and clean rather than photorealistic; this keeps it aligned with the polished toy production pack.
- The body is unchanged by design. If PM wants a materially different faucet silhouette, that should be a separate design card because it risks style drift across task props.
