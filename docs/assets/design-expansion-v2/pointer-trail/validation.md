# Pointer Trail Validation

Status: PASS

## Files

- `docs/design/wtj-20260705-012-pointer-trail-visual-tokens.md`
- `docs/assets/design-expansion-v2/pointer-trail/pointer-trail-tokens.json`
- `docs/assets/design-expansion-v2/pointer-trail/manifest.json`
- `docs/assets/design-expansion-v2/pointer-trail/previews/pointer-trail-runtime-preview.png`
- `docs/assets/design-expansion-v2/pointer-trail/previews/pointer-trail-contact-sheet.png`
- `docs/assets/design-expansion-v2/pointer-trail/prompt-and-rationale.md`

## Checks

- Tokens JSON parses successfully.
- Manifest JSON parses successfully.
- Runtime preview is `1672x941`.
- Contact sheet is `1680x1120`.
- Three modes are present: `normalMove`, `validObjectClick`, and `dragSuccess`.
- Normal movement defines spawn distance, rate cap, particle cap, alpha curve, and `3000ms` removal.
- Fast movement reduces density and alpha instead of increasing particle count.
- Drag success defines protected target bounds and ring-behind-target behavior.
- Reduced motion has an explicit fallback.
- Forbidden list blocks large reward stars, persistent strokes, confetti showers, PNG particle sprites, reward increments, and target-covering particles.

## Visual Risk Notes

- The preview is an implementation guide, not production art. TL should draw glints procedurally in Canvas2D.
- Final runtime tuning may need one quick screenshot pass after implementation, especially on the 2014 MacBook Air target where particle count and alpha should stay conservative.
