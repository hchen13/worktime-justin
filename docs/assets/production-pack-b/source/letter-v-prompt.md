# Letter V Production Sprite Prompt Record

Card: `WTJ-20260704-050`

Words: `van`, `vase`, `violin`, `volcano`

## Output Paths

- `docs/assets/production-pack-b/sprites/van.png`
- `docs/assets/production-pack-b/sprites/vase.png`
- `docs/assets/production-pack-b/sprites/violin.png`
- `docs/assets/production-pack-b/sprites/volcano.png`

## Source And Alpha Paths

- `docs/assets/production-pack-b/source/van-source-green.png`
- `docs/assets/production-pack-b/source/van-alpha-raw.png`
- `docs/assets/production-pack-b/source/vase-source-green.png`
- `docs/assets/production-pack-b/source/vase-alpha-raw.png`
- `docs/assets/production-pack-b/source/violin-source-green.png`
- `docs/assets/production-pack-b/source/violin-alpha-raw.png`
- `docs/assets/production-pack-b/source/volcano-source-green.png`
- `docs/assets/production-pack-b/source/volcano-alpha-raw.png`

## Prompts

### Van

```text
A single production-quality toddler app sprite of one VAN, centered on a perfectly flat solid pure chroma green background (#00ff00). The van is an original dimensional soft-clay / polished toy vehicle, friendly rounded minivan shape, bright red-orange body with cream roof, blue windows, simple black rubber wheels, soft bevels, gentle highlights, polished sticker-like edges. One van only, 3/4 front view, child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no road, no driver, no people, no luggage, no text, no letters, no watermark, no cast shadow, no extra objects, avoid green anywhere in the van. Square composition, object fills most of canvas with clean margin.
```

### Vase

```text
A single production-quality toddler app sprite of one VASE, centered on a perfectly flat solid pure chroma green background (#00ff00). The vase is an original dimensional soft-clay / polished ceramic toy object, rounded blue porcelain vase with a wide lip, small handles, simple warm yellow decorative bands, soft bevels, gentle highlights, polished sticker-like edges. One vase only, no flowers, no plant stems, no water, no table, no shadows, no text, no letters, no watermark, no extra objects. Child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, avoid green anywhere in the vase. Square composition, object fills most of canvas with clean margin.
```

### Violin

```text
A single production-quality toddler app sprite of one VIOLIN, centered on a perfectly flat solid pure chroma green background (#00ff00). The violin is an original dimensional soft-clay / polished wooden toy instrument, warm amber-brown body, darker fingerboard, four visible strings, simple pegs, small chin rest, soft bevels, gentle highlights, polished sticker-like edges. One violin only, no bow, no hands, no music notes, no stand, no text, no letters, no watermark, no extra objects. Slight diagonal 3/4 angle, child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, avoid green anywhere in the violin. Square composition, object fills most of canvas with clean margin.
```

### Volcano

```text
A single production-quality toddler app sprite of one VOLCANO, centered on a perfectly flat solid pure chroma green background (#00ff00). The volcano is an original dimensional soft-clay / polished toy landscape object, dark warm-gray rocky cone, red-orange lava flowing from the crater, small puffy orange glow at the top, rounded bevels, gentle highlights, polished sticker-like edges. One volcano only, no grass, no trees, no island, no sky, no smoke cloud covering the silhouette, no dinosaurs, no people, no text, no letters, no watermark, no extra objects. Child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, avoid green anywhere in the volcano. Square composition, object fills most of canvas with clean margin.
```

## Design Choices

- Used one generated source per word to avoid sheet-crop artifacts and keep each silhouette large enough for PM review.
- Kept all four sources on #00ff00 chroma key because none of the required subjects needs green as a primary visible material.
- `vase` is a standalone ceramic vessel without flowers or stems, so the secret word remains about the object itself instead of reading as `flower`.
- `violin` intentionally excludes bow, hands, and music-note props; four strings and the body silhouette carry recognition.
- `volcano` excludes grass, sky, and smoke-heavy scenery, preserving a clean sprite silhouette for the dark app canvas.

## Self Check

- `van.png`: `1024x1024 RGBA`, visible bbox `(23, 137, 1008, 885)`, visible pixels `519630`, corner alpha `[0, 0, 0, 0]`, strict #00ff00/#ff00ff/#00ffff residue `0/0/0`.
- `vase.png`: `1024x1024 RGBA`, visible bbox `(100, 91, 920, 947)`, visible pixels `483150`, corner alpha `[0, 0, 0, 0]`, strict #00ff00/#ff00ff/#00ffff residue `0/0/0`.
- `violin.png`: `1024x1024 RGBA`, visible bbox `(184, 14, 886, 996)`, visible pixels `299579`, corner alpha `[0, 0, 0, 0]`, strict #00ff00/#ff00ff/#00ffff residue `0/0/0`.
- `volcano.png`: `1024x1024 RGBA`, visible bbox `(42, 46, 988, 971)`, visible pixels `552616`, corner alpha `[0, 0, 0, 0]`, strict #00ff00/#ff00ff/#00ffff residue `0/0/0`.
- Dark-canvas review: all four subjects are complete, readable, and closer to the accepted soft-clay production baseline than placeholder or flat icon art.

