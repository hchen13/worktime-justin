# Production Asset Quality Bar

This project separates documentation mockups from production game assets.

## Asset Classes

### Documentation Mockups

Documentation mockups explain product behavior in `docs/`.

Acceptable:

- simplified UI screenshots
- rough state diagrams
- generated concept images
- emoji-like placeholders when clearly used as explanation only

These assets must not be treated as final in-app art.

### Production Assets

Production assets are any images, sprites, animation frames, stickers, treasure chest art, secret-word objects, or reward visuals that can ship in the actual app.

Production assets must meet this bar:

- unified art direction across the whole set
- high-quality finished illustration, not rough sketch, emoji, or placeholder icon
- child-friendly and immediately recognizable
- consistent perspective, lighting, outline treatment, shadow, color saturation, and rendering detail
- readable on the dark app canvas at the intended display size
- transparent PNG or animation source with clean alpha when used as sprite art
- no copyrighted character style, brand imitation, watermark, or visible generation artifact
- enough padding for animation without cropping
- source prompt, source file, and review notes recorded in the card evidence

## Hard Rejection Criteria

A production asset must be rejected if it is:

- emoji or emoji-like art used as final material
- visibly rough, low-detail, or inconsistent with the set
- a screenshot of a rough mockup instead of a clean cutout/sprite
- style-mismatched against previously accepted production assets
- hard to recognize for a young child
- low contrast on the dark canvas
- missing transparent background when transparency is required

## Workflow

DESIGN may use rough images for direction finding, but must label them as mockups or explorations.

Before generating large batches, DESIGN must produce a small production-quality sample pack and style guide. PM accepts the sample pack only when it is good enough to set the bar for the full library.

TL must not implement rough documentation mockups as production game assets. If an implementation card needs real art and only mockups exist, TL should return the card to PM review or block for production assets.

QA visual checks for production features must include asset quality and consistency, not only path existence or screen placement.
