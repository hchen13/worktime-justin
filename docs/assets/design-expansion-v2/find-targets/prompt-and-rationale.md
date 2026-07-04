# Prompt And Rationale

Card: `WTJ-20260704-059`
Owner session: `Designer 1 / Automation:worktime-justin-design-loop`

## Source Strategy

For the target objects, I reused the accepted `production-pack-b` sprite sources instead of generating a new mixed-style batch. The goal of this card is to let PM/Ethan judge "find target" readability quickly, so consistency and small-size recognition matter more than novelty.

Selected source style:

- polished 2.5D toy-like object rendering
- clean alpha
- strong silhouette at 72-128 px
- bright but not noisy color on the dark app canvas
- no copyrighted character imitation

Excluded directions:

- old basket direction
- old dog direction
- old treasure chest direction

Those were deliberately left out because the recent feedback called them too flat or low-quality. If PM/Ethan wants one of those semantic roles later, it should be regenerated or reworked as a separate production asset card.

## Object Treatment

Prompt intent, expressed as a production selection rule rather than a new image prompt:

```text
Choose child-recognizable standalone target objects in the existing WorkTime Justin 2.5D production style. Prefer strong silhouette, clean alpha, high contrast on a dark teal canvas, and shapes that remain readable at 72 px. Avoid rough mockup art, emoji-like flat icons, and previously rejected low-quality basket/dog/treasure directions.
```

Each chosen object was trimmed from its source alpha, scaled into a 512 x 512 transparent canvas, centered, and assigned a padded rounded-rectangle hit area. Thin objects such as `key` keep a larger hit box than their visual silhouette so they stay usable for a young child.

## Hover Feedback Treatment

Hover feedback was generated as transparent overlay frames, not baked into each object. This keeps TL integration simple: the same overlay can be centered on any target's hit area.

`ring-pulse`:

- 8 frames
- 512 x 512 transparent PNG
- 12 fps
- loopable for a short hover state
- aqua/gold ring and small glints for visibility on dark canvas

`check-spark`:

- 8 frames
- 512 x 512 transparent PNG
- 12 fps
- one-shot confirmation
- white/green check mark plus small sparkle burst

## Tradeoffs

- Reusing accepted production sprites gives better consistency than a fresh AI batch, but PM/Ethan should still review whether these exact objects fit the task vocabulary.
- The hit areas are intentionally generous. They may feel oversized for desktop pointer precision, but the product target is toddler-friendly interaction.
- `duck` is included as a toy-like animal target, but the rejected dog direction is not reused.
- The hover overlays are production-ready as transparent assets, but final timing and placement should be tuned in app after PM selects the target set.

