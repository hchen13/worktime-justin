# Letter Z Sprite Prompt Record

Card: `WTJ-20260704-054`
Role: DESIGN
Generated with: built-in `image_gen`
Post-processing: project-local chroma-key removal via `$CODEX_HOME/skills/.system/imagegen/scripts/remove_chroma_key.py`, then centered on a `1024x1024` transparent RGBA canvas.

## Outputs

- `zebra`: `docs/assets/production-pack-b/sprites/zebra.png`
- `zipper`: `docs/assets/production-pack-b/sprites/zipper.png`
- `zucchini`: `docs/assets/production-pack-b/sprites/zucchini.png`

## Sources

- `zebra` source: `docs/assets/production-pack-b/source/zebra-source-green.png`
- `zebra` alpha raw: `docs/assets/production-pack-b/source/zebra-alpha-raw.png`
- `zipper` source: `docs/assets/production-pack-b/source/zipper-source-green.png`
- `zipper` alpha raw: `docs/assets/production-pack-b/source/zipper-alpha-raw.png`
- `zucchini` source: `docs/assets/production-pack-b/source/zucchini-source-magenta.png`
- `zucchini` alpha raw: `docs/assets/production-pack-b/source/zucchini-alpha-raw.png`

## Prompt: Zebra

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Scene/backdrop: perfectly flat solid pure chroma green background (#00ff00) only, one uniform color with no shadows, gradients, texture, floor plane, reflection, or lighting variation.
Subject: one friendly zebra only, centered. Original dimensional soft-clay toy zebra: small rounded body, black-and-white stripes that wrap around the form, short legs, rounded muzzle, small upright mane, gentle eyes, tiny smile. The zebra should be immediately recognizable for a toddler, child-friendly and not realistic. Avoid green and avoid #00ff00 anywhere in the subject.
Style/medium: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, sticker-like clean edges, unified 3/4 front perspective, top-left soft light, warm friendly saturation.
Composition/framing: square composition, centered single object, complete object visible, no cropping, object fills about 72% of the canvas with clean padding; fully separated from the background with crisp edges.
Quality constraints: production-quality finished illustration, child-readable at 96-240 px on a dark navy app canvas, high detail, not flat vector, not emoji, not clipart, not scary.
Avoid: no grass, no savanna, no mountain, no floor, no cast shadow, no contact shadow, no text, no letters, no brand logo, no watermark, no extra objects, no realistic fur.
```

## Prompt: Zipper

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Scene/backdrop: perfectly flat solid pure chroma green background (#00ff00) only, one uniform color with no shadows, gradients, texture, floor plane, reflection, or lighting variation.
Subject: one zipper only, centered. Original dimensional toy zipper: a red fabric zipper strip partly opened in a gentle V shape, large friendly golden zipper teeth, oversized rounded gold pull tab at the top, polished soft-plastic details. It should clearly read as a zipper for a toddler. Avoid green and avoid #00ff00 anywhere in the subject.
Style/medium: polished 2.5D soft-plastic / soft-clay children's app illustration with cloth-like red tape and shiny rounded gold teeth, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, sticker-like clean edges, unified 3/4 front perspective, top-left soft light, warm friendly saturation.
Composition/framing: square composition, centered single object, complete object visible, no cropping, object fills about 70% of the canvas with clean padding; fully separated from the background with crisp edges.
Quality constraints: production-quality finished illustration, child-readable at 96-240 px on a dark navy app canvas, high detail, not flat vector, not emoji, not clipart.
Avoid: no clothing, no bag, no hands, no floor, no cast shadow, no contact shadow, no text, no letters, no brand logo, no watermark, no extra objects.
```

## Prompt: Zucchini

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Scene/backdrop: perfectly flat solid pure chroma magenta background (#ff00ff) only, one uniform color with no shadows, gradients, texture, floor plane, reflection, or lighting variation.
Subject: one zucchini only, centered. Original dimensional soft-clay vegetable: a single glossy dark green zucchini with lighter green ribbed stripes, rounded ends, small pale stem, maybe one tiny cut end highlight but no slice. It should clearly read as zucchini for a toddler, simple and friendly. Avoid magenta/pink and avoid #ff00ff anywhere in the subject.
Style/medium: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, sticker-like clean edges, unified 3/4 front perspective, top-left soft light, warm friendly saturation.
Composition/framing: square composition, centered single object angled slightly diagonal, complete object visible, no cropping, object fills about 70% of the canvas with clean padding; fully separated from the background with crisp edges.
Quality constraints: production-quality finished illustration, child-readable at 96-240 px on a dark navy app canvas, high detail, not flat vector, not emoji, not clipart.
Avoid: no leaves, no vine, no basket, no plate, no knife, no floor, no cast shadow, no contact shadow, no text, no letters, no brand logo, no watermark, no extra objects.
```

## Design Notes

- `zebra` uses a toy-animal body and rounded sculpted stripes so it is child-friendly and not a realistic wildlife image.
- `zipper` is isolated from clothing or bags; the red strip and oversized gold teeth make it readable as a standalone object.
- `zucchini` uses #ff00ff chroma key because the subject itself is green. Final cleanup preserves the green body while removing magenta key residue.
- All three accepted outputs were re-centered on transparent `1024x1024` canvases to preserve animation padding.

## Self-check

- Final files are `1024x1024 RGBA`.
- Four corners have alpha `0`.
- Visible pixels contain no exact or strict #00ff00 / #ff00ff / #00ffff key residue after final cleanup.
- All three sprites are readable on the dark Pack B contact sheet background.
