# Letter H Sprite Prompt Record

Card: `WTJ-20260704-036`

Generated word: `house`

## Prompt

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Primary request: create one original child-friendly house sprite on a perfectly flat solid #00ff00 chroma-key background for background removal.
Style reference: match the existing WorkTime Justin Production Pack B sprites: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, unified 3/4 front perspective, same camera distance as the existing apple, door, gift, goat, and guitar sprites, top-left soft light, warm friendly saturation, finished production quality.
Subject: a cozy small house, cream walls, warm red roof, blue windows, rounded brown door, simple chimney, clearly recognizable as a house for a toddler. No yard, no grass, no tree, no fence, no people, no animals.
Composition/framing: single centered object, 3/4 front view, generous transparent-safe padding on all sides, no cropping, readable at 96-240 px on a dark navy app canvas.
Scene/backdrop: the background must be one perfectly uniform #00ff00 color with no shadows, gradients, texture, floor plane, or lighting variation.
Constraints: no text, no letters, no labels, no watermark, no cast shadow, no contact shadow, no reflection. Do not use #00ff00 or green anywhere in the house subject. Avoid emoji style, flat vector icon style, rough sketch, screenshot, or placeholder art.
```

## Saved Files

- Source chroma-key image: `docs/assets/production-pack-b/source/house-source-green.png`
- Alpha intermediate: `docs/assets/production-pack-b/source/house-alpha-raw.png`
- Final sprite: `docs/assets/production-pack-b/sprites/house.png`

## Design Notes

- Kept the house as a single object without yard, grass, tree, fence, people, or animals so the secret word reads as `house`, not a small scene.
- Used cream walls, red roof, blue windows, brown door, and 3/4 perspective to stay close to the accepted Pack B soft-clay material style.
- Used `#00ff00` chroma key because the requested subject did not need green. The final cutout used edge contraction and a last speck cleanup pass to remove visible green remnants.

## Self Check

- Final sprite is `1024x1024 RGBA`.
- Four corner alpha values are `0`.
- Visible exact green pixels: `0`.
- Visible green-key-like pixels: `0`.
- Bounding box after cleanup: `(141, 130, 906, 919)`.
