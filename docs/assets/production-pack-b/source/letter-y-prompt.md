# Letter Y Sprite Prompt Record

Card: `WTJ-20260704-053`
Role: DESIGN
Generated with: built-in `image_gen`
Post-processing: project-local chroma-key removal via `$CODEX_HOME/skills/.system/imagegen/scripts/remove_chroma_key.py`, then centered on a `1024x1024` transparent RGBA canvas.

## Outputs

- `yoyo`: `docs/assets/production-pack-b/sprites/yoyo.png`
- `yarn`: `docs/assets/production-pack-b/sprites/yarn.png`
- `yak`: `docs/assets/production-pack-b/sprites/yak.png`

## Sources

- `yoyo` source: `docs/assets/production-pack-b/source/yoyo-source-green.png`
- `yoyo` alpha raw: `docs/assets/production-pack-b/source/yoyo-alpha-raw.png`
- `yarn` source: `docs/assets/production-pack-b/source/yarn-source-green.png`
- `yarn` alpha raw: `docs/assets/production-pack-b/source/yarn-alpha-raw.png`
- `yak` source: `docs/assets/production-pack-b/source/yak-source-green.png`
- `yak` alpha raw: `docs/assets/production-pack-b/source/yak-alpha-raw.png`

## Prompt: Yo-yo

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Scene/backdrop: perfectly flat solid pure chroma green background (#00ff00) only, one uniform color with no shadows, gradients, texture, floor plane, reflection, or lighting variation.
Subject: one yo-yo toy only, centered. Original dimensional polished toy yo-yo with two rounded red-and-yellow discs, small central button, short visible white string loop curling gently beside it. The object should clearly read as a yo-yo for a toddler. Avoid green and avoid #00ff00 anywhere in the subject.
Style/medium: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, sticker-like clean edges, unified 3/4 front perspective, top-left soft light, warm friendly saturation.
Composition/framing: square composition, centered single object, complete object visible, no cropping, object fills about 70% of the canvas with clean padding; fully separated from the background with crisp edges.
Quality constraints: production-quality finished illustration, child-readable at 96-240 px on a dark navy app canvas, high detail, not flat vector, not emoji, not clipart.
Avoid: no child, no hands, no extra toys, no floor, no cast shadow, no contact shadow, no text, no letters, no brand logo, no watermark.
```

## Prompt: Yarn

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Scene/backdrop: perfectly flat solid pure chroma green background (#00ff00) only, one uniform color with no shadows, gradients, texture, floor plane, reflection, or lighting variation.
Subject: one ball of yarn only, centered. Original dimensional soft wool yarn ball in warm coral and lavender twisted strands, with one short loose strand curling around the front. The object should clearly read as yarn for a toddler, with visible rounded strand texture but no fine hair. Avoid green and avoid #00ff00 anywhere in the subject.
Style/medium: polished 2.5D soft-plastic / soft-clay children's app illustration with soft fabric texture, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, sticker-like clean edges, unified 3/4 front perspective, top-left soft light, warm friendly saturation.
Composition/framing: square composition, centered single object, complete object visible, no cropping, object fills about 70% of the canvas with clean padding; fully separated from the background with crisp edges.
Quality constraints: production-quality finished illustration, child-readable at 96-240 px on a dark navy app canvas, high detail, not flat vector, not emoji, not clipart.
Avoid: no knitting needles, no basket, no cat, no hands, no floor, no cast shadow, no contact shadow, no text, no letters, no brand logo, no watermark, no extra objects.
```

## Prompt: Yak

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Scene/backdrop: perfectly flat solid pure chroma green background (#00ff00) only, one uniform color with no shadows, gradients, texture, floor plane, reflection, or lighting variation.
Subject: one friendly yak only, centered. Original dimensional soft-clay toy yak: sturdy small body, rounded brown shaggy coat represented as large smooth sculpted tufts rather than fine fur, cream muzzle, short legs, curved pale horns, small ears, gentle eyes, tiny smile. It should be immediately recognizable as a yak but child-friendly and not realistic. Avoid green and avoid #00ff00 anywhere in the subject.
Style/medium: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, sticker-like clean edges, unified 3/4 front perspective, top-left soft light, warm friendly saturation.
Composition/framing: square composition, centered single object, complete object visible, no cropping, object fills about 72% of the canvas with clean padding; fully separated from the background with crisp edges.
Quality constraints: production-quality finished illustration, child-readable at 96-240 px on a dark navy app canvas, high detail, not flat vector, not emoji, not clipart, not scary.
Avoid: no grass, no mountain, no floor, no cast shadow, no contact shadow, no text, no letters, no brand logo, no watermark, no extra objects, no fine wispy hair.
```

## Design Notes

- `yoyo` uses a large red-and-yellow toy form with a visible cord loop so it reads clearly at small app sizes.
- `yarn` uses oversized rounded twisted strands rather than thin line art; the loose strand is kept short to avoid tangly visual noise.
- `yak` uses sculpted soft-clay coat tufts instead of realistic fine fur, which keeps chroma-key removal clean and the expression toddler-safe.
- All three accepted outputs were re-centered on transparent `1024x1024` canvases to preserve animation padding.

## Self-check

- Final files are `1024x1024 RGBA`.
- Four corners have alpha `0`.
- Visible pixels contain no exact or strict #00ff00 / #ff00ff / #00ffff key residue.
- All three sprites are readable on the dark Pack B contact sheet background.
