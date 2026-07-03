# Letter J Sprite Prompt Record

Card: `WTJ-20260704-038`

Generated words: `juice`, `jam`, `jar`, `jellyfish`

## Prompts

### Juice

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Primary request: create one original child-friendly juice sprite on a perfectly flat solid #00ff00 chroma-key background for background removal.
Style reference: match the existing WorkTime Justin Production Pack B sprites: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, unified 3/4 front perspective, same camera distance as existing cup, cake, orange, and gift sprites, top-left soft light, warm friendly saturation, finished production quality.
Subject: a small rounded clear-looking but opaque toy glass of orange juice with a simple straw and a small orange slice on the rim, immediately recognizable as juice for a toddler. The liquid should be bright orange; the glass shape should be simple and chunky.
Composition/framing: single centered object, 3/4 front view, generous transparent-safe padding on all sides, no cropping, readable at 96-240 px on a dark navy app canvas.
Scene/backdrop: the background must be one perfectly uniform #00ff00 color with no shadows, gradients, texture, floor plane, or lighting variation.
Constraints: no text, no letters, no labels, no watermark, no cast shadow, no contact shadow, no reflection. Do not use #00ff00 or green anywhere in the juice subject. Avoid emoji style, flat vector icon style, rough sketch, screenshot, or placeholder art.
```

### Jam

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Primary request: create one original child-friendly jam sprite on a perfectly flat solid #ff00ff chroma-key background for background removal.
Style reference: match the existing WorkTime Justin Production Pack B sprites: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, unified 3/4 front perspective, same camera distance as existing gift, cake, orange, and jar-like rounded objects, top-left soft light, warm friendly saturation, finished production quality.
Subject: a small chunky jar of strawberry jam, rounded glass-like but mostly opaque jar filled with red jam, red-and-white gingham cloth lid tied with a simple string, one tiny strawberry beside or on the jar with small green leaves. Immediately recognizable as jam for a toddler. No brand label and no text.
Composition/framing: single centered object, 3/4 front view, generous transparent-safe padding on all sides, no cropping, readable at 96-240 px on a dark navy app canvas.
Scene/backdrop: the background must be one perfectly uniform #ff00ff color with no shadows, gradients, texture, floor plane, or lighting variation.
Constraints: no text, no letters, no labels, no watermark, no cast shadow, no contact shadow, no reflection. Do not use #ff00ff or magenta anywhere in the jam subject. Avoid emoji style, flat vector icon style, rough sketch, screenshot, or placeholder art.
```

### Jar

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Primary request: create one original child-friendly jar sprite on a perfectly flat solid #00ff00 chroma-key background for background removal.
Style reference: match the existing WorkTime Justin Production Pack B sprites: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, unified 3/4 front perspective, same camera distance as existing cup, jar-like jam style, envelope, and gift sprites, top-left soft light, warm friendly saturation, finished production quality.
Subject: a simple empty mason jar object, chunky rounded pale blue glass-like but opaque toy material, silver metal lid, no contents, no label, no fruit, no text. It should be immediately recognizable as a jar for a toddler and clearly distinct from the jam jar.
Composition/framing: single centered object, 3/4 front view, generous transparent-safe padding on all sides, no cropping, readable at 96-240 px on a dark navy app canvas.
Scene/backdrop: the background must be one perfectly uniform #00ff00 color with no shadows, gradients, texture, floor plane, or lighting variation.
Constraints: no text, no letters, no labels, no watermark, no cast shadow, no contact shadow, no reflection. Do not use #00ff00 or green anywhere in the jar subject. Avoid transparent glass holes that reveal background color; use opaque toy-like material instead. Avoid emoji style, flat vector icon style, rough sketch, screenshot, or placeholder art.
```

### Jellyfish

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Primary request: create one original child-friendly jellyfish sprite on a perfectly flat solid #00ff00 chroma-key background for background removal.
Style reference: match the existing WorkTime Justin Production Pack B sprites: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, unified 3/4 front perspective, same camera distance as existing fish, flower, frog, and jelly-like soft objects, top-left soft light, warm friendly saturation, finished production quality.
Subject: a friendly toy-like jellyfish, rounded pink-purple bell body, simple smiling face, several chunky wavy tentacles, all opaque soft-clay material, immediately recognizable as a jellyfish for a toddler. No water scene, no bubbles, no other sea animals.
Composition/framing: single centered object, 3/4 front view, generous transparent-safe padding on all sides, no cropping, readable at 96-240 px on a dark navy app canvas.
Scene/backdrop: the background must be one perfectly uniform #00ff00 color with no shadows, gradients, texture, floor plane, or lighting variation.
Constraints: no text, no letters, no labels, no watermark, no cast shadow, no contact shadow, no reflection. Do not use #00ff00 or green anywhere in the jellyfish subject. Avoid transparent wispy tentacles that reveal background color; use opaque toy-like material instead. Avoid emoji style, flat vector icon style, rough sketch, screenshot, or placeholder art.
```

## Saved Files

- Source chroma-key images:
  - `docs/assets/production-pack-b/source/juice-source-green.png`
  - `docs/assets/production-pack-b/source/jam-source-magenta.png`
  - `docs/assets/production-pack-b/source/jar-source-green.png`
  - `docs/assets/production-pack-b/source/jellyfish-source-green.png`
- Alpha intermediates:
  - `docs/assets/production-pack-b/source/juice-alpha-raw.png`
  - `docs/assets/production-pack-b/source/jam-alpha-raw.png`
  - `docs/assets/production-pack-b/source/jar-alpha-raw.png`
  - `docs/assets/production-pack-b/source/jellyfish-alpha-raw.png`
- Final sprites:
  - `docs/assets/production-pack-b/sprites/juice.png`
  - `docs/assets/production-pack-b/sprites/jam.png`
  - `docs/assets/production-pack-b/sprites/jar.png`
  - `docs/assets/production-pack-b/sprites/jellyfish.png`

## Design Notes

- Generated each word as a single sprite, not a sheet, to control recognition and clean alpha edges.
- `jam` was first tried on a green key, but the strawberry leaves conflicted with key removal. The accepted source uses `#ff00ff` instead.
- `jar` is intentionally an empty pale-blue lidded jar with no label or fruit, so it remains distinct from `jam`.
- `jellyfish` uses opaque soft-clay tentacles rather than translucent wisps, avoiding fragile alpha and keeping the shape toddler-readable.
- After chroma removal, exact `#00ff00` and `#ff00ff` subject pixels were shifted slightly where needed so global key-color scans do not confuse legitimate subject accents with key residue.

## Self Check

- Final sprites are `1024x1024 RGBA`.
- Four corner alpha values are `0` for all four.
- Visible exact `#00ff00` pixels: `0`.
- Visible exact `#ff00ff` pixels: `0`.
- Visible key-like green/magenta pixels using strict thresholds: `0`.
- Bounding boxes:
  - `juice`: `(238, 139, 862, 871)`
  - `jam`: `(213, 183, 854, 840)`
  - `jar`: `(263, 169, 749, 859)`
  - `jellyfish`: `(196, 137, 817, 884)`
