# Letter W Production Sprite Prompt Record

Card: `WTJ-20260704-051`

Words: `whale`, `watch`, `window`, `wagon`

## Output Paths

- `docs/assets/production-pack-b/sprites/whale.png`
- `docs/assets/production-pack-b/sprites/watch.png`
- `docs/assets/production-pack-b/sprites/window.png`
- `docs/assets/production-pack-b/sprites/wagon.png`

## Source And Alpha Paths

- `docs/assets/production-pack-b/source/whale-source-green.png`
- `docs/assets/production-pack-b/source/whale-alpha-raw.png`
- `docs/assets/production-pack-b/source/watch-source-green.png`
- `docs/assets/production-pack-b/source/watch-alpha-raw.png`
- `docs/assets/production-pack-b/source/window-source-green.png`
- `docs/assets/production-pack-b/source/window-alpha-raw.png`
- `docs/assets/production-pack-b/source/wagon-source-green.png`
- `docs/assets/production-pack-b/source/wagon-alpha-raw.png`

## Prompts

### Whale

```text
A single production-quality toddler app sprite of one WHALE, centered on a perfectly flat solid pure chroma green background (#00ff00). The whale is an original dimensional soft-clay / plush-toy sea animal, rounded friendly blue whale body, small fins, tiny tail flukes, gentle smiling face, soft bevels, subtle matte highlights, polished sticker-like edges. One whale only, full body in a gentle 3/4 side view, child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no ocean, no waves, no water spout, no bubbles, no fish, no text, no letters, no watermark, no cast shadow, no extra objects, avoid green anywhere in the whale. Square composition, object fills most of canvas with clean margin.
```

### Watch

```text
A single production-quality toddler app sprite of one WATCH, centered on a perfectly flat solid pure chroma green background (#00ff00). The watch is an original dimensional soft-clay / polished toy wristwatch, round blue watch face with simple tick marks but no readable numbers, warm tan strap, small silver side crown, soft bevels, gentle highlights, polished sticker-like edges. One watch only, slightly tilted 3/4 view, child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no wrist, no hand, no table, no time text, no letters, no brand logo, no watermark, no extra objects, avoid green anywhere in the watch. Square composition, object fills most of canvas with clean margin.
```

### Window

```text
A single production-quality toddler app sprite of one WINDOW, centered on a perfectly flat solid pure chroma green background (#00ff00). The window is an original dimensional soft-clay / polished toy house window, warm cream wooden frame with four blue glass panes, small rounded sill, simple red curtains partly visible inside the frame, soft bevels, gentle highlights, polished sticker-like edges. One window only, front-facing with slight 3/4 depth, child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no wall, no room, no outdoor scenery, no flowers, no person, no text, no letters, no watermark, no extra objects, avoid green anywhere in the window. Square composition, object fills most of canvas with clean margin.
```

### Wagon

```text
A single production-quality toddler app sprite of one WAGON, centered on a perfectly flat solid pure chroma green background (#00ff00). The wagon is an original dimensional soft-clay / polished toy pull wagon, bright red rounded cart body, four small black rubber wheels, simple tan pull handle, soft bevels, gentle highlights, polished sticker-like edges. One empty wagon only, 3/4 side view, child-readable at small size, high detail, not flat vector, not emoji, not icon, not clipart, no toys inside, no child, no road, no grass, no shadow, no text, no letters, no brand logo, no watermark, no extra objects, avoid green anywhere in the wagon. Square composition, object fills most of canvas with clean margin.
```

## Design Choices

- Used single-object generation to preserve silhouette clarity and avoid sheet slicing artifacts.
- Kept #00ff00 chroma key across the set because none of the W subjects needs green as a core material.
- `whale` excludes water, bubbles, and spouts so it remains a clean animal sprite, not a scene.
- `watch` uses tick marks without readable numbers or brand text, avoiding text generation artifacts while preserving recognizability.
- `window` includes only frame, panes, sill, and curtains; no wall or outside scene, so the object reads as a window rather than a room screenshot.
- `wagon` is empty by design, with no toys or child figure, keeping the secret word focused on the cart.

## Self Check

- `whale.png`: `1024x1024 RGBA`, visible bbox `(40, 189, 998, 814)`, visible pixels `380664`, corner alpha `[0, 0, 0, 0]`, strict #00ff00/#ff00ff/#00ffff residue `0/0/0`.
- `watch.png`: `1024x1024 RGBA`, visible bbox `(163, 52, 851, 967)`, visible pixels `461414`, corner alpha `[0, 0, 0, 0]`, strict #00ff00/#ff00ff/#00ffff residue `0/0/0`.
- `window.png`: `1024x1024 RGBA`, visible bbox `(95, 75, 923, 947)`, visible pixels `605433`, corner alpha `[0, 0, 0, 0]`, strict #00ff00/#ff00ff/#00ffff residue `0/0/0`.
- `wagon.png`: `1024x1024 RGBA`, visible bbox `(20, 209, 996, 825)`, visible pixels `301334`, corner alpha `[0, 0, 0, 0]`, strict #00ff00/#ff00ff/#00ffff residue `0/0/0`.
- Dark-canvas review: all four subjects are complete, child-readable, and match the accepted soft-clay production baseline better than placeholder or flat icon art.

