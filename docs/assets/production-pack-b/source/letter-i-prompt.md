# Letter I Sprite Prompt Record

Card: `WTJ-20260704-037`

Generated words: `igloo`, `insect`, `island`

## Prompts

### Igloo

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Primary request: create one original child-friendly igloo sprite on a perfectly flat solid #ff00ff chroma-key background for background removal.
Style reference: match the existing WorkTime Justin Production Pack B sprites: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, unified 3/4 front perspective, same camera distance as existing house, door, icecream, and elephant sprites, top-left soft light, warm friendly saturation, finished production quality.
Subject: a small white snow igloo, rounded dome made of softly carved ice blocks, arched dark-blue entrance, subtle pale blue shading, immediately recognizable as an igloo for a toddler. No snowfield, no sky, no people, no animals, no text.
Composition/framing: single centered object, 3/4 front view, generous transparent-safe padding on all sides, no cropping, readable at 96-240 px on a dark navy app canvas.
Scene/backdrop: the background must be one perfectly uniform #ff00ff color with no shadows, gradients, texture, floor plane, or lighting variation.
Constraints: no text, no letters, no labels, no watermark, no cast shadow, no contact shadow, no reflection. Do not use #ff00ff or magenta anywhere in the igloo subject. Avoid emoji style, flat vector icon style, rough sketch, screenshot, or placeholder art.
```

### Insect

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Primary request: create one original child-friendly insect sprite on a perfectly flat solid #ff00ff chroma-key background for background removal.
Style reference: match the existing WorkTime Justin Production Pack B sprites: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, unified 3/4 front perspective, same camera distance as existing ant, frog, mouse, and gift sprites, top-left soft light, warm friendly saturation, finished production quality.
Subject: a friendly simplified beetle or ladybug-like insect, rounded red shell with black spots, small black head, two cute antennae, exactly six short legs, tiny friendly eyes, immediately recognizable as an insect for a toddler. It must be visually distinct from the existing brown ant sprite: round beetle body, not long segmented ant body.
Composition/framing: single centered object, 3/4 front view, generous transparent-safe padding on all sides, no cropping, readable at 96-240 px on a dark navy app canvas.
Scene/backdrop: the background must be one perfectly uniform #ff00ff color with no shadows, gradients, texture, floor plane, or lighting variation.
Constraints: no text, no letters, no labels, no watermark, no cast shadow, no contact shadow, no reflection. Do not use #ff00ff or magenta anywhere in the insect subject. Avoid emoji style, flat vector icon style, rough sketch, screenshot, or placeholder art.
```

### Island

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Primary request: create one original child-friendly island sprite on a perfectly flat solid #ff00ff chroma-key background for background removal.
Style reference: match the existing WorkTime Justin Production Pack B sprites: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, unified 3/4 front perspective, same camera distance as existing house, rocket, fish, and flower sprites, top-left soft light, warm friendly saturation, finished production quality.
Subject: a compact toy-like tropical island object, small rounded sandy island mound with a simple leaning palm tree, green palm leaves, brown trunk, tiny blue water ring or wave edge around the sand, immediately recognizable as an island for a toddler. Keep it as one clean object, not a full landscape scene. No sun, no boat, no people, no animals, no treasure chest.
Composition/framing: single centered object, 3/4 front view, generous transparent-safe padding on all sides, no cropping, readable at 96-240 px on a dark navy app canvas.
Scene/backdrop: the background must be one perfectly uniform #ff00ff color with no shadows, gradients, texture, floor plane, or lighting variation.
Constraints: no text, no letters, no labels, no watermark, no cast shadow, no contact shadow, no reflection. Do not use #ff00ff or magenta anywhere in the island subject. Avoid emoji style, flat vector icon style, rough sketch, screenshot, or placeholder art.
```

## Saved Files

- Source chroma-key images:
  - `docs/assets/production-pack-b/source/igloo-source-magenta.png`
  - `docs/assets/production-pack-b/source/insect-source-magenta.png`
  - `docs/assets/production-pack-b/source/island-source-magenta.png`
- Alpha intermediates:
  - `docs/assets/production-pack-b/source/igloo-alpha-raw.png`
  - `docs/assets/production-pack-b/source/insect-alpha-raw.png`
  - `docs/assets/production-pack-b/source/island-alpha-raw.png`
- Final sprites:
  - `docs/assets/production-pack-b/sprites/igloo.png`
  - `docs/assets/production-pack-b/sprites/insect.png`
  - `docs/assets/production-pack-b/sprites/island.png`

## Design Notes

- Used `#ff00ff` chroma key for all three because `island` needs green palm leaves and `insect` benefits from avoiding any forced green restrictions.
- Kept `igloo` as a single dome object with ice blocks and an arched entrance, without snowfield or sky, so it remains a sprite rather than a scene.
- Made `insect` a red-and-black rounded beetle/ladybug form so it is clearly different from the existing brown `ant`.
- Kept `island` as a compact sandy mound with one palm and a small blue water edge. The prompt explicitly excluded boat, sun, people, animals, and treasure chest to avoid turning it into a busy landscape.

## Self Check

- Final sprites are `1024x1024 RGBA`.
- Four corner alpha values are `0` for all three.
- Visible exact magenta pixels: `0`.
- Visible magenta-key-like pixels: `0`.
- Bounding boxes:
  - `igloo`: `(148, 149, 904, 851)`
  - `insect`: `(167, 242, 844, 764)`
  - `island`: `(210, 136, 801, 852)`
