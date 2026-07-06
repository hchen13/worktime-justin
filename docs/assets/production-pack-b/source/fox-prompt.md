# Fox Sprite Prompt Record

Card: `WTJ-20260706-015`
Role: DESIGN
Executor: `Designer 1`
Runtime identity: `CodexThread:019f2887-9de8-7b72-b53b-230a0857f710`
Generated with: built-in `image_gen`
Post-processing: chroma-key removal with `$CODEX_HOME/skills/.system/imagegen/scripts/remove_chroma_key.py`, then centered on a `1024x1024` transparent RGBA canvas.

## Outputs

- Final sprite: `docs/assets/production-pack-b/sprites/fox.png`
- Dark-canvas review: `docs/assets/production-pack-b/review/wtj-20260706-015/fox-dark-72-128.png`

## Sources

- Source chroma-key image: `docs/assets/production-pack-b/source/fox-source-green.png`
- Alpha raw: `docs/assets/production-pack-b/source/fox-alpha-raw.png`

## Prompt

```text
Use case: stylized-concept
Asset type: production secret-word sprite for WorkTime Justin, a children's fullscreen desktop app.
Scene/backdrop: perfectly flat solid pure chroma green background (#00ff00) only, one uniform color with no shadows, gradients, texture, floor plane, reflection, border, or lighting variation. Keep a clear green margin around all four sides for background removal.
Subject: one friendly red fox sprite only, centered and fully visible. It should read clearly as a fox, not a dog, cat, or wolf: bright red-orange coat, tall sharp triangular ears with pale inner ears, slim pointed muzzle, white cheeks, white chest patch, black button nose, dark little paws, and one large fluffy curved tail with a distinct white tip. Cute seated 3/4 front pose, alert but gentle expression, big glossy eyes. No collar, no tag, no leash, no tongue, no floppy ears, no grey wolf coloring, no cat whiskers.
Style/medium: match WorkTime Justin production pack B style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, unified 3/4 front perspective, top-left soft light, warm friendly saturation, high-detail finished sprite, not flat vector, not emoji, not clipart.
Composition/framing: square composition, fox fills about 68% of the canvas with generous padding; subject fully separated from background with crisp clean edges and no cropping.
Quality constraints: production-quality finished illustration, child-readable at 72 px and 128 px on a dark navy app canvas, distinct fox silhouette, no visible generation artifacts.
Avoid: no extra animals, no forest, no grass, no rocks, no props, no text, no letters, no brand logo, no watermark, no cast shadow, no contact shadow. Do not use #00ff00 anywhere in the fox.
```

## Design Notes

- Chose a seated 3/4 fox so it stays consistent with the Pack B dog/cat/lion animal sprites while retaining a distinct silhouette.
- Fox-specific readability cues: tall triangular ears, pointed muzzle, red-orange coat, white cheeks/chest, dark paws, and large curved tail with a white tip.
- Avoided collar/tag/tongue/floppy ears to keep it from reading as the existing dog sprite; avoided grey palette and sharp wolf posture to keep it toddler-friendly.
- This DESIGN card delivers the production sprite and review evidence only. Runtime word-list and app asset integration remain PM/TL-routed work.

## Self-check

- Final file is `1024x1024 RGBA`.
- Four corners have alpha `0`.
- Visible pixels contain no strict `#00ff00`, `#ff00ff`, or `#00ffff` key-color residue.
- Deep navy review image confirms readability at `72px` and `128px`.
