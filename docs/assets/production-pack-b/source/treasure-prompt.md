# WTJ-20260706-014 Treasure Redesign Prompt

Card: WTJ-20260706-014
Executor: Designer 1
Identity: CodexThread:019f2887-9de8-7b72-b53b-230a0857f710
Generated: 2026-07-06 17:45 CST

## Prompt

Create a polished production game sprite on a transparent background: a cheerful pile of treasure made of loose gold coins, faceted blue/red/green gems, and a small gold medal/star charm, arranged as one compact object. It must be clearly NOT a chest, box, crate, bag, or container. Child-friendly, high-quality finished illustration, rounded toy-like 3D rendering, clean alpha, subtle soft shadow under the object, saturated warm gold with jewel accents, consistent with cute desktop app sprites. Centered in a 1024x1024 square with generous padding, readable at 72px and 128px on a dark navy canvas. No text, no watermark, no background, no characters, no copyrighted style.

## Selected Output

- Raw generated source: `docs/assets/production-pack-b/source/treasure-source-generated-20260706.png`
- Alpha cleanup source: `docs/assets/production-pack-b/source/treasure-alpha-raw-20260706.png`
- Production candidate: `docs/assets/production-pack-b/sprites/treasure.png`
- Review contact sheet: `docs/assets/production-pack-b/review/wtj-20260706-014/treasure-vs-chest-dark-72-128.png`

## Rationale

The previous `treasure.png` was byte-identical to `treasure-chest.png`, so children and reviewers could not distinguish the word object `treasure` from the reward object `treasure chest`. The replacement uses loose coins and gems with no hinges, lid, lock, walls, box silhouette, or container form. The object remains gold-forward to keep the treasure concept, while red/blue/green jewels improve recognition at small sizes.

## Cleanup Notes

The generated source arrived with an opaque checkerboard preview background. The production candidate was made by flood-removing only bright neutral pixels connected to the image border, preserving highlights inside coins and jewels, then cropping and scaling the cleaned alpha into a 1024x1024 transparent PNG with generous padding.

## Visual Checks

- 1024x1024 RGBA PNG.
- Four-corner alpha is transparent after cleanup.
- At 128px and 72px on dark navy, the new object reads as loose coins and gems.
- No chest, box, crate, bag, lock, lid, hinge, or container silhouette remains.
