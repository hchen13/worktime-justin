# Bell Ring Amplitude Repair

Card: `WTJ-20260706-003`

Executor: Designer 1 / `CodexThread:019f2887-9de8-7b72-b53b-230a0857f710`

## Source

- Fixed body source: `docs/assets/production-animations-v1/bell/idle/bell_idle_000.png`
- Previous ring frames: `docs/assets/production-animations-v1/bell/ring/bell_ring_000.png..005.png`
- Output root: `docs/assets/production-animations-v1/bell/`

## Prompt / Direction

Use the WorkTime Justin production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft light, warm child-friendly saturation. Preserve the existing bell material exactly; only strengthen transparent animation effects, visible ringing rotation, sound arcs, and metallic glints. Keep every frame on a 1024x1024 transparent canvas, with stable anchor, no text, no watermark, no background, and no magenta residue.

## Decision

This pass does not regenerate the bell body. It derives all ring frames from the accepted idle bell sprite, then applies larger alternating rotation and horizontal offset plus crisp baked sound arcs. That keeps the material stable while making the ring action readable on the dark canvas at 96-128px.

The runtime sheet remains six 256px cells, matching the existing `app/web/anim-manifest.js` frameCount. This avoids turning a visual repair into a TL runtime reconfiguration task.

## Evidence

- Updated source frames: `docs/assets/production-animations-v1/bell/ring/`
- Updated source sheet: `docs/assets/production-animations-v1/bell/sheets/ring-sheet.png`
- Updated runtime sheet: `app/web/assets/anim/bell/ring-sheet.png`
- Updated contact sheet: `docs/assets/production-animations-v1/bell/bell-contact-sheet.png`
- Updated preview: `docs/assets/production-animations-v1/previews/bell-ring-preview.gif`
- Local preview copy: `docs/assets/production-animations-v1/bell/previews/bell-ring-preview.gif`
- Before/after evidence: `docs/assets/production-animations-v1/bell/evidence/wtj-20260706-003/bell-ring-before-after-contact-sheet.png`
- Small-size check: `docs/assets/production-animations-v1/bell/evidence/wtj-20260706-003/bell-ring-small-size-readability.png`
- Alpha checker: `docs/assets/production-animations-v1/bell/evidence/wtj-20260706-003/bell-ring-alpha-checker-preview.png`
- Validation JSON: `docs/assets/production-animations-v1/bell/evidence/wtj-20260706-003/bell-ring-validation.json`

## Residual Risk

This is still a flattened sprite swing, not a separated clapper/body rig. It is intentionally scoped to the PM-requested amplitude/readability repair. A future v2 with separate handle, body, clapper, and sound-wave layers would support more physical ringing, but is not required for this card.
