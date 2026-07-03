# Alligator Sprite Prompt Record

对应飞书卡：`WTJ-20260704-033`。

## Prompt

```text
Use case: stylized-concept
Asset type: WorkTime Justin production secret-word sprite, final game asset source
Primary request: Create one friendly alligator sprite for the secret word "alligator".
Subject: a child-friendly green alligator, full body in a clear side-facing three-quarter pose, long rounded snout, small white teeth, visible tail, four short legs, subtle raised back scales, immediately recognizable as an alligator for a toddler.
Style/medium: polished 2.5D soft-plastic / soft-clay children's app illustration matching a high-quality toy-like sprite set; rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft studio light, warm saturated colors, clean production asset finish.
Composition/framing: centered single object, generous padding, no cropping, fits square 1024x1024 sprite use, no label text.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for background removal.
Transparent-output preparation: The background must be one uniform #ff00ff color with no shadows, gradients, texture, reflections, floor plane, or lighting variation. Keep the alligator fully separated from the background with crisp edges and generous padding. Do not use #ff00ff anywhere in the subject.
Constraints: no text, no watermark, no extra objects, no environment, no cast shadow, no floor shadow, no brand or copyrighted character style, not emoji-like, not flat icon, not rough sketch, not scary or realistic predator.
```

## Source And Output

- Generated source: `docs/assets/production-pack-b/source/alligator-source-magenta.png`
- Alpha extraction intermediate: `docs/assets/production-pack-b/source/alligator-alpha-raw.png`
- Final sprite: `docs/assets/production-pack-b/sprites/alligator.png`

## Tradeoff

Alligator is green, so the source used a magenta chroma key instead of green. The final sprite was centered and scaled from the alpha extraction output to keep the long tail readable while preserving generous padding on a `1024x1024` transparent canvas.

## Self Check

- Final sprite is `1024x1024 RGBA`.
- Four corner alpha values are 0.
- Visible magenta-like pixels after cleanup: 0.
- Shape is toddler-readable as an alligator: long rounded snout, tail, four legs, back scales, and friendly expression.
