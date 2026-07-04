# Drag Success Motion V2

Card: `WTJ-20260704-058`

This pack contains three drag-task success motion candidates:

- `apple-to-basket`
- `dog-to-doghouse`
- `star-to-sky`

Each candidate includes `idle`, `dragging`, and `success` transparent PNG frames at `1024x1024`, one combined sprite sheet, and a dark-canvas preview GIF for review.

Primary review files:

- `manifest.json`
- `contact-sheets/drag-success-v2-contact-sheet.png`
- `previews/apple-to-basket-preview.gif`
- `previews/dog-to-doghouse-preview.gif`
- `previews/star-to-sky-preview.gif`

Design decision:

The object art is composed from accepted production assets rather than regenerated from scratch. This keeps the basket, doghouse, dog, apple, and star aligned with `production-pack-a`, `production-pack-b`, and `production-animations-v1`, avoiding the flat placeholder look Ethan rejected. The new work in this pack is the motion path, state split, success feedback, transparent frame output, frame sheets, preview GIFs, and implementation manifest.

Implementation note:

The GIFs are flattened on a dark canvas for human review. TL should use the PNG frames or sheets listed in `manifest.json` for implementation.
