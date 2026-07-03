# Letter G Sprite Prompt Record

对应飞书卡：`WTJ-20260704-035`。

## Goat Prompt

```text
Use case: stylized-concept
Asset type: WorkTime Justin production secret-word sprite, final game asset source
Primary request: Create one child-friendly goat sprite for the secret word "goat".
Subject: a friendly small goat, full body in a clear three-quarter side pose, cream and light tan fur, short curved horns, little beard, soft ears, small hooves, immediately recognizable as a goat for a toddler; cute and gentle, not realistic livestock photography.
Style/medium: polished 2.5D soft-plastic / soft-clay children's app illustration matching a high-quality toy-like sprite set; rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft studio light, warm saturated colors, clean production asset finish.
Composition/framing: centered single object, generous padding, no cropping, fits square 1024x1024 sprite use, no label text.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal.
Transparent-output preparation: The background must be one uniform #00ff00 color with no shadows, gradients, texture, reflections, floor plane, or lighting variation. Keep the goat fully separated from the background with crisp edges and generous padding. Do not use #00ff00 anywhere in the subject.
Constraints: no text, no watermark, no extra objects, no environment, no cast shadow, no floor shadow, no brand or copyrighted character style, not emoji-like, not flat icon, not rough sketch.
```

## Gift Prompt

```text
Use case: stylized-concept
Asset type: WorkTime Justin production secret-word sprite, final game asset source
Primary request: Create one child-friendly gift sprite for the secret word "gift".
Subject: a wrapped present box, puffy rounded toy-like cube, bright red wrapping paper with yellow/gold ribbon and bow, immediately recognizable as a gift for a toddler, no text or tags.
Style/medium: polished 2.5D soft-plastic / soft-clay children's app illustration matching a high-quality toy-like sprite set; rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft studio light, warm saturated colors, clean production asset finish.
Composition/framing: centered single object in slight 3/4 front view, generous padding, no cropping, fits square 1024x1024 sprite use, no label text.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal.
Transparent-output preparation: The background must be one uniform #00ff00 color with no shadows, gradients, texture, reflections, floor plane, or lighting variation. Keep the gift fully separated from the background with crisp edges and generous padding. Do not use #00ff00 anywhere in the subject.
Constraints: no text, no watermark, no extra objects, no environment, no cast shadow, no floor shadow, no brand or copyrighted character style, not emoji-like, not flat icon, not rough sketch.
```

## Guitar Prompt

```text
Use case: stylized-concept
Asset type: WorkTime Justin production secret-word sprite, final game asset source
Primary request: Create one child-friendly guitar sprite for the secret word "guitar".
Subject: a small acoustic guitar, warm honey-brown wooden body, rounded toy-like shape, visible sound hole, short neck with simple frets and tuning pegs, immediately recognizable as a guitar for a toddler.
Style/medium: polished 2.5D soft-plastic / soft-clay children's app illustration matching a high-quality toy-like sprite set; rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft studio light, warm saturated colors, clean production asset finish.
Composition/framing: centered single object at a gentle diagonal angle, generous padding, no cropping, fits square 1024x1024 sprite use, no label text.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal.
Transparent-output preparation: The background must be one uniform #00ff00 color with no shadows, gradients, texture, reflections, floor plane, or lighting variation. Keep the guitar fully separated from the background with crisp edges and generous padding. Do not use #00ff00 anywhere in the subject.
Constraints: no text, no watermark, no extra objects, no environment, no cast shadow, no floor shadow, no brand or copyrighted character style, not emoji-like, not flat icon, not rough sketch.
```

## Source And Output

- Goat source: `docs/assets/production-pack-b/source/goat-source-green.png`
- Goat alpha intermediate: `docs/assets/production-pack-b/source/goat-alpha-raw.png`
- Goat final sprite: `docs/assets/production-pack-b/sprites/goat.png`
- Gift source: `docs/assets/production-pack-b/source/gift-source-green.png`
- Gift alpha intermediate: `docs/assets/production-pack-b/source/gift-alpha-raw.png`
- Gift final sprite: `docs/assets/production-pack-b/sprites/gift.png`
- Guitar source: `docs/assets/production-pack-b/source/guitar-source-green.png`
- Guitar alpha intermediate: `docs/assets/production-pack-b/source/guitar-alpha-raw.png`
- Guitar final sprite: `docs/assets/production-pack-b/sprites/guitar.png`

## Tradeoff

All three assets use green chroma key because their intended materials avoid green. `goat` keeps a friendly oversized head and visible horns/beard for toddler recognition. `gift` uses a simple red box and yellow bow without labels or tags. `guitar` keeps a diagonal acoustic silhouette so the sound hole, strings, and tuning pegs stay readable at small sizes.

## Self Check

- Final sprites are `1024x1024 RGBA`.
- Four corner alpha values are 0 for all three files.
- Visible green-key pixels after cleanup: 0.
- Goat, gift, and guitar are readable on the dark Pack B contact sheet and match the soft-plastic production style.
