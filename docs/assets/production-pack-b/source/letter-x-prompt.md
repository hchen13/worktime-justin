# Letter X Sprite Prompt Record

Card: `WTJ-20260704-052`
Role: DESIGN
Generated with: built-in `image_gen`
Post-processing: project-local chroma-key removal via `$CODEX_HOME/skills/.system/imagegen/scripts/remove_chroma_key.py`, then centered on a `1024x1024` transparent RGBA canvas.

## Outputs

- `xylophone`: `docs/assets/production-pack-b/sprites/xylophone.png`
- `xray`: `docs/assets/production-pack-b/sprites/xray.png`

## Sources

- `xylophone` source: `docs/assets/production-pack-b/source/xylophone-source-green.png`
- `xylophone` alpha raw: `docs/assets/production-pack-b/source/xylophone-alpha-raw.png`
- `xray` source: `docs/assets/production-pack-b/source/xray-source-green.png`
- `xray` alpha raw: `docs/assets/production-pack-b/source/xray-alpha-raw.png`

## Prompt: Xylophone

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Scene/backdrop: perfectly flat solid pure chroma green background (#00ff00) only, one uniform color with no shadows, gradients, texture, floor plane, reflection, or lighting variation.
Subject: one xylophone only, centered. Original dimensional soft-clay / polished wooden toy instrument, rainbow-colored bars arranged from long to short on a rounded warm wooden base, two small soft mallets crossed beside or lightly resting on the instrument. Avoid green bars and avoid #00ff00 anywhere in the subject.
Style/medium: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, sticker-like clean edges, unified 3/4 top-front perspective, top-left soft light, warm friendly saturation.
Composition/framing: square composition, object fills most of the canvas with clean padding; fully separated from the background with crisp edges.
Quality constraints: production-quality finished illustration, child-readable at 96-240 px on a dark navy app canvas, high detail, not flat vector, not emoji, not clipart.
Avoid: no child, no hands, no music notes, no floor, no cast shadow, no contact shadow, no text, no letters, no brand logo, no watermark, no extra objects.
```

## Prompt: X-ray

First output was rejected because it did not preserve a usable flat key-color background and was too close to the canvas edge. The accepted prompt tightened the background, margin, and no-cropping constraints:

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Scene/backdrop: a perfectly flat solid pure chroma green background (#00ff00) must remain clearly visible around all four sides of the subject. The background is one uniform color only, with no black, no white, no gradient, no texture, no floor, no shadow, and no border.
Subject: one separate child-friendly x-ray image object only, centered and floating on the green background. It is a small rounded translucent blue medical film card with a simple friendly white bone hand silhouette printed inside, thick rounded blue rim, soft inner glow, subtle bevels, polished sticker-like clean edges. The film card should cover about 65% of the canvas, with generous green padding on every side. It must read as an X-ray without any visible letters or text. Avoid green and avoid #00ff00 anywhere in the subject.
Style/medium: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, unified slight 3/4 front perspective, top-left soft light, warm friendly saturation.
Composition/framing: square composition, centered single object, complete object visible, no cropping, fully separated from the background with crisp edges.
Quality constraints: production-quality finished illustration, child-readable at 96-240 px on a dark navy app canvas, high detail, not flat vector, not emoji, not clipart, not scary.
Avoid: no full-canvas panel, no edge-to-edge frame, no doctor, no person outside the film, no face, no skull, no hospital cross, no red cross, no text, no letters, no numbers, no brand logo, no watermark, no extra objects, no cast shadow, no contact shadow.
```

## Design Notes

- `xylophone` keeps the Pack B toy-object language: rounded wood, saturated toy bars, 3/4 top-front view, and separate mallets for quick recognition.
- `xray` uses a rounded blue film card with a friendly hand-bone silhouette. It avoids skulls, hospital crosses, visible letters, and full-body medical imagery so the object stays toddler-safe.
- Both accepted outputs were re-centered on transparent `1024x1024` canvases to preserve animation padding.

## Self-check

- Final files are `1024x1024 RGBA`.
- Four corners have alpha `0`.
- Visible pixels contain no exact or strict #00ff00 / #ff00ff / #00ffff key residue.
- Both sprites are readable on the dark Pack B contact sheet background.
