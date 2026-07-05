# WTJ-20260705-026 Flower Repair Provenance

Owner session: `Designer 1 / Automation:worktime-justin-design-loop`

## Scope

This package fixes the current flower sprite direction where the petals read as black on the dark app canvas.

No runtime asset path was overwritten in this DESIGN handoff. PM can review these candidate files first, then route accepted replacements through the normal PM/TL integration path.

## Source Inputs

- `app/web/assets/sprites/flower.png`
- `docs/assets/design-expansion-v2/find-targets/objects/find-target-flower.png`
- `docs/assets/design-expansion-v2/task-props-v2/props/prop_flower_drag.png`
- `docs/assets/production-pack-b/sprites/flower.png`

## Output Candidates

- App sprite candidate: `flower-repaired-app-sprite-1024.png`
- Find target candidate: `flower-repaired-find-target-512.png`
- Drag prop candidate: `flower-repaired-drag-prop-512.png`

Recommended replacement mapping after PM acceptance:

- `flower-repaired-app-sprite-1024.png` -> `app/web/assets/sprites/flower.png`
- `flower-repaired-find-target-512.png` -> `docs/assets/design-expansion-v2/find-targets/objects/find-target-flower.png`
- `flower-repaired-drag-prop-512.png` -> `docs/assets/design-expansion-v2/task-props-v2/props/prop_flower_drag.png`
- Also consider syncing the same 1024 candidate to `docs/assets/production-pack-b/sprites/flower.png` if PM wants the source pack corrected too.

## Generation Prompt

```text
Repair the existing WorkTime Justin 2.5D flower sprite so the petals are bright, warm, child-friendly, and readable on the dark app canvas. Preserve the accepted transparent sticker style, soft-plastic lighting, white rim, yellow flower center, green leaves, and silhouette. Remove black/charcoal petal coloration without creating flat icon art, dirty alpha, background pixels, text, watermark, or a mixed visual style.
```

## Method

The final candidates were generated with deterministic local image processing from the existing 1024 flower sprite:

- Masked the gray/black petal body while excluding the yellow center, green leaves, white rim, and transparent background.
- Remapped petal tones to a rose-magenta range while preserving source shading and specular highlights.
- Mildly boosted the center and leaves so the repaired petals do not look pasted into an older asset.
- Normalized the candidate flower body to mostly opaque alpha while preserving soft antialiased edge pixels.
- Derived centered 512 x 512 transparent PNGs for find target and drag prop use.

No external AI image service was used for the final raster outputs.

## Tradeoffs

- Recoloring the existing sprite is less novel than regenerating a new flower, but it keeps the accepted 2.5D shape, lighting, and scale behavior stable.
- The flower center keeps a small dark contact shadow for depth. The black petal problem is removed; the remaining dark pixels are mostly rim/contact shading.
- The repaired color is intentionally saturated so the flower stays legible at 72 px on the dark canvas.
- The source flower had broad interior translucency. The candidates make the object body more solid while keeping the transparent PNG edge clean.

## Evidence

- `flower-repair-before-after-contact-sheet.png`
- `flower-repair-readability-contact-sheet.png`
- `flower-repair-alpha-checker-preview.png`
- `flower-current-contact-sheet.png`
- `flower-repair-verification.json`

Verification summary from `flower-repair-verification.json`:

- Current app sprite dark pixel ratio: `0.0352`
- Repaired app candidate dark pixel ratio: `0.00914`
- Current find target dark pixel ratio: `0.03599`
- Repaired find target dark pixel ratio: `0.00482`
- Current drag prop dark pixel ratio: `0.03546`
- Repaired drag prop dark pixel ratio: `0.00473`
