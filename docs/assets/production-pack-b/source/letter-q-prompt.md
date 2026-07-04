# Letter Q Production Sprite Notes

Card: `WTJ-20260704-045`
Role: `DESIGN`
Updated: `2026-07-04 08:28 CST`

## Scope

This card only covers four Q words from Production Pack B:

- `queen`
- `quilt`
- `quail`
- `quarter`

## Prompt: Queen

```text
A single production-quality toddler app sprite of one QUEEN, centered on a solid pure chroma green background (#00ff00). The queen is an original toy-like royal character, full body, friendly and child-readable, wearing a simple golden crown, rounded purple-and-gold dress, small scepter, soft-clay / plush-toy material, rounded safe shapes, subtle bevels, gentle highlights, polished sticker-like edges. High detail, not flat vector, not emoji, not icon, not clipart, not a princess, not a copyrighted character, no realistic portrait, no text, no letters, no throne, no castle, no extra people or objects. Square composition, object fills most of canvas with clean margin.
```

Paths:

- Source: `docs/assets/production-pack-b/source/queen-source-green.png`
- Alpha raw: `docs/assets/production-pack-b/source/queen-alpha-raw.png`
- Final sprite: `docs/assets/production-pack-b/sprites/queen.png`

## Prompt: Quilt

```text
A single production-quality toddler app sprite of one QUILT, centered on a solid pure chroma green background (#00ff00). The quilt is a folded patchwork blanket made of soft padded squares, warm red, blue, yellow, cream, and orange fabric panels, rounded stitched seams, plush thickness, soft-clay / sewn-toy material, gentle highlights, subtle bevels, polished sticker-like edges. Child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no bed, no pillow, no room, no person, no text, no letters, no extra objects, avoid green fabric. Square composition, object fills most of canvas with clean margin.
```

Paths:

- Source: `docs/assets/production-pack-b/source/quilt-source-green.png`
- Alpha raw: `docs/assets/production-pack-b/source/quilt-alpha-raw.png`
- Final sprite: `docs/assets/production-pack-b/sprites/quilt.png`

## Prompt: Quail

```text
A single production-quality toddler app sprite of one QUAIL bird, centered on a solid pure chroma green background (#00ff00). The quail is a dimensional soft-clay / plush-toy bird with a rounded brown body, tan belly, small wings with gentle spots, tiny orange feet, short beak, and a distinctive curled feather plume on top of its head. Friendly child-readable proportions, 3/4 side view, soft bevels, gentle highlights, polished sticker-like edges. High detail, not flat vector, not emoji, not icon, not clipart, no nest, no grass, no ground, no eggs, no extra birds, no text, no letters, avoid green feathers. Square composition, object fills most of canvas with clean margin.
```

Paths:

- Source: `docs/assets/production-pack-b/source/quail-source-green.png`
- Alpha raw: `docs/assets/production-pack-b/source/quail-alpha-raw.png`
- Final sprite: `docs/assets/production-pack-b/sprites/quail.png`

## Prompt: Quarter

```text
A single production-quality toddler app sprite of one QUARTER coin, centered on a solid pure chroma magenta background (#ff00ff). The coin is a generic shiny silver toy coin representing a quarter, round thick coin with beveled rim, embossed simple four-slice pie icon and small star dots only, no real-world currency portrait, no eagle, no flag, no country symbols, no letters, no words, no numbers, no text. Dimensional soft-clay / polished toy metal style, gentle highlights, subtle bevels, polished sticker-like edges. One coin only, slight 3/4 angle, child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no stack, no extra coins. Square composition, object fills most of canvas with clean margin.
```

Paths:

- Source: `docs/assets/production-pack-b/source/quarter-source-magenta.png`
- Alpha raw: `docs/assets/production-pack-b/source/quarter-alpha-raw.png`
- Final sprite: `docs/assets/production-pack-b/sprites/quarter.png`

## Design Choices

- Used single-object generation so the Q words get enough canvas scale and material polish rather than sheet-level miniatures.
- Kept `queen` as an original toy-like royal character with crown and scepter, avoiding any branded or realistic portrait style.
- Kept `quilt` as a folded patchwork blanket with thick seams and no room props, so the object reads as the word itself.
- Kept `quail` focused on its plume, face marking, rounded body, and small feet because those are the child-readable cues for the bird.
- Kept `quarter` as a generic silver toy coin with a four-slice emboss and star dots; no numbers, words, country symbols, or real currency portraits.
- Used `#00ff00` chroma key for `queen`, `quilt`, and `quail`; used `#ff00ff` for `quarter` to protect the silver edges from green reflection artifacts.

## Self-check

- `queen.png`: `1024x1024 RGBA`, bbox `(176, 15, 822, 989)`, visible pixels `371587`, corner alpha `[0, 0, 0, 0]`.
- `quilt.png`: `1024x1024 RGBA`, bbox `(12, 94, 997, 958)`, visible pixels `646024`, corner alpha `[0, 0, 0, 0]`.
- `quail.png`: `1024x1024 RGBA`, bbox `(92, 22, 950, 995)`, visible pixels `423708`, corner alpha `[0, 0, 0, 0]`.
- `quarter.png`: `1024x1024 RGBA`, bbox `(67, 65, 952, 954)`, visible pixels `609847`, corner alpha `[0, 0, 0, 0]`.
- Visible pixels contain no exact or strict `#00ff00`, `#ff00ff`, or `#00ffff` chroma-key residue.
- Checked on a dark review background: all four remain readable and are not placeholder-like, emoji-like, or flat vector art.
