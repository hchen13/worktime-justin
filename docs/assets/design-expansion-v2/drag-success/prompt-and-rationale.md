# Prompt And Rationale

Card: `WTJ-20260704-058`

## Motion Prompt

Create three child-friendly 2.5D drag-success animations for a dark-canvas toddler work game. Use polished soft-plastic production assets, not flat icons or emoji. Each animation must include idle, dragging, and success states, transparent 1024x1024 PNG frames, a sprite sheet, anchor point, target bounds, and a dark-canvas preview.

## Candidates

### Apple To Basket

Prompt: A glossy red apple moves along a short curved drag path into a woven basket. The basket gives a subtle bounce on success, with a small gold ring and sparkles. The apple settles partly behind the basket so the action reads as "put in basket."

Tradeoff: The apple and basket are reused from accepted production packs instead of regenerated. This preserves detail and consistency; the motion communicates the new behavior.

### Dog To Doghouse

Prompt: A friendly puppy travels toward a small red-roof doghouse. On success the puppy settles near the doorway with a gentle bounce, paw-like trail hints, blue-gold sparkles, and a lightweight success ring.

Tradeoff: The dog remains visible in front of the doghouse rather than being hidden inside the doorway. This keeps the success state legible at small size.

### Star To Sky

Prompt: A soft yellow star rises toward a small translucent sky cue. It leaves a warm trail while dragging, then lands near the sky cue with twinkles and a brief ring burst.

Tradeoff: The sky is a subtle translucent cue inside the transparent frame instead of a full background. This keeps the asset reusable over the app canvas.

## Source Assets

- `source/apple.png`
- `source/basket.png`
- `source/dog.png`
- `source/doghouse.png`
- `source/star.png`
- `source/star_sticker.png`
- `source/sparkle_burst.png`

## Evidence

- Manifest: `manifest.json`
- Contact sheet: `contact-sheets/drag-success-v2-contact-sheet.png`
- Preview GIFs: `previews/`
- Validation: all production frames are `1024x1024` RGBA with transparent corners; no missing frame, sheet, manifest, contact sheet, or preview path.
