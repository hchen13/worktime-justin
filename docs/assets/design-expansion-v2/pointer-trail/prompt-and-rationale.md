# Pointer Trail Prompt And Rationale

## Generation Method

This card uses deterministic raster preview generation from the token spec, not AI image generation. The target is a runtime Canvas2D particle language; using a model-generated image would risk producing decorative sprites or noisy reward art that TL should not implement.

## Preview Generation Prompt

Create a WorkTime Justin runtime UI preview focused on pointer trail feedback. Use the WTJ-081 dark canvas, quiet header/footer, and the same cyan, gold, green, pink, and blue feedback colors. Show three pointer-feedback modes: sparse normal movement glints, compact valid-object click burst, and drag success ring with protected drop target. Keep the center canvas readable. Do not use large reward stars, confetti showers, PNG particle sprites, permanent drawing strokes, or particles covering task props.

## Key Trade-Offs

- The effect is intentionally small. It supports toddler delight, but it must not reward frantic mouse shaking.
- Normal movement uses sparse dots, diamond chips, and four-point glints instead of large sticker-like stars.
- Valid click gets a short burst so an accepted object feels responsive without becoming a task completion reward.
- Drag success gets the strongest state, but the ring is behind or outside the target so the drop target remains readable.
- The three-second fade is mostly invisible in the last second; this keeps the accepted mockup's clean dark stage.

## Rejected Directions

- A continuous neon line following the pointer: too much like a drawing tool and visually pollutes the stage.
- Large star particles: conflicts with reward stickers and keyboard milestone star anti-reference.
- Dense confetti for normal movement: encourages shaking the pointer for visual payoff.
- Sprite-sheet particles: unnecessary for tiny glints and creates avoidable production-asset overhead.

## Handoff Note

TL can implement this as a local `pointerTrailTokens` object plus Canvas2D draw helpers. If the keyboard feedback code already has sparkle primitives, reuse those shape/color functions and apply this card's density, lifetime, alpha, and target-protection rules.
