# WTJ-20260704-081 Prompt, Rationale, And Evidence

Executor: Designer 1  
Identity: Automation:worktime-justin-design-loop  
Date: 2026-07-04

## Brief

Create an executable main-interface visual and motion specification for WorkTime Justin. Keep the accepted dark-canvas style baseline, but raise runtime quality by replacing rough default-looking text and ad hoc key feedback with a consistent rounded luminous letter system and subtle non-letter feedback.

## Prompt / Generation Method

No external copyrighted or stock assets were used. The preview and SVG samples were generated locally from vector/PIL drawing instructions based on project style tokens:

- dark neutral canvas with sparse center glow
- rounded high-weight letter glyphs
- layered letter treatment: dark stroke, small white highlight, saturated fill, glow, and trailing smear
- quiet header/footer chrome
- non-letter key feedback as rings/glints rather than rewards

Because this card is a UI/motion spec rather than a production sticker batch, local generated reference images are more useful than broad AI image exploration. The result is deterministic and saved in project paths for PM/TL review.

## Design Tradeoffs

- Kept the docs style baseline because Ethan said it is tolerable as a style direction.
- Did not reuse the flat dog/basket/chest-like production objects here. Those belong to WTJ-20260704-082 or later asset cards.
- Chose rounded local system fonts over bundled web fonts to preserve zero-network, file://, Safari 14 compatibility.
- Kept Canvas2D as the default implementation path because `app/web/app.js` already owns letter drawing. The SVG sample only defines the layering model if TL chooses a DOM/SVG implementation.
- Gave Space/Enter visible but non-reward feedback; modifier keys stay deliberately weak to avoid rewarding accidental system-key mashing.

## Evidence

Generated artifacts:

- `docs/design/wtj-081-main-ui-visual-motion-spec.md`
- `docs/assets/style/wtj-081/main-ui-motion-preview.png`
- `docs/assets/style/wtj-081/letter-glyph-samples.svg`
- `docs/assets/style/wtj-081/non-letter-feedback-frames.svg`
- `docs/assets/style/wtj-081/motion-token-sheet.json`

Quality checks:

- Assets are persisted under project paths, not temporary directories.
- Preview uses only local drawing instructions and local fonts.
- Samples are scoped to 081 and do not modify app runtime code or 082 sticker/chest assets.
- Spec includes Safari 14 constraints and reduced-motion behavior so TL can implement without breaking the target machine.

## Known Risks

- The actual runtime letter feel still depends on TL applying layered Canvas drawing rather than plain `fillText`.
- The preview does not validate final animation timing in a running browser; it is a static motion-spec image. QA should still verify the implemented behavior after WTJ-20260704-086.
- Footer detail is intentionally shallow here because WTJ-20260704-082 owns the discovery slot, sticker, and chest visual system.

