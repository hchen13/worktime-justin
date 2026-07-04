# Letter T Production Sprite Notes

Card: `WTJ-20260704-048`
Role: `DESIGN`
Updated: `2026-07-04 08:00 CST`

## Scope

This card only covers three T words from Production Pack B:

- `tree`
- `train`
- `turtle`

## Prompt: Tree

```text
A single production-quality toddler app sprite of one TREE, centered on a solid pure chroma magenta background (#ff00ff). The tree is a dimensional soft-clay / plush-toy illustration with a rounded bright green leafy canopy, warm brown trunk, soft bevels, gentle highlights, subtle shadowing inside the object, and polished sticker-like edges. One tree only, child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no face, no apples, no grass, no ground, no sky, no clouds, no text, no letters, no extra objects. Square composition, object fills most of canvas with clean margin.
```

Paths:

- Source: `docs/assets/production-pack-b/source/tree-source-magenta.png`
- Alpha raw: `docs/assets/production-pack-b/source/tree-alpha-raw.png`
- Final sprite: `docs/assets/production-pack-b/sprites/tree.png`

## Prompt: Train

```text
A single production-quality toddler app sprite of one TOY TRAIN, centered on a solid pure chroma green background (#00ff00). The train is a dimensional soft-clay / plush-toy locomotive with one small carriage suggested, red and blue body, yellow wheels and trim, rounded safe shapes, soft bevels, gentle highlights, and polished sticker-like edges. Side view at a slight 3/4 angle, child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no railroad track, no smoke, no station, no scenery, no text, no letters, no brand marks, no extra objects. Square composition, object fills most of canvas with clean margin.
```

Paths:

- Source: `docs/assets/production-pack-b/source/train-source-green.png`
- Alpha raw: `docs/assets/production-pack-b/source/train-alpha-raw.png`
- Final sprite: `docs/assets/production-pack-b/sprites/train.png`

## Prompt: Turtle

```text
A single production-quality toddler app sprite of one TURTLE, centered on a solid pure chroma magenta background (#ff00ff). The turtle is a dimensional soft-clay / plush-toy illustration with a rounded green head and legs, friendly simple eyes, warm brown-and-green domed shell, soft bevels, gentle highlights, subtle shadowing inside the object, and polished sticker-like edges. One turtle only, side/front 3/4 view, child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no water, no grass, no rocks, no plants, no text, no letters, no extra objects. Square composition, object fills most of canvas with clean margin.
```

Paths:

- Source: `docs/assets/production-pack-b/source/turtle-source-magenta.png`
- Alpha raw: `docs/assets/production-pack-b/source/turtle-alpha-raw.png`
- Final sprite: `docs/assets/production-pack-b/sprites/turtle.png`

## Design Choices

- Used single-object generation so each sprite has enough canvas scale and material detail to meet the production bar.
- Used `#ff00ff` chroma key for `tree` and `turtle` because green is part of their child-readable identity.
- Used `#00ff00` chroma key for `train` because its red, blue, and yellow toy palette avoids the key color and stays visually distinct from prior vehicle sprites.
- Kept `tree` free of ground, grass, sky, and fruit so the object maps cleanly to the secret word.
- Kept `train` as a toy locomotive with one carriage and no track or smoke, preserving the word target without adding scene props.
- Kept `turtle` friendly but still clearly animal-shaped, with shell segmentation readable at small sizes.

## Self-check

- `tree.png`: `1024x1024 RGBA`, bbox `(27, 24, 997, 988)`, visible pixels `562670`, corner alpha `[0, 0, 0, 0]`.
- `train.png`: `1024x1024 RGBA`, bbox `(15, 155, 1013, 846)`, visible pixels `479058`, corner alpha `[0, 0, 0, 0]`.
- `turtle.png`: `1024x1024 RGBA`, bbox `(30, 160, 981, 868)`, visible pixels `459875`, corner alpha `[0, 0, 0, 0]`.
- Visible pixels contain no exact or strict `#00ff00`, `#ff00ff`, or `#00ffff` chroma-key residue.
- Checked on a dark review background: all three remain readable and are not placeholder-like, emoji-like, or flat vector art.
