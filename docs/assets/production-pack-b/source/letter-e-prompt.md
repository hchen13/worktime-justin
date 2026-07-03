# Letter E Sprite Prompt Record

对应飞书卡：`WTJ-20260704-034`。

## Eye Prompt

```text
Use case: stylized-concept
Asset type: WorkTime Justin production secret-word sprite, final game asset source
Primary request: Create one child-friendly eye sprite for the secret word "eye".
Subject: a single friendly toy-like eye object, white rounded sclera, large blue iris and black pupil, small glossy highlights, soft upper eyelid contour, no face, no eyelashes if they make it look like a character, immediately recognizable as an eye for a toddler, not medical or realistic.
Style/medium: polished 2.5D soft-plastic / soft-clay children's app illustration matching a high-quality toy-like sprite set; rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft studio light, warm saturated colors, clean production asset finish.
Composition/framing: centered single object, generous padding, no cropping, fits square 1024x1024 sprite use, no label text.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal.
Transparent-output preparation: The background must be one uniform #00ff00 color with no shadows, gradients, texture, reflections, floor plane, or lighting variation. Keep the eye fully separated from the background with crisp edges and generous padding. Do not use #00ff00 anywhere in the subject.
Constraints: no text, no watermark, no extra objects, no environment, no cast shadow, no floor shadow, no brand or copyrighted character style, not emoji-like, not flat icon, not rough sketch, not creepy, not photorealistic.
```

## Envelope Prompt

```text
Use case: stylized-concept
Asset type: WorkTime Justin production secret-word sprite, final game asset source
Primary request: Create one child-friendly envelope sprite for the secret word "envelope".
Subject: a sealed paper envelope, puffy rounded toy-like folded paper shape, cream/off-white paper with subtle bevels, visible triangular flap lines, small warm red wax-style heart seal or round sticker on the flap, immediately recognizable as an envelope for a toddler.
Style/medium: polished 2.5D soft-plastic / soft-clay children's app illustration matching a high-quality toy-like sprite set; rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft studio light, warm saturated colors, clean production asset finish.
Composition/framing: centered single object in slight 3/4 front view, generous padding, no cropping, fits square 1024x1024 sprite use, no label text.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal.
Transparent-output preparation: The background must be one uniform #00ff00 color with no shadows, gradients, texture, reflections, floor plane, or lighting variation. Keep the envelope fully separated from the background with crisp edges and generous padding. Do not use #00ff00 anywhere in the subject.
Constraints: no text, no watermark, no extra objects, no environment, no cast shadow, no floor shadow, no brand or copyrighted character style, not emoji-like, not flat icon, not rough sketch.
```

## Source And Output

- Eye source: `docs/assets/production-pack-b/source/eye-source-green.png`
- Eye alpha intermediate: `docs/assets/production-pack-b/source/eye-alpha-raw.png`
- Eye final sprite: `docs/assets/production-pack-b/sprites/eye.png`
- Envelope source: `docs/assets/production-pack-b/source/envelope-source-green.png`
- Envelope alpha intermediate: `docs/assets/production-pack-b/source/envelope-alpha-raw.png`
- Envelope final sprite: `docs/assets/production-pack-b/sprites/envelope.png`

## Tradeoff

Both assets use green chroma key because neither final subject needs green material. `eye` was kept large and centered so the blue iris remains readable at small sizes. `envelope` keeps a slight front angle and broad silhouette so it reads as folded paper, not a flat mail icon.

## Self Check

- Final sprites are `1024x1024 RGBA`.
- Four corner alpha values are 0 for both files.
- Visible green-key pixels after cleanup: 0.
- Both sprites are readable on the dark Pack B contact sheet and match the soft-plastic production style.
