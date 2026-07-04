# WTJ-20260704-081 Main UI Visual And Keyboard Motion Spec

Owner: Designer 1  
Runtime identity: Automation:worktime-justin-design-loop  
Date: 2026-07-04  
Scope: main interface visual polish, keyboard letter feedback, non-letter key feedback. This does not cover the sticker/footer/chest production system in WTJ-20260704-082.

## Output Assets

- Preview image: `docs/assets/style/wtj-081/main-ui-motion-preview.png`
- Letter SVG sample: `docs/assets/style/wtj-081/letter-glyph-samples.svg`
- Non-letter feedback frame sample: `docs/assets/style/wtj-081/non-letter-feedback-frames.svg`
- Motion/design tokens: `docs/assets/style/wtj-081/motion-token-sheet.json`
- Prompt/rationale/evidence: `docs/assets/style/wtj-081/prompt-and-rationale.md`

## Visual Direction

Keep the accepted docs style baseline: deep clean workbench canvas, high-contrast colorful keyboard feedback, sparse child-friendly rewards, and very quiet UI chrome. The implementation should feel like a polished play workstation, not a dashboard, terminal, or educational worksheet.

Do not ship the rough docs mockup as product art. Use it only as style reference. Runtime UI should be rebuilt from tokens and local assets.

## Layout Spec

Canvas:

- Base color: `#0b1019`.
- Background: vertical gradient from `#090d15` at top to `#06101d` at center to `#050812` at bottom.
- Add one central soft radial light: center `rgba(74, 128, 214, 0.18)`, radius about 38% of the short viewport side.
- Keep the middle 70% of the stage visually empty so letters and task props have room.

Header:

- Height: 44px on desktop, 38px minimum on the 2014 MacBook Air target.
- Background: transparent-to-dark vertical wash, `rgba(8, 12, 20, 0.38)` to transparent.
- Title text: `Work Time, Justin!` on first line only when width allows; otherwise keep the existing compact title. Use `15px`, `font-weight: 800`, `line-height: 1`.
- Subtitle is optional in runtime. If present, max `11px`, opacity `0.58`; do not add explanatory copy.
- Parent lock: use a simple SVG stroke lock, not emoji. Size `13px`, opacity `0.36`, no bright color.

Footer:

- This card only defines the footer shell for 081. WTJ-20260704-082 owns detailed discovery slots and chest visuals.
- Footer height: `92px` desktop, clamp to `78px` on short screens.
- Footer divider: 1px top border `rgba(156, 180, 220, 0.16)`.
- Footer background: `rgba(5, 10, 18, 0.72)` with a subtle top glow `rgba(94, 231, 255, 0.06)`.
- Slots stay centered. Right-side reward/chest area must not steal attention from the stage.

Status lights:

- Keep in lower left above footer, `22-28px` asset size.
- Off state must remain visible: grayscale + brightness around 0.70 + opacity 0.65.
- On state glow: `rgba(101, 240, 141, 0.55)` within 8px radius.

Question entry:

- One circular yellow entry on the right side, not a floating toolbar.
- Size: `56-72px`, background `#ffd84c`, text/icon color `#17223a`, glow `rgba(255, 216, 76, 0.40)`.

## Palette

Use these as the active feedback palette, not as page-wide theme domination:

| Token | Value | Usage |
| --- | --- | --- |
| `canvasTop` | `#090d15` | stage background |
| `canvasMid` | `#06101d` | stage background |
| `canvasBottom` | `#050812` | stage background |
| `ink` | `#f5f8ff` | title and small UI |
| `muted` | `#a8b6cc` | secondary UI |
| `letterYellow` | `#ffd84c` | active letters |
| `letterCyan` | `#3ce7ff` | active letters |
| `letterCoral` | `#ff675a` | active letters |
| `letterGreen` | `#9cff38` | active letters |
| `letterPink` | `#ff77b8` | active letters |
| `letterBlue` | `#82a8ff` | active letters |
| `successGreen` | `#65f08d` | status lights |

Avoid adding another dominant hue family. The screen should read as dark neutral canvas plus multi-color feedback.

## Letter Rendering Spec

Goal: letters should feel like chunky luminous stickers, not browser default text.

Recommended font stack:

```css
"Arial Rounded MT Bold", "Arial Rounded Bold", "SF Pro Rounded", "SF Compact Rounded", "Avenir Next", -apple-system, BlinkMacSystemFont, sans-serif
```

Canvas implementation:

- Use `font-weight: 900` or the heaviest available rounded face.
- Draw an underlayer stroke before fill:
  - stroke color `rgba(8, 12, 20, 0.58)`
  - stroke width `max(3px, size * 0.055)`
- Draw a tiny highlight offset at top-left:
  - fill `rgba(255,255,255,0.20)`
  - offset `(-size * 0.025, -size * 0.035)`
- Draw main fill after highlight.
- Add two glows with shadow blur:
  - close glow `currentColor` at blur `size * 0.10`
  - far glow current color at alpha 0.38 and blur `size * 0.24`
- Add a horizontal trailing smear behind moving letters, never in front of the glyph.

SVG/DOM implementation, if TL switches from Canvas text:

- Keep each letter as an inline SVG group with `text-anchor="middle"` and `dominant-baseline="central"`.
- Include three layers: dark stroke, highlight text, fill text.
- Do not rasterize every color as separate PNG. Colors remain runtime parameters.

Size and placement:

- Random size range desktop: `56-148px`.
- 2014 MacBook Air target: cap at `132px` to avoid covering header/footer.
- Rotation: random `-12deg` to `12deg`; no wider.
- Safe area: keep letter centers at least `72px` from header/footer and `48px` from side edges.

## Letter Motion Spec

Normal letter key:

| Phase | Duration | Transform / Style | Easing |
| --- | ---: | --- | --- |
| Birth pop | 0-90ms | scale `0.78 -> 1.08`, opacity `0 -> 1` | cubic-bezier(0.16, 1, 0.3, 1) |
| Settle | 90-190ms | scale `1.08 -> 1.00`, rotate settles by 2deg | cubic-bezier(0.2, 0.8, 0.2, 1) |
| Drift | 190-900ms | translate 18-42px along a random diagonal, trail fades | linear position, eased opacity |
| Fade | 900-1500ms | opacity `1 -> 0`, blur increases by 1.5px | ease-out |

The existing manifest range `keyboard.letterFadeMsRange = [800, 1500]` remains valid. The added pop and drift should fit inside that lifetime, not extend it.

Trail:

- Trail length: 58-120px, based on letter size.
- Trail opacity: max 0.42 at birth, below 0.10 by halfway.
- Trail color: same as glyph but alpha-multiplied; do not use saturated solid bars.
- Trail must be clipped to the canvas only, not to a square sprite box.

Repeated same key:

- Preserve existing logic: same key after the third non-repeat press stops counting.
- Visual feedback for swallowed repeated letters should be a tiny dim pulse at the last letter position, not a full new letter.

Reduced motion:

- If `prefers-reduced-motion: reduce`, skip pop overshoot and drift. Show letter at scale 1, fade over 600-900ms.

## Non-Letter Key Feedback

Space / Enter:

- Category: light feedback.
- Visual: one low-opacity expanding ring from the center-bottom safe area or current pointer location if available.
- Duration: 360ms.
- Ring: start radius 18px, end radius 96px, stroke `rgba(94,231,255,0.42)` to transparent.
- Optional tiny stage lift: background radial light +4% for 140ms.
- No reward slot, no count increment.

Shift / Command / Option / Control:

- Category: weak feedback.
- Visual: status-light-sized side glint or tiny ring near the lower left, opacity below 0.22.
- Duration: 220ms.
- No new stage object, no reward slot, no count increment.

Digits:

- Digits are already effective alnum keys. Render them through the same letter pipeline, but with size capped at 118px and 0.75 trail length so they do not dominate alphabet discovery.

Punctuation / arrows / other keys:

- Category: other feedback.
- Visual: small ripple at opacity 0.25, duration 260ms, no glow larger than 40px.
- Consecutive same function key should visibly decay to near-zero by the fourth press, matching the keyboard engine decay behavior.

## Implementation Notes For TL

- Keep Safari 14 compatibility: no `aspect-ratio`, no `inset` shorthand, no `:focus-visible` grouped with older selectors, no CSS `color-mix()` in runtime CSS.
- Runtime should prefer Canvas2D drawing for letters because current `app/web/app.js` already owns letter drawing. Add layered drawing there rather than adding 26 image files.
- Make motion tokens configurable in `manifest.js` or a local token object near the keyboard renderer; avoid magic numbers scattered across draw functions.
- Do not alter the secret-word sticker pool or footer chest in this card. Use the 081 footer shell only; leave 082 to define final sticker/chest assets.
- The visuals must remain readable on the dark canvas at the app's actual display size, not only in this preview.

## Acceptance Checklist

- Header/footer/canvas rules are specified with colors, dimensions, and constraints.
- Letter rendering includes rounded font stack and SVG/Canvas layer guidance.
- Letter motion has duration, easing, drift, trail, fade, and reduced-motion behavior.
- Non-letter keys have clear feedback categories and decay rules.
- All sample outputs are saved under project paths.
- No main merge, no app code changes, and no direct TL/QA assignment from DESIGN.

