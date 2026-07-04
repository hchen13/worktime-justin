# Letter U Production Sprite Prompt Record

Card: `WTJ-20260704-049`

Words: `umbrella`, `unicorn`, `ukulele`, `uniform`

## Output Paths

- `docs/assets/production-pack-b/sprites/umbrella.png`
- `docs/assets/production-pack-b/sprites/unicorn.png`
- `docs/assets/production-pack-b/sprites/ukulele.png`
- `docs/assets/production-pack-b/sprites/uniform.png`

## Source And Alpha Paths

- `docs/assets/production-pack-b/source/umbrella-source-green.png`
- `docs/assets/production-pack-b/source/umbrella-alpha-raw.png`
- `docs/assets/production-pack-b/source/unicorn-source-green.png`
- `docs/assets/production-pack-b/source/unicorn-alpha-raw.png`
- `docs/assets/production-pack-b/source/ukulele-source-green.png`
- `docs/assets/production-pack-b/source/ukulele-alpha-raw.png`
- `docs/assets/production-pack-b/source/uniform-source-green.png`
- `docs/assets/production-pack-b/source/uniform-alpha-raw.png`

## Prompts

### Umbrella

```text
A single production-quality toddler app sprite of one UMBRELLA, centered on a solid pure chroma green background (#00ff00). The umbrella is a dimensional soft-clay / plush-toy illustration, open canopy with alternating red, yellow, blue, and cream panels, rounded hooked handle, soft bevels, gentle highlights, polished sticker-like edges. One umbrella only, child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no rain, no clouds, no person, no puddle, no text, no letters, no extra objects, avoid green anywhere in the umbrella. Square composition, object fills most of canvas with clean margin.
```

### Unicorn

```text
A single production-quality toddler app sprite of one UNICORN, centered on a solid pure chroma green background (#00ff00). The unicorn is an original dimensional soft-clay / plush-toy animal, full body in a gentle 3/4 side view, white rounded body, golden horn, pastel pink and lavender mane and tail, small friendly eyes, tiny hooves, soft bevels, gentle highlights, polished sticker-like edges. Child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, not a copyrighted character, no rainbow, no stars, no clouds, no grass, no saddle, no text, no letters, no extra objects, avoid green anywhere in the unicorn. Square composition, object fills most of canvas with clean margin.
```

### Ukulele

```text
A single production-quality toddler app sprite of one UKULELE, centered on a solid pure chroma green background (#00ff00). The ukulele is a small four-string wooden toy instrument, warm honey-brown body, darker neck, rounded body shape, visible sound hole, four simple tuning pegs, soft-clay / polished wooden-toy material, subtle bevels, gentle highlights, polished sticker-like edges. One ukulele only, slight diagonal 3/4 angle, child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no guitar pick, no hands, no music notes, no text, no letters, no extra objects, avoid green. Square composition, object fills most of canvas with clean margin.
```

### Uniform

```text
A single production-quality toddler app sprite of one SCHOOL UNIFORM outfit, centered on a solid pure chroma green background (#00ff00). The uniform is a complete child-readable outfit hanging neatly on one simple hanger: navy blazer, white shirt, red tie, pleated navy skirt or shorts, small polished shoes below, soft-clay / plush-toy fabric material, rounded seams, gentle highlights, subtle bevels, polished sticker-like edges. One uniform outfit only, no child or mannequin body, no school logo, no badge, no text, no letters, no extra props, avoid green fabric. Square composition, object fills most of canvas with clean margin.
```

## Design Choices

- Used single-object generation instead of sheet slicing to keep each U sprite large, centered, and reviewable.
- Kept all source backgrounds on #00ff00 chroma key because none of the selected subjects require green as an essential visible color.
- Chose dimensional clay/plush rendering with visible material texture, rounded bevels, and no flat icon treatment.
- `uniform` is represented as an outfit on a hanger, without a child body or school badge, to avoid identity, logo, and mannequin ambiguity.
- `ukulele` keeps four strings and small body proportions so it reads differently from a guitar at small size.

## Self Check

- `umbrella.png`: `1024x1024 RGBA`, visible bbox `(18, 34, 1006, 986)`, visible pixels `429997`, corner alpha `[0, 0, 0, 0]`, strict #00ff00/#ff00ff/#00ffff residue `0/0/0`.
- `unicorn.png`: `1024x1024 RGBA`, visible bbox `(131, 35, 952, 959)`, visible pixels `411327`, corner alpha `[0, 0, 0, 0]`, strict #00ff00/#ff00ff/#00ffff residue `0/0/0`.
- `ukulele.png`: `1024x1024 RGBA`, visible bbox `(187, 16, 911, 993)`, visible pixels `278279`, corner alpha `[0, 0, 0, 0]`, strict #00ff00/#ff00ff/#00ffff residue `0/0/0`.
- `uniform.png`: `1024x1024 RGBA`, visible bbox `(170, 21, 854, 999)`, visible pixels `365783`, corner alpha `[0, 0, 0, 0]`, strict #00ff00/#ff00ff/#00ffff residue `0/0/0`.
- Dark-canvas review: all four subjects are complete, child-readable, and visually closer to the v3 soft-clay baseline than flat placeholder art.

