# WTJ-20260705-012 Pointer Trail Visual Tokens

Owner: Designer 1  
Runtime identity: Automation:worktime-justin-design-loop  
Date: 2026-07-05  
Scope: mouse / trackpad pointer trail, valid-object click feedback, and drag-success sparkle feedback. This card defines runtime visual tokens only; it does not introduce new production sprite art.

## Output Assets

- Tokens: `docs/assets/design-expansion-v2/pointer-trail/pointer-trail-tokens.json`
- Runtime preview: `docs/assets/design-expansion-v2/pointer-trail/previews/pointer-trail-runtime-preview.png`
- Contact sheet: `docs/assets/design-expansion-v2/pointer-trail/previews/pointer-trail-contact-sheet.png`
- Prompt / rationale: `docs/assets/design-expansion-v2/pointer-trail/prompt-and-rationale.md`
- Manifest: `docs/assets/design-expansion-v2/pointer-trail/manifest.json`
- Validation: `docs/assets/design-expansion-v2/pointer-trail/validation.md`

## Design Intent

Pointer trail should feel like a tiny magic dust response to movement, not a reward system and not a drawing tool. It belongs to the same visual language as WTJ-081 keyboard trails: dark clean canvas, small cyan / yellow / green glints, soft fade, and no persistent clutter.

The effect must stay light enough that a child can move the pointer freely without turning the screen into a noisy game of "shake the mouse." Fast movement should stretch spacing and reduce density instead of producing more particles.

## Runtime Layering

- Render in a Canvas2D feedback layer above the dark background and below major task props, secret-word sprites, large keyboard letters, modal UI, and the footer.
- Normal trail particles render behind the live pointer and never on top of draggable task objects.
- Drag success ring and sparkles render behind the dropped object or outside a protected target box.
- Do not create PNG particle sprites. Use Canvas2D paths: small dots, four-point star glints, diamond chips, and short comet flecks.

## Shapes

| Shape token | Use | Geometry |
| --- | --- | --- |
| `soft_dot` | normal movement dust | circular dot, radius `1.8-3.2px`, blur `3-8px` |
| `diamond_chip` | normal movement accents | rotated square, long axis `4-7px`, no hard outline |
| `four_point_glint` | click and success accents | four-point star/cross, radius `4-10px`, center dot optional |
| `comet_fleck` | drag path hint | short rounded line, length `10-22px`, width `2-4px`, aligned opposite movement |

Do not use large five-point reward stars for the pointer trail. Those are reserved for stickers and milestone rewards.

## Color Tokens

Use WTJ-081 feedback colors and keep opacity lower than keyboard letters:

- `trailCyan`: `#3ce7ff`
- `trailGold`: `#ffd84c`
- `trailGreen`: `#65f08d`
- `trailPink`: `#ff77b8`
- `trailBlue`: `#82a8ff`
- shadow / glow color derives from the particle color at alpha `0.12-0.28`.

Normal movement alternates mostly `trailCyan` and `trailGold`, with rare `trailBlue`. Valid-object click adds `trailGreen`. Drag success may use object accent color plus `trailGold`, but global alpha still caps at `0.62`.

## Modes

### 1. Normal Pointer Move

Use this for ordinary mouse / trackpad motion across the canvas.

- Spawn only after pointer moves at least `14px` from the last emitted particle.
- Ignore micro-jitter below `3px`.
- Spawn rate cap: `18 particles / second`.
- Active particle cap: `44`.
- Particle size: `2-6px`.
- Lifetime: `720-3000ms`.
- Alpha curve:
  - `0-90ms`: birth `0 -> 0.42`
  - `90-620ms`: visible `0.42 -> 0.30`
  - `620-3000ms`: cubic fade `0.30 -> 0`
- Fast movement rule: when pointer velocity exceeds `1100px/s`, increase spacing to `28px` and reduce spawn alpha by `35%`.
- Visual density target: at 1440px width, a quick diagonal move should leave `10-18` visible glints, not a solid stroke.

### 2. Valid Object Click

Use this when a clickable task object accepts a click.

- One compact burst centered on the accepted object or pointer location.
- Burst particles: `10-14`.
- Ring radius: `18px -> 42px`.
- Duration: `520-760ms`.
- Max alpha: ring `0.36`, particles `0.58`.
- Colors: `trailCyan`, `trailGold`, `trailGreen`.
- Do not spawn a large reward sticker, confetti shower, or permanent slot change from this effect.

### 3. Drag Success

Use this when an object is dropped on a correct target.

- Keep a faint comet path behind the dragged object while moving: at most `8` active flecks.
- On success, play a target-safe ring and `12-18` glints.
- Success duration: `760-980ms`, then every element fades out.
- Ring radius: `28px -> 76px`.
- Drop target protection:
  - Compute `targetBounds` and pad it by `16px`.
  - Do not draw glints inside the protected center area if they would cover the object / target silhouette.
  - Draw the success ring behind the target object; if layer control is unavailable, split the ring into a hollow stroke with alpha `<= 0.22`.
- Drag path particles must point backward along motion and stay behind the object, never in front of its face or label.

## Three-Second Decay

The normal trail can take up to about `3000ms` to fully disappear, but the last second must be nearly invisible. At `2000ms`, particle opacity should be below `0.10`; at `3000ms`, remove the particle from memory.

If the pointer stops, do not keep emitting idle sparkles. Existing particles fade; no new particles are born after `120ms` without pointer movement.

## Anti-Spam Rules

- Global active particle cap: `80`.
- If the cap is reached, drop the oldest low-alpha particles first.
- Do not increase particle count with pointer speed.
- Repeated rapid circles should visually thin out: use the fast movement rule plus a `350ms` energy cooldown after more than `1200px` of travel in one second.
- Disable trail generation while parent passcode / exit UI is open.
- Reduced motion: no trail path. Show only a single low-alpha dot at click acceptance and a `360ms` success ring.

## Implementation Notes For TL

- Put the values in `manifest.js` or a local `pointerTrailTokens` object near the pointer renderer.
- Draw particles with Canvas2D primitives; do not load image files for each glint.
- Keep Safari 14 compatibility. Avoid CSS `color-mix()`, `filter: drop-shadow()` dependency for core visibility, and modern-only Canvas APIs.
- If the app already exposes a shared sparkle helper from keyboard feedback, reuse shape/color functions and pass this card's density/lifetime tokens into it.
- Pointer trail is a soft visual layer, not a source of progress. It must not increment discovery slots or rewards.

## Acceptance Checklist

- Normal move, valid click, and drag success each have explicit size, density, color, alpha, lifetime, and caps.
- The effect fades within about 3 seconds and does not keep emitting after pointer stop.
- Fast movement reduces density instead of increasing it.
- Drag success protects the drop target from visual occlusion.
- The language reuses WTJ-081 keyboard trail colors and avoids a separate reward/sticker system.
- Output assets are saved under project paths and are ready for PM review.
