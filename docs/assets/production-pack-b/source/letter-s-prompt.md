# Letter S Production Sprite Notes

Card: `WTJ-20260704-047`
Role: `DESIGN`
Updated: `2026-07-04 07:46 CST`

## Scope

This card only covers three S words from Production Pack B:

- `sun`
- `shoe`
- `spoon`

## Prompt: Sun

```text
A single production-quality toddler app sprite of a cheerful SUN, centered on a solid pure chroma green background (#00ff00). The sun is a dimensional soft-clay / plush-toy illustration with rounded orange-yellow rays, warm yellow body, subtle bevels, soft highlights, gentle shadowing, and polished sticker-like edges. Child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no face, no text, no letters, no sky, no clouds, no extra objects. Square composition, object fills most of canvas with clean margin.
```

Paths:

- Source: `docs/assets/production-pack-b/source/sun-source-green.png`
- Alpha raw: `docs/assets/production-pack-b/source/sun-alpha-raw.png`
- Final sprite: `docs/assets/production-pack-b/sprites/sun.png`

## Prompt: Shoe

```text
A single production-quality toddler app sprite of one SHOE, centered on a solid pure chroma green background (#00ff00). The shoe is a dimensional soft-clay / plush-toy sneaker, red and blue upper with white rounded sole, thick simple laces, toy-like bevels, soft highlights, gentle shadows, and polished sticker-like edges. One shoe only, side view at a slight 3/4 angle, child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no foot, no sock, no pair, no brand logo, no text, no letters, no extra objects. Square composition, object fills most of canvas with clean margin.
```

Paths:

- Source: `docs/assets/production-pack-b/source/shoe-source-green.png`
- Alpha raw: `docs/assets/production-pack-b/source/shoe-alpha-raw.png`
- Final sprite: `docs/assets/production-pack-b/sprites/shoe.png`

## Prompt: Spoon

```text
A single production-quality toddler app sprite of one SPOON, centered on a solid pure chroma green background (#00ff00). The spoon is a dimensional soft-clay / polished toy illustration, warm silver and pale blue-gray metal, rounded safe toddler-friendly handle, oval bowl, soft bevels, bright highlights, subtle shadowing, polished sticker-like edges. One spoon only, diagonal 3/4 angle, child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no fork, no knife, no plate, no bowl, no food, no text, no letters, no extra objects. Square composition, object fills most of canvas with clean margin.
```

Paths:

- Source: `docs/assets/production-pack-b/source/spoon-source-green.png`
- Alpha raw: `docs/assets/production-pack-b/source/spoon-alpha-raw.png`
- Final sprite: `docs/assets/production-pack-b/sprites/spoon.png`

## Design Choices

- Used single-object generation instead of a multi-object sheet so each sprite could fill the canvas and avoid the flat, low-detail look of earlier rough mockup assets.
- Kept `sun` faceless and object-like to avoid drifting into emoji language while preserving immediate child readability through the radial silhouette.
- Kept `shoe` as one sneaker, not a pair, to match the singular word token and keep recognition unambiguous at small sizes.
- Kept `spoon` as a single polished spoon without plate, bowl, or food props, so the secret word maps to the object itself.
- Used `#00ff00` chroma key for all three because none of the selected subjects require green as their defining color.

## Self-check

- `sun.png`: `1024x1024 RGBA`, bbox `(40, 25, 986, 970)`, visible pixels `590926`, corner alpha `[0, 0, 0, 0]`.
- `shoe.png`: `1024x1024 RGBA`, bbox `(16, 140, 1009, 862)`, visible pixels `485112`, corner alpha `[0, 0, 0, 0]`.
- `spoon.png`: `1024x1024 RGBA`, bbox `(67, 31, 962, 982)`, visible pixels `243862`, corner alpha `[0, 0, 0, 0]`.
- Visible pixels contain no exact or strict `#00ff00`, `#ff00ff`, or `#00ffff` chroma-key residue.
- Checked on a dark review background: all three remain readable and are not placeholder-like, emoji-like, or flat vector art.
